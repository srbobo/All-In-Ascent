// Tests for Project Mode content (engine/content.js): compiling custom
// climbers, routes and gear, and the rules acting in real games.
//
// Run:  npm run test:engine  (runs all engine tests in sequence)

import {
  compileCharacter, compileRoute, compileGear, compileContentPack, describeRule, describeRules,
  ruleEffects, effectSum, hasEffect, validateSubmission, hasCustomContent, emptyContentPack,
  CONDITIONS, EFFECTS, SUBMISSION_SCHEMA, CONTENT_SCHEMA, findGear, ROUTE_VOCAB,
} from './content.js';
import { createGame } from './state.js';
import { applyAction, getLegalActions, illegalActionReason } from './engine.js';
import {
  GRIT_RULES, computeClimbStats, climbSendProbability, getEffectiveClimbTimeCost, getEffectiveClimbEnduranceCost,
  computeClimbXp, buildEffectRollArray, applyDiceToRequirements, resolveClimbOutcome, computeRestRecovery,
  trainingSpec, trainingCap, checkAreaAccess, applyLevelUpIfNeeded, roundStartTime,
} from './helpers.js';
import { summarizeGame } from './stats.js';
import { deriveSeed } from './rng.js';
import { ROUTES, GEAR_SHOP, CHARACTERS } from './data.js';
import { ENGINE_VERSION_STRING } from './version.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}
const errorsAt = (r) => r.errors.map(e => e.path).join(' ');

// A climber that excels on Overhang routes.
const OVERHANG = {
  key: 'custom-overhang-ace',
  name: 'The Overhang Ace', archetype: 'Steep specialist', description: 'Lives on the roof.',
  portrait: 'sprinter', accent: 'coral',
  startingStats: { strength: 22, technique: 16, focus: 14, flexibility: 14 },
  startingEndurance: 100,
  growth: { strength: 3.5, technique: 2, focus: 2, flexibility: 2, endurance: 6 },
  specialAbility: { name: 'Roof Rat' },
  rules: [
    { when: [{ type: 'routeType', value: 'Overhang' }], then: [{ type: 'statBonus', stat: 'strength', amount: 6 }, { type: 'timeCost', amount: -1 }] },
    { when: [{ type: 'statRequirement', stat: 'strength', op: '<', value: 30 }], then: [{ type: 'xpScale', percent: 120 }] },
    { when: [], then: [{ type: 'gritStart', amount: 2 }] },
    { when: [{ type: 'level', op: '>=', value: 3 }], then: [{ type: 'restBonus', amount: 10 }] },
  ],
};

// =============================================================================
// Compiling
// =============================================================================
{
  const r = compileCharacter(OVERHANG);
  check('a valid climber compiles', r.ok, errorsAt(r));
  check('the compiled climber carries its key, body, rules and a signature',
    r.ok && r.value.key === 'custom-overhang-ace' && r.value.custom && r.value.rules.length === 4 && typeof r.value.rulesHash === 'string' && r.value.startingStats.strength === 22);
  check('the ability text is generated from the rules', r.ok && r.value.specialAbility.description.startsWith('On Overhang routes: +6 Strength, the climb costs -1 Time (min 1).'),
    r.ok && r.value.specialAbility.description);
  check('a climber without a key gets one from its name', compileCharacter({ ...OVERHANG, key: undefined }).value.key === 'custom-the-overhang-ace');

  const bad = compileCharacter({ ...OVERHANG, startingStats: { ...OVERHANG.startingStats, strength: 99 } });
  check('a stat out of range is an error at its path', !bad.ok && bad.errors.some(e => e.path === 'character.startingStats.strength'), errorsAt(bad));
  const unknown = compileCharacter({ ...OVERHANG, rules: [{ when: [], then: [{ type: 'teleport' }] }] });
  check('an unknown element is an error', !unknown.ok && unknown.errors[0].path === 'character.rules[0].then[0].type', errorsAt(unknown));
  const scope = compileCharacter({ ...OVERHANG, rules: [{ when: [{ type: 'routeType', value: 'Slab' }], then: [{ type: 'restBonus', amount: 5 }] }] });
  check('a condition that cannot decide an effect\'s scope is an error', !scope.ok && /can't decide/.test(scope.errors[0].message), errorsAt(scope));
  const gearOnly = compileCharacter({ ...OVERHANG, rules: [{ when: [], then: [{ type: 'maxEndurance', amount: 5 }] }] });
  check('a gear-only effect on a climber is an error', !gearOnly.ok && /can't go on a character/.test(gearOnly.errors[0].message));
  const twice = compileCharacter({ ...OVERHANG, rules: [{ when: [], then: [{ type: 'timeCost', amount: -1 }, { type: 'timeCost', amount: -1 }] }] });
  check('the same effect twice in a rule is an error', !twice.ok && /twice/.test(twice.errors[0].message));
  const range = compileCharacter({ ...OVERHANG, rules: [{ when: [], then: [{ type: 'statBonus', stat: 'strength', amount: 50 }] }] });
  check('an effect parameter out of range is an error', !range.ok && range.errors[0].path === 'character.rules[0].then[0].amount');
  const zero = compileCharacter({ ...OVERHANG, rules: [{ when: [], then: [{ type: 'statBonus', stat: 'strength', amount: 0 }] }] });
  check('a zero amount is an error', !zero.ok);
  const noEffect = compileCharacter({ ...OVERHANG, rules: [{ when: [{ type: 'area', value: 'bouldering' }], then: [] }] });
  check('a rule without effects is an error', !noEffect.ok);
  const clash = compileCharacter({ ...OVERHANG, key: 'sprinter' });
  check('a printed climber\'s key is refused', !clash.ok && clash.errors.some(e => e.path === 'character.key'));
  const badGrowth = compileCharacter({ ...OVERHANG, growth: { ...OVERHANG.growth, focus: 2.25 } });
  check('growth must be in half steps', !badGrowth.ok && badGrowth.errors[0].path === 'character.growth.focus');
  const total = compileCharacter({ ...OVERHANG, startingStats: { strength: 40, technique: 40, focus: 40, flexibility: 40 } });
  check('starting stats have a total budget', !total.ok && /add up to/.test(total.errors[0].message));
  const noRules = compileCharacter({ ...OVERHANG, rules: [] });
  check('a climber with no rules is fine', noRules.ok && noRules.value.specialAbility.description === 'No special rules.');

  check('every condition names the scopes it can decide', Object.values(CONDITIONS).every(c => c.scopes.length && c.label && typeof c.text === 'function'));
  check('every effect names one scope and which cards may carry it', Object.values(EFFECTS).every(e => e.scope && e.for.length && e.label));
  check('describeRule words conditions and effects', describeRule({ when: [{ type: 'tag', value: 'Dynamic' }, { type: 'milestone', value: 'yes' }], then: [{ type: 'negateDice', kind: 'nerf' }] })
    === 'On Dynamic routes and on Milestone attempts: ignore every nerf die.');
  check('describeRules joins rules', describeRules([{ when: [], then: [{ type: 'gritPerRound', amount: 1 }] }]) === 'Always: gain 1 Grit at the start of every round.');
}

const ROOF = {
  name: 'Roof Rat Traverse', area: 'bouldering', grade: 'V3',
  strength: 34, technique: 26, focus: 24, flexibility: 28, time: 3, endurance: 26, xpSuccess: 55, xpFail: 20,
  rollEffect: [{ stat: 'strength', modifier: -1 }, { stat: 'focus', modifier: 1 }],
  routeType: 'Overhang', holdFeatures: ['Jugs', 'Sloper'], moveFeatures: ['Roof'], tag: 'Roof/Sloper',
};
{
  const r = compileRoute(ROOF);
  check('a valid route compiles', r.ok, errorsAt(r));
  check('the compiled route is a deck-shaped card', r.ok && r.value.custom && r.value.gearModifiers.length === 0 && r.value.rollEffect.length === 2 && r.value.area === 'bouldering');
  const grade = compileRoute({ ...ROOF, grade: '5.10a' });
  check('a grade from the wrong wall is an error', !grade.ok && grade.errors[0].path === 'route.grade');
  const clash = compileRoute({ ...ROOF, name: ROUTES.bouldering[0].name });
  check('a printed route name is refused', !clash.ok && /already a printed/.test(clash.errors[0].message));
  const dice = compileRoute({ ...ROOF, rollEffect: Array(5).fill({ stat: 'focus', modifier: 1 }) });
  check('more than 4 dice is an error', !dice.ok);
  const xp = compileRoute({ ...ROOF, xpFail: 90 });
  check('fall XP above send XP is an error', !xp.ok && xp.errors[0].path === 'route.xpFail');
  const feat = compileRoute({ ...ROOF, holdFeatures: ['Volcano'] });
  check('an unknown hold feature is an error', !feat.ok && feat.errors[0].path === 'route.holdFeatures');
  check('the route vocabulary covers the printed deck', Object.values(ROUTES).flat().every(rt =>
    ROUTE_VOCAB.routeTypes.includes(rt.routeType) && (rt.tag === null || ROUTE_VOCAB.tags.includes(rt.tag)) &&
    (rt.holdFeatures || []).every(h => ROUTE_VOCAB.holdFeatures.includes(h)) && (rt.moveFeatures || []).every(m => ROUTE_VOCAB.moveFeatures.includes(m))));
}

const KNEEPADS = {
  name: 'Kneebar Pads', category: 'Specialized Gear', cost: 110, gritCost: 4, description: 'Rest on the roof.',
  rules: [
    { when: [{ type: 'routeType', value: 'Overhang' }], then: [{ type: 'enduranceCostScale', percent: 50 }] },
    { when: [], then: [{ type: 'maxEndurance', amount: 10 }] },
  ],
};
{
  const r = compileGear(KNEEPADS);
  check('a valid gear card compiles', r.ok, errorsAt(r));
  check('the compiled gear is a no-op printed card plus rules', r.ok && r.value.statEffect === 'none' && r.value.value === 0 && r.value.custom && r.value.effectDisplay.startsWith('On Overhang routes: the climb costs 50% Endurance.'));
  const none = compileGear({ ...KNEEPADS, rules: [] });
  check('gear needs at least one rule', !none.ok && /at least one rule/.test(none.errors[0].message));
  const clash = compileGear({ ...KNEEPADS, name: 'Mountain Mentor' });
  check('a printed gear name is refused', !clash.ok);
  const charOnly = compileGear({ ...KNEEPADS, rules: [{ when: [], then: [{ type: 'gritStart', amount: 1 }] }] });
  check('a climber-only effect on gear is an error', !charOnly.ok && /can't go on a gear/.test(charOnly.errors[0].message));
}

const PACK = { schema: CONTENT_SCHEMA, characters: [OVERHANG], routes: [ROOF], gear: [KNEEPADS] };
{
  const r = compileContentPack(PACK);
  check('a pack compiles to keyed climbers, routes by wall and gear', r.ok && r.value.characters['custom-overhang-ace'] && r.value.routes.bouldering.length === 1 && r.value.gear.length === 1, errorsAt(r));
  check('an empty pack has no custom content', !hasCustomContent(emptyContentPack()) && hasCustomContent(r.value));
  const dup = compileContentPack({ ...PACK, characters: [OVERHANG, OVERHANG] });
  check('two climbers with one key is an error', !dup.ok && /share the key/.test(dup.errors[0].message));
  const dupRoute = compileContentPack({ ...PACK, routes: [ROOF, ROOF] });
  check('two routes with one name on a wall is an error', !dupRoute.ok);
  const badSchema = compileContentPack({ ...PACK, schema: 'nope' });
  check('an unknown pack schema is an error', !badSchema.ok);
}

// =============================================================================
// In play: a custom climber's rules act where the printed abilities act
// =============================================================================
const pack = compileContentPack(PACK).value;
{
  const { state } = createGame({ seed: 7, characterKeys: ['custom-overhang-ace', 'technician'], rules: GRIT_RULES, content: PACK });
  const c = state.players[0].character;
  check('createGame accepts a pack and keeps the compiled one on the state', state.content && state.content.characters['custom-overhang-ace'] && state.content.gear[0].name === 'Kneebar Pads');
  check('the custom climber is a player with its own body and rules', c.custom && c.name === 'The Overhang Ace' && c.stats.strength === 22 && c.maxEndurance === 100 && c.customRules.length === 4 && c.rules === undefined);
  check('game_start marks custom seats and lists the custom content', state.events[0].payload.players[0].custom === true && state.events[0].payload.customContent.routes[0] === 'Roof Rat Traverse');
  check('starting Grit includes the "starting Grit" rule', c.grit === 2 && state.players[1].character.grit === 2);

  const overhang = ROUTES.bouldering.find(r => r.routeType === 'Overhang');
  const slab = ROUTES.bouldering.find(r => r.routeType === 'Slab');
  const on = computeClimbStats(c, overhang, 'bouldering', {});
  const off = computeClimbStats(c, slab, 'bouldering', {});
  check('+6 Strength applies on Overhang routes only', on.strength === 28 && off.strength === 22, JSON.stringify({ on, off }));
  check('-1 Time applies on Overhang routes only', getEffectiveClimbTimeCost(c, overhang.time, overhang, false, 'bouldering') === overhang.time - 1 &&
    getEffectiveClimbTimeCost(c, slab.time, slab, false, 'bouldering') === slab.time);
  const easy = ROUTES.bouldering.find(r => r.strength < 30);
  const hard = ROUTES.bouldering.find(r => r.strength >= 30);
  check('120% XP when the route needs under 30 Strength', computeClimbXp(c, easy, true, { area: 'bouldering', isMilestone: false }) === Math.floor(easy.xpSuccess * 1.2) &&
    computeClimbXp(c, hard, true, { area: 'bouldering', isMilestone: false }) === hard.xpSuccess);
  check('a Level condition: rest bonus off at Level 1', computeRestRecovery(c).restBonusApplied === 0);
  c.level = 3;
  check('a Level condition: rest bonus on at Level 3', computeRestRecovery(c).restBonusApplied === 10);
  c.level = 1;
  check('the printed seat sees nothing', ruleEffects(state.players[1].character, 'statBonus', { scope: 'climb', route: overhang, area: 'bouldering' }).length === 0);

  // Level-up uses the custom body.
  c.xp = 100;
  const lvl = applyLevelUpIfNeeded(c);
  check('level-up recomputes a custom climber from its own growth', lvl.leveledUp && c.stats.strength === Math.round(22 + 3.5) && c.maxEndurance === 106, JSON.stringify(c.stats));
}

// Each remaining climb-scope effect, on a handcrafted climber.
function climber(rules, body = {}) {
  const def = { ...OVERHANG, key: 'custom-lab', name: 'Lab Rat', rules, ...body };
  const { state } = createGame({ seed: 3, characterKeys: ['custom-lab'], rules: GRIT_RULES, content: { characters: [def] } });
  const c = state.players[0].character;
  c.currentEndurance = 999;
  return { state, c };
}
{
  const route = ROUTES.bouldering.find(r => r.rollEffect.some(e => e.modifier === 1) && r.rollEffect.some(e => e.modifier === -1));
  const ctx = { route, area: 'bouldering', isMilestone: false };
  const { c } = climber([
    { when: [], then: [{ type: 'requirementChange', stat: 'all', amount: -4 }, { type: 'negateDice', kind: 'nerf' }, { type: 'extraDie', stat: 'technique', kind: 'buff' }] },
    { when: [{ type: 'milestone', value: 'yes' }], then: [{ type: 'enduranceCost', amount: -5 }] },
    { when: [], then: [{ type: 'enduranceCostScale', percent: 150 }] },
    { when: [], then: [{ type: 'xpBonus', on: 'fall', amount: 7 }, { type: 'failPenalty', amount: 4 }, { type: 'successHeal', amount: 9 }] },
  ]);
  const effects = buildEffectRollArray(c, route, 'bouldering', false);
  check('an extra buff die is added and tagged with its card', effects.length === route.rollEffect.length + 1 && effects.at(-1).modifier === -1 && effects.at(-1).source === 'custom:Lab Rat');
  const dice = effects.map(() => 6);
  const { requirements, appliedModifiers } = applyDiceToRequirements(c, route, effects, dice, { area: 'bouldering', isMilestone: false });
  const nerfIdx = effects.findIndex(e => e.modifier === 1);
  check('nerf dice are ignored', appliedModifiers[nerfIdx].modifier === 0 && appliedModifiers[nerfIdx].deltaApplied === 0);
  const buffIdx = effects.findIndex(e => e.modifier === -1);
  check('buff dice still apply and every requirement is -4', requirements[effects[buffIdx].stat] <= route[effects[buffIdx].stat] - 6 - 4 + 0 &&
    ['strength', 'technique', 'focus', 'flexibility'].every(k => requirements[k] <= Math.max(0, route[k] - 4)), JSON.stringify(requirements));
  check('Endurance cost: milestone-only -5 does not apply to a regular climb; 150% does',
    getEffectiveClimbEnduranceCost(c, route, route.endurance, 'bouldering', false) === Math.ceil(route.endurance * 1.5) &&
    getEffectiveClimbEnduranceCost(c, route, route.endurance, 'bouldering', true) === Math.ceil((route.endurance - 5) * 1.5));
  check('+7 XP on a fall only', computeClimbXp(c, route, false, ctx) === route.xpFail + 7 && computeClimbXp(c, route, true, ctx) === route.xpSuccess);
  // A real fall and a real send.
  const { state } = climber([{ when: [], then: [{ type: 'failPenalty', amount: 4 }, { type: 'successHeal', amount: 9 }] }]);
  const me = state.players[0].character;
  state.availableRoutes.bouldering = [route];
  me.currentEndurance = 50;
  Object.assign(me.stats, { strength: 1, technique: 1, focus: 1, flexibility: 1 });
  const fall = applyAction(state, { type: 'climb', area: 'bouldering', routeName: route.name }).events.find(e => e.type === 'climb_resolved').payload;
  check('a fall costs the extra penalty and reports the rule', !fall.success && fall.failPenalty === 4 && fall.customRules.length === 1 && /a fall costs 4 extra Endurance/.test(fall.customRules[0].text), JSON.stringify(fall.customRules));
  Object.assign(me.stats, { strength: 99, technique: 99, focus: 99, flexibility: 99 });
  const send = applyAction(state, { type: 'climb', area: 'bouldering', routeName: route.name });
  const sent = send.events.find(e => e.type === 'climb_resolved').payload;
  check('a send heals 9 (up to max)', sent.success && send.state.players[0].character.currentEndurance === Math.min(me.maxEndurance, 50 - route.endurance + 9));
}
{
  // 3 of 4 with a near miss of 2.
  const { c } = climber([{ when: [], then: [{ type: 'threeOfFour', nearMiss: 2 }] }]);
  const stats = { strength: 20, technique: 20, focus: 20, flexibility: 20 };
  const route = ROUTES.bouldering[0];
  const ctx = { route, area: 'bouldering' };
  check('3 of 4: sends when the 4th misses by 2', resolveClimbOutcome(c, stats, { ...stats, focus: 22 }, false, ctx).success);
  check('3 of 4: fails when the 4th misses by 3', !resolveClimbOutcome(c, stats, { ...stats, focus: 23 }, false, ctx).success);
  check('3 of 4: without the climb context the printed rule (4 of 4) applies', !resolveClimbOutcome(c, stats, { ...stats, focus: 22 }).success);
}
{
  // Sure sends only, free access.
  const { state, c } = climber([{ when: [], then: [{ type: 'sureSendOnly' }] }, { when: [{ type: 'area', value: 'leadClimbing' }], then: [{ type: 'freeAccess' }] }]);
  check('free access: Lead is open without the Lead system (a printed climber still needs it)',
    checkAreaAccess(c, 'leadClimbing').hasAccess && !checkAreaAccess({ key: 'technician', equipment: [] }, 'leadClimbing').hasAccess);
  const legal = getLegalActions(state);
  const climbs = legal.filter(a => a.type === 'climb');
  const allMet = climbs.every(a => {
    const r = state.availableRoutes[a.area].find(x => x.name === a.routeName);
    return ['strength', 'technique', 'focus', 'flexibility'].every(k => c.stats[k] >= r[k]);
  });
  const blocked = Object.entries(state.availableRoutes).flatMap(([area, rs]) => rs.map(r => ({ area, r })))
    .find(({ r }) => ['strength', 'technique', 'focus', 'flexibility'].some(k => c.stats[k] < r[k]));
  check('sure sends only: only routes whose requirements the stats meet are legal', allMet && blocked && illegalActionReason(state, { type: 'climb', area: blocked.area, routeName: blocked.r.name }).code === 'lifeOrDie');
  check('Lead routes are offered to a climber with free access', legal.some(a => a.type === 'climb' && a.area === 'leadClimbing') || state.availableRoutes.leadClimbing.every(r => ['strength', 'technique', 'focus', 'flexibility'].some(k => c.stats[k] < r[k])));
}
{
  // Rest: Beta Boost on rest; round: Grit and Time each round; training.
  const { state, c } = climber([
    { when: [], then: [{ type: 'betaBoostOnRest', amount: 4 }, { type: 'restBonus', amount: 5 }] },
    { when: [], then: [{ type: 'gritPerRound', amount: 2 }, { type: 'timePerRound', amount: 1 }] },
    { when: [], then: [{ type: 'trainingGain', stat: 'strength', amount: 2 }, { type: 'trainingCapBonus', amount: 5 }] },
  ]);
  c.currentEndurance = 10;
  const rested = applyAction(state, { type: 'rest' });
  const rc = rested.state.players[0].character;
  const restEv = rested.events.find(e => e.type === 'rest_action').payload;
  check('rest: Beta Boost activates with the rule\'s amount and the rest bonus applies', rc.betaBoostActive && rc.betaBoostAmount === 4 && restEv.betaBoostActivated && restEv.restBonusApplied === 5);
  const route = ROUTES.bouldering[0];
  check('the Beta Boost adds +4 to every stat on the next climb', computeClimbStats(rc, route, 'bouldering', {}).strength === rc.stats.strength + 4);
  const climbed = applyAction(rested.state, { type: 'climb', area: 'bouldering', routeName: rested.state.availableRoutes.bouldering[0].name });
  check('the Beta Boost is spent by the climb', !climbed.state.players[0].character.betaBoostActive && climbed.events.some(e => e.type === 'ability_activated' && e.payload.effect === '+4 all stats for this climb'));
  check('round start Time is 11 with +1 Time each round', roundStartTime(c) === 11);
  const campus = { name: 'Campus Board', stat: 'strength', bonus: 5, time: 2, endurance: 15 };
  const grip = { name: 'Grip Board', stat: 'focus', bonus: 5, time: 2, endurance: 10 };
  check('training gain +2 on Strength only', trainingSpec(GRIT_RULES, campus, c).gain === 7 && trainingSpec(GRIT_RULES, grip, c).gain === 5);
  check('training cap +5', trainingCap(GRIT_RULES, c) === 15);
  const ended = applyAction(state, { type: 'endTurn' });
  const ec = ended.state.players[0].character;
  check('a new round: +2 Grit and 11 Time', ended.state.round === 2 && ec.grit === c.grit + 2 && ec.timeRemaining === 11, JSON.stringify({ grit: ec.grit, time: ec.timeRemaining }));
}

// =============================================================================
// Exact P(send) matches real climbs for a rule-heavy climber
// =============================================================================
{
  const route = ROUTES.bouldering.find(r => (r.rollEffect || []).length >= 2 && r.rollEffect.some(e => e.modifier === 1));
  const { state: base, c } = climber([
    { when: [{ type: 'holdFeature', value: route.holdFeatures[0] || 'Jugs' }], then: [{ type: 'extraDie', stat: 'focus', kind: 'nerf' }] },
    { when: [], then: [{ type: 'threeOfFour', nearMiss: 3 }, { type: 'requirementChange', stat: 'flexibility', amount: 2 }] },
    { when: [{ type: 'gradeBand', value: ['easy', 'mid', 'hard'][['V0', 'V1', 'V2'].includes(route.grade) ? 0 : 1] }], then: [{ type: 'negateDice', kind: 'buff' }] },
  ]);
  base.availableRoutes.bouldering = [route];
  const STATS4 = ['strength', 'technique', 'focus', 'flexibility'];
  const pick = deriveSeed(9, 1);
  let x = pick;
  const rand = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pAt = (off) => {
    STATS4.forEach((k, j) => { c.trainingBonuses[k] = route[k] - c.stats[k] + off[j]; });
    return climbSendProbability(c, route, 'bouldering', {}).pSend;
  };
  let best = [0, 0, 0, 0];
  for (let t = 0; t < 200; t++) {
    const off = STATS4.map(() => Math.floor(rand() * 17) - 8);
    if (Math.abs(pAt(off) - 0.5) < Math.abs(pAt(best) - 0.5)) best = off;
  }
  const p = pAt(best);
  const N = 2500;
  let sends = 0;
  for (let n = 0; n < N; n++) {
    const s = { ...base, events: [], rngState: deriveSeed(777 + n, 2) };
    if (applyAction(s, { type: 'climb', area: 'bouldering', routeName: route.name }).events.find(e => e.type === 'climb_resolved').payload.success) sends++;
  }
  const rate = sends / N;
  const tol = 4 * Math.sqrt(Math.max(p * (1 - p), 0.01) / N) + 0.005;
  check(`P(send) exact vs ${N} real climbs with extra die, ignored buff dice, 3 of 4 and a requirement change — ${p.toFixed(3)} vs ${rate.toFixed(3)}`,
    p > 0 && p < 1 && Math.abs(rate - p) <= tol);
}

// =============================================================================
// Custom routes and gear in a game
// =============================================================================
{
  let seed = 1;
  let state;
  do ({ state } = createGame({ seed: seed++, characterKeys: ['custom-overhang-ace', 'ironLung'], rules: GRIT_RULES, content: PACK }));
  while (seed < 400 && !(state.availableRoutes.bouldering.some(r => r.name === 'Roof Rat Traverse') && state.availableGear.some(g => g.name === 'Kneebar Pads')));
  const roof = state.availableRoutes.bouldering.find(r => r.name === 'Roof Rat Traverse');
  check('a custom route is dealt to its wall with Grit on it', !!roof && roof.grit === 3, `seed ${seed}`);
  check('custom gear is dealt to the shop', state.availableGear.some(g => g.name === 'Kneebar Pads' && g.custom));
  check('findGear finds printed and custom cards', findGear(state, 'Mountain Mentor') && findGear(state, 'Kneebar Pads').custom && findGear(state, 'nope') === null);

  const c = state.players[0].character;
  c.grit = 10;
  const whyNot = illegalActionReason(state, { type: 'buyGear', gearName: 'Kneebar Pads' });
  check('custom gear is buyable like any card', whyNot === null, JSON.stringify(whyNot));
  const bought = applyAction(state, { type: 'buyGear', gearName: 'Kneebar Pads' });
  const bc = bought.state.players[0].character;
  const ev = bought.events.find(e => e.type === 'gear_purchased').payload;
  check('buying custom gear costs its Grit price and attaches its rules', ev.cost === 4 && bc.grit === 6 && bc.equipment.includes('Kneebar Pads') && bc.gearRules.length === 1 && bc.gearRules[0].gear === 'Kneebar Pads');
  check('its max-Endurance rule applies at once and survives a level-up', bc.maxEndurance === 110 && ev.gearApplied.maxEndurance === 10 && (() => { const t = structuredClone(bc); t.xp = 100; applyLevelUpIfNeeded(t); return t.maxEndurance === 116; })());
  check('the shop replaces the sold card', !bought.state.availableGear.some(g => g.name === 'Kneebar Pads') && bought.state.availableGear.length === 3);
  const gearCtx = { scope: 'climb', route: roof, area: 'bouldering', isMilestone: false };
  check('gear rules act on climbs (50% Endurance on Overhang)', effectSum(bc, 'enduranceCostScale', gearCtx, 'percent') === 50 &&
    getEffectiveClimbEnduranceCost(bc, roof, roof.endurance, 'bouldering', false) === Math.ceil(roof.endurance / 2));
  check('gear rules are keyed by the card (hasEffect)', hasEffect(bc, 'maxEndurance', { scope: 'setup' }));

  // Climb the custom route: it resolves, the Grit is taken, stats count it.
  bc.currentEndurance = 999;
  Object.assign(bc.stats, { strength: 99, technique: 99, focus: 99, flexibility: 99 });
  bought.state.currentPlayerIndex = 0;
  const climbed = applyAction(bought.state, { type: 'climb', area: 'bouldering', routeName: 'Roof Rat Traverse' });
  const res = climbed.events.find(e => e.type === 'climb_resolved').payload;
  check('a custom route is climbed like a printed one', res.success && res.routeName === 'Roof Rat Traverse' && res.grade === 'V3' && res.gritGained === 3);
  check('climb_resolved lists the custom rules that applied (climber and gear)', res.customRules.map(r => r.source).sort().join(',') === 'Kneebar Pads,The Overhang Ace', JSON.stringify(res.customRules));
  const sum = summarizeGame(climbed.state);
  check('the post-game statistics count the custom route as the hardest send', sum.players[0].hardestSend && sum.players[0].hardestSend.routeName === 'Roof Rat Traverse');
}

// =============================================================================
// Determinism, replay and refusals
// =============================================================================
{
  const play = (content) => {
    let { state } = createGame({ seed: 21, characterKeys: ['custom-overhang-ace', 'technician'], rules: GRIT_RULES, content });
    let x = 5;
    for (let i = 0; i < 300 && !state.gameEnded; i++) {
      const legal = getLegalActions(state);
      x = (x * 1103515245 + 12345) >>> 0;
      ({ state } = applyAction(state, legal[x % legal.length]));
    }
    return state;
  };
  const a = play(PACK);
  const b = play(pack);
  check('a game with content is deterministic (raw or compiled pack)', JSON.stringify(a.events) === JSON.stringify(b.events) && a.events.length > 300);
  let replay = createGame({ seed: a.seed, characterKeys: a.players.map(p => p.character.key), rules: a.rules, content: a.content }).state;
  for (const e of a.events.filter(ev => ev.type === 'action_chosen')) ({ state: replay } = applyAction(replay, e.payload.action));
  check('a game with content replays from seed + characters + content', JSON.stringify(replay) === JSON.stringify(a));

  let threw = null;
  try { createGame({ seed: 1, characterKeys: ['technician'], content: { characters: [{ ...OVERHANG, startingEndurance: 9999 }] } }); } catch (e) { threw = e.message; }
  check('createGame refuses a pack that does not compile', threw && /does not compile/.test(threw), threw);
  threw = null;
  try { createGame({ seed: 1, characterKeys: ['custom-nobody'], content: PACK }); } catch (e) { threw = e.message; }
  check('createGame refuses an unknown custom key', threw && /unknown character key/.test(threw));
  const plain = createGame({ seed: 1, characterKeys: ['technician'], content: emptyContentPack() }).state;
  check('an empty pack leaves the state as the printed game', plain.content === undefined);
  const same = createGame({ seed: 1, characterKeys: ['technician'] }).state;
  check('an empty pack changes nothing', JSON.stringify(plain) === JSON.stringify(same));
}

// =============================================================================
// Submissions
// =============================================================================
{
  const sub = { schema: SUBMISSION_SCHEMA, id: 'sub-test-0001', kind: 'character', engineVersion: ENGINE_VERSION_STRING, author: 'lb', note: 'try me', definition: OVERHANG };
  check('a valid submission is accepted', validateSubmission(sub) === null, validateSubmission(sub));
  check('a submission whose card does not compile is refused with the reason', /does not compile/.test(validateSubmission({ ...sub, definition: { ...OVERHANG, name: 'x' } })));
  check('a submission of an unknown kind is refused', validateSubmission({ ...sub, kind: 'dice' }) === 'bad kind');
  check('a submission needs an id', validateSubmission({ ...sub, id: '' }) === 'bad id');
  check('route and gear submissions compile their definitions', validateSubmission({ ...sub, kind: 'route', definition: ROOF }) === null && validateSubmission({ ...sub, kind: 'gear', definition: KNEEPADS }) === null);
  check('the printed deck is untouched by compiling', GEAR_SHOP.every(g => !g.custom) && Object.values(ROUTES).flat().every(r => !r.custom));
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} content checks passed`);
if (failed.length) process.exit(1);
