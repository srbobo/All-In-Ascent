import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const { createGame } = await import(R + '/engine/state.js');
const { getLegalActions, applyAction } = await import(R + '/engine/engine.js');
const { createRolloutAgent } = await import(R + '/sim/agents/rollout.js');
const { createHeuristicAgent } = await import(R + '/sim/agents/heuristic.js');
const h = createHeuristicAgent();
for (const [label, chars] of [['solo', ['ironLung']], ['3p', ['ironLung','technician','sprinter']]]) {
  for (const [rpa, steps] of [[3, 300], [8, 300], [8, 600]]) {
    const ag = createRolloutAgent({ rolloutsPerAction: rpa, maxPlayoutSteps: steps });
    let { state: s } = createGame({ seed: 5, characterKeys: chars });
    let tot = 0, n = 0;
    for (let i = 0; i < 40; i++) {
      const legal = getLegalActions(s);
      if (i % 8 === 3) { const t0 = Date.now(); await ag.chooseAction({ state: s, legalActions: legal }); tot += Date.now() - t0; n++; }
      const p = await h.chooseAction({ state: s, legalActions: legal });
      ({ state: s } = applyAction(s, legal[p.actionIndex])); s.events.length = 0;
    }
    console.log(label, `rollouts=${rpa} horizon=${steps}`, 'ms/decision', (tot / n).toFixed(0));
  }
}
