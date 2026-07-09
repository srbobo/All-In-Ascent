# Can an LLM Learn to Play All-In Ascent?
## Complete Experimental Record — Methodology, Rationale, Outcomes, and Redesign Blueprint

**Period:** May – July 2026
**Hardware:** Apple M5, 32 GB unified memory (all experiments $0, fully local)
**Models:** qwen2.5:7b-instruct (primary), deepseek-r1:7b, gpt-oss:20b
**Branches:** `R2-rollout-search` (merged, PR #14), `Z-distillation`

---

## 1. Executive Summary

Twelve experiments tested whether a locally-hosted LLM can learn dominant
strategies for All-In Ascent. Five learning paradigms were exercised: prompt
engineering, in-context learning with episodic memory, semantic tool
architecture (CPP-style), decision-temperature control, and AlphaZero-style
policy distillation into weights.

**Headline results:**

| Instrument | Best local-LLM result | Ground truth |
|---|---|---|
| Tournament score (Iron Lung, seed 1) | 90 (stochastic, 30% of games) | Search: 79–90 deterministic |
| Rationale-action drift | 42.2% → 8.7% (tools mode) | — |
| Agreement with search ground truth | qwen 12.0%, gpt-oss 11.9% | chance ≈ 6% |
| Pivotal milestone-turn agreement | 0/14 (qwen), 0/1 (gpt-oss) | — |
| Distillation (LoRA on search labels) | 25.7% → **21.3%** (regressed) | — |

**The one-paragraph verdict:** injected knowledge works, architecture fixes
work, but *strategic judgment never moved*. Every apparent learning gain
decomposed into (a) world-model corrections supplied by us in the prompt,
(b) lucky sampling ratcheted by memory, or (c) surface-statistics
imitation. Meanwhile the engine-side rollout search — built originally as a
measurement instrument — turned out to be a complete, deterministic,
breakthrough-level game AI at 1s/decision. The path to "CPU opponents that
learn" runs through that search, not around it. Section 6 lays out the
redesign.

---

## 2. Research Question and Environment

**Question:** Can a locally-hosted LLM (7–20B) learn dominant strategies for
All-In Ascent through iterated play — and if so, through which mechanism?

**Environment:** deterministic engine (seeded PRNG), 2–4 players, win = first
to complete beginner/intermediate/expert milestone routes. Standard test
matchup: LLM as Iron Lung (seat 3) vs heuristic Technician + Sprinter,
seed 1. Reward function (`analysis/score-game.js`):

```
score = 100·win + 25·milestones + round(10·ln(1 + ability_triggers)) − fallbacks
```

The logarithmic ability term (chosen over linear after calibration showed
ability spam dominating win bonuses) rewards creative character-ability use
without letting it swamp the objective.

**Score anchors:** ~63 = "grinding" (1 milestone + ability floor);
~86–90 = "breakthrough" (2 milestones); >100 requires winning. The Iron Lung /
seed 1 expert milestone (5.13a Lead) was later shown unreachable even under
exhaustive search — 2/3 milestones is that cell's ceiling.

---

## 3. Experiment Catalog

### E1 — Baseline LLM smokes (v0.2.0–v0.4.0, May 2026)

- **Rationale:** establish whether a 7B model can play legally and
  competitively via a prompt containing state + numbered legal actions.
- **Method:** qwen2.5:7b vs heuristic across 7 fixed seeds; JSONL event
  logging; iterative prompt fixes (priority lists, access-card primers).
- **Outcome:** 0% fallback (interface works), 0 LLM wins ever, milestone
  completion 29%→43% across prompt versions. A persistent "Focus-bias"
  emerged: the model trains its character's *strongest* stat instead of the
  stat its milestones gate on (Sprinter, Free Solo, and Iron Lung runs all
  showed the same shape).
- **Lesson:** the interface was never the problem; the *judgment* was. This
  distinction took the rest of the program to fully quantify.

### E2 — In-context learning harness (tournament + reflection + memory)

- **Rationale:** RL is absent from iterated LLM play — each game starts
  amnesiac. Give the model a reward signal, a post-game structured
  reflection, and a memory file injected into the next game's context
  (Voyager-style), then look for an upward score trend over same-seed
  iterations.
- **Method:** `sim/run-llm-tournament.js` — N iterations of one seed;
  per-game `planStrategy` (structured opening plan), per-turn strategy-shift
  detection, end-of-game `reflectOnGame` (what worked / what failed /
  advice), `memory-<char>.json` accumulated and formatted into the system
  prompt.
- **Outcome:** the harness worked; the learning didn't (see E6/E7). Also
  surfaced a series of infrastructure bugs (§5).
- **Lesson:** episodic verbal self-reflection is a weak-to-negative learning
  channel for a 7B — it rationalizes rather than diagnoses.

### E3 — Reasoning-model swap (deepseek-r1:7b)

- **Rationale:** maybe explicit chain-of-thought catches the Focus-bias
  mid-reasoning.
- **Method:** `<think>`-aware JSON extractor; `format:'json'` removed (it
  suppressed reasoning); timeouts raised 3–5×.
- **Outcome:** Focus-bias unchanged (72% Focus training). 73s/decision mean
  (vs 14s), watchdog kills, no completed games. Abandoned on cost/benefit.
- **Lesson:** reasoning *tokens* are not reasoning *quality* at this scale;
  latency compounds into experiment-killing wall-clock.

### E4 — Drift measurement (`analysis/measure-drift.js`)

- **Rationale:** a CPP-style tool refactor was proposed on the strength of
  one observed rationale-action mismatch. One anecdote is not a basis for a
  multi-day refactor — measure first.
- **Method:** for every decision, compare rationale text (stats/areas/verbs
  mentioned) against the executed action. Taxonomy: stat drift, area drift,
  type drift.
- **Outcome:** 42.2% total drift at baseline; ~31% was encoding-class
  (stat/area).
- **Lesson (methodological):** every architectural claim in this program
  that was later backed by an instrument survived; every claim based on
  anecdote shrank on measurement. Build the metric before the fix.

### E5 — World-model injection (prompt engineering)

- **Rationale:** drift analysis revealed the model *believed wrong facts*
  ("Balance and Core trains Focus" — it trains Flexibility). Strategic
  failure may be a knowledge failure.
- **Method:** three prompt additions — explicit area→stat table; signed
  per-milestone stat-gap arithmetic pre-computed each turn; a TRAINING
  PRIORITY instruction ("train the largest positive gap, regardless of your
  archetype's flavor text").
- **Outcome:** the program's single biggest win. Strength training 2%→68%;
  drift 42%→20%; first-ever 2-milestone LLM game. Reproduced on both qwen
  and deepseek.
- **Lesson:** the highest-leverage channel into a small model is *declarative
  knowledge with the arithmetic already done*. Character-agnostic procedures
  (gap computation) transferred; character-specific advice would not have.

### E6 — In-context memory v1: the regression

- **Rationale:** with a working reward signal and prompt, run the actual ICL
  experiment (5 iterations, same seed).
- **Method:** memory block ending in "form a NEW strategy that beats your
  best score"; per-game reflections including `advice_for_next_game`.
- **Outcome:** trajectory **[66, 63, 64]** — monotone-ish *decline*.
  Diagnosis from behavior: Strength-training count collapsed 54→23→6 across
  iterations while initial plans stayed identical. The "NEW strategy" framing
  plus self-authored advice ("diversify strategies") actively eroded working
  behavior.
- **Lesson:** memory framing is not neutral plumbing. A model that cannot
  evaluate its own play will obey exhortations to change as readily as
  exhortations to persist. Prescriptive self-advice is anti-signal.

### E7 — In-context memory v2: "replicate, don't reinvent"

- **Rationale:** invert E6's framing — exploitation-biased memory.
- **Method:** BEST GAME callout at the top ("REPLICATE THIS"), factual
  what-failed notes only, prescriptive advice field dropped from the
  injection, "diversification without cause makes scores REGRESS" instruction.
- **Outcome:** 10-iteration trajectory **[63, 65, 64, 63, 90, 86, 64, 66,
  61, 90]**. No regression (floor 61); 3 breakthroughs (30%); plan-text
  converged (iters 6–10 byte-identical plans); iter-6 inherited iter-5's
  tactic *plus* a targeted improvement (early Belay Device). But: iters 7–9
  regressed to grinding with the 90-score game sitting in memory — the
  ratchet is leaky; and identical plans produced 61-to-90 outcomes.
- **Lesson:** memory reliably transfers *plans*; it does not reliably
  transfer *execution*. Score variance under fixed plans pointed at
  per-turn sampling — motivating E9.

### E8 — Lite-CPP semantic tools (+ retry + notebook)

- **Rationale:** eliminate the encoding-drift class by replacing
  `action_index` with named tool calls (`train(stat=...)`,
  `attempt_milestone(tier=...)`); add error→retry feedback and an intra-game
  notebook (both cut from the original Lite scope at user request).
- **Method:** `dispatchToolCall` in the engine (pure function, 22 unit
  tests); tool-schema prompts; max-3-attempt retry loop with corrective
  feedback; per-game notebook injected atop the prompt; `--agent-mode`
  A/B flag; paired same-seed smoke + 5-iter tournament.
- **Outcome:** mechanism worked exactly as designed — stat/area drift → ~0%,
  100% retry recovery, latency par with index mode. Strategy unmoved: A/B
  scores identical (55/55); tournament iters 1–3 scored 63/63/62 (par with
  index) before thermal collapse killed 4–5 twice. Notebook used **0/348**
  decisions — an offered-but-optional scratchpad is a dead channel for a 7B.
- **Lesson:** action-encoding was a real but *non-binding* constraint.
  Fixing a measured 31% defect class changed scores by ~nothing — the
  binding constraint was elsewhere. (Also: "optional" model-facing features
  need forcing functions or they are decorative.)

### E9 — Decision-temperature ablation

- **Rationale:** E7's identical-plans/variable-outcomes pattern predicts the
  variance lives in decision sampling (temp 0.3). Near-greedy decisions
  (0.05) should collapse variance — the question is *onto which mode*.
- **Method:** split temperature (decisions 0.05, planning/reflection 0.3),
  5-iter tournament, otherwise identical to the E7 baseline.
- **Outcome:** **[62, 67, 62, 66, 64]** — spread collapsed 29→5, and it
  locked onto *grinding*. Zero breakthroughs. Iters 2 and 4 opened with
  byte-identical 12-action sequences. Two greedy Standard-milestone attempts
  both came underprepared and failed.
- **Lesson (the program's pivotal insight):** the model's *modal policy is
  grinding*. Every breakthrough in E7 was a ~30%-per-game lucky sample that
  memory then ratcheted. The system was random exploration + leaky
  exploitation, with no strategic understanding underneath. This reframed
  everything and justified building ground truth (E10).

### E10 — R2: rollout search as ground truth + measured LLM prior

- **Rationale:** (a) obtain per-turn ground truth ("which action is actually
  best") via simulation; (b) measure the LLM's judgment against it — a far
  sharper instrument than end-of-game scores; (c) let search carry execution
  since the LLM demonstrably can't.
- **Method:** `sim/agents/rollout.js` — full-width evaluation (every legal
  action; the E9 result proves LLM-filtered candidate sets omit the winning
  move), 8 heuristic playouts per action with per-(action,rollout) RNG
  perturbation via `deriveSeed`, events-array truncation for O(1) clones,
  value = 150·win + 25·ms − racing terms + XP epsilon. `--agent-mode=rollout`:
  search picks the action; the unmodified index-mode LLM call is captured as
  a *prior* (`priorAgreement`, per-action EVs logged per turn). Low decision
  temperature retained so the prior is the model's stable modal belief.
- **Outcome:**
  - Pure search: found the milestone-rush line unaided (first milestone
    attempt = The Standard), 2/3 milestones in 3 attempts, ~1s/decision,
    full game in 3.2 min. Sprinter heuristic reached 3/3 in the same game —
    the Iron Lung 2/3 ceiling is character-specific, not global.
  - Tournament **[79, 79, 74*, 79, 79]** (*watchdog artifact from lid-close
    sleep) — deterministic breakthrough-level play. (79 not 90 because the
    value function omits the ability-creativity term — search doesn't farm
    Relentless triggers: 17 vs the LLM's 40–54.)
  - **qwen prior agreement: ~12%** across ~600 decisions (chance ≈6%);
    mean EV gap on disagreement ≈51 points (≈ two milestones); **0/14 on
    pivotal milestone turns**; milestone timing *anti-correlated* (wants
    attempts when unready, refuses when ripe — ~25% of its rejected wishes
    were premature milestone attempts); agreement flat across memory
    iterations (10.4–13.3%).
- **Lesson:** the definitive measurement. The LLM's per-turn strategic
  judgment is barely above chance, and in-context memory does not move it.
  All earlier "learning" is fully explained. Search, built as
  instrumentation, is incidentally a shippable CPU opponent.

### E11 — Model-scale probe (gpt-oss:20b bake-off)

- **Rationale:** is judgment-at-chance a 7B problem? Test the largest
  reasoning-class model that fits 32 GB, at $0.
- **Method:** `think:"low"` (probe showed >120s/decision at default effort —
  infeasible; low ≈ 45–65s), one rollout-mode game, same instrument.
- **Outcome:** **11.9% agreement (5/42)** — statistically indistinguishable
  from qwen's 12%. EV gap on disagreements 85.6. 0/1 pivotal. Caveats:
  small sample (watchdog at r22), 21 priors aborted on latency, low effort
  only — the finding is "at any effort practical on this hardware."
- **Lesson:** the local scaling curve (7B→20B-reasoning) is flat on this
  task. Local model *size* is not the missing variable.

### E12 — AlphaZero-style distillation (Z1–Z5)

- **Rationale:** the search is provably better than the model → per
  AlphaZero, the model should be able to learn from its own search
  (imitate the search's choices). One rung of the loop: behavior-clone
  rollout-best actions into qwen via LoRA, evaluate with the agreement
  instrument.
- **Method:**
  - *Data:* 50 pure-rollout games, seeds 2–51 (seed 1 quarantined for
    eval), collect seat cycling **all five characters**; 7,168 pairs of
    (byte-identical tournament prompt → `{"action_index": N, "rationale":
    "<templated>"}`), EV-margin metadata; **split by game** (never by
    example — adjacent states leak).
  - *Training:* MLX QLoRA on Qwen2.5-7B-4bit — 11.5M trainable params,
    8 layers, seq 3072, batch 1 + grad-checkpoint, 2,400 iters (~0.4 epoch),
    ~21 h wall-clock including a sleep suspension. Val loss 2.318 → 0.117.
  - *Eval:* offline mirror of the in-game agreement metric, 300 held-out
    examples, identical before/after.
- **Outcome:** **25.7% → 21.3% — worse.** Structure: gains only on the two
  majority classes (rest 56→71%, train 7→14%); collapse to **0%** on
  milestone and endTurn; climb 31→7%; buyGear 32→5%. The model learned
  class/index frequency statistics and rationale templates, not
  state-conditional judgment.
- **Root cause (design flaw, diagnosed):** targets were ~2 tokens of
  decision + ~20 tokens of templated rationale — ~90% of every gradient
  step optimized boilerplate. Val loss fell beautifully while measuring
  almost nothing about the decision. Amplifiers: 0.4 epochs; only 193
  milestone-class labels; no class balancing.
- **Lesson:** (a) validation loss on mixed-content targets is a lying
  metric — task-level eval caught what val loss hid; (b) behavior cloning
  needs the loss concentrated on the decision tokens; (c) rare-but-pivotal
  classes need explicit balancing; (d) the discriminating v2 experiment
  (index-only targets, same data) remains unrun.

---

## 4. Cross-Cutting Findings (the shape of the failure)

1. **Knowledge in ≫ learning out.** The only intervention that ever moved
   scores was us putting knowledge *into* the prompt (E5). No mechanism —
   reflection, memory, tools, temperature, weights — extracted comparable
   knowledge *from* experience.
2. **Plans transfer; execution doesn't.** Every memory variant produced
   stable plan text and unstable behavior. The gap between "knows what to
   say" and "does it per-turn" is the defining 7B failure mode here.
3. **Exploration was accidental.** Temperature was doing strategy discovery
   by dice. No component of the system deliberately explored.
4. **Milestone *timing* is the crux skill** — and it is precisely where all
   models score zero. Not milestone *desire* (the LLM proposes them
   constantly, prematurely) but the readiness computation.
5. **Instruments beat anecdotes, every time.** Drift analysis (E4) shrank a
   refactor's promise; the agreement metric (E10) collapsed three months of
   ambiguous score movements into one number; the offline eval (E12) caught
   a lying val loss. The instruments are the program's most reusable IP.

## 5. Infrastructure Lessons (M5 / local-stack operations)

- **Thermal ceiling:** ~2.5–3 h sustained GPU inference before ~10× latency
  collapse. Mitigations that worked: `keep_alive:-1` (+1 iteration),
  inter-iteration cooldowns, splitting runs. LoRA training (steady ~9.4 GB,
  lower intensity) ran 21 h without throttling — inference bursts, not
  training, are the thermal killer.
- **Resource conflicts:** Ollama's pinned models (14 GB "Forever") OOM'd
  MLX training twice. One GPU, one tenant at a time.
- **Process lifecycle:** harness background tasks were SIGTERM'd at session
  boundaries — `nohup … & disown` (re-parent to launchd) is mandatory for
  multi-hour runs. Lid-close suspends processes and burns wall-clock
  watchdogs; `caffeinate -w <pid>` prevents idle sleep only.
- **Observability that paid for itself:** STATUS.txt / HEARTBEAT.txt
  ("stale mtime = hung; fresh = do not kill"), macOS notifications on every
  state transition, watchdogs that *write a partial summary then stop*
  instead of throwing (data salvage), JSONL event streams with per-decision
  telemetry.
- **Recurring bug class:** async/abort edges — stream flush races, abort
  reasons rejecting as primitive strings mid-body-read, TDZ after `return`.
  All found by running long, not by tests.

---

## 6. Redesign Blueprint — "bots that play and learn" done right

The goal is achievable. The program's failure was not the goal but the
*mechanism assignment*: we asked a 7B language model to be the policy,
the value function, the learner, and the explorer, all through a
2,600-token prose interface. The redesign assigns each role to the
component that demonstrably does it well.

### 6.1 What is already shipped and works today

**The rollout search is a complete CPU opponent right now:**
deterministic, breakthrough-level, ~1s/decision, character-agnostic, zero
model dependency. It has a natural difficulty dial:

| Difficulty | Config |
|---|---|
| Easy | `rolloutsPerAction: 1`, short playout horizon, or ε-random |
| Medium | 4 rollouts, mid horizon |
| Hard | 8+ rollouts, full horizon (current config) |
| "Personality" | bias the value function (aggressive: weight racing term; cautious: weight endurance) |

Add the ability-creativity term to `defaultValueFn` (one line) and Hard mode
plays at 90+, matching the best LLM game ever, every game.

### 6.2 Fix the learning problem's *representation* before its algorithm

The largest hidden tax in every experiment: the state is ~2,600 tokens of
prose per decision. That inflates latency (thermal death), dilutes
attention, and makes every training example 3k tokens for 2 tokens of
signal. Before any v2 learning attempt:

- **Compact state encoding** (~150–300 tokens): structured table or JSON of
  stats/gaps/resources/board occupancy. Cheaper per call (more experiments
  per thermal window), denser gradients per example, and room for longer
  histories in context.
- This alone may lift small-model judgment — verbose prose is a known
  small-model failure amplifier — and it makes every downstream experiment
  5–10× cheaper.

### 6.3 The corrected distillation ladder (if the LLM stays the student)

E12's negative result is not the end of distillation; it identified four
specific fixes, in order:

1. **Index-only / loss-masked targets** — 100% of gradient on the decision.
   (Same data, 5-line transform, one overnight run — the immediate
   discriminating experiment.)
2. **Class-balanced sampling** — upweight milestone/endTurn labels; filter
   near-tie labels (evMargin metadata already exists for this).
3. **≥3 epochs** with early-stop on *agreement* (not val loss) over a
   validation slice — the eval harness already exists.
4. **DAgger loop** (the real AlphaZero rung): student plays → search labels
   the *states the student visits* → retrain. One-shot behavior cloning
   fails on distribution shift; DAgger is the standard fix and the
   generator/labeler infrastructure for it is already built.

### 6.4 Learn the value function, not the policy (the deeper redesign)

AlphaZero's actual decomposition: the network doesn't pick moves — it
*evaluates* (policy prior + value), search picks. The analog here:

- Keep search as the decider. Replace the heuristic playout/value with a
  **learned value function** trained on (state → final outcome) from
  self-play games — thousands of labels per hour from the CPU-only
  generator. Even a tiny MLP over a hand-coded feature vector (stats, gaps,
  round, opponent progress) would let search cut playouts 8×→2× or see
  deeper at the same budget.
- The LLM's role shifts to what it measurably does well: narration,
  rationale, table-talk, difficulty-appropriate "personality" — the parts a
  human opponent actually experiences.

### 6.5 Learning *from players* (the product goal)

"Learn playing methodology" from humans slots cleanly into the built
pipeline:

- Human games are already JSONL event streams → each human decision is a
  (state, action) pair → the same agreement instrument scores *humans
  against search ground truth* (skill rating per decision class, not just
  win/loss).
- Imitation targets from strong human play → "plays like Sam" opponents via
  the corrected distillation ladder (6.3).
- Search + value-bias per player → adaptive difficulty: an opponent that
  stays ~1 milestone behind or ahead of the specific human's measured pace.

### 6.6 Process rules for the next program (earned the hard way)

1. **Instrument first.** No intervention without a metric that isolates it
   (agreement > drift > scores; scores are the noisiest and arrived first).
2. **One variable per run.** The clean A/Bs (E8, E9, E11) produced the
   trustworthy conclusions; multi-change runs produced re-runs.
3. **Task metric over training metric.** Val loss lied; agreement didn't.
4. **Design for the thermal envelope.** Anything >2.5 h of GPU inference
   needs cooldowns, checkpoints, and detachment — or a CPU-side redesign
   (the search generator produced 50 games in 2 h on CPU while LLM
   tournaments produced 5 games in 4 h on GPU).
5. **Quarantine the eval distribution** (seed 1 untouched by training) —
   already practiced, keep it.
6. **Optional model-facing channels are dead channels** (notebook, 0/348).
   If the model should use something, force it or drop it.

---

## 7. Asset Inventory (reusable, all committed)

| Asset | Location | Status |
|---|---|---|
| Rollout search agent (CPU opponent) | `sim/agents/rollout.js` | proven |
| Agreement instrument (in-game) | `--agent-mode=rollout`, JSONL fields | proven |
| Agreement instrument (offline) | `training/eval-agreement.py` | proven |
| Drift instrument | `analysis/measure-drift.js` | proven |
| Training-data generator (search-labeled) | `sim/generate-training-data.js` | proven; 7,168 pairs on disk |
| Game-level splitter | `training/split-data.js` | proven |
| MLX LoRA stack | `training/.venv`, adapters | working; v1 adapters saved |
| Tournament harness (memory/reflection/heartbeat/cooldowns) | `sim/run-llm-tournament.js` | proven |
| Semantic tool dispatch + retry | `engine/helpers.js` `dispatchToolCall` | proven, 22 tests |
| Reward scorer | `analysis/score-game.js` | proven |
| Memory format v2 | `sim/tournament/memory.js` | proven (bounded value) |

---

*Report generated 2026-07-09 on branch `Z-distillation`. All numbers trace to
JSONL artifacts under `results/` and `training-data/`, and to
`~/.claude/.../memory/` project-memory entries.*
