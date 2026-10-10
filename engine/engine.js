// Engine public API.
//
// This is the surface that everything else (UI adapter, agents, simulation
// orchestrator, tests) talks to. It exposes three functions:
//
//   getLegalActions(state) → Action[]
//     Enumerate every action the current player may legally take right
//     now. Agents pick ONE item from this list each turn. The menu is
//     what makes the action space tractable — an LLM never has to
//     fabricate action syntax, it just selects an index.
//
//   applyAction(state, action) → { state, events }
//     Apply an action to a state, producing a new state and the delta of
//     events that were emitted during this action. Pure in the sense that
//     the input `state` is NOT mutated — the caller gets back a fresh
//     object it can safely hold on to or serialize.
//
//   isTerminal(state) → { done, winner, reason }
//     Has the game ended? Used by the orchestrator to stop calling
//     applyAction. `winner` is a playerNum or null (null = draw/timeout).
//
// Design notes:
//   - Determinism: applyAction stores rng state on `state.rngState` after
//     every call and restores it at the start of the next call. Same
//     (state, action) → same (nextState, events), byte-identical.
//   - Event log: every applyAction appends to state.events AND returns the
//     delta. Pipeline writers only need the delta; the UI uses the full
//     log to render history.
//   - No round cap (v0.5.0): the actual game has no maxRounds rule;
//     the engine no longer imposes one. Sim harnesses keep their own
//     MAX_STEPS counter to catch runaway agent loops (a programming bug,
//     not a gameplay condition).

import {
  GEAR_SHOP, TRAINING_AREAS,
} from './data.js';
import { createRng } from './rng.js';
import { makeEmitter } from './telemetry.js';
import { ACCESS_CARDS, drawTopRopeStations, regularRoutePool } from './state.js';
import {
  checkAreaAccess, canEnterSection, computeEffectiveStats,
  canClimbTopRopeRoute, pickFreeBelayerStation,
  getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost,
  getGearPurchaseTimeCost, getEffectiveGearCost,
  getSpendableXp, buildEffectRollArray, rollClimbDice,
  applyDiceToRequirements, resolveClimbOutcome, computeClimbXp,
  getFailureEnduranceExtra, getSuccessEnduranceHeal, applySuccessHeal, getTrainingBonusBoost,
  describeClimbGearEffects,
  freeSoloCanAttempt, applyBetaBoostIfActive,
  computeRestRecovery, applyLevelUpIfNeeded,
  bestRouteReaderShift, canUseStatShift, isWellFormedStatShift, applyStatShiftToStats, MAX_STAT_SHIFT,
} from './helpers.js';

// =============================================================================
// getLegalActions — enumerate the current player's menu
// =============================================================================

export function getLegalActions(state) {
  if (state.gameEnded) return [];
  const player = state.players[state.currentPlayerIndex];
  const char = player.character;
  const actions = [];

  // End-turn is always legal — an agent can always choose to pass.
  actions.push({ type: 'endTurn' });

  // Rest: 1 time unit, no endurance cost.
  if (char.timeRemaining >= 1) {
    actions.push({ type: 'rest' });
  }

  // Training: one per station, capacity 1 per round, costs time + endurance.
  for (const area of TRAINING_AREAS) {
    if (char.timeRemaining < area.time) continue;
    if (char.currentEndurance < area.endurance) continue;
    const cap = canEnterSection(area.name, player.playerNum, state);
    if (!cap.canEnter) continue;
    actions.push({ type: 'train', areaName: area.name });
  }

  // Climbs: every available route in every reachable area, excluding those
  // the player already attempted this round.
  for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
    const access = checkAreaAccess(char, area);
    if (!access.hasAccess) continue;
    // Top Rope occupancy is gated PER belayer station (see below). Bouldering
    // and Lead use the section-capacity gate (Lead = 1 climber; Bouldering
    // unlimited).
    if (area !== 'topRope') {
      const sec = canEnterSection(area, player.playerNum, state);
      if (!sec.canEnter) continue;
    }
    for (const route of state.availableRoutes[area]) {
      const routeKey = `${area}:${route.name}`;
      if (state.attemptedRoutes[player.playerNum][routeKey]) continue;
      // Top Rope: the route's belayer station must be free for this player
      // (a station held by another player blocks both of its routes).
      if (area === 'topRope' && !canClimbTopRopeRoute(state, player.playerNum, route)) continue;
      const timeCost = getEffectiveClimbTimeCost(char, route.time, route);
      const enduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance);
      if (char.timeRemaining < timeCost) continue;
      if (char.currentEndurance < enduranceCost) continue;
      // Free Solo "Life or Die" — must meet all base requirements.
      if (!freeSoloCanAttempt(char, route)) continue;
      actions.push({ type: 'climb', area, routeName: route.name });
      // Route Reader "Versatility": also offer this climb with the most useful
      // once-per-round stat shift, when one helps. (applyAction accepts any
      // valid shift on a legal climb; this variant is the menu's suggestion.)
      if (canUseStatShift(char, false)) {
        const shift = bestRouteReaderShift(char, route, area, state.attemptedRoutes[player.playerNum]);
        if (shift) actions.push({ type: 'climb', area, routeName: route.name, shift });
      }
    }
  }

  // Milestone attempts: one per uncompleted milestone, no per-round cap on
  // attempts (the spec explicitly notes unlimited milestone attempts).
  for (const difficulty of ['beginner', 'intermediate', 'expert']) {
    if (char.milestonesCompleted[difficulty]) continue;
    const m = state.milestoneRoutes[difficulty];
    if (!m) continue;
    const access = checkAreaAccess(char, m.area);
    if (!access.hasAccess) continue;
    // Top Rope milestone still needs a belayer: require a free station (or the
    // one this player already occupies). Other areas use section capacity.
    if (m.area === 'topRope') {
      if (pickFreeBelayerStation(state, player.playerNum) === null) continue;
    } else {
      const sec = canEnterSection(m.area, player.playerNum, state);
      if (!sec.canEnter) continue;
    }
    const timeCost = getEffectiveClimbTimeCost(char, m.route.time, m.route);
    const enduranceCost = getEffectiveClimbEnduranceCost(char, m.route, m.route.endurance);
    if (char.timeRemaining < timeCost) continue;
    if (char.currentEndurance < enduranceCost) continue;
    if (!freeSoloCanAttempt(char, m.route)) continue;
    actions.push({ type: 'milestone', difficulty, area: m.area, routeName: m.route.name });
  }

  // Gear purchases: rotation slots + always-available access cards.
  // Prerequisites, level gate, spendable XP, time cost all checked here so
  // agents never see a "legal" action that the handler would reject.
  const gearTime = getGearPurchaseTimeCost(char);
  if (char.timeRemaining >= gearTime) {
    const spendable = getSpendableXp(char);
    const owned = new Set(char.equipment);
    const buyable = [
      ...state.availableGear,
      ...GEAR_SHOP.filter(g => ACCESS_CARDS.includes(g.name)),
    ];
    for (const gear of buyable) {
      if (owned.has(gear.name)) continue;
      const cost = getEffectiveGearCost(char, gear);
      if (spendable < cost) continue;
      if (char.level < (gear.prerequisiteLevel || 1)) continue;
      if (gear.prerequisiteItems && gear.prerequisiteItems.length > 0) {
        if (!gear.prerequisiteItems.every(p => owned.has(p))) continue;
      }
      actions.push({ type: 'buyGear', gearName: gear.name });
    }
  }

  return actions;
}

// =============================================================================
// findLegalAction / explainIllegalAction — for UIs
// =============================================================================

// The entry of `legalActions` that `wanted` asks for, or null. `wanted` is a
// partial action ({ type: 'climb', area, routeName }, { type: 'buyGear',
// gearName }, ...): every field it names must match. A Route Reader `shift`
// is not part of the match — callers attach the player's chosen shift to the
// plain climb, and applyAction validates it. Shared by local play and the
// online client so both resolve a click to the same action.
export function findLegalAction(legalActions, wanted) {
  const fields = { ...(wanted || {}) };
  delete fields.shift;
  return legalActions.find(a => {
    if (a.shift) return false;
    return Object.entries(fields).every(([k, v]) => a[k] === v);
  }) || null;
}

const AREA_LABELS = { bouldering: 'Bouldering', topRope: 'Top Rope', leadClimbing: 'Lead Climbing' };

// Why `wanted` (a partial action, as for findLegalAction) is not legal for the
// current player right now, as a short player-facing sentence, or null if it
// is legal. getLegalActions alone decides legality; this only explains a
// refusal, re-checking the same conditions in the same order.
export function explainIllegalAction(state, wanted) {
  if (state.gameEnded) return 'The game has ended.';
  const legal = getLegalActions(state);
  const match = findLegalAction(legal, wanted);
  const player = state.players[state.currentPlayerIndex];
  const char = player.character;
  if (match) {
    if (wanted.shift && (match.type !== 'climb' || !canUseStatShift(char, false))) {
      return 'Versatility can be used once per round, by the Route Reader, on a regular route.';
    }
    if (wanted.shift && !isWellFormedStatShift(wanted.shift)) {
      return `A stat shift moves 1 to ${MAX_STAT_SHIFT} points between two different stats.`;
    }
    return null;
  }
  const notEnough = (what, need, have) => `Not enough ${what}: this costs ${need} and you have ${have}.`;
  const lifeOrDie = 'Life or Die: Free Solo can only attempt routes whose base requirements your stats already meet.';
  const areaGate = (area) => {
    const access = checkAreaAccess(char, area);
    if (!access.hasAccess) return `You need ${access.missingItems.join(', ')} to climb ${AREA_LABELS[area] || area}.`;
    return null;
  };
  const costGate = (route) => {
    const t = getEffectiveClimbTimeCost(char, route.time, route);
    const e = getEffectiveClimbEnduranceCost(char, route, route.endurance);
    if (char.timeRemaining < t) return notEnough('time', t, char.timeRemaining);
    if (char.currentEndurance < e) return notEnough('endurance', e, char.currentEndurance);
    return null;
  };

  switch (wanted.type) {
    case 'climb': {
      const route = (state.availableRoutes[wanted.area] || []).find(r => r.name === wanted.routeName);
      if (!route) return 'That route is not on the wall right now.';
      const gate = areaGate(wanted.area);
      if (gate) return gate;
      if (wanted.area === 'topRope') {
        if (!canClimbTopRopeRoute(state, player.playerNum, route)) {
          return `Belayer ${route.belayer + 1} is in use by another climber. Pick a route at a free belayer or wait for the wall to clear.`;
        }
      } else {
        const sec = canEnterSection(wanted.area, player.playerNum, state);
        if (!sec.canEnter) return `You can't climb here right now: ${sec.reason}.`;
      }
      if (state.attemptedRoutes[player.playerNum]?.[`${wanted.area}:${route.name}`]) {
        return 'You have already attempted this route this round. Try it again next round.';
      }
      return costGate(route) || (!freeSoloCanAttempt(char, route) ? lifeOrDie : null) || 'That climb is not available right now.';
    }
    case 'milestone': {
      const m = state.milestoneRoutes[wanted.difficulty];
      if (!m) return 'There is no milestone route at that tier.';
      if (char.milestonesCompleted[wanted.difficulty]) return `You have already completed the ${wanted.difficulty} milestone.`;
      const gate = areaGate(m.area);
      if (gate) return gate;
      if (m.area === 'topRope') {
        if (pickFreeBelayerStation(state, player.playerNum) === null) return 'Every belayer is in use right now. Wait for one to free up.';
      } else {
        const sec = canEnterSection(m.area, player.playerNum, state);
        if (!sec.canEnter) return `You can't climb here right now: ${sec.reason}.`;
      }
      return costGate(m.route) || (!freeSoloCanAttempt(char, m.route) ? lifeOrDie : null) || 'That milestone is not available right now.';
    }
    case 'train': {
      const area = TRAINING_AREAS.find(a => a.name === wanted.areaName);
      if (!area) return 'There is no such training station.';
      if (char.timeRemaining < area.time) return notEnough('time', area.time, char.timeRemaining);
      if (char.currentEndurance < area.endurance) return notEnough('endurance', area.endurance, char.currentEndurance);
      const sec = canEnterSection(area.name, player.playerNum, state);
      if (!sec.canEnter) return `You can't train here right now: ${sec.reason}.`;
      return 'That training station is not available right now.';
    }
    case 'rest':
      return 'Not enough time to rest.';
    case 'buyGear': {
      const gear = GEAR_SHOP.find(g => g.name === wanted.gearName);
      if (!gear) return 'There is no such gear.';
      if (char.equipment.includes(gear.name)) return `You already own ${gear.name}.`;
      const inShop = state.availableGear.some(g => g.name === gear.name) || ACCESS_CARDS.includes(gear.name);
      if (!inShop) return `${gear.name} is not in the shop right now.`;
      const timeCost = getGearPurchaseTimeCost(char);
      if (char.timeRemaining < timeCost) return notEnough('time', timeCost, char.timeRemaining);
      const cost = getEffectiveGearCost(char, gear);
      const spendable = getSpendableXp(char);
      if (spendable < cost) return `Not enough spendable XP: ${gear.name} costs ${cost} and you have ${spendable} XP earned this level.`;
      if (char.level < (gear.prerequisiteLevel || 1)) return `${gear.name} requires Level ${gear.prerequisiteLevel}.`;
      const missing = (gear.prerequisiteItems || []).filter(n => !char.equipment.includes(n));
      if (missing.length) return `${gear.name} requires ${missing.join(', ')} first.`;
      return `${gear.name} can't be bought right now.`;
    }
    case 'endTurn':
      return 'You cannot end your turn right now.';
    default:
      return `Unknown action "${wanted.type}".`;
  }
}

// =============================================================================
// applyAction — the dispatcher
// =============================================================================

export function applyAction(state, action) {
  if (state.gameEnded) {
    throw new Error('cannot apply action: game has ended');
  }
  if (!action || typeof action.type !== 'string') {
    throw new Error('action must be an object with a string `type` field');
  }

  // Clone so the caller's `state` is not mutated. structuredClone handles
  // the nested player/route/events objects cleanly.
  const s = structuredClone(state);

  // Re-hydrate the RNG from the state's saved seed-plus-offset.
  const rng = createRng(s.rngState);

  // Continue the event sequence number where the previous action left off.
  const emitter = makeEmitter(s.events.length);

  const player = s.players[s.currentPlayerIndex];

  // Every action starts by emitting what the agent chose. If `action`
  // includes a `rationale` field (string), we record it — this is the
  // agent's free-form explanation and becomes gold for qualitative review.
  emitter.emit('action_chosen', {
    playerNum: player.playerNum,
    round: s.round,
    action: {
      type: action.type,
      ...pickPublicActionFields(action),
    },
    rationale: typeof action.rationale === 'string' ? action.rationale : undefined,
    legalActionCount: undefined, // filled in by caller if known (the orchestrator adds it)
  });

  // Dispatch. Each handler mutates `s` and emits events; they share the
  // same rng, so random draws interleave deterministically.
  switch (action.type) {
    case 'climb':      handleClimb(s, rng, action, emitter); break;
    case 'milestone':  handleMilestone(s, rng, action, emitter); break;
    case 'train':      handleTrain(s, rng, action, emitter); break;
    case 'rest':       handleRest(s, rng, action, emitter); break;
    case 'buyGear':    handleBuyGear(s, rng, action, emitter); break;
    case 'endTurn':    handleEndTurn(s, rng, action, emitter); break;
    default:
      throw new Error(`unknown action type: ${action.type}`);
  }

  // Post-action housekeeping: level-up detection, resource snapshot,
  // victory check, turn/round advance.
  postActionHousekeeping(s, rng, emitter);

  // Save rng state for the next applyAction.
  s.rngState = rng.getState();

  // Fold the delta into the running log on state.
  for (const e of emitter.events) s.events.push(e);

  return { state: s, events: emitter.events };
}

// Safe subset of action fields to record in the action_chosen event.
// Strips things like `rationale` (emitted separately) and avoids echoing
// unknown fields the agent might have added.
function pickPublicActionFields(action) {
  const out = {};
  for (const k of ['area', 'routeName', 'areaName', 'difficulty', 'gearName']) {
    if (action[k] !== undefined) out[k] = action[k];
  }
  if (isWellFormedStatShift(action.shift)) {
    out.shift = { from: action.shift.from, to: action.shift.to, amount: action.shift.amount };
  }
  return out;
}

// =============================================================================
// isTerminal — has the game ended?
// =============================================================================

export function isTerminal(state) {
  if (state.gameEnded) {
    return {
      done: true,
      winner: state.winner,
      // state.endReason is set by postActionHousekeeping at the moment the
      // game ended. If for some reason it's missing, fall back to the
      // winner-based inference.
      reason: state.endReason || (state.winner ? 'all_milestones' : 'forfeit'),
    };
  }
  // v0.5.0: no maxRounds safety cap. The game has no round limit in the
  // actual rules — the only terminal condition is "someone completes all 3
  // milestones." Sim harnesses keep their own MAX_STEPS guard against
  // runaway loops, but that's a programming bug netting, not gameplay.
  return { done: false, winner: null, reason: null };
}

// =============================================================================
// ACTION HANDLERS
// =============================================================================

// CLIMB — shared implementation used by both regular climbs and milestone
// attempts. `isMilestone` flips the post-success milestone-completion
// branch on.
function resolveClimbShared(s, rng, emitter, route, area, isMilestone, difficulty, shift = null) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;

  // Validate a Route Reader stat shift before anything is paid.
  if (shift) {
    if (!isWellFormedStatShift(shift)) throw new Error(`climb: malformed stat shift ${JSON.stringify(shift)}`);
    if (!canUseStatShift(char, isMilestone)) {
      throw new Error('climb: stat shift is only for a Route Reader, once per round, on a regular route');
    }
  }

  // 1. Move the player into the section. For Top Rope, occupy the belayer
  //    station this climb belongs to (route.belayer for a regular climb; a
  //    free station for a milestone, which carries no station tag). Any other
  //    area clears the belayer-station assignment.
  char.location = area;
  if (area === 'topRope') {
    char.belayerStation = (route.belayer === null || route.belayer === undefined)
      ? pickFreeBelayerStation(s, player.playerNum)
      : route.belayer;
  } else {
    char.belayerStation = null;
  }

  // 2. Mark the route as attempted this round (only for regular climbs —
  // milestones have no per-round attempt cap per game.js).
  if (!isMilestone) {
    state_attemptedRoutesMark(s, player.playerNum, area, route.name);
  }

  // 3. Deduct time (character + gear modified).
  const timeCost = getEffectiveClimbTimeCost(char, route.time, route);
  const timeBefore = char.timeRemaining;
  char.timeRemaining -= timeCost;

  // 4. Deduct endurance — base cost may be reduced by gear (Body Tension Belt).
  // Iron Lung's failure penalty is added later, after success/fail is known.
  const enduranceBefore = char.currentEndurance;
  const baseEnduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance);
  char.currentEndurance -= baseEnduranceCost;

  // 5. Effective stats (base + training + gear + per-route gear).
  const baseStats = computeEffectiveStats(char, route, area, s.attemptedRoutes[player.playerNum]);

  // 6. Consume Route Reader Beta Boost if active. Single emit captures the fact.
  const { stats: boostedStats, consumed: betaConsumed } = applyBetaBoostIfActive(char, baseStats);
  if (betaConsumed) {
    emitter.emit('ability_activated', {
      playerNum: player.playerNum,
      character: char.key,
      ability: 'Beta Boost',
      effect: '+3 all stats for this climb',
    });
  }

  // 6b. Route Reader stat shift (validated above): this climb only, once per round.
  let effectiveStats = boostedStats;
  if (shift) {
    effectiveStats = applyStatShiftToStats(boostedStats, shift);
    char.abilityUsed = true;
    emitter.emit('ability_activated', {
      playerNum: player.playerNum,
      character: char.key,
      ability: 'Versatility',
      effect: `moved ${shift.amount} ${shift.from} → ${shift.to} for this climb`,
    });
  }

  // 7. Build and roll dice (Sprinter gets +1 nerf die; v0.3.0 gear may
  //    re-roll, add an extra die, replace dice, or shift dice on milestones).
  const effectArray = buildEffectRollArray(char, route);
  const diceTrace = [];
  const dice = rollClimbDice(rng, effectArray, char, route, isMilestone, diceTrace);
  const { requirements, appliedModifiers } = applyDiceToRequirements(char, route, effectArray, dice);

  emitter.emit('dice_rolled', {
    playerNum: player.playerNum,
    dice,
    // Dice rolled but not kept (Power Tap Belt's discard), for display.
    discardedDice: diceTrace.filter(t => t.effectKind === 'extraDieDiscardOne').map(t => t.from),
    modifiers: appliedModifiers,
    modifiedRequirements: { ...requirements },
    baseRequirements: {
      strength: route.strength, technique: route.technique, focus: route.focus, flexibility: route.flexibility,
    },
  });

  // 8. Resolve outcome.
  const outcome = resolveClimbOutcome(char, effectiveStats, requirements);
  const xpGained = computeClimbXp(char, route, outcome.success);
  char.xp += xpGained;

  // 9. Iron Lung failure penalty (Mental Anchor gear bypasses).
  let failPenalty = 0;
  if (!outcome.success) {
    failPenalty = getFailureEnduranceExtra(char);
    char.currentEndurance -= failPenalty;
  }
  // 9b. Power Spotting: successful climbs heal endurance, up to maxEndurance.
  let healed = 0;
  if (outcome.success) {
    const beforeHeal = char.currentEndurance;
    char.currentEndurance = applySuccessHeal(char.currentEndurance, char.maxEndurance, getSuccessEnduranceHeal(char));
    healed = char.currentEndurance - beforeHeal;
  }
  // Floor endurance at 0. Going negative is nonsensical for downstream checks.
  if (char.currentEndurance < 0) char.currentEndurance = 0;

  emitter.emit('climb_resolved', {
    playerNum: player.playerNum,
    area, routeName: route.name, grade: route.grade,
    isMilestone, difficulty: isMilestone ? difficulty : undefined,
    success: outcome.success,
    perStatPass: outcome.perStatPass,
    passCount: outcome.passCount,
    requirements,
    effectiveStats,
    xpGained,
    timeCost,
    enduranceCost: baseEnduranceCost + failPenalty,
    failPenalty,
    // Every gear effect that changed this climb (see describeClimbGearEffects).
    gearEffects: describeClimbGearEffects({
      char, route, effectRollArray: effectArray, diceTrace, appliedModifiers,
      success: outcome.success, timeCost, enduranceCost: baseEnduranceCost, healed,
    }),
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -timeCost },
      endurance: { before: enduranceBefore, after: char.currentEndurance, delta: char.currentEndurance - enduranceBefore },
      xp: { delta: xpGained, afterTotal: char.xp },
    },
  });

  // 10. Milestone-specific: mark completion and emit progress.
  if (isMilestone && outcome.success) {
    char.milestonesCompleted[difficulty] = true;
    const totalDone =
      (char.milestonesCompleted.beginner ? 1 : 0) +
      (char.milestonesCompleted.intermediate ? 1 : 0) +
      (char.milestonesCompleted.expert ? 1 : 0);
    emitter.emit('milestone_progress', {
      playerNum: player.playerNum,
      tier: difficulty,
      completed: true,
      totalCompleted: totalDone,
    });
  }
}

// Mark a route as attempted in state.attemptedRoutes (JSON-safe plain object form).
function state_attemptedRoutesMark(s, playerNum, area, routeName) {
  if (!s.attemptedRoutes[playerNum]) s.attemptedRoutes[playerNum] = {};
  s.attemptedRoutes[playerNum][`${area}:${routeName}`] = true;
}

function handleClimb(s, rng, action, emitter) {
  const { area, routeName } = action;
  const route = (s.availableRoutes[area] || []).find(r => r.name === routeName);
  if (!route) throw new Error(`climb: no route "${routeName}" available in ${area}`);
  resolveClimbShared(s, rng, emitter, route, area, /*isMilestone*/ false, null, action.shift || null);
}

function handleMilestone(s, rng, action, emitter) {
  const { difficulty } = action;
  const m = s.milestoneRoutes[difficulty];
  if (!m) throw new Error(`milestone: no milestone at tier "${difficulty}"`);
  // Passing action.shift lets resolveClimbShared reject it: no shifts on milestones.
  resolveClimbShared(s, rng, emitter, m.route, m.area, /*isMilestone*/ true, difficulty, action.shift || null);
}

function handleTrain(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;
  const area = TRAINING_AREAS.find(a => a.name === action.areaName);
  if (!area) throw new Error(`train: no training area "${action.areaName}"`);

  const timeBefore = char.timeRemaining;
  const eBefore = char.currentEndurance;

  char.location = area.name;
  char.timeRemaining -= area.time;
  char.currentEndurance -= area.endurance;
  // Old Climbing Journal (gear) boosts every training session by +N.
  const trainingBonus = area.bonus + getTrainingBonusBoost(char);
  char.trainingBonuses[area.stat] += trainingBonus;

  emitter.emit('train_action', {
    playerNum: player.playerNum,
    areaName: area.name,
    stat: area.stat,
    bonus: trainingBonus,
    totalTrainingBonusAfter: { ...char.trainingBonuses },
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -area.time },
      endurance: { before: eBefore, after: char.currentEndurance, delta: -area.endurance },
    },
  });
}

function handleRest(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;

  const timeBefore = char.timeRemaining;
  const eBefore = char.currentEndurance;

  char.location = 'rest';
  char.timeRemaining -= 1;
  const { newEndurance, delta, restBonusApplied } = computeRestRecovery(char);
  char.currentEndurance = newEndurance;

  // Route Reader's "Versatility" activates Beta Boost on rest. Other
  // characters ignore this flag.
  let betaActivated = false;
  if (char.key === 'routeReader') {
    char.betaBoostActive = true;
    betaActivated = true;
  }

  emitter.emit('rest_action', {
    playerNum: player.playerNum,
    enduranceRecovered: delta,
    restBonusApplied,
    newEndurance,
    betaBoostActivated: betaActivated,
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -1 },
      endurance: { before: eBefore, after: char.currentEndurance, delta },
    },
  });
}

function handleBuyGear(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;
  const gear = GEAR_SHOP.find(g => g.name === action.gearName);
  if (!gear) throw new Error(`buyGear: no gear "${action.gearName}"`);

  const effectiveCost = getEffectiveGearCost(char, gear);
  const timeCost = getGearPurchaseTimeCost(char);
  const xpBefore = char.xp;
  const timeBefore = char.timeRemaining;

  char.location = 'gearShop';
  char.timeRemaining -= timeCost;
  char.xp -= effectiveCost;
  char.equipment.push(gear.name);

  // Permanent stat & endurance effects from the purchased item.
  // Matches game.js:2299-2391 branch-by-branch.
  const gearApplied = {};
  if (gear.statEffect === 'endurance') {
    char.maxEndurance += gear.value;
    gearApplied.maxEndurance = gear.value;
  }
  if (typeof gear.enduranceBonus === 'number') {
    char.maxEndurance += gear.enduranceBonus;
    gearApplied.maxEnduranceBonus = gear.enduranceBonus;
  }
  // Positive-value stat trainers (Grip Strength Trainer, Meditation App, …)
  // contribute permanent gearBonuses additions.
  if (gear.value > 0 && ['strength', 'technique', 'focus', 'flexibility'].includes(gear.statEffect)) {
    char.gearBonuses[gear.statEffect] += gear.value;
    gearApplied[gear.statEffect] = gear.value;
  }
  if (gear.statEffect === 'strengthTech') {
    char.gearBonuses.strength += 2;
    char.gearBonuses.technique += 2;
    gearApplied.strength = 2; gearApplied.technique = 2;
  }
  if (gear.statEffect === 'strengthTechMixed') {
    char.gearBonuses.strength += 3;
    char.gearBonuses.technique -= 1;
    gearApplied.strength = 3; gearApplied.technique = -1;
  }

  // Replace purchased item in the shop rotation (access cards stay).
  if (!ACCESS_CARDS.includes(gear.name)) {
    replaceGearInRotation(s, rng, gear.name);
  }

  emitter.emit('gear_purchased', {
    playerNum: player.playerNum,
    gearName: gear.name,
    cost: effectiveCost,
    nominalCost: gear.cost,
    timeCost,
    gearApplied,
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -timeCost },
      xp: { before: xpBefore, after: char.xp, delta: -effectiveCost },
    },
  });
}

// Remove purchased gear from the 3-slot rotation and draw a replacement
// from the pool of items not currently owned by any player, not in the
// rotation, and not an access card. Mirrors game.js:808-846.
function replaceGearInRotation(s, rng, purchasedName) {
  const idx = s.availableGear.findIndex(g => g.name === purchasedName);
  if (idx === -1) return;

  const ownedByAny = new Set();
  for (const p of s.players) for (const n of p.character.equipment) ownedByAny.add(n);

  const unavailable = new Set([
    ...s.availableGear.map(g => g.name),
    ...ownedByAny,
    ...ACCESS_CARDS,
  ]);
  const pool = GEAR_SHOP.filter(g => !unavailable.has(g.name));

  if (pool.length === 0) {
    s.availableGear.splice(idx, 1);
  } else {
    s.availableGear[idx] = rng.pick(pool);
  }
}

function handleEndTurn(s, rng, action, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;
  // Zero out time so the housekeeping step will pass the turn.
  const surrendered = char.timeRemaining;
  char.timeRemaining = 0;
  emitter.emit('end_turn_chosen', {
    playerNum: player.playerNum,
    timeSurrendered: surrendered,
  });
}

// =============================================================================
// POST-ACTION HOUSEKEEPING
// =============================================================================

function postActionHousekeeping(s, rng, emitter) {
  const player = s.players[s.currentPlayerIndex];
  const char = player.character;

  // 1. Level-up: trigger repeatedly in case a big XP reward crossed
  // multiple thresholds (unlikely given 100+ XP per level, but cheap to guard).
  while (true) {
    const lvl = applyLevelUpIfNeeded(char);
    if (!lvl.leveledUp) break;
    emitter.emit('level_up', {
      playerNum: player.playerNum,
      newLevel: lvl.newLevel,
      oldStats: lvl.oldStats,
      newStats: lvl.newStats,
      oldMaxEndurance: lvl.oldMaxEndurance,
      newMaxEndurance: lvl.newMaxEndurance,
    });
  }

  // 2. Periodic resource snapshot. Analyzers use this to plot XP/endurance/time
  // curves without having to reconstruct state by replaying all events.
  emitter.emit('resource_update', {
    playerNum: player.playerNum,
    timeRemaining: char.timeRemaining,
    currentEndurance: char.currentEndurance,
    maxEndurance: char.maxEndurance,
    xp: char.xp,
    level: char.level,
    spendableXp: getSpendableXp(char),
  });

  // 3. Victory check. If this player just completed all 3 milestones, the
  // game ends NOW — no further turn/round advance.
  const mc = char.milestonesCompleted;
  if (mc.beginner && mc.intermediate && mc.expert) {
    s.gameEnded = true;
    s.winner = player.playerNum;
    s.endReason = 'all_milestones';
    emitter.emit('game_end', {
      winner: player.playerNum,
      characterKey: char.key,
      reason: 'all_milestones',
      round: s.round,
    });
    return;
  }

  // 4. Advance turn, or end round if everyone's out of time.
  advanceTurnOrEndRound(s, rng, emitter);

  // v0.5.0: maxRounds safety cap removed. The only terminal condition is
  // "all 3 milestones" — set by completeMilestone. Sim harnesses keep their
  // own MAX_STEPS protection against runaway agent loops.
}

function advanceTurnOrEndRound(s, rng, emitter) {
  const maxTime = Math.max(...s.players.map(p => p.character.timeRemaining));
  const cur = s.players[s.currentPlayerIndex];

  if (maxTime <= 0) {
    // Everyone out of time: the round is over.
    emitter.emit('turn_end', { playerNum: cur.playerNum, round: s.round });
    endRound(s, rng, emitter);
    return;
  }

  // If current player still has the most time, they keep playing.
  if (cur.character.timeRemaining >= maxTime) return;

  // Otherwise pass the turn to the first player with the most time.
  emitter.emit('turn_end', { playerNum: cur.playerNum, round: s.round });
  const nextIdx = s.players.findIndex(p => p.character.timeRemaining === maxTime);
  s.currentPlayerIndex = nextIdx;
  const next = s.players[nextIdx];
  emitter.emit('turn_start', {
    round: s.round,
    playerNum: next.playerNum,
    timeRemaining: next.character.timeRemaining,
    endurance: next.character.currentEndurance,
  });
}

function endRound(s, rng, emitter) {
  const endedRound = s.round;

  // Rotate the route-clearing token and refresh the targeted area.
  // Position meanings (game.js:240):
  //   0 → refresh leadClimbing, advance to 1
  //   1 → refresh topRope,       advance to 2
  //   2 → refresh bouldering,    advance to 0
  let cleared;
  if (s.routeClearingPosition === 0) {
    s.availableRoutes.leadClimbing = rng.pickN(regularRoutePool(s.milestoneRoutes, 'leadClimbing'), 5);
    cleared = 'leadClimbing';
  } else if (s.routeClearingPosition === 1) {
    // Refresh all belayer stations together (2×belayerCount routes).
    s.availableRoutes.topRope = drawTopRopeStations(rng, s.belayerCount, regularRoutePool(s.milestoneRoutes, 'topRope'));
    cleared = 'topRope';
  } else {
    s.availableRoutes.bouldering = rng.pickN(regularRoutePool(s.milestoneRoutes, 'bouldering'), 5);
    cleared = 'bouldering';
  }
  s.routeClearingPosition = (s.routeClearingPosition + 1) % 3;

  // Reset per-player per-round state. Training bonuses and gear bonuses
  // persist across rounds — only time, ability-used flag, location, and the
  // belayer-station assignment reset. The route-clearing rotation moves every
  // player back to the Lobby automatically (RuleModifications 2026-06-27).
  for (const p of s.players) {
    const c = p.character;
    const approachBonus = c.equipment.includes('Approach Shoes') ? 1 : 0;
    c.timeRemaining = 10 + approachBonus;
    c.abilityUsed = false;
    c.location = 'lobby';
    c.belayerStation = null;
  }

  // Wipe per-round attempted-routes tracker.
  for (const k of Object.keys(s.attemptedRoutes)) s.attemptedRoutes[k] = {};

  const newRound = endedRound + 1;

  // RuleModifications (2026-06-27): belayer count is fixed at N − 1 from round 1
  // — no time-based unlock ramp.

  s.round = newRound;
  s.currentPlayerIndex = 0;

  emitter.emit('round_end', { round: endedRound, routesCleared: cleared, nextRound: newRound });
  emitter.emit('round_start', { round: newRound, routeClearingPosition: s.routeClearingPosition });

  // Kick off the first turn of the new round.
  const first = s.players[0];
  emitter.emit('turn_start', {
    round: newRound,
    playerNum: first.playerNum,
    timeRemaining: first.character.timeRemaining,
    endurance: first.character.currentEndurance,
  });
}
