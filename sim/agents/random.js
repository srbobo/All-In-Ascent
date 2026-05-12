// Uniform-random agent. Control / baseline only.
//
// What it does:
//   Picks one action uniformly at random from the legal actions list each
//   turn. Uses its OWN seeded RNG so two runs of the same (game_seed,
//   policy_seed, characters) produce byte-identical games.
//
// Why it exists:
//   Without a "worst reasonable" baseline, we can't tell whether an LLM
//   agent is genuinely playing well or just beating another bad agent.
//   Random is that floor.
//
// Interface (shared by all agents):
//   createAgent(options) → {
//     name: string,
//     chooseAction({ state, legalActions, player }) → Promise<{
//       actionIndex: number,
//       rationale: string,
//     }>
//   }

import { createRng } from '../../engine/rng.js';

export function createRandomAgent({ seed = 1 } = {}) {
  // Each agent has its OWN RNG stream, separate from the game's dice RNG.
  // This means turn-order is stable under a fixed policy seed regardless
  // of how many dice the game rolls.
  const rng = createRng(seed);
  return {
    name: 'random',
    async chooseAction({ legalActions }) {
      const idx = Math.floor(rng.next() * legalActions.length);
      return {
        actionIndex: idx,
        rationale: `random pick (${idx + 1}/${legalActions.length})`,
      };
    },
  };
}
