// Rollout evaluator (R2: LLM-as-prior, engine-as-search).
//
// For each candidate action, simulate it and play the game to completion
// using heuristic policies for EVERY seat, repeated M times with perturbed
// RNG streams. The averaged terminal value estimates the action's worth.
//
// Design decisions (from the R2 evaluation, 2026-07-05):
//   - FULL-WIDTH: callers evaluate every legal action, not an LLM-filtered
//     subset. The temp-0.05 tournament proved the LLM's modal policy
//     systematically omits the winning move (attempt_milestone) — any
//     LLM-chosen candidate set would inherit that blind spot.
//   - Heuristic playout policy: deterministic-ish, fast, and the strongest
//     baseline we have (beats the LLM in most matchups).
//   - RNG perturbation: state.rngState carries the dice stream. Each rollout
//     re-seeds via deriveSeed(rngState + actionIdx*PRIME, rolloutIdx), so
//     candidate outcomes vary realistically across rollouts while the whole
//     evaluation stays reproducible for a given input state.
//   - Events truncation: applyAction structuredClones the entire state,
//     including the unbounded events array — O(n^2) over a playout. Nothing
//     in decision logic reads state.events (verified: heuristic + engine
//     handlers only append), so playouts clear it every step.

import { getLegalActions, applyAction, isTerminal } from '../../engine/engine.js';
import { deriveSeed } from '../../engine/rng.js';
import { createHeuristicAgent } from './heuristic.js';

// Terminal/horizon value from `seatIndex`'s perspective. Mirrors the
// tournament reward shape (WIN=100, PER_MILESTONE=25) plus a racing term so
// the search doesn't ignore opponents closing on their third milestone, and
// an XP epsilon to break ties toward progress.
export function defaultValueFn(state, term, seatIndex) {
  const me = state.players[seatIndex].character;
  const msOf = (c) =>
    (c.milestonesCompleted.beginner ? 1 : 0) +
    (c.milestonesCompleted.intermediate ? 1 : 0) +
    (c.milestonesCompleted.expert ? 1 : 0);
  const myMs = msOf(me);
  let bestOppMs = 0;
  for (let i = 0; i < state.players.length; i++) {
    if (i === seatIndex) continue;
    bestOppMs = Math.max(bestOppMs, msOf(state.players[i].character));
  }
  const myNum = state.players[seatIndex].playerNum;
  const iWon = term.done && term.winner === myNum;
  const oppWon = term.done && term.winner != null && term.winner !== myNum;
  return (iWon ? 150 : 0)
       + (oppWon ? -100 : 0)
       + 25 * myMs
       - 10 * bestOppMs
       + 0.02 * me.xp;
}

// A single heuristic playout from `startState` until terminal or step cap.
// Returns the value of the end state. The shared heuristic agent is
// stateless, so one instance serves every seat and every rollout.
async function playout(startState, heuristic, maxSteps, valueFn, seatIndex) {
  let s = startState;
  let steps = 0;
  let term = isTerminal(s);
  while (!term.done && steps < maxSteps) {
    const legal = getLegalActions(s);
    if (!legal.length) break; // defensive; engine guarantees endTurn exists
    const picked = await heuristic.chooseAction({ state: s, legalActions: legal });
    const idx = Number.isInteger(picked?.actionIndex) &&
                picked.actionIndex >= 0 && picked.actionIndex < legal.length
      ? picked.actionIndex : legal.length - 1;
    ({ state: s } = applyAction(s, legal[idx]));
    // Keep clones O(1): the events array is never read for decisions.
    s.events.length = 0;
    steps++;
    term = isTerminal(s);
  }
  return valueFn(s, term, seatIndex);
}

// Evaluate every action in `legalActions` from `state`, for the player at
// `seatIndex` (0-based). Returns per-action stats plus the argmax index.
//
//   const { evals, bestIndex } = await evaluateActions(state, legal, 2, {
//     rolloutsPerAction: 8,
//   });
//   evals[i] = { mean, min, max, n }
export async function evaluateActions(state, legalActions, seatIndex, {
  rolloutsPerAction = 8,
  maxPlayoutSteps = 600,
  valueFn = defaultValueFn,
} = {}) {
  const heuristic = createHeuristicAgent();
  const evals = [];

  for (let i = 0; i < legalActions.length; i++) {
    const values = [];
    for (let r = 0; r < rolloutsPerAction; r++) {
      // Perturb the dice stream per (action, rollout) so the candidate's own
      // resolution (e.g. the climb's dice) varies across rollouts. 7919 is an
      // arbitrary prime to spread action indices in seed space.
      const root = structuredClone(state);
      root.events.length = 0;
      root.rngState = deriveSeed((state.rngState + i * 7919) >>> 0, r);
      let s;
      try {
        ({ state: s } = applyAction(root, legalActions[i]));
      } catch {
        // Should be impossible for a legal action; score as strongly bad so
        // a broken candidate can never win the argmax.
        values.push(-1e9);
        continue;
      }
      s.events.length = 0;
      values.push(await playout(s, heuristic, maxPlayoutSteps, valueFn, seatIndex));
    }
    evals.push({
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      n: values.length,
    });
  }

  let bestIndex = 0;
  for (let i = 1; i < evals.length; i++) {
    if (evals[i].mean > evals[bestIndex].mean) bestIndex = i;
  }
  return { evals, bestIndex };
}

// Pure search agent — no LLM anywhere. Establishes the search-strength
// ceiling: if rollouts alone find the milestone-rush line, the machinery is
// sound and the LLM's prior quality can be measured against it (R2-C).
export function createRolloutAgent({ rolloutsPerAction = 8, maxPlayoutSteps = 600 } = {}) {
  return {
    name: 'rollout',
    async chooseAction({ state, legalActions }) {
      const t0 = Date.now();
      const { evals, bestIndex } = await evaluateActions(
        state, legalActions, state.currentPlayerIndex,
        { rolloutsPerAction, maxPlayoutSteps });
      const ev = evals[bestIndex];
      return {
        actionIndex: bestIndex,
        rationale: `rollout best: EV ${ev.mean.toFixed(1)} (n=${ev.n}, range ${ev.min.toFixed(0)}..${ev.max.toFixed(0)}) in ${Date.now() - t0}ms`,
      };
    },
  };
}
