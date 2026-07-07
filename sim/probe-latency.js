// Probe LLM decision latency BEFORE committing to a full smoke run.
//
// Sends N sample decisions to the configured Ollama model and reports
// p50 / p95 / p99 / mean latency. The script exits non-zero with a
// recommendation if p95 > 20s — that threshold is a heuristic for "the
// full smoke will be glacial; reconsider model/prompt/seats."
//
// USAGE:
//   node sim/probe-latency.js
//   node sim/probe-latency.js deepseek-r1:7b 5
//   node sim/probe-latency.js qwen2.5:7b-instruct 10
//
// Defaults: 5 decisions against deepseek-r1:7b.

import { createGame } from '../engine/state.js';
import { getLegalActions } from '../engine/engine.js';
import { createOllamaAgent } from './agents/ollama.js';

const MODEL = process.argv[2] || 'deepseek-r1:7b';
const N = Number(process.argv[3] || 5);
const TIMEOUT_MS = 240_000; // generous for probe — reasoning models can take 60-90s
const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

console.log(`Latency probe: ${MODEL} @ ${HOST}`);
console.log(`  Sample size: ${N} decisions`);
console.log(`  Per-decision timeout: ${TIMEOUT_MS / 1000}s`);
console.log();

// Build a representative game state — round 1 with a 3-player game, so the
// prompt size mirrors what a 3p smoke would actually send.
const { state } = createGame({
  seed: 1,
  characterKeys: ['technician', 'sprinter', 'ironLung'],
});
const legalActions = getLegalActions(state);
const player = state.players[1]; // sprinter — same as a typical LLM seat

const agent = createOllamaAgent({ model: MODEL, host: HOST, timeoutMs: TIMEOUT_MS });

const latencies = [];
const tokens = { prompt: [], response: [] };
let failures = 0;

console.log(`Running ${N} sample decisions...`);
for (let i = 0; i < N; i++) {
  const t0 = Date.now();
  try {
    const result = await agent.chooseAction({ state, legalActions, player });
    const dt = Date.now() - t0;
    latencies.push(dt);
    if (result.promptTokens)   tokens.prompt.push(result.promptTokens);
    if (result.responseTokens) tokens.response.push(result.responseTokens);
    console.log(`  decision ${i + 1}: ${(dt / 1000).toFixed(1)}s · ${result.promptTokens ?? '?'} in / ${result.responseTokens ?? '?'} out · action=${legalActions[result.actionIndex].type}`);
  } catch (err) {
    const dt = Date.now() - t0;
    failures++;
    const outcome = err.outcome || 'other';
    console.log(`  decision ${i + 1}: FAILED [${outcome}] after ${(dt / 1000).toFixed(1)}s — ${err.message.slice(0, 80)}`);
  }
}

if (!latencies.length) {
  console.log();
  console.log('All probe decisions failed. Cannot estimate latency.');
  console.log('Common causes: Ollama not running, model not pulled, or model name typo.');
  process.exit(2);
}

latencies.sort((a, b) => a - b);
const q = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];
const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
const avgIn  = tokens.prompt.length   ? tokens.prompt.reduce((a, b) => a + b, 0)   / tokens.prompt.length   : null;
const avgOut = tokens.response.length ? tokens.response.reduce((a, b) => a + b, 0) / tokens.response.length : null;

console.log();
console.log(`Results (${latencies.length}/${N} successful, ${failures} failures):`);
console.log(`  p50:    ${(q(0.5) / 1000).toFixed(1)}s`);
console.log(`  p95:    ${(q(0.95) / 1000).toFixed(1)}s`);
console.log(`  p99:    ${(q(0.99) / 1000).toFixed(1)}s`);
console.log(`  mean:   ${(mean / 1000).toFixed(1)}s`);
if (avgIn !== null) {
  console.log(`  avg prompt tokens:   ${Math.round(avgIn)}`);
  console.log(`  avg response tokens: ${Math.round(avgOut)}`);
}
console.log();

// Project full-smoke runtime.
// A 3p game with 2 LLM seats × ~150 LLM calls per seat = ~300 LLM calls.
const projectedSecondsPerGame = (mean / 1000) * 300;
const projectedMinutesPerGame = projectedSecondsPerGame / 60;
console.log(`Projection (3p smoke, 2 LLM seats, ~300 LLM calls/game):`);
console.log(`  Per game: ~${projectedMinutesPerGame.toFixed(0)} minutes`);
console.log(`  3 seeds:  ~${(projectedMinutesPerGame * 3).toFixed(0)} minutes`);
console.log();

if (q(0.95) > 20_000) {
  console.log('WARNING: p95 latency is over 20s.');
  console.log('A full 3p smoke at this latency will be SLOW (hours). Options:');
  console.log('  - Use a smaller model (e.g. deepseek-r1:8b, qwen2.5:3b)');
  console.log('  - Drop one LLM seat (1 LLM vs 2 heuristics)');
  console.log('  - Trim prompt size (drop A1 mechanical rules block)');
  console.log('  - Run fewer seeds and accept higher variance');
  process.exit(1);
}
if (failures > 0) {
  console.log(`WARNING: ${failures}/${N} probe decisions failed.`);
  console.log('Full smoke will see significant fallback. Investigate before scaling up.');
  process.exit(1);
}
console.log('OK — latency is within healthy bounds. Safe to run full smoke.');
process.exit(0);
