// 3-player LLM smoke test — extends the 2-player smoke (run-llm-smoke.js).
//
// Default matchup: heuristic baseline + 2 LLM seats. Characters chosen so
// that access cards actually matter (no Free Solo, who bypasses them).
// Designed to verify the v0.5.0 prompt changes (A1 mechanical rules,
// A3 access-card priority, B2 milestone-access readout, B3 round-clearing
// warning).
//
// Streams to disk so the run is resumable. Stop with Ctrl-C and re-run
// to pick up from the last completed seed.
//
// USAGE:
//   node sim/run-llm-smoke-3p.js
//   node sim/run-llm-smoke-3p.js --seeds=1,7,13 --model=deepseek-r1:7b \
//                                --characters=technician,sprinter,ironLung

import fs from 'node:fs';
import path from 'node:path';
import { runOneGame, createJsonlWriter } from './run-one-game.js';

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

// Default seed set — keep it modest since 3-player LLM games are slow.
// Each game has ~3x more LLM-seat decisions than a 2p game.
const SEEDS = (args.seeds || '1,7,13')
  .split(',').map(s => Number(s.trim()));

const MODEL = args.model || 'deepseek-r1:7b';
const CHARACTERS = (args.characters || 'technician,sprinter,ironLung').split(',');
const GAME_TIMEOUT_MIN = Number(args['game-timeout-min'] || 90);

if (CHARACTERS.length !== 3) {
  console.error(`error: 3-player smoke needs exactly 3 characters (got ${CHARACTERS.length})`);
  process.exit(1);
}

const OUTPUT_DIR = args['output-dir']
  || `results/llm-smoke-3p-${new Date().toISOString().slice(0, 10)}`;

// Seats 1 + 2 = heuristic baselines. Seat 3 = LLM under test (1 LLM seat,
// down from 2 in prior runs). Cuts per-game LLM call count by ~50%, lets
// the 45-min watchdog fit complete games, and gives a cleaner per-character
// signal: the LLM plays one specific character (Iron Lung here) and we
// can attribute wins/losses to its strategy on that archetype.
const AGENTS = ['heuristic', 'heuristic', `ollama:${MODEL}`];

console.log(`LLM smoke test (3-player, 1 LLM seat):`);
console.log(`  seeds:       ${SEEDS.join(', ')}`);
console.log(`  characters:  ${CHARACTERS.join(' vs ')}`);
console.log(`  agents:      ${AGENTS.join(' / ')}`);
console.log(`  output dir:  ${OUTPUT_DIR}`);
console.log(`  estimated:   ~${SEEDS.length * 25} min @ 25 min/game (1 LLM seat)`);
console.log();

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const startAll = Date.now();
const summaries = [];

for (let i = 0; i < SEEDS.length; i++) {
  const seed = SEEDS[i];
  const outPath = path.join(OUTPUT_DIR, `seed-${seed}.jsonl`);

  // Skip if a complete log already exists (resumability).
  if (fs.existsSync(outPath)) {
    try {
      const lines = fs.readFileSync(outPath, 'utf8').trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1]);
      if (last?.kind === 'run_summary') {
        console.log(`[${i + 1}/${SEEDS.length}] seed=${seed} SKIPPED (already complete)`);
        summaries.push(last);
        continue;
      }
    } catch { /* re-run */ }
  }

  const writer = createJsonlWriter(outPath);
  const t0 = Date.now();
  try {
    // Progress callback: one-line status every 60s of game wall-clock.
    // Surfaces round number, elapsed time vs the 45m watchdog budget,
    // per-seat action counts, fallback counts, average latency, and
    // milestone progress. Lets us see the harness is alive without
    // tailing logs.
    const onProgress = (p) => {
      const min = (ms) => (ms / 60000).toFixed(1);
      const budget = p.watchdogBudgetMs ? `/${min(p.watchdogBudgetMs)}m` : '';
      const seats = p.perAgentStats.map(s =>
        `${s.agent.startsWith('ollama') ? 'L' : 'H'}${s.seat}=${s.avgLatencyMs}ms·${s.fallbacks}fb`
      ).join(' ');
      const ms = p.milestoneProgress.map(m => m.done).join('/');
      process.stdout.write(
        `  [seed=${seed}] r${p.round} step=${p.step} ${min(p.elapsedMs)}m${budget} ${seats} ms=${ms}\n`
      );
    };

    const { summary } = await runOneGame({
      seed,
      policySeed: seed + 1000,
      characterKeys: CHARACTERS,
      agentNames: AGENTS,
      // Per-decision timeout: 180s for reasoning models (deepseek-r1)
      // whose <think> blocks add 30-90s vs qwen2.5:7b's 14s baseline.
      // AbortController cancels mid-request (Track 1.1) so timeouts
      // don't leak background HTTP calls.
      turnTimeoutMs: 180000,
      // Game-level watchdog (Track 1.3): hard cap, default 90 min for
      // reasoning models. If a game runs longer it almost certainly
      // means Ollama is hung — saves us from 11-hour runaway runs.
      gameTimeoutMs: GAME_TIMEOUT_MIN * 60 * 1000,
      onProgress,
      progressIntervalMs: 60000,
      writer,
    });
    await writer.close();
    summaries.push(summary);
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(0);
    const w = summary.winner ? `P${summary.winner} (${summary.winnerCharacter}/${summary.winnerAgent})` : 'none';
    // Per-seat milestone count
    const ms = summary.finalPlayers.map(p => p.milestonesDone).join('/');
    console.log(
      `[${i + 1}/${SEEDS.length}] seed=${seed} | ${elapsedSec}s | ${summary.reason} | ` +
      `winner=${w} | rounds=${summary.rounds} | ms=${ms} | fallbacks=${summary.fallbackCount}`
    );
  } catch (err) {
    await writer.close();
    console.error(`[${i + 1}/${SEEDS.length}] seed=${seed} FAILED: ${err.message}`);
  }
}

// --- Aggregate ---

const totalMin = ((Date.now() - startAll) / 60000).toFixed(1);
const heurWins = summaries.filter(s => s.winnerAgent === 'heuristic').length;
const llmWins = summaries.filter(s => s.winnerAgent?.startsWith('ollama')).length;
const noWinner = summaries.filter(s => s.winner == null).length;
const totalFbs = summaries.reduce((a, s) => a + (s.fallbackCount || 0), 0);

// Per-seat milestone totals
const seat1Ms = summaries.reduce((a, s) => a + (s.finalPlayers[0]?.milestonesDone || 0), 0);
const seat2Ms = summaries.reduce((a, s) => a + (s.finalPlayers[1]?.milestonesDone || 0), 0);
const seat3Ms = summaries.reduce((a, s) => a + (s.finalPlayers[2]?.milestonesDone || 0), 0);
const llmMsTotal = seat2Ms + seat3Ms;
const llmMaxPossible = summaries.length * 6; // 3 milestones × 2 LLM seats

// Per-seat win counts
const seat1Wins = summaries.filter(s => s.winner === 1).length;
const seat2Wins = summaries.filter(s => s.winner === 2).length;
const seat3Wins = summaries.filter(s => s.winner === 3).length;

console.log();
console.log(`=== SUMMARY ===`);
console.log(`  elapsed:                ${totalMin} min`);
console.log(`  seeds run:              ${summaries.length}`);
console.log();
const tag = (i) => AGENTS[i].startsWith('ollama') ? 'LLM' : 'heur';
console.log(`  WINS:`);
console.log(`    seat 1 (${CHARACTERS[0]}/${tag(0)}):  ${seat1Wins}/${summaries.length}`);
console.log(`    seat 2 (${CHARACTERS[1]}/${tag(1)}):  ${seat2Wins}/${summaries.length}`);
console.log(`    seat 3 (${CHARACTERS[2]}/${tag(2)}):  ${seat3Wins}/${summaries.length}`);
console.log(`    no winner:                 ${noWinner}/${summaries.length}`);
console.log();
console.log(`  MILESTONES (out of ${summaries.length * 3} per seat):`);
console.log(`    seat 1 (${CHARACTERS[0]}/${tag(0)}):  ${seat1Ms}`);
console.log(`    seat 2 (${CHARACTERS[1]}/${tag(1)}):  ${seat2Ms}`);
console.log(`    seat 3 (${CHARACTERS[2]}/${tag(2)}):  ${seat3Ms}`);
// Re-compute LLM totals from the actual agent assignments rather than
// hardcoded seats 2+3.
const llmSeats = AGENTS.map((a, i) => a.startsWith('ollama') ? i + 1 : null).filter(Boolean);
const llmMsActual = llmSeats.reduce((acc, seat) => acc + summaries.reduce((a, s) => a + (s.finalPlayers[seat-1]?.milestonesDone || 0), 0), 0);
const llmMaxActual = summaries.length * 3 * llmSeats.length;
console.log(`    LLM TOTAL (${llmSeats.length} seat${llmSeats.length>1?'s':''}):  ${llmMsActual}/${llmMaxActual} (${llmMaxActual ? (llmMsActual/llmMaxActual*100).toFixed(0) : 0}%)`);
console.log();
console.log(`  FALLBACKS:                ${totalFbs} total (LLM agent only)`);
console.log(`  output dir:               ${OUTPUT_DIR}`);
