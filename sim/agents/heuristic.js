// Rule-based heuristic agent. The strong baseline.
//
// What it does — in priority order, per turn:
//   1. Attempt a MILESTONE if one is legal AND we'd pass the base stat
//      check (ignoring dice). Milestones win the game, so if we can
//      plausibly beat one, we do.
//   2. Buy an ESSENTIAL ACCESS CARD we don't yet own (Belay Device →
//      Locking Carabiner → Lead Rope). These three unlock Lead Climbing
//      and pay for themselves fast. (Top Rope needs no gear.)
//   3. (v0.3.0) Buy a SPECIALTY CARD (Crimp Sequence Decoder, Trick Foot
//      Manual, Body Tension Belt, Power Tap Belt) if at least one of our
//      milestones shares its tag and we can afford it. This makes the
//      heuristic actually USE the new specialty mechanics.
//   4. (v0.3.0) Buy Approach Shoes early if affordable (cheap +1 time/round)
//      and Climbing Coach mid-game (180 XP — boosts milestone dice).
//   5. Climb the highest-EXPECTED-XP route we're LIKELY to pass (stats
//      clear base requirements).
//   6. REST if endurance dropped below 30% of max.
//   7. TRAIN at the station matching our weakest stat, if time permits.
//   8. Risky climb (no safe option AND no productive training).
//   9. END TURN as the final fallback.
//
// The goal is not to be "smart" — the goal is to be a repeatable strong
// baseline that an LLM agent has to BEAT to justify its cost.

import { TRAINING_AREAS, GEAR_SHOP } from '../../engine/data.js';
import {
  computeEffectiveStats, getSpendableXp,
} from '../../engine/helpers.js';

// RuleModifications: Harness removed; these three gate Lead Climbing only.
const ACCESS_ORDER = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
const STATS = ['strength', 'technique', 'focus', 'flexibility'];

export function createHeuristicAgent() {
  return {
    name: 'heuristic',
    async chooseAction({ state, legalActions }) {
      const player = state.players[state.currentPlayerIndex];
      const char = player.character;
      const attempted = state.attemptedRoutes[player.playerNum] || {};

      // --- 1. Milestone we can likely beat ---
      const milestones = legalActions
        .map((a, i) => ({ a, i }))
        .filter(x => x.a.type === 'milestone');
      // Prefer the HARDEST milestone we can beat (expert > intermediate > beginner)
      // because it gets us closer to victory AND a hard-milestone win tends to
      // correlate with creative play (which the pipeline rewards).
      const tierOrder = { expert: 3, intermediate: 2, beginner: 1 };
      milestones.sort((a, b) => tierOrder[b.a.difficulty] - tierOrder[a.a.difficulty]);
      for (const { a, i } of milestones) {
        const route = state.milestoneRoutes[a.difficulty].route;
        const stats = computeEffectiveStats(char, route, a.area, attempted);
        if (passesBaseCheck(stats, route)) {
          return { actionIndex: i, rationale: `milestone ${a.difficulty} (${a.routeName}): base stats clear` };
        }
      }

      // --- 2. Essential access cards in canonical order ---
      for (const name of ACCESS_ORDER) {
        const buy = findActionIndex(legalActions, a =>
          a.type === 'buyGear' && a.gearName === name);
        if (buy !== -1 && !char.equipment.includes(name)) {
          return { actionIndex: buy, rationale: `buying access card ${name}` };
        }
      }

      // --- 3. v0.3.0 SPECIALTY card matching one of our milestones ---
      // For each legal buyGear action, check if the gear has an `effectKind`
      // and a `tagFilter` that matches one of our (uncompleted) milestone tags.
      // If yes AND we don't own it, buy it. Spend the XP — specialty gear is
      // permanent and often turns a hopeless milestone into a winnable one.
      const milestoneTagsNeeded = new Set();
      for (const tier of ['beginner', 'intermediate', 'expert']) {
        if (char.milestonesCompleted[tier]) continue;
        const m = state.milestoneRoutes[tier];
        if (m && m.route && m.route.tag) milestoneTagsNeeded.add(m.route.tag);
      }
      for (let i = 0; i < legalActions.length; i++) {
        const a = legalActions[i];
        if (a.type !== 'buyGear') continue;
        const gear = GEAR_SHOP.find(g => g.name === a.gearName);
        if (!gear || !gear.tagFilter) continue;
        if (!milestoneTagsNeeded.has(gear.tagFilter)) continue;
        if (char.equipment.includes(gear.name)) continue;
        return {
          actionIndex: i,
          rationale: `specialty buy: ${gear.name} (targets ${gear.tagFilter}, matches a milestone tag)`,
        };
      }

      // --- 4. v0.3.0 high-value general gear ---
      // (a) Approach Shoes early — cheap +1 time per round, pays back fast.
      const approachBuy = findActionIndex(legalActions, a =>
        a.type === 'buyGear' && a.gearName === 'Approach Shoes');
      if (approachBuy !== -1 && !char.equipment.includes('Approach Shoes')) {
        return { actionIndex: approachBuy, rationale: 'buying Approach Shoes (+1 time/round, cheap)' };
      }
      // (b) Climbing Coach mid-to-late game — milestone dice +1 is the most
      //     valuable single boost on the routes that win the game.
      if (getSpendableXp(char) >= 180 && char.level >= 3) {
        const coachBuy = findActionIndex(legalActions, a =>
          a.type === 'buyGear' && a.gearName === 'Climbing Coach');
        if (coachBuy !== -1 && !char.equipment.includes('Climbing Coach')) {
          return { actionIndex: coachBuy, rationale: 'buying Climbing Coach (+1 to all milestone dice)' };
        }
      }
      // (c) Mountain Mentor late game — universal nerf-die negation.
      if (getSpendableXp(char) >= 200 && char.level >= 4) {
        const mentorBuy = findActionIndex(legalActions, a =>
          a.type === 'buyGear' && a.gearName === 'Mountain Mentor');
        if (mentorBuy !== -1 && !char.equipment.includes('Mountain Mentor')) {
          return { actionIndex: mentorBuy, rationale: 'buying Mountain Mentor (negates one nerf die per climb)' };
        }
      }
      // (d) Character-fix: Mental Anchor for Iron Lung specifically.
      if (char.key === 'ironLung') {
        const anchorBuy = findActionIndex(legalActions, a =>
          a.type === 'buyGear' && a.gearName === 'Mental Anchor');
        if (anchorBuy !== -1 && !char.equipment.includes('Mental Anchor')) {
          return { actionIndex: anchorBuy, rationale: 'Iron Lung fix: Mental Anchor cancels fail-endurance penalty' };
        }
      }

      // --- 3. Best-expected-XP climb we're likely to pass ---
      const climbActions = legalActions
        .map((a, i) => ({ a, i }))
        .filter(x => x.a.type === 'climb');
      let bestClimb = null;
      let bestScore = -Infinity;
      for (const { a, i } of climbActions) {
        const route = state.availableRoutes[a.area].find(r => r.name === a.routeName);
        const stats = computeEffectiveStats(char, route, a.area, attempted);
        const likely = passesBaseCheck(stats, route);
        // Expected-XP-style score: success XP if likely, half-fail XP if risky.
        const score = likely ? route.xpSuccess : route.xpFail * 0.5;
        if (score > bestScore) { bestScore = score; bestClimb = { a, i, likely, route }; }
      }
      if (bestClimb && bestClimb.likely) {
        return {
          actionIndex: bestClimb.i,
          rationale: `best-likely climb ${bestClimb.a.routeName} (+${bestClimb.route.xpSuccess} XP)`,
        };
      }

      // --- 4. Rest if endurance < 30% ---
      if (char.currentEndurance < char.maxEndurance * 0.3) {
        const rest = findActionIndex(legalActions, a => a.type === 'rest');
        if (rest !== -1) {
          const pct = Math.round((char.currentEndurance / char.maxEndurance) * 100);
          return { actionIndex: rest, rationale: `resting (endurance at ${pct}% of max)` };
        }
      }

      // (Old v0.1.x stat-trainer step removed — those items don't exist in v0.3.0.
      //  v0.3.0 substitutes are handled in step 4 above: Climbing Coach, Mountain
      //  Mentor, and the specialty cards in step 3.)

      // --- 6. Train the weakest stat ---
      // (Empirically: training across the first round or two before
      // attempting climbs produces better win rates than "climb anything
      // immediately." Tested in smoke runs, 2026-04-21.)
      const trainActions = legalActions
        .map((a, i) => ({ a, i }))
        .filter(x => x.a.type === 'train');
      if (trainActions.length) {
        const weakest = weakestStat(char);
        const match = trainActions.find(x => {
          const area = TRAINING_AREAS.find(t => t.name === x.a.areaName);
          return area && area.stat === weakest;
        }) || trainActions[0];
        return {
          actionIndex: match.i,
          rationale: `training ${match.a.areaName} (weakest stat: ${weakest})`,
        };
      }

      // --- 7. Risky climb (no safe option AND no training left) ---
      if (bestClimb) {
        return {
          actionIndex: bestClimb.i,
          rationale: `risky-but-best climb ${bestClimb.a.routeName} (no safe option)`,
        };
      }

      // --- 8. End turn ---
      const end = findActionIndex(legalActions, a => a.type === 'endTurn');
      return { actionIndex: end, rationale: 'no productive action; passing' };
    },
  };
}

// --- Helpers ---

function passesBaseCheck(stats, route) {
  return (
    stats.strength    >= route.strength    &&
    stats.technique   >= route.technique   &&
    stats.focus       >= route.focus       &&
    stats.flexibility >= route.flexibility
  );
}

function weakestStat(char) {
  // "Weakest" relative to a hypothetical level-15 ceiling for this character;
  // simpler to just compare raw stats — they're on comparable scales.
  let minStat = STATS[0];
  let minVal = Infinity;
  for (const s of STATS) {
    const v = char.stats[s] + char.trainingBonuses[s] + char.gearBonuses[s];
    if (v < minVal) { minVal = v; minStat = s; }
  }
  return minStat;
}

function findActionIndex(list, pred) {
  for (let i = 0; i < list.length; i++) if (pred(list[i])) return i;
  return -1;
}
