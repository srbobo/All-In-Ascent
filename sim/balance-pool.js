// Parallel game runner for balance sweeps and bot tuning.
//
//   const results = await runGames(tasks, { workers });
//
// Each task is { chars, seed, agents, maxRounds?, params?, rules? } — one game.
// `rules` is a balance variant (state.rules, see engine helpers trainingSpec). Tasks
// fan out over worker_threads (default: all cores but one); every game is
// deterministic for its (chars, seed, agents, params), so results do not
// depend on the worker count. When imported as a worker, this same module
// plays the games.
//
// Agent specs: 'planner', 'planner-tuned', 'heuristic', 'random',
// 'rollout' / 'rollout:<rolloutsPerAction>'. `params` (planner weights) applies
// to every planner seat in the task.

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createGame } from '../engine/state.js';
import { GEAR_SHOP } from '../engine/data.js';
import { applyAction, getLegalActions, isTerminal } from '../engine/engine.js';
import { createPlannerAgent } from './agents/planner.js';
import { createHeuristicAgent } from './agents/heuristic.js';
import { createRandomAgent } from './agents/random.js';
import { createRolloutAgent } from './agents/rollout.js';

const TIERS = ['beginner', 'intermediate', 'expert'];
const MAX_DECISIONS = 50000;

export function makeAgent(spec, { seed = 1, params = null } = {}) {
  const [kind, arg] = spec.split(':');
  switch (kind) {
    case 'planner': return createPlannerAgent({ params, seed });
    case 'planner-tuned': return createPlannerAgent({ params, tuned: true, seed });
    case 'heuristic': return createHeuristicAgent();
    case 'random': return createRandomAgent({ seed });
    case 'rollout': return createRolloutAgent({ rolloutsPerAction: Number(arg) || 3, maxPlayoutSteps: 300 });
    default: throw new Error(`unknown agent spec "${spec}"`);
  }
}

// Play one game to the end (or maxRounds). Returns a compact result.
export async function playGame({ chars, seed, agents, maxRounds = 200, params = null, rules = null }) {
  const bots = agents.map((spec, i) => makeAgent(spec, { seed: seed * 31 + i, params }));
  let { state } = createGame({ seed, characterKeys: chars, rules });
  const msRound = chars.map(() => ({}));
  const actionCounts = chars.map(() => ({}));
  const timeSpent = chars.map(() => ({})); // Time per action type, per seat
  // Per-seat play detail for strategy analysis (analysis/strategy-diversity.mjs).
  const detail = chars.map(() => ({
    wallClimbs: { bouldering: 0, topRope: 0, leadClimbing: 0 }, sends: 0, falls: 0,
    milestoneOrder: [], gearOrder: [], trainStats: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
    abilities: {}, gritClaimed: 0, decisions: 0, closeCalls: 0, nearTypes: {},
    climbs: [],        // { tag, area, ms, ok, r } — every climb, with its route tag
    specialtyBuys: [], // { card, tag, r } — tag-targeted gear purchases
  }));
  const SPECIALTY = Object.fromEntries(GEAR_SHOP.filter(g => g.tagFilter).map(g => [g.name, g.tagFilter]));
  let decisions = 0;
  const t0 = performance.now();
  let term = isTerminal(state);
  while (!term.done && state.round <= maxRounds && decisions < MAX_DECISIONS) {
    const seat = state.currentPlayerIndex;
    const legal = getLegalActions(state);
    const pick = await bots[seat].chooseAction({ state, legalActions: legal });
    const idx = Number.isInteger(pick?.actionIndex) && pick.actionIndex >= 0 && pick.actionIndex < legal.length
      ? pick.actionIndex : 0;
    const action = legal[idx];
    actionCounts[seat][action.type] = (actionCounts[seat][action.type] || 0) + 1;
    const before = state.players[seat].character.timeRemaining;
    const roundBefore = state.round;
    // The climbed route's tag, read before the action changes the walls.
    const climbedRoute = action.type === 'climb'
      ? state.availableRoutes[action.area].find(r => r.name === action.routeName)
      : action.type === 'milestone' ? state.milestoneRoutes[action.difficulty].route : null;
    let events;
    ({ state, events } = applyAction(state, action));
    const d = detail[seat];
    d.decisions++;
    if (pick && pick.decision) {
      // A close call: a different productive action came within 1 Time.
      if (pick.decision.nearTypes.some(t => t === 'climb' || t === 'train' || t === 'milestone' || t === 'buyGear')) d.closeCalls++;
      for (const t of pick.decision.nearTypes) d.nearTypes[t] = (d.nearTypes[t] || 0) + 1;
    }
    for (const e of events) {
      const p = e.payload || {};
      if (e.type === 'climb_resolved') {
        d.climbs.push({ tag: (climbedRoute && climbedRoute.tag) || null, area: p.area, ms: !!p.isMilestone, ok: !!p.success, r: roundBefore });
        if (!p.isMilestone) d.wallClimbs[p.area]++;
        if (p.success) d.sends++; else d.falls++;
        if (p.isMilestone && p.success) d.milestoneOrder.push(p.difficulty);
        if (p.gritGained) d.gritClaimed += p.gritGained;
      } else if (e.type === 'ability_activated') {
        d.abilities[p.ability] = (d.abilities[p.ability] || 0) + 1;
      } else if (e.type === 'gear_purchased') {
        d.gearOrder.push(p.gearName);
        if (SPECIALTY[p.gearName]) d.specialtyBuys.push({ card: p.gearName, tag: SPECIALTY[p.gearName], r: roundBefore });
      } else if (e.type === 'train_action') {
        d.trainStats[p.stat]++;
      }
    }
    const after = state.players[seat].character.timeRemaining;
    const spent = state.round !== roundBefore || state.gameEnded ? before - (state.gameEnded ? after : 0) : before - after;
    timeSpent[seat][action.type] = (timeSpent[seat][action.type] || 0) + spent;
    state.events.length = 0;
    decisions++;
    const c = state.players[seat].character;
    for (const t of TIERS) if (c.milestonesCompleted[t] && !msRound[seat][t]) msRound[seat][t] = state.round;
    term = isTerminal(state);
  }
  return {
    chars, seed, agents,
    done: term.done,
    winnerSeat: term.done ? state.players.findIndex(p => p.playerNum === term.winner) : -1,
    rounds: state.round,
    decisions,
    msPerDecision: (performance.now() - t0) / Math.max(1, decisions),
    milestones: state.players.map(p => TIERS.filter(t => p.character.milestonesCompleted[t]).length),
    milestoneRounds: msRound,
    expertWall: state.milestoneRoutes.expert.area,
    expertRoute: state.milestoneRoutes.expert.route.name,
    milestoneTags: Object.fromEntries(TIERS.map(t => [t, state.milestoneRoutes[t].route.tag || null])),
    actions: actionCounts,
    timeSpent,
    detail,
    levels: state.players.map(p => p.character.level),
    gear: state.players.map(p => [...p.character.equipment]),
    stalls: bots.map(b => b.stalls || 0),
  };
}

export async function runGames(tasks, { workers = Math.max(1, availableParallelism() - 1), onProgress = null } = {}) {
  if (workers <= 1 || tasks.length < 4) {
    const out = [];
    for (const t of tasks) { out.push(await playGame(t)); if (onProgress) onProgress(out.length, tasks.length); }
    return out;
  }
  const results = new Array(tasks.length);
  let next = 0;
  let done = 0;
  await new Promise((resolve, rejectRun) => {
    const pool = [];
    const reject = (e) => { for (const w of pool) w.terminate(); rejectRun(e); };
    const feed = (w) => {
      if (next >= tasks.length) { w.terminate(); return; }
      const i = next++;
      w.postMessage({ i, task: tasks[i] });
    };
    for (let k = 0; k < Math.min(workers, tasks.length); k++) {
      const w = new Worker(new URL(import.meta.url));
      w.on('message', ({ i, result, error }) => {
        if (error) { reject(new Error(`game ${JSON.stringify(tasks[i])}: ${error}`)); return; }
        results[i] = result;
        done++;
        if (onProgress) onProgress(done, tasks.length);
        if (done === tasks.length) { for (const x of pool) x.terminate(); resolve(); } else feed(w);
      });
      w.on('error', reject);
      pool.push(w);
      feed(w);
    }
  });
  return results;
}

if (!isMainThread) {
  parentPort.on('message', async ({ i, task }) => {
    try {
      parentPort.postMessage({ i, result: await playGame(task) });
    } catch (e) {
      parentPort.postMessage({ i, error: e.stack || String(e) });
    }
  });
}

// =============================================================================
// Statistics
// =============================================================================

// Wilson score interval for a proportion (95%).
export function wilson(wins, n, z = 1.96) {
  if (!n) return { p: NaN, lo: NaN, hi: NaN };
  const p = wins / n;
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

// Median with a distribution-free 95% CI (order statistics).
export function medianCI(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { median: NaN, lo: NaN, hi: NaN };
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const k = Math.max(0, Math.floor(n / 2 - 1.96 * Math.sqrt(n) / 2));
  return { median, lo: v[k], hi: v[Math.min(n - 1, n - 1 - k)] };
}

export function mean(values) {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}
