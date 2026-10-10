// Compare rule variants with the planner bot (balance experiments).
//
//   node sim/run-variants.js [--only=baseline,cap10] [--seeds=1-100] [--games=30]
//
// Each variant is a `rules` object (engine helpers trainingSpec) applied to
// every game. For each: solo games per character (seeds) and a 2-player round
// robin (games per ordered pair) with the planner. Per variant the bot's
// gear-saving weight is picked (0 / 0.5 / 1) by solo speed, so each rule set
// is played near its best — otherwise a variant that makes gear worth buying
// would be judged by a bot that won't buy it. Reports game length, how climbers
// spend their Time, gear bought, final Level, and character win rates.

import { writeFileSync } from 'node:fs';
import { CHARACTERS, GEAR_SHOP } from '../engine/data.js';
import { runGames, wilson, medianCI, mean } from './balance-pool.js';

export const VARIANTS = {
  baseline:      { label: 'Standard rules', rules: {} },
  time3:         { label: 'Training costs 3 Time', rules: { trainTime: 3 } },
  time4:         { label: 'Training costs 4 Time', rules: { trainTime: 4 } },
  bonus3:        { label: 'Training gives +3', rules: { trainBonus: 3 } },
  endurance2x:   { label: 'Training costs 2× Endurance', rules: { trainEnduranceMult: 2 } },
  cap10:         { label: 'Cap: training ≤ 10 + 5×(Level−1) per stat', rules: { trainCapBase: 10, trainCapPerLevel: 5 } },
  cap5:          { label: 'Cap: training ≤ 5×Level per stat', rules: { trainCapBase: 5, trainCapPerLevel: 5 } },
  perRound1:     { label: '1 training session per round', rules: { trainPerRound: 1 } },
  perRound2:     { label: '2 training sessions per round', rules: { trainPerRound: 2 } },
  cap10round2:   { label: 'Cap 10 + 5×(Level−1), and 2 sessions per round', rules: { trainCapBase: 10, trainCapPerLevel: 5, trainPerRound: 2 } },
};

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const parseSeeds = (spec) => spec.split(',').flatMap(part => {
  const [a, b] = part.split('-').map(Number);
  return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i);
});
const only = flag('only') ? flag('only').split(',') : Object.keys(VARIANTS);
const seeds = parseSeeds(flag('seeds', '1-100'));
const games = Number(flag('games', 30));
const maxRounds = Number(flag('max-rounds', 150));
const CHARS = Object.keys(CHARACTERS);
const ACCESS = new Set(['Belay Device', 'Locking Carabiner', 'Lead Rope']);
const MARKET = new Set(GEAR_SHOP.filter(g => !ACCESS.has(g.name)).map(g => g.name));

const GEAR_WEIGHTS = flag('gear-weights', '0,0.5,1').split(',').map(Number);
const pct = (x) => `${Math.round(100 * x)}%`;
const out = {};

for (const key of only) {
  const v = VARIANTS[key];
  const t0 = Date.now();
  // The bot should play each rule set near its best, so try it with
  // gear-saving off / half / full and keep whichever finishes fastest solo.
  let solo = null;
  let params = null;
  let bestMean = Infinity;
  for (const gearWeight of GEAR_WEIGHTS) {
    const p = { gearWeight };
    const rs = await runGames(CHARS.flatMap(c => seeds.map(seed => ({
      chars: [c], seed, agents: ['planner'], maxRounds, rules: v.rules, params: p,
    }))));
    const m = mean(rs.map(r => (r.done ? r.rounds : maxRounds)));
    if (m < bestMean) { bestMean = m; solo = rs; params = p; }
  }
  const pairs = await runGames(CHARS.flatMap(a => CHARS.filter(b => b !== a).flatMap(b =>
    Array.from({ length: games }, (_, g) => ({ chars: [a, b], seed: 7001 + g, agents: ['planner', 'planner'], maxRounds, rules: v.rules, params })))));

  // How a climber spends Time, over all solo games.
  const share = { train: 0, climb: 0, milestone: 0, rest: 0, buyGear: 0, endTurn: 0 };
  for (const r of solo) for (const [k, t] of Object.entries(r.timeSpent[0])) share[k] = (share[k] || 0) + t;
  const tot = Object.values(share).reduce((a, b) => a + b, 0);
  const marketPerGame = mean(solo.map(r => r.gear[0].filter(n => MARKET.has(n)).length));
  const soloRounds = Object.fromEntries(CHARS.map(c => [c, medianCI(solo.filter(r => r.chars[0] === c).map(r => (r.done ? r.rounds : maxRounds))).median]));
  const finished = solo.filter(r => r.done).length / solo.length;
  const win = Object.fromEntries(CHARS.map(c => {
    const rs = pairs.filter(r => r.chars.includes(c));
    return [c, wilson(rs.filter(r => r.winnerSeat >= 0 && r.chars[r.winnerSeat] === c).length, rs.length)];
  }));
  const rates = CHARS.map(c => win[c].p);
  const decided = pairs.filter(r => r.winnerSeat >= 0);
  out[key] = {
    label: v.label, rules: v.rules, botParams: params,
    soloRounds, finished,
    meanRounds: mean(solo.map(r => (r.done ? r.rounds : maxRounds))),
    timeShare: Object.fromEntries(Object.entries(share).map(([k, t]) => [k, t / tot])),
    trains: mean(solo.map(r => r.actions[0].train || 0)),
    climbs: mean(solo.map(r => r.actions[0].climb || 0)),
    marketGear: marketPerGame,
    level: mean(solo.map(r => r.levels[0])),
    winRates: Object.fromEntries(CHARS.map(c => [c, win[c].p])),
    winSpread: Math.max(...rates) - Math.min(...rates),
    seat1: decided.filter(r => r.winnerSeat === 0).length / Math.max(1, decided.length),
    msPerDecision: mean(solo.map(r => r.msPerDecision)),
  };
  const o = out[key];
  console.log(`\n${key} — ${v.label}  [${((Date.now() - t0) / 1000).toFixed(0)}s, bot gearWeight ${params.gearWeight}]`);
  console.log(`  solo median rounds: ${CHARS.map(c => `${c} ${soloRounds[c]}`).join(' · ')}  (finished ${pct(finished)})`);
  console.log(`  Time spent: train ${pct(o.timeShare.train)} · climb ${pct(o.timeShare.climb)} · milestone ${pct(o.timeShare.milestone)} · rest ${pct(o.timeShare.rest)} · gear ${pct(o.timeShare.buyGear || 0)} · idle ${pct(o.timeShare.endTurn || 0)}`);
  console.log(`  per game: ${o.trains.toFixed(1)} trains · ${o.climbs.toFixed(1)} climbs · ${o.marketGear.toFixed(2)} market gear · ends at Level ${o.level.toFixed(1)}`);
  console.log(`  2P win rate: ${CHARS.map(c => `${c} ${pct(win[c].p)}`).join(' · ')}  (spread ${pct(o.winSpread)}, seat 1 ${pct(o.seat1)})`);
}

writeFileSync(new URL('../results/planner-v0.8.0/variants.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('\nwrote results/planner-v0.8.0/variants.json');
