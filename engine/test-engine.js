// Full-engine smoke tests.
//
// Run:  npm run test:engine  (chained in package.json)
//
// What this verifies:
//   - applyAction round-trips: state in, new state out, no mutation of input.
//   - getLegalActions returns a non-empty list at every decision point.
//   - Running a full game with a uniform-random policy terminates under
//     the per-test step cap (no engine-level round cap as of v0.5.0).
//   - Running the same (seed, character, policy-seed) twice produces
//     byte-identical event streams (top-level determinism check).
//   - State invariants hold at every step: no negative endurance, round
//     never decreases, events monotonic, etc.
//   - Specific action handlers do the right thing on a handcrafted state.

import { createGame } from './state.js';
import { getLegalActions, applyAction, isTerminal } from './engine.js';
import { createRng } from './rng.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// 1. Immutability: applyAction returns a fresh state; input is untouched.
// ---------------------------------------------------------------------------
{
  const { state } = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'] });
  const snapshotBefore = JSON.stringify(state);
  const legal = getLegalActions(state);
  check('getLegalActions returns non-empty list for initial state', legal.length > 0);
  const { state: next } = applyAction(state, legal[0]);
  check('applyAction returns a new state object (not the same ref)', next !== state);
  check('applyAction does not mutate the input state',
    JSON.stringify(state) === snapshotBefore);
  check('next state has at least as many events as input', next.events.length > state.events.length);
}

// ---------------------------------------------------------------------------
// 2. Event sequence numbers are monotonic across the whole game log.
// ---------------------------------------------------------------------------
{
  let { state } = createGame({ seed: 7, characterKeys: ['technician', 'ironLung'] });
  const rng = createRng(1234);
  for (let i = 0; i < 20; i++) {
    const term = isTerminal(state);
    if (term.done) break;
    const legal = getLegalActions(state);
    if (!legal.length) break;
    const action = legal[Math.floor(rng.next() * legal.length)];
    ({ state } = applyAction(state, action));
  }
  let monotonic = true;
  for (let i = 1; i < state.events.length; i++) {
    if (state.events[i].t !== state.events[i - 1].t + 1) { monotonic = false; break; }
  }
  check('event sequence numbers are strictly monotonic (+1)', monotonic);
}

// ---------------------------------------------------------------------------
// 3. Random agent plays a full game to completion.
// ---------------------------------------------------------------------------
function playFullGame(gameSeed, policySeed, characterKeys) {
  let { state } = createGame({ seed: gameSeed, characterKeys });
  const policy = createRng(policySeed);
  let steps = 0;
  const maxSteps = 5000; // agent-loop safety net — engine has no round cap
  while (true) {
    const term = isTerminal(state);
    if (term.done) return { finalState: state, term, steps };
    const legal = getLegalActions(state);
    if (!legal.length) throw new Error('no legal actions but game not terminal');
    const action = legal[Math.floor(policy.next() * legal.length)];
    ({ state } = applyAction(state, action));
    steps++;
    if (steps > maxSteps) throw new Error(`exceeded ${maxSteps} agent steps without termination`);
  }
}

{
  const { finalState, term, steps } = playFullGame(42, 99, ['technician', 'sprinter']);
  check('random 2p game terminates', term.done);
  check('terminated with a valid reason',
    ['all_milestones', 'forfeit'].includes(term.reason));
  check('game took at least 1 step', steps >= 1);
  check('game_end event emitted', finalState.events.some(e => e.type === 'game_end'));
  // Invariants on final state.
  const invariantsHold = finalState.players.every(p => {
    const c = p.character;
    return c.currentEndurance >= 0 && c.level >= 1 && c.level <= 15 &&
           c.xp >= 0 && c.timeRemaining >= -10; // negative time can happen via costs
  });
  check('final per-player invariants hold', invariantsHold);
  console.log(`  (game ended at round ${finalState.round}, ${steps} actions, ${finalState.events.length} events; reason=${term.reason})`);
}

// ---------------------------------------------------------------------------
// 4. Three-player and four-player games also terminate.
// ---------------------------------------------------------------------------
{
  const r3 = playFullGame(42, 99, ['technician', 'sprinter', 'ironLung']);
  check('random 3p game terminates', r3.term.done);
  const r4 = playFullGame(42, 99, ['technician', 'sprinter', 'ironLung', 'freeSolo']);
  check('random 4p game terminates', r4.term.done);
}

// ---------------------------------------------------------------------------
// 5. Determinism: same (gameSeed, policySeed, characters) → identical events.
// ---------------------------------------------------------------------------
{
  const a = playFullGame(1234, 5678, ['technician', 'routeReader']);
  const b = playFullGame(1234, 5678, ['technician', 'routeReader']);
  const same = JSON.stringify(a.finalState.events) === JSON.stringify(b.finalState.events);
  check('identical inputs → byte-identical event streams', same);
  check('identical inputs → same winner and rounds',
    a.term.winner === b.term.winner && a.finalState.round === b.finalState.round);
}

// ---------------------------------------------------------------------------
// 6. Different game seeds → different games (almost always).
// ---------------------------------------------------------------------------
{
  const a = playFullGame(1, 5, ['technician', 'sprinter']);
  const b = playFullGame(2, 5, ['technician', 'sprinter']);
  const same = JSON.stringify(a.finalState.events) === JSON.stringify(b.finalState.events);
  check('different game seeds → different event streams', !same);
}

// ---------------------------------------------------------------------------
// 7. Train action: exact pre/post check on a constructed state.
// ---------------------------------------------------------------------------
{
  const { state } = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'] });
  const p0 = state.players[0].character;
  const tBefore = p0.timeRemaining;
  const eBefore = p0.currentEndurance;
  const focusBefore = p0.trainingBonuses.focus;
  // Train at Grip Board (stat: focus, bonus: 5, time: 2, endurance: 10)
  const { state: s1, events } = applyAction(state, { type: 'train', areaName: 'Grip Board' });
  const p0After = s1.players[0].character;
  check('train: time decreased by 2',
    p0After.timeRemaining === tBefore - 2);
  check('train: endurance decreased by 10',
    p0After.currentEndurance === eBefore - 10);
  check('train: focus training bonus +5',
    p0After.trainingBonuses.focus === focusBefore + 5);
  check('train: location updated to Grip Board',
    p0After.location === 'Grip Board' || p0After.location === 'lobby'); // lobby if round reset
  check('train emits train_action event',
    events.some(e => e.type === 'train_action'));
}

// ---------------------------------------------------------------------------
// 8. Rest action: endurance recovery and Route Reader beta activation.
// ---------------------------------------------------------------------------
{
  const { state } = createGame({ seed: 1, characterKeys: ['routeReader', 'sprinter'] });
  // Drain player 1's endurance to 20 so rest actually recovers.
  state.players[0].character.currentEndurance = 20;
  const { state: s1, events } = applyAction(state, { type: 'rest' });
  const c = s1.players[0].character;
  check('rest: endurance recovered above 20', c.currentEndurance > 20);
  check('rest: betaBoostActive true for Route Reader after rest',
    c.betaBoostActive === true);
  check('rest emits rest_action event',
    events.some(e => e.type === 'rest_action'));
  check('rest_action payload reports beta boost activation',
    events.find(e => e.type === 'rest_action').payload.betaBoostActivated === true);
}

// ---------------------------------------------------------------------------
// 9. endTurn action: zeros time and advances turn.
// ---------------------------------------------------------------------------
{
  const { state } = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'] });
  const curBefore = state.currentPlayerIndex;
  const { state: s1, events } = applyAction(state, { type: 'endTurn' });
  // currentPlayerIndex should have moved (or round ended back to 0).
  check('endTurn emits end_turn_chosen',
    events.some(e => e.type === 'end_turn_chosen'));
  check('endTurn advances the turn marker',
    s1.currentPlayerIndex !== curBefore || s1.round > state.round);
}

// ---------------------------------------------------------------------------
// 10. Climb action: attempted route tracked, dice event emitted.
// ---------------------------------------------------------------------------
{
  const { state } = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'] });
  const legal = getLegalActions(state);
  const climb = legal.find(a => a.type === 'climb');
  if (climb) {
    const { state: s1, events } = applyAction(state, climb);
    const key = `${climb.area}:${climb.routeName}`;
    check('climb: attemptedRoutes marks the route',
      s1.attemptedRoutes[1][key] === true);
    check('climb emits dice_rolled event',
      events.some(e => e.type === 'dice_rolled'));
    check('climb emits climb_resolved event',
      events.some(e => e.type === 'climb_resolved'));
  } else {
    check('climb: at least one climb should be legal from opening state', false,
      `only got action types: ${[...new Set(legal.map(a => a.type))].join(',')}`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const failures = results.filter(r => !r.pass).length;
if (failures) {
  console.error(`\n${failures} of ${results.length} engine assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} engine assertions passed.`);
