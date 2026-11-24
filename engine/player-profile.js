// Player profiles — what the CPU knows about the person it plays against.
//
//   emptyProfile()                               → a new profile
//   sanitizeProfile(anything)                    → a valid profile (or a new one)
//   updateProfile(profile, state, { seat, seats }) → { profile, change }
//
// A profile lives in the player's own browser (player-profile-store.js) in
// local and online play alike; the engine only computes it. It holds:
//
// - rating — an Elo-style rating against CPU opponents on the same scale as
//   the CPU strength curve (cpu.js CPU_STRENGTH: Hard = 1600). Each finished
//   game moves it by K/n · Σ (score − expected) over the n CPU opponents,
//   where score is 1 / ½ / 0 for finishing above / level with / below that
//   CPU in the standings. Games against humans only do not move it (their
//   strength is unknown). The Adaptive CPU plays at this rating.
// - record — games, wins, losses vs CPUs, games and wins per character.
// - style — running averages of how the player spends Time (share climbing,
//   training, resting, shopping) and rounds to finish per character.
// - history — the last HISTORY_MAX rating changes.
//
// Nothing in it identifies the player: no names, no timestamps.

import { summarizeGame } from './stats.js';
import { cpuRating, START_RATING } from './cpu.js';

export const PROFILE_SCHEMA = 'aia-player-profile/1';
export const HISTORY_MAX = 20;
export const RATING_MIN = 600;
export const RATING_MAX = 2400;

const STYLE_KEYS = ['climb', 'train', 'rest', 'shop'];

export function emptyProfile() {
  return {
    schema: PROFILE_SCHEMA,
    rating: START_RATING,
    games: 0,
    cpuGames: 0,
    wins: 0,
    losses: 0,
    byCharacter: {},
    style: { games: 0, climb: 0, train: 0, rest: 0, shop: 0 },
    pace: {},
    history: [],
  };
}

const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const int = (v) => Math.round(num(v, 0, 1e6, 0));

// Whatever came out of storage (corrupt JSON, an old schema, edited by hand)
// becomes a valid profile: unknown fields dropped, numbers clamped.
export function sanitizeProfile(p) {
  const out = emptyProfile();
  if (!p || typeof p !== 'object' || p.schema !== PROFILE_SCHEMA) return out;
  out.rating = Math.round(num(p.rating, RATING_MIN, RATING_MAX, START_RATING));
  out.games = int(p.games);
  out.cpuGames = Math.min(out.games, int(p.cpuGames));
  out.wins = Math.min(out.cpuGames, int(p.wins));
  out.losses = Math.min(out.cpuGames - out.wins, int(p.losses));
  if (p.byCharacter && typeof p.byCharacter === 'object') {
    for (const [k, v] of Object.entries(p.byCharacter).slice(0, 50)) {
      if (!/^[\w-]{1,40}$/.test(k) || !v || typeof v !== 'object') continue;
      const games = int(v.games);
      out.byCharacter[k] = { games, wins: Math.min(games, int(v.wins)) };
    }
  }
  if (p.style && typeof p.style === 'object') {
    out.style.games = int(p.style.games);
    for (const k of STYLE_KEYS) out.style[k] = num(p.style[k], 0, 1, 0);
  }
  if (p.pace && typeof p.pace === 'object') {
    for (const [k, v] of Object.entries(p.pace).slice(0, 50)) {
      if (!/^[\w-]{1,40}$/.test(k) || !v || typeof v !== 'object') continue;
      out.pace[k] = { games: int(v.games), rounds: num(v.rounds, 0, 1000, 0) };
    }
  }
  if (Array.isArray(p.history)) {
    out.history = p.history.slice(-HISTORY_MAX).filter(h => h && typeof h === 'object').map(h => ({
      rating: Math.round(num(h.rating, RATING_MIN, RATING_MAX, START_RATING)),
      delta: Math.round(num(h.delta, -400, 400, 0)),
      won: !!h.won,
      character: typeof h.character === 'string' ? h.character.slice(0, 40) : null,
      rounds: int(h.rounds),
      cpus: Array.isArray(h.cpus) ? h.cpus.slice(0, 3).map(c => String(c).slice(0, 12)) : [],
    }));
  }
  return out;
}

export function expectedScore(rating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

// K shrinks once the rating has some games behind it.
export function ratingK(cpuGames) {
  return cpuGames < 10 ? 48 : 24;
}

// Fold one finished game into the profile of the player at seat index `seat`.
// `seats` lists who played every seat: { controller: 'human' } or
// { controller: 'bot', botLevel, rating? } (rating: the Adaptive CPU's).
// Returns the new profile and the rating change ({ before, after, delta,
// cpus } — delta 0 and cpus [] when no CPU played). An unfinished game
// changes nothing.
export function updateProfile(profileIn, state, { seat, seats = [] }) {
  const profile = sanitizeProfile(profileIn);
  const before = profile.rating;
  const unchanged = { profile, change: { before, after: before, delta: 0, cpus: [], counted: false } };
  if (!state || !state.gameEnded || !state.players[seat]) return unchanged;

  const sum = summarizeGame(state);
  const me = state.players[seat];
  const mine = sum.players.find(p => p.playerNum === me.playerNum);
  const place = (playerNum) => sum.standings.indexOf(playerNum);
  const won = sum.winner === me.playerNum;

  // Rating: against every CPU seat.
  const cpus = [];
  let total = 0;
  state.players.forEach((p, i) => {
    const s = seats[i];
    if (i === seat || !s || s.controller !== 'bot') return;
    const r = cpuRating(s.botLevel, s.rating);
    const score = place(me.playerNum) < place(p.playerNum) ? 1 : place(me.playerNum) === place(p.playerNum) ? 0.5 : 0;
    total += score - expectedScore(before, r);
    cpus.push(s.botLevel || 'easy');
  });
  let delta = 0;
  if (cpus.length) {
    delta = Math.round(ratingK(profile.cpuGames) * total / cpus.length);
    profile.rating = Math.min(RATING_MAX, Math.max(RATING_MIN, before + delta));
    delta = profile.rating - before;
    profile.cpuGames++;
    if (won) profile.wins++; else profile.losses++;
  }

  // Record and style.
  profile.games++;
  const key = me.character.key;
  const ch = profile.byCharacter[key] || { games: 0, wins: 0 };
  profile.byCharacter[key] = { games: ch.games + 1, wins: ch.wins + (won ? 1 : 0) };
  const t = mine.timeByArea;
  const climb = (t.bouldering || 0) + (t.topRope || 0) + (t.leadClimbing || 0) + (t.milestone || 0);
  const parts = { climb, train: t.training || 0, rest: t.rest || 0, shop: t.gearShop || 0 };
  const spent = parts.climb + parts.train + parts.rest + parts.shop;
  if (spent > 0) {
    const n = profile.style.games;
    for (const k of STYLE_KEYS) profile.style[k] = (profile.style[k] * n + parts[k] / spent) / (n + 1);
    profile.style.games = n + 1;
  }
  if (mine.final.milestonesCompleted === 3) {
    const p = profile.pace[key] || { games: 0, rounds: 0 };
    profile.pace[key] = { games: p.games + 1, rounds: (p.rounds * p.games + sum.rounds) / (p.games + 1) };
  }
  if (cpus.length) {
    profile.history = [...profile.history, { rating: profile.rating, delta, won, character: key, rounds: sum.rounds, cpus }].slice(-HISTORY_MAX);
  }
  return { profile, change: { before, after: profile.rating, delta, cpus, counted: cpus.length > 0 } };
}
