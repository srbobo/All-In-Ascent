// Learned value model — a correction to the planner's finish-time estimate.
//
//   valueFeatures(char, game, parts)          → number[] (VALUE_FEATURES order)
//   valueResidual(weights, char, features)    → Time to add to the planner's estimate
//   valueTimeToFinish(char, game, params, cache, weights) → corrected estimate
//
// The planner (planner.js) picks the action minimising Time now + E[time to
// finish]. Its finish-time estimate (planner-model.js timeToFinish) is
// hand-built. This module learns, from self-play outcomes, how far that
// estimate is off for a given climber, and adds the correction:
//
//     V(char) = timeToFinish(char) + MLP(features) + adapter[char.key]
//
// - The estimate's own parts are inputs, so the network learns to re-weight
//   them rather than to rebuild the game from scratch, and a zero network is
//   exactly the planner.
// - Features describe the climber by traits (starting stats, growth,
//   endurance), not by name, so one network serves every character —
//   including Project Mode climbers it never saw.
// - adapters: a small per-character correction (bias + scale on the
//   estimate), used only for characters it was trained on; any other
//   character gets the shared network alone.
//
// Weights are plain JSON (engine/value-weights.js, written by
// sim/learn/train.js) so the model runs the same in Node, the Worker and the
// browser bundle. No Node-only imports here.

import { XP_TABLE } from './data.js';
import { explainTimeToFinish, permanentStats } from './planner-model.js';

export const VALUE_MODEL_SCHEMA = 'aia-value-model/1';

const TIERS = ['beginner', 'intermediate', 'expert'];
const STAT_KEYS = ['strength', 'technique', 'focus', 'flexibility'];
const ACCESS_CARDS_NEEDED = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];

export const VALUE_FEATURES = [
  // the planner's estimate and its parts
  'ttf', 'plan', 'access', 'endurance', 'levelCredit', 'gearCredit',
  // progress and resources
  'pending', 'deficitSum', 'deficitMax', 'trainBonus', 'endNow', 'endMax',
  'level', 'xpToLevel', 'grit', 'accessOwned', 'gearCount', 'betaBoost', 'abilityUsed',
  // Time left in the current round (training only; see valueTimeToFinish)
  'timeNow',
  // traits — who the climber is, without naming them
  'startStats', 'growth', 'startEndurance',
];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Features for one climber. `parts` is explainTimeToFinish's result for this
// climber (computed once by the caller). `timeNow` overrides the climber's
// Time left this round.
export function valueFeatures(char, game, parts, { timeNow = char.timeRemaining } = {}) {
  const milestoneRoutes = game.milestoneRoutes || game;
  const pending = TIERS.filter(t => !char.milestonesCompleted[t]);
  const x = permanentStats(char);
  const deficits = pending.map(t => {
    const route = milestoneRoutes[t].route;
    return sum(STAT_KEYS.map((k, s) => Math.max(0, route[k] - x[s])));
  });
  const next = XP_TABLE.find(r => r.level === char.level + 1);
  const start = char.startingStats || char.stats;
  return [
    parts.total, parts.plan, parts.access, parts.endurance, parts.levelCredit, parts.gearCredit,
    pending.length,
    sum(deficits) / 10,
    (deficits.length ? Math.max(...deficits) : 0) / 10,
    sum(STAT_KEYS.map(k => char.trainingBonuses[k] || 0)) / 10,
    char.currentEndurance / 10,
    char.maxEndurance / 10,
    char.level,
    next ? (next.cumulative - char.xp) / 100 : 0,
    char.grit || 0,
    ACCESS_CARDS_NEEDED.filter(n => char.equipment.includes(n)).length,
    char.equipment.length,
    char.betaBoostActive ? 1 : 0,
    char.abilityUsed ? 1 : 0,
    timeNow,
    sum(STAT_KEYS.map(k => start[k] || 0)) / 10,
    char.growth ? sum(STAT_KEYS.map(k => char.growth[k] || 0)) : 0,
    (char.startingEndurance || char.maxEndurance) / 10,
  ];
}

// The network's correction (Time units, same as timeToFinish) for features
// `f` of climber `char`. Weights: { mean, std, W1 (hidden × in), b1, W2, b2,
// adapters: { [charKey]: { bias, scale } } }.
//
// `w.use` (optional): the indices of the features the network reads, in the
// order of W1's columns, mean and std. Without it, every feature in order.
export function valueResidual(w, char, f) {
  const h = w.b1.length;
  const use = w.use || null;
  const n = use ? use.length : f.length;
  let out = w.b2;
  for (let j = 0; j < h; j++) {
    const row = w.W1[j];
    let a = w.b1[j];
    for (let k = 0; k < n; k++) {
      const i = use ? use[k] : k;
      a += row[k] * ((f[i] - w.mean[k]) / w.std[k]);
    }
    out += w.W2[j] * Math.tanh(a);
  }
  const ad = w.adapters && Object.prototype.hasOwnProperty.call(w.adapters, char.key) ? w.adapters[char.key] : null;
  if (ad) out += ad.bias + ad.scale * f[0];
  return out;
}

// Corrected finish-time estimate. Decisions compare climbers after different
// actions, so the round's Time left is held at a fresh round (perRound) for
// all of them — the action's own Time is already counted by the planner.
export function valueTimeToFinish(char, game, params, cache, weights) {
  const parts = explainTimeToFinish(char, game, params, cache);
  if (!weights || parts.total === 0) return parts.total;
  const perRound = 10 + (char.equipment.includes('Approach Shoes') ? 1 : 0);
  const f = valueFeatures(char, game, parts, { timeNow: perRound });
  return Math.max(0, parts.total + valueResidual(weights, char, f));
}
