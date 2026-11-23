// Tests for player profiles (engine/player-profile.js) and the Adaptive CPU
// (engine/cpu.js CPU_STRENGTH / epsilonForRating / cpuRating).
//
// Run:  npm run test:engine  (runs all engine tests in sequence)

import { createGame } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import { GRIT_RULES } from './helpers.js';
import { summarizeGame } from './stats.js';
import {
  CPU_LEVELS, CPU_STRENGTH, START_RATING, cpuRating, cpuSeed, createCpuAgent, epsilonForRating,
} from './cpu.js';
import {
  PROFILE_SCHEMA, HISTORY_MAX, RATING_MIN, RATING_MAX, emptyProfile, sanitizeProfile, updateProfile,
  expectedScore, ratingK,
} from './player-profile.js';
import { buildMatchRecord, validateMatchRecord } from './match-record.js';
import { buildReplayRecord, validateReplayRecord } from './replay-record.js';
import { CHARACTERS } from './data.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}
const KNOWN = new Set(Object.keys(CHARACTERS));

async function play(seed, keys, levels, ratings = []) {
  let { state } = createGame({ seed, characterKeys: keys, rules: GRIT_RULES });
  const agents = levels.map((lv, i) => createCpuAgent(lv, { seed: cpuSeed(seed, i), rating: ratings[i] ?? null }));
  for (let i = 0; i < 6000 && !state.gameEnded; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return state;
}

// ---------------------------------------------------------------------------
// The strength curve and the Adaptive CPU
// ---------------------------------------------------------------------------
check('strength curve: starts at Hard (ε 0 = 1600)', CPU_STRENGTH[0].epsilon === 0 && CPU_STRENGTH[0].rating === CPU_LEVELS.hard.rating);
check('strength curve: weaker as ε grows', CPU_STRENGTH.every((p, i) => i === 0
  || (p.epsilon > CPU_STRENGTH[i - 1].epsilon && p.rating < CPU_STRENGTH[i - 1].rating)));
check('fixed levels sit on the curve (within 20 rating)', ['easy', 'medium'].every(k => {
  const e = CPU_LEVELS[k].epsilon;
  const i = CPU_STRENGTH.findIndex(p => p.epsilon === e);
  return i >= 0 && Math.abs(CPU_STRENGTH[i].rating - CPU_LEVELS[k].rating) <= 20;
}));
check('a new player starts level with Medium', START_RATING === CPU_LEVELS.medium.rating);
check('ε for a rating: the curve\'s points exactly', CPU_STRENGTH.every(p => Math.abs(epsilonForRating(p.rating) - p.epsilon) < 1e-9));
check('ε for a rating: in between, between', epsilonForRating(1520) > 0.1 && epsilonForRating(1520) < 0.2);
check('ε for a rating: clamped at both ends', epsilonForRating(2000) === 0 && epsilonForRating(100) === CPU_STRENGTH[CPU_STRENGTH.length - 1].epsilon);
check('ε for a rating: unknown rating plays a new player', epsilonForRating(undefined) === epsilonForRating(START_RATING));
{
  let monotone = true;
  for (let r = 900; r < 1700; r += 7) if (epsilonForRating(r + 7) > epsilonForRating(r) + 1e-12) monotone = false;
  check('ε for a rating: never rises with rating', monotone);
}
check('CPU ratings: fixed levels use their measured rating', cpuRating('hard') === 1600 && cpuRating('easy') === CPU_LEVELS.easy.rating
  && cpuRating('bogus') === CPU_LEVELS.easy.rating);
check('CPU ratings: Adaptive plays the given rating, within the curve', cpuRating('adaptive', 1450) === 1450
  && cpuRating('adaptive', 3000) === 1600 && cpuRating('adaptive', 0) === CPU_STRENGTH[CPU_STRENGTH.length - 1].rating
  && cpuRating('adaptive') === START_RATING);
{
  const a = createCpuAgent('adaptive', { seed: 1, rating: 1400 });
  check('Adaptive agent: level, rating and ε from the curve', a.level === 'adaptive' && a.rating === 1400
    && Math.abs(a.epsilon - epsilonForRating(1400)) < 1e-12);
  const h = createCpuAgent('hard', { seed: 1, rating: 1000 });
  check('a rating does not change a fixed level', h.epsilon === 0 && h.rating === 1600);
}
// The Adaptive CPU really plays at the rating: one set at Easy's rating
// should do about as well against Hard as Easy does (Easy won 21–43 of 200
// in calibration, ~21%). A small fixed sample, so a wide band.
{
  const keys = Object.keys(CHARACTERS);
  let adaptiveWins = 0;
  let games = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const state = await play(700 + i * 10 + j, [keys[i], keys[j]], ['adaptive', 'hard'], [CPU_LEVELS.easy.rating]);
      games++;
      if (state.winner === 1) adaptiveWins++;
    }
  }
  check(`Adaptive at Easy's rating loses to Hard most of the time (${adaptiveWins}/${games})`, adaptiveWins <= games * 0.45, `${adaptiveWins}/${games}`);
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
{
  const p = emptyProfile();
  check('new profile', p.schema === PROFILE_SCHEMA && p.rating === START_RATING && p.games === 0 && p.history.length === 0);
  check('expected score: even at equal ratings, 76% at +200', expectedScore(1500, 1500) === 0.5
    && Math.abs(expectedScore(1700, 1500) - 0.7597) < 1e-3);
  check('K: 48 for the first 10 CPU games, then 24', ratingK(0) === 48 && ratingK(9) === 48 && ratingK(10) === 24);
}
{
  // Sanitising whatever storage gives back.
  check('sanitize: junk becomes a new profile', JSON.stringify(sanitizeProfile('nope')) === JSON.stringify(emptyProfile())
    && JSON.stringify(sanitizeProfile({ schema: 'old' })) === JSON.stringify(emptyProfile()));
  const dirty = sanitizeProfile({
    schema: PROFILE_SCHEMA, rating: 99999, games: 3, cpuGames: 7, wins: 9, losses: 4, extra: 'x',
    byCharacter: { sprinter: { games: 2, wins: 5 }, 'bad key!': { games: 1 } },
    style: { games: 2, climb: 3, train: -1 },
    history: Array.from({ length: 40 }, (_, i) => ({ rating: 1500 + i, delta: 1000, won: 1, character: 'x'.repeat(99), cpus: ['hard', 'easy', 'medium', 'adaptive'] })),
  });
  check('sanitize: rating clamped', dirty.rating === RATING_MAX);
  check('sanitize: counts consistent (cpuGames ≤ games, wins ≤ cpuGames)', dirty.cpuGames === 3 && dirty.wins === 3 && dirty.losses === 0);
  check('sanitize: unknown fields dropped', !('extra' in dirty));
  check('sanitize: per-character wins ≤ games; bad keys dropped', dirty.byCharacter.sprinter.wins === 2 && !('bad key!' in dirty.byCharacter));
  check('sanitize: style shares in [0, 1]', dirty.style.climb === 1 && dirty.style.train === 0);
  check('sanitize: history capped and cleaned', dirty.history.length === HISTORY_MAX && dirty.history.every(h => Math.abs(h.delta) <= 400
    && h.character.length <= 40 && h.cpus.length <= 3 && h.won === true));
  check('sanitize: a sanitized profile is a fixed point', JSON.stringify(sanitizeProfile(dirty)) === JSON.stringify(dirty));
}

// Real games: a human seat (seat 0, played here by Medium) against CPUs.
const g1 = await play(31, ['technician', 'sprinter'], ['medium', 'easy']);
const g2 = await play(32, ['routeReader', 'ironLung', 'freeSolo'], ['easy', 'hard', 'hard']);
{
  const seats = [{ controller: 'human' }, { controller: 'bot', botLevel: 'easy' }];
  const before = JSON.stringify(g1);
  const { profile, change } = updateProfile(emptyProfile(), g1, { seat: 0, seats });
  const won = g1.winner === 1;
  const expected = Math.round(48 * ((won ? 1 : 0) - expectedScore(START_RATING, CPU_LEVELS.easy.rating)));
  check('update: does not mutate the state', JSON.stringify(g1) === before);
  check('update: one CPU — K × (score − expected)', change.delta === expected && change.after === START_RATING + expected
    && change.before === START_RATING && change.counted, `${change.delta} vs ${expected}`);
  check('update: record', profile.games === 1 && profile.cpuGames === 1 && profile.wins === (won ? 1 : 0) && profile.losses === (won ? 0 : 1)
    && profile.byCharacter.technician.games === 1);
  const style = profile.style;
  check('update: style shares sum to 1', Math.abs(style.climb + style.train + style.rest + style.shop - 1) < 1e-9 && style.games === 1);
  check('update: history entry', profile.history.length === 1 && profile.history[0].delta === change.delta
    && profile.history[0].cpus.join() === 'easy' && profile.history[0].character === 'technician');
  if (g1.players[0].character.milestonesCompleted.expert) {
    check('update: pace = rounds to finish', profile.pace.technician.games === 1 && profile.pace.technician.rounds === g1.round);
  }
  const again = updateProfile(profile, g1, { seat: 0, seats });
  check('update: a second game moves on from the first', again.profile.games === 2 && again.change.before === change.after);
}
{
  // Three players: standings decide the score against each CPU.
  const seats = [{ controller: 'human' }, { controller: 'bot', botLevel: 'hard' }, { controller: 'bot', botLevel: 'adaptive', rating: 1450 }];
  const sum = summarizeGame(g2);
  const place = (n) => sum.standings.indexOf(n);
  const score = (j) => (place(1) < place(j + 1) ? 1 : place(1) === place(j + 1) ? 0.5 : 0);
  const e = (r) => expectedScore(START_RATING, r);
  const expected = Math.round(48 * ((score(1) - e(1600)) + (score(2) - e(1450))) / 2);
  const { change } = updateProfile(emptyProfile(), g2, { seat: 0, seats });
  check('update: two CPUs — the mean over CPUs, scored by standings', change.delta === expected && change.cpus.join() === 'hard,adaptive',
    `${change.delta} vs ${expected}`);
}
{
  // Humans only, or an unfinished game: no rating change.
  const humans = updateProfile(emptyProfile(), g1, { seat: 0, seats: [{ controller: 'human' }, { controller: 'human' }] });
  check('update: no CPU — rating unchanged, game still counted', humans.change.delta === 0 && !humans.change.counted
    && humans.profile.rating === START_RATING && humans.profile.games === 1 && humans.profile.cpuGames === 0 && humans.profile.history.length === 0);
  let { state } = createGame({ seed: 3, characterKeys: ['sprinter', 'technician'], rules: GRIT_RULES });
  ({ state } = applyAction(state, getLegalActions(state)[0]));
  const unfinished = updateProfile(emptyProfile(), state, { seat: 0, seats: [{ controller: 'human' }, { controller: 'bot', botLevel: 'hard' }] });
  check('update: unfinished game — nothing changes', unfinished.profile.games === 0 && !unfinished.change.counted);
  const low = updateProfile({ ...emptyProfile(), rating: RATING_MIN }, g1, { seat: 0, seats: [{ controller: 'human' }, { controller: 'bot', botLevel: 'hard' }] });
  check('update: rating never leaves its range', low.profile.rating >= RATING_MIN && low.profile.rating <= RATING_MAX);
}

// ---------------------------------------------------------------------------
// Records carry the Adaptive CPU's rating
// ---------------------------------------------------------------------------
{
  const seats = [{ controller: 'human' }, { controller: 'bot', botLevel: 'adaptive', botModel: 'planner-1', botRating: 1450 }];
  const meta = { id: 'test-profile-1', mode: 'local', seats };
  const match = buildMatchRecord(g1, meta);
  const replay = buildReplayRecord(g1, meta);
  check('match record: botRating on the Adaptive seat, null elsewhere', match.players[1].botRating === 1450 && match.players[0].botRating === null);
  check('replay record: botRating on the Adaptive seat', replay.seats[1].botRating === 1450 && replay.seats[0].botRating === null);
  check('both still valid', validateMatchRecord(match, KNOWN) === null && validateReplayRecord(replay, KNOWN) === null);
  const bad = { ...match, players: [match.players[0], { ...match.players[1], botRating: 'x' }] };
  check('match record: a bad botRating is refused', validateMatchRecord(bad, KNOWN) === 'bad botRating');
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} profile checks passed`);
if (failed.length) process.exit(1);
