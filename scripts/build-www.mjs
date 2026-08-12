#!/usr/bin/env node
/* ================================================================
   build-www.mjs — copies the web app from the repo root into www/
   ----------------------------------------------------------------
   Why this exists:
   Your web files live at the repo ROOT so GitHub Pages keeps serving
   them at the same URL. Capacitor needs a clean folder to bundle into
   the APK — if you pointed webDir at ".", Capacitor would try to pack
   node_modules and the whole android/ folder into your app.

   So: root = source of truth. www/ = disposable build output.
   Never edit anything inside www/. It gets wiped every run.

   Run it with:  npm run build:www
   Or together with a Capacitor sync:  npm run sync
================================================================ */

import { cp, rm, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = path.join(ROOT, 'www');

// Everything the app needs at runtime. Add to this list if you add
// a new top-level folder or file that the app loads in the browser.
const INCLUDE = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css',
  'js',
  'assets',
  'vendor',
];

// Explicitly never copied, even if nested inside an included folder.
const EXCLUDE_NAMES = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  'android',
  'www',
  'archive-v1',
]);

async function main() {
  // 1. Wipe the previous build so deleted files don't linger.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let copied = 0;

  for (const entry of INCLUDE) {
    const src = path.join(ROOT, entry);
    if (!existsSync(src)) {
      console.warn(`  skip (not found): ${entry}`);
      continue;
    }
    const dest = path.join(OUT, entry);
    await cp(src, dest, {
      recursive: true,
      filter: (s) => !EXCLUDE_NAMES.has(path.basename(s)),
    });
    const info = await stat(src);
    console.log(`  copied ${info.isDirectory() ? 'dir ' : 'file'}  ${entry}`);
    copied++;
  }

  // 2. Stamp a build id into index.html so you can prove on-device
  //    which build you're actually looking at. Open the app, check
  //    the console for "CheckCheck build ...".
  const indexPath = path.join(OUT, 'index.html');
  if (existsSync(indexPath)) {
    const stamp = new Date().toISOString();
    let html = await readFile(indexPath, 'utf8');
    html = html.replace(
      '</body>',
      `  <script>console.log('CheckCheck build ${stamp}');window.__CC_BUILD='${stamp}';</script>\n</body>`
    );
    await writeFile(indexPath, html, 'utf8');
    console.log(`  stamped build ${stamp}`);
  }

  console.log(`\nwww/ built from ${copied} source entries.`);
}

main().catch((err) => {
  console.error('build-www failed:', err);
  process.exit(1);
});
