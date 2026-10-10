// Tests for the engine pieces the UIs (local game.js and the online client)
// build on, so both stay driven by the same rules:
//   - findLegalAction: one matcher for a clicked action
//   - explainIllegalAction: the player-facing reason a click is refused, and
//     it agrees with getLegalActions on every action in many random games
//   - climb_resolved.gearEffects / failPenalty / enduranceCost
//   - applySuccessHeal: Power Spotting heals up to max, never takes endurance away
//
// Run:  npm run test:engine

import { createGame } from './state.js';
import { getLegalActions, applyAction, findLegalAction, explainIllegalAction, illegalActionReason } from './engine.js';
import { applySuccessHeal } from './helpers.js';
import { createRng } from './rng.js';
import { ROUTES, GEAR_SHOP, TRAINING_AREAS } from './data.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

// A one-player game whose wall/shop/character we can set up by hand.
function soloGame(characterKey, edit = () => {}) {
  const { state } = createGame({ seed: 11, characterKeys: [characterKey] });
  edit(state, state.players[0].character);
  return state;
}
const climbEvents = (events) => ({
  rolled: events.find(e => e.type === 'dice_rolled').payload,
  resolved: events.find(e => e.type === 'climb_resolved').payload,
});

// =============================================================================
// findLegalAction
// =============================================================================
{
  const state = soloGame('ironLung');
  const legal = getLegalActions(state);
  const climb = legal.find(a => a.type === 'climb');
  check('findLegalAction matches a partial climb', findLegalAction(legal, { type: 'climb', area: climb.area, routeName: climb.routeName }) === climb);
  check('findLegalAction ignores an attached shift', findLegalAction(legal, { ...climb, shift: { from: 'focus', to: 'strength', amount: 2 } }) === climb);
  check('findLegalAction returns null for an unknown route', findLegalAction(legal, { type: 'climb', area: 'bouldering', routeName: 'Nope' }) === null);
  check('findLegalAction matches rest', findLegalAction(legal, { type: 'rest' })?.type === 'rest');
}

// =============================================================================
// explainIllegalAction — specific reasons
// =============================================================================
{
  const base = soloGame('ironLung');
  const route = base.availableRoutes.bouldering[0];
  const climb = { type: 'climb', area: 'bouldering', routeName: route.name };
  check('legal action → no reason', explainIllegalAction(base, climb) === null);

  const tired = soloGame('ironLung', (s, c) => { c.currentEndurance = 0; });
  check('endurance reason names the cost', /Not enough endurance/.test(explainIllegalAction(tired, climb)));

  const late = soloGame('ironLung', (s, c) => { c.timeRemaining = 0; });
  check('rest with no time is refused', explainIllegalAction(late, { type: 'rest' }) === 'Not enough time to rest.');

  const { state: afterClimb } = applyAction(base, findLegalAction(getLegalActions(base), climb));
  check('already-attempted route is explained',
    /already attempted/.test(explainIllegalAction(afterClimb, climb) || ''), explainIllegalAction(afterClimb, climb));

  const lead = base.availableRoutes.leadClimbing[0];
  check('Lead without gear names the missing cards',
    /You need Belay Device, Locking Carabiner, Lead Rope/.test(explainIllegalAction(base, { type: 'climb', area: 'leadClimbing', routeName: lead.name })));

  const poor = { type: 'buyGear', gearName: base.availableGear[0].name };
  check('gear without XP explains spendable XP', /Not enough spendable XP/.test(explainIllegalAction(base, poor)));
  check('Lead Rope without its prerequisites is explained',
    /requires Belay Device, Locking Carabiner/.test(explainIllegalAction(soloGame('ironLung', (s, c) => { c.xp = 500; }), { type: 'buyGear', gearName: 'Lead Rope' }) || ''));

  const two = createGame({ seed: 3, characterKeys: ['ironLung', 'sprinter'] }).state;
  two.players[1].character.location = TRAINING_AREAS[0].name;
  check('occupied training station is explained',
    /in use by Player 2/.test(explainIllegalAction(two, { type: 'train', areaName: TRAINING_AREAS[0].name }) || ''));

  const solo = soloGame('freeSolo', (s) => {
    s.availableRoutes.bouldering = [ROUTES.bouldering.reduce((a, b) => (a.strength > b.strength ? a : b))];
  });
  const hardest = solo.availableRoutes.bouldering[0];
  check('Free Solo Life or Die is explained',
    /Life or Die/.test(explainIllegalAction(solo, { type: 'climb', area: 'bouldering', routeName: hardest.name }) || ''));

  const rr = soloGame('ironLung');
  check('a stat shift from a non-Route Reader is refused',
    /Versatility/.test(explainIllegalAction(rr, { ...climb, shift: { from: 'focus', to: 'strength', amount: 3 } }) || ''));
}

// =============================================================================
// illegalActionReason — codes and details for UIs to word
// =============================================================================
{
  const base = soloGame('ironLung');
  const lead = base.availableRoutes.leadClimbing[0];
  const r = illegalActionReason(base, { type: 'climb', area: 'leadClimbing', routeName: lead.name });
  check('needsGear lists the missing cards', r.code === 'needsGear' && r.missing.length === 3, JSON.stringify(r));
  const tired = soloGame('ironLung', (s, c) => { c.currentEndurance = 1; });
  const e = illegalActionReason(tired, { type: 'climb', area: 'bouldering', routeName: tired.availableRoutes.bouldering[0].name });
  check('notEnoughEndurance carries need/have', e.code === 'notEnoughEndurance' && e.have === 1 && e.need > 1, JSON.stringify(e));
  const rope = illegalActionReason(soloGame('ironLung', (s, c) => { c.xp = 500; }), { type: 'buyGear', gearName: 'Lead Rope' });
  check('needsItems lists prerequisites', rope.code === 'needsItems' && rope.missing.includes('Belay Device'), JSON.stringify(rope));
  check('legal action → null reason', illegalActionReason(base, { type: 'rest' }) === null);
  const two = createGame({ seed: 3, characterKeys: ['ironLung', 'sprinter'] }).state;
  two.players[1].character.location = TRAINING_AREAS[0].name;
  const busy = illegalActionReason(two, { type: 'train', areaName: TRAINING_AREAS[0].name });
  check('stationInUse names the occupant', busy.code === 'stationInUse' && busy.occupants[0] === 2, JSON.stringify(busy));
}

// =============================================================================
// explainIllegalAction agrees with getLegalActions everywhere
// =============================================================================
{
  // Every action a UI could ask for in `state`.
  const candidates = (s) => [
    { type: 'rest' }, { type: 'endTurn' },
    ...['bouldering', 'topRope', 'leadClimbing'].flatMap(area =>
      s.availableRoutes[area].map(r => ({ type: 'climb', area, routeName: r.name }))),
    ...['beginner', 'intermediate', 'expert'].map(difficulty => ({ type: 'milestone', difficulty })),
    ...TRAINING_AREAS.map(a => ({ type: 'train', areaName: a.name })),
    ...GEAR_SHOP.map(g => ({ type: 'buyGear', gearName: g.name })),
  ];
  let checked = 0;
  let disagreement = '';
  for (let g = 0; g < 12 && !disagreement; g++) {
    const rng = createRng(500 + g);
    const keys = rng.shuffle(['technician', 'sprinter', 'ironLung', 'routeReader', 'freeSolo']).slice(0, 1 + (g % 4));
    let { state } = createGame({ seed: 900 + g, characterKeys: keys });
    for (let i = 0; i < 250 && !state.gameEnded && !disagreement; i++) {
      const legal = getLegalActions(state);
      for (const wanted of candidates(state)) {
        const isLegal = !!findLegalAction(legal, wanted);
        const reason = explainIllegalAction(state, wanted);
        const structured = illegalActionReason(state, wanted);
        checked++;
        if (isLegal !== (reason === null) || (!isLegal && typeof reason !== 'string')
            || (!isLegal && (typeof structured.code !== 'string' || structured.message !== reason))) {
          disagreement = `game ${g} step ${i}: ${JSON.stringify(wanted)} legal=${isLegal} reason=${reason}`;
          break;
        }
      }
      const moves = legal.filter(a => a.type !== 'endTurn');
      ({ state } = applyAction(state, moves.length ? moves[Math.floor(rng.next() * moves.length)] : legal[0]));
    }
  }
  check(`explainIllegalAction gives a reason exactly when getLegalActions refuses (${checked} checks)`, !disagreement, disagreement);
}

// =============================================================================
// Success heal (Power Spotting) and climb_resolved reporting
// =============================================================================
check('heal stops at maxEndurance', applySuccessHeal(98, 100, 5) === 100);
check('heal adds when below max', applySuccessHeal(80, 100, 5) === 85);
check('heal never lowers endurance above max', applySuccessHeal(112, 100, 5) === 112);
check('no heal leaves endurance alone', applySuccessHeal(112, 100, 0) === 112);

{
  // Power Spotting on a guaranteed success while rested above max endurance.
  const easy = ROUTES.bouldering.reduce((a, b) => (a.strength + a.technique < b.strength + b.technique ? a : b));
  const state = soloGame('ironLung', (s, c) => {
    s.availableRoutes.bouldering = [{ ...easy, rollEffect: [] }];
    c.equipment = ['Power Spotting'];
    c.trainingBonuses = { strength: 99, technique: 99, focus: 99, flexibility: 99 };
    c.currentEndurance = c.maxEndurance + 20;
  });
  const before = state.players[0].character.currentEndurance;
  const { state: next, events } = applyAction(state, { type: 'climb', area: 'bouldering', routeName: easy.name });
  const { resolved } = climbEvents(events);
  check('success above max endurance keeps the surplus (no cap-down)',
    resolved.success && next.players[0].character.currentEndurance === before - easy.endurance,
    `before ${before}, after ${next.players[0].character.currentEndurance}`);
}
{
  // Body Tension Belt + Mental Anchor + Confidence Building on a sure failure.
  const roof = ROUTES.bouldering.concat(ROUTES.topRope, ROUTES.leadClimbing).find(r => r.tag === 'Roof/Sloper');
  const state = soloGame('ironLung', (s, c) => {
    s.availableRoutes.bouldering = [{ ...roof }];
    c.equipment = ['Body Tension Belt', 'Mental Anchor', 'Confidence Building'];
    c.stats = { strength: 0, technique: 0, focus: 0, flexibility: 0 };
  });
  const { events } = applyAction(state, { type: 'climb', area: 'bouldering', routeName: roof.name });
  const { resolved } = climbEvents(events);
  const kinds = resolved.gearEffects.map(g => g.effectKind);
  check('failed climb reports its gear effects',
    !resolved.success && ['enduranceHalvedOnTag', 'ignoreFailPenalty', 'failBonusXp'].every(k => kinds.includes(k)), JSON.stringify(kinds));
  check('enduranceCost reports the halved cost', resolved.enduranceCost === Math.ceil(roof.endurance / 2), `${resolved.enduranceCost}`);
  check('Mental Anchor → failPenalty 0', resolved.failPenalty === 0);
}
{
  const state = soloGame('ironLung', (s, c) => { c.stats = { strength: 0, technique: 0, focus: 0, flexibility: 0 }; });
  const r = state.availableRoutes.bouldering[0];
  const { events } = applyAction(state, { type: 'climb', area: 'bouldering', routeName: r.name });
  const { resolved, rolled } = climbEvents(events);
  check('Iron Lung failure reports failPenalty 5', !resolved.success && resolved.failPenalty === 5);
  check('no gear → no gearEffects, no discarded dice', resolved.gearEffects.length === 0 && rolled.discardedDice.length === 0);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} UI-support assertions passed`);
if (failed.length) process.exit(1);
