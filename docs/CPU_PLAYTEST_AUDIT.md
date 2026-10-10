# CPU Playtesting Audit — All-In Ascent (engine v0.7.0)

**Date:** 2026-10-09 (updated for engine v0.8.0) · **Branch:** `design/grit-and-holds-v2` · **Scope:** every component that plays the
game without a human: `sim/agents/*` (random, heuristic, rollout, ollama), the sim/analysis
pipeline, the online CPU ladder (`party/game.js`), and the engine rules those bots run on.

**Goals this is checked against:**
1. Fast playtesting that answers *which characters and cards need buffs or nerfs, which mechanics
   are broken, and whether a dominant strategy exists.*
2. CPU opponents that humans can play solo.

Every number below can be reproduced with the scripts in [`analysis/audit/`](../analysis/audit/)
(see the end of this document).

---

## 1. Verdict

**Not one of the current CPUs can be trusted to give balance answers.** The biggest problem is
not that the LLM is weak, which the experiment record already shows. The problem is that **the
bot's skill with each character gets mixed up with that character's real strength**, and every
tool in the pipeline reports the mix as if it were a balance finding.

Six findings, in priority order:

| # | Finding | Effect on balance answers |
|---|---|---|
| F1 | The heuristic bot plays characters with different skill. It ignores Perfect Beta's −5 and Route Reader's 3-of-4 rule when it decides on Milestones. | Fixing **one line** for Route Reader drops its median solo game from **66 to 35 rounds**. The old pipeline would have said "buff Route Reader." |
| F2 | The rollout "ground truth" is mostly noise. On the same position it **picks the same move as itself only 17% of the time** (4/23). | The E10 result ("LLM agrees with search 12%, so its judgment is near chance") can't be read the way it was. The yardstick barely agrees with itself. |
| F3 | The rollout value function pays for XP and stops early (`maxPlayoutSteps`), so the bot **farms XP and passes its turn**. | In a solo game, the Hard CPU spent **50 of 243 decisions on "Call It a Day"** and didn't finish in 80 rounds. |
| F4 | Engine bugs: Sequence Memorization and Crimp Sequence Decoder **can make a climb harder**. **Fixed in engine v0.8.0.** | Any value measured for those two cards before v0.8.0 is wrong. |
| F5 | **The browser game (`game.js`) does not apply 11 of the 14 market gear effects.** Local play and engine play are different games. | Human playtests and bot playtests can't be compared. |
| F6 | The report generator turns confounded stats into advice ("0 wins → buff", "gear rarely bought → cut its cost"). How often gear gets bought only reflects the order hard-coded in the heuristic. | The auto-recommendations aren't evidence. |

**Your proposal is the right direction.** A structured, machine-readable form of the game is
the missing base layer. The audit points to two refinements:

- **Structure both the rules and the observation.** The rules layer is characters and gear as
  data with an effect vocabulary. The observation layer is a compact state that includes
  **exact success probabilities** calculated by the engine. The LLMs failed exactly at Milestone
  *timing*, which is a probability calculation. Their prompts never contained a probability, and
  for Technician, Route Reader and Sprinter the gap numbers in the prompt were **wrong**
  (Section 3.3).
- **Don't make the LLM the playtesting policy.** For balance work, the CPU has to play each
  character close to its best, quickly, thousands of times. A search bot built on the structured
  representation can do that; a local LLM can't (E1–E12). The LLM is useful in other roles:
  explaining moves and adding personality for human-facing CPUs, and analysing the balance data
  as a designer's assistant. Section 5 sets out the split.

---

## 2. Inventory: what exists today

| Component | Location | What it is | Status |
|---|---|---|---|
| Engine | `engine/engine.js`, `helpers.js`, `state.js` | Pure, seeded rules: `getLegalActions` / `applyAction` / `isTerminal` | Solid design. Two dice-gear bugs (F4) and a round-start order bug (3.4) |
| Data | `game.js` → `engine/data.js` (generated) | Characters, routes, gear | Data is in sync. **Rules are not** (F5) |
| Random agent | `sim/agents/random.js` | Floor baseline | Fine |
| Heuristic agent | `sim/agents/heuristic.js` | Fixed priority list | Plays characters unevenly (F1). Never trains once routes are easy |
| Rollout agent | `sim/agents/rollout.js` | 1-ply Monte Carlo, heuristic playouts | Noisy (F2), XP-biased (F3), 1–4 s per decision |
| LLM agent | `sim/agents/ollama.js` (1,492 lines) | Prose prompt (~2.6k tokens), index or tool mode, memory, reflection | Gives wrong arithmetic for 3 of 5 characters (3.3). Best result: 12% agreement with a noisy oracle |
| Online CPU ladder | `party/game.js` `BOT_LEVELS` | Easy = heuristic, Medium = rollout×3, Hard = rollout×8, horizon 300 | Inherits F1–F3. Hard ≈ 3.8 s per decision in 3-player games |
| Pipeline | `sim/run-matrix.js`, `analysis/*` | Matrix runs → HTML report with recommendations | Recommendations are confounded (F6) |
| Distillation stack | `sim/generate-training-data.js`, `training/` | 7,168 search-labelled pairs, LoRA adapters | Trained on F2's noisy labels. This alone explains much of E12's failure |

---

## 3. Findings in detail

### 3.1 F1: Bot skill gets mixed up with character strength

`heuristic.js` decides whether to attempt a Milestone with
`passesBaseCheck(stats, route)`, which by default needs all 4 stats to pass, against the
**printed** requirements. So:

- **Route Reader** sends with 3 of 4 stats, but the bot waits until all 4 pass on Milestones.
  (The 3-of-4 rule was added only for regular climbs in v0.7.0.)
- **Technician** has −5 on every requirement, but the bot never counts it, so it under-attempts
  and over-trains.
- **Sprinter's** extra Crux die on Focus, and the expected value of dice in general, are
  ignored.
- **Training** goes to the character's lowest raw stat, not the stat that blocks a Milestone.
- After about round 40 the bot almost stops training (5–11 sessions against 200–1,300 climbs in
  long games). It climbs for XP even at Level 15, where XP only buys gear. That is the cause of
  the long tail (p90 of 100–330 rounds).

**Evidence.** Solo, 200 seeds, stock heuristic compared with the same heuristic plus a 6-line
character-awareness fix (`analysis/audit/heuristic-fixed.mjs`):

| Climber | Median rounds (stock) | Median rounds (fixed) | p90 (fixed) |
|---|---|---|---|
| Iron Lung | 33 | 33 | 180 |
| Technician | 37 | 35 | 101 |
| Sprinter | 37 | 37 | 183 |
| **Route Reader** | **66** | **35** | 193 |
| Free Solo | 41 | 41 | 225 |

**Small samples mislead too.** On only 20 seeds, the *fixed* bot reported Route Reader at 68
rounds and Free Solo at 76. The expert Milestone draw (3.5) splits results into two clusters, so
medians from small runs jump between them. The current config runs 7 repetitions per matchup.

**Rule for the redesign:** a balance number only counts when the bot plays every character
close to its best. That means one shared, character-agnostic decision procedure that reads
the effective numbers from the engine (Section 5), not rules written per character.

### 3.2 F2 and F3: The rollout search is too noisy, and biased toward XP

`evaluateActions` runs 8 heuristic playouts per legal action and takes the action with the best
mean. Three problems:

1. **Variance swamps the signal.** The spread of a single playout's value is about 65 points,
   so the mean of 8 has a standard error of about 23. The gap between the best and second-best
   action was **under 10 points in 9 of the 23 positions** sampled (as small as 0.4). Each action
   also gets independent dice seeds (`rngState + i*7919`), so the comparison carries the full
   noise. Evaluating every action with the same seeds for rollout *r* would remove the shared
   noise.
   **Measured:** for the same position, two evaluations with different seeds chose the same
   action **4 out of 23 times (17%)**.
2. **The value function pays for grinding.** The value is
   `150·win − 100·oppWin + 25·ms − 10·oppMs + 0.02·xp`. With `maxPlayoutSteps` of 300 (online)
   or 600, most playouts in 3–4 player games stop before anyone wins. That leaves `0.02·xp` as
   the main difference between actions. A climb scores points; a training session (0 XP) doesn't.
   Lead access cards *cost* XP, so buying them scores negative right up until they enable a
   Milestone inside the horizon.
3. **The playouts inherit F1.** Every seat, the searcher included, continues with the flawed
   heuristic. So the search's view of what a move is worth caps at what the heuristic can do
   afterwards. For example, a training move looks weak because the heuristic would not follow
   it up with more training.

**Seen in play:** Iron Lung solo, seed 6, rollout bot (3 rollouts, horizon 300): **not finished
after 80 rounds**. It made 243 decisions, of which 50 were "Call It a Day". It averaged about 3
decisions per round from a 10-Time budget, so it threw Time away. The stock heuristic finished
the same seed in 143 rounds.

**Consequences for the experiment record:**
- E10's "LLM agreement 12% vs chance 6%" was measured against an oracle that only agrees with
  itself about 17% of the time. The LLM's judgment may still be poor. The *instrument* can't
  show how poor.
- E12 trained by imitating labels that were mostly noise. Loss-masking (the proposed v2) will
  not fix noisy labels.

**Speed** (per decision, M5, single thread):

| Setting | Solo | 3 players |
|---|---|---|
| Rollouts ×3, horizon 300 (online Medium) | 0.74 s | 1.6 s |
| Rollouts ×8, horizon 300 (online Hard) | 1.1 s | 3.8 s |

A 3-player game with every seat played by Hard bots needs several hundred decisions, so it takes
tens of minutes. A balance matrix needs thousands of games. At this speed it is a CPU opponent,
not a playtesting tool.

### 3.3 The LLM's representation was wrong, not just verbose

`ollama.js` `buildUserPrompt` / `formatAction` give the model, for every route,
`gap = printed requirement − computeEffectiveStats(...)`. That is wrong for three of five
characters:

| Climber | What the prompt omits |
|---|---|
| Technician | The −5 on every requirement (every gap is overstated by 5) and immunity to Crux dice |
| Route Reader | Only 3 of 4 stats need to pass. Beta Boost +3 isn't counted in the climb gaps either |
| Sprinter | The extra Crux die on Focus (an expected +3.5) |
| Everyone | Dice. A route with two green dice is much easier than its printed numbers suggest |

The prompt also never states several rules that drive strategy:
- **Endurance doesn't refill** at the end of the round.
- **Spending XP sets back progress to the next Level** ("use it or lose it").
- **XP needed to reach the next Level**, and spendable XP.
- **Turn order** (most Time left acts next), and so whether a big climb hands the initiative to
  someone else.

Most important, **it never gives a success probability.** The record names Milestone timing as
"the crux skill" where every model scored 0/14. Timing *is* P(send) compared with the cost of a
fall. The engine can compute P(send) exactly: a climb rolls at most 4 d6, which is at most 1,296
outcomes, enumerable in microseconds. The models were asked to do probability in their heads with
the wrong inputs.

A smaller confound: the LLM reward added `10·ln(1+ability triggers)` for "creative" ability use.
That makes a fine design goal for a personality, but it **can't be part of a balance
playtester's objective**. A character that is strong only when its ability gets spammed would
look better than it really is.

### 3.4 F4 and F5: Rules bugs and two rule implementations

**Dice gear picks the wrong die** (`helpers.js` `rollClimbDice`). *Fixed in v0.8.0: every
"your choice" now maximises the climb's outcome, and a property test confirms dice gear never
lowers P(send) across 880 route × character × gear cases.*

```
route: green die on Strength, red die on Focus; rolls [6, 2]
no gear                → Str req 24, Focus req 22
Sequence Memorization  → Str req 29, Focus req 22   (turned the helpful green 6 into a 1)
Crimp Sequence Decoder → Str req 29, Focus req 22   (re-rolled the helpful green 6)
```

Both cards act on the *highest* die whatever its colour. 32 of the 72 routes have a green die,
so on those routes these cards often **hurt**. The cards say "your choice", so the right
behaviour is to pick the die that helps most: the highest red die for Memorization; the worst
die for the Decoder (the highest red or the lowest green).

**Round start ignores Approach Shoes.** *Fixed in the engine in v0.8.0; still open in `game.js`.*
`endRound` sets `currentPlayerIndex = 0`. Seat 1 always
opens the round, even when another player has 11 Time. The rulebook says the player with the
most Time acts first. (`game.js:2874` has the same bug.)

**`game.js` doesn't apply the effect-based gear.** Search it for Mental Anchor, Power Spotting,
Old Climbing Journal, Confidence Building, Climbing Coach, Mountain Mentor, Trick Foot Manual,
Body Tension Belt, Power Tap Belt, Crimp Sequence Decoder and Sequence Memorization: each name
appears only in the data table. Local hot-seat play applies Approach Shoes, the rest bonuses
and the Lead access stats, and nothing else. Online play and every sim use the engine, which
applies them all. So:
- A human local playtest of cards measures a different game from the bots.
- Memory notes "game.js is the source of truth." That holds for **data**. **Rules** exist twice
  and have drifted apart.

**Dead code** that makes the rules harder to read: `Gear Bag`, `Non-Locking Carabiner`,
`Quickdraws Set`, the `routeFilter` / `holdFeatureFilter` paths and `strengthTechMixed`. None of
these exist in v0.7.0 data.

### 3.5 Balance signals that hold up despite the bot problems

These don't depend on bot skill (static calculation) or appear under every policy tested.

> **Update (engine v0.8.0, planner bot — see Section 8):** A is **mostly overturned**: with good
> play the expert draw moves a solo game by only ~11 → 16 rounds. B and D are **confirmed**,
> and C is **reversed**: Free Solo is the second-strongest character, not the weakest.

**A. The expert Milestone draw decides the game more than any player choice.** Below are the
training sessions (+5 each, 2 Time) needed at **Level 10** to meet each expert route's
*expected* requirement, counting dice at 3.5 and the abilities above
(`analysis/audit/expert-milestone-spread.mjs`):

| Expert route | Wall | Tech | Sprinter | Iron Lung | Free Solo | Route Reader |
|---|---|---|---|---|---|---|
| Shoulder Shredder V8 | Boulder | 8 | 12 | 10 | 9 | 3 |
| Dyno Chain V9 | Boulder | 11 | 12 | 13 | 11 | 5 |
| … (16 more) | | | | | | |
| Professional Grade 5.13c | Top Rope | 23 | 31 | 30 | 25 | 17 |
| The Elite Lead 5.13a | Lead | 23 | 32 | 30 | 27 | 18 |
| **World Class Leading 5.14a** | Lead | **31** | **40** | **38** | **35** | **24** |

The spread is **3 to 40 sessions**. Lead experts also need 250 XP of access cards. Almost every
long solo game was stuck on an expert Lead route: 32 of 34 for Iron Lung and 43 of 58 for
Free Solo, counting games over 80 rounds. ~~**This is the clearest design problem found.**~~ *(Overturned in Section 8: most of this
was the heuristic failing to train, not the routes.)* Possible fixes: cap expert requirements (for example, at most ~X sessions above Level-10 stats),
draw the expert from a tighter band, or offer two expert cards and let each player choose.

**B. Route Reader is structurally the strongest; Sprinter the weakest.** Ignoring the worst stat
halves the training Route Reader needs on every expert route (column above). Sprinter needs the
most training *and* gets half XP on sends. Weak-bot data understated Route Reader (F1). Once the
bot accounts for it properly, Route Reader ties for fastest solo.

**C. Free Solo is weakest head-to-head** (2-player round robin, fixed heuristic, 100 games per
ordered pair):

| Climber | Win rate |
|---|---|
| Iron Lung | 0.58 |
| Technician | 0.58 |
| Sprinter | 0.56 |
| Route Reader | 0.43 |
| Free Solo | 0.36 |

Seat balance was fine (975 vs 1,024 wins). **Treat this as a hypothesis, not a verdict.** The
heuristic still plays these characters imperfectly. Free Solo's "must already meet every
requirement" gate is the rule a better bot would most likely play differently.

**D. A likely dominant pattern to test:** rush the beginner Milestone, then **train
non-stop toward the expert route's gaps**, and climb only to level up. XP compounds through
levels; training is the only growth past Level 15, and both bots under-train. If a properly
built bot confirms it, regular climbing becomes "just XP". The 72-route variety would then be
mostly flavour, which is a design question.

---

## 4. Answers to the original questions, as far as current evidence goes

| Question | Current answer | Confidence |
|---|---|---|
| Which characters need changes? | **Route Reader too strong** (wins 92% of 2-player games); **Sprinter far too weak** (2%). Free Solo strong (77%). Iron Lung and Technician sit in the middle. See Section 8. | **High** (planner, 2,000 games, 95% CIs) |
| Which cards? | Sequence Memorization and Crimp Sequence Decoder are **bugged**; measure again after the fix. Mountain Mentor does nothing for Technician and Free Solo, and dice gear does nothing for Free Solo (by design, but worth knowing). No other card value can be read from current data (F6). | High for the bugs |
| Broken mechanics? | **Training is too efficient**: +5 for 2 Time beats every other source of growth, so games are ~40 training sessions and ~5 climbs. Seat 1 wins 55%. Round-start order (fixed in the engine). Local vs engine rules gap. Expert variance is minor with good play. | High |
| Dominant strategy? | **Confirmed:** train toward the Milestones' gaps and climb almost only Milestones. It wins 100% of games against the old bots, which all climbed for XP. | High |

---

## 5. Proposed architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. RULES SPEC (data)      characters, routes, gear as effect DSL   │
│    one source → engine + game.js both interpret it (fixes F5)      │
├────────────────────────────────────────────────────────────────────┤
│ 2. OBSERVATION API        engine/observe.js                        │
│    compact JSON per decision, every number engine-computed:        │
│    exact P(send) per climb, effective reqs, sessions-to-ready,     │
│    XP-to-level, spendable XP, opponent race status                 │
├───────────────────────────────┬────────────────────────────────────┤
│ 3a. PLAYTEST BOT (fast)       │ 3b. HUMAN-FACING CPU               │
│  expectimax on exact probs +  │  same search, difficulty =         │
│  tuned priority weights;      │  budget + ε + personality weights; │
│  ms/decision, multi-core      │  LLM narrates "why" from obs JSON  │
├───────────────────────────────┴────────────────────────────────────┤
│ 4. BALANCE HARNESS        matrices with CIs, ablations, strategy   │
│    profiles, exploitability; LLM summarizes findings for designer  │
└────────────────────────────────────────────────────────────────────┘
```

### Layer 1: Rules spec

Keep `game.js` as the data owner, but describe every gear and ability effect with a small set of
**effect kinds**, some of which exist already (`effectKind`). Then write **one** interpreter and
make `game.js` call it. That takes a browser build of `engine/helpers.js`; there is a start on
one in the `pensive-ardinghelli` worktree (`engine/build-browser-helpers.js`). This:
- fixes F5 for good,
- makes "buff card X by one step" a one-line data change that bots pick up straight away, and
- gives an LLM the full rules as about 2 KB of JSON instead of a 650-line rulebook.

### Layer 2: Observation API (`engine/observe.js`)

One function, `observe(state, seat)`, returns about 200–400 tokens of JSON, for example:

```json
{
  "me": {"char":"technician","lvl":4,"stats":{"str":19,"tech":40,"foc":26,"flex":20},
         "end":[62,115],"time":7,"xp":{"spendable":40,"toNextLevel":160}},
  "milestones":[
    {"tier":"expert","wall":"lead","access":"need Lead Rope (120xp)",
     "pSend":0.00,"sessionsToReady":{"str":4,"flex":1}}],
  "actions":[
    {"i":3,"type":"climb","route":"Open Door","pSend":0.92,"time":3,"end":14,"evXp":24},
    {"i":7,"type":"milestone","tier":"beginner","pSend":0.58,"time":4,"end":20},
    {"i":9,"type":"train","stat":"str","closesGap":"expert str 4→3"}],
  "opponents":[{"char":"sprinter","ms":1,"pSendNextMs":0.31}]
}
```

`pSend` is enumerated exactly over the dice, with every character and gear rule applied, using
the same code path as `applyAction` so it can't drift. This one function serves the playtest bot,
the human-facing CPU, an LLM if you still want one, and the UI ("58% to send": a strong
learning aid for new players).

### Layer 3a: Playtest bot

Use **exact-probability expectimax** for the immediate action, plus a **parameterised priority
policy** for the rest of the game:
- Climb and Milestone outcomes are known distributions (send/fall with exact probabilities), so
  the bot doesn't need Monte Carlo noise for the step it is deciding.
- Score future value with a small set of weighted features: sessions-to-ready per Milestone,
  P(send) per Milestone, level progress, endurance buffer, access-card progress, and opponent
  race status.
- **Tune the weights separately for each character** with self-play search (CMA-ES or a plain
  grid: a few thousand fast games per character). That gives each character a near-best
  policy, which is exactly what F1 shows balance work needs.
- Target under 5 ms per decision. Run games in parallel on every core (`worker_threads`).
  10,000 games per balance question in minutes, not days.

The existing rollout agent stays useful as a **checker**: once rollouts share seeds across
actions, there are 32+ of them, and the XP term is gone, it can audit the tuned bot on sampled
positions.

### Layer 3b: Human-facing CPU

Use the same bot. **Difficulty** comes from (a) policy quality (untuned weights, then tuned),
(b) ε-noise, and (c) deliberate "human" mistakes such as skipping rest or buying gear on
impulse. **Personalities** come from weight biases, for example "Grinder" (Iron Lung flavour)
or "Planner" (trains first). An LLM can narrate *why*, reading the same observation JSON. That
is cheap, needs no strategic skill, and is the part a human actually sees.

### Layer 4: Balance harness

For each question, run thousands of games with tuned bots and report **win rates with
confidence intervals**, broken down by player count and seat:

| Question | Method |
|---|---|
| Is character X strong or weak? | Round robin with tuned bots; win rate and rounds-to-win, with 95% CI |
| What is card Y worth? | **Ablation:** remove Y from the deck, or give Y free at the start. Δ win rate = the card's value. Compare that with its XP cost |
| Is there a dominant strategy? | Tune 4–6 *fixed* strategy profiles (rusher, trainer, gear-stacker, grinder…), play them against each other, and look for one that beats all the others. Also measure how much a best-response bot beats each profile by |
| Is mechanic Z broken? | Compare the engine with Z against a variant without it (for example, a capped expert draw) on rounds-to-win, variance, and how often lead changes hands |

An LLM fits well **here**: give it the harness's structured output and ask "which change best
moves Free Solo toward 50% without touching Iron Lung?". It proposes, the harness tests. That is
the designer loop you're after, and every claim gets checked by simulation, not taken on the
model's word.

---

## 6. Recommended order of work

1. ~~**Fix the engine bugs** (F4, round-start order) and add tests.~~ **Done in v0.8.0** (`engine/test-rules-v08.js`).
2. ~~**Build `observe.js` with exact P(send)**, with a test that it matches `applyAction`
   frequencies over many seeds.~~ **Done**: `engine/observe.js`, tested by `engine/test-observe.js`
   and the Monte Carlo checks in `engine/test-rules-v08.js`.
3. ~~**Write the fast expectimax playtest bot** on top of it, with worker-thread parallelism.
   Check it beats the current heuristic and rollout bots.~~ **Done**: `sim/agents/planner.js`,
   `sim/run-balance.js` (Section 8).
4. ~~**Tune weights per character.** Re-run the round robin and solo sweeps **with CIs**.~~
   **Done**: `sim/tune-planner.js` → `sim/agents/planner-weights.json`.
5. ~~**Investigate expert Milestone variance** (3.5A).~~ **Done**: minor with good play. The
   real lever is **training efficiency** (Section 8).
6. **Card ablation sweep** across all 17 cards. *Small once 4 is done.*
7. **Unify rules** (`game.js` calls the engine interpreter; F5). *Medium. Do it before more
   local human playtests.*
8. **Swap the online Medium/Hard CPUs** to the new bot, with an LLM narrator as an option.
   *Small.*
9. **Retire or quarantine** the auto-recommendation text in `analysis/build-report.js` (F6) until
   the data comes from tuned bots.

---

## 7. Reproducing this audit

```bash
node analysis/audit/balance-sweep.mjs solo 200            # stock heuristic, solo rounds-to-win
node analysis/audit/balance-sweep.mjs solo 200 --fixed    # with character-awareness fix
node analysis/audit/balance-sweep.mjs pairs 100 --fixed   # 2-player round robin
node analysis/audit/oracle-self-agreement.mjs             # rollout argmax stability (~10 min)
node analysis/audit/rollout-latency.mjs                   # ms/decision by config
node analysis/audit/expert-milestone-spread.mjs           # static expert difficulty table
node analysis/audit/dice-gear-bug.mjs                     # F4 demonstration
```

All runs use engine v0.7.0 and seeded RNG; results are deterministic per seed range.

---

## 8. Results with the planner bot (engine v0.8.0)

### The bot

`sim/agents/planner.js` looks one step ahead using `observe()`. For each legal action it adds
the Time spent to the **expected Time still needed to finish**, then picks the lowest total.
Climbs and Milestone attempts branch on the exact pSend. The finish-time estimate
(`sim/agents/planner-model.js`) plans training and attempts together, and accounts for
Endurance, Lead access (including XP lost to a level-up) and the value of the next level.
Every character runs through one procedure: there are no per-character rules. Its send-chance
model **equals the engine's exactly** for every character when no stat-linking dice gear is
owned (3,024 cases, `sim/test-planner.js`).

| | Heuristic | Rollout ×3 (online Medium) | **Planner** |
|---|---|---|---|
| ms per decision | 0.2 | ~500–1,600 | **~3** |
| Solo games finished (300 seeds) | 93–99% | — | **100%** |
| Median solo rounds | 33–82 | — | **10–14** |
| Head-to-head vs planner | 0 / 1,600 | 0 / 36 | — |

A 2,000-game round robin runs in about 90 seconds on 9 cores. Weight tuning
(`sim/tune-planner.js`, per character, checked on held-out seeds) improved solo speed by only
0–0.5 rounds. The ranking below is the same with tuned and default weights.

### Character balance (2-player, tuned planner both seats, 100 games per ordered pair)

| Climber | Win rate [95% CI] | Median solo rounds |
|---|---|---|
| **Route Reader** | **92.4%** [90.3–94.0] | 10 |
| Free Solo | 77.4% [74.3–80.1] | 11 |
| Iron Lung | 40.9% [37.5–44.3] | 13 |
| Technician | 37.3% [34.0–40.7] | 13 |
| **Sprinter** | **2.1%** [1.3–3.4] | 14 (mean 16, p90 23) |

Seat 1 wins **54.7%** [52.5–56.9] of games.

The game is a race with little luck once it's played well, so a 1–2 round solo gap becomes a
near-certain head-to-head result. **Sprinter needs the biggest buff.** It needs the most training
(44 sessions a game), its extra Crux die makes Focus-heavy experts very slow (Clench Mode and
Professional Grade take 21–23 rounds), and half XP on sends removes its one compensation.
**Route Reader needs a nerf.** 3-of-4 lets it skip training its worst stat altogether: 26
sessions a game against 34–44 for everyone else.

*Caveat:* Sprinter is the character the bot plays least cleanly. It triggers the stall guard
about 1.4 times per game, against ≤0.1 for the others. Part of Sprinter's gap may be the bot.
Its solo speed is still the slowest under every weight set tried.

### What the bot found about the game

- **Training dominates everything else.** A session is +5 to a stat, for good, for 2 Time.
  A level-up gives roughly +10 spread over all four stats and costs 100–600 XP, at about 10–20
  XP per Time of climbing. So winning play is ~35–45 training sessions, the three Milestones,
  and ~5 other climbs (Free Solo: none at all). Most of the 69 regular routes barely matter,
  and tuning switched level credit off entirely for Iron Lung and Technician. Possible levers:
  raise training's Time or Endurance cost, shrink the bonus as it stacks, cap sessions per
  round, or make XP buy more.
- **The expert draw matters much less than the static table suggested.** With good play, solo
  game length ranges from ~11 rounds (Dyno Chain, Shoulder Shredder) to ~16 (World Class
  Leading 5.14a). Sprinter is the exception (up to 23). The long tails in Section 3.5A were the
  heuristic failing to train.
- **Gear is close to irrelevant in a ~12-round game.** Apart from the Lead access cards, no
  market card was bought in more than 19% of games. Mental Anchor and Crimp Sequence Decoder
  were never bought. This is weak evidence on card value, because the bot doesn't save XP for
  market gear. The next step is a proper ablation: start with card X versus card X removed.

### Reproduce

```bash
npm run test:bots                                          # planner model + behaviour tests
node sim/run-balance.js solo  --agent=planner-tuned        # rounds to win, per climber
node sim/run-balance.js pairs --agent=planner-tuned        # 2-player round robin
node sim/run-balance.js vs --agent=planner --opponent=heuristic
node sim/tune-planner.js                                   # re-tune weights after rule changes
```

Saved outputs: `results/planner-v0.8.0/`.

---

## 9. Rule experiments: reining in training (engine v0.8.0 + `state.rules`)

A game can now carry `rules` overrides (`createGame({ rules })`; see `trainingSpec` in
`engine/helpers.js`): training Time, bonus, Endurance multiplier, a per-stat training cap tied
to Level, and a sessions-per-round limit. `sim/run-variants.js` plays each variant with the
planner: 300 solo games and a 400-game 2-player round robin. For each variant it keeps
whichever gear-saving weight finishes fastest. Saved output: `results/planner-v0.8.0/variants.txt`.

| Variant | Mean solo rounds | Time on regular climbs | Market gear / game | Ends at Level | 2P win-rate spread |
|---|---|---|---|---|---|
| Standard rules | 12.9 | 13% | 0.6 | 2.4 | 91 pts |
| Training costs 3 Time | 17.8 | 9% | 0.6 | 2.4 | 83 |
| Training costs 4 Time | 24.2 | 7% | 0.6 | 2.4 | 81 |
| Training gives +3 | 24.3 | 7% | 0.7 | 2.3 | 71 |
| Training costs 2× Endurance | 13.7 | 13% | 0.6 | 2.4 | 91 |
| 1 session per round | 36.8 | 7% | 0.8 | 3.2 | 95 |
| 2 sessions per round | 22.3 | 7% | 0.5 | 2.5 | 74 |
| **Cap: training ≤ 10 + 5×(Level−1) per stat** | 37.4 | **35%** | **4.5** | **8.1** | 83 |
| Cap: training ≤ 5×Level per stat | 51.4 | 29% | 5.4 | 8.5 | 92 (94% finish) |
| Cap 10+5/Level and 2 per round | 41.0 | 32% | 5.3 | 8.1 | 86 |

**Making training cost more does not work.** Raising its price only slows the game, and climbing's
share of Time actually falls. Per-round limits turn the leftover Time into resting (43–61% of Time),
not climbing. **Only a Level-gated cap changes how the game is played.** Climbing rises to about a
third of Time, players reach Level 8, and they buy 4–5 market cards per game. Under the cap the
character order changes: Iron Lung 71% (falls earn XP), Free Solo 17% (it can only climb routes it
already beats, so it earns XP slowly), Route Reader still 98%. Resting takes 39% of Time, so
Endurance becomes the pacing limit.

Caveat: the planner was built and tuned under the standard rules. Under a cap it plays less
cleanly (the stall guard fires more often), so treat the cap rows as direction, not final numbers.
