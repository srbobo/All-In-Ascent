// Tournament harness for the in-context learning experiment.
//
// Plays a single seed N times in a row, with one LLM seat that:
//   - reads the accumulated memory file before each game (Phase 3),
//   - plays the game (Phase 1 + 2 — strategy, decisions, shift detection),
//   - is shown its score at game end and reflects on what happened (Phase 2),
//   - has the reflection + score + strategy appended to memory (Phase 3),
//   - reads the now-bigger memory at the START of the next game.
//
// The point of the experiment is to see whether the LLM's score TRENDS UP
// across the N iterations as memory accumulates. If yes, the in-context
// learning mechanism is working as designed.
//
// USAGE:
//   node sim/run-llm-tournament.js
//   node sim/run-llm-tournament.js --character=ironLung --seed=1 --iterations=5
//   node sim/run-llm-tournament.js --model=qwen2.5:7b-instruct --opponents=technician,sprinter
//
// Output dir: results/tournament-<character>-seed<seed>-<date>/
//   memory-<character>.json   — accumulating per-character memory file
//   iter-1.jsonl              — game 1 JSONL (including new reflection events)
//   iter-2.jsonl              — game 2 ...
//   tournament-summary.json   — score trajectory + per-iteration meta

import fs from 'node:fs';
import path from 'node:path';
import { createOllamaAgent } from './agents/ollama.js';
import { runOneGame, createJsonlWriter } from './run-one-game.js';
import { scoreGame } from '../analysis/score-game.js';
import { CHARACTERS } from '../engine/data.js';
import { loadMemory, appendGameToMemory, saveMemory, formatMemoryForPrompt } from './tournament/memory.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    out[k] = v ?? 'true';
  }
  return out;
}

const args = parseArgs(process.argv);

// Tournament configuration
const CHARACTER     = args.character || 'ironLung';
const SEED          = Number(args.seed || 1);
const ITERATIONS    = Number(args.iterations || 5);
const MODEL         = args.model || 'qwen2.5:7b-instruct';
const OPPONENTS     = (args.opponents || 'technician,sprinter').split(',');
const GAME_TIMEOUT_MIN = Number(args['game-timeout-min'] || 60);
const RESET_MEMORY  = args['reset-memory'] === 'true';

if (!CHARACTERS[CHARACTER]) {
  console.error(`unknown character: ${CHARACTER}. Available: ${Object.keys(CHARACTERS).join(', ')}`);
  process.exit(1);
}
if (OPPONENTS.length < 1 || OPPONENTS.length > 3) {
  console.error(`opponents must be 1-3 characters (got ${OPPONENTS.length})`);
  process.exit(1);
}
if (OPPONENTS.includes(CHARACTER)) {
  console.error(`character "${CHARACTER}" cannot also be an opponent`);
  process.exit(1);
}

// Seats: opponents first (heuristic), LLM character last. Seat 1 starts the
// turn rotation under the time-max rule.
const CHARACTERS_IN_ORDER = [...OPPONENTS, CHARACTER];
const AGENTS = [...OPPONENTS.map(() => 'heuristic'), `ollama:${MODEL}`];
const LLM_SEAT = CHARACTERS_IN_ORDER.length; // 1-based seat index

const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = args['output-dir'] || `results/tournament-${CHARACTER}-seed${SEED}-${DATE}`;
fs.mkdirSync(OUT_DIR, { recursive: true });

// Reset memory at start of tournament if requested (default: continue from
// any existing file in the output dir — useful for resuming a stopped run).
if (RESET_MEMORY) {
  const memPath = path.join(OUT_DIR, `memory-${CHARACTER}.json`);
  if (fs.existsSync(memPath)) fs.unlinkSync(memPath);
}

console.log(`╔════════════════════════════════════════════════════════════════╗`);
console.log(`║ LLM TOURNAMENT — in-context learning experiment                 ║`);
console.log(`╠════════════════════════════════════════════════════════════════╣`);
console.log(`  character (LLM):    ${CHARACTER} (${CHARACTERS[CHARACTER].name})`);
console.log(`  opponents (heur):   ${OPPONENTS.join(' / ')}`);
console.log(`  seed (same every iteration): ${SEED}`);
console.log(`  iterations:         ${ITERATIONS}`);
console.log(`  model:              ${MODEL}`);
console.log(`  game watchdog:      ${GAME_TIMEOUT_MIN} min/iteration`);
console.log(`  output dir:         ${OUT_DIR}`);
console.log(`  reset memory:       ${RESET_MEMORY}`);
console.log(`╚════════════════════════════════════════════════════════════════╝`);
console.log();

// Agents are built inside runOneGame from the agentNames array — no extra
// instance-management needed here. The LLM agent's `currentStrategy` closure
// is per-instance, so each iteration gets a fresh agent and a clean per-game
// strategic state (the cross-game memory is the persistence mechanism).

const scoreTrajectory = [];
const tournamentStartedAt = Date.now();

for (let iter = 1; iter <= ITERATIONS; iter++) {
  const iterStartedAt = Date.now();
  const outPath = path.join(OUT_DIR, `iter-${iter}.jsonl`);

  // Skip if we already completed this iteration (resumability).
  if (fs.existsSync(outPath)) {
    try {
      const lines = fs.readFileSync(outPath, 'utf8').trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1]);
      if (last?.kind === 'run_summary' || last?.type === 'game_reflection') {
        console.log(`[${iter}/${ITERATIONS}] iteration already complete — SKIPPED`);
        const { scores } = scoreGame(outPath);
        const llmScore = scores.find(s => s.seat === LLM_SEAT);
        if (llmScore) scoreTrajectory.push(llmScore.score);
        continue;
      }
    } catch { /* fall through and re-run */ }
  }

  // Load memory at the START of each iteration. The very first iteration's
  // memory is empty (or whatever was on disk).
  let memory = loadMemory(OUT_DIR, CHARACTER);
  memory.model = MODEL;
  if (!memory.createdAt) memory.createdAt = new Date().toISOString();
  const memoryContext = formatMemoryForPrompt(memory);

  // Per-seat memory: only the LLM seat (last) gets the memory block.
  const seatMemoryContexts = CHARACTERS_IN_ORDER.map((_, i) =>
    (i + 1 === LLM_SEAT) ? memoryContext : null
  );

  console.log(`──── Iteration ${iter}/${ITERATIONS} ─────────────────────────────────`);
  console.log(`  memory size: ${memory.games.length} prior games`);
  if (memory.games.length) {
    const lastScores = memory.games.map(g => g.scoreData?.score ?? 0);
    console.log(`  score history before this iter: [${lastScores.join(', ')}]`);
  }

  const writer = createJsonlWriter(outPath);
  let summary, finalState, initialStrategyEvent, strategyUpdates;
  try {
    const onProgress = (p) => {
      const min = (ms) => (ms / 60000).toFixed(1);
      const seats = p.perAgentStats.map(s =>
        `${s.agent.startsWith('ollama') ? 'L' : 'H'}${s.seat}=${s.avgLatencyMs}ms·${s.fallbacks}fb`
      ).join(' ');
      const ms = p.milestoneProgress.map(m => m.done).join('/');
      process.stdout.write(`    [iter=${iter}] r${p.round} step=${p.step} ${min(p.elapsedMs)}m ${seats} ms=${ms}\n`);
    };

    const result = await runOneGame({
      seed: SEED,
      characterKeys: CHARACTERS_IN_ORDER,
      agentNames: AGENTS,
      policySeed: SEED + 1000 + iter * 100,   // vary heuristic randomness per iter; LLM is qualitative
      turnTimeoutMs: 90000,
      gameTimeoutMs: GAME_TIMEOUT_MIN * 60 * 1000,
      seatMemoryContexts,
      writer,
      onProgress,
      progressIntervalMs: 60000,
    });
    summary = result.summary;
    finalState = result.finalState;
  } catch (err) {
    await writer.close();
    console.error(`  [iter=${iter}] FAILED: ${err.message}`);
    continue;
  }

  // Score the game using Phase 1's scoring module (reads JSONL we just wrote).
  // MUST await close() — stream.end() is asynchronous, the run_summary line
  // can still be buffered if we read the file before flush completes.
  await writer.close();
  const { scores } = scoreGame(outPath);
  const llmScore = scores.find(s => s.seat === LLM_SEAT);
  if (!llmScore) {
    console.error(`  [iter=${iter}] could not extract score for LLM seat`);
    continue;
  }
  scoreTrajectory.push(llmScore.score);

  // Read back the strategy events we emitted during play.
  const fileLines = fs.readFileSync(outPath, 'utf8').trim().split('\n').map(JSON.parse);
  initialStrategyEvent = fileLines.find(l => l.type === 'strategy_initial' && l.payload.seat === LLM_SEAT);
  strategyUpdates = fileLines.filter(l => l.type === 'strategy_update' && l.payload.seat === LLM_SEAT).map(l => l.payload);

  // Run reflection. We need the LLM agent instance — pull it back out of
  // the runner is awkward, so we just build a fresh one. Reflection is a
  // one-shot LLM call; the model has all the context it needs in the prompt.
  console.log(`  ✓ game complete in ${((Date.now() - iterStartedAt) / 60000).toFixed(1)} min — score=${llmScore.score} (win=${llmScore.win}, ms=${llmScore.milestonesCompleted}/3, ability=${llmScore.abilityTriggers})`);
  console.log(`  reflecting...`);

  const reflectionAgent = createOllamaAgent({ model: MODEL, timeoutMs: 120000 });
  const reflectionT0 = Date.now();
  let reflection = null;
  try {
    const llmPlayer = finalState.players[LLM_SEAT - 1];
    const result = await reflectionAgent.reflectOnGame({
      finalState,
      player: llmPlayer,
      scoreData: llmScore,
      initialStrategy: initialStrategyEvent?.payload?.strategy,
      strategyUpdates,
    });
    reflection = result.reflection;

    // Emit a game_reflection event into the iteration's JSONL so it's
    // self-contained even outside the memory file.
    const reflectionEvent = {
      type: 'game_reflection',
      payload: {
        seat: LLM_SEAT,
        agent: AGENTS[LLM_SEAT - 1],
        characterKey: CHARACTER,
        latencyMs: Date.now() - reflectionT0,
        promptTokens: result.promptTokens,
        responseTokens: result.responseTokens,
        scoreData: llmScore,
        reflection,
      },
    };
    fs.appendFileSync(outPath, '\n' + JSON.stringify(reflectionEvent));
  } catch (err) {
    console.error(`  reflection failed: ${err.message}`);
  }

  // Append to memory + persist.
  if (reflection) {
    memory = appendGameToMemory(memory, {
      seed: SEED,
      scoreData: llmScore,
      initialStrategy: initialStrategyEvent?.payload?.strategy,
      strategyShifts: strategyUpdates,
      reflection,
    });
    saveMemory(OUT_DIR, memory);
    console.log(`  ✓ reflection appended — memory now has ${memory.games.length} games`);
    if (reflection.advice_for_next_game) {
      console.log(`    advice: ${reflection.advice_for_next_game.slice(0, 100)}${reflection.advice_for_next_game.length > 100 ? '...' : ''}`);
    }
  }
  console.log();
}

// Tournament summary
const totalMin = ((Date.now() - tournamentStartedAt) / 60000).toFixed(1);
console.log(`╔════════════════════════════════════════════════════════════════╗`);
console.log(`║ TOURNAMENT COMPLETE                                              ║`);
console.log(`╠════════════════════════════════════════════════════════════════╣`);
console.log(`  elapsed:           ${totalMin} min`);
console.log(`  iterations run:    ${scoreTrajectory.length} / ${ITERATIONS}`);
console.log(`  score trajectory:  [${scoreTrajectory.join(', ')}]`);
if (scoreTrajectory.length >= 2) {
  const first = scoreTrajectory[0];
  const last = scoreTrajectory[scoreTrajectory.length - 1];
  const delta = last - first;
  const sign = delta > 0 ? '+' : '';
  console.log(`  first → last:      ${first} → ${last}  (${sign}${delta})`);
  const best = Math.max(...scoreTrajectory);
  const bestIter = scoreTrajectory.indexOf(best) + 1;
  console.log(`  best score:        ${best} (iteration ${bestIter})`);
}
console.log(`  output dir:        ${OUT_DIR}`);
console.log(`╚════════════════════════════════════════════════════════════════╝`);

// Persist tournament summary
fs.writeFileSync(path.join(OUT_DIR, 'tournament-summary.json'), JSON.stringify({
  character: CHARACTER,
  seed: SEED,
  iterations: ITERATIONS,
  model: MODEL,
  opponents: OPPONENTS,
  scoreTrajectory,
  elapsedMin: Number(totalMin),
  completedAt: new Date().toISOString(),
}, null, 2));
