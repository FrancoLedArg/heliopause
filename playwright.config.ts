import { defineConfig, devices } from '@playwright/test';

// Concurrent agents each pick their own port (E2E_PORT) so worktrees never share a server.
const port = Number(process.env['E2E_PORT'] ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // e2e runs against the production build so it tests what ships.
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(port)}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
