// Tests for the telemetry pipeline's engine side:
//   engine/match-record.js — buildMatchRecord / validateMatchRecord
//   engine/match-report.js — filterMatches / aggregateMatches (the dashboard's numbers)
//
// Run:  npm run test:engine  (runs all engine tests in sequence)
// Records are checked against complete planner-bot games (every count against
// the raw event log); the report is checked against hand-made records whose
// every number is known.

import { createGame } from './state.js';
import { getLegalActions, applyAction } from './engine.js';
import { summarizeGame } from './stats.js';
import { buildMatchRecord, validateMatchRecord, MATCH_RECORD_SCHEMA } from './match-record.js';
import { aggregateMatches, filterMatches, buildSignature } from './match-report.js';
import { GRIT_RULES, CLIMB_GEAR_EFFECT_KINDS } from './helpers.js';
import { CHARACTERS, GEAR_SHOP, ROUTES } from './data.js';
import { createPlannerAgent } from '../sim/agents/planner.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}
const near = (a, b) => a !== null && Math.abs(a - b) < 1e-9;
const KNOWN = new Set(Object.keys(CHARACTERS));

async function playToEnd(seed, characterKeys) {
  let { state } = createGame({ seed, characterKeys, rules: GRIT_RULES });
  const agents = characterKeys.map((_, i) => createPlannerAgent({ seed: seed + i }));
  for (let i = 0; i < 4000 && !state.gameEnded; i++) {
    const legal = getLegalActions(state);
    const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return state;
}

// ---------------------------------------------------------------------------
// buildMatchRecord on real games
// ---------------------------------------------------------------------------
const games = [
  [11, ['technician', 'sprinter']],
  [12, ['ironLung', 'routeReader', 'freeSolo']],
  [13, ['sprinter', 'freeSolo', 'routeReader', 'technician']],
];
const realRecords = [];
for (const [seed, keys] of games) {
  const label = `${keys.length}p seed ${seed}`;
  const state = await playToEnd(seed, keys);
  check(`${label}: game finished`, state.gameEnded);
  const before = JSON.stringify(state);
  const seats = keys.map((_, i) => (i === 1 ? { controller: 'bot', botLevel: 'hard' } : { controller: 'human' }));
  const rec = buildMatchRecord(state, { id: `test-${seed}`, mode: 'online', startedAt: 1000, finishedAt: 61000, seats });
  realRecords.push(rec);
  const sum = summarizeGame(state);
  check(`${label}: does not mutate the state`, JSON.stringify(state) === before);
  check(`${label}: plain JSON`, JSON.stringify(JSON.parse(JSON.stringify(rec))) === JSON.stringify(rec));
  check(`${label}: header`, rec.schema === MATCH_RECORD_SCHEMA && rec.id === `test-${seed}` && rec.mode === 'online'
    && rec.engineVersion === state.engineVersion && rec.seed === state.seed && rec.playerCount === keys.length
    && rec.rounds === state.round && rec.durationMs === 60000 && rec.ended === true && rec.endReason === 'all_milestones');
  const winner = state.players.find(p => p.playerNum === state.winner);
  check(`${label}: winner`, rec.winner === state.winner && rec.winnerCharacter === winner.character.key
    && rec.players.filter(p => p.won).length === 1 && rec.players.find(p => p.won).seat === state.winner);
  check(`${label}: placements follow the summary's standings`, rec.players.every(p => sum.standings[p.placement - 1] === p.seat)
    && rec.players.find(p => p.won).placement === 1);
  check(`${label}: seats keep their controller`, rec.players[1].controller === 'bot' && rec.players[1].botLevel === 'hard'
    && rec.players.filter((_, i) => i !== 1).every(p => p.controller === 'human' && p.botLevel === null));
  check(`${label}: characters in seat order`, rec.players.every((p, i) => p.characterKey === keys[i] && p.seat === i + 1));

  const climbs = state.events.filter(e => e.type === 'climb_resolved');
  for (const p of rec.players) {
    const mine = climbs.filter(e => e.payload.playerNum === p.seat && !e.payload.isMilestone);
    const attempts = p.routes.reduce((n, r) => n + r.attempts, 0);
    const sends = p.routes.reduce((n, r) => n + r.sends, 0);
    if (attempts !== mine.length || sends !== mine.filter(e => e.payload.success).length) {
      check(`${label}: P${p.seat} route counts match the log`, false, `${attempts}/${mine.length}`);
    }
    const triggers = {};
    for (const e of climbs.filter(c => c.payload.playerNum === p.seat)) {
      for (const g of e.payload.gearEffects || []) for (const n of g.gear.split(', ')) triggers[n] = (triggers[n] || 0) + 1;
    }
    if (JSON.stringify(Object.entries(triggers).sort()) !== JSON.stringify(Object.entries(p.gearTriggers).sort())) {
      check(`${label}: P${p.seat} gear triggers match the log`, false, JSON.stringify(p.gearTriggers));
    }
    // Hardest-trained stat; ties go to the stat listed first.
    let focus = null;
    for (const k of ['strength', 'technique', 'focus', 'flexibility']) {
      if (p.training[k].gain > 0 && (focus === null || p.training[k].gain > p.training[focus].gain)) focus = k;
    }
    if (p.trainingFocus !== focus) check(`${label}: P${p.seat} training focus`, false, `${p.trainingFocus} vs ${focus}`);
  }
  check(`${label}: route, gear-trigger and training-focus counts match the log`, results.every(r => r.pass));
  const kinds = climbs.flatMap(e => (e.payload.gearEffects || []).map(g => g.effectKind));
  check(`${label}: every climb gear effect is a CLIMB_GEAR_EFFECT_KINDS kind`, kinds.every(k => CLIMB_GEAR_EFFECT_KINDS.includes(k)), kinds.join());
  check(`${label}: no player names or free text`, !/username|"name"/.test(JSON.stringify(rec.players.map(({ gear, routes, milestones, ...rest }) => rest))));
  check(`${label}: validates`, validateMatchRecord(rec, KNOWN) === null, validateMatchRecord(rec, KNOWN));
  check(`${label}: well under the server's 64 KB limit`, JSON.stringify(rec).length < 32 * 1024, `${JSON.stringify(rec).length} bytes`);
}

const defaults = buildMatchRecord(await playToEnd(14, ['technician', 'ironLung']));
check('defaults: local mode, human seats, no id or times', defaults.mode === 'local' && defaults.id === null
  && defaults.startedAt === null && defaults.durationMs === null && defaults.players.every(p => p.controller === 'human'));

// ---------------------------------------------------------------------------
// validateMatchRecord rejects malformed records
// ---------------------------------------------------------------------------
const good = realRecords[0];
const broken = (fn) => { const r = structuredClone(good); fn(r); return validateMatchRecord(r, KNOWN); };
check('validate: rejects non-objects', validateMatchRecord(null, KNOWN) && validateMatchRecord([], KNOWN) && validateMatchRecord('x', KNOWN));
check('validate: rejects a wrong schema', broken(r => { r.schema = 'other/1'; }) === 'unknown schema');
check('validate: rejects a missing or odd id', broken(r => { r.id = null; }) === 'bad id' && broken(r => { r.id = '<script>'; }) === 'bad id');
check('validate: rejects an unknown mode', broken(r => { r.mode = 'hack'; }) === 'bad mode');
check('validate: rejects a player-count mismatch', broken(r => { r.playerCount = 3; }) === 'bad players');
check('validate: rejects an unknown character', broken(r => { r.players[0].characterKey = 'wizard'; }) === 'unknown character');
check('validate: rejects a winner not at the table', broken(r => { r.winner = 9; }) === 'bad winner');
check('validate: rejects a bad controller', broken(r => { r.players[0].controller = 'alien'; }) === 'bad controller');
check('validate: rejects impossible milestones', broken(r => { r.players[0].final.milestonesCompleted = 7; }) === 'bad milestones');
check('validate: accepts an unfinished game (no winner)', broken(r => { r.winner = null; r.winnerCharacter = null; }) === null);

// ---------------------------------------------------------------------------
// aggregateMatches on hand-made records
// ---------------------------------------------------------------------------
const DAY = 864e5;
const T0 = Date.parse('2026-10-01T12:00:00Z');
function player(seat, characterKey, placement, opts = {}) {
  return {
    seat, characterKey, controller: opts.bot ? 'bot' : 'human', botLevel: opts.bot || null,
    won: placement === 1 && !opts.noWinner, placement,
    final: { level: opts.level ?? 5, xp: 0, milestonesCompleted: opts.ms ?? (placement === 1 ? 3 : 1), stats: {} },
    milestones: (opts.milestones || []),
    milestoneAttempts: opts.msAttempts || { beginner: 1, intermediate: 0, expert: 0 },
    climbs: { attempts: 0, sends: 0, falls: 0, byArea: {} },
    routes: opts.routes || [],
    training: Object.fromEntries(['strength', 'technique', 'focus', 'flexibility'].map(s => [s, { sessions: opts.train?.[s] || 0, gain: (opts.train?.[s] || 0) * 2 }])),
    trainingFocus: opts.focus ?? null,
    gear: (opts.gear || []).map(([name, round]) => ({ name, round, cost: 3, currency: 'grit' })),
    gearTriggers: opts.triggers || {},
    timeByArea: { bouldering: 10, topRope: 0, leadClimbing: 0, milestone: 5, training: opts.train ? 5 : 0, gearShop: 0, rest: 0 },
  };
}
function record(id, players, opts = {}) {
  const winner = players.find(p => p.won);
  return {
    schema: MATCH_RECORD_SCHEMA, id, mode: opts.mode || 'local', engineVersion: opts.version || '1.1.0',
    startedAt: (opts.at ?? T0) - 600000, finishedAt: opts.at ?? T0, durationMs: 600000,
    seed: 1, playerCount: players.length, ended: !!winner, endReason: winner ? 'all_milestones' : null,
    winner: winner ? winner.seat : null, winnerCharacter: winner ? winner.characterKey : null,
    rounds: opts.rounds || 20, totalSteps: 100, currency: 'grit',
    milestoneRoutes: opts.milestoneRoutes || { beginner: null, intermediate: null, expert: null },
    players,
  };
}
const B0 = ROUTES.bouldering[0];
const B1 = ROUTES.bouldering[1];
const G0 = GEAR_SHOP[0].name;   // a plain stat card
const G1 = GEAR_SHOP[1].name;
const E = GEAR_SHOP.find(g => g.effectKind === 'timeCostReduction').name;   // a climb-effect card
const fixtures = [
  // A: 2p, technician beats sprinter.
  record('fixture-a', [
    player(1, 'technician', 1, { level: 9, focus: 'technique', train: { technique: 3 }, gear: [[G0, 4]], triggers: { [G0]: 2 },
      routes: [{ area: 'bouldering', routeName: B0.name, grade: B0.grade, attempts: 3, sends: 2 }] }),
    player(2, 'sprinter', 2, { level: 7, routes: [{ area: 'bouldering', routeName: B0.name, grade: B0.grade, attempts: 1, sends: 0 }] }),
  ], { rounds: 18, milestoneRoutes: { beginner: { area: 'bouldering', routeName: B1.name, grade: B1.grade }, intermediate: null, expert: null } }),
  // B: 2p, sprinter beats technician.
  record('fixture-b', [
    player(1, 'technician', 2, { level: 6, focus: 'technique', train: { technique: 1 }, gear: [[G0, 2]] }),
    player(2, 'sprinter', 1, { level: 8, gear: [[G1, 5]] }),
  ], { rounds: 22, at: T0 + DAY }),
  // C: 3p with a bot: freeSolo wins, technician 2nd, sprinter (bot) 3rd.
  record('fixture-c', [
    player(1, 'technician', 2, { level: 8, focus: 'strength', train: { strength: 2 } }),
    player(2, 'sprinter', 3, { level: 5, bot: 'easy' }),
    player(3, 'freeSolo', 1, { level: 10, gear: [[G0, 6], [G1, 7], [E, 8]], triggers: { [E]: 3 } }),
  ], { rounds: 30, mode: 'online', at: T0 + 3 * DAY }),
  // D: solo technician (excluded from the default multiplayer view).
  record('fixture-d', [player(1, 'technician', 1, { level: 12 })], { rounds: 25 }),
  // E: an older engine version, 2p ironLung vs routeReader, sim mode.
  record('fixture-e', [
    player(1, 'ironLung', 1, { level: 9, bot: 'planner' }),
    player(2, 'routeReader', 2, { level: 9, bot: 'planner' }),
  ], { mode: 'sim', version: '1.0.0', at: T0 - 10 * DAY }),
];
check('fixtures validate', fixtures.every(r => validateMatchRecord(r, KNOWN) === null), fixtures.map(r => validateMatchRecord(r, KNOWN)).join());

// Filters
const ids = (rs) => rs.map(r => r.id).join(',');
check('filter: default is multiplayer games', ids(filterMatches(fixtures)) === 'fixture-a,fixture-b,fixture-c,fixture-e');
check('filter: player count', ids(filterMatches(fixtures, { playerCount: 2 })) === 'fixture-a,fixture-b,fixture-e'
  && ids(filterMatches(fixtures, { playerCount: 1 })) === 'fixture-d' && ids(filterMatches(fixtures, { playerCount: 'all' })) === 'fixture-a,fixture-b,fixture-c,fixture-d,fixture-e');
check('filter: mode', ids(filterMatches(fixtures, { mode: 'online' })) === 'fixture-c' && ids(filterMatches(fixtures, { mode: 'sim' })) === 'fixture-e');
check('filter: seats', ids(filterMatches(fixtures, { seats: 'humans' })) === 'fixture-a,fixture-b' && ids(filterMatches(fixtures, { seats: 'bots' })) === 'fixture-c,fixture-e');
check('filter: engine version', ids(filterMatches(fixtures, { engineVersion: '1.0.0' })) === 'fixture-e');
check('filter: since', ids(filterMatches(fixtures, { since: T0 + DAY })) === 'fixture-b,fixture-c');

const rep = aggregateMatches(fixtures, { engineVersion: '1.1.0' });
check('report: plain JSON', JSON.stringify(JSON.parse(JSON.stringify(rep))) === JSON.stringify(rep));
check('report: overview counts', rep.overview.games === 3 && rep.overview.totalGames === 5 && rep.overview.seats === 7
  && rep.overview.humanSeats === 6 && rep.overview.botSeats === 1
  && rep.overview.byPlayerCount[2] === 2 && rep.overview.byPlayerCount[3] === 1
  && rep.overview.byMode.local === 2 && rep.overview.byMode.online === 1
  && near(rep.overview.avgRounds, (18 + 22 + 30) / 3) && rep.overview.medianDurationMs === 600000);
check('report: rounds histogram', JSON.stringify(rep.overview.roundsHistogram) === JSON.stringify([{ value: 18, count: 1 }, { value: 22, count: 1 }, { value: 30, count: 1 }]));
check('report: games per day fills empty days', JSON.stringify(rep.overview.byDay.map(d => d.games)) === '[1,1,0,1]'
  && rep.overview.byDay[0].day === '2026-10-01');
check('report: engine versions, newest first', JSON.stringify(rep.engineVersions) === '["1.1.0","1.0.0"]');

const ch = Object.fromEntries(rep.characters.map(c => [c.key, c]));
check('report: every character listed, even unplayed', rep.characters.length === Object.keys(CHARACTERS).length
  && ch.routeReader.games === 0 && ch.routeReader.winRate === null && ch.routeReader.winIndex === null);
check('report: technician games, wins, rates', ch.technician.games === 3 && ch.technician.wins === 1
  && near(ch.technician.winRate, 1 / 3) && near(ch.technician.pickRate, 1));
check('report: fair share sums 1/N per game', near(ch.technician.expectedWins, 0.5 + 0.5 + 1 / 3)
  && near(ch.technician.winIndex, 1 / (0.5 + 0.5 + 1 / 3)) && near(ch.freeSolo.winIndex, 3));
check('report: avg placement', near(ch.technician.avgPlacement, 5 / 3) && near(ch.sprinter.avgPlacement, 2));
check('report: final and winning Level', near(ch.technician.avgFinalLevel, (9 + 6 + 8) / 3) && near(ch.technician.avgWinningLevel, 9)
  && ch.sprinter.avgWinningLevel === 8 && near(rep.levels.avgWinningLevel, (9 + 8 + 10) / 3));
check('report: win rate by player count', ch.technician.byPlayerCount[2].games === 2 && ch.technician.byPlayerCount[2].wins === 1
  && near(ch.technician.byPlayerCount[2].winRate, 0.5) && near(ch.technician.byPlayerCount[3].fairShare, 1 / 3)
  && ch.technician.byPlayerCount[3].wins === 0);
check('report: rounds to win', ch.technician.avgRoundsToWin === 18 && ch.freeSolo.avgRoundsToWin === 30);
check('report: training share', near(ch.technician.trainingShare.technique, 4 / 6) && near(ch.technician.trainingShare.strength, 2 / 6)
  && ch.sprinter.trainingShare.focus === null);

const mu = rep.matchups;
check('report: head-to-head and placement match-ups', mu.technician.sprinter.games === 3 && mu.technician.sprinter.ahead === 2
  && near(mu.technician.sprinter.rate, 2 / 3) && mu.sprinter.technician.ahead === 1
  && mu.freeSolo.technician.games === 1 && mu.freeSolo.technician.ahead === 1 && mu.technician.freeSolo.ahead === 0
  && mu.ironLung.routeReader.games === 0 && mu.ironLung.routeReader.rate === null);

check('report: seat order', rep.seatOrder[2].games === 2 && rep.seatOrder[2].seats[0].wins === 1 && rep.seatOrder[2].seats[1].wins === 1
  && rep.seatOrder[3].seats[2].wins === 1 && near(rep.seatOrder[3].seats[0].fairShare, 1 / 3) && rep.seatOrder[3].seats.length === 3);

const g0 = rep.gear.find(g => g.name === G0);
const g1 = rep.gear.find(g => g.name === G1);
check('report: every gear card listed, even unbought', rep.gear.length === GEAR_SHOP.length
  && rep.gear.filter(g => g.buyers === 0).length === GEAR_SHOP.length - 3);
check('report: gear sorted by buyers', rep.gear[0].name === G0 && rep.gear[1].name === G1);
check('report: gear buy rate and win rates', g0.buyers === 3 && g0.purchases === 3 && near(g0.buyRate, 3 / 7)
  && near(g0.winRateWith, 2 / 3) && near(g0.winRateWithout, 1 / 4) && near(g0.avgRoundBought, 4)
  && g1.buyers === 2 && near(g1.winRateWith, 1));
const ge = rep.gear.find(g => g.name === E);
check('report: climb-effect triggers per buyer', ge.hasEffect && ge.triggers === 3 && ge.buyers === 1 && near(ge.triggersPerBuyer, 3));
check('report: stat cards have no trigger count', !g0.hasEffect && g0.triggers === null && g0.triggersPerBuyer === null
  && !rep.gear.find(g => g.name === 'Training Partner').hasEffect);
check('report: average price paid and its currency', near(g0.avgPricePaid, 3) && g0.priceCurrency === 'grit'
  && rep.gear.find(g => g.buyers === 0).avgPricePaid === null);
check('report: gear buyers by character', g0.byCharacter.technician === 2 && g0.byCharacter.freeSolo === 1 && g0.byCharacter.sprinter === 0);

const r0 = rep.routes.find(r => r.area === 'bouldering' && r.name === B0.name);
const r1 = rep.routes.find(r => r.area === 'bouldering' && r.name === B1.name);
const routeCount = ROUTES.bouldering.length + ROUTES.topRope.length + ROUTES.leadClimbing.length;
check('report: every route card listed', rep.routes.length === routeCount && rep.routes.filter(r => r.attempts === 0).length === routeCount - 1);
check('report: route attempts, sends, climbers', r0.attempts === 4 && r0.sends === 2 && near(r0.sendRate, 0.5) && r0.climbers === 2);
check('report: milestone route usage', r1.milestoneGames === 1 && r1.milestoneAttempts === 2 && r1.attempts === 0);

check('report: builds by focus', rep.builds.technician.focus.technique.games === 2 && rep.builds.technician.focus.technique.wins === 1
  && rep.builds.technician.focus.strength.games === 1 && rep.builds.sprinter.focus.none.games === 3);
const techTop = rep.builds.technician.top;
check('report: top builds group focus + gear', techTop.length === 2 && techTop[0].focus === 'technique'
  && JSON.stringify(techTop[0].gear) === JSON.stringify([G0]) && techTop[0].games === 2 && near(techTop[0].winRate, 0.5));
check('report: build signature dedupes and sorts gear', JSON.stringify(buildSignature({ trainingFocus: 'focus', gear: [{ name: 'b' }, { name: 'a' }, { name: 'b' }] }))
  === JSON.stringify({ focus: 'focus', gear: ['a', 'b'] }));

check('report: milestone tiers', rep.milestones.beginner.attempts === 7 && rep.milestones.beginner.sends === 0
  && rep.milestones.expert.sendRate === null);
check('report: winning Level histogram', JSON.stringify(rep.levels.winningLevelHistogram) === JSON.stringify([{ value: 8, count: 1 }, { value: 9, count: 1 }, { value: 10, count: 1 }]));
check('report: recent games, newest first', rep.recent.map(g => g.id).join() === 'fixture-c,fixture-b,fixture-a'
  && rep.recent[0].players.length === 3 && rep.recent[0].players[1].controller === 'bot');

const none = aggregateMatches([]);
check('report: empty input', none.overview.games === 0 && none.overview.avgRounds === null && none.overview.byDay.length === 0
  && none.characters.every(c => c.games === 0) && none.gear.every(g => g.buyRate === null));

// The real games aggregate without errors and agree with their records.
const realRep = aggregateMatches(realRecords, { playerCount: 'all' });
check('report: real games aggregate', realRep.overview.games === 3 && realRep.overview.seats === 9
  && realRep.characters.reduce((n, c) => n + c.wins, 0) === 3
  && realRep.routes.reduce((n, r) => n + r.attempts, 0) === realRecords.flatMap(r => r.players).flatMap(p => p.routes).reduce((n, r) => n + r.attempts, 0));

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
