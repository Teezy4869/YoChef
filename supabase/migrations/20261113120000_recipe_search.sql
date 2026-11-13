-- =============================================================================
-- 2.1 Vietnamese-aware recipe search (SCHEMA_V2.md §3.4, Phase 2)
--
-- No new table, no new column. Two functions:
--   public.fold_vi(text)     lower-case, strip diacritics, d-stroke -> d.
--   public.search_recipes()  SECURITY INVOKER, so the caller's RLS applies:
--                            anon and authenticated see published recipes only.
--
-- Deviation from the SCHEMA_V2 plan (search_text column + trigger): not needed.
-- fold_vi is IMMUTABLE built from normalize(NFD) + regexp_replace, so no
-- unaccent extension is required, and folding on the fly over ~250 recipes is
-- fast enough without a stored column or a trigram index.
-- =============================================================================

create or replace function public.fold_vi(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(
    regexp_replace(normalize(lower(coalesce(p_text, '')), nfd), '[̀-ͯ]', '', 'g'),
    'đ', 'd'
  );
$$;

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
    where (p_category_slug is null or c.slug = p_category_slug)
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

revoke all on function public.fold_vi(text) from public, anon, authenticated;
revoke all on function public.search_recipes(text, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.fold_vi(text) to anon, authenticated;
grant execute on function public.search_recipes(text, text, text, int, int, int) to anon, authenticated;
