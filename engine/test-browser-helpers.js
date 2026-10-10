// Parity tests for engine/helpers.browser.js (the classic-script copy of
// engine/helpers.js that local play in game.js uses).
//
// Run:  npm run test:engine
// Loads helpers.browser.js the way index.html does — as a classic script in a
// global scope where game.js's GAME DATA consts are defined — and checks that
// every gear effectKind resolves identically to the ES-module engine on the
// same seeded dice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import * as engine from './helpers.js';
import { createRng } from './rng.js';
import { ROUTES, GEAR_SHOP } from './data.js';

const here = dirname(fileURLToPath(import.meta.url));

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

// Browser-like global scope: game.js's GAME DATA section declares the data as
// top-level consts, then helpers.browser.js runs as another classic script.
const gameSrc = readFileSync(join(here, '..', 'game.js'), 'utf8');
const dataSection = gameSrc.slice(
  gameSrc.indexOf('// ===== GAME DATA ====='),
  gameSrc.indexOf('// ===== GAME STATE ====='),
);
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(dataSection, ctx, { filename: 'game.js (GAME DATA)' });
vm.runInContext(readFileSync(join(here, 'helpers.browser.js'), 'utf8'), ctx, { filename: 'helpers.browser.js' });
const browser = ctx.window.EngineHelpers;

check('helpers.browser.js exposes window.EngineHelpers', !!browser);
const engineExports = Object.keys(engine).sort();
check('browser copy exposes every engine/helpers.js export',
  JSON.stringify(Object.keys(browser).sort()) === JSON.stringify(engineExports),
  `missing: ${engineExports.filter(k => !(k in browser)).join(', ')}`);

const EFFECT_GEAR = GEAR_SHOP.filter(g => g.effectKind);
check('game data has effectKind gear to test', EFFECT_GEAR.length >= 11, `${EFFECT_GEAR.length}`);

const allRoutes = [...ROUTES.bouldering, ...ROUTES.topRope, ...ROUTES.leadClimbing];
const CHAR_KEYS = ['technician', 'sprinter', 'ironLung', 'routeReader', 'freeSolo'];
const makeChar = (key, equipment) => ({
  key, level: 3, xp: 0,
  stats: { strength: 30, technique: 30, focus: 30, flexibility: 30 },
  trainingBonuses: { strength: 2, technique: 0, focus: 4, flexibility: 0 },
  gearBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  equipment, timeRemaining: 10, currentEndurance: 100, maxEndurance: 100,
  betaBoostActive: false, abilityUsed: false,
});

// One climb's worth of gear-dependent results, from either implementation.
function resolve(h, seed, char, route, isMilestone) {
  const rng = createRng(seed);
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
let traced = new Set();
let seed = 1;
for (const route of allRoutes) {
  for (const key of CHAR_KEYS) {
    // Every card on its own, plus the whole effect deck at once.
    const loadouts = [...EFFECT_GEAR.map(g => [g.name]), EFFECT_GEAR.map(g => g.name)];
    for (const equipment of loadouts) {
      for (const isMilestone of [false, true]) {
        seed++;
        const char = makeChar(key, equipment);
        const a = JSON.stringify(resolve(engine, seed, char, route, isMilestone));
        const bRes = resolve(browser, seed, char, route, isMilestone);
        // vm objects carry another realm's prototypes; compare as JSON.
        if (a !== JSON.stringify(bRes)) {
          mismatches++;
          if (!firstMismatch) firstMismatch = `${route.name} / ${key} / ${equipment.join('+')}`;
        }
        for (const t of bRes.trace) traced.add(t.effectKind);
      }
    }
  }
}
check('browser copy matches the engine for every route × character × effect card × milestone',
  mismatches === 0, `${mismatches} mismatches, first: ${firstMismatch}`);

for (const kind of ['rerollOnTag', 'extraDieDiscardOne', 'treatOneDieAsValue', 'milestoneBuffDiceBonus']) {
  check(`rollClimbDice trace reports ${kind}`, traced.has(kind));
}

// The trace is bookkeeping only: passing one must not change the dice.
{
  const route = allRoutes.find(r => r.tag === 'Dynamic' && r.rollEffect.length >= 2);
  const char = makeChar('ironLung', EFFECT_GEAR.map(g => g.name));
  const effects = engine.buildEffectRollArray(char, route);
  const withTrace = engine.rollClimbDice(createRng(77), effects, char, route, true, []);
  const without = engine.rollClimbDice(createRng(77), effects, char, route, true);
  check('rollClimbDice trace does not alter the rolls', JSON.stringify(withTrace) === JSON.stringify(without));
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} browser-helper checks passed`);
if (failed.length) process.exit(1);
