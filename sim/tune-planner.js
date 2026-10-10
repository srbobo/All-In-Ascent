// Tune the planner's weights per character (audit §5, 3a).
//
//   node sim/tune-planner.js [--chars=ironLung,...] [--train-seeds=1-100]
//                            [--test-seeds=1001-1300] [--passes=3]
//
// For each character: coordinate search over DEFAULT_PARAMS, minimising mean
// solo rounds-to-win on the training seeds (unfinished games count as
// max-rounds). Every candidate is scored on the SAME seeds, so comparisons
// are paired. The winner is then checked on held-out test seeds against the
// default weights, and written to sim/agents/planner-weights.json only if it
// is at least as fast there.
//
// Objective is solo speed: "how fast can this character ring the bell when
// played well". It is the cleanest per-character signal and correlates with
// racing strength; head-to-head checks belong in run-balance.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTERS } from '../engine/data.js';
import { ENGINE_VERSION_STRING } from '../engine/version.js';
import { DEFAULT_PARAMS } from './agents/planner-model.js';
import { runGames, mean } from './balance-pool.js';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const parseSeeds = (spec) => spec.split(',').flatMap(part => {
  const [a, b] = part.split('-').map(Number);
  return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i);
});

const chars = flag('chars', Object.keys(CHARACTERS).join(',')).split(',');
const trainSeeds = parseSeeds(flag('train-seeds', '1-100'));
const testSeeds = parseSeeds(flag('test-seeds', '1001-1300'));
const passes = Number(flag('passes', 3));
const MAX_ROUNDS = 120;
const MIN_GAIN = 0.05; // rounds; smaller "improvements" are treated as noise

// Search space: multiplicative steps for scale-like weights, additive for
// probabilities, each clamped to a sane range.
const SPACE = {
  invCap:          { steps: [0.6, 1.6], lo: 5, hi: 120 },
  pMin:            { steps: [-0.15, 0.15], add: true, lo: 0.05, hi: 0.9 },
  trainWeight:     { steps: [0.8, 1.25], lo: 0.4, hi: 2.5 },
  enduranceWeight: { steps: [0.7, 1.4], lo: 0.2, hi: 3 },
  xpRate:          { steps: [0.7, 1.4], lo: 2, hi: 40 },
  xpWeight:        { steps: [0, 0.6, 1.6], lo: 0, hi: 3 },
  minXpTime:       { steps: [-1, 1], add: true, lo: 0, hi: 8 },
};

async function score(char, params, seeds) {
  const tasks = seeds.map(seed => ({ chars: [char], seed, agents: ['planner'], maxRounds: MAX_ROUNDS, params }));
  const rs = await runGames(tasks);
  return mean(rs.map(r => (r.done ? r.rounds : MAX_ROUNDS)));
}

const weightsPath = new URL('./agents/planner-weights.json', import.meta.url);
let saved = {};
try { saved = JSON.parse(readFileSync(weightsPath, 'utf8')); } catch { /* first run */ }

for (const char of chars) {
  const t0 = Date.now();
  let best = { ...DEFAULT_PARAMS };
  let bestScore = await score(char, best, trainSeeds);
  const baseTrain = bestScore;
  console.log(`\n${char}: default ${bestScore.toFixed(2)} mean rounds on ${trainSeeds.length} training seeds`);
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (const [key, sp] of Object.entries(SPACE)) {
      for (const step of sp.steps) {
        const raw = sp.add ? best[key] + step : best[key] * step;
        const v = Math.min(sp.hi, Math.max(sp.lo, Math.round(raw * 1000) / 1000));
        if (v === best[key]) continue;
        const cand = { ...best, [key]: v };
        const sc = await score(char, cand, trainSeeds);
        if (sc < bestScore - MIN_GAIN) {
          console.log(`  pass ${pass + 1}: ${key} ${best[key]} → ${v}: ${bestScore.toFixed(2)} → ${sc.toFixed(2)}`);
          best = cand;
          bestScore = sc;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  // Held-out check against the defaults.
  const testDefault = await score(char, DEFAULT_PARAMS, testSeeds);
  const testTuned = await score(char, best, testSeeds);
  const keep = testTuned <= testDefault;
  console.log(`  held-out (${testSeeds.length} seeds): default ${testDefault.toFixed(2)} · tuned ${testTuned.toFixed(2)} → ${keep ? 'KEEP' : 'reject (no better on held-out seeds)'}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  saved[char] = {
    params: keep ? best : { ...DEFAULT_PARAMS },
    engine: ENGINE_VERSION_STRING,
    objective: 'mean solo rounds to win',
    train: { seeds: flag('train-seeds', '1-100'), default: +baseTrain.toFixed(3), tuned: +bestScore.toFixed(3) },
    test: { seeds: flag('test-seeds', '1001-1300'), default: +testDefault.toFixed(3), tuned: +testTuned.toFixed(3) },
    kept: keep,
  };
  writeFileSync(weightsPath, JSON.stringify(saved, null, 2) + '\n');
}
console.log(`\nwrote ${fileURLToPath(weightsPath)}`);
