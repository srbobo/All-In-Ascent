// Tests for the telemetry party (party/telemetry.js) and for the GameRoom
// recording finished online games into it. Runs both rooms in-process over
// party/_test-server.js (in-memory storage). Not deployed.
//
//   BOT_MOVE_DELAY_MS=0 node party/_telemetry-test.js   (npm run test:party)

import { TelemetryRoom, TELEMETRY_ROOM } from './telemetry.js';
import { GameRoom } from './game.js';
import { TestServer } from './_test-server.js';
import { createMemoryStorage } from './_memory-storage.js';
import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction } from '../engine/engine.js';
import { GRIT_RULES } from '../engine/helpers.js';
import { buildMatchRecord } from '../engine/match-record.js';
import { buildReplayRecord, replayRecordState, REPLAY_RECORD_SCHEMA } from '../engine/replay-record.js';
import { CPU_MODEL, epsilonForRating } from '../engine/cpu.js';
import { RATING_MAX } from '../engine/player-profile.js';
import { createPlannerAgent } from '../sim/agents/planner.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const URL_BASE = `http://x/parties/telemetry/${TELEMETRY_ROOM}`;
function makeTelemetry(env = {}, id = TELEMETRY_ROOM) {
  const storage = createMemoryStorage();
  return { storage, room: new (TelemetryRoom(TestServer))({ name: id, env, storage }) };
}
const post = (room, body, query = '') => room.onRequest(new Request(`${URL_BASE}${query}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const get = (room, query = '') => room.onRequest(new Request(`${URL_BASE}${query}`));
const del = (room, query) => room.onRequest(new Request(`${URL_BASE}${query}`, { method: 'DELETE' }));

// A real finished game, and its match record to post.
async function finishedGame(seed) {
  let { state } = createGame({ seed, characterKeys: ['technician', 'sprinter'], rules: GRIT_RULES });
  const agents = [createPlannerAgent({ seed }), createPlannerAgent({ seed: seed + 1 })];
  while (!state.gameEnded) {
    const legal = getLegalActions(state);
    const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return state;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------
const game5 = await finishedGame(5);
const record = buildMatchRecord(game5, { id: 'local-test-0001', mode: 'local', startedAt: 1, finishedAt: 2 });
{
  const { room, storage } = makeTelemetry();
  const res = await post(room, record);
  const body = await res.json();
  check('POST stores a valid record', res.status === 200 && body.ok && storage.data.has('match:local-test-0001'));
  check('stored record is stamped with receivedAt', typeof storage.data.get('match:local-test-0001').receivedAt === 'number');
  check('responses allow any origin (CORS)', res.headers.get('access-control-allow-origin') === '*');
  await post(room, record);
  check('re-POSTing the same id replaces it', storage.data.size === 1);

  const bad = await post(room, { ...record, players: [] });
  check('POST rejects an invalid record with its reason', bad.status === 400 && (await bad.json()).error === 'bad players');
  const notJson = await post(room, 'nope{');
  check('POST rejects a non-JSON body', notJson.status === 400);
  const huge = await post(room, JSON.stringify({ ...record, pad: 'x'.repeat(70 * 1024) }));
  check('POST rejects an oversized body', huge.status === 413);
  check('rejected records are not stored', storage.data.size === 1);

  const opts = await room.onRequest(new Request(URL_BASE, { method: 'OPTIONS' }));
  check('OPTIONS answers the CORS preflight', opts.status === 204 && /POST/.test(opts.headers.get('access-control-allow-methods')));

  for (let i = 0; i < 4; i++) await post(room, { ...record, id: `local-page-${i}` });
  const count = await (await get(room)).json();
  check('GET without ?records gives the count', count.count === 5);
  const pages = [];
  let after = null;
  for (let guard = 0; guard < 10; guard++) {
    const body2 = await (await get(room, `?records=1&limit=2${after ? `&after=${after}` : ''}`)).json();
    pages.push(body2.records.map(r => r.id));
    if (!body2.next) break;
    after = body2.next;
  }
  const flat = pages.flat();
  check('GET pages through every record exactly once', pages.length === 3 && flat.length === 5 && new Set(flat).size === 5, JSON.stringify(pages));
  const all = await (await get(room, '?records=1')).json();
  check('GET returns full records', all.records.length === 5 && all.next === null && all.records.every(r => r.schema === record.schema));

  const noAdmin = await del(room, '?all=1');
  check('DELETE is off without an admin token', noAdmin.status === 401 && storage.data.size === 5);
}
{
  // Replay records: stored beside match records under kind=replay.
  const { room, storage } = makeTelemetry({ TELEMETRY_ADMIN_TOKEN: 'adm1n' });
  const replay = buildReplayRecord(game5, { id: 'local-test-0001', mode: 'local', startedAt: 1, finishedAt: 2 });
  await post(room, record);
  const res = await post(room, replay, '?kind=replay');
  check('replay: POST ?kind=replay stores it under replay:', res.status === 200 && storage.data.has('replay:local-test-0001')
    && storage.data.has('match:local-test-0001'));
  check('replay: a match record is refused as a replay', (await post(room, record, '?kind=replay')).status === 400);
  check('replay: a replay is refused as a match record', (await post(room, replay)).status === 400);
  check('replay: an unknown kind is refused', (await post(room, replay, '?kind=nope')).status === 400);
  const big = await post(room, { ...replay, id: 'local-test-big', pad: 'x'.repeat(200 * 1024) }, '?kind=replay');
  check('replay: bodies up to the replay limit are accepted (bigger than a match record may be)', big.status === 200);
  check('replay: count and match count are separate', (await (await get(room)).json()).count === 1
    && (await (await get(room, '?kind=replay')).json()).count === 2);
  const page = await (await get(room, '?kind=replay&records=1&limit=1')).json();
  check('replay: GET pages replays', page.records.length === 1 && page.records[0].schema === REPLAY_RECORD_SCHEMA && page.next !== null);
  const stored = (await (await get(room, '?kind=replay&records=1')).json()).records.find(r => r.id === 'local-test-0001');
  check('replay: the stored replay rebuilds the game', !!stored && JSON.stringify(replayRecordState(stored)) === JSON.stringify(game5));
  const wipe = await (await del(room, '?kind=replay&all=1&token=adm1n')).json();
  check('replay: DELETE ?kind=replay removes only replays', wipe.removed === 2 && storage.data.size === 1 && storage.data.has('match:local-test-0001'));
}
{
  const { room } = makeTelemetry({}, 'not-global');
  const res = await post(room, record);
  check('other room ids are refused', res.status === 404);
}
{
  const { room, storage } = makeTelemetry({ TELEMETRY_READ_TOKEN: 'r3ad', TELEMETRY_ADMIN_TOKEN: 'adm1n' });
  await post(room, record);
  await post(room, { ...record, id: 'local-test-0002' });
  check('read token: GET without it is refused', (await get(room, '?records=1')).status === 401);
  check('read token: GET with a wrong one is refused', (await get(room, '?records=1&token=nope')).status === 401);
  check('read token: GET with it works', (await (await get(room, '?records=1&token=r3ad')).json()).records.length === 2);
  check('read token: POST still open (players never hold the token)', (await post(room, { ...record, id: 'local-test-0003' })).status === 200);
  check('admin: DELETE with a wrong token is refused', (await del(room, '?id=local-test-0002&token=r3ad')).status === 401 && storage.data.size === 3);
  const one = await (await del(room, '?id=local-test-0002&token=adm1n')).json();
  check('admin: DELETE one record', one.removed === 1 && storage.data.size === 2);
  const wipe = await (await del(room, '?all=1&token=adm1n')).json();
  check('admin: DELETE all records', wipe.removed === 2 && storage.data.size === 0);
}

// ---------------------------------------------------------------------------
// GameRoom → telemetry: a finished online game records itself.
// ---------------------------------------------------------------------------
{
  const { room: store, storage } = makeTelemetry();
  // As party/server.js does with getServerByName: the GameRoom gets a stub of
  // the telemetry room and fetches its PartyServer path.
  const telemetryPaths = [];
  const Room = class extends GameRoom(TestServer) {
    telemetry() {
      return {
        fetch: (req) => {
          telemetryPaths.push(new URL(req.url).pathname);
          return store.onRequest(req);
        },
      };
    }
  };
  const game = new Room({ name: 'telemetry-online' });
  const conn = { id: 'host', send() {}, close() {} };
  game.onConnect(conn, { request: { url: 'ws://x/party?username=alice&password=pw' } });
  await game.onMessage(conn, JSON.stringify({ type: 'select_character', characterKey: 'routeReader' }));
  await game.onMessage(conn, JSON.stringify({ type: 'add_bot', difficulty: 'easy' }));
  await game.onMessage(conn, JSON.stringify({ type: 'start_game' }));
  const human = createPlannerAgent({ seed: 3 });
  for (let guard = 0; guard < 5000 && game.phase === 'in_progress'; guard++) {
    if (game.botRunning) { await new Promise(r => setTimeout(r, 5)); continue; }
    if (game.botAgents[game.state.currentPlayerIndex]) { await game.maybePlayBot(); continue; }
    const legal = getLegalActions(game.state);
    const { actionIndex } = await human.chooseAction({ state: game.state, legalActions: legal });
    await game.onMessage(conn, JSON.stringify({ type: 'action', actionIndex }));
  }
  // endGame is not awaited by advance(); let it finish posting.
  for (let i = 0; i < 100 && storage.data.size < 2; i++) await new Promise(r => setTimeout(r, 10));
  check('online game completed', game.phase === 'completed');
  const stored = [...storage.data].filter(([k]) => k.startsWith('match:')).map(([, v]) => v);
  const replays = [...storage.data].filter(([k]) => k.startsWith('replay:')).map(([, v]) => v);
  check('online game recorded exactly once', stored.length === 1);
  check('online game replay recorded exactly once', replays.length === 1);
  check('online records posted to the telemetry room', telemetryPaths.length === 2
    && telemetryPaths.every(p => p === `/parties/telemetry/${TELEMETRY_ROOM}`), telemetryPaths.join());
  const rec = stored[0];
  check('online record: mode, id and timing', rec && rec.mode === 'online' && /^online-[\w-]+$/.test(rec.id)
    && rec.startedAt === game.startedAt && rec.finishedAt === game.finishedAt && rec.durationMs === game.finishedAt - game.startedAt);
  check('online record: human and bot seats', rec && rec.players[0].controller === 'human' && rec.players[0].characterKey === 'routeReader'
    && rec.players[1].controller === 'bot' && rec.players[1].botLevel === 'easy'
    && rec.players[1].botModel === CPU_MODEL && rec.players[0].botModel === null);
  check('online record: matches the final state', rec && rec.winner === game.state.winner && rec.rounds === game.state.round);
  check('online record: no usernames', rec && !JSON.stringify(rec).includes('alice'));
  const rep0 = replays[0];
  check('online replay: shares the match record id', rep0 && rep0.id === rec.id && rep0.mode === 'online');
  check('online replay: seats say who played', rep0 && rep0.seats[0].controller === 'human'
    && rep0.seats[1].controller === 'bot' && rep0.seats[1].botLevel === 'easy' && rep0.seats[1].botModel === CPU_MODEL);
  check('online replay: rebuilds the final state exactly', rep0
    && JSON.stringify(replayRecordState(rep0)) === JSON.stringify(game.state));
  check('online replay: no usernames', rep0 && !JSON.stringify(rep0).includes('alice'));
}
{
  // Adaptive CPUs: players send their rating; the bot plays at the table's mean.
  const game = new (GameRoom(TestServer))({ name: 'adaptive-room' });
  const sent = { host: [], guest: [] };
  const host = { id: 'host', send(m) { sent.host.push(JSON.parse(m)); }, close() {} };
  const guest = { id: 'guest', send(m) { sent.guest.push(JSON.parse(m)); }, close() {} };
  game.onConnect(host, { request: { url: 'ws://x/party?username=alice&password=pw' } });
  game.onConnect(guest, { request: { url: 'ws://x/party?username=bob&password=pw' } });
  await game.onMessage(host, JSON.stringify({ type: 'set_rating', rating: 1300 }));
  await game.onMessage(guest, JSON.stringify({ type: 'set_rating', rating: 99999 }));
  check('set_rating: stored per human seat, clamped to the rating range', game.seats[0].rating === 1300 && game.seats[1].rating === RATING_MAX);
  await game.onMessage(guest, JSON.stringify({ type: 'set_rating', rating: 'lots' }));
  check('set_rating: a non-number is ignored', game.seats[1].rating === RATING_MAX);
  await game.onMessage(guest, JSON.stringify({ type: 'set_rating', rating: 1700 }));
  await game.onMessage(host, JSON.stringify({ type: 'select_character', characterKey: 'technician' }));
  await game.onMessage(guest, JSON.stringify({ type: 'select_character', characterKey: 'sprinter' }));
  await game.onMessage(host, JSON.stringify({ type: 'add_bot', difficulty: 'adaptive' }));
  check('adaptive bot seat is labelled', game.seats[2].isBot && /Adaptive/.test(game.seats[2].username));
  game.maybePlayBot = async () => {}; // keep the room still for inspection
  await game.onMessage(host, JSON.stringify({ type: 'start_game' }));
  const agent = game.botAgents[2];
  check('adaptive bot plays at the mean human rating (1300, 1700 → 1500)', agent && agent.level === 'adaptive' && agent.rating === 1500
    && Math.abs(agent.epsilon - epsilonForRating(1500)) < 1e-12 && game.seats[2].botRating === 1500);
  await game.onMessage(host, JSON.stringify({ type: 'set_rating', rating: 900 }));
  check('set_rating: ignored once the game has started', game.seats[0].rating === 1300);
  const msg = game.stateMessage();
  check('state message: bot seats carry level and rating; humans do not', msg.seats[2].botLevel === 'adaptive' && msg.seats[2].botRating === 1500
    && !('botLevel' in msg.seats[0]) && !('rating' in msg.seats[0]));
}
{
  // Without a telemetry room (GameRoom's default telemetry()) a game still ends cleanly.
  const game = new (GameRoom(TestServer))({ name: 'no-telemetry' });
  game.state = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'], rules: GRIT_RULES }).state;
  let threw = false;
  try { await game.recordMatch(); } catch { threw = true; }
  check('no telemetry party: recordMatch is a no-op', !threw);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
