// online-mode.js — turns index.html into a PartyKit online client when the
// URL contains ?online=1. The same renderers, the same UI — just driven by
// server state instead of local mutations.
//
// Loading order: include this script BEFORE game.js so the OnlineMode global
// exists when game.js's action functions guard against it. The init then
// runs on DOMContentLoaded so the local setup form (#gameSetup, #gameBoard)
// are in the DOM and can be hidden / repurposed.
//
// Architecture:
//   - Connects via the vendored partysocket (same lib online.html uses).
//   - On 'welcome' captures host status + character list.
//   - On 'lobby' renders the room lobby (seats, character pick, host
//     controls).
//   - On 'state' (phase = in_progress | completed) adapts the server state
//     into the shape game.js's renderGameBoard() expects, sets it as
//     window.gameState, and calls renderGameBoard().
//   - User clicks (Climb, Train, Rest, Milestone, Buy Gear) — the original
//     action functions in game.js short-circuit to OnlineMode.sendAction,
//     which finds the matching entry in `legalActions` and sends its index
//     to the server.
//   - Server processes, broadcasts new state, the cycle repeats.

(function () {
  const params = new URLSearchParams(window.location.search);
  const isOnline = params.get('online') === '1';

  const OnlineMode = (window.OnlineMode = {
    active: false,
    socket: null,
    serverState: null,
    legalActions: [],
    seats: [],
    me: { id: null, username: null, isHost: false },
    characters: [],
    phase: 'init',
    selectedCharacterKey: null,
    sendAction: null, // populated below
  });

  if (!isOnline) return;

  const host = params.get('host');
  const room = params.get('room');
  const username = params.get('user');
  const password = params.get('password') || '';

  if (!host || !room || !username) {
    window.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML =
        '<div style="padding:48px;font-family:sans-serif;max-width:560px;margin:60px auto;">' +
        '<h2 style="font-family:Bricolage Grotesque,sans-serif;">Missing online params</h2>' +
        '<p>This page expected ?online=1 with host, room, and user. ' +
        'Visit <a href="online.html">online.html</a> to start a session.</p></div>';
    });
    return;
  }

  OnlineMode.active = true;
  window.addEventListener('DOMContentLoaded', () => bootstrap({ host, room, username, password }));

  // -------------------------------------------------------------------------
  // Bootstrap — hide local setup, show a placeholder, open the socket.
  // -------------------------------------------------------------------------
  async function bootstrap({ host, room, username, password }) {
    const setup = document.getElementById('gameSetup');
    if (setup) setup.style.display = 'none';
    ensureLobbyContainer();
    setLobbyMessage('Connecting…');

    let PartySocket;
    try {
      const mod = await import('./online/vendor/partysocket/index.js');
      PartySocket = mod.default || mod.PartySocket;
    } catch (e) {
      setLobbyMessage('Failed to load network library: ' + (e?.message || e));
      return;
    }

    const ws = new PartySocket({
      host,
      room,
      query: { username, password },
    });
    OnlineMode.socket = ws;

    ws.addEventListener('open', () => setLobbyMessage('Connected. Awaiting lobby…'));
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleMessage(msg);
    });
    ws.addEventListener('close', () => toast('Disconnected — refresh to retry.', 8000));
    ws.addEventListener('error', () => toast('Connection error', 5000));
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------
  function handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        OnlineMode.me = { id: msg.yourId, username: msg.username, isHost: msg.isHost };
        OnlineMode.characters = msg.characters || [];
        break;

      case 'lobby':
        OnlineMode.phase = msg.phase;
        OnlineMode.seats = msg.seats || [];
        if (msg.phase === 'lobby') {
          ensureLobbyContainer();
          renderLobby();
        }
        break;

      case 'state':
        OnlineMode.phase = msg.phase;
        OnlineMode.seats = msg.seats || [];
        OnlineMode.legalActions = msg.legalActions || [];
        OnlineMode.serverState = msg.state;
        if (msg.phase === 'in_progress' || msg.phase === 'completed') {
          enterGameMode(msg.state, msg.terminal);
        }
        break;

      case 'error':
        toast(msg.message || 'Server error', 6000);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Lobby UI — server-driven seat list + character pick + host controls
  // -------------------------------------------------------------------------
  function ensureLobbyContainer() {
    if (document.getElementById('onlineLobby')) return;
    const setup = document.getElementById('gameSetup');
    const board = document.getElementById('gameBoard');
    const lobby = document.createElement('div');
    lobby.id = 'onlineLobby';
    lobby.className = 'online-lobby';
    lobby.innerHTML = `
      <div class="ol-room">
        <div class="ol-room-label">Room</div>
        <div class="ol-room-name" id="ol-room-name">${escapeHtml(room)}</div>
        <div class="ol-you-tag">
          You: <strong>${escapeHtml(username)}</strong>
          <span class="ol-role" id="ol-role"></span>
        </div>
      </div>
      <div class="ol-message" id="ol-message">Connecting…</div>
      <div class="ol-seats" id="ol-seats"></div>
      <div class="ol-character-pick" id="ol-character-pick"></div>
      <div class="ol-controls" id="ol-controls"></div>
    `;
    if (setup && setup.parentNode) setup.parentNode.insertBefore(lobby, setup);
    else if (board && board.parentNode) board.parentNode.insertBefore(lobby, board);
    else document.body.appendChild(lobby);
  }

  function setLobbyMessage(text) {
    const m = document.getElementById('ol-message');
    if (m) m.textContent = text;
  }

  function renderLobby() {
    // Make sure the local game board is hidden.
    const board = document.getElementById('gameBoard');
    if (board) board.style.display = 'none';
    document.body.classList.remove('playing');

    setLobbyMessage(OnlineMode.me.isHost
      ? 'Waiting for everyone to choose a character. You can add bots or start when ready.'
      : 'Waiting for the host to start the game.');

    const roleEl = document.getElementById('ol-role');
    if (roleEl) roleEl.textContent = OnlineMode.me.isHost ? '· Host' : '';

    // Seats list
    const seatHost = document.getElementById('ol-seats');
    seatHost.innerHTML = '';
    OnlineMode.seats.forEach((seat, idx) => {
      const div = document.createElement('div');
      div.className = 'ol-seat';
      if (!seat) {
        div.classList.add('empty');
        div.innerHTML = `<span class="ol-seat-num">Seat ${idx + 1}</span><span class="ol-seat-name">— open —</span>`;
      } else {
        const me = !seat.isBot && seat.username === OnlineMode.me.username;
        div.classList.toggle('me', me);
        div.classList.toggle('bot', !!seat.isBot);
        const charName = seat.characterKey
          ? (OnlineMode.characters.find(c => c.key === seat.characterKey)?.name || seat.characterKey)
          : '— no character —';
        const tags = [
          seat.isBot ? '<span class="ol-tag bot">BOT</span>' : '',
          me ? '<span class="ol-tag you">YOU</span>' : '',
          !seat.isBot && !seat.connected ? '<span class="ol-tag off">offline</span>' : '',
        ].join('');
        div.innerHTML = `
          <span class="ol-seat-num">Seat ${idx + 1}</span>
          <span class="ol-seat-name">${escapeHtml(seat.username)} ${tags}</span>
          <span class="ol-seat-char">${escapeHtml(charName)}</span>
        `;
        if (OnlineMode.me.isHost && seat.isBot) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'ol-remove-bot';
          removeBtn.textContent = 'Remove';
          removeBtn.onclick = () => send({ type: 'remove_bot', seatIndex: idx });
          div.appendChild(removeBtn);
        }
      }
      seatHost.appendChild(div);
    });

    // Character picker — show only my pickable choices, mark taken.
    const charHost = document.getElementById('ol-character-pick');
    charHost.innerHTML = '<h3>Pick your character</h3>';
    const taken = new Set(OnlineMode.seats.filter(s => s?.characterKey).map(s => s.characterKey));
    const mySeat = OnlineMode.seats.find(s => s && !s.isBot && s.username === OnlineMode.me.username);
    const myCurrent = mySeat?.characterKey;
    const grid = document.createElement('div');
    grid.className = 'ol-char-grid';
    OnlineMode.characters.forEach(c => {
      const isMine = c.key === myCurrent;
      const takenByOther = taken.has(c.key) && !isMine;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ol-char-card';
      if (isMine) card.classList.add('mine');
      if (takenByOther) card.classList.add('taken');
      card.disabled = takenByOther;
      card.innerHTML = `
        <div class="ol-char-name">${escapeHtml(c.name)}</div>
        <div class="ol-char-passive">${escapeHtml(c.passive?.name || '')}</div>
        ${isMine ? '<div class="ol-char-tag">Your pick</div>' : ''}
        ${takenByOther ? '<div class="ol-char-tag taken">Taken</div>' : ''}
      `;
      card.onclick = () => send({ type: 'select_character', characterKey: isMine ? null : c.key });
      grid.appendChild(card);
    });
    charHost.appendChild(grid);

    // Host controls
    const ctlHost = document.getElementById('ol-controls');
    ctlHost.innerHTML = '';
    if (OnlineMode.me.isHost) {
      const filled = OnlineMode.seats.filter(s => s !== null).length;
      const allHaveChar = OnlineMode.seats.filter(s => s !== null).every(s => s.characterKey);
      const canStart = filled >= 2 && allHaveChar;
      const addBot = document.createElement('button');
      addBot.type = 'button';
      addBot.className = 'ol-btn ol-btn-secondary';
      addBot.textContent = 'Add Bot';
      addBot.onclick = () => send({ type: 'add_bot' });
      ctlHost.appendChild(addBot);
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'ol-btn ol-btn-primary';
      startBtn.textContent = 'Start Game';
      startBtn.disabled = !canStart;
      if (!canStart) {
        startBtn.title = filled < 2 ? 'Need at least 2 seats filled' : 'Every seat needs a character';
      }
      startBtn.onclick = () => send({ type: 'start_game' });
      ctlHost.appendChild(startBtn);
    }
  }

  // -------------------------------------------------------------------------
  // Game mode — server state -> local renderer
  // -------------------------------------------------------------------------
  function enterGameMode(serverState, terminal) {
    if (!serverState) return;

    // Hide the lobby UI.
    const lobby = document.getElementById('onlineLobby');
    if (lobby) lobby.style.display = 'none';

    // Show the game board chrome.
    const setup = document.getElementById('gameSetup');
    if (setup) setup.style.display = 'none';
    const board = document.getElementById('gameBoard');
    if (board) board.style.display = 'block';
    document.body.classList.add('playing');

    // Adapt server state → local-renderer shape, then push it into game.js
    // via the exposed setter (gameState is declared with `let` inside game.js
    // and is NOT a window property, so direct `window.gameState = ...` would
    // silently no-op for the renderer).
    const adapted = adaptState(serverState);
    if (typeof window.setGameState === 'function') {
      window.setGameState(adapted);
    } else {
      console.error('window.setGameState not available — game.js may not have loaded yet');
      return;
    }
    try {
      if (typeof window.renderGameBoard === 'function') window.renderGameBoard();
      else if (typeof renderGameBoard === 'function') renderGameBoard();
    } catch (e) {
      console.error('renderGameBoard failed:', e);
    }

    if (terminal) {
      const winSeat = terminal.winner
        ? OnlineMode.seats[terminal.winner - 1]
        : null;
      const winName = winSeat?.username || (terminal.winner ? `Player ${terminal.winner}` : '—');
      toast(`Game over: ${winName} wins (${terminal.reason})`, 12000);
    }
  }

  function adaptState(s) {
    // Convert attemptedRoutes from { num: { key: true } } to { num: Set }
    const attemptedRoutes = {};
    for (const num of Object.keys(s.attemptedRoutes || {})) {
      attemptedRoutes[num] = new Set(Object.keys(s.attemptedRoutes[num] || {}));
    }
    // Everything else passes through. Add winner/end flags the local renderer
    // expects.
    return {
      ...s,
      attemptedRoutes,
      // pendingLevelUp is engine-driven; not a thing the local renderer touches.
    };
  }

  // -------------------------------------------------------------------------
  // Action dispatcher — called from game.js action functions in online mode.
  // -------------------------------------------------------------------------
  function sendAction(match) {
    if (!OnlineMode.active) return;
    if (!Array.isArray(OnlineMode.legalActions) || OnlineMode.legalActions.length === 0) {
      toast('No legal actions known yet — waiting on server state.', 4000);
      return;
    }
    const idx = OnlineMode.legalActions.findIndex(a => {
      if (a.type !== match.type) return false;
      // Every additional field on `match` must equal the same field on `a`.
      for (const [k, v] of Object.entries(match)) {
        if (k === 'type') continue;
        if (a[k] !== v) return false;
      }
      return true;
    });
    if (idx < 0) {
      const detail = JSON.stringify(match);
      toast(`Action not currently legal: ${detail}`, 4000);
      return;
    }
    send({ type: 'action', actionIndex: idx });
  }
  OnlineMode.sendAction = sendAction;

  function send(msg) {
    if (OnlineMode.socket && OnlineMode.socket.readyState === 1) {
      OnlineMode.socket.send(JSON.stringify(msg));
    }
  }

  // -------------------------------------------------------------------------
  // Toast notifications (uses the same #toast container if it exists,
  // otherwise builds its own).
  // -------------------------------------------------------------------------
  function toast(msg, ms = 4000) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'ol-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
})();
