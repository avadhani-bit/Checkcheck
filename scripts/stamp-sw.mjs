#!/usr/bin/env node
/* ================================================================
   stamp-sw.mjs — keeps the service worker's cache name honest.

   THE PROBLEM THIS EXISTS TO PREVENT
   sw.js precaches index.html, the CSS and the JS. A browser only
   fetches new copies when the service worker file itself changes,
   which in practice means when CACHE changes. Edit app.js, forget to
   bump CACHE, and returning visitors keep running the old code — with
   no error anywhere, and a hard reload does not help, because the
   service worker answers before the network is consulted.

   That is not a hypothetical: it shipped exactly once, silently, and
   cost an afternoon of "the web app didn't update".

   THE FIX
   Derive the cache name from the CONTENT of the precached files. Same
   files, same name, no churn. Any change to any of them produces a new
   name automatically, so the browser refreshes. Nothing to remember.

   Runs as part of `npm run build:www`, which `npm run sync` calls, so
   it happens in the normal flow. Safe to run by hand any time.
================================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(ROOT, 'sw.js');

const src = readFileSync(SW, 'utf8');

// Read the precache list out of the worker itself, so the two can never
// disagree about which files matter.
const listMatch = src.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!listMatch) {
  console.error('stamp-sw: could not find the PRECACHE array in sw.js');
  process.exit(1);
}
const files = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));

const hash = createHash('sha1');
let missing = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) {
    console.warn(`  stamp-sw: precached file not found: ${rel}`);
    missing++;
    continue;
  }
  hash.update(rel);
  hash.update(readFileSync(abs));
}
// The worker's own logic counts too — a change to the fetch handler
// should also invalidate.
hash.update(src.replace(/const CACHE = '[^']*';/, ''));

const stamp = hash.digest('hex').slice(0, 10);
const next = `const CACHE = 'checkcheck-${stamp}';`;
const current = src.match(/const CACHE = '[^']*';/)?.[0];

if (current === next) {
  console.log(`  sw cache unchanged (${stamp})`);
} else {
  writeFileSync(SW, src.replace(/const CACHE = '[^']*';/, next), 'utf8');
  console.log(`  sw cache stamped ${stamp}  <- precached files changed, browsers will refresh`);
}

if (missing) {
  console.warn(`  stamp-sw: ${missing} precached file(s) missing — check the PRECACHE list`);
  process.exit(1);
}
