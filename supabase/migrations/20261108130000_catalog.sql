-- =============================================================================
-- 0001_catalog: recipe catalog (SCHEMA_V2.md §1, §3, §6)
--
-- Read-only for clients: anon and authenticated may SELECT published content.
-- No client write path exists in Phase 0; data is loaded by the seed script
-- (service role). Editor write access arrives in Phase 4 through RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- C8: tables and functions created later by this role are not opened to the
-- Data API roles by default. Every migration grants explicitly.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- C6: private schema for helpers (not exposed by the Data API).
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- C3: shared updated_at trigger.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.recipe_sources (
  id               uuid primary key default gen_random_uuid(),
  source_key       text not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 300),
  compiler         text,
  publishers       text[] not null default '{}',
  publication_year int check (publication_year between 1800 and 2100),
  usage_note       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9_-]+$'),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.ingredients (
  id           uuid primary key default gen_random_uuid(),
  source_key   text unique,
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         text not null unique check (char_length(btrim(name)) between 1 and 150),
  aliases      text[] not null default '{}',
  common_units text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.recipes (
  id                   uuid primary key default gen_random_uuid(),
  source_key           text unique,
  source_id            uuid references public.recipe_sources (id) on delete restrict,
  source_recipe_number int check (source_recipe_number > 0),
  source_page          int check (source_page > 0),
  slug                 text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                 text not null check (char_length(btrim(name)) between 1 and 200),
  description          text,
  category_id          uuid references public.categories (id) on delete restrict,
  difficulty           text check (difficulty in ('easy', 'medium', 'hard')),
  default_servings     int check (default_servings > 0),
  serving_basis        text check (serving_basis in ('book', 'editor_estimate', 'inferred_yield')),
  serving_note         text,
  prep_time_minutes    int check (prep_time_minutes >= 0),
  cook_time_minutes    int check (cook_time_minutes >= 0),
  cover_image_path     text check (cover_image_path <> ''),
  status               text not null default 'draft'
                       check (status in ('draft', 'staged', 'published', 'archived')),
  review_issues        text[] not null default '{}',
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint recipes_published_complete check (
    status <> 'published'
    or (category_id is not null and default_servings is not null and published_at is not null)
  )
);
create index recipes_status_category_idx on public.recipes (status, category_id);
create index recipes_category_id_idx on public.recipes (category_id);
create index recipes_source_id_idx on public.recipes (source_id);

create table public.recipe_ingredients (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references public.recipes (id) on delete cascade,
  ingredient_id    uuid not null references public.ingredients (id) on delete restrict,
  sort_order       int not null check (sort_order > 0),
  quantity         numeric(10, 3) check (quantity > 0),
  unit             text check (unit <> ''),
  quantity_basis   text not null check (quantity_basis in ('book', 'editor_estimate', 'to_taste')),
  preparation_note text,
  quantity_note    text,
  is_optional      boolean not null default false,
  unique (recipe_id, sort_order),
  -- C5: "to taste" is always NULL, never 0.
  constraint recipe_ingredients_to_taste_is_null
    check ((quantity is null) = (quantity_basis = 'to_taste'))
);
create index recipe_ingredients_ingredient_id_idx on public.recipe_ingredients (ingredient_id);

create table public.recipe_steps (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references public.recipes (id) on delete cascade,
  step_number      int not null check (step_number > 0),
  instruction      text not null check (char_length(btrim(instruction)) > 0),
  duration_seconds int check (duration_seconds > 0),
  duration_basis   text check (duration_basis in ('book', 'editor_estimate')),
  timer_enabled    boolean not null default false,
  unique (recipe_id, step_number),
  constraint recipe_steps_timer_needs_duration
    check (not timer_enabled or duration_seconds is not null)
);

create table public.diets (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9_-]+$'),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.recipe_diets (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  diet_id   uuid not null references public.diets (id) on delete cascade,
  primary key (recipe_id, diet_id)
);
create index recipe_diets_diet_id_idx on public.recipe_diets (diet_id);

-- updated_at triggers
create trigger set_updated_at before update on public.recipe_sources
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.ingredients
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.recipes
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.diets
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges (C8) and RLS (C9)
-- -----------------------------------------------------------------------------
revoke all on public.recipe_sources, public.categories, public.ingredients, public.recipes,
  public.recipe_ingredients, public.recipe_steps, public.diets, public.recipe_diets
  from anon, authenticated;

grant select on public.recipe_sources, public.categories, public.ingredients, public.recipes,
  public.recipe_ingredients, public.recipe_steps, public.diets, public.recipe_diets
  to anon, authenticated;

alter table public.recipe_sources     enable row level security;
alter table public.categories         enable row level security;
alter table public.ingredients        enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps       enable row level security;
alter table public.diets              enable row level security;
alter table public.recipe_diets       enable row level security;

-- Taxonomy and source attribution: public.
create policy "Public read" on public.recipe_sources for select to anon, authenticated using (true);
create policy "Public read" on public.categories     for select to anon, authenticated using (true);
create policy "Public read" on public.ingredients    for select to anon, authenticated using (true);
create policy "Public read" on public.diets          for select to anon, authenticated using (true);

-- Recipes and their children: published only.
create policy "Public read published" on public.recipes
  for select to anon, authenticated
  using (status = 'published');

create policy "Public read of published recipes" on public.recipe_ingredients
  for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published'));

create policy "Public read of published recipes" on public.recipe_steps
  for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published'));

create policy "Public read of published recipes" on public.recipe_diets
  for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published'));

-- -----------------------------------------------------------------------------
-- Storage: recipe-images (public read by URL). No client policies on
-- storage.objects: only the seed script (service role) writes in Phase 0.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
