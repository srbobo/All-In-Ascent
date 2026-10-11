// Tests for the planner bot (sim/agents/planner.js, planner-model.js).
//
// Run:  npm run test:bots
// Covers:
//   - the planning send chance (product form) is EXACT vs the engine's
//     climbSendProbability for every character, on every milestone-eligible
//     route, whenever no stat-coupling dice gear is owned
//   - the planner always returns a legal index and is deterministic
//   - every character finishes solo games quickly (regression guard)

import { ROUTES } from '../engine/data.js';
import { climbSendProbability } from '../engine/helpers.js';
import { createRng } from '../engine/rng.js';
import { milestoneModel, planPSend, permanentStats } from './agents/planner-model.js';
import { createPlannerAgent } from './agents/planner.js';
import { playGame } from './balance-pool.js';
import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction } from '../engine/engine.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const CHARS = ['ironLung', 'technician', 'sprinter', 'routeReader', 'freeSolo'];
const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const zero = () => ({ strength: 0, technique: 0, focus: 0, flexibility: 0 });

// =============================================================================
// Planning P(send) == exact P(send)
// =============================================================================
{
  const rng = createRng(17);
  const gearSets = [[], ['Climbing Coach'], ['Belay Device', 'Locking Carabiner', 'Lead Rope']];
  // Ability tuning (character balance experiments) must stay exact too.
  const TUNES = {
    routeReader: [null, { nearMiss: 5 }, { milestonePasses: 4 }, { betaBoost: 2, nearMiss: 3 }],
    technician: [null, { reqReduction: 7, extraTime: 0 }],
    sprinter: [null, { focusCrux: false }],
  };
  let cases = 0;
  let worst = 0;
  let worstCase = '';
  for (const key of CHARS) {
    for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
      for (const route of ROUTES[area]) {
        for (const gear of gearSets) for (const tune of (TUNES[key] || [null])) {
          for (let k = 0; k < 3; k++) {
            // Stats scattered around the requirements.
            const stats = Object.fromEntries(STATS.map(s => [s, route[s] + Math.floor(rng.next() * 25) - 12]));
            const char = {
              key, level: 1, xp: 0, stats, trainingBonuses: zero(), gearBonuses: zero(),
              equipment: gear, currentEndurance: 100, maxEndurance: 100,
              // The model plans a Route Reader's attempts after a Rest (Beta Boost).
              betaBoostActive: key === 'routeReader', abilityUsed: false,
              milestonesCompleted: { beginner: false, intermediate: false, expert: false },
              ...(tune ? { abilityParams: tune } : {}),
            };
            const m = { area, route };
            const exact = climbSendProbability(char, route, area, {}, { isMilestone: true }).pSend;
            const model = milestoneModel({ ...char, betaBoostActive: false }, 'expert', m);
            const plan = planPSend(model, permanentStats({ ...char, betaBoostActive: false }));
            // Free Solo's gate ignores per-route gear; exact pSend counts it
            // when the climb is allowed, which only matters if gate passes.
            if (key === 'freeSolo' && gear.length === 3) continue;
            cases++;
            const err = Math.abs(plan - exact);
            if (err > worst) { worst = err; worstCase = `${key} ${route.name} [${gear.join('+')}] plan ${plan.toFixed(4)} exact ${exact.toFixed(4)}`; }
          }
        }
      }
    }
  }
  check(`planning P(send) is exact without coupling gear (${cases} cases)`, worst < 1e-9, worstCase);
}

// =============================================================================
// Legal, deterministic choices
// =============================================================================
{
  const run = async () => {
    const bot = createPlannerAgent({ seed: 3 });
    let { state } = createGame({ seed: 9, characterKeys: ['routeReader', 'sprinter', 'ironLung'] });
    const picks = [];
    let illegal = 0;
    for (let step = 0; step < 200 && !state.gameEnded; step++) {
      const legal = getLegalActions(state);
      const { actionIndex } = await bot.chooseAction({ state, legalActions: legal });
      if (!(actionIndex >= 0 && actionIndex < legal.length)) illegal++;
      picks.push(actionIndex);
      ({ state } = applyAction(state, legal[actionIndex] || legal[0]));
      state.events.length = 0;
    }
    return { picks, illegal };
  };
  const a = await run();
  const b = await run();
  check('planner always returns a legal action index', a.illegal === 0, `${a.illegal} illegal`);
  check('planner is deterministic for a fixed seed', a.picks.join() === b.picks.join());
}

// =============================================================================
// Every character finishes solo games quickly
// =============================================================================
{
  for (const key of CHARS) {
    const rounds = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = await playGame({ chars: [key], seed, agents: ['planner'], maxRounds: 60 });
      rounds.push(r.done ? r.rounds : Infinity);
    }
    const worst = Math.max(...rounds);
    check(`${key} finishes 6 solo games within 30 rounds (rounds: ${rounds.join(', ')})`, worst <= 30);
  }
}

const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} planner assertions FAILED.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} planner assertions passed.`);
