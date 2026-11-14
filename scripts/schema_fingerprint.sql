-- Schema fingerprint of everything the YoChef migrations own, as one JSON row.
-- Run on PGlite (built from supabase/migrations) and on v2, then compared by
-- scripts/db_verify.mjs. Read-only. Covers schemas public and private, the
-- trigger on auth.users, storage buckets and storage.objects policies.
with
  rel as (
    select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relacl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm', 'p')
  ),
  client as (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated')),
  fn as (
    select p.oid, n.nspname, p.proname, p.proacl, p.proowner,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
  )
select jsonb_build_object(
  'tables', (select coalesce(jsonb_agg(format('%s.%s kind=%s rls=%s', nspname, relname, relkind, relrowsecurity)
               order by nspname, relname), '[]') from rel),
  'columns', (select coalesce(jsonb_agg(format('%s.%s.%s %s%s%s', r.nspname, r.relname, a.attname,
               format_type(a.atttypid, a.atttypmod), case when a.attnotnull then ' not null' else '' end,
               coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
               order by r.nspname, r.relname, a.attnum), '[]')
             from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
             left join pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum),
  'constraints', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s.%s %s: %s', r.nspname, r.relname, con.conname, pg_get_constraintdef(con.oid)) x
               from rel r join pg_constraint con on con.conrelid = r.oid) s),
  'indexes', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select pg_get_indexdef(i.indexrelid) x from rel r join pg_index i on i.indrelid = r.oid) s),
  'policies', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s.%s "%s" %s %s to %s using (%s) check (%s)', schemaname, tablename, policyname,
                             permissive, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')) x
               from pg_policies
               where schemaname in ('public', 'private') or (schemaname = 'storage' and tablename = 'objects')) s),
  'table_grants', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s %s.%s %s', cl.rolname, r.nspname, r.relname, a.privilege_type) x
               from rel r cross join lateral aclexplode(r.relacl) a join client cl on cl.oid = a.grantee) s),
  'column_grants', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s %s.%s.%s %s', cl.rolname, r.nspname, r.relname, att.attname, a.privilege_type) x
               from rel r join pg_attribute att on att.attrelid = r.oid and att.attnum > 0 and not att.attisdropped
               cross join lateral aclexplode(att.attacl) a join client cl on cl.oid = a.grantee) s),
  'functions', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s.%s(%s) returns %s %s volatility=%s config=%s src_md5=%s', f.nspname, f.proname, f.args,
                             pg_get_function_result(f.oid), case when p.prosecdef then 'definer' else 'invoker' end,
                             p.provolatile, coalesce(array_to_string(p.proconfig, ','), '-'), md5(p.prosrc)) x
               from fn f join pg_proc p on p.oid = f.oid) s),
  'function_grants', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s %s.%s(%s) %s', coalesce(cl.rolname, 'PUBLIC'), f.nspname, f.proname, f.args, a.privilege_type) x
               from fn f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
               left join client cl on cl.oid = a.grantee
               where a.grantee = 0 or cl.oid is not null) s),
  'triggers', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select pg_get_triggerdef(t.oid) x from pg_trigger t
               where not t.tgisinternal and (t.tgrelid in (select oid from rel) or t.tgrelid = 'auth.users'::regclass)) s),
  'enums', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s.%s: %s', n.nspname, t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)) x
               from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid
               where n.nspname in ('public', 'private') group by n.nspname, t.typname) s),
  'schema_grants', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s %s %s', cl.rolname, n.nspname, a.privilege_type) x
               from pg_namespace n cross join lateral aclexplode(n.nspacl) a join client cl on cl.oid = a.grantee
               where n.nspname = 'private') s),
  'buckets', (select coalesce(jsonb_agg(x order by x), '[]') from (
               select format('%s public=%s limit=%s mime=%s', id, public, file_size_limit, allowed_mime_types::text) x
               from storage.buckets) s)
) as fingerprint;
