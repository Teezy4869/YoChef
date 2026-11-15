-- =============================================================================
-- Step 4.8: a recipe status change needs a reason, like every other staff write
-- (manage_user_role, delete_recipe). Before this, transition_recipe_status
-- accepted NULL and the audit log showed "—" for every status move.
-- The signature keeps its DEFAULT (CREATE OR REPLACE cannot drop a default);
-- a missing or blank reason is refused instead (22023).
-- =============================================================================

create or replace function public.transition_recipe_status(p_id uuid, p_to text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  if not private.is_editor() then
    raise exception 'only editors change a recipe status' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  select r.status into v_from from public.recipes r where r.id = p_id for update;
  if not found then
    raise exception 'recipe % not found', p_id using errcode = 'P0002';
  end if;
  if p_to is null or (v_from, p_to) not in (
    ('draft', 'staged'), ('draft', 'archived'),
    ('staged', 'published'), ('staged', 'draft'), ('staged', 'archived'),
    ('published', 'staged'), ('published', 'archived'),
    ('archived', 'draft')
  ) then
    raise exception 'a recipe cannot move from % to %', v_from, coalesce(p_to, 'null') using errcode = '22023';
  end if;
  if p_to in ('staged', 'published') then
    perform private.raise_if_not_ready(p_id);
  end if;
  update public.recipes
     set status = p_to,
         published_at = case when p_to = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_id;
  perform private.audit('recipe.status', 'recipes', p_id, p_reason, jsonb_build_object('from', v_from, 'to', p_to));
  return p_to;
end;
$$;

revoke all on function public.transition_recipe_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_recipe_status(uuid, text, text) to authenticated;
