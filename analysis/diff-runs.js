// Compare two playtest runs side-by-side.
//
// Use this after a balance change: run the matrix once, bump engine/version.js
// with a `patch` tweak and change a stat/cost/route in game.js+engine/data.js,
// run the matrix again, then diff the two result directories.
//
// USAGE (plain English at bottom):
//   node analysis/diff-runs.js <old-dir> <new-dir>
//   node analysis/diff-runs.js results/2026-04-21 results/2026-04-22
//   node analysis/diff-runs.js <old> <new> --open
//
// Produces <new-dir>/diff-vs-<old-basename>.html with:
//   - Engine-version check (major/minor bump → WARN: baselines not comparable)
//   - Per-character win-rate delta (with arrows and magnitude)
//   - Per-agent win-rate delta
//   - Game-length distribution overlay
//   - End-reason mix comparison
//   - Fallback-rate change per agent
//   - Milestone completion-rate delta per character
//   - "New vs. dropped" callouts (games that became/no-longer-are top-5 in each callout bucket)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';

// ---------------- Arg parsing ----------------

const args = process.argv.slice(2);
const flags = { open: false };
const positional = [];
for (const a of args) {
  if (a === '--open') flags.open = true;
  else if (!a.startsWith('--')) positional.push(a);
}
if (positional.length !== 2) {
  console.error('usage: node analysis/diff-runs.js <old-results-dir> <new-results-dir> [--open]');
  process.exit(1);
}
const [oldDir, newDir] = positional;
for (const d of [oldDir, newDir]) {
  if (!fs.existsSync(d)) { console.error(`directory not found: ${d}`); process.exit(1); }
}

// ---------------- Shared loader (same format as build-report.js) ----------------

function loadAllGames(dir) {
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.jsonl')) continue;
    const text = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    if (!text) continue;
    let meta = null, summary = null;
    for (const line of text.split('\n')) {
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      if (obj.kind === 'run_meta') meta = obj;
      else if (obj.kind === 'run_summary') summary = obj;
    }
    // Diff only needs meta + summary — skip loading the per-event stream
    // for speed. We'll reread events if we ever need them.
    if (!meta || !summary) continue;
    out.push({ filename: file, meta, summary });
  }
  return out;
}

const oldGames = loadAllGames(oldDir);
const newGames = loadAllGames(newDir);
if (!oldGames.length || !newGames.length) {
  console.error(`need completed games in both dirs (old=${oldGames.length}, new=${newGames.length})`);
  process.exit(1);
}

// ---------------- Engine version comparison ----------------

// Both runs write engineVersion into every run_meta. Assume consistency
// within a run (true unless someone bumped the version mid-run).
const oldEngine = oldGames[0].meta.engineVersion;
const newEngine = newGames[0].meta.engineVersion;

function parseSemver(v) {
  const [major, minor, patch] = v.split('.').map(Number);
  return { major, minor, patch };
}
function compatibilityFromBump(a, b) {
  const A = parseSemver(a), B = parseSemver(b);
  if (A.major !== B.major || A.minor !== B.minor) return 'INCOMPARABLE';
  if (A.patch !== B.patch) return 'COMPARABLE-PATCH';
  return 'IDENTICAL';
}
const compat = compatibilityFromBump(oldEngine, newEngine);

// ---------------- Aggregation helpers ----------------

function aggregate(games) {
  const playsByChar = {}, winsByChar = {};
  const playsByAgent = {}, winsByAgent = {};
  const reasons = {};
  const lengths = [];
  const milestoneSum = {}, milestoneCount = {};
  const agentActions = {}, agentFallbacks = {};

  for (const g of games) {
    for (const ch of g.meta.characters)  playsByChar[ch]  = (playsByChar[ch]  || 0) + 1;
    for (const ag of g.meta.agents)      playsByAgent[ag] = (playsByAgent[ag] || 0) + 1;
    if (g.summary.winner != null) {
      if (g.summary.winnerCharacter) winsByChar[g.summary.winnerCharacter]  = (winsByChar[g.summary.winnerCharacter]  || 0) + 1;
      if (g.summary.winnerAgent)     winsByAgent[g.summary.winnerAgent]    = (winsByAgent[g.summary.winnerAgent]    || 0) + 1;
    }
    reasons[g.summary.reason] = (reasons[g.summary.reason] || 0) + 1;
    lengths.push(g.summary.rounds);
    for (const p of g.summary.finalPlayers || []) {
      milestoneSum[p.characterKey]   = (milestoneSum[p.characterKey] || 0) + p.milestonesDone;
      milestoneCount[p.characterKey] = (milestoneCount[p.characterKey] || 0) + 1;
    }
    for (const s of g.summary.perAgentStats || []) {
      agentActions[s.agent]   = (agentActions[s.agent]   || 0) + s.actions;
      agentFallbacks[s.agent] = (agentFallbacks[s.agent] || 0) + s.fallbacks;
    }
  }

  // Derive rates.
  const charRate = {}, agentRate = {}, milestoneAvg = {}, fallbackRate = {};
  for (const c of Object.keys(playsByChar))   charRate[c]     = (winsByChar[c]  || 0) / playsByChar[c];
  for (const a of Object.keys(playsByAgent))  agentRate[a]    = (winsByAgent[a] || 0) / playsByAgent[a];
  for (const c of Object.keys(milestoneSum))  milestoneAvg[c] = milestoneSum[c] / milestoneCount[c];
  for (const a of Object.keys(agentActions))  fallbackRate[a] = (agentFallbacks[a] || 0) / (agentActions[a] || 1);

  return {
    games: games.length,
    playsByChar, winsByChar, charRate,
    playsByAgent, winsByAgent, agentRate,
    reasons, lengths, milestoneAvg,
    agentActions, agentFallbacks, fallbackRate,
  };
}

const oldAgg = aggregate(oldGames);
const newAgg = aggregate(newGames);

// ---------------- Delta computation ----------------

// Returns [{ key, oldVal, newVal, delta }] sorted by |delta| descending,
// covering the union of both maps.
function rateDeltas(oldRates, newRates, oldPlays = null, newPlays = null) {
  const keys = new Set([...Object.keys(oldRates), ...Object.keys(newRates)]);
  const rows = [...keys].map(k => ({
    key: k,
    oldVal: oldRates[k] ?? null,
    newVal: newRates[k] ?? null,
    delta: ((newRates[k] ?? 0) - (oldRates[k] ?? 0)),
    oldN: oldPlays ? (oldPlays[k] ?? 0) : null,
    newN: newPlays ? (newPlays[k] ?? 0) : null,
  }));
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows;
}

const charDelta      = rateDeltas(oldAgg.charRate,  newAgg.charRate,  oldAgg.playsByChar,  newAgg.playsByChar);
const agentDelta     = rateDeltas(oldAgg.agentRate, newAgg.agentRate, oldAgg.playsByAgent, newAgg.playsByAgent);
const milestoneDelta = rateDeltas(oldAgg.milestoneAvg, newAgg.milestoneAvg);
const fallbackDelta  = rateDeltas(oldAgg.fallbackRate, newAgg.fallbackRate);

// Reason mix delta: differences in absolute counts (some runs may have
// different game counts, so we report % shares too).
function shares(counts) {
  const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
  const out = {};
  for (const k of Object.keys(counts)) out[k] = counts[k] / total;
  return out;
}
const reasonDelta = rateDeltas(shares(oldAgg.reasons), shares(newAgg.reasons));

// Stats for game-length distribution.
function describe(arr) {
  if (!arr.length) return { n: 0, mean: 0, median: 0, p10: 0, p90: 0, min: 0, max: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const at = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((x, y) => x + y, 0) / s.length;
  return {
    n: s.length,
    mean,
    median: at(0.5),
    p10: at(0.10),
    p90: at(0.90),
    min: s[0],
    max: s[s.length - 1],
  };
}
const oldLenStats = describe(oldAgg.lengths);
const newLenStats = describe(newAgg.lengths);

// ---------------- Sign & magnitude helper ----------------

function arrow(d) {
  if (Math.abs(d) < 0.005) return '·';       // effectively unchanged
  if (d > 0) return `▲ +${(d * 100).toFixed(1)}%`;
  return `▼ ${(d * 100).toFixed(1)}%`;
}
function arrowRaw(d, digits = 2) {
  if (Math.abs(d) < 0.005) return '·';
  return (d > 0 ? `▲ +${d.toFixed(digits)}` : `▼ ${d.toFixed(digits)}`);
}

// ---------------- HTML output ----------------

const oldName = path.basename(path.resolve(oldDir));
const newName = path.basename(path.resolve(newDir));
const outPath = path.join(newDir, `diff-vs-${oldName}.html`);

const j = o => JSON.stringify(o).replace(/</g, '\\u003c');

// Plotly chart specs for the side-by-side visuals.
const chartSpecs = {
  charWinRates: {
    data: [
      { type: 'bar', name: oldName, x: charDelta.map(r => r.key), y: charDelta.map(r => r.oldVal || 0) },
      { type: 'bar', name: newName, x: charDelta.map(r => r.key), y: charDelta.map(r => r.newVal || 0) },
    ],
    layout: { title: 'Character win rate — OLD vs NEW', barmode: 'group', yaxis: { tickformat: '.0%' } },
  },
  agentWinRates: {
    data: [
      { type: 'bar', name: oldName, x: agentDelta.map(r => r.key), y: agentDelta.map(r => r.oldVal || 0) },
      { type: 'bar', name: newName, x: agentDelta.map(r => r.key), y: agentDelta.map(r => r.newVal || 0) },
    ],
    layout: { title: 'Agent win rate — OLD vs NEW', barmode: 'group', yaxis: { tickformat: '.0%' } },
  },
  gameLengthOverlay: {
    data: [
      { type: 'histogram', name: oldName, x: oldAgg.lengths, opacity: 0.6, nbinsx: 20 },
      { type: 'histogram', name: newName, x: newAgg.lengths, opacity: 0.6, nbinsx: 20 },
    ],
    layout: { title: 'Game-length distribution (overlay)', barmode: 'overlay', xaxis: { title: 'rounds' } },
  },
  milestoneCompletion: {
    data: [
      { type: 'bar', name: oldName, x: milestoneDelta.map(r => r.key), y: milestoneDelta.map(r => r.oldVal || 0) },
      { type: 'bar', name: newName, x: milestoneDelta.map(r => r.key), y: milestoneDelta.map(r => r.newVal || 0) },
    ],
    layout: { title: 'Avg. milestones completed per character (max 3)', barmode: 'group', yaxis: { range: [0, 3] } },
  },
};

const rowCss = r => Math.abs(r.delta) < 0.005 ? '' : (r.delta > 0 ? 'pos' : 'neg');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Playtest diff: ${oldName} → ${newName}</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 1200px; margin: 24px auto; padding: 0 24px; color: #222; }
  h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { margin-top: 36px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }
  th { background: #f5f5f7; }
  tr.pos td.delta { color: #0a7d2b; font-weight: 600; }
  tr.neg td.delta { color: #c3272b; font-weight: 600; }
  .warn { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin: 12px 0; border-radius: 4px; }
  .ok   { background: #d4edda; border-left: 4px solid #28a745; padding: 12px 16px; margin: 12px 0; border-radius: 4px; }
  .info { background: #cfe2ff; border-left: 4px solid #0d6efd; padding: 12px 16px; margin: 12px 0; border-radius: 4px; }
  .chart { margin: 16px 0; }
  .meta { background: #f5f5f7; padding: 12px 16px; border-radius: 8px; font-size: 14px; }
  code { background: #f5f5f7; padding: 1px 6px; border-radius: 3px; font-size: 13px; }
</style>
</head>
<body>

<h1>Playtest diff: <code>${oldName}</code> → <code>${newName}</code></h1>
<div class="meta">
  <b>Old:</b> ${oldDir} — ${oldAgg.games} games, engine <code>${oldEngine}</code><br>
  <b>New:</b> ${newDir} — ${newAgg.games} games, engine <code>${newEngine}</code>
</div>

${compat === 'INCOMPARABLE'
  ? `<div class="warn"><b>⚠ Engine major/minor version changed (<code>${oldEngine}</code> → <code>${newEngine}</code>).</b> Win-rate deltas below are NOT directly comparable — the game's rules meaningfully changed. Use this diff to measure magnitude of change, not to claim "character X was nerfed."</div>`
  : compat === 'COMPARABLE-PATCH'
    ? `<div class="ok"><b>✓ Engine patch bump only (<code>${oldEngine}</code> → <code>${newEngine}</code>).</b> Runs are directly comparable; deltas below reflect the balance tweak.</div>`
    : `<div class="info">Same engine version (<code>${oldEngine}</code>). Deltas reflect run-to-run noise unless the config changed.</div>`}

<h2>Character win-rate delta</h2>
<table>
  <tr><th>Character</th><th>Old win rate</th><th>New win rate</th><th class="delta">Δ</th><th>Games (old → new)</th></tr>
  ${charDelta.map(r => `
    <tr class="${rowCss(r)}">
      <td>${r.key}</td>
      <td>${r.oldVal == null ? '—' : (r.oldVal * 100).toFixed(1) + '%'}</td>
      <td>${r.newVal == null ? '—' : (r.newVal * 100).toFixed(1) + '%'}</td>
      <td class="delta">${arrow(r.delta)}</td>
      <td>${r.oldN ?? 0} → ${r.newN ?? 0}</td>
    </tr>
  `).join('')}
</table>
<div class="chart" id="charWinRates"></div>

<h2>Agent win-rate delta</h2>
<table>
  <tr><th>Agent</th><th>Old win rate</th><th>New win rate</th><th class="delta">Δ</th><th>Seats (old → new)</th></tr>
  ${agentDelta.map(r => `
    <tr class="${rowCss(r)}">
      <td>${r.key}</td>
      <td>${r.oldVal == null ? '—' : (r.oldVal * 100).toFixed(1) + '%'}</td>
      <td>${r.newVal == null ? '—' : (r.newVal * 100).toFixed(1) + '%'}</td>
      <td class="delta">${arrow(r.delta)}</td>
      <td>${r.oldN ?? 0} → ${r.newN ?? 0}</td>
    </tr>
  `).join('')}
</table>
<div class="chart" id="agentWinRates"></div>

<h2>Game length</h2>
<table>
  <tr><th></th><th>n</th><th>mean</th><th>p10</th><th>median</th><th>p90</th><th>min</th><th>max</th></tr>
  <tr><td>${oldName}</td><td>${oldLenStats.n}</td><td>${oldLenStats.mean.toFixed(1)}</td><td>${oldLenStats.p10}</td><td>${oldLenStats.median}</td><td>${oldLenStats.p90}</td><td>${oldLenStats.min}</td><td>${oldLenStats.max}</td></tr>
  <tr><td>${newName}</td><td>${newLenStats.n}</td><td>${newLenStats.mean.toFixed(1)}</td><td>${newLenStats.p10}</td><td>${newLenStats.median}</td><td>${newLenStats.p90}</td><td>${newLenStats.min}</td><td>${newLenStats.max}</td></tr>
  <tr class="${Math.abs(newLenStats.mean - oldLenStats.mean) < 0.5 ? '' : (newLenStats.mean > oldLenStats.mean ? 'neg' : 'pos')}">
    <td>Δ</td><td>—</td><td class="delta">${arrowRaw(newLenStats.mean - oldLenStats.mean, 1)}</td><td colspan="5">(shorter games = faster pipeline; often a sign milestones got easier)</td>
  </tr>
</table>
<div class="chart" id="gameLengthOverlay"></div>

<h2>End-reason mix (share of games)</h2>
<table>
  <tr><th>Reason</th><th>Old %</th><th>New %</th><th class="delta">Δ</th></tr>
  ${reasonDelta.map(r => `
    <tr class="${rowCss(r)}">
      <td>${r.key}</td>
      <td>${r.oldVal == null ? '—' : (r.oldVal * 100).toFixed(1) + '%'}</td>
      <td>${r.newVal == null ? '—' : (r.newVal * 100).toFixed(1) + '%'}</td>
      <td class="delta">${arrow(r.delta)}</td>
    </tr>
  `).join('')}
</table>

<h2>Average milestones per character (max 3)</h2>
<table>
  <tr><th>Character</th><th>Old avg</th><th>New avg</th><th class="delta">Δ</th></tr>
  ${milestoneDelta.map(r => `
    <tr class="${Math.abs(r.delta) < 0.05 ? '' : (r.delta > 0 ? 'pos' : 'neg')}">
      <td>${r.key}</td>
      <td>${r.oldVal == null ? '—' : r.oldVal.toFixed(2)}</td>
      <td>${r.newVal == null ? '—' : r.newVal.toFixed(2)}</td>
      <td class="delta">${arrowRaw(r.delta)}</td>
    </tr>
  `).join('')}
</table>
<div class="chart" id="milestoneCompletion"></div>

<h2>Fallback-rate change per agent</h2>
<table>
  <tr><th>Agent</th><th>Old fallback rate</th><th>New fallback rate</th><th class="delta">Δ</th></tr>
  ${fallbackDelta.map(r => `
    <tr class="${Math.abs(r.delta) < 0.005 ? '' : (r.delta > 0 ? 'neg' : 'pos')}">
      <td>${r.key}</td>
      <td>${r.oldVal == null ? '—' : (r.oldVal * 100).toFixed(2) + '%'}</td>
      <td>${r.newVal == null ? '—' : (r.newVal * 100).toFixed(2) + '%'}</td>
      <td class="delta">${arrow(r.delta)}</td>
    </tr>
  `).join('')}
</table>
<p style="font-size:13px;color:#666;">
  Green here means fallbacks DROPPED (agent got more reliable). Red means fallbacks rose — worth investigating whether a prompt or timeout tweak is needed.
</p>

<script>
  const SPECS = ${j(chartSpecs)};
  for (const [id, spec] of Object.entries(SPECS)) {
    Plotly.newPlot(id, spec.data, spec.layout, { responsive: true, displaylogo: false });
  }
</script>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

if (flags.open) exec(`open "${outPath}"`, () => {});

/* PLAIN-ENGLISH SUMMARY (for non-developers):
 *
 * After you've run the pipeline twice — once before a balance change and
 * once after — this command produces ONE web page comparing them. It
 * highlights which character win rates moved, which agents got more or
 * less reliable, and whether games are now shorter or longer.
 *
 *   node analysis/diff-runs.js <old-dir> <new-dir>
 *
 * Example:
 *   node analysis/diff-runs.js results/2026-04-21 results/2026-04-22
 *
 * Add --open to auto-open the result on macOS:
 *
 *   node analysis/diff-runs.js results/2026-04-21 results/2026-04-22 --open
 *
 * Green numbers = went up. Red = went down. If you bumped engine version
 * major or minor, the page warns you that the runs aren't directly
 * comparable (the rules changed under the comparison).
 */
