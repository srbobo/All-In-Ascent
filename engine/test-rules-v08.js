// Tests for the v0.8.0 rules fixes and the exact send-probability helper.
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Covers:
//   - Sequence Memorization / Crimp Sequence Decoder never make a climb harder
//   - Mountain Mentor ignores the nerf die that matters
//   - dice gear never lowers P(send) (property check over many routes)
//   - climbSendProbability matches real applyAction climbs (Monte Carlo)
//   - the climber with the most Time opens the round

import { createGame } from './state.js';
import { applyAction } from './engine.js';
import {
  rollClimbDice, resolveClimbDice, applyDiceToRequirements, climbSendProbability,
  computeClimbStats, buildEffectRollArray,
} from './helpers.js';
import { ROUTES } from './data.js';
import { deriveSeed, createRng } from './rng.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const queuedRng = (values) => {
  const q = [...values];
  return { rollDie: () => { if (!q.length) throw new Error('rng queue empty'); return q.shift(); } };
};
const queuedDraw = (values) => {
  const q = [...values];
  return () => { if (!q.length) throw new Error('draw queue empty'); return q.shift(); };
};

const zero = () => ({ strength: 0, technique: 0, focus: 0, flexibility: 0 });
const charBase = (key, equipment = [], stats = { strength: 30, technique: 20, focus: 20, flexibility: 20 }) => ({
  key, level: 1, xp: 0, stats: { ...stats },
  trainingBonuses: zero(), gearBonuses: zero(),
  equipment, timeRemaining: 10, currentEndurance: 100, maxEndurance: 100,
  betaBoostActive: false, abilityUsed: false,
  milestonesCompleted: { beginner: false, intermediate: false, expert: false },
});

// A route with a green die on Strength and a red die on Focus.
const mixed = {
  name: 'Test Mixed', strength: 30, technique: 20, focus: 20, flexibility: 20,
  time: 2, endurance: 10, xpSuccess: 20, xpFail: 5, tag: 'Pinch/Crimp',
  rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: 1 }],
};
const fx = (route) => route.rollEffect.map(e => ({ ...e }));

// =============================================================================
// SEQUENCE MEMORIZATION — never on a helpful die
// =============================================================================
{
  const memo = charBase('ironLung', ['Sequence Memorization']);
  // Green 6 on Strength (helpful), red 2 on Focus. v0.7.0 turned the 6 into a 1.
  const dice = rollClimbDice(queuedRng([6, 2]), fx(mixed), memo, mixed);
  check('Memorization keeps a helpful green 6', dice[0] === 6, JSON.stringify(dice));
  check('Memorization turns the red die into a 1', dice[1] === 1, JSON.stringify(dice));
  const { requirements } = applyDiceToRequirements(memo, mixed, fx(mixed), dice);
  check('Memorization: Str req 24, Focus req 21', requirements.strength === 24 && requirements.focus === 21,
    JSON.stringify(requirements));

  // With stats known, it targets the red die that decides the climb.
  const twoRed = { ...mixed, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }] };
  const c = charBase('ironLung', ['Sequence Memorization'], { strength: 40, technique: 20, focus: 23, flexibility: 20 });
  const stats = computeClimbStats(c, twoRed, 'bouldering', {});
  // Str 40 vs 30+6 passes anyway; Focus 23 vs 20+5 fails unless that die becomes 1.
  const out = resolveClimbDice(queuedDraw([6, 5]), fx(twoRed), c, twoRed, false, stats);
  check('Memorization picks the deciding red die, not the highest', out.dice[0] === 6 && out.dice[1] === 1,
    JSON.stringify(out.dice));
}

// =============================================================================
// CRIMP SEQUENCE DECODER — a "may": only re-rolls when it helps
// =============================================================================
{
  const dec = charBase('ironLung', ['Crimp Sequence Decoder']);
  // Stat-blind: helpful green 6, harmless red 2 → nothing to re-roll.
  const a = rollClimbDice(queuedRng([6, 2]), fx(mixed), dec, mixed);
  check('Decoder (stat-blind) keeps good dice', a[0] === 6 && a[1] === 2, JSON.stringify(a));
  // Stat-blind: red 6 is the worst die → re-rolled.
  const b = rollClimbDice(queuedRng([4, 6, 3]), fx(mixed), dec, mixed);
  check('Decoder (stat-blind) re-rolls a bad red die', b[0] === 4 && b[1] === 3, JSON.stringify(b));

  // With stats: already sending → no re-roll (the queue has no third die).
  const strong = charBase('ironLung', ['Crimp Sequence Decoder'], { strength: 40, technique: 30, focus: 30, flexibility: 30 });
  const st = computeClimbStats(strong, mixed, 'bouldering', {});
  let threw = false;
  try { resolveClimbDice(queuedDraw([1, 6]), fx(mixed), strong, mixed, false, st); } catch { threw = true; }
  check('Decoder does not re-roll a climb that already sends', !threw);
  // With stats: failing on Strength (green 1) → re-roll the green die.
  const weak = charBase('ironLung', ['Crimp Sequence Decoder'], { strength: 26, technique: 30, focus: 30, flexibility: 30 });
  const sw = computeClimbStats(weak, mixed, 'bouldering', {});
  const r = resolveClimbDice(queuedDraw([1, 2, 6]), fx(mixed), weak, mixed, false, sw);
  check('Decoder re-rolls the die that is failing the climb', r.dice[0] === 6 && r.dice[1] === 2, JSON.stringify(r.dice));
}

// =============================================================================
// MOUNTAIN MENTOR — ignores the nerf die that matters
// =============================================================================
{
  const twoRed = { ...mixed, tag: null, rollEffect: [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }] };
  const c = charBase('ironLung', ['Mountain Mentor'], { strength: 50, technique: 20, focus: 22, flexibility: 20 });
  const stats = computeClimbStats(c, twoRed, 'bouldering', {});
  // Red 6 on Strength is harmless (50 vs 36); red 4 on Focus fails (22 vs 24).
  const out = resolveClimbDice(queuedDraw([6, 4]), fx(twoRed), c, twoRed, false, stats);
  check('Mentor ignores the deciding red die', out.mentorIndex === 1, `mentorIndex=${out.mentorIndex}`);
  const { requirements } = applyDiceToRequirements(c, twoRed, fx(twoRed), out.dice, { mentorIndex: out.mentorIndex });
  check('Mentor: Focus req back to 20', requirements.focus === 20 && requirements.strength === 36, JSON.stringify(requirements));
  // Default (no index given): the highest red die.
  const def = applyDiceToRequirements(c, twoRed, fx(twoRed), [6, 4]);
  check('Mentor default ignores the highest red die', def.requirements.strength === 30 && def.requirements.focus === 24,
    JSON.stringify(def.requirements));
}

// =============================================================================
// PROPERTY: dice gear never lowers P(send)
// =============================================================================
{
  const gearSets = [
    ['Sequence Memorization'], ['Mountain Mentor'], ['Crimp Sequence Decoder'],
    ['Power Tap Belt'], ['Sequence Memorization', 'Mountain Mentor'],
  ];
  const chars = ['ironLung', 'sprinter', 'technician', 'routeReader'];
  const all = [...ROUTES.bouldering.map(r => [r, 'bouldering']), ...ROUTES.leadClimbing.map(r => [r, 'leadClimbing'])];
  let worse = 0;
  let compared = 0;
  let firstFail = '';
  for (const key of chars) {
    for (const [route, area] of all) {
      if (!(route.rollEffect || []).length) continue;
      // Stats near the route's requirements so outcomes are genuinely uncertain.
      const stats = { strength: route.strength, technique: route.technique, focus: route.focus, flexibility: route.flexibility };
      const plain = climbSendProbability(charBase(key, [], stats), route, area, {}).pSend;
      for (const gear of gearSets) {
        const p = climbSendProbability(charBase(key, gear, stats), route, area, {}).pSend;
        compared++;
        if (p < plain - 1e-9) {
          worse++;
          if (!firstFail) firstFail = `${key} ${route.name} ${gear.join('+')}: ${plain.toFixed(3)} → ${p.toFixed(3)}`;
        }
      }
    }
  }
  check(`dice gear never lowers P(send) (${compared} route×character×gear cases)`, worse === 0, firstFail);
}

// =============================================================================
// EXACT P(send) MATCHES REAL CLIMBS
// =============================================================================
// For each case: put the route on a wall, climb it N times with different
// dice streams through applyAction, and compare the send rate with
// climbSendProbability. Tolerance: 4 standard errors (plus a small floor).
{
  const N = 3000;
  const pickRoute = (pred) => [...ROUTES.bouldering, ...ROUTES.leadClimbing].find(pred);
  const crimp = pickRoute(r => r.tag === 'Pinch/Crimp' && (r.rollEffect || []).length >= 2);
  const dyn = pickRoute(r => r.tag === 'Dynamic' && (r.rollEffect || []).length >= 2);
  const multi = pickRoute(r => (r.rollEffect || []).length >= 3) || crimp;
  const cases = [
    { key: 'ironLung', gear: [], route: multi },
    { key: 'sprinter', gear: [], route: multi },
    { key: 'technician', gear: [], route: multi },
    { key: 'routeReader', gear: [], route: multi, beta: true },
    { key: 'routeReader', gear: [], route: multi, shift: { from: 'flexibility', to: 'strength', amount: 4 } },
    { key: 'ironLung', gear: ['Sequence Memorization', 'Mountain Mentor'], route: multi },
    { key: 'ironLung', gear: ['Crimp Sequence Decoder'], route: crimp },
    { key: 'sprinter', gear: ['Power Tap Belt', 'Sequence Memorization'], route: dyn },
    { key: 'ironLung', gear: ['Climbing Coach'], route: multi, milestone: true },
  ];
  for (const cs of cases) {
    const area = ROUTES.bouldering.includes(cs.route) ? 'bouldering' : 'leadClimbing';
    const { state: base } = createGame({ seed: 11, characterKeys: [cs.key] });
    const c = base.players[0].character;
    c.equipment = [...cs.gear, 'Belay Device', 'Locking Carabiner', 'Lead Rope'];
    c.currentEndurance = 999;
    // Set each stat to (requirement + offset) via the training bonus — a test
    // fixture, so offsets may be negative — and search offset vectors for the
    // one putting pSend closest to 50%, where a mismatch would show most.
    const STATS4 = ['strength', 'technique', 'focus', 'flexibility'];
    const pAt = (off) => {
      STATS4.forEach((k, j) => { c.trainingBonuses[k] = cs.route[k] - c.stats[k] + off[j]; });
      c.betaBoostActive = !!cs.beta;
      return climbSendProbability(c, cs.route, area, {}, { isMilestone: !!cs.milestone, shift: cs.shift || null }).pSend;
    };
    const pick = createRng(99);
    let best = [0, 0, 0, 0];
    let bestGap = Math.abs(pAt(best) - 0.5);
    for (let t = 0; t < 400 && bestGap > 0.05; t++) {
      const off = STATS4.map(() => Math.floor(pick.next() * 31) - 15);
      const gap = Math.abs(pAt(off) - 0.5);
      if (gap < bestGap) { bestGap = gap; best = off; }
    }
    const p = pAt(best);
    let action;
    if (cs.milestone) {
      base.milestoneRoutes.expert = { area, route: cs.route };
      action = { type: 'milestone', difficulty: 'expert' };
    } else {
      base.availableRoutes[area] = [cs.route];
      action = { type: 'climb', area, routeName: cs.route.name, ...(cs.shift ? { shift: cs.shift } : {}) };
    }
    let sends = 0;
    for (let n = 0; n < N; n++) {
      const s = { ...base, events: [], rngState: deriveSeed(1234 + n, 7) };
      const { events } = applyAction(s, action);
      if (events.find(e => e.type === 'climb_resolved').payload.success) sends++;
    }
    const rate = sends / N;
    const tol = 4 * Math.sqrt(Math.max(p * (1 - p), 0.01) / N) + 0.005;
    const label = `${cs.key}${cs.gear.length ? ' + ' + cs.gear.join('+') : ''}${cs.beta ? ' (Beta Boost)' : ''}${cs.shift ? ' (shift)' : ''}${cs.milestone ? ' (milestone)' : ''}`;
    check(`P(send) exact vs ${N} real climbs: ${label} — ${p.toFixed(3)} vs ${rate.toFixed(3)}`,
      Math.abs(rate - p) <= tol, `|Δ| ${Math.abs(rate - p).toFixed(3)} > ${tol.toFixed(3)}`);
  }
}

// =============================================================================
// FREE SOLO + NO-DICE SANITY
// =============================================================================
{
  const fs = charBase('freeSolo', [], { strength: 30, technique: 20, focus: 20, flexibility: 20 });
  check('Free Solo meeting every requirement sends with certainty',
    climbSendProbability(fs, mixed, 'bouldering', {}).pSend === 1);
  const short = charBase('freeSolo', [], { strength: 29, technique: 20, focus: 20, flexibility: 20 });
  check('Free Solo one point short never sends', climbSendProbability(short, mixed, 'bouldering', {}).pSend === 0);
  const tech = charBase('technician', [], { strength: 25, technique: 15, focus: 15, flexibility: 15 });
  check('Technician −5 and Crux immunity: 25 Str vs 30−die−5 always sends',
    climbSendProbability(tech, mixed, 'bouldering', {}).pSend === 1);
  check('effect array untouched by probability calls', buildEffectRollArray(tech, mixed).length === 2);
}

// =============================================================================
// ROUND START — MOST TIME ACTS FIRST
// =============================================================================
{
  const { state } = createGame({ seed: 5, characterKeys: ['ironLung', 'technician', 'sprinter'] });
  state.players[2].character.equipment.push('Approach Shoes');
  let s = state;
  // Everyone calls it a day; the round ends after the last one.
  for (let k = 0; k < 3; k++) ({ state: s } = applyAction(s, { type: 'endTurn' }));
  check('new round started', s.round === 2);
  check('Approach Shoes climber (11 Time) opens the round', s.currentPlayerIndex === 2,
    `currentPlayerIndex=${s.currentPlayerIndex}, times=${s.players.map(p => p.character.timeRemaining)}`);
  const ts = s.events.filter(e => e.type === 'turn_start').at(-1);
  check('turn_start names the opening climber', ts.payload.playerNum === s.players[2].playerNum);

  const { state: even } = createGame({ seed: 5, characterKeys: ['ironLung', 'technician'] });
  let t = even;
  for (let k = 0; k < 2; k++) ({ state: t } = applyAction(t, { type: 'endTurn' }));
  check('tied Time: seat 1 opens the round', t.currentPlayerIndex === 0);
}

const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} v0.8.0 rules assertions FAILED.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} v0.8.0 rules assertions passed.`);
