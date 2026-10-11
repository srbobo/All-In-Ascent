// Generate engine/engine.browser.js — the whole rules engine as one classic
// <script> for the browser.
//
// Why: local hot-seat play (game.js) must follow exactly the same rules as
// online play and the bots, which run the Node engine (engine/*.js). game.js
// is a classic script that also has to work when index.html is opened straight
// from disk (file://), where ES module imports are blocked, so it cannot
// `import` the engine. Instead this script bundles the engine modules verbatim
// into one classic script that exposes `window.AscentEngine`; index.html loads
// it right after game.js and local play drives createGame / getLegalActions /
// applyAction through it. There is no second copy of any rule.
//
// How: each module's source is wrapped in its own function scope. `import`
// lines become destructuring from modules evaluated earlier; `export`
// keywords are dropped and the module returns its exports. Imports from
// ./data.js resolve to game.js's GAME DATA globals (engine/data.js is itself
// generated from that section), so the browser holds one copy of the data.
//
//   node engine/build-browser.js          # regenerate engine/engine.browser.js
//   node engine/build-browser.js --check  # exit 1 if it is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, 'engine.browser.js');

// Bundled modules in dependency order (each may import only from earlier ones
// or from ./data.js).
const MODULES = ['rng.js', 'telemetry.js', 'version.js', 'helpers.js', 'state.js', 'engine.js'];

// Data names game.js declares at top level in its GAME DATA section.
const DATA_GLOBALS = ['CHARACTERS', 'XP_TABLE', 'TRAINING_AREAS', 'ROUTES', 'GEAR_SHOP'];

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*$/gm;
const moduleVar = (file) => `__${file.replace(/\.js$/, '')}`;

// `a, b as c` → [['a', 'a'], ['b', 'c']]
function parseNames(list) {
  return list.split(',').map(s => s.trim()).filter(Boolean).map(spec => {
    const m = spec.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
    if (!m) throw new Error(`cannot parse import/export specifier "${spec}"`);
    return [m[1], m[2] || m[1]];
  });
}

function convertModule(file, available) {
  const src = readFileSync(join(here, file), 'utf8');

  const imports = [];
  for (const [line, names, from] of src.matchAll(IMPORT_RE)) {
    const spec = parseNames(names);
    if (from === './data.js') {
      for (const [name] of spec) {
        if (!DATA_GLOBALS.includes(name)) throw new Error(`${file} imports ${name} from data.js, which game.js does not declare`);
      }
      imports.push(`const { ${spec.map(([a, b]) => (a === b ? a : `${a}: ${b}`)).join(', ')} } = __data;`);
    } else {
      const dep = from.replace(/^\.\//, '');
      if (!available.has(dep)) throw new Error(`${file} imports ${from}, which is not bundled before it (${line.trim()})`);
      imports.push(`const { ${spec.map(([a, b]) => (a === b ? a : `${a}: ${b}`)).join(', ')} } = ${moduleVar(dep)};`);
    }
  }
  let body = src.replace(IMPORT_RE, '');
  if (/^\s*import\b/m.test(body)) throw new Error(`${file} has an import this script cannot convert`);

  const exportNames = [...body.matchAll(/^export (?:function|const) (\w+)/gm)].map(m => m[1]);
  body = body.replace(/^export (function|const) /gm, '$1 ');
  body = body.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_, names) => {
    for (const [local, exported] of parseNames(names)) {
      if (local !== exported) throw new Error(`${file}: renamed export "${local} as ${exported}" is not supported`);
      exportNames.push(local);
    }
    return '';
  });
  if (/^export\b/m.test(body)) throw new Error(`${file} has an export form this script cannot convert`);

  return {
    exportNames,
    code:
      `// ---- engine/${file} ----\n` +
      `const ${moduleVar(file)} = (function () {\n` +
      `'use strict';\n` +
      (imports.length ? imports.join('\n') + '\n' : '') +
      body.replace(/^\s+|\s+$/g, '') + '\n\n' +
      `return { ${exportNames.join(', ')} };\n` +
      '})();\n',
  };
}

function generate() {
  const available = new Set();
  const chunks = [];
  const flat = new Map(); // export name → module
  for (const file of MODULES) {
    const { code, exportNames } = convertModule(file, available);
    for (const name of exportNames) {
      if (flat.has(name)) throw new Error(`export "${name}" is defined in both ${flat.get(name)} and ${file}`);
      flat.set(name, file);
    }
    chunks.push(code);
    available.add(file);
  }

  const header =
`// AUTO-GENERATED FROM engine/{${MODULES.map(m => m.replace(/\.js$/, '')).join(',')}}.js — DO NOT EDIT BY HAND.
//
// Regenerate with: node engine/build-browser.js
// The rules engine as one classic script, so local play (game.js) runs the
// exact engine that online play and the bots use, even from file://.
// Load it AFTER game.js: engine data (${DATA_GLOBALS.join(', ')}) comes from
// game.js's GAME DATA globals. Exposes window.AscentEngine.
/* eslint-disable */
`;

  const flatExports = [...flat].map(([name, file]) => `  ${name}: ${moduleVar(file)}.${name},`).join('\n');
  return header +
    'window.AscentEngine = (function () {\n' +
    "'use strict';\n" +
    `const __data = { ${DATA_GLOBALS.join(', ')} };\n\n` +
    chunks.join('\n') +
    '\nreturn {\n' + flatExports + '\n};\n' +
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
      'engine/engine.browser.js is STALE. Run `node engine/build-browser.js` ' +
      'to regenerate it from engine/*.js, then commit the result.'
    );
    process.exit(1);
  }
  console.log('engine/engine.browser.js is up to date with engine/*.js.');
} else {
  writeFileSync(outPath, generated);
  console.log(`wrote engine/engine.browser.js from engine/*.js (${generated.length} bytes).`);
}
