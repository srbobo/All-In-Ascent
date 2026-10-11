# All In Ascent — Online Deployment

This document walks through getting the game online so two friends (plus
optional bots) can play in real time. The stack is intentionally tiny:

- **Backend**: a single PartyKit room class (`party/game.js`) running on
  Cloudflare Workers + Durable Objects. Free tier covers ~100k requests/day,
  plenty for friend games.
- **Frontend**: static HTML/JS — `online.html` (join form) hands off to
  `index.html?online=1`, which loads `online-mode.js` + `game.js` + the
  engine bundle `engine/engine.browser.js` (the same rules the server runs). Can be
  served by PartyKit itself (free), Netlify, GitHub Pages, or Cloudflare Pages.
- **Logs**: when a game ends, the full JSONL event log is POSTed to a webhook
  you control (defaults to nothing → falls back to DO storage).

> **Config gotcha** — `partykit.json` uses **camelCase keys**, not Cloudflare
> wrangler's snake_case. The right key is `compatibilityDate`, not
> `compatibility_date`. PartyKit v0.0.114 also does NOT support `serve.exclude`
> — if you add it, the dev server refuses to start. Symptom is generic
> "connection error" toasts on the client because the server never came up.

## 0. One-time setup

```bash
# install deps (partykit + partysocket are dev deps in package.json)
npm install

# log in (this opens a browser tab to authenticate against partykit.io)
npx partykit login
```

## 1. Local dev — two-browser-tab test

```bash
npm run online:dev
# → starts the room on http://127.0.0.1:1999
# → also serves the static files (online.html, engine/, etc.) on that origin
```

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
   if no `LOG_WEBHOOK_URL` is set, you'll see a storage entry. Otherwise
   the JSONL log is POSTed to your webhook.

## 2. Deploy the backend

```bash
npm run online:deploy
```

The first deploy prints a URL like:

```
https://all-in-ascent.YOUR-USER.partykit.dev
```

Save that — clients connect to it via the **Backend host** field in
`online.html`.

### Optional: log webhook

```bash
# any service that accepts POST {room, startedAt, finishedAt, log} — e.g. a
# Cloudflare Worker writing to R2, an n8n webhook, a Discord bot, etc.
npx partykit env add LOG_WEBHOOK_URL
# paste your URL when prompted, redeploy
npm run online:deploy
```

If unset, logs are stored in the DO under `log:<finishedAt>` and can be
retrieved later via the PartyKit storage API.

### Telemetry dashboard (designer analytics)

Every finished game is recorded as one anonymous **match record**
(`engine/match-record.js`): characters, human/bot seats, player count, the
winner and final standings, Levels and milestones, gear bought, route cards
climbed, training focus and where each climber's Time went. No usernames or
anything a player typed. Records are stored by the `telemetry` party
(`party/telemetry.js`, registered under `parties` in `partykit.json`) in its
Durable Object, one room called `global`:

- **Online games** are recorded by the GameRoom itself when they end.
- **Local hot-seat games** are posted by the player's browser
  (`telemetry-client.js`) to the production PartyKit host, or to the page's
  own origin when it is served from `localhost`. Players can switch this off
  with the footer checkbox ("Share my local games").

The dashboard is served next to the game:

```
https://all-in-ascent.YOUR-USER.partykit.dev/dashboard.html
```

It shows win rates and a fair-share win index per character (split by 2-,
3- and 4-player games), head-to-head match-ups, seat-order advantage, builds
(training focus + gear), gear and route card usage (including cards nobody
used), winning Levels, game length and milestones, with filters for period,
player count, mode, humans vs bots and engine version. "Load file…" opens a
JSONL export or a sim sample instead of the server's data.

```bash
# Optional: require a token to READ the data (the dashboard asks for it once).
npx partykit env add TELEMETRY_READ_TOKEN
# Optional: allow deleting records (e.g. test games) with a token.
npx partykit env add TELEMETRY_ADMIN_TOKEN
npm run online:deploy

# Remove every record, or one by id:
curl -X DELETE "https://all-in-ascent.YOUR-USER.partykit.dev/parties/telemetry/global?all=1&token=ADMIN_TOKEN"
curl -X DELETE "https://all-in-ascent.YOUR-USER.partykit.dev/parties/telemetry/global?id=<record id>&token=ADMIN_TOKEN"
```

Bot-simulated data, for a dashboard to look at before real players arrive
(recorded with mode `sim`, so the Mode filter separates it):

```bash
npm run telemetry:sample -- --games=200                              # → results/telemetry-sample.jsonl (Load file…)
npm run telemetry:sample -- --games=200 --post=http://127.0.0.1:1999  # into `npm run online:dev`
```

## 3. Deploy the frontend

You have three options. Pick one:

### Option A — let PartyKit serve `online.html` (zero config)

The `partykit.json` `serve` block is already configured. After deploy,
`https://all-in-ascent.YOUR-USER.partykit.dev/online.html` serves the page.
Friends just visit that URL.

### Option B — GitHub Pages

1. Push the repo to GitHub.
2. Settings → Pages → Source: `main` branch, root.
3. Visit `https://YOUR-USER.github.io/REPO/online.html`.
4. In the **Backend host** field on the landing page, enter your PartyKit
   host (`all-in-ascent.YOUR-USER.partykit.dev`).

### Option C — Custom domain

Cloudflare Pages or any static host works. Same setup as Option B; just
point your domain at the static bucket. Friends visit
`https://allinascent.yourdomain.com/online.html`. PartyKit also supports
custom domains for the backend — see https://docs.partykit.io.

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

- **PartyKit (Cloudflare)**: free tier — 100k requests/day, 10 million
  Durable Object requests/month. A 3-player game is ~200 messages →
  effectively free for friend games.
- **GitHub Pages**: free.
- **Custom domain**: $10–15/yr if you want one.

Total worst-case at hobby scale: **~$1/month**, almost always **$0**.

## 6. Architecture in 30 seconds

```
  browser <--WebSocket--> PartyKit Worker (party/game.js)
   index.html?online=1        ├─ in-memory state (GameRoom DO)
   + online-mode.js           ├─ heuristic bots for empty seats
                              ├─ on game_end → POST log to webhook
                              └─ on game_end → match record → telemetry party
  dashboard.html  <--HTTP-->  PartyKit Worker (party/telemetry.js, room "global")
  index.html (local play) ─── POST match record ──┘
```

One Durable Object instance per `room` ID. All state lives in memory; bots
run server-side using the same `sim/agents/heuristic.js` the playtest
pipeline uses. The engine module (`engine/`) runs unmodified — the online
mode is just a transport over the existing pure-function engine.
