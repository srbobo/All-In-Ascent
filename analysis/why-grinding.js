// Deep diagnostic: WHY is the LLM repeatedly attempting climbs and milestones it can't pass?
//
// What this script does:
//   For every failed climb/milestone attempt by player 2 (the LLM) across
//   the 7 v1 smoke games, it reconstructs the moment of decision:
//     - What were the actual stat gaps (effective_stat − requirement)?
//     - What rationale did the LLM give?
//     - What were the OTHER legal actions available at that moment?
//     - Was a clearly-better alternative ignored?
//
//   Then it aggregates patterns across all attempts:
//     - Distribution of worst-stat gap at attempt time
//     - Same-route retries (how often the LLM attempts a route it just failed)
//     - Per-grade pass rates
//     - How XP is distributed (what's the LLM actually earning per attempt)
//     - Whether the available climb pool is even passable for the LLM's
//       current stats (i.e., is the engine offering games the LLM cannot win?)
//
// Why it matters: the conclusion drives either prompt-tuning OR a game
// rebalance. If the LLM is making bad picks AMONG good options, prompt
// fixes it. If the available climbs are uniformly impossible for the
// character at low levels, the GAME needs more easy climbs.

import fs from 'node:fs';
import path from 'node:path';
import { ROUTES } from '../engine/data.js';
import { computeEffectiveStats } from '../engine/helpers.js';

const dir = process.argv[2] || 'results/llm-7b-smoke';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort();

// Aggregate buckets across all games.
const allFailedAttempts = []; // { file, t, route, area, isMilestone, gaps, worst, rationale, alternativeCount, betterAlternativeFound }
const allAttempts = [];        // every climb/milestone attempt with metadata
const sameRouteRetries = {};   // per game: { "area:route": [ list of t-values when retried ] }
const gradePassRates = {};     // grade → { attempts, passes }
const xpEarnedDistribution = []; // every xp gained value (failures often give little)
const availablePoolPassability = []; // for each turn: how many of the legal climbs had worst-gap >= -10
const ratiopaleByGap = { passable: 0, risky: 0, skip: 0 }; // when LLM picks, how often is it picking from the SKIP bucket

function reconstructPlayerStateAt(events, idx, playerNum) {
  // Walk events from start to (idx-1) and rebuild a synthetic player snapshot.
  // We only need: stats, trainingBonuses, gearBonuses, equipment, level, attemptedRoutes for this player.
  // Simpler: every action_chosen for this player is preceded by a turn_start
  // and followed by a resource_update. The most recent resource_update tells
  // us level/xp/endurance. For stats we have to track training/gear/level events.
  let stats = null;
  let trainingBonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  let gearBonuses     = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  let equipment = [];
  let level = 1;
  let xp = 0;
  let endurance = 0;
  let attemptedThisRound = {};

  for (let i = 0; i < idx; i++) {
    const e = events[i];
    if (e.type === 'game_start') {
      const us = e.payload.players.find(p => p.playerNum === playerNum);
      if (us) {
        stats = { ...us.startingStats };
        endurance = us.startingEndurance;
      }
    }
    if (e.type === 'level_up' && e.payload.playerNum === playerNum) {
      stats = { ...e.payload.newStats };
      level = e.payload.newLevel;
    }
    if (e.type === 'train_action' && e.payload.playerNum === playerNum) {
      trainingBonuses[e.payload.stat] = e.payload.totalTrainingBonusAfter[e.payload.stat];
    }
    if (e.type === 'gear_purchased' && e.payload.playerNum === playerNum) {
      equipment.push(e.payload.gearName);
      const g = e.payload.gearApplied || {};
      // gearApplied has the deltas applied to gearBonuses by the engine.
      for (const k of Object.keys(gearBonuses)) {
        if (g[k] != null) gearBonuses[k] += g[k];
      }
    }
    if (e.type === 'resource_update' && e.payload.playerNum === playerNum) {
      xp = e.payload.xp;
      endurance = e.payload.currentEndurance;
      level = e.payload.level;
    }
    if (e.type === 'round_end') attemptedThisRound = {};
    if (e.type === 'climb_resolved' && e.payload.playerNum === playerNum && !e.payload.isMilestone) {
      attemptedThisRound[`${e.payload.area}:${e.payload.routeName}`] = true;
    }
  }
  return { stats, trainingBonuses, gearBonuses, equipment, level, xp, endurance, attemptedThisRound };
}

function gaps(eff, req) {
  return {
    strength:    eff.strength    - req.strength,
    technique:   eff.technique   - req.technique,
    focus:       eff.focus       - req.focus,
    flexibility: eff.flexibility - req.flexibility,
  };
}
function worstGap(g) { return Math.min(...Object.values(g)); }

for (const file of files) {
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n');
  const events = [];
  let meta = null, summary = null;
  for (const line of lines) {
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    if (obj.kind === 'run_meta') meta = obj;
    else if (obj.kind === 'run_summary') summary = obj;
    else events.push(obj);
  }
  if (!meta || !summary) continue;

  const llmSeat = meta.agents.findIndex(a => a.startsWith('ollama'));
  if (llmSeat === -1) continue;
  const llmPlayerNum = llmSeat + 1;

  // First pass: pre-link each action_chosen to its corresponding climb_resolved.
  const climbResolvedByT = {};
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'climb_resolved' && e.payload.playerNum === llmPlayerNum) {
      // climb_resolved always immediately follows action_chosen + dice_rolled.
      // Walk backwards to the most recent action_chosen for this player.
      for (let j = i - 1; j >= 0; j--) {
        if (events[j].type === 'action_chosen' && events[j].payload.playerNum === llmPlayerNum) {
          climbResolvedByT[events[j].t] = e;
          break;
        }
      }
    }
  }

  const seenAttemptedThisGame = {};
  let lastRoundReset = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'round_end') { for (const k of Object.keys(seenAttemptedThisGame)) seenAttemptedThisGame[k] = 0; }
    if (e.type !== 'action_chosen') continue;
    if (e.payload.playerNum !== llmPlayerNum) continue;
    const a = e.payload.action;
    if (a.type !== 'climb' && a.type !== 'milestone') continue;

    // Reconstruct state right before this action.
    const snap = reconstructPlayerStateAt(events, i, llmPlayerNum);
    if (!snap.stats) continue; // safety

    // Find the matching route definition.
    let route, area;
    if (a.type === 'climb') {
      area = a.area;
      route = ROUTES[area].find(r => r.name === a.routeName);
    } else {
      // For milestones, look up the milestone routes from game_start payload.
      const start = events.find(ev => ev.type === 'game_start');
      const m = start?.payload?.milestoneRoutes?.[a.difficulty];
      if (!m) continue;
      area = m.area;
      route = ROUTES[area].find(r => r.name === m.routeName);
    }
    if (!route) continue;

    // Build a synthetic char object compatible with computeEffectiveStats.
    const char = {
      key: 'sprinter', // LLM seat is always sprinter in the v1 smoke
      stats: snap.stats,
      trainingBonuses: snap.trainingBonuses,
      gearBonuses: snap.gearBonuses,
      equipment: snap.equipment,
    };
    const eff = computeEffectiveStats(char, route, area, snap.attemptedThisRound || {});
    const g = gaps(eff, route);
    const worst = worstGap(g);

    // Did the climb succeed?
    const resolved = climbResolvedByT[e.t];
    const success = resolved?.payload?.success === true;
    const xpEarned = resolved?.payload?.xpGained ?? 0;

    allAttempts.push({
      file, t: e.t, type: a.type, area, routeName: route.name, grade: route.grade,
      worst, gaps: g, success, xpEarned, level: snap.level, xpAtAttempt: snap.xp,
      rationale: e.payload.rationale || '',
      isMilestone: a.type === 'milestone',
    });
    xpEarnedDistribution.push(xpEarned);
    gradePassRates[route.grade] = gradePassRates[route.grade] || { attempts: 0, passes: 0 };
    gradePassRates[route.grade].attempts++;
    if (success) gradePassRates[route.grade].passes++;
    if (worst >= 0) ratiopaleByGap.passable++;
    else if (worst >= -10) ratiopaleByGap.risky++;
    else ratiopaleByGap.skip++;
    if (!success) {
      allFailedAttempts.push({ file, t: e.t, route: route.name, grade: route.grade, area, isMilestone: a.type === 'milestone', gaps: g, worst, rationale: e.payload.rationale || '', xpEarned });
    }

    // Same-route retry tracking.
    sameRouteRetries[file] = sameRouteRetries[file] || {};
    const key = `${area}:${route.name}`;
    sameRouteRetries[file][key] = (sameRouteRetries[file][key] || 0) + 1;
  }
}

// =============================================================================
// REPORT
// =============================================================================

console.log('='.repeat(80));
console.log('DEEP ANALYSIS: why is the LLM grinding failed climbs?');
console.log('='.repeat(80));
console.log();

console.log('Sample size: ' + allAttempts.length + ' total LLM climb/milestone attempts across 7 games.');
console.log('  failures: ' + allAttempts.filter(a => !a.success).length);
console.log('  passes:   ' + allAttempts.filter(a => a.success).length);
console.log();

// 1. Distribution of worst-stat gap at attempt time
console.log('--- (1) GAP DISTRIBUTION AT ATTEMPT TIME ---');
console.log('  At the moment of choosing each climb/milestone, what was the worst-stat gap?');
console.log('  (worst gap = min over 4 stats of (effective_stat - requirement). Negative means short.)');
const buckets = {
  'gap >= 0 (likely pass)': 0,
  'gap -1..-5  (close)':    0,
  'gap -6..-10 (risky)':    0,
  'gap -11..-20 (bad)':     0,
  'gap -21..-40 (very bad)':0,
  'gap < -40 (absurd)':     0,
};
for (const a of allAttempts) {
  if (a.worst >= 0) buckets['gap >= 0 (likely pass)']++;
  else if (a.worst >= -5)  buckets['gap -1..-5  (close)']++;
  else if (a.worst >= -10) buckets['gap -6..-10 (risky)']++;
  else if (a.worst >= -20) buckets['gap -11..-20 (bad)']++;
  else if (a.worst >= -40) buckets['gap -21..-40 (very bad)']++;
  else buckets['gap < -40 (absurd)']++;
}
for (const [k, v] of Object.entries(buckets)) {
  const pct = (v / allAttempts.length * 100).toFixed(1);
  console.log(`  ${k.padEnd(28)} ${String(v).padStart(4)}  (${pct.padStart(5)}%)`);
}
console.log();

// 2. Of failed attempts, was there a clearly better alternative?
// We can't easily reconstruct the full legal-action list here (would require
// re-running the engine), but we can use a proxy: for each failed attempt,
// look at the player's other CLIMB/MILESTONE actions in the SAME round.
// If they ever picked one with a smaller worst-gap, that's evidence of
// inconsistent decision-making.
console.log('--- (2) FAILED ATTEMPTS BREAKDOWN BY GAP ---');
const failByBucket = {};
for (const a of allFailedAttempts) {
  let b;
  if (a.worst >= -5) b = 'close (-1..-5)';
  else if (a.worst >= -10) b = 'risky (-6..-10)';
  else if (a.worst >= -20) b = 'bad (-11..-20)';
  else if (a.worst >= -40) b = 'very bad (-21..-40)';
  else b = 'absurd (< -40)';
  failByBucket[b] = (failByBucket[b] || 0) + 1;
}
for (const [k, v] of Object.entries(failByBucket).sort()) {
  console.log(`  failures with ${k.padEnd(28)} ${v}`);
}
console.log();

// 3. Same-route retries — how often does the LLM attempt the same route multiple times?
console.log('--- (3) SAME-ROUTE RETRIES (per game) ---');
console.log('  Which routes did the LLM attempt 5+ times in a single game?');
let retryRowCount = 0;
for (const file of Object.keys(sameRouteRetries)) {
  const top = Object.entries(sameRouteRetries[file]).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]);
  if (top.length === 0) continue;
  console.log(`  ${file}:`);
  for (const [route, n] of top) console.log(`    ${n}x  ${route}`);
  retryRowCount++;
}
if (retryRowCount === 0) console.log('  (none — interesting: the LLM attempts MANY different routes, not the same one repeatedly)');
console.log();

// 4. Per-grade pass rates — which difficulty levels are most often attempted and failed?
console.log('--- (4) PER-GRADE PASS RATES ---');
const gradeRows = Object.entries(gradePassRates).sort();
console.log('  grade        attempts  passes  pass%');
for (const [grade, r] of gradeRows) {
  const pct = ((r.passes / r.attempts) * 100).toFixed(0);
  console.log(`  ${grade.padEnd(10)} ${String(r.attempts).padStart(8)}  ${String(r.passes).padStart(6)}  ${pct.padStart(4)}%`);
}
console.log();

// 5. XP economy — what does the LLM actually earn per attempt vs need to level up?
console.log('--- (5) XP ECONOMY (per LLM climb/milestone attempt) ---');
const xpVals = xpEarnedDistribution.slice().sort((a, b) => a - b);
const xpMedian = xpVals[Math.floor(xpVals.length / 2)];
const xpMean = (xpVals.reduce((a, b) => a + b, 0) / xpVals.length).toFixed(1);
const xpZeros = xpVals.filter(x => x === 0).length;
console.log(`  attempts:       ${xpVals.length}`);
console.log(`  median XP:      ${xpMedian}`);
console.log(`  mean XP:        ${xpMean}`);
console.log(`  attempts with 0 XP: ${xpZeros}  (${((xpZeros / xpVals.length) * 100).toFixed(0)}%)`);
console.log(`  XP needed L1→L2: 100 ; L2→L3: 150 ; L3→L4: 200`);
const xpHist = { '0':0, '1-10':0, '11-30':0, '31-60':0, '61-100':0, '>100':0 };
for (const x of xpVals) {
  if (x === 0) xpHist['0']++;
  else if (x <= 10) xpHist['1-10']++;
  else if (x <= 30) xpHist['11-30']++;
  else if (x <= 60) xpHist['31-60']++;
  else if (x <= 100) xpHist['61-100']++;
  else xpHist['>100']++;
}
for (const [k, v] of Object.entries(xpHist)) {
  console.log(`  XP ${k.padEnd(8)} ${String(v).padStart(4)}  (${((v / xpVals.length) * 100).toFixed(1)}%)`);
}
console.log();

// 6. Sample 10 representative failed attempts with rationale
console.log('--- (6) SAMPLE FAILED ATTEMPTS WITH RATIONALES ---');
console.log('  Showing 10 failed attempts spanning the gap distribution.');
const sortedFails = allFailedAttempts.slice().sort((a, b) => a.worst - b.worst);
const sampleIndices = [0, Math.floor(sortedFails.length * 0.1), Math.floor(sortedFails.length * 0.25),
                       Math.floor(sortedFails.length * 0.4), Math.floor(sortedFails.length * 0.55),
                       Math.floor(sortedFails.length * 0.7), Math.floor(sortedFails.length * 0.85),
                       sortedFails.length - 3, sortedFails.length - 2, sortedFails.length - 1];
for (const idx of sampleIndices) {
  const a = sortedFails[idx];
  if (!a) continue;
  const gapsStr = `Str${a.gaps.strength >= 0 ? '+' : ''}${a.gaps.strength} Tech${a.gaps.technique >= 0 ? '+' : ''}${a.gaps.technique} Focus${a.gaps.focus >= 0 ? '+' : ''}${a.gaps.focus} Flex${a.gaps.flexibility >= 0 ? '+' : ''}${a.gaps.flexibility}`;
  console.log(`  [${a.isMilestone ? 'MILESTONE' : 'climb    '}] ${a.route.padEnd(30)} (${a.grade.padEnd(5)})  worst gap: ${String(a.worst).padStart(4)}  ${gapsStr}`);
  console.log(`     rationale: "${(a.rationale || '(none)').slice(0, 130)}"`);
  console.log(`     earned ${a.xpEarned} XP from failure.`);
}
console.log();

// 7. Does the rationale show the LLM IS aware the gap is bad?
console.log('--- (7) RATIONALE TEXT ANALYSIS ---');
const fails = allFailedAttempts;
const mentionsRisk = fails.filter(a => /risk|may fail|could fail|risky|low chance|chance to fail|unlikely/i.test(a.rationale)).length;
const mentionsAbility = fails.filter(a => /ability|flash speed|sprinter|passive/i.test(a.rationale)).length;
const mentionsXp = fails.filter(a => /xp|experience|level/i.test(a.rationale)).length;
const mentionsBeginner = fails.filter(a => /beginner|easy|warm-?up|low.?grade/i.test(a.rationale)).length;
console.log(`  failed attempts mentioning "risk/may fail":  ${mentionsRisk}/${fails.length} (${((mentionsRisk / fails.length) * 100).toFixed(0)}%)`);
console.log(`  failed attempts mentioning the special ability: ${mentionsAbility}/${fails.length} (${((mentionsAbility / fails.length) * 100).toFixed(0)}%)`);
console.log(`  failed attempts mentioning XP/level reasoning: ${mentionsXp}/${fails.length} (${((mentionsXp / fails.length) * 100).toFixed(0)}%)`);
console.log(`  failed attempts mentioning beginner/easy:  ${mentionsBeginner}/${fails.length} (${((mentionsBeginner / fails.length) * 100).toFixed(0)}%)`);
console.log();

// 8. What's the SHAPE of available routes? Is the LLM picking from a bad pool?
// At Sprinter level 1 (Str 22, Tech 14, Focus 12, Flex 16), what BOULDERING routes
// could it conceivably pass?
console.log('--- (8) WAS THE GAME OFFERING WINNABLE OPTIONS? ---');
console.log('  At Sprinter Level 1 (Str 22, Tech 14, Focus 12, Flex 16, no gear, no training):');
const startStats = { strength: 22, technique: 14, focus: 12, flexibility: 16 };
let viable = 0, total = 0;
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  for (const r of ROUTES[area]) {
    total++;
    if (startStats.strength >= r.strength && startStats.technique >= r.technique && startStats.focus >= r.focus && startStats.flexibility >= r.flexibility) viable++;
  }
}
console.log(`  routes the bare-stats Sprinter could pass without ANY gear/training/level-ups: ${viable}/${total}`);

const startStatsTrained = { strength: 27, technique: 19, focus: 17, flexibility: 21 }; // +5 each
let viableTrained = 0;
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  for (const r of ROUTES[area]) {
    if (startStatsTrained.strength >= r.strength && startStatsTrained.technique >= r.technique && startStatsTrained.focus >= r.focus && startStatsTrained.flexibility >= r.flexibility) viableTrained++;
  }
}
console.log(`  with +5 training in every stat (4 trains, 1 round of perfect prep): ${viableTrained}/${total}`);

const lvl3 = { strength: 30, technique: 18, focus: 15, flexibility: 21 }; // approx Sprinter L3
let viableLvl3 = 0;
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  for (const r of ROUTES[area]) {
    if (lvl3.strength >= r.strength && lvl3.technique >= r.technique && lvl3.focus >= r.focus && lvl3.flexibility >= r.flexibility) viableLvl3++;
  }
}
console.log(`  at Sprinter Level 3 stats (~30/18/15/21, no gear): ${viableLvl3}/${total}`);
console.log();

// 9. What's the difficulty ramp like for a newbie player?
console.log('--- (9) ROUTE DIFFICULTY RAMP ---');
const allRoutes = [...ROUTES.bouldering, ...ROUTES.topRope, ...ROUTES.leadClimbing];
allRoutes.sort((a, b) => (a.strength + a.technique + a.focus + a.flexibility) - (b.strength + b.technique + b.focus + b.flexibility));
console.log('  Easiest 5 routes (by total stat requirement):');
for (const r of allRoutes.slice(0, 5)) {
  console.log(`    Str ${String(r.strength).padStart(2)} Tech ${String(r.technique).padStart(2)} Focus ${String(r.focus).padStart(2)} Flex ${String(r.flexibility).padStart(2)} | ${r.grade.padEnd(5)} ${r.name}`);
}
console.log('  Sprinter starts at Str 22, Tech 14, Focus 12, Flex 16. The 5th-easiest route\'s requirements:');
const fifth = allRoutes[4];
const sprinterGap = {
  s: startStats.strength - fifth.strength,
  t: startStats.technique - fifth.technique,
  f: startStats.focus - fifth.focus,
  fl: startStats.flexibility - fifth.flexibility,
};
console.log(`    Sprinter at Level 1 has Str ${sprinterGap.s>=0?'+':''}${sprinterGap.s}, Tech ${sprinterGap.t>=0?'+':''}${sprinterGap.t}, Focus ${sprinterGap.f>=0?'+':''}${sprinterGap.f}, Flex ${sprinterGap.fl>=0?'+':''}${sprinterGap.fl}`);
console.log();

console.log('='.repeat(80));
console.log('END');
console.log('='.repeat(80));
