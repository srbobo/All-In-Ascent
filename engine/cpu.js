// Human-facing CPU opponents — one difficulty ladder for local and online play.
//
//   createCpuAgent(level, { seed, rating }) → agent with chooseAction({ state, legalActions })
//   CPU_LEVELS                      → { easy, medium, hard, adaptive }: label + settings
//   CPU_MODEL                       → version tag of the bot behind every level
//   cpuSeed(gameSeed, seatIndex)    → the per-seat seed both modes use
//   cpuRating(level, rating)        → a CPU's strength on the player-rating scale
//   epsilonForRating(rating)        → the Adaptive CPU's random-move rate
//
// Every level is the planner bot (planner.js): one-step expectimax over the
// engine's exact send chances, the strongest and fastest bot we have
// (docs/CPU_PLAYTEST_AUDIT.md §8). Difficulty is how often it plays a random
// legal move instead (epsilon), and whether it uses the per-character tuned
// weights. Local play (game.js, through the browser bundle) and online play
// (party/game.js) both build their CPUs here, so a "Hard CPU" is the same
// opponent everywhere.
//
// The Adaptive level (Phase 4) plays the player's own rating
// (player-profile.js): the tuned planner with the random-move rate whose
// measured strength matches it (CPU_STRENGTH), so games stay close.
//
// CPU_MODEL is recorded in match and replay records (botModel), so the
// dashboard can tell a change in bot skill from a change in game balance.
// Bump it whenever a level's behaviour changes.

import { deriveSeed } from './rng.js';
import { createPlannerAgent } from './planner.js';

export const CPU_MODEL = 'planner-1';

// Strength on the player-rating scale (Elo, Hard = 1600), measured head to
// head: Hard beat Medium 117–83 and Easy 157–43 over 200 games each.
export const CPU_LEVELS = {
  easy:     { label: 'Easy',     epsilon: 0.35, tuned: false, rating: 1375 },
  medium:   { label: 'Medium',   epsilon: 0.1,  tuned: false, rating: 1540 },
  hard:     { label: 'Hard',     epsilon: 0,    tuned: true,  rating: 1600 },
  adaptive: { label: 'Adaptive', epsilon: null, tuned: true,  rating: null },
};

// The tuned planner's strength at each random-move rate ε, by rating
// (strongest first). Measured by sim/learn/calibrate-epsilon.js: ε-Hard vs
// Hard over every ordered character pair, seats swapped, Grit rules.
// Rating = 1600 + the Elo gap of its win rate against Hard (480 games per
// point; ε = 1, which never won, is left out — its gap is not measurable).
// Below 964 the Adaptive CPU plays at ε = 0.7, its weakest.
export const CPU_STRENGTH = [
  { epsilon: 0,    rating: 1600 },
  { epsilon: 0.05, rating: 1578 }, // 46.9% vs Hard
  { epsilon: 0.1,  rating: 1546 }, // 42.3%
  { epsilon: 0.2,  rating: 1497 }, // 35.6%
  { epsilon: 0.35, rating: 1372 }, // 21.3%
  { epsilon: 0.5,  rating: 1272 }, // 13.1%
  { epsilon: 0.7,  rating: 964 },  //  2.5%
];

// A new player starts level with the Medium CPU.
export const START_RATING = 1540;

export const CPU_LEVEL_KEYS = Object.keys(CPU_LEVELS);

// A known level key; anything else (missing, misspelt, from an old client)
// is played as Easy.
export function cpuLevel(level) {
  return Object.prototype.hasOwnProperty.call(CPU_LEVELS, level) ? level : 'easy';
}

// Per-seat seed: the CPU's random choices are reproducible from the game seed.
export function cpuSeed(gameSeed, seatIndex) {
  return deriveSeed(gameSeed >>> 0, 1000 + seatIndex);
}

// The random-move rate at which the tuned planner plays at `rating`
// (linear between measured points; clamped to the curve's ends).
export function epsilonForRating(rating) {
  const r = Number.isFinite(rating) ? rating : START_RATING;
  const curve = CPU_STRENGTH;
  if (r >= curve[0].rating) return curve[0].epsilon;
  const last = curve[curve.length - 1];
  if (r <= last.rating) return last.epsilon;
  for (let i = 1; i < curve.length; i++) {
    const hi = curve[i - 1];
    const lo = curve[i];
    if (r >= lo.rating) return lo.epsilon + (hi.epsilon - lo.epsilon) * (r - lo.rating) / (hi.rating - lo.rating);
  }
  return last.epsilon;
}

// A CPU's strength on the player-rating scale: the level's measured rating,
// or for Adaptive the rating it was set to play at (clamped to the curve).
export function cpuRating(level, rating = null) {
  const key = cpuLevel(level);
  if (key !== 'adaptive') return CPU_LEVELS[key].rating;
  const r = Number.isFinite(rating) ? rating : START_RATING;
  return Math.min(CPU_STRENGTH[0].rating, Math.max(CPU_STRENGTH[CPU_STRENGTH.length - 1].rating, r));
}

// `rating`: for the Adaptive level, the rating to play at (the player's).
export function createCpuAgent(level, { seed = 1, rating = null } = {}) {
  const key = cpuLevel(level);
  const lv = CPU_LEVELS[key];
  const epsilon = key === 'adaptive' ? epsilonForRating(rating) : lv.epsilon;
  const agent = createPlannerAgent({ epsilon, tuned: lv.tuned, seed });
  agent.name = `cpu-${key}`;
  agent.level = key;
  agent.model = CPU_MODEL;
  agent.epsilon = epsilon;
  agent.rating = cpuRating(key, rating);
  return agent;
}
