// Minimal static file server for the end-to-end tests (playwright.config.js
// starts it). Serves the repo root so index.html, game.js and the engine
// bundle load exactly as they do from Netlify.
//
// It also hosts the real telemetry party (party/telemetry.js, in-memory
// storage) at /parties/telemetry/<room>, as `wrangler dev` would, so local
// games record their match records here and the dashboard can read them —
// and the Project Mode review queue (party/submissions.js) at
// /parties/submissions/<room>.
//
//   node tests/e2e/serve.js [port]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelemetryRoom } from '../../party/telemetry.js';
import { SubmissionsRoom } from '../../party/submissions.js';
import { TestServer } from '../../party/_test-server.js';
import { createMemoryStorage } from '../../party/_memory-storage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8123);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const PARTIES = {
  telemetry: { Room: TelemetryRoom(TestServer), env: { TELEMETRY_ADMIN_TOKEN: 'e2e-admin' }, storage: createMemoryStorage(), rooms: new Map() },
  submissions: { Room: SubmissionsRoom(TestServer), env: { SUBMISSIONS_ADMIN_TOKEN: 'e2e-admin' }, storage: createMemoryStorage(), rooms: new Map() },
};
function partyRoom(party, id) {
  const p = PARTIES[party];
  if (!p.rooms.has(id)) p.rooms.set(id, new p.Room({ name: id, env: p.env, storage: p.storage }));
  return p.rooms.get(id);
}

async function serveParty(req, res, party, roomId) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body });
  const response = await partyRoom(party, roomId).onRequest(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer((req, res) => {
  const party = req.url.match(/^\/parties\/(telemetry|submissions)\/([^/?]+)/);
  if (party) {
    serveParty(req, res, party[1], decodeURIComponent(party[2])).catch(err => { res.writeHead(500); res.end(String(err)); });
    return;
  }
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`e2e static server on http://localhost:${PORT}`));
