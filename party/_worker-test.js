// Integration test for the deployed Worker: boots wrangler.jsonc in workerd
// (the Cloudflare runtime, locally, via wrangler's unstable_dev) and checks
// what the Node tests cannot — the routing, the Durable Object bindings, the
// static site and the GameRoom → telemetry call through getServerByName. One
// online game is played over a real WebSocket, the human seat by the planner
// bot. Not deployed.
//
//   node party/_worker-test.js   (npm run test:party)

import { unstable_dev } from 'wrangler';
import { createPlannerAgent } from '../sim/agents/planner.js';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '  ok ' : 'FAIL '} ${name}${pass || !detail ? '' : ` — ${detail}`}`);
}

const worker = await unstable_dev('party/server.js', {
  config: 'wrangler.jsonc',
  vars: { BOT_MOVE_DELAY_MS: '0' },
  persist: false,
  logLevel: 'warn',
  experimental: { disableExperimentalWarning: true },
});

try {
  const status = async (path) => (await worker.fetch(path)).status;

  // The static site (party/build-site.js → .site/) and nothing else.
  check('serves the game page', await status('/') === 200);
  check('serves the engine bundle', await status('/engine/engine.browser.js') === 200);
  check('serves the vendored PartySocket', await status('/online/vendor/partysocket/index.js') === 200);
  check('does not serve server code, tests or config',
    (await Promise.all(['/party/game.js', '/engine/test-engine.js', '/package.json', '/wrangler.jsonc'].map(status))).every(s => s === 404));

  // Every party is routed at /parties/<binding>/<room>.
  check('telemetry party answers', (await (await worker.fetch('/parties/telemetry/global')).json()).count === 0);
  check('submissions party answers', (await (await worker.fetch('/parties/submissions/global')).json()).count === 0);

  // One online game against an Easy bot, over the WebSocket PartySocket uses.
  const room = `worker-test-${Date.now()}`;
  const human = createPlannerAgent({ seed: 5 });
  const ws = new WebSocket(`ws://${worker.address}:${worker.port}/parties/main/${room}?username=alice&password=pw&_pk=conn-1`);
  let welcome = null;
  let started = false;
  const final = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('game did not finish in time')), 180_000);
    ws.addEventListener('error', () => reject(new Error('WebSocket error')));
    ws.addEventListener('message', async (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'error') reject(new Error(msg.message));
      if (msg.type === 'welcome') {
        welcome = msg;
        ws.send(JSON.stringify({ type: 'select_character', characterKey: 'routeReader' }));
        ws.send(JSON.stringify({ type: 'add_bot', difficulty: 'easy' }));
      }
      if (msg.type === 'lobby' && !started && msg.seats.filter(Boolean).length === 2 && msg.seats.every(s => !s || s.characterKey)) {
        started = true;
        ws.send(JSON.stringify({ type: 'start_game' }));
      }
      if (msg.type !== 'state') return;
      if (msg.terminal) { clearTimeout(timer); resolve(msg); return; }
      if (msg.state.currentPlayerIndex === 0 && msg.legalActions.length) {
        const { actionIndex } = await human.chooseAction({ state: msg.state, legalActions: msg.legalActions });
        ws.send(JSON.stringify({ type: 'action', actionIndex }));
      }
    });
  });
  ws.close();
  check('first connection is the host, with its PartySocket id', welcome?.isHost === true && welcome.yourId === 'conn-1');
  check('the online game finishes', final.phase === 'completed' && !!final.terminal.reason);

  // The finished game is stored in the room and recorded by the telemetry room.
  let count = 0;
  for (let i = 0; i < 50 && count === 0; i++) {
    count = (await (await worker.fetch('/parties/telemetry/global')).json()).count;
    if (!count) await new Promise(r => setTimeout(r, 100));
  }
  check('GameRoom records the match in the telemetry room', count === 1, `count ${count}`);
  const logs = await (await worker.fetch(`/parties/main/${room}?logs=1`)).json();
  check('GameRoom keeps the game log in its storage', logs.length === 1);
} finally {
  await worker.stop();
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
