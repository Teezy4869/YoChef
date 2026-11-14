-- =============================================================================
-- 4.5 recipe CMS (SCHEMA_V2.md §3, §6; phase4_08_admin_and_lifecycle.md)
--
-- Editors read recipes in every status and write them only through RPCs:
-- save_recipe (parent + ingredients + steps + audit in one transaction),
-- transition_recipe_status (the lifecycle below, validated before staging or
-- publishing) and, for super admins, delete_recipe. Clients keep no write
-- privilege on any catalog table. Editors upload new covers to recipe-images.
--
--   draft -> staged | archived      staged -> published | draft | archived
--   published -> staged | archived  archived -> draft
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Editors read every recipe and its children (super_admin counts as editor).
-- -----------------------------------------------------------------------------
create policy "Editors read every recipe" on public.recipes
  for select to authenticated using ((select private.is_editor()));
create policy "Editors read every recipe" on public.recipe_ingredients
  for select to authenticated using ((select private.is_editor()));
create policy "Editors read every recipe" on public.recipe_steps
  for select to authenticated using ((select private.is_editor()));
create policy "Editors read every recipe" on public.recipe_diets
  for select to authenticated using ((select private.is_editor()));

create or replace function public.search_recipes(
  p_query              text default null,
  p_category_slug      text default null,
  p_difficulty         text default null,
  p_max_total_minutes  int  default null,
  p_limit              int  default 20,
  p_offset             int  default 0
)
returns table (
  id                uuid,
  slug              text,
  name              text,
  description       text,
  category_slug     text,
  category_name     text,
  difficulty        text,
  default_servings  int,
  prep_time_minutes int,
  cook_time_minutes int,
  cover_image_path  text,
  total_count       bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    -- Every whitespace-separated term must match (AND), by name or ingredient.
    select coalesce(
      array_remove(
        string_to_array(btrim(regexp_replace(public.fold_vi(left(p_query, 100)), '\s+', ' ', 'g')), ' '),
        ''
      ),
      '{}'::text[]
    ) as terms
  ),
  matched as (
    select
      r.*,
      c.slug as c_slug,
      c.name as c_name,
      -- 0: every term is in the recipe name; 1: some term only via an ingredient.
      case when exists (
        select 1 from unnest(q.terms) as t(term)
        where strpos(public.fold_vi(r.name), t.term) = 0
      ) then 1 else 0 end as name_rank
    from public.recipes r
    left join public.categories c on c.id = r.category_id
    cross join q
    -- Explicit: editors read every status under RLS (4.5), the app lists published only.
    where r.status = 'published'
      and (p_category_slug is null or c.slug = p_category_slug)
      and (p_difficulty is null or r.difficulty = p_difficulty)
      -- Unknown time is NULL, never 0 (C5): a recipe with an unknown prep or
      -- cook time cannot pass a "within N minutes" filter.
      and (
        p_max_total_minutes is null
        or (
          r.prep_time_minutes is not null
          and r.cook_time_minutes is not null
          and r.prep_time_minutes + r.cook_time_minutes <= p_max_total_minutes
        )
      )
      and not exists (
        select 1 from unnest(q.terms) as t(term)
        where strpos(public.fold_vi(r.name), t.term) = 0
          and not exists (
            select 1
            from public.recipe_ingredients ri
            join public.ingredients i on i.id = ri.ingredient_id
            where ri.recipe_id = r.id
              and strpos(public.fold_vi(i.name || ' ' || array_to_string(i.aliases, ' ')), t.term) > 0
          )
      )
  )
  select
    m.id, m.slug, m.name, m.description, m.c_slug, m.c_name,
    m.difficulty, m.default_servings, m.prep_time_minutes, m.cook_time_minutes,
    m.cover_image_path,
    count(*) over () as total_count
  from matched m
  order by m.name_rank, m.source_recipe_number nulls last, m.name
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- -----------------------------------------------------------------------------
-- Publish readiness, as field -> message. Empty object = ready. Unknown times
-- and description stay allowed (NULL = unknown, C5), and a cover is optional
-- (8 quarantined images have none), but a cover that is set must exist.
-- Called only from the DEFINER RPCs below.
-- -----------------------------------------------------------------------------
create or replace function private.recipe_problems(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'category_id', case when r.category_id is null then 'Chọn danh mục.' end,
    'default_servings', case when r.default_servings is null then 'Nhập khẩu phần mặc định.' end,
    'cover_image_path', case
      when r.cover_image_path is not null
       and r.cover_image_path not like 'https://%'
       and not exists (select 1 from storage.objects o where o.bucket_id = 'recipe-images' and o.name = r.cover_image_path)
      then 'Ảnh bìa không có trong kho ảnh.' end,
    'ingredients', case
      when not exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id) then 'Cần ít nhất một nguyên liệu.'
      when exists (select 1 from public.recipe_ingredients i where i.recipe_id = r.id group by i.ingredient_id having count(*) > 1)
      then 'Có nguyên liệu bị lặp.' end,
    'steps', case
      when not exists (select 1 from public.recipe_steps s where s.recipe_id = r.id) then 'Cần ít nhất một bước.'
      when exists (select 1 from public.recipe_steps s where s.recipe_id = r.id and char_length(s.instruction) > 2000)
      then 'Mỗi bước tối đa 2000 ký tự.' end
  ))
  from public.recipes r
  where r.id = p_id;
$$;
revoke all on function private.recipe_problems(uuid) from public, anon, authenticated;

create or replace function private.raise_if_not_ready(p_id uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_problems jsonb := private.recipe_problems(p_id);
begin
  if v_problems <> '{}'::jsonb then
    raise exception 'recipe is not ready to stage or publish' using errcode = '22023', detail = v_problems::text;
  end if;
end;
$$;
revoke all on function private.raise_if_not_ready(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- New ingredient (editors). An existing name returns its id instead.
-- -----------------------------------------------------------------------------
create or replace function public.create_ingredient(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_base text;
  v_slug text;
  v_id   uuid;
  n      int := 1;
begin
  if not private.is_editor() then
    raise exception 'only editors create ingredients' using errcode = '42501';
  end if;
  if v_name is null or v_name = '' or char_length(v_name) > 150 then
    raise exception 'an ingredient name of 1 to 150 characters is required' using errcode = '22023';
  end if;
  select i.id into v_id from public.ingredients i where lower(i.name) = lower(v_name);
  if found then
    return v_id;
  end if;
  v_base := coalesce(nullif(btrim(regexp_replace(public.fold_vi(v_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'nguyen-lieu');
  v_slug := v_base;
  while exists (select 1 from public.ingredients i where i.slug = v_slug) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;
  insert into public.ingredients (slug, name) values (v_slug, v_name) returning id into v_id;
  perform private.audit('ingredient.create', 'ingredients', v_id, null, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Create (p_id NULL, always a draft) or edit a recipe with all its children in
-- one transaction. Ingredients and steps are replaced in the order given.
-- A staged or published recipe must stay ready after the edit.
-- -----------------------------------------------------------------------------
create or replace function public.save_recipe(
  p_id          uuid,
  p_recipe      jsonb,
  p_ingredients jsonb,
  p_steps       jsonb,
  p_reason      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := p_id;
  v_status text := 'draft';
  t        text := '';
begin
  if not private.is_editor() then
    raise exception 'only editors save recipes' using errcode = '42501';
  end if;
  if jsonb_typeof(p_recipe) is distinct from 'object'
     or jsonb_typeof(p_ingredients) is distinct from 'array'
     or jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'recipe must be an object, ingredients and steps arrays' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.recipes (slug, name, status) values (btrim(p_recipe ->> 'slug'), btrim(p_recipe ->> 'name'), 'draft')
    returning id into v_id;
  else
    select r.status into v_status from public.recipes r where r.id = v_id for update;
    if not found then
      raise exception 'recipe % not found', v_id using errcode = 'P0002';
    end if;
  end if;

  update public.recipes set
    slug              = btrim(p_recipe ->> 'slug'),
    name              = btrim(p_recipe ->> 'name'),
    description       = nullif(btrim(p_recipe ->> 'description'), ''),
    category_id       = (p_recipe ->> 'category_id')::uuid,
    difficulty        = nullif(p_recipe ->> 'difficulty', ''),
    default_servings  = (p_recipe ->> 'default_servings')::int,
    serving_basis     = nullif(p_recipe ->> 'serving_basis', ''),
    serving_note      = nullif(btrim(p_recipe ->> 'serving_note'), ''),
    prep_time_minutes = (p_recipe ->> 'prep_time_minutes')::int,
    cook_time_minutes = (p_recipe ->> 'cook_time_minutes')::int,
    cover_image_path  = nullif(btrim(p_recipe ->> 'cover_image_path'), '')
  where id = v_id;

  delete from public.recipe_ingredients where recipe_id = v_id;
  insert into public.recipe_ingredients
    (recipe_id, ingredient_id, sort_order, quantity, unit, quantity_basis, preparation_note, quantity_note, is_optional)
  select v_id, (e ->> 'ingredient_id')::uuid, o::int, (e ->> 'quantity')::numeric, nullif(btrim(e ->> 'unit'), ''),
         e ->> 'quantity_basis', nullif(btrim(e ->> 'preparation_note'), ''), nullif(btrim(e ->> 'quantity_note'), ''),
         coalesce((e ->> 'is_optional')::boolean, false)
  from jsonb_array_elements(p_ingredients) with ordinality as x(e, o);

  delete from public.recipe_steps where recipe_id = v_id;
  insert into public.recipe_steps (recipe_id, step_number, instruction, duration_seconds, duration_basis, timer_enabled)
  select v_id, o::int, btrim(e ->> 'instruction'), (e ->> 'duration_seconds')::int, nullif(e ->> 'duration_basis', ''),
         coalesce((e ->> 'timer_enabled')::boolean, false)
  from jsonb_array_elements(p_steps) with ordinality as x(e, o);

  if v_status in ('staged', 'published') then
    perform private.raise_if_not_ready(v_id);
  end if;
  if p_id is null then t := 'recipe.create'; else t := 'recipe.update'; end if;
  perform private.audit(t, 'recipes', v_id, p_reason, jsonb_build_object('status', v_status));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Status moves (diagram above); staging and publishing need a ready recipe.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Hard delete: super admins only, slug typed to confirm, never a published
-- recipe or one that users interacted with.
-- -----------------------------------------------------------------------------
create or replace function public.delete_recipe(p_id uuid, p_confirm_slug text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug   text;
  v_name   text;
  v_status text;
begin
  if not private.is_super_admin() then
    raise exception 'only super admins delete recipes' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  select r.slug, r.name, r.status into v_slug, v_name, v_status from public.recipes r where r.id = p_id for update;
  if not found then
    raise exception 'recipe % not found', p_id using errcode = 'P0002';
  end if;
  if p_confirm_slug is distinct from v_slug then
    raise exception 'type the recipe slug to confirm' using errcode = '22023';
  end if;
  if v_status = 'published' then
    raise exception 'archive a published recipe before deleting it' using errcode = '22023';
  end if;
  if exists (select 1 from public.favorites x where x.recipe_id = p_id)
     or exists (select 1 from public.ratings x where x.recipe_id = p_id)
     or exists (select 1 from public.comments x where x.recipe_id = p_id)
     or exists (select 1 from public.cooking_photos x where x.recipe_id = p_id) then
    raise exception 'the recipe has favorites, ratings, comments or photos' using errcode = '22023';
  end if;
  delete from public.recipes where id = p_id;
  perform private.audit('recipe.delete', 'recipes', p_id, p_reason, jsonb_build_object('slug', v_slug, 'name', v_name));
end;
$$;

revoke all on function public.create_ingredient(text) from public, anon, authenticated;
revoke all on function public.save_recipe(uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.transition_recipe_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_recipe(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_ingredient(text) to authenticated;
grant execute on function public.save_recipe(uuid, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.transition_recipe_status(uuid, text, text) to authenticated;
grant execute on function public.delete_recipe(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: recipe-images. Editors upload new covers as <slug>/cover-<time>.<ext>
-- (never overwriting: no UPDATE policy), read the bucket, and delete a file no
-- recipe points at; super admins delete any.
-- -----------------------------------------------------------------------------
create or replace function private.can_delete_recipe_image(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.is_super_admin() then
    return true;
  end if;
  return private.is_editor()
    and not exists (select 1 from public.recipes r where r.cover_image_path = p_name);
end;
$$;
revoke all on function private.can_delete_recipe_image(text) from public, anon, authenticated;
grant execute on function private.can_delete_recipe_image(text) to authenticated;

create policy "Editors upload recipe covers" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (select private.is_editor())
    and name ~ '^[a-z0-9-]+/cover-[0-9]+\.(webp|jpg|png)$'
  );

create policy "Editors read recipe images" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-images' and (select private.is_editor()));

create policy "Authorized delete of recipe images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images' and private.can_delete_recipe_image(name));

