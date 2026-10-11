// Shared helpers for the end-to-end tests.

import { expect } from '@playwright/test';
import { createGame } from '../../engine/state.js';
import { applyAction, getLegalActions } from '../../engine/engine.js';
import { GRIT_RULES } from '../../engine/helpers.js';
import { createHeuristicAgent } from '../../sim/agents/heuristic.js';

// Make the page's Math.random a seeded PRNG (mulberry32) so a run — the local
// game seed and every random UI choice — is reproducible.
export async function seedPageRandom(page, seed) {
  await page.addInitScript((s) => {
    let state = s >>> 0;
    Math.random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

// Collect uncaught page errors, console errors and failed requests.
export function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    // A failed request is reported (with its URL) by the response handler.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  return errors;
}

// Accept every alert/confirm and remember its text.
export function collectDialogs(page) {
  const messages = [];
  page.on('dialog', d => { messages.push(d.message()); d.accept(); });
  return messages;
}

// Skip the cosmetic pause before the climb-result modal.
export async function fastEffects(page) {
  await page.evaluate(() => { window.Effects.diceAnticipation = () => Promise.resolve(); });
}

// The action button on a board card (route, milestone, training, gear,
// climber) whose text includes `name`, inside `scope`.
export function cardAction(page, scope, name) {
  return page.locator(`${scope} .aia-card`, { hasText: name }).first().locator('.aia-card__action');
}

// Set up and start a local hot-seat game through the setup screen.
export async function startLocalGame(page, characterNames) {
  await page.locator(`#playerCount input[value="${characterNames.length}"]`).check({ force: true });
  await page.click('#continueBtn');
  for (const name of characterNames) {
    await cardAction(page, '#characterSelect', name).click();
  }
  await page.click('#startGameBtn');
  await expect(page.locator('#turnIndicator')).toContainText("Player 1's turn");
  await fastEffects(page);
}

// One step of a random player, run INSIDE the page: dismiss whatever dialog
// is open, otherwise click one of the controls the UI shows as available
// (the action button on a route, milestone, training or gear card, or Rest).
// Returns a short description of what it did.
export function uiStep() {
  const shown = id => document.getElementById(id)?.classList.contains('show');
  if (shown('victoryModal')) return 'victory';
  if (shown('statShiftModal')) {
    const apply = document.getElementById('statShiftApply');
    (Math.random() < 0.6 && !apply.disabled ? apply : document.getElementById('statShiftSkip')).click();
    return 'stat-shift';
  }
  if (shown('climbModal')) { document.querySelector('#climbModal .action-buttons button').click(); return 'close-climb'; }
  if (shown('levelUpModal')) { document.querySelector('#levelUpModal .action-buttons button').click(); return 'close-level-up'; }

  const actions = (sel) => [...document.querySelectorAll(`${sel} .aia-card__action`)]
    .filter(b => b.getAttribute('aria-disabled') !== 'true');
  const routes = actions('.route-card');
  const options = [
    ...routes, ...routes, ...routes, // favour climbing
    ...actions('.milestone-card'),
    ...actions('.training-area'),
    ...actions('.gear-card'),
    ...[...document.querySelectorAll('.info-rest-btn')].filter(b => !b.disabled),
  ];
  if (!options.length) return 'none';
  const pick = options[Math.floor(Math.random() * options.length)];
  pick.click();
  const card = pick.closest('.aia-card');
  return `click: ${card ? card.className.split(' ')[0] : pick.className} ${(card || pick).textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}`;
}

// Play `steps` random UI steps.
export async function playRandomly(page, steps) {
  const log = [];
  for (let i = 0; i < steps; i++) {
    const did = await page.evaluate(uiStep);
    log.push(did);
    if (did === 'victory' || did === 'none') break;
    await page.waitForTimeout(15);
  }
  return log;
}

// Replay a game's action log through the Node engine from its seed and
// characters. If the browser applied exactly the engine's rules (and nothing
// else touched the state), the result equals the browser's state.
export function replayInEngine(browserState) {
  const characterKeys = browserState.players.map(p => p.character.key);
  let { state } = createGame({ seed: browserState.seed, characterKeys, rules: browserState.rules || null });
  for (const e of browserState.events.filter(ev => ev.type === 'action_chosen')) {
    ({ state } = applyAction(state, e.payload.action));
  }
  return state;
}

// Plain-JSON copy (drops undefined fields the same way page.evaluate does).
export const asJson = (x) => JSON.parse(JSON.stringify(x));

// A complete game played by the heuristic CPU, stopped one action before the
// end: { before, last, final } — the state before the winning milestone send,
// that action, and the finished state. With `winner`, tries seeds from `seed`
// up until that playerNum wins. Played with the Grit rules, like every local
// and online game. Tests load `before` into the page and send the last
// milestone through the UI to reach the post-game summary.
export async function nearlyFinishedGame({ seed, characterKeys, winner = null, tries = 30, rules = GRIT_RULES }) {
  const agent = createHeuristicAgent();
  for (let s = seed; s < seed + tries; s++) {
    let { state } = createGame({ seed: s, characterKeys, rules });
    let before = state;
    let last = null;
    for (let i = 0; i < 4000 && !state.gameEnded; i++) {
      const legal = getLegalActions(state);
      const { actionIndex } = await agent.chooseAction({ state, legalActions: legal });
      before = state;
      last = legal[actionIndex];
      ({ state } = applyAction(state, last));
    }
    if (state.gameEnded && (winner === null || state.winner === winner)) return { before, last, final: state };
  }
  throw new Error(`no finished game with winner ${winner} in seeds ${seed}..${seed + tries - 1}`);
}

// The post-game summary on the page shows the engine's numbers for `final`
// (engine/stats.js summarizeGame): standings order, the statistics table, one
// chart line per climber and one marker per milestone sent. `names` maps
// playerNum → the name the page should show. Shared by the local and online
// specs, so both modes are held to the same screen.
export async function expectSummaryShows(page, final, names) {
  const { summarizeGame } = await import('../../engine/stats.js');
  const sum = summarizeGame(final);
  const summary = page.locator('#victoryModal [data-testid="game-summary"]');
  await expect(summary).toBeVisible();
  await expect(summary.locator('#victoryTitle')).toHaveText('Top out!');
  const winner = sum.players.find(p => p.playerNum === sum.winner);
  await expect(summary.locator('.victory-banner')).toContainText(`${names[sum.winner]} · ${winner.characterName}`);

  const order = await summary.locator('.final-standings li').evaluateAll(lis => lis.map(li => Number(li.dataset.player)));
  expect(order).toEqual(sum.standings);
  for (const p of sum.players) await expect(summary.locator('.final-standings')).toContainText(names[p.playerNum]);

  const row = async (label) => summary.locator('.summary-stats tbody tr', { has: page.locator('th', { hasText: label }) })
    .first().locator('td').evaluateAll(tds => tds.map(td => {
      // Visible text only (drop the screen-reader "(most)" note).
      const c = td.cloneNode(true);
      c.querySelectorAll('.sr-only').forEach(e => e.remove());
      return c.textContent.trim();
    }));
  const first = (cells) => cells.map(c => parseInt(c, 10));
  expect(first(await row('Routes attempted'))).toEqual(sum.players.map(p => p.climbs.attempts));
  expect(first(await row('Training sessions'))).toEqual(sum.players.map(p => p.trainingSessions));
  expect(first(await row('Gear bought'))).toEqual(sum.players.map(p => p.gear.length));
  expect(first(await row('Rests'))).toEqual(sum.players.map(p => p.rests));
  expect(first(await row('Final Level'))).toEqual(sum.players.map(p => p.final.level));
  expect(await row('Milestones sent')).toEqual(sum.players.map(p => (p.milestones.length
    ? p.milestones.map(m => `${m.tier[0].toUpperCase()}${m.tier.slice(1)} · round ${m.round}`).join('') : '—')));

  await expect(summary.locator('#summaryChart .sc-line')).toHaveCount(sum.players.length);
  await expect(summary.locator('#summaryChart .sc-marker'))
    .toHaveCount(sum.players.reduce((t, p) => t + p.milestones.length, 0));
  await expect(summary.locator('.summary-bar-row')).toHaveCount(sum.players.length);
  return sum;
}
