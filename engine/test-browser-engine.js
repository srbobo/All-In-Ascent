// Parity tests for engine/engine.browser.js — the classic-script bundle of
// the engine that local play (game.js) runs in the browser.
//
// Run:  npm run test:engine
// Loads the bundle the way index.html does: as a classic script in a global
// scope where game.js's GAME DATA consts are already defined. Then plays full
// games through both the bundle and the ES-module engine with the same seeds
// and choices, and requires byte-identical states and events at every step.
// If local play ever diverges from the engine, this fails.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import * as engineModule from './engine.js';
import * as stateModule from './state.js';
import * as helpersModule from './helpers.js';
import { createRng } from './rng.js';
import { CHARACTERS, ROUTES, GEAR_SHOP } from './data.js';

const here = dirname(fileURLToPath(import.meta.url));

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

// Browser-like global scope: game.js's GAME DATA section, then the bundle.
const gameSrc = readFileSync(join(here, '..', 'game.js'), 'utf8');
const dataSection = gameSrc.slice(
  gameSrc.indexOf('// ===== GAME DATA ====='),
  gameSrc.indexOf('// ===== GAME STATE ====='),
);
const ctx = vm.createContext({ window: {}, console, structuredClone });
vm.runInContext(dataSection, ctx, { filename: 'game.js (GAME DATA)' });
vm.runInContext(readFileSync(join(here, 'engine.browser.js'), 'utf8'), ctx, { filename: 'engine.browser.js' });
const browser = ctx.window.AscentEngine;

// vm objects carry another realm's prototypes; compare as JSON.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('engine.browser.js exposes window.AscentEngine', !!browser);
for (const [name, mod] of [['engine.js', engineModule], ['state.js', stateModule], ['helpers.js', helpersModule]]) {
  const missing = Object.keys(mod).filter(k => !(k in browser));
  check(`bundle exposes every ${name} export`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Full games: same seed + same choices → identical states and events.
// ---------------------------------------------------------------------------
const CHAR_KEYS = Object.keys(CHARACTERS);
let games = 0;
let steps = 0;
let firstDiff = '';
for (let g = 0; g < 24; g++) {
  const pick = createRng(1000 + g);
  const count = 1 + (g % 4);
  const characterKeys = pick.shuffle(CHAR_KEYS).slice(0, count);
  const seed = 50_000 + g * 7919;

  let a = stateModule.createGame({ seed, characterKeys }).state;
  let b = browser.createGame({ seed, characterKeys }).state;
  if (!same(a, b)) { firstDiff ||= `game ${g}: createGame`; break; }

  for (let i = 0; i < 600 && !a.gameEnded; i++) {
    const legalA = engineModule.getLegalActions(a);
    const legalB = browser.getLegalActions(b);
    if (!same(legalA, legalB)) { firstDiff ||= `game ${g} step ${i}: getLegalActions`; break; }
    // Favour climbs and purchases so games reach gear, level-ups and milestones.
    const weighted = legalA.flatMap(x => (x.type === 'endTurn' ? [] : x.type === 'rest' ? [x] : [x, x, x]));
    const action = weighted.length ? weighted[Math.floor(pick.next() * weighted.length)] : legalA[0];
    const ra = engineModule.applyAction(a, action);
    const rb = browser.applyAction(b, action);
    steps++;
    if (!same(ra.events, rb.events) || !same(ra.state, rb.state)) {
      firstDiff ||= `game ${g} step ${i}: applyAction(${JSON.stringify(action)})`;
      break;
    }
    a = ra.state;
    b = rb.state;
  }
  if (firstDiff) break;
  games++;
}
check(`bundle plays identically to the engine (${games} games, ${steps} actions)`, !firstDiff && games === 24, firstDiff);

// ---------------------------------------------------------------------------
// Every gear effectKind resolves identically (direct helper sweep).
// ---------------------------------------------------------------------------
const EFFECT_GEAR = GEAR_SHOP.filter(g => g.effectKind);
const allRoutes = [...ROUTES.bouldering, ...ROUTES.topRope, ...ROUTES.leadClimbing];
const makeChar = (key, equipment) => ({
  key, level: 3, xp: 0,
  stats: { strength: 30, technique: 30, focus: 30, flexibility: 30 },
  trainingBonuses: { strength: 2, technique: 0, focus: 4, flexibility: 0 },
  gearBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  equipment, timeRemaining: 10, currentEndurance: 100, maxEndurance: 100,
  betaBoostActive: false, abilityUsed: false,
});
function resolve(h, seed, char, route, isMilestone) {
  const rng = h.createRng ? h.createRng(seed) : createRng(seed);
  const effects = h.buildEffectRollArray(char, route);
  const trace = [];
  const dice = h.rollClimbDice(rng, effects, char, route, isMilestone, trace);
  const applied = h.applyDiceToRequirements(char, route, effects, dice);
  return {
    time: h.getEffectiveClimbTimeCost(char, route.time, route),
    endurance: h.getEffectiveClimbEnduranceCost(char, route, route.endurance),
    dice, trace, applied,
    xpSuccess: h.computeClimbXp(char, route, true),
    xpFail: h.computeClimbXp(char, route, false),
    failExtra: h.getFailureEnduranceExtra(char),
    heal: h.getSuccessEnduranceHeal(char),
    trainBoost: h.getTrainingBonusBoost(char),
  };
}
let mismatches = 0;
let firstMismatch = '';
let seed = 1;
const moduleHelpers = { ...helpersModule, createRng };
for (const route of allRoutes) {
  for (const key of CHAR_KEYS) {
    for (const equipment of [...EFFECT_GEAR.map(g => [g.name]), EFFECT_GEAR.map(g => g.name)]) {
      for (const isMilestone of [false, true]) {
        seed++;
        const char = makeChar(key, equipment);
        if (!same(resolve(moduleHelpers, seed, char, route, isMilestone), resolve(browser, seed, char, route, isMilestone))) {
          mismatches++;
          if (!firstMismatch) firstMismatch = `${route.name} / ${key} / ${equipment.join('+')}`;
        }
      }
    }
  }
}
check('every gear effect resolves identically (route × character × card × milestone)', mismatches === 0,
  `${mismatches} mismatches, first: ${firstMismatch}`);

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} browser-engine checks passed`);
if (failed.length) process.exit(1);
