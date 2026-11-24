// Generate value-model training data from solo self-play.
//
//   node sim/learn/selfplay.js [--games=400] [--seed-start=1] [--agent=hard|learned]
//                              [--labels=rollout|game] [--epsilon=0.15] [--sample-rate=0.15]
//                              [--weights=sim/learn/out/candidate.json] [--out=sim/learn/data/hard.jsonl]
//
// Plays --games solo games per character (GRIT_RULES) with the shipped Hard
// CPU, or with Hard + a candidate value model (--agent=learned: the DAgger
// step — label the states the learned bot itself visits). Writes one JSON
// line per decision: { key, seed, f (value features), y (Time actually used
// to finish) }. Seeds below 100000 are training seeds; the arena uses
// 100000+ so evaluation never sees training games.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS } from '../../engine/data.js';
import { runPool } from './pool.js';
import { GAMES_WORKER } from './games.js';

const arg = (name, dflt) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const games = Number(arg('games', 400));
const seedStart = Number(arg('seed-start', 1));
const agent = arg('agent', 'hard');
const out = arg('out', `sim/learn/data/${agent}.jsonl`);
const value = agent === 'learned' ? JSON.parse(readFileSync(arg('weights', 'sim/learn/out/candidate.json'), 'utf8')) : null;
if (seedStart + games > 100000) throw new Error('training seeds must stay below 100000 (the arena uses 100000+)');

// --labels=rollout (default): explore with --epsilon and label sampled states
// by letting Hard finish from them (sim/learn/games.js rolloutSamples).
// --labels=game: label every decision with the behaviour game's own outcome.
const labels = arg('labels', 'rollout');
const epsilon = Number(arg('epsilon', 0.15));
const sampleRate = Number(arg('sample-rate', 0.15));
const tasks = [];
for (const key of Object.keys(CHARACTERS)) {
  for (let g = 0; g < games; g++) {
    tasks.push(labels === 'rollout'
      ? { kind: 'rollouts', key, seed: seedStart + g, behavior: agent, value, epsilon, sampleRate }
      : { chars: [key], seed: seedStart + g, agents: [agent], value, record: true });
  }
}
const t0 = Date.now();
const results = await runPool(GAMES_WORKER, tasks, {
  onProgress: (d, n) => { if (d % 200 === 0 || d === n) process.stdout.write(`\r${d}/${n} games`); },
});
const lines = results.flatMap(r => r.samples.map(s => JSON.stringify(s)));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');
const unfinished = results.filter(r => !r.done).length;
console.log(`\n${lines.length} samples from ${results.length} games (${unfinished} unfinished) → ${out} [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
