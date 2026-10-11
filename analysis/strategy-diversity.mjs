// Does a ruleset reward creative, varied play? Measured with the planner.
//
//   node analysis/strategy-diversity.mjs [--games=15] [--only=standard,grit,packageD]
//
// For each ruleset, plays a 2-player round robin (every ordered character
// pair) and summarises each climber's play per game as a profile: how Time is
// split, which walls they climb, how often they fall, what they train, how
// much gear they buy, where they finish. Then reports:
//   - Asymmetry: how far apart the five climbers' average profiles are
//     (do the characters play differently?).
//   - Replay variety: how far single games stray from their climber's average
//     (does the best plan change with the setup?), plus the entropy of
//     Milestone order and gear choices.
//   - Identity: each climber's signature (falls, volume, Versatility, ...).
//   - Decision tension: share of turns where a different productive action
//     came within 1 Time of the best.
// The planner is one strong, consistent player; human creativity can only
// widen what it finds, so treat these as a floor on variety.

import { CHARACTERS } from '../engine/data.js';
import { GRIT_RULES } from '../engine/helpers.js';
import { runGames, mean } from '../sim/balance-pool.js';

const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const games = Number(flag('games', 15));

const withChars = (base, chars) => {
  const characters = { ...(base.characters || {}) };
  for (const [k, v] of Object.entries(chars)) characters[k] = { ...(characters[k] || {}), ...v };
  return { ...base, characters };
};
const RULESETS = {
  standard: { label: 'Standard rules (v0.8)', rules: null },
  grit: { label: 'GRIT_RULES', rules: GRIT_RULES },
  packageD: {
    label: 'GRIT_RULES + Package D + Free Solo +2 Grit/round',
    rules: withChars(GRIT_RULES, {
      routeReader: { ability: { nearMiss: 3 } },
      sprinter: { ability: { xpMultiplier: 0.75 } },
      technician: { ability: { extraTime: 0 } },
      ironLung: { ability: { failXpBonus: 0 } },
      freeSolo: { gritPerRound: 2 },
    }),
  },
  traitB3: {
    label: 'GRIT_RULES + trait-preserving package B3',
    rules: withChars(GRIT_RULES, {
      routeReader: { ability: { nearMiss: 3, shiftOnMilestones: true } },
      sprinter: { ability: { xpMultiplier: 0.85 } },
      technician: { ability: { extraTimeOn: 'milestone' } },
      ironLung: { body: { growth: { strength: 2, technique: 2, focus: 2.5, flexibility: 1.5 } } },
      freeSolo: { gritPerRound: 2 },
    }),
  },
};
const only = flag('only') ? flag('only').split(',') : Object.keys(RULESETS);
const CHARS = Object.keys(CHARACTERS);
const MARKET_SKIP = new Set(['Belay Device', 'Locking Carabiner', 'Lead Rope']);
const STATS = ['strength', 'technique', 'focus', 'flexibility'];

const share = (obj, keys) => {
  const tot = keys.reduce((a, k) => a + (obj[k] || 0), 0) || 1;
  return keys.map(k => (obj[k] || 0) / tot);
};
function profile(r, seat) {
  const d = r.detail[seat];
  const t = share(r.timeSpent[seat], ['train', 'climb', 'milestone', 'rest', 'buyGear']);
  const walls = share(d.wallClimbs, ['bouldering', 'topRope', 'leadClimbing']);
  const trains = share(d.trainStats, STATS);
  const fallRate = d.falls / Math.max(1, d.sends + d.falls);
  const gear = r.gear[seat].filter(n => !MARKET_SKIP.has(n)).length / 5;
  return [...t, ...walls, fallRate, ...trains, gear, r.levels[seat] / 15];
}
const dist = (a, b) => Math.sqrt(a.reduce((acc, v, i) => acc + (v - b[i]) ** 2, 0));
const centroid = (vs) => vs[0].map((_, i) => mean(vs.map(v => v[i])));
function entropy(counts) {
  const tot = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!tot) return 0;
  return -Object.values(counts).reduce((acc, c) => (c ? acc + (c / tot) * Math.log2(c / tot) : acc), 0);
}

for (const key of only) {
  const rs = RULESETS[key];
  const tasks = [];
  for (const a of CHARS) for (const b of CHARS) {
    if (a === b) continue;
    for (let g = 0; g < games; g++) tasks.push({ chars: [a, b], seed: 9001 + g, agents: ['planner', 'planner'], maxRounds: 150, rules: rs.rules });
  }
  const results = await runGames(tasks);
  const seats = []; // { char, profile, detail, result, seat }
  for (const r of results) r.chars.forEach((c, i) => seats.push({ char: c, p: profile(r, i), d: r.detail[i], r, i }));

  const byChar = Object.fromEntries(CHARS.map(c => [c, seats.filter(x => x.char === c)]));
  const cents = Object.fromEntries(CHARS.map(c => [c, centroid(byChar[c].map(x => x.p))]));
  const pairs = [];
  for (let i = 0; i < CHARS.length; i++) for (let j = i + 1; j < CHARS.length; j++) pairs.push(dist(cents[CHARS[i]], cents[CHARS[j]]));
  const asymmetry = mean(pairs);
  const within = Object.fromEntries(CHARS.map(c => [c, mean(byChar[c].map(x => dist(x.p, cents[c])))]));
  const variety = mean(Object.values(within));

  console.log(`\n=== ${rs.label} (${results.length} games, mean ${mean(results.map(r => r.rounds)).toFixed(1)} rounds) ===`);
  console.log(`Asymmetry (mean distance between climbers' average play): ${asymmetry.toFixed(3)}`);
  console.log(`Replay variety (mean distance of a game from its climber's average): ${variety.toFixed(3)}`);
  console.log(`Identity ratio (asymmetry ÷ variety; higher = climbers more distinct than games are noisy): ${(asymmetry / variety).toFixed(2)}`);
  const allClose = seats.reduce((a, x) => a + x.d.closeCalls, 0) / Math.max(1, seats.reduce((a, x) => a + x.d.decisions, 0));
  console.log(`Decision tension (turns where another productive action was within 1 Time): ${(100 * allClose).toFixed(1)}%`);
  console.log('\nclimber      time train/climb/ms/rest/gear  walls B/TR/L    fall%  train S/T/F/X     gear  Lvl  ms-order H  gear H (distinct)  signature');
  for (const c of CHARS) {
    const xs = byChar[c];
    const cent = cents[c];
    const pct = (v) => `${Math.round(100 * v)}`.padStart(3);
    const msOrders = {};
    const gearCounts = {};
    for (const x of xs) {
      const o = x.d.milestoneOrder.join('>');
      if (x.d.milestoneOrder.length === 3) msOrders[o] = (msOrders[o] || 0) + 1;
      for (const n of x.d.gearOrder) if (!MARKET_SKIP.has(n)) gearCounts[n] = (gearCounts[n] || 0) + 1;
    }
    const sig = {
      ironLung: `falls/game ${mean(xs.map(x => x.d.falls)).toFixed(1)}`,
      sprinter: `climbs/round ${mean(xs.map(x => (x.d.sends + x.d.falls) / x.r.rounds)).toFixed(2)}`,
      routeReader: `Versatility ${mean(xs.map(x => x.d.abilities.Versatility || 0)).toFixed(1)} · Beta Boost ${mean(xs.map(x => x.d.abilities['Beta Boost'] || 0)).toFixed(1)} /game`,
      technician: `sends/game ${mean(xs.map(x => x.d.sends)).toFixed(1)}, fall% ${Math.round(100 * mean(xs.map(x => x.d.falls / Math.max(1, x.d.sends + x.d.falls))))}`,
      freeSolo: `regular climbs/game ${mean(xs.map(x => x.d.wallClimbs.bouldering + x.d.wallClimbs.topRope + x.d.wallClimbs.leadClimbing)).toFixed(1)}`,
    }[c];
    console.log(`${c.padEnd(12)} ${pct(cent[0])}/${pct(cent[1])}/${pct(cent[2])}/${pct(cent[3])}/${pct(cent[4])}        ${pct(cent[5])}/${pct(cent[6])}/${pct(cent[7])}   ${pct(cent[8])}    ${pct(cent[9])}/${pct(cent[10])}/${pct(cent[11])}/${pct(cent[12])}   ${(cent[13] * 5).toFixed(1)}  ${(cent[14] * 15).toFixed(1)}  ${entropy(msOrders).toFixed(2)}      ${entropy(gearCounts).toFixed(2)} (${Object.keys(gearCounts).length})       ${sig}`);
  }
}
console.log('\nEntropy H in bits: Milestone order max log2(6) = 2.58; gear max log2(#cards).');
