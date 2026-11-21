// CPU climbers in local play (index.html): the setup screen adds CPU seats
// from the engine's CPU ladder (AscentEngine.CPU_LEVELS), the CPUs play their
// own turns through the engine's CPU (AscentEngine.createCpuAgent — the same
// bot online play uses), and the finished game still replays identically
// through the Node engine and records a replay for the learning CPU.

import { test, expect } from '@playwright/test';
import { CPU_LEVELS, CPU_MODEL } from '../../engine/cpu.js';
import { buildMatchRecord } from '../../engine/match-record.js';
import { buildReplayRecord, replayRecordState } from '../../engine/replay-record.js';
import {
  seedPageRandom, collectPageErrors, collectDialogs, fastEffects, cardAction, uiStep, replayInEngine, asJson,
} from './support.js';

const TELEMETRY = '/parties/telemetry/global';

// The CPU's pause before each move (ms). 0 makes CPU turns instant.
async function setCpuDelay(page, ms) {
  await page.addInitScript((d) => { window.AIA_CPU_DELAY_MS = d; }, ms);
}

// Through the setup screen: `humans` human climbers plus CPUs at `level`.
// The humans pick `humanNames`; the CPU seats are filled at random.
async function startGameWithCpus(page, { humanNames, cpus, level }) {
  await page.locator(`#playerCount input[value="${humanNames.length}"]`).check({ force: true });
  await page.locator(`#cpuCount input[value="${cpus}"]`).check({ force: true });
  await page.selectOption('#cpuLevel', level);
  await page.click('#continueBtn');
  for (const name of humanNames) await cardAction(page, '#characterSelect', name).click();
  const firstCpu = humanNames.length + 1;
  await expect(page.locator('#pickStatus')).toContainText(`Choose a climber for CPU ${firstCpu} (${CPU_LEVELS[level].label})`);
  await page.click('#cpuRandomBtn');
  await expect(page.locator('#pickStatus')).toContainText('Everyone is roped in');
  await page.click('#startGameBtn');
  await fastEffects(page);
}

test('the setup screen offers the engine\'s CPU levels and never more than four climbers', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/index.html');
  const options = await page.locator('#cpuLevel option').evaluateAll(os => os.map(o => [o.value, o.textContent]));
  expect(options).toEqual(Object.entries(CPU_LEVELS).map(([k, v]) => [k, v.label]));
  await expect(page.locator('#cpuLevel')).toHaveValue('medium');
  // No CPUs: the difficulty does not apply.
  await expect(page.locator('#cpuLevel')).toBeDisabled();
  await page.locator('#cpuCount input[value="3"]').check({ force: true });
  await expect(page.locator('#cpuLevel')).toBeEnabled();
  // 3 humans leave room for one CPU: the 3-CPU choice drops to 1.
  await page.locator('#playerCount input[value="3"]').check({ force: true });
  await expect(page.locator('#cpuCount input[value="1"]')).toBeChecked();
  await expect(page.locator('#cpuCount input[value="2"]')).toBeDisabled();
  await page.locator('#playerCount input[value="4"]').check({ force: true });
  await expect(page.locator('#cpuCount input[value="0"]')).toBeChecked();
  await expect(page.locator('#cpuCount input[value="1"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('during a CPU turn the board is locked and says who is climbing', async ({ page }) => {
  const errors = collectPageErrors(page);
  const dialogs = collectDialogs(page);
  await seedPageRandom(page, 616);
  await setCpuDelay(page, 1500);
  await page.goto('/index.html');
  await startGameWithCpus(page, { humanNames: ['The Iron Lung'], cpus: 1, level: 'easy' });

  // Play the human's turn until the CPU is up.
  const indicator = page.locator('#turnIndicator');
  for (let i = 0; i < 200; i++) {
    if ((await indicator.textContent()).includes('CPU 2')) break;
    await page.evaluate(uiStep);
    await page.waitForTimeout(20);
  }
  await expect(indicator).toContainText("CPU 2 (Easy)'s turn");
  await expect(indicator).toContainText('thinking');
  await expect(page.locator('#player-2-panel .ps-cpu')).toHaveText('CPU · Easy');
  await expect(page.locator('#player-1-panel .ps-cpu')).toHaveCount(0);

  // Nothing is the human's to click, and every card says why.
  const before = await page.evaluate(() => getGameState().events.length);
  const enabled = await page.locator('.aia-card__action:not([aria-disabled="true"])').count();
  expect(enabled).toBe(0);
  await expect(page.locator('.info-rest-btn')).toBeDisabled();
  const route = page.locator('#boulderingRoutes .route-card').first();
  await expect(route).toContainText('CPU 2 (Easy) is on the wall');
  await route.locator('.aia-card__action').dispatchEvent('click');
  await page.evaluate(() => restAction());
  expect(await page.evaluate(() => getGameState().events.length)).toBe(before);

  // The CPU then plays its turn by itself and hands the wall back.
  await page.evaluate(() => { window.AIA_CPU_DELAY_MS = 0; });
  await expect(indicator).toContainText("Player 1's turn", { timeout: 30_000 });
  const cpuMoves = await page.evaluate(() => getGameState().events
    .filter(e => e.type === 'action_chosen' && e.payload.playerNum === 2).length);
  expect(cpuMoves).toBeGreaterThan(0);
  const browserState = await page.evaluate(() => getGameState());
  expect(asJson(replayInEngine(browserState))).toEqual(browserState);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test('a local game against CPU climbers plays to the end, replays through the engine, and is recorded', async ({ page, request }) => {
  const errors = collectPageErrors(page);
  const dialogs = collectDialogs(page);
  await seedPageRandom(page, 515);
  await setCpuDelay(page, 0);
  const posts = [];
  page.on('response', r => {
    if (r.url().includes(TELEMETRY) && r.request().method() === 'POST') posts.push(r);
  });
  await page.goto('/index.html');
  await startGameWithCpus(page, { humanNames: ['The Technician'], cpus: 2, level: 'hard' });
  expect(await page.evaluate(() => getLocalSeats())).toEqual([
    { controller: 'human' }, { controller: 'bot', botLevel: 'hard' }, { controller: 'bot', botLevel: 'hard' },
  ]);

  // The human plays at random; on CPU turns there is nothing to click and
  // the CPUs move by themselves.
  let ended = false;
  for (let i = 0; i < 6000 && !ended; i++) {
    const did = await page.evaluate(uiStep);
    ended = did === 'victory' || await page.evaluate(() => getGameState().gameEnded);
    await page.waitForTimeout(did === 'none' ? 25 : 5);
  }
  expect(ended, 'the game should finish').toBe(true);

  const browserState = await page.evaluate(() => getGameState());
  const movesBy = (n) => browserState.events.filter(e => e.type === 'action_chosen' && e.payload.playerNum === n).length;
  expect(movesBy(2)).toBeGreaterThan(20);
  expect(movesBy(3)).toBeGreaterThan(20);
  expect(asJson(replayInEngine(browserState))).toEqual(browserState);

  // The post-game summary names the CPU seats.
  const summary = page.locator('#victoryModal [data-testid="game-summary"]');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.final-standings')).toContainText('CPU 2 (Hard)');
  await expect(summary.locator('.final-standings')).toContainText('CPU 3 (Hard)');
  await expect(summary.locator('.final-standings')).toContainText('Player 1');

  // The match record and the replay record share one id and say who played.
  await expect.poll(() => posts.length).toBe(2);
  const ids = await Promise.all(posts.map(async r => (await r.json()).id));
  expect(ids[0]).toBe(ids[1]);
  const id = ids[0];
  const seats = [
    { controller: 'human' },
    { controller: 'bot', botLevel: 'hard', botModel: CPU_MODEL },
    { controller: 'bot', botLevel: 'hard', botModel: CPU_MODEL },
  ];
  const { records } = await (await request.get(`${TELEMETRY}?records=1`)).json();
  const { receivedAt: matchReceived, ...match } = records.find(r => r.id === id);
  expect(typeof matchReceived).toBe('number');
  expect(match).toEqual(asJson(buildMatchRecord(browserState, {
    id, mode: 'local', startedAt: match.startedAt, finishedAt: match.finishedAt, seats,
  })));
  const replays = (await (await request.get(`${TELEMETRY}?kind=replay&records=1`)).json()).records;
  const { receivedAt: replayReceived, ...replay } = replays.find(r => r.id === id);
  expect(typeof replayReceived).toBe('number');
  expect(replay).toEqual(asJson(buildReplayRecord(browserState, {
    id, mode: 'local', startedAt: replay.startedAt, finishedAt: replay.finishedAt, seats,
  })));
  expect(asJson(replayRecordState(replay))).toEqual(browserState);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});
