// Game worker for the learning pipeline (sim/learn/*). Imported by the main
// scripts for playGame(), and run as a worker by runPool(GAMES_WORKER, tasks).
//
// task = {
//   chars: ['sprinter', ...],          characters in seat order
//   seed,                              game seed (GRIT_RULES, like every real game)
//   agents: ['hard' | 'learned' | 'eps:<ε>', ...], per seat: the shipped Hard CPU,
//                                      Hard + value model, or Hard with random-move rate ε
//   value,                             value-model weights for 'learned' seats
//   record,                            collect training samples (see below)
//   maxRounds,
// }
//
// Training samples: at every decision, the acting climber's value features
// (engine/value-model.js) and, once the game is over, the label — the Time
// that climber actually used from that decision until their last milestone
// send, in the planner's units (Time × 10 / Time per round). Only climbers who
// finished get labels (in solo games: every finished game).

import { createGame } from '../../engine/state.js';
import { applyAction, getLegalActions, isTerminal } from '../../engine/engine.js';
import { GRIT_RULES } from '../../engine/helpers.js';
import { createPlannerAgent } from '../../engine/planner.js';
import { DEFAULT_PARAMS, explainTimeToFinish } from '../../engine/planner-model.js';
import { PLANNER_WEIGHTS } from '../../engine/planner-weights.js';
import { valueFeatures } from '../../engine/value-model.js';
import { createRng } from '../../engine/rng.js';
import { serveTasks } from './pool.js';

export const GAMES_WORKER = new URL(import.meta.url);

// The planner weights a seat plays with — the Hard CPU's (tuned per character).
export function seatParams(key) {
  return { ...DEFAULT_PARAMS, ...(PLANNER_WEIGHTS[key]?.params || {}) };
}

function makeAgent(kind, seed, value) {
  if (kind === 'hard') return createPlannerAgent({ tuned: true, seed });
  // 'eps:<ε>': Hard playing a random legal move with probability ε.
  if (kind.startsWith('eps:')) return createPlannerAgent({ tuned: true, seed, epsilon: Number(kind.slice(4)) });
  if (kind === 'learned') return createPlannerAgent({ tuned: true, seed, value });
  throw new Error(`unknown agent "${kind}"`);
}

export async function playGame({ chars, seed, agents, value = null, record = false, maxRounds = 80 }) {
  let { state } = createGame({ seed, characterKeys: chars, rules: GRIT_RULES });
  const bots = agents.map((kind, i) => makeAgent(kind, seed * 31 + i, value));
  const cache = new Map();
  const pending = chars.map(() => []); // per seat: { f, round, tNow, perRound }
  let decisions = 0;
  while (!isTerminal(state).done && state.round <= maxRounds && decisions < 20000) {
    const seat = state.currentPlayerIndex;
    const char = state.players[seat].character;
    if (record) {
      const game = { milestoneRoutes: state.milestoneRoutes, rules: state.rules, market: state.availableGear.map(g => g.name) };
      const parts = explainTimeToFinish(char, game, seatParams(char.key), cache);
      if (parts.total > 0) {
        pending[seat].push({
          f: valueFeatures(char, game, parts),
          round: state.round,
          tNow: char.timeRemaining,
          perRound: 10 + (char.equipment.includes('Approach Shoes') ? 1 : 0),
        });
      }
    }
    const legal = getLegalActions(state);
    const { actionIndex } = await bots[seat].chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
    state.events.length = 0;
    decisions++;
  }
  const term = isTerminal(state);
  const winnerSeat = term.done ? state.players.findIndex(p => p.playerNum === term.winner) : -1;
  const out = { chars, seed, agents, done: term.done, winnerSeat, rounds: state.round, decisions };
  if (record) {
    out.samples = [];
    state.players.forEach((p, seat) => {
      const c = p.character;
      const finished = ['beginner', 'intermediate', 'expert'].every(t => c.milestonesCompleted[t]);
      if (!finished) return;
      const tEnd = c.timeRemaining;
      for (const s of pending[seat]) {
        const used = s.perRound * (state.round - s.round) + s.tNow - tEnd;
        out.samples.push({ key: c.key, seed, f: s.f, y: used * 10 / s.perRound });
      }
    });
  }
  return out;
}

// Rollout labels (approximate policy iteration). Play a solo game with a
// behaviour policy that explores (Hard, or Hard + a candidate model, taking a
// random legal action with probability `epsilon`); at a random `sampleRate`
// share of its decisions, copy the state and let the shipped Hard CPU finish
// the game from there. The label is the Time that took: the value of that
// state under Hard. Unlike labels from the behaviour game itself, every state
// — including ones Hard would never walk into — is valued by what a good
// player actually achieves from it, so one-step lookahead over these values
// improves on Hard instead of copying its correlations.
export async function rolloutSamples({ key, seed, behavior = 'hard', value = null, epsilon = 0.15, sampleRate = 0.15, maxRounds = 80 }) {
  let { state } = createGame({ seed, characterKeys: [key], rules: GRIT_RULES });
  const bot = createPlannerAgent({ tuned: true, seed: seed * 31, epsilon, value: behavior === 'learned' ? value : null });
  const pick = createRng((seed * 7919 + 17) >>> 0);
  const cache = new Map();
  const samples = [];
  let decisions = 0;
  while (!isTerminal(state).done && state.round <= maxRounds && decisions < 4000) {
    const char = state.players[0].character;
    if (pick.next() < sampleRate) {
      const game = { milestoneRoutes: state.milestoneRoutes, rules: state.rules, market: state.availableGear.map(g => g.name) };
      const parts = explainTimeToFinish(char, game, seatParams(char.key), cache);
      if (parts.total > 0) {
        const y = await hardTimeToFinish(state, seed * 1000 + decisions, maxRounds);
        if (y !== null) samples.push({ key, seed, f: valueFeatures(char, game, parts), y });
      }
    }
    const legal = getLegalActions(state);
    const { actionIndex } = await bot.chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
    state.events.length = 0;
    decisions++;
  }
  return { key, seed, done: isTerminal(state).done, rounds: state.round, samples };
}

// Time (planner units) the Hard CPU uses to finish a solo game from `start`,
// or null if it does not finish within maxRounds.
async function hardTimeToFinish(start, seed, maxRounds) {
  const c0 = start.players[0].character;
  const perRound = 10 + (c0.equipment.includes('Approach Shoes') ? 1 : 0);
  const round0 = start.round;
  const t0 = c0.timeRemaining;
  const bot = createPlannerAgent({ tuned: true, seed });
  let state = { ...start, events: [] };
  for (let i = 0; i < 4000 && !isTerminal(state).done && state.round <= maxRounds; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await bot.chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
    state.events.length = 0;
  }
  if (!isTerminal(state).done) return null;
  const used = perRound * (state.round - round0) + t0 - state.players[0].character.timeRemaining;
  return used * 10 / perRound;
}

serveTasks((task) => (task.kind === 'rollouts' ? rolloutSamples(task) : playGame(task)));
