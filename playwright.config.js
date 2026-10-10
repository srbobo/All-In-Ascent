// End-to-end tests: drive the real browser game (index.html) for local
// hot-seat play and for online play against the real PartyKit GameRoom.
//
//   npm run test:e2e
//
// Locally the tests use your installed Google Chrome (no browser download).
// CI installs Playwright's Chromium instead (CI=1 → bundled browser); set
// PW_CHANNEL to pick another channel, or PW_CHANNEL= to force the bundled one.

import { defineConfig } from '@playwright/test';

const PORT = 8123;
const channel = process.env.PW_CHANNEL !== undefined
  ? (process.env.PW_CHANNEL || undefined)
  : (process.env.CI ? undefined : 'chrome');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    channel,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/e2e/serve.js ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
