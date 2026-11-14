-- =============================================================================
-- 3.2 shopping lists (SCHEMA_V2.md §5.2)
--
-- A list belongs to one user; its items are reached only through the list.
-- Clients can rename a list and edit item fields, but never move a list to
-- another user or an item to another list.
-- =============================================================================

create table public.shopping_lists (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null default 'Danh sách mua sắm'
                   check (char_length(btrim(name)) between 1 and 100),
  source_recipe_id uuid references public.recipes (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index shopping_lists_user_id_idx on public.shopping_lists (user_id, created_at);
create index shopping_lists_source_recipe_id_idx on public.shopping_lists (source_recipe_id);

create table public.shopping_list_items (
  id               uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists (id) on delete cascade,
  -- NULL: a typed-in item with no catalog ingredient.
  ingredient_id    uuid references public.ingredients (id) on delete set null,
  -- Snapshot of the name when added, so it survives catalog edits.
  label            text not null check (char_length(btrim(label)) between 1 and 100),
  -- NULL: unknown or "to taste" (C5), never 0.
  quantity         numeric check (quantity is null or quantity > 0),
  unit             text check (unit is null or char_length(btrim(unit)) between 1 and 50),
  note             text check (note is null or char_length(btrim(note)) between 1 and 200),
  is_checked       boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index shopping_list_items_list_idx on public.shopping_list_items (shopping_list_id, sort_order);
create index shopping_list_items_ingredient_id_idx on public.shopping_list_items (ingredient_id);

create trigger set_updated_at before update on public.shopping_lists
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.shopping_list_items
  for each row execute function private.set_updated_at();

revoke all on public.shopping_lists, public.shopping_list_items from anon, authenticated;
grant select, delete on public.shopping_lists, public.shopping_list_items to authenticated;
grant insert (user_id, name, source_recipe_id) on public.shopping_lists to authenticated;
grant update (name) on public.shopping_lists to authenticated;
grant insert (shopping_list_id, ingredient_id, label, quantity, unit, note, is_checked, sort_order)
  on public.shopping_list_items to authenticated;
grant update (label, quantity, unit, note, is_checked, sort_order) on public.shopping_list_items to authenticated;

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "Owner reads own lists" on public.shopping_lists
  for select to authenticated
  using (user_id = (select auth.uid()));

-- source_recipe_id is checked under the caller's RLS, so only a published recipe qualifies.
create policy "Owner creates own lists" on public.shopping_lists
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (source_recipe_id is null or exists (select 1 from public.recipes r where r.id = source_recipe_id))
  );

create policy "Owner renames own lists" on public.shopping_lists
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owner deletes own lists" on public.shopping_lists
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Items: every action requires the parent list to be the caller's.
create policy "Owner reads items of own lists" on public.shopping_list_items
  for select to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and l.user_id = (select auth.uid())));

create policy "Owner adds items to own lists" on public.shopping_list_items
  for insert to authenticated
  with check (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and l.user_id = (select auth.uid())));

create policy "Owner edits items of own lists" on public.shopping_list_items
  for update to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and l.user_id = (select auth.uid())));

create policy "Owner deletes items of own lists" on public.shopping_list_items
  for delete to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = shopping_list_id and l.user_id = (select auth.uid())));
