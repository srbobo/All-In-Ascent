// Headless smoke test for the PartyKit GameRoom — drives a bot-vs-bot game
// through the same message handlers a real client would call. Not part of
// the deploy bundle (excluded via `_*.js` in partykit.json).

import GameRoom from './game.js';

const messages = [];
const fakeRoom = {
  id: 'smoke',
  env: {},
  broadcast: (msg) => messages.push(JSON.parse(msg)),
  storage: { put: async () => {} },
};

const room = new GameRoom(fakeRoom);

// Two fake connections — first one becomes host.
const conns = [];
function makeConn(id) {
  const c = {
    id,
    sent: [],
    send(msg) { this.sent.push(JSON.parse(msg)); },
    close() { this.closed = true; },
  };
  conns.push(c);
  return c;
}

const host = makeConn('host');
room.onConnect(host, { request: { url: 'ws://x/party?username=alice&password=open' } });

const friend = makeConn('friend');
room.onConnect(friend, { request: { url: 'ws://x/party?username=bob&password=open' } });

// Pick characters.
await room.onMessage(JSON.stringify({ type: 'select_character', characterKey: 'technician' }), host);
await room.onMessage(JSON.stringify({ type: 'select_character', characterKey: 'sprinter' }), friend);

// Host adds two bots and starts.
await room.onMessage(JSON.stringify({ type: 'add_bot' }), host);
await room.onMessage(JSON.stringify({ type: 'add_bot' }), host);
await room.onMessage(JSON.stringify({ type: 'start_game' }), host);

// Wait for any pending bot-vs-bot turns. Two human seats means we'll stop
// when seat 0 or seat 1 must act. We force the bot loop forward by
// "playing" the heuristic action ourselves for the human seats too —
// otherwise the test would hang waiting for a real WebSocket message.
import { getLegalActions, isTerminal } from '../engine/engine.js';
import { createHeuristicAgent } from '../sim/agents/heuristic.js';

const humanAgent = createHeuristicAgent();
let safety = 0;
while (room.phase === 'in_progress' && safety++ < 2000) {
  // If a bot is mid-turn the engine is fine; just yield.
  if (room.botRunning) { await new Promise(r => setTimeout(r, 50)); continue; }
  const seat = room.state.currentPlayerIndex;
  if (room.botAgents[seat]) {
    // The bot loop ended because no humans were waited on this iteration.
    // Kick it again.
    await room.maybePlayBot();
    continue;
  }
  // Human seat: simulate an action message.
  const legal = getLegalActions(room.state);
  const { actionIndex } = await humanAgent.chooseAction({ state: room.state, legalActions: legal });
  const fakeConn = seat === 0 ? host : friend;
  await room.onMessage(JSON.stringify({ type: 'action', actionIndex }), fakeConn);
}

console.log('state is null?', room.state === null, 'phase:', room.phase, 'safety:', safety);
const term = room.state ? isTerminal(room.state) : { done: false };
console.log('phase:', room.phase);
console.log('rounds:', room.state.round);
console.log('winner:', term.winner, 'reason:', term.reason);
console.log('events captured:', room.events.length);
console.log('final broadcasts:', messages.length);
if (room.phase !== 'completed') {
  console.error('FAIL: game did not complete');
  process.exit(1);
}
console.log('OK: end-to-end GameRoom drive completed.');
