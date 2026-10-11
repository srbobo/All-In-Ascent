// Engine helpers: pure computations used by action handlers.
//
// Everything here is READ-ONLY unless the function name says otherwise.
//   - compute*, calculate*, check*, can*, get*, roll*  → read-only (may
//     return new objects, but never mutate the input state/player).
//   - apply*  → may mutate the passed-in character (consuming ability
//     flags, recomputing stats on level-up). Called only from the action
//     handlers in engine.js, which work on a cloned state.
//
// Why split this way:
//   Agents need to *preview* a climb's outcome (e.g. "would this route
//   succeed right now?") without consuming ability flags like Route
//   Reader's Beta Boost. So the read-only stat/dice helpers never touch
//   betaBoostActive. Consumption happens only inside resolveClimbOutcome,
//   which is used by the climb action handler.

import { TRAINING_AREAS, GEAR_SHOP, XP_TABLE, CHARACTERS } from './data.js';

// =============================================================================
// AREA ACCESS (game.js:367-412)
// =============================================================================

// Does the character satisfy the equipment gating for `area`?
// Returns { hasAccess: boolean, missingItems: string[] }.
// Free Solo's "Life or Die" passive bypasses all equipment requirements.
//
// RuleModifications (2026-06-27):
//   - Bouldering and Top Rope are OPEN — no gear required for either.
//   - Lead Climbing requires Belay Device + Locking Carabiner + Lead Rope
//     (Harness was removed from the game).
export function checkAreaAccess(char, area) {
  if (char.key === 'freeSolo') return { hasAccess: true, missingItems: [] };
  if (area === 'bouldering' || area === 'topRope') {
    return { hasAccess: true, missingItems: [] };
  }

  const owned = new Set(char.equipment);

  if (area === 'leadClimbing') {
    const needs = ['Belay Device', 'Locking Carabiner', 'Lead Rope'];
    const missing = needs.filter(n => !owned.has(n));
    return { hasAccess: missing.length === 0, missingItems: missing };
  }
  return { hasAccess: true, missingItems: [] };
}

// =============================================================================
// SECTION CAPACITY (game.js:281-346)
// =============================================================================

// Returns how many players may occupy a given section simultaneously.
//
// RuleModifications (2026-06-27):
//   - Top Rope: total simultaneous occupancy = belayerCount (one climber per
//     belayer station). The REAL gate is per-station (see canClimbTopRopeRoute
//     / isBelayerStationFree); this number is the aggregate, used for display
//     and any generic capacity query.
//   - Lead Climbing: a single belayer — capacity 1, independent of belayerCount.
//   - Training equipment: 1-at-a-time. Everything else effectively unlimited.
export function getSectionCapacity(section, belayerCount) {
  if (section === 'topRope') return Math.max(0, belayerCount);
  if (section === 'leadClimbing') return 1;
  if (isTrainingEquipment(section)) return 1;
  // bouldering, gearShop, rest, lobby — treat as unlimited.
  return 10;
}

// =============================================================================
// TOP ROPE BELAYER STATIONS (RuleModifications 2026-06-27)
// =============================================================================

// Stations occupied by players OTHER than `playerNum`. Returns a Set of
// 0-based belayer-station indices that are currently blocked for this player.
export function getOccupiedBelayerStations(state, playerNum) {
  const occupied = new Set();
  for (const p of state.players) {
    if (p.playerNum === playerNum) continue;
    const c = p.character;
    if (c.location === 'topRope' && c.belayerStation !== null && c.belayerStation !== undefined) {
      occupied.add(c.belayerStation);
    }
  }
  return occupied;
}

// Is belayer station `stationIndex` available for `playerNum`? A station is
// available if no OTHER player occupies it (the asking player may already be
// parked there from an earlier turn this round — that's still "free" to them).
export function isBelayerStationFree(state, stationIndex, playerNum) {
  return !getOccupiedBelayerStations(state, playerNum).has(stationIndex);
}

// May `playerNum` attempt this top-rope `route` right now? Legal if the route's
// belayer station is free for them. (Switching belayers is implicit: a climb at
// a different free station moves the player there; a station held by someone
// else blocks both of its routes.)
export function canClimbTopRopeRoute(state, playerNum, route) {
  const station = route.belayer;
  if (station === null || station === undefined) return true; // untagged → no station gate
  return isBelayerStationFree(state, station, playerNum);
}

// Choose a belayer station for a player who must occupy one but isn't tied to a
// specific route's station (e.g. a Top Rope milestone attempt). Reuses the
// player's current station if they're already parked at Top Rope; otherwise the
// lowest-index free station. Returns null if every station is taken.
export function pickFreeBelayerStation(state, playerNum) {
  const me = state.players.find(p => p.playerNum === playerNum);
  if (me && me.character.location === 'topRope' &&
      me.character.belayerStation !== null && me.character.belayerStation !== undefined) {
    return me.character.belayerStation;
  }
  const occupied = getOccupiedBelayerStations(state, playerNum);
  for (let i = 0; i < state.belayerCount; i++) {
    if (!occupied.has(i)) return i;
  }
  return null;
}

// Is `location` the name of one of the four training equipment stations?
export function isTrainingEquipment(location) {
  return TRAINING_AREAS.some(a => a.name === location);
}

// Everyone currently standing at `section` (including the player asking).
export function getPlayersInSection(players, section) {
  return players.filter(p => p.character.location === section);
}

// May `playerNum` enter `section` right now? Returns { canEnter, reason }.
// If the player is already there, they can stay (no-op re-entry always allowed).
export function canEnterSection(section, playerNum, state) {
  const player = state.players.find(p => p.playerNum === playerNum);
  if (!player) return { canEnter: false, reason: 'player not found' };
  if (player.character.location === section) {
    return { canEnter: true, reason: '' };
  }
  const capacity = getSectionCapacity(section, state.belayerCount);
  const occupants = getPlayersInSection(state.players, section);
  if (occupants.length >= capacity) {
    const names = occupants.map(p => `Player ${p.playerNum}`).join(', ');
    if (isTrainingEquipment(section)) {
      return { canEnter: false, reason: `training equipment in use by ${names}` };
    }
    return { canEnter: false, reason: `section at capacity (${occupants.length}/${capacity}); occupied by ${names}` };
  }
  return { canEnter: true, reason: '' };
}

// =============================================================================
// GEAR BONUSES (game.js:416-505)
// =============================================================================

// Compute per-route stat bonuses granted by equipped gear.
// Returns { strength, technique, focus, flexibility } — amounts to ADD to the
// player's own stats (effectively lowering the effective requirement gap).
//
// Filter logic (matches game.js precisely):
//   - statEffect 'endurance' | 'time' | 'special' → skip (not a stat boost)
//   - "Repeated" filter → applies only on second+ attempt this round
//   - When BOTH routeFilter AND holdFeatureFilter are non-empty: OR logic
//     (either filter matching is sufficient).
//   - When only one filter type is present: that filter must match.
//   - "All" in routeFilter → always matches.
export function calculateGearBonuses(char, route, area, attemptedRoutesForPlayer) {
  const bonuses = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  const routeKey = `${area}:${route.name}`;
  const isRepeated = attemptedRoutesForPlayer && attemptedRoutesForPlayer[routeKey] === true;

  for (const gearName of char.equipment) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (!gear) continue;
    // Gear that is not a stat buff for climbing.
    if (['endurance', 'time', 'special', 'timePerRound', 'leadDiscount'].includes(gear.statEffect)) continue;
    // Permanent stat-trainer gear (e.g. Grip Strength Trainer) has value: 2
    // and already lives in char.gearBonuses via the buy handler; don't
    // double-apply it here.
    if (gear.value > 0) continue;

    // "Repeated" filter: only applies if we've attempted this route before
    // this round.
    if (gear.routeFilter && gear.routeFilter.includes('Repeated') && !isRepeated) continue;

    const hasRouteFilter = gear.routeFilter && gear.routeFilter.length > 0
      && !gear.routeFilter.includes('All')
      && !gear.routeFilter.includes('Repeated');
    const hasFeatureFilter = gear.holdFeatureFilter && gear.holdFeatureFilter.length > 0;

    if (hasRouteFilter || hasFeatureFilter) {
      let routeFilterPasses = false;
      let featureFilterPasses = false;

      if (hasRouteFilter) {
        if (area === 'bouldering' && gear.routeFilter.includes('Bouldering')) routeFilterPasses = true;
        if (area === 'topRope' && gear.routeFilter.includes('Top Rope')) routeFilterPasses = true;
        if (area === 'leadClimbing' && gear.routeFilter.includes('Lead')) routeFilterPasses = true;
        if (route.routeType && gear.routeFilter.includes(route.routeType)) routeFilterPasses = true;
      }
      if (hasFeatureFilter) {
        for (const f of (route.holdFeatures || [])) if (gear.holdFeatureFilter.includes(f)) featureFilterPasses = true;
        for (const f of (route.moveFeatures || [])) if (gear.holdFeatureFilter.includes(f)) featureFilterPasses = true;
      }

      // OR logic when both filter types are present; AND logic when only one.
      if (hasRouteFilter && hasFeatureFilter) {
        if (!routeFilterPasses && !featureFilterPasses) continue;
      } else {
        if (hasRouteFilter && !routeFilterPasses) continue;
        if (hasFeatureFilter && !featureFilterPasses) continue;
      }
    }

    // gear.value is negative for buffs (-3 Technique etc.). Bonuses here
    // are the absolute magnitude ADDED to the player's stat to make the
    // effective requirement easier to meet.
    const mag = Math.abs(gear.value);
    if (gear.statEffect === 'all') {
      bonuses.strength += mag;
      bonuses.technique += mag;
      bonuses.focus += mag;
      bonuses.flexibility += mag;
    } else if (['strength', 'technique', 'focus', 'flexibility'].includes(gear.statEffect)) {
      bonuses[gear.statEffect] += mag;
    }
  }
  return bonuses;
}

// =============================================================================
// STAT COMPUTATION (game.js:1693-1698)
// =============================================================================

// Compute a character's effective stats for a specific climb attempt.
// Combines base + training + permanent gear bonuses + per-route gear bonuses.
// Does NOT apply character-ability overrides (Route Reader Beta Boost etc.) —
// those are applied inside resolveClimbOutcome because they consume flags.
export function computeEffectiveStats(char, route, area, attemptedRoutesForPlayer) {
  const perRouteGear = calculateGearBonuses(char, route, area, attemptedRoutesForPlayer);
  return {
    strength:    char.stats.strength    + char.trainingBonuses.strength    + char.gearBonuses.strength    + perRouteGear.strength,
    technique:   char.stats.technique   + char.trainingBonuses.technique   + char.gearBonuses.technique   + perRouteGear.technique,
    focus:       char.stats.focus       + char.trainingBonuses.focus       + char.gearBonuses.focus       + perRouteGear.focus,
    flexibility: char.stats.flexibility + char.trainingBonuses.flexibility + char.gearBonuses.flexibility + perRouteGear.flexibility,
  };
}

// Effective stats for one specific climb, exactly as the climb handler will
// use them: computeEffectiveStats, plus Route Reader's Beta Boost (+3 all, if
// active) and an optional stat shift. Read-only — it does NOT consume the
// Beta Boost or the once-per-round shift; the climb handler does that.
export function computeClimbStats(char, route, area, attemptedRoutesForPlayer, shift = null) {
  let stats = computeEffectiveStats(char, route, area, attemptedRoutesForPlayer);
  if (char.betaBoostActive) {
    const b = abilityParam(char, 'betaBoost') ?? 3;
    stats = {
      strength: stats.strength + b, technique: stats.technique + b,
      focus: stats.focus + b, flexibility: stats.flexibility + b,
    };
  }
  if (shift) stats = applyStatShiftToStats(stats, shift);
  return stats;
}

// =============================================================================
// CHARACTER ABILITY PARAMETERS (balance experiments)
// =============================================================================
// Each ability's numbers, as printed. A rules variant can tune them per
// character with rules.characters[key].ability, which createGame copies onto
// the climber as char.abilityParams. Absent, abilities play exactly as printed.
//   routeReader.milestonePasses  stats a Milestone needs (3 = Versatility applies)
//   routeReader.boostOnly        3-of-4 only while Beta Boost is active
//   routeReader.nearMiss         the 4th stat may miss by at most this (null = any)
//   routeReader.shiftOnMilestones  Versatility's stat shift may be used on Milestones
//   technician.extraTimeOn       where Perfect Beta's +1 Time applies: 'all' | 'milestone' | 'regular'
// As printed since 1.1.0 (trait-preserving balance, docs/CPU_PLAYTEST_AUDIT.md
// §13): Sprinter 85% XP (was 50%), Technician's +1 Time on Milestones only
// (was every climb), Route Reader's 4th stat may miss by at most 3 (was any
// amount) and the stat shift also works on Milestones. Iron Lung's growth
// change lives in the character data (game.js).
export const DEFAULT_ABILITY = Object.freeze({
  sprinter: { timeReduction: 2, xpMultiplier: 0.85, focusCrux: true },
  technician: { reqReduction: 5, extraTime: 1, extraTimeOn: 'milestone' },
  ironLung: { failXpBonus: 0.5, failEndurance: 5 },
  routeReader: { betaBoost: 3, milestonePasses: 3, boostOnly: false, nearMiss: 3, shiftOnMilestones: true },
});

export function abilityParam(char, name) {
  const own = char && char.abilityParams;
  if (own && own[name] !== undefined) return own[name];
  return (DEFAULT_ABILITY[char && char.key] || {})[name];
}

// How many stats a climb needs, and how far a Route Reader's 4th may miss.
export function passRule(char, isMilestone = false) {
  if (char.key !== 'routeReader') return { needed: 4, nearMiss: Infinity };
  const all4 = (isMilestone && abilityParam(char, 'milestonePasses') === 4) ||
    (abilityParam(char, 'boostOnly') && !char.betaBoostActive);
  if (all4) return { needed: 4, nearMiss: Infinity };
  const nm = abilityParam(char, 'nearMiss');
  return { needed: 3, nearMiss: nm === null || nm === undefined ? Infinity : nm };
}

// =============================================================================
// COST MODIFIERS (character passives)
// =============================================================================

// Effective time cost of a climb for this character.
// Sprinter's "Flash Speed": -2 (min 1). Technician's "Perfect Beta": +1.
// Engine v0.3.0 also applies gear effectKind 'timeCostReduction' for tagged routes
// (Trick Foot Manual: Toe/Heel Hook climbs cost 1 less time).
export function getEffectiveClimbTimeCost(char, baseTime, route = null, isMilestone = false) {
  let t = baseTime;
  if (char.key === 'sprinter') t = Math.max(1, t - abilityParam(char, 'timeReduction'));
  if (char.key === 'technician') {
    const on = abilityParam(char, 'extraTimeOn');
    if (on === 'all' || (on === 'milestone' && isMilestone) || (on === 'regular' && !isMilestone)) {
      t += abilityParam(char, 'extraTime');
    }
  }
  // Tag-targeted time-cost reduction gear
  if (route && route.tag) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'timeCostReduction' && gear.tagFilter === route.tag) {
        t = Math.max(1, t - (gear.value || 1));
      }
    }
  }
  return t;
}

// Engine v0.3.0 — endurance cost adjustment based on gear that targets route tags.
// Body Tension Belt halves endurance cost on Roof/Sloper routes.
// Returns the modified endurance cost (rounded up).
export function getEffectiveClimbEnduranceCost(char, route, baseEndurance) {
  if (!route || !route.tag) return baseEndurance;
  let e = baseEndurance;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'enduranceHalvedOnTag' && gear.tagFilter === route.tag) {
      e = Math.ceil(e / 2);
    }
  }
  return e;
}

// XP multiplier applied to base success/fail XP before Iron Lung's bonus.
// Sprinter's "Flash Speed": 0.5. Everyone else: 1.0.
export function getXpMultiplier(char) {
  return char.key === 'sprinter' ? abilityParam(char, 'xpMultiplier') : 1.0;
}

// Time cost for a gear-shop purchase: Gear Bag makes shopping free.
export function getGearPurchaseTimeCost(char) {
  return char.equipment.includes('Gear Bag') ? 0 : 1;
}

// Effective purchase price, applying the Non-Locking Carabiner discount for
// its two eligible items.
export function getEffectiveGearCost(char, gear) {
  const hasNonLocking = char.equipment.includes('Non-Locking Carabiner');
  const eligibleForDiscount = ['Locking Carabiner', 'Quickdraws Set'];
  if (hasNonLocking && eligibleForDiscount.includes(gear.name)) {
    return Math.max(0, gear.cost - 20);
  }
  return gear.cost;
}

// Spendable XP within the current level (current-level earnings that haven't
// yet been spent on gear). When a player has 145 XP total at Level 2 (and
// Level 2 starts at 100 cumulative), spendable = 145 - 100 = 45.
export function getSpendableXp(char) {
  const levelRow = XP_TABLE.find(r => r.level === char.level);
  const baseXp = levelRow ? levelRow.cumulative : 0;
  return Math.max(0, char.xp - baseXp);
}

// =============================================================================
// DICE ROLLING (game.js:1720-1725)
// =============================================================================

// Build the dice-modifier array for a climb attempt.
// Base: route.rollEffect (e.g. [{stat:'technique',modifier:-1}]).
// Sprinter appends one extra {stat:'focus',modifier:+1} nerf die.
// Returns a fresh array — does not mutate the route.
export function buildEffectRollArray(char, route) {
  const effects = (route.rollEffect || []).map(e => ({ ...e }));
  if (char.key === 'sprinter' && abilityParam(char, 'focusCrux')) {
    effects.push({ stat: 'focus', modifier: 1, source: 'sprinter_flash_speed' });
  }
  return effects;
}

// The modifier a die will actually apply for this character once character
// overrides run (see applyDiceToRequirements): Free Solo negates every die,
// Technician negates nerf dice. Used to decide which dice are worth improving.
function effectiveDieModifier(char, effect) {
  if (!effect) return 0;
  if (char && char.key === 'freeSolo') return 0;
  if (char && char.key === 'technician' && effect.modifier === 1) return 0;
  return effect.modifier;
}

// Roll the dice for a climb. `numDice` is max(2, effects.length) — even on a
// Type-C "Pure Skill" route (empty rollEffect) we roll 2 dice that get
// ignored, matching game.js behavior. Die i is applied to effectRollArray[i];
// dice past the end of effectRollArray are never chosen by any gear effect.
//
// Gear effects on dice, in rulebook order ("roll, then re-rolls and extra
// dice, then 'treat a die as' effects, then +1 effects"):
//   - Crimp Sequence Decoder (rerollOnTag, Pinch/Crimp): MAY re-roll one die
//     of the climber's choice.
//   - Power Tap Belt (extraDieDiscardOne, Dynamic): roll ONE extra die, then
//     discard any one die — an N-die climb rolls N+1 and keeps N.
//   - Sequence Memorization (treatOneDieAsValue=1, every climb): treat one die
//     as 1, climber's choice.
//   - Climbing Coach (milestoneBuffDiceBonus, milestone climbs only): every
//     BUFF die (modifier -1) is +1, max 6. Nerf dice are untouched.
//   - Mountain Mentor (negateOneNerfDie): ignore one nerf die, climber's
//     choice — resolved in applyDiceToRequirements via `mentorIndex`.
//
// Every "climber's choice" is made for the player:
//   - Without `stats` (stat-blind): the die whose change most lowers its
//     requirement (a buff die wants a high number, a nerf die a low one) —
//     the Decoder re-rolls the die furthest on the wrong side of average
//     (3.5), Memorization takes the highest nerf die. Dice that apply nothing
//     are never picked: dice negated by Free Solo / Technician, dice past the
//     route's effects, and the nerf die Mountain Mentor negates (the first).
//   - v0.8.0, with the climb's effective `stats`: each choice maximises the
//     outcome instead (send first, then the deciding margin, then total
//     margin), Memorization and Mentor chosen together; the Decoder re-rolls
//     only when that raises P(send). The engine always passes stats.
//
// `trace` (optional array): each gear effect that fires pushes
// { gear, effectKind, die, from, to } (die = index into the returned rolls;
// Power Tap Belt also records `extra`, with die -1 when the extra die was the
// one discarded). Read-only bookkeeping for UIs; it never changes the rolls.
//
// Returns the final dice array. Use resolveClimbDice when you also need the
// Mountain Mentor choice (pass it to applyDiceToRequirements as mentorIndex).
export function rollClimbDice(rng, effectRollArray, char = null, route = null, isMilestone = false, trace = null, stats = null) {
  return resolveClimbDice(() => rng.rollDie(6), effectRollArray, char, route, isMilestone, stats, trace).dice;
}

// Shared dice procedure. `drawDie()` supplies each d6 (the engine passes the
// game RNG; climbSendProbability passes scripted values to enumerate every
// outcome exactly). Returns { dice, mentorIndex } where mentorIndex is the
// nerf die Mountain Mentor ignores (null if none / not owned).
export function resolveClimbDice(drawDie, effectRollArray, char = null, route = null, isMilestone = false, stats = null, trace = null) {
  const numDice = Math.max(2, effectRollArray.length);
  const rolls = [];
  for (let i = 0; i < numDice; i++) rolls.push(drawDie());
  return finishClimbDice(rolls, drawDie, effectRollArray, char, route, isMilestone, stats, trace);
}

// Everything after the initial roll. Split out so the probability enumerator
// can supply the initial roll itself and only script the follow-up dice.
function finishClimbDice(rolls, drawDie, effectRollArray, char, route, isMilestone, stats, trace = null) {
  const ctx = makeDiceContext(effectRollArray, char, route, isMilestone, stats);
  const note = (gear, extra) => trace && trace.push({ gear: gear.name, effectKind: gear.effectKind, ...extra });

  if (ctx.reroll) {
    const target = chooseRerollTarget(ctx, rolls);
    if (target !== null) {
      const from = rolls[target];
      rolls[target] = drawDie();
      note(ctx.reroll, { die: target, from, to: rolls[target] });
    }
  }
  if (ctx.extraDie) {
    const extra = drawDie();
    const replace = chooseExtraDieSwap(ctx, rolls, extra);
    note(ctx.extraDie, { die: replace === null ? -1 : replace, extra, from: replace === null ? extra : rolls[replace], to: extra });
    if (replace !== null) rolls[replace] = extra;
  }
  const { dice, mentorIndex, memoIndex } = chooseFinalDice(ctx, rolls);
  if (trace) {
    if (memoIndex !== null) note(ctx.memo, { die: memoIndex, from: rolls[memoIndex], to: ctx.memoValue });
    if (ctx.coach) {
      for (let i = 0; i < ctx.n; i++) {
        if (ctx.effects[i].modifier === -1) note(ctx.coach, { die: i, from: rolls[i], to: dice[i] });
      }
    }
  }
  return { dice, mentorIndex };
}

function makeDiceContext(effects, char, route, isMilestone, stats) {
  const owned = (char && char.equipment ? char.equipment : [])
    .map(name => GEAR_SHOP.find(g => g.name === name))
    .filter(Boolean);
  const onTag = (gear) => !!(route && route.tag && gear.tagFilter === route.tag);
  const find = (kind, tagged) => owned.find(g => g.effectKind === kind && (!tagged || onTag(g)));
  const memo = find('treatOneDieAsValue', false);
  const coach = isMilestone ? find('milestoneBuffDiceBonus', false) : null;
  const n = effects.length;
  const mods = effects.map(e => effectiveDieModifier(char, e));
  const mentor = !!find('negateOneNerfDie', false);
  // Dice whose value can change the outcome for this character.
  const live = mods.map((m, i) => (m !== 0 ? i : -1)).filter(i => i >= 0);
  // Stat-blind Mountain Mentor target: the first live nerf die. The other
  // stat-blind choices leave it alone (it counts for nothing).
  const mentorDefault = mentor ? (live.find(i => mods[i] === 1) ?? null) : null;
  return {
    char, route, effects, stats, n, mods, live, mentor, mentorDefault, isMilestone,
    // Dice a stat-blind choice may pick: live, and not the one Mentor negates.
    pickable: stats ? live : live.filter(i => i !== mentorDefault),
    reroll: find('rerollOnTag', true) || null,
    extraDie: find('extraDieDiscardOne', true) || null,
    memo: memo || null,
    memoValue: memo ? (memo.value || 1) : null,
    coach: coach || null,
    coachBonus: coach ? (coach.value || 1) : 0,
  };
}

// Score a final dice configuration: [send, deciding margin, total margin].
// The deciding margin is the margin on the stat that settles the climb (the
// worst stat, or the 3rd-best for a Route Reader). Higher is better.
function scoreDice(ctx, dice, mentorIndex) {
  const { requirements } = applyDiceToRequirements(ctx.char, ctx.route, ctx.effects, dice, { mentorIndex });
  return scoreRequirements(ctx.char, ctx.stats, requirements, ctx.isMilestone);
}

// Same send rule as resolveClimbOutcome (passRule), as a score.
function scoreRequirements(char, stats, requirements, isMilestone = false) {
  const margins = STAT_KEYS.map(k => stats[k] - requirements[k]).sort((a, b) => b - a);
  const { needed, nearMiss } = passRule(char, isMilestone);
  const deciding = needed === 4 ? margins[3] : Math.min(margins[2], margins[3] + nearMiss);
  return [deciding >= 0 ? 1 : 0, deciding, margins[0] + margins[1] + margins[2] + margins[3]];
}

function better(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Apply Sequence Memorization, Climbing Coach and Mountain Mentor, choosing
// the Memorization and Mentor targets. Returns the best final dice.
function chooseFinalDice(ctx, rolls) {
  const memoOptions = [null];
  if (ctx.memoValue !== null) {
    // Treating a die as 1 only helps on a nerf die showing more than 1.
    for (const i of ctx.pickable) if (ctx.mods[i] === 1 && rolls[i] > ctx.memoValue) memoOptions.push(i);
  }
  let best = null;
  for (const memoIdx of memoOptions) {
    const dice = rolls.slice();
    if (memoIdx !== null) dice[memoIdx] = ctx.memoValue;
    if (ctx.coachBonus) {
      for (let i = 0; i < ctx.n; i++) if (ctx.effects[i].modifier === -1) dice[i] = Math.min(6, dice[i] + ctx.coachBonus);
    }
    // With stats, Mentor may take any live nerf die; stat-blind, the first.
    const mentorOptions = !ctx.mentor ? [] : ctx.stats ? ctx.live.filter(i => ctx.mods[i] === 1)
      : (ctx.mentorDefault === null ? [] : [ctx.mentorDefault]);
    if (!mentorOptions.length) mentorOptions.push(null);
    for (const mentorIndex of mentorOptions) {
      const cand = { dice, mentorIndex, memoIndex: memoIdx };
      if (!ctx.stats) {
        // Stat-blind: Memorization on the highest pickable nerf die (first on
        // ties). Never makes a die worse.
        cand.score = [memoIdx === null ? 0 : rolls[memoIdx]];
      } else {
        cand.score = scoreDice(ctx, dice, mentorIndex);
      }
      if (!best || better(cand.score, best.score)) best = cand;
    }
  }
  return best;
}

// Outcome of the dice from here on (Memorization/Coach/Mentor chosen well).
function downstreamScore(ctx, rolls) {
  const fin = chooseFinalDice(ctx, rolls);
  return ctx.stats ? fin.score : null;
}

// Crimp Sequence Decoder: which die (if any) to re-roll. With stats, pick the
// die whose re-roll gives the highest P(send) — re-rolling only when that
// beats keeping the current dice. Without stats, re-roll the die that is
// furthest on the wrong side of average (3.5), if any.
function chooseRerollTarget(ctx, rolls) {
  if (!ctx.stats) {
    let target = null;
    let worst = 0;
    for (const i of ctx.pickable) {
      const harm = ctx.mods[i] === 1 ? rolls[i] - 3.5 : 3.5 - rolls[i];
      if (harm > worst) { worst = harm; target = i; }
    }
    return target;
  }
  const keep = downstreamScore(ctx, rolls);
  let target = null;
  let bestP = keep[0];
  let bestMargin = keep[1];
  for (const i of ctx.live) {
    let p = 0;
    let margin = 0;
    for (let v = 1; v <= 6; v++) {
      const next = rolls.slice();
      next[i] = v;
      const s = downstreamScore(ctx, next);
      p += s[0] / 6;
      margin += s[1] / 6;
    }
    if (p > bestP + 1e-12 || (Math.abs(p - bestP) <= 1e-12 && target !== null && margin > bestMargin)) {
      bestP = p; bestMargin = margin; target = i;
    }
  }
  return target;
}

// Power Tap Belt: which die (if any) the extra die replaces. Discarding the
// extra die itself is always an option.
function chooseExtraDieSwap(ctx, rolls, extra) {
  if (!ctx.stats) {
    let bestIdx = null;
    let bestGain = 0;
    for (const i of ctx.pickable) {
      // Buff die: a higher die subtracts more. Nerf die: a lower die adds less.
      const gain = ctx.mods[i] === -1 ? extra - rolls[i] : rolls[i] - extra;
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    }
    return bestIdx;
  }
  let bestIdx = null;
  let best = downstreamScore(ctx, rolls);
  for (const i of ctx.live) {
    const next = rolls.slice();
    next[i] = extra;
    const s = downstreamScore(ctx, next);
    if (better(s, best)) { best = s; bestIdx = i; }
  }
  return bestIdx;
}

const STAT_KEYS = ['strength', 'technique', 'focus', 'flexibility'];

// =============================================================================
// EXACT SEND PROBABILITY
// =============================================================================

// Exact probability that a climb sends, given the climber's current state.
// Enumerates every die outcome through the SAME procedure the climb handler
// runs (finishClimbDice + applyDiceToRequirements + the 3-of-4 / 4-of-4 rule),
// including re-rolls and extra dice, so it cannot disagree with real climbs.
// A climb rolls at most 4 live dice plus 1 follow-up die: ≤ 7,776 outcomes.
//
// Does not check legality (access, Time, Endurance, stations, Free Solo's
// gate) — callers decide whether the climb may be started.
//
// Returns { pSend, expectedMargin, stats }. expectedMargin is the mean
// deciding margin (stat − requirement on the stat that settles the climb):
// useful to rank options when pSend is 0 or 1.
export function climbSendProbability(char, route, area, attemptedRoutesForPlayer = {}, { isMilestone = false, shift = null } = {}) {
  const stats = computeClimbStats(char, route, area, attemptedRoutesForPlayer, shift);
  // Memoised: the result depends only on the character, its gear, the climb's
  // stats and the route — and bots ask about the same climbs every turn.
  const memoKey = `${char.key}|${char.equipment.join(',')}|${stats.strength},${stats.technique},${stats.focus},${stats.flexibility}|` +
    `${isMilestone ? 1 : 0}|${route.strength},${route.technique},${route.focus},${route.flexibility}|${route.tag || ''}|` +
    `${(route.rollEffect || []).map(e => `${e.stat}${e.modifier}`).join(',')}|` +
    `${char.betaBoostActive ? 1 : 0}|${char.abilityParams ? JSON.stringify(char.abilityParams) : ''}`;
  const hit = SEND_MEMO.get(memoKey);
  if (hit) return { ...hit, stats };
  const result = exactSendProbability(char, route, isMilestone, stats);
  if (SEND_MEMO.size > 50000) SEND_MEMO.clear();
  SEND_MEMO.set(memoKey, result);
  return { ...result, stats };
}

const SEND_MEMO = new Map();

function exactSendProbability(char, route, isMilestone, stats) {
  const effects = buildEffectRollArray(char, route);
  const live = effects.map((e, i) => (effectiveDieModifier(char, e) !== 0 ? i : -1)).filter(i => i >= 0);
  const base = new Array(Math.max(2, effects.length)).fill(1);
  const combos = 6 ** live.length;
  let pSend = 0;
  let expectedMargin = 0;
  for (let code = 0; code < combos; code++) {
    const rolls = base.slice();
    let c = code;
    for (const i of live) { rolls[i] = (c % 6) + 1; c = Math.floor(c / 6); }
    enumerateFollowUpDraws(
      (draw) => {
        const res = finishClimbDice(rolls.slice(), draw, effects, char, route, isMilestone, stats);
        const { requirements } = applyDiceToRequirements(char, route, effects, res.dice, { mentorIndex: res.mentorIndex });
        return scoreRequirements(char, stats, requirements, isMilestone);
      },
      (score, weight) => {
        pSend += (score[0] * weight) / combos;
        expectedMargin += (score[1] * weight) / combos;
      },
    );
  }
  // Snap away float residue from summing sixths (6 × 1/6 → 0.9999…).
  const snap = (x) => Math.round(x * 1e12) / 1e12;
  return { pSend: snap(pSend), expectedMargin: snap(expectedMargin) };
}

// Run `run(draw)` once per possible sequence of follow-up d6 draws, calling
// emit(result, probability) for each. Sequences are discovered lazily: a run
// that asks for one more die than its scripted prefix is retried with that
// die fixed to each of 1..6.
const NEED_DIE = Symbol('need-die');
function enumerateFollowUpDraws(run, emit) {
  const stack = [[]];
  while (stack.length) {
    const prefix = stack.pop();
    let k = 0;
    const draw = () => {
      if (k < prefix.length) return prefix[k++];
      throw NEED_DIE;
    };
    try {
      emit(run(draw), 6 ** -prefix.length);
    } catch (e) {
      if (e !== NEED_DIE) throw e;
      for (let v = 1; v <= 6; v++) stack.push([...prefix, v]);
    }
  }
}

// Apply dice rolls and character overrides to produce final per-stat
// requirement values for this climb attempt.
// Character overrides:
//   - Free Solo: all dice effects are negated (modifier treated as 0).
//   - Technician: all nerf dice (modifier +1) are negated; then all base
//     requirements are reduced by 5 (floored at 0).
//
// Engine v0.3.0 gear effect (negateOneNerfDie / Mountain Mentor):
//   On every climb, the player may treat ONE nerf die (modifier +1) as 0.
//   `opts.mentorIndex` names that die (resolveClimbDice picks it); when it is
//   omitted, the first live nerf die is ignored (the stat-blind rule).
//
// Returns { requirements, appliedModifiers }
//   appliedModifiers = array of {die, stat, modifier, deltaApplied, source}
//   for telemetry. modifier is the POST-override value actually applied.
export function applyDiceToRequirements(char, route, effectRollArray, diceRolls, opts = {}) {
  const requirements = {
    strength: route.strength,
    technique: route.technique,
    focus: route.focus,
    flexibility: route.flexibility,
  };
  const appliedModifiers = [];

  const hasMentor = (char.equipment || []).some(name => {
    const g = GEAR_SHOP.find(x => x.name === name);
    return g && g.effectKind === 'negateOneNerfDie';
  });
  let mentorIndex = null;
  if (hasMentor) {
    if (opts.mentorIndex !== undefined) {
      mentorIndex = opts.mentorIndex;
    } else {
      const first = effectRollArray.findIndex(e => effectiveDieModifier(char, e) === 1);
      mentorIndex = first === -1 ? null : first;
    }
  }

  for (let i = 0; i < effectRollArray.length; i++) {
    const effect = effectRollArray[i];
    const die = diceRolls[i] ?? 0;
    let effectiveMod = effectiveDieModifier(char, effect);
    // Mountain Mentor — the chosen nerf die counts as 0.
    if (effectiveMod === 1 && i === mentorIndex) effectiveMod = 0;

    // stat may be outside the four stat fields only as paranoia; ignore
    // silently if so (matches game.js permissiveness).
    if (effectiveMod !== 0 && requirements[effect.stat] !== undefined) {
      const delta = effectiveMod * die;
      requirements[effect.stat] = requirements[effect.stat] + delta;
      appliedModifiers.push({
        die, stat: effect.stat, modifier: effectiveMod, deltaApplied: delta, source: effect.source || 'route',
      });
    } else {
      appliedModifiers.push({
        die, stat: effect.stat, modifier: effectiveMod, deltaApplied: 0, source: effect.source || 'route',
      });
    }
  }

  // Technician's blanket -5 to all requirements, floored at 0.
  if (char.key === 'technician') {
    const cut = abilityParam(char, 'reqReduction');
    for (const k of Object.keys(requirements)) {
      requirements[k] = Math.max(0, requirements[k] - cut);
    }
  }
  return { requirements, appliedModifiers };
}

// =============================================================================
// CLIMB RESOLUTION
// =============================================================================

// Determine climb success by comparing effectiveStats to modifiedRequirements.
// Route Reader's "Versatility" passive: succeeds if 3 of 4 stats pass.
// All other characters: must pass all 4.
// Returns { success, perStatPass }.
export function resolveClimbOutcome(char, effectiveStats, requirements, isMilestone = false) {
  const perStatPass = {
    strength:    effectiveStats.strength    >= requirements.strength,
    technique:   effectiveStats.technique   >= requirements.technique,
    focus:       effectiveStats.focus       >= requirements.focus,
    flexibility: effectiveStats.flexibility >= requirements.flexibility,
  };
  const passCount = Object.values(perStatPass).filter(Boolean).length;
  const { needed, nearMiss } = passRule(char, isMilestone);
  let success = passCount >= needed;
  // A Route Reader's one failing stat may have to be a near miss (variant).
  if (success && passCount < 4 && Number.isFinite(nearMiss)) {
    success = STAT_KEYS.every(k => effectiveStats[k] - requirements[k] >= -nearMiss);
  }
  return { success, perStatPass, passCount };
}

// Compute XP for a climb result.
// Base: route.xpSuccess on success, route.xpFail on failure.
// Sprinter passive: 0.5x multiplier applied FIRST.
// Iron Lung "Relentless" passive on FAIL: +50% of the post-multiplier fail XP.
//
// Engine v0.3.0 gear effect (failBonusXp / Confidence Building):
//   Adds a flat +N XP to every failed climb.
//
// Returns an integer (floored).
export function computeClimbXp(char, route, success) {
  const base = success ? route.xpSuccess : route.xpFail;
  let xp = base * getXpMultiplier(char);
  if (!success && char.key === 'ironLung') {
    xp += Math.floor(xp * abilityParam(char, 'failXpBonus'));
  }
  // Confidence Building: failed climbs get +N bonus XP
  if (!success) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'failBonusXp') xp += (gear.value || 0);
    }
  }
  return Math.floor(xp);
}

// Iron Lung "Relentless": extra 5 endurance cost on failure.
// Engine v0.3.0 gear effect (ignoreFailPenalty / Mental Anchor): ignores the penalty.
export function getFailureEnduranceExtra(char) {
  // Mental Anchor — bypass even Iron Lung's −5 fail penalty
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'ignoreFailPenalty') return 0;
  }
  return char.key === 'ironLung' ? abilityParam(char, 'failEndurance') : 0;
}

// Engine v0.3.0 — Power Spotting heals endurance after every successful climb.
// Returns the amount to heal (0 if no such gear owned).
export function getSuccessEnduranceHeal(char) {
  let heal = 0;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'successHealEndurance') heal += (gear.value || 0);
  }
  return heal;
}

// Endurance after a success heal of `heal`: the heal stops at maxEndurance but
// never takes endurance away, so endurance a rest pushed above max (rest-bonus
// gear) is kept.
export function applySuccessHeal(currentEndurance, maxEndurance, heal) {
  if (heal <= 0) return currentEndurance;
  return Math.max(currentEndurance, Math.min(maxEndurance, currentEndurance + heal));
}

// Owned gear cards with the given effectKind.
function ownedGearWithEffect(char, effectKind) {
  return (char.equipment || [])
    .map(name => GEAR_SHOP.find(g => g.name === name))
    .filter(g => g && g.effectKind === effectKind);
}

// The gear effectKinds describeClimbGearEffects can report on a climb. Other
// effect cards act on training (trainingBonusBoost, trainingCapBonus,
// freeTrainingSession), and plain stat cards are always on.
export const CLIMB_GEAR_EFFECT_KINDS = Object.freeze([
  'timeCostReduction', 'enduranceHalvedOnTag', 'rerollOnTag', 'treatOneDieAsValue', 'milestoneBuffDiceBonus',
  'extraDieDiscardOne', 'negateOneNerfDie', 'failBonusXp', 'ignoreFailPenalty', 'successHealEndurance',
]);

// Every gear effect that changed a resolved climb, as structured entries for
// the climb_resolved event (and the UIs that show it). Each entry has
// { gear, effectKind } plus effect-specific fields:
//   timeCostReduction / enduranceHalvedOnTag  from, to (the cost)
//   rerollOnTag / treatOneDieAsValue / milestoneBuffDiceBonus  die, from, to
//   extraDieDiscardOne  extra, die (-1 = the extra die was discarded), from, to
//   negateOneNerfDie  die, value, stat
//   failBonusXp  xp;  ignoreFailPenalty  endurance (penalty avoided)
//   successHealEndurance  endurance (actually healed)
// `diceTrace` is the trace from rollClimbDice; `appliedModifiers` comes from
// applyDiceToRequirements.
export function describeClimbGearEffects({
  char, route, effectRollArray, diceTrace, appliedModifiers, success, timeCost, enduranceCost, healed, isMilestone = false,
}) {
  const out = [];
  const names = (kind) => ownedGearWithEffect(char, kind).map(g => g.name).join(', ');

  const charOnlyTime = getEffectiveClimbTimeCost(char, route.time, null, isMilestone);
  if (timeCost < charOnlyTime) {
    out.push({ gear: names('timeCostReduction'), effectKind: 'timeCostReduction', from: charOnlyTime, to: timeCost });
  }
  if (enduranceCost < route.endurance) {
    out.push({ gear: names('enduranceHalvedOnTag'), effectKind: 'enduranceHalvedOnTag', from: route.endurance, to: enduranceCost });
  }
  for (const t of diceTrace) {
    if (t.effectKind === 'milestoneBuffDiceBonus' && t.from === t.to) continue; // already a 6
    out.push({ ...t });
  }
  const mentor = ownedGearWithEffect(char, 'negateOneNerfDie')[0];
  if (mentor) {
    effectRollArray.forEach((effect, i) => {
      if (effectiveDieModifier(char, effect) === 1 && appliedModifiers[i] && appliedModifiers[i].modifier === 0) {
        out.push({ gear: mentor.name, effectKind: 'negateOneNerfDie', die: i, value: appliedModifiers[i].die, stat: effect.stat });
      }
    });
  }
  if (!success) {
    for (const g of ownedGearWithEffect(char, 'failBonusXp')) {
      out.push({ gear: g.name, effectKind: 'failBonusXp', xp: g.value || 0 });
    }
    if (char.key === 'ironLung') {
      for (const g of ownedGearWithEffect(char, 'ignoreFailPenalty')) {
        out.push({ gear: g.name, effectKind: 'ignoreFailPenalty', endurance: abilityParam(char, 'failEndurance') });
      }
    }
  } else if (healed > 0) {
    out.push({ gear: names('successHealEndurance'), effectKind: 'successHealEndurance', endurance: healed });
  }
  return out;
}

// Engine v0.3.0 — Old Climbing Journal boosts every training session by +N.
// Returns the per-training bonus boost (0 if no such gear owned).
export function getTrainingBonusBoost(char) {
  let boost = 0;
  for (const gearName of char.equipment || []) {
    const gear = GEAR_SHOP.find(g => g.name === gearName);
    if (gear && gear.effectKind === 'trainingBonusBoost') boost += (gear.value || 0);
  }
  return boost;
}

// =============================================================================
// RULES VARIANTS (training) — for balance experiments
// =============================================================================
//
// A game may carry `state.rules`, an object of overrides used by the balance
// harness to A/B-test rule changes without editing code. Absent or empty, the
// game plays the standard rules exactly. Training fields:
//   trainTime            Time per session            (standard: the station's, 2)
//   trainBonus           stat gained per session     (standard: the station's, 5)
//   trainEnduranceMult   × station Endurance cost    (standard: 1)
//   trainCapBase,        cap on the TRAINING bonus per stat: base + perLevel ×
//   trainCapPerLevel     (Level − 1). Omit trainCapBase for no cap.
//   trainPerRound        max sessions per climber per round (standard: no limit)
// Grit economy (`rules.grit`, an object; off when absent). Experience and
// currency are separate: XP only raises your Level and is never spent; Grit
// buys training and gear.
//   routeGrit          Grit placed on a route card when it is dealt, by grade
//                      band [easy, mid, hard] (default [1, 2, 3]). The first
//                      climber to SEND the route takes it.
//   milestoneGrit      Grit for sending each milestone (per climber)
//                      (default { beginner: 2, intermediate: 3, expert: 4 }).
//   trainCost          Grit per training session (default 1).
//   gearPriceDivisor   gear price in Grit = max(1, round(XP cost / divisor))
//                      unless the card prints a gritCost (default 25).
//   start              Grit each climber starts with (default 0).
//   seatStart          extra starting Grit by seat, e.g. [0, 1, 2, 3] —
//                      compensates later seats for acting after seat 1.
//   perRound           Grit each climber gains at the start of every round
//                      after the first (default 0) — a floor so nobody is
//                      locked out of training when no route is in reach.
// Per-character overrides (`rules.characters[key]`):
//   gritStart          this climber's starting Grit (instead of grit.start)
//   trainCapMultiplier × this climber's training cap (default 1)
//   uncapped           true: no training cap for this climber
//   body               { startingStats, startingEndurance, growth } (each partial):
//                      this climber's numbers (applied by createGame)
//   gritPerRound       this climber's per-round Grit (instead of grit.perRound)
//   freeTraining       true: this climber's training sessions cost no Grit
// Cards marked `variantOnly: 'trainingCap'` exist only in games with a training
// cap (trainCapBase set): they are never dealt in the standard game.

// Time, Endurance and stat gain of one session at `area` for `char`.
export function trainingSpec(rules, area, char) {
  const r = rules || {};
  return {
    time: r.trainTime ?? area.time,
    endurance: Math.round(area.endurance * (r.trainEnduranceMult ?? 1)),
    gain: (r.trainBonus ?? area.bonus) + getTrainingBonusBoost(char),
  };
}

// Max training bonus per stat at the climber's Level (Infinity = no cap).
export function trainingCap(rules, char) {
  const r = rules || {};
  if (r.trainCapBase === undefined || r.trainCapBase === null) return Infinity;
  const own = (r.characters && r.characters[char.key]) || {};
  if (own.uncapped) return Infinity;
  // Hangboard Program (trainingCapBonus) raises the cap.
  let bonus = 0;
  for (const n of char.equipment || []) {
    const g = GEAR_SHOP.find(x => x.name === n);
    if (g && g.effectKind === 'trainingCapBonus') bonus += g.value || 0;
  }
  return (r.trainCapBase + (r.trainCapPerLevel ?? 0) * (char.level - 1)) * (own.trainCapMultiplier ?? 1) + bonus;
}

// May `char` train `stat` once more under the variant's cap / per-round limit
// / Grit cost? (Time, Endurance and station occupancy are checked by the caller.)
export function trainingAllowed(rules, char, stat, gain) {
  const r = rules || {};
  if (r.trainPerRound !== undefined && (char.trainedThisRound || 0) >= r.trainPerRound) return false;
  if ((char.grit || 0) < trainingGritCost(rules, char)) return false;
  return char.trainingBonuses[stat] + gain <= trainingCap(rules, char);
}

// ----- Grit economy -----

const DEFAULT_ROUTE_GRIT = [1, 2, 3];
const DEFAULT_MILESTONE_GRIT = { beginner: 2, intermediate: 3, expert: 4 };

// The game's rules (1.1.0): the Grit economy. Local and online play create
// every game with these (docs/CPU_PLAYTEST_AUDIT.md §10–14):
//   - route cards carry 2 / 3 / 4 Grit by grade band; the first climber to
//     send a route takes it; Milestone sends pay 2 / 3 / 4;
//   - training costs 1 Grit and is capped at 10 + 5 per Level above 1;
//   - gear is priced in Grit; XP only raises your Level and is never spent;
//   - later seats start with 0 / 2 / 4 / 6 Grit;
//   - Free Solo gains 2 Grit every round (it can only send routes it already
//     beats, so without an income it soft-locks).
// The climbers' balance changes are printed abilities (DEFAULT_ABILITY) and
// character data, so they apply under any rules.
export const GRIT_RULES = Object.freeze({
  grit: { start: 0, perRound: 0, routeGrit: [2, 3, 4], seatStart: [0, 2, 4, 6] },
  trainCapBase: 10,
  trainCapPerLevel: 5,
  characters: { freeSolo: { gritPerRound: 2 } },
});

// Grit a climber gains at the start of each round after the first.
export function perRoundGrit(rules, key) {
  const own = rules.characters && rules.characters[key];
  return (own && own.gritPerRound !== undefined) ? own.gritPerRound : (rules.grit.perRound ?? 0);
}

// Starting Grit for a climber under `rules` (seat is 0-based).
export function startingGrit(rules, key, seat = 0) {
  const own = rules.characters && rules.characters[key];
  const base = (own && own.gritStart !== undefined) ? own.gritStart : (rules.grit.start ?? 0);
  return base + ((rules.grit.seatStart && rules.grit.seatStart[seat]) || 0);
}

export function usesGrit(rules) {
  return !!(rules && rules.grit);
}

// Grade band of a route: 0 easy (V0–V2, 5.6–5.9), 1 mid (V3–V7, 5.10–5.11),
// 2 hard (V8+, 5.12+).
export function gradeBand(route) {
  const g = String(route.grade || '');
  if (g.startsWith('V')) {
    const v = Number(g.slice(1));
    return v <= 2 ? 0 : v <= 7 ? 1 : 2;
  }
  const m = g.match(/^5\.(\d+)/);
  const yds = m ? Number(m[1]) : 0;
  return yds <= 9 ? 0 : yds <= 11 ? 1 : 2;
}

// Grit a freshly dealt route card carries.
export function routeGritValue(rules, route) {
  const table = (rules.grit && rules.grit.routeGrit) || DEFAULT_ROUTE_GRIT;
  return table[gradeBand(route)] ?? 0;
}

// Copies of `routes` with their Grit placed, when the Grit economy is on;
// otherwise `routes` unchanged. Used whenever route cards are dealt.
export function dealRouteGrit(rules, routes) {
  if (!usesGrit(rules)) return routes;
  return routes.map(r => ({ ...r, grit: routeGritValue(rules, r) }));
}

export function milestoneGritReward(rules, tier) {
  if (!usesGrit(rules)) return 0;
  const table = rules.grit.milestoneGrit || DEFAULT_MILESTONE_GRIT;
  return table[tier] || 0;
}

// Grit the next training session costs `char` (0 without the economy, or
// when Training Partner's free session is still unused this round).
export function trainingGritCost(rules, char) {
  if (!usesGrit(rules)) return 0;
  if (rules.characters && rules.characters[char.key] && rules.characters[char.key].freeTraining) return 0;
  if (ownsEffect(char, 'freeTrainingSession') && !char.freeSessionUsed) return 0;
  return rules.grit.trainCost ?? 1;
}

// Price of `gear` for `char`: Grit in the Grit economy, else XP.
export function gearPrice(rules, char, gear) {
  if (!usesGrit(rules)) return getEffectiveGearCost(char, gear);
  if (typeof gear.gritCost === 'number') return gear.gritCost;
  const div = rules.grit.gearPriceDivisor || 25;
  return Math.max(1, Math.round(gear.cost / div));
}

// What `char` can spend on gear: Grit, or XP earned since the Level began.
export function gearFunds(rules, char) {
  return usesGrit(rules) ? (char.grit || 0) : getSpendableXp(char);
}

// Pay for gear (mutates char). In the Grit economy XP is never spent.
export function payForGear(rules, char, cost) {
  if (usesGrit(rules)) char.grit = (char.grit || 0) - cost;
  else char.xp -= cost;
}

// Is `gear` part of this game's deck? (variantOnly cards need their variant.)
export function gearInGame(rules, gear) {
  if (!gear.variantOnly) return true;
  if (gear.variantOnly === 'trainingCap') return !!(rules && rules.trainCapBase !== undefined && rules.trainCapBase !== null);
  return false;
}

// Grit a climb earns `char`, applied in place: a regular send takes the
// Grit on the route card (and empties the card); a milestone send pays its
// tier's reward. Falls earn nothing. `route` is the card in play (bots pass a
// copy). Returns the Grit gained.
export function claimClimbGrit(rules, char, route, { isMilestone, success, tier }) {
  if (!usesGrit(rules) || !success) return 0;
  const gained = isMilestone ? milestoneGritReward(rules, tier) : (route.grit || 0);
  if (!isMilestone) route.grit = 0;
  char.grit = (char.grit || 0) + gained;
  return gained;
}

function ownsEffect(char, kind) {
  return (char.equipment || []).some(n => {
    const g = GEAR_SHOP.find(x => x.name === n);
    return g && g.effectKind === kind;
  });
}

// =============================================================================
// FREE SOLO GUARANTEE CHECK
// =============================================================================

// Free Solo's "Life or Die" requires that the player's stats meet or exceed
// every base route requirement (before dice). This gates climbs at the
// legal-action level so Free Solo can never attempt a route that might fail.
//
// Engine v0.3.1 (2026-05-03) — TRAINING FIX:
//   Previously this check used `char.stats` only, meaning training and
//   permanent gear bonuses didn't help Free Solo unlock new routes.
//   Combined with the fact that v0.3.0 has no permanent stat-boost cards
//   and that XP only comes from climbing, this made Free Solo unwinnable
//   (chicken-and-egg: can't climb → can't earn XP → can't level up → still
//   can't climb). Now training bonuses AND permanent gear bonuses count
//   toward the guarantee. Per-route gear bonuses (situational discounts
//   like Crimp Sequence Decoder's tag re-roll) still do NOT count — those
//   are climb-time effects, not "do I have the strength" capabilities.
export function freeSoloCanAttempt(char, route) {
  if (char.key !== 'freeSolo') return true;
  const get = (s) =>
    char.stats[s] +
    (char.trainingBonuses?.[s] || 0) +
    (char.gearBonuses?.[s] || 0);
  return (
    get('strength')    >= route.strength &&
    get('technique')   >= route.technique &&
    get('focus')       >= route.focus &&
    get('flexibility') >= route.flexibility
  );
}

// =============================================================================
// BETA BOOST APPLICATION (Route Reader, resting-granted)
// =============================================================================

// Consume betaBoostActive on char and return adjusted stats. Mutates char
// (flips the flag false) — this is in the apply* family of functions.
// If the flag isn't set, returns the input stats unchanged.
export function applyBetaBoostIfActive(char, effectiveStats) {
  if (!char.betaBoostActive) return { stats: effectiveStats, consumed: false };
  const boosted = {
    strength:    effectiveStats.strength    + 3,
    technique:   effectiveStats.technique   + 3,
    focus:       effectiveStats.focus       + 3,
    flexibility: effectiveStats.flexibility + 3,
  };
  char.betaBoostActive = false;
  return { stats: boosted, consumed: true };
}

// =============================================================================
// ROUTE READER STAT SHIFT ("Versatility", once per round, regular climbs only)
// =============================================================================

// Before a regular (non-milestone) climb, a Route Reader may move up to
// MAX_STAT_SHIFT points from one stat to another for that climb only.
// A shift is { from, to, amount }.
export const MAX_STAT_SHIFT = 10;
const SHIFT_STATS = ['strength', 'technique', 'focus', 'flexibility'];

// Is `shift` well-formed (two different stats, whole amount 1..MAX_STAT_SHIFT)?
export function isWellFormedStatShift(shift) {
  return !!shift && typeof shift === 'object' &&
    SHIFT_STATS.includes(shift.from) && SHIFT_STATS.includes(shift.to) &&
    shift.from !== shift.to &&
    Number.isInteger(shift.amount) && shift.amount >= 1 && shift.amount <= MAX_STAT_SHIFT;
}

// May this character use a stat shift right now on this kind of climb?
export function canUseStatShift(char, isMilestone) {
  return char.key === 'routeReader' && !char.abilityUsed && (!isMilestone || abilityParam(char, 'shiftOnMilestones'));
}

// Return a copy of `stats` with the shift applied.
export function applyStatShiftToStats(stats, shift) {
  return { ...stats, [shift.from]: stats[shift.from] - shift.amount, [shift.to]: stats[shift.to] + shift.amount };
}

// Pick the most useful shift for a Route Reader before the dice are rolled,
// or null if no shift helps. A Route Reader sends when 3 of 4 stats pass, so
// the stat that decides the climb is the one with the 3rd-largest margin
// (stat − base requirement). We maximise that margin, then prefer the smallest
// amount that achieves it. Only offered when the margin is under 6 (one die's
// swing). Read-only: does not consume the ability.
export function bestRouteReaderShift(char, route, area, attemptedRoutesForPlayer, isMilestone = false) {
  if (char.key !== 'routeReader') return null;
  let stats = computeEffectiveStats(char, route, area, attemptedRoutesForPlayer);
  if (char.betaBoostActive) {
    const b = abilityParam(char, 'betaBoost') ?? 3;
    stats = Object.fromEntries(SHIFT_STATS.map(k => [k, stats[k] + b]));
  }
  // The margin that settles the climb under this climber's send rule (passRule).
  const { needed, nearMiss } = passRule(char, isMilestone);
  const deciding = (st) => {
    const m = SHIFT_STATS.map(k => st[k] - route[k]).sort((a, b) => b - a);
    return needed === 4 ? m[3] : Math.min(m[2], m[3] + nearMiss);
  };
  const baseline = deciding(stats);
  // A single die swings a requirement by at most 6. With a bigger margin the
  // climb is already safe, so don't offer (or waste) the once-per-round shift.
  if (baseline >= 6) return null;
  let best = null;
  let bestScore = baseline;
  for (const from of SHIFT_STATS) {
    for (const to of SHIFT_STATS) {
      if (from === to) continue;
      for (let amount = 1; amount <= MAX_STAT_SHIFT; amount++) {
        const score = deciding(applyStatShiftToStats(stats, { from, to, amount }));
        if (score > bestScore) { bestScore = score; best = { from, to, amount }; }
      }
    }
  }
  return best;
}

// =============================================================================
// REST RECOVERY (game.js:1958-2006)
// =============================================================================

// Compute post-rest endurance. Formula (from game.js):
//   recovery = char.maxEndurance
//   restBonus = sum(gear.restBonus over equipment)
//   newEndurance = min(maxEndurance + restBonus, currentEndurance + recovery)
// That is: rest gives you back one full maxEndurance of stamina, but caps
// at (maxEndurance + restBonus). The cap lets rest-bonus gear push you
// ABOVE max. Somewhat unusual but matches game.js.
export function computeRestRecovery(char) {
  let restBonus = 0;
  for (const name of char.equipment) {
    const g = GEAR_SHOP.find(x => x.name === name);
    if (g && typeof g.restBonus === 'number') restBonus += g.restBonus;
  }
  const recovery = char.maxEndurance;
  const cap = char.maxEndurance + restBonus;
  const next = Math.min(cap, char.currentEndurance + recovery);
  return { newEndurance: next, delta: next - char.currentEndurance, restBonusApplied: restBonus };
}

// =============================================================================
// LEVEL-UP (game.js:2393-2435)
// =============================================================================

// Permanent max-endurance granted by owned gear (e.g. Locking Carabiner +5).
// Level-up recomputes maxEndurance from the growth formula, so this has to be
// added back or the gear bonus would vanish at the next level.
export function getGearMaxEnduranceBonus(char) {
  let bonus = 0;
  for (const name of char.equipment || []) {
    const g = GEAR_SHOP.find(x => x.name === name);
    if (!g) continue;
    if (g.statEffect === 'endurance') bonus += g.value;
    if (typeof g.enduranceBonus === 'number') bonus += g.enduranceBonus;
  }
  return bonus;
}

// If the character's cumulative XP has crossed the next-level threshold,
// advance level and recompute stats from the growth formula. Mutates char.
// Returns { leveledUp: boolean, newLevel, oldStats, newStats, oldMaxEndurance, newMaxEndurance }.
export function applyLevelUpIfNeeded(char) {
  if (char.level >= 15) return { leveledUp: false };
  const nextRow = XP_TABLE.find(r => r.level === char.level + 1);
  if (!nextRow) return { leveledUp: false };
  if (char.xp < nextRow.cumulative) return { leveledUp: false };

  // The climber's own body numbers (a rules variant may have adjusted them at
  // setup — rules.characters[key].body), else the character template's.
  const base = CHARACTERS[char.key];
  const tmpl = {
    startingStats: char.startingStats || base.startingStats,
    startingEndurance: char.startingEndurance ?? base.startingEndurance,
    growth: char.growth || base.growth,
  };
  const oldStats = { ...char.stats };
  const oldMaxEndurance = char.maxEndurance;
  char.level += 1;
  // Stats recompute from the base + growth formula (game.js:2422-2431).
  // Note: char.gearBonuses is SEPARATE from char.stats, so permanent
  // gear-trained bonuses persist correctly through level-up.
  char.stats = {
    strength:    Math.round(tmpl.startingStats.strength    + tmpl.growth.strength    * (char.level - 1)),
    technique:   Math.round(tmpl.startingStats.technique   + tmpl.growth.technique   * (char.level - 1)),
    focus:       Math.round(tmpl.startingStats.focus       + tmpl.growth.focus       * (char.level - 1)),
    flexibility: Math.round(tmpl.startingStats.flexibility + tmpl.growth.flexibility * (char.level - 1)),
  };
  char.maxEndurance = Math.round(tmpl.startingEndurance + tmpl.growth.endurance * (char.level - 1))
    + getGearMaxEnduranceBonus(char);
  return {
    leveledUp: true,
    newLevel: char.level,
    oldStats,
    newStats: { ...char.stats },
    oldMaxEndurance,
    newMaxEndurance: char.maxEndurance,
  };
}

// =============================================================================
// TOOL-CALL DISPATCH — Lite CPP action encoding
// =============================================================================
//
// Maps a semantic tool call ({tool, args}) to a concrete engine action from
// legalActions. Purpose: eliminate the "action_index" translation step where
// LLM rationale ("train Strength") and executed action ("Grip Board / Focus")
// have been observed to drift.
//
// This is a PURE function — no engine state coupling, no I/O. Callers pass
// their pre-computed legalActions list; we scan and match. Returns either:
//   { ok: true, action }        — dispatch succeeded; use `action` verbatim
//   { ok: false, reason, detail } — well-formed but illegal (station occupied,
//                                    route not in pool, unknown gear). The
//                                    LLM can react to `reason` on a retry
//                                    (see retry loop in sim/agents/ollama.js).
//
// Tool schema (advertised to the LLM in the tool-mode system prompt):
//   train              args: { stat: strength|technique|focus|flexibility }
//   rest               args: {}
//   climb              args: { route_name: string }
//   attempt_milestone  args: { tier:  beginner|intermediate|expert }
//   buy_gear           args: { gear_name: string }
//   end_turn           args: {}
const TOOL_STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TOOL_TIERS = ['beginner', 'intermediate', 'expert'];

// Reason codes are stable string enums so downstream analysis (drift script,
// build-report) and the retry-error prompt can pattern-match without parsing.
export function dispatchToolCall(legalActions, toolCall) {
  if (!toolCall || typeof toolCall !== 'object') {
    return { ok: false, reason: 'malformed_call', detail: 'toolCall must be an object with `tool` and `args`' };
  }
  const { tool } = toolCall;
  // Accept both snake_case (args.route_name) and camelCase (args.routeName)
  // since different LLMs / templates emit different keys.
  const args = toolCall.args || {};
  const get = (snake, camel) => args[snake] ?? args[camel];

  switch (tool) {
    case 'end_turn': {
      const match = legalActions.find(a => a.type === 'endTurn');
      return match
        ? { ok: true, action: match }
        : { ok: false, reason: 'end_turn_unavailable', detail: 'engine did not emit an endTurn action' };
    }

    case 'rest': {
      const match = legalActions.find(a => a.type === 'rest');
      return match
        ? { ok: true, action: match }
        : { ok: false, reason: 'no_time_for_rest', detail: 'rest requires at least 1 time; you may be out of time this turn' };
    }

    case 'train': {
      const stat = String(get('stat', 'stat') || '').toLowerCase();
      if (!TOOL_STATS.includes(stat)) {
        return { ok: false, reason: 'invalid_stat', detail: `stat must be one of ${TOOL_STATS.join('|')} (got ${JSON.stringify(get('stat', 'stat'))})` };
      }
      const area = TRAINING_AREAS.find(a => a.stat === stat);
      if (!area) {
        // Defensive; TRAINING_AREAS covers all four stats.
        return { ok: false, reason: 'no_area_for_stat', detail: stat };
      }
      const match = legalActions.find(a => a.type === 'train' && a.areaName === area.name);
      return match
        ? { ok: true, action: match }
        : { ok: false, reason: 'train_station_unavailable',
            detail: `${area.name} (${stat}) is not available — occupied by another player, or you lack time/endurance` };
    }

    case 'climb': {
      const routeName = String(get('route_name', 'routeName') || '');
      if (!routeName) {
        return { ok: false, reason: 'missing_route_name', detail: 'climb requires args.route_name' };
      }
      const match = legalActions.find(a => a.type === 'climb' && a.routeName === routeName);
      if (match) return { ok: true, action: match };
      const climbable = legalActions.filter(a => a.type === 'climb').map(a => a.routeName);
      return {
        ok: false, reason: 'route_not_climbable',
        detail: `route "${routeName}" is not climbable this turn (already attempted this round, or not in the accessible pool). Currently climbable: ${climbable.slice(0, 6).join(', ') || '(none)'}`,
      };
    }

    case 'attempt_milestone': {
      const tier = String(get('tier', 'tier') || '').toLowerCase();
      if (!TOOL_TIERS.includes(tier)) {
        return { ok: false, reason: 'invalid_tier', detail: `tier must be one of ${TOOL_TIERS.join('|')} (got ${JSON.stringify(get('tier', 'tier'))})` };
      }
      const match = legalActions.find(a => a.type === 'milestone' && a.difficulty === tier);
      if (match) return { ok: true, action: match };
      const attemptable = legalActions.filter(a => a.type === 'milestone').map(a => a.difficulty);
      return {
        ok: false, reason: 'milestone_not_attemptable',
        detail: `${tier} milestone not attemptable — already completed, blocked by access cards, insufficient time/endurance, or another climber holds the belayer station. Attemptable now: ${attemptable.join(', ') || '(none)'}`,
      };
    }

    case 'buy_gear': {
      const gearName = String(get('gear_name', 'gearName') || '');
      if (!gearName) {
        return { ok: false, reason: 'missing_gear_name', detail: 'buy_gear requires args.gear_name' };
      }
      const match = legalActions.find(a => a.type === 'buyGear' && a.gearName === gearName);
      if (match) return { ok: true, action: match };
      const purchasable = legalActions.filter(a => a.type === 'buyGear').map(a => a.gearName);
      return {
        ok: false, reason: 'gear_not_buyable',
        detail: `"${gearName}" is not purchasable this turn (not in the shop's rotation slots, missing prereqs, or insufficient XP/time). Currently purchasable: ${purchasable.join(', ') || '(none)'}`,
      };
    }

    default:
      return {
        ok: false, reason: 'unknown_tool',
        detail: `unknown tool "${tool}". Valid tools: train, rest, climb, attempt_milestone, buy_gear, end_turn`,
      };
  }
}
