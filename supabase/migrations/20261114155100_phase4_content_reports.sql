-- =============================================================================
-- 4.2 user reports on comments and cooking photos (SCHEMA_V2.md §5.7,
-- phase4_03_reporting_implementation.md, phase4_08_rbac_matrix.md "Reports")
--
-- A signed-in user reports someone else's comment or photo that they can see,
-- once per item. Reporters cannot read reports back (a row holds internal
-- notes). Moderators read every report and move it through its workflow with
-- update_report_workflow(), which is audited.
-- =============================================================================

create table public.content_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles (id) on delete cascade,
  target_table  text not null check (target_table in ('comments', 'cooking_photos')),
  -- No FK: a report outlives the content it is about.
  target_id     uuid not null,
  reason        text not null
                check (reason in ('spam', 'offensive', 'irrelevant', 'inappropriate_image', 'copyright', 'other')),
  details       text check (details is null or (char_length(details) <= 500 and details ~ '\S')),
  status        text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  internal_note text check (internal_note is null or (char_length(internal_note) <= 1000 and internal_note ~ '\S')),
  handled_by    uuid references public.profiles (id) on delete set null,
  handled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (reporter_id, target_table, target_id),
  -- "Other" needs a description (phase4_03 §2).
  check (reason <> 'other' or details is not null)
);
create index content_reports_status_created_at_idx on public.content_reports (status, created_at);
create index content_reports_target_idx on public.content_reports (target_table, target_id);
create index content_reports_handled_by_idx on public.content_reports (handled_by);

create trigger set_updated_at before update on public.content_reports
  for each row execute function private.set_updated_at();

revoke all on public.content_reports from anon, authenticated;
-- SELECT is for moderators (RLS below); reporters only insert, and never the workflow columns.
grant select on public.content_reports to authenticated;
grant insert (reporter_id, target_table, target_id, reason, details) on public.content_reports to authenticated;

alter table public.content_reports enable row level security;

create policy "Moderators read every report" on public.content_reports
  for select to authenticated
  using ((select private.is_moderator()));

-- The target must be visible to the reporter (under their own RLS) and not their own.
create policy "Users report content of others that they can see" on public.content_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (
      (target_table = 'comments'
        and exists (select 1 from public.comments c where c.id = target_id and c.user_id <> (select auth.uid())))
      or (target_table = 'cooking_photos'
        and exists (select 1 from public.cooking_photos p where p.id = target_id and p.user_id <> (select auth.uid())))
    )
  );

-- -----------------------------------------------------------------------------
-- Workflow: any status move, an optional internal note; stamps the handler and
-- writes the audit row in the same transaction. Returns the new status.
-- -----------------------------------------------------------------------------
create or replace function public.update_report_workflow(p_id uuid, p_status text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_from  text;
  v_note  text := nullif(btrim(p_note), '');
begin
  if v_actor is null or not private.is_moderator() then
    raise exception 'only moderators handle reports' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;

  select r.status into v_from from public.content_reports r where r.id = p_id for update;
  if not found then
    raise exception 'report % not found', p_id using errcode = 'P0002';
  end if;

  update public.content_reports
     set status = p_status,
         internal_note = coalesce(v_note, internal_note),
         handled_by = v_actor,
         handled_at = now()
   where id = p_id;

  perform private.audit('report.' || p_status, 'content_reports', p_id, v_note,
                        jsonb_build_object('from', v_from, 'to', p_status));
  return p_status;
end;
$$;

revoke all on function public.update_report_workflow(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_report_workflow(uuid, text, text) to authenticated;
