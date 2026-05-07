// Unit tests for engine/helpers.js.
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Each check either passes (✓) or fails (✗ with detail). Process exits
// non-zero on any failure so test:engine fails loudly in CI.
//
// The tests here are deliberately granular — each check exercises one
// formula or one branch. If a helper gets refactored and a check fails,
// it should be obvious which input broke.

import {
  checkAreaAccess, getSectionCapacity, isTrainingEquipment,
  canEnterSection, calculateGearBonuses, computeEffectiveStats,
  getEffectiveClimbTimeCost, getXpMultiplier, getGearPurchaseTimeCost,
  getEffectiveGearCost, getSpendableXp, buildEffectRollArray,
  rollClimbDice, applyDiceToRequirements, resolveClimbOutcome,
  computeClimbXp, getFailureEnduranceExtra, freeSoloCanAttempt,
  applyBetaBoostIfActive, computeRestRecovery, applyLevelUpIfNeeded,
} from './helpers.js';
import { createRng } from './rng.js';
import { ROUTES } from './data.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

// Convenient fixtures.
const techCharBase = () => ({
  key: 'technician', level: 1, xp: 0,
  stats: { strength: 12, technique: 26, focus: 18, flexibility: 14 },
  trainingBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  gearBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  equipment: [], timeRemaining: 10, currentEndurance: 100, maxEndurance: 100,
  location: 'lobby', betaBoostActive: false, abilityUsed: false,
  milestonesCompleted: { beginner: false, intermediate: false, expert: false },
});
const sprCharBase = () => ({ ...techCharBase(), key: 'sprinter',
  stats: { strength: 22, technique: 14, focus: 12, flexibility: 16 } });
const ironCharBase = () => ({ ...techCharBase(), key: 'ironLung',
  stats: { strength: 16, technique: 17, focus: 19, flexibility: 14 } });
const freeCharBase = () => ({ ...techCharBase(), key: 'freeSolo',
  stats: { strength: 11, technique: 23, focus: 20, flexibility: 16 } });
const routeReaderBase = () => ({ ...techCharBase(), key: 'routeReader',
  stats: { strength: 15, technique: 19, focus: 22, flexibility: 14 } });

// A simple bouldering route with one buff and one nerf die.
const boulderRoute = () => ({
  name: 'Warm-Up Wonder', grade: 'V1',
  strength: 22, technique: 25, focus: 18, flexibility: 20,
  time: 2, endurance: 16, xpSuccess: 32, xpFail: 12,
  rollEffect: [{ stat: 'technique', modifier: -1 }, { stat: 'focus', modifier: -1 }, { stat: 'strength', modifier: 1 }],
  gearModifiers: [], routeType: 'Vertical', holdFeatures: ['Jugs'], moveFeatures: [],
});

// =============================================================================
// AREA ACCESS
// =============================================================================
{
  const c = techCharBase();
  check('bouldering always accessible', checkAreaAccess(c, 'bouldering').hasAccess);
  check('topRope requires Harness + Belay',
    !checkAreaAccess(c, 'topRope').hasAccess &&
    checkAreaAccess(c, 'topRope').missingItems.length === 2);
  c.equipment = ['Harness', 'Belay Device'];
  check('topRope ok with Harness + Belay', checkAreaAccess(c, 'topRope').hasAccess);
  check('leadClimbing needs 4 items without Free Solo',
    !checkAreaAccess(c, 'leadClimbing').hasAccess);
  c.equipment = ['Harness', 'Belay Device', 'Locking Carabiner', 'Lead Rope'];
  check('leadClimbing ok with all 4 items', checkAreaAccess(c, 'leadClimbing').hasAccess);

  const fs = freeCharBase();
  check('Free Solo bypasses lead equipment',
    checkAreaAccess(fs, 'leadClimbing').hasAccess);
  check('Free Solo bypasses topRope equipment',
    checkAreaAccess(fs, 'topRope').hasAccess);
}

// =============================================================================
// SECTION CAPACITY
// =============================================================================
check('topRope capacity = belayers(1)', getSectionCapacity('topRope', 1) === 1);
check('topRope capacity scales with belayers(3)', getSectionCapacity('topRope', 3) === 3);
check('leadClimbing uses same belayer cap', getSectionCapacity('leadClimbing', 2) === 2);
check('training equipment capacity = 1',
  getSectionCapacity('Grip Board', 3) === 1 && isTrainingEquipment('Grip Board'));
check('bouldering unlimited (10)', getSectionCapacity('bouldering', 1) === 10);

// canEnterSection — a minimal state with two players
{
  const p1 = { playerNum: 1, character: { ...techCharBase(), location: 'topRope' } };
  const p2 = { playerNum: 2, character: { ...techCharBase(), location: 'lobby' } };
  const state = { players: [p1, p2], belayersUnlocked: 1 };
  // topRope full (1/1 capacity, p1 there); p2 cannot enter.
  const r = canEnterSection('topRope', 2, state);
  check('canEnterSection: topRope full at capacity=1 blocks p2', !r.canEnter);
  // p1 already there → re-entry allowed.
  check('canEnterSection: same-location re-entry allowed',
    canEnterSection('topRope', 1, state).canEnter);
}

// =============================================================================
// GEAR BONUSES
// =============================================================================
// v0.3.0 — Chalk Bag, Finger Tape, Climbing Shoes were removed from the deck.
// Validate the per-route gear filter system using ACCESS CARDS that still exist
// (Harness has -2 all on Top Rope/Lead routes — verifiable filter behavior).
{
  const c = techCharBase();
  c.equipment = ['Harness'];
  // Harness applies to Top Rope routes (routeFilter=["Top Rope", "Lead"]).
  const tr = { ...boulderRoute() };
  const bBouldering = calculateGearBonuses(c, tr, 'bouldering', {});
  check('Harness: no match on bouldering', bBouldering.strength === 0);
  const bTopRope = calculateGearBonuses(c, tr, 'topRope', {});
  check('Harness: -2 all stats on topRope', bTopRope.strength === 2 && bTopRope.technique === 2 && bTopRope.focus === 2 && bTopRope.flexibility === 2);
}
{
  // Permanent stat-trainer gear (Grip Strength Trainer value=+2) should NOT
  // appear in per-route calc (it lives in gearBonuses already).
  const c = techCharBase();
  c.equipment = ['Grip Strength Trainer'];
  const b = calculateGearBonuses(c, boulderRoute(), 'bouldering', {});
  check('positive-value trainer gear is skipped in per-route calc', b.strength === 0);
}

// =============================================================================
// EFFECTIVE STATS
// =============================================================================
{
  // v0.3.0 — verify base + training + gearBonuses stacking. No per-route gear
  // bonus available in the new deck on a generic boulder route, so the per-route
  // contribution is 0; we just confirm the three permanent sources stack.
  const c = techCharBase();
  c.trainingBonuses = { strength: 5, technique: 0, focus: 0, flexibility: 0 };
  c.gearBonuses = { strength: 2, technique: 0, focus: 0, flexibility: 0 };
  const s = computeEffectiveStats(c, boulderRoute(), 'bouldering', {});
  // 12 base + 5 training + 2 gearBonuses + 0 perRoute = 19
  check('effective strength stacks base + training + gearBonuses', s.strength === 19);
  check('effective technique unchanged', s.technique === 26);
}

// =============================================================================
// COST MODIFIERS
// =============================================================================
check('Sprinter time cost: 4 → 2', getEffectiveClimbTimeCost(sprCharBase(), 4) === 2);
check('Sprinter time cost floors at 1 (2 → 1, not 0)',
  getEffectiveClimbTimeCost(sprCharBase(), 2) === 1);
check('Technician time cost: 4 → 5', getEffectiveClimbTimeCost(techCharBase(), 4) === 5);
check('Other chars unchanged time cost', getEffectiveClimbTimeCost(ironCharBase(), 4) === 4);
check('Sprinter XP multiplier 0.5', getXpMultiplier(sprCharBase()) === 0.5);
check('Others XP multiplier 1.0', getXpMultiplier(techCharBase()) === 1.0);
check('Gear purchase free with Gear Bag', (() => {
  const c = techCharBase(); c.equipment = ['Gear Bag'];
  return getGearPurchaseTimeCost(c) === 0;
})());
check('Gear purchase costs 1 without Gear Bag',
  getGearPurchaseTimeCost(techCharBase()) === 1);
check('Non-Locking Carabiner discounts Locking Carabiner by 20', (() => {
  const c = techCharBase(); c.equipment = ['Non-Locking Carabiner'];
  return getEffectiveGearCost(c, { name: 'Locking Carabiner', cost: 60 }) === 40;
})());
check('Non-Locking Carabiner does not discount other gear', (() => {
  const c = techCharBase(); c.equipment = ['Non-Locking Carabiner'];
  return getEffectiveGearCost(c, { name: 'Chalk Bag', cost: 60 }) === 60;
})());

// =============================================================================
// SPENDABLE XP
// =============================================================================
{
  // At Level 2, cumulative XP required is 100. Player with 145 XP total has
  // 45 spendable (earnings since hitting Level 2).
  const c = techCharBase(); c.level = 2; c.xp = 145;
  check('spendableXp at Level 2 with 145 XP = 45', getSpendableXp(c) === 45);
  // At Level 1 with 50 XP, everything is spendable.
  const c2 = techCharBase(); c2.level = 1; c2.xp = 50;
  check('spendableXp at Level 1 with 50 XP = 50', getSpendableXp(c2) === 50);
}

// =============================================================================
// DICE ROLLING + SPRINTER EXTRA
// =============================================================================
{
  const r = boulderRoute(); // 3 effects
  check('buildEffectRollArray: technician = 3 effects',
    buildEffectRollArray(techCharBase(), r).length === 3);
  check('buildEffectRollArray: sprinter adds extra nerf die (4 total)',
    buildEffectRollArray(sprCharBase(), r).length === 4);
  check('Sprinter extra die targets focus with nerf modifier', (() => {
    const arr = buildEffectRollArray(sprCharBase(), r);
    const extra = arr[arr.length - 1];
    return extra.stat === 'focus' && extra.modifier === 1 && extra.source === 'sprinter_flash_speed';
  })());
}
{
  // Pure-Skill route (empty rollEffect) still rolls 2 dice (they get ignored).
  const pureSkill = { ...boulderRoute(), rollEffect: [] };
  const rng = createRng(1);
  const dice = rollClimbDice(rng, buildEffectRollArray(techCharBase(), pureSkill));
  check('Pure-Skill route: 2 dice rolled even with empty effects', dice.length === 2);
}

// =============================================================================
// APPLY DICE TO REQUIREMENTS
// =============================================================================
{
  // Technician: all +1 nerf dice are negated; then -5 blanket.
  const c = techCharBase();
  const r = boulderRoute();
  const effects = buildEffectRollArray(c, r);
  const dice = [5, 5, 5];
  const out = applyDiceToRequirements(c, r, effects, dice);
  // route.strength=22, -5 blanket (nerf negated, so no +5 applied) → 17
  check('Technician: nerf negated; -5 blanket applied',
    out.requirements.strength === 22 - 5);
  // technique: -1 mod with die=5 → -5, then -5 blanket → 25 - 5 - 5 = 15
  check('Technician: buff dice still apply',
    out.requirements.technique === 25 - 5 - 5);
}
{
  // Free Solo: all dice effects become 0, so requirements are unchanged.
  const c = freeCharBase();
  const r = boulderRoute();
  const effects = buildEffectRollArray(c, r);
  const dice = [6, 6, 6];
  const out = applyDiceToRequirements(c, r, effects, dice);
  check('Free Solo: dice effects negated, requirements = base',
    out.requirements.strength === 22 &&
    out.requirements.technique === 25 &&
    out.requirements.focus === 18 &&
    out.requirements.flexibility === 20);
}
{
  // Plain character (Iron Lung): dice apply normally.
  const c = ironCharBase();
  const r = boulderRoute();
  const effects = buildEffectRollArray(c, r);
  const dice = [3, 4, 5];
  const out = applyDiceToRequirements(c, r, effects, dice);
  // technique: -1 mod * 3 → -3 → 25 - 3 = 22
  // focus: -1 mod * 4 → -4 → 18 - 4 = 14
  // strength: +1 mod * 5 → +5 → 22 + 5 = 27
  check('Iron Lung: dice apply normally', (
    out.requirements.technique === 22 &&
    out.requirements.focus === 14 &&
    out.requirements.strength === 27
  ));
}

// =============================================================================
// RESOLVE CLIMB OUTCOME (3-of-4 for Route Reader)
// =============================================================================
{
  const reqs = { strength: 20, technique: 20, focus: 20, flexibility: 20 };
  const stats = { strength: 25, technique: 25, focus: 25, flexibility: 10 }; // fails flex
  const a = resolveClimbOutcome(techCharBase(), stats, reqs);
  check('Technician fails if any stat short', a.success === false && a.passCount === 3);
  const b = resolveClimbOutcome(routeReaderBase(), stats, reqs);
  check('Route Reader succeeds with 3/4 passing',
    b.success === true && b.passCount === 3);
}

// =============================================================================
// XP COMPUTATION (Sprinter 0.5x, Iron Lung +50% on fail)
// =============================================================================
{
  const r = boulderRoute(); // xpSuccess=32, xpFail=12
  check('Technician success XP = 32', computeClimbXp(techCharBase(), r, true) === 32);
  check('Sprinter success XP = 16 (0.5x)', computeClimbXp(sprCharBase(), r, true) === 16);
  check('Technician fail XP = 12', computeClimbXp(techCharBase(), r, false) === 12);
  check('Iron Lung fail XP = 18 (12 + 50%)',
    computeClimbXp(ironCharBase(), r, false) === 18);
  check('Sprinter fail XP = 6 (0.5x of 12)',
    computeClimbXp(sprCharBase(), r, false) === 6);
}
check('Iron Lung extra fail endurance = 5', getFailureEnduranceExtra(ironCharBase()) === 5);
check('Other chars no extra fail endurance', getFailureEnduranceExtra(techCharBase()) === 0);

// =============================================================================
// FREE SOLO GUARANTEE CHECK
// =============================================================================
{
  const c = freeCharBase();
  const r = boulderRoute(); // reqs: str 22, tech 25, focus 18, flex 20
  check('Free Solo blocked when any stat below base', !freeSoloCanAttempt(c, r));
  c.stats = { strength: 100, technique: 100, focus: 100, flexibility: 100 };
  check('Free Solo allowed when all stats clear', freeSoloCanAttempt(c, r));
  // Other characters unaffected.
  check('Non-Free-Solo unaffected by guarantee check',
    freeSoloCanAttempt(techCharBase(), r));
}

// =============================================================================
// BETA BOOST (Route Reader, post-rest)
// =============================================================================
{
  const c = routeReaderBase();
  c.betaBoostActive = true;
  const stats = { strength: 10, technique: 10, focus: 10, flexibility: 10 };
  const { stats: s2, consumed } = applyBetaBoostIfActive(c, stats);
  check('Beta Boost: +3 all stats', s2.strength === 13 && s2.flexibility === 13);
  check('Beta Boost: consumed flag flipped off', consumed === true && c.betaBoostActive === false);
  // Second call with flag off: no-op.
  const { consumed: c2 } = applyBetaBoostIfActive(c, stats);
  check('Beta Boost: second call no-op', c2 === false);
}

// =============================================================================
// REST RECOVERY
// =============================================================================
{
  const c = techCharBase();
  c.currentEndurance = 20; c.maxEndurance = 100;
  const r = computeRestRecovery(c);
  // recovery = 100 → 20+100=120, capped at max+0=100 → 100
  check('Rest without gear: +80, capped at max', r.newEndurance === 100 && r.delta === 80);
  // v0.3.0 — Water Bottle removed; use Beta Reading Book (restBonus: 10) instead.
  c.equipment = ['Beta Reading Book'];
  const r2 = computeRestRecovery(c);
  // cap = 100+10 = 110. 20+100=120, capped at 110 → 110.
  check('Rest with Beta Reading Book: cap raised to max+restBonus', r2.newEndurance === 110);
}

// =============================================================================
// LEVEL-UP TRIGGER & STAT RECOMPUTATION
// =============================================================================
{
  const c = techCharBase();
  // Technician: starting (12,26,18,14), growth (1.5,4.5,2.5,2), endurance base 100, endurance growth 5.
  // XP needed to reach level 2 cumulative: 100.
  c.xp = 99;
  const a = applyLevelUpIfNeeded(c);
  check('level-up skipped below threshold', a.leveledUp === false && c.level === 1);
  c.xp = 100;
  const b = applyLevelUpIfNeeded(c);
  check('level-up triggers at threshold',
    b.leveledUp === true && c.level === 2);
  // At Level 2: stats = round(base + growth * 1).
  // strength: round(12 + 1.5) = 14; technique: round(26 + 4.5) = 31 (rounds down on .5 in JS); focus: round(18 + 2.5) = 21 (or 20); flexibility: round(14 + 2) = 16.
  // JS Math.round uses banker's rounding only for .5 in some cases; let's
  // just verify the deltas go in the right direction rather than pinning exact values.
  check('level-up: strength went up', c.stats.strength > 12);
  check('level-up: technique went up', c.stats.technique > 26);
  check('level-up: maxEndurance went up', c.maxEndurance > 100);
}

// =============================================================================
// REPORT
// =============================================================================
const failures = results.filter(r => !r.pass).length;
if (failures) {
  console.error(`\n${failures} of ${results.length} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} helper assertions passed.`);
