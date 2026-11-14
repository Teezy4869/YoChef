-- =============================================================================
-- 4.1 staff roles and the admin audit log (SCHEMA_V2.md §5.7,
-- phase4_08_rbac_matrix.md "Role management safety")
--
-- Roles stay in user_roles, which no client can write. A super admin assigns
-- and revokes them through manage_user_role(), which records every change in
-- admin_audit_logs in the same transaction. The last active super admin can
-- never be removed, not even by deleting the account.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_audit_logs: append-only, read only through list_admin_audit_logs().
-- actor_id has no FK so a record outlives the account; NULL means a system job.
-- -----------------------------------------------------------------------------
create table public.admin_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,
  action       text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_table text,
  target_id    uuid,
  reason       text check (reason is null or (char_length(reason) <= 500 and reason ~ '\S')),
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_actor_id_idx on public.admin_audit_logs (actor_id);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_table, target_id);

create trigger forbid_change before update or delete on public.admin_audit_logs
  for each row execute function private.forbid_change();

revoke all on public.admin_audit_logs from anon, authenticated;
alter table public.admin_audit_logs enable row level security;
-- No policy: clients read it only through list_admin_audit_logs().

-- Called by DEFINER RPCs only, so it runs as their owner.
create or replace function private.audit(
  p_action       text,
  p_target_table text,
  p_target_id    uuid,
  p_reason       text,
  p_details      jsonb default '{}'::jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, reason, details)
  values ((select auth.uid()), p_action, p_target_table, p_target_id, nullif(btrim(p_reason), ''), coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function private.audit(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- The last active super admin stays. "Active" = not deleted and not banned.
-- The lock on every super_admin row serializes concurrent revocations.
-- -----------------------------------------------------------------------------
create or replace function private.keep_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'super_admin' or (tg_op = 'UPDATE' and new.role = 'super_admin') then
    return coalesce(new, old);
  end if;
  perform 1 from public.user_roles ur where ur.role = 'super_admin' for update;
  if not exists (
    select 1
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where ur.role = 'super_admin'
      and ur.id <> old.id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < now())
  ) then
    raise exception 'the last active super admin cannot be removed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.keep_last_super_admin() from public, anon, authenticated;

create trigger keep_last_super_admin before update or delete on public.user_roles
  for each row execute function private.keep_last_super_admin();

-- -----------------------------------------------------------------------------
-- Role management. Returns true when something changed (assigning a role the
-- user already has, or revoking one they lack, changes nothing and is not logged).
-- -----------------------------------------------------------------------------
create or replace function public.manage_user_role(
  p_target uuid,
  p_role   public.app_role,
  p_action text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_reason text := nullif(btrim(p_reason), '');
  v_rows   int;
begin
  if v_actor is null or not private.is_super_admin() then
    raise exception 'only super admins manage staff roles' using errcode = '42501';
  end if;
  if p_target is null or p_role is null or p_action is null or p_action not in ('assign', 'revoke') then
    raise exception 'target, role and action (assign or revoke) are required' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  if p_action = 'assign' then
    if not exists (select 1 from auth.users u where u.id = p_target) then
      raise exception 'user % not found', p_target using errcode = 'P0002';
    end if;
    insert into public.user_roles (user_id, role, granted_by)
    values (p_target, p_role, v_actor)
    on conflict (user_id, role) do nothing;
  else
    if p_target = v_actor and p_role = 'super_admin' then
      raise exception 'a super admin cannot revoke their own super admin role' using errcode = '42501';
    end if;
    delete from public.user_roles where user_id = p_target and role = p_role;
  end if;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    perform private.audit('role.' || p_action, 'user_roles', p_target, v_reason, jsonb_build_object('role', p_role));
  end if;
  return v_rows > 0;
end;
$$;

-- Everyone holding a staff role, with the name and sign-in email a super admin needs.
create or replace function public.list_staff()
returns table (user_id uuid, email text, display_name text, roles public.app_role[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'only super admins list staff' using errcode = '42501';
  end if;
  return query
    select ur.user_id, u.email::text, p.display_name, array_agg(ur.role order by ur.role)
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.profiles p on p.id = ur.user_id
    group by ur.user_id, u.email, p.display_name
    order by u.email;
end;
$$;

-- Exact, case-insensitive match only: no listing or searching of users.
create or replace function public.find_user_by_email(p_email text)
returns table (user_id uuid, email text, display_name text, roles public.app_role[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'only super admins look up users' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.display_name,
           coalesce(array_agg(ur.role order by ur.role) filter (where ur.role is not null), '{}')
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    where lower(u.email) = lower(btrim(p_email))
    group by u.id, u.email, p.display_name;
end;
$$;

-- Newest first, keyset paging on created_at; limit is clamped to 1..200.
create or replace function public.list_admin_audit_logs(p_limit int default 50, p_before timestamptz default null)
returns table (
  id           uuid,
  actor_id     uuid,
  actor_name   text,
  action       text,
  target_table text,
  target_id    uuid,
  reason       text,
  details      jsonb,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'only super admins read the audit log' using errcode = '42501';
  end if;
  return query
    select a.id, a.actor_id, p.display_name, a.action, a.target_table, a.target_id, a.reason, a.details, a.created_at
    from public.admin_audit_logs a
    left join public.profiles p on p.id = a.actor_id
    where p_before is null or a.created_at < p_before
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.manage_user_role(uuid, public.app_role, text, text) from public, anon, authenticated;
revoke all on function public.list_staff() from public, anon, authenticated;
revoke all on function public.find_user_by_email(text) from public, anon, authenticated;
revoke all on function public.list_admin_audit_logs(int, timestamptz) from public, anon, authenticated;
grant execute on function public.manage_user_role(uuid, public.app_role, text, text) to authenticated;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.find_user_by_email(text) to authenticated;
grant execute on function public.list_admin_audit_logs(int, timestamptz) to authenticated;
