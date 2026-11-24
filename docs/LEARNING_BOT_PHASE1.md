# Learning CPU — Phase 1: a learned value model on top of the planner

**Status (2026-11-22): gate not passed — nothing promoted.** The Hard CPU is unchanged
(`engine/value-weights.js` is `null`). The pipeline, the model code and the arena are kept,
switched off, for the next attempt and for Phases 2–4.

## What was tried

The plan (see the Phase 0 PR) was AlphaZero-shaped: keep the planner's one-step search as the
decider and replace its hand-built finish-time estimate with a learned one.

- `engine/value-model.js` — a 1-hidden-layer network (plain JS, runs in Node, the Worker and the
  browser bundle) that adds a correction to `timeToFinish`, plus a per-character adapter
  (bias + scale on the estimate). Features describe the climber by traits, not name. A zero model
  is exactly the planner (`engine/test-value-model.js`).
- `engine/planner.js` takes `value` (weights); `null` = the plain planner (the default everywhere).
- `sim/learn/selfplay.js` — solo self-play data, Grit rules, training seeds < 100000.
- `sim/learn/train.js` — the trainer (seed-split validation, early stop).
- `sim/learn/arena.js` — the gate on held-out seeds (100000+): paired solo speed, and head-to-head
  vs Hard with seats swapped. Pass = head-to-head 95% CI lower bound > 50% and solo not slower.
  `--promote` writes the weights only on a pass.

## Results

Prediction is the validation RMSE of "Time actually used to finish" (planner units). For
reference, the raw planner estimate scores 149–152, and the best affine rescale of it 49–51.
Arena screens used 40 solo seeds per character and 10 head-to-head seeds per ordered pair
(400 games).

| Candidate | Labels | Network reads | Prediction RMSE | Solo vs Hard (rounds) | Head-to-head vs Hard |
|---|---|---|---|---|---|
| c1 | the behaviour game's own outcome | all 23 features | **32.5** | +47.0 (100 seeds, 80-round cap) | 3.8% |
| r1 | Hard rollouts from explored states (ε = 0.15) | all 23 features | **31.7** | +36.3 (80-round cap) | 18.0% |
| r2 | Hard rollouts | estimate parts + traits | 37.6 | +30.0 (60-round cap) | 0.5% |
| r3 | Hard rollouts | secondary parts + traits, slope on the estimate fixed at 1 | 90.6 | +31.6 (60-round cap) | 0.0% |

Every candidate predicted finish time far better than the planner, and every candidate played
far worse: most learned games stalled until the round cap.

## Why it failed (diagnosed, in order)

1. **Confounding (c1).** Trained on Hard's own games, the model learned correlations, not
   consequences — e.g. full Endurance occurs early, when much Time remains, so "resting makes
   things worse". The bot stopped resting and ended its turn forever.
2. **Exploiting a spurious feature (r1).** With rollout labels from explored states (approximate
   policy iteration) the bot improved to 18% but found a new hole: Free Solo gains Grit every
   round, and lots of Grit means "near the end" in Hard's games, so it ended turns to hoard Grit
   (249) instead of attempting its Expert. A greedy player searches for the value model's errors.
3. **Attenuation (r1, r2).** Regressing real outcomes on the planner's noisy estimate shrinks the
   fitted slope (0.38 overall; adapters −0.15 to −0.34). Future gains from training then look
   smaller than the Time they cost now, so the bot under-invests.
4. **Decision-scale noise (all).** The deciding gaps between a state's actions are 1–5 Time; the
   model's correction varies 10–20 Time between neighbouring states for reasons unrelated to the
   action. Any model fitted to *levels* with an RMSE of 30–90 is noise at the scale of a decision.

## What would be needed

Learn the *difference between actions*, not the level: from sampled states, roll out each
candidate action many times with matched dice and train an advantage model on the contrasts.
With a rollout standard deviation of ~25 Time, resolving 1-Time gaps needs on the order of
100 paired rollouts per action per state (~15 s each on one core). The planner is already near
the optimum in a race with little luck (audit §8), so the possible gain is small for a large
compute bill.

## What is still useful

- The finish-time **predictor** works (RMSE 31.7 vs 48.9 for the best rescaled planner). That is
  what Phase 4 needs: estimating a player's remaining pace for adaptive difficulty, and pacing
  hints — prediction, not control.
- The arena is a reusable, fast gate for any future CPU change (a stalling candidate fails in
  under a minute with the 60-round cap).
- The rollout-labelling pipeline is the data source for an advantage model if this is revisited.

## Reproduce

```
npm run learn:data                     # rollout-labelled self-play data (~15 min, all cores)
npm run learn:train -- --data=sim/learn/data/rollout-hard.jsonl --out=sim/learn/out/candidate.json
npm run learn:arena -- --weights=sim/learn/out/candidate.json --solo=40 --h2h=10
```

Candidate-specific flags: c1 `selfplay --labels=game` and `train --features=<all>`;
r2 = the trainer's default features; r3 `--features=access,endurance,levelCredit,gearCredit,pending,timeNow,startStats,growth,startEndurance --no-scale`.
