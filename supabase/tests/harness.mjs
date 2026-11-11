// =============================================================================
// YoChef database test harness (PGlite, PostgreSQL 17 in WASM; no Docker,
// no network, never reads .env).
//
// Builds a fresh database from Supabase stubs + every file in
// supabase/migrations, in filename order: the same SQL `supabase db push` sends.
//
// What this proves: tables, constraints, RLS, grants, triggers and functions on
// a real PostgreSQL engine, with the anon/authenticated role switch PostgREST
// performs.
// What it does NOT prove: auth.*, storage.* are minimal stubs; PostgREST,
// GoTrue and the Storage server do not run. Those are covered by live smoke
// tests against the v2 project (K8, tier 3).
// =============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
export const migrationsDir = resolve(here, '..', 'migrations');

// Mirrors what a fresh Supabase project provides before any migration runs,
// including its permissive default privileges on the public schema.
const SUPABASE_STUBS = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create schema storage;
  create schema extensions;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
}

/** Fresh database with stubs and all migrations applied. */
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of listMigrations()) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }
  return db;
}

/**
 * Runs one statement as a Data API role (anon or authenticated) with an
 * optional JWT subject, inside a savepoint so a failure never aborts the
 * caller. Returns { rows, error }.
 */
export async function as(db, role, uid, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(uid ? { sub: uid, role } : { role }),
    ]);
    await db.exec(`set local role ${role}`);
    const res = await db.query(sql, params);
    await db.exec('commit');
    return { rows: res.rows, error: null };
  } catch (error) {
    await db.exec('rollback');
    return { rows: [], error };
  }
}

/** Owner-level statement (the migration role), returning rows. */
export async function admin(db, sql, params = []) {
  return (await db.query(sql, params)).rows;
}

/** Owner-level statement expected to fail; returns the error or null. */
export async function adminError(db, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query(sql, params);
    await db.exec('rollback');
    return null;
  } catch (error) {
    await db.exec('rollback');
    return error;
  }
}
