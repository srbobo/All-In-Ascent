# All In Ascent — Online Deployment

This document walks through getting the game online so two friends (plus
optional bots) can play in real time. The stack is intentionally tiny:

- **Backend**: one Cloudflare Worker built with
  [PartyServer](https://github.com/cloudflare/partykit/tree/main/packages/partyserver)
  (`party/server.js`, configured by `wrangler.jsonc`). Each party is a
  Durable Object class: `Main` (the GameRoom, `party/game.js`), `Telemetry`
  and `Submissions`. Free tier covers ~100k requests/day, plenty for friend
  games. (Until October 2026 this ran on the hosted PartyKit platform, which is
  shutting down; see "Moving off PartyKit" below.)
- **Frontend**: static HTML/JS — `online.html` (join form) hands off to
  `index.html?online=1`, which loads `online-mode.js` + `game.js` + the
  engine bundle `engine/engine.browser.js` (the same rules the server runs). Can be
  served by the Worker itself (free), Netlify, GitHub Pages, or Cloudflare Pages.
- **Logs**: when a game ends, the full JSONL event log is POSTed to a webhook
  you control (defaults to nothing → falls back to DO storage).

> **Static files** — the Worker serves `.site/`, which `party/build-site.js`
> fills with just the playable site (pages, browser scripts, `design/`, the
> engine modules, the vendored PartySocket). Wrangler runs it before every
> `wrangler dev` and `wrangler deploy` (`build` in `wrangler.jsonc`). The repo
> root itself is never uploaded: it holds `node_modules` and about a gigabyte
> of archived training data. A new top-level page or script is picked up
> automatically; add it to `build.watch_dir` too so `wrangler dev` reloads it.

## 0. One-time setup

```bash
# install deps (partyserver; wrangler + partysocket are dev deps)
npm install

# log in to Cloudflare (opens a browser tab)
npx wrangler login
```

## 1. Local dev — two-browser-tab test

```bash
npm run online:dev
# → wrangler dev: the Worker on http://127.0.0.1:1999 (Durable Objects run
#   locally, state in .wrangler/), also serving online.html, the game, etc.
```

Secrets and settings for local dev go in `.dev.vars` (gitignored), one
`NAME=value` per line — e.g. `BOT_MOVE_DELAY_MS=0` for instant bots.

Open two tabs:

1. Tab A — visit `http://127.0.0.1:1999/online.html`.
   - Name: `alice`, Room: `friday-night`, Password: `boulders`,
     Host: `127.0.0.1:1999`
   - Click Join — Alice is the host (first to enter the fresh room).
2. Tab B — same URL.
   - Name: `bob`, Room: `friday-night`, Password: `boulders`,
     Host: `127.0.0.1:1999`
   - Click Join — Bob takes seat 2.
3. Both players pick characters. Alice clicks **Add Bot** to add a third
   seat (optional). Alice clicks **Start Game**.
4. Turns alternate; bots play automatically with an 800ms delay so you can
   follow.
5. When the game ends, check the terminal that ran `npm run online:dev` —
   if no `LOG_WEBHOOK_URL` is set, the log is kept in the room's storage
   (`GET /parties/main/<room>?logs=1` lists them). Otherwise the JSONL log is
   POSTed to your webhook.

`npm run test:party` also boots this Worker in workerd (`party/_worker-test.js`)
and plays a game over a real WebSocket, so the routing and bindings are tested
on every `npm test`.

## 2. Deploy the backend

```bash
npm run online:deploy
```

The first deploy prints a URL like:

```
https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev
```

Put that host (without `https://`) in `backend.js` → `PRODUCTION_HOST`: it is
the one place the pages (online.html, local-game telemetry, the dashboard,
the review queue) read the production backend from. Players can also type it
into the **Backend host** field in `online.html`.

`wrangler.jsonc` declares one Durable Object binding per party and a
`migrations` entry creating them as SQLite-backed classes. Wrangler does not
infer migrations: when you add, rename or remove a party class, add a new
migration tag.

### Secrets

Keep production secrets in `.prod.vars` at the repo root (gitignored, never
committed; `NAME=value` per line, commented-out lines are skipped) and upload
them all at once:

```bash
npx wrangler secret bulk .prod.vars
```

Secrets apply without a redeploy. The sections below say what each one does.

### Optional: log webhook

```bash
# any service that accepts POST {room, startedAt, finishedAt, log} — e.g. a
# Cloudflare Worker writing to R2, an n8n webhook, a Discord bot, etc.
npx wrangler secret put LOG_WEBHOOK_URL
# paste your URL when prompted (secrets apply without a redeploy)
```

If unset, logs are stored in the room's Durable Object under
`log:<finishedAt>` and can be read back with
`GET /parties/main/<room>?logs=1` and `?log=<finishedAt>`.

### Telemetry dashboard (designer analytics)

Every finished game is recorded as one anonymous **match record**
(`engine/match-record.js`): characters, human/bot seats, player count, the
winner and final standings, Levels and milestones, gear bought, route cards
climbed, training focus and where each climber's Time went. No usernames or
anything a player typed. Records are stored by the `telemetry` party
(`party/telemetry.js`, the `Telemetry` binding in `wrangler.jsonc`) in its
Durable Object, one room called `global`:

- **Online games** are recorded by the GameRoom itself when they end.
- **Local hot-seat games** are posted by the player's browser
  (`telemetry-client.js`) to the production host (`backend.js`), or to the page's
  own origin when it is served from `localhost`. Players can switch this off
  with the footer checkbox ("Share my local games").

The dashboard is served next to the game:

```
https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/dashboard.html
```

It shows win rates and a fair-share win index per character (split by 2-,
3- and 4-player games), head-to-head match-ups, seat-order advantage, builds
(training focus + gear), gear and route card usage (including cards nobody
used), winning Levels, game length and milestones, with filters for period,
player count, mode, humans vs bots and engine version. "Load file…" opens a
JSONL export or a sim sample instead of the server's data.

```bash
# Optional: require a token to READ the data (the dashboard asks for it once).
npx wrangler secret put TELEMETRY_READ_TOKEN
# Optional: allow deleting records (e.g. test games) with a token.
npx wrangler secret put TELEMETRY_ADMIN_TOKEN

# Remove every record, or one by id:
curl -X DELETE "https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/parties/telemetry/global?all=1&token=ADMIN_TOKEN"
curl -X DELETE "https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/parties/telemetry/global?id=<record id>&token=ADMIN_TOKEN"
```

### Project Mode review queue

Cards built in Project Mode (`project.html`, behind the `projectMode` feature
flag — see README) can be submitted for review. Each submission (the card's
definition, the author's handle and note, nothing else) is stored by the
`submissions` party (`party/submissions.js`, the `Submissions` binding in
`wrangler.jsonc`) in one room called `global`, and listed with a card preview
on the review queue served next to the game:

```
https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/review.html
```

Approving, rejecting or deleting a submission needs an admin token; reading
the queue can be protected too:

```bash
# Optional: require a token to READ the queue (review.html asks for it once).
npx wrangler secret put SUBMISSIONS_READ_TOKEN
# Needed to approve / reject / delete (review.html asks for it once).
npx wrangler secret put SUBMISSIONS_ADMIN_TOKEN

# By hand:
curl "https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/parties/submissions/global?list=1&token=READ_TOKEN"
curl -X PATCH "https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/parties/submissions/global?id=<id>&status=approved&token=ADMIN_TOKEN"
curl -X DELETE "https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/parties/submissions/global?id=<id>&token=ADMIN_TOKEN"
```

Bot-simulated data, for a dashboard to look at before real players arrive
(recorded with mode `sim`, so the Mode filter separates it):

```bash
npm run telemetry:sample -- --games=200                              # → results/telemetry-sample.jsonl (Load file…)
npm run telemetry:sample -- --games=200 --post=http://127.0.0.1:1999  # into `npm run online:dev`
```

## 3. Deploy the frontend

You have three options. Pick one:

### Option A — let the Worker serve `online.html` (zero config)

The `assets` block in `wrangler.jsonc` is already configured. After deploy,
`https://all-in-ascent.YOUR-SUBDOMAIN.workers.dev/online.html` serves the
page. Friends just visit that URL.

### Option B — GitHub Pages

1. Push the repo to GitHub.
2. Settings → Pages → Source: `main` branch, root.
3. Visit `https://YOUR-USER.github.io/REPO/online.html`.
4. The landing page connects to `backend.js` → `PRODUCTION_HOST`, or to
   whatever is typed in its **Backend host** field
   (`all-in-ascent.YOUR-SUBDOMAIN.workers.dev`).

### Option C — Custom domain

Cloudflare Pages or any static host works. Same setup as Option B; just
point your domain at the static bucket. Friends visit
`https://allinascent.yourdomain.com/online.html`. The Worker can have a
custom domain too (`routes` in `wrangler.jsonc`, see the Cloudflare Workers
docs); put it in `backend.js`.

## 4. Sharing a game

The room URL alone isn't enough — players also need the password the host
set. Easiest flow:

1. Host opens `online.html`, enters a name, a room ID (e.g. `friday-night`),
   and picks a password. They become host.
2. Host shares the room ID + password with friends via chat.
3. Friends open `online.html`, enter the same room/password, pick a name,
   pick a character.
4. Host adds bots if needed, clicks Start.

## 5. Costs

- **Cloudflare Workers + Durable Objects**: free tier — 100k requests/day, 10 million
  Durable Object requests/month. A 3-player game is ~200 messages →
  effectively free for friend games.
- **GitHub Pages**: free.
- **Custom domain**: $10–15/yr if you want one.

Total worst-case at hobby scale: **~$1/month**, almost always **$0**.

## 6. Architecture in 30 seconds

```
  browser <--WebSocket--> Worker (party/server.js) → Main DO (party/game.js)
   index.html?online=1        ├─ in-memory state (GameRoom DO)
   + online-mode.js           ├─ heuristic bots for empty seats
                              ├─ on game_end → POST log to webhook
                              └─ on game_end → match record → Telemetry DO
  dashboard.html  <--HTTP-->  Worker → Telemetry DO (party/telemetry.js, room "global")
  index.html (local play) ─── POST match record ──┘
```

One Durable Object instance per `room` ID. All state lives in memory; bots
run server-side using the same `sim/agents/heuristic.js` the playtest
pipeline uses. The engine module (`engine/`) runs unmodified — the online
mode is just a transport over the existing pure-function engine.

## 7. Moving off PartyKit (October 2026)

PartyKit's hosted platform is shutting down in October 2026 (deploys off 16 Oct,
platform off 23 Oct). The backend moved to PartyServer on Cloudflare Workers
by https://docs.partykit.io/guides/migrate-to-partyserver/. What changed:

- `partykit.json` → `wrangler.jsonc`; `partykit dev/deploy` → `wrangler dev/deploy`;
  `partykit env add` → `wrangler secret put`.
- The rooms are PartyServer mixins (`GameRoom(Server)` etc.) using the new
  API (`this.name`, `this.env`, `this.ctx.storage`, `this.broadcast`,
  `onMessage(connection, message)`); `party/server.js` builds the Worker's
  classes from them and the Node tests build them over `party/_test-server.js`.
- The GameRoom reaches the telemetry room with `getServerByName` instead of
  `room.context.parties`.
- URLs are unchanged (`/parties/main/<room>`, `/parties/telemetry/global`,
  `/parties/submissions/global`), so PartySocket clients only need the new host.

Nothing stored on PartyKit was carried over: the telemetry and submissions
parties were never deployed there, and the old GameRoom only kept finished
games' logs in per-room storage with no way to list rooms.
