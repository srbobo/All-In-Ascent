// Generate engine/helpers.browser.js from engine/helpers.js.
//
// The reverse direction of build-data.js. Local hot-seat play (game.js) is a
// classic <script> that also has to work when index.html is opened straight
// from disk (file://), where ES module imports are blocked — so game.js cannot
// `import` engine/helpers.js. Rather than re-implementing the engine's climb
// formulas (gear effectKinds, dice, costs, XP) in game.js, this script wraps
// helpers.js verbatim in a classic-script IIFE and exposes its exports as
// `window.EngineHelpers`. index.html loads it before game.js.
//
// The only import helpers.js has is the game data from ./data.js, which is
// itself generated from game.js. In the browser those names are game.js's own
// top-level consts; the helper functions only read them at call time, by
// which point game.js has loaded, so they resolve to the same data.
//
//   node engine/build-browser-helpers.js          # regenerate helpers.browser.js
//   node engine/build-browser-helpers.js --check  # exit 1 if it is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, 'helpers.js');
const outPath = join(here, 'helpers.browser.js');

// Data names game.js declares at top level (its GAME DATA section). Any import
// from data.js outside this list would be undefined in the browser.
const BROWSER_DATA_GLOBALS = ['CHARACTERS', 'XP_TABLE', 'TRAINING_AREAS', 'ROUTES', 'GEAR_SHOP'];

function generate() {
  const src = readFileSync(srcPath, 'utf8');

  const importRe = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$/gm;
  const imports = [...src.matchAll(importRe)];
  for (const [line, names, from] of imports) {
    if (from !== './data.js') {
      throw new Error(`helpers.js imports from ${from}; only ./data.js can be bridged to the browser (${line.trim()})`);
    }
    for (const name of names.split(',').map(n => n.trim()).filter(Boolean)) {
      if (!BROWSER_DATA_GLOBALS.includes(name)) {
        throw new Error(`helpers.js imports ${name} from data.js, which game.js does not declare as a global`);
      }
    }
  }
  if (/^\s*import\b/m.test(src.replace(importRe, ''))) {
    throw new Error('helpers.js has an import this script cannot parse');
  }

  const body = src
    .replace(importRe, '')
    .replace(/^export (function|const) /gm, '$1 ');
  if (/^export\b/m.test(body)) {
    throw new Error('helpers.js has an export form this script cannot convert (only `export function` / `export const`)');
  }

  const exportNames = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map(m => m[1]);

  const header =
`// AUTO-GENERATED FROM engine/helpers.js — DO NOT EDIT BY HAND.
//
// Regenerate with: node engine/build-browser-helpers.js
// A classic-script copy of the engine helpers so local play (game.js) runs the
// exact same climb rules as the engine, even from file://. Exposes
// window.EngineHelpers. Game data (${BROWSER_DATA_GLOBALS.join(', ')}) comes from
// game.js's globals, which must be loaded before any helper is called.
/* eslint-disable */
`;

  return header +
    'window.EngineHelpers = (function () {\n' +
    "'use strict';\n" +
    body.replace(/^\s+|\s+$/g, '') + '\n\n' +
    `return { ${exportNames.join(', ')} };\n` +
    '})();\n';
}

const generated = generate();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    // missing file — treat as stale
  }
  if (current !== generated) {
    console.error(
      'engine/helpers.browser.js is STALE. Run `node engine/build-browser-helpers.js` ' +
      'to regenerate it from engine/helpers.js, then commit the result.'
    );
    process.exit(1);
  }
  console.log('engine/helpers.browser.js is up to date with engine/helpers.js.');
} else {
  writeFileSync(outPath, generated);
  console.log(`wrote engine/helpers.browser.js from engine/helpers.js (${generated.length} bytes).`);
}
