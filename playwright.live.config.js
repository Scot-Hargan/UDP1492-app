const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  testMatch: /live-backend\.spec\.js/,
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'npx wrangler dev --config backend/wrangler.toml --port 8791 --ip 127.0.0.1 --local --persist-to test-results/live-backend-state',
    url: 'http://127.0.0.1:8791/api/health',
    reuseExistingServer: false,
    timeout: 30000
  },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
