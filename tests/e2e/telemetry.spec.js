// Telemetry: finished local games post their anonymous match record to the
// telemetry party, players can opt out, and the designer's dashboard
// (dashboard.html) shows the engine's report (engine/match-report.js).
//
// The e2e static server (tests/e2e/serve.js) hosts the real telemetry party
// in memory at /parties/telemetry/global, shared by every test in the run.

import { test, expect } from '@playwright/test';
import { buildMatchRecord } from '../../engine/match-record.js';
import { aggregateMatches } from '../../engine/match-report.js';
import { createGame } from '../../engine/state.js';
import { getLegalActions, applyAction } from '../../engine/engine.js';
import { GRIT_RULES } from '../../engine/helpers.js';
import { CHARACTERS, GEAR_SHOP } from '../../engine/data.js';
import { createPlannerAgent } from '../../sim/agents/planner.js';
import {
  collectPageErrors, collectDialogs, startLocalGame, nearlyFinishedGame, asJson, cardAction, replayInEngine,
} from './support.js';

const TELEMETRY = '/parties/telemetry/global';
const isTelemetryPost = (r) => r.url().includes(TELEMETRY) && r.method() === 'POST';

// Load a CPU game one milestone from the end and send it through the UI.
async function winLocalGame(page, seed, characters, characterKeys) {
  const { before, last, final } = await nearlyFinishedGame({ seed, characterKeys });
  await startLocalGame(page, characters);
  await page.evaluate((s) => { setGameState(s); renderGameBoard(); }, asJson(before));
  await cardAction(page, '#milestonePanel', before.milestoneRoutes[last.difficulty].route.name).click();
  await page.locator('#climbModal .action-buttons button').click();
  await expect(page.locator('#victoryModal [data-testid="game-summary"]')).toBeVisible();
  return final;
}

test('a finished local game posts the engine\'s match record', async ({ page, request }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  await page.goto('/index.html');
  await expect(page.locator('#telemetryOptIn')).toBeChecked();
  await expect(page.locator('footer.site-footer')).toContainText('recorded anonymously');

  const posted = page.waitForResponse(r => isTelemetryPost(r.request()));
  const final = await winLocalGame(page, 4, ['The Technician', 'The Iron Lung', 'The Sprinter'], ['technician', 'ironLung', 'sprinter']);
  const response = await posted;
  expect(response.status()).toBe(200);
  const { id } = await response.json();
  expect(id).toMatch(/^local-/);

  // The stored record is exactly what the Node engine builds for this game.
  const { records } = await (await request.get(`${TELEMETRY}?records=1`)).json();
  const stored = records.find(r => r.id === id);
  expect(stored).toBeTruthy();
  const { receivedAt, ...record } = stored;
  expect(typeof receivedAt).toBe('number');
  const browserState = await page.evaluate(() => getGameState());
  expect(asJson(replayInEngine(browserState))).toEqual(browserState);
  expect(record).toEqual(asJson(buildMatchRecord(final, {
    id, mode: 'local', startedAt: record.startedAt, finishedAt: record.finishedAt,
    seats: final.players.map(() => ({ controller: 'human' })),
  })));
  expect(record.startedAt).toBeLessThanOrEqual(record.finishedAt);
  expect(record.players.every(p => p.controller === 'human')).toBe(true);

  // Exactly one record per game: reopening the summary sends nothing more.
  let more = 0;
  page.on('request', r => { if (isTelemetryPost(r)) more++; });
  await page.locator('#victoryModal').getByRole('button', { name: 'View the board' }).click();
  await page.locator('#turnIndicator').getByRole('button', { name: 'Game summary ▸' }).click();
  await page.waitForTimeout(300);
  expect(more).toBe(0);
  expect(errors).toEqual([]);
});

test('a player who switches sharing off sends no record, and the choice sticks', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  let posts = 0;
  page.on('request', r => { if (isTelemetryPost(r)) posts++; });
  await page.goto('/index.html');
  await page.locator('#telemetryOptIn').uncheck();
  await page.reload();
  await expect(page.locator('#telemetryOptIn')).not.toBeChecked();

  await winLocalGame(page, 9, ['The Free Solo', 'The Route Reader'], ['freeSolo', 'routeReader']);
  await page.waitForTimeout(300);
  expect(posts).toBe(0);
  expect(await page.evaluate(() => window.AscentTelemetry.enabled())).toBe(false);
  expect(errors).toEqual([]);
});

// A handful of real planner games, 2–4 players, as match records.
async function sampleRecords(prefix, count) {
  const keys = Object.keys(CHARACTERS);
  const out = [];
  for (let g = 0; g < count; g++) {
    const n = 2 + (g % 3);
    const characterKeys = keys.slice(g % keys.length).concat(keys).slice(0, n);
    let { state } = createGame({ seed: 500 + g, characterKeys, rules: GRIT_RULES });
    const agents = characterKeys.map((_, i) => createPlannerAgent({ seed: g * 10 + i }));
    while (!state.gameEnded) {
      const legal = getLegalActions(state);
      const { actionIndex } = await agents[state.currentPlayerIndex].chooseAction({ state, legalActions: legal });
      ({ state } = applyAction(state, legal[actionIndex]));
    }
    const finishedAt = Date.now() - (count - g) * 3600e3;
    out.push(buildMatchRecord(state, {
      id: `${prefix}-${g}`, mode: g % 2 ? 'online' : 'sim', startedAt: finishedAt - 1800e3, finishedAt,
      seats: characterKeys.map((_, i) => (i === 0 && g % 2 ? { controller: 'human' } : { controller: 'bot', botLevel: 'planner' })),
    }));
  }
  return out;
}

test('the dashboard lays out the engine\'s report for a loaded file', async ({ page }) => {
  const errors = collectPageErrors(page);
  const records = await sampleRecords('e2e-file', 6);
  await page.goto('/dashboard.html');
  await page.locator('#fileInput').setInputFiles({
    name: 'sample.jsonl', mimeType: 'application/x-ndjson',
    buffer: Buffer.from(records.map(r => JSON.stringify(r)).join('\n')),
  });
  await expect(page.getByTestId('source')).toHaveText('6 games from sample.jsonl');
  await expect(page.getByTestId('filter-count')).toHaveText('6 of 6 games');

  const report = aggregateMatches(records);
  // Character table: sorted by win index, the engine's numbers.
  const rows = page.getByTestId('character-table').locator('tbody tr');
  await expect(rows).toHaveCount(Object.keys(CHARACTERS).length);
  const best = report.characters.slice().sort((a, b) => (b.winIndex ?? -1) - (a.winIndex ?? -1))[0];
  await expect(rows.first()).toContainText(best.name);
  await expect(rows.first().locator('td').nth(1)).toHaveText(String(best.games));
  await expect(rows.first().locator('td').nth(3)).toHaveText(String(best.wins));
  // Every gear card is listed, bought or not; the top row is the most bought.
  const gearRows = page.getByTestId('gear-table').locator('tbody tr');
  await expect(gearRows).toHaveCount(GEAR_SHOP.length);
  await expect(gearRows.first().locator('td').first()).toHaveText(report.gear[0].name);
  // Sorting by a column header re-orders the table.
  await page.getByTestId('gear-table').locator('th', { hasText: 'Card' }).click();
  const firstByName = GEAR_SHOP.map(g => g.name).sort((a, b) => b.localeCompare(a))[0];
  await expect(gearRows.first().locator('td').first()).toHaveText(firstByName);
  await expect(page.getByTestId('recent-table').locator('tbody tr')).toHaveCount(6);

  // Hovering a match-up cell shows its numbers in the tooltip.
  await page.locator('#chartMatchups [data-tip]').first().hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).toContainText('shared games');

  // Filters scope everything: 2-player games only, then humans-only.
  await page.selectOption('#fPlayers', '2');
  const twoP = aggregateMatches(records, { playerCount: 2 });
  await expect(page.getByTestId('filter-count')).toHaveText(`${twoP.overview.games} of 6 games`);
  await expect(page.getByTestId('recent-table').locator('tbody tr')).toHaveCount(twoP.overview.games);
  await page.selectOption('#fPlayers', 'multi');
  await page.selectOption('#fSeats', 'humans');
  await expect(page.getByTestId('filter-count')).toHaveText('0 of 6 games');
  await expect(page.locator('#emptyState')).toHaveText('No games match these filters.');
  await page.selectOption('#fSeats', 'all');
  await page.selectOption('#fMode', 'online');
  await expect(page.getByTestId('filter-count')).toHaveText(`${aggregateMatches(records, { mode: 'online' }).overview.games} of 6 games`);
  expect(errors).toEqual([]);
});

test('the dashboard reads every record from the telemetry server', async ({ page, request }) => {
  const errors = collectPageErrors(page);
  const records = await sampleRecords(`e2e-server-${Date.now()}`, 3);
  for (const r of records) expect((await request.post(TELEMETRY, { data: r })).status()).toBe(200);
  await page.goto('/dashboard.html');
  await expect(page.getByTestId('source')).toHaveText(/^\d+ games from localhost:\d+$/);
  const loaded = await page.evaluate(() => window.AscentDashboard.records.map(r => r.id));
  for (const r of records) expect(loaded).toContain(r.id);
  await expect(page.locator('#report')).toBeVisible();
  expect(errors).toEqual([]);
});
