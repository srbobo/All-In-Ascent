// All In Ascent — PartyKit GameRoom
//
// One Durable Object instance per room (room ID = path segment of the
// WebSocket URL the client connects to). Holds the authoritative game state
// in memory; clients send actions and receive state broadcasts.
//
// Phases:
//   'lobby'       — players join, pick characters, host can add bots and start
//   'in_progress' — turn-by-turn play through engine.applyAction
//   'completed'   — terminal reached; logs shipped to webhook (if configured)
//
// Auth-lite:
//   - First connection to a fresh room becomes host and sets the password.
//   - Subsequent connections must supply { username, password } to join.
//   - Username + password are tracked per connection; usernames must be unique
//     within the room.
//
// Bots:
//   - Host can add a heuristic bot in any open seat from the lobby.
//   - Bots play immediately on their turn with an 800ms artificial delay so
//     human players can follow what happened.
//
// Log shipping:
//   - When the game ends, the full JSONL event stream is POSTed to
//     env.LOG_WEBHOOK_URL (set via `partykit env add LOG_WEBHOOK_URL`).
//   - If no webhook is set, the log is stored in DO storage under
//     `log:<finishedAt>` for later retrieval.

import { createGame } from '../engine/state.js';
import { getLegalActions, applyAction, isTerminal } from '../engine/engine.js';
import { CHARACTERS } from '../engine/data.js';
import { createHeuristicAgent } from '../sim/agents/heuristic.js';

const MAX_SEATS = 4;
const BOT_MOVE_DELAY_MS = 800;

export default class GameRoom {
  constructor(room) {
    this.room = room;
    this.phase = 'lobby';
    this.password = null;            // set by host on creation
    this.hostId = null;              // first connection's id
    // seats: array of MAX_SEATS slots, each null or:
    //   { id, username, isBot, characterKey, connected }
    // For bots, id is `bot:<seat>`.
    this.seats = Array(MAX_SEATS).fill(null);
    this.state = null;               // engine state once started
    this.events = [];                // full JSONL event log for this game
    this.startedAt = null;
    this.finishedAt = null;
    this.botAgents = {};             // seat → heuristic agent instance
    this.botRunning = false;         // re-entrancy guard for bot loop
  }

  // ------------------------------------------------------------------
  // Connection lifecycle
  // ------------------------------------------------------------------

  onConnect(conn, ctx) {
    // Parse ?username=...&password=... from connection URL.
    const url = new URL(ctx.request.url);
    const username = (url.searchParams.get('username') || '').trim().slice(0, 24);
    const password = url.searchParams.get('password') || '';

    if (!username) {
      conn.send(JSON.stringify({ type: 'error', message: 'username required' }));
      conn.close();
      return;
    }

    // First connection bootstraps the room (becomes host, sets password).
    if (this.hostId === null) {
      this.hostId = conn.id;
      this.password = password;
    } else if (password !== this.password) {
      conn.send(JSON.stringify({ type: 'error', message: 'wrong room password' }));
      conn.close();
      return;
    }

    // Reject duplicate usernames (unless this is a reconnect of the same seat).
    const existing = this.seats.find(s => s && !s.isBot && s.username === username);
    if (existing && existing.id !== conn.id) {
      // If their previous connection dropped, allow takeover.
      if (!existing.connected) {
        existing.id = conn.id;
        existing.connected = true;
        this.sendWelcome(conn, username, /*isHost*/ existing.id === this.hostId);
        this.broadcastLobby();
        if (this.phase === 'in_progress') this.sendState(conn);
        return;
      }
      conn.send(JSON.stringify({ type: 'error', message: 'username already taken' }));
      conn.close();
      return;
    }

    // Phase = in_progress and this isn't a reconnect → spectator-only is not
    // supported in v1; reject.
    if (this.phase !== 'lobby' && !existing) {
      conn.send(JSON.stringify({ type: 'error', message: 'game already in progress' }));
      conn.close();
      return;
    }

    // Allocate a seat (lobby phase only).
    if (this.phase === 'lobby' && !existing) {
      const seatIndex = this.seats.findIndex(s => s === null);
      if (seatIndex < 0) {
        conn.send(JSON.stringify({ type: 'error', message: 'room full' }));
        conn.close();
        return;
      }
      this.seats[seatIndex] = {
        id: conn.id,
        username,
        isBot: false,
        characterKey: null,
        connected: true,
      };
    }

    this.sendWelcome(conn, username, /*isHost*/ conn.id === this.hostId);
    this.broadcastLobby();
  }

  onClose(conn) {
    const seat = this.seats.find(s => s && s.id === conn.id);
    if (!seat) return;
    seat.connected = false;
    // If we're still in lobby, free the seat entirely.
    if (this.phase === 'lobby') {
      const idx = this.seats.indexOf(seat);
      this.seats[idx] = null;
    }
    this.broadcastLobby();
  }

  // ------------------------------------------------------------------
  // Message dispatch
  // ------------------------------------------------------------------

  async onMessage(message, conn) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    const seat = this.seats.find(s => s && s.id === conn.id);
    const isHost = conn.id === this.hostId;

    switch (msg.type) {
      case 'select_character':
        if (this.phase !== 'lobby' || !seat) return;
        // Enforce uniqueness across seats.
        if (msg.characterKey && this.seats.some(s => s && s !== seat && s.characterKey === msg.characterKey)) {
          conn.send(JSON.stringify({ type: 'error', message: 'character already chosen' }));
          return;
        }
        if (msg.characterKey && !CHARACTERS[msg.characterKey]) return;
        seat.characterKey = msg.characterKey || null;
        this.broadcastLobby();
        break;

      case 'add_bot':
        if (!isHost || this.phase !== 'lobby') return;
        this.addBot();
        this.broadcastLobby();
        break;

      case 'remove_bot':
        if (!isHost || this.phase !== 'lobby') return;
        if (typeof msg.seatIndex === 'number' && this.seats[msg.seatIndex]?.isBot) {
          this.seats[msg.seatIndex] = null;
          this.broadcastLobby();
        }
        break;

      case 'start_game':
        if (!isHost || this.phase !== 'lobby') return;
        await this.startGame(conn);
        break;

      case 'action':
        if (this.phase !== 'in_progress' || !seat) return;
        await this.handleAction(seat, msg.actionIndex);
        break;

      case 'leave':
        conn.close();
        break;
    }
  }

  // ------------------------------------------------------------------
  // Lobby helpers
  // ------------------------------------------------------------------

  addBot() {
    const seatIndex = this.seats.findIndex(s => s === null);
    if (seatIndex < 0) return;
    // Pick the first available character we haven't claimed yet.
    const taken = new Set(this.seats.filter(s => s).map(s => s.characterKey).filter(Boolean));
    const characterKey = Object.keys(CHARACTERS).find(k => !taken.has(k)) || null;
    this.seats[seatIndex] = {
      id: `bot:${seatIndex}`,
      username: `Bot ${seatIndex + 1}`,
      isBot: true,
      characterKey,
      connected: true,
    };
  }

  sendWelcome(conn, username, isHost) {
    conn.send(JSON.stringify({
      type: 'welcome',
      yourId: conn.id,
      username,
      isHost,
      characters: Object.keys(CHARACTERS).map(k => ({
        key: k, name: CHARACTERS[k].name, passive: CHARACTERS[k].passive,
      })),
    }));
  }

  broadcastLobby() {
    const payload = {
      type: 'lobby',
      phase: this.phase,
      hostId: this.hostId,
      seats: this.seats.map(s => s && ({
        username: s.username,
        isBot: s.isBot,
        characterKey: s.characterKey,
        connected: s.connected,
      })),
    };
    this.room.broadcast(JSON.stringify(payload));
  }

  // ------------------------------------------------------------------
  // Game start
  // ------------------------------------------------------------------

  async startGame(conn) {
    const filled = this.seats.filter(s => s !== null);
    if (filled.length < 2) {
      conn.send(JSON.stringify({ type: 'error', message: 'need at least 2 players or bots to start' }));
      return;
    }
    if (filled.some(s => !s.characterKey)) {
      conn.send(JSON.stringify({ type: 'error', message: 'every seat must pick a character' }));
      return;
    }

    // Compact seats to remove holes (engine expects contiguous players 1..N).
    const orderedSeats = filled.slice();
    this.seats = Array(MAX_SEATS).fill(null);
    orderedSeats.forEach((s, i) => { this.seats[i] = s; });

    const seed = Math.floor(Math.random() * 1e9);
    const { state, events } = createGame({
      seed,
      characterKeys: orderedSeats.map(s => s.characterKey),
    });
    this.state = state;
    this.events = events.slice();
    this.events.push({
      kind: 'run_meta',
      ts: Date.now(),
      mode: 'online',
      seed,
      players: orderedSeats.map((s, i) => ({
        seat: i, username: s.username, isBot: s.isBot, characterKey: s.characterKey,
      })),
    });

    // Set up bot agents for bot seats.
    this.botAgents = {};
    for (let i = 0; i < orderedSeats.length; i++) {
      if (orderedSeats[i].isBot) this.botAgents[i] = createHeuristicAgent();
    }

    this.phase = 'in_progress';
    this.startedAt = Date.now();
    this.broadcastState();
    // Kick off bot loop if seat 0 is a bot.
    this.maybePlayBot();
  }

  // ------------------------------------------------------------------
  // Action handling
  // ------------------------------------------------------------------

  async handleAction(seat, actionIndex) {
    const seatIndex = this.seats.indexOf(seat);
    if (seatIndex !== this.state.currentPlayerIndex) {
      // Not their turn — silently ignore.
      return;
    }
    const legal = getLegalActions(this.state);
    if (typeof actionIndex !== 'number' || actionIndex < 0 || actionIndex >= legal.length) {
      return;
    }
    this.advance(legal[actionIndex]);
    await this.maybePlayBot();
  }

  advance(action) {
    const { state: nextState, events: delta } = applyAction(this.state, action);
    this.state = nextState;
    for (const e of delta) this.events.push(e);

    const term = isTerminal(this.state);
    if (term.done) {
      this.endGame(term);
    } else {
      this.broadcastState();
    }
  }

  async maybePlayBot() {
    if (this.botRunning || this.phase !== 'in_progress') return;
    this.botRunning = true;
    try {
      while (this.phase === 'in_progress') {
        const seatIndex = this.state.currentPlayerIndex;
        const agent = this.botAgents[seatIndex];
        if (!agent) break; // current player is human
        const legal = getLegalActions(this.state);
        if (legal.length === 0) break;
        const { actionIndex } = await agent.chooseAction({ state: this.state, legalActions: legal });
        // Brief delay so humans can read what happened.
        await new Promise(r => setTimeout(r, BOT_MOVE_DELAY_MS));
        if (this.phase !== 'in_progress') break;
        this.advance(legal[actionIndex]);
      }
    } finally {
      this.botRunning = false;
    }
  }

  // ------------------------------------------------------------------
  // Game end
  // ------------------------------------------------------------------

  async endGame(term) {
    this.phase = 'completed';
    this.finishedAt = Date.now();
    this.events.push({
      kind: 'run_summary',
      ts: this.finishedAt,
      winner: term.winner,
      reason: term.reason,
      rounds: this.state.round,
      finalPlayers: this.state.players.map(p => ({
        playerNum: p.playerNum,
        characterKey: p.character.key,
        milestonesDone: Object.keys(p.milestonesCompleted || {}).length,
      })),
    });

    // Broadcast final state with terminal info.
    this.broadcastState({ terminal: term });

    // Ship logs.
    await this.shipLogs();
  }

  async shipLogs() {
    const jsonl = this.events.map(e => JSON.stringify(e)).join('\n');
    const webhook = this.room.env?.LOG_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            room: this.room.id,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
            log: jsonl,
          }),
        });
        return;
      } catch (err) {
        // Fall through to storage.
        console.error('log webhook failed', err);
      }
    }
    // No webhook (or webhook failed) — keep in DO storage for retrieval.
    try {
      await this.room.storage.put(`log:${this.finishedAt}`, jsonl);
    } catch (err) {
      console.error('log storage failed', err);
    }
  }

  // ------------------------------------------------------------------
  // State broadcasts
  // ------------------------------------------------------------------

  sendState(conn) {
    conn.send(JSON.stringify(this.stateMessage()));
  }

  broadcastState(extra = {}) {
    this.room.broadcast(JSON.stringify({ ...this.stateMessage(), ...extra }));
  }

  stateMessage() {
    // Send the full state — it's already JSON-clean by design (state.js note).
    // Include the legal-action menu for the current player so clients don't
    // have to import the engine.
    const legalActions = this.phase === 'in_progress' ? getLegalActions(this.state) : [];
    return {
      type: 'state',
      phase: this.phase,
      state: this.state,
      legalActions,
      seats: this.seats.map(s => s && ({
        username: s.username,
        isBot: s.isBot,
        characterKey: s.characterKey,
        connected: s.connected,
      })),
    };
  }
}
