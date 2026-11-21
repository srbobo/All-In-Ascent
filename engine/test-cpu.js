// Tests for the human-facing CPU ladder (engine/cpu.js) and replay records
// (engine/replay-record.js).
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
//
// The CPU checks are about what players get: every level only ever picks a
// legal action, is reproducible from its seed, finishes games, and the levels
// are ordered (Hard beats Easy). The replay checks are about what the
// learning bot gets: a replay record rebuilds the exact game.

import { createGame } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import { GRIT_RULES } from './helpers.js';
import { CHARACTERS } from './data.js';
import { ENGINE_VERSION_STRING } from './version.js';
import { CPU_LEVELS, CPU_LEVEL_KEYS, CPU_MODEL, cpuLevel, cpuSeed, createCpuAgent } from './cpu.js';
import {
  buildReplayRecord, validateReplayRecord, replayRecordState, REPLAY_RECORD_SCHEMA, REPLAY_MAX_BYTES,
} from './replay-record.js';
import { buildMatchRecord, validateMatchRecord } from './match-record.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}
const KNOWN = new Set(Object.keys(CHARACTERS));

// Play a game with one CPU per seat. Returns the final state and whether
// every choice was a valid index into the legal actions.
async function playCpus(seed, characterKeys, levels, maxSteps = 6000) {
  let { state } = createGame({ seed, characterKeys, rules: GRIT_RULES });
  const agents = levels.map((lv, i) => createCpuAgent(lv, { seed: cpuSeed(seed, i) }));
  let legalOnly = true;
  for (let i = 0; i < maxSteps && !state.gameEnded; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= legal.length) { legalOnly = false; break; }
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return { state, legalOnly };
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------
check('three levels, easiest first', CPU_LEVEL_KEYS.join() === 'easy,medium,hard');
check('every level has a label', CPU_LEVEL_KEYS.every(k => typeof CPU_LEVELS[k].label === 'string' && CPU_LEVELS[k].label));
check('random moves fall as the level rises', CPU_LEVELS.easy.epsilon > CPU_LEVELS.medium.epsilon && CPU_LEVELS.medium.epsilon > CPU_LEVELS.hard.epsilon
  && CPU_LEVELS.hard.epsilon === 0);
check('unknown levels play as Easy', cpuLevel('hard') === 'hard' && cpuLevel(undefined) === 'easy' && cpuLevel('HARD') === 'easy'
  && cpuLevel('toString') === 'easy' && cpuLevel(null) === 'easy');
check('per-seat seeds differ by seat and by game', cpuSeed(7, 0) !== cpuSeed(7, 1) && cpuSeed(7, 0) !== cpuSeed(8, 0)
  && cpuSeed(7, 1) === cpuSeed(7, 1));
{
  const a = createCpuAgent('hard', { seed: 3 });
  check('agent carries its level and model', a.level === 'hard' && a.model === CPU_MODEL && a.name === 'cpu-hard');
  check('a bad level makes an Easy agent', createCpuAgent('bogus').level === 'easy');
}

// Every level, every character: legal choices only, and the game finishes.
{
  const keys = Object.keys(CHARACTERS);
  let bad = '';
  let unfinished = '';
  for (const level of CPU_LEVEL_KEYS) {
    for (let i = 0; i < keys.length; i++) {
      const pair = [keys[i], keys[(i + 1) % keys.length]];
      const { state, legalOnly } = await playCpus(40 + i, pair, [level, level]);
      if (!legalOnly) bad ||= `${level} ${pair}`;
      if (!state.gameEnded) unfinished ||= `${level} ${pair} (round ${state.round})`;
    }
  }
  check('every level only picks legal actions (5 games each)', !bad, bad);
  check('every level finishes its games', !unfinished, unfinished);
}

// Reproducible: the same seeds give the same game.
{
  const a = await playCpus(77, ['routeReader', 'sprinter', 'freeSolo'], ['easy', 'medium', 'hard']);
  const b = await playCpus(77, ['routeReader', 'sprinter', 'freeSolo'], ['easy', 'medium', 'hard']);
  check('same seed, same CPUs → identical game', JSON.stringify(a.state) === JSON.stringify(b.state));
}

// The levels are ordered: Hard beats Easy over a fixed set of games (both
// seat orders, every character pair once). Calibration at the time of
// writing: Hard 157–43 Easy, Medium 140–60 Easy, Hard 117–83 Medium over 200.
{
  const keys = Object.keys(CHARACTERS);
  let hard = 0;
  let easy = 0;
  let g = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      for (const flip of [false, true]) {
        g++;
        const levels = flip ? ['easy', 'hard'] : ['hard', 'easy'];
        const { state } = await playCpus(500 + g, [keys[i], keys[j]], levels);
        if (!state.winner) continue;
        const winnerLevel = levels[state.winner - 1];
        if (winnerLevel === 'hard') hard++; else easy++;
      }
    }
  }
  check(`Hard beats Easy over ${g} games (${hard}–${easy})`, hard >= easy * 2, `${hard}–${easy}`);
}

// ---------------------------------------------------------------------------
// Replay records
// ---------------------------------------------------------------------------
{
  const seed = 2024;
  const keys = ['technician', 'ironLung', 'routeReader', 'freeSolo'];
  const { state } = await playCpus(seed, keys, ['hard', 'medium', 'easy', 'hard']);
  check('4p CPU game finished', state.gameEnded);
  const before = JSON.stringify(state);
  const seats = [{ controller: 'human' }, ...keys.slice(1).map((_, i) => ({ controller: 'bot', botLevel: ['medium', 'easy', 'hard'][i], botModel: CPU_MODEL }))];
  const meta = { id: 'test-replay-1', mode: 'local', startedAt: 10, finishedAt: 20, seats };
  const rep = buildReplayRecord(state, meta);
  check('replay: does not mutate the state', JSON.stringify(state) === before);
  check('replay: plain JSON', JSON.stringify(JSON.parse(JSON.stringify(rep))) === JSON.stringify(rep));
  check('replay: header', rep.schema === REPLAY_RECORD_SCHEMA && rep.id === 'test-replay-1' && rep.mode === 'local'
    && rep.engineVersion === ENGINE_VERSION_STRING && rep.seed === seed && rep.startedAt === 10 && rep.finishedAt === 20
    && rep.ended === true && rep.winner === state.winner && rep.rounds === state.round);
  check('replay: characters in seat order', rep.characterKeys.join() === keys.join());
  check('replay: seats say who played (and nothing else)', rep.seats[0].controller === 'human' && rep.seats[0].botLevel === null
    && rep.seats[0].botModel === null && rep.seats[1].controller === 'bot' && rep.seats[1].botLevel === 'medium'
    && rep.seats[1].botModel === CPU_MODEL && rep.seats.every(s => Object.keys(s).sort().join() === 'botLevel,botModel,controller'));
  const actionEvents = state.events.filter(e => e.type === 'action_chosen');
  check('replay: one action per action_chosen event', rep.actions.length === actionEvents.length && rep.actions.length > 100);
  check('replay: rebuilds the final state exactly', JSON.stringify(replayRecordState(rep)) === before);
  check('replay: rules are recorded', JSON.stringify(rep.rules) === JSON.stringify(GRIT_RULES));
  const bytes = JSON.stringify(rep).length;
  check(`replay: a 4p game fits the size limit (${(bytes / 1024).toFixed(1)} KB of ${REPLAY_MAX_BYTES / 1024})`, bytes < REPLAY_MAX_BYTES / 2);
  check('replay: valid', validateReplayRecord(rep, KNOWN) === null, validateReplayRecord(rep, KNOWN));

  const invalid = [
    ['not an object', null],
    ['unknown schema', { ...rep, schema: 'x' }],
    ['bad id', { ...rep, id: 'a b' }],
    ['bad mode', { ...rep, mode: 'arcade' }],
    ['bad seed', { ...rep, seed: -1 }],
    ['bad characters', { ...rep, characterKeys: [] }],
    ['unknown character', { ...rep, characterKeys: ['technician', 'ironLung', 'routeReader', 'wizard'] }],
    ['bad seats', { ...rep, seats: rep.seats.slice(1) }],
    ['bad controller', { ...rep, seats: [{ controller: 'ghost' }, ...rep.seats.slice(1)] }],
    ['bad botModel', { ...rep, seats: [{ controller: 'bot', botModel: 5 }, ...rep.seats.slice(1)] }],
    ['bad actions', { ...rep, actions: [] }],
    ['bad action', { ...rep, actions: [{ type: 'teleport' }] }],
  ];
  for (const [reason, r] of invalid) {
    check(`replay validation: ${reason}`, validateReplayRecord(r, KNOWN) === reason, validateReplayRecord(r, KNOWN));
  }

  // The game's match record carries the same seats, with the CPU model.
  const match = buildMatchRecord(state, meta);
  check('match record: botModel on CPU seats, null on humans', match.players[0].botModel === null
    && match.players.slice(1).every(p => p.botModel === CPU_MODEL));
  check('match record with botModel is valid', validateMatchRecord(match, KNOWN) === null);
  const badModel = { ...match, players: [{ ...match.players[0], botModel: 'x'.repeat(41) }, ...match.players.slice(1)] };
  check('match record: an overlong botModel is refused', validateMatchRecord(badModel, KNOWN) === 'bad botModel');
}
{
  // A game that has not ended still records (ended false, no winner).
  let { state } = createGame({ seed: 9, characterKeys: ['sprinter'], rules: GRIT_RULES });
  for (let i = 0; i < 5; i++) ({ state } = applyAction(state, getLegalActions(state)[0]));
  const rep = buildReplayRecord(state, { id: 'test-partial' });
  check('replay: unfinished game', rep.ended === false && rep.winner === null && rep.mode === 'local' && rep.seats[0].controller === 'human');
  check('replay: unfinished game rebuilds', JSON.stringify(replayRecordState(rep)) === JSON.stringify(state));
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} CPU and replay checks passed`);
if (failed.length) process.exit(1);
