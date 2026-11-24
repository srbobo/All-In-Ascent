// Tests for the learned value model (engine/value-model.js) and its hook into
// the planner (planner.js `value` option).
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
//
// The model must be a pure correction: with zero weights the planner plays
// exactly as before. Shipped weights (engine/value-weights.js) must match the
// current feature list, and a planner using them must stay a legal,
// game-finishing player.

import { createGame } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import { GRIT_RULES } from './helpers.js';
import { CHARACTERS } from './data.js';
import { createPlannerAgent } from './planner.js';
import { DEFAULT_PARAMS, explainTimeToFinish, timeToFinish } from './planner-model.js';
import {
  VALUE_FEATURES, VALUE_MODEL_SCHEMA, valueFeatures, valueResidual, valueTimeToFinish,
} from './value-model.js';
import { VALUE_WEIGHTS } from './value-weights.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}
const D = VALUE_FEATURES.length;
const H = 4;

// A model whose network and adapters are all zero.
const zero = {
  schema: VALUE_MODEL_SCHEMA, features: VALUE_FEATURES,
  mean: new Array(D).fill(0), std: new Array(D).fill(1),
  W1: Array.from({ length: H }, (_, j) => Array.from({ length: D }, (_, i) => ((i + j) % 3) - 1)),
  b1: new Array(H).fill(0.1), W2: new Array(H).fill(0), b2: 0, adapters: {},
};

// States from a real game, sampled along the way.
async function sampleStates(seed, keys, every = 7) {
  let { state } = createGame({ seed, characterKeys: keys, rules: GRIT_RULES });
  const bot = createPlannerAgent({ tuned: true, seed });
  const out = [];
  for (let i = 0; i < 3000 && !state.gameEnded; i++) {
    if (i % every === 0) out.push(state);
    const legal = getLegalActions(state);
    ({ state } = applyAction(state, legal[(await bot.chooseAction({ state, legalActions: legal })).actionIndex]));
  }
  return out;
}
const ctx = (s) => ({ milestoneRoutes: s.milestoneRoutes, rules: s.rules, market: s.availableGear.map(g => g.name) });

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
const states = await sampleStates(12, ['sprinter', 'routeReader']);
{
  let badLen = 0;
  let nonFinite = 0;
  for (const s of states) {
    for (const p of s.players) {
      const parts = explainTimeToFinish(p.character, ctx(s), DEFAULT_PARAMS, null);
      const f = valueFeatures(p.character, ctx(s), parts);
      if (f.length !== D) badLen++;
      if (!f.every(Number.isFinite)) nonFinite++;
    }
  }
  check(`features: one number per VALUE_FEATURES name (${D}) on ${states.length * 2} climbers`, badLen === 0, `${badLen} wrong length`);
  check('features: all finite', nonFinite === 0, `${nonFinite} with NaN/Infinity`);
  const c = states[3].players[0].character;
  const parts = explainTimeToFinish(c, ctx(states[3]), DEFAULT_PARAMS, null);
  check('features: the first is the planner estimate', valueFeatures(c, ctx(states[3]), parts)[0] === parts.total);
  check('features: timeNow can be overridden', valueFeatures(c, ctx(states[3]), parts, { timeNow: 7 })[VALUE_FEATURES.indexOf('timeNow')] === 7);
}

// ---------------------------------------------------------------------------
// A zero model is the planner
// ---------------------------------------------------------------------------
{
  let diff = 0;
  for (const s of states) {
    for (const p of s.players) {
      const a = timeToFinish(p.character, ctx(s), DEFAULT_PARAMS, null);
      const b = valueTimeToFinish(p.character, ctx(s), DEFAULT_PARAMS, null, zero);
      if (Math.abs(a - b) > 1e-9 && !(a < 0 && b === 0)) diff++;
    }
  }
  check('zero model: corrected estimate equals the planner estimate', diff === 0, `${diff} differ`);
  check('no model (null): the planner estimate', valueTimeToFinish(states[0].players[0].character, ctx(states[0]), DEFAULT_PARAMS, null, null)
    === timeToFinish(states[0].players[0].character, ctx(states[0]), DEFAULT_PARAMS, null));
}
async function playOut(seed, keys, value) {
  let { state } = createGame({ seed, characterKeys: keys, rules: GRIT_RULES });
  const bots = keys.map((_, i) => createPlannerAgent({ tuned: true, seed: seed + i, value }));
  let legalOnly = true;
  for (let i = 0; i < 6000 && !state.gameEnded; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await bots[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    if (!(actionIndex >= 0 && actionIndex < legal.length)) { legalOnly = false; break; }
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return { state, legalOnly };
}
{
  const a = await playOut(21, ['technician', 'ironLung'], null);
  const b = await playOut(21, ['technician', 'ironLung'], zero);
  check('zero model: the planner plays the identical game', JSON.stringify(a.state) === JSON.stringify(b.state));
}

// ---------------------------------------------------------------------------
// Adapters only apply to the characters they were trained for
// ---------------------------------------------------------------------------
{
  const w = { ...zero, adapters: { sprinter: { bias: 5, scale: 0.5 } } };
  const f = new Array(D).fill(0);
  f[0] = 10;
  check('adapter: bias + scale × estimate for its character', valueResidual(w, { key: 'sprinter' }, f) === 10);
  check('adapter: none for other characters (e.g. Project Mode climbers)', valueResidual(w, { key: 'custom-climber-1' }, f) === 0
    && valueResidual(w, { key: 'toString' }, f) === 0);
  const neg = { ...zero, b2: -1e6 };
  check('corrected estimate never goes below 0', valueTimeToFinish(states[0].players[0].character, ctx(states[0]), DEFAULT_PARAMS, null, neg) === 0);
}

// ---------------------------------------------------------------------------
// Shipped weights
// ---------------------------------------------------------------------------
if (VALUE_WEIGHTS === null) {
  check('no value model shipped (VALUE_WEIGHTS is null)', true);
} else {
  const w = VALUE_WEIGHTS;
  check('shipped weights: schema and the current feature list', w.schema === VALUE_MODEL_SCHEMA
    && JSON.stringify(w.features) === JSON.stringify(VALUE_FEATURES), 'retrain after changing VALUE_FEATURES');
  check('shipped weights: shapes', w.mean.length === D && w.std.length === D && w.W1.every(r => r.length === D)
    && w.W1.length === w.b1.length && w.W2.length === w.b1.length);
  check('shipped weights: adapters only for known characters', Object.keys(w.adapters).every(k => k in CHARACTERS));
  check('shipped weights: passed the arena', !!(w.meta && w.meta.arena && w.meta.arena.h2hLo > 0.5));
  let unfinished = '';
  let illegal = '';
  const keys = Object.keys(CHARACTERS);
  for (let i = 0; i < keys.length; i++) {
    const { state, legalOnly } = await playOut(300 + i, [keys[i]], w);
    if (!legalOnly) illegal ||= keys[i];
    if (!state.gameEnded) unfinished ||= `${keys[i]} (round ${state.round})`;
  }
  check('shipped weights: the learned planner only picks legal actions', !illegal, illegal);
  check('shipped weights: the learned planner finishes solo games with every character', !unfinished, unfinished);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} value-model checks passed`);
if (failed.length) process.exit(1);
