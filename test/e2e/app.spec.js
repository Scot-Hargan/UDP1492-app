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
  expect(storage.udp1492_app_state_v2).toMatchObject({
    version: 2,
    operatingMode: 'direct',
    direct: { activePeerKeys: [] }
  });
  expect(storage.udp1492_managed_profile).toMatchObject({ version: 1 });
  expect(storage.udp1492_managed_cache).toMatchObject({ version: 1, channels: [] });
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

  test('persists AppStateV2 migration and managed mode selection', async ({ appHarness }) => {
    const { page, readStorage } = appHarness;

    const migratedStorage = await readStorage();
    expect(migratedStorage.udp1492_app_state_v2).toMatchObject({
      version: 2,
      operatingMode: 'direct',
      direct: { activePeerKeys: ['203.0.113.10:1492'] }
    });

    await page.locator('#operatingModeManaged').click();
    await expect(page.locator('#managedModeShell')).toBeVisible();
    await expect(page.locator('.peer-controls')).toBeHidden();
    await expect(page.locator('#transportPeersHeading')).toHaveText('Transport Peers');

    const updatedStorage = await readStorage();
    expect(updatedStorage.udp1492_app_state_v2).toMatchObject({
      version: 2,
      operatingMode: 'managed',
      direct: { activePeerKeys: ['203.0.113.10:1492'] }
    });
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

  test('opens a managed session, joins a channel, and adapts resolved peers into host config', async ({ appHarness }) => {
    const { page, getSentHostMessages, readStorage } = appHarness;
    const baseUrl = 'https://managed.example.test';
    const jsonHeaders = {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': '*'
    };

    await page.route(`${baseUrl}/api/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: jsonHeaders, body: '' });
        return;
      }
      if (url.pathname === '/api/session/open') {
        await route.fulfill({
          status: 200,
          headers: jsonHeaders,
          body: JSON.stringify({
            identity: {
              userId: 'usr_01',
              sessionId: 'ses_01',
              displayName: 'Scot'
            },
            session: {
              openedAt: '2026-04-16T19:20:00Z',
              expiresAt: '2026-04-16T21:20:00Z',
              heartbeatIntervalMs: 15000
            }
          })
        });
        return;
      }
      if (url.pathname === '/api/channels') {
        await route.fulfill({
          status: 200,
          headers: jsonHeaders,
          body: JSON.stringify({
            channels: [
              {
                channelId: 'chn_alpha',
                name: 'Alpha',
                description: 'Primary coordination channel',
                securityMode: 'open',
                requiresPasscode: false,
                concurrentAccessAllowed: true,
                memberCount: 4
              }
            ],
            syncedAt: '2026-04-16T19:21:00Z'
          })
        });
        return;
      }
      if (url.pathname === '/api/channels/chn_alpha/join') {
        await route.fulfill({
          status: 200,
          headers: jsonHeaders,
          body: JSON.stringify({
            membership: {
              channelId: 'chn_alpha',
              slotId: 'A',
              membershipState: 'joined',
              joinedAt: '2026-04-16T19:22:00Z'
            },
            channel: {
              channelId: 'chn_alpha',
              name: 'Alpha',
              description: 'Primary coordination channel',
              securityMode: 'open',
              requiresPasscode: false,
              concurrentAccessAllowed: true,
              memberCount: 5
            }
          })
        });
        return;
      }
      if (url.pathname === '/api/channels/chn_alpha/presence') {
        await route.fulfill({
          status: 200,
          headers: jsonHeaders,
          body: JSON.stringify({
            presence: {
              channelId: 'chn_alpha',
              sessionId: 'ses_01',
              onlineState: 'online',
              lastSeenAt: '2026-04-16T19:23:00Z'
            },
            registrations: [],
            nextHeartbeatAt: '2026-04-16T19:23:15Z'
          })
        });
        return;
      }
      if (url.pathname === '/api/channels/chn_alpha/peers') {
        await route.fulfill({
          status: 200,
          headers: jsonHeaders,
          body: JSON.stringify({
            channelId: 'chn_alpha',
            peers: [
              {
                userId: 'usr_peer_01',
                sessionId: 'ses_peer_01',
                channelId: 'chn_alpha',
                displayName: 'Peer One',
                connectionState: 'idle',
                endpoints: [
                  {
                    endpointId: 'end_01',
                    kind: 'public',
                    ip: '198.51.100.10',
                    port: 1492,
                    registrationState: 'ready',
                    lastValidatedAt: '2026-04-16T19:25:00Z'
                  }
                ]
              }
            ],
            resolvedAt: '2026-04-16T19:25:05Z'
          })
        });
        return;
      }
      if (url.pathname === '/api/channels/chn_alpha/leave') {
        await route.fulfill({
          status: 200,
          headers: jsonHeaders,
          body: JSON.stringify({
            membership: {
              channelId: 'chn_alpha',
              slotId: 'A',
              membershipState: 'none',
              leftAt: '2026-04-16T19:26:00Z'
            }
          })
        });
        return;
      }
      throw new Error(`Unhandled managed API request: ${request.method()} ${request.url()}`);
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();

    await expect(page.locator('#managedIdentityMeta')).toContainText('usr_01');
    await expect(page.locator('#managedChannelList')).toContainText('Alpha');

    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#managedPeerSyncMeta')).toContainText('1 transport peer');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      return messages
        .filter((message) => message.type === 'configure')
        .some((message) => Array.isArray(message.peers) && message.peers.some((peer) => peer.name === 'Peer One'));
    }).toBe(true);

    const storage = await readStorage();
    expect(storage.udp1492_managed_profile).toMatchObject({
      displayName: 'Scot',
      backendBaseUrl: baseUrl,
      userId: 'usr_01',
      lastSessionId: 'ses_01',
      preferredChannelId: 'chn_alpha'
    });
    expect(storage.udp1492_managed_cache).toMatchObject({
      channels: [
        expect.objectContaining({
          channelId: 'chn_alpha',
          name: 'Alpha'
        })
      ]
    });
    expect(storage.udp1492_app_state_v2).toMatchObject({
      operatingMode: 'managed',
      managed: {
        session: {
          sessionId: 'ses_01',
          channelId: 'chn_alpha',
          membershipState: 'joined'
        },
        transportPeers: [
          expect.objectContaining({
            name: 'Peer One',
            ip: '198.51.100.10',
            port: 1492
          })
        ]
      }
    });

    await page.locator('#managedLeaveChannelBtn').click();
    await expect(page.locator('#managedActiveChannel')).toHaveText('No managed channel joined yet');
    await expect(page.locator('#networkTable tbody')).not.toContainText('Peer One');
  });
});
