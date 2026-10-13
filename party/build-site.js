// Copy the playable site into .site/ — the folder the Worker serves as static
// assets (wrangler.jsonc → assets.directory).
//
// Why: the repo root also holds node_modules, the playtest results and the
// archived training data (about a gigabyte), which must not be uploaded and
// which `wrangler dev` cannot watch. Only the pages and what they load are
// copied: the HTML pages, the browser scripts, design/, the engine modules
// (engine.browser.js for the game, the ES modules dashboard.js imports), the
// vendored PartySocket and the design-system page in docs/.
//
// wrangler.jsonc runs this before every `wrangler dev` and `wrangler deploy`
// (build.command), so nobody runs it by hand.
//
//   node party/build-site.js

import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.site');

// Root-level tooling that is not part of the site.
const NOT_SITE = new Set(['eslint.config.js', 'playwright.config.js']);

const SITE = [
  // Pages and the classic/ES-module browser scripts next to them.
  ...readdirSync(root).filter(f => /\.(html|js)$/.test(f) && !NOT_SITE.has(f)),
  'design',
  'online',
  ...readdirSync(join(root, 'engine'))
    .filter(f => f.endsWith('.js') && !/^(test|build)-/.test(f))
    .map(f => `engine/${f}`),
  ...readdirSync(join(root, 'docs')).filter(f => f.endsWith('.html')).map(f => `docs/${f}`),
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const rel of SITE) {
  const from = join(root, rel);
  const to = join(out, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: statSync(from).isDirectory() });
}
console.log(`build-site: copied ${SITE.length} entries to .site/`);
