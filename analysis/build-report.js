// Build an interactive HTML report from a results/<date>/ directory of JSONL game logs.
//
// USAGE (plain English at the bottom of this file):
//   node analysis/build-report.js                    # uses today's results dir
//   node analysis/build-report.js results/2026-04-22 # explicit input dir
//   node analysis/build-report.js --open             # also open the report
//
// What it produces:
//   <input>/report.html — single static HTML with Plotly charts loaded from CDN.
//   No build step, no installation, no server. Open with file:// in any browser.
//
// Sections:
//   1. Run summary (engine version, agents, totals, fallback rate, end reasons)
//   2. INTERPRETATION CALLOUTS — top 5 of: closest finishes, longest games,
//      most one-sided games, most creative wins, biggest upsets. Each lists
//      the JSONL filename so you can replay it.
//   3. Win rate by character + by agent (bar charts)
//   4. Game length and end reasons (histogram + breakdown)
//   5. Character matchup matrix (heatmap)
//   6. Milestone completion rates by character
//   7. Ability use distribution (creativity proxy)
//   8. Gear purchase frequency
//
// All aggregation is in plain JS (no pandas, no DB) — for the scale we're
// at (hundreds to thousands of games), Node + JS objects are plenty fast.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';

// ---------------- Argument parsing ----------------

const args = process.argv.slice(2);
const flags = { open: false };
let inputDir = null;
for (const a of args) {
  if (a === '--open') flags.open = true;
  else if (!a.startsWith('--')) inputDir = a;
}
if (!inputDir) {
  // Default to today's results directory.
  inputDir = path.join('results', new Date().toISOString().slice(0, 10));
}
if (!fs.existsSync(inputDir)) {
  console.error(`results directory not found: ${inputDir}`);
  console.error('hint: run `node sim/run-matrix.js` first.');
  process.exit(1);
}

// ---------------- Load all games ----------------

// Each game becomes one object: { filename, meta, summary, events[] }.
// Partial games (missing run_summary line) are skipped — they were
// presumably interrupted and shouldn't pollute the analysis.
function loadAllGames(dir) {
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.jsonl')) continue;
    const fp = path.join(dir, file);
    const text = fs.readFileSync(fp, 'utf8').trim();
    if (!text) continue;
    let meta = null, summary = null;
    const events = [];
    for (const line of text.split('\n')) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.kind === 'run_meta') meta = obj;
      else if (obj.kind === 'run_summary') summary = obj;
      else events.push(obj);
    }
    if (!meta || !summary) continue;
    out.push({ filename: file, meta, summary, events });
  }
  return out;
}

const games = loadAllGames(inputDir);
console.log(`loaded ${games.length} complete games from ${inputDir}`);
if (!games.length) {
  console.error('no completed games found — nothing to report.');
  process.exit(1);
}

// ---------------- Aggregations ----------------

// Wins-by-character / wins-by-agent: how often each character/agent won.
// Plays-by-character: how often each character was even in a game (denominator).
function tallyWins(games) {
  const winsByChar = {};
  const winsByAgent = {};
  const playsByChar = {};
  const playsByAgent = {};
  for (const g of games) {
    for (const ch of g.meta.characters)  playsByChar[ch]  = (playsByChar[ch]  || 0) + 1;
    for (const ag of g.meta.agents)      playsByAgent[ag] = (playsByAgent[ag] || 0) + 1;
    if (g.summary.winner != null) {
      const ch = g.summary.winnerCharacter;
      const ag = g.summary.winnerAgent;
      if (ch) winsByChar[ch]  = (winsByChar[ch]  || 0) + 1;
      if (ag) winsByAgent[ag] = (winsByAgent[ag] || 0) + 1;
    }
  }
  return { winsByChar, winsByAgent, playsByChar, playsByAgent };
}

function endReasonBreakdown(games) {
  const out = {};
  for (const g of games) out[g.summary.reason] = (out[g.summary.reason] || 0) + 1;
  return out;
}

function gameLengthDistribution(games) {
  return games.map(g => g.summary.rounds);
}

// Per-character milestone completion: among games where character X played,
// average milestonesDone for that character at game end.
function milestoneCompletionByChar(games) {
  const sum = {}, count = {};
  for (const g of games) {
    for (const p of g.summary.finalPlayers) {
      sum[p.characterKey]   = (sum[p.characterKey] || 0) + p.milestonesDone;
      count[p.characterKey] = (count[p.characterKey] || 0) + 1;
    }
  }
  const out = {};
  for (const k of Object.keys(sum)) out[k] = sum[k] / count[k];
  return out;
}

// Pairwise character matchup matrix. matchupWins[A][B] = times A won when both played.
// Symmetric "plays" denominator gives win-rate-with-A-against-B.
function matchupMatrix(games) {
  const wins = {}, plays = {};
  const ensure = (a, b) => {
    wins[a]  = wins[a]  || {}; wins[a][b]  = wins[a][b]  || 0;
    plays[a] = plays[a] || {}; plays[a][b] = plays[a][b] || 0;
  };
  for (const g of games) {
    const chars = g.meta.characters;
    for (const a of chars) for (const b of chars) {
      if (a === b) continue;
      ensure(a, b);
      plays[a][b]++;
      if (g.summary.winnerCharacter === a) wins[a][b]++;
    }
  }
  return { wins, plays };
}

// Ability activation count per game per player. Proxy for "creative play."
function abilityUsesPerGame(games) {
  const byChar = {}; // characterKey → array of usage counts (one per game-played)
  for (const g of games) {
    const counts = {};
    for (const e of g.events) {
      if (e.type !== 'ability_activated') continue;
      const pn = e.payload.playerNum;
      counts[pn] = (counts[pn] || 0) + 1;
    }
    for (const p of g.summary.finalPlayers) {
      if (!byChar[p.characterKey]) byChar[p.characterKey] = [];
      byChar[p.characterKey].push(counts[p.playerNum] || 0);
    }
  }
  return byChar;
}

// Gear purchase frequency across all games. Useful for spotting dead gear
// (never bought) vs over-bought items.
function gearPurchaseFrequency(games) {
  const counts = {};
  for (const g of games) {
    for (const e of g.events) {
      if (e.type === 'gear_purchased') {
        counts[e.payload.gearName] = (counts[e.payload.gearName] || 0) + 1;
      }
    }
  }
  return counts;
}

// Per-(character, agent) action distribution and climb-success metrics.
// This is the answer to "what kinds of turns did each bot take per character"
// — across all games, broken down by both character (who they were playing)
// AND agent (which strategy).
function actionMetricsByCharAgent(games) {
  // Key: "<character>::<agent>". Value: rolling counters.
  const m = {};
  const ensure = (k) => {
    if (!m[k]) m[k] = {
      actions: { climb: 0, milestone: 0, train: 0, rest: 0, buyGear: 0, endTurn: 0 },
      climbsAttempted: 0, climbsSucceeded: 0,
      milestonesAttempted: 0, milestonesSucceeded: 0,
      gamesPlayed: 0,
      totalLevel: 0, totalXp: 0, totalGear: 0, totalMilestonesDone: 0,
    };
    return m[k];
  };

  for (const g of games) {
    // Build a per-player key map for this game.
    const playerKey = {};
    for (let seat = 0; seat < g.meta.characters.length; seat++) {
      const k = `${g.meta.characters[seat]}::${g.meta.agents[seat]}`;
      playerKey[seat + 1] = k;
      const rec = ensure(k);
      rec.gamesPlayed++;
      const fp = g.summary.finalPlayers[seat];
      rec.totalLevel += fp.level;
      rec.totalXp += fp.xpTotal;
      rec.totalGear += fp.gearBought;
      rec.totalMilestonesDone += fp.milestonesDone;
    }

    // Walk events.
    for (const e of g.events) {
      if (e.type === 'action_chosen') {
        const k = playerKey[e.payload.playerNum];
        if (!k) continue;
        const t = e.payload.action.type;
        ensure(k).actions[t] = (ensure(k).actions[t] || 0) + 1;
      }
      if (e.type === 'climb_resolved') {
        const k = playerKey[e.payload.playerNum];
        if (!k) continue;
        const rec = ensure(k);
        if (e.payload.isMilestone) {
          rec.milestonesAttempted++;
          if (e.payload.success) rec.milestonesSucceeded++;
        } else {
          rec.climbsAttempted++;
          if (e.payload.success) rec.climbsSucceeded++;
        }
      }
    }
  }
  return m;
}

// Generate auto-narrative findings from aggregate data — the "major trends"
// section. Each entry is one bullet point. Designed so a non-engineer reading
// the report sees the punchline before scrolling through charts.
function generateMajorTrends(games, tally, charAgentMetrics, fallbacks, gearFreq) {
  const trends = [];
  const nGames = games.length;

  // T1: end reason distribution
  const reasons = {};
  for (const g of games) reasons[g.summary.reason] = (reasons[g.summary.reason] || 0) + 1;
  const maxRoundsPct = ((reasons.max_rounds || 0) / nGames * 100);
  if (maxRoundsPct >= 50) {
    trends.push({
      severity: 'warning',
      text: `<b>${maxRoundsPct.toFixed(0)}% of games hit max_rounds</b> with no winner. Most matchups can't finish in the round budget — strong signal that the game is too hard for the current agents/balance, OR the round cap is too low for the strategies these agents are using.`,
    });
  } else if (maxRoundsPct < 20) {
    trends.push({
      severity: 'good',
      text: `<b>${(100 - maxRoundsPct).toFixed(0)}% of games complete via all_milestones</b> — agents are converging on victory paths effectively.`,
    });
  }

  // T2: per-character win rate gaps
  const charWinRates = {};
  for (const c of Object.keys(tally.playsByChar)) {
    charWinRates[c] = { wins: tally.winsByChar[c] || 0, plays: tally.playsByChar[c], rate: (tally.winsByChar[c] || 0) / tally.playsByChar[c] };
  }
  const sortedChars = Object.entries(charWinRates).sort((a, b) => b[1].rate - a[1].rate);
  const zeroWinChars = sortedChars.filter(([, v]) => v.wins === 0 && v.plays >= 3);
  if (zeroWinChars.length) {
    trends.push({
      severity: 'warning',
      text: `<b>Zero-win characters (≥3 games):</b> ${zeroWinChars.map(([c, v]) => `${c} (0/${v.plays})`).join(', ')}. Suggests stat-archetype mismatch with the route pool, or strategy bias in the agents playing them.`,
    });
  }

  // T3: climb pass rate per (character, agent)
  const lowPass = [];
  for (const [k, r] of Object.entries(charAgentMetrics)) {
    if (r.climbsAttempted >= 30 && (r.climbsSucceeded / r.climbsAttempted) < 0.4) {
      lowPass.push({ key: k, rate: (r.climbsSucceeded / r.climbsAttempted), attempts: r.climbsAttempted });
    }
  }
  if (lowPass.length) {
    lowPass.sort((a, b) => a.rate - b.rate);
    trends.push({
      severity: 'warning',
      text: `<b>Low climb pass rates (<40% across ≥30 attempts):</b> ${lowPass.slice(0, 4).map(x => `${x.key.replace('::', ' / ')} ${(x.rate * 100).toFixed(0)}%`).join('; ')}. The agent is either picking climbs above its stat budget, or the game lacks accessible-difficulty routes for that character.`,
    });
  }

  // T4: training imbalance (over-trained stats)
  const trainImbalances = [];
  for (const g of games) {
    const trainsBySeat = {};
    for (const e of g.events) {
      if (e.type === 'train_action') {
        const seat = e.payload.playerNum;
        trainsBySeat[seat] = trainsBySeat[seat] || { strength: 0, technique: 0, focus: 0, flexibility: 0 };
        trainsBySeat[seat][e.payload.stat]++;
      }
    }
    for (const seat of Object.keys(trainsBySeat)) {
      const t = trainsBySeat[seat];
      const tot = Object.values(t).reduce((a, b) => a + b, 0);
      if (tot < 8) continue;
      const ranked = Object.entries(t).sort((a, b) => b[1] - a[1]);
      const dominantPct = ranked[0][1] / tot;
      const ignored = ranked.filter(([, v]) => v === 0).map(([s]) => s);
      if (dominantPct > 0.6 && ignored.length > 0) {
        trainImbalances.push({
          file: g.filename, seat, character: g.meta.characters[seat - 1], agent: g.meta.agents[seat - 1],
          dominant: ranked[0][0], dominantCount: ranked[0][1], total: tot, ignored: ignored,
        });
      }
    }
  }
  if (trainImbalances.length >= 3) {
    const sample = trainImbalances[0];
    trends.push({
      severity: 'warning',
      text: `<b>Training imbalance pattern across ${trainImbalances.length} player-games:</b> agents heavily favor one stat (>60% of trains) while completely ignoring others. Example: ${sample.character} via ${sample.agent} trained ${sample.dominant} ${sample.dominantCount}/${sample.total} times, never trained ${sample.ignored.join(' or ')}. Often reflects a "lowest absolute stat" heuristic instead of "largest gap to next milestone."`,
    });
  }

  // T5: dead gear (purchased zero or close to zero times)
  // We need to enumerate ALL items, not just purchased ones. Import GEAR_SHOP
  // to find the diff. Done via dynamic check.
  const purchasedSet = new Set(Object.keys(gearFreq));
  // Read gear list lazily (importing here avoids circular import on top-of-file).
  let unboughtGear = [];
  try {
    // Use require-equivalent for ESM via dynamic import is awkward; just enumerate
    // a small known list of "expected" items for the dead-gear check.
    // For simplicity, we report items with 0 purchases relative to game count.
    const lowFreq = Object.entries(gearFreq)
      .filter(([, v]) => v < Math.max(1, nGames * 0.1))
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5);
    if (lowFreq.length) {
      trends.push({
        severity: 'info',
        text: `<b>Rarely-bought gear (under 10% of games):</b> ${lowFreq.map(([n, c]) => `${n} (${c}x)`).join(', ')}. Either too expensive, dominated by alternatives, or solving a problem agents don't have. Candidates for repricing or removal.`,
      });
    }
  } catch (e) { /* ignore */ }

  // T6: fallback rate alarm
  for (const [agent, s] of Object.entries(fallbacks)) {
    if (s.rate > 0.05) {
      trends.push({
        severity: 'warning',
        text: `<b>Agent fallback rate over 5% threshold:</b> ${agent} fell back ${s.fallbacks}/${s.actions} times (${(s.rate * 100).toFixed(1)}%). Decisions for this agent may not be representative — they were filled in by the engine's heuristic, not the agent itself.`,
      });
    }
  }

  return trends;
}

// Generate rule-based recommended fixes — concrete, actionable suggestions
// derived from the data. These are NOT prescriptions; they're starting points
// for the designer to investigate.
function generateRecommendedFixes(games, tally, charAgentMetrics, fallbacks, gearFreq) {
  const recs = [];
  const nGames = games.length;
  const reasons = {};
  for (const g of games) reasons[g.summary.reason] = (reasons[g.summary.reason] || 0) + 1;

  // R1: zero-win characters with viable play (lots of attempts but no wins)
  for (const c of Object.keys(tally.playsByChar)) {
    const wins = tally.winsByChar[c] || 0;
    const plays = tally.playsByChar[c];
    if (wins === 0 && plays >= 5) {
      // Find best per-agent metrics for this character
      const matching = Object.entries(charAgentMetrics).filter(([k]) => k.startsWith(`${c}::`));
      const avgMs = matching.length ? matching.reduce((a, [, r]) => a + r.totalMilestonesDone / r.gamesPlayed, 0) / matching.length : 0;
      recs.push({
        priority: 'HIGH',
        title: `Investigate buffing ${c}`,
        text: `0 wins across ${plays} games, average ${avgMs.toFixed(1)}/3 milestones at game end. Suggested experiments: (a) buff starting stats most-relevant to the easiest milestones; (b) add 2–3 ${c}-friendly easy routes if the route pool over-indexes other archetypes; (c) check whether the heuristic ALSO loses with this character — if yes, it's a balance issue, not just an LLM issue.`,
      });
    }
  }

  // R2: max_rounds rate too high — game can't finish in budget
  const maxR = ((reasons.max_rounds || 0) / nGames);
  if (maxR > 0.5) {
    recs.push({
      priority: 'HIGH',
      title: `Game length: too many max_rounds endings`,
      text: `${(maxR * 100).toFixed(0)}% of games hit the round cap. Options: (a) raise maxRounds (currently 45); (b) lower expert milestone stat requirements (the typical bottleneck); (c) increase XP gain on intermediate climbs to accelerate level-up; (d) add more easy routes to bootstrap the early game.`,
    });
  }

  // R3: very-low-pass-rate (char,agent) combinations — strategy or stat issue
  const veryLowPass = [];
  for (const [k, r] of Object.entries(charAgentMetrics)) {
    if (r.climbsAttempted >= 50 && (r.climbsSucceeded / r.climbsAttempted) < 0.25) {
      veryLowPass.push({ key: k, rate: (r.climbsSucceeded / r.climbsAttempted), attempts: r.climbsAttempted });
    }
  }
  if (veryLowPass.length) {
    recs.push({
      priority: 'MEDIUM',
      title: `Tune agent strategy for low-pass-rate combos`,
      text: `${veryLowPass.length} (character, agent) combinations have <25% climb pass rate over 50+ attempts. Drill into the per-game detail pages to see WHICH climbs are being attempted; if it's the same routes repeatedly, it's a memory/history issue. If it's a wide spread of routes, it's a stat-misalignment with the route pool — consider adding archetype-friendly easy routes or buffing starting stats.`,
    });
  }

  // R4: dead gear
  const lowFreq = Object.entries(gearFreq).filter(([, v]) => v < Math.max(1, nGames * 0.1));
  if (lowFreq.length >= 3) {
    recs.push({
      priority: 'LOW',
      title: `Review rarely-bought gear`,
      text: `${lowFreq.length} gear items were bought in fewer than 10% of games. Consider: (a) lowering their cost; (b) buffing their effect; (c) removing them if they're dominated by alternatives. Items: ${lowFreq.slice(0, 8).map(([n]) => n).join(', ')}.`,
    });
  }

  // R5: fallback rate
  const highFb = Object.entries(fallbacks).filter(([, s]) => s.rate > 0.05);
  if (highFb.length) {
    recs.push({
      priority: 'HIGH',
      title: `Fix agents falling back too often`,
      text: `${highFb.map(([a, s]) => `${a} (${(s.rate * 100).toFixed(1)}%)`).join(', ')}. Their results aren't representative. Check (a) the LLM is producing valid JSON, (b) per-turn timeout is high enough, (c) the action_index is in range.`,
    });
  }

  return recs;
}

// Per-game character progression — the "what each character ended the game
// looking like" snapshot. Used for the per-game detail table.
function perGameProgression(games) {
  return games.map(g => ({
    filename: g.filename,
    seed: g.meta.seed,
    reason: g.summary.reason,
    rounds: g.summary.rounds,
    winner: g.summary.winner,
    players: g.summary.finalPlayers.map((p, i) => ({
      seat: p.playerNum,
      character: p.characterKey,
      agent: g.meta.agents[i],
      level: p.level,
      xpTotal: p.xpTotal,
      gear: p.gearBought,
      milestones: p.milestonesDone,
    })),
  }));
}

// Fallback rate: per-agent fraction of turns that fell back to the engine
// heuristic. Anything above 5% means the agent is broken or the timeout is too tight.
function fallbackRateByAgent(games) {
  const actions = {}, fallbacks = {};
  for (const g of games) {
    for (const s of g.summary.perAgentStats || []) {
      actions[s.agent]   = (actions[s.agent]   || 0) + s.actions;
      fallbacks[s.agent] = (fallbacks[s.agent] || 0) + s.fallbacks;
    }
  }
  const out = {};
  for (const a of Object.keys(actions)) {
    out[a] = { actions: actions[a], fallbacks: fallbacks[a], rate: fallbacks[a] / actions[a] };
  }
  return out;
}

// ---------------- Interpretation callouts ----------------

// Smallest milestone gap between winner and best loser. A "0" means the
// runner-up was one milestone away. Negative gaps shouldn't happen but we
// guard anyway.
function callout_closestFinishes(games, n = 5) {
  const finished = games.filter(g => g.summary.winner != null);
  const enriched = finished.map(g => {
    const winner = g.summary.finalPlayers.find(p => p.playerNum === g.summary.winner);
    const others = g.summary.finalPlayers.filter(p => p.playerNum !== g.summary.winner);
    const bestOther = Math.max(0, ...others.map(p => p.milestonesDone));
    return { g, gap: 3 - bestOther, winner, runnerUpDone: bestOther };
  });
  enriched.sort((a, b) => a.gap - b.gap || a.g.summary.rounds - b.g.summary.rounds);
  return enriched.slice(0, n);
}

function callout_longest(games, n = 5) {
  return games.slice().sort((a, b) => b.summary.rounds - a.summary.rounds).slice(0, n);
}

function callout_oneSided(games, n = 5) {
  // For finished games: largest difference between winner's milestones (3) and
  // worst loser's. For unfinished games: largest gap between any two players.
  const enriched = games.map(g => {
    const ms = g.summary.finalPlayers.map(p => p.milestonesDone);
    return { g, gap: Math.max(...ms) - Math.min(...ms) };
  });
  enriched.sort((a, b) => b.gap - a.gap);
  return enriched.slice(0, n);
}

function callout_mostCreative(games, n = 5) {
  // Per-game total ability_activated events, ranked.
  const enriched = games.map(g => {
    const count = g.events.filter(e => e.type === 'ability_activated').length;
    return { g, abilityUses: count };
  });
  enriched.sort((a, b) => b.abilityUses - a.abilityUses);
  return enriched.slice(0, n);
}

// "Upset" = winner used an agent with a worse overall win rate, OR winner
// played a character with a below-median win rate. Uses overall stats.
function callout_upsets(games, agentWinRates, charWinRates, n = 5) {
  const enriched = games
    .filter(g => g.summary.winner != null)
    .map(g => {
      const ag = g.summary.winnerAgent;
      const ch = g.summary.winnerCharacter;
      const upsetScore = (1 - (agentWinRates[ag] || 0)) + (1 - (charWinRates[ch] || 0));
      return { g, upsetScore, ag, ch };
    });
  enriched.sort((a, b) => b.upsetScore - a.upsetScore);
  return enriched.slice(0, n);
}

// ---------------- Build the HTML ----------------

const tally = tallyWins(games);
const reasons = endReasonBreakdown(games);
const lengths = gameLengthDistribution(games);
const milestones = milestoneCompletionByChar(games);
const matrix = matchupMatrix(games);
const abilityUses = abilityUsesPerGame(games);
const gearFreq = gearPurchaseFrequency(games);
const fallbacks = fallbackRateByAgent(games);
const charAgentMetrics = actionMetricsByCharAgent(games);
const progression = perGameProgression(games);
const trends = generateMajorTrends(games, tally, charAgentMetrics, fallbacks, gearFreq);
const recommendations = generateRecommendedFixes(games, tally, charAgentMetrics, fallbacks, gearFreq);

// Win rates (for callouts)
const agentWinRates = {};
for (const a of Object.keys(tally.playsByAgent)) {
  agentWinRates[a] = (tally.winsByAgent[a] || 0) / tally.playsByAgent[a];
}
const charWinRates = {};
for (const c of Object.keys(tally.playsByChar)) {
  charWinRates[c] = (tally.winsByChar[c] || 0) / tally.playsByChar[c];
}

const callouts = {
  closest: callout_closestFinishes(games, 5),
  longest: callout_longest(games, 5),
  oneSided: callout_oneSided(games, 5),
  creative: callout_mostCreative(games, 5),
  upsets:   callout_upsets(games, agentWinRates, charWinRates, 5),
};

// Manifest, if available.
let manifest = null;
const manifestPath = path.join(inputDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
}

// JSON-stringify helper that quotes safely for HTML embedding.
const j = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

// Plotly chart specs as plain data — generated server-side, rendered client-side.
const chartSpecs = {
  winsByChar: {
    data: [{
      type: 'bar',
      x: Object.keys(tally.playsByChar),
      y: Object.keys(tally.playsByChar).map(c => charWinRates[c]),
      text: Object.keys(tally.playsByChar).map(c => `${tally.winsByChar[c] || 0}/${tally.playsByChar[c]}`),
      textposition: 'outside',
    }],
    layout: { title: 'Win rate by character', yaxis: { tickformat: '.0%' } },
  },
  winsByAgent: {
    data: [{
      type: 'bar',
      x: Object.keys(tally.playsByAgent),
      y: Object.keys(tally.playsByAgent).map(a => agentWinRates[a]),
      text: Object.keys(tally.playsByAgent).map(a => `${tally.winsByAgent[a] || 0}/${tally.playsByAgent[a]}`),
      textposition: 'outside',
    }],
    layout: { title: 'Win rate by agent', yaxis: { tickformat: '.0%' } },
  },
  endReasons: {
    data: [{
      type: 'pie',
      labels: Object.keys(reasons),
      values: Object.values(reasons),
    }],
    layout: { title: 'Game end reasons' },
  },
  gameLengths: {
    data: [{ type: 'histogram', x: lengths, nbinsx: 20 }],
    layout: { title: 'Game length distribution (rounds)', xaxis: { title: 'rounds' }, yaxis: { title: 'games' } },
  },
  milestones: {
    data: [{
      type: 'bar',
      x: Object.keys(milestones),
      y: Object.values(milestones),
    }],
    layout: { title: 'Avg. milestones completed (out of 3) by character', yaxis: { range: [0, 3] } },
  },
  abilityUses: {
    data: Object.keys(abilityUses).map(c => ({
      type: 'box', y: abilityUses[c], name: c,
    })),
    layout: { title: 'Ability uses per game by character (creativity proxy)' },
  },
  gearFreq: {
    data: [(() => {
      const sorted = Object.entries(gearFreq).sort((a, b) => b[1] - a[1]);
      return {
        type: 'bar',
        x: sorted.map(([k]) => k),
        y: sorted.map(([, v]) => v),
      };
    })()],
    layout: { title: 'Gear purchase frequency (across all games)', xaxis: { tickangle: -45 } },
  },
  matchupHeatmap: (() => {
    const chars = Object.keys(tally.playsByChar);
    const z = chars.map(a => chars.map(b =>
      a === b ? null : ((matrix.wins[a]?.[b] || 0) / (matrix.plays[a]?.[b] || 1))
    ));
    return {
      data: [{
        type: 'heatmap', x: chars, y: chars, z, zmin: 0, zmax: 1,
        colorscale: 'RdYlGn', hoverongaps: false,
      }],
      layout: { title: 'Win rate of ROW character against COLUMN character' },
    };
  })(),
};

const html = buildHtml({
  inputDir, manifest, games, tally, reasons, lengths, fallbacks,
  callouts, chartSpecs, milestones, agentWinRates, charWinRates,
  charAgentMetrics, progression, trends, recommendations,
});

const outPath = path.join(inputDir, 'report.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

if (flags.open) {
  // macOS-only `open`; on other OSes the user can open manually.
  exec(`open "${outPath}"`, () => {});
}

// ---------------- HTML template ----------------

function buildHtml(ctx) {
  const fallbackWarn = Object.entries(ctx.fallbacks)
    .filter(([, s]) => s.rate > 0.05)
    .map(([a, s]) => `${a}: ${(s.rate * 100).toFixed(1)}% (${s.fallbacks}/${s.actions})`)
    .join(', ');

  const calloutHtml = (title, list, formatter) => `
    <h3>${title}</h3>
    <ol>
      ${list.map(item => `<li>${formatter(item)}</li>`).join('')}
    </ol>
  `;

  const fmtGameLine = ({ g, ...extra }) => {
    const reason = g.summary.reason;
    const w = g.summary.winner ? `P${g.summary.winner} (${g.summary.winnerCharacter}) via ${g.summary.winnerAgent}` : 'no winner';
    const extras = Object.entries(extra).map(([k, v]) => `<b>${k}</b>: ${typeof v === 'number' ? v.toFixed(2) : v}`).join(' · ');
    return `<code>${g.filename}</code> — ${reason}, ${g.summary.rounds} rounds, winner: ${w}${extras ? ' · ' + extras : ''}`;
  };

  // Per-(character, agent) action metrics table — answers "what did each bot do?"
  const camKeys = Object.keys(ctx.charAgentMetrics).sort();
  const camRows = camKeys.map(k => {
    const r = ctx.charAgentMetrics[k];
    const [character, agent] = k.split('::');
    const total = Object.values(r.actions).reduce((a, b) => a + b, 0) || 1;
    const pct = (n) => `${((n / total) * 100).toFixed(0)}%`;
    const climbRate = r.climbsAttempted ? `${((r.climbsSucceeded / r.climbsAttempted) * 100).toFixed(0)}% (${r.climbsSucceeded}/${r.climbsAttempted})` : '—';
    const msRate = r.milestonesAttempted ? `${((r.milestonesSucceeded / r.milestonesAttempted) * 100).toFixed(0)}% (${r.milestonesSucceeded}/${r.milestonesAttempted})` : '—';
    const avgLevel = (r.totalLevel / r.gamesPlayed).toFixed(1);
    const avgXp = Math.round(r.totalXp / r.gamesPlayed);
    const avgGear = (r.totalGear / r.gamesPlayed).toFixed(1);
    const avgMs = (r.totalMilestonesDone / r.gamesPlayed).toFixed(2);
    return `
      <tr>
        <td><b>${character}</b></td><td>${agent}</td>
        <td>${r.gamesPlayed}</td>
        <td>${r.actions.climb} (${pct(r.actions.climb)})</td>
        <td>${r.actions.milestone} (${pct(r.actions.milestone)})</td>
        <td>${r.actions.train} (${pct(r.actions.train)})</td>
        <td>${r.actions.rest} (${pct(r.actions.rest)})</td>
        <td>${r.actions.buyGear} (${pct(r.actions.buyGear)})</td>
        <td>${r.actions.endTurn || 0}</td>
        <td>${climbRate}</td>
        <td>${msRate}</td>
        <td>${avgLevel}</td>
        <td>${avgXp}</td>
        <td>${avgGear}</td>
        <td>${avgMs}/3</td>
      </tr>
    `;
  }).join('');

  // Per-game character progression — final state of each player at game end.
  const progressionRows = ctx.progression.map(g => {
    const players = g.players.map(p =>
      `<div style="margin: 4px 0;"><b>P${p.seat}</b> ${p.character} (${p.agent.length > 25 ? p.agent.slice(0, 22) + '…' : p.agent}): L${p.level}, XP ${p.xpTotal}, gear ${p.gear}, milestones ${p.milestones}/3</div>`
    ).join('');
    // Detail page sits next to the JSONL with .detail.html extension.
    const detailHref = g.filename.replace(/\.jsonl$/, '.detail.html');
    return `<tr>
      <td><a href="${detailHref}" title="open turn-by-turn detail"><code>${g.filename}</code></a></td>
      <td>${g.seed}</td>
      <td>${g.reason}</td>
      <td>${g.rounds}</td>
      <td>${g.winner ? `P${g.winner}` : '—'}</td>
      <td>${players}</td>
    </tr>`;
  }).join('');

  const charsRows = Object.keys(ctx.tally.playsByChar).map(c => `
    <tr><td>${c}</td><td>${ctx.tally.playsByChar[c]}</td><td>${ctx.tally.winsByChar[c] || 0}</td><td>${(ctx.charWinRates[c] * 100).toFixed(1)}%</td></tr>
  `).join('');
  const agentsRows = Object.keys(ctx.tally.playsByAgent).map(a => `
    <tr><td>${a}</td><td>${ctx.tally.playsByAgent[a]}</td><td>${ctx.tally.winsByAgent[a] || 0}</td><td>${(ctx.agentWinRates[a] * 100).toFixed(1)}%</td></tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>All In Ascent — Playtest Report (${ctx.inputDir})</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 1200px; margin: 24px auto; padding: 0 24px; color: #222; }
  h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { margin-top: 36px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { background: #f5f5f7; padding: 12px 16px; border-radius: 8px; font-size: 14px; }
  .warn { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin: 12px 0; border-radius: 4px; }
  .ok   { background: #d4edda; border-left: 4px solid #28a745; padding: 12px 16px; margin: 12px 0; border-radius: 4px; }
  .chart { margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }
  th { background: #f5f5f7; }
  code { background: #f5f5f7; padding: 1px 6px; border-radius: 3px; font-size: 13px; }
  ol li { margin: 6px 0; line-height: 1.5; }
  .callouts { background: #fafafa; padding: 16px 24px; border-radius: 8px; }
  .trends { padding-left: 20px; }
  .trends li { margin: 8px 0; line-height: 1.5; padding: 8px 12px; border-radius: 4px; }
  .trends li.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
  .trends li.info    { background: #e3f2fd; border-left: 4px solid #2196f3; }
  .trends li.good    { background: #d4edda; border-left: 4px solid #28a745; }
  .recommendations { padding-left: 20px; }
  .recommendations li { margin: 10px 0; line-height: 1.5; padding: 10px 14px; border-radius: 4px; background: #f8f9fa; border-left: 4px solid #6c757d; }
  .rec-priority { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; color: white; margin-right: 6px; vertical-align: middle; }
  .rec-high   { background: #dc3545; }
  .rec-medium { background: #fd7e14; }
  .rec-low    { background: #6c757d; }
</style>
</head>
<body>

<h1>All In Ascent — Playtest Report</h1>
<div class="meta">
  <b>Source:</b> ${ctx.inputDir}/<br>
  <b>Games analyzed:</b> ${ctx.games.length}<br>
  ${ctx.manifest ? `<b>Manifest:</b> started ${ctx.manifest.startedAt}, ${ctx.manifest.totalGames} planned games` : ''}
</div>

${fallbackWarn
  ? `<div class="warn"><b>⚠ Fallback rate above 5% for:</b> ${fallbackWarn}<br>This usually means an agent is timing out or producing invalid output. Affected games are still included but their decisions may be near-random; treat per-character win rates with caution for these agents.</div>`
  : `<div class="ok"><b>✓ Agent fallback rates all below 5%</b> — agents are making real decisions; results are trustworthy.</div>`}

<h2>Major trends identified</h2>
<p style="font-size: 13px; color: #666;">Auto-generated from the data — bullet points to read first before scrolling through charts.</p>
${(ctx.trends || []).length === 0
  ? `<p>No notable trends flagged in this run.</p>`
  : `<ul class="trends">
      ${ctx.trends.map(t => `<li class="${t.severity}">${t.text}</li>`).join('')}
    </ul>`}

<h2>Recommended fixes</h2>
<p style="font-size: 13px; color: #666;">Rule-based suggestions derived from the data above. These are starting points to investigate, not prescriptions. Each maps to a concrete action you can take in <code>game.js</code> / <code>engine/data.js</code> / <code>sim/agents/*.js</code>.</p>
${(ctx.recommendations || []).length === 0
  ? `<p>No recommendations triggered by this run's data — the engine, agents, and balance look healthy from these games.</p>`
  : `<ol class="recommendations">
      ${ctx.recommendations.map(r => `<li><span class="rec-priority rec-${r.priority.toLowerCase()}">${r.priority}</span> <b>${r.title}.</b> ${r.text}</li>`).join('')}
    </ol>`}

<h2>Interpretation callouts</h2>
<div class="callouts">
  ${calloutHtml('Closest finishes (winner vs runner-up)',
      ctx.callouts.closest,
      x => fmtGameLine({ g: x.g, runnerUpMilestones: x.runnerUpDone }))}
  ${calloutHtml('Longest games (rounds)',
      ctx.callouts.longest.map(g => ({ g, rounds: g.summary.rounds })),
      x => fmtGameLine({ g: x.g, rounds: x.rounds }))}
  ${calloutHtml('Most one-sided games (milestone gap between best and worst player)',
      ctx.callouts.oneSided,
      x => fmtGameLine({ g: x.g, milestoneGap: x.gap }))}
  ${calloutHtml('Most creative wins (ability activations per game)',
      ctx.callouts.creative,
      x => fmtGameLine({ g: x.g, abilityUses: x.abilityUses }))}
  ${calloutHtml('Biggest upsets (low-win-rate agent or character winning)',
      ctx.callouts.upsets,
      x => fmtGameLine({ g: x.g, upsetScore: x.upsetScore }))}
</div>
<p style="font-size: 13px; color: #666;">
  To replay any of the games above: <code>node sim/replay.js ${ctx.inputDir}/&lt;filename&gt;</code>
</p>

<h2>Headline numbers</h2>
<table>
  <tr><th>Character</th><th>Games played</th><th>Wins</th><th>Win rate</th></tr>
  ${charsRows}
</table>
<table>
  <tr><th>Agent</th><th>Games played (seats)</th><th>Wins</th><th>Win rate</th></tr>
  ${agentsRows}
</table>

<div class="chart" id="winsByChar"></div>
<div class="chart" id="winsByAgent"></div>
<div class="chart" id="endReasons"></div>
<div class="chart" id="gameLengths"></div>

<h2>Action distribution by (character, agent)</h2>
<p>What kind of turns did each bot take? Each row is a unique <i>character + agent</i> seat combination across all games. Columns show how often that combination took each action type, plus aggregate climb/milestone success rates and end-of-game stats. <b>A 100% climb pass rate</b> means the bot only attempted climbs it could pass; a low rate means it was attempting climbs it couldn't beat (wasted turns + lost endurance).</p>
<table style="font-size: 13px;">
  <tr>
    <th>Character</th><th>Agent</th><th>Games</th>
    <th>Climb</th><th>Milestone</th><th>Train</th><th>Rest</th><th>BuyGear</th><th>EndTurn</th>
    <th>Climb pass rate</th><th>Milestone pass rate</th>
    <th>Avg L</th><th>Avg XP</th><th>Avg gear</th><th>Avg milestones</th>
  </tr>
  ${camRows}
</table>

<h2>Per-game character progression (final state)</h2>
<p>Snapshot of each player at game end — character, agent, level, XP, gear bought, milestones completed. Use this to spot which combinations finish strong vs starve.</p>
<table style="font-size: 13px;">
  <tr>
    <th>File</th><th>Seed</th><th>Reason</th><th>Rounds</th><th>Winner</th><th>Final state</th>
  </tr>
  ${progressionRows}
</table>

<h2>Character matchup matrix</h2>
<p>Cell (row=A, col=B) is the win rate of A in games where both A and B played. Empty diagonal because we never have duplicate characters in a game.</p>
<div class="chart" id="matchupHeatmap"></div>

<h2>Milestone completion</h2>
<p>Average milestones completed (out of 3) per character at game end. A character whose average is far from 3 is either character-gated by the expert milestone or strategically struggling.</p>
<div class="chart" id="milestones"></div>

<h2>Creativity (ability uses)</h2>
<p>Box plot of how often each character activated their special ability per game. Wider distributions = playstyle variety; tightly clustered low values may indicate the ability isn't being leveraged.</p>
<div class="chart" id="abilityUses"></div>

<h2>Gear economy</h2>
<p>Frequency each gear item was purchased across all games. Items at the right tail are unbought across the whole run — design candidates for rebalancing or removal.</p>
<div class="chart" id="gearFreq"></div>

<h2>Agent fallback rates</h2>
<table>
  <tr><th>Agent</th><th>Total turns</th><th>Fallbacks</th><th>Fallback rate</th></tr>
  ${Object.entries(ctx.fallbacks).map(([a, s]) =>
    `<tr><td>${a}</td><td>${s.actions}</td><td>${s.fallbacks}</td><td>${(s.rate * 100).toFixed(2)}%</td></tr>`
  ).join('')}
</table>

<script>
  // Render every Plotly chart from the spec object below.
  const SPECS = ${j(ctx.chartSpecs)};
  for (const [id, spec] of Object.entries(SPECS)) {
    Plotly.newPlot(id, spec.data, spec.layout, { responsive: true, displaylogo: false });
  }
</script>
</body>
</html>`;
}

/* PLAIN-ENGLISH CLI SUMMARY (for non-developers):
 *
 * After you've run the simulations (sim/run-matrix.js), the JSONL files
 * contain raw event data — useful but not human-friendly. This script
 * reads all of them and produces ONE web page that summarizes the run with
 * charts and short narrative callouts.
 *
 *   node analysis/build-report.js
 *
 * That writes results/<today>/report.html. Open it in any browser
 * (double-click works). Pass --open to auto-open it on macOS:
 *
 *   node analysis/build-report.js --open
 *
 * Or point at a different results directory:
 *
 *   node analysis/build-report.js results/2026-04-22
 */
