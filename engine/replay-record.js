// Replay records — every move of a finished game, so it can be replayed
// exactly and learned from (the learning-bot plan's data source).
//
//   buildReplayRecord(state, meta)            → plain JSON object (schema REPLAY_RECORD_SCHEMA)
//   validateReplayRecord(record, knownChars)  → null when the record is acceptable, else a reason
//   replayRecordState(record)                 → the final state, rebuilt with the engine
//
// The engine is deterministic: seed + characters + rules (+ Project Mode
// content) + the list of chosen actions reproduces every state of the game,
// human and CPU seats alike. The actions come from the engine's own
// `action_chosen` events, so local play (the browser bundle), online play
// (the GameRoom) and the bot simulations record identically.
//
// Like match records (match-record.js) a replay never holds usernames or
// anything typed by a player: seats are a character and who controlled them.
// `id` is the id of the game's match record, so the two can be joined.
//
// meta (all optional):
//   id, mode, startedAt, finishedAt   as for buildMatchRecord
//   seats   per seat, in player order: { controller: 'human' | 'bot', botLevel, botModel, botRating }

import { ENGINE_VERSION_STRING } from './version.js';
import { createGame } from './state.js';
import { applyAction, isTerminal } from './engine.js';
import { MATCH_MODES } from './match-record.js';

export const REPLAY_RECORD_SCHEMA = 'aia-replay/1';
// The telemetry server refuses bigger bodies; a long 4-player game is ~60 KB.
export const REPLAY_MAX_BYTES = 512 * 1024;

const ACTION_TYPES = ['climb', 'milestone', 'train', 'rest', 'buyGear', 'endTurn'];

export function buildReplayRecord(state, meta = {}) {
  const seats = meta.seats || [];
  const term = isTerminal(state);
  const startedAt = Number.isFinite(meta.startedAt) ? meta.startedAt : null;
  const finishedAt = Number.isFinite(meta.finishedAt) ? meta.finishedAt : null;
  return {
    schema: REPLAY_RECORD_SCHEMA,
    id: meta.id || null,
    mode: MATCH_MODES.includes(meta.mode) ? meta.mode : 'local',
    engineVersion: ENGINE_VERSION_STRING,
    startedAt,
    finishedAt,
    seed: state.seed,
    rules: state.rules || null,
    content: state.content || null,
    characterKeys: state.players.map(p => p.character.key),
    seats: state.players.map((_, i) => {
      const seat = seats[i] || {};
      const bot = seat.controller === 'bot';
      return {
        controller: bot ? 'bot' : 'human',
        botLevel: bot ? (seat.botLevel || null) : null,
        botModel: bot && typeof seat.botModel === 'string' ? seat.botModel : null,
        botRating: bot && Number.isFinite(seat.botRating) ? seat.botRating : null,
      };
    }),
    ended: term.done,
    winner: term.done ? (term.winner ?? null) : null,
    rounds: state.round,
    actions: (state.events || [])
      .filter(e => e.type === 'action_chosen')
      .map(e => e.payload.action),
  };
}

// The telemetry server accepts records from any browser, so it checks the
// shape before storing one. It does not replay the game (that is the
// learner's job, offline, with the matching engine version).
export function validateReplayRecord(r, knownCharacters) {
  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'not an object';
  if (r.schema !== REPLAY_RECORD_SCHEMA) return 'unknown schema';
  if (typeof r.id !== 'string' || !/^[\w.:-]{6,100}$/.test(r.id)) return 'bad id';
  if (!MATCH_MODES.includes(r.mode)) return 'bad mode';
  if (typeof r.engineVersion !== 'string' || r.engineVersion.length > 20) return 'bad engineVersion';
  if (!isInt(r.seed, 0, 2 ** 32)) return 'bad seed';
  if (!Array.isArray(r.characterKeys) || !isInt(r.characterKeys.length, 1, 4)) return 'bad characters';
  if (!r.characterKeys.every(k => knownCharacters.has(k))) return 'unknown character';
  if (!Array.isArray(r.seats) || r.seats.length !== r.characterKeys.length) return 'bad seats';
  for (const s of r.seats) {
    if (!s || !['human', 'bot'].includes(s.controller)) return 'bad controller';
    if (s.botModel != null && (typeof s.botModel !== 'string' || s.botModel.length > 40)) return 'bad botModel';
    if (s.botRating != null && !(Number.isFinite(s.botRating) && s.botRating >= 0 && s.botRating <= 4000)) return 'bad botRating';
  }
  if (!Array.isArray(r.actions) || r.actions.length < 1 || r.actions.length > 20000) return 'bad actions';
  if (!r.actions.every(a => a && ACTION_TYPES.includes(a.type))) return 'bad action';
  return null;
}

// Rebuild the game from the record with this engine. Only meaningful when
// record.engineVersion matches ENGINE_VERSION_STRING (rule changes alter
// outcomes); throws if an action is not legal under this engine.
export function replayRecordState(record) {
  let { state } = createGame({
    seed: record.seed,
    characterKeys: record.characterKeys,
    rules: record.rules || null,
    content: record.content || null,
  });
  for (const action of record.actions) ({ state } = applyAction(state, action));
  return state;
}
