// The gate: does a candidate value model make the CPU play better than the
// shipped Hard CPU? Only a candidate that wins here is promoted.
//
//   node sim/learn/arena.js [--weights=sim/learn/out/candidate.json] [--solo=200] [--h2h=40]
//                           [--promote] [--report=sim/learn/out/arena.json]
//
// Two tests, on held-out seeds (100000+; self-play training uses < 100000),
// with the Grit rules every real game uses:
//   1. Solo speed — each character, the same seeds for both bots (paired):
//      mean rounds to finish, and the paired difference with a 95% CI.
//   2. Head to head — every ordered character pair × --h2h seeds, each game
//      played twice with the bots swapping seats, so seat order and the
//      character draw cancel out. Win rate of the learned bot, Wilson 95% CI.
// Pass: head-to-head CI lower bound above 50%, and solo not slower overall
// (paired CI upper bound ≤ +0.25 rounds). --promote then writes the weights
// to engine/value-weights.js (run `npm run data:build` after).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS } from '../../engine/data.js';
import { runPool } from './pool.js';
import { GAMES_WORKER } from './games.js';

const arg = (name, dflt) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const weightsPath = arg('weights', 'sim/learn/out/candidate.json');
const value = JSON.parse(readFileSync(weightsPath, 'utf8'));
const SOLO = Number(arg('solo', 200));
const H2H = Number(arg('h2h', 40));
const promote = process.argv.includes('--promote');
const reportPath = arg('report', 'sim/learn/out/arena.json');
const SEED0 = 100000;
// Hard finishes solo in ≤ ~45 rounds; a game still going at 60 counts as a
// stall (scored 60 rounds) and stops, so stalling candidates fail fast.
const MAX_ROUNDS = 60;
const keys = Object.keys(CHARACTERS);

function wilson(w, n, z = 1.96) {
  const p = w / n;
  const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p, lo: c - h, hi: c + h };
}
function meanCI(xs) {
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  const h = 1.96 * sd / Math.sqrt(n);
  return { mean: m, lo: m - h, hi: m + h };
}

const t0 = Date.now();
const progress = (label) => (d, n) => { if (d % 100 === 0 || d === n) process.stdout.write(`\r${label} ${d}/${n}`); };

// 1. Solo speed.
const soloTasks = [];
for (const key of keys) {
  for (let s = 1; s <= SOLO; s++) {
    for (const agent of ['hard', 'learned']) soloTasks.push({ chars: [key], seed: SEED0 + s, agents: [agent], value: agent === 'learned' ? value : null, maxRounds: MAX_ROUNDS });
  }
}
const solo = await runPool(GAMES_WORKER, soloTasks, { onProgress: progress('solo') });
const rounds = (r) => (r.done ? r.rounds : MAX_ROUNDS);
const soloReport = {};
const allDiffs = [];
for (const key of keys) {
  const diffs = [];
  const hard = [];
  const learned = [];
  for (let s = 1; s <= SOLO; s++) {
    const h = solo.find(r => r.chars[0] === key && r.seed === SEED0 + s && r.agents[0] === 'hard');
    const l = solo.find(r => r.chars[0] === key && r.seed === SEED0 + s && r.agents[0] === 'learned');
    hard.push(rounds(h));
    learned.push(rounds(l));
    diffs.push(rounds(l) - rounds(h));
  }
  allDiffs.push(...diffs);
  soloReport[key] = { hard: meanCI(hard).mean, learned: meanCI(learned).mean, diff: meanCI(diffs), unfinished: learned.filter(x => x === MAX_ROUNDS).length };
}
const soloAll = meanCI(allDiffs);
console.log('\n\nSolo rounds to finish (held-out seeds, paired):');
for (const [k, r] of Object.entries(soloReport)) {
  console.log(`  ${k.padEnd(12)} Hard ${r.hard.toFixed(2)} · learned ${r.learned.toFixed(2)} · diff ${r.diff.mean >= 0 ? '+' : ''}${r.diff.mean.toFixed(2)} [${r.diff.lo.toFixed(2)}, ${r.diff.hi.toFixed(2)}]${r.unfinished ? ` · ${r.unfinished} unfinished` : ''}`);
}
console.log(`  all          diff ${soloAll.mean >= 0 ? '+' : ''}${soloAll.mean.toFixed(2)} rounds [${soloAll.lo.toFixed(2)}, ${soloAll.hi.toFixed(2)}]`);

// 2. Head to head, seats swapped.
const h2hTasks = [];
for (const a of keys) {
  for (const b of keys) {
    if (a === b) continue;
    for (let s = 1; s <= H2H; s++) {
      const seed = SEED0 + 50000 + s;
      h2hTasks.push({ chars: [a, b], seed, agents: ['learned', 'hard'], value, maxRounds: MAX_ROUNDS });
      h2hTasks.push({ chars: [a, b], seed, agents: ['hard', 'learned'], value, maxRounds: MAX_ROUNDS });
    }
  }
}
const h2h = await runPool(GAMES_WORKER, h2hTasks, { onProgress: progress('head-to-head') });
let wins = 0;
let decided = 0;
const byChar = Object.fromEntries(keys.map(k => [k, { w: 0, n: 0 }]));
for (const r of h2h) {
  if (r.winnerSeat < 0) continue;
  decided++;
  const learnedSeat = r.agents.indexOf('learned');
  const won = r.winnerSeat === learnedSeat;
  if (won) wins++;
  const k = r.chars[learnedSeat];
  byChar[k].n++;
  if (won) byChar[k].w++;
}
const wr = wilson(wins, decided);
console.log(`\n\nHead to head vs Hard (${decided} decided of ${h2h.length}): learned wins ${(wr.p * 100).toFixed(1)}% [${(wr.lo * 100).toFixed(1)}, ${(wr.hi * 100).toFixed(1)}]`);
for (const [k, c] of Object.entries(byChar)) console.log(`  as ${k.padEnd(12)} ${(100 * c.w / c.n).toFixed(1)}% of ${c.n}`);

const pass = wr.lo > 0.5 && soloAll.hi <= 0.25;
console.log(`\nGate: ${pass ? 'PASS' : 'FAIL'} (needs head-to-head lower bound > 50% and solo not slower)  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
const report = {
  weights: weightsPath, at: new Date().toISOString(), soloSeeds: SOLO, h2hSeeds: H2H,
  solo: soloReport, soloAll, h2h: { wins, decided, ...wr, byChar }, pass,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (promote) {
  if (!pass) { console.log('not promoted: the gate failed'); process.exit(1); }
  const meta = { ...value.meta, arena: { soloDiff: +soloAll.mean.toFixed(3), h2hWinRate: +wr.p.toFixed(4), h2hLo: +wr.lo.toFixed(4), decided } };
  const body = `// Learned value-model weights (engine/value-model.js) — written by
// sim/learn/train.js and promoted by sim/learn/arena.js (do not edit by hand).
// A plain module (not JSON) so the browser bundle (build-browser.js) can include it.

export const VALUE_WEIGHTS = ${JSON.stringify({ ...value, meta })};
`;
  writeFileSync('engine/value-weights.js', body);
  console.log('promoted → engine/value-weights.js (run npm run data:build)');
}
