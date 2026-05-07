# All In Ascent — Playtest Pipeline Plan

A reviewable record of: the original plan, the decisions that shaped it, what got built, and what's outstanding. Operational/how-to-run docs live in [PLAYTEST.md](PLAYTEST.md).

Date approved: 2026-04-21.
Plan author: Claude Opus 4.7 (1M context).
Stakeholder: project owner (Sam).

---

## 1. Goal

Stand up a sustainable, repeatable simulation pipeline for the board game **All In Ascent** that:

- Runs many games unattended on a MacBook M5 (32 GB RAM) — no cloud, no extra hardware.
- Uses local LLMs (and rule-based baselines) as the players.
- Tests every player count (2, 3, 4) and a sampled cross-section of character matchups.
- Captures fine-grained structured telemetry from every dice roll and decision so balance issues can be spotted, replayed, and aggregated.
- Survives game iteration — when balance numbers change, re-run the same one-command pipeline and compare.

---

## 2. Scope and constraints (resolved 2026-04-21)

| Topic | Decision |
|---|---|
| Reps per matchup | **7** (down from 20 in initial proposal) |
| Duplicate characters | **Not allowed** within a single game |
| Hardware | **M5 only**, no bigger machines |
| Creativity reward | **Yes** — model is prompted toward ability use; report measures and ranks it |
| Multi-model games | **Yes**, **max 2 models** mixable across seats |
| Fallback policy | Engine-canonical (highest-XP legal climb, else end turn) |
| Re-run trigger | Major or minor engine version bump (semver) |
| Visualization | **Interactive dashboard** (Plotly, single static HTML, no install) |
| Telemetry detail | **High granularity**, no sampling |
| Interpretation help | Top-5 callouts: closest, longest, most one-sided, most creative, biggest upsets |
| Source of truth | **`game.js`** is canonical for all game data; CSVs are not authoritative |

---

## 3. The 7-phase plan (as proposed and accepted)

### Phase 1 — AI model shortlist
Benchmark Ollama-served local models on a fixed 20-decision benchmark. Selection criteria: ≥98% legal-action rate, <5 s/turn latency, strategic coherence, JSON compliance. Shortlist:
- `qwen2.5:14b-instruct`, `qwen2.5:7b-instruct`, `llama3.1:8b-instruct`, `mistral-nemo:12b-instruct`, `qwen2.5:32b-instruct-q4_K_M`, `phi3.5:3.8b-mini-instruct-q4_K_M`.

Top 2 selected; both retained for the matrix to distinguish "character is broken" from "this model just likes that character."

### Phase 2 — Headless engine
Refactor [game.js](game.js) into a pure logic engine (DOM-free, deterministic, Node-runnable) without breaking the existing browser game. Surface:
- `createGame({seed, characterKeys}) → {state, events}`
- `getLegalActions(state) → Action[]`
- `applyAction(state, action) → {state, events}`
- `isTerminal(state) → {done, winner, reason}`

Seeded RNG (mulberry32) replaces `Math.random()` so games are reproducible.

### Phase 3 — Telemetry rewrite
Replace the existing 20-entry text log with a structured event stream. Events: `game_start`, `turn_start`, `action_chosen`, `dice_rolled`, `climb_resolved`, `milestone_progress`, `level_up`, `gear_purchased`, `train_action`, `rest_action`, `belayer_unlocked`, `round_end`, `game_end`, periodic `resource_update` snapshots, plus `ability_activated` for creativity tracking. JSONL on disk, one line per event. Same emitter feeds both the file writer and (eventually) the browser UI.

### Phase 4 — Agent harness
Three agents implementing a shared interface:
- **random** — uniform pick from legal actions; control floor.
- **heuristic** — rule-based: milestone-if-likely → access cards → best safe climb → rest → trainer → train weakest stat → risky climb → end turn.
- **ollama:`<model>`** — JSON-mode LLM call; system prompt frames the character and rewards creativity; user prompt enumerates legal actions and current state.

Safety rails: per-turn timeout, JSON-schema validation, action-index bounds check, fallback to engine-canonical policy on any failure (counted as `fallbackCount` for the run).

### Phase 5 — Simulation orchestrator
Config-driven matrix runner. Generates the cross-product of `(player_count, character_combo, agent_assignment)`, runs each `repetitions` times with deterministic seeds, writes one JSONL per game. Bounded parallelism (default 2 on the M5). Resumable — re-running picks up where it left off.

Agent-assignment patterns generated per character combo: all-A, all-B, mixed (seat *i* = agents[*i* % 2]), and one all-baseline run per declared baseline.

### Phase 6 — Analysis & dashboard
One Node script reads the JSONL files, aggregates, and writes a self-contained HTML report (Plotly via CDN). Sections:
1. Run summary header with fallback-rate warning.
2. **Interpretation callouts** — top 5 closest finishes / longest / most one-sided / most creative wins / biggest upsets, each with the JSONL filename for replay.
3. Win-rate tables and bar charts by character and by agent.
4. End-reasons pie chart.
5. Game-length histogram.
6. Character matchup heatmap.
7. Average milestones-completed per character.
8. Ability-uses-per-game box plot (creativity proxy).
9. Gear purchase frequency (dead-gear detection).
10. Per-agent fallback rate.

### Phase 7 — Repeatability
One command — `npm run playtest` — does: tests → matrix → report → open. Engine version constant in `engine/version.js` lets the report flag baseline-invalidating changes. Smoke variant `npm run playtest:smoke` is the ~5-second pre-flight check.

---

## 4. What got built

| Phase | Status | Key files |
|---|---|---|
| 1 — Model shortlist | Code-ready, **not benchmarked** (requires Ollama install) | [sim/agents/ollama.js](sim/agents/ollama.js) |
| 2 — Headless engine | **Done.** 149 unit-test assertions pass. | [engine/state.js](engine/state.js), [engine/helpers.js](engine/helpers.js), [engine/engine.js](engine/engine.js), [engine/rng.js](engine/rng.js) |
| 3 — Telemetry | **Done.** Structured emitter, full event stream, JSONL output. | [engine/telemetry.js](engine/telemetry.js), event emissions in [engine/engine.js](engine/engine.js) |
| 4 — Agents | **Done** for random + heuristic; **code-ready** for ollama (untested without Ollama installed) | [sim/agents/random.js](sim/agents/random.js), [sim/agents/heuristic.js](sim/agents/heuristic.js), [sim/agents/ollama.js](sim/agents/ollama.js) |
| 5 — Orchestrator | **Done.** Matrix expansion, parallelism, resumability, manifest, summary. | [sim/run-matrix.js](sim/run-matrix.js), [sim/run-one-game.js](sim/run-one-game.js), [sim/replay.js](sim/replay.js), [sim/config.json](sim/config.json), [sim/config.smoke.json](sim/config.smoke.json) |
| 6 — Dashboard | **Done.** Single HTML, Plotly via CDN, all 5 callout sections, 8 charts. | [analysis/build-report.js](analysis/build-report.js) |
| 7 — Repeatability | **Done.** `npm run playtest` and `npm run playtest:smoke` chain everything. Cross-run diff tool compares two result dirs side-by-side with engine-version compatibility check. | [package.json](package.json), [PLAYTEST.md](PLAYTEST.md), [analysis/diff-runs.js](analysis/diff-runs.js) |

End-to-end smoke runs in ~6 seconds (12 games + 8-chart report).

The original browser game ([index.html](index.html) + [game.js](game.js)) was **not modified** — it still plays for human users exactly as before. The headless engine mirrors `game.js` data via `engine/data.js`.

---

## 5. Findings from the first runs

**Heuristic-only matrix (2026-04-21, smoke config):**
- Heuristic wins ~2/7 seeds in Technician-vs-Sprinter. The other ~5/7 stall on expert milestones rated 5.13a+.
- Appears to be a **balance issue**, not an engine bug: at level 15, neither character can meet expert stat ceilings without heavy gear stacking. Saved as project memory `expert_milestone_difficulty.md`.
- Telemetry density: ~1,400 events per 31-round game (~270 KB). Deliberate — high granularity over compactness.

**First LLM end-to-end run (2026-04-22, qwen2.5:7b-instruct):**
- Wallclock: 652 seconds (~11 min) for one 2-player game. Heuristic + LLM mix. LLM made 181 decisions averaging 3.6s each.
- **Reliability: 0 fallbacks out of 181 LLM decisions.** 7B model is rock-solid at JSON-mode + numbered-action picking.
- **Strategy: poor.** LLM (Sprinter seat) completed 0 milestones while heuristic (Technician seat) completed 2. LLM trained 81 times, rested 41, bought 0 gear, attempted 0 milestones.
- Diagnosis: the LLM understands mechanics but defaults to infinite preparation. Rationales like "Save resources for milestone attempts later" and "Restore endurance for future climbs" kept deferring commitment.
- Fix: rewrote the system prompt with explicit decision priorities (attempt milestones greedily, buy access cards when needed, cap repeated training). Second run (same seed, same characters) produced a COMPLETED game: heuristic Technician completed all 3 milestones to win; LLM Sprinter completed 1 of 3 and over-committed to 27 milestone attempts. Still 0/142 fallbacks — 7B reliability holds.
- Open prompt-tuning item: the LLM now **over-attempts** expert milestones it can't reasonably pass. Next iteration: add "skip a milestone if effective stats are >10 points short on any requirement" to the system prompt.
- Status: LLM end-to-end works. One win against the heuristic across N seeds would be the next meaningful milestone.

**Seven-seed LLM smoke (2026-04-22):**
- 7 games, 137.7 min wallclock, ~20 min/game, seeds 1/7/13/42/99/888/2024.
- Head-to-head: heuristic Technician (P1) vs ollama:qwen2.5:7b-instruct Sprinter (P2).
- **LLM milestones: 6/21 (29%). Heuristic baseline in same P2 seat: 16/21 (76%).**
- **LLM wins: 0/7. Heuristic baseline wins in P2 seat: 2/7.**
- Fallback rate: 0.76% (10 of 1318 LLM decisions) — excellent reliability.
- Conclusion: the engine + agent + reporting pipeline is production-ready; the **7B model + current prompt is weaker than the rule-based heuristic**. Next levers: prompt tuning (skip-under-stated milestones, prefer performance gear), move to `qwen2.5:14b-instruct`, or add a short recent-actions window to the user prompt.
- Artifacts: `results/llm-7b-smoke/report.html`, `results/heuristic-baseline/report.html`, `results/llm-7b-smoke/diff-vs-heuristic-baseline.html`.

---

## 6. Open items

1. **Ollama benchmark not run.** Code is ready; needs `brew install ollama && brew services start ollama && ollama pull qwen2.5:14b-instruct`. After that, edit [sim/config.json](sim/config.json) to list the model and rerun `npm run playtest:smoke`.
2. **Heuristic improvement.** The current heuristic is intentionally simple. The LLM agent should beat it; if it doesn't, the LLM isn't earning its compute. Consider this a deliberate baseline, not a bug.
3. **Commit C — browser UI rewiring.** Deferred. The headless engine and the human-playable game share data but not logic. Wiring [index.html](index.html) + [game.js](game.js) to the engine would let human play emit the same structured telemetry, but isn't required for automated playtesting.
4. **Full-matrix duration.** With the default config (2 agents, sample:15, 7 reps, 3 player counts) the matrix is ~700 games. At 5 minutes per LLM game on the M5, that's ~60 hours — overnight or weekend run. Smoke variant is ~12 games for sanity checking.
5. **Expert milestone balance.** First playtest pointed at expert routes being possibly character-gated. Recommendation in `expert_milestone_difficulty.md`: surface this in the first real report, then decide whether to lower expert requirements or accept that some character/milestone combos are unwinnable.

---

## 7. How to run (for reviewers)

| Goal | Command |
|---|---|
| Pre-flight check, no LLM, ~6 seconds | `npm run playtest:smoke` |
| One specific game | `npm run game -- --seed=42 --characters=technician,sprinter --agents=heuristic,heuristic` |
| Inspect the matrix without running | `npm run playtest:dry` |
| Full matrix run, with report at end | `npm run playtest` |
| Build report only from existing results | `npm run report` |
| Compare two runs side-by-side | `npm run diff -- results/<old> results/<new>` |
| Replay one game in text mode | `node sim/replay.js results/<date>/<file>.jsonl` |
| Engine unit tests only | `npm run test:engine` |

All commands explained for non-developers in [PLAYTEST.md](PLAYTEST.md).

---

## 8. Engine version policy

`engine/version.js` exports `{ major, minor, patch }`.
- **major** bump → fundamental rule changed (win condition, dice system). Old runs not comparable.
- **minor** bump → meaningful content (new character, reworked ability). Old runs not comparable.
- **patch** bump → balance tweaks within the same rules. Old runs ARE comparable.

The dashboard uses the version field to flag baseline-invalidating changes between runs.

---

## 9. Design decisions worth defending

- **Source of truth is `game.js`**, not the CSVs. Codified in project memory.
- **Engine is JSON-serializable end-to-end.** `attemptedRoutes` uses plain object form, not Set, so the entire state can be `structuredClone`'d in `applyAction` without losing fidelity.
- **Determinism is non-negotiable.** Seeded RNG is restored from `state.rngState` at the start of every `applyAction`. Same seed + same actions = byte-identical event log.
- **Events have sequence numbers, not wall-clock timestamps.** Wall clock breaks reproducibility. Annotation can happen at the writer layer if needed.
- **Plotly via CDN, no install.** Reports work offline once cached. No build step. No `npm install` for the report itself.
- **Heuristic is deliberately weak.** It exists to be a stable baseline. If we tune it to win, we lose the comparison.
