// ============================================================================
// DEAD CODE — archived LLM learning program (closed 2026-10-10).
// Kept as a record of the experiment only. Not used by the game, the CPU
// opponents, or the playtest pipeline, and not maintained. Its labels came
// from the rollout search, which the CPU audit found too noisy to serve as
// ground truth (docs/CPU_PLAYTEST_AUDIT.md, F2). See
// docs/LLM_LEARNING_EXPERIMENTS.md for what was learned.
// ============================================================================
//
// Split generated pairs into train/valid/test — BY GAME, never by example.
// Examples within a game are heavily correlated (same trajectory, adjacent
// states); an example-level split leaks near-duplicates into test and
// inflates the eval. Deterministic game shuffle via mulberry32 so re-runs
// produce identical splits.
//
// Outputs (mlx-lm chat format, one {"messages": [...]} per line):
//   <out>/train.jsonl  ~80% of games
//   <out>/valid.jsonl  ~10% (mlx-lm uses this for val loss during training)
//   <out>/test.jsonl   ~10% (held out for the Z3/Z5 agreement evals)
//   <out>/test-meta.jsonl  sidecar: meta per test line (same order) so the
//                          eval can break agreement down by actionType etc.
//
// USAGE: node training/split-data.js training-data/run1/pairs.jsonl training/data

import fs from 'node:fs';
import path from 'node:path';

const [pairsPath, outDir] = process.argv.slice(2);
if (!pairsPath || !outDir) {
  console.error('usage: node training/split-data.js <pairs.jsonl> <out-dir>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const pairs = fs.readFileSync(pairsPath, 'utf8').trim().split('\n').map(JSON.parse);
// Group by SEED, not gameId — seeds are globally unique across generation
// runs (the run was split into run1 + run1b after the playout-cap patch),
// while gameId restarts at 0 per run and would merge unrelated games.
const byGame = new Map();
for (const p of pairs) {
  const id = p.meta.seed;
  if (!byGame.has(id)) byGame.set(id, []);
  byGame.get(id).push(p);
}

// Deterministic shuffle of game ids (mulberry32, fixed seed).
let s = 0xC0FFEE >>> 0;
const rand = () => {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gameIds = [...byGame.keys()];
for (let i = gameIds.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [gameIds[i], gameIds[j]] = [gameIds[j], gameIds[i]];
}

const nTest = Math.max(1, Math.round(gameIds.length * 0.10));
const nValid = Math.max(1, Math.round(gameIds.length * 0.10));
const testIds = new Set(gameIds.slice(0, nTest));
const validIds = new Set(gameIds.slice(nTest, nTest + nValid));

const buckets = { train: [], valid: [], test: [] };
for (const [id, ps] of byGame) {
  const b = testIds.has(id) ? 'test' : validIds.has(id) ? 'valid' : 'train';
  buckets[b].push(...ps);
}

// mlx-lm wants {"messages": [...]} only; meta goes to the sidecar.
for (const name of ['train', 'valid', 'test']) {
  const lines = buckets[name].map(p => JSON.stringify({ messages: p.messages }));
  fs.writeFileSync(path.join(outDir, `${name}.jsonl`), lines.join('\n') + '\n');
}
fs.writeFileSync(path.join(outDir, 'test-meta.jsonl'),
  buckets.test.map(p => JSON.stringify(p.meta)).join('\n') + '\n');

const dist = (ps) => {
  const d = {};
  for (const p of ps) d[p.meta.actionType] = (d[p.meta.actionType] || 0) + 1;
  return d;
};
console.log(`games: ${gameIds.length} → train ${gameIds.length - nTest - nValid}, valid ${nValid}, test ${nTest}`);
for (const name of ['train', 'valid', 'test']) {
  console.log(`${name}: ${buckets[name].length} pairs`, JSON.stringify(dist(buckets[name])));
}
