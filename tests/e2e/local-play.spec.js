// Local hot-seat play (index.html without ?online=1).
//
// The key check: a game played through the UI replays identically through
// the Node engine. Local play has no rules of its own — if game.js ever
// applied a rule differently from engine/, the replayed state would differ.

import { test, expect } from '@playwright/test';
import { createGame } from '../../engine/state.js';
import { illegalActionReason } from '../../engine/engine.js';
import { ROUTES, GEAR_SHOP } from '../../engine/data.js';
import { ENGINE_VERSION_STRING } from '../../engine/version.js';
import { GRIT_RULES, gearPrice } from '../../engine/helpers.js';
import {
  seedPageRandom, collectPageErrors, collectDialogs, startLocalGame, playRandomly, replayInEngine, asJson, cardAction,
  nearlyFinishedGame, expectSummaryShows,
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

for (const [where, url] of [['served', '/index.html'], ['from file://', indexFileUrl]]) {
  test(`footer shows the rules engine version (${where})`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(url);
    const footer = page.locator('footer.site-footer');
    await expect(footer).toBeVisible();
    // The version comes from the engine bundle, so it always matches engine/version.js.
    await expect(page.getByTestId('engine-version')).toHaveText(`v${ENGINE_VERSION_STRING}`);
    await expect(footer).toContainText(`Rules engine v${ENGINE_VERSION_STRING}`);
    expect(errors).toEqual([]);
  });
}

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

test('the card gallery (cards.html) loads game data and Grit values', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/cards.html');
  await expect(page.locator('.aia-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('winning the game through the UI opens the post-game summary', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  // A real CPU game, one milestone send from the end.
  const { before, last, final } = await nearlyFinishedGame({ seed: 4, characterKeys: ['technician', 'ironLung', 'sprinter'] });
  expect(last.type).toBe('milestone');
  await page.goto('/index.html');
  await startLocalGame(page, ['The Technician', 'The Iron Lung', 'The Sprinter']);
  await page.evaluate((s) => { setGameState(s); renderGameBoard(); }, asJson(before));

  // Send the last milestone through its card, then close the climb result.
  await cardAction(page, '#milestonePanel', before.milestoneRoutes[last.difficulty].route.name).click();
  await page.locator('#climbModal .action-buttons button').click();

  const names = Object.fromEntries(final.players.map(p => [p.playerNum, `Player ${p.playerNum}`]));
  await expectSummaryShows(page, final, names);
  const summary = page.locator('#victoryModal [data-testid="game-summary"]');
  await expect(summary.getByRole('button', { name: 'Play again ▸' })).toBeVisible();

  // The chart switches between Level and XP and reads out a point on hover.
  await expect(summary.locator('#summaryChart svg')).toHaveAttribute('aria-label', /^Level/);
  await summary.locator('#summaryMetric label', { hasText: 'XP' }).click();
  await expect(summary.locator('#summaryChart svg')).toHaveAttribute('aria-label', /^XP/);
  await summary.locator('#summaryChart .sc-hit').hover();
  await expect(summary.locator('.sc-tip')).toBeVisible();
  await expect(summary.locator('.sc-tip')).toContainText('Round');
  // The table view of the chart has one row per round.
  await summary.locator('.summary-details > summary').click();
  await expect(summary.locator('.summary-details tbody tr')).toHaveCount(final.round);

  // Close it to look at the board; the HUD brings it back.
  await summary.getByRole('button', { name: 'View the board' }).click();
  await expect(page.locator('#victoryModal')).not.toHaveClass(/show/);
  await expect(page.locator('#turnIndicator')).toContainText(`Game over · Player ${final.winner} wins`);
  await page.locator('#turnIndicator').getByRole('button', { name: 'Game summary ▸' }).click();
  await expect(summary).toBeVisible();

  // The UI finished the game exactly as the engine does, and it replays.
  const browserState = await page.evaluate(() => getGameState());
  expect(browserState).toEqual(asJson(final));
  expect(asJson(replayInEngine(browserState))).toEqual(browserState);
  expect(errors).toEqual([]);
});

test('Grit is the currency: seat Grit, Grit prices, and a first send takes the card\'s Grit', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  await seedPageRandom(page, 77);
  await page.goto('/index.html');
  await startLocalGame(page, ['The Iron Lung', 'The Route Reader']);

  // Local games use the Grit rules; later seats start with more Grit.
  const s0 = await page.evaluate(() => getGameState());
  expect(s0.rules).toEqual(asJson(GRIT_RULES));
  expect(s0.players.map(p => p.character.grit)).toEqual([0, 2]);
  await expect(page.locator('#grit-1')).toHaveText(/^0/);
  await expect(page.locator('#grit-2')).toHaveText(/^2/);

  // Gear is priced in Grit, never XP; with 0 Grit nothing is affordable.
  const shop = page.locator('#gearShop');
  await expect(shop).toContainText('Gear costs Grit and 1 time. XP is never spent.');
  await expect(shop).toContainText('0 Grit to spend');
  const shown = await page.evaluate(() => [...document.querySelectorAll('.gear-card')].map(el => ({
    name: el.dataset.gearSlot,
    price: el.querySelector('.aia-card__price--grit b')?.textContent ?? null,
    reason: el.querySelector('.aia-card__reason')?.textContent ?? '',
  })));
  expect(shown.length).toBeGreaterThan(0);
  const me = s0.players[0].character;
  for (const g of shown) {
    const price = gearPrice(s0.rules, me, GEAR_SHOP.find(x => x.name === g.name));
    expect(g.price, g.name).toBe(String(price));
    expect(g.reason, g.name).toMatch(new RegExp(`Need ${price} Grit · you have 0|Needs .* first`));
  }
  expect(shown.some(g => g.reason.startsWith('Need ')), 'some card is blocked only by Grit').toBe(true);

  // Training costs 1 Grit; route cards carry the Grit dealt onto them.
  for (const cost of await page.locator('.training-area .aia-cost--grit b').allTextContents()) expect(cost).toBe('1');
  for (const route of s0.availableRoutes.bouldering) {
    const card = page.locator('#boulderingRoutes .route-card', { hasText: route.name }).first();
    expect(route.grit).toBeGreaterThan(0);
    await expect(card.locator('.aia-cost--grit b')).toHaveText(String(route.grit));
  }

  // A sure send: the climber takes the card's Grit and the card shows it claimed.
  const state = asJson(s0);
  Object.assign(state.players[0].character.stats, { strength: 99, technique: 99, focus: 99, flexibility: 99 });
  state.players[1].character.grit = 8; // for the purchase below, on P2's turn
  await page.evaluate((s) => { setGameState(s); renderGameBoard(); }, state);
  const route = state.availableRoutes.bouldering[0];
  await cardAction(page, '#boulderingRoutes', route.name).click();
  await expect(page.locator('#climbModal')).toHaveClass(/show/);
  await expect(page.locator('#climbModal')).toContainText(`+${route.grit} Grit`);
  await page.click('#climbModal .action-buttons button');
  const s1 = await page.evaluate(() => getGameState());
  expect(s1.players[0].character.grit).toBe(route.grit);
  expect(s1.availableRoutes.bouldering.find(r => r.name === route.name).grit).toBe(0);
  await expect(page.locator('#grit-1')).toHaveText(new RegExp(`^${route.grit}`));
  const claimed = page.locator('#boulderingRoutes .route-card', { hasText: route.name }).first().locator('.aia-cost--grit');
  await expect(claimed).toHaveClass(/is-claimed/);
  await expect(claimed.locator('b')).toHaveText('0');

  // Turns alternate: on P2's turn, buying gear spends Grit and leaves XP alone.
  await expect(page.locator('#turnIndicator')).toContainText("Player 2's turn");
  const p2 = s1.players[1].character;
  const buyable = await page.evaluate(() => [...document.querySelectorAll('.gear-card')]
    .find(el => el.querySelector('.aia-card__action').getAttribute('aria-disabled') !== 'true')?.dataset.gearSlot);
  expect(buyable, '8 Grit should afford at least one card').toBeTruthy();
  const price = gearPrice(s1.rules, p2, GEAR_SHOP.find(g => g.name === buyable));
  await page.locator(`.gear-card[data-gear-slot="${buyable}"] .aia-card__action`).click();
  await expect.poll(() => page.evaluate(n => getGameState().players[1].character.equipment.includes(n), buyable)).toBe(true);
  const s2 = await page.evaluate(() => getGameState());
  expect(s2.players[1].character.grit).toBe(8 - price);
  expect(s2.players[1].character.xp).toBe(p2.xp);
  expect(errors).toEqual([]);
});
