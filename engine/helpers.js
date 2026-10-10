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

// =============================================================================
// COST MODIFIERS (character passives)
// =============================================================================

// Effective time cost of a climb for this character.
// Sprinter's "Flash Speed": -2 (min 1). Technician's "Perfect Beta": +1.
// Engine v0.3.0 also applies gear effectKind 'timeCostReduction' for tagged routes
// (Trick Foot Manual: Toe/Heel Hook climbs cost 1 less time).
export function getEffectiveClimbTimeCost(char, baseTime, route = null) {
  let t = baseTime;
  if (char.key === 'sprinter') t = Math.max(1, t - 2);
  if (char.key === 'technician') t += 1;
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
  return char.key === 'sprinter' ? 0.5 : 1.0;
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
  if (char.key === 'sprinter') {
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
// ignored, matching game.js behavior. Die i is applied to effectRollArray[i].
//
// Gear effects on dice (applied AFTER the initial roll, in this order):
//   - Crimp Sequence Decoder (rerollOnTag, Pinch/Crimp): re-roll one die. We
//     re-roll the highest die (deterministic best-effort policy).
//   - Power Tap Belt (extraDieDiscardOne, Dynamic): roll ONE extra die, then
//     discard any one die — so an N-die climb rolls N+1 and keeps N. In
//     practice the extra die is swapped in for whichever die it improves the
//     most (a buff die wants a high number, a nerf die a low one), or is
//     itself discarded if it improves nothing.
//   - Sequence Memorization (treatOneDieAsValue=1, every climb): treat one die
//     as 1. Applied as a final pass — replace the highest die with 1.
//   - Climbing Coach (milestoneBuffDiceBonus, milestone climbs only): every
//     BUFF die (modifier -1) is +1, max 6. Nerf dice are untouched.
export function rollClimbDice(rng, effectRollArray, char = null, route = null, isMilestone = false) {
  const numDice = Math.max(2, effectRollArray.length);
  const ownedGear = (char && char.equipment ? char.equipment : [])
    .map(name => GEAR_SHOP.find(g => g.name === name))
    .filter(Boolean);
  const onTag = (gear) => route && route.tag && gear.tagFilter === route.tag;

  const rolls = [];
  for (let i = 0; i < numDice; i++) rolls.push(rng.rollDie(6));

  // Crimp Sequence Decoder: re-roll one die on tagged climbs (re-roll the highest).
  for (const gear of ownedGear) {
    if (gear.effectKind === 'rerollOnTag' && onTag(gear)) {
      let maxIdx = 0;
      for (let i = 1; i < rolls.length; i++) if (rolls[i] > rolls[maxIdx]) maxIdx = i;
      rolls[maxIdx] = rng.rollDie(6);
    }
  }

  // Power Tap Belt: roll an extra die, keep the best N (discard one).
  for (const gear of ownedGear) {
    if (gear.effectKind === 'extraDieDiscardOne' && onTag(gear)) {
      const extra = rng.rollDie(6);
      let bestIdx = -1;
      let bestGain = 0;
      for (let i = 0; i < effectRollArray.length; i++) {
        const mod = effectiveDieModifier(char, effectRollArray[i]);
        // Buff die (mod -1): a higher die subtracts more. Nerf die (mod +1):
        // a lower die adds less.
        const gain = mod === -1 ? extra - rolls[i] : mod === 1 ? rolls[i] - extra : 0;
        if (gain > bestGain) { bestGain = gain; bestIdx = i; }
      }
      if (bestIdx !== -1) rolls[bestIdx] = extra;
    }
  }

  // Sequence Memorization: every climb, treat one die as 1 (replace highest die with 1)
  for (const gear of ownedGear) {
    if (gear.effectKind === 'treatOneDieAsValue') {
      const target = gear.value || 1;
      let maxIdx = 0;
      for (let i = 1; i < rolls.length; i++) if (rolls[i] > rolls[maxIdx]) maxIdx = i;
      if (rolls[maxIdx] > target) rolls[maxIdx] = target;
    }
  }

  // Climbing Coach: on milestone climbs, every buff die +1 (max 6).
  if (isMilestone) {
    for (const gear of ownedGear) {
      if (gear.effectKind === 'milestoneBuffDiceBonus') {
        const bonus = gear.value || 1;
        for (let i = 0; i < effectRollArray.length; i++) {
          if (effectRollArray[i].modifier === -1) rolls[i] = Math.min(6, rolls[i] + bonus);
        }
      }
    }
  }
  return rolls;
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
//   We apply this to the FIRST nerf die encountered (best-effort policy).
//
// Returns { requirements, appliedModifiers }
//   appliedModifiers = array of {die, stat, modifier, deltaApplied, source}
//   for telemetry. modifier is the POST-override value actually applied.
export function applyDiceToRequirements(char, route, effectRollArray, diceRolls) {
  const requirements = {
    strength: route.strength,
    technique: route.technique,
    focus: route.focus,
    flexibility: route.flexibility,
  };
  const appliedModifiers = [];

  // Mountain Mentor: negate ONE nerf die per climb (one-shot per climb)
  let mountainMentorAvailable = (char.equipment || []).some(name => {
    const g = GEAR_SHOP.find(x => x.name === name);
    return g && g.effectKind === 'negateOneNerfDie';
  });

  for (let i = 0; i < effectRollArray.length; i++) {
    const effect = effectRollArray[i];
    const die = diceRolls[i] ?? 0;
    let effectiveMod = effect.modifier;

    if (char.key === 'freeSolo') effectiveMod = 0;
    if (char.key === 'technician' && effectiveMod === 1) effectiveMod = 0;
    // Mountain Mentor — apply to the first nerf die we see that hasn't already been negated.
    if (effectiveMod === 1 && mountainMentorAvailable) {
      effectiveMod = 0;
      mountainMentorAvailable = false;
    }

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
    for (const k of Object.keys(requirements)) {
      requirements[k] = Math.max(0, requirements[k] - 5);
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
export function resolveClimbOutcome(char, effectiveStats, requirements) {
  const perStatPass = {
    strength:    effectiveStats.strength    >= requirements.strength,
    technique:   effectiveStats.technique   >= requirements.technique,
    focus:       effectiveStats.focus       >= requirements.focus,
    flexibility: effectiveStats.flexibility >= requirements.flexibility,
  };
  const passCount = Object.values(perStatPass).filter(Boolean).length;
  const needed = char.key === 'routeReader' ? 3 : 4;
  return { success: passCount >= needed, perStatPass, passCount };
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
    xp += Math.floor(xp * 0.5);
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
  return char.key === 'ironLung' ? 5 : 0;
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
  return char.key === 'routeReader' && !char.abilityUsed && !isMilestone;
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
export function bestRouteReaderShift(char, route, area, attemptedRoutesForPlayer) {
  if (char.key !== 'routeReader') return null;
  let stats = computeEffectiveStats(char, route, area, attemptedRoutesForPlayer);
  if (char.betaBoostActive) {
    stats = Object.fromEntries(SHIFT_STATS.map(k => [k, stats[k] + 3]));
  }
  const deciding = (st) => SHIFT_STATS.map(k => st[k] - route[k]).sort((a, b) => b - a)[2];
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

  const tmpl = CHARACTERS[char.key];
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
