-- =============================================================================
-- 4.3 nutrition (SCHEMA_V2.md §5.6, phase4_08_nutrition_data_contract.md,
-- calculation version 2.0.0)
--
-- Editors map each ingredient to a USDA food (values per 100 g) and define
-- unit -> gram conversions; both count only once verified. The engine turns a
-- recipe's required ingredients into totals and per-serving values; a total is
-- NULL, never a partial sum, when any required ingredient cannot contribute.
-- The public reads VERIFIED results of published recipes only. Any change to
-- an input marks existing results STALE.
-- =============================================================================

create table public.ingredient_nutrition (
  ingredient_id     uuid primary key references public.ingredients (id) on delete cascade,
  -- Values count as per 100 g only when the source says so; otherwise basis and every value are NULL.
  basis             text check (basis is null or basis = 'per_100g'),
  energy_kcal       numeric(10, 3) check (energy_kcal >= 0),
  protein_g         numeric(10, 3) check (protein_g >= 0),
  fat_g             numeric(10, 3) check (fat_g >= 0),
  carbs_g           numeric(10, 3) check (carbs_g >= 0),
  sodium_mg         numeric(10, 3) check (sodium_mg >= 0),
  saturated_fat_g   numeric(10, 3) check (saturated_fat_g >= 0),
  fiber_g           numeric(10, 3) check (fiber_g >= 0),
  sugar_g           numeric(10, 3) check (sugar_g >= 0),
  provider          text check (provider in ('usda')),
  external_id       text check (external_id ~ '^[0-9]{1,10}$'),
  description       text,
  data_type         text,
  preparation_state text,
  source_version    text,
  retrieved_at      timestamptz,
  mapping_status    text not null default 'UNMAPPED'
                    check (mapping_status in ('UNMAPPED', 'CANDIDATE', 'NEEDS_REVIEW', 'VERIFIED', 'UNAVAILABLE')),
  verified_by       uuid references public.profiles (id) on delete set null,
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (basis is not null or coalesce(energy_kcal, protein_g, fat_g, carbs_g, sodium_mg, saturated_fat_g, fiber_g, sugar_g) is null),
  check (mapping_status <> 'VERIFIED' or (basis is not null and provider is not null and external_id is not null and verified_at is not null))
);
create index ingredient_nutrition_verified_by_idx on public.ingredient_nutrition (verified_by);

create table public.nutrition_unit_conversions (
  id             uuid primary key default gen_random_uuid(),
  -- NULL: a global rule for the unit; otherwise it applies to one ingredient and wins.
  ingredient_id  uuid references public.ingredients (id) on delete cascade,
  unit           text not null check (unit = lower(btrim(unit)) and unit <> ''),
  grams_per_unit numeric(12, 4) not null check (grams_per_unit > 0),
  source         text check (source is null or source ~ '\S'),
  method         text check (method is null or method ~ '\S'),
  verified_by    uuid references public.profiles (id) on delete set null,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (ingredient_id, unit),
  check (verified_at is null or (source is not null and method is not null))
);
create index nutrition_unit_conversions_verified_by_idx on public.nutrition_unit_conversions (verified_by);

-- Mass units are definitions, so they start verified. Nothing else is assumed.
insert into public.nutrition_unit_conversions (ingredient_id, unit, grams_per_unit, source, method, verified_at) values
  (null, 'g', 1, 'SI', 'definition', now()),
  (null, 'gram', 1, 'SI', 'definition', now()),
  (null, 'kg', 1000, 'SI', 'definition', now()),
  (null, 'mg', 0.001, 'SI', 'definition', now());

create table public.recipe_nutrition (
  recipe_id           uuid primary key references public.recipes (id) on delete cascade,
  calculation_version text not null,
  status              text not null
                      check (status in ('NOT_CALCULATED', 'INCOMPLETE', 'CALCULATED', 'NEEDS_REVIEW', 'VERIFIED', 'STALE')),
  -- {energy_kcal, protein_g, fat_g, carbs_g, sodium_mg, saturated_fat_g, fiber_g, sugar_g}; a NULL value is unknown.
  totals              jsonb not null,
  per_serving         jsonb,
  completeness        numeric(5, 4) not null check (completeness between 0 and 1),
  reason_codes        text[] not null default '{}',
  -- Per required ingredient: {ingredient_id, name, grams, reasons}.
  breakdown           jsonb not null default '[]'::jsonb,
  excluded_optional   uuid[] not null default '{}',
  calculated_at       timestamptz not null default now(),
  verified_by         uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz
);
create index recipe_nutrition_verified_by_idx on public.recipe_nutrition (verified_by);

create trigger set_updated_at before update on public.ingredient_nutrition
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.nutrition_unit_conversions
  for each row execute function private.set_updated_at();

revoke all on public.ingredient_nutrition, public.nutrition_unit_conversions, public.recipe_nutrition from anon, authenticated;
grant select on public.ingredient_nutrition, public.nutrition_unit_conversions to authenticated;
grant select on public.recipe_nutrition to anon, authenticated;

alter table public.ingredient_nutrition enable row level security;
alter table public.nutrition_unit_conversions enable row level security;
alter table public.recipe_nutrition enable row level security;

create policy "Editors read nutrition mappings" on public.ingredient_nutrition
  for select to authenticated using ((select private.is_editor()));
create policy "Editors read unit conversions" on public.nutrition_unit_conversions
  for select to authenticated using ((select private.is_editor()));
create policy "Public reads verified nutrition of published recipes" on public.recipe_nutrition
  for select to anon, authenticated
  using (
    status = 'VERIFIED'
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );
create policy "Editors read every nutrition result" on public.recipe_nutrition
  for select to authenticated using ((select private.is_editor()));

-- -----------------------------------------------------------------------------
-- Engine 2.0.0. Pure read: returns what recipe_nutrition would hold.
-- -----------------------------------------------------------------------------
create or replace function private.compute_recipe_nutrition(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  keys       text[] := array['energy_kcal', 'protein_g', 'fat_g', 'carbs_g', 'sodium_mg', 'saturated_fat_g', 'fiber_g', 'sugar_g'];
  mandatory  text[] := array['energy_kcal', 'protein_g', 'fat_g', 'carbs_g', 'sodium_mg'];
  v_servings int;
  rec        record;
  v_reasons  text[];
  v_all      text[] := '{}';
  v_grams    numeric;
  v_factor   numeric;
  v_any_unverified boolean;
  v_row      jsonb;
  v_totals   jsonb := '{}'::jsonb;
  v_known    int := 0;
  v_required int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_optional uuid[] := '{}';
  v_blocked  boolean := false;
  v_status   text;
  v_per      jsonb;
  k          text;
  v_val      numeric;
begin
  select r.default_servings into v_servings from public.recipes r where r.id = p_recipe_id;
  foreach k in array keys loop
    v_totals := v_totals || jsonb_build_object(k, 0);
  end loop;

  for rec in
    select ri.ingredient_id, ri.quantity, lower(btrim(ri.unit)) as unit, ri.quantity_basis, ri.is_optional, i.name,
           n.mapping_status, n.basis, to_jsonb(n) as nutrition
    from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    left join public.ingredient_nutrition n on n.ingredient_id = ri.ingredient_id
    where ri.recipe_id = p_recipe_id
    order by ri.sort_order
  loop
    if rec.is_optional then
      v_optional := v_optional || rec.ingredient_id;
      continue;
    end if;
    v_required := v_required + 1;
    v_reasons := '{}';
    v_grams := null;

    if rec.quantity is null then
      v_reasons := array_append(v_reasons, 'missing_quantity');
    elsif rec.quantity <= 0 then
      v_reasons := array_append(v_reasons, 'invalid_quantity');
    elsif rec.unit is null or rec.unit = '' then
      v_reasons := array_append(v_reasons, 'missing_unit');
    else
      -- A verified ingredient rule wins, then a verified global rule.
      select c.grams_per_unit into v_factor
      from public.nutrition_unit_conversions c
      where c.unit = rec.unit and c.verified_at is not null
        and (c.ingredient_id = rec.ingredient_id or c.ingredient_id is null)
      order by c.ingredient_id nulls last
      limit 1;
      if v_factor is null then
        select exists (
          select 1 from public.nutrition_unit_conversions c
          where c.unit = rec.unit and (c.ingredient_id = rec.ingredient_id or c.ingredient_id is null)
        ) into v_any_unverified;
        v_reasons := array_append(v_reasons, case when v_any_unverified then 'unverified_conversion' else 'no_verified_conversion' end);
      else
        v_grams := rec.quantity * v_factor;
      end if;
    end if;

    if rec.mapping_status is null or rec.mapping_status = 'UNMAPPED' then
      v_reasons := array_append(v_reasons, 'unmapped_nutrition');
    elsif rec.mapping_status = 'UNAVAILABLE' then
      v_reasons := array_append(v_reasons, 'unavailable_nutrition');
    elsif rec.mapping_status <> 'VERIFIED' or rec.basis is null then
      v_reasons := array_append(v_reasons, 'unverified_mapping');
    end if;

    if cardinality(v_reasons) > 0 then
      -- This ingredient cannot contribute: every total becomes unknown.
      v_blocked := true;
    else
      foreach k in array keys loop
        v_val := (rec.nutrition ->> k)::numeric;
        if v_val is null then
          v_totals := jsonb_set(v_totals, array[k], 'null'::jsonb);
          if k = any (mandatory) then
            v_reasons := array_append(v_reasons, 'missing_nutrient');
          end if;
        else
          v_known := v_known + 1;
          if v_totals -> k <> 'null'::jsonb then
            v_totals := jsonb_set(v_totals, array[k], to_jsonb((v_totals ->> k)::numeric + v_grams / 100 * v_val));
          end if;
        end if;
      end loop;
    end if;

    v_all := v_all || v_reasons;
    v_breakdown := v_breakdown || jsonb_build_object(
      'ingredient_id', rec.ingredient_id, 'name', rec.name, 'grams', v_grams, 'reasons', to_jsonb(v_reasons));
  end loop;

  if v_blocked then
    foreach k in array keys loop
      v_totals := jsonb_set(v_totals, array[k], 'null'::jsonb);
    end loop;
  end if;

  if v_required = 0 or v_servings is null or v_servings <= 0 or v_known = 0 then
    v_status := 'NOT_CALCULATED';
    if v_servings is null or v_servings <= 0 then
      v_all := array_append(v_all, 'invalid_servings');
    end if;
  elsif v_blocked or exists (select 1 from unnest(mandatory) m where v_totals -> m = 'null'::jsonb) then
    v_status := 'INCOMPLETE';
  else
    v_status := 'CALCULATED';
  end if;

  -- Per serving from the unrounded totals, then one decimal, half away from zero (numeric round).
  if v_status <> 'NOT_CALCULATED' and v_servings > 0 then
    v_per := '{}'::jsonb;
    foreach k in array keys loop
      v_per := v_per || jsonb_build_object(k,
        case when v_totals -> k = 'null'::jsonb then null
             else round((v_totals ->> k)::numeric / v_servings, 1) end);
    end loop;
  end if;
  foreach k in array keys loop
    if v_totals -> k <> 'null'::jsonb then
      v_totals := jsonb_set(v_totals, array[k], to_jsonb(round((v_totals ->> k)::numeric, 1)));
    end if;
  end loop;

  select coalesce(array_agg(distinct x order by x), '{}') into v_all from unnest(v_all) x;
  return jsonb_build_object(
    'status', v_status,
    'totals', v_totals,
    'per_serving', v_per,
    'completeness', case when v_required = 0 then 0 else round(v_known::numeric / (v_required * 8), 4) end,
    'reason_codes', to_jsonb(v_all),
    'breakdown', v_breakdown,
    'excluded_optional', to_jsonb(v_optional)
  );
end;
$$;
revoke all on function private.compute_recipe_nutrition(uuid) from public, anon, authenticated;

-- Marks results STALE when an input changes (ingredients, servings, a mapping or a conversion).
create or replace function private.mark_nutrition_stale(p_recipe_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recipe_nutrition set status = 'STALE'
  where recipe_id = any (p_recipe_ids) and status <> 'STALE';
$$;
revoke all on function private.mark_nutrition_stale(uuid[]) from public, anon, authenticated;

create or replace function private.stale_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if tg_table_name = 'recipe_ingredients' then
    v_ids := array[coalesce(new.recipe_id, old.recipe_id)];
  elsif tg_table_name = 'recipes' then
    if new.default_servings is not distinct from old.default_servings then
      return new;
    end if;
    v_ids := array[new.id];
  elsif tg_table_name = 'ingredient_nutrition' then
    select array_agg(distinct ri.recipe_id) into v_ids
    from public.recipe_ingredients ri where ri.ingredient_id = coalesce(new.ingredient_id, old.ingredient_id);
  else -- nutrition_unit_conversions
    select array_agg(distinct ri.recipe_id) into v_ids
    from public.recipe_ingredients ri
    where lower(btrim(ri.unit)) = coalesce(new.unit, old.unit)
      and (coalesce(new.ingredient_id, old.ingredient_id) is null or ri.ingredient_id = coalesce(new.ingredient_id, old.ingredient_id));
  end if;
  if v_ids is not null then
    perform private.mark_nutrition_stale(v_ids);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.stale_on_change() from public, anon, authenticated;

create trigger nutrition_stale after insert or update or delete on public.recipe_ingredients
  for each row execute function private.stale_on_change();
create trigger nutrition_stale after update of default_servings on public.recipes
  for each row execute function private.stale_on_change();
create trigger nutrition_stale after insert or update or delete on public.ingredient_nutrition
  for each row execute function private.stale_on_change();
create trigger nutrition_stale after insert or update or delete on public.nutrition_unit_conversions
  for each row execute function private.stale_on_change();

-- -----------------------------------------------------------------------------
-- Editor RPCs. Saving always clears verification; verifying needs provenance.
-- -----------------------------------------------------------------------------
create or replace function private.require_editor()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_editor() then
    raise exception 'only editors manage nutrition' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;
revoke all on function private.require_editor() from public, anon, authenticated;

-- p_food is the Edge Function's canonical food, or NULL with p_status 'UNAVAILABLE'.
create or replace function public.save_ingredient_nutrition(p_ingredient_id uuid, p_food jsonb, p_status text default 'CANDIDATE')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb := coalesce(p_food -> 'nutrients', '{}'::jsonb);
  v_basis text := p_food ->> 'basis';
begin
  perform private.require_editor();
  if p_status not in ('CANDIDATE', 'NEEDS_REVIEW', 'UNAVAILABLE', 'UNMAPPED') then
    raise exception 'unknown mapping status %', p_status using errcode = '22023';
  end if;
  if p_status in ('CANDIDATE', 'NEEDS_REVIEW')
     and (p_food is null or p_food ->> 'provider' is distinct from 'usda' or coalesce(p_food ->> 'externalId', '') = '') then
    raise exception 'a USDA food with its id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ingredients i where i.id = p_ingredient_id) then
    raise exception 'ingredient % not found', p_ingredient_id using errcode = 'P0002';
  end if;

  insert into public.ingredient_nutrition as t (
    ingredient_id, basis, energy_kcal, protein_g, fat_g, carbs_g, sodium_mg, saturated_fat_g, fiber_g, sugar_g,
    provider, external_id, description, data_type, preparation_state, source_version, retrieved_at, mapping_status)
  select p_ingredient_id,
         case when p_status in ('UNAVAILABLE', 'UNMAPPED') then null else v_basis end,
         x.energy_kcal, x.protein_g, x.fat_g, x.carbs_g, x.sodium_mg, x.saturated_fat_g, x.fiber_g, x.sugar_g,
         case when p_food is null then null else 'usda' end, p_food ->> 'externalId', p_food ->> 'description',
         p_food ->> 'dataType', p_food ->> 'preparationState', p_food ->> 'sourceVersion',
         (p_food ->> 'retrievedAt')::timestamptz, p_status
  from (
    select case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'energyKcal')::numeric end as energy_kcal,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'proteinG')::numeric end as protein_g,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'fatG')::numeric end as fat_g,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'carbsG')::numeric end as carbs_g,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'sodiumMg')::numeric end as sodium_mg,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'saturatedFatG')::numeric end as saturated_fat_g,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'fiberG')::numeric end as fiber_g,
           case when v_basis is null or p_status in ('UNAVAILABLE', 'UNMAPPED') then null else (n ->> 'sugarG')::numeric end as sugar_g
  ) x
  on conflict (ingredient_id) do update set
    basis = excluded.basis, energy_kcal = excluded.energy_kcal, protein_g = excluded.protein_g, fat_g = excluded.fat_g,
    carbs_g = excluded.carbs_g, sodium_mg = excluded.sodium_mg, saturated_fat_g = excluded.saturated_fat_g,
    fiber_g = excluded.fiber_g, sugar_g = excluded.sugar_g, provider = excluded.provider, external_id = excluded.external_id,
    description = excluded.description, data_type = excluded.data_type, preparation_state = excluded.preparation_state,
    source_version = excluded.source_version, retrieved_at = excluded.retrieved_at,
    mapping_status = excluded.mapping_status, verified_by = null, verified_at = null;

  perform private.audit('nutrition.mapping_save', 'ingredients', p_ingredient_id, null,
                        jsonb_build_object('status', p_status, 'external_id', p_food ->> 'externalId'));
  return p_status;
end;
$$;

create or replace function public.verify_ingredient_nutrition(p_ingredient_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_editor();
begin
  update public.ingredient_nutrition
     set mapping_status = 'VERIFIED', verified_by = v_actor, verified_at = now()
   where ingredient_id = p_ingredient_id
     and mapping_status in ('CANDIDATE', 'NEEDS_REVIEW')
     and basis is not null and provider is not null and external_id is not null;
  if not found then
    raise exception 'only a mapped USDA food with a per-100 g basis can be verified' using errcode = '22023';
  end if;
  perform private.audit('nutrition.mapping_verify', 'ingredients', p_ingredient_id, null, '{}'::jsonb);
  return 'VERIFIED';
end;
$$;

create or replace function public.save_unit_conversion(
  p_ingredient_id uuid, p_unit text, p_grams numeric, p_source text, p_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_editor();
  insert into public.nutrition_unit_conversions as t (ingredient_id, unit, grams_per_unit, source, method)
  values (p_ingredient_id, lower(btrim(p_unit)), p_grams, nullif(btrim(p_source), ''), nullif(btrim(p_method), ''))
  on conflict (ingredient_id, unit) do update set
    grams_per_unit = excluded.grams_per_unit, source = excluded.source, method = excluded.method,
    verified_by = null, verified_at = null
  returning id into v_id;
  perform private.audit('nutrition.conversion_save', 'nutrition_unit_conversions', v_id, null,
                        jsonb_build_object('unit', lower(btrim(p_unit)), 'grams_per_unit', p_grams, 'ingredient_id', p_ingredient_id));
  return v_id;
end;
$$;

create or replace function public.verify_unit_conversion(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_editor();
begin
  update public.nutrition_unit_conversions
     set verified_by = v_actor, verified_at = now()
   where id = p_id and verified_at is null and source is not null and method is not null;
  if not found then
    raise exception 'only an unverified conversion with a source and a method can be verified' using errcode = '22023';
  end if;
  perform private.audit('nutrition.conversion_verify', 'nutrition_unit_conversions', p_id, null, '{}'::jsonb);
  return 'VERIFIED';
end;
$$;

-- Stores a fresh result; it is never VERIFIED here.
create or replace function public.calculate_recipe_nutrition(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_editor();
  if not exists (select 1 from public.recipes x where x.id = p_recipe_id) then
    raise exception 'recipe % not found', p_recipe_id using errcode = 'P0002';
  end if;
  r := private.compute_recipe_nutrition(p_recipe_id);
  insert into public.recipe_nutrition as t
    (recipe_id, calculation_version, status, totals, per_serving, completeness, reason_codes, breakdown, excluded_optional, calculated_at)
  values (p_recipe_id, '2.0.0', r ->> 'status', r -> 'totals', r -> 'per_serving', (r ->> 'completeness')::numeric,
          array(select jsonb_array_elements_text(r -> 'reason_codes')), r -> 'breakdown',
          array(select (jsonb_array_elements_text(r -> 'excluded_optional'))::uuid), now())
  on conflict (recipe_id) do update set
    calculation_version = excluded.calculation_version, status = excluded.status, totals = excluded.totals,
    per_serving = excluded.per_serving, completeness = excluded.completeness, reason_codes = excluded.reason_codes,
    breakdown = excluded.breakdown, excluded_optional = excluded.excluded_optional, calculated_at = now(),
    verified_by = null, verified_at = null;
  return r;
end;
$$;

-- Recomputes from current inputs and verifies only a complete, unchanged result.
create or replace function public.verify_recipe_nutrition(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := private.require_editor();
  v_stored public.recipe_nutrition%rowtype;
  r        jsonb;
begin
  select * into v_stored from public.recipe_nutrition n where n.recipe_id = p_recipe_id for update;
  if not found then
    raise exception 'calculate the nutrition first' using errcode = '22023';
  end if;
  r := private.compute_recipe_nutrition(p_recipe_id);
  if v_stored.status <> 'CALCULATED' then
    raise exception 'only a CALCULATED result can be verified (now %)', v_stored.status using errcode = '22023';
  end if;
  if v_stored.calculation_version <> '2.0.0' or r ->> 'status' <> 'CALCULATED'
     or v_stored.totals <> r -> 'totals' or v_stored.per_serving is distinct from r -> 'per_serving' then
    raise exception 'the result no longer matches its inputs; calculate again' using errcode = '22023',
      detail = (r -> 'reason_codes')::text;
  end if;
  update public.recipe_nutrition set status = 'VERIFIED', verified_by = v_actor, verified_at = now() where recipe_id = p_recipe_id;
  perform private.audit('nutrition.recipe_verify', 'recipes', p_recipe_id, null, jsonb_build_object('totals', r -> 'totals'));
  return 'VERIFIED';
end;
$$;

revoke all on function public.save_ingredient_nutrition(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.verify_ingredient_nutrition(uuid) from public, anon, authenticated;
revoke all on function public.save_unit_conversion(uuid, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.verify_unit_conversion(uuid) from public, anon, authenticated;
revoke all on function public.calculate_recipe_nutrition(uuid) from public, anon, authenticated;
revoke all on function public.verify_recipe_nutrition(uuid) from public, anon, authenticated;
grant execute on function public.save_ingredient_nutrition(uuid, jsonb, text) to authenticated;
grant execute on function public.verify_ingredient_nutrition(uuid) to authenticated;
grant execute on function public.save_unit_conversion(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.verify_unit_conversion(uuid) to authenticated;
grant execute on function public.calculate_recipe_nutrition(uuid) to authenticated;
grant execute on function public.verify_recipe_nutrition(uuid) to authenticated;
