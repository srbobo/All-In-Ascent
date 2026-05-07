# All In Ascent — Playtest Pipeline

Automated agent-driven playtesting for balance analysis. Runs hundreds of simulated games on your Mac, captures structured telemetry from every dice roll and decision, and produces an interactive HTML report with interpretation callouts.

## What's in this directory

```
engine/                 Pure-logic game engine (DOM-free, deterministic, ~Node 18+)
  data.js               Characters / routes / gear / XP / training (mirrors game.js)
  state.js              createGame, milestone selection, player init
  helpers.js            stat math, dice, gear bonuses, area access, level-up
  engine.js             getLegalActions, applyAction, isTerminal + action handlers
  rng.js                seeded PRNG (mulberry32), deriveSeed
  telemetry.js          structured event emitter
  test-*.js             unit tests (149 assertions; npm run test:engine)

sim/                    Simulation pipeline
  agents/
    random.js           uniform-random agent (control)
    heuristic.js        rule-based agent (baseline)
    ollama.js           LLM agent via local Ollama (optional)
  run-one-game.js       run a single game; CLI + importable
  run-matrix.js         run the full config-driven batch
  replay.js             text-mode JSONL log viewer
  config.json           default pipeline config
  config.smoke.json     minimal config for end-to-end smoke tests

analysis/
  build-report.js       aggregate report.html with auto-narrative trends + recommendations
  game-detail.js        rich per-game HTML: timeline w/ rationale tooltips, stat curves,
                        decision chronology, per-game narrative
  final-report.js       one-shot wrapper: aggregate + every per-game detail + open
  diff-runs.js          compare two result dirs (before/after a balance change)
  why-grinding.js       deep analysis: per-attempt gap distribution, retry patterns
  training-effectiveness.js  is the LLM training the right stats? cumulative shortfall vs trains

results/<YYYY-MM-DD>/   one JSONL per game + manifest.json + summary.json + report.html
```

## Quick start

**Install one prerequisite (Ollama, only if using the LLM agent):**

```bash
# Installs Ollama (a local LLM runtime) via Homebrew.
brew install ollama

# Starts the Ollama service in the background. Models live in RAM while loaded.
brew services start ollama

# Downloads the model. First run takes a few minutes (~9 GB).
ollama pull qwen2.5:14b-instruct
```

**Run a single game (no LLM required, ~1 second):**

```bash
# Plays one Technician-vs-Sprinter game with two heuristic agents.
# Writes results/<today>/...jsonl. Same seed → same game, every time.
npm run game -- --seed=42 --characters=technician,sprinter --agents=heuristic,heuristic
```

**Run the smoke matrix (~12 games, < 5 seconds):**

```bash
# Runs sim/config.smoke.json (a tiny matrix, no LLM), then builds report.html.
npm run playtest:smoke
```

**Run the full matrix (~700 games, hours):**

```bash
# First check the plan without running anything.
npm run playtest:dry

# Then run it. Edit sim/config.json to tune scope/agents.
# Safe to Ctrl+C; resume by re-running.
npm run playtest
```

**Replay a single game in text form:**

```bash
node sim/replay.js results/2026-04-22/m0001_p2_all_heuristic_technician-sprinter_r0.jsonl
```

**Build a rich HTML detail page for one game** (resource curves, stat progression, round-by-round timeline with rationale tooltips, full decision chronology):

```bash
npm run detail -- results/2026-04-22/seed-1.jsonl
```

That writes `seed-1.detail.html` next to the JSONL. The aggregate `report.html` already
hyperlinks each per-game row directly to this detail page.

**Build the final report (everything at once)** — aggregate + every per-game detail + open:

```bash
npm run final-report                     # uses today's results dir
npm run final-report results/2026-04-22  # explicit dir
```

The aggregate `report.html` includes:
- Auto-generated **major trends** (e.g. "86% of games hit max_rounds", "qwen 7b trained Focus 23/30 times, never trained Tech")
- Auto-generated **recommended fixes** with priorities (HIGH/MEDIUM/LOW) and concrete actions
- Charts: action distribution by (character, agent), per-game progression table linking to detail pages, win rates, end-reason pie, game-length histogram, character matchup heatmap, milestone completion, ability use, gear purchase frequency
- Top-5 callouts: closest finishes, longest games, most one-sided games, most creative wins, biggest upsets

Each per-game `seed-N.detail.html` includes:
- Per-game auto-narrative (what happened in one paragraph)
- Final per-player progression (level, XP, gear, milestones, climb pass rate, milestone pass rate)
- Action distribution stacked bar
- Resource curves (XP, endurance, level over rounds)
- **Stat progression curves** — Strength / Technique / Focus / Flexibility over rounds, one panel per stat — for spotting "trained Focus all game while Tech stayed flat" patterns
- Round-by-round timeline grid — **hover over any climb or milestone to see the agent's rationale**
- Most-attempted-but-failed routes (grind-loop detection)
- Full collapsible decision chronology — every action with its rationale and outcome (Cmd+F searchable)

## How a game is captured

Every game writes one JSONL file with three layers:

1. **Line 1: `run_meta`** — agents, characters, seed, engine version.
2. **Lines 2..N-1: engine events** — `game_start`, `turn_start`, `action_chosen`, `dice_rolled`, `climb_resolved`, `milestone_progress`, `level_up`, `gear_purchased`, `train_action`, `rest_action`, `belayer_unlocked`, `round_end`, `game_end`, plus periodic `resource_update` snapshots. Each event has `t` (sequence number) and a typed `payload`.
3. **Line N: `run_summary`** — winner, end reason, rounds, per-player final state.

The format is JSONL so it's streamable (write while the game runs) and trivially loadable (one line = one JSON object).

## Repeatability

- Same `seed` + same characters + same engine version → byte-identical event stream. Always.
- The matrix orchestrator derives per-game seeds from `(matchup_id, repetition_index)` so the entire run is reproducible.
- Engine version (`engine/version.js`): bumping `major` or `minor` invalidates baseline comparisons (the report flags this); `patch` bumps stay comparable.
- Resumability: the orchestrator skips any game whose JSONL already ends with a `run_summary` line. Interrupted runs pick back up.

## Tuning the matrix

Edit `sim/config.json`. Key fields:

| Field | What it does |
|---|---|
| `repetitions` | Games per matchup (default 7) |
| `playerCounts` | Which player counts to test (default `[2, 3, 4]`) |
| `characterSampling` | `"all"` / `"sample:K"` / `"curated"` |
| `curatedMatchups` | Hand-picked character combos |
| `agents` | Up to 2 agent names to mix per game |
| `baselines` | Always-run controls (e.g. `["random"]`) |
| `parallelism` | Concurrent games (M5: keep at 1–2) |
| `maxRounds` | Safety cap that prevents infinite games |
| `turnTimeoutSeconds` | Agent decision timeout (15s default) |

## Iterating on the game

1. Make changes to `game.js` (the source of truth) AND `engine/data.js` (the engine mirror).
2. Bump `engine/version.js` — `patch` for stat tweaks, `minor` for new content, `major` for rule changes.
3. `npm run test:engine` to confirm nothing broke.
4. `npm run playtest:smoke` for a quick smell test (~5 seconds).
5. `npm run playtest` for the full overnight batch.
6. `npm run diff -- results/<prev> results/<new>` to see exactly which win rates moved. The diff report flags major/minor version bumps as "INCOMPARABLE" — patch bumps are shown as directly comparable.

## Reading the report

The report has these sections, in order:

1. **Run summary header** — total games, fallback-rate warning if any agent struggled.
2. **Interpretation callouts** — top 5 closest finishes, longest games, most one-sided games, most creative wins, biggest upsets. Each lists the JSONL filename so you can replay it.
3. **Headline numbers** — win rate by character and by agent (table + chart).
4. **End reasons** — pie chart of `all_milestones` vs `max_rounds`.
5. **Game length distribution** — histogram of rounds per game.
6. **Character matchup matrix** — heatmap, row vs column win rates.
7. **Milestone completion** — average milestones per character at game end.
8. **Creativity** — box plot of ability activations per character per game.
9. **Gear economy** — purchase frequency; unbought items at the right tail are rebalancing candidates.

## Known limitations / next steps

- The browser UI ([index.html](index.html) + [game.js](game.js)) still uses its original code path. The headless engine and human-playable game share data (`engine/data.js` mirrors `game.js`) but not logic. Wiring the UI to the engine is a deferred task — only matters if you want human players to share the structured telemetry.
- The default heuristic agent is intentionally simple and currently completes only 2/3 milestones in many seeds (expert milestones at 5.13a+ are character-gated). The point of the heuristic is to be a stable baseline that LLM agents have to clearly beat.
- Ollama agent integration is coded but untested end-to-end (depends on Ollama being installed).
