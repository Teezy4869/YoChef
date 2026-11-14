// In-memory stand-in for the Supabase client, covering only what the app calls.
// Mocks prove UI wiring, not integration: the live check (smoke:auth) covers that.
import type { Session } from '@supabase/supabase-js';

import type { YoChefClient } from '@/lib/supabase';

type Listener = (event: string, session: Session | null) => void;

export function fakeSession(overrides: Partial<{ id: string; email: string }> = {}): Session {
  const id = overrides.id ?? '11111111-1111-4111-8111-111111111111';
  return {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id,
      email: overrides.email ?? 'an@example.com',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  } as Session;
}

export function createFakeSupabase(initial: Session | null = null) {
  let session = initial;
  const listeners = new Set<Listener>();
  const emit = (event: string) => listeners.forEach((l) => l(event, session));

  const auth = {
    onAuthStateChange: jest.fn((cb: Listener) => {
      listeners.add(cb);
      // Real client emits INITIAL_SESSION asynchronously after restoring storage.
      Promise.resolve().then(() => cb('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
    signInWithPassword: jest.fn(async ({ email }: { email: string; password: string }) => {
      session = fakeSession({ email });
      emit('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    }),
    signUp: jest.fn(async ({ email }: { email: string; password: string; options?: unknown }) => {
      session = fakeSession({ email });
      emit('SIGNED_IN');
      return { data: { session, user: session.user }, error: null };
    }),
    signOut: jest.fn(async (_opts?: { scope?: string }) => {
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    }),
  };

  // profiles: one row per user, created on first read like the sign-up trigger.
  const profiles = new Map<string, Record<string, unknown>>();
  const profileOf = (id: string) => {
    if (!profiles.has(id)) {
      profiles.set(id, { id, display_name: null, avatar_path: null, bio: null, created_at: '2026-11-11T00:00:00Z' });
    }
    return profiles.get(id)!;
  };

  // Catalog fixtures, mirrored from what public.search_recipes() returns.
  const catalog = {
    categories: [] as { slug: string; name: string }[],
    recipes: [] as Record<string, unknown>[], // search rows (snake_case, as the RPC returns)
    details: {} as Record<string, unknown>, // slug -> detail row
  };
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

  const rpc = jest.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    if (fn === 'get_my_profile') {
      return { data: session ? [{ ...profileOf(session.user.id) }] : [], error: null };
    }
    if (fn === 'moderate_community_content') {
      // The RPC: moderators only, any status, one history row per decision.
      if (!session || !isModerator(session.user.id)) return { data: null, error: { message: 'only moderators', code: '42501' } };
      const row = (tables[String(args.p_table)] ?? []).find((r) => r.id === args.p_id);
      if (!row) return { data: null, error: { message: 'not found', code: 'P0002' } };
      (tables.moderation_actions ??= []).push({
        actor_id: session.user.id, target_table: args.p_table, target_id: args.p_id,
        from_status: row.status, to_status: args.p_status, reason: args.p_reason ?? null,
      });
      row.status = args.p_status;
      return { data: args.p_status, error: null };
    }
    if (fn === 'search_recipes') {
      const terms = fold(String(args.p_query ?? '')).split(/\s+/).filter(Boolean);
      const rows = catalog.recipes
        .filter((r) => terms.every((t) => fold(String(r.name)).includes(t)))
        .filter((r) => !args.p_category_slug || r.category_slug === args.p_category_slug)
        .filter((r) => !args.p_difficulty || r.difficulty === args.p_difficulty);
      const offset = Number(args.p_offset ?? 0);
      const limit = Number(args.p_limit ?? 20);
      return { data: rows.slice(offset, offset + limit).map((r) => ({ ...r, total_count: rows.length })), error: null };
    }
    return { data: null, error: { message: `unknown rpc ${fn}` } };
  });

  // Phase 3 user tables: a tiny in-memory store with owner-only rows, which is
  // roughly what RLS returns. `decorate` adds embeds; `failNext` simulates an error.
  type Row = Record<string, unknown>;
  type Failure = { message: string; code?: string };
  const tables: Record<string, Row[]> = {};
  const decorate: Record<string, (row: Row) => Row> = {};
  const failures = new Map<string, Failure>();
  let seq = 0;
  const DENIED: Failure = { message: 'new row violates row-level security policy', code: '42501' };
  // Column defaults the database would fill in.
  const DEFAULTS: Record<string, Row> = {
    shopping_lists: { name: 'Danh sách mua sắm', source_recipe_id: null },
    shopping_list_items: { is_checked: false, sort_order: 0, ingredient_id: null, quantity: null, unit: null, note: null },
    comments: { status: 'pending' },
    cooking_photos: { status: 'pending', caption: null },
  };
  // Readable by everyone (published recipes only, in the real policies); writes stay owner-only.
  const PUBLIC_READ = new Set(['ratings', 'recipe_rating_summary', 'comments', 'cooking_photos', 'recipe_nutrition', 'recipe_videos']);
  const UNIQUE: Record<string, string[]> = {
    favorites: ['user_id', 'recipe_id'],
    ratings: ['user_id', 'recipe_id'],
    content_reports: ['reporter_id', 'target_table', 'target_id'],
  };
  // public.recipe_rating_summary: no row for a recipe without ratings.
  const ratingSummary = (): Row[] => {
    const by = new Map<unknown, number[]>();
    for (const r of tables.ratings ?? []) by.set(r.recipe_id, [...(by.get(r.recipe_id) ?? []), Number(r.score)]);
    return [...by].map(([recipe_id, scores]) => ({
      recipe_id,
      rating_count: scores.length,
      avg_score: (Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10).toFixed(1),
    }));
  };
  // Items belong to whoever owns their list, as the RLS policies check.
  const ownerOf = (table: string, r: Row) =>
    table === 'shopping_list_items'
      ? (tables.shopping_lists ?? []).find((l) => l.id === r.shopping_list_id)?.user_id
      : table === 'content_reports'
        ? r.reporter_id
        : r.user_id;
  // Reviewed content (comments, cooking photos): everyone reads approved rows,
  // authors also their own unless rejected, and only authors change a row that is
  // not rejected. Editing the text of an approved row sends it back to review.
  const REVIEWED: Record<string, string> = { comments: 'content', cooking_photos: 'caption' };
  // is_moderator(): moderators and super admins, from the user's role rows.
  const isModerator = (me: string | undefined) =>
    (tables.user_roles ?? []).some((r) => r.user_id === me && (r.role === 'moderator' || r.role === 'super_admin'));
  const canSee = (table: string, r: Row, me: string | undefined) =>
    table in REVIEWED
      ? r.status === 'approved' || (r.user_id === me && r.status !== 'rejected') || isModerator(me)
      : PUBLIC_READ.has(table) || ownerOf(table, r) === me;
  const canWrite = (table: string, r: Row, me: string | undefined) =>
    ownerOf(table, r) === me && !(table in REVIEWED && r.status === 'rejected');
  // Clients have no privilege on status.
  const STATUS_DENIED: Failure = { message: 'permission denied for table', code: '42501' };
  const withAuthor = (r: Row) => {
    const p = profileOf(String(r.user_id));
    const recipe = catalog.recipes.find((x) => x.id === r.recipe_id);
    return { ...r, author: { display_name: p.display_name, avatar_path: p.avatar_path }, recipe: recipe ? { name: recipe.name } : null };
  };
  decorate.comments = withAuthor;
  decorate.cooking_photos = withAuthor;

  function userQuery(table: string, op: 'select' | 'insert' | 'update' | 'delete', payload?: Row | Row[]) {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
    let returning = op === 'select';
    const view = (r: Row) => (decorate[table] ? decorate[table]({ ...r }) : { ...r });

    const run = async (): Promise<{ data: Row[] | null; error: Failure | null }> => {
      const failure = failures.get(`${table}.${op}`);
      if (failure) {
        failures.delete(`${table}.${op}`);
        return { data: null, error: failure };
      }
      const me = session?.user.id;
      const publicRead = op === 'select' && PUBLIC_READ.has(table);
      if (!me && !publicRead) return { data: null, error: DENIED };
      const rows = table === 'recipe_rating_summary' ? ratingSummary() : (tables[table] ??= []);
      const sendsStatus = (r: Row | undefined) => table in REVIEWED && r !== undefined && 'status' in r;
      if ((op === 'insert' || op === 'update') && [payload].flat().some(sendsStatus)) return { data: null, error: STATUS_DENIED };
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload ?? {}];
        const keys = (r: Row) => Object.keys(r).sort().join(',');
        if (list.some((r) => keys(r) !== keys(list[0]))) {
          return { data: null, error: { message: 'All object keys must match', code: 'PGRST102' } };
        }
        if (list.some((r) => ownerOf(table, r) !== me)) return { data: null, error: DENIED };
        const unique = UNIQUE[table];
        if (unique && list.some((r) => rows.some((x) => unique.every((c) => x[c] === r[c])))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
        const added = list.map((r) => ({
          id: `${table}-${++seq}`,
          created_at: new Date(Date.now() + seq).toISOString(),
          ...DEFAULTS[table],
          ...r,
        }));
        rows.push(...added);
        return { data: returning ? added.map(view) : null, error: null };
      }
      let hit = rows.filter((r) => (op === 'select' ? canSee(table, r, me) : canWrite(table, r, me)) && filters.every((f) => f(r)));
      if (op === 'update') {
        hit.forEach((r) => {
          // The reset_status_on_edit trigger.
          const text = REVIEWED[table];
          if (text && r.status === 'approved' && text in (payload as Row) && (payload as Row)[text] !== r[text]) r.status = 'pending';
          Object.assign(r, payload);
        });
      }
      if (op === 'delete') {
        tables[table] = rows.filter((r) => !hit.includes(r));
        if (table === 'shopping_lists') {
          const gone = new Set(hit.map((r) => r.id));
          tables.shopping_list_items = (tables.shopping_list_items ?? []).filter((i) => !gone.has(i.shopping_list_id));
        }
      }
      const cmp = (a: unknown, b: unknown) =>
        typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
      hit = [...hit].sort((a, b) => {
        for (const { col, asc } of orders) {
          const c = cmp(a[col], b[col]);
          if (c !== 0) return asc ? c : -c;
        }
        return 0;
      });
      hit = hit.slice(range[0], range[1] + 1);
      return { data: returning ? hit.map(view) : null, error: null };
    };

    const b = {
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
      order: (col: string, opts?: { ascending?: boolean }) => (orders.push({ col, asc: opts?.ascending ?? true }), b),
      range: (fromIdx: number, toIdx: number) => ((range = [fromIdx, toIdx]), b),
      limit: (n: number) => ((range = [0, n - 1]), b),
      select: (_cols?: string) => ((returning = true), b),
      maybeSingle: async () => {
        const r = await run();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }

  const USER_TABLES = new Set([
    'favorites', 'shopping_lists', 'shopping_list_items', 'ratings', 'recipe_rating_summary', 'comments', 'cooking_photos',
    'user_roles', 'content_reports', 'recipe_nutrition', 'recipe_videos',
  ]);

  const from = jest.fn((table: string) =>
    USER_TABLES.has(table)
      ? {
          select: (cols?: string) => userQuery(table, 'select').select(cols),
          insert: (rows: Row | Row[]) => userQuery(table, 'insert', rows),
          update: (patch: Row) => userQuery(table, 'update', patch),
          delete: () => userQuery(table, 'delete'),
        }
      : catalogFrom(table),
  );

  const catalogFrom = (table: string) => ({
    select: (_cols?: string) => {
      const eqs: Record<string, unknown> = {};
      const rows = () => {
        if (table === 'categories') return catalog.categories;
        if (table === 'recipes') {
          const d = catalog.details[String(eqs.slug)];
          return d ? [d] : [];
        }
        return [];
      };
      const b = {
        order: () => b,
        limit: () => b,
        eq: (col: string, val: unknown) => ((eqs[col] = val), b),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      };
      return b;
    },
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => ({
        select: async () => {
          if (table !== 'profiles' || !session || session.user.id !== id) return { data: [], error: null };
          Object.assign(profileOf(id), patch);
          return { data: [{ id }], error: null };
        },
      }),
    }),
  });

  const objects = new Set<string>();
  const unsigned = new Set<string>();
  const bucket = {
    upload: jest.fn(async (path: string, _body: unknown, _opts?: unknown) => {
      objects.add(path);
      return { data: { path }, error: null };
    }),
    remove: jest.fn(async (paths: string[]) => {
      paths.forEach((p) => objects.delete(p));
      return { data: [], error: null };
    }),
    // Signs every path it is given, except those a test adds to `unsigned`.
    createSignedUrls: jest.fn(async (paths: string[], _expiresIn: number) => ({
      data: paths.map((p) =>
        unsigned.has(p)
          ? { path: p, signedUrl: null, error: 'Object not found' }
          : { path: p, signedUrl: `https://bdhphjwhagygbwtfhhxn.supabase.co/storage/v1/object/sign/cooking-photos/${p}?token=t`, error: null },
      ),
      error: null,
    })),
    getPublicUrl: jest.fn((path: string) => ({
      data: { publicUrl: `https://bdhphjwhagygbwtfhhxn.supabase.co/storage/v1/object/public/avatars/${path}` },
    })),
  };
  const storage = { from: jest.fn((_name: string) => bucket) };

  const client = { auth, rpc, from, storage } as unknown as YoChefClient;
  return {
    client,
    auth,
    rpc,
    from,
    bucket,
    objects,
    unsigned,
    profiles,
    profileOf,
    catalog,
    tables,
    decorate,
    failNext: (table: string, op: 'select' | 'insert' | 'update' | 'delete', error: Failure = { message: 'boom' }) =>
      failures.set(`${table}.${op}`, error),
    setSession: (s: Session | null, event = 'TOKEN_REFRESHED') => ((session = s), emit(event)),
  };
}
