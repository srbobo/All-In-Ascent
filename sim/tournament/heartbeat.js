// Heartbeat + notification helpers for the tournament harness.
//
// Solves a real workflow pain point: tournament runs take 2-4 hours and the
// user has been killing what they thought were dead processes. These helpers
// surface "I am alive" signals at multiple cadences so the user can verify
// progress without running commands or tailing files.
//
// Three signal channels:
//   1. STATUS.txt  — terminal state ("RUNNING" / "COMPLETE" / "INTERRUPTED"
//                    / "FAILED" / "WATCHDOG_TIMEOUT"). Overwritten at each
//                    transition. Quick `cat` to know if it's running.
//   2. HEARTBEAT.txt — per-turn progress summary (round, elapsed, milestones,
//                      latency, fallbacks). Rewritten every onProgress tick
//                      (~60s) so a stale mtime means the process is hung.
//   3. macOS notifications — popups at key events (tournament start, iter
//                            complete, tournament end). Suppressed via
//                            --quiet-notifications flag.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// macOS popup. Non-blocking, fire-and-forget. Silent no-op on other OSes
// or if osascript is unavailable.
export function notify(title, body, { quiet = false, sound = 'Glass' } = {}) {
  if (quiet || process.platform !== 'darwin') return;
  try {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name ${JSON.stringify(sound)}`;
    const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('error', () => { /* osascript missing — silent */ });
  } catch { /* swallow — notifications are non-critical */ }
}

// Top-level RUN status. Overwrites the file on each call; the most recent
// state always wins. Tracks "is the process doing anything meaningful?"
export function writeStatus(outputDir, state, detail = {}) {
  const p = path.join(outputDir, 'STATUS.txt');
  const lines = [
    `Status: ${state}`,
    `Updated: ${new Date().toISOString()}`,
    ``,
  ];
  for (const [k, v] of Object.entries(detail)) lines.push(`${k}: ${v}`);
  lines.push(``);
  lines.push(`(This file is overwritten by the tournament harness. If "Updated"`);
  lines.push(` is fresh and Status=RUNNING, the harness is alive. If Status is`);
  lines.push(` COMPLETE/FAILED/INTERRUPTED, the process has exited.)`);
  try { fs.writeFileSync(p, lines.join('\n')); } catch { /* don't crash run */ }
}

// Per-turn heartbeat. Called from the tournament's onProgress wrapper at the
// existing 60s cadence. A stale mtime on this file (> ~2 min) means the
// LLM hung mid-decision and the watchdog hasn't fired yet.
export function writeHeartbeat(outputDir, ctx) {
  const p = path.join(outputDir, 'HEARTBEAT.txt');
  const ageS = ctx.iterStartTime ? Math.round((Date.now() - ctx.iterStartTime) / 1000) : 0;
  const ageM = (ageS / 60).toFixed(1);
  const ms = (ctx.progress?.milestoneProgress || []).map(m => m.done).join('/') || '?';
  const llmStats = (ctx.progress?.perAgentStats || []).find(s => s.agent?.startsWith('ollama'));
  const llmLat = llmStats?.avgLatencyMs ?? '?';
  const llmFb = llmStats?.fallbacks ?? '?';

  const lines = [
    `Last heartbeat: ${new Date().toISOString()}`,
    ``,
    `Iteration:        ${ctx.iterNum} of ${ctx.totalIters}`,
    `Round (engine):   ${ctx.progress?.round ?? '?'}`,
    `Step:             ${ctx.progress?.step ?? '?'}`,
    `Iter elapsed:     ${ageM} min`,
    `Watchdog budget:  ${ctx.watchdogMin} min`,
    ``,
    `Milestones (per seat): ${ms}`,
    `LLM avg latency:  ${llmLat} ms`,
    `LLM fallbacks:    ${llmFb}`,
    ``,
    `Score history (completed iters): [${ctx.scoreHistory.join(', ') || '—'}]`,
    ``,
    `(Heartbeat updates every ~60s. If this file's mtime is > 3 min old,`,
    ` the LLM is hung mid-decision — safe to investigate or kill.`,
    ` If mtime is fresh, do NOT kill — work is in flight.)`,
  ];
  try { fs.writeFileSync(p, lines.join('\n')); } catch { /* don't crash run */ }
}
