// All In Ascent — the Cloudflare Worker (PartyServer).
//
// Builds the three Durable Object classes from the room mixins and routes
// requests to them. wrangler.jsonc binds each class under its own name, and
// routePartykitRequest maps /parties/<kebab-cased binding>/<room> to it:
//
//   /parties/main/<room>               GameRoom      (party/game.js)
//   /parties/telemetry/global          TelemetryRoom (party/telemetry.js)
//   /parties/submissions/global        SubmissionsRoom (party/submissions.js)
//
// Static files (online.html, index.html, the dashboard, …) are served by
// Workers static assets (wrangler.jsonc → assets) before this Worker runs.

import { Server, routePartykitRequest, getServerByName } from 'partyserver';
import { GameRoom } from './game.js';
import { TelemetryRoom, TELEMETRY_ROOM } from './telemetry.js';
import { SubmissionsRoom } from './submissions.js';

export class Main extends GameRoom(Server) {
  telemetry() {
    return getServerByName(this.env.Telemetry, TELEMETRY_ROOM);
  }
}

export class Telemetry extends TelemetryRoom(Server) {}

export class Submissions extends SubmissionsRoom(Server) {}

export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, env)) || new Response('Not found', { status: 404 });
  },
};
