// Generate engine/data.js from the GAME DATA section of game.js.
//
// game.js is the SOURCE OF TRUTH for all game data (it is the browser bundle
// and is loaded directly via a classic <script> tag, so it cannot itself
// `import` an ES module — local play runs from file://, where module imports
// are blocked by CORS). To avoid hand-syncing the same data into the Node
// engine, this script lifts the data blocks out of game.js verbatim and
// re-exports them as an ES module that the engine / sim / analysis code can
// import. Run it whenever game.js's data changes; it is wired into the
// `test:engine` and `playtest` npm scripts so Node consumers never read stale
// data.
//
//   node engine/build-data.js          # regenerate engine/data.js
//   node engine/build-data.js --check  # exit 1 if engine/data.js is stale
//
// The extracted region is everything between the "GAME DATA" and "GAME STATE"
// section markers in game.js. Top-level `const` declarations in that region
// become `export const` so Node can import them by name.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const gameJsPath = join(here, '..', 'game.js');
const dataJsPath = join(here, 'data.js');

const START_MARKER = '// ===== GAME DATA =====';
const END_MARKER = '// ===== GAME STATE =====';

function extractDataModule() {
  const src = readFileSync(gameJsPath, 'utf8');
  const startIdx = src.indexOf(START_MARKER);
  const endIdx = src.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `could not locate GAME DATA section in game.js ` +
      `(start=${startIdx}, end=${endIdx}). Section markers may have changed.`
    );
  }

  // Region strictly between the two markers (exclusive of both).
  const region = src
    .slice(startIdx + START_MARKER.length, endIdx)
    .replace(/^\s+|\s+$/g, '');

  // Promote each top-level `const NAME = ...` to a named export.
  const exported = region.replace(/^const /gm, 'export const ');

  const exportNames = [...exported.matchAll(/^export const (\w+)/gm)].map(m => m[1]);
  if (!exportNames.length) {
    throw new Error('no top-level const declarations found in the GAME DATA section');
  }

  const header =
`// AUTO-GENERATED FROM game.js — DO NOT EDIT BY HAND.
//
// Regenerate with: node engine/build-data.js
// game.js is the single source of truth for game data; this module mirrors
// its GAME DATA section so the Node engine, simulation harness, and analysis
// scripts can import the values. Edits here will be overwritten.
//
// Exports: ${exportNames.join(', ')}.

`;

  return header + exported + '\n';
}

const generated = extractDataModule();
const checkMode = process.argv.includes('--check');

if (checkMode) {
  let current = '';
  try {
    current = readFileSync(dataJsPath, 'utf8');
  } catch {
    // missing file — treat as stale
  }
  if (current !== generated) {
    console.error(
      'engine/data.js is STALE. Run `node engine/build-data.js` to regenerate ' +
      'it from game.js, then commit the result.'
    );
    process.exit(1);
  }
  console.log('engine/data.js is up to date with game.js.');
} else {
  writeFileSync(dataJsPath, generated);
  console.log(`wrote engine/data.js from game.js (${generated.length} bytes).`);
}
