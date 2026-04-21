const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');
const {
  test,
  expect,
  DEFAULT_STORAGE_FIXTURE,
  MANAGED_GROUP_B_RESUME_STORAGE_FIXTURE,
  MANAGED_RESUME_STORAGE_FIXTURE,
  MANAGED_LEGACY_STATE_STORAGE_FIXTURE,
  MANAGED_SLOT_PRECEDENCE_STORAGE_FIXTURE,
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

function buildManagedApiUrl(baseUrl, pathname = '') {
  const url = new URL(baseUrl);
  const baseSegments = url.pathname.split('/').filter(Boolean);
  const pathSegments = String(pathname || '').split('/').filter(Boolean);
  let overlap = 0;
  const maxOverlap = Math.min(baseSegments.length, pathSegments.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (baseSegments.slice(-size).join('/') === pathSegments.slice(0, size).join('/')) {
      overlap = size;
      break;
    }
  }
  url.pathname = `/${[...baseSegments, ...pathSegments.slice(overlap)].join('/')}`;
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

async function getAudioRoutingSnapshot(page) {
  return page.evaluate(() => window.udp1492RouteDebug?.getSnapshot?.() || []);
}

async function getCommanderSnapshot(page) {
  return page.evaluate(() => window.udp1492CommanderDebug?.getSnapshot?.() || null);
}

async function setNatMockDiscoveryResult(page, result) {
  return page.evaluate((value) => window.udp1492NatDebug?.setMockDiscoveryResult?.(value), result);
}

async function clearNatMockDiscoveryResult(page) {
  return page.evaluate(() => window.udp1492NatDebug?.clearMockDiscoveryResult?.());
}

async function setNatMockProbeResults(page, result) {
  return page.evaluate((value) => window.udp1492NatDebug?.setMockProbeResults?.(value), result);
}

async function clearNatMockProbeResults(page) {
  return page.evaluate(() => window.udp1492NatDebug?.clearMockProbeResults?.());
}

async function runNatProbes(page, options) {
  return page.evaluate((value) => window.udp1492NatDebug?.runProbes?.(value), options);
}

async function sendCommanderTestFrame(page) {
  return page.evaluate(() => window.udp1492CommanderDebug?.sendTestFrame?.());
}

async function openAdminWindow(appHarness) {
  const { page, electronApp } = appHarness;
  const adminWindowPromise = electronApp.waitForEvent('window');
  await page.locator('#openAdminWindowBtn').click();
  const adminPage = await adminWindowPromise;
  await adminPage.waitForLoadState('domcontentloaded');
  await expect(adminPage.locator('#adminTitle')).toHaveText('UDP 1492 Admin Surface');
  return adminPage;
}

async function installManagedApiRoutes(page, options = {}) {
  const baseUrl = options.baseUrl || 'https://managed.example.test';
  const apiBaseUrl = buildManagedApiUrl(baseUrl, '/api');
  const openSessionResponse = options.openSessionResponse || {
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
  };
  const channelsResponse = options.channelsResponse || {
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
  };
  const joinResponses = options.joinResponses || {
    chn_alpha: {
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
    }
  };
  const peersResponses = options.peersResponses || {
    chn_alpha: {
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
    }
  };
  const joinErrors = options.joinErrors || {};
  const openSessionRequests = options.openSessionRequests || [];
  const joinRequests = options.joinRequests || [];
  const presenceRequests = options.presenceRequests || [];
  const adminSummaryResponse = options.adminSummaryResponse || {
    viewer: {
      sessionId: openSessionResponse.identity.sessionId,
      userId: openSessionResponse.identity.userId,
      displayName: openSessionResponse.identity.displayName,
      role: 'operator'
    },
    permissions: {
      canReadAdminSummary: true,
      canManageChannels: true,
      canManagePasscodes: true
    },
    directory: {
      channelCount: Array.isArray(channelsResponse.channels) ? channelsResponse.channels.length : 0,
      protectedChannelCount: Array.isArray(channelsResponse.channels)
        ? channelsResponse.channels.filter((channel) => channel.requiresPasscode).length
        : 0,
      openChannelCount: Array.isArray(channelsResponse.channels)
        ? channelsResponse.channels.filter((channel) => !channel.requiresPasscode).length
        : 0,
      activeSessionCount: 1,
      activeOperatorSessionCount: 1,
      activeMemberSessionCount: 0,
      joinedSlotCount: 1,
      activeChannelCount: 1,
      activeMemberCount: 1,
      onlineMemberCount: 1,
      readyEndpointCount: 1,
      sessionTtlMs: 7200000,
      presenceTtlMs: 45000,
      observedAt: '2026-04-16T19:25:10Z'
    },
    channels: (Array.isArray(channelsResponse.channels) ? channelsResponse.channels : []).map((channel) => ({
      ...channel,
      onlineMemberCount: Number(channel.memberCount) ? 1 : 0,
      readyEndpointCount: Number(channel.memberCount) ? 1 : 0,
      lastPresenceAt: '2026-04-16T19:25:00Z'
    }))
  };
  const jsonHeaders = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*'
  };

  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: jsonHeaders, body: '' });
      return;
    }
    if (url.pathname === '/api/session/open') {
      const payload = JSON.parse(request.postData() || '{}');
      openSessionRequests.push({ payload });
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(openSessionResponse)
      });
      return;
    }
    if (url.pathname === '/api/channels') {
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(channelsResponse)
      });
      return;
    }
    if (url.pathname === '/api/admin/summary') {
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(adminSummaryResponse)
      });
      return;
    }
    const joinMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/join$/);
    if (joinMatch) {
      const channelId = decodeURIComponent(joinMatch[1]);
      const payload = JSON.parse(request.postData() || '{}');
      joinRequests.push({ channelId, payload });
      if (joinErrors[channelId]) {
        const joinError = joinErrors[channelId];
        await route.fulfill({
          status: joinError.status || 409,
          headers: jsonHeaders,
          body: JSON.stringify({
            code: joinError.code || 'managed_join_error',
            message: joinError.message || 'Join failed.'
          })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(joinResponses[channelId])
      });
      return;
    }
    const presenceMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/presence$/);
    if (presenceMatch) {
      const channelId = decodeURIComponent(presenceMatch[1]);
      const payload = JSON.parse(request.postData() || '{}');
      presenceRequests.push({ channelId, payload });
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          presence: {
            channelId,
            sessionId: openSessionResponse.identity.sessionId,
            onlineState: 'online',
            lastSeenAt: '2026-04-16T19:23:00Z'
          },
          registrations: [],
          nextHeartbeatAt: '2026-04-16T19:23:15Z'
        })
      });
      return;
    }
    const peersMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/peers$/);
    if (peersMatch) {
      const channelId = decodeURIComponent(peersMatch[1]);
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(peersResponses[channelId])
      });
      return;
    }
    const leaveMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/leave$/);
    if (leaveMatch) {
      const channelId = decodeURIComponent(leaveMatch[1]);
      await route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          membership: {
            channelId,
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

  return { baseUrl, openSessionRequests, joinRequests, presenceRequests };
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
    preferences: {
      micMode: 'single',
      muteState: {
        allMuted: false,
        slotA: false,
        slotB: false
      },
      pttBindings: {
        all: null,
        slotA: null,
        slotB: null
      }
    },
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

test('opens the admin surface with explicit empty state while the main window remains stable', async ({ appHarness }) => {
  const { page } = appHarness;
  const adminPage = await openAdminWindow(appHarness);

  await expect(adminPage.locator('#adminOverviewStatus')).toContainText('Direct mode');
  await expect(adminPage.locator('#adminChannelsList')).toContainText('No channels cached');
  await expect(adminPage.locator('#adminEndpointTable tbody')).toContainText('No resolved endpoints');
  await expect(adminPage.locator('#adminRefreshAllBtn')).toBeDisabled();
  await expect(adminPage.locator('#adminRefreshPeersBtn')).toBeDisabled();

  await expect(page.locator('#connectBtn')).toBeVisible();
  await expect(page.locator('#disconnectBtn')).toBeDisabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('UDP 1492 Desktop');
});

test('persists a newly created peer across restart', async ({ appHarness }) => {
  const { page, readStorage, relaunch } = appHarness;

  await page.locator('#openPeerModalBtn').click();
  await page.locator('#peerModalName').fill('Persist Test');
  await page.locator('#peerModalIp').fill('198.51.100.42');
  await page.locator('#peerModalPort').fill('1492');
  await page.locator('#peerModalSave').click();

  await expect(page.locator('#peerList')).toContainText('Persist Test');

  await expect.poll(async () => {
    const savedStorage = await readStorage();
    return {
      peersPersisted: !!savedStorage.udp1492_peers?.some((peer) => peer.name === 'Persist Test'),
      lastPeerPersisted: Array.isArray(savedStorage.udp1492_last_peers)
        && savedStorage.udp1492_last_peers.includes('198.51.100.42:1492')
    };
  }).toEqual({
    peersPersisted: true,
    lastPeerPersisted: true
  });

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
      preferences: {
        micMode: 'single'
      },
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
      preferences: {
        micMode: 'single'
      },
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

  test('quits cleanly while connected if renderer host sends are still in flight', async ({ appHarness }) => {
    const { page, electronApp } = appHarness;

    await page.locator('#connectBtn').click();
    await expect(page.locator('#disconnectBtn')).toBeEnabled();

    await page.evaluate(() => {
      const timer = window.setInterval(() => {
        window.udp1492.sendHostMessage({ type: 'version', version: 'shutdown-race' }).catch(() => {});
      }, 5);
      window.addEventListener('beforeunload', () => window.clearInterval(timer), { once: true });
    });

    const closed = electronApp.waitForEvent('close');
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.close();
    });
    await closed;
  });

  test('opens a managed session, joins a channel, and adapts resolved peers into host config', async ({ appHarness }) => {
    const { page, getSentHostMessages, readStorage } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page);

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();

    await expect(page.locator('#managedIdentityMeta')).toContainText('usr_01');
    await expect(page.locator('#managedChannelList')).toContainText('Alpha');

    await page.getByRole('button', { name: 'Join Selected' }).click();
    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#managedPeerSyncMeta')).toContainText('1 transport peer');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([
      expect.objectContaining({
        peerKey: '198.51.100.10:1492',
        owningSlots: ['A'],
        route: 'left',
        routeLabel: 'Left ear'
      })
    ]);

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
        shell: {
          activeSlotId: 'A'
        },
        slots: {
          A: {
            intendedChannelId: 'chn_alpha'
          },
          B: {
            intendedChannelId: null
          }
        }
      }
    });
    expect(storage.udp1492_app_state_v2.managed.session).toBeUndefined();
    expect(storage.udp1492_app_state_v2.managed.transportPeers).toBeUndefined();

    await page.locator('#managedLeaveChannelBtn').click();
    await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
    await expect(page.locator('#networkTable tbody')).not.toContainText('Peer One');
  });

  test('renders the admin surface with channels, memberships, endpoints, and local stats', async ({ appHarness }) => {
    const { page } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page);

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.getByRole('button', { name: 'Join Selected' }).click();

    const adminPage = await openAdminWindow(appHarness);
    await expect(adminPage.locator('#adminOverviewStatus')).toContainText('Managed mode');
    await expect(adminPage.locator('#adminChannelsList')).toContainText('Alpha');
    await expect(adminPage.locator('#adminSlotsGrid')).toContainText('joined | presence online');
    await expect(adminPage.locator('#adminEndpointTable tbody')).toContainText('Peer One');
    await expect(adminPage.locator('#adminEndpointTable tbody')).toContainText('ready');
    await expect(adminPage.locator('#adminTransportStatus')).toContainText('1 active transport peers');
    await expect(adminPage.locator('#adminStatsGrid')).toContainText('Transport Peers');
    await expect(adminPage.locator('#adminRefreshAllBtn')).toBeEnabled();
    await expect(adminPage.locator('#adminRefreshPeersBtn')).toBeEnabled();

    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
  });

  test('shows admin refresh failures without disturbing the main managed window', async ({ appHarness }) => {
    const { page } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page);

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.getByRole('button', { name: 'Join Selected' }).click();

    const adminPage = await openAdminWindow(appHarness);

    await page.route(/https:\/\/managed\.example\.test\/api\/channels\/chn_alpha\/peers\?sessionId=.*/, async (route) => {
      await route.fulfill({
        status: 500,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*'
        },
        body: JSON.stringify({
          code: 'peer_sync_failed',
          message: 'Peer refresh failed for admin surface.'
        })
      });
    });

    await adminPage.locator('#adminRefreshPeersBtn').click();
    await expect(adminPage.locator('#adminErrorText')).toContainText('Peer refresh failed for admin surface');
    await expect(adminPage.locator('#adminRefreshStatus')).toHaveText('Read-only snapshot ready');
    await expect(adminPage.locator('#adminRefreshMeta')).toContainText('Peers failed');

    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
  });

  test.describe('managed NAT readiness', () => {
    test.use({
      runtimeEnv: {
        UDP1492_MANAGED_LOCAL_ADDRESSES: '10.0.0.25',
        UDP1492_MANAGED_STUN_SERVERS: 'stun:stun.example.test:3478'
      }
    });

    test('publishes mapped public NAT candidates to presence and exposes them in the admin surface', async ({ appHarness }) => {
      const { page } = appHarness;
      const presenceRequests = [];
      const { baseUrl } = await installManagedApiRoutes(page, { presenceRequests });
      const probeKey = 'A:198.51.100.10:1492';

      await setNatMockDiscoveryResult(page, {
        publicCandidates: [
          {
            kind: 'public',
            ip: '198.51.100.77',
            port: 62000,
            protocol: 'udp',
            source: 'stun'
          }
        ]
      });
      await setNatMockProbeResults(page, {
        [probeKey]: {
          outcome: 'succeeded'
        }
      });

      await page.locator('#operatingModeManaged').click();
      await page.locator('#managedDisplayNameInput').fill('Scot');
      await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
      await page.locator('#managedOpenSessionBtn').click();

      await expect(page.locator('#managedNatStatus')).toContainText('1 local | 1 mapped public candidate');

      await page.getByRole('button', { name: 'Join Selected' }).click();
      await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
      await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
      await expect(page.locator('#managedNatStatus')).toContainText('1 advisory probe(s) succeeded');

      expect(presenceRequests).toHaveLength(1);
      expect(presenceRequests[0].payload.endpoints).toEqual([
        { kind: 'local', ip: '10.0.0.25', port: 1492 },
        { kind: 'public', ip: '198.51.100.77', port: 62000 }
      ]);

      const adminPage = await openAdminWindow(appHarness);
      await expect(adminPage.locator('#adminNatStatus')).toHaveText('Ready');
      await expect(adminPage.locator('#adminNatSummary')).toContainText('1 advisory peer probe(s) succeeded');
      await expect(adminPage.locator('#adminNatCandidateList')).toContainText('10.0.0.25:1492');
      await expect(adminPage.locator('#adminNatCandidateList')).toContainText('198.51.100.77:62000');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Peer One');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Succeeded');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Advisory');

      await clearNatMockDiscoveryResult(page);
      await clearNatMockProbeResults(page);
    });

    test('upgrades NAT probe state when host transport evidence arrives from the real UDP peer path', async ({ appHarness }) => {
      const { page, emitHostMessage } = appHarness;
      const { baseUrl } = await installManagedApiRoutes(page);

      await setNatMockDiscoveryResult(page, {
        publicCandidates: [
          {
            kind: 'public',
            ip: '198.51.100.77',
            port: 62000,
            protocol: 'udp',
            source: 'stun'
          }
        ]
      });

      await page.locator('#operatingModeManaged').click();
      await page.locator('#managedDisplayNameInput').fill('Scot');
      await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
      await page.locator('#managedOpenSessionBtn').click();
      await page.getByRole('button', { name: 'Join Selected' }).click();

      await expect(page.locator('#managedNatStatus')).toContainText('peer probe(s) in progress');

      await emitHostMessage({
        type: 'pingHistory',
        peerKey: '198.51.100.10:1492',
        pingHistory: [
          { sent: 1000000, received: 1012000, rtt: 12000 }
        ]
      });

      await expect(page.locator('#managedNatStatus')).toContainText('1 transport-authoritative probe(s) succeeded');

      const adminPage = await openAdminWindow(appHarness);
      await expect(adminPage.locator('#adminNatSummary')).toContainText('transport-authoritative peer probe(s) succeeded');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Peer One');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Transport evidence');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('12 ms');

      await clearNatMockDiscoveryResult(page);
      await clearNatMockProbeResults(page);
    });

    test('keeps the managed session healthy when mapped public NAT discovery fails', async ({ appHarness }) => {
      const { page } = appHarness;
      const presenceRequests = [];
      const { baseUrl } = await installManagedApiRoutes(page, { presenceRequests });

      await setNatMockDiscoveryResult(page, {
        errorMessage: 'STUN discovery failed.'
      });

      await page.locator('#operatingModeManaged').click();
      await page.locator('#managedDisplayNameInput').fill('Scot');
      await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
      await page.locator('#managedOpenSessionBtn').click();

      await expect(page.locator('#managedNatStatus')).toContainText('mapped public candidate discovery failed');

      await page.getByRole('button', { name: 'Join Selected' }).click();
      await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
      await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
      await expect(page.locator('#networkTable tbody')).toContainText('Peer One');

      expect(presenceRequests).toHaveLength(1);
      expect(presenceRequests[0].payload.endpoints).toEqual([
        { kind: 'local', ip: '10.0.0.25', port: 1492 }
      ]);

      const adminPage = await openAdminWindow(appHarness);
      await expect(adminPage.locator('#adminNatStatus')).toHaveText('Failed');
      await expect(adminPage.locator('#adminNatError')).toContainText('STUN discovery failed.');
      await expect(adminPage.locator('#adminNatCandidateList')).toContainText('10.0.0.25:1492');
      await expect(adminPage.locator('#adminNatCandidateList')).not.toContainText('198.51.100.77:62000');

      await clearNatMockDiscoveryResult(page);
      await clearNatMockProbeResults(page);
    });

    test('keeps the managed session healthy when a NAT peer probe times out', async ({ appHarness }) => {
      const { page } = appHarness;
      const { baseUrl } = await installManagedApiRoutes(page);
      const probeKey = 'A:198.51.100.10:1492';

      await setNatMockDiscoveryResult(page, {
        publicCandidates: [
          {
            kind: 'public',
            ip: '198.51.100.77',
            port: 62000,
            protocol: 'udp',
            source: 'stun'
          }
        ]
      });
      await setNatMockProbeResults(page, {
        [probeKey]: {
          outcome: 'timed_out',
          errorMessage: 'Advisory NAT probe timed out.'
        }
      });

      await page.locator('#operatingModeManaged').click();
      await page.locator('#managedDisplayNameInput').fill('Scot');
      await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
      await page.locator('#managedOpenSessionBtn').click();
      await page.getByRole('button', { name: 'Join Selected' }).click();

      await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
      await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
      await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
      await expect(page.locator('#managedNatStatus')).toContainText('1 peer probe(s) timed out');

      const adminPage = await openAdminWindow(appHarness);
      await expect(adminPage.locator('#adminNatSummary')).toContainText('peer probe(s) timed out');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Peer One');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Timed Out');
      await expect(adminPage.locator('#adminNatProbeList')).toContainText('Advisory NAT probe timed out.');

      await clearNatMockDiscoveryResult(page);
      await clearNatMockProbeResults(page);
    });
  });

  test('requires a passcode for protected managed channels and sends it on join', async ({ appHarness }) => {
    const { page, readStorage } = appHarness;
    const joinRequests = [];
    const { baseUrl } = await installManagedApiRoutes(page, {
      joinRequests,
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected command channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: false,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'A',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:22:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected command channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: false,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [],
          resolvedAt: '2026-04-16T19:25:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();

    await expect(page.locator('#managedLobbyStatus')).toContainText('0 open | 1 protected');
    await expect(page.locator('#managedChannelList')).toContainText('Bravo');
    await expect(page.locator('#managedChannelList')).toContainText('Protected');
    await expect(page.locator('#managedChannelList')).toContainText('Passcode required before join');
    await page.getByRole('button', { name: 'Join Selected' }).click();
    await expect(page.locator('#managedErrorText')).toContainText('requires a passcode');
    await expect(page.locator('#managedPasscodeLabel')).toContainText('Required');

    await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
    await page.getByRole('button', { name: 'Join Selected' }).click();
    await expect(page.locator('#managedActiveChannel')).toHaveText('Bravo');
    await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');
    expect(joinRequests).toHaveLength(1);
    expect(joinRequests[0]).toMatchObject({
      channelId: 'chn_bravo',
      payload: {
        sessionId: 'ses_01',
        slotId: 'A',
        passcode: 'alpha-secret'
      }
    });
    const storageAfterJoin = await readStorage();
    expect(JSON.stringify(storageAfterJoin)).not.toContain('alpha-secret');

    await page.locator('#managedJoinPasscodeInput').fill('stale-secret');
    await page.locator('#managedLeaveChannelBtn').click();
    await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');
  });

  test('can target Group B from a clean managed session', async ({ appHarness }) => {
    const { page } = appHarness;
    const joinRequests = [];
    const { baseUrl } = await installManagedApiRoutes(page, {
      joinRequests,
      joinResponses: {
        chn_alpha: {
          membership: {
            channelId: 'chn_alpha',
            slotId: 'B',
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
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedSelectGroupB').click();
    await expect(page.locator('#managedActiveSlotLabel')).toHaveText('Group B');

    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join' }).click();
    await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('No active managed membership');
    await expect(page.locator('#managedGroupBTitle')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupBStatus')).toContainText('joined');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([
      expect.objectContaining({
        peerKey: '198.51.100.10:1492',
        owningSlots: ['B'],
        route: 'right',
        routeLabel: 'Right ear'
      })
    ]);
    expect(joinRequests).toHaveLength(1);
    expect(joinRequests[0]).toMatchObject({
      channelId: 'chn_alpha',
      payload: {
        sessionId: 'ses_01',
        slotId: 'B'
      }
    });
  });

  test.describe('managed presence publication', () => {
    test.use({
      runtimeEnv: {
        UDP1492_MANAGED_LOCAL_ADDRESSES: '10.0.0.25'
      }
    });

    test('publishes a desktop transport endpoint in managed presence', async ({ appHarness }) => {
      const { page } = appHarness;
      const presenceRequests = [];
      const { baseUrl } = await installManagedApiRoutes(page, { presenceRequests });

      await page.locator('#operatingModeManaged').click();
      await page.locator('#managedDisplayNameInput').fill('Scot');
      await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
      await page.locator('#managedOpenSessionBtn').click();
      await page.getByRole('button', { name: 'Join Selected' }).click();

      await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
      expect(presenceRequests.length).toBeGreaterThan(0);
      expect(presenceRequests[0]).toMatchObject({
        channelId: 'chn_alpha',
        payload: {
          sessionId: 'ses_01',
          slotId: 'A',
          onlineState: 'online'
        }
      });
      expect(presenceRequests[0].payload.endpoints).toEqual([
        {
          kind: 'local',
          ip: '10.0.0.25',
          port: 1492
        }
      ]);
    });
  });

  test('keeps the current channel active when a replacement join fails', async ({ appHarness }) => {
    const { page } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinErrors: {
        chn_bravo: {
          status: 409,
          code: 'channel_switch_denied',
          message: 'Unable to switch channels right now.'
        }
      },
      peersResponses: {
        chn_alpha: {
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
        },
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [],
          resolvedAt: '2026-04-16T19:25:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();

    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');

    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join' }).click();
    await expect(page.locator('#managedErrorText')).toContainText('Unable to switch channels right now.');
    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
  });

  test('supports dual-slot membership and aggregates peers from Group A and Group B', async ({ appHarness }) => {
    const { page, getSentHostMessages } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_alpha: {
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
            memberCount: 4
          }
        },
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'B',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:23:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_alpha: {
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
        },
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [
            {
              userId: 'usr_peer_02',
              sessionId: 'ses_peer_02',
              channelId: 'chn_bravo',
              displayName: 'Peer Two',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_02',
                  kind: 'public',
                  ip: '198.51.100.11',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:26:00Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:26:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();

    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();
    await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');

    await page.locator('#managedSelectGroupB').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join' }).click();

    await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#managedGroupBTitle')).toHaveText('Bravo');
    await expect(page.locator('#managedGroupBStatus')).toContainText('joined');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer Two');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([
      expect.objectContaining({
        peerKey: '198.51.100.10:1492',
        owningSlots: ['A'],
        route: 'left',
        routeLabel: 'Left ear'
      }),
      expect.objectContaining({
        peerKey: '198.51.100.11:1492',
        owningSlots: ['B'],
        route: 'right',
        routeLabel: 'Right ear'
      })
    ]);

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      return messages
        .filter((message) => message.type === 'configure')
        .some((message) => Array.isArray(message.peers)
          && message.peers.some((peer) => peer.name === 'Peer One')
          && message.peers.some((peer) => peer.name === 'Peer Two'));
    }).toBe(true);
  });

  test('computes Commander targets for single mode, Group A, Group B, and shared overlap without duplicate sends', async ({ appHarness }) => {
    const { page, getSentHostMessages, readStorage } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_alpha: {
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
            memberCount: 4
          }
        },
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'B',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:23:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_alpha: {
          channelId: 'chn_alpha',
          peers: [
            {
              userId: 'usr_peer_01',
              sessionId: 'ses_peer_01',
              channelId: 'chn_alpha',
              displayName: 'Peer Alpha',
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
            },
            {
              userId: 'usr_peer_shared',
              sessionId: 'ses_peer_shared',
              channelId: 'chn_alpha',
              displayName: 'Peer Shared',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_shared_01',
                  kind: 'public',
                  ip: '198.51.100.12',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:25:30Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:25:05Z'
        },
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [
            {
              userId: 'usr_peer_02',
              sessionId: 'ses_peer_02',
              channelId: 'chn_bravo',
              displayName: 'Peer Bravo',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_02',
                  kind: 'public',
                  ip: '198.51.100.11',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:26:00Z'
                }
              ]
            },
            {
              userId: 'usr_peer_shared',
              sessionId: 'ses_peer_shared_b',
              channelId: 'chn_bravo',
              displayName: 'Peer Shared Bravo',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_shared_02',
                  kind: 'public',
                  ip: '198.51.100.12',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:26:30Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:26:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();
    await page.locator('#managedSelectGroupB').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join' }).click();

    await expect.poll(async () => getCommanderSnapshot(page)).toMatchObject({
      mode: 'managed',
      micMode: 'single',
      muteState: {
        allMuted: false,
        slotA: false,
        slotB: false
      },
      targets: {
        all: ['198.51.100.10:1492', '198.51.100.12:1492', '198.51.100.11:1492'],
        slotA: ['198.51.100.10:1492', '198.51.100.12:1492'],
        slotB: ['198.51.100.11:1492', '198.51.100.12:1492'],
        active: ['198.51.100.10:1492', '198.51.100.12:1492', '198.51.100.11:1492']
      }
    });

    await page.locator('#managedMuteAllBtn').click();
    await expect.poll(async () => getCommanderSnapshot(page)).toMatchObject({
      micMode: 'single',
      muteState: {
        allMuted: true
      },
      targets: {
        active: []
      }
    });

    await expect.poll(async () => {
      const storage = await readStorage();
      return storage.udp1492_app_state_v2.preferences;
    }).toMatchObject({
      micMode: 'single',
      muteState: {
        allMuted: true,
        slotA: false,
        slotB: false
      }
    });

    await page.locator('#managedMuteAllBtn').click();
    await sendCommanderTestFrame(page);
    await expect.poll(async () => {
      const sendMessages = (await getSentHostMessages()).filter((message) => message.type === 'sendData');
      return sendMessages.at(-1)?.destination ?? 'all';
    }).toBe('all');

    await page.locator('#managedMicModeCommander').click();
    await expect.poll(async () => getCommanderSnapshot(page)).toMatchObject({
      micMode: 'commander',
      targets: {
        active: []
      }
    });

    await page.locator('#managedPttGroupABtn').dispatchEvent('pointerdown');
    await expect.poll(async () => getCommanderSnapshot(page)).toMatchObject({
      micMode: 'commander',
      holdState: {
        slotA: true,
        slotB: false,
        all: false
      },
      targets: {
        active: ['198.51.100.10:1492', '198.51.100.12:1492']
      }
    });
    await sendCommanderTestFrame(page);
    await expect.poll(async () => {
      const sendMessages = (await getSentHostMessages()).filter((message) => message.type === 'sendData');
      return sendMessages.slice(-2).map((message) => message.destination).sort();
    }).toEqual(['198.51.100.10:1492', '198.51.100.12:1492']);
    await page.locator('#managedPttGroupABtn').dispatchEvent('pointerup');

    await page.locator('#managedPttGroupABtn').dispatchEvent('pointerdown');
    await page.locator('#managedPttGroupBBtn').dispatchEvent('pointerdown');
    await expect.poll(async () => getCommanderSnapshot(page)).toMatchObject({
      micMode: 'commander',
      holdState: {
        slotA: true,
        slotB: true
      },
      targets: {
        active: ['198.51.100.10:1492', '198.51.100.12:1492', '198.51.100.11:1492']
      }
    });
    await sendCommanderTestFrame(page);
    await expect.poll(async () => {
      const sendMessages = (await getSentHostMessages()).filter((message) => message.type === 'sendData');
      return sendMessages.slice(-3).map((message) => message.destination).sort();
    }).toEqual(['198.51.100.10:1492', '198.51.100.11:1492', '198.51.100.12:1492']);
    await page.locator('#managedPttGroupABtn').dispatchEvent('pointerup');
    await page.locator('#managedPttGroupBBtn').dispatchEvent('pointerup');
  });

  test('leaving Group B preserves an active Group A membership and its peers', async ({ appHarness }) => {
    const { page, getSentHostMessages } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_alpha: {
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
            memberCount: 4
          }
        },
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'B',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:23:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_alpha: {
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
        },
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [
            {
              userId: 'usr_peer_02',
              sessionId: 'ses_peer_02',
              channelId: 'chn_bravo',
              displayName: 'Peer Two',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_02',
                  kind: 'public',
                  ip: '198.51.100.11',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:26:00Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:26:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();
    await page.locator('#managedSelectGroupB').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join' }).click();

    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer Two');

    await page.locator('#managedLeaveChannelBtn').click();

    await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#managedGroupBStatus')).toContainText('No active managed membership');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
    await expect(page.locator('#networkTable tbody')).not.toContainText('Peer Two');

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      const configureMessages = messages.filter((message) => message.type === 'configure');
      const lastConfigure = configureMessages.at(-1);
      return Array.isArray(lastConfigure?.peers) ? lastConfigure.peers.map((peer) => peer.name).sort().join(',') : '';
    }).toBe('Peer One');
  });

  test('a failed Group B replacement join does not tear down active Group A or Group B memberships', async ({ appHarness }) => {
    const { page } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          },
          {
            channelId: 'chn_charlie',
            name: 'Charlie',
            description: 'Protected replacement channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: true,
            memberCount: 1
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinErrors: {
        chn_charlie: {
          status: 403,
          code: 'passcode_invalid',
          message: 'Incorrect passcode.'
        }
      },
      joinResponses: {
        chn_alpha: {
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
            memberCount: 4
          }
        },
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'B',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:23:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_alpha: {
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
        },
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [
            {
              userId: 'usr_peer_02',
              sessionId: 'ses_peer_02',
              channelId: 'chn_bravo',
              displayName: 'Peer Two',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_02',
                  kind: 'public',
                  ip: '198.51.100.11',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:26:00Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:26:05Z'
        },
        chn_charlie: {
          channelId: 'chn_charlie',
          peers: [],
          resolvedAt: '2026-04-16T19:27:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();
    await page.locator('#managedSelectGroupB').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join' }).click();

    await page.locator('#managedJoinPasscodeInput').fill('wrong-secret');
    await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('wrong-secret');
    await page.locator('#managedChannelList li').filter({ hasText: 'Charlie' }).getByRole('button', { name: 'Join Protected' }).click();

    await expect(page.locator('#managedErrorText')).toContainText(/Incorrect passcode|requires a passcode/i);
    await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#managedGroupBTitle')).toHaveText('Bravo');
    await expect(page.locator('#managedGroupBStatus')).toContainText('joined');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer Two');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([
      expect.objectContaining({
        peerKey: '198.51.100.10:1492',
        owningSlots: ['A'],
        route: 'left',
        routeLabel: 'Left ear'
      }),
      expect.objectContaining({
        peerKey: '198.51.100.11:1492',
        owningSlots: ['B'],
        route: 'right',
        routeLabel: 'Right ear'
      })
    ]);
  });

  test('dedupes overlapping endpoints across Group A and Group B and keeps the shared peer until both slots release it', async ({ appHarness }) => {
    const { page, getSentHostMessages } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_alpha: {
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
            memberCount: 4
          }
        },
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'B',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:23:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Secondary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_alpha: {
          channelId: 'chn_alpha',
          peers: [
            {
              userId: 'usr_peer_01',
              sessionId: 'ses_peer_01',
              channelId: 'chn_alpha',
              displayName: 'Peer Shared Alpha',
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
        },
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [
            {
              userId: 'usr_peer_02',
              sessionId: 'ses_peer_02',
              channelId: 'chn_bravo',
              displayName: 'Peer Shared Bravo',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_02',
                  kind: 'public',
                  ip: '198.51.100.10',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:26:00Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:26:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();
    await page.locator('#managedSelectGroupB').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join' }).click();

    await expect(page.locator('#networkTable tbody')).toContainText('Peer Shared Alpha');
    await expect(page.locator('#networkTable tbody')).not.toContainText('Peer Shared Bravo');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([
      expect.objectContaining({
        peerKey: '198.51.100.10:1492',
        owningSlots: ['A', 'B'],
        route: 'center',
        routeLabel: 'Both ears'
      })
    ]);

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      const configureMessages = messages.filter((message) => message.type === 'configure');
      const lastConfigure = configureMessages.at(-1);
      return Array.isArray(lastConfigure?.peers) ? lastConfigure.peers.length : -1;
    }).toBe(1);

    await page.locator('#managedLeaveChannelBtn').click();
    await expect(page.locator('#networkTable tbody')).toContainText('Peer Shared Alpha');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([
      expect.objectContaining({
        peerKey: '198.51.100.10:1492',
        owningSlots: ['A'],
        route: 'left',
        routeLabel: 'Left ear'
      })
    ]);

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      const configureMessages = messages.filter((message) => message.type === 'configure');
      const lastConfigure = configureMessages.at(-1);
      return Array.isArray(lastConfigure?.peers) ? lastConfigure.peers.length : -1;
    }).toBe(1);

    await page.locator('#managedSelectGroupA').click();
    await page.locator('#managedLeaveChannelBtn').click();
    await expect(page.locator('#networkTable tbody')).not.toContainText('Peer Shared Alpha');
    await expect.poll(async () => getAudioRoutingSnapshot(page)).toEqual([]);

    await expect.poll(async () => {
      const messages = await getSentHostMessages();
      const configureMessages = messages.filter((message) => message.type === 'configure');
      const lastConfigure = configureMessages.at(-1);
      return Array.isArray(lastConfigure?.peers) ? lastConfigure.peers.length : -1;
    }).toBe(0);
  });

  test('preserves the current open membership when a protected replacement join is denied', async ({ appHarness }) => {
    const { page } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 4
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected command channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinErrors: {
        chn_bravo: {
          status: 403,
          code: 'passcode_invalid',
          message: 'Incorrect passcode.'
        }
      },
      joinResponses: {
        chn_alpha: {
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
            memberCount: 4
          }
        }
      },
      peersResponses: {
        chn_alpha: {
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
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.locator('#managedChannelList li').filter({ hasText: 'Alpha' }).getByRole('button', { name: 'Join Selected' }).click();

    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');

    await page.locator('#managedJoinPasscodeInput').fill('wrong-secret');
    await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).getByRole('button', { name: 'Join Protected' }).click();

    await expect(page.locator('#managedErrorText')).toContainText('Incorrect passcode');
    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
    await expect(page.locator('#managedIntentStatus')).toContainText('Incorrect passcode');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
  });

  test('clears stale managed state when the backend expires the session during peer refresh', async ({ appHarness }) => {
    const { page } = appHarness;
    const { baseUrl } = await installManagedApiRoutes(page);

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill(baseUrl);
    await page.locator('#managedOpenSessionBtn').click();
    await page.getByRole('button', { name: 'Join Selected' }).click();

    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
    await page.locator('#managedJoinPasscodeInput').fill('stale-secret');

    await page.route(/https:\/\/managed\.example\.test\/api\/channels\/chn_alpha\/peers\?sessionId=.*/, async (route) => {
      await route.fulfill({
        status: 401,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*'
        },
        body: JSON.stringify({
          code: 'session_expired',
          message: 'Session expired. Open a new session.'
        })
      });
    });

    await page.locator('#managedRefreshPeersBtn').click();
    await expect(page.locator('#managedErrorText')).toContainText('Session expired');
    await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
    await expect(page.locator('#managedIdentityMeta')).not.toContainText('Session ses_01');
    await expect(page.locator('#networkTable tbody')).not.toContainText('Peer One');
    await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');
  });

  test.describe('runtime configured backend target', () => {
    test.use({
      runtimeEnv: {
        UDP1492_MANAGED_BACKEND_URL: 'https://managed.example.test/api',
        UDP1492_MANAGED_REQUEST_TIMEOUT_MS: '4000'
      }
    });

    test('uses the app-configured backend URL when no profile URL is stored', async ({ appHarness }) => {
      const { page, readStorage } = appHarness;
      const baseUrl = 'https://managed.example.test/api';
      await installManagedApiRoutes(page, { baseUrl });

      await page.locator('#operatingModeManaged').click();
      await page.locator('#managedDisplayNameInput').fill('Scot');
      await expect(page.locator('#managedProfileStatus')).toContainText('app config');
      await page.locator('#managedOpenSessionBtn').click();

      await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_01');
      const savedStorage = await readStorage();
      expect(savedStorage.udp1492_managed_profile.backendBaseUrl).toBe('');
    });
  });

  test('forces a fresh session when the operator explicitly reopens managed mode', async ({ appHarness }) => {
    const { page } = appHarness;
    const firstOpenSessionRequests = [];
    const secondOpenSessionRequests = [];
    await installManagedApiRoutes(page, {
      baseUrl: 'https://managed-one.example.test',
      openSessionRequests: firstOpenSessionRequests,
      openSessionResponse: {
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
      }
    });
    await installManagedApiRoutes(page, {
      baseUrl: 'https://managed-two.example.test',
      openSessionRequests: secondOpenSessionRequests,
      openSessionResponse: {
        identity: {
          userId: 'usr_02',
          sessionId: 'ses_02',
          displayName: 'Scot Two'
        },
        session: {
          openedAt: '2026-04-16T19:30:00Z',
          expiresAt: '2026-04-16T21:30:00Z',
          heartbeatIntervalMs: 15000
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await page.locator('#managedDisplayNameInput').fill('Scot');
    await page.locator('#managedBackendBaseUrlInput').fill('https://managed-one.example.test');
    await page.locator('#managedOpenSessionBtn').click();
    await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_01');

    await page.locator('#managedDisplayNameInput').fill('Scot Two');
    await expect(page.locator('#managedDisplayNameInput')).toHaveValue('Scot Two');
    await page.locator('#managedBackendBaseUrlInput').fill('https://managed-two.example.test');
    await page.locator('#managedOpenSessionBtn').click();

    await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_02');
    expect(firstOpenSessionRequests).toHaveLength(1);
    expect(secondOpenSessionRequests).toHaveLength(1);
    expect(firstOpenSessionRequests[0].payload.resumeSessionId).toBeNull();
    expect(secondOpenSessionRequests[0].payload.resumeSessionId).toBeNull();
    expect(secondOpenSessionRequests[0].payload.displayName).toBe('Scot Two');
    await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
  });
});

test.describe('managed resume fixture', () => {
  test.use({ storageFixture: MANAGED_RESUME_STORAGE_FIXTURE });

  test('auto-resumes managed mode on mode switch when profile and channel intent already exist', async ({ appHarness }) => {
    const { page } = appHarness;
    await installManagedApiRoutes(page, {
      openSessionResponse: {
        identity: {
          userId: 'usr_01',
          sessionId: 'ses_new',
          displayName: 'Scot'
        },
        session: {
          openedAt: '2026-04-16T19:20:00Z',
          expiresAt: '2026-04-16T21:20:00Z',
          heartbeatIntervalMs: 15000
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await expect(page.locator('#managedIdentityMeta')).toContainText('ses_new');
    await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
    await expect(page.locator('#networkTable tbody')).toContainText('Peer One');
  });

  test('shows a clear error when the backend returns an invalid session payload', async ({ appHarness }) => {
    const { page } = appHarness;
    const baseUrl = 'https://managed.example.test';
    await page.route(`${baseUrl}/api/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': '*'
          },
          body: ''
        });
        return;
      }
      if (url.pathname === '/api/session/open') {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*'
          },
          body: JSON.stringify({
            identity: {
              userId: 'usr_01',
              displayName: 'Scot'
            },
            session: {
              openedAt: '2026-04-16T19:20:00Z',
              heartbeatIntervalMs: 15000
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

    await expect(page.locator('#managedErrorText')).toContainText('invalid session response');
    await expect(page.locator('#managedIdentityMeta')).not.toContainText('Session');
  });
});

test.describe('managed slot intent precedence', () => {
  test.use({ storageFixture: MANAGED_SLOT_PRECEDENCE_STORAGE_FIXTURE });

  test('uses slot intent instead of legacy profile preference during managed resume', async ({ appHarness }) => {
    const { page } = appHarness;
    await page.evaluate(() => {
      const input = document.querySelector('#managedJoinPasscodeInput');
      if (!input) throw new Error('managedJoinPasscodeInput not found');
      input.value = 'stale-secret';
    });
    await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 3
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected coordination channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'A',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:22:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected coordination channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [
            {
              userId: 'usr_peer_02',
              sessionId: 'ses_peer_02',
              channelId: 'chn_bravo',
              displayName: 'Peer Bravo',
              connectionState: 'idle',
              endpoints: [
                {
                  endpointId: 'end_02',
                  kind: 'public',
                  ip: '198.51.100.11',
                  port: 1492,
                  registrationState: 'ready',
                  lastValidatedAt: '2026-04-16T19:25:00Z'
                }
              ]
            }
          ],
          resolvedAt: '2026-04-16T19:25:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await expect(page.locator('#managedErrorText')).toContainText('complete resume');
    await expect(page.locator('#managedIntentStatus')).toContainText('Enter the passcode and choose Join Selected');
    await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
    await expect(page.locator('#managedPasscodeLabel')).toContainText('Required');
    await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');
    await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
    await page.getByRole('button', { name: 'Join Selected' }).click();

    await expect(page.locator('#managedActiveChannel')).toHaveText('Bravo');
    await expect(page.locator('#managedPeerSyncMeta')).toContainText('1 transport peer');
  });
});

test.describe('managed Group B resume fixture', () => {
  test.use({ storageFixture: MANAGED_GROUP_B_RESUME_STORAGE_FIXTURE });

  test('shows recoverable protected resume state for Group B without disturbing Group A', async ({ appHarness }) => {
    const { page } = appHarness;
    await installManagedApiRoutes(page, {
      channelsResponse: {
        channels: [
          {
            channelId: 'chn_alpha',
            name: 'Alpha',
            description: 'Primary coordination channel',
            securityMode: 'open',
            requiresPasscode: false,
            concurrentAccessAllowed: true,
            memberCount: 3
          },
          {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected coordination channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        ],
        syncedAt: '2026-04-16T19:21:00Z'
      },
      joinResponses: {
        chn_bravo: {
          membership: {
            channelId: 'chn_bravo',
            slotId: 'B',
            membershipState: 'joined',
            joinedAt: '2026-04-16T19:22:00Z'
          },
          channel: {
            channelId: 'chn_bravo',
            name: 'Bravo',
            description: 'Protected coordination channel',
            securityMode: 'passcode',
            requiresPasscode: true,
            concurrentAccessAllowed: true,
            memberCount: 2
          }
        }
      },
      peersResponses: {
        chn_bravo: {
          channelId: 'chn_bravo',
          peers: [],
          resolvedAt: '2026-04-16T19:25:05Z'
        }
      }
    });

    await page.locator('#operatingModeManaged').click();
    await expect(page.locator('#managedActiveSlotLabel')).toHaveText('Group B');
    await expect(page.locator('#managedErrorText')).toContainText('complete resume');
    await expect(page.locator('#managedGroupATitle')).toHaveText('No channel selected');
    await expect(page.locator('#managedGroupAStatus')).toContainText('No active managed membership');
    await expect(page.locator('#managedGroupBStatus')).toContainText('target Bravo');
    await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');

    await page.locator('#managedJoinPasscodeInput').fill('bravo-secret');
    await page.getByRole('button', { name: 'Join Selected' }).click();

    await expect(page.locator('#managedGroupBTitle')).toHaveText('Bravo');
    await expect(page.locator('#managedGroupBStatus')).toContainText('joined');
  });
});

test.describe('managed legacy state migration', () => {
  test.use({ storageFixture: MANAGED_LEGACY_STATE_STORAGE_FIXTURE });

  test('normalizes legacy managed app state into slot intent persistence on startup', async ({ appHarness }) => {
    const { readStorage } = appHarness;

    await expect.poll(async () => {
      const storage = await readStorage();
      return storage.udp1492_app_state_v2;
    }).toMatchObject({
      version: 2,
      operatingMode: 'managed',
      preferences: {
        micMode: 'single',
        muteState: {
          allMuted: false,
          slotA: false,
          slotB: false
        }
      },
      direct: {
        activePeerKeys: []
      },
      managed: {
        shell: {
          activeSlotId: 'A'
        },
        slots: {
          A: {
            intendedChannelId: 'chn_alpha'
          },
          B: {
            intendedChannelId: null
          }
        }
      }
    });

    const normalizedStorage = await readStorage();
    expect(normalizedStorage.udp1492_app_state_v2.managed.session).toBeUndefined();
    expect(normalizedStorage.udp1492_app_state_v2.managed.transportPeers).toBeUndefined();
    expect(normalizedStorage.udp1492_managed_profile.preferredChannelId).toBe('chn_alpha');
  });
});
