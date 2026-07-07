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
//   node sim/run-llm-tournament.js --model=deepseek-r1:7b --opponents=technician,sprinter
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
import { notify, writeStatus, writeHeartbeat } from './tournament/heartbeat.js';

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
const MODEL         = args.model || 'deepseek-r1:7b';
const OPPONENTS     = (args.opponents || 'technician,sprinter').split(',');
// Default 60 min. Games that stalemate at the expert milestone need more
// than 45 min to resolve naturally; if the watchdog still fires, partial
// scoring in run-one-game.js captures the score-so-far anyway.
const GAME_TIMEOUT_MIN = Number(args['game-timeout-min'] || 60);
const RESET_MEMORY  = args['reset-memory'] === 'true';
const QUIET_NOTIFY  = args['quiet-notifications'] === 'true';
// Lite CPP: 'index' (default, LEGAL ACTIONS numbered) or 'tools'
// (semantic tool dispatch via engine.dispatchToolCall). See sim/agents/ollama.js.
const AGENT_MODE    = args['agent-mode'] || 'index';
if (!['index', 'tools', 'rollout'].includes(AGENT_MODE)) {
  console.error(`unknown --agent-mode "${AGENT_MODE}" (expected: index | tools | rollout)`);
  process.exit(1);
}
// Temp-ablation experiment: per-turn decision temperature for the LLM seat.
// null (flag omitted) = legacy 0.3 baseline. Planning/reflection unaffected.
const DECISION_TEMP = args['decision-temp'] != null ? Number(args['decision-temp']) : null;
if (DECISION_TEMP != null && !(DECISION_TEMP >= 0 && DECISION_TEMP <= 2)) {
  console.error(`--decision-temp must be a number in [0, 2] (got ${args['decision-temp']})`);
  process.exit(1);
}
// Reasoning-effort for thinking models (gpt-oss): --think=low|medium|high.
// Omit for non-thinking models (qwen2.5 rejects requests carrying `think`).
const THINK_LEVEL = args['think'] || null;
if (THINK_LEVEL != null && !['low', 'medium', 'high'].includes(THINK_LEVEL)) {
  console.error(`--think must be low | medium | high (got ${THINK_LEVEL})`);
  process.exit(1);
}
// Thermal management: minutes to sleep between iterations. The M5 sustains
// roughly 3 hours of continuous 7B inference before throttling collapses
// latency 10x (observed twice: iters 4-5 died at ~950s/decision). Cooldowns
// spread the thermal load. 0 = no cooldown (legacy).
const COOLDOWN_MIN  = Number(args['cooldown-min'] || 0);

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
console.log(`  agent mode:         ${AGENT_MODE}`);
console.log(`  decision temp:      ${DECISION_TEMP ?? '(default 0.3)'}`);
console.log(`  think level:        ${THINK_LEVEL ?? '(n/a — non-thinking model)'}`);
console.log(`  cooldown:           ${COOLDOWN_MIN} min between iterations`);
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

// --- Health probe lifecycle ---
//
// STATUS.txt + HEARTBEAT.txt + macOS popups so the user can verify the
// process is alive without tailing logs. Solves repeated false-kill incidents
// where 2-3 hour tournaments were stopped because they looked idle.
writeStatus(OUT_DIR, 'RUNNING', {
  character: CHARACTER, seed: SEED, model: MODEL,
  iterations: ITERATIONS, completedIters: 0,
  startedAt: new Date(tournamentStartedAt).toISOString(),
});
notify('Tournament started',
  `${CHARACTER} × ${ITERATIONS} iter on ${MODEL}\nOutput: ${OUT_DIR}`,
  { quiet: QUIET_NOTIFY });

// SIGINT/SIGTERM handlers — record INTERRUPTED state so the user knows the
// difference between "killed mid-run" and "exited cleanly".
let interrupted = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (interrupted) return;
    interrupted = true;
    writeStatus(OUT_DIR, 'INTERRUPTED', {
      signal: sig,
      iterCompletedSoFar: scoreTrajectory.length,
      scoreTrajectory: `[${scoreTrajectory.join(', ')}]`,
      stoppedAt: new Date().toISOString(),
    });
    notify('Tournament INTERRUPTED',
      `Stopped at iter ${scoreTrajectory.length + 1}/${ITERATIONS}\nscores so far: [${scoreTrajectory.join(', ')}]`,
      { quiet: QUIET_NOTIFY, sound: 'Sosumi' });
    process.exit(130);
  });
}

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
      // Heartbeat — rewrites HEARTBEAT.txt every progress tick (~60s). A stale
      // mtime on that file is the signal that the LLM is hung mid-decision.
      writeHeartbeat(OUT_DIR, {
        iterNum: iter, totalIters: ITERATIONS, watchdogMin: GAME_TIMEOUT_MIN,
        iterStartTime: iterStartedAt, progress: p, scoreHistory: scoreTrajectory,
      });
    };

    const result = await runOneGame({
      seed: SEED,
      characterKeys: CHARACTERS_IN_ORDER,
      agentNames: AGENTS,
      policySeed: SEED + 1000 + iter * 100,   // vary heuristic randomness per iter; LLM is qualitative
      turnTimeoutMs: 180000,
      gameTimeoutMs: GAME_TIMEOUT_MIN * 60 * 1000,
      agentMode: AGENT_MODE,
      decisionTemperature: DECISION_TEMP,
      thinkLevel: THINK_LEVEL,
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
    // Notify on non-watchdog failures too — previously these silently vanished
    // from the trajectory and left the user with 30+ min gaps between popups.
    // (Watchdog no longer throws — it returns a summary with reason='game_watchdog'.)
    notify(`Iter ${iter}/${ITERATIONS} FAILED`,
      err.message.slice(0, 140),
      { quiet: QUIET_NOTIFY, sound: 'Basso' });
    writeStatus(OUT_DIR, 'RUNNING', {
      completedIters: scoreTrajectory.length,
      lastIterError: err.message.slice(0, 200),
      scoreTrajectory: `[${scoreTrajectory.join(', ')}]`,
      updated: new Date().toISOString(),
    });
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
  // Distinguish natural completion from watchdog termination. Watchdog games
  // still produce a valid score (partial milestones counted) and still run
  // reflection — they're just labeled differently for the user.
  const isWatchdog = summary?.reason === 'game_watchdog';
  const endLabel = isWatchdog ? `game watchdog fired at r${summary.rounds}` : 'game complete';
  console.log(`  ${isWatchdog ? '⏱' : '✓'} ${endLabel} in ${((Date.now() - iterStartedAt) / 60000).toFixed(1)} min — score=${llmScore.score} (win=${llmScore.win}, ms=${llmScore.milestonesCompleted}/3, ability=${llmScore.abilityTriggers})`);
  console.log(`  reflecting...`);
  // Iter-complete signal — popup + status refresh. Most important checkpoint
  // for the user: confirms forward progress even if the next iter is slow.
  writeStatus(OUT_DIR, 'RUNNING', {
    completedIters: iter, of: ITERATIONS,
    lastScore: llmScore.score, lastMilestones: `${llmScore.milestonesCompleted}/3`,
    lastEnd: isWatchdog ? 'watchdog' : 'natural',
    scoreTrajectory: `[${[...scoreTrajectory].join(', ')}]`,
    updated: new Date().toISOString(),
  });
  const titlePrefix = isWatchdog ? `Iter ${iter}/${ITERATIONS} watchdog` : `Iter ${iter}/${ITERATIONS} done`;
  notify(`${titlePrefix} — score ${llmScore.score}`,
    `${llmScore.milestonesCompleted}/3 milestones, ${llmScore.abilityTriggers} ability uses\nTrajectory: [${scoreTrajectory.join(', ')}]`,
    { quiet: QUIET_NOTIFY, sound: isWatchdog ? 'Basso' : 'Glass' });

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

  // Thermal cooldown between iterations (skip after the last one). STATUS.txt
  // reflects the pause so a fresh mtime + "COOLING" reads as intentional,
  // not a hang — the HEARTBEAT stops updating during the sleep by design.
  if (COOLDOWN_MIN > 0 && iter < ITERATIONS) {
    console.log(`  ❄ cooling ${COOLDOWN_MIN} min before iteration ${iter + 1}...`);
    writeStatus(OUT_DIR, 'COOLING', {
      completedIters: iter, of: ITERATIONS,
      resumesAt: new Date(Date.now() + COOLDOWN_MIN * 60000).toISOString(),
      scoreTrajectory: `[${scoreTrajectory.join(', ')}]`,
    });
    await new Promise(r => setTimeout(r, COOLDOWN_MIN * 60000));
    writeStatus(OUT_DIR, 'RUNNING', {
      completedIters: iter, of: ITERATIONS,
      scoreTrajectory: `[${scoreTrajectory.join(', ')}]`,
      updated: new Date().toISOString(),
    });
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

// Final terminal-state signals. Pick the right status based on whether all
// iterations actually produced scores (partial completion is still a useful
// run, but we surface it differently).
const allRan = scoreTrajectory.length === ITERATIONS;
const trajStr = `[${scoreTrajectory.join(', ')}]`;
const bestStr = scoreTrajectory.length ? Math.max(...scoreTrajectory) : '—';
writeStatus(OUT_DIR, allRan ? 'COMPLETE' : 'PARTIAL', {
  completedIters: scoreTrajectory.length, of: ITERATIONS,
  scoreTrajectory: trajStr,
  best: bestStr,
  elapsedMin: totalMin,
  completedAt: new Date().toISOString(),
});
notify(allRan ? 'Tournament COMPLETE' : 'Tournament partial',
  `${scoreTrajectory.length}/${ITERATIONS} iters, best=${bestStr}\nTrajectory: ${trajStr}`,
  { quiet: QUIET_NOTIFY, sound: allRan ? 'Hero' : 'Glass' });
