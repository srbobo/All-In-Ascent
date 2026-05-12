// Investigate why training doesn't seem to translate into climb success.
//
// Hypotheses to check:
//   H1. Training bonuses reset between rounds (engine bug) — they should persist.
//   H2. The LLM trains stats it doesn't actually need for the routes it later attempts.
//   H3. Training is too slow vs route stat requirements (game balance).
//   H4. The LLM trains and then attempts routes BEFORE the bonus accumulates.
//   H5. computeEffectiveStats isn't actually adding trainingBonuses.

import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'results/llm-7b-smoke';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort();

console.log('='.repeat(80));
console.log('TRAINING EFFECTIVENESS ANALYSIS');
console.log('='.repeat(80));
console.log();

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

  console.log(`--- ${file} (${summary.reason}, P2 final L${summary.finalPlayers[1].level}) ---`);

  // Track training bonuses over time. Sample at every 50 events to see growth curve.
  const trainsByStat = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  const trainTimeline = []; // { round, stat, totalAfter }
  let currentRound = 1;
  let lastTrainSnapshot = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  // Round-by-round snapshots of trainingBonuses (read from the engine's emission).
  const roundSnapshot = {};

  for (const e of events) {
    if (e.type === 'round_start') currentRound = e.payload.round;
    if (e.type === 'turn_start') currentRound = e.payload.round;
    if (e.type === 'train_action' && e.payload.playerNum === llmPlayerNum) {
      trainsByStat[e.payload.stat]++;
      lastTrainSnapshot = { ...e.payload.totalTrainingBonusAfter };
      trainTimeline.push({ round: currentRound, stat: e.payload.stat, totalAfter: { ...lastTrainSnapshot } });
      roundSnapshot[currentRound] = { ...lastTrainSnapshot };
    }
    // ALSO inspect any round-boundary events to see if trainingBonuses got reset.
    // (We don't currently emit a snapshot of trainingBonuses on round_end, so we
    //  test continuity by looking at the NEXT train_action's totalAfter — if it
    //  jumped DOWN from prior bonus, that's a reset.)
  }

  console.log(`  trainings by stat:`);
  for (const [s, n] of Object.entries(trainsByStat)) {
    console.log(`    ${s.padEnd(12)} ${n} trains  (cumulative bonus +${n * 5} if persistent)`);
  }
  console.log(`  final trainingBonuses (from last train_action emission): ${JSON.stringify(lastTrainSnapshot)}`);

  // Detect: did totalAfter ever DROP between consecutive trains? That'd be a reset bug.
  let dropDetected = null;
  for (let i = 1; i < trainTimeline.length; i++) {
    const prev = trainTimeline[i - 1].totalAfter;
    const cur  = trainTimeline[i].totalAfter;
    for (const stat of ['strength', 'technique', 'focus', 'flexibility']) {
      if (cur[stat] < prev[stat]) {
        dropDetected = {
          stat, fromRound: trainTimeline[i - 1].round, toRound: trainTimeline[i].round,
          prev: prev[stat], cur: cur[stat],
        };
        break;
      }
    }
    if (dropDetected) break;
  }
  if (dropDetected) {
    console.log(`  ⚠ TRAINING RESET DETECTED: ${dropDetected.stat} dropped from +${dropDetected.prev} (round ${dropDetected.fromRound}) to +${dropDetected.cur} (round ${dropDetected.toRound})`);
  } else {
    console.log(`  ✓ training bonuses appear cumulative (no resets observed in train_action emissions)`);
  }

  // Cross-check: pull the FIRST resource_update of each round and see if any stat tracking is off.
  // resource_update doesn't include trainingBonuses, so we use a different proxy: look at the
  // climb_resolved event for this player and see if the effective stats include training.
  // Pick the LAST climb_resolved for the player.
  const lastClimb = [...events].reverse().find(e => e.type === 'climb_resolved' && e.payload.playerNum === llmPlayerNum);
  if (lastClimb) {
    console.log(`  last climb (round-${lastClimb.payload.success ? 'WIN' : 'LOSS'}): ${lastClimb.payload.routeName} (${lastClimb.payload.grade})`);
    console.log(`    effective stats at attempt: ${JSON.stringify(lastClimb.payload.effectiveStats)}`);
    console.log(`    requirements (after dice):  ${JSON.stringify(lastClimb.payload.requirements)}`);
  }

  // Now: did the LLM train the RIGHT stats? Tally what each route it attempted needed.
  // We'll measure: for every climb/milestone attempt, sum the per-stat shortfall.
  // The stat with the highest cumulative shortfall is the one that "needed training most."
  const cumShortfall = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  let attempts = 0;
  for (const e of events) {
    if (e.type !== 'climb_resolved' || e.payload.playerNum !== llmPlayerNum) continue;
    const eff = e.payload.effectiveStats;
    const req = e.payload.requirements;
    for (const s of ['strength', 'technique', 'focus', 'flexibility']) {
      if (eff[s] < req[s]) cumShortfall[s] += (req[s] - eff[s]);
    }
    attempts++;
  }
  if (attempts) {
    console.log(`  cumulative shortfall across ${attempts} attempts (where the LLM was actually short):`);
    const ranked = Object.entries(cumShortfall).sort((a, b) => b[1] - a[1]);
    for (const [s, n] of ranked) {
      console.log(`    ${s.padEnd(12)} short by ${n} total points  (trained ${trainsByStat[s]}x)`);
    }
    // Did the LLM train the highest-need stat?
    const topNeed = ranked[0][0];
    const trainedTopNeed = trainsByStat[topNeed];
    const totalTrains = Object.values(trainsByStat).reduce((a, b) => a + b, 0);
    const pctOnRightStat = totalTrains > 0 ? ((trainedTopNeed / totalTrains) * 100).toFixed(0) : 0;
    console.log(`  → top-shortfall stat: ${topNeed}. LLM spent ${pctOnRightStat}% of its training on it.`);
  }
  console.log();
}

console.log('='.repeat(80));
console.log('RECAP');
console.log('='.repeat(80));
console.log(`A persistent training reset would show as a "TRAINING RESET DETECTED" warning above.`);
console.log(`If no resets are reported but the LLM is still failing climbs, the issue is`);
console.log(`(a) the LLM is training stats that don't match what its target routes need, OR`);
console.log(`(b) the route requirements outpace what training can deliver in 30 rounds.`);
