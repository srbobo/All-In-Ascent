// Cross-run aggregator for the three big design questions:
//   (1) Is the game too long? — distribution of rounds, when milestones land,
//       round-by-round productivity curve.
//   (2) Is bouldering over-used vs topRope/leadClimbing? — climb-attempt and
//       milestone-completion distribution by area, broken out by agent type.
//   (3) Sub-questions: belayer-capacity contention, training-equipment contention.
//
// Reads from every results/ subdirectory it can find. No human input required.

import fs from 'node:fs';
import path from 'node:path';
import { ROUTES } from '../engine/data.js';

const baseDirs = fs.readdirSync('results').filter(d => {
  try { return fs.statSync(path.join('results', d)).isDirectory(); }
  catch { return false; }
});

// Each game is { dir, file, agents, characters, rounds, reason, winner,
// climbsByArea, milestonesByArea, milestoneCompletedRound, actionsByType,
// actionsByRound, restCountP2, ... }
const games = [];

for (const dir of baseDirs) {
  const full = path.join('results', dir);
  const files = fs.readdirSync(full).filter(f => f.endsWith('.jsonl'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(full, f), 'utf8').trim();
    if (!text) continue;
    let meta = null, summary = null;
    const events = [];
    for (const line of text.split('\n')) {
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      if (obj.kind === 'run_meta') meta = obj;
      else if (obj.kind === 'run_summary') summary = obj;
      else events.push(obj);
    }
    if (!meta || !summary) continue;

    // Walk events to extract per-area climb attempts and milestone completion rounds.
    let currentRound = 1;
    const climbsByArea = { bouldering: { attempts: 0, successes: 0 }, topRope: { attempts: 0, successes: 0 }, leadClimbing: { attempts: 0, successes: 0 } };
    const milestonesByArea = { bouldering: 0, topRope: 0, leadClimbing: 0 };
    const milestoneCompletedRound = []; // when each milestone landed
    const actionsByRound = {}; // round → counts
    const totalActionsByType = {};
    let trainingByEquip = {};
    let topRopeAttemptsByPlayer = { 1: 0, 2: 0 };
    let leadAttemptsByPlayer = { 1: 0, 2: 0 };

    for (const e of events) {
      if (e.type === 'round_start') currentRound = e.payload.round;
      if (e.type === 'turn_start') currentRound = e.payload.round;
      if (e.type === 'action_chosen') {
        const t = e.payload.action.type;
        totalActionsByType[t] = (totalActionsByType[t] || 0) + 1;
        if (!actionsByRound[currentRound]) actionsByRound[currentRound] = {};
        actionsByRound[currentRound][t] = (actionsByRound[currentRound][t] || 0) + 1;
        if (t === 'train') {
          const area = e.payload.action.areaName;
          trainingByEquip[area] = (trainingByEquip[area] || 0) + 1;
        }
      }
      if (e.type === 'climb_resolved') {
        const area = e.payload.area;
        const isMs = e.payload.isMilestone;
        if (isMs) {
          if (e.payload.success) {
            milestonesByArea[area] = (milestonesByArea[area] || 0) + 1;
            milestoneCompletedRound.push({ round: currentRound, area, tier: e.payload.difficulty, playerNum: e.payload.playerNum });
          }
        } else {
          climbsByArea[area].attempts++;
          if (e.payload.success) climbsByArea[area].successes++;
          if (area === 'topRope') topRopeAttemptsByPlayer[e.payload.playerNum]++;
          if (area === 'leadClimbing') leadAttemptsByPlayer[e.payload.playerNum]++;
        }
      }
    }

    games.push({
      dir, file: f,
      agents: meta.agents,
      characters: meta.characters,
      engineVersion: meta.engineVersion,
      rounds: summary.rounds,
      reason: summary.reason,
      winner: summary.winner,
      winnerAgent: summary.winnerAgent,
      winnerCharacter: summary.winnerCharacter,
      climbsByArea,
      milestonesByArea,
      milestoneCompletedRound,
      totalActionsByType,
      actionsByRound,
      trainingByEquip,
      topRopeAttemptsByPlayer,
      leadAttemptsByPlayer,
      finalPlayers: summary.finalPlayers,
    });
  }
}

console.log(`Loaded ${games.length} completed games across ${baseDirs.length} result dirs`);
console.log('Categories:');

const categories = {
  v0_1_0_llm:        games.filter(g => g.dir.includes('llm-7b-smoke') && !g.dir.includes('v3') && !g.dir.includes('v0.3') && !g.dir.includes('iron') && !g.dir.includes('rr')),
  v0_2_0_heur:       games.filter(g => g.dir === 'balance-v0.2.0-verify' || g.dir === 'heuristic-baseline'),
  v0_3_0_llm:        games.filter(g => g.dir === 'llm-7b-smoke-v3' || g.dir === 'llm-7b-v0.3.0'),
  v0_3_0_heur:       games.filter(g => g.dir === 'v0.3.0-heur-baseline' || g.dir === 'v0.3.0-iron-vs-free-baseline'),
  v0_3_1_heur:       games.filter(g => g.dir === 'v0.3.1-iron-vs-free-baseline' || g.dir === 'v0.3.1-rr-vs-iron-baseline'),
  v0_3_1_llm:        games.filter(g => g.dir === 'llm-7b-v0.3.1-iron-vs-free' || g.dir === 'llm-7b-v0.3.1-rr-vs-iron'),
};
for (const [k, v] of Object.entries(categories)) console.log('  ' + k.padEnd(20) + ' ' + v.length);

// =============================================================================
// QUESTION 1: GAME LENGTH ANALYSIS
// =============================================================================
console.log('\n');
console.log('==========================================================');
console.log('QUESTION 1: GAME LENGTH ANALYSIS');
console.log('==========================================================');

const finished = games.filter(g => g.reason === 'all_milestones');
const unfinished = games.filter(g => g.reason === 'max_rounds');
console.log(`\nGames overall: ${games.length}, finished via all_milestones: ${finished.length} (${(finished.length / games.length * 100).toFixed(0)}%), max_rounds: ${unfinished.length} (${(unfinished.length / games.length * 100).toFixed(0)}%)`);

// Length distribution of FINISHED games
const finishedRounds = finished.map(g => g.rounds).sort((a, b) => a - b);
if (finishedRounds.length) {
  const median = finishedRounds[Math.floor(finishedRounds.length / 2)];
  const p25 = finishedRounds[Math.floor(finishedRounds.length * 0.25)];
  const p75 = finishedRounds[Math.floor(finishedRounds.length * 0.75)];
  const max = finishedRounds[finishedRounds.length - 1];
  const min = finishedRounds[0];
  console.log(`\nFinished games: rounds min=${min}, p25=${p25}, median=${median}, p75=${p75}, max=${max}`);
}

// Distribution buckets
console.log('\nFinished-game rounds distribution:');
const buckets = { '1-15': 0, '16-25': 0, '26-35': 0, '36-45': 0 };
for (const r of finishedRounds) {
  if (r <= 15) buckets['1-15']++;
  else if (r <= 25) buckets['16-25']++;
  else if (r <= 35) buckets['26-35']++;
  else buckets['36-45']++;
}
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${k.padEnd(8)} ${v} games (${(v / finishedRounds.length * 100).toFixed(0)}%)`);
}

// When milestones land
console.log('\nMilestone-completion-round distribution (across all finished games):');
const allMs = finished.flatMap(g => g.milestoneCompletedRound);
const msByRound = {};
for (const m of allMs) msByRound[m.round] = (msByRound[m.round] || 0) + 1;
const sortedMsRounds = Object.entries(msByRound).map(([r, c]) => ({ round: +r, count: c })).sort((a, b) => a.round - b.round);

// Bucket milestones by round range
const msBuckets = { '1-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '21-25': 0, '26-30': 0, '31-35': 0, '36-45': 0 };
for (const m of allMs) {
  if (m.round <= 5) msBuckets['1-5']++;
  else if (m.round <= 10) msBuckets['6-10']++;
  else if (m.round <= 15) msBuckets['11-15']++;
  else if (m.round <= 20) msBuckets['16-20']++;
  else if (m.round <= 25) msBuckets['21-25']++;
  else if (m.round <= 30) msBuckets['26-30']++;
  else if (m.round <= 35) msBuckets['31-35']++;
  else msBuckets['36-45']++;
}
for (const [k, v] of Object.entries(msBuckets)) {
  console.log(`  rounds ${k.padEnd(6)} ${v} milestones earned (${(v / allMs.length * 100).toFixed(0)}%)`);
}

// What happens in late rounds of unfinished games?
console.log('\nUnfinished games (max_rounds): per-round action density');
console.log('  How many actions does each round see, averaged across all unfinished games?');
const lateGames = unfinished.length ? unfinished : [];
if (lateGames.length) {
  const roundActionAverage = {};
  for (let r = 1; r <= 45; r++) {
    let sum = 0, count = 0;
    for (const g of lateGames) {
      if (g.actionsByRound[r]) {
        sum += Object.values(g.actionsByRound[r]).reduce((a, b) => a + b, 0);
        count++;
      }
    }
    roundActionAverage[r] = count ? (sum / count) : 0;
  }
  // Compare early vs late round averages
  const early = (Object.values(roundActionAverage).slice(0, 15).reduce((a, b) => a + b, 0)) / 15;
  const mid =   (Object.values(roundActionAverage).slice(15, 30).reduce((a, b) => a + b, 0)) / 15;
  const late =  (Object.values(roundActionAverage).slice(30, 45).reduce((a, b) => a + b, 0)) / 15;
  console.log(`  rounds 1-15:  avg ${early.toFixed(1)} actions/round (early)`);
  console.log(`  rounds 16-30: avg ${mid.toFixed(1)} actions/round (mid)`);
  console.log(`  rounds 31-45: avg ${late.toFixed(1)} actions/round (late)`);
}

// =============================================================================
// QUESTION 2: AREA UTILIZATION
// =============================================================================
console.log('\n');
console.log('==========================================================');
console.log('QUESTION 2: AREA UTILIZATION ANALYSIS');
console.log('==========================================================');

// Total climb attempts and successes by area, across all games
const totalByArea = { bouldering: { attempts: 0, successes: 0 }, topRope: { attempts: 0, successes: 0 }, leadClimbing: { attempts: 0, successes: 0 } };
for (const g of games) {
  for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
    totalByArea[area].attempts += g.climbsByArea[area].attempts;
    totalByArea[area].successes += g.climbsByArea[area].successes;
  }
}
const totalAttempts = totalByArea.bouldering.attempts + totalByArea.topRope.attempts + totalByArea.leadClimbing.attempts;
console.log(`\nClimb attempts across all ${games.length} games:`);
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  const a = totalByArea[area];
  const pct = (a.attempts / totalAttempts * 100).toFixed(1);
  const passRate = a.attempts ? (a.successes / a.attempts * 100).toFixed(0) : '—';
  console.log(`  ${area.padEnd(13)} ${String(a.attempts).padStart(5)} attempts (${pct}%) | ${a.successes} passes (${passRate}% pass rate)`);
}

// Compare to route-deck composition (what % of routes are in each area)
const deckCounts = { bouldering: ROUTES.bouldering.length, topRope: ROUTES.topRope.length, leadClimbing: ROUTES.leadClimbing.length };
const deckTotal = deckCounts.bouldering + deckCounts.topRope + deckCounts.leadClimbing;
console.log(`\nRoute-deck composition (for comparison):`);
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  console.log(`  ${area.padEnd(13)} ${deckCounts[area]} routes (${(deckCounts[area] / deckTotal * 100).toFixed(0)}%)`);
}

// Milestone completion by area
const totalMsByArea = { bouldering: 0, topRope: 0, leadClimbing: 0 };
for (const g of games) for (const area of Object.keys(totalMsByArea)) totalMsByArea[area] += g.milestonesByArea[area] || 0;
const totalMs = totalMsByArea.bouldering + totalMsByArea.topRope + totalMsByArea.leadClimbing;
console.log(`\nMilestones earned by area (across all games):`);
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  console.log(`  ${area.padEnd(13)} ${totalMsByArea[area]} milestones (${totalMs ? (totalMsByArea[area] / totalMs * 100).toFixed(0) : '—'}%)`);
}

// Heuristic vs LLM area utilization
console.log(`\n=== Heuristic-only games vs LLM-included games ===`);
const heuristicOnly = games.filter(g => g.agents.every(a => a === 'heuristic'));
const llmIncluded = games.filter(g => g.agents.some(a => a.startsWith('ollama')));
console.log(`heuristic-only games: ${heuristicOnly.length} | LLM-included games: ${llmIncluded.length}`);

const aggregateArea = (gameList) => {
  const agg = { bouldering: 0, topRope: 0, leadClimbing: 0 };
  for (const g of gameList) for (const area of Object.keys(agg)) agg[area] += g.climbsByArea[area].attempts;
  const total = agg.bouldering + agg.topRope + agg.leadClimbing;
  return { agg, total };
};
const { agg: heurAgg, total: heurTotal } = aggregateArea(heuristicOnly);
const { agg: llmAgg, total: llmTotal } = aggregateArea(llmIncluded);
console.log(`\nHeuristic-only climb-attempt distribution:`);
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  console.log(`  ${area.padEnd(13)} ${heurAgg[area]} (${heurTotal ? (heurAgg[area] / heurTotal * 100).toFixed(1) + '%' : '—'})`);
}
console.log(`\nLLM-included climb-attempt distribution:`);
for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
  console.log(`  ${area.padEnd(13)} ${llmAgg[area]} (${llmTotal ? (llmAgg[area] / llmTotal * 100).toFixed(1) + '%' : '—'})`);
}

// Per-character area preference
console.log(`\n=== Per-character area preference ===`);
const byChar = {};
for (const g of games) {
  for (let i = 0; i < g.characters.length; i++) {
    const ch = g.characters[i];
    const seat = i + 1;
    byChar[ch] = byChar[ch] || { bouldering: 0, topRope: 0, leadClimbing: 0 };
    // Per-seat per-area attempts — extracted from game-level totals weighted by per-player
    // This is tricky because climbsByArea aggregates both players. Use topRopeAttemptsByPlayer/leadAttemptsByPlayer
    if (g.topRopeAttemptsByPlayer[seat] !== undefined) byChar[ch].topRope += g.topRopeAttemptsByPlayer[seat];
    if (g.leadAttemptsByPlayer[seat] !== undefined) byChar[ch].leadClimbing += g.leadAttemptsByPlayer[seat];
    // Bouldering = total - others; we'll compute it differently for accuracy
  }
}
// For bouldering per character, we need per-seat data. Skip this complexity — show top-rope and lead only.
console.log(`Top Rope + Lead climb attempts per character (total across all games):`);
for (const [ch, areas] of Object.entries(byChar)) {
  console.log(`  ${ch.padEnd(13)} topRope=${areas.topRope}, lead=${areas.leadClimbing}`);
}

// =============================================================================
// QUESTION 3: BELAYER + TRAINING-EQUIPMENT CONTENTION
// =============================================================================
console.log('\n');
console.log('==========================================================');
console.log('QUESTION 3: SUB-QUESTIONS — competition / capacity / contention');
console.log('==========================================================');

// Training equipment usage
console.log(`\nTraining equipment usage across all games:`);
const trainEq = { 'Grip Board': 0, 'Campus Board': 0, 'Continuous MoonBoard': 0, 'Balance and Core': 0 };
for (const g of games) {
  for (const [eq, cnt] of Object.entries(g.trainingByEquip)) {
    if (trainEq[eq] !== undefined) trainEq[eq] += cnt;
  }
}
const totalTrains = Object.values(trainEq).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(trainEq)) {
  const stat = ({ 'Grip Board': 'focus', 'Campus Board': 'strength', 'Continuous MoonBoard': 'technique', 'Balance and Core': 'flexibility' })[k];
  console.log(`  ${k.padEnd(22)} (${stat.padEnd(12)}) ${String(v).padStart(4)} sessions (${(v / totalTrains * 100).toFixed(1)}%)`);
}

// In 2-player games, top rope + lead are gated by 1 belayer initially. Did contention ever block?
console.log(`\nTop Rope + Lead area contention:`);
console.log('  (2-player games only — only 1 belayer until round 5, 2 belayers until round 12, 3 after)');
const twoPlayer = games.filter(g => g.characters.length === 2);
let bothInRopeRound = 0;
let totalRoundsObserved = 0;
for (const g of twoPlayer) {
  // Heuristic: if BOTH players had at least 1 topRope OR lead attempt in the same round, that's potential contention
  // We don't track per-round attempts directly, so use total counts as a proxy
  totalRoundsObserved++;
  if ((g.topRopeAttemptsByPlayer[1] > 0 || g.leadAttemptsByPlayer[1] > 0) &&
      (g.topRopeAttemptsByPlayer[2] > 0 || g.leadAttemptsByPlayer[2] > 0)) {
    bothInRopeRound++;
  }
}
console.log(`  Games where BOTH players attempted any rope-area route: ${bothInRopeRound} / ${twoPlayer.length} (${(bothInRopeRound / twoPlayer.length * 100).toFixed(0)}%)`);

console.log('\n==========================================================');
console.log('END');
console.log('==========================================================');
