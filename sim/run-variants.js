// Compare rule variants with the planner bot (balance experiments).
//
//   node sim/run-variants.js [--only=baseline,cap10] [--seeds=1-100] [--games=30]
//                            [--gear-weights=0,0.5,1] [--out=results/variants.json]
//
// Each variant is a `rules` object (engine helpers trainingSpec) applied to
// every game. For each: solo games per character (seeds) and a 2-player round
// robin (games per ordered pair) with the planner. Per variant the bot's
// gear-saving weight is picked (0 / 0.5 / 1) by solo speed, so each rule set
// is played near its best — otherwise a variant that makes gear worth buying
// would be judged by a bot that won't buy it. Reports game length, how climbers
// spend their Time, gear bought, final Level, and character win rates.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTERS, GEAR_SHOP } from '../engine/data.js';
import { runGames, wilson, medianCI, mean } from './balance-pool.js';
import { GRIT_RULES } from '../engine/helpers.js';

const ALLOW = { start: 3, perRound: 1 };             // the starting Grit + allowance tested first
const GR = { grit: { start: 0, perRound: 0 }, trainCapBase: 10, trainCapPerLevel: 5 }; // GRIT_RULES before the Free Solo fix
const fs = (o) => ({ ...GR, characters: { freeSolo: o } });
export const VARIANTS = {
  // Training experiments (audit §9).
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
  // Grit economy with a starting 3 Grit and +1 a round (audit §10).
  gritNoCap:     { label: 'Grit (start 3, +1/round), no cap', rules: { grit: ALLOW } },
  gritCap10:     { label: 'Grit (start 3, +1/round) + cap 10 + 5×(Level−1)', rules: { grit: ALLOW, trainCapBase: 10, trainCapPerLevel: 5 } },
  gritCap15:     { label: 'Grit (start 3, +1/round) + cap 15 + 5×(Level−1)', rules: { grit: ALLOW, trainCapBase: 15, trainCapPerLevel: 5 } },
  gritCap20:     { label: 'Grit (start 3, +1/round) + cap 20 + 5×(Level−1)', rules: { grit: ALLOW, trainCapBase: 20, trainCapPerLevel: 5 } },
  gritCap10x10:  { label: 'Grit (start 3, +1/round) + cap 10 + 10×(Level−1)', rules: { grit: ALLOW, trainCapBase: 10, trainCapPerLevel: 10 } },
  // Recommended Grit rules (GRIT_RULES: no starting Grit, no allowance, cap
  // 10 + 5/Level) and Free Solo fixes on top (audit §11).
  grit:          { label: 'Grit start 0, no allowance, cap 10 + 5×(Level−1) (cards 1/2/3)', rules: GR },
  gritRules:     { label: 'GRIT_RULES (chosen: cards 2/3/4, FS +1/round, cap 10 + 5×(Level−1))', rules: GRIT_RULES },
  gritFs3:       { label: 'GRIT_RULES, Free Solo starts with 3 Grit', rules: fs({ gritStart: 3 }) },
  gritFs5:       { label: 'GRIT_RULES, Free Solo starts with 5 Grit', rules: fs({ gritStart: 5 }) },
  gritFs3x2:     { label: 'GRIT_RULES, Free Solo 3 Grit + cap ×2', rules: fs({ gritStart: 3, trainCapMultiplier: 2 }) },
  gritFs3x3:     { label: 'GRIT_RULES, Free Solo 3 Grit + cap ×3', rules: fs({ gritStart: 3, trainCapMultiplier: 3 }) },
  gritFs3open:   { label: 'GRIT_RULES, Free Solo 3 Grit + no cap', rules: fs({ gritStart: 3, uncapped: true }) },
  gritFs5x2:     { label: 'GRIT_RULES, Free Solo 5 Grit + cap ×2', rules: fs({ gritStart: 5, trainCapMultiplier: 2 }) },
  gritFs5open:   { label: 'GRIT_RULES, Free Solo 5 Grit + no cap', rules: fs({ gritStart: 5, uncapped: true }) },
  // Archetype starting Grit (FS 3, IL 2, Spr 2, Tech 1, RR 0) and Free Solo income.
  archStart:     { label: 'Archetype start (FS 3, IL 2, Spr 2, Tech 1, RR 0)', rules: arch() },
  archFlat:      { label: 'Flat start (all 1, FS 3)', rules: arch({}, { ironLung: 1, sprinter: 1, technician: 1, routeReader: 1 }) },
  archFsIncome:  { label: 'Archetype start + Free Solo +1 Grit/round', rules: arch({ gritPerRound: 1 }) },
  archFsFree:    { label: 'Archetype start + Free Solo trains free (capped)', rules: arch({ freeTraining: true }) },
  archFsIncome234: { label: 'Archetype start + FS +1/round + cards 2/3/4 Grit', rules: { ...arch({ gritPerRound: 1 }), grit: { start: 0, perRound: 0, routeGrit: [2, 3, 4] } } },
  // Character changes on top of GRIT_RULES (audit §12).
  rrMs4:         { label: 'Route Reader: Milestones need all 4 stats', rules: tune({ routeReader: { milestonePasses: 4 } }) },
  rrBoost:       { label: 'Route Reader: 3-of-4 only with Beta Boost', rules: tune({ routeReader: { boostOnly: true } }) },
  rrNear5:       { label: 'Route Reader: 4th stat may miss by ≤ 5', rules: tune({ routeReader: { nearMiss: 5 } }) },
  rrNear3:       { label: 'Route Reader: 4th stat may miss by ≤ 3', rules: tune({ routeReader: { nearMiss: 3 } }) },
  sprXp1:        { label: 'Sprinter: full XP', rules: tune({ sprinter: { xpMultiplier: 1 } }) },
  sprXp75:       { label: 'Sprinter: 75% XP', rules: tune({ sprinter: { xpMultiplier: 0.75 } }) },
  sprNoCrux:     { label: 'Sprinter: no extra Focus crux die', rules: tune({ sprinter: { focusCrux: false } }) },
  techNoTime:    { label: 'Technician: no extra Time per climb', rules: tune({ technician: { extraTime: 0 } }) },
  tech7:         { label: 'Technician: requirements −7', rules: tune({ technician: { reqReduction: 7 } }) },
  il25:          { label: 'Iron Lung: falls +25% XP (was +50%)', rules: tune({ ironLung: { failXpBonus: 0.25 } }) },
  il0:           { label: 'Iron Lung: no fall XP bonus', rules: tune({ ironLung: { failXpBonus: 0 } }) },
  // Combinations.
  comboA:        { label: 'RR miss ≤3 · Spr 75% XP · Tech no extra Time · IL +25%', rules: tune({ routeReader: { nearMiss: 3 }, sprinter: { xpMultiplier: 0.75 }, technician: { extraTime: 0 }, ironLung: { failXpBonus: 0.25 } }) },
  comboB:        { label: 'RR miss ≤3 · Spr 75% XP · Tech −7 · IL +25%', rules: tune({ routeReader: { nearMiss: 3 }, sprinter: { xpMultiplier: 0.75 }, technician: { reqReduction: 7 }, ironLung: { failXpBonus: 0.25 } }) },
  comboC:        { label: 'RR miss ≤5 · Spr 75% XP · Tech no extra Time · IL +25%', rules: tune({ routeReader: { nearMiss: 5 }, sprinter: { xpMultiplier: 0.75 }, technician: { extraTime: 0 }, ironLung: { failXpBonus: 0.25 } }) },
  comboD:        { label: 'RR miss ≤3 · Spr 75% XP · Tech no extra Time · IL no bonus', rules: tune({ routeReader: { nearMiss: 3 }, sprinter: { xpMultiplier: 0.75 }, technician: { extraTime: 0 }, ironLung: { failXpBonus: 0 } }) },
  comboDfs2:     { label: 'Combo D + Free Solo +2 Grit/round', rules: withFs(comboD(), { gritPerRound: 2 }) },
  comboDfs3s:    { label: 'Combo D + Free Solo starts with 3 Grit', rules: withFs(comboD(), { gritStart: 3 }) },
  comboDfs2seat1: { label: 'Combo D + FS +2/round + seats start 0/1/2/3 Grit', rules: seatStart(withFs(comboD(), { gritPerRound: 2 }), [0, 1, 2, 3]) },
  comboDfs2seat2: { label: 'Combo D + FS +2/round + seats start 0/2/4/6 Grit', rules: seatStart(withFs(comboD(), { gritPerRound: 2 }), [0, 2, 4, 6]) },
  // Trait-preserving packages (audit §13): every trait keeps its upside and its cost.
  traitT1:       { label: 'T1: RR miss≤3+shift on Ms · Spr 75% · Tech +1 Time on Ms only · IL falls cost 10 · FS +2', rules: traitPkg({}) },
  traitT2:       { label: 'T2: T1 with IL falls cost 8', rules: traitPkg({ ironLung: { failEndurance: 8 } }) },
  traitT3:       { label: 'T3: T1 with Tech +1 Time on regular routes only', rules: traitPkg({ technician: { extraTimeOn: 'regular' } }) },
  traitT4:       { label: 'T4: T1 with IL +25% fall XP, falls cost 8', rules: traitPkg({ ironLung: { failXpBonus: 0.25, failEndurance: 8 } }) },
  traitT5:       { label: 'T5: T1 with RR miss≤5', rules: traitPkg({ routeReader: { nearMiss: 5, shiftOnMilestones: true } }) },
  traitT6:       { label: 'T6: T1 + IL +25% fall XP & falls cost 10 + Spr 85% XP', rules: traitPkg({ ironLung: { failXpBonus: 0.25, failEndurance: 10 }, sprinter: { xpMultiplier: 0.85 } }) },
  traitT7:       { label: 'T7: T1 + IL +25% fall XP & falls cost 12 + Spr 85% XP', rules: traitPkg({ ironLung: { failXpBonus: 0.25, failEndurance: 12 }, sprinter: { xpMultiplier: 0.85 } }) },
  traitT8:       { label: 'T8: T1 + IL +35% fall XP & falls cost 10 + Spr 85% XP', rules: traitPkg({ ironLung: { failXpBonus: 0.35, failEndurance: 10 }, sprinter: { xpMultiplier: 0.85 } }) },
  traitT9:       { label: 'T9: T1 + IL +25% fall XP & falls cost 10 (Spr 75%)', rules: traitPkg({ ironLung: { failXpBonus: 0.25, failEndurance: 10 } }) },
  // Relentless exactly as printed; Iron Lung's body tuned instead.
  traitB1:       { label: 'B1: trait pkg (Spr 85%) + IL printed Relentless, Endurance growth 8→5', rules: bodyPkg({ growth: { endurance: 5 } }) },
  traitB2:       { label: 'B2: … IL start Endurance 120→100, growth 8→5', rules: bodyPkg({ startingEndurance: 100, growth: { endurance: 5 } }) },
  traitB3:       { label: 'B3: … IL stat growth −0.5 each (2/2/2.5/1.5)', rules: bodyPkg({ growth: { strength: 2, technique: 2, focus: 2.5, flexibility: 1.5 } }) },
  traitB4:       { label: 'B4: … B2 + B3', rules: bodyPkg({ startingEndurance: 100, growth: { endurance: 5, strength: 2, technique: 2, focus: 2.5, flexibility: 1.5 } }) },
  traitB5:       { label: 'B5: … IL stat growth −0.25 each (2.25/2.25/2.75/1.75)', rules: bodyPkg({ growth: { strength: 2.25, technique: 2.25, focus: 2.75, flexibility: 1.75 } }) },
  traitB3seat:   { label: 'B3 + seats start with 0/1/2/3 Grit', rules: seatStart(bodyPkg({ growth: { strength: 2, technique: 2, focus: 2.5, flexibility: 1.5 } }), [0, 1, 2, 3]) },
  traitB3seat2:  { label: 'B3 + seats start with 0/2/4/6 Grit', rules: seatStart(bodyPkg({ growth: { strength: 2, technique: 2, focus: 2.5, flexibility: 1.5 } }), [0, 2, 4, 6]) },
  comboE:        { label: 'RR miss ≤5 · Spr 75% XP + no crux · Tech no extra Time · IL no bonus', rules: tune({ routeReader: { nearMiss: 5 }, sprinter: { xpMultiplier: 0.75, focusCrux: false }, technician: { extraTime: 0 }, ironLung: { failXpBonus: 0 } }) },
};

// GRIT_RULES plus ability tuning for some characters: tune({ routeReader: { nearMiss: 5 } }).
function tune(abilities) {
  const characters = { ...GRIT_RULES.characters };
  for (const [k, a] of Object.entries(abilities)) characters[k] = { ...(characters[k] || {}), ability: a };
  return { ...GRIT_RULES, characters };
}

function comboD() {
  return tune({ routeReader: { nearMiss: 3 }, sprinter: { xpMultiplier: 0.75 }, technician: { extraTime: 0 }, ironLung: { failXpBonus: 0 } });
}
// Trait-preserving base package with per-character ability overrides.
function traitPkg(over) {
  const base = {
    routeReader: { nearMiss: 3, shiftOnMilestones: true },
    sprinter: { xpMultiplier: 0.75 },
    technician: { extraTimeOn: 'milestone' },
    ironLung: { failEndurance: 10 },
  };
  for (const [k, v] of Object.entries(over)) base[k] = v;
  return withFs(tune(base), { gritPerRound: 2 });
}
// Trait package with Sprinter 85% XP, Iron Lung's Relentless as printed, and
// an Iron Lung body adjustment.
function bodyPkg(body) {
  const r = traitPkg({ ironLung: {}, sprinter: { xpMultiplier: 0.85 } });
  return { ...r, characters: { ...r.characters, ironLung: { ...r.characters.ironLung, body } } };
}
function withFs(rules, extra) {
  return { ...rules, characters: { ...rules.characters, freeSolo: { ...rules.characters.freeSolo, ...extra } } };
}
function seatStart(rules, seats) {
  return { ...rules, grit: { ...rules.grit, seatStart: seats } };
}

// Archetype starting Grit, with optional extra Free Solo settings / start overrides.
function arch(fsExtra = {}, starts = {}) {
  const s = { freeSolo: 3, ironLung: 2, sprinter: 2, technician: 1, routeReader: 0, ...starts };
  const characters = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { gritStart: v }]));
  characters.freeSolo = { ...characters.freeSolo, ...fsExtra };
  return { ...GR, characters };
}

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
const outPath = flag('out', 'results/variants.json');
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
    // Purchase rate of the two training cards (solo games where they were dealable).
    hangboard: mean(solo.map(r => (r.gear[0].includes('Hangboard Program') ? 1 : 0))),
    partner: mean(solo.map(r => (r.gear[0].includes('Training Partner') ? 1 : 0))),
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
  console.log(`  per game: ${o.trains.toFixed(1)} trains · ${o.climbs.toFixed(1)} climbs · ${o.marketGear.toFixed(2)} market gear · ends at Level ${o.level.toFixed(1)}${o.rules.trainCapBase !== undefined ? ` · Hangboard ${pct(o.hangboard)} · Partner ${pct(o.partner)}` : ''}`);
  console.log(`  2P win rate: ${CHARS.map(c => `${c} ${pct(win[c].p)}`).join(' · ')}  (spread ${pct(o.winSpread)}, seat 1 ${pct(o.seat1)})`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`\nwrote ${outPath}`);
