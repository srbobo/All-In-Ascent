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
  // The rules engine, loaded after game.js as engine/engine.browser.js.
  AscentEngine: 'readonly',
  structuredClone: 'readonly',
  // Grit & Holds design system (design/*.js), loaded before game.js.
  AIAArt: 'readonly',
  AIACards: 'readonly',
  AIAIcons: 'readonly',
  getComputedStyle: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  module: 'readonly',
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
  Response: 'readonly', // PartyKit onRequest (Workers + Node 18+ global)
  Request: 'readonly',
  crypto: 'readonly',   // Web Crypto (Workers + Node 19+ global): randomUUID
  Buffer: 'readonly',
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
  // `x == null` / `x != null` deliberately match both null and undefined —
  // rewriting them to strict equality would change behavior, so ignore them.
  eqeqeq: ['warn', 'always', { null: 'ignore' }],
};

export default [
  {
    ignores: [
      'node_modules/**',
      'results/**',
      'docs/**',
      'online/vendor/**', // vendored third-party library
      'engine/data.js',   // auto-generated from game.js
      'engine/engine.browser.js', // auto-generated from engine/*.js
      '.partykit/**',
      '.claude/**',
      'test-results/**', // Playwright output
      'playwright-report/**',
    ],
  },
  {
    // Browser classic scripts — global scope, no modules.
    files: ['game.js', 'effects.js', 'online-mode.js', 'telemetry-client.js', 'design/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: {
      ...rules,
      // game.js's GAME DATA consts are read by engine/engine.browser.js (and
      // lifted into engine/data.js), not only by game.js itself.
      'no-unused-vars': ['warn', {
        args: 'none', caughtErrors: 'none',
        varsIgnorePattern: '^(CHARACTERS|XP_TABLE|TRAINING_AREAS|ROUTES|GEAR_SHOP)$',
      }],
    },
  },
  {
    // The telemetry dashboard: a browser ES module (served over http).
    files: ['dashboard.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...browserGlobals, URL: 'readonly', Blob: 'readonly', Node: 'readonly' },
    },
    rules,
  },
  {
    // Node ES modules: engine, sim, analysis, PartyKit server, tooling.
    files: ['engine/**/*.js', 'sim/**/*.js', 'analysis/**/*.js', 'party/**/*.js', 'playwright.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules,
  },
  {
    // End-to-end tests: Node modules whose page.evaluate() callbacks run in
    // the browser, against index.html's globals.
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...nodeGlobals,
        ...browserGlobals,
        getGameState: 'readonly',
        setGameState: 'readonly',
      },
    },
    rules,
  },
];
