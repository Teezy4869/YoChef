import { useEffect, useState } from 'react';

import { useAdminAuth } from '@/auth/AdminAuth';
import { hasRole } from '@/lib/supabase';

type Card = { label: string; value: number | null };

/** Headline counts; each card shows only what the signed-in role may read (RLS decides). */
export function DashboardPage() {
  const { client, roles } = useAdminAuth();
  const moderator = hasRole(roles ?? [], ['moderator']);
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    let active = true;
    const count = async (table: string, column: string, value: string) => {
      const { count: n, error } = await client.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
      return error ? null : n;
    };
    (async () => {
      const list: Card[] = [{ label: 'Công thức đã công bố', value: await count('recipes', 'status', 'published') }];
      if (moderator) {
        list.push({ label: 'Bình luận chờ duyệt', value: await count('comments', 'status', 'pending') });
        list.push({ label: 'Ảnh chờ duyệt', value: await count('cooking_photos', 'status', 'pending') });
      }
      return list;
    })().then((list) => active && setCards(list));
    return () => {
      active = false;
    };
  }, [client, moderator]);

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">Tổng quan</h1>
      {!cards ? (
        <p role="status">Đang tải…</p>
      ) : (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-4">
              <dt className="text-sm text-slate-600">{c.label}</dt>
              <dd className="text-3xl font-semibold">{c.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
