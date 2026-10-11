// Do the bots build around route tags (Pinch/Crimp, Roof/Sloper, Dynamic,
// Toe/Heel Hook) with the matching specialty cards?
//
//   node analysis/tag-builds.mjs [--games=15]
//
// Plays 2-player round robins under the standard rules and GRIT_RULES, and a
// 4-player GRIT_RULES sweep, then reports per specialty card:
//   - how often it is bought (per climber-game), and how often the purchase
//     matches a Milestone the buyer still needs (milestone-driven);
//   - tag focus: share of the owner's regular climbs on that tag AFTER buying,
//     against the same share for climbers who don't own it (lift);
//   - "tag builds": owners with ≥ 5 later regular climbs whose tag share is at
//     least 1.5× the non-owner baseline.
// Also the tag mix of all regular climbs against the route pool.

import { CHARACTERS, GEAR_SHOP, ROUTES } from '../engine/data.js';
import { GRIT_RULES } from '../engine/helpers.js';
import { runGames, mean } from '../sim/balance-pool.js';

const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const games = Number(flag('games', 15));
const CHARS = Object.keys(CHARACTERS);
const CARDS = GEAR_SHOP.filter(g => g.tagFilter).map(g => ({ name: g.name, tag: g.tagFilter }));
const TAGS = [...new Set(CARDS.map(c => c.tag))];
const pct = (x) => `${(100 * x).toFixed(1)}%`;

const combos = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map(c => [x, ...c])));
const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [x, ...p])));
function tasksFor(n, rules, g) {
  const out = [];
  for (const set of combos(CHARS, n)) for (const order of (n === 2 ? perms(set) : perms(set))) {
    for (let i = 0; i < g; i++) out.push({ chars: order, seed: 13001 + i, agents: order.map(() => 'planner'), maxRounds: 150, rules });
  }
  return out;
}

// Route-pool tag mix (what the walls offer).
const pool = Object.values(ROUTES).flat();
const poolShare = Object.fromEntries([...TAGS, null].map(t => [t, pool.filter(r => (r.tag || null) === t).length / pool.length]));

const SETS = [
  { label: 'Standard rules, 2 players', tasks: tasksFor(2, null, games) },
  { label: 'GRIT_RULES, 2 players', tasks: tasksFor(2, GRIT_RULES, games) },
  { label: 'GRIT_RULES, 4 players', tasks: tasksFor(4, GRIT_RULES, Math.max(1, Math.round(games / 7))) },
];

for (const set of SETS) {
  const results = await runGames(set.tasks);
  const seats = results.flatMap(r => r.chars.map((c, i) => ({ r, i, d: r.detail[i], ms: r.milestoneRounds[i] })));
  const regular = (s) => s.d.climbs.filter(c => !c.ms);
  const allRegular = seats.flatMap(regular);
  console.log(`\n=== ${set.label} — ${results.length} games, ${seats.length} climber-games, ${allRegular.length} regular climbs ===`);
  console.log('Tag mix of regular climbs vs route pool:  ' +
    [...TAGS, null].map(t => `${t || 'untagged'} ${pct(allRegular.filter(c => c.tag === t).length / allRegular.length)} (pool ${pct(poolShare[t])})`).join(' · '));
  const anyBuy = seats.filter(s => s.d.specialtyBuys.length).length;
  console.log(`Climber-games buying any specialty card: ${pct(anyBuy / seats.length)}`);
  console.log('\ncard                     tag            bought   milestone-driven  owner tag share after  non-owner share  lift   tag builds');
  for (const card of CARDS) {
    const owners = seats.filter(s => s.d.specialtyBuys.some(b => b.card === card.name));
    const nonOwners = seats.filter(s => !s.d.specialtyBuys.some(b => b.card === card.name));
    const msDriven = owners.filter(s => {
      const buy = s.d.specialtyBuys.find(b => b.card === card.name);
      return Object.entries(s.r.milestoneTags).some(([tier, tag]) => tag === card.tag && !(s.ms[tier] && s.ms[tier] < buy.r));
    }).length;
    const after = owners.flatMap(s => {
      const buy = s.d.specialtyBuys.find(b => b.card === card.name);
      return regular(s).filter(c => c.r >= buy.r);
    });
    const base = nonOwners.flatMap(regular);
    const ownerShare = after.length ? after.filter(c => c.tag === card.tag).length / after.length : NaN;
    const baseShare = base.length ? base.filter(c => c.tag === card.tag).length / base.length : NaN;
    const builds = owners.filter(s => {
      const buy = s.d.specialtyBuys.find(b => b.card === card.name);
      const later = regular(s).filter(c => c.r >= buy.r);
      return later.length >= 5 && later.filter(c => c.tag === card.tag).length / later.length >= 1.5 * baseShare;
    }).length;
    console.log(`${card.name.padEnd(25)}${card.tag.padEnd(15)}${pct(owners.length / seats.length).padStart(6)}   ${owners.length ? pct(msDriven / owners.length).padStart(6) : '     –'}            ${Number.isFinite(ownerShare) ? pct(ownerShare).padStart(6) : '     –'} (n=${after.length})${''.padEnd(Math.max(0, 6 - String(after.length).length))}${pct(baseShare).padStart(6)}        ${Number.isFinite(ownerShare) ? (ownerShare / baseShare).toFixed(2) : '–'}   ${pct(builds / seats.length)} of climbers`);
  }
  const buyRounds = seats.flatMap(s => s.d.specialtyBuys.map(b => b.r));
  if (buyRounds.length) console.log(`\nSpecialty purchases happen around round ${mean(buyRounds).toFixed(1)} (games last ${mean(results.map(r => r.rounds)).toFixed(1)}).`);
}
