// Online play (index.html?online=1) against the real PartyKit GameRoom.
//
// The page's WebSocket is routed to an in-process GameRoom (party/game.js) —
// the same server code PartyKit deploys — so the test covers the online
// client, the lobby, the server's engine and the bots without a network.

import { test, expect } from '@playwright/test';
import { applyAction } from '../../engine/engine.js';
import { createGame } from '../../engine/state.js';
import {
  collectPageErrors, seedPageRandom, uiStep, asJson, cardAction, nearlyFinishedGame, expectSummaryShows,
} from './support.js';

process.env.BOT_MOVE_DELAY_MS = '0';
const { default: GameRoom } = await import('../../party/game.js');

// Start a GameRoom and route the page's PartySocket connection to it.
async function connectToRoom(page, roomId) {
  const conns = new Set();
  const room = new GameRoom({
    id: roomId,
    env: {},
    broadcast: (msg) => { for (const c of conns) c.send(msg); },
    storage: { put: async () => {} },
  });
  let n = 0;
  await page.routeWebSocket(new RegExp(`/parties/main/${roomId}`), (ws) => {
    const conn = { id: `conn-${n++}`, send: (m) => ws.send(m), close: () => ws.close() };
    conns.add(conn);
    room.onConnect(conn, { request: { url: ws.url().replace(/^ws/, 'http') } });
    ws.onMessage((m) => room.onMessage(String(m), conn));
    ws.onClose(() => { conns.delete(conn); room.onClose(conn); });
  });
  return room;
}

test('online client plays a game against the GameRoom and bots', async ({ page }) => {
  const errors = collectPageErrors(page);
  page.on('dialog', d => d.accept());
  await seedPageRandom(page, 77);
  const room = await connectToRoom(page, 'e2e-room');

  await page.goto('/index.html?online=1&host=localhost:1999&room=e2e-room&user=alice&password=pw');
  await expect(page.locator('#onlineLobby')).toContainText('Pick your character');
  await page.locator('.ol-char-card', { hasText: 'The Iron Lung' }).click();
  // Easy CPUs (the heuristic bot) keep the run fast; Hard runs rollout search.
  await page.selectOption('.ol-bot-difficulty', 'easy');
  await page.locator('button', { hasText: 'Add Bot' }).click();
  await page.selectOption('.ol-bot-difficulty', 'easy');
  await page.locator('button', { hasText: 'Add Bot' }).click();
  await page.locator('#ol-controls button', { hasText: 'Start Game' }).click();
  await expect(page.locator('#gameBoard')).toBeVisible();

  // Play the human seat (seat 0) through the UI; the server plays the bots.
  let humanActions = 0;
  for (let i = 0; i < 400 && room.phase === 'in_progress' && humanActions < 60; i++) {
    if (room.state.currentPlayerIndex !== 0 || room.botRunning) { await page.waitForTimeout(10); continue; }
    const before = room.state.events.length;
    const did = await page.evaluate(uiStep);
    if (did.startsWith('click')) {
      // Wait for the server to apply it (or refuse it) and the client to render.
      await expect.poll(() => room.state.events.length, { timeout: 2000 }).toBeGreaterThanOrEqual(before);
      if (room.state.events.length > before) humanActions++;
    }
    await page.waitForTimeout(10);
  }
  expect(humanActions, 'the human seat should play many actions').toBeGreaterThan(20);

  // The client renders exactly the server's engine state.
  await expect.poll(async () => JSON.stringify(await page.evaluate(() => getGameState())), { timeout: 5000 })
    .toBe(JSON.stringify(asJson(room.state)));

  // And the server's game replays from its seed through the engine.
  const keys = room.state.players.map(p => p.character.key);
  let { state } = createGame({ seed: room.state.seed, characterKeys: keys });
  for (const e of room.state.events.filter(ev => ev.type === 'action_chosen')) ({ state } = applyAction(state, e.payload.action));
  expect(asJson(state)).toEqual(asJson(room.state));
  expect(errors).toEqual([]);
});

test('winning an online game opens the same post-game summary as local play', async ({ page }) => {
  const errors = collectPageErrors(page);
  page.on('dialog', d => d.accept());
  await seedPageRandom(page, 78);
  const room = await connectToRoom(page, 'e2e-summary');

  await page.goto('/index.html?online=1&host=localhost:1999&room=e2e-summary&user=alice&password=pw');
  await expect(page.locator('#onlineLobby')).toContainText('Pick your character');
  await page.locator('.ol-char-card', { hasText: 'The Iron Lung' }).click();
  for (let i = 0; i < 2; i++) {
    await page.selectOption('.ol-bot-difficulty', 'easy');
    await page.locator('button', { hasText: 'Add Bot' }).click();
  }
  await page.locator('#ol-controls button', { hasText: 'Start Game' }).click();
  await expect(page.locator('#gameBoard')).toBeVisible();
  await expect.poll(() => room.state.currentPlayerIndex === 0 && !room.botRunning).toBe(true);

  // Put the room one milestone send from alice (seat 1) winning a real CPU game.
  const characterKeys = room.state.players.map(p => p.character.key);
  const { before, last, final } = await nearlyFinishedGame({ seed: 1, characterKeys, winner: 1 });
  room.state = before;
  room.broadcastState();
  await expect.poll(async () => JSON.stringify(await page.evaluate(() => getGameState())))
    .toBe(JSON.stringify(asJson(before)));

  await cardAction(page, '#milestonePanel', before.milestoneRoutes[last.difficulty].route.name).click();
  await expect.poll(() => room.phase).toBe('completed');
  expect(asJson(room.state)).toEqual(asJson(final));

  const names = Object.fromEntries(room.seats.filter(Boolean).map((seat, i) => [i + 1, seat.username]));
  await expectSummaryShows(page, room.state, names);
  const summary = page.locator('#victoryModal [data-testid="game-summary"]');
  await expect(summary.locator('.final-standings li[data-player="1"]')).toContainText('alice (you)');
  await expect(summary.getByRole('link', { name: 'New online game ▸' })).toHaveAttribute('href', 'online.html');
  await summary.getByRole('button', { name: 'View the board' }).click();
  await expect(page.locator('#turnIndicator')).toContainText('Game over · alice wins');
  expect(errors).toEqual([]);
});
