// Balance sweeps with the fast bots, in parallel, with confidence intervals.
//
//   node sim/run-balance.js solo  [--agent=planner] [--seeds=1-300]
//       Rounds to ring the bell, per character, playing alone.
//   node sim/run-balance.js pairs [--agent=planner] [--games=100]
//       2-player round robin, every ordered pair of characters.
//   node sim/run-balance.js vs --agent=planner --opponent=heuristic [--games=60]
//       Bot A vs bot B: every character pair, both seat orders. Measures the
//       BOT, not the characters (each bot plays every character equally).
//
// Common flags:
//   --chars=ironLung,technician   restrict the characters
//   --workers=N                   worker threads (default: cores − 1)
//   --max-rounds=200              stop a game here (counted as unfinished)
//   --params='{"pMin":0.4}'       planner weight overrides
//   --json=path                   also write raw results
//
// Seeds are fixed by default, so a run is reproducible; change --seeds /
// --seed-base to sample new games.

import { writeFileSync } from 'node:fs';
import { CHARACTERS } from '../engine/data.js';
import { ENGINE_VERSION_STRING } from '../engine/version.js';
import { runGames, wilson, medianCI, mean } from './balance-pool.js';

const argv = process.argv.slice(2);
const mode = argv.find(a => !a.startsWith('--')) || 'solo';
const flag = (name, dflt) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const ALL = Object.keys(CHARACTERS);
const chars = flag('chars', ALL.join(',')).split(',');
const agent = flag('agent', 'planner');
const opponent = flag('opponent', 'heuristic');
const maxRounds = Number(flag('max-rounds', 200));
const workers = flag('workers') ? Number(flag('workers')) : undefined;
const params = flag('params') ? JSON.parse(flag('params')) : null;
const seedBase = Number(flag('seed-base', 1));
const jsonOut = flag('json');

function parseSeeds(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let s = a; s <= (b || a); s++) out.push(s);
  }
  return out;
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const ci = (w) => `${pct(w.p)} [${pct(w.lo)}–${pct(w.hi)}]`;
const pad = (s, n) => String(s).padEnd(n);

let tasks = [];
if (mode === 'solo') {
  const seeds = parseSeeds(flag('seeds', '1-300'));
  for (const c of chars) for (const seed of seeds) tasks.push({ chars: [c], seed, agents: [agent], maxRounds, params });
} else if (mode === 'pairs') {
  const games = Number(flag('games', 100));
  for (const a of chars) for (const b of chars) {
    if (a === b) continue;
    for (let g = 0; g < games; g++) tasks.push({ chars: [a, b], seed: seedBase + g, agents: [agent, agent], maxRounds, params });
  }
} else if (mode === 'vs') {
  const games = Number(flag('games', 60));
  for (const a of chars) for (const b of chars) {
    if (a === b) continue;
    for (let g = 0; g < games; g++) {
      tasks.push({ chars: [a, b], seed: seedBase + g, agents: [agent, opponent], maxRounds, params });
      tasks.push({ chars: [a, b], seed: seedBase + g, agents: [opponent, agent], maxRounds, params });
    }
  }
} else {
  console.error(`unknown mode "${mode}" (solo | pairs | vs)`);
  process.exit(1);
}

const t0 = Date.now();
let lastTick = 0;
const results = await runGames(tasks, {
  workers,
  onProgress: (done, total) => {
    if (Date.now() - lastTick > 5000 || done === total) {
      lastTick = Date.now();
      process.stderr.write(`  ${done}/${total} games (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
    }
  },
});
const secs = (Date.now() - t0) / 1000;
const msDec = mean(results.map(r => r.msPerDecision));

console.log(`\nengine v${ENGINE_VERSION_STRING} · mode ${mode} · ${results.length} games in ${secs.toFixed(0)}s · ${msDec.toFixed(2)} ms/decision · max ${maxRounds} rounds`);
if (params) console.log(`planner params: ${JSON.stringify(params)}`);

if (mode === 'solo') {
  console.log(`agent: ${agent}\n`);
  console.log(`${pad('climber', 13)}${pad('finished', 10)}${pad('median rounds [95% CI]', 24)}${pad('mean', 7)}${pad('p90', 6)}trains/game  climbs/game  stalls`);
  for (const c of chars) {
    const rs = results.filter(r => r.chars[0] === c);
    const fin = rs.filter(r => r.done);
    const rounds = rs.map(r => (r.done ? r.rounds : maxRounds));
    const m = medianCI(rounds);
    const sorted = [...rounds].sort((a, b) => a - b);
    const per = (k) => mean(rs.map(r => r.actions[0][k] || 0)).toFixed(1);
    console.log(`${pad(c, 13)}${pad(`${fin.length}/${rs.length}`, 10)}${pad(`${m.median} [${m.lo}–${m.hi}]`, 24)}${pad(mean(rounds).toFixed(1), 7)}${pad(sorted[Math.floor(sorted.length * 0.9)], 6)}${pad(per('train'), 13)}${pad(per('climb'), 13)}${mean(rs.map(r => r.stalls[0])).toFixed(2)}`);
  }
  // Expert-wall effect: does where the expert lands decide game length?
  console.log('\nmedian rounds by expert milestone wall:');
  for (const wall of ['bouldering', 'topRope', 'leadClimbing']) {
    const row = chars.map(c => {
      const rs = results.filter(r => r.chars[0] === c && r.expertWall === wall).map(r => (r.done ? r.rounds : maxRounds));
      return rs.length ? `${c} ${medianCI(rs).median} (n=${rs.length})` : `${c} –`;
    });
    console.log(`  ${pad(wall, 14)}${row.join(' · ')}`);
  }
} else if (mode === 'pairs') {
  console.log(`agent: ${agent} (both seats)\n`);
  console.log(`${pad('climber', 13)}${pad('win rate [95% CI]', 26)}games`);
  for (const c of chars) {
    const rs = results.filter(r => r.chars.includes(c));
    const wins = rs.filter(r => r.winnerSeat >= 0 && r.chars[r.winnerSeat] === c).length;
    console.log(`${pad(c, 13)}${pad(ci(wilson(wins, rs.length)), 26)}${rs.length}`);
  }
  const seat0 = results.filter(r => r.winnerSeat === 0).length;
  const decided = results.filter(r => r.winnerSeat >= 0).length;
  console.log(`\nseat 1 wins ${ci(wilson(seat0, decided))} of decided games · unfinished ${results.length - decided}`);
  console.log('\nrow beats column (row = seat 1 or 2, both orders pooled):');
  console.log(pad('', 13) + chars.map(c => pad(c.slice(0, 10), 12)).join(''));
  for (const a of chars) {
    const cells = chars.map(b => {
      if (a === b) return pad('—', 12);
      const rs = results.filter(r => r.chars.includes(a) && r.chars.includes(b));
      const w = rs.filter(r => r.winnerSeat >= 0 && r.chars[r.winnerSeat] === a).length;
      return pad(pct(w / rs.length), 12);
    });
    console.log(pad(a, 13) + cells.join(''));
  }
} else {
  console.log(`${agent} vs ${opponent}, every character pair, both seat orders\n`);
  const mine = (r) => r.agents.indexOf(agent);
  const wins = results.filter(r => r.winnerSeat === mine(r)).length;
  const decided = results.filter(r => r.winnerSeat >= 0).length;
  console.log(`${agent} wins ${ci(wilson(wins, results.length))} of ${results.length} games (unfinished ${results.length - decided})`);
  console.log(`\nby the character ${agent} played:`);
  for (const c of chars) {
    const rs = results.filter(r => r.chars[mine(r)] === c);
    const w = rs.filter(r => r.winnerSeat === mine(r)).length;
    console.log(`  ${pad(c, 13)}${ci(wilson(w, rs.length))}`);
  }
  const roundsWon = (who) => medianCI(results.filter(r => r.winnerSeat >= 0 && r.agents[r.winnerSeat] === who).map(r => r.rounds)).median;
  console.log(`\nmedian game length when ${agent} wins: ${roundsWon(agent)} rounds · when ${opponent} wins: ${roundsWon(opponent)}`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ engine: ENGINE_VERSION_STRING, mode, agent, opponent, params, maxRounds, results }, null, 1));
  console.log(`\nraw results → ${jsonOut}`);
}
