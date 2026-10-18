import { defineConfig, devices } from '@playwright/test'

// End-to-end test against a running stack, e.g. the self-hosted one: deploy/self-hosted/tests/stack-test.sh e2e
// (needs E2E_BASE_URL, E2E_EMAIL and E2E_PASSWORD; Caddy's internal CA is not trusted by the test browser).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
