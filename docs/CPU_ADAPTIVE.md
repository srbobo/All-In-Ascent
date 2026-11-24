# Learning CPU — Phase 4: player profiles and the Adaptive CPU

**Status (2026-11-22): built.** The CPU now learns *about the player*: every finished game
against CPUs updates the player's rating, and the **Adaptive** CPU plays at that rating so games
stay close. (Phase 1 showed that making the CPU itself stronger by learning is not worth it
here — see `docs/LEARNING_BOT_PHASE1.md`.)

## How it works

- **Strength curve** (`engine/cpu.js` `CPU_STRENGTH`): the tuned planner playing a random legal move
  with probability ε, rated on an Elo scale where Hard = 1600. Measured by
  `sim/learn/calibrate-epsilon.js` (ε-Hard vs Hard, every ordered character pair, seats swapped,
  480 games per point, Grit rules):

  | ε | win % vs Hard | rating |
  |---|---|---|
  | 0 | — | 1600 (Hard) |
  | 0.05 | 46.9% | 1578 |
  | 0.1 | 42.3% | 1546 (≈ Medium, 1540) |
  | 0.2 | 35.6% | 1497 |
  | 0.35 | 21.3% | 1372 (≈ Easy, 1375) |
  | 0.5 | 13.1% | 1272 |
  | 0.7 | 2.5% | 964 |

- **Player rating** (`engine/player-profile.js` `updateProfile`): Elo against the CPUs in the game —
  K/n · Σ (score − expected) over the n CPU opponents; score 1 / ½ / 0 by standings. K = 48 for the
  first 10 CPU games, then 24. New players start at Medium's 1540. Games with humans only do not
  move the rating. Only games with exactly one human count (a hot-seat table shares one browser).
- **Adaptive CPU** (`createCpuAgent('adaptive', { rating })`): ε from the curve at the player's
  rating (linear between points; Hard above 1600, ε 0.7 below 964). Online it plays the mean rating
  of the humans at the table.
- **Where the profile lives**: only in the player's browser (`player-profile-store.js`,
  localStorage), in local and online play alike — online usernames are not accounts, so a
  server-side profile could be claimed by anyone. Online clients send only their rating
  (`set_rating`, clamped by the room); each client updates its own profile from the final state.
  Nothing in a profile identifies the player.
- **Records**: match and replay records carry `botRating` for Adaptive seats.

## On screen

- Setup screen: "Your climbing record" — rating, games, wins and losses vs CPUs, what the
  Adaptive CPU currently plays like, and a two-click reset.
- Post-game summary (local and online): "Your rating 1540 → 1562 +22 · vs Adaptive CPU".

## Tests

`engine/test-player-profile.js` (curve, mapping, rating maths, sanitising, records — and an
Adaptive CPU at Easy's rating winning about as often as Easy against Hard), the bundle parity
check, `party/_telemetry-test.js` (set_rating, the table rating), and e2e specs for a local win
against an Adaptive CPU (rating change, kept after reload, reset) and an online Adaptive game.
