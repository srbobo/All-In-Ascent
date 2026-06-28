// Smoke test for createGame and the telemetry emitter.
//
// Run:  npm run test:state
// Verifies:
//   - createGame returns a well-formed initial state and events
//   - same seed + same characters produces byte-identical states and events
//   - different seeds produce different states
//   - rejects invalid inputs (duplicate characters, bad counts, unknown keys)

import { createGame } from './state.js';
import { makeEmitter } from './telemetry.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${label}${detail && !cond ? ` — ${detail}` : ''}`);
}

// --- Telemetry emitter basics ---
{
  const e = makeEmitter(0);
  e.emit('a', { x: 1 });
  e.emit('b', { y: 2 });
  check('emitter assigns sequential t values',
    e.events.length === 2 && e.events[0].t === 0 && e.events[1].t === 1);
  check('emitter records type and payload',
    e.events[0].type === 'a' && e.events[1].payload.y === 2);
}
{
  const e = makeEmitter(42);
  e.emit('c');
  check('emitter honors startingT', e.events[0].t === 42);
}

// --- createGame happy path ---
const { state, events } = createGame({ seed: 12345, characterKeys: ['technician', 'sprinter'] });

check('state.seed recorded', state.seed === 12345);
check('state.round starts at 1', state.round === 1);
check('state.currentPlayerIndex starts at 0', state.currentPlayerIndex === 0);
check('state has 2 players', state.players.length === 2);
check('player 1 is Technician', state.players[0].character.name === 'The Technician');
check('player 2 is Sprinter', state.players[1].character.name === 'The Sprinter');
check('each player starts with 10 time', state.players.every(p => p.character.timeRemaining === 10));
check('each player at lobby', state.players.every(p => p.character.location === 'lobby'));
check('attemptedRoutes initialized empty',
  Object.keys(state.attemptedRoutes).length === 2 &&
  Object.keys(state.attemptedRoutes[1]).length === 0);
check('5 bouldering routes drawn', state.availableRoutes.bouldering.length === 5);
// 2 players → belayerCount 1 → 1 station × 2 routes = 2 top-rope routes, each
// tagged with belayer 0.
check('top-rope routes = 2 per belayer station',
  state.availableRoutes.topRope.length === 2 &&
  state.availableRoutes.topRope.every(r => r.belayer === 0));
check('5 lead routes drawn', state.availableRoutes.leadClimbing.length === 5);
check('3 gear items in shop rotation', state.availableGear.length === 3);
check('milestones selected: beginner',
  state.milestoneRoutes.beginner && state.milestoneRoutes.beginner.route);
check('milestones selected: intermediate',
  state.milestoneRoutes.intermediate && state.milestoneRoutes.intermediate.route);
check('milestones selected: expert',
  state.milestoneRoutes.expert && state.milestoneRoutes.expert.route);
check('belayerCount = players - 1', state.belayerCount === 1);
check('players start with no belayer station',
  state.players.every(p => p.character.belayerStation === null));
check('routeClearingPosition starts at 0', state.routeClearingPosition === 0);
check('gameEnded is false', state.gameEnded === false);
check('winner is null', state.winner === null);

// --- Events ---
check('events emitted non-empty', events.length >= 2);
check('first event is game_start', events[0].type === 'game_start');
check('second event is turn_start', events[1].type === 'turn_start');
check('game_start payload has milestones',
  events[0].payload.milestoneRoutes.beginner.routeName);
check('game_start payload has player list',
  events[0].payload.players.length === 2);
check('state.events == returned events',
  state.events.length === events.length && state.events[0].t === events[0].t);

// --- Determinism: same seed, same characters → identical state ---
{
  const a = createGame({ seed: 99, characterKeys: ['technician', 'sprinter', 'ironLung'] });
  const b = createGame({ seed: 99, characterKeys: ['technician', 'sprinter', 'ironLung'] });
  check('determinism: milestone routes match',
    a.state.milestoneRoutes.beginner.route.name === b.state.milestoneRoutes.beginner.route.name &&
    a.state.milestoneRoutes.expert.route.name === b.state.milestoneRoutes.expert.route.name);
  check('determinism: opening bouldering rotation matches',
    a.state.availableRoutes.bouldering.map(r => r.name).join('|') ===
    b.state.availableRoutes.bouldering.map(r => r.name).join('|'));
  check('determinism: opening shop rotation matches',
    a.state.availableGear.map(g => g.name).join('|') ===
    b.state.availableGear.map(g => g.name).join('|'));
  check('determinism: event streams match',
    JSON.stringify(a.events) === JSON.stringify(b.events));
}

// --- Different seeds → different state (usually) ---
{
  const a = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'] });
  const b = createGame({ seed: 2, characterKeys: ['technician', 'sprinter'] });
  // It's theoretically possible for two seeds to produce identical milestones,
  // but it would be a huge coincidence for the event stream as a whole.
  check('different seeds produce different event streams',
    JSON.stringify(a.events) !== JSON.stringify(b.events));
}

// --- Input validation ---
function expectThrows(label, fn, matchRegex) {
  try { fn(); } catch (err) {
    if (!matchRegex || matchRegex.test(err.message)) { check(label, true); return; }
    check(label, false, `wrong error: ${err.message}`); return;
  }
  check(label, false, 'did not throw');
}

expectThrows('rejects duplicate characters',
  () => createGame({ seed: 1, characterKeys: ['technician', 'technician'] }),
  /duplicate/i);
expectThrows('rejects unknown character',
  () => createGame({ seed: 1, characterKeys: ['nonesuch'] }),
  /unknown character/i);
expectThrows('rejects 0 players',
  () => createGame({ seed: 1, characterKeys: [] }),
  /1.*4/);
expectThrows('rejects 5 players',
  () => createGame({ seed: 1, characterKeys: ['technician', 'sprinter', 'ironLung', 'freeSolo', 'routeReader'] }),
  /1.*4/);
expectThrows('rejects non-numeric seed',
  () => createGame({ seed: 'not-a-number', characterKeys: ['technician'] }),
  /seed/i);

// --- Report ---
const failures = results.filter(r => !r.pass).length;
if (failures) {
  console.error(`\n${failures} of ${results.length} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} assertions passed.`);
