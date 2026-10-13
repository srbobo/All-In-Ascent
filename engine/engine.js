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
import { findGear, gearPool, effectSum, describeAppliedClimbRules } from './content.js';
import {
  checkAreaAccess, canEnterSection, getPlayersInSection,
  canClimbTopRopeRoute, pickFreeBelayerStation,
  getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost,
  getGearPurchaseTimeCost,
  getSpendableXp, buildEffectRollArray, resolveClimbDice, computeClimbStats,
  applyDiceToRequirements, resolveClimbOutcome, computeClimbXp,
  getFailureEnduranceExtra, getSuccessEnduranceHeal, applySuccessHeal,
  describeClimbGearEffects,
  freeSoloCanAttempt, trainingSpec, trainingAllowed, trainingCap,
  usesGrit, trainingGritCost, gearFunds, gearPrice, payForGear, claimClimbGrit,
  dealRouteGrit, gearInGame, perRoundGrit, betaBoostAmount, roundStartTime,
  computeRestRecovery, applyLevelUpIfNeeded,
  bestRouteReaderShift, canUseStatShift, isWellFormedStatShift, MAX_STAT_SHIFT,
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
    const spec = trainingSpec(state.rules, area, char);
    if (char.timeRemaining < spec.time) continue;
    if (char.currentEndurance < spec.endurance) continue;
    if (!trainingAllowed(state.rules, char, area.stat, spec.gain)) continue;
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
      const timeCost = getEffectiveClimbTimeCost(char, route.time, route, false, area);
      const enduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance, area, false);
      if (char.timeRemaining < timeCost) continue;
      if (char.currentEndurance < enduranceCost) continue;
      // Free Solo "Life or Die" — must meet all base requirements.
      if (!freeSoloCanAttempt(char, route, area, false)) continue;
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
    const timeCost = getEffectiveClimbTimeCost(char, m.route.time, m.route, true, m.area);
    const enduranceCost = getEffectiveClimbEnduranceCost(char, m.route, m.route.endurance, m.area, true);
    if (char.timeRemaining < timeCost) continue;
    if (char.currentEndurance < enduranceCost) continue;
    if (!freeSoloCanAttempt(char, m.route, m.area, true)) continue;
    actions.push({ type: 'milestone', difficulty, area: m.area, routeName: m.route.name });
    // Rules variant: Versatility's stat shift on a Milestone — offered as a
    // variant of the attempt, like regular climbs.
    if (canUseStatShift(char, true)) {
      const shift = bestRouteReaderShift(char, m.route, m.area, state.attemptedRoutes[player.playerNum], true);
      if (shift) actions.push({ type: 'milestone', difficulty, area: m.area, routeName: m.route.name, shift });
    }
  }

  // Gear purchases: rotation slots + always-available access cards.
  // Prerequisites, level gate, spendable XP, time cost all checked here so
  // agents never see a "legal" action that the handler would reject.
  const gearTime = getGearPurchaseTimeCost(char);
  if (char.timeRemaining >= gearTime) {
    // Spendable XP, or Grit under the Grit-economy rules.
    const funds = gearFunds(state.rules, char);
    const owned = new Set(char.equipment);
    const buyable = [
      ...state.availableGear,
      ...GEAR_SHOP.filter(g => ACCESS_CARDS.includes(g.name)),
    ];
    for (const gear of buyable) {
      if (owned.has(gear.name)) continue;
      const cost = gearPrice(state.rules, char, gear);
      if (funds < cost) continue;
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
// current player right now, or null if it is legal. getLegalActions alone
// decides legality; this only explains a refusal, re-checking the same
// conditions. Returns { code, message, ...details } so a UI can word it its
// own way: `message` is a full player-facing sentence, `code` is one of
//   gameOver, noSuchRoute, noSuchMilestone, noSuchStation, noSuchGear,
//   unknownAction, unavailable,
//   alreadyAttempted, alreadyCompleted, alreadyOwned, notInShop,
//   needsGear {missing}, needsItems {missing}, needsLevel {level},
//   belayerTaken {belayer}, noFreeBelayer, sectionFull {occupants},
//   stationInUse {occupants}, trainingLimit {limit}, trainingCap {cap, stat},
//   notEnoughTime {need, have},
//   notEnoughEndurance {need, have}, notEnoughXp {need, have}, lifeOrDie,
//   shiftNotAllowed, shiftMalformed
// (occupants are playerNums).
export function illegalActionReason(state, wanted) {
  const reason = (code, message, details = {}) => ({ code, message, ...details });
  if (state.gameEnded) return reason('gameOver', 'The game has ended.');
  const legal = getLegalActions(state);
  const match = findLegalAction(legal, wanted);
  const player = state.players[state.currentPlayerIndex];
  const char = player.character;
  if (match) {
    if (wanted.shift && !((match.type === 'climb' && canUseStatShift(char, false)) ||
        (match.type === 'milestone' && canUseStatShift(char, true)))) {
      return reason('shiftNotAllowed', match.type === 'milestone'
        ? 'Versatility can be used once per round, by the Route Reader, and not on a Milestone.'
        : 'Versatility can be used once per round, by the Route Reader, on a regular route.');
    }
    if (wanted.shift && !isWellFormedStatShift(wanted.shift)) {
      return reason('shiftMalformed', `A stat shift moves 1 to ${MAX_STAT_SHIFT} points between two different stats.`);
    }
    return null;
  }
  const notEnough = (code, what, need, have) =>
    reason(code, `Not enough ${what}: this costs ${need} and you have ${have}.`, { need, have });
  const occupantsOf = (section) => getPlayersInSection(state.players, section).map(p => p.playerNum);
  const lifeOrDie = () =>
    reason('lifeOrDie', 'Life or Die: Free Solo can only attempt routes whose base requirements your stats already meet.');
  const areaGate = (area) => {
    const access = checkAreaAccess(char, area);
    if (access.hasAccess) return null;
    return reason('needsGear', `You need ${access.missingItems.join(', ')} to climb ${AREA_LABELS[area] || area}.`,
      { missing: access.missingItems });
  };
  const sectionGate = (area) => {
    const sec = canEnterSection(area, player.playerNum, state);
    if (sec.canEnter) return null;
    return reason('sectionFull', `You can't climb here right now: ${sec.reason}.`, { occupants: occupantsOf(area) });
  };
  const costGate = (route, isMilestone, area) => {
    const t = getEffectiveClimbTimeCost(char, route.time, route, isMilestone, area);
    const e = getEffectiveClimbEnduranceCost(char, route, route.endurance, area, isMilestone);
    if (char.timeRemaining < t) return notEnough('notEnoughTime', 'time', t, char.timeRemaining);
    if (char.currentEndurance < e) return notEnough('notEnoughEndurance', 'endurance', e, char.currentEndurance);
    return null;
  };

  switch (wanted.type) {
    case 'climb': {
      const route = (state.availableRoutes[wanted.area] || []).find(r => r.name === wanted.routeName);
      if (!route) return reason('noSuchRoute', 'That route is not on the wall right now.');
      if (state.attemptedRoutes[player.playerNum]?.[`${wanted.area}:${route.name}`]) {
        return reason('alreadyAttempted', 'You have already attempted this route this round. Try it again next round.');
      }
      const gate = areaGate(wanted.area);
      if (gate) return gate;
      if (wanted.area === 'topRope') {
        if (!canClimbTopRopeRoute(state, player.playerNum, route)) {
          return reason('belayerTaken',
            `Belayer ${route.belayer + 1} is in use by another climber. Pick a route at a free belayer or wait for the wall to clear.`,
            { belayer: route.belayer });
        }
      } else {
        const full = sectionGate(wanted.area);
        if (full) return full;
      }
      return costGate(route, false, wanted.area) || (!freeSoloCanAttempt(char, route, wanted.area, false) ? lifeOrDie() : null)
        || reason('unavailable', 'That climb is not available right now.');
    }
    case 'milestone': {
      const m = state.milestoneRoutes[wanted.difficulty];
      if (!m) return reason('noSuchMilestone', 'There is no milestone route at that tier.');
      if (char.milestonesCompleted[wanted.difficulty]) {
        return reason('alreadyCompleted', `You have already completed the ${wanted.difficulty} milestone.`);
      }
      const gate = areaGate(m.area);
      if (gate) return gate;
      if (m.area === 'topRope') {
        if (pickFreeBelayerStation(state, player.playerNum) === null) {
          return reason('noFreeBelayer', 'Every belayer is in use right now. Wait for one to free up.');
        }
      } else {
        const full = sectionGate(m.area);
        if (full) return full;
      }
      return costGate(m.route, true, m.area) || (!freeSoloCanAttempt(char, m.route, m.area, true) ? lifeOrDie() : null)
        || reason('unavailable', 'That milestone is not available right now.');
    }
    case 'train': {
      const area = TRAINING_AREAS.find(a => a.name === wanted.areaName);
      if (!area) return reason('noSuchStation', 'There is no such training station.');
      const sec = canEnterSection(area.name, player.playerNum, state);
      if (!sec.canEnter) {
        return reason('stationInUse', `You can't train here right now: ${sec.reason}.`, { occupants: occupantsOf(area.name) });
      }
      // Costs and limits as the rules variant (state.rules) sets them.
      const spec = trainingSpec(state.rules, area, char);
      if (char.timeRemaining < spec.time) return notEnough('notEnoughTime', 'time', spec.time, char.timeRemaining);
      if (char.currentEndurance < spec.endurance) {
        return notEnough('notEnoughEndurance', 'endurance', spec.endurance, char.currentEndurance);
      }
      if (!trainingAllowed(state.rules, char, area.stat, spec.gain)) {
        const perRound = state.rules?.trainPerRound;
        if (perRound !== undefined && (char.trainedThisRound || 0) >= perRound) {
          return reason('trainingLimit', `You can train ${perRound} time${perRound === 1 ? '' : 's'} per round.`, { limit: perRound });
        }
        const gritCost = trainingGritCost(state.rules, char);
        if ((char.grit || 0) < gritCost) return notEnough('notEnoughGrit', 'Grit', gritCost, char.grit || 0);
        const cap = trainingCap(state.rules, char);
        return reason('trainingCap', `Training ${area.stat} is capped at +${cap} at Level ${char.level}.`, { cap, stat: area.stat });
      }
      return reason('unavailable', 'That training station is not available right now.');
    }
    case 'rest':
      return reason('notEnoughTime', 'Not enough time to rest.', { need: 1, have: char.timeRemaining });
    case 'buyGear': {
      const gear = findGear(state, wanted.gearName);
      if (!gear) return reason('noSuchGear', 'There is no such gear.');
      if (char.equipment.includes(gear.name)) return reason('alreadyOwned', `You already own ${gear.name}.`);
      const inShop = state.availableGear.some(g => g.name === gear.name) || ACCESS_CARDS.includes(gear.name);
      if (!inShop) return reason('notInShop', `${gear.name} is not in the shop right now.`);
      const missing = (gear.prerequisiteItems || []).filter(n => !char.equipment.includes(n));
      if (missing.length) return reason('needsItems', `${gear.name} requires ${missing.join(', ')} first.`, { missing });
      if (char.level < (gear.prerequisiteLevel || 1)) {
        return reason('needsLevel', `${gear.name} requires Level ${gear.prerequisiteLevel}.`, { level: gear.prerequisiteLevel });
      }
      const timeCost = getGearPurchaseTimeCost(char);
      if (char.timeRemaining < timeCost) return notEnough('notEnoughTime', 'time', timeCost, char.timeRemaining);
      const cost = gearPrice(state.rules, char, gear);
      if (usesGrit(state.rules)) {
        const have = gearFunds(state.rules, char);
        if (have < cost) return notEnough('notEnoughGrit', 'Grit', cost, have);
      }
      const spendable = getSpendableXp(char);
      if (!usesGrit(state.rules) && spendable < cost) {
        return reason('notEnoughXp', `Not enough spendable XP: ${gear.name} costs ${cost} and you have ${spendable} XP earned this level.`,
          { need: cost, have: spendable });
      }
      return reason('unavailable', `${gear.name} can't be bought right now.`);
    }
    case 'endTurn':
      return reason('unavailable', 'You cannot end your turn right now.');
    default:
      return reason('unknownAction', `Unknown action "${wanted.type}".`);
  }
}

// illegalActionReason's player-facing sentence, or null if `wanted` is legal.
export function explainIllegalAction(state, wanted) {
  const r = illegalActionReason(state, wanted);
  return r ? r.message : null;
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

  // Snapshot this round's attempted-route marks before marking this climb.
  const attemptedBefore = { ...(s.attemptedRoutes[player.playerNum] || {}) };

  // 2. Mark the route as attempted this round (only for regular climbs —
  // milestones have no per-round attempt cap per game.js).
  if (!isMilestone) {
    state_attemptedRoutesMark(s, player.playerNum, area, route.name);
  }

  // The climb, for custom rules (content.js): which route, wall and kind.
  const climb = { route, area, isMilestone };

  // 3. Deduct time (character + gear modified).
  const timeCost = getEffectiveClimbTimeCost(char, route.time, route, isMilestone, area);
  const timeBefore = char.timeRemaining;
  char.timeRemaining -= timeCost;

  // 4. Deduct endurance — base cost may be reduced by gear (Body Tension Belt).
  // Iron Lung's failure penalty is added later, after success/fail is known.
  const enduranceBefore = char.currentEndurance;
  const baseEnduranceCost = getEffectiveClimbEnduranceCost(char, route, route.endurance, area, isMilestone);
  char.currentEndurance -= baseEnduranceCost;

  // 5-6. Effective stats for this climb: base + training + gear + per-route
  //      gear, then Route Reader's Beta Boost (+3) and stat shift. Computed by
  //      the same read-only helper climbSendProbability uses, so previews and
  //      real climbs can't drift apart. Consuming the flags happens below.
  //      (Route attempted-marks don't feed gear bonuses in v0.7+ data, but use
  //      the pre-climb marks so a preview and the climb see identical input.)
  const effectiveStats = computeClimbStats(char, route, area, attemptedBefore, shift, isMilestone);
  // The Beta Boost is spent by this climb; the flag is cleared once the outcome
  // is known, because a rules variant can make Versatility depend on it.
  const boostSpent = !!char.betaBoostActive;
  if (boostSpent) {
    emitter.emit('ability_activated', {
      playerNum: player.playerNum,
      character: char.key,
      ability: 'Beta Boost',
      effect: `+${betaBoostAmount(char)} all stats for this climb`,
    });
  }

  // 6b. Route Reader stat shift (validated above): this climb only, once per round.
  if (shift) {
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
  //    Gear choices ("your choice") are made against effectiveStats.
  const effectArray = buildEffectRollArray(char, route, area, isMilestone);
  const diceTrace = [];
  const { dice, mentorIndex } = resolveClimbDice(() => rng.rollDie(6), effectArray, char, route, isMilestone, effectiveStats, diceTrace, area);
  const { requirements, appliedModifiers } = applyDiceToRequirements(char, route, effectArray, dice, { mentorIndex, area, isMilestone });

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
  const outcome = resolveClimbOutcome(char, effectiveStats, requirements, isMilestone, climb);
  if (boostSpent) char.betaBoostActive = false;
  const xpGained = computeClimbXp(char, route, outcome.success, climb);
  char.xp += xpGained;
  // Grit economy: a regular send takes the Grit on the card; a milestone
  // send pays its tier's reward.
  const gritGained = claimClimbGrit(s.rules, char, route, { isMilestone, success: outcome.success, tier: difficulty });

  // 9. Iron Lung failure penalty (Mental Anchor gear bypasses).
  let failPenalty = 0;
  if (!outcome.success) {
    failPenalty = getFailureEnduranceExtra(char, climb);
    char.currentEndurance -= failPenalty;
  }
  // 9b. Power Spotting: successful climbs heal endurance, up to maxEndurance.
  let healed = 0;
  if (outcome.success) {
    const beforeHeal = char.currentEndurance;
    char.currentEndurance = applySuccessHeal(char.currentEndurance, char.maxEndurance, getSuccessEnduranceHeal(char, climb));
    healed = char.currentEndurance - beforeHeal;
  }
  // Custom rules (the climber's and its custom gear's) that applied to this climb.
  const customRules = describeAppliedClimbRules(char, { scope: 'climb', route, area, isMilestone });
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
    ...(usesGrit(s.rules) ? { gritGained, gritAfter: char.grit } : {}),
    timeCost,
    enduranceCost: baseEnduranceCost + failPenalty,
    failPenalty,
    // Every gear effect that changed this climb (see describeClimbGearEffects).
    gearEffects: describeClimbGearEffects({
      char, route, effectRollArray: effectArray, diceTrace, appliedModifiers,
      success: outcome.success, timeCost, enduranceCost: baseEnduranceCost, healed, isMilestone, area,
    }),
    // Project Mode: every custom rule that applied, worded ({ source, ruleId, text }).
    ...(customRules.length ? { customRules } : {}),
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

  // Old Climbing Journal (gear) boosts every session by +N; a rules variant
  // (state.rules) may change the Time, Endurance or bonus.
  const spec = trainingSpec(s.rules, area, char);
  // Grit economy: a session costs Grit, except Training Partner's free one.
  const gritCost = trainingGritCost(s.rules, char);
  if (usesGrit(s.rules) && gritCost === 0 && !s.rules.characters?.[char.key]?.freeTraining) char.freeSessionUsed = true;
  if (gritCost) char.grit -= gritCost;
  char.location = area.name;
  char.timeRemaining -= spec.time;
  char.currentEndurance -= spec.endurance;
  const trainingBonus = spec.gain;
  char.trainingBonuses[area.stat] += trainingBonus;
  char.trainedThisRound = (char.trainedThisRound || 0) + 1;

  emitter.emit('train_action', {
    playerNum: player.playerNum,
    areaName: area.name,
    stat: area.stat,
    bonus: trainingBonus,
    totalTrainingBonusAfter: { ...char.trainingBonuses },
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -spec.time },
      endurance: { before: eBefore, after: char.currentEndurance, delta: -spec.endurance },
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

  // Route Reader's "Versatility" activates Beta Boost on rest, as does a
  // custom "Beta Boost on rest" rule (for the amount the rules grant). Other
  // characters ignore this flag.
  let betaActivated = false;
  if (char.key === 'routeReader') {
    char.betaBoostActive = true;
    betaActivated = true;
  } else {
    const boost = effectSum(char, 'betaBoostOnRest', { scope: 'rest' });
    if (boost > 0) {
      char.betaBoostActive = true;
      char.betaBoostAmount = boost;
      betaActivated = true;
    }
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
  const gear = findGear(s, action.gearName);
  if (!gear) throw new Error(`buyGear: no gear "${action.gearName}"`);

  // XP, or Grit under the Grit-economy rules (XP is then never spent).
  const effectiveCost = gearPrice(s.rules, char, gear);
  const timeCost = getGearPurchaseTimeCost(char);
  const xpBefore = char.xp;
  const timeBefore = char.timeRemaining;

  char.location = 'gearShop';
  char.timeRemaining -= timeCost;
  payForGear(s.rules, char, effectiveCost);
  char.equipment.push(gear.name);

  // Permanent stat & endurance effects from the purchased item.
  // Matches game.js:2299-2391 branch-by-branch.
  const gearApplied = {};
  // A custom card's rules now act for this climber (content.js activeRules);
  // its permanent max-Endurance rules apply at once, like Locking Carabiner.
  if (gear.custom) {
    char.gearRules = [...(char.gearRules || []), { gear: gear.name, hash: gear.rulesHash, rules: gear.rules }];
    const maxEnd = effectSum({ gearRules: [{ gear: gear.name, rules: gear.rules }] }, 'maxEndurance', { scope: 'setup' });
    if (maxEnd) {
      char.maxEndurance += maxEnd;
      gearApplied.maxEndurance = maxEnd;
    }
  }
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
    currency: usesGrit(s.rules) ? 'grit' : 'xp',
    nominalCost: gear.cost,
    timeCost,
    gearApplied,
    resourcesDelta: {
      time: { before: timeBefore, after: char.timeRemaining, delta: -timeCost },
      xp: { before: xpBefore, after: char.xp, delta: char.xp - xpBefore },
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
  const pool = gearPool(s.content).filter(g => !unavailable.has(g.name) && gearInGame(s.rules, g));

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
    ...(usesGrit(s.rules) ? { grit: char.grit } : {}),
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
    s.availableRoutes.leadClimbing = dealRouteGrit(s.rules, rng.pickN(regularRoutePool(s.milestoneRoutes, 'leadClimbing', s.content), 5));
    cleared = 'leadClimbing';
  } else if (s.routeClearingPosition === 1) {
    // Refresh all belayer stations together (2×belayerCount routes).
    s.availableRoutes.topRope = dealRouteGrit(s.rules, drawTopRopeStations(rng, s.belayerCount, regularRoutePool(s.milestoneRoutes, 'topRope', s.content)));
    cleared = 'topRope';
  } else {
    s.availableRoutes.bouldering = dealRouteGrit(s.rules, rng.pickN(regularRoutePool(s.milestoneRoutes, 'bouldering', s.content), 5));
    cleared = 'bouldering';
  }
  s.routeClearingPosition = (s.routeClearingPosition + 1) % 3;

  // Reset per-player per-round state. Training bonuses and gear bonuses
  // persist across rounds — only time, ability-used flag, location, and the
  // belayer-station assignment reset. The route-clearing rotation moves every
  // player back to the Lobby automatically (RuleModifications 2026-06-27).
  for (const p of s.players) {
    const c = p.character;
    // 10 Time, plus Approach Shoes and custom "Time each round" rules.
    c.timeRemaining = roundStartTime(c);
    c.abilityUsed = false;
    c.trainedThisRound = 0;
    c.freeSessionUsed = false;
    // Grit economy: the per-round allowance, plus custom "Grit each round" rules.
    if (usesGrit(s.rules)) c.grit = (c.grit || 0) + perRoundGrit(s.rules, c.key) + (c.gritPerRound || 0) + effectSum(c, 'gritPerRound', { scope: 'round' });
    c.location = 'lobby';
    c.belayerStation = null;
  }

  // Wipe per-round attempted-routes tracker.
  for (const k of Object.keys(s.attemptedRoutes)) s.attemptedRoutes[k] = {};

  const newRound = endedRound + 1;

  // RuleModifications (2026-06-27): belayer count is fixed at N − 1 from round 1
  // — no time-based unlock ramp.

  s.round = newRound;
  // The climber with the most Time opens the round (ties → seat order), the
  // same rule as every other turn. v0.7.0 always started seat 1, even when
  // someone else had 11 Time from Approach Shoes.
  s.currentPlayerIndex = firstToActIndex(s.players);

  emitter.emit('round_end', { round: endedRound, routesCleared: cleared, nextRound: newRound });
  emitter.emit('round_start', { round: newRound, routeClearingPosition: s.routeClearingPosition });

  // Kick off the first turn of the new round.
  const first = s.players[s.currentPlayerIndex];
  emitter.emit('turn_start', {
    round: newRound,
    playerNum: first.playerNum,
    timeRemaining: first.character.timeRemaining,
    endurance: first.character.currentEndurance,
  });
}

// Index of the player who acts first: most Time remaining, ties to seat order.
export function firstToActIndex(players) {
  const maxTime = Math.max(...players.map(p => p.character.timeRemaining));
  return players.findIndex(p => p.character.timeRemaining === maxTime);
}
