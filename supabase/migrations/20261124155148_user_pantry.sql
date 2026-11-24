-- =============================================================================
-- Pantry inventory & auto-deduction (user_pantry + RPCs)
--
-- A user's fridge/pantry stores canonical catalog ingredients only (UNIQUE per
-- user_id + ingredient_id). Buying from shopping lists merges quantities;
-- finishing cooking deducts quantities in one transaction and deletes depleted
-- items instead of allowing negative stock.
-- =============================================================================

create table public.user_pantry (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity      numeric not null check (quantity > 0),
  unit          text not null check (char_length(btrim(unit)) between 1 and 50),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint user_pantry_user_ingredient_unique unique (user_id, ingredient_id)
);

create index user_pantry_user_id_idx on public.user_pantry (user_id);
create index user_pantry_ingredient_id_idx on public.user_pantry (ingredient_id);

create trigger set_updated_at before update on public.user_pantry
  for each row execute function private.set_updated_at();

revoke all on public.user_pantry from anon, authenticated;
grant select, delete on public.user_pantry to authenticated;
grant insert (user_id, ingredient_id, quantity, unit) on public.user_pantry to authenticated;
grant update (quantity, unit) on public.user_pantry to authenticated;

alter table public.user_pantry enable row level security;

create policy "Owner reads own pantry" on public.user_pantry
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owner inserts into own pantry" on public.user_pantry
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owner updates own pantry" on public.user_pantry
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owner deletes from own pantry" on public.user_pantry
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Unit conversion helper for basic mass & volume systems.
-- Returns converted positive quantity, or NULL when units are incompatible.
-- -----------------------------------------------------------------------------
create or replace function public.convert_pantry_qty(
  p_qty       numeric,
  p_from_unit text,
  p_to_unit   text
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_from text := lower(btrim(coalesce(p_from_unit, '')));
  v_to   text := lower(btrim(coalesce(p_to_unit, '')));
  v_from_group text;
  v_to_group   text;
  v_from_factor numeric;
  v_to_factor   numeric;
begin
  if p_qty is null or p_qty <= 0 then
    return null;
  end if;
  if v_from = '' or v_to = '' then
    return null;
  end if;
  if v_from = v_to then
    return p_qty;
  end if;

  -- Mass (base: g)
  case v_from
    when 'g', 'gam' then v_from_group := 'mass'; v_from_factor := 1;
    when 'lạng' then v_from_group := 'mass'; v_from_factor := 100;
    when 'kg' then v_from_group := 'mass'; v_from_factor := 1000;
    when 'ml' then v_from_group := 'vol'; v_from_factor := 1;
    when 'l', 'lít', 'lit' then v_from_group := 'vol'; v_from_factor := 1000;
    when 'muỗng cà phê', 'thìa cà phê' then v_from_group := 'vol'; v_from_factor := 5;
    when 'muỗng canh', 'thìa canh' then v_from_group := 'vol'; v_from_factor := 15;
    else return null;
  end case;

  case v_to
    when 'g', 'gam' then v_to_group := 'mass'; v_to_factor := 1;
    when 'lạng' then v_to_group := 'mass'; v_to_factor := 100;
    when 'kg' then v_to_group := 'mass'; v_to_factor := 1000;
    when 'ml' then v_to_group := 'vol'; v_to_factor := 1;
    when 'l', 'lít', 'lit' then v_to_group := 'vol'; v_to_factor := 1000;
    when 'muỗng cà phê', 'thìa cà phê' then v_to_group := 'vol'; v_to_factor := 5;
    when 'muỗng canh', 'thìa canh' then v_to_group := 'vol'; v_to_factor := 15;
    else return null;
  end case;

  if v_from_group <> v_to_group then
    return null;
  end if;

  return round((p_qty * v_from_factor / v_to_factor)::numeric, 4);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: add_or_merge_pantry_items(p_items, p_shopping_item_ids)
-- Adds or merges canonical ingredients into the caller's pantry, and optionally
-- removes moved items from the caller's shopping lists in one transaction.
-- -----------------------------------------------------------------------------
create or replace function public.add_or_merge_pantry_items(
  p_items             jsonb,
  p_shopping_item_ids uuid[] default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_item       jsonb;
  v_ing_id     uuid;
  v_qty        numeric;
  v_unit       text;
  v_existing   record;
  v_converted  numeric;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_ing_id := nullif(btrim(coalesce(v_item->>'ingredient_id', '')), '')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');

    if v_ing_id is null or v_qty is null or v_qty <= 0 or v_unit is null then
      raise exception 'Each pantry item requires ingredient_id, positive quantity, and unit' using errcode = '22023';
    end if;

    select id, quantity, unit
    into v_existing
    from public.user_pantry
    where user_id = v_uid and ingredient_id = v_ing_id
    for update;

    if not found then
      insert into public.user_pantry (user_id, ingredient_id, quantity, unit)
      values (v_uid, v_ing_id, round(v_qty, 4), v_unit);
    else
      v_converted := public.convert_pantry_qty(v_qty, v_unit, v_existing.unit);
      if v_converted is not null then
        update public.user_pantry
        set quantity = round(v_existing.quantity + v_converted, 4)
        where id = v_existing.id;
      else
        -- Incompatible unit systems: replace with the latest measured stock.
        update public.user_pantry
        set quantity = round(v_qty, 4), unit = v_unit
        where id = v_existing.id;
      end if;
    end if;
  end loop;

  if p_shopping_item_ids is not null and array_length(p_shopping_item_ids, 1) > 0 then
    delete from public.shopping_list_items sli
    using public.shopping_lists sl
    where sli.shopping_list_id = sl.id
      and sl.user_id = v_uid
      and sli.id = any(p_shopping_item_ids);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: deduct_pantry_ingredients(p_items)
-- Deducts recipe ingredients from the caller's pantry in one transaction.
-- Never produces negative stock: items reaching 0 or below are removed.
-- -----------------------------------------------------------------------------
create or replace function public.deduct_pantry_ingredients(
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_item      jsonb;
  v_ing_id    uuid;
  v_qty       numeric;
  v_unit      text;
  v_existing  record;
  v_deduct    numeric;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_ing_id := nullif(btrim(coalesce(v_item->>'ingredient_id', '')), '')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');

    if v_ing_id is not null and v_qty is not null and v_qty > 0 then
      select id, quantity, unit
      into v_existing
      from public.user_pantry
      where user_id = v_uid and ingredient_id = v_ing_id
      for update;

      if found then
        if v_unit is null then
          v_deduct := v_qty;
        else
          v_deduct := public.convert_pantry_qty(v_qty, v_unit, v_existing.unit);
        end if;

        if v_deduct is not null and v_deduct > 0 then
          if v_existing.quantity <= v_deduct then
            delete from public.user_pantry where id = v_existing.id;
          else
            update public.user_pantry
            set quantity = round(v_existing.quantity - v_deduct, 4)
            where id = v_existing.id;
          end if;
        end if;
      end if;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: match_recipes_from_pantry(p_limit, p_offset)
-- Finds published recipes ranked by how many required ingredients are in the
-- caller's pantry. Fully-matched recipes appear first.
-- -----------------------------------------------------------------------------
create or replace function public.match_recipes_from_pantry(
  p_limit  int default 20,
  p_offset int default 0
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
  matched_count     int,
  required_count    int,
  missing_count     int,
  total_count       bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with my_pantry as (
    select ingredient_id
    from public.user_pantry
    where user_id = (select auth.uid())
  ),
  recipe_ing_sets as (
    select
      ri.recipe_id,
      count(distinct ri.ingredient_id) filter (where not ri.is_optional)::int as req_cnt,
      count(distinct ri.ingredient_id)::int as all_cnt,
      count(distinct ri.ingredient_id) filter (where not ri.is_optional and mp.ingredient_id is not null)::int as req_hit,
      count(distinct ri.ingredient_id) filter (where mp.ingredient_id is not null)::int as all_hit
    from public.recipe_ingredients ri
    left join my_pantry mp on mp.ingredient_id = ri.ingredient_id
    group by ri.recipe_id
  ),
  scored as (
    select
      r.id,
      r.slug,
      r.name,
      r.description,
      c.slug as category_slug,
      c.name as category_name,
      r.difficulty,
      r.default_servings,
      r.prep_time_minutes,
      r.cook_time_minutes,
      r.cover_image_path,
      case when s.req_cnt > 0 then s.req_hit else s.all_hit end as matched_count,
      case when s.req_cnt > 0 then s.req_cnt else s.all_cnt end as required_count,
      greatest(0, (case when s.req_cnt > 0 then s.req_cnt else s.all_cnt end) - (case when s.req_cnt > 0 then s.req_hit else s.all_hit end))::int as missing_count
    from public.recipes r
    join recipe_ing_sets s on s.recipe_id = r.id
    left join public.categories c on c.id = r.category_id
    where r.status = 'published'
      and (case when s.req_cnt > 0 then s.req_hit else s.all_hit end) > 0
  )
  select
    sc.id,
    sc.slug,
    sc.name,
    sc.description,
    sc.category_slug,
    sc.category_name,
    sc.difficulty,
    sc.default_servings,
    sc.prep_time_minutes,
    sc.cook_time_minutes,
    sc.cover_image_path,
    sc.matched_count,
    sc.required_count,
    sc.missing_count,
    count(*) over () as total_count
  from scored sc
  order by
    (sc.missing_count = 0) desc,
    (sc.matched_count::numeric / nullif(sc.required_count, 0)) desc,
    sc.missing_count asc,
    sc.matched_count desc,
    sc.name asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.convert_pantry_qty(numeric, text, text) from public, anon, authenticated;
revoke all on function public.add_or_merge_pantry_items(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.deduct_pantry_ingredients(jsonb) from public, anon, authenticated;
revoke all on function public.match_recipes_from_pantry(int, int) from public, anon, authenticated;

grant execute on function public.convert_pantry_qty(numeric, text, text) to authenticated;
grant execute on function public.add_or_merge_pantry_items(jsonb, uuid[]) to authenticated;
grant execute on function public.deduct_pantry_ingredients(jsonb) to authenticated;
grant execute on function public.match_recipes_from_pantry(int, int) to authenticated;
