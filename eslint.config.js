// Minimal ESLint config — correctness rules only, no style enforcement.
//
// The codebase has two very different runtimes:
//   1. Browser classic scripts (game.js, effects.js, online-mode.js) loaded
//      via plain <script> tags — everything is global scope, so `no-undef`
//      is the main defense against typo'd identifiers silently becoming
//      runtime errors.
//   2. Node ES modules (engine/, sim/, analysis/, party/).
//
// Run with: npm run lint

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  URLSearchParams: 'readonly',
  WebSocket: 'readonly',
  CustomEvent: 'readonly',
  fetch: 'readonly',
  // Cross-file globals: the three classic scripts share one global scope at
  // runtime (index.html loads online-mode.js, effects.js, then game.js).
  renderGameBoard: 'readonly', // defined in game.js, called by online-mode.js
};

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  structuredClone: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  Date: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-unreachable': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  eqeqeq: 'warn',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'results/**',
      'docs/**',
      'online/vendor/**', // vendored third-party library
      'engine/data.js',   // auto-generated from game.js
      '.partykit/**',
      '.claude/**',
    ],
  },
  {
    // Browser classic scripts — global scope, no modules.
    files: ['game.js', 'effects.js', 'online-mode.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules,
  },
  {
    // Node ES modules: engine, sim, analysis, PartyKit server.
    files: ['engine/**/*.js', 'sim/**/*.js', 'analysis/**/*.js', 'party/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules,
  },
];
