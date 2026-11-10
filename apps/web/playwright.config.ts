import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The sandbox ships a pre-installed Chromium; CI installs its own, so only use the path if present.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = existsSync(PREINSTALLED) ? PREINSTALLED : undefined;
const launchOptions = executablePath ? { executablePath } : {};

// Parallel checkouts (implementers, reviewers) set PW_PORT so their preview servers do not collide.
const PORT = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    launchOptions,
  },
  projects: [
    { name: 'tablet-landscape', use: { viewport: { width: 1194, height: 834 } } },
    { name: 'tablet-portrait', use: { viewport: { width: 834, height: 1194 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
  ],
  // The e2e build keeps /kit and /forge-preview reachable (production builds drop them).
  webServer: {
    command: `pnpm build:e2e && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
