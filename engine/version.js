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
//   - Grit on custom cards (2026-10-13): a custom route may print its own
//     Grit (printedGrit; routeGritValue honours it, else the grade's usual
//     amount), and a custom climber prints starting Grit and Grit each round
//     (gritStart / gritPerRound, added at setup and every round end).
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
export const ENGINE_VERSION = { major: 1, minor: 2, patch: 0 };
export const ENGINE_VERSION_STRING = `${ENGINE_VERSION.major}.${ENGINE_VERSION.minor}.${ENGINE_VERSION.patch}`;
