// Project Mode (feature flag `projectMode`): the workshop (project.html)
// builds climbers, routes and gear from rule elements that compile against
// the engine; the local game plays them; submissions reach the review queue
// (party/submissions.js, hosted by tests/e2e/serve.js) and review.html.
//
// The key check, as for every local-play spec: a UI-played game with custom
// content replays identically through the Node engine from its seed,
// characters and content pack.

import { test, expect } from '@playwright/test';
import { compileCharacter, compileContentPack, describeRule } from '../../engine/content.js';
import { ROUTES } from '../../engine/data.js';
import {
  seedPageRandom, collectPageErrors, collectDialogs, startLocalGame, playRandomly, replayInEngine, asJson, cardAction, fastEffects,
} from './support.js';

const SUBMISSIONS = '/parties/submissions/global';

// A climber built the way the workshop stores it (project-store.js).
const ROOF_RAT = {
  name: 'The Roof Rat', archetype: 'Steep specialist', description: 'Lives on the roof.', portrait: 'sprinter', accent: 'coral',
  startingStats: { strength: 22, technique: 16, focus: 14, flexibility: 14 }, startingEndurance: 100,
  growth: { strength: 3.5, technique: 2, focus: 2, flexibility: 2, endurance: 6 },
  specialAbility: { name: 'Roof Rat' },
  rules: [
    { when: [{ type: 'routeType', value: 'Overhang' }], then: [{ type: 'statBonus', stat: 'strength', amount: 5 }, { type: 'timeCost', amount: -1 }] },
    { when: [], then: [{ type: 'gritPerRound', amount: 1 }] },
  ],
};
const CHALK_LINE = {
  name: 'Chalk Line', area: 'bouldering', grade: 'V2', strength: 24, technique: 28, focus: 24, flexibility: 20, time: 2, endurance: 18,
  xpSuccess: 40, xpFail: 15, rollEffect: [{ stat: 'technique', modifier: -1 }], routeType: 'Vertical', holdFeatures: ['Crimp'], moveFeatures: [], tag: 'Pinch/Crimp',
};
const KNEEPADS = {
  name: 'Kneebar Pads', category: 'Specialized Gear', cost: 110, gritCost: 4, prerequisiteLevel: 1, description: 'Rest on the roof.',
  rules: [{ when: [{ type: 'routeType', value: 'Overhang' }], then: [{ type: 'enduranceCostScale', percent: 50 }] }, { when: [], then: [{ type: 'maxEndurance', amount: 10 }] }],
};

async function seedWorkshop(page, { characters = [], routes = [], gear = [] } = {}) {
  await page.addInitScript((data) => {
    localStorage.setItem('all-in-ascent.workshop', JSON.stringify({
      characters: data.characters.map((c, i) => ({ ...c, workshopId: `character-e2e-${i}` })),
      routes: data.routes.map((r, i) => ({ ...r, workshopId: `route-e2e-${i}` })),
      gear: data.gear.map((g, i) => ({ ...g, workshopId: `gear-e2e-${i}` })),
    }));
  }, { characters, routes, gear });
}

test('with the flag off, nothing of Project Mode shows and the game is the printed deck', async ({ page }) => {
  const errors = collectPageErrors(page);
  await seedWorkshop(page, { characters: [ROOF_RAT] });
  await page.goto('/index.html?projectMode=off');
  await expect(page.locator('.site-nav a', { hasText: 'Project Mode' })).toBeHidden();
  await page.click('#continueBtn');
  await expect(page.getByTestId('project-mode-note')).toBeHidden();
  await expect(page.locator('#characterSelect .character-card')).toHaveCount(5);
  expect(await page.evaluate(() => window.AscentFlags.isOn('projectMode'))).toBe(false);
  expect(errors).toEqual([]);
});

test('the workshop builds a climber from rule elements, compiles it and submits it for review', async ({ page, request }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  await page.goto('/project.html?projectMode=on&new=character');
  await expect(page.locator('#flagToggle')).toBeChecked();
  await expect(page.locator('#editor')).toBeVisible();

  // The starter rule reads as the engine words it; the catalog offers only
  // effects the rule's conditions can decide (climb-scope ones).
  await expect(page.locator('[data-rule-text="0"]')).toHaveText('On Overhang routes: +5 Strength.');
  const effectOptions = await page.locator('[data-add-then="0"] option').allTextContents();
  expect(effectOptions).toContain('Time cost');
  expect(effectOptions).not.toContain('Rest bonus');

  // Build: name it, add a route-requirement condition and a Time-cost effect.
  await page.fill('[data-path="name"]', 'The Roof Rat');
  await page.selectOption('[data-add-when="0"]', 'statRequirement');
  await page.fill('[data-path="rules.0.when.1.value"]', '40');
  await page.selectOption('[data-add-then="0"]', 'timeCost');
  await page.fill('[data-path="rules.0.then.1.amount"]', '-1');
  await expect(page.locator('[data-rule-text="0"]')).toHaveText('On Overhang routes and when the route needs under 40 Strength: +5 Strength, the climb costs -1 Time (min 1).');
  await expect(page.locator('#compileStatus')).toHaveClass(/is-ok/);
  await expect(page.locator('#preview .aia-card__name')).toHaveText('The Roof Rat');
  await expect(page.locator('#preview .aia-rules__effect')).toContainText('On Overhang routes and when the route needs under 40 Strength');

  // A broken value is a compile error, shown with its path; submitting is off.
  await page.fill('[data-path="startingStats.strength"]', '99');
  await expect(page.locator('#compileStatus')).toHaveClass(/is-bad/);
  await expect(page.locator('#compileStatus')).toContainText('starting Strength must be between 5 and 40');
  await expect(page.locator('#submitBtn')).toBeDisabled();
  await page.fill('[data-path="startingStats.strength"]', '20');
  await expect(page.locator('#compileStatus')).toHaveClass(/is-ok/);

  // Reorder and remove elements: add a rule, move it up, remove it again.
  await page.click('[data-add-rule]');
  await expect(page.locator('.pm-rule')).toHaveCount(2);
  await page.click('[data-move="1:-1"]');
  await expect(page.locator('[data-rule-text="1"]')).toContainText('On Overhang routes');
  await page.click('[data-remove-rule="0"]');
  await expect(page.locator('.pm-rule')).toHaveCount(1);
  await expect(page.locator('[data-rule-text="0"]')).toContainText('On Overhang routes');

  // The page's definition compiles in Node to the same climber.
  const def = await page.evaluate(() => window.AscentProject.editing.def);
  const compiled = compileCharacter(def);
  expect(compiled.ok).toBe(true);
  expect(compiled.value.specialAbility.description).toBe(describeRule(def.rules[0]));

  // Save, then submit for review: the server stores exactly the definition.
  await page.click('#saveBtn');
  await expect(page.locator('#workshopList li')).toHaveCount(1);
  await expect(page.locator('#workshopList')).toContainText('The Roof Rat');
  await page.click('#submitBtn');
  await expect(page.locator('#submitModal')).toHaveClass(/show/);
  await page.fill('#submitAuthor', 'e2e');
  await page.fill('#submitNote', 'Please review');
  const posted = page.waitForResponse(r => r.url().includes(SUBMISSIONS) && r.request().method() === 'POST');
  await page.click('#submitSend');
  expect((await posted).status()).toBe(200);
  await expect(page.locator('#submitResult')).toContainText('Sent for review');
  const id = (await page.locator('#submitResult').textContent()).match(/\((sub-character-[\w-]+)\)/)[1];
  const { submissions } = await (await request.get(`${SUBMISSIONS}?list=1`)).json();
  const stored = submissions.find(s => s.id === id);
  expect(stored).toBeTruthy();
  expect(stored.kind).toBe('character');
  expect(stored.status).toBe('new');
  expect(stored.author).toBe('e2e');
  expect(stored.definition).toEqual(asJson(def));
  expect(errors).toEqual([]);
});

test('the review queue lists submissions with the card and lets the designer approve them', async ({ page, request }) => {
  const errors = collectPageErrors(page);
  const id = `sub-character-e2e-${Date.now()}`;
  const sub = { schema: 'aia-submission/1', id, kind: 'character', engineVersion: '1.2.0', author: 'queue-test', note: 'hello', definition: ROOF_RAT, submittedAt: Date.now() };
  expect((await request.post(SUBMISSIONS, { data: sub })).status()).toBe(200);
  const bad = await request.post(SUBMISSIONS, { data: { ...sub, id: `${id}-bad`, definition: { ...ROOF_RAT, startingEndurance: 5 } } });
  expect(bad.status()).toBe(400);

  await page.addInitScript(() => { localStorage.setItem('all-in-ascent.submissions-admin-token', 'e2e-admin'); });
  await page.goto('/review.html');
  await expect(page.getByTestId('source')).toHaveText(/submissions? from localhost:\d+$/);
  const item = page.locator(`.rv-item[data-id="${id}"]`);
  await expect(item).toBeVisible();
  await expect(item.locator('.aia-card__name')).toHaveText('The Roof Rat');
  await expect(item.locator('.aia-rules__effect')).toHaveText(compileCharacter(ROOF_RAT).value.specialAbility.description);
  await expect(item).toContainText('queue-test');
  await expect(item.getByTestId('status')).toHaveText('new');

  const patched = page.waitForResponse(r => r.url().includes(SUBMISSIONS) && r.request().method() === 'PATCH');
  await item.getByRole('button', { name: 'Approve' }).click();
  expect((await patched).status()).toBe(200);
  // The "New" filter hides it; "Approved" shows it.
  await expect(item).toBeHidden();
  await page.selectOption('#fStatus', 'approved');
  await expect(page.locator(`.rv-item[data-id="${id}"]`).getByTestId('status')).toHaveText('approved');
  const { submissions } = await (await request.get(`${SUBMISSIONS}?list=1`)).json();
  expect(submissions.find(s => s.id === id).status).toBe('approved');
  expect(errors).toEqual([]);
});

test('a local game with workshop content plays the custom climber, route and gear, and replays through the engine', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  await seedWorkshop(page, { characters: [ROOF_RAT], routes: [CHALK_LINE], gear: [KNEEPADS] });
  await page.goto('/index.html?projectMode=on');
  await expect(page.locator('.site-nav a', { hasText: 'Project Mode' })).toBeVisible();
  await page.click('#continueBtn');
  await expect(page.getByTestId('project-mode-note')).toContainText('3 workshop cards in this game');
  await expect(page.locator('#characterSelect .character-card')).toHaveCount(6);
  const custom = page.locator('#characterSelect .character-card--custom');
  await expect(custom).toHaveCount(1);
  await expect(custom).toContainText('The Roof Rat');
  await cardAction(page, '#characterSelect', 'The Roof Rat').click();
  await page.click('#startGameBtn');
  await expect(page.locator('#turnIndicator')).toContainText("Player 1's turn");
  await fastEffects(page);

  // The game carries the compiled pack and the custom climber is seated with its rules.
  const s0 = await page.evaluate(() => getGameState());
  expect(s0.content).toEqual(asJson(compileContentPack({ characters: [ROOF_RAT], routes: [CHALK_LINE], gear: [KNEEPADS] }).value));
  expect(s0.players[0].character.key).toBe('custom-the-roof-rat');
  expect(s0.players[0].character.customRules).toHaveLength(2);
  await expect(page.locator('.player-sheet')).toContainText('The Roof Rat');
  await expect(page.locator('.player-sheet')).toContainText('Roof Rat · ability');

  // Put the custom route, the custom gear and an Overhang route in play.
  const overhang = ROUTES.bouldering.find(r => r.routeType === 'Overhang');
  const state = asJson(s0);
  state.availableRoutes.bouldering = [
    overhang, { ...state.content.routes.bouldering[0], grit: 2 },
    ...state.availableRoutes.bouldering.filter(r => r.name !== overhang.name && r.name !== 'Chalk Line').slice(0, 3),
  ];
  // The seeded deal may already have put the custom gear in the shop; never show it twice.
  state.availableGear = [state.content.gear[0], ...state.availableGear.filter(g => g.name !== 'Kneebar Pads')].slice(0, 3);
  state.players[0].character.grit = 10;
  Object.assign(state.players[0].character.stats, { strength: 70, technique: 70, focus: 70, flexibility: 70 });
  await page.evaluate((s) => { setGameState(s); renderGameBoard(); }, state);

  // Cards show the engine's numbers with the rules applied: +5 Strength and -1 Time on the Overhang route only.
  const overhangCard = page.locator(`#boulderingRoutes .route-card[data-route="${overhang.name}"]`);
  await expect(overhangCard.locator('.aia-cost--time b')).toHaveText(String(Math.max(1, overhang.time - 1)));
  await expect(overhangCard.locator('.aia-req--strength dd')).toContainText('you have 75');
  const chalk = page.locator('#boulderingRoutes .route-card[data-route="Chalk Line"]');
  await expect(chalk).toBeVisible();
  await expect(chalk.locator('.aia-cost--time b')).toHaveText('2');
  await expect(chalk).toContainText('AIA · PROJECT');

  // Buy the custom gear: its rules attach, its max-Endurance rule applies.
  await page.locator('.gear-card[data-gear-slot="Kneebar Pads"] .aia-card__action').click();
  await expect.poll(() => page.evaluate(() => getGameState().players[0].character.equipment.includes('Kneebar Pads'))).toBe(true);
  const s1 = await page.evaluate(() => getGameState());
  expect(s1.players[0].character.gearRules[0].gear).toBe('Kneebar Pads');
  expect(s1.players[0].character.maxEndurance).toBe(110);
  await expect(page.locator('#inventory-1')).toContainText('Kneebar Pads');
  // The Overhang route now costs half Endurance (the gear's rule).
  await expect(overhangCard.locator('.aia-cost--endurance b')).toHaveText(String(Math.ceil(overhang.endurance / 2)));

  // Climb the Overhang route: the result lists the climber's and the gear's rules.
  await overhangCard.locator('.aia-card__action').click();
  const modal = page.locator('#climbModal');
  await expect(modal).toHaveClass(/show/);
  await expect(modal).toContainText('Project rules');
  const rules = modal.getByTestId('custom-rules');
  await expect(rules).toContainText('The Roof Rat — On Overhang routes: +5 Strength, the climb costs -1 Time (min 1).');
  await expect(rules).toContainText('Kneebar Pads — On Overhang routes: the climb costs 50% Endurance.');
  await page.click('#climbModal .action-buttons button');
  const resolved = await page.evaluate(() => getGameState().events.filter(e => e.type === 'climb_resolved').at(-1).payload);
  expect(resolved.customRules.map(r => r.source).sort()).toEqual(['Kneebar Pads', 'The Roof Rat']);
  expect(resolved.timeCost).toBe(Math.max(1, overhang.time - 1));

  // Climb the custom route through its card.
  await chalk.locator('.aia-card__action').click();
  await expect(modal).toHaveClass(/show/);
  await expect(modal).toContainText('Chalk Line · V2');
  await page.click('#climbModal .action-buttons button');

  expect(errors).toEqual([]);
});

test('a UI-played game with workshop content replays identically through the engine', async ({ page }) => {
  const errors = collectPageErrors(page);
  collectDialogs(page);
  let telemetryPosts = 0;
  page.on('request', r => { if (r.url().includes('/parties/telemetry/') && r.method() === 'POST') telemetryPosts++; });
  await seedWorkshop(page, { characters: [ROOF_RAT], routes: [CHALK_LINE], gear: [KNEEPADS] });
  await seedPageRandom(page, 606);
  await page.goto('/index.html?projectMode=on');
  await startLocalGame(page, ['The Roof Rat', 'The Technician']);
  const s0 = await page.evaluate(() => getGameState());
  expect(s0.content.gear[0].name).toBe('Kneebar Pads');

  await playRandomly(page, 160);
  const browserState = await page.evaluate(() => getGameState());
  expect(browserState.events.filter(e => e.type === 'action_chosen').length).toBeGreaterThan(40);
  expect(browserState.round).toBeGreaterThan(1);
  expect(asJson(replayInEngine(browserState))).toEqual(browserState);
  // Games with workshop content are not recorded for telemetry (the server
  // would refuse a custom character anyway).
  expect(telemetryPosts).toBe(0);
  expect(errors).toEqual([]);
});

test('workshop cards that do not compile are left out of the game and the setup screen says so', async ({ page }) => {
  const errors = collectPageErrors(page);
  await seedWorkshop(page, { characters: [ROOF_RAT, { ...ROOF_RAT, name: 'Broken Rat', startingEndurance: 9999 }] });
  await page.goto('/index.html?projectMode=on');
  await page.click('#continueBtn');
  await expect(page.getByTestId('project-mode-note')).toContainText('1 workshop card in this game');
  await expect(page.getByTestId('project-mode-note')).toContainText('1 card left out');
  await expect(page.locator('#characterSelect .character-card--custom')).toHaveCount(1);
  expect(errors).toEqual([]);
});
