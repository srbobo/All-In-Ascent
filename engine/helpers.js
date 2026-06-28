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

// Roll the dice for a climb. `numDice` is max(2, effects.length) — even on a
// Type-C "Pure Skill" route (empty rollEffect) we roll 2 dice that get
// ignored, matching game.js behavior.
//
// Engine v0.3.0 gear effects on dice (applied AFTER initial roll):
//   - Crimp Sequence Decoder (rerollOnTag, Pinch/Crimp): re-roll the highest die once.
//     We re-roll the WORST die (highest value, since lower is better when applying
//     buff dice and unchanged-or-better when applying nerf dice; on average lower is
//     a better outcome for the player). This is a deterministic best-effort policy.
//   - Power Tap Belt (extraDieBestN, Dynamic): roll N+1 dice, keep best 2 (lowest 2).
//   - Sequence Memorization (treatOneDieAsValue=1, every climb): treat one die as 1.
//     Applied as a final pass — replace the highest die with 1 if 1 is better.
//   - Climbing Coach (milestoneDiceBonus, milestone climbs only): every die +1.
//     Applied here as a uniform shift; cancels out on buff dice (modifier -1) but
//     hurts on nerf dice (+1) — this is a NET POSITIVE in expectation only when the
//     player has more buff dice than nerf dice on the route.
export function rollClimbDice(rng, effectRollArray, char = null, route = null, isMilestone = false) {
  let numDice = Math.max(2, effectRollArray.length);
  // Power Tap Belt: extra die on Dynamic
  let extraDie = 0;
  let keepBest = numDice;
  if (char && route && route.tag) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (!gear) continue;
      if (gear.effectKind === 'extraDieBestN' && gear.tagFilter === route.tag) {
        extraDie++;
        keepBest = gear.value || numDice; // typically 2
      }
    }
  }
  const rolls = [];
  for (let i = 0; i < numDice + extraDie; i++) rolls.push(rng.rollDie(6));
  // Crimp Sequence Decoder: re-roll one die on tagged climbs (re-roll the highest = worst)
  if (char && route && route.tag) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'rerollOnTag' && gear.tagFilter === route.tag) {
        // Find index of highest die and re-roll it
        let maxIdx = 0;
        for (let i = 1; i < rolls.length; i++) if (rolls[i] > rolls[maxIdx]) maxIdx = i;
        rolls[maxIdx] = rng.rollDie(6);
      }
    }
  }
  // If we have an extra die from Power Tap Belt, keep only the best `keepBest` dice
  // (lowest values, since lower is generally better — this is consistent with how
  // buff dice work in the game).
  let finalRolls = rolls;
  if (extraDie > 0) {
    const sorted = rolls.slice().sort((a, b) => a - b);
    finalRolls = sorted.slice(0, keepBest);
  }
  // Sequence Memorization: every climb, treat one die as 1 (replace highest die with 1)
  if (char) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'treatOneDieAsValue') {
        const target = gear.value || 1;
        let maxIdx = 0;
        for (let i = 1; i < finalRolls.length; i++) if (finalRolls[i] > finalRolls[maxIdx]) maxIdx = i;
        if (finalRolls[maxIdx] > target) finalRolls[maxIdx] = target;
      }
    }
  }
  // Climbing Coach: on milestone climbs, every die +1
  if (isMilestone && char) {
    for (const gearName of char.equipment || []) {
      const gear = GEAR_SHOP.find(g => g.name === gearName);
      if (gear && gear.effectKind === 'milestoneDiceBonus') {
        const bonus = gear.value || 1;
        finalRolls = finalRolls.map(r => Math.min(6, r + bonus));
      }
    }
  }
  return finalRolls;
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
  char.maxEndurance = Math.round(tmpl.startingEndurance + tmpl.growth.endurance * (char.level - 1));
  return {
    leveledUp: true,
    newLevel: char.level,
    oldStats,
    newStats: { ...char.stats },
    oldMaxEndurance,
    newMaxEndurance: char.maxEndurance,
  };
}
