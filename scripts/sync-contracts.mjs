#!/usr/bin/env node
/**
 * sync-contracts.mjs
 *
 * Copies the frozen Zod contract source from `packages/contracts/src` into
 * `supabase/functions/_shared/contracts` so the Deno/Hono Edge Function and the
 * Node/SvelteKit frontend validate against the exact same schemas.
 *
 * Per the merge protocol (§7): the generated Edge Function schemas are NEVER
 * edited by hand. Edit the contract source and re-run `pnpm contracts:sync`.
 *
 * Deno needs explicit file extensions on relative imports, so we rewrite
 * `from './common'` -> `from './common.ts'`. `zod` stays a bare specifier and is
 * mapped to `npm:zod` by supabase/functions/api/deno.json.
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SRC = join(ROOT, 'packages', 'contracts', 'src');
const DEST = join(ROOT, 'supabase', 'functions', '_shared', 'contracts');

const BANNER = `// ============================================================================
// GENERATED FILE — DO NOT EDIT.
// Synced from packages/contracts/src by \`pnpm contracts:sync\`.
// Edit the contract SOURCE and re-run the sync; hand edits here will be lost.
// ============================================================================
`;

/** Add explicit .ts extensions to relative import/export specifiers for Deno. */
function fixRelativeImports(code) {
  return code.replace(/(\bfrom\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (match, pre, spec, post) => {
    if (/\.(ts|js|json)$/.test(spec)) return match;
    return `${pre}${spec}.ts${post}`;
  });
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`[sync-contracts] source not found: ${SRC}`);
    process.exit(1);
  }

  if (existsSync(DEST)) {
    await rm(DEST, { recursive: true, force: true });
  }
  await mkdir(DEST, { recursive: true });

  const entries = await readdir(SRC, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.ts'));

  for (const file of files) {
    const raw = await readFile(join(SRC, file.name), 'utf8');
    const out = BANNER + '\n' + fixRelativeImports(raw);
    await writeFile(join(DEST, file.name), out, 'utf8');
    console.log(`[sync-contracts] ${file.name}`);
  }

  console.log(`[sync-contracts] synced ${files.length} file(s) -> ${DEST}`);
}

main().catch((err) => {
  console.error('[sync-contracts] failed:', err);
  process.exit(1);
});
