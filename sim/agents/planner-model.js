// Planner model: how much Time does this climber still need to finish?
//
// The planner bot (planner.js) picks the action that minimises
//     Time spent now  +  E[ timeToFinish(next state) ]
// This module supplies timeToFinish — a fast, character-agnostic estimate of
// the Time (in "10-Time rounds × 10" units) a climber still needs to send all
// remaining milestones, from their stats, gear, Endurance and XP.
//
// The estimate plans, for the remaining milestones together:
//   1. training — greedily add +gain sessions to whichever stat cuts the
//      expected attempt cost most, until another session no longer pays for
//      itself (and every milestone has at least `pMin` send chance);
//   2. attempts — each milestone costs (Time + Endurance) / P(send) with the
//      planned stats (failures repeat the attempt);
//   3. Endurance — every point is worth 1/R Time (one Rest refills R);
//      Endurance already in the tank is a credit;
//   4. Lead access — missing access cards cost their XP shortfall at
//      `xpRate` XP per Time, plus 1 Time per purchase;
//   5. level progress — XP toward the next level is credited at the rate one
//      level would cut the plan (the level's stat growth, valued by the plan).
// Approach Shoes scale it all by 10/11 (more Time per round).
//
// Send chance for PLANNING uses a product form: dice on different stats are
// independent, so P(send) = Π P(stat s passes) (or "≥3 of 4" for a Route
// Reader). That is exact for every character ability and for Climbing Coach;
// dice gear that couples stats (Sequence Memorization, Mountain Mentor, the
// Decoder, Power Tap Belt) is approximated per stat. Real decisions about
// whether to attempt a climb use observe()'s exact pSend, not this.

import { GEAR_SHOP, TRAINING_AREAS, XP_TABLE } from '../../engine/data.js';
import {
  applyLevelUpIfNeeded, buildEffectRollArray, calculateGearBonuses, checkAreaAccess,
  computeRestRecovery, getEffectiveClimbEnduranceCost, getEffectiveClimbTimeCost,
  getFailureEnduranceExtra, getSpendableXp, trainingCap, trainingSpec,
  usesGrit, gearPrice, abilityParam, passRule,
} from '../../engine/helpers.js';

export const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TIERS = ['beginner', 'intermediate', 'expert'];
const ACCESS = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
const K_MAX = 80;

// Tunable weights. Defaults are hand-set; sim/tune-planner.js searches them
// per character and writes sim/agents/planner-weights.json.
export const DEFAULT_PARAMS = {
  invCap: 30,          // a hopeless milestone counts as this many attempts
  pMin: 0.35,          // keep training until every milestone reaches this pSend
  trainWeight: 1,      // multiplier on a training session's Time cost
  enduranceWeight: 1,  // multiplier on Endurance's Time value
  xpRate: 8,           // XP a climber earns per Time spent climbing
  xpWeight: 1,         // multiplier on the value of level progress
  minXpTime: 3,        // Time to earn ANY XP (one climb), however little is needed
  gearWeight: 1,       // multiplier on the value of saving XP for market gear
  levelsAhead: 4,      // how many level-ups ahead the level credit looks
  gritTime: 2,        // Grit economy: Time to earn one Grit by climbing
  partnerFactor: 0.6,  // Grit cost per session with Training Partner (≈ one free a round)
  capWeight: 1,        // multiplier on the Time to raise a training cap by levelling
  neverIdle: true,     // never idle (empty Rest / Call It a Day) while anything else is legal:
                       // cuts Grit-economy games ~45 → ~25 rounds, standard ones slightly too
};

// =============================================================================
// Per-stat dice distributions (planning send chance)
// =============================================================================

const UNIFORM = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6]; // P(face = 1..6)
const COACHED = [0, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 2 / 6];     // min(6, face + 1)
const BEST_OF_TWO = [1, 3, 5, 7, 9, 11].map(n => n / 36);   // max of 2 dice
const WORST_OF_TWO = [11, 9, 7, 5, 3, 1].map(n => n / 36);  // min of 2 dice
const CONST_ONE = [1, 0, 0, 0, 0, 0];

// PMF over D = Σ sign·face for one stat's dice, as { lo, pmf[] } (pmf[i] = P(D = lo + i)).
function sumPmf(dice) {
  let lo = 0;
  let pmf = [1];
  for (const { sign, faces } of dice) {
    const nlo = lo + (sign > 0 ? 1 : -6);
    const next = new Array(pmf.length + 5).fill(0);
    for (let i = 0; i < pmf.length; i++) {
      if (!pmf[i]) continue;
      for (let f = 1; f <= 6; f++) {
        const p = faces[f - 1];
        if (!p) continue;
        next[i + sign * f - (sign > 0 ? 1 : -6)] += pmf[i] * p;
      }
    }
    lo = nlo;
    pmf = next;
  }
  // Prefix sums → CDF.
  const cdf = new Float64Array(pmf.length);
  let acc = 0;
  for (let i = 0; i < pmf.length; i++) { acc += pmf[i]; cdf[i] = acc; }
  return { lo, cdf };
}

const ownsKind = (char, kind, route = null) => char.equipment.some(name => {
  const g = GEAR_SHOP.find(x => x.name === name);
  return g && g.effectKind === kind && (!g.tagFilter || (route && route.tag === g.tagFilter));
});

// Model of one milestone for one character: per-stat CDFs plus costs.
export function milestoneModel(char, tier, m) {
  const route = m.route;
  const effects = buildEffectRollArray(char, route);
  const perStat = STATS.map(() => []);
  for (const e of effects) {
    let sign = e.modifier;
    if (char.key === 'freeSolo') sign = 0;
    if (char.key === 'technician' && sign === 1) sign = 0;
    if (sign === 0) continue;
    const faces = sign === -1 && ownsKind(char, 'milestoneBuffDiceBonus') ? COACHED : UNIFORM;
    perStat[STATS.indexOf(e.stat)].push({ sign, faces });
  }
  // Coupling dice gear, approximated per stat (planning only).
  const mostDice = (pred) => {
    let best = -1;
    let n = 0;
    perStat.forEach((d, s) => { const k = d.filter(pred).length; if (k > n) { n = k; best = s; } });
    return best;
  };
  const tweakOne = (pred, replace) => {
    const s = mostDice(pred);
    if (s < 0) return;
    const i = perStat[s].findIndex(pred);
    const r = replace(perStat[s][i]);
    if (r) perStat[s][i] = r; else perStat[s].splice(i, 1);
  };
  const nerf = d => d.sign === 1 && d.faces !== CONST_ONE;
  if (ownsKind(char, 'treatOneDieAsValue')) tweakOne(nerf, d => ({ ...d, faces: CONST_ONE }));
  if (ownsKind(char, 'negateOneNerfDie')) tweakOne(d => d.sign === 1, () => null);
  if (ownsKind(char, 'rerollOnTag', route) || ownsKind(char, 'extraDieDiscardOne', route)) {
    tweakOne(() => true, d => ({ ...d, faces: d.sign === -1 ? BEST_OF_TWO : WORST_OF_TWO }));
  }
  const dists = perStat.map(sumPmf);

  // Free Solo may only start a climb its base+training+permanent gear already
  // clears, so per-route gear never counts for it.
  const routeBonus = char.key === 'freeSolo'
    ? { strength: 0, technique: 0, focus: 0, flexibility: 0 }
    : calculateGearBonuses(char, route, m.area, {});
  const isRR = char.key === 'routeReader';
  // A Route Reader plans to Rest first, so its attempt carries the Beta Boost.
  const boost = isRR ? (abilityParam(char, 'betaBoost') ?? 3) : 0;
  const rule = passRule(isRR ? { ...char, betaBoostActive: true } : char, true);
  const adj = char.key === 'technician' ? abilityParam(char, 'reqReduction') : 0;
  return {
    tier,
    req: STATS.map(k => route[k]),
    adj,
    bonus: STATS.map(k => routeBonus[k] + boost),
    dists,
    needed: rule.needed,
    nearMiss: rule.nearMiss,
    time: getEffectiveClimbTimeCost(char, route.time, route, true) + (isRR ? 1 : 0),
    endurance: getEffectiveClimbEnduranceCost(char, route, route.endurance),
    failExtra: getFailureEnduranceExtra(char),
    // Expected requirement per stat (dice at their mean) — the deficit
    // surrogate that steers training while P(send) is still flat at 0.
    expReq: STATS.map((k, s) => route[k] - adj + meanOf(dists[s])),
  };
}

function meanOf({ lo, cdf }) {
  let mean = 0;
  let prev = 0;
  for (let i = 0; i < cdf.length; i++) { mean += (lo + i) * (cdf[i] - prev); prev = cdf[i]; }
  return mean;
}

// P(stat value x passes) for stat s of model m.
function passProb(m, s, x) {
  const { lo, cdf } = m.dists[s];
  const i = x - m.req[s] + m.adj - lo; // need D ≤ x − req + adj
  if (i < 0) return 0;
  if (i >= cdf.length) return 1;
  return cdf[i];
}

// Planning send chance for stat vector `x` (permanent totals, before the
// milestone's per-route gear bonus).
export function planPSend(m, x) {
  const q0 = passProb(m, 0, x[0] + m.bonus[0]);
  const q1 = passProb(m, 1, x[1] + m.bonus[1]);
  const q2 = passProb(m, 2, x[2] + m.bonus[2]);
  const q3 = passProb(m, 3, x[3] + m.bonus[3]);
  const all = q0 * q1 * q2 * q3;
  if (m.needed === 4) return all;
  // 3 of 4: one stat may fail — by at most nearMiss, when a variant sets one.
  const near = (s, q) => (Number.isFinite(m.nearMiss) ? passProb(m, s, x[s] + m.bonus[s] + m.nearMiss) : 1) - q;
  return all + near(0, q0) * q1 * q2 * q3 + q0 * near(1, q1) * q2 * q3 + q0 * q1 * near(2, q2) * q3 + q0 * q1 * q2 * near(3, q3);
}

function deficit(m, x) {
  const d = STATS.map((_, s) => Math.max(0, m.expReq[s] - x[s] - m.bonus[s]));
  if (m.needed === 3) { d.sort((a, b) => b - a); d[0] = 0; }
  return d[0] + d[1] + d[2] + d[3];
}

// =============================================================================
// The plan
// =============================================================================

// Time-equivalent cost of the remaining training + attempts from stats x0.
// `train` = { specs[s]: {time, endurance, gain}, bonus0[s] (training so far),
// cap (per-stat training cap at this Level), perRound (session limit or null) }.
// Returns { time, endurance } (endurance = the plan's total Endurance use).
function planCost(models, x0, train, R, params) {
  const { specs, bonus0, cap, perRound } = train;
  // Grit economy: sessions use Grit on hand first; each one after that
  // also costs the climbing Time to earn its Grit.
  const gritCost = train.gritCost || 0;
  let gritHave = train.gritHave || 0;
  let gritTime = 0;
  let capTime = 0;
  const gritExtra = () => (gritHave >= gritCost ? 0 : (gritCost - gritHave) * params.gritTime);
  // Training cap: a session past the cap needs the level-ups that raise it,
  // priced at train.beyondCapTime each. (Stopping the plan AT the cap made a
  // higher cap look costlier than a lower one, so the bot avoided levelling.)
  const beyond = (s) => (tb[s] + specs[s].gain > cap ? train.beyondCapTime : 0);
  // With a per-round session limit, a session also costs its share of the
  // rounds the limit forces you to wait through.
  const effTime = specs.map(t => (perRound ? Math.max(t.time, 10 / perRound) : t.time));
  const trainCost = specs.map((t, s) => params.trainWeight * effTime[s] + params.enduranceWeight * t.endurance / R);
  const minP = 1 / params.invCap;
  const attempts = (x) => {
    let time = 0;
    let end = 0;
    for (const m of models) {
      const inv = 1 / Math.max(planPSend(m, x), minP);
      time += m.time * inv;
      end += m.endurance * inv + m.failExtra * (inv - 1);
    }
    return { time, end, cost: time + params.enduranceWeight * end / R };
  };
  const x = x0.slice();
  const tb = bonus0.slice();
  let cur = attempts(x);
  let trainTime = 0;
  let trainEnd = 0;
  for (let k = 0; k < K_MAX; k++) {
    let best = -1;
    let bestGain = 1e-9;
    let bestNext = null;
    let defBest = -1;
    let defGain = 0;
    const def0 = models.reduce((a, m) => a + deficit(m, x), 0);
    for (let s = 0; s < 4; s++) {
      if (beyond(s) === Infinity) continue; // cap can never be raised
      x[s] += specs[s].gain;
      const next = attempts(x);
      const g = cur.cost - next.cost - trainCost[s] - gritExtra() - beyond(s);
      if (g > bestGain) { bestGain = g; best = s; bestNext = next; }
      const dg = def0 - models.reduce((a, m) => a + deficit(m, x), 0);
      if (dg > defGain) { defGain = dg; defBest = s; }
      x[s] -= specs[s].gain;
    }
    if (best < 0) {
      // No session pays for itself by send chance alone. Keep training while
      // some milestone is still below pMin and the deficit can shrink.
      const behind = models.some(m => planPSend(m, x) < params.pMin);
      if (!behind || defBest < 0) break;
      best = defBest;
      x[best] += specs[best].gain;
      bestNext = attempts(x);
      x[best] -= specs[best].gain;
    }
    capTime += beyond(best);
    x[best] += specs[best].gain;
    tb[best] += specs[best].gain;
    gritTime += gritExtra();
    gritHave = Math.max(0, gritHave - gritCost);
    trainTime += effTime[best];
    trainEnd += specs[best].endurance;
    cur = bestNext;
  }
  return {
    time: params.trainWeight * trainTime + gritTime + capTime + cur.time,
    endurance: trainEnd + cur.end,
  };
}

const TRAINING_AREAS_BY_STAT = STATS.map(k => TRAINING_AREAS.find(t => t.stat === k));

// =============================================================================
// timeToFinish
// =============================================================================

export function permanentStats(char) {
  return STATS.map(k => char.stats[k] + char.trainingBonuses[k] + char.gearBonuses[k]);
}

// `game` = { milestoneRoutes, rules, market } (a bare milestoneRoutes object
// is accepted too). rules = state.rules (balance variants); market = names of
// the gear cards currently for sale.
function gameCtx(game) {
  return game && game.milestoneRoutes ? game : { milestoneRoutes: game, rules: null, market: null };
}

// Core estimate without the level / gear credits. Cached per state shape.
function coreEstimate(char, game, params, cache) {
  const { milestoneRoutes, rules } = game;
  const pending = TIERS.filter(t => !char.milestonesCompleted[t]);
  if (!pending.length) return { plan: 0, access: 0, endurance: 0, earmarked: 0, gritReserved: 0, R: 1 };
  const x = permanentStats(char);
  const train = {
    specs: TRAINING_AREAS_BY_STAT.map(t => trainingSpec(rules, t, char)),
    bonus0: STATS.map(k => char.trainingBonuses[k]),
    cap: trainingCap(rules, char),
    perRound: rules && rules.trainPerRound ? rules.trainPerRound : null,
    beyondCapTime: 0,
  };
  if (Number.isFinite(train.cap)) {
    // Each level raises the cap by trainCapPerLevel in every stat; a session
    // past the cap costs the Time to earn that share of a level's XP.
    const perLevel = rules.trainCapPerLevel || 0;
    const row = XP_TABLE.find(r => r.level === char.level);
    const next = XP_TABLE.find(r => r.level === char.level + 1);
    train.beyondCapTime = perLevel > 0 && row && next
      ? params.capWeight * ((next.cumulative - row.cumulative) / params.xpRate) / Math.max(1, perLevel / train.specs[0].gain)
      : Infinity;
  }
  // Lead access shortfall (Free Solo needs none). In the Grit economy the
  // cards cost Grit, so Grit they need aren't available for training.
  const Grit = usesGrit(rules);
  const { access, earmarked, gritReserved } = needsLeadAccess(char, pending, milestoneRoutes)
    ? (Grit ? accessEstimateGrit(char, rules, params) : accessEstimate(char, params))
    : { access: 0, earmarked: 0, gritReserved: 0 };
  if (Grit) {
    const partner = char.equipment.some(n => GEAR_SHOP.find(g => g.name === n)?.effectKind === 'freeTrainingSession');
    const freeTraining = !!(rules.characters && rules.characters[char.key] && rules.characters[char.key].freeTraining);
    train.gritCost = freeTraining ? 0 : (rules.grit.trainCost ?? 1) * (partner ? params.partnerFactor : 1);
    train.gritHave = Math.min(80, Math.max(0, (char.grit || 0) - gritReserved));
  }
  const rest = computeRestRecovery({ ...char, currentEndurance: 0 });
  const R = Math.max(1, rest.newEndurance + rest.restBonusApplied / 2);
  const key = `${char.key}|${x.join(',')}|${train.bonus0.join(',')}|${train.cap}|` +
    `${JSON.stringify(train.specs)}|${train.perRound}|${train.gritCost}|${train.gritHave}|${train.beyondCapTime}|${R}|` +
    `${char.equipment.join(',')}|${pending.join(',')}`;
  let plan = cache && cache.get(key);
  if (!plan) {
    const models = pending.map(t => milestoneModel(char, t, milestoneRoutes[t]));
    plan = planCost(models, x, train, R, params);
    if (cache) {
      if (cache.size > 20000) cache.clear();
      cache.set(key, plan);
    }
  }
  // Endurance already in the tank covers part of the plan's need.
  const credit = Math.min(char.currentEndurance, plan.endurance);
  const endurance = -params.enduranceWeight * credit / R;
  return { plan: plan.time + params.enduranceWeight * plan.endurance / R, access, endurance, earmarked, gritReserved, R };
}

// Lead access in the Grit economy: cards cost Grit, earned at gritTime
// each. No level-up cliff and nothing earmarked from XP (XP is never spent).
function accessEstimateGrit(char, rules, params) {
  const missing = ACCESS.filter(n => !char.equipment.includes(n)).map(n => GEAR_SHOP.find(g => g.name === n));
  const need = missing.reduce((a, g) => a + gearPrice(rules, char, g), 0);
  const short = Math.max(0, need - (char.grit || 0));
  const earnTime = short > 0 ? Math.max(params.minXpTime, short * params.gritTime) : 0;
  return { access: missing.length + earnTime, earmarked: 0, gritReserved: Math.min(need, char.grit || 0) };
}

function needsLeadAccess(char, pending, milestoneRoutes) {
  return pending.some(t => milestoneRoutes[t].area === 'leadClimbing') &&
    !checkAreaAccess(char, 'leadClimbing').hasAccess;
}

// Time still needed to own all three Lead access cards, and how much of the
// current spendable XP will go into them ("earmarked").
//
// Cards are bought in order with spendable XP; every purchase moves the
// climber back on the XP track, so it also makes room before the next level.
// If the rest can be earned before that level-up, saved XP all goes into the
// cards. If not, the level-up comes first and wipes what is left — that loss
// is unavoidable, so it is priced in NOW, along with the XP to reach it. (Pricing it only once it happens
// made every XP-earning move look worse than resting, and the bot stalled.)
function accessEstimate(char, params) {
  const missing = ACCESS.filter(n => !char.equipment.includes(n))
    .map(n => GEAR_SHOP.find(g => g.name === n).cost);
  const next = XP_TABLE.find(r => r.level === char.level + 1);
  let spendable = getSpendableXp(char);
  let room = next ? next.cumulative - char.xp : Infinity;
  let spent = 0;
  let i = 0;
  while (i < missing.length && missing[i] <= spendable) {
    spendable -= missing[i];
    room += missing[i];
    spent += missing[i];
    i++;
  }
  const remaining = missing.slice(i).reduce((a, b) => a + b, 0);
  let xpToEarn = 0;
  let earmarked = spent;
  if (remaining > 0) {
    if (remaining - spendable < room) {
      xpToEarn = remaining - spendable;
      earmarked += spendable;
    } else {
      // Level up first (reaching it wipes what is saved), then earn the
      // cards inside the new level. XP toward that level-up still counts —
      // without it, early XP looked worthless and the bot stalled.
      xpToEarn = (Number.isFinite(room) ? room : 0) + remaining;
    }
  }
  // Earning any XP takes at least one climb, however little is missing.
  const earnTime = xpToEarn > 0 ? Math.max(params.minXpTime, xpToEarn / params.xpRate) : 0;
  return { access: missing.length + earnTime, earmarked };
}

// Estimated Time (×10/Time-per-round) to finish all remaining milestones.
export function timeToFinish(char, game, params = DEFAULT_PARAMS, cache = null) {
  return explainTimeToFinish(char, game, params, cache).total;
}

// timeToFinish with its parts: { plan, access, endurance, levelCredit, gearCredit, total }.
export function explainTimeToFinish(char, gameIn, params = DEFAULT_PARAMS, cache = null) {
  const game = gameCtx(gameIn);
  const core = coreEstimate(char, game, params, cache);
  const parts = { plan: core.plan, access: core.access, endurance: core.endurance, levelCredit: 0, gearCredit: 0, total: 0 };
  if (core.plan === 0) return parts;
  let total = core.plan + core.access + core.endurance;
  // Level credit: the next level-up is worth what its stat growth cuts from
  // the plan, minus the Time still needed to earn the XP for it (at xpRate).
  // Only the net, and never below 0 — partly-earned XP is not banked growth.
  // Earning any XP takes at least one climb (minXpTime), however little is left.
  // (A linear "fraction of the level" credit made the bot refuse training that
  // would make the coming level-up pointless, and rest forever instead.)
  // XP set aside for Lead access cards doesn't count toward the level: it is
  // going to be spent, so spending it must not look like lost progress.
  // A level-up also raises a rules-variant training cap, which the plan for
  // the levelled climber sees.
  // Looking several levels ahead (levelsAhead) matters when one level-up
  // alone changes little — e.g. under a rules-variant training cap, where
  // only a few levels unlock enough training to send the expert.
  if (params.xpWeight > 0 && char.level < 15) {
    let best = 0;
    const up = structuredClone(char);
    for (let k = 1; k <= params.levelsAhead && up.level < 15; k++) {
      const target = XP_TABLE.find(r => r.level === up.level + 1);
      if (!target) break;
      up.xp = target.cumulative;
      applyLevelUpIfNeeded(up);
      const upCore = coreEstimate(up, game, params, cache);
      const saves = Math.max(0, core.plan - upCore.plan);
      const toEarn = target.cumulative - (char.xp - core.earmarked);
      const earnTime = Math.max(params.minXpTime, toEarn / params.xpRate);
      best = Math.max(best, saves - earnTime);
    }
    parts.levelCredit = params.xpWeight * best;
    total -= parts.levelCredit;
  }
  // Gear credit: the best card for sale is worth what owning it cuts from the
  // plan, minus the Time to buy it (1, plus earning any XP shortfall). This is
  // what makes XP worth saving for market gear; without it the bot only ever
  // valued XP for levels and Lead access.
  if (game.market && params.gearWeight > 0) {
    const gritMode = usesGrit(game.rules);
    const free = gritMode ? (char.grit || 0) - core.gritReserved : getSpendableXp(char) - core.earmarked;
    const next = XP_TABLE.find(r => r.level === char.level + 1);
    const room = next ? next.cumulative - char.xp : Infinity;
    let best = 0;
    for (const name of game.market) {
      if (char.equipment.includes(name) || ACCESS.includes(name)) continue;
      const g = GEAR_SHOP.find(x => x.name === name);
      if (!g) continue;
      const withG = { ...char, equipment: [...char.equipment, name] };
      let value = core.plan - coreEstimate(withG, game, params, cache).plan;
      if (name === 'Approach Shoes') value += (core.plan + core.access) / 11; // +1 Time per round
      if (value <= 0) continue;
      // XP still to earn before the purchase. If earning it would level the
      // climber up first (wiping saved XP), the whole cost comes after that
      // level-up — the same cliff accessEstimate prices for Lead access.
      let buyTime;
      if (gritMode) {
        const short = Math.max(0, gearPrice(game.rules, char, g) - free);
        buyTime = 1 + (short > 0 ? Math.max(params.minXpTime, short * params.gritTime) : 0);
      } else {
        const shortfall = Math.max(0, g.cost - free);
        const toEarn = shortfall === 0 ? 0 : (shortfall < room ? shortfall : room + g.cost);
        buyTime = 1 + (toEarn > 0 ? Math.max(params.minXpTime, toEarn / params.xpRate) : 0);
      }
      best = Math.max(best, value - buyTime);
    }
    parts.gearCredit = params.gearWeight * best;
    total -= parts.gearCredit;
  }
  const perRound = 10 + (char.equipment.includes('Approach Shoes') ? 1 : 0);
  parts.total = total * 10 / perRound;
  return parts;
}
