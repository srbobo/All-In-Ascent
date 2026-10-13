// All In Ascent — review queue for Project Mode submissions (PartyServer)
//
// Players who build a climber, route or gear card in Project Mode
// (project.html) can submit it for the designer's review. Each submission
// (engine/content.js SUBMISSION_SCHEMA) is kept in a single room, "global",
// of the `submissions` party (wrangler.jsonc → durable_objects):
//
//   POST   /parties/submissions/global                store a submission (JSON body)
//   GET    /parties/submissions/global?list=1         stored submissions, in pages:
//            [&after=<cursor>] [&limit=<n ≤ 500>]      → { submissions, next }
//   GET    /parties/submissions/global                → { count }
//   PATCH  /parties/submissions/global?id=<id>&status=<new|approved|rejected>
//                                                     set the review status (admin)
//   DELETE /parties/submissions/global?id=<id>        remove one (admin)
//   DELETE /parties/submissions/global?all=1          remove every submission (admin)
//
// Submissions are checked with validateSubmission (the card must compile) and
// de-duplicated on their id, so a resend replaces rather than doubles one.
// A resend keeps the review status already given.
//
// Access (optional; set with `npx wrangler secret put <NAME>`):
//   SUBMISSIONS_READ_TOKEN  — when set, GET needs ?token=<value> (review.html
//                             asks for it once and remembers it in the browser).
//   SUBMISSIONS_ADMIN_TOKEN — PATCH and DELETE need ?token=<value>; without it
//                             they are off.

import { validateSubmission, SUBMISSION_STATUSES } from '../engine/content.js';

export const SUBMISSIONS_ROOM = 'global';
const KEY_PREFIX = 'sub:';
const MAX_BODY_BYTES = 32 * 1024;
const MAX_PAGE = 500;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

// A mixin over a PartyServer `Server` base, like GameRoom (party/game.js):
// party/server.js builds the Worker's class from it, the Node tests build it
// over party/_test-server.js.
export const SubmissionsRoom = (Base) => class SubmissionsRoom extends Base {

  async onRequest(req) {
    const url = new URL(req.url);
    const env = this.env || {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (this.name !== SUBMISSIONS_ROOM) return json({ error: `use /parties/submissions/${SUBMISSIONS_ROOM}` }, 404);
    const isAdmin = !!env.SUBMISSIONS_ADMIN_TOKEN && url.searchParams.get('token') === env.SUBMISSIONS_ADMIN_TOKEN;

    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) return json({ error: 'submission too large' }, 413);
      let sub;
      try { sub = JSON.parse(text); } catch { return json({ error: 'body is not JSON' }, 400); }
      const problem = validateSubmission(sub);
      if (problem) return json({ error: problem }, 400);
      const key = KEY_PREFIX + sub.id;
      const existing = await this.ctx.storage.get(key);
      const stored = {
        schema: sub.schema, id: sub.id, kind: sub.kind, engineVersion: sub.engineVersion,
        author: sub.author || null, note: sub.note || null, definition: sub.definition,
        submittedAt: Number.isFinite(sub.submittedAt) ? sub.submittedAt : Date.now(),
        receivedAt: Date.now(),
        status: existing && SUBMISSION_STATUSES.includes(existing.status) ? existing.status : 'new',
      };
      await this.ctx.storage.put(key, stored);
      return json({ ok: true, id: sub.id });
    }

    if (req.method === 'GET') {
      if (env.SUBMISSIONS_READ_TOKEN && url.searchParams.get('token') !== env.SUBMISSIONS_READ_TOKEN && !isAdmin) {
        return json({ error: 'token required' }, 401);
      }
      if (!url.searchParams.has('list')) {
        const all = await this.ctx.storage.list({ prefix: KEY_PREFIX });
        return json({ count: all.size });
      }
      const limit = Math.min(MAX_PAGE, Math.max(1, Number(url.searchParams.get('limit')) || MAX_PAGE));
      const after = url.searchParams.get('after');
      const page = await this.ctx.storage.list({
        prefix: KEY_PREFIX,
        limit: limit + 1,
        ...(after ? { startAfter: KEY_PREFIX + after } : {}),
      });
      const entries = [...page.entries()];
      const more = entries.length > limit;
      const kept = entries.slice(0, limit);
      return json({
        submissions: kept.map(([, v]) => v),
        next: more ? kept[kept.length - 1][0].slice(KEY_PREFIX.length) : null,
      });
    }

    if (req.method === 'PATCH') {
      if (!isAdmin) return json({ error: 'admin token required' }, 401);
      const id = url.searchParams.get('id');
      const status = url.searchParams.get('status');
      if (!id || !SUBMISSION_STATUSES.includes(status)) return json({ error: `say ?id=<id>&status=<${SUBMISSION_STATUSES.join('|')}>` }, 400);
      const key = KEY_PREFIX + id;
      const existing = await this.ctx.storage.get(key);
      if (!existing) return json({ error: 'no such submission' }, 404);
      await this.ctx.storage.put(key, { ...existing, status, reviewedAt: Date.now() });
      return json({ ok: true, id, status });
    }

    if (req.method === 'DELETE') {
      if (!isAdmin) return json({ error: 'admin token required' }, 401);
      if (url.searchParams.has('id')) {
        const removed = await this.ctx.storage.delete(KEY_PREFIX + url.searchParams.get('id'));
        return json({ ok: true, removed: removed ? 1 : 0 });
      }
      if (url.searchParams.has('all')) {
        const all = await this.ctx.storage.list({ prefix: KEY_PREFIX });
        const keys = [...all.keys()];
        for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
        return json({ ok: true, removed: keys.length });
      }
      return json({ error: 'say which: ?id=<id> or ?all=1' }, 400);
    }

    return json({ error: 'method not allowed' }, 405);
  }
};
