// Copies shared/ into both apps.
//
// The two apps are independent npm projects with no workspace linking, so the
// only way they can share the TOTP algorithm and the symptom definitions is for
// the files to physically exist in both. Copying them from one canonical source
// keeps that from becoming two implementations that quietly diverge.
//
//   npm run sync:shared        copy
//   npm run sync:shared:check  fail if a copy is stale (use in CI)

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'shared');
const targets = [join(root, 'mobile', 'src', 'shared'), join(root, 'web', 'src', 'shared')];

const BANNER = `// GENERATED FILE — do not edit.
// Copied from shared/%NAME% by scripts/sync-shared.mjs. Edit the canonical file
// at the repo root and run \`npm run sync:shared\`.

`;

const checkOnly = process.argv.includes('--check');
const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
let stale = 0;

for (const target of targets) {
  if (!checkOnly) mkdirSync(target, { recursive: true });
  for (const name of files) {
    const contents = BANNER.replace('%NAME%', name) + readFileSync(join(src, name), 'utf8');
    const dest = join(target, name);
    const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;

    if (current === contents) continue;

    if (checkOnly) {
      stale++;
      console.error(`stale: ${dest.replace(root + '/', '')}`);
    } else {
      writeFileSync(dest, contents);
      console.log(`wrote ${dest.replace(root + '/', '')}`);
    }
  }
}

if (checkOnly) {
  if (stale > 0) {
    console.error(`\n${stale} shared file(s) out of date — run \`npm run sync:shared\``);
    process.exit(1);
  }
  console.log('shared files are in sync');
}
