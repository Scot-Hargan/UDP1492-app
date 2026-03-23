const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');
const {
  test,
  expect,
  DEFAULT_STORAGE_FIXTURE,
  SAVED_PEERS_NO_LAST_STORAGE_FIXTURE,
  WITH_PEERS_STORAGE_FIXTURE
} = require('./fixtures');

const repoRoot = path.resolve(__dirname, '..', '..');

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

test('launches with default persisted settings', async ({ appHarness }) => {
  const { page, readStorage } = appHarness;

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('UDP 1492 Desktop');
  await expect(page.locator('#themeStatus')).toHaveText('Dark mode');
  await expect(page.locator('#peerStatus')).toHaveText('No Active Peers');
  await expect(page.locator('#disconnectBtn')).toBeDisabled();

  const storage = await readStorage();
  expect(storage.udp1492_selected_codec).toBe('opus');
  expect(storage.udp1492_theme).toBe('dark');
});

test('quits the app when the main window is closed', async ({ appHarness }) => {
  const { electronApp } = appHarness;

  const closed = electronApp.waitForEvent('close');
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.close();
  });
  await closed;
});

test('persists a newly created peer across restart', async ({ appHarness }) => {
  const { page, readStorage, relaunch } = appHarness;

  await page.locator('#openPeerModalBtn').click();
  await page.locator('#peerModalName').fill('Persist Test');
  await page.locator('#peerModalIp').fill('198.51.100.42');
  await page.locator('#peerModalPort').fill('1492');
  await page.locator('#peerModalSave').click();

  await expect(page.locator('#peerList')).toContainText('Persist Test');

  const savedStorage = await readStorage();
  expect(savedStorage.udp1492_peers.some((peer) => peer.name === 'Persist Test')).toBe(true);
  expect(savedStorage.udp1492_last_peers).toContain('198.51.100.42:1492');

  const relaunchedPage = await relaunch();
  await expect(relaunchedPage.locator('#peerList')).toContainText('Persist Test');
  await expect(relaunchedPage.locator('#networkTable tbody')).toContainText('Persist Test');
});

test('launches when a legacy storage copy is malformed', async ({}, testInfo) => {
  const appDataDir = path.join(testInfo.outputDir, 'app-data');
  const activeStoragePath = path.join(appDataDir, 'UDP 1492 Desktop', 'storage.json');
  const legacyStoragePath = path.join(appDataDir, 'udp-1492-app', 'storage.json');
  const seededStorage = await fs.readFile(DEFAULT_STORAGE_FIXTURE, 'utf8');

  await fs.mkdir(path.dirname(activeStoragePath), { recursive: true });
  await fs.mkdir(path.dirname(legacyStoragePath), { recursive: true });
  await fs.writeFile(activeStoragePath, seededStorage, 'utf8');
  await fs.writeFile(legacyStoragePath, '{broken json', 'utf8');

  let electronApp;
  try {
    electronApp = await electron.launch({
      args: [repoRoot],
      env: {
        ...process.env,
        APPDATA: appDataDir,
        UDP1492_TEST_MODE: '1',
        UDP1492_TEST_MOCK_HOST: '1',
        UDP1492_TEST_SKIP_AUDIO: '1'
      }
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('UDP 1492 Desktop');
    await expect(page.locator('#themeStatus')).toHaveText('Dark mode');
  } finally {
    await safeCloseElectronApp(electronApp);
  }
});

test.describe('saved peers fallback', () => {
  test.use({ storageFixture: SAVED_PEERS_NO_LAST_STORAGE_FIXTURE });

  test('restores saved peers even when last-peer state is missing', async ({ appHarness }) => {
    const { page } = appHarness;

    await expect(page.locator('#peerList')).toContainText('Saved Only');
    await expect(page.locator('#networkTable tbody')).toContainText('Saved Only');
  });
});

test.describe('peer fixture', () => {
  test.use({ storageFixture: WITH_PEERS_STORAGE_FIXTURE });

  test('loads peer fixture into the renderer', async ({ appHarness }) => {
    const { page } = appHarness;

    await expect(page.locator('#themeStatus')).toHaveText('Light mode');
    await expect(page.locator('#gainValue')).toHaveText('1.33x');
    await expect(page.locator('#peerList')).toContainText('Alpha');
    await expect(page.locator('#networkTable tbody')).toContainText('Alpha');
  });

  test('connects against the mock host and handles injected host events', async ({ appHarness }) => {
    const { page, emitHostMessage, getSentHostMessages } = appHarness;

    await page.locator('#connectBtn').click();
    await expect(page.locator('#connectBtn')).toBeDisabled();
    await expect(page.locator('#disconnectBtn')).toBeEnabled();

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      return messages.map((message) => message.type).sort().join(',');
    }).toContain('configure');

    const sentMessages = await getSentHostMessages();
    expect(sentMessages.some((message) => message.type === 'version')).toBe(true);
    expect(sentMessages.some((message) => message.type === 'configure')).toBe(true);

    await emitHostMessage({
      type: 'peerUpdate',
      key: '203.0.113.10:1492',
      field: 'connected',
      connected: true
    });
    await expect(page.locator('#peerStatus')).toHaveText('1 Connected');

    await emitHostMessage({
      type: 'encryption_mismatch',
      localState: true,
      remoteState: false
    });
    await expect(page.locator('#audioRxStatus')).toHaveText('MISMATCH DETECTED');

    await page.locator('#disconnectBtn').click();
    await expect(page.locator('#connectBtn')).toBeEnabled();
    await expect(page.locator('#disconnectBtn')).toBeDisabled();
  });
});
