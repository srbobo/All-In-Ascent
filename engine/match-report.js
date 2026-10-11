// Telemetry report — aggregates match records (match-record.js) into the
// numbers the designer's dashboard (dashboard.html) shows.
//
//   MATCH_FILTER_DEFAULTS
//   filterMatches(records, filters)    → the records the filters keep
//   aggregateMatches(records, filters) → plain JSON report
//
// Every number on the dashboard comes from here, so it is unit-tested
// (engine/test-match-record.js) and the page only lays it out. Card and
// character lists come from the game data, so cards nobody used still show up
// (with zeros) in the "least used" views.
//
// Win rates: in an N-player game each seat's fair share of wins is 1/N, so a
// character's `expectedWins` is the sum of 1/N over the games it played and
// `winIndex` = wins / expectedWins (1 = par, >1 wins more than its share).
// That keeps the index comparable when 2-, 3- and 4-player games are mixed.

import { CHARACTERS, GEAR_SHOP, ROUTES } from './data.js';
import { CLIMB_GEAR_EFFECT_KINDS } from './helpers.js';

const STATS = ['strength', 'technique', 'focus', 'flexibility'];
const TIERS = ['beginner', 'intermediate', 'expert'];
const AREAS = ['bouldering', 'topRope', 'leadClimbing'];
const TIME_AREAS = ['bouldering', 'topRope', 'leadClimbing', 'milestone', 'training', 'gearShop', 'rest'];

// playerCount: 'multi' (2–4 players), 'all', or 1–4.
// mode: 'all' | 'local' | 'online' | 'sim'.
// seats: 'all' | 'humans' (games with no bots) | 'bots' (games with at least one bot).
// engineVersion: 'all' or an exact version string.
// since: null, or wall-clock ms; keeps games that finished at or after it.
export const MATCH_FILTER_DEFAULTS = { playerCount: 'multi', mode: 'all', seats: 'all', engineVersion: 'all', since: null };

export function filterMatches(records, filters = {}) {
  const f = { ...MATCH_FILTER_DEFAULTS, ...filters };
  return records.filter(r => {
    if (f.playerCount === 'multi' ? r.playerCount < 2 : f.playerCount !== 'all' && r.playerCount !== Number(f.playerCount)) return false;
    if (f.mode !== 'all' && r.mode !== f.mode) return false;
    const hasBot = r.players.some(p => p.controller === 'bot');
    if (f.seats === 'humans' && hasBot) return false;
    if (f.seats === 'bots' && !hasBot) return false;
    if (f.engineVersion !== 'all' && r.engineVersion !== f.engineVersion) return false;
    if (f.since !== null && !(r.finishedAt >= f.since)) return false;
    return true;
  });
}

const ratio = (a, b) => (b > 0 ? a / b : null);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function histogram(values) {
  const out = {};
  for (const v of values) out[v] = (out[v] || 0) + 1;
  return Object.keys(out).map(Number).sort((a, b) => a - b).map(v => ({ value: v, count: out[v] }));
}
// Games per calendar day (UTC), oldest first, with empty days filled in.
function gamesByDay(records) {
  const counts = new Map();
  for (const r of records) {
    if (!Number.isFinite(r.finishedAt)) continue;
    const day = new Date(r.finishedAt).toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  if (!counts.size) return [];
  const days = [...counts.keys()].sort();
  const out = [];
  for (let t = Date.parse(days[0]); t <= Date.parse(days[days.length - 1]); t += 864e5) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, games: counts.get(day) || 0 });
  }
  return out;
}
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// A build: the stat a climber trained hardest plus the gear they ended with.
export function buildSignature(player) {
  const gear = [...new Set(player.gear.map(g => g.name))].sort();
  return { focus: player.trainingFocus || null, gear };
}

export function aggregateMatches(allRecords, filters = {}) {
  const records = filterMatches(allRecords, filters);
  const characterKeys = Object.keys(CHARACTERS);
  const seats = records.flatMap(r => r.players.map(p => ({ r, p })));

  // ---- Overview -----------------------------------------------------------
  const byPlayerCount = {};
  const byMode = {};
  const endReasons = {};
  for (const r of records) {
    byPlayerCount[r.playerCount] = (byPlayerCount[r.playerCount] || 0) + 1;
    byMode[r.mode] = (byMode[r.mode] || 0) + 1;
    const reason = r.endReason || 'unfinished';
    endReasons[reason] = (endReasons[reason] || 0) + 1;
  }
  const durations = records.map(r => r.durationMs).filter(d => Number.isFinite(d) && d > 0);
  const times = records.map(r => r.finishedAt).filter(Number.isFinite);
  const overview = {
    games: records.length,
    totalGames: allRecords.length,
    seats: seats.length,
    humanSeats: seats.filter(s => s.p.controller === 'human').length,
    botSeats: seats.filter(s => s.p.controller === 'bot').length,
    byPlayerCount,
    byMode,
    endReasons,
    avgRounds: mean(records.map(r => r.rounds)),
    medianDurationMs: median(durations),
    firstFinishedAt: times.length ? Math.min(...times) : null,
    lastFinishedAt: times.length ? Math.max(...times) : null,
    roundsHistogram: histogram(records.map(r => r.rounds)),
    byDay: gamesByDay(records),
  };

  // ---- Characters ---------------------------------------------------------
  const charRows = {};
  for (const key of characterKeys) {
    charRows[key] = {
      key, name: CHARACTERS[key].name,
      games: 0, wins: 0, expectedWins: 0,
      placements: [], finalLevels: [], winningLevels: [], milestones: [], roundsToWin: [],
      byPlayerCount: {},
      training: Object.fromEntries(STATS.map(s => [s, 0])),
      time: Object.fromEntries(TIME_AREAS.map(a => [a, 0])),
    };
  }
  for (const { r, p } of seats) {
    const c = charRows[p.characterKey];
    if (!c) continue;
    c.games++;
    c.expectedWins += 1 / r.playerCount;
    c.placements.push(p.placement);
    c.finalLevels.push(p.final.level);
    c.milestones.push(p.final.milestonesCompleted);
    if (p.won) { c.wins++; c.winningLevels.push(p.final.level); c.roundsToWin.push(r.rounds); }
    const pc = (c.byPlayerCount[r.playerCount] ||= { games: 0, wins: 0 });
    pc.games++;
    if (p.won) pc.wins++;
    for (const s of STATS) c.training[s] += p.training?.[s]?.sessions || 0;
    for (const a of TIME_AREAS) c.time[a] += p.timeByArea?.[a] || 0;
  }
  const characters = characterKeys.map(key => {
    const c = charRows[key];
    const trainingTotal = STATS.reduce((s, k) => s + c.training[k], 0);
    const timeTotal = TIME_AREAS.reduce((s, k) => s + c.time[k], 0);
    return {
      key, name: c.name,
      games: c.games,
      pickRate: ratio(c.games, records.length),
      wins: c.wins,
      winRate: ratio(c.wins, c.games),
      expectedWins: c.expectedWins,
      winIndex: ratio(c.wins, c.expectedWins),
      avgPlacement: mean(c.placements),
      avgFinalLevel: mean(c.finalLevels),
      avgWinningLevel: mean(c.winningLevels),
      avgMilestones: mean(c.milestones),
      avgRoundsToWin: mean(c.roundsToWin),
      byPlayerCount: Object.fromEntries(Object.entries(c.byPlayerCount).map(([n, v]) =>
        [n, { games: v.games, wins: v.wins, winRate: ratio(v.wins, v.games), fairShare: 1 / Number(n) }])),
      trainingShare: Object.fromEntries(STATS.map(s => [s, ratio(c.training[s], trainingTotal)])),
      timeShare: Object.fromEntries(TIME_AREAS.map(a => [a, ratio(c.time[a], timeTotal)])),
    };
  });

  // ---- Match-ups: how often the row character finished ahead of the column
  // character in games where both played. (Each character plays at most once
  // per game, so this is head-to-head in 2-player games and pairwise placement
  // in larger ones.)
  const matchups = {};
  for (const a of characterKeys) {
    matchups[a] = {};
    for (const b of characterKeys) if (a !== b) matchups[a][b] = { games: 0, ahead: 0, rate: null };
  }
  for (const r of records) {
    for (const pa of r.players) {
      for (const pb of r.players) {
        if (pa === pb || !matchups[pa.characterKey]?.[pb.characterKey]) continue;
        const m = matchups[pa.characterKey][pb.characterKey];
        m.games++;
        if (pa.placement < pb.placement) m.ahead++;
      }
    }
  }
  for (const a of characterKeys) for (const b of characterKeys) {
    if (a !== b) matchups[a][b].rate = ratio(matchups[a][b].ahead, matchups[a][b].games);
  }

  // ---- Seat order: win rate of each seat, per player count ----------------
  const seatOrder = {};
  for (const r of records) {
    const row = (seatOrder[r.playerCount] ||= { games: 0, seats: Array.from({ length: r.playerCount }, () => ({ wins: 0 })) });
    row.games++;
    for (const p of r.players) if (p.won && row.seats[p.seat - 1]) row.seats[p.seat - 1].wins++;
  }
  for (const n of Object.keys(seatOrder)) {
    const row = seatOrder[n];
    row.seats = row.seats.map((s, i) => ({ seat: i + 1, wins: s.wins, winRate: ratio(s.wins, row.games), fairShare: 1 / Number(n) }));
  }

  // ---- Builds -------------------------------------------------------------
  const builds = {};
  for (const key of characterKeys) builds[key] = { focus: {}, top: new Map() };
  for (const { p } of seats) {
    const b = builds[p.characterKey];
    if (!b) continue;
    const sig = buildSignature(p);
    const focusKey = sig.focus || 'none';
    const f = (b.focus[focusKey] ||= { games: 0, wins: 0 });
    f.games++;
    if (p.won) f.wins++;
    const id = `${focusKey}|${sig.gear.join('+')}`;
    const t = b.top.get(id) || { focus: sig.focus, gear: sig.gear, games: 0, wins: 0, levels: [] };
    t.games++;
    if (p.won) t.wins++;
    t.levels.push(p.final.level);
    b.top.set(id, t);
  }
  const buildReport = {};
  for (const key of characterKeys) {
    const b = builds[key];
    buildReport[key] = {
      focus: Object.fromEntries(Object.entries(b.focus).map(([k, v]) => [k, { ...v, winRate: ratio(v.wins, v.games) }])),
      top: [...b.top.values()]
        .map(t => ({ focus: t.focus, gear: t.gear, games: t.games, wins: t.wins, winRate: ratio(t.wins, t.games), avgFinalLevel: mean(t.levels) }))
        .sort((x, y) => y.games - x.games || y.wins - x.wins)
        .slice(0, 8),
    };
  }

  // ---- Gear cards ---------------------------------------------------------
  // `triggers` counts climbs a card's effect changed. Only climb-effect cards
  // have one; training-effect and plain stat cards report null.
  const gearRows = new Map(GEAR_SHOP.map(g => [g.name, {
    name: g.name, category: g.category, cost: g.cost, hasEffect: CLIMB_GEAR_EFFECT_KINDS.includes(g.effectKind),
    purchases: 0, buyers: 0, buyerWins: 0, rounds: [], prices: [], currencies: new Set(), triggers: 0,
    byCharacter: Object.fromEntries(characterKeys.map(k => [k, 0])),
  }]));
  let wins = 0;
  for (const { p } of seats) if (p.won) wins++;
  for (const { p } of seats) {
    const owned = new Set();
    for (const g of p.gear) {
      const row = gearRows.get(g.name);
      if (!row) continue;
      row.purchases++;
      row.rounds.push(g.round);
      row.prices.push(g.cost || 0);
      row.currencies.add(g.currency);
      owned.add(g.name);
    }
    for (const name of owned) {
      const row = gearRows.get(name);
      row.buyers++;
      if (p.won) row.buyerWins++;
      if (row.byCharacter[p.characterKey] !== undefined) row.byCharacter[p.characterKey]++;
    }
    for (const [name, n] of Object.entries(p.gearTriggers || {})) {
      const row = gearRows.get(name);
      if (row) row.triggers += n;
    }
  }
  const gear = [...gearRows.values()].map(g => ({
    name: g.name, category: g.category, cost: g.cost,
    avgPricePaid: mean(g.prices),
    priceCurrency: g.currencies.size === 1 ? [...g.currencies][0] : null,
    purchases: g.purchases,
    buyers: g.buyers,
    buyRate: ratio(g.buyers, seats.length),
    winRateWith: ratio(g.buyerWins, g.buyers),
    winRateWithout: ratio(wins - g.buyerWins, seats.length - g.buyers),
    avgRoundBought: mean(g.rounds),
    hasEffect: g.hasEffect,
    triggers: g.hasEffect ? g.triggers : null,
    triggersPerBuyer: g.hasEffect ? ratio(g.triggers, g.buyers) : null,
    byCharacter: g.byCharacter,
  })).sort((a, b) => b.buyers - a.buyers || a.name.localeCompare(b.name));

  // ---- Route cards --------------------------------------------------------
  const routeRows = new Map();
  for (const area of AREAS) {
    for (const rt of ROUTES[area] || []) {
      routeRows.set(`${area}|${rt.name}`, {
        area, name: rt.name, grade: rt.grade,
        attempts: 0, sends: 0, climbers: 0, milestoneGames: 0, milestoneAttempts: 0, milestoneSends: 0,
      });
    }
  }
  for (const r of records) {
    for (const tier of TIERS) {
      const m = r.milestoneRoutes?.[tier];
      const row = m && routeRows.get(`${m.area}|${m.routeName}`);
      if (row) row.milestoneGames++;
    }
    for (const p of r.players) {
      for (const rt of p.routes || []) {
        const row = routeRows.get(`${rt.area}|${rt.routeName}`);
        if (!row) continue;
        row.attempts += rt.attempts;
        row.sends += rt.sends;
        row.climbers++;
      }
      for (const m of p.milestones || []) {
        const row = routeRows.get(`${m.area}|${m.routeName}`);
        if (row) row.milestoneSends++;
      }
      for (const tier of TIERS) {
        const m = r.milestoneRoutes?.[tier];
        const row = m && routeRows.get(`${m.area}|${m.routeName}`);
        if (row) row.milestoneAttempts += p.milestoneAttempts?.[tier] || 0;
      }
    }
  }
  const routes = [...routeRows.values()].map(rt => ({
    ...rt,
    sendRate: ratio(rt.sends, rt.attempts),
    milestoneSendRate: ratio(rt.milestoneSends, rt.milestoneAttempts),
  }));

  // ---- Levels and milestones ----------------------------------------------
  const winners = seats.filter(s => s.p.won);
  const milestones = Object.fromEntries(TIERS.map(tier => {
    const sendRounds = seats.flatMap(s => s.p.milestones.filter(m => m.tier === tier).map(m => m.round));
    const attempts = seats.reduce((n, s) => n + (s.p.milestoneAttempts?.[tier] || 0), 0);
    return [tier, {
      sends: sendRounds.length,
      attempts,
      sendRate: ratio(sendRounds.length, attempts),
      avgSendRound: mean(sendRounds),
      reachedBy: ratio(sendRounds.length, seats.length),
    }];
  }));
  const levels = {
    winningLevelHistogram: histogram(winners.map(s => s.p.final.level)),
    finalLevelHistogram: histogram(seats.map(s => s.p.final.level)),
    avgWinningLevel: mean(winners.map(s => s.p.final.level)),
    avgFinalLevel: mean(seats.map(s => s.p.final.level)),
  };

  // ---- Recent games -------------------------------------------------------
  const recent = records.slice()
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
    .slice(0, 25)
    .map(r => ({
      id: r.id, mode: r.mode, finishedAt: r.finishedAt, durationMs: r.durationMs,
      playerCount: r.playerCount, rounds: r.rounds, engineVersion: r.engineVersion,
      winnerCharacter: r.winnerCharacter,
      players: r.players.map(p => ({ characterKey: p.characterKey, controller: p.controller, botLevel: p.botLevel, placement: p.placement, level: p.final.level, milestones: p.final.milestonesCompleted, won: p.won })),
    }));

  return {
    filters: { ...MATCH_FILTER_DEFAULTS, ...filters },
    engineVersions: [...new Set(allRecords.map(r => r.engineVersion))].sort(compareVersions).reverse(),
    overview,
    characters,
    matchups,
    seatOrder,
    builds: buildReport,
    gear,
    routes,
    milestones,
    levels,
    recent,
  };
}
