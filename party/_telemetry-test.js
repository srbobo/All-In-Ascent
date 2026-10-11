// Tests for the telemetry party (party/telemetry.js) and for the GameRoom
// recording finished online games into it. Runs both PartyKit classes
// in-process with in-memory storage (party/_memory-storage.js). Not deployed.
//
//   BOT_MOVE_DELAY_MS=0 node party/_telemetry-test.js   (npm run test:party)

import TelemetryRoom, { TELEMETRY_ROOM } from './telemetry.js';
import GameRoom from './game.js';
import { createMemoryStorage } from './_memory-storage.js';
import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction } from '../engine/engine.js';
import { GRIT_RULES } from '../engine/helpers.js';
import { buildMatchRecord } from '../engine/match-record.js';
import { createPlannerAgent } from '../sim/agents/planner.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const URL_BASE = `http://x/parties/telemetry/${TELEMETRY_ROOM}`;
function makeTelemetry(env = {}, id = TELEMETRY_ROOM) {
  const storage = createMemoryStorage();
  return { storage, room: new TelemetryRoom({ id, env, storage }) };
}
const post = (room, body) => room.onRequest(new Request(URL_BASE, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const get = (room, query = '') => room.onRequest(new Request(`${URL_BASE}${query}`));
const del = (room, query) => room.onRequest(new Request(`${URL_BASE}${query}`, { method: 'DELETE' }));

// A real finished game's record to post.
async function finishedRecord(seed, id) {
  let { state } = createGame({ seed, characterKeys: ['technician', 'sprinter'], rules: GRIT_RULES });
  const agents = [createPlannerAgent({ seed }), createPlannerAgent({ seed: seed + 1 })];
  while (!state.gameEnded) {
    const legal = getLegalActions(state);
    const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
    ({ state } = applyAction(state, legal[actionIndex]));
  }
  return buildMatchRecord(state, { id, mode: 'local', startedAt: 1, finishedAt: 2 });
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------
const record = await finishedRecord(5, 'local-test-0001');
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
  const fakeRoom = {
    id: 'telemetry-online',
    env: {},
    broadcast: () => {},
    storage: { put: async () => {} },
    context: {
      parties: {
        telemetry: {
          get: (id) => ({
            fetch: (init) => (id === TELEMETRY_ROOM ? store.onRequest(new Request(URL_BASE, init)) : Promise.resolve(new Response('', { status: 404 }))),
          }),
        },
      },
    },
  };
  const game = new GameRoom(fakeRoom);
  const conn = { id: 'host', send() {}, close() {} };
  game.onConnect(conn, { request: { url: 'ws://x/party?username=alice&password=pw' } });
  await game.onMessage(JSON.stringify({ type: 'select_character', characterKey: 'routeReader' }), conn);
  await game.onMessage(JSON.stringify({ type: 'add_bot', difficulty: 'easy' }), conn);
  await game.onMessage(JSON.stringify({ type: 'start_game' }), conn);
  const human = createPlannerAgent({ seed: 3 });
  for (let guard = 0; guard < 5000 && game.phase === 'in_progress'; guard++) {
    if (game.botRunning) { await new Promise(r => setTimeout(r, 5)); continue; }
    if (game.botAgents[game.state.currentPlayerIndex]) { await game.maybePlayBot(); continue; }
    const legal = getLegalActions(game.state);
    const { actionIndex } = await human.chooseAction({ state: game.state, legalActions: legal });
    await game.onMessage(JSON.stringify({ type: 'action', actionIndex }), conn);
  }
  // endGame is not awaited by advance(); let it finish posting.
  for (let i = 0; i < 50 && storage.data.size === 0; i++) await new Promise(r => setTimeout(r, 10));
  check('online game completed', game.phase === 'completed');
  const stored = [...storage.data.values()];
  check('online game recorded exactly once', stored.length === 1);
  const rec = stored[0];
  check('online record: mode, id and timing', rec && rec.mode === 'online' && /^online-[\w-]+$/.test(rec.id)
    && rec.startedAt === game.startedAt && rec.finishedAt === game.finishedAt && rec.durationMs === game.finishedAt - game.startedAt);
  check('online record: human and bot seats', rec && rec.players[0].controller === 'human' && rec.players[0].characterKey === 'routeReader'
    && rec.players[1].controller === 'bot' && rec.players[1].botLevel === 'easy');
  check('online record: matches the final state', rec && rec.winner === game.state.winner && rec.rounds === game.state.round);
  check('online record: no usernames', rec && !JSON.stringify(rec).includes('alice'));
}
{
  // Without a telemetry party (e.g. an older deploy) a game still ends cleanly.
  const game = new GameRoom({ id: 'no-telemetry', env: {}, broadcast: () => {}, storage: { put: async () => {} } });
  game.state = createGame({ seed: 1, characterKeys: ['technician', 'sprinter'], rules: GRIT_RULES }).state;
  let threw = false;
  try { await game.recordMatch(); } catch { threw = true; }
  check('no telemetry party: recordMatch is a no-op', !threw);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
