const fs = require('node:fs/promises');
const path = require('node:path');
const { test: base, expect, _electron: electron } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'storage');
const DEFAULT_STORAGE_FIXTURE = path.join(fixtureRoot, 'default.json');
const SAVED_PEERS_NO_LAST_STORAGE_FIXTURE = path.join(fixtureRoot, 'saved-peers-no-last.json');
const WITH_PEERS_STORAGE_FIXTURE = path.join(fixtureRoot, 'with-peers.json');

function resolveFixturePath(storageFixture) {
  if (!storageFixture) return DEFAULT_STORAGE_FIXTURE;
  return path.isAbsolute(storageFixture) ? storageFixture : path.join(fixtureRoot, storageFixture);
}

async function seedStorage(userDataDir, storageFixture) {
  await fs.mkdir(userDataDir, { recursive: true });
  const fixturePath = resolveFixturePath(storageFixture);
  const storagePath = path.join(userDataDir, 'storage.json');
  const raw = await fs.readFile(fixturePath, 'utf8');
  await fs.writeFile(storagePath, raw, 'utf8');
}

async function safeCloseElectronApp(electronApp) {
  if (!electronApp) return;
  try {
    await electronApp.close();
  } catch (error) {
    const message = String(error?.message || error);
    if (!/Target page, context or browser has been closed|Browser has been closed|Connection closed/i.test(message)) {
      throw error;
    }
  }
}

async function launchElectronSession(userDataDir) {
  const electronApp = await electron.launch({
    args: [repoRoot],
    env: {
      ...process.env,
      UDP1492_TEST_MODE: '1',
      UDP1492_TEST_MOCK_HOST: '1',
      UDP1492_TEST_SKIP_AUDIO: '1',
      UDP1492_USER_DATA_DIR: userDataDir
    }
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#connectBtn')).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.udp1492Test !== 'undefined')).toBe(true);

  return { electronApp, page };
}

const test = base.extend({
  storageFixture: [DEFAULT_STORAGE_FIXTURE, { option: true }],
  appHarness: async ({ storageFixture }, use, testInfo) => {
    const userDataDir = path.join(testInfo.outputDir, 'user-data');
    await seedStorage(userDataDir, storageFixture);
    let session = await launchElectronSession(userDataDir);

    const harness = {
      userDataDir,
      get electronApp() {
        return session.electronApp;
      },
      get page() {
        return session.page;
      },
      emitHostMessage: (message) => session.page.evaluate((payload) => window.udp1492Test.emitHostMessage(payload), message),
      emitHostDisconnect: (payload) => session.page.evaluate((details) => window.udp1492Test.emitHostDisconnect(details), payload),
      getSentHostMessages: () => session.page.evaluate(() => window.udp1492Test.getSentHostMessages()),
      async relaunch() {
        await safeCloseElectronApp(session.electronApp);
        session = await launchElectronSession(userDataDir);
        return session.page;
      },
      async readStorage() {
        const raw = await fs.readFile(path.join(userDataDir, 'storage.json'), 'utf8');
        return JSON.parse(raw);
      }
    };

    await use(harness);
    await safeCloseElectronApp(session.electronApp);
  }
});

module.exports = {
  test,
  expect,
  DEFAULT_STORAGE_FIXTURE,
  SAVED_PEERS_NO_LAST_STORAGE_FIXTURE,
  WITH_PEERS_STORAGE_FIXTURE
};
