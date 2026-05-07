// Game state factory.
//
// Responsibilities:
//   - createGame({ seed, characterKeys }) → { state, events }
//       Produces a brand-new game ready for the first player's first turn.
//       All randomness (milestone picks, route/shop shuffles) is derived
//       from the seed so identical (seed, characters) always produce the
//       identical opening position.
//
// Non-responsibilities (handled elsewhere):
//   - getLegalActions / applyAction / isTerminal live in engine.js
//   - UI rendering is not this module's concern
//
// State shape note:
//   state.attemptedRoutes is a PLAIN OBJECT, not a Set, so the whole state
//   object serializes cleanly to JSON. Keys look like "bouldering:Crux Problem"
//   and values are true. This matches the Set-based semantics from game.js.

import { ROUTES, GEAR_SHOP, CHARACTERS } from './data.js';
import { createRng } from './rng.js';
import { makeEmitter } from './telemetry.js';
import { ENGINE_VERSION_STRING } from './version.js';

// Gear items that are NEVER in the random 3-slot shop rotation. They are
// always available for purchase from a separate "access card" section,
// gated by prerequisites. Matches game.js:798.
const ACCESS_CARDS = ['Harness', 'Belay Device', 'Locking Carabiner', 'Lead Rope'];

// ---------- Public API ----------

export function createGame({ seed, characterKeys }) {
  // Validate inputs up front — these are the pipeline's guarantees,
  // so a bad input is a programming bug, not runtime noise.
  if (!Array.isArray(characterKeys) || characterKeys.length < 1 || characterKeys.length > 4) {
    throw new Error('characterKeys must be an array of 1–4 character keys');
  }
  if (new Set(characterKeys).size !== characterKeys.length) {
    // Per playtest design decision (2026-04-21): no duplicate characters in a game.
    throw new Error('duplicate character keys are not allowed');
  }
  for (const key of characterKeys) {
    if (!CHARACTERS[key]) throw new Error(`unknown character key: ${key}`);
  }
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new Error('seed must be a finite number');
  }

  const rng = createRng(seed);
  const emitter = makeEmitter(0);

  // Build players.
  const players = characterKeys.map((key, i) => makePlayer(i + 1, key));

  // Pick milestone routes FIRST (matches game.js:773 ordering — milestones
  // are selected before the 5-per-area route rotation is drawn).
  const milestones = pickMilestoneRoutes(rng);

  // Draw 5 routes per area for the opening rotation.
  const availableRoutes = {
    bouldering: rng.pickN(ROUTES.bouldering, 5),
    topRope: rng.pickN(ROUTES.topRope, 5),
    leadClimbing: rng.pickN(ROUTES.leadClimbing, 5),
  };

  // Draw 3 non-access-card items for the shop rotation.
  const availableGear = initializeGearShop(rng);

  // Seed per-player attempt tracking.
  const attemptedRoutes = {};
  for (const p of players) attemptedRoutes[p.playerNum] = {};

  const state = {
    engineVersion: ENGINE_VERSION_STRING,
    seed,
    round: 1,
    currentPlayerIndex: 0,
    players,
    availableRoutes,
    availableGear,
    milestoneRoutes: milestones,
    // Route-clearing token positions (game.js comments at line 240):
    //   0 → next end-of-round clear is Lead
    //   1 → next end-of-round clear is Top Rope
    //   2 → next end-of-round clear is Bouldering
    // Rotates 0 → 1 → 2 → 0 at end of each round.
    routeClearingPosition: 0,
    // Belayer capacity for Top Rope and Lead sections. Starts at 1; round 5
    // unlocks 2nd belayer; round 12 unlocks 3rd (game.js endRound logic).
    belayersUnlocked: 1,
    attemptedRoutes,
    gameEnded: false,
    winner: null,
    pendingLevelUp: null,
    // Complete structured event log. Unbounded; no 20-entry cap.
    events: [],
    // RNG state snapshot. applyAction restores the PRNG from this so the
    // sequence of random numbers continues exactly where createGame left
    // off. Allows applyAction to be "pure" in the state-in/state-out sense
    // while still having deterministic randomness.
    rngState: rng.getState(),
  };

  // Emit the bootstrap events: a game_start describing everything needed
  // to reconstruct the opening position, then the first turn_start.
  emitter.emit('game_start', {
    seed,
    engineVersion: ENGINE_VERSION_STRING,
    players: players.map(p => ({
      playerNum: p.playerNum,
      characterKey: p.character.key,
      characterName: p.character.name,
      archetype: p.character.archetype,
      startingStats: { ...p.character.stats },
      startingEndurance: p.character.maxEndurance,
      specialAbility: p.character.specialAbility.name,
    })),
    milestoneRoutes: serializeMilestones(milestones),
    // Full snapshot of opening rotation so a replay can reconstruct without
    // re-running the PRNG from seed.
    initialAvailableRoutes: summarizeRoutes(availableRoutes),
    initialAvailableGear: availableGear.map(g => g.name),
  });

  emitter.emit('turn_start', {
    round: 1,
    playerNum: players[0].playerNum,
    timeRemaining: players[0].character.timeRemaining,
    endurance: players[0].character.currentEndurance,
  });

  // Persist the emitted events on state.
  state.events = emitter.events.slice();

  // Return both the full state AND the just-emitted delta. Callers
  // streaming to JSONL only need the delta; callers needing the running
  // log use state.events.
  return { state, events: emitter.events.slice() };
}

// ---------- Helpers ----------

// Build a player object in its initial state. Matches the shape produced by
// selectCharacter in game.js:732-748 with one exception: we deep-clone the
// character template up front so no mutation leaks back to CHARACTERS.
function makePlayer(playerNum, characterKey) {
  const tmpl = CHARACTERS[characterKey];
  // Deep-clone so the per-player `specialAbility.used` flag (and any
  // future per-player mutation) doesn't bleed into the shared template.
  const charBase = JSON.parse(JSON.stringify(tmpl));
  return {
    playerNum,
    character: {
      ...charBase,
      key: characterKey,
      level: 1,
      xp: 0,
      currentEndurance: tmpl.startingEndurance,
      maxEndurance: tmpl.startingEndurance,
      stats: { ...tmpl.startingStats },
      equipment: [],
      trainingBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
      gearBonuses: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
      timeRemaining: 10,
      abilityUsed: false,
      betaBoostActive: false,
      location: 'lobby',
      milestonesCompleted: { beginner: false, intermediate: false, expert: false },
    },
  };
}

// Categorize every route in ROUTES into a difficulty bucket, then pick one
// from each bucket for the three milestones. Mirrors the grade-to-bucket
// mapping in game.js:523-545 exactly.
function pickMilestoneRoutes(rng) {
  const beginner = [];
  const intermediate = [];
  const expert = [];

  for (const area of Object.keys(ROUTES)) {
    for (const route of ROUTES[area]) {
      const { grade } = route;
      // Bouldering V-grade buckets.
      if (['V0', 'V1', 'V2'].includes(grade)) {
        beginner.push({ area, route });
      } else if (['V3', 'V4', 'V5', 'V6', 'V7'].includes(grade)) {
        intermediate.push({ area, route });
      } else if (['V8', 'V9', 'V10', 'V11', 'V12'].includes(grade)) {
        expert.push({ area, route });
      }
      // Top-rope YDS buckets.
      else if (['5.6', '5.7', '5.8'].includes(grade)) {
        beginner.push({ area, route });
      } else if (['5.9', '5.10a', '5.10b', '5.10d', '5.11b', '5.11c'].includes(grade)) {
        intermediate.push({ area, route });
      } else if (['5.12a', '5.12b', '5.12d', '5.13a', '5.13c'].includes(grade)) {
        expert.push({ area, route });
      }
      // Lead-climbing-specific bucket overrides (game.js:538-545).
      else if (area === 'leadClimbing' && ['5.8', '5.9'].includes(grade)) {
        beginner.push({ area, route });
      } else if (area === 'leadClimbing' && ['5.10a', '5.10b', '5.10d', '5.11a', '5.11b', '5.11c'].includes(grade)) {
        intermediate.push({ area, route });
      } else if (area === 'leadClimbing' && ['5.12a', '5.12b', '5.12d', '5.13a', '5.14a'].includes(grade)) {
        expert.push({ area, route });
      }
      // Grades that don't fall into any bucket (e.g. 5.11a top-rope, 5.11d
      // lead, 5.13b, 5.15a…) are simply ineligible as milestones. That
      // matches the behavior in game.js — unmatched grades silently skip.
    }
  }

  // Guard: every bucket must have at least one candidate. If the data ever
  // drifts and a bucket empties, we want to fail loudly, not silently
  // select `undefined`.
  if (!beginner.length || !intermediate.length || !expert.length) {
    throw new Error(
      `milestone bucket empty: beginner=${beginner.length}, ` +
      `intermediate=${intermediate.length}, expert=${expert.length}`
    );
  }

  return {
    beginner: rng.pick(beginner),
    intermediate: rng.pick(intermediate),
    expert: rng.pick(expert),
  };
}

// Initialize the 3-slot random gear shop. Access cards are handled
// separately (they're always available for purchase, not rotated in).
function initializeGearShop(rng) {
  const nonAccessGear = GEAR_SHOP.filter(g => !ACCESS_CARDS.includes(g.name));
  return rng.pickN(nonAccessGear, 3);
}

// ---------- Event payload helpers ----------

// Compact representation of the milestones for the game_start event.
// We don't serialize the full route object because the replay tool can
// re-look-up routes by name from data.js.
function serializeMilestones(milestones) {
  return {
    beginner: {
      area: milestones.beginner.area,
      routeName: milestones.beginner.route.name,
      grade: milestones.beginner.route.grade,
    },
    intermediate: {
      area: milestones.intermediate.area,
      routeName: milestones.intermediate.route.name,
      grade: milestones.intermediate.route.grade,
    },
    expert: {
      area: milestones.expert.area,
      routeName: milestones.expert.route.name,
      grade: milestones.expert.route.grade,
    },
  };
}

// Summarize the opening route rotation by name only; callers can look up
// the full route data from engine/data.js if they need requirements/etc.
function summarizeRoutes(availableRoutes) {
  return {
    bouldering: availableRoutes.bouldering.map(r => r.name),
    topRope: availableRoutes.topRope.map(r => r.name),
    leadClimbing: availableRoutes.leadClimbing.map(r => r.name),
  };
}

// Exported for engine.js internal use (action handlers will need to
// distinguish access cards from rotation gear when computing legal actions).
export { ACCESS_CARDS };
