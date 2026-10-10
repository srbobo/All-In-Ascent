// Local hot-seat play (index.html without ?online=1).
//
// The key check: a game played through the UI replays identically through
// the Node engine. Local play has no rules of its own — if game.js ever
// applied a rule differently from engine/, the replayed state would differ.

import { test, expect } from '@playwright/test';
import { createGame } from '../../engine/state.js';
import { illegalActionReason } from '../../engine/engine.js';
import { ROUTES, GEAR_SHOP } from '../../engine/data.js';
import {
  seedPageRandom, collectPageErrors, collectDialogs, startLocalGame, playRandomly, replayInEngine, asJson, cardAction,
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

    await playRandomly(page, 180);

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

  await cardAction(page, '#boulderingRoutes', route.name).click();
  const modal = page.locator('#climbModal');
  await expect(modal).toHaveClass(/show/);
  await expect(modal).toContainText('Gear effects');
  await expect(modal).toContainText(/Trick Foot Manual: time cost \d+ → \d+/);
  await expect(modal).toContainText(/Mountain Mentor: ignored nerf Die \d/);
  await expect(modal).toContainText('neutralised by Mountain Mentor');

  // The modal reports exactly what the engine resolved.
  const resolved = await page.evaluate(() => getGameState().events.filter(e => e.type === 'climb_resolved').at(-1).payload);
  await expect(modal).toContainText(`+${resolved.xpGained} XP`);
  for (const g of resolved.gearEffects) await expect(modal).toContainText(g.gear);
  expect(errors).toEqual([]);
});

test('an unavailable card shows the engine\'s reason and ignores clicks', async ({ page }) => {
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

  const reason = illegalActionReason(state, { type: 'milestone', difficulty: 'expert' });
  expect(reason.code).toBe('needsGear');
  const card = page.locator('#milestonePanel .aia-card', { hasText: state.milestoneRoutes.expert.route.name });
  await expect(card).toContainText(`Locked · needs ${reason.missing.join(', ')}`);

  const before = await page.evaluate(() => JSON.stringify(getGameState()));
  // A real click on the disabled button (Playwright would wait for it to enable).
  await card.locator('.aia-card__action').dispatchEvent('click');
  expect(await page.evaluate(() => JSON.stringify(getGameState()))).toBe(before);
  expect(dialogs).toEqual([]);

  // Every card on the board is enabled exactly when the engine allows it.
  const mismatches = await page.evaluate(() => {
    const s = getGameState();
    const legal = AscentEngine.getLegalActions(s);
    const out = [];
    const checkCard = (el, wanted) => {
      const enabled = el.querySelector('.aia-card__action').getAttribute('aria-disabled') !== 'true';
      if (enabled !== !!AscentEngine.findLegalAction(legal, wanted)) out.push(JSON.stringify(wanted));
    };
    for (const area of ['bouldering', 'topRope', 'leadClimbing']) {
      for (const el of document.querySelectorAll(`#${area}Routes .route-card`)) {
        checkCard(el, { type: 'climb', area, routeName: el.dataset.route });
      }
    }
    for (const el of document.querySelectorAll('.gear-card')) checkCard(el, { type: 'buyGear', gearName: el.dataset.gearSlot });
    return out;
  });
  expect(mismatches).toEqual([]);
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
  await cardAction(page, '#boulderingRoutes', routeName).click();
  await expect(page.locator('#statShiftModal')).toHaveClass(/show/);
  await page.click('#statShiftCancel');
  expect(await page.evaluate(() => JSON.stringify(getGameState()))).toBe(before);

  await cardAction(page, '#boulderingRoutes', routeName).click();
  await page.click('#statShiftApply');
  await expect(page.locator('#climbModal')).toHaveClass(/show/);
  const last = await page.evaluate(() => getGameState().events.filter(e => e.type === 'action_chosen').at(-1).payload.action);
  expect(last.shift).toBeTruthy();
  expect(await page.evaluate(() => getGameState().players[0].character.abilityUsed)).toBe(true);
  expect(errors).toEqual([]);
});

test('the card gallery (cards.html) still loads game data without the engine', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/cards.html');
  await expect(page.locator('.aia-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});
