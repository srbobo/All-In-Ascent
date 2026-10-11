// Planner agent — the fast playtest bot (docs/CPU_PLAYTEST_AUDIT.md §5, 3a).
//
// One-step expectimax over observe():
//   for each legal action a (annotated by observe with exact pSend, costs, XP)
//     cost(a) = Time a spends  +  Σ_outcomes P(outcome) · timeToFinish(next state)
//   pick the cheapest.
//
// Climbs and milestone attempts branch into send / fall with observe's exact
// pSend; training, resting and gear purchases are applied with the real
// engine on a copy of the state. timeToFinish (planner-model.js) values the
// resulting climber: training plan, attempt costs, Endurance, Lead access,
// level progress. No playouts, no per-character rules — every character is
// played by the same procedure, reading the engine's own numbers, which is
// what balance measurement needs (audit F1).
//
// Options:
//   params    weights for timeToFinish (default: DEFAULT_PARAMS, or the tuned
//             per-character weights when `tuned: true`)
//   tuned     use sim/agents/planner-weights.json for the character played
//   epsilon   chance of a uniformly random legal action (difficulty dial)
//   seed      RNG seed for epsilon / tie-breaks (deterministic per seed)

import { readFileSync } from 'node:fs';
import { applyAction, getLegalActions } from '../../engine/engine.js';
import { observe } from '../../engine/observe.js';
import { applyLevelUpIfNeeded, claimClimbGrit, usesGrit } from '../../engine/helpers.js';
import { createRng } from '../../engine/rng.js';
import { DEFAULT_PARAMS, timeToFinish } from './planner-model.js';

let tunedWeights = null;
export function loadTunedWeights() {
  if (tunedWeights) return tunedWeights;
  try {
    tunedWeights = JSON.parse(readFileSync(new URL('./planner-weights.json', import.meta.url), 'utf8'));
  } catch {
    tunedWeights = {};
  }
  return tunedWeights;
}

// Idle guard. timeToFinish is an estimate, and a one-step lookahead over an
// estimate can find spots where every useful action looks slightly worse than
// idling — and then idles forever. By default (params.neverIdle) idling is
// never chosen while anything else is legal; with neverIdle off, it is
// forbidden once the estimate has not improved over STALL_ROUNDS rounds.
// `stalls` counts rounds where that no-progress condition held.
const STALL_ROUNDS = 2;

export function createPlannerAgent({ params = null, tuned = false, epsilon = 0, seed = 1 } = {}) {
  const rng = createRng(seed);
  const cache = new Map();
  const history = []; // estimate at the first decision of each round
  let lastRound = -1;
  let forbidIdle = false;
  return {
    name: tuned ? 'planner-tuned' : 'planner',
    stalls: 0,
    async chooseAction({ state, legalActions }) {
      if (state.round !== lastRound) {
        lastRound = state.round;
        const me = state.players[state.currentPlayerIndex].character;
        const ctx = { milestoneRoutes: state.milestoneRoutes, rules: state.rules || null, market: state.availableGear.map(g => g.name) };
        const p0 = resolveParams(me, params, tuned);
        history.push(estimate(me, ctx, p0, cache));
        const then = history[history.length - 1 - STALL_ROUNDS];
        const stalled = then !== undefined && history[history.length - 1] > then - 0.01;
        if (stalled) this.stalls++;
        forbidIdle = p0.neverIdle || stalled;
      }
      return choosePlannerAction(state, legalActions || getLegalActions(state), {
        params, tuned, epsilon, rng, cache, forbidIdle,
      });
    },
  };
}

function resolveParams(me, params, tuned) {
  return { ...DEFAULT_PARAMS, ...(tuned ? (loadTunedWeights()[me.key]?.params || {}) : {}), ...(params || {}) };
}

function estimate(char, game, p, cache) {
  return timeToFinish(char, game, p, cache);
}

export function choosePlannerAction(state, legalActions, {
  params = null, tuned = false, epsilon = 0, rng = null, cache = null, forbidIdle = false,
} = {}) {
  const seat = state.currentPlayerIndex;
  const me = state.players[seat].character;
  const p = resolveParams(me, params, tuned);

  if (epsilon > 0 && rng && rng.next() < epsilon) {
    const i = Math.floor(rng.next() * legalActions.length);
    return { actionIndex: i, rationale: `exploration: random action ${i}` };
  }

  const obs = observe(state, { seat, legalActions, plans: false, effects: false });
  const perRound = 10 + (me.equipment.includes('Approach Shoes') ? 1 : 0);
  const game = (st) => ({ milestoneRoutes: st.milestoneRoutes, rules: st.rules || null, market: st.availableGear.map(g => g.name) });
  const here = game(state);
  const ttf = (char, g = here) => timeToFinish(char, g, p, cache);

  const hasNonIdle = obs.actions.some(a => a.type !== 'endTurn' && a.type !== 'rest');
  const scored = []; // every option considered, for the decision-tension report
  let best = null;
  for (const a of obs.actions) {
    const action = legalActions[a.i];
    let spent;
    let future;
    switch (a.type) {
      case 'climb':
      case 'milestone': {
        spent = a.time;
        const send = climbOutcome(state, me, a, true);
        const fall = climbOutcome(state, me, a, false);
        future = (a.pSend > 0 ? a.pSend * ttf(send) : 0) + (a.pSend < 1 ? (1 - a.pSend) * ttf(fall) : 0);
        break;
      }
      case 'endTurn':
        spent = a.timeForfeited;
        future = ttf(me);
        break;
      default: {
        // train / rest / buyGear: deterministic — apply with the real engine.
        spent = a.time;
        const { state: next } = applyAction({ ...state, events: [] }, action);
        future = ttf(next.players[seat].character, game(next));
      }
    }
    const cost = spent * 10 / perRound + future;
    // Idle: calling it a day, or a Rest that restores nothing and grants no
    // Beta Boost. On a tie, prefer doing something over idling.
    const idle = a.type === 'endTurn' ||
      (a.type === 'rest' && a.enduranceAfter <= me.currentEndurance && !(a.grantsBetaBoost && !me.betaBoostActive));
    if (forbidIdle && idle && hasNonIdle) continue;
    scored.push({ cost, type: a.type });
    if (!best || cost < best.cost - 1e-6 || (cost < best.cost + 1e-6 && best.idle && !idle)) {
      best = { cost, a, idle };
    }
  }
  // How close the call was: the gap to the runner-up, and which other kinds of
  // action came within 1 Time of the best (analysis/strategy-diversity.mjs).
  const others = scored.filter(o => o !== scored.find(x => x.cost === best.cost && x.type === best.a.type));
  const gap = others.length ? Math.min(...others.map(o => o.cost)) - best.cost : Infinity;
  const nearTypes = [...new Set(others.filter(o => o.cost - best.cost <= 1).map(o => o.type))].filter(t => t !== best.a.type);
  return {
    actionIndex: best.a.i,
    rationale: `planner: ${describe(best.a)} → est. ${best.cost.toFixed(1)} Time to finish`,
    decision: { gap, nearTypes, options: scored.length },
  };
}

// The climber after a climb resolves one way or the other. Grit rewards are
// applied with the engine's own claimClimbGrit, on a copy of the card.
function climbOutcome(state, me, a, sent) {
  const c = structuredClone(me);
  c.xp += sent ? a.xp.send : a.xp.fall;
  if (usesGrit(state.rules)) {
    const card = a.type === 'milestone' ? {} : { ...state.availableRoutes[a.wall].find(r => r.name === a.route) };
    claimClimbGrit(state.rules, c, card, { isMilestone: a.type === 'milestone', success: sent, tier: a.tier });
  }
  c.currentEndurance -= a.endurance;
  if (sent) c.currentEndurance = Math.min(c.maxEndurance, c.currentEndurance + a.sendHeal);
  else c.currentEndurance -= a.fallExtraEndurance;
  if (c.currentEndurance < 0) c.currentEndurance = 0;
  c.betaBoostActive = false;
  if (a.shift) c.abilityUsed = true;
  if (sent && a.type === 'milestone') c.milestonesCompleted[a.tier] = true;
  while (applyLevelUpIfNeeded(c).leveledUp) { /* may cross several levels */ }
  return c;
}

function describe(a) {
  switch (a.type) {
    case 'climb': return `climb ${a.route} (pSend ${a.pSend})`;
    case 'milestone': return `milestone ${a.tier} (pSend ${a.pSend})`;
    case 'train': return `train ${a.stat}`;
    case 'buyGear': return `buy ${a.card}`;
    default: return a.type;
  }
}
