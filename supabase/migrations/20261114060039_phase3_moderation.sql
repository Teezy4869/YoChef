-- =============================================================================
-- 3.6 minimal moderation (SCHEMA_V2.md §5.4, §5.7; brought forward from 4.2,
-- Phase 3 plan D6)
--
-- Moderators approve, reject or restore comments and cooking photos through one
-- RPC. Clients still have no privilege on status, so the RPC (DEFINER) is the
-- only way a status changes. Every decision is appended to moderation_actions,
-- which only moderators read and nobody edits.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who moderated last. Hidden from clients: it would reveal which accounts are
-- moderators, while user_roles is private. History is in moderation_actions.
-- -----------------------------------------------------------------------------
alter table public.comments
  add column moderated_by uuid references public.profiles (id) on delete set null,
  add column moderated_at timestamptz;
alter table public.cooking_photos
  add column moderated_by uuid references public.profiles (id) on delete set null,
  add column moderated_at timestamptz;
create index comments_moderated_by_idx on public.comments (moderated_by);
create index cooking_photos_moderated_by_idx on public.cooking_photos (moderated_by);

revoke select on public.comments from anon, authenticated;
grant select (id, user_id, recipe_id, content, status, created_at, updated_at) on public.comments to anon, authenticated;
revoke select on public.cooking_photos from anon, authenticated;
grant select (id, user_id, recipe_id, storage_path, caption, status, created_at, updated_at)
  on public.cooking_photos to anon, authenticated;

-- -----------------------------------------------------------------------------
-- moderation_actions: append-only history. actor_id has no FK on purpose, so
-- the record outlives the moderator's account and is never rewritten by a
-- cascade; target_id has none either, so it outlives the content.
-- -----------------------------------------------------------------------------
create table public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null,
  target_table text not null check (target_table in ('comments', 'cooking_photos')),
  target_id    uuid not null,
  from_status  text not null check (from_status in ('pending', 'approved', 'rejected')),
  to_status    text not null check (to_status in ('pending', 'approved', 'rejected')),
  -- Unknown is NULL: at most 500 characters, and not only whitespace.
  reason       text check (reason is null or (char_length(reason) <= 500 and reason ~ '\S')),
  created_at   timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_table, target_id, created_at desc);
create index moderation_actions_actor_id_idx on public.moderation_actions (actor_id);

create or replace function private.forbid_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
revoke all on function private.forbid_change() from public, anon, authenticated;

create trigger forbid_change before update or delete on public.moderation_actions
  for each row execute function private.forbid_change();

revoke all on public.moderation_actions from anon, authenticated;
grant select on public.moderation_actions to authenticated;

alter table public.moderation_actions enable row level security;

create policy "Moderators read the moderation history" on public.moderation_actions
  for select to authenticated
  using ((select private.is_moderator()));

-- -----------------------------------------------------------------------------
-- The one way to change a status. Any transition is allowed; moving back to
-- 'approved' restores a rejected item. Returns the new status.
-- -----------------------------------------------------------------------------
create or replace function public.moderate_community_content(
  p_table  text,
  p_id     uuid,
  p_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_from   text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null or not private.is_moderator() then
    raise exception 'only moderators can moderate content' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;

  if p_table = 'comments' then
    select c.status into v_from from public.comments c where c.id = p_id for update;
    if not found then
      raise exception 'comment % not found', p_id using errcode = 'P0002';
    end if;
    update public.comments
       set status = p_status, moderated_by = v_actor, moderated_at = now()
     where id = p_id;
  elsif p_table = 'cooking_photos' then
    select p.status into v_from from public.cooking_photos p where p.id = p_id for update;
    if not found then
      raise exception 'cooking photo % not found', p_id using errcode = 'P0002';
    end if;
    update public.cooking_photos
       set status = p_status, moderated_by = v_actor, moderated_at = now()
     where id = p_id;
  else
    raise exception 'unknown table %', p_table using errcode = '22023';
  end if;

  -- A reason over 500 characters fails the CHECK here and undoes the update.
  insert into public.moderation_actions (actor_id, target_table, target_id, from_status, to_status, reason)
  values (v_actor, p_table, p_id, v_from, p_status, v_reason);
  return p_status;
end;
$$;

revoke all on function public.moderate_community_content(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_community_content(text, uuid, text, text) to authenticated;
