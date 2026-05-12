// Multi-seed LLM smoke runner — a narrower version of run-matrix.js.
//
// Runs a fixed matchup (heuristic vs ollama) across a configurable list of
// seeds, writing one JSONL per game and a summary to stdout. This is the
// "did the LLM agent actually work across more than one seed" test.
//
// USAGE:
//   node sim/run-llm-smoke.js
//   node sim/run-llm-smoke.js --seeds=1,7,13,42,99,888,2024
//   node sim/run-llm-smoke.js --model=qwen2.5:14b-instruct
//   node sim/run-llm-smoke.js --output-dir=results/llm-7b-smoke

import fs from 'node:fs';
import path from 'node:path';
import { runOneGame, createJsonlWriter } from './run-one-game.js';

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

// Same seven seeds we've been using for the heuristic smoke — letting us
// directly compare LLM outcomes to those earlier heuristic-only runs.
const SEEDS = (args.seeds || '1,7,13,42,99,888,2024')
  .split(',').map(s => Number(s.trim()));
const MODEL = args.model || 'qwen2.5:7b-instruct';
const CHARACTERS = (args.characters || 'technician,sprinter').split(',');
const OUTPUT_DIR = args['output-dir']
  || `results/llm-smoke-${new Date().toISOString().slice(0, 10)}`;
const MAX_ROUNDS = Number(args.maxRounds || 45);

// Seat 1 = heuristic baseline, Seat 2 = LLM under test. Keeping the LLM as
// P2 is deliberate: P1 always goes first under the time-max turn rule, so
// giving P1 to the heuristic means the LLM has to catch up each round.
const AGENTS = ['heuristic', `ollama:${MODEL}`];

console.log(`LLM smoke test:`);
console.log(`  seeds:       ${SEEDS.join(', ')}`);
console.log(`  characters:  ${CHARACTERS.join(' vs ')}`);
console.log(`  agents:      ${AGENTS.join(' vs ')}`);
console.log(`  max rounds:  ${MAX_ROUNDS}`);
console.log(`  output dir:  ${OUTPUT_DIR}`);
console.log(`  estimated:   ~${SEEDS.length * 11} minutes @ 11 min/game`);
console.log();

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const startAll = Date.now();
const summaries = [];

for (let i = 0; i < SEEDS.length; i++) {
  const seed = SEEDS[i];
  const outPath = path.join(OUTPUT_DIR, `seed-${seed}.jsonl`);

  // Skip if a complete log already exists (resumability, matches run-matrix.js).
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
    const { summary } = await runOneGame({
      seed,
      policySeed: seed + 1000,
      characterKeys: CHARACTERS,
      agentNames: AGENTS,
      maxRounds: MAX_ROUNDS,
      turnTimeoutMs: 30000, // 30s per turn; generous so one slow LLM call doesn't fall back
      writer,
    });
    writer.close();
    summaries.push(summary);
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(0);
    const w = summary.winner ? `P${summary.winner} (${summary.winnerCharacter}/${summary.winnerAgent})` : 'none';
    const p2ms = summary.finalPlayers[1].milestonesDone;
    console.log(
      `[${i + 1}/${SEEDS.length}] seed=${seed} | ${elapsedSec}s | ${summary.reason} | ` +
      `winner=${w} | LLM milestones=${p2ms}/3 | fallbacks=${summary.fallbackCount}`
    );
  } catch (err) {
    writer.close();
    console.error(`[${i + 1}/${SEEDS.length}] seed=${seed} FAILED: ${err.message}`);
  }
}

// --- Aggregate ---

const totalMin = ((Date.now() - startAll) / 60000).toFixed(1);
const llmWins      = summaries.filter(s => s.winnerAgent?.startsWith('ollama')).length;
const heurWins     = summaries.filter(s => s.winnerAgent === 'heuristic').length;
const drawn        = summaries.filter(s => s.winner == null).length;
const totalAction  = summaries.reduce((a, s) => a + s.actions, 0);
const totalFbs     = summaries.reduce((a, s) => a + (s.fallbackCount || 0), 0);
const llmMilestonesTotal = summaries.reduce((a, s) => a + (s.finalPlayers[1]?.milestonesDone || 0), 0);
const heurMilestonesTotal = summaries.reduce((a, s) => a + (s.finalPlayers[0]?.milestonesDone || 0), 0);

console.log();
console.log(`=== SUMMARY ===`);
console.log(`  elapsed:                ${totalMin} min`);
console.log(`  seeds run:              ${summaries.length}`);
console.log(`  heuristic wins:         ${heurWins}/${summaries.length}`);
console.log(`  LLM wins:               ${llmWins}/${summaries.length}`);
console.log(`  draws (max_rounds):     ${drawn}/${summaries.length}`);
console.log(`  heuristic milestones:   ${heurMilestonesTotal}/${summaries.length * 3}`);
console.log(`  LLM milestones:         ${llmMilestonesTotal}/${summaries.length * 3}`);
console.log(`  total LLM decisions:    ${summaries.reduce((a, s) => a + (s.perAgentStats?.[1]?.actions || 0), 0)}`);
console.log(`  total fallbacks:        ${totalFbs}`);
console.log(`  output dir:             ${OUTPUT_DIR}`);
