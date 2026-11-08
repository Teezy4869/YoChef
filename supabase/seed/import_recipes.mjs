#!/usr/bin/env node
// Builds the seed artefacts for the 250-recipe dataset (K4: data is seed, not
// migration). It never connects to a database and never reads .env.
//
//   node supabase/seed/import_recipes.mjs --zip <release_candidate.zip> [--out <dir>]
//
// Output (default supabase/.seed-out/, git-ignored):
//   seed.sql            idempotent upsert script (SCHEMA_V2.md §7)
//   recipe-images/      covers to upload, laid out as <slug>/cover.webp
//   import_report.json  zip sha256, counts, data warnings
//
// Apply to the linked project (owner approval required):
//   npx supabase db query --linked -f supabase/.seed-out/seed.sql
//   npx supabase storage cp -r supabase/.seed-out/recipe-images ss:///recipe-images --linked --content-type image/webp
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { EXPECTED, loadDataset } from './lib/dataset.mjs';
import { buildSeedSql } from './lib/seed_sql.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const expectedSha = readFileSync(join(here, 'dataset.sha256'), 'utf8').trim().split(/\s+/)[0];

const { values } = parseArgs({
  options: {
    zip: { type: 'string', default: process.env.YOCHEF_DATASET_ZIP },
    out: { type: 'string', default: join(here, '..', '.seed-out') },
  },
});
if (!values.zip) {
  console.error('Missing --zip <path to recipes_001_250_release_candidate.zip> (or YOCHEF_DATASET_ZIP).');
  process.exit(2);
}

const out = resolve(values.out);
const { sha256, doc, covers, warnings } = loadDataset(resolve(values.zip), expectedSha);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'seed.sql'), buildSeedSql(doc));
for (const c of covers) {
  const target = join(out, 'recipe-images', c.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, c.data);
}
const report = { zip_sha256: sha256, expected_counts: EXPECTED, warnings };
writeFileSync(join(out, 'import_report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`zip sha256 OK: ${sha256}`);
console.log(`seed.sql and ${covers.length} covers written to ${out}`);
console.log(`${warnings.length} data warning(s), see import_report.json`);
