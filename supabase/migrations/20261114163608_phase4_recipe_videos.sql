-- =============================================================================
-- 4.4 recipe videos from YouTube (SCHEMA_V2.md §5.5,
-- phase4_08_youtube_freshness_policy.md; Phase 4 plan E10)
--
-- A video becomes a recipe's primary video only after videos.list has checked
-- it: the youtube-search Edge Function records a server-side receipt (service
-- role), and assign_recipe_video() accepts only a fresh, single-use receipt of
-- the same editor. The public sees a video only while it is primary, verified,
-- checked within 30 days and its recipe is published, so overdue data stops
-- being served even if the scheduler stops. YouTube policy III.E.4 allows
-- stored API data for 30 days: a row not re-verified in 30 days is deleted
-- outright (E10), video id included.
-- =============================================================================

create table public.recipe_videos (
  id                  uuid primary key default gen_random_uuid(),
  recipe_id           uuid not null references public.recipes (id) on delete cascade,
  youtube_video_id    text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title               text,
  channel_title       text,
  is_primary          boolean not null default false,
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified', 'verified', 'unavailable')),
  unavailable_reason  text,
  last_verified_at    timestamptz,
  -- Last refresh attempt, so repeat runs within 6 hours skip the row.
  last_checked_at     timestamptz,
  refresh_failures    int not null default 0 check (refresh_failures >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (recipe_id, youtube_video_id),
  check (verification_status <> 'verified' or (last_verified_at is not null and title is not null))
);
-- At most one primary video per recipe.
create unique index recipe_videos_one_primary_idx on public.recipe_videos (recipe_id) where is_primary;
create index recipe_videos_youtube_video_id_idx on public.recipe_videos (youtube_video_id);

create trigger set_updated_at before update on public.recipe_videos
  for each row execute function private.set_updated_at();

revoke all on public.recipe_videos from anon, authenticated;
grant select on public.recipe_videos to anon, authenticated;
alter table public.recipe_videos enable row level security;

create policy "Public reads fresh verified primary videos of published recipes" on public.recipe_videos
  for select to anon, authenticated
  using (
    is_primary
    and verification_status = 'verified'
    and last_verified_at > now() - interval '30 days'
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );
create policy "Editors read every video" on public.recipe_videos
  for select to authenticated using ((select private.is_editor()));

-- Receipts written by the Edge Function (service role); never exposed.
create table private.video_verifications (
  id                 uuid primary key default gen_random_uuid(),
  youtube_video_id   text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  actor_id           uuid not null,
  status             text not null check (status in ('verified', 'unavailable')),
  title              text,
  channel_title      text,
  unavailable_reason text,
  created_at         timestamptz not null default now(),
  consumed_at        timestamptz
);
create index video_verifications_lookup_idx on private.video_verifications (youtube_video_id, actor_id, created_at desc);
revoke all on private.video_verifications from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Service role only (Edge Functions, scheduler)
-- -----------------------------------------------------------------------------
create or replace function public.record_video_verification(
  p_video_id text, p_actor_id uuid, p_status text, p_title text, p_channel_title text, p_unavailable_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into private.video_verifications (youtube_video_id, actor_id, status, title, channel_title, unavailable_reason)
  values (p_video_id, p_actor_id, p_status,
          case when p_status = 'verified' then p_title end,
          case when p_status = 'verified' then p_channel_title end,
          case when p_status = 'unavailable' then p_unavailable_reason end)
  returning id into v_id;
  -- An unavailable result also hides the video wherever it is already assigned.
  if p_status = 'unavailable' then
    update public.recipe_videos
       set verification_status = 'unavailable', unavailable_reason = p_unavailable_reason,
           title = null, channel_title = null, last_checked_at = now()
     where youtube_video_id = p_video_id;
  end if;
  return v_id;
end;
$$;

-- Due: checked more than 25 days ago and not attempted in the last 6 hours.
create or replace function public.claim_videos_for_refresh(p_limit int default 50)
returns table (youtube_video_id text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select v.id from public.recipe_videos v
    where v.verification_status = 'verified'
      and v.last_verified_at < now() - interval '25 days'
      and (v.last_checked_at is null or v.last_checked_at < now() - interval '6 hours')
    order by v.last_verified_at
    limit greatest(1, least(coalesce(p_limit, 50), 50))
    for update skip locked
  )
  update public.recipe_videos v set last_checked_at = now()
  from due where v.id = due.id
  returning v.youtube_video_id;
$$;

-- p_results: [{video_id, outcome: verified|unavailable|failed, title?, channel_title?, reason?}]
create or replace function public.apply_video_refresh(p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        jsonb;
  verified int := 0;
  missing  int := 0;
  failed   int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if r ->> 'outcome' = 'verified' then
      update public.recipe_videos
         set verification_status = 'verified', title = r ->> 'title', channel_title = r ->> 'channel_title',
             last_verified_at = now(), refresh_failures = 0, unavailable_reason = null
       where youtube_video_id = r ->> 'video_id';
      verified := verified + 1;
    elsif r ->> 'outcome' = 'unavailable' then
      update public.recipe_videos
         set verification_status = 'unavailable', unavailable_reason = r ->> 'reason', title = null, channel_title = null
       where youtube_video_id = r ->> 'video_id';
      missing := missing + 1;
    else
      update public.recipe_videos set refresh_failures = refresh_failures + 1 where youtube_video_id = r ->> 'video_id';
      failed := failed + 1;
    end if;
  end loop;
  perform private.audit('video.refresh', 'recipe_videos', null, null,
                        jsonb_build_object('verified', verified, 'unavailable', missing, 'failed', failed));
  return jsonb_build_object('verified', verified, 'unavailable', missing, 'failed', failed);
end;
$$;

-- Retention (E10): a row not verified within 30 days is deleted, id included; so are
-- receipts older than a day. Safe to run repeatedly.
create or replace function public.expire_stale_videos()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from public.recipe_videos
   where coalesce(last_verified_at, created_at) < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from private.video_verifications where created_at < now() - interval '1 day';
  if n > 0 then
    perform private.audit('video.expire', 'recipe_videos', null, null, jsonb_build_object('deleted', n));
  end if;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Editors
-- -----------------------------------------------------------------------------
create or replace function public.assign_recipe_video(p_recipe_id uuid, p_video_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_receipt private.video_verifications%rowtype;
  v_id      uuid;
begin
  if v_actor is null or not private.is_editor() then
    raise exception 'only editors assign videos' using errcode = '42501';
  end if;
  -- The recipe row lock serializes editors; the partial unique index is the last line of defence.
  perform 1 from public.recipes r where r.id = p_recipe_id for update;
  if not found then
    raise exception 'recipe % not found', p_recipe_id using errcode = 'P0002';
  end if;
  select * into v_receipt
  from private.video_verifications x
  where x.youtube_video_id = p_video_id and x.actor_id = v_actor and x.status = 'verified'
    and x.consumed_at is null and x.created_at > now() - interval '15 minutes'
  order by x.created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'verify the video first (a fresh verification of your own is needed)' using errcode = '22023';
  end if;
  update private.video_verifications set consumed_at = now() where id = v_receipt.id;

  update public.recipe_videos set is_primary = false where recipe_id = p_recipe_id and is_primary;
  insert into public.recipe_videos as t
    (recipe_id, youtube_video_id, title, channel_title, is_primary, verification_status, last_verified_at, last_checked_at)
  values (p_recipe_id, p_video_id, v_receipt.title, v_receipt.channel_title, true, 'verified', v_receipt.created_at, v_receipt.created_at)
  on conflict (recipe_id, youtube_video_id) do update set
    title = excluded.title, channel_title = excluded.channel_title, is_primary = true, verification_status = 'verified',
    last_verified_at = excluded.last_verified_at, last_checked_at = excluded.last_checked_at,
    refresh_failures = 0, unavailable_reason = null
  returning id into v_id;
  perform private.audit('video.assign', 'recipes', p_recipe_id, null, jsonb_build_object('youtube_video_id', p_video_id));
  return v_id;
end;
$$;

create or replace function public.remove_recipe_video(p_recipe_id uuid, p_video_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_editor() then
    raise exception 'only editors remove videos' using errcode = '42501';
  end if;
  delete from public.recipe_videos where recipe_id = p_recipe_id and youtube_video_id = p_video_id;
  if not found then
    return false;
  end if;
  perform private.audit('video.remove', 'recipes', p_recipe_id, null, jsonb_build_object('youtube_video_id', p_video_id));
  return true;
end;
$$;

revoke all on function public.record_video_verification(text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_videos_for_refresh(int) from public, anon, authenticated;
revoke all on function public.apply_video_refresh(jsonb) from public, anon, authenticated;
revoke all on function public.expire_stale_videos() from public, anon, authenticated;
revoke all on function public.assign_recipe_video(uuid, text) from public, anon, authenticated;
revoke all on function public.remove_recipe_video(uuid, text) from public, anon, authenticated;
grant execute on function public.record_video_verification(text, uuid, text, text, text, text) to service_role;
grant execute on function public.claim_videos_for_refresh(int) to service_role;
grant execute on function public.apply_video_refresh(jsonb) to service_role;
grant execute on function public.expire_stale_videos() to service_role;
grant execute on function public.assign_recipe_video(uuid, text) to authenticated;
grant execute on function public.remove_recipe_video(uuid, text) to authenticated;
