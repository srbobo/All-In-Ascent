// AUTO-GENERATED FROM engine/{rng,telemetry,version,content,helpers,state,engine,stats,match-record}.js — DO NOT EDIT BY HAND.
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
// 1.2.0 (2026-10-11): Project Mode — player-made content (engine/content.js).
//   - createGame({ content }) accepts a compiled content pack: custom
//     climbers, route cards and gear cards join the printed deck for that
//     game (state.content), and a replay from seed + characters + content
//     reproduces it.
//   - Custom climbers and custom gear carry rules built from an element
//     catalog (conditions: wall, Milestone, route type, tag, hold/move
//     feature, grade band, route requirement, Level; effects: stat bonus,
//     requirement change, Time/Endurance cost, XP, extra/ignored dice, fall
//     penalty, heal on send, 3-of-4 sends, sure sends only, free Lead access,
//     rest bonus, Beta Boost on rest, Grit/Time each round, training gain
//     and cap, starting Grit, max Endurance). The helpers evaluate them at the
//     same points the printed abilities act; climb_resolved reports the
//     rules that applied (customRules).
//   - Round-start Time is now computed from every card with
//     statEffect 'timePerRound' (roundStartTime) instead of Approach Shoes by
//     name — the same number for the printed deck.
//   The standard game is unchanged: same outcomes, same RNG streams. Minor
//   bump for the new content system (baselines from 1.1.x stay comparable).
// 1.1.0 (2026-10-11): Grit is how the game is played.
//   - Local and online play create every game with GRIT_RULES; the UI shows
//     Grit on route cards, Milestone rewards, training costs, gear prices and
//     each climber's tracker, and XP only as level progress.
//   - The trait-preserving balance changes are now the printed abilities and
//     character data, under any rules: Sprinter climbs earn 85% XP (was 50%);
//     Technician's +1 Time applies to Milestone attempts only; Route Reader's
//     Versatility needs the 4th stat within 3 and its stat shift also works on
//     Milestones; Iron Lung's growth is 2 / 2 / 2.5 / 1.5 (was 2.5 / 2.5 / 3 / 2).
//     GRIT_RULES keeps only the economy (card Grit 2/3/4, training cap
//     10 + 5/Level, seat Grit 0/2/4/6, Free Solo +2 Grit a round).
//   Minor bump — printed abilities changed; baselines from 1.0.x are not comparable.
// 1.0.0 (2026-10-11): Grit — experience and currency split. MAJOR.
//   The Grit economy is the game's new core mechanic, packaged as GRIT_RULES
//   (helpers.js): XP only raises your Level and is never spent; Grit — taken
//   from fresh route cards by the first climber to send them, and paid for
//   Milestone sends — buys training and gear; training is capped at 10 + 5
//   per Level; seats start with 0 / 2 / 4 / 6 Grit; and the five climbers get
//   trait-preserving balance changes (see 0.8.2 below and
//   docs/CPU_PLAYTEST_AUDIT.md §10–14). Major bump — baselines from 0.x are
//   not comparable. Games created without a rules object still play the 0.8
//   rules until the rulebook and UI move to Grit.
// 0.8.2 (2026-10-10): Grit economy + training-cap cards, as rules variants.
//   The standard game is unchanged (same outcomes, same RNG streams).
//   - state.rules.grit: experience and currency split. XP only raises your
//     Level and is never spent; Grit buys training sessions and gear.
//     Route cards carry 1–3 Grit by grade band when dealt (setup and every
//     Setter reset); the first climber to SEND a route takes it. Milestone
//     sends pay 2 / 3 / 4. Optional start Grit and per-round allowance.
//   - Two variant-only cards, dealt only in training-cap games: Hangboard
//     Program (+5 training cap in every stat) and Training Partner (once per
//     round, a training session costs no Grit).
//   - Refusal reason code notEnoughGrit; climb_resolved reports gritGained.
//   - GRIT_RULES (helpers.js) is the adopted preset: cards 2 / 3 / 4 Grit,
//     training cap 10 + 5 per Level, seats start with 0 / 2 / 4 / 6 Grit,
//     and trait-preserving character balance (Route Reader near-miss ≤ 3 +
//     stat shift on Milestones; Technician +1 Time on Milestones only;
//     Sprinter 85% XP; Iron Lung stat growth −0.5; Free Solo +2 Grit a round).
//   - Per-character rules hooks: rules.characters[key] = { gritStart,
//     gritPerRound, trainCapMultiplier, uncapped, freeTraining, ability
//     (DEFAULT_ABILITY numbers), body (starting stats / Endurance / growth) }.
//     The climber keeps its Beta Boost until a climb's outcome is decided, and
//     the suggested stat shift follows the climber's send rule (passRule) —
//     no change under the standard rules.
//   Patch — variants only.
// 0.8.1 (2026-10-10): One engine for local and online play.
//   - Power Spotting's success heal stops at max endurance but never lowers
//     endurance: a successful climb used to cap any surplus from rest-bonus
//     gear back down to max, even without Power Spotting (applySuccessHeal).
//   - climb_resolved now reports gearEffects (every gear effect that changed
//     the climb), failPenalty, and the real enduranceCost (it ignored Body
//     Tension Belt); dice_rolled reports discardedDice.
//   - Local hot-seat play runs this engine (engine/engine.browser.js, built by
//     engine/build-browser.js, replacing helpers.browser.js) instead of
//     game.js's own copy of the rules, so local and online play can no longer
//     drift apart. findLegalAction, illegalActionReason ({code, message, ...})
//     and explainIllegalAction back the UIs' click handling and the reasons
//     shown on unavailable cards.
//   Patch — only games where a Power Spotting / rest-bonus climber sends
//   while above max endurance change.
// 0.8.0 (2026-10-09): CPU-audit rules fixes (docs/CPU_PLAYTEST_AUDIT.md).
//   - Dice gear makes the climber's choice the way a climber would. Sequence
//     Memorization and Crimp Sequence Decoder used to act on the HIGHEST die,
//     even a helpful buff die, so they could make a climb harder. Now
//     resolveClimbDice picks each target to maximise the outcome against the
//     climb's effective stats: Memorization only on a nerf die, Mountain
//     Mentor on the nerf die that matters (was: the first one), Power Tap Belt
//     swaps by outcome, and the Decoder re-rolls only when that raises
//     P(send) — it is a "may", never forced. Gear choices never touch the
//     phantom 2nd die on 0–1-die routes.
//   - The climber with the most Time opens each round (ties → seat order).
//     Seat 1 always opened before, even when another climber had 11 Time
//     from Approach Shoes.
//   - computeClimbStats: the one read-only source for a climb's stats (Beta
//     Boost + stat shift included), shared by the climb handler and the new
//     engine/observe.js, so probability previews cannot drift from real climbs.
//   Minor bump — invalidates v0.7.x baselines for games with dice gear or
//   Approach Shoes. RNG streams are unchanged for games with neither.
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
//     Tap Belt too) now skips dice that apply nothing, including the nerf die
//     Mountain Mentor is about to negate.
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
const ENGINE_VERSION = { major: 1, minor: 2, patch: 0 };
const ENGINE_VERSION_STRING = `${ENGINE_VERSION.major}.${ENGINE_VERSION.minor}.${ENGINE_VERSION.patch}`;

return { ENGINE_VERSION, ENGINE_VERSION_STRING };
})();

// ---- engine/content.js ----
const __content = (function () {
'use strict';
const { ROUTES, GEAR_SHOP, CHARACTERS } = __data;
// Project Mode — player-made content: climbers, route cards and gear cards.
//
// This module is the rules language for custom content. A content pack is a
// plain JSON object that a game is created with (createGame({ content })):
//
//   {
//     schema: 'aia-content/1',
//     characters: { [key]: CustomCharacter },      // key starts with "custom-"
//     routes:     { bouldering: [...], topRope: [...], leadClimbing: [...] },
//     gear:       [ CustomGear ],
//   }
//
// Custom climbers and custom gear carry RULES — ordered lists of
// { when: [condition...], then: [effect...] } built from the element catalog
// below (CONDITIONS and EFFECTS). A rule's effects apply whenever every one
// of its conditions holds. Routes are plain cards (requirements, dice, tags)
// in the same shape as the printed deck.
//
// Two jobs:
//   1. compile*(definition) → { ok, errors, value }
//      Validates a definition element by element (unknown elements, missing or
//      out-of-range parameters, conditions that cannot apply to an effect's
//      scope, name clashes with the printed deck) and returns the normalized,
//      engine-ready value with its rules text generated. Nothing reaches the
//      engine without compiling clean: createGame refuses a pack with errors.
//   2. ruleEffects / effectSum / hasEffect
//      Evaluate a climber's active rules (its own, plus those of every custom
//      gear card it owns) in a context — the engine's helpers call these at
//      each point a printed ability acts (stats, requirements, dice, costs,
//      XP, rest, training, round start). Scopes:
//        climb     a climb attempt: { route, area, isMilestone }
//        access    entering a wall: { area }
//        rest      a rest action
//        round     the start of a new round
//        training  a training session: { stat }
//        setup     game setup (unconditional)
//
// Everything here is pure and JSON-friendly; the browser bundle exposes it as
// part of window.AscentEngine so the builder UI compiles with the same code.



const CONTENT_SCHEMA = 'aia-content/1';
const SUBMISSION_SCHEMA = 'aia-submission/1';
const CONTENT_KINDS = ['character', 'route', 'gear'];

const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const AREAS = ['bouldering', 'topRope', 'leadClimbing'];
const AREA_LABELS = { bouldering: 'Bouldering', topRope: 'Top Rope', leadClimbing: 'Lead' };
const STAT_LABELS = { strength: 'Strength', technique: 'Technique', focus: 'Focus', flexibility: 'Flexibility', all: 'every stat' };
const ALL_STATS = [...STATS, 'all'];
const OPS = ['<', '<=', '>', '>='];
const BANDS = ['easy', 'mid', 'hard'];
const BAND_LABELS = { easy: 'easy (V0–V2, 5.6–5.9)', mid: 'mid (V3–V7, 5.10–5.11)', hard: 'hard (V8+, 5.12+)' };

// The deck's vocabulary, so a custom route only uses words the rules know.
const YDS = ['5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d', '5.14a', '5.14b', '5.14c', '5.14d'];
const ROUTE_VOCAB = Object.freeze({
  grades: {
    bouldering: Array.from({ length: 13 }, (_, i) => `V${i}`),
    topRope: YDS,
    leadClimbing: YDS,
  },
  routeTypes: ['Slab', 'Vertical', 'Overhang', 'Traverse'],
  holdFeatures: ['Jugs', 'Pinch', 'Crimp', 'Sloper'],
  moveFeatures: ['Toe Hook', 'Heel Hook', 'Dynamic', 'Dyno', 'Roof'],
  tags: ['Pinch/Crimp', 'Toe/Heel Hook', 'Roof/Sloper', 'Dynamic'],
});
const GEAR_CATEGORIES = ['Essential Safety Gear', 'Strategy Gear', 'Specialized Gear', 'Recovery Gear', 'Comfort Gear', 'Training Equipment'];
// Portraits a custom climber can wear (the printed climbers' art) and accents.
const PORTRAITS = Object.keys(CHARACTERS);
const ACCENTS = ['coral', 'teal', 'violet', 'marigold', 'raspberry', 'lime', 'cobalt'];

const LIMITS = Object.freeze({
  rulesPerCard: 8, conditionsPerRule: 4, effectsPerRule: 4,
  charactersPerPack: 8, routesPerPack: 24, gearPerPack: 12,
});

// Grade band of a route: 0 easy (V0–V2, 5.6–5.9), 1 mid (V3–V7, 5.10–5.11),
// 2 hard (V8+, 5.12+). helpers.js re-exports this as gradeBand.
function gradeBandOf(route) {
  const g = String((route && route.grade) || '');
  if (g.startsWith('V')) {
    const v = Number(g.slice(1));
    return v <= 2 ? 0 : v <= 7 ? 1 : 2;
  }
  const m = g.match(/^5\.(\d+)/);
  const yds = m ? Number(m[1]) : 0;
  return yds <= 9 ? 0 : yds <= 11 ? 1 : 2;
}

function compare(a, op, b) {
  if (typeof a !== 'number') return false;
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    default: return false;
  }
}
const OP_WORDS = { '<': 'under', '<=': 'at most', '>': 'over', '>=': 'at least' };

// =============================================================================
// ELEMENT CATALOG
// =============================================================================
// Parameter specs: { type: 'enum', options, labels?, default? } |
// { type: 'int', min, max, nonzero?, default? } (`default` is what a builder
// starts a new element with).
// `scopes` lists where a condition can be tested; an effect has one `scope`.
// `for` says which cards may carry the element. `text` words the element.

const CONDITIONS = Object.freeze({
  area: {
    label: 'Wall', help: 'The climb is on this wall.',
    scopes: ['climb', 'access'],
    params: { value: { type: 'enum', options: AREAS, labels: AREA_LABELS } },
    test: (c, ctx) => ctx.area === c.value,
    text: (c) => `on ${AREA_LABELS[c.value]}`,
  },
  milestone: {
    label: 'Milestone', help: 'Whether the climb is a Milestone attempt.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ['yes', 'no'], labels: { yes: 'Milestone attempts', no: 'regular routes' } } },
    test: (c, ctx) => (ctx.isMilestone ? 'yes' : 'no') === c.value,
    text: (c) => (c.value === 'yes' ? 'on Milestone attempts' : 'on regular routes'),
  },
  routeType: {
    label: 'Route type', help: 'Slab, Vertical, Overhang or Traverse.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.routeTypes } },
    test: (c, ctx) => !!ctx.route && ctx.route.routeType === c.value,
    text: (c) => `on ${c.value} routes`,
  },
  tag: {
    label: 'Route tag', help: 'The specialty tag printed on the route.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.tags } },
    test: (c, ctx) => !!ctx.route && ctx.route.tag === c.value,
    text: (c) => `on ${c.value} routes`,
  },
  holdFeature: {
    label: 'Hold feature', help: 'The route has this kind of hold.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.holdFeatures } },
    test: (c, ctx) => !!ctx.route && (ctx.route.holdFeatures || []).includes(c.value),
    text: (c) => `on routes with ${c.value}`,
  },
  moveFeature: {
    label: 'Move feature', help: 'The route has this kind of move.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: ROUTE_VOCAB.moveFeatures } },
    test: (c, ctx) => !!ctx.route && (ctx.route.moveFeatures || []).includes(c.value),
    text: (c) => `on routes with a ${c.value}`,
  },
  gradeBand: {
    label: 'Grade band', help: 'Easy, mid or hard grades.',
    scopes: ['climb'],
    params: { value: { type: 'enum', options: BANDS, labels: BAND_LABELS } },
    test: (c, ctx) => !!ctx.route && BANDS[gradeBandOf(ctx.route)] === c.value,
    text: (c) => `on ${BAND_LABELS[c.value]} routes`,
  },
  statRequirement: {
    label: 'Route requirement', help: 'Compare one of the route\'s printed requirements with a number.',
    scopes: ['climb'],
    params: {
      stat: { type: 'enum', options: STATS, labels: STAT_LABELS },
      op: { type: 'enum', options: OPS, labels: OP_WORDS },
      value: { type: 'int', min: 0, max: 120, default: 30 },
    },
    test: (c, ctx) => !!ctx.route && compare(ctx.route[c.stat], c.op, c.value),
    text: (c) => `when the route needs ${OP_WORDS[c.op]} ${c.value} ${STAT_LABELS[c.stat]}`,
  },
  level: {
    label: 'Your Level', help: 'Compare the climber\'s Level with a number.',
    scopes: ['climb', 'access', 'rest', 'round', 'training'],
    params: { op: { type: 'enum', options: OPS, labels: OP_WORDS, default: '>=' }, value: { type: 'int', min: 1, max: 15, default: 3 } },
    test: (c, ctx, char) => compare(char.level, c.op, c.value),
    text: (c) => `at Level ${OP_WORDS[c.op]} ${c.value}`,
  },
});

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

const EFFECTS = Object.freeze({
  statBonus: {
    label: 'Stat bonus', help: 'Add to (or take from) a stat for the climb.',
    scope: 'climb', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: ALL_STATS, labels: STAT_LABELS }, amount: { type: 'int', min: -20, max: 20, nonzero: true, default: 3 } },
    text: (e) => `${signed(e.amount)} ${STAT_LABELS[e.stat]}`,
  },
  requirementChange: {
    label: 'Requirement change', help: 'Change the route\'s requirement after the dice (negative = easier, floored at 0).',
    scope: 'climb', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: ALL_STATS, labels: STAT_LABELS }, amount: { type: 'int', min: -20, max: 20, nonzero: true, default: -3 } },
    text: (e) => `${e.stat === 'all' ? 'every requirement' : `the ${STAT_LABELS[e.stat]} requirement`} ${signed(e.amount)}`,
  },
  timeCost: {
    label: 'Time cost', help: 'Change the Time a climb costs (never below 1).',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -3, max: 3, nonzero: true, default: -1 } },
    text: (e) => `the climb costs ${signed(e.amount)} Time (min 1)`,
  },
  enduranceCost: {
    label: 'Endurance cost', help: 'Change the Endurance a climb costs (never below 0).',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -30, max: 30, nonzero: true, default: -5 } },
    text: (e) => `the climb costs ${signed(e.amount)} Endurance`,
  },
  enduranceCostScale: {
    label: 'Endurance cost %', help: 'Scale the Endurance a climb costs (rounded up).',
    scope: 'climb', for: ['character', 'gear'],
    params: { percent: { type: 'int', min: 25, max: 200, default: 75 } },
    text: (e) => `the climb costs ${e.percent}% Endurance`,
  },
  xpScale: {
    label: 'XP %', help: 'Scale the XP a climb earns.',
    scope: 'climb', for: ['character', 'gear'],
    params: { percent: { type: 'int', min: 25, max: 300, default: 125 } },
    text: (e) => `the climb earns ${e.percent}% XP`,
  },
  xpBonus: {
    label: 'XP bonus', help: 'Flat XP on a send, a fall, or either.',
    scope: 'climb', for: ['character', 'gear'],
    params: { on: { type: 'enum', options: ['send', 'fall', 'any'], labels: { send: 'a send', fall: 'a fall', any: 'any climb' } }, amount: { type: 'int', min: -50, max: 50, nonzero: true, default: 10 } },
    text: (e) => `${signed(e.amount)} XP on ${{ send: 'a send', fall: 'a fall', any: 'every climb' }[e.on]}`,
  },
  extraDie: {
    label: 'Extra die', help: 'Roll one more d6 on a stat: a buff die lowers its requirement, a nerf die raises it.',
    scope: 'climb', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: STATS, labels: STAT_LABELS }, kind: { type: 'enum', options: ['buff', 'nerf'] } },
    text: (e) => `roll an extra ${e.kind} die on ${STAT_LABELS[e.stat]}`,
  },
  negateDice: {
    label: 'Ignore dice', help: 'Nerf dice, buff dice, or every die count for nothing.',
    scope: 'climb', for: ['character', 'gear'],
    params: { kind: { type: 'enum', options: ['nerf', 'buff', 'all'], labels: { nerf: 'nerf dice', buff: 'buff dice', all: 'all dice' } } },
    text: (e) => `ignore ${{ nerf: 'every nerf die', buff: 'every buff die', all: 'every die' }[e.kind]}`,
  },
  failPenalty: {
    label: 'Fall penalty', help: 'Extra Endurance lost on a fall.',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 30, default: 5 } },
    text: (e) => `a fall costs ${e.amount} extra Endurance`,
  },
  ignoreFailPenalty: {
    label: 'No fall penalty', help: 'Falls cost no extra Endurance (from any source).',
    scope: 'climb', for: ['character', 'gear'],
    params: {},
    text: () => 'falls cost no extra Endurance',
  },
  successHeal: {
    label: 'Heal on send', help: 'Recover Endurance after a send (up to your maximum).',
    scope: 'climb', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 30, default: 5 } },
    text: (e) => `a send restores ${e.amount} Endurance`,
  },
  threeOfFour: {
    label: 'Send with 3 of 4', help: 'The climb sends when 3 stats pass and the 4th misses by at most this much.',
    scope: 'climb', for: ['character', 'gear'],
    params: { nearMiss: { type: 'int', min: 0, max: 20, default: 3 } },
    text: (e) => `send with 3 of 4 stats if the 4th misses by at most ${e.nearMiss}`,
  },
  sureSendOnly: {
    label: 'Sure sends only', help: 'May only start a climb whose printed requirements your stats (base, training, permanent gear) already meet.',
    scope: 'climb', for: ['character'],
    params: {},
    text: () => 'may only attempt climbs whose printed requirements your stats already meet',
  },
  freeAccess: {
    label: 'Free access', help: 'Climb Lead without the Lead system cards.',
    scope: 'access', for: ['character', 'gear'],
    params: {},
    text: () => 'climb Lead without the Lead system',
  },
  restBonus: {
    label: 'Rest bonus', help: 'Extra Endurance from every rest (may exceed your maximum).',
    scope: 'rest', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -20, max: 40, nonzero: true, default: 10 } },
    text: (e) => `rest restores ${signed(e.amount)} Endurance`,
  },
  betaBoostOnRest: {
    label: 'Beta Boost on rest', help: 'Resting grants a bonus to every stat on your next climb.',
    scope: 'rest', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 10, default: 3 } },
    text: (e) => `rest grants +${e.amount} to every stat on your next climb`,
  },
  gritPerRound: {
    label: 'Grit each round', help: 'Grit gained at the start of every round after the first.',
    scope: 'round', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 5, default: 1 } },
    text: (e) => `gain ${e.amount} Grit at the start of every round`,
  },
  timePerRound: {
    label: 'Time each round', help: 'Change the Time you start every round with.',
    scope: 'round', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: -2, max: 3, nonzero: true, default: 1 } },
    text: (e) => `start every round with ${signed(e.amount)} Time`,
  },
  trainingGain: {
    label: 'Training gain', help: 'Change what a training session gives (one stat or every stat).',
    scope: 'training', for: ['character', 'gear'],
    params: { stat: { type: 'enum', options: ALL_STATS, labels: STAT_LABELS }, amount: { type: 'int', min: -4, max: 5, nonzero: true, default: 1 } },
    text: (e) => `${e.stat === 'all' ? 'training sessions' : `${STAT_LABELS[e.stat]} training`} give${e.stat === 'all' ? '' : 's'} ${signed(e.amount)}`,
  },
  trainingCapBonus: {
    label: 'Training cap', help: 'Raise the training cap in every stat.',
    scope: 'training', for: ['character', 'gear'],
    params: { amount: { type: 'int', min: 1, max: 20, default: 5 } },
    text: (e) => `your training cap is +${e.amount} in every stat`,
  },
  gritStart: {
    label: 'Starting Grit', help: 'Extra Grit at the start of the game.',
    scope: 'setup', for: ['character'],
    params: { amount: { type: 'int', min: 1, max: 10, default: 2 } },
    text: (e) => `start the game with +${e.amount} Grit`,
  },
  maxEndurance: {
    label: 'Max Endurance', help: 'Permanently change maximum Endurance while owned.',
    scope: 'setup', for: ['gear'],
    params: { amount: { type: 'int', min: -30, max: 40, nonzero: true, default: 10 } },
    text: (e) => `${signed(e.amount)} max Endurance`,
  },
});

const SCOPES = Object.freeze(['climb', 'access', 'rest', 'round', 'training', 'setup']);

// =============================================================================
// RULES TEXT
// =============================================================================

function describeCondition(c) {
  const spec = CONDITIONS[c && c.type];
  return spec ? spec.text(c) : '?';
}

function describeEffect(e) {
  const spec = EFFECTS[e && e.type];
  return spec ? spec.text(e) : '?';
}

// One sentence per rule: "On Overhang routes: +5 Strength, the climb costs
// -1 Time (min 1)." Unconditional rules read "Always: …".
function describeRule(rule) {
  const when = (rule.when || []).map(describeCondition);
  const then = (rule.then || []).map(describeEffect).join(', ');
  const head = when.length ? when.join(' and ') : 'always';
  const sentence = `${head.charAt(0).toUpperCase()}${head.slice(1)}: ${then}.`;
  return sentence;
}

function describeRules(rules) {
  return (rules || []).map(describeRule).join(' ');
}

// =============================================================================
// COMPILING
// =============================================================================

const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function makeErrors() {
  const errors = [];
  const at = (path, message) => { errors.push({ path, message }); };
  return { errors, at };
}

function checkParam(spec, value) {
  if (spec.type === 'enum') {
    return spec.options.includes(value) ? null : `must be one of ${spec.options.join(', ')}`;
  }
  if (spec.type === 'int') {
    if (!isInt(value)) return 'must be a whole number';
    if (value < spec.min || value > spec.max) return `must be between ${spec.min} and ${spec.max}`;
    if (spec.nonzero && value === 0) return 'must not be 0';
    return null;
  }
  return 'unknown parameter type';
}

// Normalize one element (a condition or an effect) against `catalog`.
function compileElement(catalog, raw, path, at) {
  if (!raw || typeof raw !== 'object') { at(path, 'not an element'); return null; }
  const spec = catalog[raw.type];
  if (!spec) { at(`${path}.type`, `unknown element "${raw.type}"`); return null; }
  const out = { type: raw.type };
  let ok = true;
  for (const [name, pspec] of Object.entries(spec.params)) {
    const problem = checkParam(pspec, raw[name]);
    if (problem) { at(`${path}.${name}`, `${spec.label}: ${name} ${problem}`); ok = false; }
    else out[name] = raw[name];
  }
  return ok ? out : null;
}

// Normalize a rule list for a `kind` ('character' | 'gear').
function compileRules(rawRules, kind, path, at) {
  if (rawRules === undefined || rawRules === null) return [];
  if (!Array.isArray(rawRules)) { at(path, 'rules must be a list'); return []; }
  if (rawRules.length > LIMITS.rulesPerCard) at(path, `at most ${LIMITS.rulesPerCard} rules per card`);
  const rules = [];
  rawRules.slice(0, LIMITS.rulesPerCard).forEach((raw, i) => {
    const rp = `${path}[${i}]`;
    if (!raw || typeof raw !== 'object') { at(rp, 'not a rule'); return; }
    const whenRaw = Array.isArray(raw.when) ? raw.when : (raw.when === undefined ? [] : null);
    const thenRaw = Array.isArray(raw.then) ? raw.then : null;
    if (whenRaw === null) { at(`${rp}.when`, 'conditions must be a list'); return; }
    if (thenRaw === null) { at(`${rp}.then`, 'a rule needs a list of effects'); return; }
    if (!thenRaw.length) { at(`${rp}.then`, 'a rule needs at least one effect'); return; }
    if (whenRaw.length > LIMITS.conditionsPerRule) at(`${rp}.when`, `at most ${LIMITS.conditionsPerRule} conditions per rule`);
    if (thenRaw.length > LIMITS.effectsPerRule) at(`${rp}.then`, `at most ${LIMITS.effectsPerRule} effects per rule`);
    const when = whenRaw.slice(0, LIMITS.conditionsPerRule).map((c, j) => compileElement(CONDITIONS, c, `${rp}.when[${j}]`, at));
    const then = thenRaw.slice(0, LIMITS.effectsPerRule).map((e, j) => compileElement(EFFECTS, e, `${rp}.then[${j}]`, at));
    if (when.includes(null) || then.includes(null)) return;
    // Every effect must be allowed on this kind of card, and every condition
    // must be testable where every effect acts.
    let valid = true;
    then.forEach((e, j) => {
      const spec = EFFECTS[e.type];
      if (!spec.for.includes(kind)) { at(`${rp}.then[${j}]`, `${spec.label} can't go on a ${kind} card`); valid = false; }
      when.forEach((c, k) => {
        const cspec = CONDITIONS[c.type];
        if (!cspec.scopes.includes(spec.scope)) {
          at(`${rp}.when[${k}]`, `"${cspec.label}" can't decide "${spec.label}" (it only applies ${spec.scope === 'climb' ? 'to climbs' : `at ${spec.scope}`})`);
          valid = false;
        }
      });
    });
    const types = then.map(e => e.type);
    if (new Set(types).size !== types.length) { at(`${rp}.then`, 'the same effect twice in one rule — change its amount instead'); valid = false; }
    if (valid) rules.push({ id: str(raw.id) || `r${i + 1}`, when, then });
  });
  return rules;
}

// djb2 over the JSON text, as base36: a short signature for memo keys.
function rulesHash(rules) {
  const s = JSON.stringify(rules || []);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function slugKey(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return `custom-${slug || 'climber'}`;
}

const KEY_RE = /^custom-[a-z0-9-]{1,40}$/;

function checkName(name, path, at, { min = 2, max = 40 } = {}) {
  const n = str(name);
  if (n.length < min || n.length > max) at(path, `name must be ${min}–${max} characters`);
  return n;
}

function checkStatBlock(raw, path, at, min, max, label) {
  const out = {};
  for (const k of STATS) {
    const v = raw && raw[k];
    if (!isNum(v) || v < min || v > max) at(`${path}.${k}`, `${label} ${STAT_LABELS[k]} must be between ${min} and ${max}`);
    else out[k] = v;
  }
  return out;
}

// --- Climbers ---------------------------------------------------------------

const CHARACTER_LIMITS = Object.freeze({
  stat: { min: 5, max: 40 }, statTotal: { min: 40, max: 90 },
  endurance: { min: 50, max: 160 },
  growth: { min: 0, max: 6, step: 0.5 }, enduranceGrowth: { min: 0, max: 12, step: 0.5 },
});

function compileCharacter(raw, path = 'character') {
  const { errors, at } = makeErrors();
  if (!raw || typeof raw !== 'object') { at(path, 'not a climber'); return { ok: false, errors, value: null }; }
  const L = CHARACTER_LIMITS;
  const name = checkName(raw.name, `${path}.name`, at);
  const key = str(raw.key) || slugKey(name);
  if (!KEY_RE.test(key)) at(`${path}.key`, 'key must start with "custom-" and use letters, digits and dashes');
  if (CHARACTERS[key]) at(`${path}.key`, 'key clashes with a printed climber');
  const archetype = str(raw.archetype).slice(0, 40) || 'Custom climber';
  const description = str(raw.description).slice(0, 240);
  const startingStats = checkStatBlock(raw.startingStats, `${path}.startingStats`, at, L.stat.min, L.stat.max, 'starting');
  const total = STATS.reduce((t, k) => t + (startingStats[k] || 0), 0);
  if (Object.keys(startingStats).length === 4 && (total < L.statTotal.min || total > L.statTotal.max)) {
    at(`${path}.startingStats`, `starting stats must add up to ${L.statTotal.min}–${L.statTotal.max} (now ${total})`);
  }
  const startingEndurance = raw.startingEndurance;
  if (!isInt(startingEndurance) || startingEndurance < L.endurance.min || startingEndurance > L.endurance.max) {
    at(`${path}.startingEndurance`, `starting Endurance must be a whole number between ${L.endurance.min} and ${L.endurance.max}`);
  }
  const growth = {};
  const g = raw.growth || {};
  for (const k of [...STATS, 'endurance']) {
    const lim = k === 'endurance' ? L.enduranceGrowth : L.growth;
    const v = g[k];
    if (!isNum(v) || v < lim.min || v > lim.max || Math.round(v / lim.step) * lim.step !== v) {
      at(`${path}.growth.${k}`, `${k === 'endurance' ? 'Endurance' : STAT_LABELS[k]} growth must be ${lim.min}–${lim.max} in steps of ${lim.step}`);
    } else growth[k] = v;
  }
  const rules = compileRules(raw.rules, 'character', `${path}.rules`, at);
  const ability = raw.specialAbility || {};
  const abilityName = str(ability.name).slice(0, 40) || 'House rules';
  const portrait = PORTRAITS.includes(raw.portrait) ? raw.portrait : PORTRAITS[0];
  const accent = ACCENTS.includes(raw.accent) ? raw.accent : 'cobalt';
  if (errors.length) return { ok: false, errors, value: null };
  const value = {
    key, name, archetype, description, portrait, accent, custom: true,
    startingStats, startingEndurance, growth,
    specialAbility: {
      name: abilityName,
      description: rules.length ? describeRules(rules) : 'No special rules.',
      used: false,
    },
    rules,
    rulesHash: rulesHash(rules),
  };
  return { ok: true, errors, value };
}

// --- Routes -----------------------------------------------------------------

const ROUTE_LIMITS = Object.freeze({
  requirement: { min: 0, max: 99 }, time: { min: 1, max: 8 }, endurance: { min: 0, max: 100 },
  xpSuccess: { min: 5, max: 150 }, xpFail: { min: 0, max: 150 }, dice: 4,
});

function compileRoute(raw, path = 'route') {
  const { errors, at } = makeErrors();
  if (!raw || typeof raw !== 'object') { at(path, 'not a route'); return { ok: false, errors, value: null }; }
  const L = ROUTE_LIMITS;
  const name = checkName(raw.name, `${path}.name`, at);
  const area = AREAS.includes(raw.area) ? raw.area : null;
  if (!area) at(`${path}.area`, `wall must be one of ${AREAS.join(', ')}`);
  if (area && (ROUTES[area] || []).some(r => r.name === name)) at(`${path}.name`, `"${name}" is already a printed ${AREA_LABELS[area]} route`);
  const grade = str(raw.grade);
  if (area && !ROUTE_VOCAB.grades[area].includes(grade)) at(`${path}.grade`, `grade must be one of ${ROUTE_VOCAB.grades[area].join(', ')}`);
  const reqs = checkStatBlock(raw, path, at, L.requirement.min, L.requirement.max, 'required');
  const intIn = (field, lim, label) => {
    const v = raw[field];
    if (!isInt(v) || v < lim.min || v > lim.max) { at(`${path}.${field}`, `${label} must be a whole number between ${lim.min} and ${lim.max}`); return null; }
    return v;
  };
  const time = intIn('time', L.time, 'Time');
  const endurance = intIn('endurance', L.endurance, 'Endurance');
  const xpSuccess = intIn('xpSuccess', L.xpSuccess, 'XP on a send');
  const xpFail = intIn('xpFail', L.xpFail, 'XP on a fall');
  if (xpSuccess !== null && xpFail !== null && xpFail > xpSuccess) at(`${path}.xpFail`, 'XP on a fall can\'t exceed XP on a send');
  const rollEffect = [];
  const dice = Array.isArray(raw.rollEffect) ? raw.rollEffect : (raw.rollEffect === undefined ? [] : null);
  if (dice === null) at(`${path}.rollEffect`, 'dice must be a list');
  else {
    if (dice.length > L.dice) at(`${path}.rollEffect`, `at most ${L.dice} dice`);
    dice.slice(0, L.dice).forEach((d, i) => {
      if (!d || !STATS.includes(d.stat) || ![1, -1].includes(d.modifier)) at(`${path}.rollEffect[${i}]`, 'a die needs a stat and a modifier of -1 (buff) or 1 (nerf)');
      else rollEffect.push({ stat: d.stat, modifier: d.modifier });
    });
  }
  const routeType = ROUTE_VOCAB.routeTypes.includes(raw.routeType) ? raw.routeType : null;
  if (!routeType) at(`${path}.routeType`, `route type must be one of ${ROUTE_VOCAB.routeTypes.join(', ')}`);
  const listOf = (field, options) => {
    const v = raw[field] === undefined ? [] : raw[field];
    if (!Array.isArray(v) || v.some(x => !options.includes(x))) { at(`${path}.${field}`, `must only list ${options.join(', ')}`); return []; }
    return [...new Set(v)];
  };
  const holdFeatures = listOf('holdFeatures', ROUTE_VOCAB.holdFeatures);
  const moveFeatures = listOf('moveFeatures', ROUTE_VOCAB.moveFeatures);
  const tag = raw.tag === null || raw.tag === undefined || raw.tag === '' ? null : raw.tag;
  if (tag !== null && !ROUTE_VOCAB.tags.includes(tag)) at(`${path}.tag`, `tag must be one of ${ROUTE_VOCAB.tags.join(', ')} or none`);
  if (errors.length) return { ok: false, errors, value: null };
  const value = {
    name, area, grade, ...reqs, time, endurance, xpSuccess, xpFail, rollEffect,
    gearModifiers: [], routeType, holdFeatures, moveFeatures, tag, custom: true,
  };
  return { ok: true, errors, value };
}

// --- Gear -------------------------------------------------------------------

const GEAR_LIMITS = Object.freeze({ cost: { min: 20, max: 300 }, gritCost: { min: 1, max: 12 }, level: { min: 1, max: 15 } });

function compileGear(raw, path = 'gear') {
  const { errors, at } = makeErrors();
  if (!raw || typeof raw !== 'object') { at(path, 'not a gear card'); return { ok: false, errors, value: null }; }
  const L = GEAR_LIMITS;
  const name = checkName(raw.name, `${path}.name`, at);
  if (GEAR_SHOP.some(g => g.name === name)) at(`${path}.name`, `"${name}" is already a printed gear card`);
  const category = GEAR_CATEGORIES.includes(raw.category) ? raw.category : null;
  if (!category) at(`${path}.category`, `category must be one of ${GEAR_CATEGORIES.join(', ')}`);
  const cost = raw.cost;
  if (!isInt(cost) || cost < L.cost.min || cost > L.cost.max) at(`${path}.cost`, `XP cost must be a whole number between ${L.cost.min} and ${L.cost.max}`);
  const gritCost = raw.gritCost;
  if (!isInt(gritCost) || gritCost < L.gritCost.min || gritCost > L.gritCost.max) at(`${path}.gritCost`, `Grit cost must be a whole number between ${L.gritCost.min} and ${L.gritCost.max}`);
  const prerequisiteLevel = raw.prerequisiteLevel === undefined ? 1 : raw.prerequisiteLevel;
  if (!isInt(prerequisiteLevel) || prerequisiteLevel < L.level.min || prerequisiteLevel > L.level.max) at(`${path}.prerequisiteLevel`, `required Level must be ${L.level.min}–${L.level.max}`);
  const description = str(raw.description).slice(0, 160);
  const rules = compileRules(raw.rules, 'gear', `${path}.rules`, at);
  if (!errors.length && !rules.length) at(`${path}.rules`, 'a gear card needs at least one rule');
  if (errors.length) return { ok: false, errors, value: null };
  const value = {
    name, category, cost, gritCost, description, prerequisiteLevel, custom: true,
    effectDisplay: describeRules(rules),
    rules, rulesHash: rulesHash(rules),
    // The printed-card fields the engine's gear code reads, as a no-op card:
    // every effect of a custom card comes from its rules.
    statEffect: 'none', value: 0, routeFilter: [], holdFeatureFilter: [],
    prerequisiteItems: [], accessRequirement: null, restBonus: 0,
  };
  return { ok: true, errors, value };
}

// --- Packs ------------------------------------------------------------------

function emptyContentPack() {
  return { schema: CONTENT_SCHEMA, characters: {}, routes: { bouldering: [], topRope: [], leadClimbing: [] }, gear: [] };
}

// Does this pack add anything to the printed deck?
function hasCustomContent(pack) {
  if (!pack || typeof pack !== 'object') return false;
  return Object.keys(pack.characters || {}).length > 0 ||
    AREAS.some(a => ((pack.routes || {})[a] || []).length > 0) ||
    (pack.gear || []).length > 0;
}

// Compile a whole pack. Accepts characters as a list or a keyed object, and
// routes as a flat list (each with an `area`) or by wall. Returns the
// normalized pack (characters keyed, routes by wall) or the errors.
function compileContentPack(raw) {
  const { errors, at } = makeErrors();
  const pack = emptyContentPack();
  if (!raw || typeof raw !== 'object') { at('pack', 'not a content pack'); return { ok: false, errors, value: null }; }
  if (raw.schema !== undefined && raw.schema !== CONTENT_SCHEMA) at('pack.schema', `unknown schema "${raw.schema}"`);
  const chars = Array.isArray(raw.characters) ? raw.characters : Object.values(raw.characters || {});
  if (chars.length > LIMITS.charactersPerPack) at('pack.characters', `at most ${LIMITS.charactersPerPack} climbers in a pack`);
  chars.slice(0, LIMITS.charactersPerPack).forEach((c, i) => {
    const r = compileCharacter(c, `characters[${i}]`);
    errors.push(...r.errors);
    if (!r.ok) return;
    if (pack.characters[r.value.key]) at(`characters[${i}].key`, `two climbers share the key "${r.value.key}"`);
    else pack.characters[r.value.key] = r.value;
  });
  const routes = Array.isArray(raw.routes) ? raw.routes
    : AREAS.flatMap(a => ((raw.routes || {})[a] || []).map(r => ({ ...r, area: r.area || a })));
  if (routes.length > LIMITS.routesPerPack) at('pack.routes', `at most ${LIMITS.routesPerPack} routes in a pack`);
  routes.slice(0, LIMITS.routesPerPack).forEach((rt, i) => {
    const r = compileRoute(rt, `routes[${i}]`);
    errors.push(...r.errors);
    if (!r.ok) return;
    if (pack.routes[r.value.area].some(x => x.name === r.value.name)) at(`routes[${i}].name`, `two ${AREA_LABELS[r.value.area]} routes are called "${r.value.name}"`);
    else pack.routes[r.value.area].push(r.value);
  });
  const gear = Array.isArray(raw.gear) ? raw.gear : Object.values(raw.gear || {});
  if (gear.length > LIMITS.gearPerPack) at('pack.gear', `at most ${LIMITS.gearPerPack} gear cards in a pack`);
  gear.slice(0, LIMITS.gearPerPack).forEach((g, i) => {
    const r = compileGear(g, `gear[${i}]`);
    errors.push(...r.errors);
    if (!r.ok) return;
    if (pack.gear.some(x => x.name === r.value.name)) at(`gear[${i}].name`, `two gear cards are called "${r.value.name}"`);
    else pack.gear.push(r.value);
  });
  return { ok: errors.length === 0, errors, value: errors.length ? null : pack };
}

// =============================================================================
// LOOKUPS — the printed deck plus a pack's additions
// =============================================================================

function characterTemplate(content, key) {
  return CHARACTERS[key] || (content && content.characters && content.characters[key]) || null;
}

function routesForArea(content, area) {
  const extra = content && content.routes && content.routes[area];
  return extra && extra.length ? ROUTES[area].concat(extra) : ROUTES[area];
}

function allRoutes(content) {
  const out = {};
  for (const a of AREAS) out[a] = routesForArea(content, a);
  return out;
}

function gearPool(content) {
  const extra = content && content.gear;
  return extra && extra.length ? GEAR_SHOP.concat(extra) : GEAR_SHOP;
}

// A gear card by name: the printed deck or the game's custom cards.
function findGear(state, name) {
  const inPrinted = GEAR_SHOP.find(g => g.name === name);
  if (inPrinted) return inPrinted;
  if (state && state.content && state.content.gear) {
    const own = state.content.gear.find(g => g.name === name);
    if (own) return own;
  }
  return null;
}

// =============================================================================
// EVALUATION — a climber's active rules in a context
// =============================================================================

// The rule sets that act for `char`: its own custom rules and the rules of
// every custom gear card it owns (copied onto the climber when bought). An
// empty list for every printed climber without custom gear.
function activeRules(char) {
  if (!char) return [];
  const out = [];
  if (char.customRules && char.customRules.length) out.push({ source: char.name || char.key, rules: char.customRules });
  for (const g of char.gearRules || []) out.push({ source: g.gear, rules: g.rules });
  return out;
}

// Short signature of every rule acting on `char`, for memo keys.
function rulesSignature(char) {
  if (!char) return '';
  const parts = [];
  if (char.customRules && char.customRules.length) parts.push(char.rulesHash || rulesHash(char.customRules));
  for (const g of char.gearRules || []) parts.push(g.hash || rulesHash(g.rules));
  return parts.join('+');
}

function conditionsHold(rule, ctx, char) {
  for (const c of rule.when || []) {
    const spec = CONDITIONS[c.type];
    if (!spec || !spec.test(c, ctx, char)) return false;
  }
  return true;
}

// Every effect of `type` whose rule applies in `ctx` (one entry per effect,
// tagged with the card it came from and its rule).
function ruleEffects(char, type, ctx = {}) {
  const sets = activeRules(char);
  if (!sets.length) return [];
  const out = [];
  for (const { source, rules } of sets) {
    for (const rule of rules) {
      let hit = null;
      for (const e of rule.then || []) {
        if (e.type !== type) continue;
        if (hit === null) hit = conditionsHold(rule, ctx, char);
        if (hit) out.push({ ...e, source, ruleId: rule.id });
      }
    }
  }
  return out;
}

function effectSum(char, type, ctx = {}, param = 'amount') {
  let total = 0;
  for (const e of ruleEffects(char, type, ctx)) total += e[param] || 0;
  return total;
}

function hasEffect(char, type, ctx = {}) {
  return ruleEffects(char, type, ctx).length > 0;
}

// The climb-scope rules that applied to a climb, worded for the climb result:
// [{ source, ruleId, text }]. Read-only.
function describeAppliedClimbRules(char, ctx) {
  const out = [];
  for (const { source, rules } of activeRules(char)) {
    for (const rule of rules) {
      if (!(rule.then || []).some(e => EFFECTS[e.type] && EFFECTS[e.type].scope === 'climb')) continue;
      if (!conditionsHold(rule, ctx, char)) continue;
      out.push({ source, ruleId: rule.id, text: describeRule({ ...rule, then: rule.then.filter(e => EFFECTS[e.type].scope === 'climb') }) });
    }
  }
  return out;
}

// =============================================================================
// SUBMISSIONS — a card sent for the designer's review
// =============================================================================

const SUBMISSION_STATUSES = ['new', 'approved', 'rejected'];

// Check a submission the way the server does. Returns null when acceptable,
// else a short reason. The definition must compile.
function validateSubmission(sub) {
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return 'not an object';
  if (sub.schema !== SUBMISSION_SCHEMA) return 'unknown schema';
  if (typeof sub.id !== 'string' || !/^[\w.:-]{6,100}$/.test(sub.id)) return 'bad id';
  if (!CONTENT_KINDS.includes(sub.kind)) return 'bad kind';
  if (sub.author !== undefined && sub.author !== null && (typeof sub.author !== 'string' || sub.author.length > 40)) return 'bad author';
  if (sub.note !== undefined && sub.note !== null && (typeof sub.note !== 'string' || sub.note.length > 500)) return 'bad note';
  if (typeof sub.engineVersion !== 'string' || sub.engineVersion.length > 20) return 'bad engineVersion';
  const compiled = sub.kind === 'character' ? compileCharacter(sub.definition)
    : sub.kind === 'route' ? compileRoute(sub.definition) : compileGear(sub.definition);
  if (!compiled.ok) return `does not compile: ${compiled.errors[0].message}`;
  return null;
}

return { CONTENT_SCHEMA, SUBMISSION_SCHEMA, CONTENT_KINDS, STATS, AREAS, ROUTE_VOCAB, GEAR_CATEGORIES, PORTRAITS, ACCENTS, LIMITS, gradeBandOf, CONDITIONS, EFFECTS, SCOPES, describeCondition, describeEffect, describeRule, describeRules, compileRules, rulesHash, slugKey, CHARACTER_LIMITS, compileCharacter, ROUTE_LIMITS, compileRoute, GEAR_LIMITS, compileGear, emptyContentPack, hasCustomContent, compileContentPack, characterTemplate, routesForArea, allRoutes, gearPool, findGear, activeRules, rulesSignature, ruleEffects, effectSum, hasEffect, describeAppliedClimbRules, SUBMISSION_STATUSES, validateSubmission };
})();

// ---- engine/helpers.js ----
const __helpers = (function () {
'use strict';
const { TRAINING_AREAS, GEAR_SHOP, XP_TABLE, CHARACTERS } = __data;
const { gradeBandOf, ruleEffects, effectSum, hasEffect, rulesSignature } = __content;
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




// Project Mode (content.js): custom climbers and custom gear carry rules that
// act at the same points as the printed abilities. Every hook below asks
// ruleEffects / effectSum / hasEffect with a context; for a printed climber
// without custom gear these return nothing and the helper plays exactly as
// before. The climb context names the route, its wall and whether the attempt
// is a Milestone, so a rule like "on Overhang routes, +5 Strength" can decide.
const climbCtx = (route, area, isMilestone) => ({ scope: 'climb', route, area: area || null, isMilestone: !!isMilestone });

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
  // Custom rule: free access (no Lead system needed).
  if (hasEffect(char, 'freeAccess', { scope: 'access', area })) return { hasAccess: true, missingItems: [] };

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
// Custom rules (content.js) add their stat bonuses here too, so route cards,
// previews and real climbs all show the same numbers; `isMilestone` tells a
// Milestone-only rule whether it applies.
function computeEffectiveStats(char, route, area, attemptedRoutesForPlayer, isMilestone = false) {
  const perRouteGear = calculateGearBonuses(char, route, area, attemptedRoutesForPlayer);
  const stats = {
    strength:    char.stats.strength    + char.trainingBonuses.strength    + char.gearBonuses.strength    + perRouteGear.strength,
    technique:   char.stats.technique   + char.trainingBonuses.technique   + char.gearBonuses.technique   + perRouteGear.technique,
    focus:       char.stats.focus       + char.trainingBonuses.focus       + char.gearBonuses.focus       + perRouteGear.focus,
    flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility + perRouteGear.flexibility,
  };
  for (const e of ruleEffects(char, 'statBonus', climbCtx(route, area, isMilestone))) {
    for (const k of (e.stat === 'all' ? STAT_KEYS : [e.stat])) stats[k] += e.amount;
  }
  return stats;
}

// Effective stats for one specific climb, exactly as the climb handler will
// use them: computeEffectiveStats, plus Route Reader's Beta Boost (+3 all, if
// active) and an optional stat shift. Read-only — it does NOT consume the
// Beta Boost or the once-per-round shift; the climb handler does that.
function computeClimbStats(char, route, area, attemptedRoutesForPlayer, shift = null, isMilestone = false) {
  let stats = computeEffectiveStats(char, route, area, attemptedRoutesForPlayer, isMilestone);
  if (char.betaBoostActive) {
    const b = betaBoostAmount(char);
    stats = {
      strength: stats.strength + b, technique: stats.technique + b,
      focus: stats.focus + b, flexibility: stats.flexibility + b,
    };
  }
  if (shift) stats = applyStatShiftToStats(stats, shift);
  return stats;
}

// What an active Beta Boost adds to every stat: the Route Reader's printed
// (or tuned) +3, or the amount a custom "Beta Boost on rest" rule granted.
function betaBoostAmount(char) {
  if (char.key === 'routeReader') return abilityParam(char, 'betaBoost') ?? 3;
  return char.betaBoostAmount ?? 3;
}

// =============================================================================
// CHARACTER ABILITY PARAMETERS (balance experiments)
// =============================================================================
// Each ability's numbers, as printed. A rules variant can tune them per
// character with rules.characters[key].ability, which createGame copies onto
// the climber as char.abilityParams. Absent, abilities play exactly as printed.
//   routeReader.milestonePasses  stats a Milestone needs (3 = Versatility applies)
//   routeReader.boostOnly        3-of-4 only while Beta Boost is active
//   routeReader.nearMiss         the 4th stat may miss by at most this (null = any)
//   routeReader.shiftOnMilestones  Versatility's stat shift may be used on Milestones
//   technician.extraTimeOn       where Perfect Beta's +1 Time applies: 'all' | 'milestone' | 'regular'
// As printed since 1.1.0 (trait-preserving balance, docs/CPU_PLAYTEST_AUDIT.md
// §13): Sprinter 85% XP (was 50%), Technician's +1 Time on Milestones only
// (was every climb), Route Reader's 4th stat may miss by at most 3 (was any
// amount) and the stat shift also works on Milestones. Iron Lung's growth
// change lives in the character data (game.js).
const DEFAULT_ABILITY = Object.freeze({
  sprinter: { timeReduction: 2, xpMultiplier: 0.85, focusCrux: true },
  technician: { reqReduction: 5, extraTime: 1, extraTimeOn: 'milestone' },
  ironLung: { failXpBonus: 0.5, failEndurance: 5 },
  routeReader: { betaBoost: 3, milestonePasses: 3, boostOnly: false, nearMiss: 3, shiftOnMilestones: true },
});

function abilityParam(char, name) {
  const own = char && char.abilityParams;
  if (own && own[name] !== undefined) return own[name];
  return (DEFAULT_ABILITY[char && char.key] || {})[name];
}

// How many stats a climb needs, and how far a Route Reader's 4th may miss.
// `ctx` (optional, { route, area }) lets a custom "send with 3 of 4" rule
// decide for this climb.
function passRule(char, isMilestone = false, ctx = null) {
  if (char.key !== 'routeReader') {
    const own = ctx ? ruleEffects(char, 'threeOfFour', climbCtx(ctx.route, ctx.area, isMilestone)) : [];
    if (own.length) return { needed: 3, nearMiss: Math.max(...own.map(e => e.nearMiss)) };
    return { needed: 4, nearMiss: Infinity };
  }
  const all4 = (isMilestone && abilityParam(char, 'milestonePasses') === 4) ||
    (abilityParam(char, 'boostOnly') && !char.betaBoostActive);
  if (all4) return { needed: 4, nearMiss: Infinity };
  const nm = abilityParam(char, 'nearMiss');
  return { needed: 3, nearMiss: nm === null || nm === undefined ? Infinity : nm };
}

// =============================================================================
// COST MODIFIERS (character passives)
// =============================================================================

// Effective time cost of a climb for this character.
// Sprinter's "Flash Speed": -2 (min 1). Technician's "Perfect Beta": +1.
// Engine v0.3.0 also applies gear effectKind 'timeCostReduction' for tagged routes
// (Trick Foot Manual: Toe/Heel Hook climbs cost 1 less time).
// `area` (optional) is the climb's wall, for custom rules that depend on it.
function getEffectiveClimbTimeCost(char, baseTime, route = null, isMilestone = false, area = null) {
  let t = baseTime;
  if (char.key === 'sprinter') t = Math.max(1, t - abilityParam(char, 'timeReduction'));
  if (char.key === 'technician') {
    const on = abilityParam(char, 'extraTimeOn');
    if (on === 'all' || (on === 'milestone' && isMilestone) || (on === 'regular' && !isMilestone)) {
      t += abilityParam(char, 'extraTime');
    }
  }
  // Tag-targeted time-cost reduction gear
  if (route && route.tag) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'timeCostReduction' && gear.tagFilter === route.tag) {
        t = Math.max(1, t - (gear.value || 1));
      }
    }
  }
  // Custom rules: Time cost changes, never below 1.
  if (route) {
    const delta = effectSum(char, 'timeCost', climbCtx(route, area, isMilestone));
    if (delta) t = Math.max(1, t + delta);
  }
  return t;
}

// Engine v0.3.0 — endurance cost adjustment based on gear that targets route tags.
// Body Tension Belt halves endurance cost on Roof/Sloper routes.
// Returns the modified endurance cost (rounded up). `area` and `isMilestone`
// (optional) describe the climb for custom rules.
function getEffectiveClimbEnduranceCost(char, route, baseEndurance, area = null, isMilestone = false) {
  if (!route) return baseEndurance;
  let e = baseEndurance;
  if (route.tag) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'enduranceHalvedOnTag' && gear.tagFilter === route.tag) {
        e = Math.ceil(e / 2);
      }
    }
  }
  // Custom rules: flat changes, then percentage scaling (rounded up), never below 0.
  const ctx = climbCtx(route, area, isMilestone);
  const delta = effectSum(char, 'enduranceCost', ctx);
  if (delta) e = Math.max(0, e + delta);
  for (const s of ruleEffects(char, 'enduranceCostScale', ctx)) e = Math.ceil(e * s.percent / 100);
  return e;
}

// XP multiplier applied to base success/fail XP before Iron Lung's bonus.
// Sprinter's "Flash Speed": 0.5. Everyone else: 1.0.
function getXpMultiplier(char) {
  return char.key === 'sprinter' ? abilityParam(char, 'xpMultiplier') : 1.0;
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
// `area` / `isMilestone` (optional) describe the climb for custom "extra die"
// rules; each adds one die tagged with its card as `source`.
function buildEffectRollArray(char, route, area = null, isMilestone = false) {
  const effects = (route.rollEffect || []).map(e => ({ ...e }));
  if (char.key === 'sprinter' && abilityParam(char, 'focusCrux')) {
    effects.push({ stat: 'focus', modifier: 1, source: 'sprinter_flash_speed' });
  }
  for (const e of ruleEffects(char, 'extraDie', climbCtx(route, area, isMilestone))) {
    effects.push({ stat: e.stat, modifier: e.kind === 'buff' ? -1 : 1, source: `custom:${e.source}` });
  }
  return effects;
}

// The modifier a die will actually apply for this character once character
// overrides run (see applyDiceToRequirements): Free Solo negates every die,
// Technician negates nerf dice, and a custom "ignore dice" rule negates the
// kind it names. Used to decide which dice are worth improving. `ctx` is the
// climb context (climbCtx) when known.
function effectiveDieModifier(char, effect, ctx = null) {
  if (!effect) return 0;
  if (char && char.key === 'freeSolo') return 0;
  if (char && char.key === 'technician' && effect.modifier === 1) return 0;
  if (ctx) {
    for (const e of ruleEffects(char, 'negateDice', ctx)) {
      if (e.kind === 'all' || (e.kind === 'nerf' && effect.modifier === 1) || (e.kind === 'buff' && effect.modifier === -1)) return 0;
    }
  }
  return effect.modifier;
}

// Roll the dice for a climb. `numDice` is max(2, effects.length) — even on a
// Type-C "Pure Skill" route (empty rollEffect) we roll 2 dice that get
// ignored, matching game.js behavior. Die i is applied to effectRollArray[i];
// dice past the end of effectRollArray are never chosen by any gear effect.
//
// Gear effects on dice, in rulebook order ("roll, then re-rolls and extra
// dice, then 'treat a die as' effects, then +1 effects"):
//   - Crimp Sequence Decoder (rerollOnTag, Pinch/Crimp): MAY re-roll one die
//     of the climber's choice.
//   - Power Tap Belt (extraDieDiscardOne, Dynamic): roll ONE extra die, then
//     discard any one die — an N-die climb rolls N+1 and keeps N.
//   - Sequence Memorization (treatOneDieAsValue=1, every climb): treat one die
//     as 1, climber's choice.
//   - Climbing Coach (milestoneBuffDiceBonus, milestone climbs only): every
//     BUFF die (modifier -1) is +1, max 6. Nerf dice are untouched.
//   - Mountain Mentor (negateOneNerfDie): ignore one nerf die, climber's
//     choice — resolved in applyDiceToRequirements via `mentorIndex`.
//
// Every "climber's choice" is made for the player:
//   - Without `stats` (stat-blind): the die whose change most lowers its
//     requirement (a buff die wants a high number, a nerf die a low one) —
//     the Decoder re-rolls the die furthest on the wrong side of average
//     (3.5), Memorization takes the highest nerf die. Dice that apply nothing
//     are never picked: dice negated by Free Solo / Technician, dice past the
//     route's effects, and the nerf die Mountain Mentor negates (the first).
//   - v0.8.0, with the climb's effective `stats`: each choice maximises the
//     outcome instead (send first, then the deciding margin, then total
//     margin), Memorization and Mentor chosen together; the Decoder re-rolls
//     only when that raises P(send). The engine always passes stats.
//
// `trace` (optional array): each gear effect that fires pushes
// { gear, effectKind, die, from, to } (die = index into the returned rolls;
// Power Tap Belt also records `extra`, with die -1 when the extra die was the
// one discarded). Read-only bookkeeping for UIs; it never changes the rolls.
//
// Returns the final dice array. Use resolveClimbDice when you also need the
// Mountain Mentor choice (pass it to applyDiceToRequirements as mentorIndex).
function rollClimbDice(rng, effectRollArray, char = null, route = null, isMilestone = false, trace = null, stats = null, area = null) {
  return resolveClimbDice(() => rng.rollDie(6), effectRollArray, char, route, isMilestone, stats, trace, area).dice;
}

// Shared dice procedure. `drawDie()` supplies each d6 (the engine passes the
// game RNG; climbSendProbability passes scripted values to enumerate every
// outcome exactly). Returns { dice, mentorIndex } where mentorIndex is the
// nerf die Mountain Mentor ignores (null if none / not owned). `area` is the
// climb's wall (for custom rules).
function resolveClimbDice(drawDie, effectRollArray, char = null, route = null, isMilestone = false, stats = null, trace = null, area = null) {
  const numDice = Math.max(2, effectRollArray.length);
  const rolls = [];
  for (let i = 0; i < numDice; i++) rolls.push(drawDie());
  return finishClimbDice(rolls, drawDie, effectRollArray, char, route, isMilestone, stats, trace, area);
}

// Everything after the initial roll. Split out so the probability enumerator
// can supply the initial roll itself and only script the follow-up dice.
function finishClimbDice(rolls, drawDie, effectRollArray, char, route, isMilestone, stats, trace = null, area = null) {
  const ctx = makeDiceContext(effectRollArray, char, route, isMilestone, stats, area);
  const note = (gear, extra) => trace && trace.push({ gear: gear.name, effectKind: gear.effectKind, ...extra });

  if (ctx.reroll) {
    const target = chooseRerollTarget(ctx, rolls);
    if (target !== null) {
      const from = rolls[target];
      rolls[target] = drawDie();
      note(ctx.reroll, { die: target, from, to: rolls[target] });
    }
  }
  if (ctx.extraDie) {
    const extra = drawDie();
    const replace = chooseExtraDieSwap(ctx, rolls, extra);
    note(ctx.extraDie, { die: replace === null ? -1 : replace, extra, from: replace === null ? extra : rolls[replace], to: extra });
    if (replace !== null) rolls[replace] = extra;
  }
  const { dice, mentorIndex, memoIndex } = chooseFinalDice(ctx, rolls);
  if (trace) {
    if (memoIndex !== null) note(ctx.memo, { die: memoIndex, from: rolls[memoIndex], to: ctx.memoValue });
    if (ctx.coach) {
      for (let i = 0; i < ctx.n; i++) {
        if (ctx.effects[i].modifier === -1) note(ctx.coach, { die: i, from: rolls[i], to: dice[i] });
      }
    }
  }
  return { dice, mentorIndex };
}

function makeDiceContext(effects, char, route, isMilestone, stats, area = null) {
  const owned = (char && char.equipment ? char.equipment : [])
    .map(name => GEAR_SHOP.find(g => g.name === name))
    .filter(Boolean);
  const onTag = (gear) => !!(route && route.tag && gear.tagFilter === route.tag);
  const find = (kind, tagged) => owned.find(g => g.effectKind === kind && (!tagged || onTag(g)));
  const memo = find('treatOneDieAsValue', false);
  const coach = isMilestone ? find('milestoneBuffDiceBonus', false) : null;
  const n = effects.length;
  const climb = climbCtx(route, area, isMilestone);
  const mods = effects.map(e => effectiveDieModifier(char, e, climb));
  const mentor = !!find('negateOneNerfDie', false);
  // Dice whose value can change the outcome for this character.
  const live = mods.map((m, i) => (m !== 0 ? i : -1)).filter(i => i >= 0);
  // Stat-blind Mountain Mentor target: the first live nerf die. The other
  // stat-blind choices leave it alone (it counts for nothing).
  const mentorDefault = mentor ? (live.find(i => mods[i] === 1) ?? null) : null;
  return {
    char, route, area, effects, stats, n, mods, live, mentor, mentorDefault, isMilestone,
    // Dice a stat-blind choice may pick: live, and not the one Mentor negates.
    pickable: stats ? live : live.filter(i => i !== mentorDefault),
    reroll: find('rerollOnTag', true) || null,
    extraDie: find('extraDieDiscardOne', true) || null,
    memo: memo || null,
    memoValue: memo ? (memo.value || 1) : null,
    coach: coach || null,
    coachBonus: coach ? (coach.value || 1) : 0,
  };
}

// Score a final dice configuration: [send, deciding margin, total margin].
// The deciding margin is the margin on the stat that settles the climb (the
// worst stat, or the 3rd-best for a Route Reader). Higher is better.
function scoreDice(ctx, dice, mentorIndex) {
  const { requirements } = applyDiceToRequirements(ctx.char, ctx.route, ctx.effects, dice, { mentorIndex, area: ctx.area, isMilestone: ctx.isMilestone });
  return scoreRequirements(ctx.char, ctx.stats, requirements, ctx.isMilestone, ctx);
}

// Same send rule as resolveClimbOutcome (passRule), as a score. `ctx`
// ({ route, area }) is the climb, for custom send rules.
function scoreRequirements(char, stats, requirements, isMilestone = false, ctx = null) {
  const margins = STAT_KEYS.map(k => stats[k] - requirements[k]).sort((a, b) => b - a);
  const { needed, nearMiss } = passRule(char, isMilestone, ctx);
  const deciding = needed === 4 ? margins[3] : Math.min(margins[2], margins[3] + nearMiss);
  return [deciding >= 0 ? 1 : 0, deciding, margins[0] + margins[1] + margins[2] + margins[3]];
}

function better(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Apply Sequence Memorization, Climbing Coach and Mountain Mentor, choosing
// the Memorization and Mentor targets. Returns the best final dice.
function chooseFinalDice(ctx, rolls) {
  const memoOptions = [null];
  if (ctx.memoValue !== null) {
    // Treating a die as 1 only helps on a nerf die showing more than 1.
    for (const i of ctx.pickable) if (ctx.mods[i] === 1 && rolls[i] > ctx.memoValue) memoOptions.push(i);
  }
  let best = null;
  for (const memoIdx of memoOptions) {
    const dice = rolls.slice();
    if (memoIdx !== null) dice[memoIdx] = ctx.memoValue;
    if (ctx.coachBonus) {
      for (let i = 0; i < ctx.n; i++) if (ctx.effects[i].modifier === -1) dice[i] = Math.min(6, dice[i] + ctx.coachBonus);
    }
    // With stats, Mentor may take any live nerf die; stat-blind, the first.
    const mentorOptions = !ctx.mentor ? [] : ctx.stats ? ctx.live.filter(i => ctx.mods[i] === 1)
      : (ctx.mentorDefault === null ? [] : [ctx.mentorDefault]);
    if (!mentorOptions.length) mentorOptions.push(null);
    for (const mentorIndex of mentorOptions) {
      const cand = { dice, mentorIndex, memoIndex: memoIdx };
      if (!ctx.stats) {
        // Stat-blind: Memorization on the highest pickable nerf die (first on
        // ties). Never makes a die worse.
        cand.score = [memoIdx === null ? 0 : rolls[memoIdx]];
      } else {
        cand.score = scoreDice(ctx, dice, mentorIndex);
      }
      if (!best || better(cand.score, best.score)) best = cand;
    }
  }
  return best;
}

// Outcome of the dice from here on (Memorization/Coach/Mentor chosen well).
function downstreamScore(ctx, rolls) {
  const fin = chooseFinalDice(ctx, rolls);
  return ctx.stats ? fin.score : null;
}

// Crimp Sequence Decoder: which die (if any) to re-roll. With stats, pick the
// die whose re-roll gives the highest P(send) — re-rolling only when that
// beats keeping the current dice. Without stats, re-roll the die that is
// furthest on the wrong side of average (3.5), if any.
function chooseRerollTarget(ctx, rolls) {
  if (!ctx.stats) {
    let target = null;
    let worst = 0;
    for (const i of ctx.pickable) {
      const harm = ctx.mods[i] === 1 ? rolls[i] - 3.5 : 3.5 - rolls[i];
      if (harm > worst) { worst = harm; target = i; }
    }
    return target;
  }
  const keep = downstreamScore(ctx, rolls);
  let target = null;
  let bestP = keep[0];
  let bestMargin = keep[1];
  for (const i of ctx.live) {
    let p = 0;
    let margin = 0;
    for (let v = 1; v <= 6; v++) {
      const next = rolls.slice();
      next[i] = v;
      const s = downstreamScore(ctx, next);
      p += s[0] / 6;
      margin += s[1] / 6;
    }
    if (p > bestP + 1e-12 || (Math.abs(p - bestP) <= 1e-12 && target !== null && margin > bestMargin)) {
      bestP = p; bestMargin = margin; target = i;
    }
  }
  return target;
}

// Power Tap Belt: which die (if any) the extra die replaces. Discarding the
// extra die itself is always an option.
function chooseExtraDieSwap(ctx, rolls, extra) {
  if (!ctx.stats) {
    let bestIdx = null;
    let bestGain = 0;
    for (const i of ctx.pickable) {
      // Buff die: a higher die subtracts more. Nerf die: a lower die adds less.
      const gain = ctx.mods[i] === -1 ? extra - rolls[i] : rolls[i] - extra;
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    }
    return bestIdx;
  }
  let bestIdx = null;
  let best = downstreamScore(ctx, rolls);
  for (const i of ctx.live) {
    const next = rolls.slice();
    next[i] = extra;
    const s = downstreamScore(ctx, next);
    if (better(s, best)) { best = s; bestIdx = i; }
  }
  return bestIdx;
}

const STAT_KEYS = ['strength', 'technique', 'focus', 'flexibility'];

// =============================================================================
// EXACT SEND PROBABILITY
// =============================================================================

// Exact probability that a climb sends, given the climber's current state.
// Enumerates every die outcome through the SAME procedure the climb handler
// runs (finishClimbDice + applyDiceToRequirements + the 3-of-4 / 4-of-4 rule),
// including re-rolls and extra dice, so it cannot disagree with real climbs.
// A climb rolls at most 4 live dice plus 1 follow-up die: ≤ 7,776 outcomes.
//
// Does not check legality (access, Time, Endurance, stations, Free Solo's
// gate) — callers decide whether the climb may be started.
//
// Returns { pSend, expectedMargin, stats }. expectedMargin is the mean
// deciding margin (stat − requirement on the stat that settles the climb):
// useful to rank options when pSend is 0 or 1.
function climbSendProbability(char, route, area, attemptedRoutesForPlayer = {}, { isMilestone = false, shift = null } = {}) {
  const stats = computeClimbStats(char, route, area, attemptedRoutesForPlayer, shift, isMilestone);
  // Memoised: the result depends only on the character, its gear, the climb's
  // stats and the route — and bots ask about the same climbs every turn.
  // Custom rules (the climber's and its custom gear's) are part of the key
  // through their signature; a custom route is keyed by its printed numbers
  // and features like any other, plus the wall for wall-dependent rules.
  const sig = rulesSignature(char);
  const memoKey = `${char.key}|${char.equipment.join(',')}|${stats.strength},${stats.technique},${stats.focus},${stats.flexibility}|` +
    `${isMilestone ? 1 : 0}|${route.strength},${route.technique},${route.focus},${route.flexibility}|${route.tag || ''}|` +
    `${(route.rollEffect || []).map(e => `${e.stat}${e.modifier}`).join(',')}|` +
    `${char.betaBoostActive ? 1 : 0}|${char.abilityParams ? JSON.stringify(char.abilityParams) : ''}` +
    (sig ? `|${sig}|${area}|${route.name}|${route.grade}|${route.routeType}|${(route.holdFeatures || []).join('/')}|${(route.moveFeatures || []).join('/')}|${char.level}` : '');
  const hit = SEND_MEMO.get(memoKey);
  if (hit) return { ...hit, stats };
  const result = exactSendProbability(char, route, isMilestone, stats, area);
  if (SEND_MEMO.size > 50000) SEND_MEMO.clear();
  SEND_MEMO.set(memoKey, result);
  return { ...result, stats };
}

const SEND_MEMO = new Map();

function exactSendProbability(char, route, isMilestone, stats, area = null) {
  const climb = climbCtx(route, area, isMilestone);
  const effects = buildEffectRollArray(char, route, area, isMilestone);
  const live = effects.map((e, i) => (effectiveDieModifier(char, e, climb) !== 0 ? i : -1)).filter(i => i >= 0);
  const base = new Array(Math.max(2, effects.length)).fill(1);
  const combos = 6 ** live.length;
  let pSend = 0;
  let expectedMargin = 0;
  for (let code = 0; code < combos; code++) {
    const rolls = base.slice();
    let c = code;
    for (const i of live) { rolls[i] = (c % 6) + 1; c = Math.floor(c / 6); }
    enumerateFollowUpDraws(
      (draw) => {
        const res = finishClimbDice(rolls.slice(), draw, effects, char, route, isMilestone, stats, null, area);
        const { requirements } = applyDiceToRequirements(char, route, effects, res.dice, { mentorIndex: res.mentorIndex, area, isMilestone });
        return scoreRequirements(char, stats, requirements, isMilestone, climb);
      },
      (score, weight) => {
        pSend += (score[0] * weight) / combos;
        expectedMargin += (score[1] * weight) / combos;
      },
    );
  }
  // Snap away float residue from summing sixths (6 × 1/6 → 0.9999…).
  const snap = (x) => Math.round(x * 1e12) / 1e12;
  return { pSend: snap(pSend), expectedMargin: snap(expectedMargin) };
}

// Run `run(draw)` once per possible sequence of follow-up d6 draws, calling
// emit(result, probability) for each. Sequences are discovered lazily: a run
// that asks for one more die than its scripted prefix is retried with that
// die fixed to each of 1..6.
const NEED_DIE = Symbol('need-die');
function enumerateFollowUpDraws(run, emit) {
  const stack = [[]];
  while (stack.length) {
    const prefix = stack.pop();
    let k = 0;
    const draw = () => {
      if (k < prefix.length) return prefix[k++];
      throw NEED_DIE;
    };
    try {
      emit(run(draw), 6 ** -prefix.length);
    } catch (e) {
      if (e !== NEED_DIE) throw e;
      for (let v = 1; v <= 6; v++) stack.push([...prefix, v]);
    }
  }
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
//   `opts.mentorIndex` names that die (resolveClimbDice picks it); when it is
//   omitted, the first live nerf die is ignored (the stat-blind rule).
//
// Returns { requirements, appliedModifiers }
//   appliedModifiers = array of {die, stat, modifier, deltaApplied, source}
//   for telemetry. modifier is the POST-override value actually applied.
// `opts.area` / `opts.isMilestone` describe the climb for custom rules
// (ignored dice, requirement changes).
function applyDiceToRequirements(char, route, effectRollArray, diceRolls, opts = {}) {
  const requirements = {
    strength: route.strength,
    technique: route.technique,
    focus: route.focus,
    flexibility: route.flexibility,
  };
  const appliedModifiers = [];
  const climb = climbCtx(route, opts.area, opts.isMilestone);

  const hasMentor = (char.equipment || []).some(name => {
    const g = GEAR_SHOP.find(x => x.name === name);
    return g && g.effectKind === 'negateOneNerfDie';
  });
  let mentorIndex = null;
  if (hasMentor) {
    if (opts.mentorIndex !== undefined) {
      mentorIndex = opts.mentorIndex;
    } else {
      const first = effectRollArray.findIndex(e => effectiveDieModifier(char, e, climb) === 1);
      mentorIndex = first === -1 ? null : first;
    }
  }

  for (let i = 0; i < effectRollArray.length; i++) {
    const effect = effectRollArray[i];
    const die = diceRolls[i] ?? 0;
    let effectiveMod = effectiveDieModifier(char, effect, climb);
    // Mountain Mentor — the chosen nerf die counts as 0.
    if (effectiveMod === 1 && i === mentorIndex) effectiveMod = 0;

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
    const cut = abilityParam(char, 'reqReduction');
    for (const k of Object.keys(requirements)) {
      requirements[k] = Math.max(0, requirements[k] - cut);
    }
  }
  // Custom rules: requirement changes (negative = easier), floored at 0.
  for (const e of ruleEffects(char, 'requirementChange', climb)) {
    for (const k of (e.stat === 'all' ? STAT_KEYS : [e.stat])) requirements[k] = Math.max(0, requirements[k] + e.amount);
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
// `ctx` (optional, { route, area }) is the climb, for custom send rules.
function resolveClimbOutcome(char, effectiveStats, requirements, isMilestone = false, ctx = null) {
  const perStatPass = {
    strength:    effectiveStats.strength    >= requirements.strength,
    technique:   effectiveStats.technique   >= requirements.technique,
    focus:       effectiveStats.focus       >= requirements.focus,
    flexibility: effectiveStats.flexibility >= requirements.flexibility,
  };
  const passCount = Object.values(perStatPass).filter(Boolean).length;
  const { needed, nearMiss } = passRule(char, isMilestone, ctx);
  let success = passCount >= needed;
  // A Route Reader's one failing stat may have to be a near miss (variant).
  if (success && passCount < 4 && Number.isFinite(nearMiss)) {
    success = STAT_KEYS.every(k => effectiveStats[k] - requirements[k] >= -nearMiss);
  }
  return { success, perStatPass, passCount };
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
// `ctx` (optional, { area, isMilestone }) describes the climb for custom XP
// rules (XP %, XP bonus).
function computeClimbXp(char, route, success, ctx = null) {
  const base = success ? route.xpSuccess : route.xpFail;
  let xp = base * getXpMultiplier(char);
  const climb = ctx ? climbCtx(route, ctx.area, ctx.isMilestone) : null;
  if (climb) for (const e of ruleEffects(char, 'xpScale', climb)) xp *= e.percent / 100;
  if (!success && char.key === 'ironLung') {
    xp += Math.floor(xp * abilityParam(char, 'failXpBonus'));
  }
  // Confidence Building: failed climbs get +N bonus XP
  if (!success) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'failBonusXp') xp += (gear.value || 0);
    }
  }
  if (climb) {
    for (const e of ruleEffects(char, 'xpBonus', climb)) {
      if (e.on === 'any' || (e.on === 'send' && success) || (e.on === 'fall' && !success)) xp += e.amount;
    }
  }
  return Math.max(0, Math.floor(xp));
}

// Iron Lung "Relentless": extra 5 endurance cost on failure.
// Engine v0.3.0 gear effect (ignoreFailPenalty / Mental Anchor): ignores the penalty.
// `ctx` (optional, { route, area, isMilestone }) is the climb for custom rules
// (fall penalty, no fall penalty).
function getFailureEnduranceExtra(char, ctx = null) {
  const climb = ctx ? climbCtx(ctx.route, ctx.area, ctx.isMilestone) : null;
  // Mental Anchor — bypass even Iron Lung's −5 fail penalty
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'ignoreFailPenalty') return 0;
  }
  if (climb && hasEffect(char, 'ignoreFailPenalty', climb)) return 0;
  const base = char.key === 'ironLung' ? abilityParam(char, 'failEndurance') : 0;
  return base + (climb ? effectSum(char, 'failPenalty', climb) : 0);
}

// Engine v0.3.0 — Power Spotting heals endurance after every successful climb.
// Returns the amount to heal (0 if no such gear owned). `ctx` (optional,
// { route, area, isMilestone }) is the climb for custom "heal on send" rules.
function getSuccessEnduranceHeal(char, ctx = null) {
  let heal = 0;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'successHealEndurance') heal += (gear.value || 0);
  }
  if (ctx) heal += effectSum(char, 'successHeal', climbCtx(ctx.route, ctx.area, ctx.isMilestone));
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

// The gear effectKinds describeClimbGearEffects can report on a climb. Other
// effect cards act on training (trainingBonusBoost, trainingCapBonus,
// freeTrainingSession), and plain stat cards are always on.
const CLIMB_GEAR_EFFECT_KINDS = Object.freeze([
  'timeCostReduction', 'enduranceHalvedOnTag', 'rerollOnTag', 'treatOneDieAsValue', 'milestoneBuffDiceBonus',
  'extraDieDiscardOne', 'negateOneNerfDie', 'failBonusXp', 'ignoreFailPenalty', 'successHealEndurance',
]);

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
  char, route, effectRollArray, diceTrace, appliedModifiers, success, timeCost, enduranceCost, healed, isMilestone = false, area = null,
}) {
  const out = [];
  const names = (kind) => ownedGearWithEffect(char, kind).map(g => g.name).join(', ');
  const climb = climbCtx(route, area, isMilestone);

  // Printed-gear cost effects only; custom rules report through climb_resolved's customRules.
  const charOnlyTime = getEffectiveClimbTimeCost(char, route.time, null, isMilestone) + effectSum(char, 'timeCost', climb);
  if (timeCost < charOnlyTime && ownedGearWithEffect(char, 'timeCostReduction').length) {
    out.push({ gear: names('timeCostReduction'), effectKind: 'timeCostReduction', from: charOnlyTime, to: timeCost });
  }
  if (enduranceCost < route.endurance && ownedGearWithEffect(char, 'enduranceHalvedOnTag').some(g => g.tagFilter === route.tag)) {
    out.push({ gear: names('enduranceHalvedOnTag'), effectKind: 'enduranceHalvedOnTag', from: route.endurance, to: enduranceCost });
  }
  for (const t of diceTrace) {
    if (t.effectKind === 'milestoneBuffDiceBonus' && t.from === t.to) continue; // already a 6
    out.push({ ...t });
  }
  const mentor = ownedGearWithEffect(char, 'negateOneNerfDie')[0];
  if (mentor) {
    effectRollArray.forEach((effect, i) => {
      if (effectiveDieModifier(char, effect, climb) === 1 && appliedModifiers[i] && appliedModifiers[i].modifier === 0) {
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
        out.push({ gear: g.name, effectKind: 'ignoreFailPenalty', endurance: abilityParam(char, 'failEndurance') });
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
// RULES VARIANTS (training) — for balance experiments
// =============================================================================
//
// A game may carry `state.rules`, an object of overrides used by the balance
// harness to A/B-test rule changes without editing code. Absent or empty, the
// game plays the standard rules exactly. Training fields:
//   trainTime            Time per session            (standard: the station's, 2)
//   trainBonus           stat gained per session     (standard: the station's, 5)
//   trainEnduranceMult   × station Endurance cost    (standard: 1)
//   trainCapBase,        cap on the TRAINING bonus per stat: base + perLevel ×
//   trainCapPerLevel     (Level − 1). Omit trainCapBase for no cap.
//   trainPerRound        max sessions per climber per round (standard: no limit)
// Grit economy (`rules.grit`, an object; off when absent). Experience and
// currency are separate: XP only raises your Level and is never spent; Grit
// buys training and gear.
//   routeGrit          Grit placed on a route card when it is dealt, by grade
//                      band [easy, mid, hard] (default [1, 2, 3]). The first
//                      climber to SEND the route takes it.
//   milestoneGrit      Grit for sending each milestone (per climber)
//                      (default { beginner: 2, intermediate: 3, expert: 4 }).
//   trainCost          Grit per training session (default 1).
//   gearPriceDivisor   gear price in Grit = max(1, round(XP cost / divisor))
//                      unless the card prints a gritCost (default 25).
//   start              Grit each climber starts with (default 0).
//   seatStart          extra starting Grit by seat, e.g. [0, 1, 2, 3] —
//                      compensates later seats for acting after seat 1.
//   perRound           Grit each climber gains at the start of every round
//                      after the first (default 0) — a floor so nobody is
//                      locked out of training when no route is in reach.
// Per-character overrides (`rules.characters[key]`):
//   gritStart          this climber's starting Grit (instead of grit.start)
//   trainCapMultiplier × this climber's training cap (default 1)
//   uncapped           true: no training cap for this climber
//   body               { startingStats, startingEndurance, growth } (each partial):
//                      this climber's numbers (applied by createGame)
//   gritPerRound       this climber's per-round Grit (instead of grit.perRound)
//   freeTraining       true: this climber's training sessions cost no Grit
// Cards marked `variantOnly: 'trainingCap'` exist only in games with a training
// cap (trainCapBase set): they are never dealt in the standard game.

// Time, Endurance and stat gain of one session at `area` for `char`.
function trainingSpec(rules, area, char) {
  const r = rules || {};
  // Custom rules: training gain for this stat (or every stat).
  let custom = 0;
  for (const e of ruleEffects(char, 'trainingGain', { scope: 'training', stat: area.stat })) {
    if (e.stat === 'all' || e.stat === area.stat) custom += e.amount;
  }
  return {
    time: r.trainTime ?? area.time,
    endurance: Math.round(area.endurance * (r.trainEnduranceMult ?? 1)),
    gain: Math.max(1, (r.trainBonus ?? area.bonus) + getTrainingBonusBoost(char) + custom),
  };
}

// Max training bonus per stat at the climber's Level (Infinity = no cap).
function trainingCap(rules, char) {
  const r = rules || {};
  if (r.trainCapBase === undefined || r.trainCapBase === null) return Infinity;
  const own = (r.characters && r.characters[char.key]) || {};
  if (own.uncapped) return Infinity;
  // Hangboard Program (trainingCapBonus) raises the cap; so do custom rules.
  let bonus = effectSum(char, 'trainingCapBonus', { scope: 'training' });
  for (const n of char.equipment || []) {
    const g = GEAR_SHOP.find(x => x.name === n);
    if (g && g.effectKind === 'trainingCapBonus') bonus += g.value || 0;
  }
  return (r.trainCapBase + (r.trainCapPerLevel ?? 0) * (char.level - 1)) * (own.trainCapMultiplier ?? 1) + bonus;
}

// May `char` train `stat` once more under the variant's cap / per-round limit
// / Grit cost? (Time, Endurance and station occupancy are checked by the caller.)
function trainingAllowed(rules, char, stat, gain) {
  const r = rules || {};
  if (r.trainPerRound !== undefined && (char.trainedThisRound || 0) >= r.trainPerRound) return false;
  if ((char.grit || 0) < trainingGritCost(rules, char)) return false;
  return char.trainingBonuses[stat] + gain <= trainingCap(rules, char);
}

// ----- Grit economy -----

const DEFAULT_ROUTE_GRIT = [1, 2, 3];
const DEFAULT_MILESTONE_GRIT = { beginner: 2, intermediate: 3, expert: 4 };

// The game's rules (1.1.0): the Grit economy. Local and online play create
// every game with these (docs/CPU_PLAYTEST_AUDIT.md §10–14):
//   - route cards carry 2 / 3 / 4 Grit by grade band; the first climber to
//     send a route takes it; Milestone sends pay 2 / 3 / 4;
//   - training costs 1 Grit and is capped at 10 + 5 per Level above 1;
//   - gear is priced in Grit; XP only raises your Level and is never spent;
//   - later seats start with 0 / 2 / 4 / 6 Grit;
//   - Free Solo gains 2 Grit every round (it can only send routes it already
//     beats, so without an income it soft-locks).
// The climbers' balance changes are printed abilities (DEFAULT_ABILITY) and
// character data, so they apply under any rules.
const GRIT_RULES = Object.freeze({
  grit: { start: 0, perRound: 0, routeGrit: [2, 3, 4], seatStart: [0, 2, 4, 6] },
  trainCapBase: 10,
  trainCapPerLevel: 5,
  characters: { freeSolo: { gritPerRound: 2 } },
});

// Grit a climber gains at the start of each round after the first.
function perRoundGrit(rules, key) {
  const own = rules.characters && rules.characters[key];
  return (own && own.gritPerRound !== undefined) ? own.gritPerRound : (rules.grit.perRound ?? 0);
}

// Starting Grit for a climber under `rules` (seat is 0-based).
function startingGrit(rules, key, seat = 0) {
  const own = rules.characters && rules.characters[key];
  const base = (own && own.gritStart !== undefined) ? own.gritStart : (rules.grit.start ?? 0);
  return base + ((rules.grit.seatStart && rules.grit.seatStart[seat]) || 0);
}

function usesGrit(rules) {
  return !!(rules && rules.grit);
}

// Grade band of a route: 0 easy (V0–V2, 5.6–5.9), 1 mid (V3–V7, 5.10–5.11),
// 2 hard (V8+, 5.12+). Defined in content.js (custom rules use it too).
const gradeBand = gradeBandOf;

// Grit a freshly dealt route card carries.
function routeGritValue(rules, route) {
  const table = (rules.grit && rules.grit.routeGrit) || DEFAULT_ROUTE_GRIT;
  return table[gradeBand(route)] ?? 0;
}

// Copies of `routes` with their Grit placed, when the Grit economy is on;
// otherwise `routes` unchanged. Used whenever route cards are dealt.
function dealRouteGrit(rules, routes) {
  if (!usesGrit(rules)) return routes;
  return routes.map(r => ({ ...r, grit: routeGritValue(rules, r) }));
}

function milestoneGritReward(rules, tier) {
  if (!usesGrit(rules)) return 0;
  const table = rules.grit.milestoneGrit || DEFAULT_MILESTONE_GRIT;
  return table[tier] || 0;
}

// Grit the next training session costs `char` (0 without the economy, or
// when Training Partner's free session is still unused this round).
function trainingGritCost(rules, char) {
  if (!usesGrit(rules)) return 0;
  if (rules.characters && rules.characters[char.key] && rules.characters[char.key].freeTraining) return 0;
  if (ownsEffect(char, 'freeTrainingSession') && !char.freeSessionUsed) return 0;
  return rules.grit.trainCost ?? 1;
}

// Price of `gear` for `char`: Grit in the Grit economy, else XP.
function gearPrice(rules, char, gear) {
  if (!usesGrit(rules)) return getEffectiveGearCost(char, gear);
  if (typeof gear.gritCost === 'number') return gear.gritCost;
  const div = rules.grit.gearPriceDivisor || 25;
  return Math.max(1, Math.round(gear.cost / div));
}

// What `char` can spend on gear: Grit, or XP earned since the Level began.
function gearFunds(rules, char) {
  return usesGrit(rules) ? (char.grit || 0) : getSpendableXp(char);
}

// Pay for gear (mutates char). In the Grit economy XP is never spent.
function payForGear(rules, char, cost) {
  if (usesGrit(rules)) char.grit = (char.grit || 0) - cost;
  else char.xp -= cost;
}

// Is `gear` part of this game's deck? (variantOnly cards need their variant.)
function gearInGame(rules, gear) {
  if (!gear.variantOnly) return true;
  if (gear.variantOnly === 'trainingCap') return !!(rules && rules.trainCapBase !== undefined && rules.trainCapBase !== null);
  return false;
}

// Grit a climb earns `char`, applied in place: a regular send takes the
// Grit on the route card (and empties the card); a milestone send pays its
// tier's reward. Falls earn nothing. `route` is the card in play (bots pass a
// copy). Returns the Grit gained.
function claimClimbGrit(rules, char, route, { isMilestone, success, tier }) {
  if (!usesGrit(rules) || !success) return 0;
  const gained = isMilestone ? milestoneGritReward(rules, tier) : (route.grit || 0);
  if (!isMilestone) route.grit = 0;
  char.grit = (char.grit || 0) + gained;
  return gained;
}

function ownsEffect(char, kind) {
  return (char.equipment || []).some(n => {
    const g = GEAR_SHOP.find(x => x.name === n);
    return g && g.effectKind === kind;
  });
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
// A custom "sure sends only" rule gates the same way; `area` / `isMilestone`
// (optional) describe the climb for its conditions.
function freeSoloCanAttempt(char, route, area = null, isMilestone = false) {
  if (char.key !== 'freeSolo' && !hasEffect(char, 'sureSendOnly', climbCtx(route, area, isMilestone))) return true;
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
  return char.key === 'routeReader' && !char.abilityUsed && (!isMilestone || abilityParam(char, 'shiftOnMilestones'));
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
function bestRouteReaderShift(char, route, area, attemptedRoutesForPlayer, isMilestone = false) {
  if (char.key !== 'routeReader') return null;
  let stats = computeEffectiveStats(char, route, area, attemptedRoutesForPlayer);
  if (char.betaBoostActive) {
    const b = abilityParam(char, 'betaBoost') ?? 3;
    stats = Object.fromEntries(SHIFT_STATS.map(k => [k, stats[k] + b]));
  }
  // The margin that settles the climb under this climber's send rule (passRule).
  const { needed, nearMiss } = passRule(char, isMilestone);
  const deciding = (st) => {
    const m = SHIFT_STATS.map(k => st[k] - route[k]).sort((a, b) => b - a);
    return needed === 4 ? m[3] : Math.min(m[2], m[3] + nearMiss);
  };
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
  // Custom rules: rest bonus (the climber's and its custom gear's).
  let restBonus = effectSum(char, 'restBonus', { scope: 'rest' });
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
  // Custom gear: its "max Endurance" rules (unconditional, setup scope).
  let bonus = effectSum(char, 'maxEndurance', { scope: 'setup' });
  for (const name of char.equipment || []) {
    const g = GEAR_SHOP.find(x => x.name === name);
    if (!g) continue;
    if (g.statEffect === 'endurance') bonus += g.value;
    if (typeof g.enduranceBonus === 'number') bonus += g.enduranceBonus;
  }
  return bonus;
}

// Time a climber starts each round with: 10, plus every owned card that
// adds Time at round start (Approach Shoes), plus custom "Time each round"
// rules. Never below 1.
function roundStartTime(char) {
  let t = 10;
  for (const name of char.equipment || []) {
    const g = GEAR_SHOP.find(x => x.name === name);
    if (g && g.statEffect === 'timePerRound') t += g.value || 0;
  }
  t += effectSum(char, 'timePerRound', { scope: 'round' });
  return Math.max(1, t);
}

// If the character's cumulative XP has crossed the next-level threshold,
// advance level and recompute stats from the growth formula. Mutates char.
// Returns { leveledUp: boolean, newLevel, oldStats, newStats, oldMaxEndurance, newMaxEndurance }.
function applyLevelUpIfNeeded(char) {
  if (char.level >= 15) return { leveledUp: false };
  const nextRow = XP_TABLE.find(r => r.level === char.level + 1);
  if (!nextRow) return { leveledUp: false };
  if (char.xp < nextRow.cumulative) return { leveledUp: false };

  // The climber's own body numbers (a rules variant may have adjusted them at
  // setup — rules.characters[key].body; a custom climber always carries its
  // own), else the character template's.
  const base = CHARACTERS[char.key] || {};
  const tmpl = {
    startingStats: char.startingStats || base.startingStats,
    startingEndurance: char.startingEndurance ?? base.startingEndurance,
    growth: char.growth || base.growth,
  };
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

return { checkAreaAccess, getSectionCapacity, getOccupiedBelayerStations, isBelayerStationFree, canClimbTopRopeRoute, pickFreeBelayerStation, isTrainingEquipment, getPlayersInSection, canEnterSection, calculateGearBonuses, computeEffectiveStats, computeClimbStats, betaBoostAmount, DEFAULT_ABILITY, abilityParam, passRule, getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost, getXpMultiplier, getGearPurchaseTimeCost, getEffectiveGearCost, getSpendableXp, buildEffectRollArray, rollClimbDice, resolveClimbDice, climbSendProbability, applyDiceToRequirements, resolveClimbOutcome, computeClimbXp, getFailureEnduranceExtra, getSuccessEnduranceHeal, applySuccessHeal, CLIMB_GEAR_EFFECT_KINDS, describeClimbGearEffects, getTrainingBonusBoost, trainingSpec, trainingCap, trainingAllowed, GRIT_RULES, perRoundGrit, startingGrit, usesGrit, gradeBand, routeGritValue, dealRouteGrit, milestoneGritReward, trainingGritCost, gearPrice, gearFunds, payForGear, gearInGame, claimClimbGrit, freeSoloCanAttempt, applyBetaBoostIfActive, MAX_STAT_SHIFT, isWellFormedStatShift, canUseStatShift, applyStatShiftToStats, bestRouteReaderShift, computeRestRecovery, getGearMaxEnduranceBonus, roundStartTime, applyLevelUpIfNeeded, dispatchToolCall };
})();

// ---- engine/state.js ----
const __state = (function () {
'use strict';
const { ROUTES } = __data;
const { createRng } = __rng;
const { makeEmitter } = __telemetry;
const { ENGINE_VERSION_STRING } = __version;
const { dealRouteGrit, gearInGame, startingGrit, usesGrit } = __helpers;
const { compileContentPack, hasCustomContent, characterTemplate, routesForArea, gearPool, effectSum } = __content;
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

// The routes of `area` that may be dealt to the wall: the area's deck (plus
// the game's custom routes, `content`) minus this game's milestone routes.
// Milestone cards sit on the milestone board for the whole game, so they
// never also appear as a regular route.
function regularRoutePool(milestoneRoutes, area, content = null) {
  const milestoneNames = new Set(
    Object.values(milestoneRoutes || {})
      .filter(m => m && m.area === area)
      .map(m => m.route.name),
  );
  return routesForArea(content, area).filter(r => !milestoneNames.has(r.name));
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

// `rules` (optional): balance-experiment overrides, stored on the state as
// state.rules — see trainingSpec in helpers.js. Omit for the standard rules.
// `content` (optional): a Project Mode content pack (content.js) — custom
// climbers, route cards and gear cards added to the printed deck for this
// game. It must compile; the normalized pack is stored as state.content so a
// replay from the state's seed, characters and content reproduces the game.
function createGame({ seed, characterKeys, rules = null, content = null }) {
  // Validate inputs up front — these are the pipeline's guarantees,
  // so a bad input is a programming bug, not runtime noise.
  if (!Array.isArray(characterKeys) || characterKeys.length < 1 || characterKeys.length > 4) {
    throw new Error('characterKeys must be an array of 1–4 character keys');
  }
  if (new Set(characterKeys).size !== characterKeys.length) {
    // Per playtest design decision (2026-04-21): no duplicate characters in a game.
    throw new Error('duplicate character keys are not allowed');
  }
  let pack = null;
  if (content && hasCustomContent(content)) {
    const compiled = compileContentPack(content);
    if (!compiled.ok) {
      throw new Error(`content pack does not compile: ${compiled.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`);
    }
    pack = compiled.value;
  }
  for (const key of characterKeys) {
    if (!characterTemplate(pack, key)) throw new Error(`unknown character key: ${key}`);
  }
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new Error('seed must be a finite number');
  }

  const rng = createRng(seed);
  const emitter = makeEmitter(0);

  // Build players.
  const players = characterKeys.map((key, i) => makePlayer(i + 1, key, pack));
  // Grit economy: every climber starts with rules.grit.start Grit (plus a
  // custom climber's "starting Grit" rules).
  if (usesGrit(rules)) {
    players.forEach((p, i) => {
      p.character.grit = startingGrit(rules, p.character.key, i) + effectSum(p.character, 'gritStart', { scope: 'setup' });
    });
  }
  // Rules-variant ability tuning (rules.characters[key].ability), copied onto
  // the climber so every helper sees it (abilityParam in helpers.js), and body
  // tuning (rules.characters[key].body: startingStats / startingEndurance /
  // growth, each partial), applied to the climber's own copy of its numbers.
  for (const p of players) {
    const own = rules && rules.characters && rules.characters[p.character.key];
    if (!own) continue;
    if (own.ability) p.character.abilityParams = { ...own.ability };
    if (own.body) applyBody(p.character, own.body);
  }

  // Top Rope belayer stations: N − 1 belayers for N players, minimum 1 (solo
  // Auto-Belay). Fixed from round 1 — no time-based unlock ramp.
  const belayerCount = belayerCountFor(players.length);

  // Pick milestone routes FIRST (matches game.js:773 ordering — milestones
  // are selected before the per-area route rotation is drawn).
  const milestones = pickMilestoneRoutes(rng, pack);

  // Draw the opening rotation. Bouldering and Lead keep a flat list of 5;
  // Top Rope is split into belayerCount stations of 2 routes each.
  // Milestone routes are excluded from every wall's deck.
  // Grit-economy rules place Grit on every card as it is dealt.
  const availableRoutes = {
    bouldering: dealRouteGrit(rules, rng.pickN(regularRoutePool(milestones, 'bouldering', pack), 5)),
    topRope: dealRouteGrit(rules, drawTopRopeStations(rng, belayerCount, regularRoutePool(milestones, 'topRope', pack))),
    leadClimbing: dealRouteGrit(rules, rng.pickN(regularRoutePool(milestones, 'leadClimbing', pack), 5)),
  };

  // Draw 3 non-access-card items for the shop rotation.
  const availableGear = initializeGearShop(rng, rules, pack);

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
    ...(rules ? { rules: { ...rules } } : {}),
    // Project Mode: the compiled content pack this game is played with.
    ...(pack ? { content: pack } : {}),
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
      ...(p.character.custom ? { custom: true } : {}),
    })),
    ...(pack ? { customContent: { characters: Object.keys(pack.characters), routes: Object.values(pack.routes).flat().map(r => r.name), gear: pack.gear.map(g => g.name) } } : {}),
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
// Adjust a fresh (Level 1) climber's starting stats, Endurance and growth.
function applyBody(c, body) {
  if (body.startingStats) c.startingStats = { ...c.startingStats, ...body.startingStats };
  if (body.growth) c.growth = { ...c.growth, ...body.growth };
  if (body.startingEndurance !== undefined) c.startingEndurance = body.startingEndurance;
  c.stats = { ...c.startingStats };
  c.maxEndurance = c.startingEndurance;
  c.currentEndurance = c.startingEndurance;
}

function makePlayer(playerNum, characterKey, content = null) {
  const tmpl = characterTemplate(content, characterKey);
  // Deep-clone so the per-player `specialAbility.used` flag (and any
  // future per-player mutation) doesn't bleed into the shared template.
  const charBase = JSON.parse(JSON.stringify(tmpl));
  // A custom climber's rules act through content.js activeRules; the
  // template's `rules` list moves to `customRules` so it can't be mistaken for
  // the game's rules variant.
  if (charBase.custom) {
    charBase.customRules = charBase.rules;
    delete charBase.rules;
  }
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
// Grade-to-bucket mapping mirrors game.js:523-545 exactly. Custom routes
// (`content`) are candidates like any printed card.
function pickMilestoneRoutes(rng, content = null) {
  const beginner = [];
  const intermediate = [];
  const expert = [];

  for (const area of Object.keys(ROUTES)) {
    for (const route of routesForArea(content, area)) {
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
function initializeGearShop(rng, rules = null, content = null) {
  // Variant-only cards are dealt only when their rules variant is in play.
  // Custom gear (`content`) joins the rotation deck.
  const nonAccessGear = gearPool(content).filter(g => !ACCESS_CARDS.includes(g.name) && gearInGame(rules, g));
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

// ---- engine/engine.js ----
const __engine = (function () {
'use strict';
const { GEAR_SHOP, TRAINING_AREAS } = __data;
const { createRng } = __rng;
const { makeEmitter } = __telemetry;
const { ACCESS_CARDS, drawTopRopeStations, regularRoutePool } = __state;
const { findGear, gearPool, effectSum, describeAppliedClimbRules } = __content;
const { checkAreaAccess, canEnterSection, getPlayersInSection, canClimbTopRopeRoute, pickFreeBelayerStation, getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost, getGearPurchaseTimeCost, getSpendableXp, buildEffectRollArray, resolveClimbDice, computeClimbStats, applyDiceToRequirements, resolveClimbOutcome, computeClimbXp, getFailureEnduranceExtra, getSuccessEnduranceHeal, applySuccessHeal, describeClimbGearEffects, freeSoloCanAttempt, trainingSpec, trainingAllowed, trainingCap, usesGrit, trainingGritCost, gearFunds, gearPrice, payForGear, claimClimbGrit, dealRouteGrit, gearInGame, perRoundGrit, betaBoostAmount, roundStartTime, computeRestRecovery, applyLevelUpIfNeeded, bestRouteReaderShift, canUseStatShift, isWellFormedStatShift, MAX_STAT_SHIFT } = __helpers;
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
    const spec = trainingSpec(state.rules, area, char);
    if (char.timeRemaining < spec.time) continue;
    if (char.currentEndurance < spec.endurance) continue;
    if (!trainingAllowed(state.rules, char, area.stat, spec.gain)) continue;
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
      const timeCost = getEffectiveClimbTimeCost(char, route.time, route, false, area);
      const enduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance, area, false);
      if (char.timeRemaining < timeCost) continue;
      if (char.currentEndurance < enduranceCost) continue;
      // Free Solo "Life or Die" — must meet all base requirements.
      if (!freeSoloCanAttempt(char, route, area, false)) continue;
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
    const timeCost = getEffectiveClimbTimeCost(char, m.route.time, m.route, true, m.area);
    const enduranceCost = getEffectiveClimbEnduranceCost(char, m.route, m.route.endurance, m.area, true);
    if (char.timeRemaining < timeCost) continue;
    if (char.currentEndurance < enduranceCost) continue;
    if (!freeSoloCanAttempt(char, m.route, m.area, true)) continue;
    actions.push({ type: 'milestone', difficulty, area: m.area, routeName: m.route.name });
    // Rules variant: Versatility's stat shift on a Milestone — offered as a
    // variant of the attempt, like regular climbs.
    if (canUseStatShift(char, true)) {
      const shift = bestRouteReaderShift(char, m.route, m.area, state.attemptedRoutes[player.playerNum], true);
      if (shift) actions.push({ type: 'milestone', difficulty, area: m.area, routeName: m.route.name, shift });
    }
  }

  // Gear purchases: rotation slots + always-available access cards.
  // Prerequisites, level gate, spendable XP, time cost all checked here so
  // agents never see a "legal" action that the handler would reject.
  const gearTime = getGearPurchaseTimeCost(char);
  if (char.timeRemaining >= gearTime) {
    // Spendable XP, or Grit under the Grit-economy rules.
    const funds = gearFunds(state.rules, char);
    const owned = new Set(char.equipment);
    const buyable = [
      ...state.availableGear,
      ...GEAR_SHOP.filter(g => ACCESS_CARDS.includes(g.name)),
    ];
    for (const gear of buyable) {
      if (owned.has(gear.name)) continue;
      const cost = gearPrice(state.rules, char, gear);
      if (funds < cost) continue;
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
// current player right now, or null if it is legal. getLegalActions alone
// decides legality; this only explains a refusal, re-checking the same
// conditions. Returns { code, message, ...details } so a UI can word it its
// own way: `message` is a full player-facing sentence, `code` is one of
//   gameOver, noSuchRoute, noSuchMilestone, noSuchStation, noSuchGear,
//   unknownAction, unavailable,
//   alreadyAttempted, alreadyCompleted, alreadyOwned, notInShop,
//   needsGear {missing}, needsItems {missing}, needsLevel {level},
//   belayerTaken {belayer}, noFreeBelayer, sectionFull {occupants},
//   stationInUse {occupants}, trainingLimit {limit}, trainingCap {cap, stat},
//   notEnoughTime {need, have},
//   notEnoughEndurance {need, have}, notEnoughXp {need, have}, lifeOrDie,
//   shiftNotAllowed, shiftMalformed
// (occupants are playerNums).
function illegalActionReason(state, wanted) {
  const reason = (code, message, details = {}) => ({ code, message, ...details });
  if (state.gameEnded) return reason('gameOver', 'The game has ended.');
  const legal = getLegalActions(state);
  const match = findLegalAction(legal, wanted);
  const player = state.players[state.currentPlayerIndex];
  const char = player.character;
  if (match) {
    if (wanted.shift && !((match.type === 'climb' && canUseStatShift(char, false)) ||
        (match.type === 'milestone' && canUseStatShift(char, true)))) {
      return reason('shiftNotAllowed', match.type === 'milestone'
        ? 'Versatility can be used once per round, by the Route Reader, and not on a Milestone.'
        : 'Versatility can be used once per round, by the Route Reader, on a regular route.');
    }
    if (wanted.shift && !isWellFormedStatShift(wanted.shift)) {
      return reason('shiftMalformed', `A stat shift moves 1 to ${MAX_STAT_SHIFT} points between two different stats.`);
    }
    return null;
  }
  const notEnough = (code, what, need, have) =>
    reason(code, `Not enough ${what}: this costs ${need} and you have ${have}.`, { need, have });
  const occupantsOf = (section) => getPlayersInSection(state.players, section).map(p => p.playerNum);
  const lifeOrDie = () =>
    reason('lifeOrDie', 'Life or Die: Free Solo can only attempt routes whose base requirements your stats already meet.');
  const areaGate = (area) => {
    const access = checkAreaAccess(char, area);
    if (access.hasAccess) return null;
    return reason('needsGear', `You need ${access.missingItems.join(', ')} to climb ${AREA_LABELS[area] || area}.`,
      { missing: access.missingItems });
  };
  const sectionGate = (area) => {
    const sec = canEnterSection(area, player.playerNum, state);
    if (sec.canEnter) return null;
    return reason('sectionFull', `You can't climb here right now: ${sec.reason}.`, { occupants: occupantsOf(area) });
  };
  const costGate = (route, isMilestone, area) => {
    const t = getEffectiveClimbTimeCost(char, route.time, route, isMilestone, area);
    const e = getEffectiveClimbEnduranceCost(char, route, route.endurance, area, isMilestone);
    if (char.timeRemaining < t) return notEnough('notEnoughTime', 'time', t, char.timeRemaining);
    if (char.currentEndurance < e) return notEnough('notEnoughEndurance', 'endurance', e, char.currentEndurance);
    return null;
  };

  switch (wanted.type) {
    case 'climb': {
      const route = (state.availableRoutes[wanted.area] || []).find(r => r.name === wanted.routeName);
      if (!route) return reason('noSuchRoute', 'That route is not on the wall right now.');
      if (state.attemptedRoutes[player.playerNum]?.[`${wanted.area}:${route.name}`]) {
        return reason('alreadyAttempted', 'You have already attempted this route this round. Try it again next round.');
      }
      const gate = areaGate(wanted.area);
      if (gate) return gate;
      if (wanted.area === 'topRope') {
        if (!canClimbTopRopeRoute(state, player.playerNum, route)) {
          return reason('belayerTaken',
            `Belayer ${route.belayer + 1} is in use by another climber. Pick a route at a free belayer or wait for the wall to clear.`,
            { belayer: route.belayer });
        }
      } else {
        const full = sectionGate(wanted.area);
        if (full) return full;
      }
      return costGate(route, false, wanted.area) || (!freeSoloCanAttempt(char, route, wanted.area, false) ? lifeOrDie() : null)
        || reason('unavailable', 'That climb is not available right now.');
    }
    case 'milestone': {
      const m = state.milestoneRoutes[wanted.difficulty];
      if (!m) return reason('noSuchMilestone', 'There is no milestone route at that tier.');
      if (char.milestonesCompleted[wanted.difficulty]) {
        return reason('alreadyCompleted', `You have already completed the ${wanted.difficulty} milestone.`);
      }
      const gate = areaGate(m.area);
      if (gate) return gate;
      if (m.area === 'topRope') {
        if (pickFreeBelayerStation(state, player.playerNum) === null) {
          return reason('noFreeBelayer', 'Every belayer is in use right now. Wait for one to free up.');
        }
      } else {
        const full = sectionGate(m.area);
        if (full) return full;
      }
      return costGate(m.route, true, m.area) || (!freeSoloCanAttempt(char, m.route, m.area, true) ? lifeOrDie() : null)
        || reason('unavailable', 'That milestone is not available right now.');
    }
    case 'train': {
      const area = TRAINING_AREAS.find(a => a.name === wanted.areaName);
      if (!area) return reason('noSuchStation', 'There is no such training station.');
      const sec = canEnterSection(area.name, player.playerNum, state);
      if (!sec.canEnter) {
        return reason('stationInUse', `You can't train here right now: ${sec.reason}.`, { occupants: occupantsOf(area.name) });
      }
      // Costs and limits as the rules variant (state.rules) sets them.
      const spec = trainingSpec(state.rules, area, char);
      if (char.timeRemaining < spec.time) return notEnough('notEnoughTime', 'time', spec.time, char.timeRemaining);
      if (char.currentEndurance < spec.endurance) {
        return notEnough('notEnoughEndurance', 'endurance', spec.endurance, char.currentEndurance);
      }
      if (!trainingAllowed(state.rules, char, area.stat, spec.gain)) {
        const perRound = state.rules?.trainPerRound;
        if (perRound !== undefined && (char.trainedThisRound || 0) >= perRound) {
          return reason('trainingLimit', `You can train ${perRound} time${perRound === 1 ? '' : 's'} per round.`, { limit: perRound });
        }
        const gritCost = trainingGritCost(state.rules, char);
        if ((char.grit || 0) < gritCost) return notEnough('notEnoughGrit', 'Grit', gritCost, char.grit || 0);
        const cap = trainingCap(state.rules, char);
        return reason('trainingCap', `Training ${area.stat} is capped at +${cap} at Level ${char.level}.`, { cap, stat: area.stat });
      }
      return reason('unavailable', 'That training station is not available right now.');
    }
    case 'rest':
      return reason('notEnoughTime', 'Not enough time to rest.', { need: 1, have: char.timeRemaining });
    case 'buyGear': {
      const gear = findGear(state, wanted.gearName);
      if (!gear) return reason('noSuchGear', 'There is no such gear.');
      if (char.equipment.includes(gear.name)) return reason('alreadyOwned', `You already own ${gear.name}.`);
      const inShop = state.availableGear.some(g => g.name === gear.name) || ACCESS_CARDS.includes(gear.name);
      if (!inShop) return reason('notInShop', `${gear.name} is not in the shop right now.`);
      const missing = (gear.prerequisiteItems || []).filter(n => !char.equipment.includes(n));
      if (missing.length) return reason('needsItems', `${gear.name} requires ${missing.join(', ')} first.`, { missing });
      if (char.level < (gear.prerequisiteLevel || 1)) {
        return reason('needsLevel', `${gear.name} requires Level ${gear.prerequisiteLevel}.`, { level: gear.prerequisiteLevel });
      }
      const timeCost = getGearPurchaseTimeCost(char);
      if (char.timeRemaining < timeCost) return notEnough('notEnoughTime', 'time', timeCost, char.timeRemaining);
      const cost = gearPrice(state.rules, char, gear);
      if (usesGrit(state.rules)) {
        const have = gearFunds(state.rules, char);
        if (have < cost) return notEnough('notEnoughGrit', 'Grit', cost, have);
      }
      const spendable = getSpendableXp(char);
      if (!usesGrit(state.rules) && spendable < cost) {
        return reason('notEnoughXp', `Not enough spendable XP: ${gear.name} costs ${cost} and you have ${spendable} XP earned this level.`,
          { need: cost, have: spendable });
      }
      return reason('unavailable', `${gear.name} can't be bought right now.`);
    }
    case 'endTurn':
      return reason('unavailable', 'You cannot end your turn right now.');
    default:
      return reason('unknownAction', `Unknown action "${wanted.type}".`);
  }
}

// illegalActionReason's player-facing sentence, or null if `wanted` is legal.
function explainIllegalAction(state, wanted) {
  const r = illegalActionReason(state, wanted);
  return r ? r.message : null;
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

  // Snapshot this round's attempted-route marks before marking this climb.
  const attemptedBefore = { ...(s.attemptedRoutes[player.playerNum] || {}) };

  // 2. Mark the route as attempted this round (only for regular climbs —
  // milestones have no per-round attempt cap per game.js).
  if (!isMilestone) {
    state_attemptedRoutesMark(s, player.playerNum, area, route.name);
  }

  // The climb, for custom rules (content.js): which route, wall and kind.
  const climb = { route, area, isMilestone };

  // 3. Deduct time (character + gear modified).
  const timeCost = getEffectiveClimbTimeCost(char, route.time, route, isMilestone, area);
  const timeBefore = char.timeRemaining;
  char.timeRemaining -= timeCost;

  // 4. Deduct endurance — base cost may be reduced by gear (Body Tension Belt).
  // Iron Lung's failure penalty is added later, after success/fail is known.
  const enduranceBefore = char.currentEndurance;
  const baseEnduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance, area, isMilestone);
  char.currentEndurance -= baseEnduranceCost;

  // 5-6. Effective stats for this climb: base + training + gear + per-route
  //      gear, then Route Reader's Beta Boost (+3) and stat shift. Computed by
  //      the same read-only helper climbSendProbability uses, so previews and
  //      real climbs can't drift apart. Consuming the flags happens below.
  //      (Route attempted-marks don't feed gear bonuses in v0.7+ data, but use
  //      the pre-climb marks so a preview and the climb see identical input.)
  const effectiveStats = computeClimbStats(char, route, area, attemptedBefore, shift, isMilestone);
  // The Beta Boost is spent by this climb; the flag is cleared once the outcome
  // is known, because a rules variant can make Versatility depend on it.
  const boostSpent = !!char.betaBoostActive;
  if (boostSpent) {
    emitter.emit('ability_activated', {
      playerNum: player.playerNum,
      character: char.key,
      ability: 'Beta Boost',
      effect: `+${betaBoostAmount(char)} all stats for this climb`,
    });
  }

  // 6b. Route Reader stat shift (validated above): this climb only, once per round.
  if (shift) {
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
  //    Gear choices ("your choice") are made against effectiveStats.
  const effectArray = buildEffectRollArray(char, route, area, isMilestone);
  const diceTrace = [];
  const { dice, mentorIndex } = resolveClimbDice(() => rng.rollDie(6), effectArray, char, route, isMilestone, effectiveStats, diceTrace, area);
  const { requirements, appliedModifiers } = applyDiceToRequirements(char, route, effectArray, dice, { mentorIndex, area, isMilestone });

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
  const outcome = resolveClimbOutcome(char, effectiveStats, requirements, isMilestone, climb);
  if (boostSpent) char.betaBoostActive = false;
  const xpGained = computeClimbXp(char, route, outcome.success, climb);
  char.xp += xpGained;
  // Grit economy: a regular send takes the Grit on the card; a milestone
  // send pays its tier's reward.
  const gritGained = claimClimbGrit(s.rules, char, route, { isMilestone, success: outcome.success, tier: difficulty });

  // 9. Iron Lung failure penalty (Mental Anchor gear bypasses).
  let failPenalty = 0;
  if (!outcome.success) {
    failPenalty = getFailureEnduranceExtra(char, climb);
    char.currentEndurance -= failPenalty;
  }
  // 9b. Power Spotting: successful climbs heal endurance, up to maxEndurance.
  let healed = 0;
  if (outcome.success) {
    const beforeHeal = char.currentEndurance;
    char.currentEndurance = applySuccessHeal(char.currentEndurance, char.maxEndurance, getSuccessEnduranceHeal(char, climb));
    healed = char.currentEndurance - beforeHeal;
  }
  // Custom rules (the climber's and its custom gear's) that applied to this climb.
  const customRules = describeAppliedClimbRules(char, { scope: 'climb', route, area, isMilestone });
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
    ...(usesGrit(s.rules) ? { gritGained, gritAfter: char.grit } : {}),
    timeCost,
    enduranceCost: baseEnduranceCost + failPenalty,
    failPenalty,
    // Every gear effect that changed this climb (see describeClimbGearEffects).
    gearEffects: describeClimbGearEffects({
      char, route, effectRollArray: effectArray, diceTrace, appliedModifiers,
      success: outcome.success, timeCost, enduranceCost: baseEnduranceCost, healed, isMilestone, area,
    }),
    // Project Mode: every custom rule that applied, worded ({ source, ruleId, text }).
    ...(customRules.length ? { customRules } : {}),
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

  // Old Climbing Journal (gear) boosts every session by +N; a rules variant
  // (state.rules) may change the Time, Endurance or bonus.
  const spec = trainingSpec(s.rules, area, char);
  // Grit economy: a session costs Grit, except Training Partner's free one.
  const gritCost = trainingGritCost(s.rules, char);
  if (usesGrit(s.rules) && gritCost === 0 && !s.rules.characters?.[char.key]?.freeTraining) char.freeSessionUsed = true;
  if (gritCost) char.grit -= gritCost;
  char.location = area.name;
  char.timeRemaining -= spec.time;
  char.currentEndurance -= spec.endurance;
  const trainingBonus = spec.gain;
  char.trainingBonuses[area.stat] += trainingBonus;
  char.trainedThisRound = (char.trainedThisRound || 0) + 1;

  emitter.emit('train_action', {
    playerNum: player.playerNum,
    areaName: area.name,
    stat: area.stat,
    bonus: trainingBonus,
    totalTrainingBonusAfter: { ...char.trainingBonuses },
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -spec.time },
      endurance: { before: eBefore, after: char.currentEndurance, delta: -spec.endurance },
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

  // Route Reader's "Versatility" activates Beta Boost on rest, as does a
  // custom "Beta Boost on rest" rule (for the amount the rules grant). Other
  // characters ignore this flag.
  let betaActivated = false;
  if (char.key === 'routeReader') {
    char.betaBoostActive = true;
    betaActivated = true;
  } else {
    const boost = effectSum(char, 'betaBoostOnRest', { scope: 'rest' });
    if (boost > 0) {
      char.betaBoostActive = true;
      char.betaBoostAmount = boost;
      betaActivated = true;
    }
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
  const gear = findGear(s, action.gearName);
  if (!gear) throw new Error(`buyGear: no gear "${action.gearName}"`);

  // XP, or Grit under the Grit-economy rules (XP is then never spent).
  const effectiveCost = gearPrice(s.rules, char, gear);
  const timeCost = getGearPurchaseTimeCost(char);
  const xpBefore = char.xp;
  const timeBefore = char.timeRemaining;

  char.location = 'gearShop';
  char.timeRemaining -= timeCost;
  payForGear(s.rules, char, effectiveCost);
  char.equipment.push(gear.name);

  // Permanent stat & endurance effects from the purchased item.
  // Matches game.js:2299-2391 branch-by-branch.
  const gearApplied = {};
  // A custom card's rules now act for this climber (content.js activeRules);
  // its permanent max-Endurance rules apply at once, like Locking Carabiner.
  if (gear.custom) {
    char.gearRules = [...(char.gearRules || []), { gear: gear.name, hash: gear.rulesHash, rules: gear.rules }];
    const maxEnd = effectSum({ gearRules: [{ gear: gear.name, rules: gear.rules }] }, 'maxEndurance', { scope: 'setup' });
    if (maxEnd) {
      char.maxEndurance += maxEnd;
      gearApplied.maxEndurance = maxEnd;
    }
  }
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
    currency: usesGrit(s.rules) ? 'grit' : 'xp',
    nominalCost: gear.cost,
    timeCost,
    gearApplied,
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -timeCost },
      xp: { before: xpBefore, after: char.xp, delta: char.xp - xpBefore },
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
  const pool = gearPool(s.content).filter(g => !unavailable.has(g.name) && gearInGame(s.rules, g));

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
    ...(usesGrit(s.rules) ? { grit: char.grit } : {}),
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
    s.availableRoutes.leadClimbing = dealRouteGrit(s.rules, rng.pickN(regularRoutePool(s.milestoneRoutes, 'leadClimbing', s.content), 5));
    cleared = 'leadClimbing';
  } else if (s.routeClearingPosition === 1) {
    // Refresh all belayer stations together (2×belayerCount routes).
    s.availableRoutes.topRope = dealRouteGrit(s.rules, drawTopRopeStations(rng, s.belayerCount, regularRoutePool(s.milestoneRoutes, 'topRope', s.content)));
    cleared = 'topRope';
  } else {
    s.availableRoutes.bouldering = dealRouteGrit(s.rules, rng.pickN(regularRoutePool(s.milestoneRoutes, 'bouldering', s.content), 5));
    cleared = 'bouldering';
  }
  s.routeClearingPosition = (s.routeClearingPosition + 1) % 3;

  // Reset per-player per-round state. Training bonuses and gear bonuses
  // persist across rounds — only time, ability-used flag, location, and the
  // belayer-station assignment reset. The route-clearing rotation moves every
  // player back to the Lobby automatically (RuleModifications 2026-06-27).
  for (const p of s.players) {
    const c = p.character;
    // 10 Time, plus Approach Shoes and custom "Time each round" rules.
    c.timeRemaining = roundStartTime(c);
    c.abilityUsed = false;
    c.trainedThisRound = 0;
    c.freeSessionUsed = false;
    // Grit economy: the per-round allowance, plus custom "Grit each round" rules.
    if (usesGrit(s.rules)) c.grit = (c.grit || 0) + perRoundGrit(s.rules, c.key) + effectSum(c, 'gritPerRound', { scope: 'round' });
    c.location = 'lobby';
    c.belayerStation = null;
  }

  // Wipe per-round attempted-routes tracker.
  for (const k of Object.keys(s.attemptedRoutes)) s.attemptedRoutes[k] = {};

  const newRound = endedRound + 1;

  // RuleModifications (2026-06-27): belayer count is fixed at N − 1 from round 1
  // — no time-based unlock ramp.

  s.round = newRound;
  // The climber with the most Time opens the round (ties → seat order), the
  // same rule as every other turn. v0.7.0 always started seat 1, even when
  // someone else had 11 Time from Approach Shoes.
  s.currentPlayerIndex = firstToActIndex(s.players);

  emitter.emit('round_end', { round: endedRound, routesCleared: cleared, nextRound: newRound });
  emitter.emit('round_start', { round: newRound, routeClearingPosition: s.routeClearingPosition });

  // Kick off the first turn of the new round.
  const first = s.players[s.currentPlayerIndex];
  emitter.emit('turn_start', {
    round: newRound,
    playerNum: first.playerNum,
    timeRemaining: first.character.timeRemaining,
    endurance: first.character.currentEndurance,
  });
}

// Index of the player who acts first: most Time remaining, ties to seat order.
function firstToActIndex(players) {
  const maxTime = Math.max(...players.map(p => p.character.timeRemaining));
  return players.findIndex(p => p.character.timeRemaining === maxTime);
}

return { getLegalActions, findLegalAction, illegalActionReason, explainIllegalAction, applyAction, isTerminal, firstToActIndex };
})();

// ---- engine/stats.js ----
const __stats = (function () {
'use strict';
const { usesGrit } = __helpers;
const { routesForArea } = __content;
// End-of-game statistics — the numbers behind the post-game summary.
//
//   summarizeGame(state) → plain JSON object (schema GAME_SUMMARY_SCHEMA)
//
// Read-only and derived ONLY from state.events (the engine's complete event
// log) plus the final players, so local play, online play (the server sends
// clients the full state) and offline analysis all get identical numbers from
// one function. The UI only lays these numbers out; it never counts events
// itself.
//
// "step" is the number of actions taken so far in the whole game (every
// action_chosen event is one step), so a progression chart can place a
// level-up or a milestone send exactly where it happened; roundStarts maps
// steps back to rounds for the axis.




const GAME_SUMMARY_SCHEMA = 'aia-game-summary/1';

const SUMMARY_STATS = ['strength', 'technique', 'focus', 'flexibility'];
const SUMMARY_TIERS = ['beginner', 'intermediate', 'expert'];
// Where a climber spent their Time, in board order: the three walls, the
// milestone projects (a separate board section, whatever wall they hang on),
// the training floor, the gear shop and the rest area.
const SUMMARY_AREAS = ['bouldering', 'topRope', 'leadClimbing', 'milestone', 'training', 'gearShop', 'rest'];

// A route's difficulty for "hardest send": the sum of its printed stat
// requirements (V-grades and YDS grades can't be compared with each other).
// Custom routes (state.content) count like printed ones.
function routeDifficulty(state, area, routeName) {
  const route = (routesForArea(state.content, area) || []).find(r => r.name === routeName);
  return route ? SUMMARY_STATS.reduce((sum, k) => sum + (route[k] || 0), 0) : 0;
}

function newPlayerSummary(p) {
  const c = p.character;
  const timeByArea = {};
  for (const a of SUMMARY_AREAS) timeByArea[a] = 0;
  const training = {};
  for (const s of SUMMARY_STATS) training[s] = { sessions: 0, gain: 0 };
  const climbsByArea = {};
  for (const a of ['bouldering', 'topRope', 'leadClimbing']) climbsByArea[a] = { attempts: 0, sends: 0 };
  return {
    playerNum: p.playerNum,
    characterKey: c.key,
    characterName: c.name,
    turns: 0,
    actions: 0,
    climbs: { attempts: 0, sends: 0, falls: 0, byArea: climbsByArea },
    milestoneAttempts: { beginner: 0, intermediate: 0, expert: 0 },
    milestones: [],              // { tier, step, round, routeName, area, grade }, in send order
    hardestSend: null,           // { routeName, grade, area, isMilestone, round }
    training,
    trainingSessions: 0,
    rests: 0,
    enduranceRecovered: 0,
    turnsEndedEarly: 0,          // endTurn with Time still left
    timeUnused: 0,               // Time given up by ending a turn early
    timeByArea,
    favouriteArea: null,
    gear: [],                    // { name, round, cost, currency }
    spentOnGear: { xp: 0, grit: 0 },
    xpEarned: 0,
    gritEarned: 0,
    levelUps: [],                // { level, step, round }
    progression: [{ step: 0, round: 1, level: 1, xp: 0 }],
    final: null,
  };
}

function summarizeGame(state) {
  const players = {};
  const order = [];
  for (const p of state.players) {
    players[p.playerNum] = newPlayerSummary(p);
    order.push(p.playerNum);
  }
  const roundStarts = [{ round: 1, step: 0 }];
  let step = 0;
  let round = 1;
  const bestDifficulty = {};     // playerNum → difficulty of hardestSend

  for (const e of state.events || []) {
    const p = e.payload || {};
    switch (e.type) {
      case 'action_chosen':
        step++;
        round = p.round;
        if (players[p.playerNum]) players[p.playerNum].actions++;
        break;
      case 'turn_start':
        if (players[p.playerNum]) players[p.playerNum].turns++;
        break;
      case 'round_start':
        round = p.round;
        roundStarts.push({ round: p.round, step });
        break;
      case 'climb_resolved': {
        const s = players[p.playerNum];
        if (!s) break;
        const time = -(p.resourcesDelta?.time?.delta ?? -(p.timeCost || 0));
        if (p.isMilestone) {
          s.timeByArea.milestone += time;
          if (s.milestoneAttempts[p.difficulty] !== undefined) s.milestoneAttempts[p.difficulty]++;
          if (p.success) {
            s.milestones.push({ tier: p.difficulty, step, round, routeName: p.routeName, area: p.area, grade: p.grade });
          }
        } else {
          s.timeByArea[p.area] = (s.timeByArea[p.area] || 0) + time;
          s.climbs.attempts++;
          if (s.climbs.byArea[p.area]) s.climbs.byArea[p.area].attempts++;
          if (p.success) {
            s.climbs.sends++;
            if (s.climbs.byArea[p.area]) s.climbs.byArea[p.area].sends++;
          } else {
            s.climbs.falls++;
          }
        }
        if (p.success) {
          const d = routeDifficulty(state, p.area, p.routeName);
          if (s.hardestSend === null || d > bestDifficulty[p.playerNum]) {
            bestDifficulty[p.playerNum] = d;
            s.hardestSend = { routeName: p.routeName, grade: p.grade, area: p.area, isMilestone: !!p.isMilestone, round };
          }
        }
        s.xpEarned += p.xpGained || 0;
        s.gritEarned += p.gritGained || 0;
        break;
      }
      case 'train_action': {
        const s = players[p.playerNum];
        if (!s) break;
        s.trainingSessions++;
        if (s.training[p.stat]) {
          s.training[p.stat].sessions++;
          s.training[p.stat].gain += p.bonus || 0;
        }
        s.timeByArea.training += -(p.resourcesDelta?.time?.delta || 0);
        break;
      }
      case 'rest_action': {
        const s = players[p.playerNum];
        if (!s) break;
        s.rests++;
        s.enduranceRecovered += Math.max(0, p.enduranceRecovered || 0);
        s.timeByArea.rest += -(p.resourcesDelta?.time?.delta || 0);
        break;
      }
      case 'gear_purchased': {
        const s = players[p.playerNum];
        if (!s) break;
        const currency = p.currency === 'grit' ? 'grit' : 'xp';
        s.gear.push({ name: p.gearName, round, cost: p.cost, currency });
        s.spentOnGear[currency] += p.cost || 0;
        s.timeByArea.gearShop += p.timeCost || 0;
        break;
      }
      case 'end_turn_chosen': {
        const s = players[p.playerNum];
        if (!s) break;
        if (p.timeSurrendered > 0) {
          s.turnsEndedEarly++;
          s.timeUnused += p.timeSurrendered;
        }
        break;
      }
      case 'level_up': {
        const s = players[p.playerNum];
        if (s) s.levelUps.push({ level: p.newLevel, step, round });
        break;
      }
      case 'resource_update': {
        const s = players[p.playerNum];
        if (!s) break;
        const last = s.progression[s.progression.length - 1];
        if (p.level !== last.level || p.xp !== last.xp) {
          s.progression.push({ step, round, level: p.level, xp: p.xp });
        }
        break;
      }
      default:
        break;
    }
  }

  for (const p of state.players) {
    const s = players[p.playerNum];
    const c = p.character;
    let best = null;
    for (const a of SUMMARY_AREAS) if (s.timeByArea[a] > 0 && (best === null || s.timeByArea[a] > s.timeByArea[best])) best = a;
    s.favouriteArea = best;
    s.final = {
      level: c.level,
      xp: c.xp,
      ...(typeof c.grit === 'number' ? { grit: c.grit } : {}),
      maxEndurance: c.maxEndurance,
      milestonesCompleted: SUMMARY_TIERS.filter(t => c.milestonesCompleted && c.milestonesCompleted[t]).length,
      stats: Object.fromEntries(SUMMARY_STATS.map(k => [k,
        (c.stats?.[k] || 0) + (c.trainingBonuses?.[k] || 0) + (c.gearBonuses?.[k] || 0)])),
      equipment: [...(c.equipment || [])],
    };
    // Close each line at the last step so every player's chart spans the game.
    const last = s.progression[s.progression.length - 1];
    if (last.step < step) s.progression.push({ step, round, level: last.level, xp: last.xp });
  }

  // Final standings: the winner, then milestones sent, Level, XP, seat order.
  const standings = order.slice().sort((a, b) => {
    const A = players[a];
    const B = players[b];
    return (b === state.winner) - (a === state.winner)
      || B.final.milestonesCompleted - A.final.milestonesCompleted
      || B.final.level - A.final.level
      || B.final.xp - A.final.xp
      || a - b;
  });

  return {
    schema: GAME_SUMMARY_SCHEMA,
    engineVersion: state.engineVersion,
    seed: state.seed,
    ended: !!state.gameEnded,
    winner: state.winner ?? null,
    endReason: state.endReason || null,
    rounds: state.round,
    totalSteps: step,
    currency: usesGrit(state.rules) ? 'grit' : 'xp',
    milestoneRoutes: Object.fromEntries(SUMMARY_TIERS.map(t => {
      const m = state.milestoneRoutes && state.milestoneRoutes[t];
      return [t, m ? { area: m.area, routeName: m.route.name, grade: m.route.grade } : null];
    })),
    roundStarts,
    standings,
    players: order.map(n => players[n]),
  };
}

return { GAME_SUMMARY_SCHEMA, SUMMARY_AREAS, summarizeGame };
})();

// ---- engine/match-record.js ----
const __match_record = (function () {
'use strict';
const { summarizeGame } = __stats;
// Match records — one compact, anonymous JSON record per finished game, for
// the designer's telemetry dashboard (dashboard.html).
//
//   buildMatchRecord(state, meta) → plain JSON object (schema MATCH_RECORD_SCHEMA)
//   validateMatchRecord(record)   → null when the record is acceptable, else a reason
//
// Built from summarizeGame (stats.js) plus a few per-card counts from the
// engine's event log, so local play (the browser bundle), online play (the
// GameRoom, party/game.js) and the bot simulations record identical numbers for the
// same game. A record never holds usernames or anything typed by a player:
// seats are identified by character and by who controlled them (a human or a
// bot level).
//
// meta (all optional; supplied by whoever recorded the game):
//   id         unique id for this game; the telemetry server de-duplicates on it
//   mode       'local' | 'online' | 'sim'
//   startedAt  wall-clock ms when the game started
//   finishedAt wall-clock ms when the game ended
//   seats      per seat, in player order: { controller: 'human' | 'bot', botLevel }



const MATCH_RECORD_SCHEMA = 'aia-match-record/1';
const MATCH_MODES = ['local', 'online', 'sim'];

const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TIERS = ['beginner', 'intermediate', 'expert'];

// The stat a climber trained hardest (most bonus gained; ties go to the stat
// listed first), or null if they never trained.
function trainingFocus(training) {
  let best = null;
  for (const k of STATS) {
    if (training[k].gain > 0 && (best === null || training[k].gain > training[best].gain)) best = k;
  }
  return best;
}

// Per player: how often each regular route card was attempted and sent, and how
// many climbs each gear card's effect actually changed (climb_resolved
// gearEffects; one entry may name several cards, comma-separated).
function cardUsage(state) {
  const byPlayer = {};
  const forPlayer = (n) => (byPlayer[n] ||= { routes: new Map(), gearTriggers: {} });
  for (const e of state.events || []) {
    if (e.type !== 'climb_resolved') continue;
    const p = e.payload || {};
    const u = forPlayer(p.playerNum);
    if (!p.isMilestone) {
      const key = `${p.area}|${p.routeName}`;
      const r = u.routes.get(key) || { area: p.area, routeName: p.routeName, grade: p.grade, attempts: 0, sends: 0 };
      r.attempts++;
      if (p.success) r.sends++;
      u.routes.set(key, r);
    }
    for (const g of p.gearEffects || []) {
      for (const name of String(g.gear || '').split(',').map(s => s.trim()).filter(Boolean)) {
        u.gearTriggers[name] = (u.gearTriggers[name] || 0) + 1;
      }
    }
  }
  return byPlayer;
}

function buildMatchRecord(state, meta = {}) {
  const sum = summarizeGame(state);
  const usage = cardUsage(state);
  const placement = {};
  sum.standings.forEach((n, i) => { placement[n] = i + 1; });
  const seats = meta.seats || [];
  const startedAt = Number.isFinite(meta.startedAt) ? meta.startedAt : null;
  const finishedAt = Number.isFinite(meta.finishedAt) ? meta.finishedAt : null;
  const winner = sum.players.find(p => p.playerNum === sum.winner);

  return {
    schema: MATCH_RECORD_SCHEMA,
    id: meta.id || null,
    mode: MATCH_MODES.includes(meta.mode) ? meta.mode : 'local',
    engineVersion: sum.engineVersion,
    startedAt,
    finishedAt,
    durationMs: startedAt !== null && finishedAt !== null ? Math.max(0, finishedAt - startedAt) : null,
    seed: sum.seed,
    playerCount: sum.players.length,
    ended: sum.ended,
    endReason: sum.endReason,
    winner: sum.winner,
    winnerCharacter: winner ? winner.characterKey : null,
    rounds: sum.rounds,
    totalSteps: sum.totalSteps,
    currency: sum.currency,
    milestoneRoutes: sum.milestoneRoutes,
    players: sum.players.map((p, i) => {
      const seat = seats[i] || {};
      const controller = seat.controller === 'bot' ? 'bot' : 'human';
      const u = usage[p.playerNum] || { routes: new Map(), gearTriggers: {} };
      return {
        seat: p.playerNum,
        characterKey: p.characterKey,
        controller,
        botLevel: controller === 'bot' ? (seat.botLevel || null) : null,
        won: p.playerNum === sum.winner,
        placement: placement[p.playerNum],
        final: p.final,
        milestones: p.milestones.map(m => ({ tier: m.tier, round: m.round, routeName: m.routeName, area: m.area, grade: m.grade })),
        milestoneAttempts: p.milestoneAttempts,
        climbs: p.climbs,
        routes: [...u.routes.values()],
        training: p.training,
        trainingFocus: trainingFocus(p.training),
        gear: p.gear,
        gearTriggers: u.gearTriggers,
        spentOnGear: p.spentOnGear,
        xpEarned: p.xpEarned,
        gritEarned: p.gritEarned,
        levelUps: p.levelUps.map(l => ({ level: l.level, round: l.round })),
        timeByArea: p.timeByArea,
        rests: p.rests,
        turns: p.turns,
        actions: p.actions,
        turnsEndedEarly: p.turnsEndedEarly,
        timeUnused: p.timeUnused,
      };
    }),
  };
}

// The telemetry server accepts records from any browser, so it checks the
// shape before storing one. Returns null if the record is acceptable,
// otherwise a short reason. `knownCharacters` is the set of character keys.
function validateMatchRecord(r, knownCharacters) {
  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'not an object';
  if (r.schema !== MATCH_RECORD_SCHEMA) return 'unknown schema';
  if (typeof r.id !== 'string' || !/^[\w.:-]{6,100}$/.test(r.id)) return 'bad id';
  if (!MATCH_MODES.includes(r.mode)) return 'bad mode';
  if (typeof r.engineVersion !== 'string' || r.engineVersion.length > 20) return 'bad engineVersion';
  if (!isInt(r.playerCount, 1, 4) || !Array.isArray(r.players) || r.players.length !== r.playerCount) return 'bad players';
  if (!isInt(r.rounds, 1, 1000)) return 'bad rounds';
  if (r.winner !== null && !r.players.some(p => p.seat === r.winner)) return 'bad winner';
  for (const p of r.players) {
    if (!p || typeof p !== 'object') return 'bad player';
    if (!knownCharacters.has(p.characterKey)) return 'unknown character';
    if (!['human', 'bot'].includes(p.controller)) return 'bad controller';
    if (!isInt(p.placement, 1, 4) || !p.final || !isInt(p.final.level, 1, 100)) return 'bad player result';
    if (!isInt(p.final.milestonesCompleted, 0, TIERS.length)) return 'bad milestones';
    if (!Array.isArray(p.gear) || !Array.isArray(p.routes) || !p.training || !p.timeByArea) return 'bad player detail';
  }
  return null;
}

return { MATCH_RECORD_SCHEMA, MATCH_MODES, buildMatchRecord, validateMatchRecord };
})();

return {
  createRng: __rng.createRng,
  deriveSeed: __rng.deriveSeed,
  makeEmitter: __telemetry.makeEmitter,
  ENGINE_VERSION: __version.ENGINE_VERSION,
  ENGINE_VERSION_STRING: __version.ENGINE_VERSION_STRING,
  CONTENT_SCHEMA: __content.CONTENT_SCHEMA,
  SUBMISSION_SCHEMA: __content.SUBMISSION_SCHEMA,
  CONTENT_KINDS: __content.CONTENT_KINDS,
  STATS: __content.STATS,
  AREAS: __content.AREAS,
  ROUTE_VOCAB: __content.ROUTE_VOCAB,
  GEAR_CATEGORIES: __content.GEAR_CATEGORIES,
  PORTRAITS: __content.PORTRAITS,
  ACCENTS: __content.ACCENTS,
  LIMITS: __content.LIMITS,
  gradeBandOf: __content.gradeBandOf,
  CONDITIONS: __content.CONDITIONS,
  EFFECTS: __content.EFFECTS,
  SCOPES: __content.SCOPES,
  describeCondition: __content.describeCondition,
  describeEffect: __content.describeEffect,
  describeRule: __content.describeRule,
  describeRules: __content.describeRules,
  compileRules: __content.compileRules,
  rulesHash: __content.rulesHash,
  slugKey: __content.slugKey,
  CHARACTER_LIMITS: __content.CHARACTER_LIMITS,
  compileCharacter: __content.compileCharacter,
  ROUTE_LIMITS: __content.ROUTE_LIMITS,
  compileRoute: __content.compileRoute,
  GEAR_LIMITS: __content.GEAR_LIMITS,
  compileGear: __content.compileGear,
  emptyContentPack: __content.emptyContentPack,
  hasCustomContent: __content.hasCustomContent,
  compileContentPack: __content.compileContentPack,
  characterTemplate: __content.characterTemplate,
  routesForArea: __content.routesForArea,
  allRoutes: __content.allRoutes,
  gearPool: __content.gearPool,
  findGear: __content.findGear,
  activeRules: __content.activeRules,
  rulesSignature: __content.rulesSignature,
  ruleEffects: __content.ruleEffects,
  effectSum: __content.effectSum,
  hasEffect: __content.hasEffect,
  describeAppliedClimbRules: __content.describeAppliedClimbRules,
  SUBMISSION_STATUSES: __content.SUBMISSION_STATUSES,
  validateSubmission: __content.validateSubmission,
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
  computeClimbStats: __helpers.computeClimbStats,
  betaBoostAmount: __helpers.betaBoostAmount,
  DEFAULT_ABILITY: __helpers.DEFAULT_ABILITY,
  abilityParam: __helpers.abilityParam,
  passRule: __helpers.passRule,
  getEffectiveClimbTimeCost: __helpers.getEffectiveClimbTimeCost,
  getEffectiveClimbEnduranceCost: __helpers.getEffectiveClimbEnduranceCost,
  getXpMultiplier: __helpers.getXpMultiplier,
  getGearPurchaseTimeCost: __helpers.getGearPurchaseTimeCost,
  getEffectiveGearCost: __helpers.getEffectiveGearCost,
  getSpendableXp: __helpers.getSpendableXp,
  buildEffectRollArray: __helpers.buildEffectRollArray,
  rollClimbDice: __helpers.rollClimbDice,
  resolveClimbDice: __helpers.resolveClimbDice,
  climbSendProbability: __helpers.climbSendProbability,
  applyDiceToRequirements: __helpers.applyDiceToRequirements,
  resolveClimbOutcome: __helpers.resolveClimbOutcome,
  computeClimbXp: __helpers.computeClimbXp,
  getFailureEnduranceExtra: __helpers.getFailureEnduranceExtra,
  getSuccessEnduranceHeal: __helpers.getSuccessEnduranceHeal,
  applySuccessHeal: __helpers.applySuccessHeal,
  CLIMB_GEAR_EFFECT_KINDS: __helpers.CLIMB_GEAR_EFFECT_KINDS,
  describeClimbGearEffects: __helpers.describeClimbGearEffects,
  getTrainingBonusBoost: __helpers.getTrainingBonusBoost,
  trainingSpec: __helpers.trainingSpec,
  trainingCap: __helpers.trainingCap,
  trainingAllowed: __helpers.trainingAllowed,
  GRIT_RULES: __helpers.GRIT_RULES,
  perRoundGrit: __helpers.perRoundGrit,
  startingGrit: __helpers.startingGrit,
  usesGrit: __helpers.usesGrit,
  gradeBand: __helpers.gradeBand,
  routeGritValue: __helpers.routeGritValue,
  dealRouteGrit: __helpers.dealRouteGrit,
  milestoneGritReward: __helpers.milestoneGritReward,
  trainingGritCost: __helpers.trainingGritCost,
  gearPrice: __helpers.gearPrice,
  gearFunds: __helpers.gearFunds,
  payForGear: __helpers.payForGear,
  gearInGame: __helpers.gearInGame,
  claimClimbGrit: __helpers.claimClimbGrit,
  freeSoloCanAttempt: __helpers.freeSoloCanAttempt,
  applyBetaBoostIfActive: __helpers.applyBetaBoostIfActive,
  MAX_STAT_SHIFT: __helpers.MAX_STAT_SHIFT,
  isWellFormedStatShift: __helpers.isWellFormedStatShift,
  canUseStatShift: __helpers.canUseStatShift,
  applyStatShiftToStats: __helpers.applyStatShiftToStats,
  bestRouteReaderShift: __helpers.bestRouteReaderShift,
  computeRestRecovery: __helpers.computeRestRecovery,
  getGearMaxEnduranceBonus: __helpers.getGearMaxEnduranceBonus,
  roundStartTime: __helpers.roundStartTime,
  applyLevelUpIfNeeded: __helpers.applyLevelUpIfNeeded,
  dispatchToolCall: __helpers.dispatchToolCall,
  belayerCountFor: __state.belayerCountFor,
  regularRoutePool: __state.regularRoutePool,
  drawTopRopeStations: __state.drawTopRopeStations,
  createGame: __state.createGame,
  ACCESS_CARDS: __state.ACCESS_CARDS,
  getLegalActions: __engine.getLegalActions,
  findLegalAction: __engine.findLegalAction,
  illegalActionReason: __engine.illegalActionReason,
  explainIllegalAction: __engine.explainIllegalAction,
  applyAction: __engine.applyAction,
  isTerminal: __engine.isTerminal,
  firstToActIndex: __engine.firstToActIndex,
  GAME_SUMMARY_SCHEMA: __stats.GAME_SUMMARY_SCHEMA,
  SUMMARY_AREAS: __stats.SUMMARY_AREAS,
  summarizeGame: __stats.summarizeGame,
  MATCH_RECORD_SCHEMA: __match_record.MATCH_RECORD_SCHEMA,
  MATCH_MODES: __match_record.MATCH_MODES,
  buildMatchRecord: __match_record.buildMatchRecord,
  validateMatchRecord: __match_record.validateMatchRecord,
};
})();
