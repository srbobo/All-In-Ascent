// Tests for the Project Mode review queue (party/submissions.js). Runs the
// room in-process over party/_test-server.js (in-memory storage). Not deployed.
//
//   node party/_submissions-test.js   (npm run test:party)

import { SubmissionsRoom, SUBMISSIONS_ROOM } from './submissions.js';
import { TestServer } from './_test-server.js';
import { createMemoryStorage } from './_memory-storage.js';
import { SUBMISSION_SCHEMA } from '../engine/content.js';
import { ENGINE_VERSION_STRING } from '../engine/version.js';

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
}

const URL_BASE = `http://x/parties/submissions/${SUBMISSIONS_ROOM}`;
function makeRoom(env = {}, id = SUBMISSIONS_ROOM) {
  const storage = createMemoryStorage();
  return { storage, room: new (SubmissionsRoom(TestServer))({ name: id, env, storage }) };
}
const post = (room, body) => room.onRequest(new Request(URL_BASE, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
const get = (room, query = '') => room.onRequest(new Request(`${URL_BASE}${query}`));
const patch = (room, query) => room.onRequest(new Request(`${URL_BASE}${query}`, { method: 'PATCH' }));
const del = (room, query) => room.onRequest(new Request(`${URL_BASE}${query}`, { method: 'DELETE' }));

const climber = {
  name: 'The Crimp Queen', archetype: 'Finger strength', description: 'Tiny holds, no problem.',
  startingStats: { strength: 18, technique: 20, focus: 16, flexibility: 14 }, startingEndurance: 95,
  growth: { strength: 2.5, technique: 3, focus: 2, flexibility: 2, endurance: 6 },
  rules: [{ when: [{ type: 'holdFeature', value: 'Crimp' }], then: [{ type: 'statBonus', stat: 'technique', amount: 4 }] }],
};
const route = {
  name: 'Chalk Line', area: 'topRope', grade: '5.10a', strength: 30, technique: 34, focus: 30, flexibility: 26,
  time: 3, endurance: 30, xpSuccess: 50, xpFail: 20, rollEffect: [{ stat: 'technique', modifier: -1 }],
  routeType: 'Vertical', holdFeatures: ['Crimp'], moveFeatures: [], tag: 'Pinch/Crimp',
};
const sub = (id, extra = {}) => ({
  schema: SUBMISSION_SCHEMA, id, kind: 'character', engineVersion: ENGINE_VERSION_STRING, author: 'lb', note: 'for review',
  definition: climber, submittedAt: 1700000000000, ...extra,
});

{
  const { room, storage } = makeRoom();
  const res = await post(room, sub('sub-test-0001'));
  const body = await res.json();
  const stored = storage.data.get('sub:sub-test-0001');
  check('POST stores a valid submission as new', res.status === 200 && body.ok && stored && stored.status === 'new' && stored.author === 'lb');
  check('stored submission is stamped with receivedAt', typeof stored.receivedAt === 'number');
  check('responses allow any origin (CORS)', res.headers.get('access-control-allow-origin') === '*');
  await post(room, sub('sub-test-0001', { note: 'edited' }));
  check('re-POSTing the same id replaces it', storage.data.size === 1 && storage.data.get('sub:sub-test-0001').note === 'edited');

  const bad = await post(room, sub('sub-test-0002', { definition: { ...climber, startingEndurance: 1 } }));
  check('POST rejects a card that does not compile, with the reason', bad.status === 400 && /does not compile/.test((await bad.json()).error));
  const notJson = await post(room, 'nope{');
  check('POST rejects a non-JSON body', notJson.status === 400);
  const huge = await post(room, JSON.stringify(sub('sub-test-0003', { pad: 'x'.repeat(40 * 1024) })));
  check('POST rejects an oversized body', huge.status === 413);
  check('rejected submissions are not stored', storage.data.size === 1);

  const opts = await room.onRequest(new Request(URL_BASE, { method: 'OPTIONS' }));
  check('OPTIONS answers the CORS preflight', opts.status === 204 && /PATCH/.test(opts.headers.get('access-control-allow-methods')));

  for (let i = 0; i < 4; i++) await post(room, sub(`sub-page-${i}`, { kind: i % 2 ? 'route' : 'character', definition: i % 2 ? route : climber }));
  check('GET without ?list gives the count', (await (await get(room)).json()).count === 5);
  const pages = [];
  let after = null;
  for (let guard = 0; guard < 10; guard++) {
    const b = await (await get(room, `?list=1&limit=2${after ? `&after=${after}` : ''}`)).json();
    pages.push(b.submissions.map(s => s.id));
    if (!b.next) break;
    after = b.next;
  }
  const flat = pages.flat();
  check('GET pages through every submission exactly once', pages.length === 3 && flat.length === 5 && new Set(flat).size === 5, JSON.stringify(pages));

  check('PATCH is off without an admin token', (await patch(room, '?id=sub-test-0001&status=approved')).status === 401);
  check('DELETE is off without an admin token', (await del(room, '?all=1')).status === 401 && storage.data.size === 5);
}
{
  const { room } = makeRoom({}, 'not-global');
  check('other room ids are refused', (await post(room, sub('sub-test-0009'))).status === 404);
}
{
  const { room, storage } = makeRoom({ SUBMISSIONS_READ_TOKEN: 'r3ad', SUBMISSIONS_ADMIN_TOKEN: 'adm1n' });
  await post(room, sub('sub-test-0001'));
  await post(room, sub('sub-test-0002'));
  check('read token: GET without it is refused', (await get(room, '?list=1')).status === 401);
  check('read token: GET with it works', (await (await get(room, '?list=1&token=r3ad')).json()).submissions.length === 2);
  check('read token: the admin token also reads', (await get(room, '?list=1&token=adm1n')).status === 200);
  check('read token: POST still open (players never hold the token)', (await post(room, sub('sub-test-0003'))).status === 200);
  check('admin: PATCH with a wrong token is refused', (await patch(room, '?id=sub-test-0001&status=approved&token=r3ad')).status === 401);
  const ok = await (await patch(room, '?id=sub-test-0001&status=approved&token=adm1n')).json();
  check('admin: PATCH sets the review status', ok.status === 'approved' && storage.data.get('sub:sub-test-0001').status === 'approved' && typeof storage.data.get('sub:sub-test-0001').reviewedAt === 'number');
  check('admin: PATCH refuses an unknown status', (await patch(room, '?id=sub-test-0001&status=great&token=adm1n')).status === 400);
  check('admin: PATCH refuses an unknown id', (await patch(room, '?id=nope&status=approved&token=adm1n')).status === 404);
  await post(room, sub('sub-test-0001', { note: 'resent' }));
  check('a resend keeps the review status', storage.data.get('sub:sub-test-0001').status === 'approved');
  const one = await (await del(room, '?id=sub-test-0002&token=adm1n')).json();
  check('admin: DELETE one submission', one.removed === 1 && storage.data.size === 2);
  const wipe = await (await del(room, '?all=1&token=adm1n')).json();
  check('admin: DELETE all submissions', wipe.removed === 2 && storage.data.size === 0);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
