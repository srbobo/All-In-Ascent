// Tests for the Grit-economy rules variant (state.rules.grit) and the
// training-cap cards (Hangboard Program, Training Partner).
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Covers:
//   - the standard game is untouched (no Grit, no variant-only cards)
//   - Grit are placed on cards when dealt (setup + Setter reset), by band
//   - the first climber to SEND a route takes its Grit; falls take none
//   - milestone sends pay their tier's reward
//   - training costs a Grit; gear is priced in Grit and never spends XP
//   - the per-round allowance, Training Partner's free session, Hangboard's cap

import { createGame } from './state.js';
import { getLegalActions, applyAction, illegalActionReason } from './engine.js';
import {
  gradeBand, routeGritValue, gearPrice, trainingCap, trainingGritCost, GRIT_RULES, abilityParam,
} from './helpers.js';
import { GEAR_SHOP, ROUTES } from './data.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const GRIT_GAME = { grit: { start: 3, perRound: 1 } };
const CAPPED = { ...GRIT_GAME, trainCapBase: 10, trainCapPerLevel: 5 };
const VARIANT_CARDS = GEAR_SHOP.filter(g => g.variantOnly).map(g => g.name);
const allDealt = (state) => [...state.availableRoutes.bouldering, ...state.availableRoutes.topRope, ...state.availableRoutes.leadClimbing];

// =============================================================================
// Standard game untouched
// =============================================================================
{
  check('two variant-only cards exist (Hangboard Program, Training Partner)',
    VARIANT_CARDS.includes('Hangboard Program') && VARIANT_CARDS.includes('Training Partner'));
  let seen = false;
  for (let seed = 1; seed <= 60; seed++) {
    const { state } = createGame({ seed, characterKeys: ['ironLung', 'technician'] });
    if (state.availableGear.some(g => g.variantOnly)) seen = true;
    if (allDealt(state).some(r => 'grit' in r)) seen = true;
    if ('grit' in state.players[0].character) seen = true;
  }
  check('standard games deal no Grit and no variant-only cards (60 seeds)', !seen);
  const { state } = createGame({ seed: 2, characterKeys: ['ironLung'] });
  check('standard rules: training costs no Grit', trainingGritCost(state.rules, state.players[0].character) === 0);
}

// =============================================================================
// Grade bands and dealing
// =============================================================================
{
  const band = (grade) => gradeBand({ grade });
  check('bands: V2 easy, V3 mid, V7 mid, V8 hard', band('V2') === 0 && band('V3') === 1 && band('V7') === 1 && band('V8') === 2);
  check('bands: 5.9 easy, 5.10a mid, 5.11d mid, 5.12a hard, 5.14a hard',
    band('5.9') === 0 && band('5.10a') === 1 && band('5.11d') === 1 && band('5.12a') === 2 && band('5.14a') === 2);
  const { state } = createGame({ seed: 7, characterKeys: ['ironLung', 'sprinter'], rules: GRIT_GAME });
  const dealt = allDealt(state);
  check('every dealt card carries Grit = its band value',
    dealt.every(r => r.grit === routeGritValue(state.rules, r)), JSON.stringify(dealt.map(r => [r.grade, r.grit])));
  check('dealing copies cards (game data untouched)', ROUTES.bouldering.every(r => !('grit' in r)));
  check('climbers start with rules.grit.start', state.players.every(p => p.character.grit === 3));
}

// =============================================================================
// Claiming: first send takes the Grit; falls take none
// =============================================================================
{
  // Find a game + route the Iron Lung is sure to send and one it is sure to fall.
  const { state } = createGame({ seed: 7, characterKeys: ['ironLung', 'sprinter'], rules: GRIT_GAME });
  const route = state.availableRoutes.bouldering[0];
  const c0 = state.players[0].character;
  for (const k of ['strength', 'technique', 'focus', 'flexibility']) c0.trainingBonuses[k] = 200;
  c0.currentEndurance = 999;
  const before = c0.grit;
  const value = route.grit;
  const { state: s1, events } = applyAction(state, { type: 'climb', area: 'bouldering', routeName: route.name });
  const resolved = events.find(e => e.type === 'climb_resolved').payload;
  check('a send takes the card\'s Grit', resolved.success && s1.players[0].character.grit === before + value,
    `Grit ${before} → ${s1.players[0].character.grit}, card had ${value}`);
  check('climb_resolved reports gritGained', resolved.gritGained === value);
  const card = s1.availableRoutes.bouldering.find(r => r.name === route.name);
  check('the card is left empty', card.grit === 0);
  check('XP is still earned on a Grit climb', s1.players[0].character.xp > 0);

  // Second climber sends the same route: nothing left to take.
  const s2 = structuredClone(s1);
  s2.currentPlayerIndex = 1;
  const c1 = s2.players[1].character;
  for (const k of ['strength', 'technique', 'focus', 'flexibility']) c1.trainingBonuses[k] = 200;
  c1.currentEndurance = 999;
  const t1 = c1.grit;
  const { state: s3 } = applyAction(s2, { type: 'climb', area: 'bouldering', routeName: route.name });
  check('a later send of an emptied card earns no Grit', s3.players[1].character.grit === t1);

  // A sure fall keeps the Grit on the card.
  const { state: f0 } = createGame({ seed: 7, characterKeys: ['ironLung'], rules: GRIT_GAME });
  const hard = f0.availableRoutes.bouldering[1];
  const fc = f0.players[0].character;
  for (const k of ['strength', 'technique', 'focus', 'flexibility']) fc.stats[k] = 0;
  fc.currentEndurance = 999;
  const { state: f1, events: fe } = applyAction(f0, { type: 'climb', area: 'bouldering', routeName: hard.name });
  check('a fall earns no Grit and leaves them on the card',
    !fe.find(e => e.type === 'climb_resolved').payload.success &&
    f1.players[0].character.grit === 3 && f1.availableRoutes.bouldering[1].grit === hard.grit);
}

// =============================================================================
// Milestone reward, training cost, gear in Grit
// =============================================================================
{
  const { state } = createGame({ seed: 3, characterKeys: ['ironLung'], rules: GRIT_GAME });
  const c = state.players[0].character;
  for (const k of ['strength', 'technique', 'focus', 'flexibility']) c.trainingBonuses[k] = 300;
  c.currentEndurance = 999;
  const tier = ['beginner', 'intermediate', 'expert'].find(t => state.milestoneRoutes[t].area !== 'leadClimbing');
  const { state: s1 } = applyAction(state, { type: 'milestone', difficulty: tier });
  const reward = { beginner: 2, intermediate: 3, expert: 4 }[tier];
  check(`a ${tier} milestone send pays ${reward} Grit`, s1.players[0].character.grit === 3 + reward);

  // Training costs one Grit; with none left it is refused, with a reason.
  const { state: t0 } = createGame({ seed: 3, characterKeys: ['ironLung'], rules: GRIT_GAME });
  const tc = t0.players[0].character;
  tc.grit = 1;
  const { state: t1 } = applyAction(t0, { type: 'train', areaName: 'Grip Board' });
  check('a training session costs 1 Grit', t1.players[0].character.grit === 0);
  check('no training on the menu with 0 Grit', !getLegalActions(t1).some(a => a.type === 'train'));
  const why = illegalActionReason(t1, { type: 'train', areaName: 'Campus Board' });
  check('refusal reason: notEnoughGrit', why && why.code === 'notEnoughGrit', JSON.stringify(why));

  // Gear: priced in Grit, XP untouched.
  const { state: g0 } = createGame({ seed: 3, characterKeys: ['ironLung'], rules: GRIT_GAME });
  const gc = g0.players[0].character;
  const belay = GEAR_SHOP.find(g => g.name === 'Belay Device');
  const price = gearPrice(g0.rules, gc, belay);
  check('Belay Device costs 70 XP / 25 → 3 Grit', price === 3);
  gc.grit = price;
  gc.xp = 40;
  const { state: g1 } = applyAction(g0, { type: 'buyGear', gearName: 'Belay Device' });
  const after = g1.players[0].character;
  check('buying gear spends Grit, not XP', after.grit === 0 && after.xp === 40 && after.equipment.includes('Belay Device'));
  const whyGear = illegalActionReason(g1, { type: 'buyGear', gearName: 'Locking Carabiner' });
  check('refusal reason: notEnoughGrit for gear', whyGear && whyGear.code === 'notEnoughGrit', JSON.stringify(whyGear));
}

// =============================================================================
// Round end: Setter deals fresh Grit; per-round allowance
// =============================================================================
{
  const { state } = createGame({ seed: 5, characterKeys: ['ironLung'], rules: GRIT_GAME });
  // Empty every card, then end the round (Setter starts on Lead).
  for (const r of allDealt(state)) r.grit = 0;
  const { state: s1 } = applyAction(state, { type: 'endTurn' });
  check('the reset wall (Lead) is dealt fresh Grit',
    s1.availableRoutes.leadClimbing.every(r => r.grit === routeGritValue(s1.rules, r)));
  check('walls the Setter did not reset keep their empty cards',
    s1.availableRoutes.bouldering.every(r => r.grit === 0));
  check('per-round allowance: +1 Grit at the new round', s1.players[0].character.grit === 4);
}

// =============================================================================
// Training-cap cards
// =============================================================================
{
  let capDeck = false;
  for (let seed = 1; seed <= 80 && !capDeck; seed++) {
    const { state } = createGame({ seed, characterKeys: ['ironLung'], rules: CAPPED });
    if (state.availableGear.some(g => g.variantOnly)) capDeck = true;
  }
  check('training-cap games can deal the training cards', capDeck);

  const { state } = createGame({ seed: 5, characterKeys: ['ironLung'], rules: CAPPED });
  const c = state.players[0].character;
  check('cap at Level 1 is +10', trainingCap(state.rules, c) === 10);
  c.equipment.push('Hangboard Program');
  check('Hangboard Program raises the cap to +15', trainingCap(state.rules, c) === 15);

  // Training Partner: first session each round free, then 1 Grit.
  const { state: p0 } = createGame({ seed: 5, characterKeys: ['ironLung'], rules: CAPPED });
  const pc = p0.players[0].character;
  pc.equipment.push('Training Partner');
  pc.grit = 1;
  const { state: p1 } = applyAction(p0, { type: 'train', areaName: 'Grip Board' });
  check('Training Partner: first session of the round is free', p1.players[0].character.grit === 1);
  const { state: p2 } = applyAction(p1, { type: 'train', areaName: 'Balance and Core' });
  check('Training Partner: the second session costs a Grit', p2.players[0].character.grit === 0);
  let p3 = p2;
  while (p3.round === p2.round) ({ state: p3 } = applyAction(p3, { type: 'endTurn' }));
  check('Training Partner: free again next round', trainingGritCost(p3.rules, p3.players[0].character) === 0);
}

// =============================================================================
// Recommended preset and per-character overrides
// =============================================================================
{
  const { state } = createGame({ seed: 9, characterKeys: ['ironLung', 'freeSolo'], rules: GRIT_RULES });
  check('GRIT_RULES: seats start with 0 / 2 Grit', state.players[0].character.grit === 0 && state.players[1].character.grit === 2);
  check('GRIT_RULES: cap +10 at Level 1', trainingCap(state.rules, state.players[0].character) === 10);
  check('GRIT_RULES: route cards carry 2 / 3 / 4 Grit by band',
    allDealt(state).every(r => r.grit === [2, 3, 4][gradeBand(r)]));
  const { state: s1 } = applyAction(state, { type: 'endTurn' });
  const { state: s2 } = applyAction(s1, { type: 'endTurn' });
  check('GRIT_RULES: no allowance for Iron Lung; Free Solo +2 a round',
    s2.round === 2 && s2.players[0].character.grit === 0 && s2.players[1].character.grit === 4);
  const { state: four } = createGame({ seed: 9, characterKeys: ['ironLung', 'technician', 'sprinter', 'routeReader'], rules: GRIT_RULES });
  check('GRIT_RULES: 4 seats start with 0 / 2 / 4 / 6 Grit', four.players.map(p => p.character.grit).join() === '0,2,4,6');
  check('climber balance is printed (1.1.0): RR near-miss 3, Tech Milestone-only Time, Sprinter 85% XP, IL growth 2',
    abilityParam(four.players[3].character, 'nearMiss') === 3 && abilityParam(four.players[1].character, 'extraTimeOn') === 'milestone' &&
    abilityParam(four.players[2].character, 'xpMultiplier') === 0.85 && four.players[0].character.growth.strength === 2);

  // These checks isolate per-character settings, so seat Grit is switched off.
  const NO_SEATS = { ...GRIT_RULES, grit: { ...GRIT_RULES.grit, seatStart: [] } };
  const rules = { ...NO_SEATS, characters: { freeSolo: { gritStart: 5, trainCapMultiplier: 2 } } };
  const { state: o } = createGame({ seed: 9, characterKeys: ['ironLung', 'freeSolo'], rules });
  const [il, fs] = o.players.map(p => p.character);
  check('per-character gritStart: Free Solo 5, Iron Lung 0', fs.grit === 5 && il.grit === 0);
  check('per-character trainCapMultiplier: Free Solo cap 20, Iron Lung 10',
    trainingCap(o.rules, fs) === 20 && trainingCap(o.rules, il) === 10);
  const open = { ...NO_SEATS, characters: { freeSolo: { uncapped: true } } };
  const { state: u } = createGame({ seed: 9, characterKeys: ['freeSolo'], rules: open });
  check('per-character uncapped: no cap for Free Solo', trainingCap(u.rules, u.players[0].character) === Infinity);
  const seats = { ...NO_SEATS, grit: { ...NO_SEATS.grit, seatStart: [0, 1, 2] } };
  const { state: st } = createGame({ seed: 9, characterKeys: ['ironLung', 'technician', 'sprinter'], rules: seats });
  check('seatStart: seats start with 0 / 1 / 2 Grit', st.players.map(p => p.character.grit).join() === '0,1,2');

  // Per-character income and free training.
  const income = { ...NO_SEATS, characters: { freeSolo: { gritPerRound: 1, freeTraining: true } } };
  const { state: g0 } = createGame({ seed: 9, characterKeys: ['ironLung', 'freeSolo'], rules: income });
  check('freeTraining: Free Solo trains for 0 Grit, Iron Lung pays 1',
    trainingGritCost(g0.rules, g0.players[1].character) === 0 && trainingGritCost(g0.rules, g0.players[0].character) === 1);
  let g1 = g0;
  while (g1.round === 1) ({ state: g1 } = applyAction(g1, { type: 'endTurn' }));
  check('gritPerRound: Free Solo +1 at the new round, Iron Lung +0',
    g1.players[1].character.grit === 1 && g1.players[0].character.grit === 0);
  g1.currentPlayerIndex = 1;
  const { state: g2 } = applyAction(g1, { type: 'train', areaName: 'Campus Board' });
  check('freeTraining: a session leaves Free Solo\'s Grit untouched', g2.players[1].character.grit === 1);
}

const failed = results.filter(r => !r.pass);
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} Grit-economy assertions FAILED.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} Grit-economy assertions passed.`);
