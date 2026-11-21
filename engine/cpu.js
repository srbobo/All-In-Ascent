// Human-facing CPU opponents — one difficulty ladder for local and online play.
//
//   createCpuAgent(level, { seed }) → agent with chooseAction({ state, legalActions })
//   CPU_LEVELS                      → { easy, medium, hard }: label + settings
//   CPU_MODEL                       → version tag of the bot behind every level
//   cpuSeed(gameSeed, seatIndex)    → the per-seat seed both modes use
//
// Every level is the planner bot (planner.js): one-step expectimax over the
// engine's exact send chances, the strongest and fastest bot we have
// (docs/CPU_PLAYTEST_AUDIT.md §8). Difficulty is how often it plays a random
// legal move instead (epsilon), and whether it uses the per-character tuned
// weights. Local play (game.js, through the browser bundle) and online play
// (party/game.js) both build their CPUs here, so a "Hard CPU" is the same
// opponent everywhere.
//
// CPU_MODEL is recorded in match and replay records (botModel), so the
// dashboard can tell a change in bot skill from a change in game balance.
// Bump it whenever a level's behaviour changes.

import { deriveSeed } from './rng.js';
import { createPlannerAgent } from './planner.js';

export const CPU_MODEL = 'planner-1';

export const CPU_LEVELS = {
  easy:   { label: 'Easy',   epsilon: 0.35, tuned: false },
  medium: { label: 'Medium', epsilon: 0.1,  tuned: false },
  hard:   { label: 'Hard',   epsilon: 0,    tuned: true },
};

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

export function createCpuAgent(level, { seed = 1 } = {}) {
  const key = cpuLevel(level);
  const { epsilon, tuned } = CPU_LEVELS[key];
  const agent = createPlannerAgent({ epsilon, tuned, seed });
  agent.name = `cpu-${key}`;
  agent.level = key;
  agent.model = CPU_MODEL;
  return agent;
}
