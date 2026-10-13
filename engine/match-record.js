// Match records — one compact, anonymous JSON record per finished game, for
// the designer's telemetry dashboard (dashboard.html).
//
//   buildMatchRecord(state, meta) → plain JSON object (schema MATCH_RECORD_SCHEMA)
//   validateMatchRecord(record)   → null when the record is acceptable, else a reason
//
// Built from summarizeGame (stats.js) plus a few per-card counts from the
// engine's event log, so local play (the browser bundle), online play (the
// GameRoom, party/game.js) and the bot simulations record identical numbers for the
// same game. A record never holds usernames or anything typed by a player:
// seats are identified by character and by who controlled them (a human or a
// bot level).
//
// meta (all optional; supplied by whoever recorded the game):
//   id         unique id for this game; the telemetry server de-duplicates on it
//   mode       'local' | 'online' | 'sim'
//   startedAt  wall-clock ms when the game started
//   finishedAt wall-clock ms when the game ended
//   seats      per seat, in player order: { controller: 'human' | 'bot', botLevel }

import { summarizeGame } from './stats.js';

export const MATCH_RECORD_SCHEMA = 'aia-match-record/1';
export const MATCH_MODES = ['local', 'online', 'sim'];

const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TIERS = ['beginner', 'intermediate', 'expert'];

// The stat a climber trained hardest (most bonus gained; ties go to the stat
// listed first), or null if they never trained.
function trainingFocus(training) {
  let best = null;
  for (const k of STATS) {
    if (training[k].gain > 0 && (best === null || training[k].gain > training[best].gain)) best = k;
  }
  return best;
}

// Per player: how often each regular route card was attempted and sent, and how
// many climbs each gear card's effect actually changed (climb_resolved
// gearEffects; one entry may name several cards, comma-separated).
function cardUsage(state) {
  const byPlayer = {};
  const forPlayer = (n) => (byPlayer[n] ||= { routes: new Map(), gearTriggers: {} });
  for (const e of state.events || []) {
    if (e.type !== 'climb_resolved') continue;
    const p = e.payload || {};
    const u = forPlayer(p.playerNum);
    if (!p.isMilestone) {
      const key = `${p.area}|${p.routeName}`;
      const r = u.routes.get(key) || { area: p.area, routeName: p.routeName, grade: p.grade, attempts: 0, sends: 0 };
      r.attempts++;
      if (p.success) r.sends++;
      u.routes.set(key, r);
    }
    for (const g of p.gearEffects || []) {
      for (const name of String(g.gear || '').split(',').map(s => s.trim()).filter(Boolean)) {
        u.gearTriggers[name] = (u.gearTriggers[name] || 0) + 1;
      }
    }
  }
  return byPlayer;
}

export function buildMatchRecord(state, meta = {}) {
  const sum = summarizeGame(state);
  const usage = cardUsage(state);
  const placement = {};
  sum.standings.forEach((n, i) => { placement[n] = i + 1; });
  const seats = meta.seats || [];
  const startedAt = Number.isFinite(meta.startedAt) ? meta.startedAt : null;
  const finishedAt = Number.isFinite(meta.finishedAt) ? meta.finishedAt : null;
  const winner = sum.players.find(p => p.playerNum === sum.winner);

  return {
    schema: MATCH_RECORD_SCHEMA,
    id: meta.id || null,
    mode: MATCH_MODES.includes(meta.mode) ? meta.mode : 'local',
    engineVersion: sum.engineVersion,
    startedAt,
    finishedAt,
    durationMs: startedAt !== null && finishedAt !== null ? Math.max(0, finishedAt - startedAt) : null,
    seed: sum.seed,
    playerCount: sum.players.length,
    ended: sum.ended,
    endReason: sum.endReason,
    winner: sum.winner,
    winnerCharacter: winner ? winner.characterKey : null,
    rounds: sum.rounds,
    totalSteps: sum.totalSteps,
    currency: sum.currency,
    milestoneRoutes: sum.milestoneRoutes,
    players: sum.players.map((p, i) => {
      const seat = seats[i] || {};
      const controller = seat.controller === 'bot' ? 'bot' : 'human';
      const u = usage[p.playerNum] || { routes: new Map(), gearTriggers: {} };
      return {
        seat: p.playerNum,
        characterKey: p.characterKey,
        controller,
        botLevel: controller === 'bot' ? (seat.botLevel || null) : null,
        won: p.playerNum === sum.winner,
        placement: placement[p.playerNum],
        final: p.final,
        milestones: p.milestones.map(m => ({ tier: m.tier, round: m.round, routeName: m.routeName, area: m.area, grade: m.grade })),
        milestoneAttempts: p.milestoneAttempts,
        climbs: p.climbs,
        routes: [...u.routes.values()],
        training: p.training,
        trainingFocus: trainingFocus(p.training),
        gear: p.gear,
        gearTriggers: u.gearTriggers,
        spentOnGear: p.spentOnGear,
        xpEarned: p.xpEarned,
        gritEarned: p.gritEarned,
        levelUps: p.levelUps.map(l => ({ level: l.level, round: l.round })),
        timeByArea: p.timeByArea,
        rests: p.rests,
        turns: p.turns,
        actions: p.actions,
        turnsEndedEarly: p.turnsEndedEarly,
        timeUnused: p.timeUnused,
      };
    }),
  };
}

// The telemetry server accepts records from any browser, so it checks the
// shape before storing one. Returns null if the record is acceptable,
// otherwise a short reason. `knownCharacters` is the set of character keys.
export function validateMatchRecord(r, knownCharacters) {
  const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'not an object';
  if (r.schema !== MATCH_RECORD_SCHEMA) return 'unknown schema';
  if (typeof r.id !== 'string' || !/^[\w.:-]{6,100}$/.test(r.id)) return 'bad id';
  if (!MATCH_MODES.includes(r.mode)) return 'bad mode';
  if (typeof r.engineVersion !== 'string' || r.engineVersion.length > 20) return 'bad engineVersion';
  if (!isInt(r.playerCount, 1, 4) || !Array.isArray(r.players) || r.players.length !== r.playerCount) return 'bad players';
  if (!isInt(r.rounds, 1, 1000)) return 'bad rounds';
  if (r.winner !== null && !r.players.some(p => p.seat === r.winner)) return 'bad winner';
  for (const p of r.players) {
    if (!p || typeof p !== 'object') return 'bad player';
    if (!knownCharacters.has(p.characterKey)) return 'unknown character';
    if (!['human', 'bot'].includes(p.controller)) return 'bad controller';
    if (!isInt(p.placement, 1, 4) || !p.final || !isInt(p.final.level, 1, 100)) return 'bad player result';
    if (!isInt(p.final.milestonesCompleted, 0, TIERS.length)) return 'bad milestones';
    if (!Array.isArray(p.gear) || !Array.isArray(p.routes) || !p.training || !p.timeByArea) return 'bad player detail';
  }
  return null;
}
