// Tests for the v0.7.0 rules fixes.
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Covers:
//   - solo Auto-Belay (1 Top Rope station)
//   - milestone routes never dealt to the walls
//   - Locking Carabiner max endurance survives level-up
//   - Climbing Coach +1 on buff dice only
//   - Power Tap Belt: roll N+1, keep N
//   - Crimp Sequence Decoder / Sequence Memorization pick the die that helps
//   - Mountain Mentor (stat-blind fallback; v0.8 stats-aware choice is in test-rules-v08.js)
//   - Route Reader stat shift in the engine

import { createGame, belayerCountFor, regularRoutePool } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import {
  rollClimbDice, applyDiceToRequirements, applyLevelUpIfNeeded, getGearMaxEnduranceBonus,
  bestRouteReaderShift, isWellFormedStatShift,
} from './helpers.js';
import { ROUTES } from './data.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}
function throws(fn) {
  try { fn(); return false; } catch { return true; }
}

// An rng stub that returns queued die values in order.
const queuedRng = (values) => {
  const q = [...values];
  return { rollDie: () => { if (!q.length) throw new Error('rng queue empty'); return q.shift(); } };
};

// Total amount the dice added to a route's four requirements.
const flatRoute = { strength: 20, technique: 20, focus: 20, flexibility: 20 };
const addedByDice = (char, effects, dice) => {
  const { requirements } = applyDiceToRequirements(char, flatRoute, effects, dice);
  return Object.values(requirements).reduce((sum, v) => sum + v, 0) - 80;
};

const charBase = (key, equipment = []) => ({
  key, level: 1, xp: 0,
  stats: { strength: 15, technique: 19, focus: 22, flexibility: 14 },
  trainingBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  gearBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  equipment, timeRemaining: 10, currentEndurance: 100, maxEndurance: 100,
  location: 'lobby', betaBoostActive: false, abilityUsed: false,
  milestonesCompleted: { beginner: false, intermediate: false, expert: false },
});

// =============================================================================
// SOLO AUTO-BELAY
// =============================================================================
check('belayerCountFor(1) = 1 (solo Auto-Belay)', belayerCountFor(1) === 1);
check('belayerCountFor(2) = 1', belayerCountFor(2) === 1);
check('belayerCountFor(4) = 3', belayerCountFor(4) === 3);
{
  const { state } = createGame({ seed: 7, characterKeys: ['ironLung'] });
  check('solo game: 1 belayer station', state.belayerCount === 1);
  check('solo game: 2 Top Rope routes dealt', state.availableRoutes.topRope.length === 2);
  const legal = getLegalActions(state);
  check('solo game: Top Rope climbs are legal',
    legal.some(a => a.type === 'climb' && a.area === 'topRope'));
}
{
  // Every game has a Top Rope milestone somewhere; in solo it must be reachable.
  let found = false;
  for (let seed = 1; seed <= 50 && !found; seed++) {
    const { state } = createGame({ seed, characterKeys: ['ironLung'] });
    const tier = Object.keys(state.milestoneRoutes).find(t => state.milestoneRoutes[t].area === 'topRope');
    const m = state.milestoneRoutes[tier];
    if (m.route.time <= 10 && m.route.endurance <= 120) {
      found = getLegalActions(state).some(a => a.type === 'milestone' && a.difficulty === tier);
    }
  }
  check('solo game: Top Rope milestone can be attempted', found);
}

// =============================================================================
// MILESTONES NEVER DEALT TO THE WALLS
// =============================================================================
{
  let leaks = 0;
  for (let seed = 1; seed <= 60; seed++) {
    let { state } = createGame({ seed, characterKeys: ['ironLung', 'technician', 'sprinter'] });
    const milestoneKeys = new Set(Object.values(state.milestoneRoutes).map(m => `${m.area}:${m.route.name}`));
    const scan = () => {
      for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
        for (const r of state.availableRoutes[area]) if (milestoneKeys.has(`${area}:${r.name}`)) leaks++;
      }
    };
    scan();
    // Pass 6 rounds so every wall is reset twice.
    for (let round = 0; round < 6; round++) {
      for (let p = 0; p < 3; p++) ({ state } = applyAction(state, { type: 'endTurn' }));
      scan();
    }
  }
  check('milestone routes never appear on a wall (60 games × 6 rounds)', leaks === 0, `${leaks} leaks`);
}
{
  const fake = { beginner: { area: 'bouldering', route: ROUTES.bouldering[0] } };
  const pool = regularRoutePool(fake, 'bouldering');
  check('regularRoutePool removes the milestone from its area',
    pool.length === ROUTES.bouldering.length - 1 && !pool.some(r => r.name === ROUTES.bouldering[0].name));
  check('regularRoutePool leaves other areas whole',
    regularRoutePool(fake, 'topRope').length === ROUTES.topRope.length);
}

// =============================================================================
// LOCKING CARABINER SURVIVES LEVEL-UP
// =============================================================================
{
  const c = charBase('technician', ['Belay Device', 'Locking Carabiner']);
  c.stats = { strength: 12, technique: 26, focus: 18, flexibility: 14 };
  c.maxEndurance = 105; // 100 base + 5 Carabiner
  c.xp = 100;
  check('gear max-endurance bonus = 5 with Locking Carabiner', getGearMaxEnduranceBonus(c) === 5);
  applyLevelUpIfNeeded(c);
  // Technician: 100 + 5 growth at level 2, plus the Carabiner's 5.
  check('level-up keeps Carabiner +5 (105 → 110)', c.level === 2 && c.maxEndurance === 110, `got ${c.maxEndurance}`);
}

// =============================================================================
// CLIMBING COACH — BUFF DICE ONLY
// =============================================================================
{
  const effects = [{ stat: 'technique', modifier: -1 }, { stat: 'strength', modifier: 1 }];
  const route = { tag: null };
  const coach = charBase('ironLung', ['Climbing Coach']);
  const onMilestone = rollClimbDice(queuedRng([3, 4]), effects, coach, route, true);
  check('Coach: buff die +1 on a milestone', onMilestone[0] === 4);
  check('Coach: nerf die unchanged on a milestone', onMilestone[1] === 4);
  const regular = rollClimbDice(queuedRng([3, 4]), effects, coach, route, false);
  check('Coach: no effect on a regular climb', regular[0] === 3 && regular[1] === 4);
  const capped = rollClimbDice(queuedRng([6, 2]), effects, coach, route, true);
  check('Coach: buff die capped at 6', capped[0] === 6);
}

// =============================================================================
// POWER TAP BELT — ROLL N+1, KEEP N
// =============================================================================
{
  const effects = [
    { stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: 1 }, { stat: 'flexibility', modifier: -1 },
  ];
  const dynamic = { tag: 'Dynamic' };
  const belt = charBase('ironLung', ['Power Tap Belt']);

  const a = rollClimbDice(queuedRng([2, 5, 6, 6]), effects, belt, dynamic);
  check('Power Tap: 3-die climb keeps 3 dice', a.length === 3);
  check('Power Tap: extra 6 replaces the low buff die', a[0] === 6 && a[1] === 5 && a[2] === 6, JSON.stringify(a));

  const b = rollClimbDice(queuedRng([2, 5, 6, 1]), effects, belt, dynamic);
  check('Power Tap: extra 1 replaces the high nerf die', b[0] === 2 && b[1] === 1 && b[2] === 6, JSON.stringify(b));

  const c = rollClimbDice(queuedRng([6, 1, 6, 3]), effects, belt, dynamic);
  check('Power Tap: an unhelpful extra die is discarded', c[0] === 6 && c[1] === 1 && c[2] === 6, JSON.stringify(c));

  const d = rollClimbDice(queuedRng([2, 5, 6]), effects, belt, { tag: 'Pinch/Crimp' });
  check('Power Tap: no extra die off-tag', d.length === 3 && d[0] === 2);

  const two = [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: -1 }];
  const e = rollClimbDice(queuedRng([1, 4, 5]), two, belt, dynamic);
  check('Power Tap: 2-die climb rolls 3, keeps 2', e.length === 2 && e[0] === 5 && e[1] === 4, JSON.stringify(e));

  const tech = charBase('technician', ['Power Tap Belt']);
  const f = rollClimbDice(queuedRng([2, 5, 6, 1]), effects, tech, dynamic);
  check('Power Tap: Technician never swaps into an ignored nerf die', f[1] === 5, JSON.stringify(f));

  const nerfs = [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }];
  const mentorBelt = charBase('ironLung', ['Power Tap Belt', 'Mountain Mentor']);
  // Rolls 6 and 3, extra 1: Mentor cancels the higher nerf die and the 1 replaces
  // the other, so the dice add just 1 (not 3, from swapping in for the cancelled 6).
  const g = rollClimbDice(queuedRng([6, 3, 1]), nerfs, mentorBelt, dynamic);
  check('Power Tap + Mountain Mentor: extra die improves a nerf die Mentor keeps',
    addedByDice(mentorBelt, nerfs, g) === 1, JSON.stringify(g));
}

// =============================================================================
// CRIMP SEQUENCE DECODER — RE-ROLL THE DIE MOST LIKELY TO IMPROVE
// =============================================================================
{
  const effects = [{ stat: 'technique', modifier: -1 }, { stat: 'strength', modifier: 1 }];
  const crimp = { tag: 'Pinch/Crimp' };
  const decoder = charBase('ironLung', ['Crimp Sequence Decoder']);

  const a = rollClimbDice(queuedRng([6, 5, 2]), effects, decoder, crimp);
  check('Crimp: never re-rolls a high buff die', a[0] === 6 && a[1] === 2, JSON.stringify(a));

  const b = rollClimbDice(queuedRng([1, 4, 5]), effects, decoder, crimp);
  check('Crimp: re-rolls a low buff die over a slightly-high nerf die', b[0] === 5 && b[1] === 4, JSON.stringify(b));

  // Throws if a third die were drawn: no die is worse than average, so no re-roll.
  const c = rollClimbDice(queuedRng([5, 2]), effects, decoder, crimp);
  check('Crimp: no re-roll when every die is average or better', c[0] === 5 && c[1] === 2, JSON.stringify(c));

  const d = rollClimbDice(queuedRng([1, 6]), effects, decoder, { tag: 'Dynamic' });
  check('Crimp: no re-roll off-tag', d[0] === 1 && d[1] === 6, JSON.stringify(d));

  const tech = charBase('technician', ['Crimp Sequence Decoder']);
  const e = rollClimbDice(queuedRng([3, 6, 5]), effects, tech, crimp);
  check('Crimp: Technician never re-rolls an ignored nerf die', e[0] === 5 && e[1] === 6, JSON.stringify(e));

  // Nerf 6 and 2 with Mountain Mentor: the 6 is cancelled anyway and re-rolling
  // the 2 is expected to make it worse, so no re-roll (a third draw would throw).
  const nerfs = [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }];
  const mentorDecoder = charBase('ironLung', ['Crimp Sequence Decoder', 'Mountain Mentor']);
  const f = rollClimbDice(queuedRng([6, 2]), nerfs, mentorDecoder, crimp);
  check('Crimp + Mountain Mentor: no re-roll of the die Mentor cancels', f[0] === 6 && f[1] === 2, JSON.stringify(f));

  const trace = [];
  rollClimbDice(queuedRng([1, 4, 5]), effects, decoder, crimp, false, trace);
  check('Crimp: trace names the re-rolled die',
    trace.length === 1 && trace[0].die === 0 && trace[0].from === 1 && trace[0].to === 5, JSON.stringify(trace));
}

// =============================================================================
// SEQUENCE MEMORIZATION — TREAT THE WORST NERF DIE AS 1
// =============================================================================
{
  const memo = charBase('ironLung', ['Sequence Memorization']);
  const mixed = [
    { stat: 'technique', modifier: -1 }, { stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 },
  ];
  const a = rollClimbDice(queuedRng([6, 4, 5]), mixed, memo, { tag: null });
  check('Memorization: sets the highest nerf die to 1, not a high buff die',
    a[0] === 6 && a[1] === 4 && a[2] === 1, JSON.stringify(a));

  const buffs = [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }];
  const b = rollClimbDice(queuedRng([5, 6]), buffs, memo, { tag: null });
  check('Memorization: never lowers a buff die', b[0] === 5 && b[1] === 6, JSON.stringify(b));

  const solo = charBase('freeSolo', ['Sequence Memorization']);
  const c = rollClimbDice(queuedRng([6, 6, 6]), mixed, solo, { tag: null });
  check('Memorization: no change when Free Solo ignores every die', c.every(d => d === 6), JSON.stringify(c));

  // Nerf 6 and 4: one is cancelled by Mentor, the other becomes a 1.
  const nerfs = [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }];
  const mentor = charBase('ironLung', ['Sequence Memorization', 'Mountain Mentor']);
  const d = rollClimbDice(queuedRng([6, 4]), nerfs, mentor, { tag: null });
  check('Memorization + Mountain Mentor: never spends both on one die',
    addedByDice(mentor, nerfs, d) === 1, JSON.stringify(d));
}

// =============================================================================
// MOUNTAIN MENTOR — STAT-BLIND FALLBACK (the engine picks with stats: test-rules-v08.js)
// =============================================================================
{
  const mentor = charBase('ironLung', ['Mountain Mentor']);
  const nerfs = [{ stat: 'strength', modifier: 1 }, { stat: 'focus', modifier: 1 }];
  const reqs = (char, effects, dice) => applyDiceToRequirements(char, flatRoute, effects, dice).requirements;

  const a = reqs(mentor, nerfs, [2, 5]);
  check('Mentor: without a chosen die, cancels the first nerf die', a.strength === 20 && a.focus === 25, JSON.stringify(a));

  const b = reqs(mentor, nerfs, [4, 4]);
  check('Mentor: cancels the first nerf die on a tie', b.strength === 20 && b.focus === 24, JSON.stringify(b));

  const mixed = [{ stat: 'technique', modifier: -1 }, { stat: 'strength', modifier: 1 }];
  const c = reqs(mentor, mixed, [6, 3]);
  check('Mentor: never cancels a buff die', c.technique === 14 && c.strength === 20, JSON.stringify(c));

  const d = reqs(mentor, [{ stat: 'technique', modifier: -1 }], [5]);
  check('Mentor: no effect without a nerf die', d.technique === 15, JSON.stringify(d));

  const tech = charBase('technician', ['Mountain Mentor']);
  const e = reqs(tech, [{ stat: 'technique', modifier: -1 }, { stat: 'strength', modifier: 1 }], [2, 6]);
  check('Mentor: Technician keeps buff dice (nerf dice already ignored)',
    e.technique === 13 && e.strength === 15, JSON.stringify(e));

  const { appliedModifiers } = applyDiceToRequirements(mentor, flatRoute, nerfs, [2, 5], { mentorIndex: 1 });
  check('Mentor: the chosen die (mentorIndex) shows as modifier 0',
    appliedModifiers[0].modifier === 1 && appliedModifiers[1].modifier === 0, JSON.stringify(appliedModifiers));
}

// =============================================================================
// ROUTE READER STAT SHIFT
// =============================================================================
// A route the Route Reader (15/19/22/14) just misses: Str −3, Tech +1, Focus +2,
// Flex −2. Two stats fail, so even with Versatility (3 of 4, the 4th within 3)
// it falls — unless a shift fixes one of them.
const silo = { ...ROUTES.bouldering.find(r => r.name === 'Strength Silo'), name: 'Shift Test', strength: 18, technique: 18, focus: 20, flexibility: 16, rollEffect: [] };
const passesBase = (st, route) => {
  const m = ['strength', 'technique', 'focus', 'flexibility'].map(k => st[k] - route[k]).sort((a, b) => b - a);
  return m[2] >= 0 && m[3] >= -3;
};
{
  const rr = charBase('routeReader');
  const shift = bestRouteReaderShift(rr, silo, 'bouldering', {});
  const shifted = shift && { ...rr.stats, [shift.from]: rr.stats[shift.from] - shift.amount, [shift.to]: rr.stats[shift.to] + shift.amount };
  check('bestRouteReaderShift turns a just-missed climb into a send (Versatility, 1.1.0)',
    shift && !passesBase(rr.stats, silo) && passesBase(shifted, silo), JSON.stringify(shift));
  check('bestRouteReaderShift: null for other climbers', bestRouteReaderShift(charBase('ironLung'), silo, 'bouldering', {}) === null);
  const safe = { ...silo, strength: 5, technique: 5, focus: 5, flexibility: 5 };
  check('bestRouteReaderShift: null when the climb is already safe', bestRouteReaderShift(rr, safe, 'bouldering', {}) === null);
  check('isWellFormedStatShift rejects amount 11', !isWellFormedStatShift({ from: 'strength', to: 'focus', amount: 11 }));
  check('isWellFormedStatShift rejects same stat', !isWellFormedStatShift({ from: 'focus', to: 'focus', amount: 3 }));
}
{
  let { state } = createGame({ seed: 11, characterKeys: ['routeReader', 'ironLung'] });
  state.availableRoutes.bouldering = [silo, ...state.availableRoutes.bouldering.filter(r => r.name !== silo.name)].slice(0, 5);
  const legal = getLegalActions(state);
  const variant = legal.find(a => a.type === 'climb' && a.routeName === silo.name && a.shift);
  check('legal actions include a suggested-shift climb for the Route Reader', !!variant);
  check('the plain climb is still listed', legal.some(a => a.type === 'climb' && a.routeName === silo.name && !a.shift));

  const res = applyAction(state, variant);
  const after = res.state.players[0].character;
  check('shift climb marks the ability used', after.abilityUsed === true);
  check('shift climb emits Versatility activation',
    res.events.some(e => e.type === 'ability_activated' && e.payload.ability === 'Versatility'));
  const resolved = res.events.find(e => e.type === 'climb_resolved');
  const base = state.players[0].character.stats;
  check('shift is applied to the climb stats',
    resolved && resolved.payload.effectiveStats[variant.shift.to] === base[variant.shift.to] + variant.shift.amount &&
    resolved.payload.effectiveStats[variant.shift.from] === base[variant.shift.from] - variant.shift.amount);

  // Hand the turn back to the Route Reader, same round, with time to climb.
  ({ state } = res);
  state.currentPlayerIndex = 0;
  state.players[0].character.timeRemaining = 10;
  state.players[0].character.currentEndurance = 100;
  check('no shift variants once the ability is used',
    !getLegalActions(state).some(a => a.shift));
  const plain = getLegalActions(state).find(a => a.type === 'climb');
  check('a second shift in the same round is rejected',
    plain && throws(() => applyAction(state, { ...plain, shift: { from: 'strength', to: 'focus', amount: 1 } })));
  const tier = Object.keys(state.milestoneRoutes)[0];
  // Since 1.1.0 the shift also works on Milestones; a rules variant can turn that off.
  const offMilestones = { ...state, players: state.players.map((p, i) => i === 0
    ? { ...p, character: { ...p.character, abilityUsed: false, abilityParams: { shiftOnMilestones: false } } } : p) };
  check('a shift on a milestone is rejected when shiftOnMilestones is off',
    throws(() => applyAction(offMilestones, { type: 'milestone', difficulty: tier, shift: { from: 'strength', to: 'focus', amount: 1 } })));
}
{
  const { state } = createGame({ seed: 11, characterKeys: ['ironLung', 'routeReader'] });
  const plain = getLegalActions(state).find(a => a.type === 'climb');
  check('a non-Route Reader shift is rejected',
    throws(() => applyAction(state, { ...plain, shift: { from: 'strength', to: 'focus', amount: 1 } })));
}
{
  // Ability resets at round end.
  let { state } = createGame({ seed: 11, characterKeys: ['routeReader', 'ironLung'] });
  state.players[0].character.abilityUsed = true;
  ({ state } = applyAction(state, { type: 'endTurn' }));
  ({ state } = applyAction(state, { type: 'endTurn' }));
  check('stat shift is available again next round', state.players[0].character.abilityUsed === false);
}

// =============================================================================
// REPORT
// =============================================================================
const failures = results.filter(r => !r.pass).length;
if (failures) {
  console.error(`\n${failures} of ${results.length} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} v0.7.0 rules assertions passed.`);
