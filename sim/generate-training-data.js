// AlphaZero-style training-data generator (distillation pipeline, phase Z1).
//
// Runs pure-rollout games (no LLM anywhere — ~1s/decision, no thermal load)
// and emits one training pair per collect-seat decision:
//
//   { "messages": [ {role:"system", ...}, {role:"user", ...},
//                   {role:"assistant", content: "{\"action_index\": N, ...}"} ],
//     "meta": { seed, character, round, actionType, evBest, evSpread, nActions } }
//
// The prompt is byte-identical to what the tournament harness sends in index
// mode (imported from sim/agents/ollama.js), so a model fine-tuned on these
// pairs is trained on exactly the distribution it will be evaluated on. The
// assistant target imitates the ROLLOUT-BEST action — the search is the
// teacher, per the AlphaZero recipe (imitate your own search, not a human
// and not the model's own guesses).
//
// Diversity axes:
//   - seeds: --seeds=2..61 style ranges (seed 1 EXCLUDED by default — it is
//     the eval seed used by every in-game measurement to date)
//   - characters: the collect seat cycles through ALL characters, opponents
//     rotate too (character-agnostic requirement — the tuned model must not
//     be an Iron Lung specialist)
//
// Split discipline: hold out whole GAMES, not sampled examples — examples
// within a game are heavily correlated, so an example-level split leaks.
// This script only tags each pair with its game id; the actual split into
// train/valid/test files happens in the companion split step (see USAGE).
//
// USAGE:
//   node sim/generate-training-data.js --games=50 --out=training-data/run1
//   node sim/generate-training-data.js --games=2 --seed-start=900   # pilot
//
// Output: <out>/pairs.jsonl (one pair per line) + <out>/manifest.json

import fs from 'node:fs';
import path from 'node:path';
import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction, isTerminal } from '../engine/engine.js';
import { CHARACTERS } from '../engine/data.js';
import { evaluateActions } from './agents/rollout.js';
import { createHeuristicAgent } from './agents/heuristic.js';
import { buildSystemPrompt, buildUserPrompt, extractRecentHistory } from './agents/ollama.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

const args = parseArgs(process.argv);
const GAMES = Number(args.games || 50);
const SEED_START = Number(args['seed-start'] || 2);   // seed 1 reserved for eval
const ROLLOUTS = Number(args.rollouts || 8);
const MAX_STEPS = Number(args['max-steps'] || 900);
// Round cap: games that haven't terminated by here are stalemates (the seed-900
// pilot ground to r70+ with no end in sight). Pre-cap decisions are still
// good labels; post-cap stalemate grinding is low-value and unboundedly slow.
const MAX_ROUNDS = Number(args['max-rounds'] || 45);
const OUT_DIR = args.out || `training-data/gen-${new Date().toISOString().slice(0, 10)}`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const pairsPath = path.join(OUT_DIR, 'pairs.jsonl');
const pairsFd = fs.openSync(pairsPath, 'w');

// Short, honest rationale for the target JSON. Descriptive of the action —
// deliberately NOT the EV numbers (the model can't know those at inference;
// training it to fabricate them would teach confabulation).
function templateRationale(action) {
  switch (action.type) {
    case 'train':     return `Training at ${action.areaName} — closing the key stat gap.`;
    case 'rest':      return `Resting to restore endurance before the next push.`;
    case 'climb':     return `Climbing ${action.routeName} for XP and progression.`;
    case 'milestone': return `Attempting the ${action.difficulty} milestone now — requirements are met.`;
    case 'buyGear':   return `Buying ${action.gearName} to unlock better options.`;
    case 'endTurn':   return `Passing — no action improves my position this turn.`;
    default:          return `Taking the strongest available action.`;
  }
}

const allChars = Object.keys(CHARACTERS);
const heuristic = createHeuristicAgent();
const startedAt = Date.now();
let totalPairs = 0;
const gameSummaries = [];

console.log(`Training-data generation: ${GAMES} games, seeds ${SEED_START}..${SEED_START + GAMES - 1}, ${ROLLOUTS} rollouts/action`);
console.log(`Output: ${pairsPath}\n`);

for (let g = 0; g < GAMES; g++) {
  const seed = SEED_START + g;
  // Collect seat cycles through every character; opponents rotate so pairings
  // vary too. Collect seat is always seat 3 (index 2) — matches the
  // tournament topology (2 heuristic opponents + measured seat).
  const collectChar = allChars[g % allChars.length];
  const others = allChars.filter(c => c !== collectChar);
  const opp1 = others[g % others.length];
  const opp2 = others[(g + 1) % others.length] === opp1
    ? others[(g + 2) % others.length]
    : others[(g + 1) % others.length];
  const characterKeys = [opp1, opp2, collectChar];
  const collectSeatIndex = 2;

  let { state: s } = createGame({ seed, characterKeys });
  let steps = 0;
  let pairs = 0;
  const t0 = Date.now();

  while (steps < MAX_STEPS && s.round <= MAX_ROUNDS) {
    const term = isTerminal(s);
    if (term.done) break;
    const legal = getLegalActions(s);
    if (!legal.length) break;

    if (s.currentPlayerIndex === collectSeatIndex) {
      const player = s.players[collectSeatIndex];
      const { evals, bestIndex } = await evaluateActions(
        s, legal, collectSeatIndex, { rolloutsPerAction: ROLLOUTS });

      // Build the exact tournament prompt (index mode, no strategy block —
      // matches a fresh-game turn; strategy-conditioned prompts are a later
      // refinement if v1 shows promise).
      const recentHistory = extractRecentHistory(s, player.playerNum, 8);
      const systemPrompt = buildSystemPrompt(player.character.key, true);
      const userPrompt = buildUserPrompt(s, legal, player, recentHistory, null);
      const target = JSON.stringify({
        action_index: bestIndex,
        rationale: templateRationale(legal[bestIndex]),
      });

      const evs = evals.map(e => e.mean);
      const pair = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: target },
        ],
        meta: {
          gameId: g, seed, character: collectChar, round: s.round,
          actionType: legal[bestIndex].type,
          nActions: legal.length,
          evBest: +evs[bestIndex].toFixed(2),
          // Spread between best and second-best: low spread = near-tie
          // (noisy label), high spread = decisive label. Enables filtering
          // or weighting at training time.
          evMargin: +(evs[bestIndex] - Math.max(...evs.filter((_, i) => i !== bestIndex), -Infinity)).toFixed(2),
        },
      };
      fs.writeSync(pairsFd, JSON.stringify(pair) + '\n');
      pairs++; totalPairs++;

      ({ state: s } = applyAction(s, legal[bestIndex]));
    } else {
      const picked = await heuristic.chooseAction({ state: s, legalActions: legal });
      const idx = Number.isInteger(picked?.actionIndex) && picked.actionIndex >= 0 && picked.actionIndex < legal.length
        ? picked.actionIndex : legal.length - 1;
      ({ state: s } = applyAction(s, legal[idx]));
    }
    // Sliding window on the outer game's event log. applyAction (and every
    // rollout root) structuredClones the whole state, so an unbounded event
    // log makes per-decision cost grow quadratically over a long game. The
    // prompt's recent-history block only reads the last few per-player
    // events, so a 400-event tail loses nothing that matters.
    if (s.events.length > 400) s.events = s.events.slice(-400);
    steps++;
  }

  const term = isTerminal(s);
  const me = s.players[collectSeatIndex].character;
  const ms = ['beginner', 'intermediate', 'expert'].filter(t => me.milestonesCompleted[t]).length;
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  gameSummaries.push({ gameId: g, seed, character: collectChar, pairs, rounds: s.round, milestones: ms, reason: term.reason || 'step_cap' });
  console.log(`[${g + 1}/${GAMES}] seed=${seed} ${collectChar.padEnd(11)} ${sec}s pairs=${pairs} rounds=${s.round} ms=${ms}/3 ${term.reason || 'step_cap'}`);
}

fs.closeSync(pairsFd);
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
  games: GAMES, seedStart: SEED_START, rollouts: ROLLOUTS,
  totalPairs, elapsedMin: +((Date.now() - startedAt) / 60000).toFixed(1),
  characterRotation: allChars, gameSummaries,
}, null, 2));

console.log(`\nDone: ${totalPairs} pairs from ${GAMES} games in ${((Date.now() - startedAt) / 60000).toFixed(1)} min`);
console.log(`Next: split by GAME into train/valid/test before training (never split by example).`);
