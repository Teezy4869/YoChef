#!/usr/bin/env node
// Supabase CLI pinned to the v2 project: `node scripts/sb.mjs db push` runs
// `supabase db push --linked --project-ref <v2>`. The ref is passed explicitly,
// so a stale or changed `supabase link` can never redirect a push to another project.
import { spawnSync } from 'node:child_process';

import { V2_REF } from './lib/v2.mjs';

const args = ['supabase', ...process.argv.slice(2), '--linked', '--project-ref', V2_REF];
// Windows needs a shell to run npx.cmd; every argument here is a fixed word or a repo path.
const r = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
