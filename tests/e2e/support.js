// Shared helpers for the end-to-end tests.

import { expect } from '@playwright/test';
import { createGame } from '../../engine/state.js';
import { applyAction } from '../../engine/engine.js';

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
  let { state } = createGame({ seed: browserState.seed, characterKeys });
  for (const e of browserState.events.filter(ev => ev.type === 'action_chosen')) {
    ({ state } = applyAction(state, e.payload.action));
  }
  return state;
}

// Plain-JSON copy (drops undefined fields the same way page.evaluate does).
export const asJson = (x) => JSON.parse(JSON.stringify(x));
