// All In Ascent — online client
//
// Uses partysocket (loaded as an ESM dependency from a CDN to avoid a build
// step). Connects to a GameRoom DO running on PartyKit, exchanges JSON
// messages, and drives the lobby/game UI in online.html.
//
// Persistence:
//   - username + host + room + password are saved to localStorage so reloading
//     the tab puts you straight back into the room you were in.

import PartySocket from 'https://esm.sh/partysocket@1.0.2';

// ----- DOM refs -----
const $ = (id) => document.getElementById(id);
const landingEl = $('landing');
const lobbyEl = $('lobby');
const gameEl = $('game');
const toastEl = $('toast');

// ----- Local persistence -----
const LS_KEY = 'all-in-ascent.online';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

const prefs = loadPrefs();
$('username').value = prefs.username || '';
$('room').value = prefs.room || '';
$('password').value = prefs.password || '';
$('host').value = prefs.host || '';

// ----- Connection state -----
let socket = null;
let me = { id: null, username: '', isHost: false };
let lastLobby = null;
let lastState = null;
let lastSeenEvent = 0;
let characters = []; // from welcome

// ----- Toast -----
function toast(msg, ms = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

// ----- Phase switching -----
function showLanding() {
  landingEl.classList.remove('hidden');
  lobbyEl.classList.add('hidden');
  gameEl.classList.add('hidden');
}
function showLobby() {
  landingEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  gameEl.classList.add('hidden');
}
function showGame() {
  landingEl.classList.add('hidden');
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
}

// ----- Join button -----
$('joinBtn').addEventListener('click', () => {
  const username = $('username').value.trim();
  const room = $('room').value.trim() || 'default';
  const password = $('password').value;
  const host = $('host').value.trim();
  if (!username) { toast('Enter a name'); return; }
  if (!host) { toast('Enter the PartyKit host URL'); return; }
  savePrefs({ username, room, password, host });
  connect({ username, room, password, host });
});

function connect({ username, room, password, host }) {
  if (socket) { try { socket.close(); } catch {} }
  socket = new PartySocket({
    host,
    room,
    query: { username, password },
  });
  socket.addEventListener('open', () => {
    $('lobbyRoom').textContent = room;
  });
  socket.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    handleMessage(msg);
  });
  socket.addEventListener('close', () => {
    toast('Disconnected. Refresh to retry.', 6000);
  });
  socket.addEventListener('error', () => {
    toast('Connection error', 4000);
  });
}

// ----- Message handlers -----
function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      me = { id: msg.yourId, username: msg.username, isHost: msg.isHost };
      characters = msg.characters;
      populateCharSelect();
      showLobby();
      break;
    case 'lobby':
      lastLobby = msg;
      if (msg.phase === 'lobby') {
        showLobby();
        renderLobby();
      }
      break;
    case 'state':
      lastState = msg;
      if (msg.phase === 'in_progress' || msg.phase === 'completed') {
        showGame();
        renderGame();
      }
      if (msg.terminal) renderEndBanner(msg.terminal);
      break;
    case 'error':
      toast(msg.message, 5000);
      break;
  }
}

// ----- Lobby rendering -----
function populateCharSelect() {
  const sel = $('charSelect');
  sel.innerHTML = '<option value="">— pick a character —</option>';
  for (const c of characters) {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = `${c.name} — ${c.passive?.name || ''}`;
    sel.appendChild(opt);
  }
}

$('charSelect').addEventListener('change', (e) => {
  socket.send(JSON.stringify({ type: 'select_character', characterKey: e.target.value || null }));
});

$('addBotBtn').addEventListener('click', () => {
  socket.send(JSON.stringify({ type: 'add_bot' }));
});

$('startBtn').addEventListener('click', () => {
  socket.send(JSON.stringify({ type: 'start_game' }));
});

function renderLobby() {
  if (!lastLobby) return;
  const seatList = $('seatList');
  seatList.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const s = lastLobby.seats[i];
    const div = document.createElement('div');
    if (!s) {
      div.className = 'seat empty';
      div.textContent = `Seat ${i + 1} — open`;
    } else {
      div.className = 'seat' + (s.isBot ? ' bot' : '');
      const youHere = !s.isBot && s.username === me.username;
      div.innerHTML = `
        <div class="name">${escape(s.username)}
          ${s.isBot ? '<span class="badge bot">BOT</span>' : ''}
          ${youHere ? '<span class="badge you">YOU</span>' : ''}
          ${!s.isBot && !s.connected ? '<span class="badge disc">offline</span>' : ''}
        </div>
        <div class="char">${s.characterKey ? charLabel(s.characterKey) : '<em>no character yet</em>'}</div>
        ${me.isHost && s.isBot ? `<button class="ghost" style="margin-top:8px;font-size:12px;padding:4px 8px;" onclick="window.__removeBot(${i})">Remove bot</button>` : ''}
      `;
    }
    seatList.appendChild(div);
  }
  // Host badge on toolbar
  $('startBtn').disabled = !me.isHost;
  $('addBotBtn').disabled = !me.isHost;
}

window.__removeBot = (seatIndex) => {
  socket.send(JSON.stringify({ type: 'remove_bot', seatIndex }));
};

function charLabel(key) {
  const c = characters.find(c => c.key === key);
  return c ? `${escape(c.name)}` : escape(key);
}

// ----- Game rendering -----
function renderGame() {
  if (!lastState?.state) return;
  const s = lastState.state;
  const seats = lastState.seats || [];

  // Turn banner.
  const cur = s.currentPlayerIndex;
  const curSeat = seats[cur];
  const yourTurn = curSeat && !curSeat.isBot && curSeat.username === me.username && lastState.phase === 'in_progress';
  const banner = $('turnBanner');
  banner.className = 'turn-banner' + (yourTurn ? ' yours' : '');
  banner.textContent = lastState.phase === 'completed'
    ? 'Game over'
    : yourTurn
      ? `Your turn — Round ${s.round}`
      : `Round ${s.round} — waiting for ${curSeat?.username || 'player ' + (cur + 1)}${curSeat?.isBot ? ' (bot)' : ''}`;

  // Players panel.
  const playersEl = $('players');
  playersEl.innerHTML = '';
  s.players.forEach((p, i) => {
    const seat = seats[i];
    const row = document.createElement('div');
    row.className = 'player-row' + (i === cur ? ' active' : '');
    row.innerHTML = `
      <div>
        <strong>${escape(seat?.username || 'P' + p.playerNum)}</strong>
        <span class="badge">${escape(p.character.name)}</span>
        ${seat?.isBot ? '<span class="badge bot">BOT</span>' : ''}
      </div>
      <div class="stats">
        S${p.character.stats.strength} T${p.character.stats.technique}
        F${p.character.stats.focus} X${p.character.stats.flexibility}
        | End ${p.endurance}/${p.maxEndurance}
        | XP ${p.xp}
        | Time ${p.timeRemaining}
        | Lvl ${p.level}
        | Ms ${Object.keys(p.milestonesCompleted || {}).length}/3
      </div>`;
    playersEl.appendChild(row);
  });

  // Milestones panel.
  const msEl = $('milestones');
  msEl.innerHTML = '';
  const tierClass = { beginner: 'ms-beg', intermediate: 'ms-int', expert: 'ms-exp' };
  for (const tier of ['beginner', 'intermediate', 'expert']) {
    const m = s.milestoneRoutes[tier];
    if (!m) continue;
    const row = document.createElement('div');
    row.className = 'player-row';
    const winners = s.players.filter(p => p.milestonesCompleted?.[tier]).map(p => 'P' + p.playerNum).join(', ');
    row.innerHTML = `
      <div>
        <span class="milestone-tag ${tierClass[tier]}">${tier}</span>
        <strong>${escape(m.route.name)}</strong>
        <span class="stats">(${m.area} V${m.route.vGrade ?? m.route.grade ?? '?'})</span>
      </div>
      <div class="stats">${winners ? 'done: ' + winners : 'open'}</div>`;
    msEl.appendChild(row);
  }

  // Actions panel.
  const actionPanel = $('actionPanel');
  const actionList = $('actionList');
  actionList.innerHTML = '';
  if (yourTurn && lastState.legalActions?.length) {
    actionPanel.classList.remove('hidden');
    lastState.legalActions.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.className = 'action';
      btn.innerHTML = `<div class="kind">${escape(a.type)}</div><div class="detail">${describeAction(a)}</div>`;
      btn.addEventListener('click', () => sendAction(i));
      actionList.appendChild(btn);
    });
  } else {
    actionPanel.classList.add('hidden');
  }

  // Event log delta.
  appendEventLog(s.events || []);
}

function sendAction(actionIndex) {
  socket.send(JSON.stringify({ type: 'action', actionIndex }));
}

function describeAction(a) {
  switch (a.type) {
    case 'climb':       return `Climb ${escape(a.routeName)} (${a.area} V${a.vGrade ?? a.grade ?? '?'})`;
    case 'milestone':   return `Attempt MILESTONE — ${escape(a.routeName)} (${a.difficulty})`;
    case 'train':       return `Train ${escape(a.stat)} at ${escape(a.area)}`;
    case 'rest':        return `Rest (+endurance)`;
    case 'buy_gear':    return `Buy ${escape(a.itemName)} (${a.cost} XP)`;
    case 'end_turn':    return `End turn`;
    default:            return escape(JSON.stringify(a));
  }
}

function appendEventLog(events) {
  const logEl = $('eventLog');
  for (const ev of events) {
    if (typeof ev.seq === 'number' && ev.seq <= lastSeenEvent) continue;
    if (typeof ev.seq === 'number') lastSeenEvent = ev.seq;
    const line = formatEvent(ev);
    if (!line) continue;
    const node = document.createElement('div');
    node.textContent = line;
    logEl.appendChild(node);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function formatEvent(ev) {
  if (!ev.type) return null;
  const p = ev.payload || {};
  switch (ev.type) {
    case 'game_start':       return `[start] seed=${p.seed} chars=${(p.players||[]).map(pl=>pl.characterKey).join(',')}`;
    case 'turn_start':       return `[turn] P${p.playerNum} round ${p.round}`;
    case 'climb_attempt':    return `[climb] P${p.playerNum} ${p.routeName} → ${p.outcome} (XP ${p.xpEarned ?? 0})`;
    case 'milestone_attempt':return `[milestone] P${p.playerNum} ${p.routeName} → ${p.outcome}`;
    case 'train':            return `[train] P${p.playerNum} ${p.stat} +${p.bonus} at ${p.area}`;
    case 'rest':             return `[rest] P${p.playerNum} +${p.enduranceGained} endurance`;
    case 'buy_gear':         return `[gear] P${p.playerNum} bought ${p.itemName} (${p.cost} XP)`;
    case 'end_turn':         return `[end] P${p.playerNum}`;
    case 'game_end':         return `[game over] winner=P${p.winner ?? '—'} reason=${p.reason}`;
    default:                 return null;
  }
}

function renderEndBanner(term) {
  const seats = lastState.seats || [];
  const winnerSeat = term.winner ? seats[term.winner - 1] : null;
  const el = $('endBanner');
  el.classList.remove('hidden');
  el.innerHTML = `
    <h2>${term.winner ? `${escape(winnerSeat?.username || 'Player ' + term.winner)} wins` : 'Draw / no winner'}</h2>
    <div>Reason: ${escape(term.reason)} • Rounds: ${lastState.state.round}</div>
    <div style="margin-top: 8px; font-size: 13px; opacity: 0.85;">Logs have been sent.</div>
  `;
}

// ----- Util -----
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
