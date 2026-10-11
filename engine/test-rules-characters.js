// Tests for per-character ability tuning (rules.characters[key].ability →
// char.abilityParams), used to simulate character balance changes.
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Each ability's printed numbers are the defaults (DEFAULT_ABILITY); these
// checks confirm every tunable number changes what it should, and that exact
// P(send) still matches real climbs under a tuned Route Reader.

import { createGame } from './state.js';
import { applyAction, getLegalActions, illegalActionReason } from './engine.js';
import {
  resolveClimbOutcome, computeClimbXp, getEffectiveClimbTimeCost, buildEffectRollArray,
  applyDiceToRequirements, climbSendProbability, abilityParam, getFailureEnduranceExtra, applyLevelUpIfNeeded,
} from './helpers.js';
import { deriveSeed, createRng } from './rng.js';
import { ROUTES } from './data.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const zero = () => ({ strength: 0, technique: 0, focus: 0, flexibility: 0 });
const climber = (key, abilityParams, extra = {}) => ({
  key, level: 1, xp: 0, stats: { strength: 20, technique: 20, focus: 20, flexibility: 20 },
  trainingBonuses: zero(), gearBonuses: zero(), equipment: [], betaBoostActive: false,
  ...(abilityParams ? { abilityParams } : {}), ...extra,
});
const reqs = { strength: 20, technique: 20, focus: 20, flexibility: 26 };   // flexibility misses by 6
const stats = { strength: 20, technique: 20, focus: 20, flexibility: 20 };

// =============================================================================
// Route Reader
// =============================================================================
{
  check('default Route Reader: 3 of 4 sends anywhere',
    resolveClimbOutcome(climber('routeReader'), stats, reqs, false).success &&
    resolveClimbOutcome(climber('routeReader'), stats, reqs, true).success);
  const m4 = climber('routeReader', { milestonePasses: 4 });
  check('milestonePasses 4: regular routes still 3 of 4', resolveClimbOutcome(m4, stats, reqs, false).success);
  check('milestonePasses 4: a Milestone needs all 4', !resolveClimbOutcome(m4, stats, reqs, true).success);

  const bo = climber('routeReader', { boostOnly: true });
  check('boostOnly: no Beta Boost → needs all 4', !resolveClimbOutcome(bo, stats, reqs).success);
  check('boostOnly: with Beta Boost → 3 of 4', resolveClimbOutcome({ ...bo, betaBoostActive: true }, stats, reqs).success);

  const nm = climber('routeReader', { nearMiss: 5 });
  check('nearMiss 5: missing by 6 fails', !resolveClimbOutcome(nm, stats, reqs).success);
  check('nearMiss 5: missing by 5 sends',
    resolveClimbOutcome(nm, stats, { ...reqs, flexibility: 25 }).success);

  // The engine keeps the Beta Boost until the outcome is known, so boostOnly works in play.
  const { state } = createGame({ seed: 4, characterKeys: ['routeReader'], rules: { characters: { routeReader: { ability: { boostOnly: true } } } } });
  check('createGame copies ability tuning onto the climber', state.players[0].character.abilityParams.boostOnly === true);
  const c = state.players[0].character;
  const route = state.availableRoutes.bouldering[0];
  for (const k of ['strength', 'technique', 'focus', 'flexibility']) c.trainingBonuses[k] = 200 - c.stats[k];
  c.trainingBonuses.flexibility = -500;     // flexibility can never pass
  c.currentEndurance = 999;
  c.betaBoostActive = true;
  const { state: s1, events } = applyAction(state, { type: 'climb', area: 'bouldering', routeName: route.name });
  check('boostOnly in play: a boosted climb sends on 3 of 4, and spends the boost',
    events.find(e => e.type === 'climb_resolved').payload.success && s1.players[0].character.betaBoostActive === false);
  const { state: s2, events: e2 } = applyAction(s1, { type: 'climb', area: 'bouldering', routeName: state.availableRoutes.bouldering[1].name });
  check('boostOnly in play: the next, unboosted climb fails on 3 of 4',
    !e2.find(e => e.type === 'climb_resolved').payload.success, JSON.stringify(s2.players[0].character.betaBoostActive));
}

// =============================================================================
// Sprinter, Technician, Iron Lung
// =============================================================================
{
  const route = { name: 'x', time: 4, endurance: 10, xpSuccess: 40, xpFail: 20, strength: 1, technique: 1, focus: 1, flexibility: 1, rollEffect: [] };
  check('default Sprinter: half XP, −2 Time, +1 Focus crux die',
    computeClimbXp(climber('sprinter'), route, true) === 20 && getEffectiveClimbTimeCost(climber('sprinter'), 4, route) === 2 &&
    buildEffectRollArray(climber('sprinter'), route).length === 1);
  const spr = climber('sprinter', { xpMultiplier: 1, focusCrux: false, timeReduction: 1 });
  check('Sprinter xpMultiplier 1: full XP', computeClimbXp(spr, route, true) === 40);
  check('Sprinter focusCrux false: no extra die', buildEffectRollArray(spr, route).length === 0);
  check('Sprinter timeReduction 1: −1 Time', getEffectiveClimbTimeCost(spr, 4, route) === 3);

  const tech = climber('technician', { extraTime: 0, reqReduction: 7 });
  check('Technician extraTime 0: no extra Time', getEffectiveClimbTimeCost(tech, 4, route) === 4);
  const r = { ...route, strength: 30, technique: 30, focus: 30, flexibility: 30 };
  check('Technician reqReduction 7: requirements −7',
    applyDiceToRequirements(tech, r, [], []).requirements.strength === 23 &&
    applyDiceToRequirements(climber('technician'), r, [], []).requirements.strength === 25);

  const il = climber('ironLung', { failXpBonus: 0.25, failEndurance: 3 });
  check('Iron Lung failXpBonus 0.25: fall XP 20 → 25 (default 30)',
    computeClimbXp(il, route, false) === 25 && computeClimbXp(climber('ironLung'), route, false) === 30);
  check('Iron Lung failEndurance 3', getFailureEnduranceExtra(il) === 3);
  check('abilityParam falls back to the printed number', abilityParam(climber('ironLung'), 'failEndurance') === 5);
}

// =============================================================================
// Trait-preserving tuning: Technician's +1 Time scope, Milestone stat shift
// =============================================================================
{
  const route = { name: 'x', time: 4, endurance: 10, xpSuccess: 40, xpFail: 20, strength: 1, technique: 1, focus: 1, flexibility: 1, rollEffect: [] };
  const onM = climber('technician', { extraTimeOn: 'milestone' });
  check("Technician extraTimeOn 'milestone': +1 on Milestones only",
    getEffectiveClimbTimeCost(onM, 4, route, true) === 5 && getEffectiveClimbTimeCost(onM, 4, route, false) === 4);
  const onR = climber('technician', { extraTimeOn: 'regular' });
  check("Technician extraTimeOn 'regular': +1 on regular routes only",
    getEffectiveClimbTimeCost(onR, 4, route, true) === 4 && getEffectiveClimbTimeCost(onR, 4, route, false) === 5);

  // Engine: a Milestone attempt charges the scoped extra Time.
  const rules = { characters: { technician: { ability: { extraTimeOn: 'milestone' } } } };
  const { state } = createGame({ seed: 6, characterKeys: ['technician'], rules });
  const tier = ['beginner', 'intermediate', 'expert'].find(t => state.milestoneRoutes[t].area === 'bouldering') || 'beginner';
  const m = state.milestoneRoutes[tier];
  const c = state.players[0].character;
  c.currentEndurance = 999;
  if (m.area === 'leadClimbing') c.equipment.push('Belay Device', 'Locking Carabiner', 'Lead Rope');
  const { events } = applyAction(state, { type: 'milestone', difficulty: tier });
  check("engine: a Technician Milestone attempt costs printed Time + 1 under 'milestone' scope",
    events.find(e => e.type === 'climb_resolved').payload.timeCost === m.route.time + 1);

  // Route Reader: stat shift offered on Milestones only when the variant allows it.
  const legalShiftOnMilestone = (shiftOnMilestones) => {
    const r2 = shiftOnMilestones ? { characters: { routeReader: { ability: { shiftOnMilestones: true, nearMiss: 3 } } } } : null;
    for (let seed = 1; seed <= 40; seed++) {
      const { state: s0 } = createGame({ seed, characterKeys: ['routeReader'], rules: r2 });
      const rr = s0.players[0].character;
      rr.currentEndurance = 999;
      rr.equipment.push('Belay Device', 'Locking Carabiner', 'Lead Rope');
      // Put stats just around one milestone's requirements so a shift can help.
      const mm = s0.milestoneRoutes.beginner.route;
      for (const k of ['strength', 'technique', 'focus', 'flexibility']) rr.trainingBonuses[k] = mm[k] - rr.stats[k] + 4;
      rr.trainingBonuses.flexibility = mm.flexibility - rr.stats.flexibility - 6;
      const found = getLegalActions(s0).find(a => a.type === 'milestone' && a.shift);
      if (found) return { s0, found };
    }
    return null;
  };
  check('standard rules: no stat-shift variant on Milestones', legalShiftOnMilestone(false) === null);
  const hit = legalShiftOnMilestone(true);
  check('shiftOnMilestones: a Milestone stat-shift variant is offered', !!hit);
  if (hit) {
    const { state: s1, events: ev } = applyAction(hit.s0, hit.found);
    check('shiftOnMilestones: the shift applies and uses the ability for the round',
      ev.some(e => e.type === 'ability_activated' && e.payload.ability === 'Versatility') && s1.players[0].character.abilityUsed);
  }
  const { state: plain } = createGame({ seed: 3, characterKeys: ['routeReader'] });
  const pc = plain.players[0].character;
  pc.currentEndurance = 999;
  pc.equipment.push('Belay Device', 'Locking Carabiner', 'Lead Rope');
  const tierLegal = ['beginner', 'intermediate', 'expert'].find(t =>
    getLegalActions(plain).some(a => a.type === 'milestone' && a.difficulty === t));
  const why = illegalActionReason(plain, { type: 'milestone', difficulty: tierLegal, shift: { from: 'focus', to: 'strength', amount: 2 } });
  check('standard rules: a stat shift on a legal Milestone is refused with shiftNotAllowed',
    tierLegal && why && why.code === 'shiftNotAllowed', JSON.stringify({ tierLegal, why }));
}

// =============================================================================
// Body tuning: starting stats / Endurance / growth
// =============================================================================
{
  const rules = { characters: { ironLung: { body: { startingEndurance: 100, growth: { endurance: 5, focus: 2 }, startingStats: { focus: 17 } } } } };
  const { state } = createGame({ seed: 2, characterKeys: ['ironLung', 'technician'], rules });
  const [il, tech] = state.players.map(p => p.character);
  check('body: Iron Lung starts with 100 Endurance and Focus 17', il.maxEndurance === 100 && il.currentEndurance === 100 && il.stats.focus === 17);
  check('body: other climbers untouched', tech.maxEndurance === 100 && tech.stats.technique === 26);
  il.xp = 100;
  applyLevelUpIfNeeded(il);
  check('body: level-up uses the tuned growth (Endurance +5, Focus +2)', il.maxEndurance === 105 && il.stats.focus === 19,
    JSON.stringify({ end: il.maxEndurance, focus: il.stats.focus }));
}

// =============================================================================
// Exact P(send) still matches real climbs under a tuned Route Reader
// =============================================================================
{
  const tune = { nearMiss: 4, betaBoost: 2 };
  const route = [...ROUTES.bouldering].find(x => (x.rollEffect || []).length >= 2);
  const { state: base } = createGame({ seed: 11, characterKeys: ['routeReader'], rules: { characters: { routeReader: { ability: tune } } } });
  const c = base.players[0].character;
  c.currentEndurance = 999;
  c.betaBoostActive = true;
  base.availableRoutes.bouldering = [route];
  const pick = createRng(5);
  const STATS4 = ['strength', 'technique', 'focus', 'flexibility'];
  const pAt = (off) => {
    STATS4.forEach((k, j) => { c.trainingBonuses[k] = route[k] - c.stats[k] + off[j]; });
    return climbSendProbability(c, route, 'bouldering', {}).pSend;
  };
  let best = [0, 0, 0, -6];
  for (let t = 0; t < 300; t++) {
    const off = STATS4.map(() => Math.floor(pick.next() * 21) - 10);
    if (Math.abs(pAt(off) - 0.5) < Math.abs(pAt(best) - 0.5)) best = off;
  }
  const p = pAt(best);
  const N = 3000;
  let sends = 0;
  for (let n = 0; n < N; n++) {
    const s = { ...base, events: [], rngState: deriveSeed(4321 + n, 3) };
    if (applyAction(s, { type: 'climb', area: 'bouldering', routeName: route.name }).events
      .find(e => e.type === 'climb_resolved').payload.success) sends++;
  }
  const rate = sends / N;
  const tol = 4 * Math.sqrt(Math.max(p * (1 - p), 0.01) / N) + 0.005;
  check(`P(send) exact vs ${N} real climbs, Route Reader nearMiss 4 + boost 2 — ${p.toFixed(3)} vs ${rate.toFixed(3)}`,
    Math.abs(rate - p) <= tol);
}

const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} character-tuning assertions FAILED.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} character-tuning assertions passed.`);
