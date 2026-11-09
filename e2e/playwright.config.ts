import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout sur l'application complète (backend + frontend compilé).
 * L'application doit déjà tourner : par défaut sur http://localhost:4000
 * (voir le job « e2e » de la CI, ou `npm run dev` en local avec E2E_BASE_URL=http://localhost:5173).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
