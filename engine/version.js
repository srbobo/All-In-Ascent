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
//   GAME_VERSION '0.6.0' to match this engine, and it now implements the same
//   Scenario 2C milestone selection (it previously used the old un-constrained
//   v0.3.x random pick). engine/data.js is no longer hand-synced: it is
//   auto-generated from game.js's GAME DATA section by
//   `node engine/build-data.js` (run by the test/playtest scripts; standalone
//   `npm run data:build` / `data:check`). Tooling/parity only — no rules change.
//
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
export const ENGINE_VERSION = { major: 0, minor: 6, patch: 0 };
export const ENGINE_VERSION_STRING = `${ENGINE_VERSION.major}.${ENGINE_VERSION.minor}.${ENGINE_VERSION.patch}`;
