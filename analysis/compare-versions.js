// Cross-version comparator: pulls aggregate metrics from any set of result
// directories and prints a comparison table.
//
// Each row = one engine version × one matchup. Columns = wins, avg
// milestones per player, avg game length, area coverage of milestones.
//
// USAGE:  node analysis/compare-versions.js <label>:<dir> [<label>:<dir>...]

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node analysis/compare-versions.js <label>:<dir> [...]');
  process.exit(1);
}

function summarizeDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  let games = 0, p1Wins = 0, p2Wins = 0, allMilestones = 0;
  let p1MsTotal = 0, p2MsTotal = 0, roundsTotal = 0;
  let allThreeAreas = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n');
    let meta = null, summary = null, areas = [];
    for (const line of lines) {
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      if (obj.kind === 'run_meta') meta = obj;
      if (obj.kind === 'run_summary') summary = obj;
      if (obj.type === 'game_start' && obj.payload.milestoneRoutes) {
        const m = obj.payload.milestoneRoutes;
        areas = [m.beginner.area, m.intermediate.area, m.expert.area];
      }
    }
    if (!meta || !summary) continue;
    games++;
    if (summary.winner === 1) p1Wins++;
    if (summary.winner === 2) p2Wins++;
    if (summary.reason === 'all_milestones') allMilestones++;
    p1MsTotal += summary.finalPlayers[0]?.milestonesDone || 0;
    p2MsTotal += summary.finalPlayers[1]?.milestonesDone || 0;
    roundsTotal += summary.rounds;
    if (new Set(areas).size === 3) allThreeAreas++;
  }
  return {
    games, p1Wins, p2Wins, allMilestones,
    p1AvgMs: games ? (p1MsTotal / games).toFixed(2) : '—',
    p2AvgMs: games ? (p2MsTotal / games).toFixed(2) : '—',
    avgRounds: games ? (roundsTotal / games).toFixed(1) : '—',
    threeAreaPct: games ? ((allThreeAreas / games) * 100).toFixed(0) + '%' : '—',
    engineVersion: 'unknown',
  };
}

console.log('label                              | games | P1 wins | P2 wins | avg rounds | P1 ms | P2 ms | 3-area');
console.log('-----------------------------------|-------|---------|---------|------------|-------|-------|-------');
for (const a of args) {
  const [label, dir] = a.split(':');
  if (!fs.existsSync(dir)) { console.log(label.padEnd(34) + ' | (missing dir: ' + dir + ')'); continue; }
  const s = summarizeDir(dir);
  console.log(
    label.padEnd(34) +
    ' |  ' + String(s.games).padStart(2) +
    '   |   ' + String(s.p1Wins).padStart(2) +
    '    |   ' + String(s.p2Wins).padStart(2) +
    '    |   ' + String(s.avgRounds).padStart(5) +
    '    | ' + s.p1AvgMs +
    '  | ' + s.p2AvgMs +
    '  |  ' + s.threeAreaPct.padStart(4)
  );
}
