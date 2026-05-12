// One-shot pipeline: build the aggregate report PLUS a per-game detail
// page for every JSONL in a results directory, then open the aggregate.
//
// USAGE:
//   node analysis/final-report.js                       # uses today's results dir
//   node analysis/final-report.js results/2026-04-22    # explicit dir
//   node analysis/final-report.js results/2026-04-22 --no-open
//
// What it produces:
//   <dir>/report.html             — aggregate dashboard (auto-narrative trends,
//                                   recommended fixes, charts, callouts)
//   <dir>/<game>.detail.html      — one rich detail page per game with
//                                   per-round timeline, rationales, stat curves
//
// All HTML is self-contained (Plotly via CDN, no install). Open in any
// browser. Click a game row in the aggregate to drill into its detail page.

import fs from 'node:fs';
import path from 'node:path';
import { exec, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const positional = args.filter(a => !a.startsWith('--'));
const inputDir = positional[0] || path.join('results', new Date().toISOString().slice(0, 10));

if (!fs.existsSync(inputDir)) {
  console.error(`results directory not found: ${inputDir}`);
  console.error('hint: run a smoke first: npm run game -- ...');
  process.exit(1);
}

const jsonlFiles = fs.readdirSync(inputDir).filter(f => f.endsWith('.jsonl'));
if (jsonlFiles.length === 0) {
  console.error(`no .jsonl files in ${inputDir}`);
  process.exit(1);
}

console.log(`Building final report for ${inputDir}/ (${jsonlFiles.length} games)...`);
console.log();

// Step 1: aggregate report.
const aggResult = spawnSync('node', ['analysis/build-report.js', inputDir], { stdio: 'inherit' });
if (aggResult.status !== 0) {
  console.error('aggregate report failed; aborting.');
  process.exit(1);
}

// Step 2: per-game detail pages.
let built = 0, skipped = 0;
for (const f of jsonlFiles) {
  const jsonlPath = path.join(inputDir, f);
  const detailPath = jsonlPath.replace(/\.jsonl$/, '.detail.html');
  // Only rebuild if missing or stale (jsonl newer than detail).
  if (fs.existsSync(detailPath)) {
    const jStat = fs.statSync(jsonlPath);
    const dStat = fs.statSync(detailPath);
    if (dStat.mtimeMs >= jStat.mtimeMs) { skipped++; continue; }
  }
  const r = spawnSync('node', ['analysis/game-detail.js', jsonlPath], { stdio: 'pipe' });
  if (r.status === 0) built++;
  else console.error(`detail failed for ${f}`);
}
console.log(`Per-game detail: ${built} built, ${skipped} skipped (already up-to-date).`);

// Step 3: open the aggregate in the default browser.
const reportPath = path.join(inputDir, 'report.html');
console.log();
console.log(`Final report: ${reportPath}`);
if (!noOpen) {
  exec(`open "${reportPath}"`, () => {});
}
