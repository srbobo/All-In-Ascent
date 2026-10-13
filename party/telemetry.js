// All In Ascent — telemetry store (PartyServer)
//
// Keeps one anonymous match record (engine/match-record.js) per finished game
// for the designer's dashboard (dashboard.html). Everything lives in a single
// room, "global", of the `telemetry` party (wrangler.jsonc → durable_objects):
//
//   POST   /parties/telemetry/global                 store a match record (JSON body)
//   GET    /parties/telemetry/global?records=1        stored records, in pages:
//            [&after=<cursor>] [&limit=<n ≤ 1000>]    → { records, next }  (next = null on the last page)
//   GET    /parties/telemetry/global                 → { count }
//   DELETE /parties/telemetry/global?id=<id>         remove one record (admin)
//   DELETE /parties/telemetry/global?all=1           remove every record (admin)
//
// Who records: the GameRoom posts online games itself when they end
// (party/game.js); local hot-seat games are posted by the player's browser
// (telemetry-client.js). Records are checked with validateMatchRecord and
// de-duplicated on their id, so a resend replaces rather than doubles a game.
//
// Access (optional; set with `npx wrangler secret put <NAME>`):
//   TELEMETRY_READ_TOKEN  — when set, GET needs ?token=<value> (the dashboard
//                           asks for it once and remembers it in the browser).
//   TELEMETRY_ADMIN_TOKEN — DELETE needs ?token=<value>; without it DELETE is off.

import { validateMatchRecord } from '../engine/match-record.js';
import { CHARACTERS } from '../engine/data.js';

export const TELEMETRY_ROOM = 'global';
const KEY_PREFIX = 'match:';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGE = 1000;
const KNOWN_CHARACTERS = new Set(Object.keys(CHARACTERS));

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

// A mixin over a PartyServer `Server` base, like GameRoom (party/game.js):
// party/server.js builds the Worker's class from it, the Node tests build it
// over party/_test-server.js.
export const TelemetryRoom = (Base) => class TelemetryRoom extends Base {

  async onRequest(req) {
    const url = new URL(req.url);
    const env = this.env || {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    // One store for the whole game; other room ids are not used.
    if (this.name !== TELEMETRY_ROOM) return json({ error: `use /parties/telemetry/${TELEMETRY_ROOM}` }, 404);

    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) return json({ error: 'record too large' }, 413);
      let record;
      try { record = JSON.parse(text); } catch { return json({ error: 'body is not JSON' }, 400); }
      const problem = validateMatchRecord(record, KNOWN_CHARACTERS);
      if (problem) return json({ error: problem }, 400);
      await this.ctx.storage.put(KEY_PREFIX + record.id, { ...record, receivedAt: Date.now() });
      return json({ ok: true, id: record.id });
    }

    if (req.method === 'GET') {
      if (env.TELEMETRY_READ_TOKEN && url.searchParams.get('token') !== env.TELEMETRY_READ_TOKEN) {
        return json({ error: 'token required' }, 401);
      }
      if (!url.searchParams.has('records')) {
        const all = await this.ctx.storage.list({ prefix: KEY_PREFIX });
        return json({ count: all.size });
      }
      const limit = Math.min(MAX_PAGE, Math.max(1, Number(url.searchParams.get('limit')) || MAX_PAGE));
      const after = url.searchParams.get('after');
      // Ask for one extra to know whether another page follows.
      const page = await this.ctx.storage.list({
        prefix: KEY_PREFIX,
        limit: limit + 1,
        ...(after ? { startAfter: KEY_PREFIX + after } : {}),
      });
      const entries = [...page.entries()];
      const more = entries.length > limit;
      const kept = entries.slice(0, limit);
      return json({
        records: kept.map(([, v]) => v),
        next: more ? kept[kept.length - 1][0].slice(KEY_PREFIX.length) : null,
      });
    }

    if (req.method === 'DELETE') {
      if (!env.TELEMETRY_ADMIN_TOKEN || url.searchParams.get('token') !== env.TELEMETRY_ADMIN_TOKEN) {
        return json({ error: 'admin token required' }, 401);
      }
      if (url.searchParams.has('id')) {
        const removed = await this.ctx.storage.delete(KEY_PREFIX + url.searchParams.get('id'));
        return json({ ok: true, removed: removed ? 1 : 0 });
      }
      if (url.searchParams.has('all')) {
        const all = await this.ctx.storage.list({ prefix: KEY_PREFIX });
        const keys = [...all.keys()];
        // Durable Object storage deletes at most 128 keys per call.
        for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
        return json({ ok: true, removed: keys.length });
      }
      return json({ error: 'say which: ?id=<id> or ?all=1' }, 400);
    }

    return json({ error: 'method not allowed' }, 405);
  }
};
