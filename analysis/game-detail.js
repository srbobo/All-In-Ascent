// Build a rich, interactive single-game detail HTML page from one JSONL log.
//
// USAGE:
//   node analysis/game-detail.js results/llm-7b-smoke/seed-1.jsonl
//   node analysis/game-detail.js results/llm-7b-smoke/seed-1.jsonl --open
//
// What's in the page (top to bottom):
//   1. Header — seed, agents, characters, end reason, winner, engine version, fallback count
//   2. AUTO-NARRATIVE — short bullet-pointed summary of this game's interesting trends:
//      most-attempted-but-failed route, agent that over-trained Focus while Tech was the
//      bottleneck, biggest stat surplus/deficit, game-ended reason, etc.
//   3. Final per-player progression table — level, XP, gear, milestones, climb pass rate,
//      milestone pass rate
//   4. Action distribution stacked bar — what types of turns each player took
//   5. Resource curves — XP, endurance, level over rounds (Plotly, hover/zoom)
//   6. STAT progression curves — Strength / Technique / Focus / Flexibility over rounds.
//      One panel per stat, all players overlaid. Critical for spotting "trained Focus all
//      game while Tech stayed flat" patterns.
//   7. Round-by-round timeline grid — each cell shows what each player did, with
//      RATIONALES as hover tooltips. Climbs/milestones use green/red ✓/✗.
//   8. Most-attempted-but-failed routes — per-player table for spotting grind loops.
//   9. Full decision chronology (collapsible <details>) — every action_chosen with its
//      rationale and outcome. Searchable in-browser via Cmd+F.

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const args = process.argv.slice(2);
const flags = { open: false };
let inputPath = null;
for (const a of args) {
  if (a === '--open') flags.open = true;
  else if (!a.startsWith('--')) inputPath = a;
}
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('usage: node analysis/game-detail.js <path-to-jsonl> [--open]');
  process.exit(1);
}

// ---------------- Load + parse ----------------

const lines = fs.readFileSync(inputPath, 'utf8').trim().split('\n');
let meta = null, summary = null;
const events = [];
for (const line of lines) {
  let obj; try { obj = JSON.parse(line); } catch { continue; }
  if (obj.kind === 'run_meta') meta = obj;
  else if (obj.kind === 'run_summary') summary = obj;
  else events.push(obj);
}
if (!meta || !summary) {
  console.error('input is not a complete game log (missing run_meta or run_summary)');
  process.exit(1);
}

// ---------------- Aggregate per-player ----------------

const playerCount = meta.characters.length;
const players = Array.from({ length: playerCount }, (_, i) => ({
  seat: i + 1,
  character: meta.characters[i],
  agent: meta.agents[i],
  // Time-series of resource snapshots over the game (from resource_update).
  series: { round: [], xp: [], endurance: [], maxEndurance: [], level: [], timeRemaining: [] },
  // Time-series of effective stats (base + training + gear), sampled at each action_chosen.
  // This is the data that explains "why didn't training help" — you can see the actual
  // stat values evolving over rounds and spot which stats are over/under-trained.
  statSeries: { round: [], strength: [], technique: [], focus: [], flexibility: [] },
  // Action counts.
  actions: { climb: 0, milestone: 0, train: 0, rest: 0, buyGear: 0, endTurn: 0 },
  // Climb/milestone outcome counters.
  climbsAttempted: 0, climbsSucceeded: 0,
  milestonesAttempted: 0, milestonesSucceeded: 0,
  // Per-route attempt counters (across the whole game) — for "most attempted but failed."
  routeAttempts: {}, // routeKey → { attempts, successes }
  // Training stat distribution — { stat: count } so we can call out over/under-training.
  trainingByStat: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
  // Per-round summary keyed by round number.
  byRound: {},
  // Full decision chronology (used in the collapsible section + per-cell tooltips).
  // Each entry: { t, round, type, descr, rationale, outcome }
  decisions: [],
}));

// Running snapshots used to compute stat series at action_chosen events.
// We rebuild Effective = base + training + gear by walking the event log.
const running = {};
for (const e of events) {
  if (e.type === 'game_start') {
    for (const p of e.payload.players) {
      running[p.playerNum] = {
        base: { ...p.startingStats },
        training: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
        gear:     { strength: 0, technique: 0, focus: 0, flexibility: 0 },
      };
    }
    break;
  }
}

const ensureRoundEntry = (seat, round) => {
  const p = players[seat - 1];
  if (!p.byRound[round]) p.byRound[round] = {
    actionCount: 0, climbs: [], milestones: [], trained: [], rested: 0, bought: [], endTurns: 0,
    rationales: [], // [{ type, descr, rationale, outcome }]
  };
  return p.byRound[round];
};

let currentRound = 1;
// Pair action_chosen with the next climb_resolved for the same player to attach
// the success/failure flag to the chronology entry.
let pendingClimb = null;
for (const e of events) {
  if (e.type === 'round_start') currentRound = e.payload.round;
  if (e.type === 'turn_start') currentRound = e.payload.round;

  // Maintain running stat snapshots.
  if (e.type === 'level_up') {
    if (running[e.payload.playerNum]) running[e.payload.playerNum].base = { ...e.payload.newStats };
  }
  if (e.type === 'train_action') {
    const r = running[e.payload.playerNum];
    if (r && e.payload.totalTrainingBonusAfter) {
      r.training = { ...e.payload.totalTrainingBonusAfter };
    }
  }
  if (e.type === 'gear_purchased') {
    const r = running[e.payload.playerNum];
    if (r && e.payload.gearApplied) {
      for (const k of ['strength', 'technique', 'focus', 'flexibility']) {
        if (typeof e.payload.gearApplied[k] === 'number') r.gear[k] += e.payload.gearApplied[k];
      }
    }
  }

  if (e.type === 'resource_update') {
    const p = players[e.payload.playerNum - 1];
    if (!p) continue;
    p.series.round.push(currentRound);
    p.series.xp.push(e.payload.xp);
    p.series.endurance.push(e.payload.currentEndurance);
    p.series.maxEndurance.push(e.payload.maxEndurance);
    p.series.level.push(e.payload.level);
    p.series.timeRemaining.push(e.payload.timeRemaining);
  }

  if (e.type === 'action_chosen') {
    const p = players[e.payload.playerNum - 1];
    if (!p) continue;
    const t = e.payload.action.type;
    p.actions[t] = (p.actions[t] || 0) + 1;
    const re = ensureRoundEntry(e.payload.playerNum, currentRound);
    re.actionCount++;
    if (t === 'rest') re.rested++;
    if (t === 'endTurn') re.endTurns++;
    if (t === 'train') {
      re.trained.push(e.payload.action.areaName);
      // Tally training by stat — needs a name → stat lookup.
      // Match TRAINING_AREAS in engine/data.js. Hardcoded here to avoid an import cycle.
      const trainStat = ({ 'Grip Board': 'focus', 'Campus Board': 'strength', 'Continuous MoonBoard': 'technique', 'Balance and Core': 'flexibility' })[e.payload.action.areaName];
      if (trainStat) p.trainingByStat[trainStat]++;
    }
    if (t === 'buyGear')   re.bought.push(e.payload.action.gearName);

    // Snapshot stats at this decision moment.
    const r = running[e.payload.playerNum];
    if (r) {
      p.statSeries.round.push(currentRound);
      for (const k of ['strength', 'technique', 'focus', 'flexibility']) {
        p.statSeries[k].push(r.base[k] + r.training[k] + r.gear[k]);
      }
    }

    // Add to decision chronology. Outcome (climb success/fail) is patched in below.
    const a = e.payload.action;
    let descr;
    switch (a.type) {
      case 'climb':     descr = `CLIMB ${a.routeName} (${a.area})`; break;
      case 'milestone': descr = `MILESTONE-${a.difficulty} ${a.routeName}`; break;
      case 'train':     descr = `TRAIN at ${a.areaName}`; break;
      case 'buyGear':   descr = `BUY ${a.gearName}`; break;
      case 'rest':      descr = `REST`; break;
      case 'endTurn':   descr = `END TURN`; break;
      default:          descr = a.type;
    }
    const decision = {
      t: e.t, round: currentRound, type: a.type, descr,
      rationale: e.payload.rationale || '',
      outcome: null, // patched by next climb_resolved
    };
    p.decisions.push(decision);
    re.rationales.push(decision); // shared reference — outcome updates here too
    if (a.type === 'climb' || a.type === 'milestone') pendingClimb = { p, decision };
  }

  if (e.type === 'climb_resolved') {
    const p = players[e.payload.playerNum - 1];
    if (!p) continue;
    const re = ensureRoundEntry(e.payload.playerNum, currentRound);
    const routeKey = `${e.payload.area}:${e.payload.routeName}`;
    p.routeAttempts[routeKey] = p.routeAttempts[routeKey] || { attempts: 0, successes: 0 };
    p.routeAttempts[routeKey].attempts++;
    if (e.payload.success) p.routeAttempts[routeKey].successes++;
    if (e.payload.isMilestone) {
      p.milestonesAttempted++;
      if (e.payload.success) p.milestonesSucceeded++;
      re.milestones.push({ name: e.payload.routeName, grade: e.payload.grade, success: e.payload.success, tier: e.payload.difficulty });
    } else {
      p.climbsAttempted++;
      if (e.payload.success) p.climbsSucceeded++;
      re.climbs.push({ name: e.payload.routeName, grade: e.payload.grade, success: e.payload.success, area: e.payload.area });
    }
    // Patch the outcome onto the corresponding decision.
    if (pendingClimb && pendingClimb.p === p) {
      pendingClimb.decision.outcome = {
        success: e.payload.success,
        xpGained: e.payload.xpGained,
        enduranceCost: e.payload.enduranceCost,
        timeCost: e.payload.timeCost,
        gaps: {
          strength: e.payload.effectiveStats.strength - e.payload.requirements.strength,
          technique: e.payload.effectiveStats.technique - e.payload.requirements.technique,
          focus: e.payload.effectiveStats.focus - e.payload.requirements.focus,
          flexibility: e.payload.effectiveStats.flexibility - e.payload.requirements.flexibility,
        },
      };
      pendingClimb = null;
    }
  }
}

// ---------------- Per-game auto-narrative ----------------

const playerColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'];
const STAT_NAMES = ['strength', 'technique', 'focus', 'flexibility'];

const narrative = []; // array of strings — bullet points for the auto-narrative section.

// Headline: result + winner.
if (summary.winner) {
  const w = summary.finalPlayers.find(p => p.playerNum === summary.winner);
  narrative.push(`<b>Result:</b> ${meta.agents[summary.winner - 1]} (Player ${summary.winner}, ${w.characterKey}) WON in ${summary.rounds} rounds by completing all 3 milestones.`);
} else {
  narrative.push(`<b>Result:</b> Game ended at round ${summary.rounds} via <code>${summary.reason}</code> — no player completed all milestones.`);
}

// Per-player headline trends.
for (const p of players) {
  const fp = summary.finalPlayers[p.seat - 1];
  const passRate = p.climbsAttempted ? (p.climbsSucceeded / p.climbsAttempted) : null;
  const msPassRate = p.milestonesAttempted ? (p.milestonesSucceeded / p.milestonesAttempted) : null;
  const total = Object.values(p.actions).reduce((a, b) => a + b, 0) || 1;
  const trainPct = (p.actions.train / total * 100).toFixed(0);
  const climbPct = (p.actions.climb / total * 100).toFixed(0);

  let line = `<b>P${p.seat} (${p.character} / ${p.agent.length > 25 ? p.agent.slice(0, 22) + '…' : p.agent}):</b> reached L${fp.level}, ${fp.milestonesDone}/3 milestones, ${total} actions (${climbPct}% climb, ${trainPct}% train).`;
  if (passRate !== null) line += ` Climb pass rate <b>${(passRate * 100).toFixed(0)}%</b> (${p.climbsSucceeded}/${p.climbsAttempted}).`;
  if (msPassRate !== null) line += ` Milestone pass rate <b>${(msPassRate * 100).toFixed(0)}%</b> (${p.milestonesSucceeded}/${p.milestonesAttempted}).`;
  narrative.push(line);

  // Most-attempted-but-failed route.
  const sorted = Object.entries(p.routeAttempts)
    .map(([k, v]) => ({ key: k, ...v, ratio: v.successes / v.attempts }))
    .filter(r => r.attempts >= 5 && r.ratio < 0.5)
    .sort((a, b) => b.attempts - a.attempts);
  if (sorted.length) {
    const top = sorted[0];
    narrative.push(`&nbsp;&nbsp;↳ Most over-attempted by P${p.seat}: <code>${top.key}</code> — ${top.attempts} attempts, ${top.successes} passes (${(top.ratio * 100).toFixed(0)}% pass rate). Suggests grind-loop pattern.`);
  }

  // Training stat imbalance — flag if one stat got >60% of training while another stat
  // had no training.
  const totalTrain = Object.values(p.trainingByStat).reduce((a, b) => a + b, 0);
  if (totalTrain >= 5) {
    const ranked = Object.entries(p.trainingByStat).sort((a, b) => b[1] - a[1]);
    const top = ranked[0]; const bottom = ranked[ranked.length - 1];
    if (top[1] / totalTrain > 0.5 && bottom[1] === 0) {
      narrative.push(`&nbsp;&nbsp;↳ Training imbalance for P${p.seat}: <b>${(top[1] / totalTrain * 100).toFixed(0)}%</b> of trains went to ${top[0]} (${top[1]}/${totalTrain}); ${bottom[0]} was never trained. Could indicate the agent is locked onto the lowest absolute stat instead of the largest gap.`);
    }
  }
}

// Surplus/deficit on the final state — most-overshot stat vs most-undershot stat.
if (players.length > 0) {
  const lastClimbs = events.slice().reverse();
  for (const p of players) {
    const last = lastClimbs.find(e => e.type === 'climb_resolved' && e.payload.playerNum === p.seat);
    if (!last) continue;
    const eff = last.payload.effectiveStats;
    const ranked = STAT_NAMES.map(s => ({ s, v: eff[s] })).sort((a, b) => b.v - a.v);
    if (ranked[0].v - ranked[ranked.length - 1].v > 50) {
      narrative.push(`&nbsp;&nbsp;↳ P${p.seat} ended with skewed stats: ${ranked[0].s} ${ranked[0].v} vs ${ranked[ranked.length - 1].s} ${ranked[ranked.length - 1].v} — extreme over-investment in one direction.`);
    }
  }
}

// ---------------- Chart specs ----------------

const seriesTraces = (key) => players.map((p, i) => ({
  type: 'scatter', mode: 'lines', name: `P${p.seat} (${p.character})`,
  x: p.series.round, y: p.series[key],
  line: { color: playerColors[i] },
}));

const statTraces = (statKey) => players.map((p, i) => ({
  type: 'scatter', mode: 'lines+markers', name: `P${p.seat} (${p.character})`,
  x: p.statSeries.round, y: p.statSeries[statKey],
  line: { color: playerColors[i] },
  marker: { size: 4, color: playerColors[i] },
}));

const charts = {
  xpCurve:        { data: seriesTraces('xp'),         layout: { title: 'XP over rounds',         xaxis: { title: 'round' }, yaxis: { title: 'cumulative XP' } } },
  enduranceCurve: { data: seriesTraces('endurance'),  layout: { title: 'Endurance over rounds',  xaxis: { title: 'round' }, yaxis: { title: 'current endurance' } } },
  levelCurve:     { data: seriesTraces('level'),      layout: { title: 'Level over rounds',      xaxis: { title: 'round' }, yaxis: { title: 'level' } } },
  actionMix: {
    data: ['climb', 'milestone', 'train', 'rest', 'buyGear', 'endTurn'].map(t => ({
      type: 'bar', name: t,
      x: players.map(p => `P${p.seat} ${p.character}`),
      y: players.map(p => p.actions[t] || 0),
    })),
    layout: { title: 'Action distribution', barmode: 'stack' },
  },
  statStrength:    { data: statTraces('strength'),    layout: { title: 'Strength (effective) over rounds',    xaxis: { title: 'round' }, yaxis: { title: 'effective Strength'    } } },
  statTechnique:   { data: statTraces('technique'),   layout: { title: 'Technique (effective) over rounds',   xaxis: { title: 'round' }, yaxis: { title: 'effective Technique'   } } },
  statFocus:       { data: statTraces('focus'),       layout: { title: 'Focus (effective) over rounds',       xaxis: { title: 'round' }, yaxis: { title: 'effective Focus'       } } },
  statFlexibility: { data: statTraces('flexibility'), layout: { title: 'Flexibility (effective) over rounds', xaxis: { title: 'round' }, yaxis: { title: 'effective Flexibility' } } },
};

// ---------------- Final progression table ----------------

const progressionRows = summary.finalPlayers.map((p, i) => {
  const player = players[i];
  const passRate = (a, s) => a ? `${((s / a) * 100).toFixed(0)}% (${s}/${a})` : '—';
  return `<tr>
    <td><b>P${p.playerNum}</b></td>
    <td>${p.characterKey}</td>
    <td>${meta.agents[i]}</td>
    <td>${p.level}</td>
    <td>${p.xpTotal}</td>
    <td>${p.gearBought}</td>
    <td>${['B','I','E'].filter((_, j) => [p.milestonesCompleted.beginner, p.milestonesCompleted.intermediate, p.milestonesCompleted.expert][j]).join('') || '—'}</td>
    <td>${passRate(player.climbsAttempted, player.climbsSucceeded)}</td>
    <td>${passRate(player.milestonesAttempted, player.milestonesSucceeded)}</td>
  </tr>`;
}).join('');

// ---------------- Per-round timeline table with rationale tooltips ----------------

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const allRounds = new Set();
for (const p of players) for (const r of Object.keys(p.byRound)) allRounds.add(Number(r));
const sortedRounds = [...allRounds].sort((a, b) => a - b);

// For each (player, round, action) we attach the rationale via the `title` attribute
// for hover, AND inject as a small italic note below for Cmd+F searchability.
const roundRows = sortedRounds.map(round => {
  const cells = players.map(p => {
    const re = p.byRound[round] || { climbs: [], milestones: [], trained: [], rested: 0, bought: [], endTurns: 0, actionCount: 0, rationales: [] };
    const lines = [];
    // Pull rationales corresponding to this round; we keep them in order alongside the actions.
    let r = 0;
    for (const m of re.milestones) {
      const dec = re.rationales[r++] || {};
      const tt = dec.rationale ? ` title="${escapeHtml(dec.rationale)}"` : '';
      lines.push(`<span style="color:${m.success ? 'green' : 'crimson'}"${tt}>★ ${m.tier} ${m.success ? '✓' : '✗'} ${m.name}</span>`);
    }
    for (const c of re.climbs) {
      const dec = re.rationales[r++] || {};
      const tt = dec.rationale ? ` title="${escapeHtml(dec.rationale)}"` : '';
      lines.push(`<span style="color:${c.success ? 'green' : 'crimson'}"${tt}>${c.success ? '✓' : '✗'} ${c.name} <small>(${c.area})</small></span>`);
    }
    if (re.trained.length) lines.push(`<small>train: ${re.trained.join(', ')}</small>`);
    if (re.bought.length)  lines.push(`<small>buy: ${re.bought.join(', ')}</small>`);
    if (re.rested)         lines.push(`<small>rest x${re.rested}</small>`);
    if (re.endTurns)       lines.push(`<small>endTurn x${re.endTurns}</small>`);
    return `<td style="vertical-align: top; font-size: 12px;">${lines.join('<br>') || '<small style="color:#999">(no actions)</small>'}</td>`;
  }).join('');
  return `<tr><td><b>R${round}</b></td>${cells}</tr>`;
}).join('');

// ---------------- Most-attempted-but-failed routes per player ----------------

const grindRows = players.map(p => {
  const sorted = Object.entries(p.routeAttempts)
    .map(([k, v]) => ({ key: k, attempts: v.attempts, successes: v.successes, ratio: v.successes / v.attempts }))
    .filter(r => r.attempts >= 3)
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 5);
  if (!sorted.length) return '';
  return `
    <h4>P${p.seat} (${p.character} / ${escapeHtml(p.agent)})</h4>
    <table style="font-size: 13px;">
      <tr><th>Route</th><th>Attempts</th><th>Passes</th><th>Pass %</th></tr>
      ${sorted.map(r => `<tr><td><code>${r.key}</code></td><td>${r.attempts}</td><td>${r.successes}</td><td style="color:${r.ratio < 0.5 ? 'crimson' : 'green'}">${(r.ratio * 100).toFixed(0)}%</td></tr>`).join('')}
    </table>
  `;
}).join('');

// ---------------- Full decision chronology (collapsible) ----------------

const chronologySections = players.map(p => {
  const rows = p.decisions.map(d => {
    let outcomeBadge = '';
    if (d.outcome) {
      const ok = d.outcome.success;
      const gaps = d.outcome.gaps;
      const worst = Math.min(...Object.values(gaps));
      outcomeBadge = ` <span style="color:${ok ? 'green' : 'crimson'};font-weight:bold">${ok ? 'PASS' : 'FAIL'}</span> <small>(worst gap: ${worst}, +${d.outcome.xpGained} XP, -${d.outcome.enduranceCost} end)</small>`;
    }
    const rationaleHtml = d.rationale ? `<br><span style="color:#555;font-style:italic;font-size:12px">↳ ${escapeHtml(d.rationale)}</span>` : '';
    return `<tr><td>R${d.round}</td><td>${d.descr}${outcomeBadge}${rationaleHtml}</td></tr>`;
  }).join('');
  return `
    <details style="margin: 12px 0;">
      <summary><b>P${p.seat} (${p.character} / ${escapeHtml(p.agent)}) — ${p.decisions.length} decisions</b></summary>
      <table style="font-size: 13px; margin-top: 8px;">
        <tr><th style="width: 50px;">Round</th><th>Action + outcome + rationale</th></tr>
        ${rows}
      </table>
    </details>
  `;
}).join('');

// ---------------- Render HTML ----------------

const j = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Game detail — ${path.basename(inputPath)}</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 1400px; margin: 24px auto; padding: 0 24px; color: #222; }
  h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { margin-top: 32px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h4 { margin: 18px 0 6px 0; }
  .meta { background: #f5f5f7; padding: 12px 16px; border-radius: 8px; }
  .narrative { background: #fff8e1; border-left: 4px solid #ffb300; padding: 12px 18px; border-radius: 4px; margin: 16px 0; }
  .narrative ul { margin: 4px 0; padding-left: 20px; }
  .narrative li { margin: 6px 0; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { background: #f5f5f7; }
  code { background: #f5f5f7; padding: 1px 6px; border-radius: 3px; font-size: 13px; }
  .chart { margin: 16px 0; }
  .stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  details > summary { cursor: pointer; padding: 8px 12px; background: #f5f5f7; border-radius: 4px; }
  details[open] > summary { background: #e9ecef; }
  .hint { color: #666; font-size: 13px; margin: 4px 0; }
</style>
</head>
<body>
<h1>Game detail — <code>${path.basename(inputPath)}</code></h1>
<div class="meta">
  <b>Seed:</b> ${meta.seed} · <b>Engine:</b> ${meta.engineVersion}<br>
  <b>Characters:</b> ${meta.characters.join(', ')}<br>
  <b>Agents:</b> ${meta.agents.join(' vs ')}<br>
  <b>Result:</b> ${summary.reason}, ${summary.rounds} rounds, ${summary.actions} actions, ${summary.events} events<br>
  <b>Winner:</b> ${summary.winner ? `Player ${summary.winner} (${summary.winnerCharacter} via ${summary.winnerAgent})` : '— no winner —'}<br>
  <b>Fallbacks:</b> ${summary.fallbackCount}
</div>

<h2>What happened in this game</h2>
<div class="narrative">
  <ul>
    ${narrative.map(n => `<li>${n}</li>`).join('')}
  </ul>
</div>

<h2>Final per-player progression</h2>
<table>
  <tr><th>Seat</th><th>Character</th><th>Agent</th><th>Level</th><th>XP</th><th>Gear</th><th>Milestones</th><th>Climb pass rate</th><th>Milestone pass rate</th></tr>
  ${progressionRows}
</table>

<h2>Action distribution per player</h2>
<div class="chart" id="actionMix"></div>

<h2>Resource curves</h2>
<div class="chart" id="xpCurve"></div>
<div class="chart" id="enduranceCurve"></div>
<div class="chart" id="levelCurve"></div>

<h2>Stat progression (effective: base + training + gear)</h2>
<p class="hint">If a stat line stays flat while the player is failing climbs that need that stat, the agent didn't train it. If a line shoots way up while milestones aren't being completed, the agent over-trained instead of climbing.</p>
<div class="stat-row">
  <div class="chart" id="statStrength"></div>
  <div class="chart" id="statTechnique"></div>
</div>
<div class="stat-row">
  <div class="chart" id="statFocus"></div>
  <div class="chart" id="statFlexibility"></div>
</div>

<h2>Round-by-round timeline</h2>
<p class="hint">Each row is one round. Each column is one player. Climbs and milestones show the route name with ✓/✗. <b>Hover over a climb or milestone to see the agent's rationale</b> (the LLM's reasoning, or the heuristic's rule). Training, gear, rest, and end-turn pass are summarized below.</p>
<table>
  <tr><th>Round</th>${players.map(p => `<th>P${p.seat} ${p.character} (${escapeHtml(p.agent)})</th>`).join('')}</tr>
  ${roundRows}
</table>

<h2>Most-attempted routes (≥3 attempts)</h2>
<p class="hint">Routes with low pass-rates and many attempts are grind loops — the agent kept trying something that wasn't working. Useful for spotting prompt or balance issues.</p>
${grindRows || '<p class="hint">No player attempted any route 3+ times.</p>'}

<h2>Full decision chronology with rationales</h2>
<p class="hint">Click to expand each player. Every decision the agent made, with its rationale and the outcome. Use Cmd+F to search.</p>
${chronologySections}

<script>
  const SPECS = ${j(charts)};
  for (const [id, spec] of Object.entries(SPECS)) {
    Plotly.newPlot(id, spec.data, spec.layout, { responsive: true, displaylogo: false });
  }
</script>
</body>
</html>`;

const outPath = inputPath.replace(/\.jsonl$/, '.detail.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

if (flags.open) exec(`open "${outPath}"`, () => {});
