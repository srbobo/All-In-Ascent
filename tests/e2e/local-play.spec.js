// Local hot-seat play (index.html without ?online=1).
//
// The key check: a game played through the UI replays identically through
// the Node engine. Local play has no rules of its own — if game.js ever
// applied a rule differently from engine/, the replayed state would differ.

import { test, expect } from '@playwright/test';
import { createGame } from '../../engine/state.js';
import { explainIllegalAction } from '../../engine/engine.js';
import { ROUTES, GEAR_SHOP } from '../../engine/data.js';
import {
  seedPageRandom, collectPageErrors, collectDialogs, startLocalGame, playRandomly, replayInEngine, asJson,
} from './support.js';

const indexFileUrl = new URL('../../index.html', import.meta.url).href;

for (const [seed, characters] of [
  [101, ['The Iron Lung', 'The Route Reader']],
  [202, ['The Technician', 'The Sprinter', 'The Free Solo']],
  [303, ['The Route Reader']],
]) {
  test(`hot-seat game (${characters.length}p, seed ${seed}) replays identically through the engine`, async ({ page }) => {
    const errors = collectPageErrors(page);
    collectDialogs(page);
    await seedPageRandom(page, seed);
    await page.goto('/index.html');
    await startLocalGame(page, characters);

    await playRandomly(page, 260);

    const browserState = await page.evaluate(() => getGameState());
    const actions = browserState.events.filter(e => e.type === 'action_chosen').length;
    expect(actions, 'the run should take plenty of engine actions').toBeGreaterThan(60);
    expect(browserState.round, 'the run should cross a round end').toBeGreaterThan(1);
    expect(asJson(replayInEngine(browserState))).toEqual(browserState);
    expect(errors).toEqual([]);
  });
}

test('opens from file:// (no server) and plays through the engine', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  await seedPageRandom(page, 404);
  await page.goto(indexFileUrl);
  await startLocalGame(page, ['The Sprinter']);
  await playRandomly(page, 40);
  const browserState = await page.evaluate(() => getGameState());
  expect(browserState.events.filter(e => e.type === 'action_chosen').length).toBeGreaterThan(5);
  expect(asJson(replayInEngine(browserState))).toEqual(browserState);
  expect(errors).toEqual([]);
});

test('gear effects from the engine show in the climb result', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/index.html');
  await startLocalGame(page, ['The Iron Lung']);

  // A position where the climber owns every effect card and the only
  // bouldering route is a Toe/Heel Hook route with a nerf die: Trick Foot
  // Manual (time) and Mountain Mentor (nerf die) always fire on it.
  const { state } = createGame({ seed: 9, characterKeys: ['ironLung'] });
  const route = ROUTES.bouldering.find(r => r.tag === 'Toe/Heel Hook' && r.rollEffect.some(e => e.modifier === 1));
  state.availableRoutes.bouldering = [route];
  state.players[0].character.equipment = GEAR_SHOP.filter(g => g.effectKind).map(g => g.name);
  await page.evaluate((s) => { setGameState(s); renderGameBoard(); }, state);

  await page.locator('#boulderingRoutes .route-card', { hasText: route.name }).click();
  const modal = page.locator('#climbModal');
  await expect(modal).toHaveClass(/show/);
  await expect(modal).toContainText('Gear Effects:');
  await expect(modal).toContainText(/Trick Foot Manual: time cost \d+ → \d+/);
  await expect(modal).toContainText(/Mountain Mentor: ignored nerf Die \d/);
  await expect(modal).toContainText('(Neutralized by Mountain Mentor)');

  // The modal reports exactly what the engine resolved.
  const resolved = await page.evaluate(() => getGameState().events.filter(e => e.type === 'climb_resolved').at(-1).payload);
  await expect(modal).toContainText(`XP Gained: ${resolved.xpGained}`);
  for (const g of resolved.gearEffects) await expect(modal).toContainText(g.gear);
  expect(errors).toEqual([]);
});

test('an illegal click is refused with the engine\'s reason', async ({ page }) => {
  const errors = collectPageErrors(page);
  const dialogs = collectDialogs(page);
  await page.goto('/index.html');
  await startLocalGame(page, ['The Technician']);

  // A game whose Expert milestone is on the Lead wall, which needs gear.
  let seed = 1;
  let state;
  do ({ state } = createGame({ seed: seed++, characterKeys: ['technician'] }));
  while (state.milestoneRoutes.expert.area !== 'leadClimbing');
  await page.evaluate((s) => { setGameState(s); renderGameBoard(); }, state);

  const before = await page.evaluate(() => JSON.stringify(getGameState()));
  await page.click('button:has-text("Attempt Expert Route")');
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toBe(explainIllegalAction(state, { type: 'milestone', difficulty: 'expert' }));
  expect(dialogs[0]).toContain('You need');
  expect(await page.evaluate(() => JSON.stringify(getGameState()))).toBe(before);
  expect(errors).toEqual([]);
});

test('a Route Reader can cancel the stat-shift dialog at no cost', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  await page.goto('/index.html');
  await startLocalGame(page, ['The Route Reader']);

  // Find a climb the engine would suggest a shift for, then click it.
  const routeName = await page.evaluate(() => {
    const s = getGameState();
    const c = s.players[0].character;
    const r = s.availableRoutes.bouldering.find(rt => AscentEngine.bestRouteReaderShift(c, rt, 'bouldering', {}));
    return r && r.name;
  });
  test.skip(!routeName, 'no route on this wall benefits from a shift');
  const before = await page.evaluate(() => JSON.stringify(getGameState()));
  await page.locator('#boulderingRoutes .route-card', { hasText: routeName }).click();
  await expect(page.locator('#statShiftModal')).toHaveClass(/show/);
  await page.click('#statShiftCancel');
  expect(await page.evaluate(() => JSON.stringify(getGameState()))).toBe(before);

  await page.locator('#boulderingRoutes .route-card', { hasText: routeName }).click();
  await page.click('#statShiftApply');
  await expect(page.locator('#climbModal')).toHaveClass(/show/);
  const last = await page.evaluate(() => getGameState().events.filter(e => e.type === 'action_chosen').at(-1).payload.action);
  expect(last.shift).toBeTruthy();
  expect(await page.evaluate(() => getGameState().players[0].character.abilityUsed)).toBe(true);
  expect(errors).toEqual([]);
});
