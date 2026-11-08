-- =============================================================================
-- 0002_identity_rbac: profiles, staff roles, role helpers (SCHEMA_V2.md §4)
--
-- profiles has NO role column (K5). Staff roles live only in user_roles, and
-- no client can write user_roles; assignment arrives in Phase 4.1 as an
-- audited super_admin RPC.
-- =============================================================================

create type public.app_role as enum ('super_admin', 'editor', 'moderator');

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 50),
  avatar_path  text check (avatar_path is null or avatar_path like id::text || '/%'),
  bio          text check (bio is null or char_length(bio) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

revoke all on public.profiles from anon, authenticated;
-- Public columns only: bio is not public. Clients must select explicit columns.
grant select (id, display_name, avatar_path, created_at) on public.profiles to anon, authenticated;
grant update (display_name, avatar_path, bio) on public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "Public read of display fields" on public.profiles
  for select to anon, authenticated
  using (true);

create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Profile row is created by the database on sign-up, never by the client.
-- Metadata only supplies a display name; it can never affect permissions.
-- The name is trimmed, cut to 50 characters and NULL when empty, so a bad
-- value can never make sign-up fail.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '')
  );
  v_name := nullif(btrim(left(v_name, 50)), '');

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- user_roles
-- -----------------------------------------------------------------------------
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_granted_by_idx on public.user_roles (granted_by);

revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

alter table public.user_roles enable row level security;

create policy "Users read own roles" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Role helpers (C7: DEFINER with empty search_path). Executable by
-- authenticated only; anon policies never call them.
-- There is deliberately no is_admin().
-- -----------------------------------------------------------------------------
create or replace function private.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = p_role
  );
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role = 'super_admin'
  );
$$;

create or replace function private.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role in ('editor', 'super_admin')
  );
$$;

create or replace function private.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role in ('moderator', 'super_admin')
  );
$$;

revoke all on function private.has_role(public.app_role) from public, anon, authenticated;
revoke all on function private.is_super_admin() from public, anon, authenticated;
revoke all on function private.is_editor() from public, anon, authenticated;
revoke all on function private.is_moderator() from public, anon, authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.is_editor() to authenticated;
grant execute on function private.is_moderator() to authenticated;
