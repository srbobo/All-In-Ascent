// Is the rollout "ground truth" stable? Evaluate the same state twice with
// different RNG perturbations and check whether the argmax agrees with itself.
import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const { createGame } = await import(R + '/engine/state.js');
const { getLegalActions, applyAction, isTerminal } = await import(R + '/engine/engine.js');
const { evaluateActions } = await import(R + '/sim/agents/rollout.js');
const { createHeuristicAgent } = await import(R + '/sim/agents/heuristic.js');
const h = createHeuristicAgent();
const chars = ['ironLung', 'technician', 'sprinter'];
let same = 0, total = 0, gaps = [];
for (const seed of [2, 3, 4]) {
  let { state: s } = createGame({ seed, characterKeys: chars });
  let step = 0;
  while (!isTerminal(s).done && step < 160) {
    const legal = getLegalActions(s);
    if (step % 16 === 5 && legal.length > 2) {
      const a = await evaluateActions(s, legal, s.currentPlayerIndex, { rolloutsPerAction: 8, maxPlayoutSteps: 600 });
      const s2 = structuredClone(s); s2.rngState = (s.rngState ^ 0x9e3779b9) >>> 0;
      const b = await evaluateActions(s2, legal, s.currentPlayerIndex, { rolloutsPerAction: 8, maxPlayoutSteps: 600 });
      total++; if (a.bestIndex === b.bestIndex) same++;
      const sorted = a.evals.map(e => e.mean).sort((x, y) => y - x);
      gaps.push(sorted[0] - sorted[1]);
      const sd = Math.sqrt(a.evals[a.bestIndex].n ? a.evals.reduce((acc,e)=>acc+((e.max-e.min)/4)**2,0)/a.evals.length : 0);
      console.log(`seed ${seed} step ${step} n=${legal.length} A=${legal[a.bestIndex].type} B=${legal[b.bestIndex].type} top1-top2 gap ${(sorted[0]-sorted[1]).toFixed(1)} approx per-rollout sd ${sd.toFixed(0)}`);
    }
    const p = await h.chooseAction({ state: s, legalActions: legal });
    ({ state: s } = applyAction(s, legal[p.actionIndex])); s.events.length = 0; step++;
  }
}
console.log(`self-agreement ${same}/${total} = ${(100*same/total).toFixed(0)}%`);
