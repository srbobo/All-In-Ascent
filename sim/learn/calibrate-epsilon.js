// Measure how strong the Hard CPU is when it plays a random legal move with
// probability ε — the curve the Adaptive CPU (engine/player-profile.js) uses
// to match a player's rating.
//
//   node sim/learn/calibrate-epsilon.js [--seeds=12] [--eps=0.05,0.1,...]
//
// For each ε: every ordered pair of different characters × --seeds seeds,
// each game played twice with the bots swapping seats, ε-Hard vs Hard (Grit
// rules, held-out seeds 200000+). Prints the win rate and the Elo gap
// 400·log10(p / (1 − p)) relative to Hard.

import { CHARACTERS } from '../../engine/data.js';
import { runPool } from './pool.js';
import { GAMES_WORKER } from './games.js';

const arg = (name, dflt) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const SEEDS = Number(arg('seeds', 12));
const EPS = arg('eps', '0.05,0.1,0.2,0.35,0.5,0.7,1').split(',').map(Number);
const keys = Object.keys(CHARACTERS);

const tasks = [];
for (const eps of EPS) {
  for (const a of keys) for (const b of keys) {
    if (a === b) continue;
    for (let s = 1; s <= SEEDS; s++) {
      const seed = 200000 + s;
      tasks.push({ chars: [a, b], seed, agents: [`eps:${eps}`, 'hard'], maxRounds: 80 });
      tasks.push({ chars: [a, b], seed, agents: ['hard', `eps:${eps}`], maxRounds: 80 });
    }
  }
}
const results = await runPool(GAMES_WORKER, tasks, {
  onProgress: (d, n) => { if (d % 200 === 0 || d === n) process.stdout.write(`\r${d}/${n}`); },
});
console.log('\n\nε      win% vs Hard   Elo gap');
const out = [];
for (const eps of EPS) {
  const rs = results.filter(r => r.agents.includes(`eps:${eps}`));
  let w = 0;
  let n = 0;
  for (const r of rs) {
    if (r.winnerSeat < 0) continue;
    n++;
    if (r.agents[r.winnerSeat] !== 'hard') w++;
  }
  const p = Math.min(0.995, Math.max(0.005, w / n));
  const elo = 400 * Math.log10(p / (1 - p));
  out.push({ eps, winRate: +(w / n).toFixed(4), games: n, elo: Math.round(elo) });
  console.log(`${String(eps).padEnd(6)} ${(100 * w / n).toFixed(1).padStart(6)}% of ${n}   ${Math.round(elo)}`);
}
console.log(JSON.stringify(out));
