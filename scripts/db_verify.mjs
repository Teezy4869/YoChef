#!/usr/bin/env node
// Proves the live v2 schema is exactly what supabase/migrations builds.
//
//   npm run db:verify
//
// Builds a fresh PGlite database from the migrations (supabase/tests/harness.mjs),
// takes the same read-only fingerprint (scripts/schema_fingerprint.sql) on it and
// on v2 through the Supabase CLI, pinned to the v2 ref, and lists every difference.
// Needs a `supabase login` on this machine; never reads .env.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createDatabase, listMigrations } from '../supabase/tests/harness.mjs';

import { V2_REF } from './lib/v2.mjs';

const { values } = parseArgs({ options: { log: { type: 'string' } } });
const here = dirname(fileURLToPath(import.meta.url));
const sqlFile = join(here, 'schema_fingerprint.sql');

const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};
function finish(code) {
  if (values.log) {
    mkdirSync(dirname(values.log), { recursive: true });
    writeFileSync(values.log, lines.join('\n') + '\n');
  }
  process.exit(code);
}

/** The fingerprint object, wherever the CLI JSON wraps it. */
function findFingerprint(o) {
  if (!o || typeof o !== 'object') return null;
  if ('fingerprint' in o) return typeof o.fingerprint === 'string' ? JSON.parse(o.fingerprint) : o.fingerprint;
  for (const v of Object.values(o)) {
    const f = findFingerprint(v);
    if (f) return f;
  }
  return null;
}

log(`YoChef schema verify  ${new Date().toISOString()}  repo migrations vs v2 ${V2_REF}`);
log(`INFO  migrations in repo: ${listMigrations().length}`);

const db = await createDatabase();
const local = (await db.query(readFileSync(sqlFile, 'utf8'))).rows[0].fingerprint;
await db.close();

const cli = spawnSync(
  'npx',
  ['supabase', 'db', 'query', '--linked', '--project-ref', V2_REF, '-f', `"${sqlFile}"`, '--output-format', 'json'],
  { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 },
);
let remote = null;
try {
  remote = findFingerprint(JSON.parse(cli.stdout.slice(cli.stdout.search(/[[{]/))));
} catch {
  remote = null;
}
if (cli.status !== 0 || !remote) {
  log(`FAIL  could not read the v2 fingerprint (exit ${cli.status})`);
  log((cli.stdout || cli.stderr || '').split('\n').filter((l) => !/new version|recommend/i.test(l)).slice(0, 8).join('\n'));
  finish(2);
}

let differences = 0;
for (const section of Object.keys(local)) {
  const a = new Set(local[section]);
  const b = new Set(remote[section] ?? []);
  const onlyRepo = [...a].filter((x) => !b.has(x));
  const onlyV2 = [...b].filter((x) => !a.has(x));
  differences += onlyRepo.length + onlyV2.length;
  log(`${onlyRepo.length + onlyV2.length === 0 ? 'SAME' : 'DIFF'}  ${section}: ${a.size} in repo, ${b.size} on v2`);
  onlyRepo.forEach((x) => log(`      only in repo: ${x}`));
  onlyV2.forEach((x) => log(`      only on v2:   ${x}`));
}
log(differences === 0 ? 'SCHEMA MATCHES' : `${differences} DIFFERENCES`);
finish(differences === 0 ? 0 : 1);
