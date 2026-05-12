# All In Ascent — Online Deployment

This document walks through getting the game online so two friends (plus
optional bots) can play in real time. The stack is intentionally tiny:

- **Backend**: a single PartyKit room class (`party/game.js`) running on
  Cloudflare Workers + Durable Objects. Free tier covers ~100k requests/day,
  plenty for friend games.
- **Frontend**: static HTML/JS (`online.html` + `online/client.js`). Can be
  served by PartyKit itself (free), or by GitHub Pages / Cloudflare Pages.
- **Logs**: when a game ends, the full JSONL event log is POSTed to a webhook
  you control (defaults to nothing → falls back to DO storage).

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
   online/                   ├─ in-memory state (GameRoom DO)
   client.js                 ├─ heuristic bots for empty seats
                             └─ on game_end → POST log to webhook
```

One Durable Object instance per `room` ID. All state lives in memory; bots
run server-side using the same `sim/agents/heuristic.js` the playtest
pipeline uses. The engine module (`engine/`) runs unmodified — the online
mode is just a transport over the existing pure-function engine.
