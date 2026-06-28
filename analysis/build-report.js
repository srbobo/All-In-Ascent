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

  // T1: end-reason distribution
  // The engine no longer has a round cap (v0.5.0); games either complete
  // via all_milestones or end via 'forfeit' (an agent ran out of options
  // for many rounds — a programming-bug signal, not a game-design one).
  const reasons = {};
  for (const g of games) reasons[g.summary.reason] = (reasons[g.summary.reason] || 0) + 1;
  const allMilestonesPct = ((reasons.all_milestones || 0) / nGames * 100);
  if (allMilestonesPct >= 80) {
    trends.push({
      severity: 'good',
      text: `<b>${allMilestonesPct.toFixed(0)}% of games complete via all_milestones</b> — agents are converging on victory paths effectively.`,
    });
  } else if (allMilestonesPct < 50) {
    trends.push({
      severity: 'warning',
      text: `<b>Only ${allMilestonesPct.toFixed(0)}% of games complete via all_milestones</b>. The rest forfeited (agents stuck without legal progress) — strong signal that current balance + agents struggle to converge on a victory path.`,
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

  // R2: forfeit rate too high — game can't converge on a winner
  // (As of v0.5.0, max_rounds no longer exists as an end reason; games
  // that don't end via all_milestones end via 'forfeit'.)
  const forfeitR = ((reasons.forfeit || 0) / nGames);
  if (forfeitR > 0.5) {
    recs.push({
      priority: 'HIGH',
      title: `Game progression: too many forfeit endings`,
      text: `${(forfeitR * 100).toFixed(0)}% of games end without a winner — agents getting stuck. Options: (a) lower expert milestone stat requirements (the typical bottleneck); (b) increase XP gain on intermediate climbs to accelerate level-up; (c) add more easy routes to bootstrap the early game; (d) inspect agent fallback rate to confirm this isn't an LLM-prompt failure.`,
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
// ---------------- Strategic intent extraction ----------------
//
// Pull strategy_initial + strategy_update events emitted by LLM agents (Phase 1+2
// of the strategy capture layer, sim/agents/ollama.js + sim/run-one-game.js).
// Build per-game cards so analysts can read what the model planned, when it
// shifted course, and whether its tactical actions matched its stated plan.
//
// Returns one object per game that has at least one strategy_initial event.
// Games without strategy events (heuristic-only) are skipped — the section
// renders as "no LLM strategies recorded" so the report stays useful for
// non-LLM smokes too.

const ACCESS_CARD_NAMES = new Set(['Belay Device', 'Locking Carabiner', 'Lead Rope']);
const STAT_BY_TRAINING_AREA = {
  'Campus Board': 'strength',
  'Continuous MoonBoard': 'technique',
  'Grip Board': 'focus',
  'Balance and Core': 'flexibility',
};

function extractStrategiesPerGame(games) {
  const out = [];
  for (const g of games) {
    const strategiesBySeat = new Map(); // seat -> { initial, updates: [], decisions: [], actions: {} }
    for (const e of g.events) {
      const p = e.payload || {};
      if (e.type === 'strategy_initial') {
        if (!strategiesBySeat.has(p.seat)) {
          strategiesBySeat.set(p.seat, {
            seat: p.seat, agent: p.agent, characterKey: p.characterKey,
            initial: p, updates: [], decisions: [],
            training: { strength: 0, technique: 0, focus: 0, flexibility: 0 },
            accessBuys: 0, totalActions: 0,
            milestonesCompleted: [],
            playerNum: p.playerNum,
          });
        }
      } else if (e.type === 'strategy_update') {
        const rec = strategiesBySeat.get(p.seat);
        if (rec) rec.updates.push(p);
      } else if (e.type === 'agent_decision') {
        const rec = strategiesBySeat.get(p.seat);
        if (rec) rec.decisions.push({
          round: p.round, actionType: p.actionType, rationale: p.rationale,
          activeStrategy: p.activeStrategy, strategyChanged: p.strategyChanged === true,
        });
      } else if (e.type === 'action_chosen') {
        const rec = strategiesBySeat.get(p.playerNum);
        if (!rec) continue;
        rec.totalActions++;
        const a = p.action || {};
        if (a.type === 'train') {
          const stat = STAT_BY_TRAINING_AREA[a.areaName];
          if (stat) rec.training[stat]++;
        } else if (a.type === 'buyGear' && ACCESS_CARD_NAMES.has(a.gearName)) {
          rec.accessBuys++;
        }
      } else if (e.type === 'milestone_progress') {
        const rec = strategiesBySeat.get(p.playerNum);
        if (rec) rec.milestonesCompleted.push({
          round: e.payload.round || null,
          tier: p.tier,
          totalCompleted: p.totalCompleted,
        });
      }
    }

    if (strategiesBySeat.size === 0) continue;

    for (const rec of strategiesBySeat.values()) {
      const trainTotal = Object.values(rec.training).reduce((a, b) => a + b, 0);
      const declaredBottleneck = rec.initial?.strategy?.bottleneckStat || null;
      // Normalize "Str" / "strength" etc.
      const normalizedDecl = normalizeStat(declaredBottleneck);
      const actuallyMostTrained = trainTotal > 0
        ? Object.entries(rec.training).sort((a, b) => b[1] - a[1])[0][0]
        : null;
      const planAdhered = normalizedDecl && actuallyMostTrained
        && normalizedDecl === actuallyMostTrained;
      const declaredCount = normalizedDecl ? (rec.training[normalizedDecl] || 0) : 0;

      out.push({
        filename: g.filename,
        seed: g.meta.seed,
        rounds: g.summary.rounds,
        winner: g.summary.winner,
        winnerCharacter: g.summary.winnerCharacter,
        seat: rec.seat,
        agent: rec.agent,
        characterKey: rec.characterKey,
        initial: rec.initial,
        updates: rec.updates,
        decisionCount: rec.decisions.length,
        training: rec.training,
        trainTotal,
        accessBuys: rec.accessBuys,
        declaredBottleneck: normalizedDecl,
        actuallyMostTrained,
        declaredBottleneckTrainings: declaredCount,
        planAdhered,
        milestonesCompletedByLLM: rec.milestonesCompleted,
        finalMilestones: g.summary.finalPlayers?.[rec.seat - 1]?.milestonesDone || 0,
      });
    }
  }
  return out;
}

// Detect tournament directories: presence of a tournament-summary.json file
// AND a memory-<character>.json file is the unambiguous signal. Returns the
// parsed tournament summary + memory or null if not a tournament dir.
function detectTournament(dir) {
  const summaryPath = path.join(dir, 'tournament-summary.json');
  if (!fs.existsSync(summaryPath)) return null;
  let tournamentSummary;
  try { tournamentSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')); }
  catch { return null; }

  const memPath = path.join(dir, `memory-${tournamentSummary.character}.json`);
  if (!fs.existsSync(memPath)) return null;
  let memory;
  try { memory = JSON.parse(fs.readFileSync(memPath, 'utf8')); }
  catch { return null; }

  return { tournamentSummary, memory };
}

function normalizeStat(s) {
  if (!s) return null;
  const m = String(s).toLowerCase();
  if (m.startsWith('str')) return 'strength';
  if (m.startsWith('tec')) return 'technique';
  if (m.startsWith('foc')) return 'focus';
  if (m.startsWith('fle') || m.startsWith('flx') || m.startsWith('flex')) return 'flexibility';
  return null;
}

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
const strategies = extractStrategiesPerGame(games);
const tournamentData = detectTournament(inputDir);
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
  charAgentMetrics, progression, trends, recommendations, strategies,
  tournamentData,
});

const outPath = path.join(inputDir, 'report.html');
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);

if (flags.open) {
  // macOS-only `open`; on other OSes the user can open manually.
  exec(`open "${outPath}"`, () => {});
}

// ---------------- HTML template ----------------

// Render the Tournament (in-context learning) section. Only present when the
// input directory is a tournament dir (detectTournament returned non-null).
// Surfaces the headline question — is the model learning across games? — via:
//   - Score trajectory line chart
//   - Per-iteration strategy + reflection cards
//   - Linear-regression slope on the score series (learning rate proxy)
function buildTournamentSection(td) {
  const { tournamentSummary, memory } = td;
  const scores = tournamentSummary.scoreTrajectory || [];
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));

  // Linear regression on score vs iteration. Slope > 0 = improving.
  // Simple least-squares; small N is fine since we just want a directional signal.
  const slope = (() => {
    if (scores.length < 2) return null;
    const n = scores.length;
    const xs = scores.map((_, i) => i + 1);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = scores.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((a, x, i) => a + (x - meanX) * (scores[i] - meanY), 0);
    const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
    return den === 0 ? 0 : num / den;
  })();

  const best = scores.length ? Math.max(...scores) : 0;
  const bestIter = scores.length ? scores.indexOf(best) + 1 : 0;
  const first = scores[0] ?? 0;
  const last = scores[scores.length - 1] ?? 0;

  const gameCards = (memory.games || []).map((g, idx) => {
    const sd = g.scoreData || {};
    const ref = g.reflection || {};
    const init = g.initialStrategy || {};
    const shifts = g.strategyShifts || [];
    const score = sd.score ?? '?';
    const prevScore = idx > 0 ? memory.games[idx - 1].scoreData?.score : null;
    const delta = prevScore != null ? score - prevScore : null;
    const deltaTag = delta == null ? '' :
      delta > 0 ? `<span class="delta up">+${delta}</span>` :
      delta < 0 ? `<span class="delta down">${delta}</span>` :
                  `<span class="delta flat">±0</span>`;

    return `
      <div class="tournament-game">
        <h4>
          Iteration ${g.gameNum} <span class="iter-score">score ${score}${deltaTag}</span>
          <span class="iter-tags">
            ${sd.win ? '<span class="iter-tag win">WIN</span>' : '<span class="iter-tag loss">loss</span>'}
            <span class="iter-tag">${sd.milestonesCompleted ?? '?'}/3 ms</span>
            <span class="iter-tag">${sd.abilityTriggers ?? '?'} ability</span>
          </span>
        </h4>
        <div class="tournament-game-grid">
          <div>
            <h5>Initial plan</h5>
            <p class="plan-text">${escape(init.summary || '(none)')}</p>
            <p class="plan-meta">Declared bottleneck: <b>${escape(init.bottleneckStat || '?')}</b></p>
            ${shifts.length
              ? `<p class="plan-meta">${shifts.length} strategy shift${shifts.length === 1 ? '' : 's'} (round${shifts.length === 1 ? '' : 's'} ${shifts.map(s => s.round).join(', ')})</p>`
              : `<p class="plan-meta">No shifts — stayed on plan.</p>`}
          </div>
          <div>
            <h5>Reflection</h5>
            ${ref.what_worked   ? `<p><b>Worked:</b> ${escape(ref.what_worked)}</p>` : ''}
            ${ref.what_failed   ? `<p><b>Failed:</b> ${escape(ref.what_failed)}</p>` : ''}
            ${ref.advice_for_next_game
              ? `<p class="advice"><b>Advice to next iteration:</b> ${escape(ref.advice_for_next_game)}</p>`
              : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  const trajectoryChart = `
    <div class="chart" id="tournamentScoreChart"></div>
    <script>
      Plotly.newPlot('tournamentScoreChart', [{
        type: 'scatter', mode: 'lines+markers',
        x: [${scores.map((_, i) => i + 1).join(',')}],
        y: [${scores.join(',')}],
        line: { color: '#1a73e8', width: 3 },
        marker: { size: 10 },
        name: 'score'
      }], {
        title: 'Score trajectory across iterations',
        xaxis: { title: 'Iteration', dtick: 1 },
        yaxis: { title: 'Score' },
        margin: { t: 40, r: 30, b: 50, l: 60 }
      }, { responsive: true, displaylogo: false });
    </script>
  `;

  return `
    <h2>Tournament — in-context learning experiment</h2>
    <p style="font-size: 13px; color: #666;">
      One LLM seat (<b>${escape(tournamentSummary.character)}</b>) plays the same seed
      (<code>${tournamentSummary.seed}</code>) ${tournamentSummary.iterations} times.
      Between games, the model receives its prior strategies + reflections as
      memory in the next planning prompt. Question: does the score trend up?
    </p>
    <div class="tournament-headline">
      <div class="strategy-stat">
        <div class="stat-value">${scores.length}</div>
        <div class="stat-label">iterations completed</div>
      </div>
      <div class="strategy-stat">
        <div class="stat-value">${best}</div>
        <div class="stat-label">best score (iter ${bestIter})</div>
      </div>
      <div class="strategy-stat">
        <div class="stat-value">${last - first >= 0 ? '+' : ''}${last - first}</div>
        <div class="stat-label">first → last delta (${first} → ${last})</div>
      </div>
      <div class="strategy-stat">
        <div class="stat-value" style="color: ${slope > 0.5 ? '#28a745' : slope < -0.5 ? '#dc3545' : '#6c757d'};">
          ${slope == null ? '—' : (slope > 0 ? '+' : '') + slope.toFixed(1)}
        </div>
        <div class="stat-label">score / iteration slope (learning rate proxy)</div>
      </div>
    </div>
    ${trajectoryChart}
    <div class="tournament-games">
      ${gameCards}
    </div>
  `;
}

// Render the Strategic Intent section. For each game with LLM strategy
// data (planStrategy() + per-turn evaluation), surface:
//   - initial strategy (summary, bottleneck, milestone order, opening moves)
//   - strategy shift timeline (when, why, how it changed)
//   - plan-vs-execution gap (declared bottleneck stat vs actually trained)
// Built as a stand-alone helper so non-strategy reports skip it cleanly.
function buildStrategySection(strategies) {
  // Aggregate: how often does the LLM's declared bottleneck match its
  // most-trained stat? That's the headline "did intent match execution" stat.
  const withDeclared = strategies.filter(s => s.declaredBottleneck);
  const adheredCount = withDeclared.filter(s => s.planAdhered).length;
  const adherenceRate = withDeclared.length
    ? (adheredCount / withDeclared.length * 100).toFixed(0)
    : '—';
  const totalShifts = strategies.reduce((a, s) => a + s.updates.length, 0);

  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
  const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  const cards = strategies.map(s => {
    const init = s.initial?.strategy || {};
    const opening = (init.openingMoves || []).map(m => `<li>${escape(m)}</li>`).join('');
    const risks = (init.anticipatedRisks || []).map(r => `<li>${escape(r)}</li>`).join('');
    const priority = (init.milestonePriority || []).join(' → ') || '(none)';

    const updatesHtml = s.updates.length === 0
      ? `<p style="color:#666;font-style:italic;">No strategy shifts declared — model stayed on its initial plan throughout.</p>`
      : `<ol class="strategy-shifts">
          ${s.updates.map(u => `
            <li>
              <div class="shift-header"><b>Round ${u.round}</b> · <i>${escape(u.changeReason || '(no reason)')}</i></div>
              <div class="shift-diff">
                <div class="shift-old"><b>Was:</b> ${escape(truncate(u.previousSummary || '', 200))}</div>
                <div class="shift-new"><b>Now:</b> ${escape(truncate(u.newSummary || '', 200))}</div>
                ${(u.previousBottleneckStat || u.newBottleneckStat) && u.previousBottleneckStat !== u.newBottleneckStat
                  ? `<div class="shift-meta">Bottleneck: ${escape(u.previousBottleneckStat || '?')} → ${escape(u.newBottleneckStat || '?')}</div>`
                  : ''}
                ${JSON.stringify(u.previousMilestonePriority || []) !== JSON.stringify(u.newMilestonePriority || [])
                  ? `<div class="shift-meta">Priority: ${(u.previousMilestonePriority || []).join(' → ') || '(none)'} ⇒ ${(u.newMilestonePriority || []).join(' → ') || '(none)'}</div>`
                  : ''}
              </div>
            </li>
          `).join('')}
        </ol>`;

    // Plan-vs-execution table
    const trainTotal = s.trainTotal || 1;
    const trainRow = (stat) => {
      const c = s.training[stat] || 0;
      const pct = (c / trainTotal * 100).toFixed(0);
      const isDeclared = s.declaredBottleneck === stat;
      const isMost = s.actuallyMostTrained === stat;
      return `<tr${isDeclared ? ' class="declared-bottleneck"' : ''}>
        <td>${stat}${isDeclared ? ' <span class="tag declared">declared bottleneck</span>' : ''}${isMost ? ' <span class="tag most">most trained</span>' : ''}</td>
        <td>${c}</td>
        <td>${trainTotal ? pct + '%' : '—'}</td>
      </tr>`;
    };

    const adherenceColor = s.planAdhered === true ? '#28a745'
      : s.planAdhered === false ? '#dc3545' : '#6c757d';
    const adherenceLabel = s.planAdhered === true ? 'PLAN MET'
      : s.planAdhered === false ? 'EXECUTION GAP' : 'no training data';

    return `
      <div class="strategy-card">
        <h3>
          <code>${escape(s.filename)}</code> — ${escape(s.characterKey)}
          (${escape(s.agent)}) · ${s.rounds} rounds
          · final milestones <b>${s.finalMilestones}/3</b>
          <span class="adherence-badge" style="background:${adherenceColor}">${adherenceLabel}</span>
        </h3>

        <div class="strategy-grid">
          <div class="strategy-initial">
            <h4>Initial strategy <span style="color:#666;font-weight:normal;font-size:13px;">(round 1, ${(s.initial.latencyMs/1000).toFixed(1)}s, ${s.initial.responseTokens} response tokens)</span></h4>
            <p class="strategy-summary">${escape(init.summary || '(none)')}</p>
            <div class="strategy-meta">
              <div><b>Bottleneck stat (model's call):</b> ${escape(init.bottleneckStat || '?')}</div>
              <div><b>Milestone order (planned):</b> ${escape(priority)}</div>
            </div>
            ${opening ? `<details><summary>Opening moves (${(init.openingMoves || []).length})</summary><ol>${opening}</ol></details>` : ''}
            ${risks ? `<details><summary>Anticipated risks (${(init.anticipatedRisks || []).length})</summary><ul>${risks}</ul></details>` : ''}
          </div>

          <div class="strategy-shifts-block">
            <h4>Strategy shifts (${s.updates.length})</h4>
            ${updatesHtml}
          </div>

          <div class="strategy-execution">
            <h4>Plan vs execution — training distribution</h4>
            <p style="font-size:13px;color:#666;">If "declared bottleneck" and "most trained" rows are the same, the model executed on its plan.</p>
            <table class="strategy-train-table">
              <tr><th>Stat</th><th>Trains</th><th>%</th></tr>
              ${['strength','technique','focus','flexibility'].map(trainRow).join('')}
              <tr><td><b>Total</b></td><td><b>${s.trainTotal}</b></td><td>100%</td></tr>
            </table>
            <p style="font-size:13px;color:#666;margin-top:8px;">Access cards bought: <b>${s.accessBuys}/4</b></p>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <h2>Strategic intent (LLM-only)</h2>
    <p style="font-size: 13px; color: #666;">
      Captured by the strategy-planning layer in <code>sim/agents/ollama.js</code> + <code>sim/run-one-game.js</code>.
      Every LLM seat produces an initial strategy at game start and is asked, on every turn,
      whether the strategy should shift. Shifts are emitted as their own events with a
      structured reason. Below: per-game cards showing what the model planned, when it
      pivoted, and whether the tactical actions (training distribution, access-card buys)
      matched the declared plan.
    </p>
    <div class="strategy-headline">
      <div class="strategy-stat">
        <div class="stat-value">${strategies.length}</div>
        <div class="stat-label">LLM seats with recorded strategies</div>
      </div>
      <div class="strategy-stat">
        <div class="stat-value">${totalShifts}</div>
        <div class="stat-label">total strategy shifts declared</div>
      </div>
      <div class="strategy-stat">
        <div class="stat-value">${adherenceRate}${adherenceRate === '—' ? '' : '%'}</div>
        <div class="stat-label">games where declared bottleneck = most-trained stat</div>
      </div>
    </div>
    <div class="strategy-cards">
      ${cards}
    </div>
  `;
}

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

  /* Strategic intent section */
  .strategy-headline { display: flex; gap: 16px; margin: 16px 0 24px; }
  .strategy-stat { flex: 1; background: #f5f5f7; padding: 16px; border-radius: 8px; text-align: center; }
  .stat-value { font-size: 32px; font-weight: 700; color: #1a73e8; line-height: 1; }
  .stat-label { font-size: 12px; color: #5f6368; margin-top: 6px; }
  .strategy-cards { display: grid; gap: 20px; }
  .strategy-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .strategy-card h3 { border: none; margin: 0 0 16px; padding: 0; font-size: 16px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .adherence-badge { color: white; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  .strategy-grid { display: grid; grid-template-columns: 1.2fr 1.5fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { .strategy-grid { grid-template-columns: 1fr; } }
  .strategy-grid h4 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #5f6368; }
  .strategy-summary { background: #fff8e1; border-left: 4px solid #fbc02d; padding: 10px 12px; border-radius: 4px; line-height: 1.5; font-size: 14px; }
  .strategy-meta { margin-top: 10px; font-size: 13px; line-height: 1.7; }
  .strategy-meta b { color: #1a73e8; }
  .strategy-initial details { margin-top: 10px; font-size: 13px; }
  .strategy-initial summary { cursor: pointer; color: #5f6368; }
  .strategy-shifts { padding-left: 18px; margin: 0; }
  .strategy-shifts li { margin: 8px 0; padding: 8px 10px; background: #e3f2fd; border-radius: 6px; font-size: 13px; line-height: 1.45; list-style: decimal; }
  .shift-header { margin-bottom: 4px; }
  .shift-diff { margin-top: 4px; }
  .shift-old { color: #5f6368; font-style: italic; }
  .shift-new { color: #1a73e8; font-weight: 500; margin-top: 2px; }
  .shift-meta { color: #5f6368; font-size: 12px; margin-top: 4px; }
  .strategy-train-table { font-size: 13px; margin: 0; }
  .strategy-train-table th, .strategy-train-table td { padding: 4px 8px; }
  .strategy-train-table tr.declared-bottleneck { background: #fff8e1; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; margin-left: 6px; }
  .tag.declared { background: #fbc02d; color: #5d4037; }
  .tag.most { background: #1a73e8; color: white; }

  /* Tournament section */
  .tournament-headline { display: flex; gap: 16px; margin: 16px 0 24px; flex-wrap: wrap; }
  .tournament-games { display: grid; gap: 16px; margin-top: 24px; }
  .tournament-game { background: white; border: 1px solid #e0e0e0; border-radius: 10px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .tournament-game h4 { margin: 0 0 12px; padding: 0; border: none; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .iter-score { color: #1a73e8; font-weight: 700; font-size: 18px; }
  .delta { font-size: 13px; padding: 1px 8px; border-radius: 10px; margin-left: 4px; font-weight: 600; }
  .delta.up { background: #d4edda; color: #155724; }
  .delta.down { background: #f8d7da; color: #721c24; }
  .delta.flat { background: #e0e0e0; color: #5f6368; }
  .iter-tags { display: inline-flex; gap: 6px; flex-wrap: wrap; }
  .iter-tag { background: #f5f5f7; color: #5f6368; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
  .iter-tag.win { background: #28a745; color: white; }
  .iter-tag.loss { background: #6c757d; color: white; }
  .tournament-game-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 16px; }
  @media (max-width: 900px) { .tournament-game-grid { grid-template-columns: 1fr; } }
  .tournament-game-grid h5 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #5f6368; }
  .plan-text { background: #fff8e1; border-left: 3px solid #fbc02d; padding: 8px 10px; border-radius: 4px; font-size: 13px; line-height: 1.45; margin: 0 0 8px; }
  .plan-meta { font-size: 12px; color: #5f6368; margin: 4px 0; }
  .tournament-game-grid p { font-size: 13px; line-height: 1.45; margin: 6px 0; }
  .tournament-game-grid p b { color: #1a73e8; }
  .advice { background: #e3f2fd; border-left: 3px solid #1a73e8; padding: 8px 10px; border-radius: 4px; margin-top: 8px; }
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

${ctx.tournamentData ? buildTournamentSection(ctx.tournamentData) : ''}
${ctx.strategies && ctx.strategies.length ? buildStrategySection(ctx.strategies) : ''}

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
