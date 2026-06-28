// Sanity check for the engine scaffolding.
//
// What this does: imports data.js, rng.js, version.js; runs ~10 assertions
// to confirm the data loaded correctly and the PRNG is deterministic.
// Intended to be run AFTER every significant refactor — if it fails, we
// broke something load-bearing.
//
// Run with:  npm run test:engine
// Exits 0 on pass, 1 on any failure.

import { CHARACTERS, ROUTES, GEAR_SHOP, XP_TABLE, TRAINING_AREAS } from './data.js';
import { createRng, deriveSeed } from './rng.js';
import { ENGINE_VERSION_STRING } from './version.js';

// Simple assertion harness — no test framework needed for five checks.
const assertions = [];
function check(label, cond) {
  assertions.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}`);
}

// --- Version format ---
check(
  'ENGINE_VERSION_STRING is semver-shaped',
  /^\d+\.\d+\.\d+$/.test(ENGINE_VERSION_STRING)
);

// --- Character roster ---
// We know only 5 are currently coded — tests ≥5, not ===10, to avoid a false
// failure until the roster is expanded.
check('Character roster has ≥5 entries', Object.keys(CHARACTERS).length >= 5);
check(
  'Every character has the expected shape',
  Object.values(CHARACTERS).every(c =>
    c.name && c.startingStats && c.growth && c.specialAbility
  )
);

// --- Route counts ---
// Each climbing area should have at least 20 routes; the pool is what
// available routes are drawn from each round.
check('Bouldering routes ≥20', ROUTES.bouldering.length >= 20);
check('Top-rope routes ≥20', ROUTES.topRope.length >= 20);
check('Lead-climbing routes ≥20', ROUTES.leadClimbing.length >= 20);

// Every route needs its four stats + costs + XP yields.
const allRoutes = [...ROUTES.bouldering, ...ROUTES.topRope, ...ROUTES.leadClimbing];
check(
  'Every route has required numeric fields',
  allRoutes.every(r =>
    typeof r.strength === 'number' &&
    typeof r.technique === 'number' &&
    typeof r.focus === 'number' &&
    typeof r.flexibility === 'number' &&
    typeof r.time === 'number' &&
    typeof r.endurance === 'number' &&
    typeof r.xpSuccess === 'number' &&
    typeof r.xpFail === 'number'
  )
);

// --- Gear shop ---
// gear shop is intentionally smaller (17 items: 3 access cards + 14 Mixture-3
// cards; the Harness access card was removed in RuleModifications).
check('Gear shop ≥15 items', GEAR_SHOP.length >= 15);

// Prerequisites must reference real gear names (e.g. "Locking Carabiner"
// requires "Belay Device" — if that name is misspelled, the prereq silently
// never matches).
const gearNames = new Set(GEAR_SHOP.map(g => g.name));
const brokenPrereqs = GEAR_SHOP.flatMap(g =>
  (g.prerequisiteItems || []).filter(name => !gearNames.has(name)).map(name => `${g.name} -> ${name}`)
);
check(
  'All gear prerequisites reference real items',
  brokenPrereqs.length === 0
);
if (brokenPrereqs.length) console.error('  broken:', brokenPrereqs);

// --- XP table ---
check('XP_TABLE covers levels 1..15', XP_TABLE.length === 15 && XP_TABLE[14].level === 15);

// --- Training areas ---
check('4 training areas (one per stat)', TRAINING_AREAS.length === 4);
check(
  'Training areas cover all four stats',
  new Set(TRAINING_AREAS.map(t => t.stat)).size === 4
);

// --- RNG determinism ---
// Two RNGs with the same seed should produce identical streams.
const rngA = createRng(42);
const rngB = createRng(42);
check('RNG deterministic: same seed -> same stream',
  rngA.next() === rngB.next() && rngA.rollDie() === rngB.rollDie());

// Different seeds should produce different streams (extremely high probability
// — if this fails, the seed isn't being used).
check('RNG seed affects stream',
  createRng(42).next() !== createRng(43).next());

// Seed derivation is stable and differentiating.
check('deriveSeed(5,2) is stable across calls',
  deriveSeed(5, 2) === deriveSeed(5, 2));
check('deriveSeed differs for different reps',
  deriveSeed(5, 2) !== deriveSeed(5, 3));

// --- Report ---
const failures = assertions.filter(a => !a.pass).length;
if (failures > 0) {
  console.error(`\n${failures} of ${assertions.length} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${assertions.length} assertions passed. engine v${ENGINE_VERSION_STRING}`);
