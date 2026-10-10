// AUTO-GENERATED FROM engine/{rng,telemetry,version,state,helpers,engine}.js — DO NOT EDIT BY HAND.
//
// Regenerate with: node engine/build-browser.js
// The rules engine as one classic script, so local play (game.js) runs the
// exact engine that online play and the bots use, even from file://.
// Load it AFTER game.js: engine data (CHARACTERS, XP_TABLE, TRAINING_AREAS, ROUTES, GEAR_SHOP) comes from
// game.js's GAME DATA globals. Exposes window.AscentEngine.
/* eslint-disable */
window.AscentEngine = (function () {
'use strict';
const __data = { CHARACTERS, XP_TABLE, TRAINING_AREAS, ROUTES, GEAR_SHOP };

// ---- engine/rng.js ----
const __rng = (function () {
'use strict';
// Seeded pseudo-random number generator (mulberry32 algorithm).
//
// WHY we need this instead of Math.random():
//   The pipeline must be REPRODUCIBLE. When an agent does something weird on
//   game seed=4242 (say, the Sprinter loses every match), we need to replay
//   that exact sequence of dice rolls, milestone selections, and shop
//   randomizations to debug it. Math.random() is not seedable, so you can
//   never reproduce a run. mulberry32 is a tiny, fast, well-distributed
//   32-bit PRNG that we can seed and replay.
//
// WHAT it replaces:
//   Every Math.random() call inside engine/ should go through createRng().
//   The UI layer (ui/*.js) may still use Math.random() for cosmetic things
//   like shimmer animations — those don't affect game outcomes.

// Create a new RNG. Callers get a stateful object with rolling methods.
// Each call to next()/rollDie() advances the internal state.
function createRng(seed) {
  // Coerce to a 32-bit unsigned integer — mulberry32 operates on 32-bit state.
  let state = seed >>> 0;

  // Return a float in [0, 1). Same contract as Math.random().
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,

    // Roll an integer die with `sides` faces (result is 1..sides inclusive).
    // Used for the 2d6 dice in climb attempts.
    rollDie: (sides = 6) => Math.floor(next() * sides) + 1,

    // Uniformly pick one element from an array.
    pick: (arr) => arr[Math.floor(next() * arr.length)],

    // Fisher-Yates shuffle that returns a COPY (does not mutate input).
    // Used for milestone-route selection and shop randomization.
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },

    // Pick N distinct elements from an array (without replacement).
    // Used e.g. to pick 5 bouldering routes from the pool of available ones.
    pickN: function (arr, n) {
      return this.shuffle(arr).slice(0, Math.min(n, arr.length));
    },

    // Expose internal state for debug/serialization. Two RNGs with equal
    // state will produce identical streams going forward.
    getState: () => state,
  };
}

// Derive a deterministic seed from (matchup_id, repetition_index).
//
// Used by the matrix orchestrator: the pipeline runs many matchups, each
// repeated N times. We want every (matchup, rep) pair to always yield the
// same game, so resumed or re-run matrices reproduce exactly. We hash the
// two integers together using a splitmix32-style mix.
function deriveSeed(matchupId, repIndex) {
  let h = ((matchupId | 0) * 2654435761) ^ ((repIndex | 0) * 40503);
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

return { createRng, deriveSeed };
})();

// ---- engine/telemetry.js ----
const __telemetry = (function () {
'use strict';
// Structured event emitter for the engine.
//
// WHY:
//   The existing game.js has a free-form text log of the last 20 entries.
//   That's fine for a human watching the sidebar, but useless for
//   aggregating across thousands of games or replaying a game. We replace
//   it with a structured event stream that:
//     (a) captures every significant state change with typed data,
//     (b) retains the full history (no 20-entry FIFO cap),
//     (c) is JSON-serializable so it can be written to JSONL, loaded into
//         analysis tools, and consumed by both the browser UI and the
//         simulation pipeline.
//
// DESIGN:
//   - Event shape: { t: <sequence number>, type: <snake_case string>, payload: <plain object> }
//   - `t` is a monotonic sequence number across the entire game. It is NOT
//     a wall-clock timestamp — wall-clock would break reproducibility
//     (two runs of the same seed must produce byte-identical event
//     streams). The writer layer can annotate with wall-clock at write
//     time if desired.
//   - Payloads are plain JSON-able objects. We do NOT deep-clone on emit
//     because that's hot-path expensive; callers pass values, not refs.
//
// USAGE:
//   createGame() and applyAction() each build a fresh emitter, emit events
//   in order, then return the collected events so callers can stream them.
//   The full running log is kept on state.events.

// Create a new emitter. `startingT` is the first sequence number to use —
// applyAction passes state.events.length so numbering continues across calls.
function makeEmitter(startingT = 0) {
  const events = [];
  let nextT = startingT;
  return {
    events,
    emit(type, payload = {}) {
      events.push({ t: nextT++, type, payload });
    },
  };
}

return { makeEmitter };
})();

// ---- engine/version.js ----
const __version = (function () {
'use strict';
// Engine version identifier.
//
// Why this file exists:
//   The playtest pipeline produces balance reports that only make sense when
//   compared against other runs of the SAME mechanical rules. When the rules
//   change meaningfully, old results stop being comparable. We track that
//   with a semver-style version so the analysis step can say "this run used
//   engine 0.2.0; last baseline was 0.1.0 — results are not comparable."
//
// Bump rules:
//   major -> a fundamental mechanic changed (win condition, dice system, etc.)
//   minor -> meaningful content change (new character, reworked ability, new route type)
//   patch -> balance tweaks within the same mechanical rules (stat numbers, costs)
//
// The analysis step treats major/minor bumps as baseline-invalidating. Patch
// bumps keep the same baseline so you can watch a number move in response to
// a single tweak.

// Note (TechDebt cleanup): the browser game (game.js) is stamped
//   GAME_VERSION to match this engine, and it now implements the same
//   Scenario 2C milestone selection (it previously used the old un-constrained
//   v0.3.x random pick). engine/data.js is no longer hand-synced: it is
//   auto-generated from game.js's GAME DATA section by
//   `node engine/build-data.js` (run by the test/playtest scripts; standalone
//   `npm run data:build` / `data:check`). Tooling/parity only — no rules change.
//
// 0.7.0 (2026-10-09): Rulebook-revision rules fixes.
//   - Solo games get 1 Top Rope belayer station (the "Auto-Belay"):
//     belayerCount = max(1, N − 1). Previously a solo game had 0 stations and
//     could never attempt its Top Rope milestone, so it was unwinnable.
//   - Milestone routes are removed from the wall decks (regularRoutePool), so
//     they never also appear as regular routes.
//   - Permanent gear max-endurance (Locking Carabiner +5) now survives
//     level-up; applyLevelUpIfNeeded used to recompute it away.
//   - Climbing Coach: +1 only to BUFF dice on milestone climbs (was every die,
//     which made nerf dice worse). effectKind milestoneBuffDiceBonus.
//   - Power Tap Belt: generic "roll 1 extra die, discard one" (N dice → roll
//     N+1, keep N). Was "keep best 2", which dropped dice on 3-die routes.
//     effectKind extraDieDiscardOne.
//   - Crimp Sequence Decoder and Sequence Memorization pick the die that
//     helps: Crimp re-rolls the die furthest on the wrong side of average
//     (3.5), Memorization sets the highest nerf die to 1. Both used to take
//     the highest die, which threw away good buff dice. The dice gear (Power
//     Tap Belt too) now scores choices by the dice's net effect after
//     Mountain Mentor, so it never improves a die that is cancelled anyway.
//   - Mountain Mentor cancels the highest nerf die (was: the first one).
//   - Power Spotting's success heal stops at max endurance but never lowers
//     endurance: a successful climb used to cap any surplus from rest-bonus
//     gear back down to max, even without Power Spotting (applySuccessHeal).
//   - climb_resolved now reports gearEffects (every gear effect that changed
//     the climb), failPenalty, and the real enduranceCost (it ignored Body
//     Tension Belt); dice_rolled reports discardedDice.
//   - Local hot-seat play runs this engine (engine/engine.browser.js, built by
//     engine/build-browser.js) instead of game.js's own copy of the rules, so
//     local and online play can no longer drift apart. findLegalAction and
//     explainIllegalAction back the UIs' click handling.
//   - Route Reader Versatility stat shift is now in the engine: a climb action
//     may carry shift {from, to, amount ≤ 10}, once per round, regular routes
//     only. getLegalActions adds one suggested-shift variant per climb when it
//     helps. (Previously only game.js local play had it, via prompt()
//     dialogs, so bots, sims and online play never used it.)
//   Minor bump — invalidates v0.6.x baselines (RNG draws, dice gear, Route
//   Reader strength and solo play all changed).
// 0.6.0 (2026-06-27): RuleModifications — Top Rope / Lead overhaul.
//   - Top Rope is now OPEN (no gear required) and split into N − 1 belayer
//     stations (N = player count), each holding 2 routes and admitting at most
//     1 climber. A station held by another player blocks both of its routes
//     until it clears; switching belayers is implicit in choosing a route at a
//     different free station. Belayer count is fixed from round 1 — the old
//     round-5 / round-12 unlock ramp is gone.
//   - Lead Climbing dropped the Harness requirement (Harness removed from the
//     game entirely); it now needs Belay Device + Locking Carabiner + Lead Rope
//     and is capped at 1 climber at a time (a single lead belayer).
//   - Route-clearing rotation moves every player back to the Lobby (and frees
//     all belayer stations) automatically.
//   State gained `belayerCount` (replacing `belayersUnlocked`) and a per-player
//   `belayerStation`. Top Rope routes carry a `belayer` index. Minor bump —
//   invalidates v0.5.x baselines (navigation, access economy, and Top Rope
//   contention all changed).
// 0.5.0 (2026-06-24): Removed the maxRounds safety cap. The official rules
//   of the game have no round limit — the only terminal condition is
//   "first player to complete all 3 milestone routes wins." The engine
//   previously imposed a default 45-round cap that ended games with no
//   winner if no one finished by then. That cap never existed in the
//   actual game design and was distorting playtest signal (any v0.4.x
//   game where the LLM was slowly converging would get cut off, counted
//   as a draw, and produce false "balance is off" reports). Removed from
//   engine/engine.js (isTerminal + applyAction), sim runners
//   (run-one-game.js, run-matrix.js, run-llm-smoke.js), sim/config*.json,
//   analysis/* dashboards, sim/agents/ollama.js prompt, and the rulebook.
//   The 'max_rounds' end reason no longer exists; games end via
//   'all_milestones' or 'forfeit'. Sim harness retains its own MAX_STEPS
//   counter (10,000) as a programming-bug safety net against runaway
//   agent loops — that's harness infrastructure, not a gameplay rule.
//   Minor bump — invalidates v0.4.x baselines because games that
//   previously ended at round 45 with no winner can now run longer.
// 0.4.0 (2026-05-08): Milestone selection now enforces "Scenario 2C —
//   sequential area-exclusion sampling." The three milestones are still
//   one Beginner / one Intermediate / one Expert, but they are guaranteed
//   to span all three climbing areas (bouldering / topRope / leadClimbing).
//   No more 3-expert or 3-beginner bad draws; no more games locked to a
//   single area. Minor bump — baseline win-rates from v0.3.x are NOT
//   directly comparable. Implementation: ~30 lines in engine/state.js
//   pickMilestoneRoutes; sequential picks with area filters on each step.
// 0.3.1 (2026-05-03): Free Solo guarantee check now includes training and
//   permanent gear bonuses (was: base stats only). Patch — same mechanical
//   rules, balance fix to make Free Solo viable. Comparable to v0.3.0.
// 0.3.0 (2026-05-02): tagged all 72 routes into 4 specialty categories
//   (Pinch/Crimp 16, Dynamic 14, Toe/Heel Hook 9, Roof/Sloper 8, untagged 25).
//   Replaced the gear shop entirely: dropped 33 generalist items; added
//   Mixture 3's 14 permission-style cards (re-rolls, dice manipulation,
//   tag-targeted time/endurance modifiers, character-fix passives) plus
//   the 4 access cards (Harness, Belay Device, Locking Carabiner, Lead Rope).
//   New gear schema: `effectKind` + `tagFilter` for non-stat effects.
//   Engine helpers gained: getEffectiveClimbEnduranceCost, getSuccessEnduranceHeal,
//   getTrainingBonusBoost; rollClimbDice now accepts (char, route, isMilestone)
//   for gear-driven dice manipulation. Minor bump — invalidates v0.2.x baselines.
// 0.2.0 (2026-05-02): added 3 strength-friendly V0/V1 routes (Power Pulley,
//   Open Door, Brute Start), lowered Beginner's Fortune Tech requirement
//   20 → 15, raised default maxRounds 30 → 45.
const ENGINE_VERSION = { major: 0, minor: 7, patch: 0 };
const ENGINE_VERSION_STRING = `${ENGINE_VERSION.major}.${ENGINE_VERSION.minor}.${ENGINE_VERSION.patch}`;

return { ENGINE_VERSION, ENGINE_VERSION_STRING };
})();

// ---- engine/state.js ----
const __state = (function () {
'use strict';
const { ROUTES, GEAR_SHOP, CHARACTERS } = __data;
const { createRng } = __rng;
const { makeEmitter } = __telemetry;
const { ENGINE_VERSION_STRING } = __version;
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






// Gear items that are NEVER in the random 3-slot shop rotation. They are
// always available for purchase from a separate "access card" section,
// gated by prerequisites.
//
// RuleModifications (2026-06-27): Top Rope no longer requires any gear, so the
// Harness card was removed. These three cards now gate ONLY Lead Climbing.
const ACCESS_CARDS = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];

// Number of top-rope routes assigned to each belayer station.
const ROUTES_PER_BELAYER = 2;

// Number of Top Rope belayer stations for a game with `playerCount` players:
// one fewer than the number of players, but never fewer than 1. A solo game
// gets a single station (the "Auto-Belay") — without it, a solo player could
// never attempt the Top Rope milestone every game includes.
function belayerCountFor(playerCount) {
  return Math.max(1, playerCount - 1);
}

// The routes of `area` that may be dealt to the wall: the area's deck minus
// this game's milestone routes. Milestone cards sit on the milestone board for
// the whole game, so they never also appear as a regular route.
function regularRoutePool(milestoneRoutes, area) {
  const milestoneNames = new Set(
    Object.values(milestoneRoutes || {})
      .filter(m => m && m.area === area)
      .map(m => m.route.name),
  );
  return ROUTES[area].filter(r => !milestoneNames.has(r.name));
}

// Draw the Top Rope rotation as N belayer stations of ROUTES_PER_BELAYER routes
// each, where N = belayerCount. Returns a FLAT array of 2×belayerCount routes,
// each tagged with a `belayer` index (0-based station). Keeping a flat array
// (rather than nested arrays) preserves every existing `.find/.forEach/.map`
// over availableRoutes.topRope; stations are derived from the tag. `pool` is
// the deck to draw from (regularRoutePool for topRope).
function drawTopRopeStations(rng, belayerCount, pool = ROUTES.topRope) {
  const count = Math.max(0, belayerCount) * ROUTES_PER_BELAYER;
  const drawn = count > 0 ? rng.pickN(pool, count) : [];
  return drawn.map((route, i) => ({ ...route, belayer: Math.floor(i / ROUTES_PER_BELAYER) }));
}

// ---------- Public API ----------

function createGame({ seed, characterKeys }) {
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

  // Top Rope belayer stations: N − 1 belayers for N players, minimum 1 (solo
  // Auto-Belay). Fixed from round 1 — no time-based unlock ramp.
  const belayerCount = belayerCountFor(players.length);

  // Pick milestone routes FIRST (matches game.js:773 ordering — milestones
  // are selected before the per-area route rotation is drawn).
  const milestones = pickMilestoneRoutes(rng);

  // Draw the opening rotation. Bouldering and Lead keep a flat list of 5;
  // Top Rope is split into belayerCount stations of 2 routes each.
  // Milestone routes are excluded from every wall's deck.
  const availableRoutes = {
    bouldering: rng.pickN(regularRoutePool(milestones, 'bouldering'), 5),
    topRope: drawTopRopeStations(rng, belayerCount, regularRoutePool(milestones, 'topRope')),
    leadClimbing: rng.pickN(regularRoutePool(milestones, 'leadClimbing'), 5),
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
    // Top Rope belayer-station count = number of players − 1, minimum 1
    // (belayerCountFor). Fixed for the whole game. Each station holds 2 routes and
    // admits at most 1 climber. Lead Climbing is separately capped at 1 climber
    // and is no longer tied to this count.
    belayerCount,
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
    // Top Rope belayer-station count for this game (players − 1).
    belayerCount,
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
      // Which Top Rope belayer station (0-based index) this player currently
      // occupies, or null when not at a station. Set when climbing a top-rope
      // route; cleared to null on entering any other area and at round end.
      belayerStation: null,
      milestonesCompleted: { beginner: false, intermediate: false, expert: false },
    },
  };
}

// Categorize every route in ROUTES into a difficulty bucket, then pick one
// route from each bucket for the three milestones.
//
// Engine v0.4.0 (Scenario 2C — area exclusion): the three milestones MUST
// span all three climbing areas (bouldering / topRope / leadClimbing). This
// is enforced via SEQUENTIAL AREA EXCLUSION:
//   1. Beginner is picked freely from the beginner bucket.
//   2. Intermediate is picked from routes in tiers whose area differs from
//      the beginner pick.
//   3. Expert is picked from routes whose area differs from BOTH prior picks.
// The route deck is dense enough in each non-beginner cell (Bouldering has
// 12 int / 7 exp, Top Rope 10 int / 8 exp, Lead 9 int / 7 exp) that step 2
// and step 3 always have candidates regardless of step 1's draw.
//
// This guarantees every game touches all three climbing areas AND has one
// beginner, one intermediate, one expert — solving the "3-expert / 3-beginner
// bad draw" problem that plagued v0.3.x.
//
// Grade-to-bucket mapping mirrors game.js:523-545 exactly.
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

  // Guard: every bucket must have at least one candidate.
  if (!beginner.length || !intermediate.length || !expert.length) {
    throw new Error(
      `milestone bucket empty: beginner=${beginner.length}, ` +
      `intermediate=${intermediate.length}, expert=${expert.length}`
    );
  }

  // === Scenario 2C: sequential area-exclusion sampling ===
  // 1. Beginner — free pick from any area.
  const beg = rng.pick(beginner);

  // 2. Intermediate — only from routes whose area differs from beg.area.
  const intCandidates = intermediate.filter(r => r.area !== beg.area);
  if (!intCandidates.length) {
    throw new Error(
      `no intermediate routes outside beginner area "${beg.area}". ` +
      `Route deck composition has drifted and Scenario 2C cannot satisfy ` +
      `"three different areas" constraint.`
    );
  }
  const int = rng.pick(intCandidates);

  // 3. Expert — only from routes whose area differs from BOTH prior picks.
  const expCandidates = expert.filter(
    r => r.area !== beg.area && r.area !== int.area
  );
  if (!expCandidates.length) {
    throw new Error(
      `no expert routes outside areas "${beg.area}" and "${int.area}". ` +
      `Route deck composition has drifted and Scenario 2C cannot satisfy ` +
      `"three different areas" constraint.`
    );
  }
  const exp = rng.pick(expCandidates);

  return { beginner: beg, intermediate: int, expert: exp };
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

return { belayerCountFor, regularRoutePool, drawTopRopeStations, createGame, ACCESS_CARDS };
})();

// ---- engine/helpers.js ----
const __helpers = (function () {
'use strict';
const { TRAINING_AREAS, GEAR_SHOP, XP_TABLE, CHARACTERS } = __data;
// Engine helpers: pure computations used by action handlers.
//
// Everything here is READ-ONLY unless the function name says otherwise.
//   - compute*, calculate*, check*, can*, get*, roll*  → read-only (may
//     return new objects, but never mutate the input state/player).
//   - apply*  → may mutate the passed-in character (consuming ability
//     flags, recomputing stats on level-up). Called only from the action
//     handlers in engine.js, which work on a cloned state.
//
// Why split this way:
//   Agents need to *preview* a climb's outcome (e.g. "would this route
//   succeed right now?") without consuming ability flags like Route
//   Reader's Beta Boost. So the read-only stat/dice helpers never touch
//   betaBoostActive. Consumption happens only inside resolveClimbOutcome,
//   which is used by the climb action handler.



// =============================================================================
// AREA ACCESS (game.js:367-412)
// =============================================================================

// Does the character satisfy the equipment gating for `area`?
// Returns { hasAccess: boolean, missingItems: string[] }.
// Free Solo's "Life or Die" passive bypasses all equipment requirements.
//
// RuleModifications (2026-06-27):
//   - Bouldering and Top Rope are OPEN — no gear required for either.
//   - Lead Climbing requires Belay Device + Locking Carabiner + Lead Rope
//     (Harness was removed from the game).
function checkAreaAccess(char, area) {
  if (char.key === 'freeSolo') return { hasAccess: true, missingItems: [] };
  if (area === 'bouldering' || area === 'topRope') {
    return { hasAccess: true, missingItems: [] };
  }

  const owned = new Set(char.equipment);

  if (area === 'leadClimbing') {
    const needs = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
    const missing = needs.filter(n => !owned.has(n));
    return { hasAccess: missing.length === 0, missingItems: missing };
  }
  return { hasAccess: true, missingItems: [] };
}

// =============================================================================
// SECTION CAPACITY (game.js:281-346)
// =============================================================================

// Returns how many players may occupy a given section simultaneously.
//
// RuleModifications (2026-06-27):
//   - Top Rope: total simultaneous occupancy = belayerCount (one climber per
//     belayer station). The REAL gate is per-station (see canClimbTopRopeRoute
//     / isBelayerStationFree); this number is the aggregate, used for display
//     and any generic capacity query.
//   - Lead Climbing: a single belayer — capacity 1, independent of belayerCount.
//   - Training equipment: 1-at-a-time. Everything else effectively unlimited.
function getSectionCapacity(section, belayerCount) {
  if (section === 'topRope') return Math.max(0, belayerCount);
  if (section === 'leadClimbing') return 1;
  if (isTrainingEquipment(section)) return 1;
  // bouldering, gearShop, rest, lobby — treat as unlimited.
  return 10;
}

// =============================================================================
// TOP ROPE BELAYER STATIONS (RuleModifications 2026-06-27)
// =============================================================================

// Stations occupied by players OTHER than `playerNum`. Returns a Set of
// 0-based belayer-station indices that are currently blocked for this player.
function getOccupiedBelayerStations(state, playerNum) {
  const occupied = new Set();
  for (const p of state.players) {
    if (p.playerNum === playerNum) continue;
    const c = p.character;
    if (c.location === 'topRope' && c.belayerStation !== null && c.belayerStation !== undefined) {
      occupied.add(c.belayerStation);
    }
  }
  return occupied;
}

// Is belayer station `stationIndex` available for `playerNum`? A station is
// available if no OTHER player occupies it (the asking player may already be
// parked there from an earlier turn this round — that's still "free" to them).
function isBelayerStationFree(state, stationIndex, playerNum) {
  return !getOccupiedBelayerStations(state, playerNum).has(stationIndex);
}

// May `playerNum` attempt this top-rope `route` right now? Legal if the route's
// belayer station is free for them. (Switching belayers is implicit: a climb at
// a different free station moves the player there; a station held by someone
// else blocks both of its routes.)
function canClimbTopRopeRoute(state, playerNum, route) {
  const station = route.belayer;
  if (station === null || station === undefined) return true; // untagged → no station gate
  return isBelayerStationFree(state, station, playerNum);
}

// Choose a belayer station for a player who must occupy one but isn't tied to a
// specific route's station (e.g. a Top Rope milestone attempt). Reuses the
// player's current station if they're already parked at Top Rope; otherwise the
// lowest-index free station. Returns null if every station is taken.
function pickFreeBelayerStation(state, playerNum) {
  const me = state.players.find(p => p.playerNum === playerNum);
  if (me && me.character.location === 'topRope' &&
      me.character.belayerStation !== null && me.character.belayerStation !== undefined) {
    return me.character.belayerStation;
  }
  const occupied = getOccupiedBelayerStations(state, playerNum);
  for (let i = 0; i < state.belayerCount; i++) {
    if (!occupied.has(i)) return i;
  }
  return null;
}

// Is `location` the name of one of the four training equipment stations?
function isTrainingEquipment(location) {
  return TRAINING_AREAS.some(a => a.name === location);
}

// Everyone currently standing at `section` (including the player asking).
function getPlayersInSection(players, section) {
  return players.filter(p => p.character.location === section);
}

// May `playerNum` enter `section` right now? Returns { canEnter, reason }.
// If the player is already there, they can stay (no-op re-entry always allowed).
function canEnterSection(section, playerNum, state) {
  const player = state.players.find(p => p.playerNum === playerNum);
  if (!player) return { canEnter: false, reason: 'player not found' };
  if (player.character.location === section) {
    return { canEnter: true, reason: '' };
  }
  const capacity = getSectionCapacity(section, state.belayerCount);
  const occupants = getPlayersInSection(state.players, section);
  if (occupants.length >= capacity) {
    const names = occupants.map(p => `Player ${p.playerNum}`).join(', ');
    if (isTrainingEquipment(section)) {
      return { canEnter: false, reason: `training equipment in use by ${names}` };
    }
    return { canEnter: false, reason: `section at capacity (${occupants.length}/${capacity}); occupied by ${names}` };
  }
  return { canEnter: true, reason: '' };
}

// =============================================================================
// GEAR BONUSES (game.js:416-505)
// =============================================================================

// Compute per-route stat bonuses granted by equipped gear.
// Returns { strength, technique, focus, flexibility } — amounts to ADD to the
// player's own stats (effectively lowering the effective requirement gap).
//
// Filter logic (matches game.js precisely):
//   - statEffect 'endurance' | 'time' | 'special' → skip (not a stat boost)
//   - "Repeated" filter → applies only on second+ attempt this round
//   - When BOTH routeFilter AND holdFeatureFilter are non-empty: OR logic
//     (either filter matching is sufficient).
//   - When only one filter type is present: that filter must match.
//   - "All" in routeFilter → always matches.
function calculateGearBonuses(char, route, area, attemptedRoutesForPlayer) {
  const bonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  const routeKey = `${area}:${route.name}`;
  const isRepeated = attemptedRoutesForPlayer && attemptedRoutesForPlayer[routeKey] === true;

  for (const gearName of char.equipment) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (!gear) continue;
    // Gear that is not a stat buff for climbing.
    if (['endurance', 'time', 'special', 'timePerRound', 'leadDiscount'].includes(gear.statEffect)) continue;
    // Permanent stat-trainer gear (e.g. Grip Strength Trainer) has value: 2
    // and already lives in char.gearBonuses via the buy handler; don't
    // double-apply it here.
    if (gear.value > 0) continue;

    // "Repeated" filter: only applies if we've attempted this route before
    // this round.
    if (gear.routeFilter && gear.routeFilter.includes('Repeated') && !isRepeated) continue;

    const hasRouteFilter = gear.routeFilter && gear.routeFilter.length > 0
      && !gear.routeFilter.includes('All')
      && !gear.routeFilter.includes('Repeated');
    const hasFeatureFilter = gear.holdFeatureFilter && gear.holdFeatureFilter.length > 0;

    if (hasRouteFilter || hasFeatureFilter) {
      let routeFilterPasses = false;
      let featureFilterPasses = false;

      if (hasRouteFilter) {
        if (area === 'bouldering' && gear.routeFilter.includes('Bouldering')) routeFilterPasses = true;
        if (area === 'topRope' && gear.routeFilter.includes('Top Rope')) routeFilterPasses = true;
        if (area === 'leadClimbing' && gear.routeFilter.includes('Lead')) routeFilterPasses = true;
        if (route.routeType && gear.routeFilter.includes(route.routeType)) routeFilterPasses = true;
      }
      if (hasFeatureFilter) {
        for (const f of (route.holdFeatures || [])) if (gear.holdFeatureFilter.includes(f)) featureFilterPasses = true;
        for (const f of (route.moveFeatures || [])) if (gear.holdFeatureFilter.includes(f)) featureFilterPasses = true;
      }

      // OR logic when both filter types are present; AND logic when only one.
      if (hasRouteFilter && hasFeatureFilter) {
        if (!routeFilterPasses && !featureFilterPasses) continue;
      } else {
        if (hasRouteFilter && !routeFilterPasses) continue;
        if (hasFeatureFilter && !featureFilterPasses) continue;
      }
    }

    // gear.value is negative for buffs (-3 Technique etc.). Bonuses here
    // are the absolute magnitude ADDED to the player's stat to make the
    // effective requirement easier to meet.
    const mag = Math.abs(gear.value);
    if (gear.statEffect === 'all') {
      bonuses.strength += mag;
      bonuses.technique += mag;
      bonuses.focus += mag;
      bonuses.flexibility += mag;
    } else if (['strength', 'technique', 'focus', 'flexibility'].includes(gear.statEffect)) {
      bonuses[gear.statEffect] += mag;
    }
  }
  return bonuses;
}

// =============================================================================
// STAT COMPUTATION (game.js:1693-1698)
// =============================================================================

// Compute a character's effective stats for a specific climb attempt.
// Combines base + training + permanent gear bonuses + per-route gear bonuses.
// Does NOT apply character-ability overrides (Route Reader Beta Boost etc.) —
// those are applied inside resolveClimbOutcome because they consume flags.
function computeEffectiveStats(char, route, area, attemptedRoutesForPlayer) {
  const perRouteGear = calculateGearBonuses(char, route, area, attemptedRoutesForPlayer);
  return {
    strength:    char.stats.strength    + char.trainingBonuses.strength    + char.gearBonuses.strength    + perRouteGear.strength,
    technique:   char.stats.technique   + char.trainingBonuses.technique   + char.gearBonuses.technique   + perRouteGear.technique,
    focus:       char.stats.focus       + char.trainingBonuses.focus       + char.gearBonuses.focus       + perRouteGear.focus,
    flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility + perRouteGear.flexibility,
  };
}

// =============================================================================
// COST MODIFIERS (character passives)
// =============================================================================

// Effective time cost of a climb for this character.
// Sprinter's "Flash Speed": -2 (min 1). Technician's "Perfect Beta": +1.
// Engine v0.3.0 also applies gear effectKind 'timeCostReduction' for tagged routes
// (Trick Foot Manual: Toe/Heel Hook climbs cost 1 less time).
function getEffectiveClimbTimeCost(char, baseTime, route = null) {
  let t = baseTime;
  if (char.key === 'sprinter') t = Math.max(1, t - 2);
  if (char.key === 'technician') t += 1;
  // Tag-targeted time-cost reduction gear
  if (route && route.tag) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'timeCostReduction' && gear.tagFilter === route.tag) {
        t = Math.max(1, t - (gear.value || 1));
      }
    }
  }
  return t;
}

// Engine v0.3.0 — endurance cost adjustment based on gear that targets route tags.
// Body Tension Belt halves endurance cost on Roof/Sloper routes.
// Returns the modified endurance cost (rounded up).
function getEffectiveClimbEnduranceCost(char, route, baseEndurance) {
  if (!route || !route.tag) return baseEndurance;
  let e = baseEndurance;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'enduranceHalvedOnTag' && gear.tagFilter === route.tag) {
      e = Math.ceil(e / 2);
    }
  }
  return e;
}

// XP multiplier applied to base success/fail XP before Iron Lung's bonus.
// Sprinter's "Flash Speed": 0.5. Everyone else: 1.0.
function getXpMultiplier(char) {
  return char.key === 'sprinter' ? 0.5 : 1.0;
}

// Time cost for a gear-shop purchase: Gear Bag makes shopping free.
function getGearPurchaseTimeCost(char) {
  return char.equipment.includes('Gear Bag') ? 0 : 1;
}

// Effective purchase price, applying the Non-Locking Carabiner discount for
// its two eligible items.
function getEffectiveGearCost(char, gear) {
  const hasNonLocking = char.equipment.includes('Non-Locking Carabiner');
  const eligibleForDiscount = ['Locking Carabiner', 'Quickdraws Set'];
  if (hasNonLocking && eligibleForDiscount.includes(gear.name)) {
    return Math.max(0, gear.cost - 20);
  }
  return gear.cost;
}

// Spendable XP within the current level (current-level earnings that haven't
// yet been spent on gear). When a player has 145 XP total at Level 2 (and
// Level 2 starts at 100 cumulative), spendable = 145 - 100 = 45.
function getSpendableXp(char) {
  const levelRow = XP_TABLE.find(r => r.level === char.level);
  const baseXp = levelRow ? levelRow.cumulative : 0;
  return Math.max(0, char.xp - baseXp);
}

// =============================================================================
// DICE ROLLING (game.js:1720-1725)
// =============================================================================

// Build the dice-modifier array for a climb attempt.
// Base: route.rollEffect (e.g. [{stat:'technique',modifier:-1}]).
// Sprinter appends one extra {stat:'focus',modifier:+1} nerf die.
// Returns a fresh array — does not mutate the route.
function buildEffectRollArray(char, route) {
  const effects = (route.rollEffect || []).map(e => ({ ...e }));
  if (char.key === 'sprinter') {
    effects.push({ stat: 'focus', modifier: 1, source: 'sprinter_flash_speed' });
  }
  return effects;
}

// The modifier a die will actually apply for this character once character
// overrides run (see applyDiceToRequirements): Free Solo negates every die,
// Technician negates nerf dice. Used to decide which dice are worth improving.
function effectiveDieModifier(char, effect) {
  if (!effect) return 0;
  if (char && char.key === 'freeSolo') return 0;
  if (char && char.key === 'technician' && effect.modifier === 1) return 0;
  return effect.modifier;
}

// Does this character own Mountain Mentor (negateOneNerfDie)?
function hasMountainMentor(char) {
  return !!char && (char.equipment || []).some(name => {
    const g = GEAR_SHOP.find(x => x.name === name);
    return g && g.effectKind === 'negateOneNerfDie';
  });
}

// Index of the nerf die Mountain Mentor cancels: the highest-rolled die whose
// effective modifier is +1 (the first such die on a tie), or -1 if none.
function mountainMentorDieIndex(char, effectRollArray, rolls) {
  let idx = -1;
  for (let i = 0; i < effectRollArray.length; i++) {
    if (effectiveDieModifier(char, effectRollArray[i]) !== 1) continue;
    if (idx === -1 || rolls[i] > rolls[idx]) idx = i;
  }
  return idx;
}

// Net amount the dice add to this climb's requirements (nerf dice add, buff
// dice subtract) after character overrides and, if owned, Mountain Mentor.
// Lower is better for the climber. The die-choosing gear minimises this.
function diceRequirementTotal(char, effectRollArray, rolls, mentor) {
  const mentorIdx = mentor ? mountainMentorDieIndex(char, effectRollArray, rolls) : -1;
  let total = 0;
  for (let i = 0; i < effectRollArray.length; i++) {
    if (i !== mentorIdx) total += effectiveDieModifier(char, effectRollArray[i]) * rolls[i];
  }
  return total;
}

// Roll the dice for a climb. `numDice` is max(2, effects.length) — even on a
// Type-C "Pure Skill" route (empty rollEffect) we roll 2 dice that get
// ignored, matching game.js behavior. Die i is applied to effectRollArray[i].
//
// Gear effects on dice (applied AFTER the initial roll, in this order). The
// "die of your choice" cards pick for the player: the die whose change most
// lowers the dice's net effect on the requirements (diceRequirementTotal — a
// buff die wants a high number, a nerf die a low one), first die on a tie.
// That total already leaves out dice that apply nothing: dice negated by Free
// Solo / Technician, dice past the route's effects, and the highest nerf die,
// which Mountain Mentor cancels.
//   - Crimp Sequence Decoder (rerollOnTag, Pinch/Crimp): re-roll one die,
//     scoring a re-roll as a fresh roll's average (3.5). No re-roll when no die
//     is expected to improve.
//   - Power Tap Belt (extraDieDiscardOne, Dynamic): roll ONE extra die, then
//     discard any one die — so an N-die climb rolls N+1 and keeps N. The extra
//     die is swapped in for whichever die it improves the most, or is itself
//     discarded if it improves nothing.
//   - Sequence Memorization (treatOneDieAsValue=1, every climb): treat one die
//     as 1 — in practice the highest nerf die still in play. Never lowers a
//     buff die; no change when no die would improve.
//   - Climbing Coach (milestoneBuffDiceBonus, milestone climbs only): every
//     BUFF die (modifier -1) is +1, max 6. Nerf dice are untouched.
//
// `trace` (optional array): each gear effect that fires pushes
// { gear, effectKind, die, from, to } (die = index into the returned rolls;
// Power Tap Belt also records `extra`, with die -1 when the extra die was the
// one discarded). Read-only bookkeeping for UIs; it never changes the rolls.
function rollClimbDice(rng, effectRollArray, char = null, route = null, isMilestone = false, trace = null) {
  const numDice = Math.max(2, effectRollArray.length);
  const ownedGear = (char && char.equipment ? char.equipment : [])
    .map(name => GEAR_SHOP.find(g => g.name === name))
    .filter(Boolean);
  const onTag = (gear) => route && route.tag && gear.tagFilter === route.tag;

  const rolls = [];
  for (let i = 0; i < numDice; i++) rolls.push(rng.rollDie(6));

  const mentor = hasMountainMentor(char);
  // Index of the die whose change to `to` most lowers diceRequirementTotal,
  // or -1 if no change helps.
  const bestDieToChange = (to) => {
    const before = diceRequirementTotal(char, effectRollArray, rolls, mentor);
    let bestIdx = -1;
    let bestGain = 0;
    for (let i = 0; i < rolls.length; i++) {
      const trial = rolls.slice();
      trial[i] = to;
      const gain = before - diceRequirementTotal(char, effectRollArray, trial, mentor);
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    }
    return bestIdx;
  };

  // Crimp Sequence Decoder: on tagged climbs, re-roll the die a fresh roll
  // (average 3.5) is most likely to improve.
  for (const gear of ownedGear) {
    if (gear.effectKind === 'rerollOnTag' && onTag(gear)) {
      const idx = bestDieToChange(3.5);
      if (idx === -1) continue;
      const from = rolls[idx];
      rolls[idx] = rng.rollDie(6);
      if (trace) trace.push({ gear: gear.name, effectKind: gear.effectKind, die: idx, from, to: rolls[idx] });
    }
  }

  // Power Tap Belt: roll an extra die, keep the best N (discard one).
  for (const gear of ownedGear) {
    if (gear.effectKind === 'extraDieDiscardOne' && onTag(gear)) {
      const extra = rng.rollDie(6);
      const bestIdx = bestDieToChange(extra);
      if (trace) {
        trace.push({ gear: gear.name, effectKind: gear.effectKind, die: bestIdx, extra,
          from: bestIdx === -1 ? extra : rolls[bestIdx], to: extra });
      }
      if (bestIdx !== -1) rolls[bestIdx] = extra;
    }
  }

  // Sequence Memorization: every climb, treat the die that gains most as `value` (1).
  for (const gear of ownedGear) {
    if (gear.effectKind === 'treatOneDieAsValue') {
      const target = gear.value || 1;
      const idx = bestDieToChange(target);
      if (idx === -1) continue;
      if (trace) trace.push({ gear: gear.name, effectKind: gear.effectKind, die: idx, from: rolls[idx], to: target });
      rolls[idx] = target;
    }
  }

  // Climbing Coach: on milestone climbs, every buff die +1 (max 6).
  if (isMilestone) {
    for (const gear of ownedGear) {
      if (gear.effectKind === 'milestoneBuffDiceBonus') {
        const bonus = gear.value || 1;
        for (let i = 0; i < effectRollArray.length; i++) {
          if (effectRollArray[i].modifier !== -1) continue;
          const from = rolls[i];
          rolls[i] = Math.min(6, rolls[i] + bonus);
          if (trace) trace.push({ gear: gear.name, effectKind: gear.effectKind, die: i, from, to: rolls[i] });
        }
      }
    }
  }
  return rolls;
}

// Apply dice rolls and character overrides to produce final per-stat
// requirement values for this climb attempt.
// Character overrides:
//   - Free Solo: all dice effects are negated (modifier treated as 0).
//   - Technician: all nerf dice (modifier +1) are negated; then all base
//     requirements are reduced by 5 (floored at 0).
//
// Engine v0.3.0 gear effect (negateOneNerfDie / Mountain Mentor):
//   On every climb, the player may treat ONE nerf die (modifier +1) as 0.
//   We cancel the highest-rolled nerf die (the first one on a tie), counting
//   only nerf dice the character overrides haven't already negated.
//
// Returns { requirements, appliedModifiers }
//   appliedModifiers = array of {die, stat, modifier, deltaApplied, source}
//   for telemetry. modifier is the POST-override value actually applied.
function applyDiceToRequirements(char, route, effectRollArray, diceRolls) {
  const requirements = {
    strength: route.strength,
    technique: route.technique,
    focus: route.focus,
    flexibility: route.flexibility,
  };
  const appliedModifiers = [];

  // Mountain Mentor: cancel the highest nerf die (one per climb).
  const mentorIdx = hasMountainMentor(char)
    ? mountainMentorDieIndex(char, effectRollArray, effectRollArray.map((_, i) => diceRolls[i] ?? 0))
    : -1;

  for (let i = 0; i < effectRollArray.length; i++) {
    const effect = effectRollArray[i];
    const die = diceRolls[i] ?? 0;
    let effectiveMod = effect.modifier;

    if (char.key === 'freeSolo') effectiveMod = 0;
    if (char.key === 'technician' && effectiveMod === 1) effectiveMod = 0;
    if (i === mentorIdx) effectiveMod = 0;

    // stat may be outside the four stat fields only as paranoia; ignore
    // silently if so (matches game.js permissiveness).
    if (effectiveMod !== 0 && requirements[effect.stat] !== undefined) {
      const delta = effectiveMod * die;
      requirements[effect.stat] = requirements[effect.stat] + delta;
      appliedModifiers.push({
        die, stat: effect.stat, modifier: effectiveMod, deltaApplied: delta, source: effect.source || 'route',
      });
    } else {
      appliedModifiers.push({
        die, stat: effect.stat, modifier: effectiveMod, deltaApplied: 0, source: effect.source || 'route',
      });
    }
  }

  // Technician's blanket -5 to all requirements, floored at 0.
  if (char.key === 'technician') {
    for (const k of Object.keys(requirements)) {
      requirements[k] = Math.max(0, requirements[k] - 5);
    }
  }
  return { requirements, appliedModifiers };
}

// =============================================================================
// CLIMB RESOLUTION
// =============================================================================

// Determine climb success by comparing effectiveStats to modifiedRequirements.
// Route Reader's "Versatility" passive: succeeds if 3 of 4 stats pass.
// All other characters: must pass all 4.
// Returns { success, perStatPass }.
function resolveClimbOutcome(char, effectiveStats, requirements) {
  const perStatPass = {
    strength:    effectiveStats.strength    >= requirements.strength,
    technique:   effectiveStats.technique   >= requirements.technique,
    focus:       effectiveStats.focus       >= requirements.focus,
    flexibility: effectiveStats.flexibility >= requirements.flexibility,
  };
  const passCount = Object.values(perStatPass).filter(Boolean).length;
  const needed = char.key === 'routeReader' ? 3 : 4;
  return { success: passCount >= needed, perStatPass, passCount };
}

// Compute XP for a climb result.
// Base: route.xpSuccess on success, route.xpFail on failure.
// Sprinter passive: 0.5x multiplier applied FIRST.
// Iron Lung "Relentless" passive on FAIL: +50% of the post-multiplier fail XP.
//
// Engine v0.3.0 gear effect (failBonusXp / Confidence Building):
//   Adds a flat +N XP to every failed climb.
//
// Returns an integer (floored).
function computeClimbXp(char, route, success) {
  const base = success ? route.xpSuccess : route.xpFail;
  let xp = base * getXpMultiplier(char);
  if (!success && char.key === 'ironLung') {
    xp += Math.floor(xp * 0.5);
  }
  // Confidence Building: failed climbs get +N bonus XP
  if (!success) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'failBonusXp') xp += (gear.value || 0);
    }
  }
  return Math.floor(xp);
}

// Iron Lung "Relentless": extra 5 endurance cost on failure.
// Engine v0.3.0 gear effect (ignoreFailPenalty / Mental Anchor): ignores the penalty.
function getFailureEnduranceExtra(char) {
  // Mental Anchor — bypass even Iron Lung's −5 fail penalty
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'ignoreFailPenalty') return 0;
  }
  return char.key === 'ironLung' ? 5 : 0;
}

// Engine v0.3.0 — Power Spotting heals endurance after every successful climb.
// Returns the amount to heal (0 if no such gear owned).
function getSuccessEnduranceHeal(char) {
  let heal = 0;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'successHealEndurance') heal += (gear.value || 0);
  }
  return heal;
}

// Endurance after a success heal of `heal`: the heal stops at maxEndurance but
// never takes endurance away, so endurance a rest pushed above max (rest-bonus
// gear) is kept.
function applySuccessHeal(currentEndurance, maxEndurance, heal) {
  if (heal <= 0) return currentEndurance;
  return Math.max(currentEndurance, Math.min(maxEndurance, currentEndurance + heal));
}

// Owned gear cards with the given effectKind.
function ownedGearWithEffect(char, effectKind) {
  return (char.equipment || [])
    .map(name => GEAR_SHOP.find(g => g.name === name))
    .filter(g => g && g.effectKind === effectKind);
}

// Every gear effect that changed a resolved climb, as structured entries for
// the climb_resolved event (and the UIs that show it). Each entry has
// { gear, effectKind } plus effect-specific fields:
//   timeCostReduction / enduranceHalvedOnTag  from, to (the cost)
//   rerollOnTag / treatOneDieAsValue / milestoneBuffDiceBonus  die, from, to
//   extraDieDiscardOne  extra, die (-1 = the extra die was discarded), from, to
//   negateOneNerfDie  die, value, stat
//   failBonusXp  xp;  ignoreFailPenalty  endurance (penalty avoided)
//   successHealEndurance  endurance (actually healed)
// `diceTrace` is the trace from rollClimbDice; `appliedModifiers` comes from
// applyDiceToRequirements.
function describeClimbGearEffects({
  char, route, effectRollArray, diceTrace, appliedModifiers, success, timeCost, enduranceCost, healed,
}) {
  const out = [];
  const names = (kind) => ownedGearWithEffect(char, kind).map(g => g.name).join(', ');

  const charOnlyTime = getEffectiveClimbTimeCost(char, route.time);
  if (timeCost < charOnlyTime) {
    out.push({ gear: names('timeCostReduction'), effectKind: 'timeCostReduction', from: charOnlyTime, to: timeCost });
  }
  if (enduranceCost < route.endurance) {
    out.push({ gear: names('enduranceHalvedOnTag'), effectKind: 'enduranceHalvedOnTag', from: route.endurance, to: enduranceCost });
  }
  for (const t of diceTrace) {
    if (t.effectKind === 'milestoneBuffDiceBonus' && t.from === t.to) continue; // already a 6
    out.push({ ...t });
  }
  const mentor = ownedGearWithEffect(char, 'negateOneNerfDie')[0];
  if (mentor) {
    effectRollArray.forEach((effect, i) => {
      if (effectiveDieModifier(char, effect) === 1 && appliedModifiers[i] && appliedModifiers[i].modifier === 0) {
        out.push({ gear: mentor.name, effectKind: 'negateOneNerfDie', die: i, value: appliedModifiers[i].die, stat: effect.stat });
      }
    });
  }
  if (!success) {
    for (const g of ownedGearWithEffect(char, 'failBonusXp')) {
      out.push({ gear: g.name, effectKind: 'failBonusXp', xp: g.value || 0 });
    }
    if (char.key === 'ironLung') {
      for (const g of ownedGearWithEffect(char, 'ignoreFailPenalty')) {
        out.push({ gear: g.name, effectKind: 'ignoreFailPenalty', endurance: 5 });
      }
    }
  } else if (healed > 0) {
    out.push({ gear: names('successHealEndurance'), effectKind: 'successHealEndurance', endurance: healed });
  }
  return out;
}

// Engine v0.3.0 — Old Climbing Journal boosts every training session by +N.
// Returns the per-training bonus boost (0 if no such gear owned).
function getTrainingBonusBoost(char) {
  let boost = 0;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'trainingBonusBoost') boost += (gear.value || 0);
  }
  return boost;
}

// =============================================================================
// FREE SOLO GUARANTEE CHECK
// =============================================================================

// Free Solo's "Life or Die" requires that the player's stats meet or exceed
// every base route requirement (before dice). This gates climbs at the
// legal-action level so Free Solo can never attempt a route that might fail.
//
// Engine v0.3.1 (2026-05-03) — TRAINING FIX:
//   Previously this check used `char.stats` only, meaning training and
//   permanent gear bonuses didn't help Free Solo unlock new routes.
//   Combined with the fact that v0.3.0 has no permanent stat-boost cards
//   and that XP only comes from climbing, this made Free Solo unwinnable
//   (chicken-and-egg: can't climb → can't earn XP → can't level up → still
//   can't climb). Now training bonuses AND permanent gear bonuses count
//   toward the guarantee. Per-route gear bonuses (situational discounts
//   like Crimp Sequence Decoder's tag re-roll) still do NOT count — those
//   are climb-time effects, not "do I have the strength" capabilities.
function freeSoloCanAttempt(char, route) {
  if (char.key !== 'freeSolo') return true;
  const get = (s) =>
    char.stats[s] +
    (char.trainingBonuses?.[s] || 0) +
    (char.gearBonuses?.[s] || 0);
  return (
    get('strength')    >= route.strength &&
    get('technique')   >= route.technique &&
    get('focus')       >= route.focus &&
    get('flexibility') >= route.flexibility
  );
}

// =============================================================================
// BETA BOOST APPLICATION (Route Reader, resting-granted)
// =============================================================================

// Consume betaBoostActive on char and return adjusted stats. Mutates char
// (flips the flag false) — this is in the apply* family of functions.
// If the flag isn't set, returns the input stats unchanged.
function applyBetaBoostIfActive(char, effectiveStats) {
  if (!char.betaBoostActive) return { stats: effectiveStats, consumed: false };
  const boosted = {
    strength:    effectiveStats.strength    + 3,
    technique:   effectiveStats.technique   + 3,
    focus:       effectiveStats.focus       + 3,
    flexibility: effectiveStats.flexibility + 3,
  };
  char.betaBoostActive = false;
  return { stats: boosted, consumed: true };
}

// =============================================================================
// ROUTE READER STAT SHIFT ("Versatility", once per round, regular climbs only)
// =============================================================================

// Before a regular (non-milestone) climb, a Route Reader may move up to
// MAX_STAT_SHIFT points from one stat to another for that climb only.
// A shift is { from, to, amount }.
const MAX_STAT_SHIFT = 10;
const SHIFT_STATS = ['strength', 'technique', 'focus', 'flexibility'];

// Is `shift` well-formed (two different stats, whole amount 1..MAX_STAT_SHIFT)?
function isWellFormedStatShift(shift) {
  return !!shift && typeof shift === 'object' &&
    SHIFT_STATS.includes(shift.from) && SHIFT_STATS.includes(shift.to) &&
    shift.from !== shift.to &&
    Number.isInteger(shift.amount) && shift.amount >= 1 && shift.amount <= MAX_STAT_SHIFT;
}

// May this character use a stat shift right now on this kind of climb?
function canUseStatShift(char, isMilestone) {
  return char.key === 'routeReader' && !char.abilityUsed && !isMilestone;
}

// Return a copy of `stats` with the shift applied.
function applyStatShiftToStats(stats, shift) {
  return { ...stats, [shift.from]: stats[shift.from] - shift.amount, [shift.to]: stats[shift.to] + shift.amount };
}

// Pick the most useful shift for a Route Reader before the dice are rolled,
// or null if no shift helps. A Route Reader sends when 3 of 4 stats pass, so
// the stat that decides the climb is the one with the 3rd-largest margin
// (stat − base requirement). We maximise that margin, then prefer the smallest
// amount that achieves it. Only offered when the margin is under 6 (one die's
// swing). Read-only: does not consume the ability.
function bestRouteReaderShift(char, route, area, attemptedRoutesForPlayer) {
  if (char.key !== 'routeReader') return null;
  let stats = computeEffectiveStats(char, route, area, attemptedRoutesForPlayer);
  if (char.betaBoostActive) {
    stats = Object.fromEntries(SHIFT_STATS.map(k => [k, stats[k] + 3]));
  }
  const deciding = (st) => SHIFT_STATS.map(k => st[k] - route[k]).sort((a, b) => b - a)[2];
  const baseline = deciding(stats);
  // A single die swings a requirement by at most 6. With a bigger margin the
  // climb is already safe, so don't offer (or waste) the once-per-round shift.
  if (baseline >= 6) return null;
  let best = null;
  let bestScore = baseline;
  for (const from of SHIFT_STATS) {
    for (const to of SHIFT_STATS) {
      if (from === to) continue;
      for (let amount = 1; amount <= MAX_STAT_SHIFT; amount++) {
        const score = deciding(applyStatShiftToStats(stats, { from, to, amount }));
        if (score > bestScore) { bestScore = score; best = { from, to, amount }; }
      }
    }
  }
  return best;
}

// =============================================================================
// REST RECOVERY (game.js:1958-2006)
// =============================================================================

// Compute post-rest endurance. Formula (from game.js):
//   recovery = char.maxEndurance
//   restBonus = sum(gear.restBonus over equipment)
//   newEndurance = min(maxEndurance + restBonus, currentEndurance + recovery)
// That is: rest gives you back one full maxEndurance of stamina, but caps
// at (maxEndurance + restBonus). The cap lets rest-bonus gear push you
// ABOVE max. Somewhat unusual but matches game.js.
function computeRestRecovery(char) {
  let restBonus = 0;
  for (const name of char.equipment) {
    const g = GEAR_SHOP.find(x => x.name === name);
    if (g && typeof g.restBonus === 'number') restBonus += g.restBonus;
  }
  const recovery = char.maxEndurance;
  const cap = char.maxEndurance + restBonus;
  const next = Math.min(cap, char.currentEndurance + recovery);
  return { newEndurance: next, delta: next - char.currentEndurance, restBonusApplied: restBonus };
}

// =============================================================================
// LEVEL-UP (game.js:2393-2435)
// =============================================================================

// Permanent max-endurance granted by owned gear (e.g. Locking Carabiner +5).
// Level-up recomputes maxEndurance from the growth formula, so this has to be
// added back or the gear bonus would vanish at the next level.
function getGearMaxEnduranceBonus(char) {
  let bonus = 0;
  for (const name of char.equipment || []) {
    const g = GEAR_SHOP.find(x => x.name === name);
    if (!g) continue;
    if (g.statEffect === 'endurance') bonus += g.value;
    if (typeof g.enduranceBonus === 'number') bonus += g.enduranceBonus;
  }
  return bonus;
}

// If the character's cumulative XP has crossed the next-level threshold,
// advance level and recompute stats from the growth formula. Mutates char.
// Returns { leveledUp: boolean, newLevel, oldStats, newStats, oldMaxEndurance, newMaxEndurance }.
function applyLevelUpIfNeeded(char) {
  if (char.level >= 15) return { leveledUp: false };
  const nextRow = XP_TABLE.find(r => r.level === char.level + 1);
  if (!nextRow) return { leveledUp: false };
  if (char.xp < nextRow.cumulative) return { leveledUp: false };

  const tmpl = CHARACTERS[char.key];
  const oldStats = { ...char.stats };
  const oldMaxEndurance = char.maxEndurance;
  char.level += 1;
  // Stats recompute from the base + growth formula (game.js:2422-2431).
  // Note: char.gearBonuses is SEPARATE from char.stats, so permanent
  // gear-trained bonuses persist correctly through level-up.
  char.stats = {
    strength:    Math.round(tmpl.startingStats.strength    + tmpl.growth.strength    * (char.level - 1)),
    technique:   Math.round(tmpl.startingStats.technique   + tmpl.growth.technique   * (char.level - 1)),
    focus:       Math.round(tmpl.startingStats.focus       + tmpl.growth.focus       * (char.level - 1)),
    flexibility: Math.round(tmpl.startingStats.flexibility + tmpl.growth.flexibility * (char.level - 1)),
  };
  char.maxEndurance = Math.round(tmpl.startingEndurance + tmpl.growth.endurance * (char.level - 1))
    + getGearMaxEnduranceBonus(char);
  return {
    leveledUp: true,
    newLevel: char.level,
    oldStats,
    newStats: { ...char.stats },
    oldMaxEndurance,
    newMaxEndurance: char.maxEndurance,
  };
}

// =============================================================================
// TOOL-CALL DISPATCH — Lite CPP action encoding
// =============================================================================
//
// Maps a semantic tool call ({tool, args}) to a concrete engine action from
// legalActions. Purpose: eliminate the "action_index" translation step where
// LLM rationale ("train Strength") and executed action ("Grip Board / Focus")
// have been observed to drift.
//
// This is a PURE function — no engine state coupling, no I/O. Callers pass
// their pre-computed legalActions list; we scan and match. Returns either:
//   { ok: true, action }        — dispatch succeeded; use `action` verbatim
//   { ok: false, reason, detail } — well-formed but illegal (station occupied,
//                                    route not in pool, unknown gear). The
//                                    LLM can react to `reason` on a retry
//                                    (see retry loop in sim/agents/ollama.js).
//
// Tool schema (advertised to the LLM in the tool-mode system prompt):
//   train              args: { stat: strength|technique|focus|flexibility }
//   rest               args: {}
//   climb              args: { route_name: string }
//   attempt_milestone  args: { tier:  beginner|intermediate|expert }
//   buy_gear           args: { gear_name: string }
//   end_turn           args: {}
const TOOL_STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TOOL_TIERS = ['beginner', 'intermediate', 'expert'];

// Reason codes are stable string enums so downstream analysis (drift script,
// build-report) and the retry-error prompt can pattern-match without parsing.
function dispatchToolCall(legalActions, toolCall) {
  if (!toolCall || typeof toolCall !== 'object') {
    return { ok: false, reason: 'malformed_call', detail: 'toolCall must be an object with `tool` and `args`' };
  }
  const { tool } = toolCall;
  // Accept both snake_case (args.route_name) and camelCase (args.routeName)
  // since different LLMs / templates emit different keys.
  const args = toolCall.args || {};
  const get = (snake, camel) => args[snake] ?? args[camel];

  switch (tool) {
    case 'end_turn': {
      const match = legalActions.find(a => a.type === 'endTurn');
      return match
        ? { ok: true, action: match }
        : { ok: false, reason: 'end_turn_unavailable', detail: 'engine did not emit an endTurn action' };
    }

    case 'rest': {
      const match = legalActions.find(a => a.type === 'rest');
      return match
        ? { ok: true, action: match }
        : { ok: false, reason: 'no_time_for_rest', detail: 'rest requires at least 1 time; you may be out of time this turn' };
    }

    case 'train': {
      const stat = String(get('stat', 'stat') || '').toLowerCase();
      if (!TOOL_STATS.includes(stat)) {
        return { ok: false, reason: 'invalid_stat', detail: `stat must be one of ${TOOL_STATS.join('|')} (got ${JSON.stringify(get('stat', 'stat'))})` };
      }
      const area = TRAINING_AREAS.find(a => a.stat === stat);
      if (!area) {
        // Defensive; TRAINING_AREAS covers all four stats.
        return { ok: false, reason: 'no_area_for_stat', detail: stat };
      }
      const match = legalActions.find(a => a.type === 'train' && a.areaName === area.name);
      return match
        ? { ok: true, action: match }
        : { ok: false, reason: 'train_station_unavailable',
            detail: `${area.name} (${stat}) is not available — occupied by another player, or you lack time/endurance` };
    }

    case 'climb': {
      const routeName = String(get('route_name', 'routeName') || '');
      if (!routeName) {
        return { ok: false, reason: 'missing_route_name', detail: 'climb requires args.route_name' };
      }
      const match = legalActions.find(a => a.type === 'climb' && a.routeName === routeName);
      if (match) return { ok: true, action: match };
      const climbable = legalActions.filter(a => a.type === 'climb').map(a => a.routeName);
      return {
        ok: false, reason: 'route_not_climbable',
        detail: `route "${routeName}" is not climbable this turn (already attempted this round, or not in the accessible pool). Currently climbable: ${climbable.slice(0, 6).join(', ') || '(none)'}`,
      };
    }

    case 'attempt_milestone': {
      const tier = String(get('tier', 'tier') || '').toLowerCase();
      if (!TOOL_TIERS.includes(tier)) {
        return { ok: false, reason: 'invalid_tier', detail: `tier must be one of ${TOOL_TIERS.join('|')} (got ${JSON.stringify(get('tier', 'tier'))})` };
      }
      const match = legalActions.find(a => a.type === 'milestone' && a.difficulty === tier);
      if (match) return { ok: true, action: match };
      const attemptable = legalActions.filter(a => a.type === 'milestone').map(a => a.difficulty);
      return {
        ok: false, reason: 'milestone_not_attemptable',
        detail: `${tier} milestone not attemptable — already completed, blocked by access cards, insufficient time/endurance, or another climber holds the belayer station. Attemptable now: ${attemptable.join(', ') || '(none)'}`,
      };
    }

    case 'buy_gear': {
      const gearName = String(get('gear_name', 'gearName') || '');
      if (!gearName) {
        return { ok: false, reason: 'missing_gear_name', detail: 'buy_gear requires args.gear_name' };
      }
      const match = legalActions.find(a => a.type === 'buyGear' && a.gearName === gearName);
      if (match) return { ok: true, action: match };
      const purchasable = legalActions.filter(a => a.type === 'buyGear').map(a => a.gearName);
      return {
        ok: false, reason: 'gear_not_buyable',
        detail: `"${gearName}" is not purchasable this turn (not in the shop's rotation slots, missing prereqs, or insufficient XP/time). Currently purchasable: ${purchasable.join(', ') || '(none)'}`,
      };
    }

    default:
      return {
        ok: false, reason: 'unknown_tool',
        detail: `unknown tool "${tool}". Valid tools: train, rest, climb, attempt_milestone, buy_gear, end_turn`,
      };
  }
}

return { checkAreaAccess, getSectionCapacity, getOccupiedBelayerStations, isBelayerStationFree, canClimbTopRopeRoute, pickFreeBelayerStation, isTrainingEquipment, getPlayersInSection, canEnterSection, calculateGearBonuses, computeEffectiveStats, getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost, getXpMultiplier, getGearPurchaseTimeCost, getEffectiveGearCost, getSpendableXp, buildEffectRollArray, rollClimbDice, applyDiceToRequirements, resolveClimbOutcome, computeClimbXp, getFailureEnduranceExtra, getSuccessEnduranceHeal, applySuccessHeal, describeClimbGearEffects, getTrainingBonusBoost, freeSoloCanAttempt, applyBetaBoostIfActive, MAX_STAT_SHIFT, isWellFormedStatShift, canUseStatShift, applyStatShiftToStats, bestRouteReaderShift, computeRestRecovery, getGearMaxEnduranceBonus, applyLevelUpIfNeeded, dispatchToolCall };
})();

// ---- engine/engine.js ----
const __engine = (function () {
'use strict';
const { GEAR_SHOP, TRAINING_AREAS } = __data;
const { createRng } = __rng;
const { makeEmitter } = __telemetry;
const { ACCESS_CARDS, drawTopRopeStations, regularRoutePool } = __state;
const { checkAreaAccess, canEnterSection, computeEffectiveStats, canClimbTopRopeRoute, pickFreeBelayerStation, getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost, getGearPurchaseTimeCost, getEffectiveGearCost, getSpendableXp, buildEffectRollArray, rollClimbDice, applyDiceToRequirements, resolveClimbOutcome, computeClimbXp, getFailureEnduranceExtra, getSuccessEnduranceHeal, applySuccessHeal, getTrainingBonusBoost, describeClimbGearEffects, freeSoloCanAttempt, applyBetaBoostIfActive, computeRestRecovery, applyLevelUpIfNeeded, bestRouteReaderShift, canUseStatShift, isWellFormedStatShift, applyStatShiftToStats, MAX_STAT_SHIFT } = __helpers;
// Engine public API.
//
// This is the surface that everything else (UI adapter, agents, simulation
// orchestrator, tests) talks to. It exposes three functions:
//
//   getLegalActions(state) → Action[]
//     Enumerate every action the current player may legally take right
//     now. Agents pick ONE item from this list each turn. The menu is
//     what makes the action space tractable — an LLM never has to
//     fabricate action syntax, it just selects an index.
//
//   applyAction(state, action) → { state, events }
//     Apply an action to a state, producing a new state and the delta of
//     events that were emitted during this action. Pure in the sense that
//     the input `state` is NOT mutated — the caller gets back a fresh
//     object it can safely hold on to or serialize.
//
//   isTerminal(state) → { done, winner, reason }
//     Has the game ended? Used by the orchestrator to stop calling
//     applyAction. `winner` is a playerNum or null (null = draw/timeout).
//
// Design notes:
//   - Determinism: applyAction stores rng state on `state.rngState` after
//     every call and restores it at the start of the next call. Same
//     (state, action) → same (nextState, events), byte-identical.
//   - Event log: every applyAction appends to state.events AND returns the
//     delta. Pipeline writers only need the delta; the UI uses the full
//     log to render history.
//   - No round cap (v0.5.0): the actual game has no maxRounds rule;
//     the engine no longer imposes one. Sim harnesses keep their own
//     MAX_STEPS counter to catch runaway agent loops (a programming bug,
//     not a gameplay condition).







// =============================================================================
// getLegalActions — enumerate the current player's menu
// =============================================================================

function getLegalActions(state) {
  if (state.gameEnded) return [];
  const player = state.players[state.currentPlayerIndex];
  const char = player.character;
  const actions = [];

  // End-turn is always legal — an agent can always choose to pass.
  actions.push({ type: 'endTurn' });

  // Rest: 1 time unit, no endurance cost.
  if (char.timeRemaining >= 1) {
    actions.push({ type: 'rest' });
  }

  // Training: one per station, capacity 1 per round, costs time + endurance.
  for (const area of TRAINING_AREAS) {
    if (char.timeRemaining < area.time) continue;
    if (char.currentEndurance < area.endurance) continue;
    const cap = canEnterSection(area.name, player.playerNum, state);
    if (!cap.canEnter) continue;
    actions.push({ type: 'train', areaName: area.name });
  }

  // Climbs: every available route in every reachable area, excluding those
  // the player already attempted this round.
  for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
    const access = checkAreaAccess(char, area);
    if (!access.hasAccess) continue;
    // Top Rope occupancy is gated PER belayer station (see below). Bouldering
    // and Lead use the section-capacity gate (Lead = 1 climber; Bouldering
    // unlimited).
    if (area !== 'topRope') {
      const sec = canEnterSection(area, player.playerNum, state);
      if (!sec.canEnter) continue;
    }
    for (const route of state.availableRoutes[area]) {
      const routeKey = `${area}:${route.name}`;
      if (state.attemptedRoutes[player.playerNum][routeKey]) continue;
      // Top Rope: the route's belayer station must be free for this player
      // (a station held by another player blocks both of its routes).
      if (area === 'topRope' && !canClimbTopRopeRoute(state, player.playerNum, route)) continue;
      const timeCost = getEffectiveClimbTimeCost(char, route.time, route);
      const enduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance);
      if (char.timeRemaining < timeCost) continue;
      if (char.currentEndurance < enduranceCost) continue;
      // Free Solo "Life or Die" — must meet all base requirements.
      if (!freeSoloCanAttempt(char, route)) continue;
      actions.push({ type: 'climb', area, routeName: route.name });
      // Route Reader "Versatility": also offer this climb with the most useful
      // once-per-round stat shift, when one helps. (applyAction accepts any
      // valid shift on a legal climb; this variant is the menu's suggestion.)
      if (canUseStatShift(char, false)) {
        const shift = bestRouteReaderShift(char, route, area, state.attemptedRoutes[player.playerNum]);
        if (shift) actions.push({ type: 'climb', area, routeName: route.name, shift });
      }
    }
  }

  // Milestone attempts: one per uncompleted milestone, no per-round cap on
  // attempts (the spec explicitly notes unlimited milestone attempts).
  for (const difficulty of ['beginner', 'intermediate', 'expert']) {
    if (char.milestonesCompleted[difficulty]) continue;
    const m = state.milestoneRoutes[difficulty];
    if (!m) continue;
    const access = checkAreaAccess(char, m.area);
    if (!access.hasAccess) continue;
    // Top Rope milestone still needs a belayer: require a free station (or the
    // one this player already occupies). Other areas use section capacity.
    if (m.area === 'topRope') {
      if (pickFreeBelayerStation(state, player.playerNum) === null) continue;
    } else {
      const sec = canEnterSection(m.area, player.playerNum, state);
      if (!sec.canEnter) continue;
    }
    const timeCost = getEffectiveClimbTimeCost(char, m.route.time, m.route);
    const enduranceCost = getEffectiveClimbEnduranceCost(char, m.route, m.route.endurance);
    if (char.timeRemaining < timeCost) continue;
    if (char.currentEndurance < enduranceCost) continue;
    if (!freeSoloCanAttempt(char, m.route)) continue;
    actions.push({ type: 'milestone', difficulty, area: m.area, routeName: m.route.name });
  }

  // Gear purchases: rotation slots + always-available access cards.
  // Prerequisites, level gate, spendable XP, time cost all checked here so
  // agents never see a "legal" action that the handler would reject.
  const gearTime = getGearPurchaseTimeCost(char);
  if (char.timeRemaining >= gearTime) {
    const spendable = getSpendableXp(char);
    const owned = new Set(char.equipment);
    const buyable = [
      ...state.availableGear,
      ...GEAR_SHOP.filter(g => ACCESS_CARDS.includes(g.name)),
    ];
    for (const gear of buyable) {
      if (owned.has(gear.name)) continue;
      const cost = getEffectiveGearCost(char, gear);
      if (spendable < cost) continue;
      if (char.level < (gear.prerequisiteLevel || 1)) continue;
      if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
        if (!gear.prerequisiteItems.every(p => owned.has(p))) continue;
      }
      actions.push({ type: 'buyGear', gearName: gear.name });
    }
  }

  return actions;
}

// =============================================================================
// findLegalAction / explainIllegalAction — for UIs
// =============================================================================

// The entry of `legalActions` that `wanted` asks for, or null. `wanted` is a
// partial action ({ type: 'climb', area, routeName }, { type: 'buyGear',
// gearName }, ...): every field it names must match. A Route Reader `shift`
// is not part of the match — callers attach the player's chosen shift to the
// plain climb, and applyAction validates it. Shared by local play and the
// online client so both resolve a click to the same action.
function findLegalAction(legalActions, wanted) {
  const fields = { ...(wanted || {}) };
  delete fields.shift;
  return legalActions.find(a => {
    if (a.shift) return false;
    return Object.entries(fields).every(([k, v]) => a[k] === v);
  }) || null;
}

const AREA_LABELS = { bouldering: 'Bouldering', topRope: 'Top Rope', leadClimbing: 'Lead Climbing' };

// Why `wanted` (a partial action, as for findLegalAction) is not legal for the
// current player right now, as a short player-facing sentence, or null if it
// is legal. getLegalActions alone decides legality; this only explains a
// refusal, re-checking the same conditions in the same order.
function explainIllegalAction(state, wanted) {
  if (state.gameEnded) return 'The game has ended.';
  const legal = getLegalActions(state);
  const match = findLegalAction(legal, wanted);
  const player = state.players[state.currentPlayerIndex];
  const char = player.character;
  if (match) {
    if (wanted.shift && (match.type !== 'climb' || !canUseStatShift(char, false))) {
      return 'Versatility can be used once per round, by the Route Reader, on a regular route.';
    }
    if (wanted.shift && !isWellFormedStatShift(wanted.shift)) {
      return `A stat shift moves 1 to ${MAX_STAT_SHIFT} points between two different stats.`;
    }
    return null;
  }
  const notEnough = (what, need, have) => `Not enough ${what}: this costs ${need} and you have ${have}.`;
  const lifeOrDie = 'Life or Die: Free Solo can only attempt routes whose base requirements your stats already meet.';
  const areaGate = (area) => {
    const access = checkAreaAccess(char, area);
    if (!access.hasAccess) return `You need ${access.missingItems.join(', ')} to climb ${AREA_LABELS[area] || area}.`;
    return null;
  };
  const costGate = (route) => {
    const t = getEffectiveClimbTimeCost(char, route.time, route);
    const e = getEffectiveClimbEnduranceCost(char, route, route.endurance);
    if (char.timeRemaining < t) return notEnough('time', t, char.timeRemaining);
    if (char.currentEndurance < e) return notEnough('endurance', e, char.currentEndurance);
    return null;
  };

  switch (wanted.type) {
    case 'climb': {
      const route = (state.availableRoutes[wanted.area] || []).find(r => r.name === wanted.routeName);
      if (!route) return 'That route is not on the wall right now.';
      const gate = areaGate(wanted.area);
      if (gate) return gate;
      if (wanted.area === 'topRope') {
        if (!canClimbTopRopeRoute(state, player.playerNum, route)) {
          return `Belayer ${route.belayer + 1} is in use by another climber. Pick a route at a free belayer or wait for the wall to clear.`;
        }
      } else {
        const sec = canEnterSection(wanted.area, player.playerNum, state);
        if (!sec.canEnter) return `You can't climb here right now: ${sec.reason}.`;
      }
      if (state.attemptedRoutes[player.playerNum]?.[`${wanted.area}:${route.name}`]) {
        return 'You have already attempted this route this round. Try it again next round.';
      }
      return costGate(route) || (!freeSoloCanAttempt(char, route) ? lifeOrDie : null) || 'That climb is not available right now.';
    }
    case 'milestone': {
      const m = state.milestoneRoutes[wanted.difficulty];
      if (!m) return 'There is no milestone route at that tier.';
      if (char.milestonesCompleted[wanted.difficulty]) return `You have already completed the ${wanted.difficulty} milestone.`;
      const gate = areaGate(m.area);
      if (gate) return gate;
      if (m.area === 'topRope') {
        if (pickFreeBelayerStation(state, player.playerNum) === null) return 'Every belayer is in use right now. Wait for one to free up.';
      } else {
        const sec = canEnterSection(m.area, player.playerNum, state);
        if (!sec.canEnter) return `You can't climb here right now: ${sec.reason}.`;
      }
      return costGate(m.route) || (!freeSoloCanAttempt(char, m.route) ? lifeOrDie : null) || 'That milestone is not available right now.';
    }
    case 'train': {
      const area = TRAINING_AREAS.find(a => a.name === wanted.areaName);
      if (!area) return 'There is no such training station.';
      if (char.timeRemaining < area.time) return notEnough('time', area.time, char.timeRemaining);
      if (char.currentEndurance < area.endurance) return notEnough('endurance', area.endurance, char.currentEndurance);
      const sec = canEnterSection(area.name, player.playerNum, state);
      if (!sec.canEnter) return `You can't train here right now: ${sec.reason}.`;
      return 'That training station is not available right now.';
    }
    case 'rest':
      return 'Not enough time to rest.';
    case 'buyGear': {
      const gear = GEAR_SHOP.find(g => g.name === wanted.gearName);
      if (!gear) return 'There is no such gear.';
      if (char.equipment.includes(gear.name)) return `You already own ${gear.name}.`;
      const inShop = state.availableGear.some(g => g.name === gear.name) || ACCESS_CARDS.includes(gear.name);
      if (!inShop) return `${gear.name} is not in the shop right now.`;
      const timeCost = getGearPurchaseTimeCost(char);
      if (char.timeRemaining < timeCost) return notEnough('time', timeCost, char.timeRemaining);
      const cost = getEffectiveGearCost(char, gear);
      const spendable = getSpendableXp(char);
      if (spendable < cost) return `Not enough spendable XP: ${gear.name} costs ${cost} and you have ${spendable} XP earned this level.`;
      if (char.level < (gear.prerequisiteLevel || 1)) return `${gear.name} requires Level ${gear.prerequisiteLevel}.`;
      const missing = (gear.prerequisiteItems || []).filter(n => !char.equipment.includes(n));
      if (missing.length) return `${gear.name} requires ${missing.join(', ')} first.`;
      return `${gear.name} can't be bought right now.`;
    }
    case 'endTurn':
      return 'You cannot end your turn right now.';
    default:
      return `Unknown action "${wanted.type}".`;
  }
}

// =============================================================================
// applyAction — the dispatcher
// =============================================================================

function applyAction(state, action) {
  if (state.gameEnded) {
    throw new Error('cannot apply action: game has ended');
  }
  if (!action || typeof action.type !== 'string') {
    throw new Error('action must be an object with a string `type` field');
  }

  // Clone so the caller's `state` is not mutated. structuredClone handles
  // the nested player/route/events objects cleanly.
  const s = structuredClone(state);

  // Re-hydrate the RNG from the state's saved seed-plus-offset.
  const rng = createRng(s.rngState);

  // Continue the event sequence number where the previous action left off.
  const emitter = makeEmitter(s.events.length);

  const player = s.players[s.currentPlayerIndex];

  // Every action starts by emitting what the agent chose. If `action`
  // includes a `rationale` field (string), we record it — this is the
  // agent's free-form explanation and becomes gold for qualitative review.
  emitter.emit('action_chosen', {
    playerNum: player.playerNum,
    round: s.round,
    action: {
      type: action.type,
      ...pickPublicActionFields(action),
    },
    rationale: typeof action.rationale === 'string' ? action.rationale : undefined,
    legalActionCount: undefined, // filled in by caller if known (the orchestrator adds it)
  });

  // Dispatch. Each handler mutates `s` and emits events; they share the
  // same rng, so random draws interleave deterministically.
  switch (action.type) {
    case 'climb':      handleClimb(s, rng, action, emitter); break;
    case 'milestone':  handleMilestone(s, rng, action, emitter); break;
    case 'train':      handleTrain(s, rng, action, emitter); break;
    case 'rest':       handleRest(s, rng, action, emitter); break;
    case 'buyGear':    handleBuyGear(s, rng, action, emitter); break;
    case 'endTurn':    handleEndTurn(s, rng, action, emitter); break;
    default:
      throw new Error(`unknown action type: ${action.type}`);
  }

  // Post-action housekeeping: level-up detection, resource snapshot,
  // victory check, turn/round advance.
  postActionHousekeeping(s, rng, emitter);

  // Save rng state for the next applyAction.
  s.rngState = rng.getState();

  // Fold the delta into the running log on state.
  for (const e of emitter.events) s.events.push(e);

  return { state: s, events: emitter.events };
}

// Safe subset of action fields to record in the action_chosen event.
// Strips things like `rationale` (emitted separately) and avoids echoing
// unknown fields the agent might have added.
function pickPublicActionFields(action) {
  const out = {};
  for (const k of ['area', 'routeName', 'areaName', 'difficulty', 'gearName']) {
    if (action[k] !== undefined) out[k] = action[k];
  }
  if (isWellFormedStatShift(action.shift)) {
    out.shift = { from: action.shift.from, to: action.shift.to, amount: action.shift.amount };
  }
  return out;
}

// =============================================================================
// isTerminal — has the game ended?
// =============================================================================

function isTerminal(state) {
  if (state.gameEnded) {
    return {
      done: true,
      winner: state.winner,
      // state.endReason is set by postActionHousekeeping at the moment the
      // game ended. If for some reason it's missing, fall back to the
      // winner-based inference.
      reason: state.endReason || (state.winner ? 'all_milestones' : 'forfeit'),
    };
  }
  // v0.5.0: no maxRounds safety cap. The game has no round limit in the
  // actual rules — the only terminal condition is "someone completes all 3
  // milestones." Sim harnesses keep their own MAX_STEPS guard against
  // runaway loops, but that's a programming bug netting, not gameplay.
  return { done: false, winner: null, reason: null };
}

// =============================================================================
// ACTION HANDLERS
// =============================================================================

// CLIMB — shared implementation used by both regular climbs and milestone
// attempts. `isMilestone` flips the post-success milestone-completion
// branch on.
function resolveClimbShared(s, rng, emitter, route, area, isMilestone, difficulty, shift = null) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;

  // Validate a Route Reader stat shift before anything is paid.
  if (shift) {
    if (!isWellFormedStatShift(shift)) throw new Error(`climb: malformed stat shift ${JSON.stringify(shift)}`);
    if (!canUseStatShift(char, isMilestone)) {
      throw new Error('climb: stat shift is only for a Route Reader, once per round, on a regular route');
    }
  }

  // 1. Move the player into the section. For Top Rope, occupy the belayer
  //    station this climb belongs to (route.belayer for a regular climb; a
  //    free station for a milestone, which carries no station tag). Any other
  //    area clears the belayer-station assignment.
  char.location = area;
  if (area === 'topRope') {
    char.belayerStation = (route.belayer === null || route.belayer === undefined)
      ? pickFreeBelayerStation(s, player.playerNum)
      : route.belayer;
  } else {
    char.belayerStation = null;
  }

  // 2. Mark the route as attempted this round (only for regular climbs —
  // milestones have no per-round attempt cap per game.js).
  if (!isMilestone) {
    state_attemptedRoutesMark(s, player.playerNum, area, route.name);
  }

  // 3. Deduct time (character + gear modified).
  const timeCost = getEffectiveClimbTimeCost(char, route.time, route);
  const timeBefore = char.timeRemaining;
  char.timeRemaining -= timeCost;

  // 4. Deduct endurance — base cost may be reduced by gear (Body Tension Belt).
  // Iron Lung's failure penalty is added later, after success/fail is known.
  const enduranceBefore = char.currentEndurance;
  const baseEnduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance);
  char.currentEndurance -= baseEnduranceCost;

  // 5. Effective stats (base + training + gear + per-route gear).
  const baseStats = computeEffectiveStats(char, route, area, s.attemptedRoutes[player.playerNum]);

  // 6. Consume Route Reader Beta Boost if active. Single emit captures the fact.
  const { stats: boostedStats, consumed: betaConsumed } = applyBetaBoostIfActive(char, baseStats);
  if (betaConsumed) {
    emitter.emit('ability_activated', {
      playerNum: player.playerNum,
      character: char.key,
      ability: 'Beta Boost',
      effect: '+3 all stats for this climb',
    });
  }

  // 6b. Route Reader stat shift (validated above): this climb only, once per round.
  let effectiveStats = boostedStats;
  if (shift) {
    effectiveStats = applyStatShiftToStats(boostedStats, shift);
    char.abilityUsed = true;
    emitter.emit('ability_activated', {
      playerNum: player.playerNum,
      character: char.key,
      ability: 'Versatility',
      effect: `moved ${shift.amount} ${shift.from} → ${shift.to} for this climb`,
    });
  }

  // 7. Build and roll dice (Sprinter gets +1 nerf die; v0.3.0 gear may
  //    re-roll, add an extra die, replace dice, or shift dice on milestones).
  const effectArray = buildEffectRollArray(char, route);
  const diceTrace = [];
  const dice = rollClimbDice(rng, effectArray, char, route, isMilestone, diceTrace);
  const { requirements, appliedModifiers } = applyDiceToRequirements(char, route, effectArray, dice);

  emitter.emit('dice_rolled', {
    playerNum: player.playerNum,
    dice,
    // Dice rolled but not kept (Power Tap Belt's discard), for display.
    discardedDice: diceTrace.filter(t => t.effectKind === 'extraDieDiscardOne').map(t => t.from),
    modifiers: appliedModifiers,
    modifiedRequirements: { ...requirements },
    baseRequirements: {
      strength: route.strength, technique: route.technique, focus: route.focus, flexibility: route.flexibility,
    },
  });

  // 8. Resolve outcome.
  const outcome = resolveClimbOutcome(char, effectiveStats, requirements);
  const xpGained = computeClimbXp(char, route, outcome.success);
  char.xp += xpGained;

  // 9. Iron Lung failure penalty (Mental Anchor gear bypasses).
  let failPenalty = 0;
  if (!outcome.success) {
    failPenalty = getFailureEnduranceExtra(char);
    char.currentEndurance -= failPenalty;
  }
  // 9b. Power Spotting: successful climbs heal endurance, up to maxEndurance.
  let healed = 0;
  if (outcome.success) {
    const beforeHeal = char.currentEndurance;
    char.currentEndurance = applySuccessHeal(char.currentEndurance, char.maxEndurance, getSuccessEnduranceHeal(char));
    healed = char.currentEndurance - beforeHeal;
  }
  // Floor endurance at 0. Going negative is nonsensical for downstream checks.
  if (char.currentEndurance < 0) char.currentEndurance = 0;

  emitter.emit('climb_resolved', {
    playerNum: player.playerNum,
    area, routeName: route.name, grade: route.grade,
    isMilestone, difficulty: isMilestone ? difficulty : undefined,
    success: outcome.success,
    perStatPass: outcome.perStatPass,
    passCount: outcome.passCount,
    requirements,
    effectiveStats,
    xpGained,
    timeCost,
    enduranceCost: baseEnduranceCost + failPenalty,
    failPenalty,
    // Every gear effect that changed this climb (see describeClimbGearEffects).
    gearEffects: describeClimbGearEffects({
      char, route, effectRollArray: effectArray, diceTrace, appliedModifiers,
      success: outcome.success, timeCost, enduranceCost: baseEnduranceCost, healed,
    }),
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -timeCost },
      endurance: { before: enduranceBefore, after: char.currentEndurance, delta: char.currentEndurance - enduranceBefore },
      xp: { delta: xpGained, afterTotal: char.xp },
    },
  });

  // 10. Milestone-specific: mark completion and emit progress.
  if (isMilestone && outcome.success) {
    char.milestonesCompleted[difficulty] = true;
    const totalDone =
      (char.milestonesCompleted.beginner ? 1 : 0) +
      (char.milestonesCompleted.intermediate ? 1 : 0) +
      (char.milestonesCompleted.expert ? 1 : 0);
    emitter.emit('milestone_progress', {
      playerNum: player.playerNum,
      tier: difficulty,
      completed: true,
      totalCompleted: totalDone,
    });
  }
}

// Mark a route as attempted in state.attemptedRoutes (JSON-safe plain object form).
function state_attemptedRoutesMark(s, playerNum, area, routeName) {
  if (!s.attemptedRoutes[playerNum]) s.attemptedRoutes[playerNum] = {};
  s.attemptedRoutes[playerNum][`${area}:${routeName}`] = true;
}

function handleClimb(s, rng, action, emitter) {
  const { area, routeName } = action;
  const route = (s.availableRoutes[area] || []).find(r => r.name === routeName);
  if (!route) throw new Error(`climb: no route "${routeName}" available in ${area}`);
  resolveClimbShared(s, rng, emitter, route, area, /*isMilestone*/ false, null, action.shift || null);
}

function handleMilestone(s, rng, action, emitter) {
  const { difficulty } = action;
  const m = s.milestoneRoutes[difficulty];
  if (!m) throw new Error(`milestone: no milestone at tier "${difficulty}"`);
  // Passing action.shift lets resolveClimbShared reject it: no shifts on milestones.
  resolveClimbShared(s, rng, emitter, m.route, m.area, /*isMilestone*/ true, difficulty, action.shift || null);
}

function handleTrain(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;
  const area = TRAINING_AREAS.find(a => a.name === action.areaName);
  if (!area) throw new Error(`train: no training area "${action.areaName}"`);

  const timeBefore = char.timeRemaining;
  const eBefore = char.currentEndurance;

  char.location = area.name;
  char.timeRemaining -= area.time;
  char.currentEndurance -= area.endurance;
  // Old Climbing Journal (gear) boosts every training session by +N.
  const trainingBonus = area.bonus + getTrainingBonusBoost(char);
  char.trainingBonuses[area.stat] += trainingBonus;

  emitter.emit('train_action', {
    playerNum: player.playerNum,
    areaName: area.name,
    stat: area.stat,
    bonus: trainingBonus,
    totalTrainingBonusAfter: { ...char.trainingBonuses },
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -area.time },
      endurance: { before: eBefore, after: char.currentEndurance, delta: -area.endurance },
    },
  });
}

function handleRest(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;

  const timeBefore = char.timeRemaining;
  const eBefore = char.currentEndurance;

  char.location = 'rest';
  char.timeRemaining -= 1;
  const { newEndurance, delta, restBonusApplied } = computeRestRecovery(char);
  char.currentEndurance = newEndurance;

  // Route Reader's "Versatility" activates Beta Boost on rest. Other
  // characters ignore this flag.
  let betaActivated = false;
  if (char.key === 'routeReader') {
    char.betaBoostActive = true;
    betaActivated = true;
  }

  emitter.emit('rest_action', {
    playerNum: player.playerNum,
    enduranceRecovered: delta,
    restBonusApplied,
    newEndurance,
    betaBoostActivated: betaActivated,
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -1 },
      endurance: { before: eBefore, after: char.currentEndurance, delta },
    },
  });
}

function handleBuyGear(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;
  const gear = GEAR_SHOP.find(g => g.name === action.gearName);
  if (!gear) throw new Error(`buyGear: no gear "${action.gearName}"`);

  const effectiveCost = getEffectiveGearCost(char, gear);
  const timeCost = getGearPurchaseTimeCost(char);
  const xpBefore = char.xp;
  const timeBefore = char.timeRemaining;

  char.location = 'gearShop';
  char.timeRemaining -= timeCost;
  char.xp -= effectiveCost;
  char.equipment.push(gear.name);

  // Permanent stat & endurance effects from the purchased item.
  // Matches game.js:2299-2391 branch-by-branch.
  const gearApplied = {};
  if (gear.statEffect === 'endurance') {
    char.maxEndurance += gear.value;
    gearApplied.maxEndurance = gear.value;
  }
  if (typeof gear.enduranceBonus === 'number') {
    char.maxEndurance += gear.enduranceBonus;
    gearApplied.maxEnduranceBonus = gear.enduranceBonus;
  }
  // Positive-value stat trainers (Grip Strength Trainer, Meditation App, …)
  // contribute permanent gearBonuses additions.
  if (gear.value > 0 && ['strength', 'technique', 'focus', 'flexibility'].includes(gear.statEffect)) {
    char.gearBonuses[gear.statEffect] += gear.value;
    gearApplied[gear.statEffect] = gear.value;
  }
  if (gear.statEffect === 'strengthTech') {
    char.gearBonuses.strength += 2;
    char.gearBonuses.technique += 2;
    gearApplied.strength = 2; gearApplied.technique = 2;
  }
  if (gear.statEffect === 'strengthTechMixed') {
    char.gearBonuses.strength += 3;
    char.gearBonuses.technique -= 1;
    gearApplied.strength = 3; gearApplied.technique = -1;
  }

  // Replace purchased item in the shop rotation (access cards stay).
  if (!ACCESS_CARDS.includes(gear.name)) {
    replaceGearInRotation(s, rng, gear.name);
  }

  emitter.emit('gear_purchased', {
    playerNum: player.playerNum,
    gearName: gear.name,
    cost: effectiveCost,
    nominalCost: gear.cost,
    timeCost,
    gearApplied,
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -timeCost },
      xp: { before: xpBefore, after: char.xp, delta: -effectiveCost },
    },
  });
}

// Remove purchased gear from the 3-slot rotation and draw a replacement
// from the pool of items not currently owned by any player, not in the
// rotation, and not an access card. Mirrors game.js:808-846.
function replaceGearInRotation(s, rng, purchasedName) {
  const idx = s.availableGear.findIndex(g => g.name === purchasedName);
  if (idx === -1) return;

  const ownedByAny = new Set();
  for (const p of s.players) for (const n of p.character.equipment) ownedByAny.add(n);

  const unavailable = new Set([
    ...s.availableGear.map(g => g.name),
    ...ownedByAny,
    ...ACCESS_CARDS,
  ]);
  const pool = GEAR_SHOP.filter(g => !unavailable.has(g.name));

  if (pool.length === 0) {
    s.availableGear.splice(idx, 1);
  } else {
    s.availableGear[idx] = rng.pick(pool);
  }
}

function handleEndTurn(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;
  // Zero out time so the housekeeping step will pass the turn.
  const surrendered = char.timeRemaining;
  char.timeRemaining = 0;
  emitter.emit('end_turn_chosen', {
    playerNum: player.playerNum,
    timeSurrendered: surrendered,
  });
}

// =============================================================================
// POST-ACTION HOUSEKEEPING
// =============================================================================

function postActionHousekeeping(s, rng, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;

  // 1. Level-up: trigger repeatedly in case a big XP reward crossed
  // multiple thresholds (unlikely given 100+ XP per level, but cheap to guard).
  while (true) {
    const lvl = applyLevelUpIfNeeded(char);
    if (!lvl.leveledUp) break;
    emitter.emit('level_up', {
      playerNum: player.playerNum,
      newLevel: lvl.newLevel,
      oldStats: lvl.oldStats,
      newStats: lvl.newStats,
      oldMaxEndurance: lvl.oldMaxEndurance,
      newMaxEndurance: lvl.newMaxEndurance,
    });
  }

  // 2. Periodic resource snapshot. Analyzers use this to plot XP/endurance/time
  // curves without having to reconstruct state by replaying all events.
  emitter.emit('resource_update', {
    playerNum: player.playerNum,
    timeRemaining: char.timeRemaining,
    currentEndurance: char.currentEndurance,
    maxEndurance: char.maxEndurance,
    xp: char.xp,
    level: char.level,
    spendableXp: getSpendableXp(char),
  });

  // 3. Victory check. If this player just completed all 3 milestones, the
  // game ends NOW — no further turn/round advance.
  const mc = char.milestonesCompleted;
  if (mc.beginner && mc.intermediate && mc.expert) {
    s.gameEnded = true;
    s.winner = player.playerNum;
    s.endReason = 'all_milestones';
    emitter.emit('game_end', {
      winner: player.playerNum,
      characterKey: char.key,
      reason: 'all_milestones',
      round: s.round,
    });
    return;
  }

  // 4. Advance turn, or end round if everyone's out of time.
  advanceTurnOrEndRound(s, rng, emitter);

  // v0.5.0: maxRounds safety cap removed. The only terminal condition is
  // "all 3 milestones" — set by completeMilestone. Sim harnesses keep their
  // own MAX_STEPS protection against runaway agent loops.
}

function advanceTurnOrEndRound(s, rng, emitter) {
  const maxTime = Math.max(...s.players.map(p => p.character.timeRemaining));
  const cur = s.players[s.currentPlayerIndex];

  if (maxTime <= 0) {
    // Everyone out of time: the round is over.
    emitter.emit('turn_end', { playerNum: cur.playerNum, round: s.round });
    endRound(s, rng, emitter);
    return;
  }

  // If current player still has the most time, they keep playing.
  if (cur.character.timeRemaining >= maxTime) return;

  // Otherwise pass the turn to the first player with the most time.
  emitter.emit('turn_end', { playerNum: cur.playerNum, round: s.round });
  const nextIdx = s.players.findIndex(p => p.character.timeRemaining === maxTime);
  s.currentPlayerIndex = nextIdx;
  const next = s.players[nextIdx];
  emitter.emit('turn_start', {
    round: s.round,
    playerNum: next.playerNum,
    timeRemaining: next.character.timeRemaining,
    endurance: next.character.currentEndurance,
  });
}

function endRound(s, rng, emitter) {
  const endedRound = s.round;

  // Rotate the route-clearing token and refresh the targeted area.
  // Position meanings (game.js:240):
  //   0 → refresh leadClimbing, advance to 1
  //   1 → refresh topRope,       advance to 2
  //   2 → refresh bouldering,    advance to 0
  let cleared;
  if (s.routeClearingPosition === 0) {
    s.availableRoutes.leadClimbing = rng.pickN(regularRoutePool(s.milestoneRoutes, 'leadClimbing'), 5);
    cleared = 'leadClimbing';
  } else if (s.routeClearingPosition === 1) {
    // Refresh all belayer stations together (2×belayerCount routes).
    s.availableRoutes.topRope = drawTopRopeStations(rng, s.belayerCount, regularRoutePool(s.milestoneRoutes, 'topRope'));
    cleared = 'topRope';
  } else {
    s.availableRoutes.bouldering = rng.pickN(regularRoutePool(s.milestoneRoutes, 'bouldering'), 5);
    cleared = 'bouldering';
  }
  s.routeClearingPosition = (s.routeClearingPosition + 1) % 3;

  // Reset per-player per-round state. Training bonuses and gear bonuses
  // persist across rounds — only time, ability-used flag, location, and the
  // belayer-station assignment reset. The route-clearing rotation moves every
  // player back to the Lobby automatically (RuleModifications 2026-06-27).
  for (const p of s.players) {
    const c = p.character;
    const approachBonus = c.equipment.includes('Approach Shoes') ? 1 : 0;
    c.timeRemaining = 10 + approachBonus;
    c.abilityUsed = false;
    c.location = 'lobby';
    c.belayerStation = null;
  }

  // Wipe per-round attempted-routes tracker.
  for (const k of Object.keys(s.attemptedRoutes)) s.attemptedRoutes[k] = {};

  const newRound = endedRound + 1;

  // RuleModifications (2026-06-27): belayer count is fixed at N − 1 from round 1
  // — no time-based unlock ramp.

  s.round = newRound;
  s.currentPlayerIndex = 0;

  emitter.emit('round_end', { round: endedRound, routesCleared: cleared, nextRound: newRound });
  emitter.emit('round_start', { round: newRound, routeClearingPosition: s.routeClearingPosition });

  // Kick off the first turn of the new round.
  const first = s.players[0];
  emitter.emit('turn_start', {
    round: newRound,
    playerNum: first.playerNum,
    timeRemaining: first.character.timeRemaining,
    endurance: first.character.currentEndurance,
  });
}

return { getLegalActions, findLegalAction, explainIllegalAction, applyAction, isTerminal };
})();

return {
  createRng: __rng.createRng,
  deriveSeed: __rng.deriveSeed,
  makeEmitter: __telemetry.makeEmitter,
  ENGINE_VERSION: __version.ENGINE_VERSION,
  ENGINE_VERSION_STRING: __version.ENGINE_VERSION_STRING,
  belayerCountFor: __state.belayerCountFor,
  regularRoutePool: __state.regularRoutePool,
  drawTopRopeStations: __state.drawTopRopeStations,
  createGame: __state.createGame,
  ACCESS_CARDS: __state.ACCESS_CARDS,
  checkAreaAccess: __helpers.checkAreaAccess,
  getSectionCapacity: __helpers.getSectionCapacity,
  getOccupiedBelayerStations: __helpers.getOccupiedBelayerStations,
  isBelayerStationFree: __helpers.isBelayerStationFree,
  canClimbTopRopeRoute: __helpers.canClimbTopRopeRoute,
  pickFreeBelayerStation: __helpers.pickFreeBelayerStation,
  isTrainingEquipment: __helpers.isTrainingEquipment,
  getPlayersInSection: __helpers.getPlayersInSection,
  canEnterSection: __helpers.canEnterSection,
  calculateGearBonuses: __helpers.calculateGearBonuses,
  computeEffectiveStats: __helpers.computeEffectiveStats,
  getEffectiveClimbTimeCost: __helpers.getEffectiveClimbTimeCost,
  getEffectiveClimbEnduranceCost: __helpers.getEffectiveClimbEnduranceCost,
  getXpMultiplier: __helpers.getXpMultiplier,
  getGearPurchaseTimeCost: __helpers.getGearPurchaseTimeCost,
  getEffectiveGearCost: __helpers.getEffectiveGearCost,
  getSpendableXp: __helpers.getSpendableXp,
  buildEffectRollArray: __helpers.buildEffectRollArray,
  rollClimbDice: __helpers.rollClimbDice,
  applyDiceToRequirements: __helpers.applyDiceToRequirements,
  resolveClimbOutcome: __helpers.resolveClimbOutcome,
  computeClimbXp: __helpers.computeClimbXp,
  getFailureEnduranceExtra: __helpers.getFailureEnduranceExtra,
  getSuccessEnduranceHeal: __helpers.getSuccessEnduranceHeal,
  applySuccessHeal: __helpers.applySuccessHeal,
  describeClimbGearEffects: __helpers.describeClimbGearEffects,
  getTrainingBonusBoost: __helpers.getTrainingBonusBoost,
  freeSoloCanAttempt: __helpers.freeSoloCanAttempt,
  applyBetaBoostIfActive: __helpers.applyBetaBoostIfActive,
  MAX_STAT_SHIFT: __helpers.MAX_STAT_SHIFT,
  isWellFormedStatShift: __helpers.isWellFormedStatShift,
  canUseStatShift: __helpers.canUseStatShift,
  applyStatShiftToStats: __helpers.applyStatShiftToStats,
  bestRouteReaderShift: __helpers.bestRouteReaderShift,
  computeRestRecovery: __helpers.computeRestRecovery,
  getGearMaxEnduranceBonus: __helpers.getGearMaxEnduranceBonus,
  applyLevelUpIfNeeded: __helpers.applyLevelUpIfNeeded,
  dispatchToolCall: __helpers.dispatchToolCall,
  getLegalActions: __engine.getLegalActions,
  findLegalAction: __engine.findLegalAction,
  explainIllegalAction: __engine.explainIllegalAction,
  applyAction: __engine.applyAction,
  isTerminal: __engine.isTerminal,
};
})();
