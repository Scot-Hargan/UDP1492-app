const { test, expect } = require('./fixtures');

test.describe.configure({ mode: 'serial' });

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

async function requestManagedBackend(baseUrl, pathname, options = {}) {
  const response = await fetch(buildManagedApiUrl(baseUrl, pathname), {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function openManagedSession(page, displayName = 'Scot') {
  await page.locator('#operatingModeManaged').click();
  await page.locator('#managedDisplayNameInput').fill(displayName);
  await expect(page.locator('#managedProfileStatus')).toContainText('app config');
  await page.locator('#managedOpenSessionBtn').click();
  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');
}

async function openPeerSession(baseUrl, displayName = 'Peer Two') {
  const opened = await requestManagedBackend(baseUrl, '/api/session/open', {
    method: 'POST',
    body: {
      displayName,
      mode: 'managed',
      clientVersion: 'playwright-live'
    }
  });
  expect(opened.response.status).toBe(200);
  return opened.payload;
}

async function joinPeerChannel(baseUrl, sessionId, channelId, slotId = 'A', passcode = null) {
  const joined = await requestManagedBackend(baseUrl, `/api/channels/${channelId}/join`, {
    method: 'POST',
    body: {
      sessionId,
      slotId,
      passcode
    }
  });
  expect(joined.response.status).toBe(200);
  return joined.payload;
}

async function sendPeerPresence(baseUrl, sessionId, channelId, endpoint, slotId = 'A') {
  const presence = await requestManagedBackend(baseUrl, `/api/channels/${channelId}/presence`, {
    method: 'POST',
    body: {
      sessionId,
      slotId,
      onlineState: 'online',
      endpoints: [endpoint]
    }
  });
  expect(presence.response.status).toBe(200);
  return presence.payload;
}

async function leavePeerChannel(baseUrl, sessionId, channelId, slotId = 'A') {
  const leave = await requestManagedBackend(baseUrl, `/api/channels/${channelId}/leave`, {
    method: 'POST',
    body: {
      sessionId,
      slotId
    }
  });
  expect(leave.response.status).toBe(200);
  return leave.payload;
}

test.use({
  runtimeEnv: {
    UDP1492_MANAGED_BACKEND_URL: 'http://127.0.0.1:8791/api',
    UDP1492_MANAGED_REQUEST_TIMEOUT_MS: '4000'
  }
});

test('opens a managed session against the local Worker, joins a seeded channel, resolves a real peer, and leaves cleanly', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await openManagedSession(page);
  await expect(page.locator('#managedLobbyStatus')).toContainText('1 open | 1 protected');
  await expect(page.locator('#managedChannelList')).toContainText('Alpha');
  await expect(page.locator('#managedChannelList')).toContainText('Bravo');
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  const peerSession = await openPeerSession(managedBackendBaseUrl, 'Peer Two');
  await joinPeerChannel(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.10',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Peer Two');
  await expect(page.locator('#networkTable tbody')).toContainText('198.51.100.10');

  const peerLeave = await requestManagedBackend(managedBackendBaseUrl, '/api/channels/chn_alpha/leave', {
    method: 'POST',
    body: {
      sessionId: peerSession.identity.sessionId,
      slotId: 'A'
    }
  });
  expect(peerLeave.response.status).toBe(200);

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).not.toContainText('Peer Two');

  await page.locator('#managedLeaveChannelBtn').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
});

test('enforces protected seeded-channel passcodes against the real Worker', async ({ appHarness }) => {
  const { page } = appHarness;

  await openManagedSession(page);

  await expect(page.locator('#managedChannelList')).toContainText('Bravo');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedErrorText')).toContainText(/requires a passcode/i);

  await page.locator('#managedJoinPasscodeInput').fill('wrong-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedErrorText')).toContainText(/invalid.*passcode|supplied passcode is invalid/i);

  await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Bravo');
  await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');
});

test('creates, updates, and deletes a managed channel against the real Worker from the admin surface', async ({ appHarness }) => {
  const { page } = appHarness;
  const createdName = `Ops ${Date.now().toString().slice(-6)}`;
  const updatedName = `${createdName} Updated`;

  await sleep(3200);
  await openManagedSession(page);

  const adminPage = await openAdminWindow(appHarness);
  await expect(adminPage.locator('#adminChannelsList')).toContainText('Alpha');
  await expect(adminPage.locator('#adminChannelsList')).toContainText('Bravo');

  await adminPage.locator('#adminChannelEditorSelect').selectOption('');
  await adminPage.locator('#adminChannelNameInput').fill(createdName);
  await adminPage.locator('#adminChannelSecurityModeSelect').selectOption('passcode');
  await adminPage.locator('#adminChannelPasscodeInput').fill('ops-secret');
  await adminPage.locator('#adminChannelDescriptionInput').fill('Live backend protected channel');
  await adminPage.locator('#adminChannelConcurrentAccessInput').uncheck();
  await adminPage.locator('#adminChannelCreateBtn').click();

  await expect(adminPage.locator('#adminChannelsList')).toContainText(createdName);
  await expect(page.locator('#managedChannelList')).toContainText(createdName);

  await adminPage.locator('#adminChannelEditorSelect').selectOption({ label: createdName });
  await expect(adminPage.locator('#adminChannelConcurrentAccessInput')).not.toBeChecked();
  await adminPage.locator('#adminChannelNameInput').fill(updatedName);
  await adminPage.locator('#adminChannelSecurityModeSelect').selectOption('open');
  await expect(adminPage.locator('#adminChannelPasscodeInput')).toBeDisabled();
  await adminPage.locator('#adminChannelDescriptionInput').fill('Live backend updated channel');
  await adminPage.locator('#adminChannelConcurrentAccessInput').check();
  await adminPage.locator('#adminChannelSaveBtn').click();

  await expect(adminPage.locator('#adminChannelsList')).toContainText(updatedName);
  await expect(page.locator('#managedChannelList')).toContainText(updatedName);

  await adminPage.locator('#adminChannelEditorSelect').selectOption({ label: updatedName });
  await adminPage.locator('#adminChannelDeleteBtn').click();

  await expect(adminPage.locator('#adminChannelsList')).not.toContainText(updatedName);
  await expect(page.locator('#managedChannelList')).not.toContainText(updatedName);
  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');
});

test('shows backend admin facts in read-only mode for member sessions against the real Worker', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await sleep(3200);
  const operatorSession = await openPeerSession(managedBackendBaseUrl, 'Holding Operator');
  expect(operatorSession.identity.role).toBe('operator');

  await openManagedSession(page, 'Member Desktop');
  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');

  const adminPage = await openAdminWindow(appHarness);
  await expect(adminPage.locator('#adminBackendStatus')).toHaveText('member session');
  await expect(adminPage.locator('#adminBackendFacts')).toContainText('Permissions | channels no | passcodes no');
  await expect(adminPage.locator('#adminChannelEditorMeta')).toHaveText('Read-only');
  await expect(adminPage.locator('#adminChannelEditorStatus')).toContainText('does not currently have permission to mutate channels');
  await expect(adminPage.locator('#adminChannelEditorSelect')).toBeDisabled();
  await expect(adminPage.locator('#adminChannelCreateBtn')).toBeDisabled();
  await expect(adminPage.locator('#adminChannelSaveBtn')).toBeDisabled();
  await expect(adminPage.locator('#adminChannelDeleteBtn')).toBeDisabled();

  const memberSessionId = await page.evaluate(() => window.udp1492AdminDebug?.getSnapshot?.()?.managed?.session?.sessionId || '');
  expect(memberSessionId).toMatch(/^ses_/);

  const forbiddenCreate = await requestManagedBackend(managedBackendBaseUrl, '/api/admin/channels/create', {
    method: 'POST',
    body: {
      sessionId: memberSessionId,
      name: 'Forbidden Member Channel',
      description: 'Should fail',
      note: '',
      securityMode: 'open',
      concurrentAccessAllowed: true
    }
  });
  expect(forbiddenCreate.response.status).toBe(403);
  expect(forbiddenCreate.payload.code).toBe('managed_admin_forbidden');
});

test('preserves the active Alpha membership when a protected replacement join is denied by the real Worker', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await openManagedSession(page);
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  const peerSession = await openPeerSession(managedBackendBaseUrl, 'Alpha Peer');
  await joinPeerChannel(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.31',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Alpha Peer');

  await page.locator('#managedJoinPasscodeInput').fill('wrong-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedErrorText')).toContainText(/invalid.*passcode|supplied passcode is invalid/i);
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Alpha Peer');
});

test('removes stale peers after presence timeout while the desktop session stays active', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await openManagedSession(page);
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  const peerSession = await openPeerSession(managedBackendBaseUrl, 'Stale Peer');
  await joinPeerChannel(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.25',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Stale Peer');

  await sleep(1600);
  await page.evaluate(() => window.udp1492ManagedDebug.sendPresence('A'));
  await sleep(1400);

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).not.toContainText('Stale Peer');
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
});

test('switches from Alpha to protected Bravo without leaving the desktop client in a broken state', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await openManagedSession(page);
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  const peerSession = await openPeerSession(managedBackendBaseUrl, 'Alpha Peer');
  await joinPeerChannel(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.30',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Alpha Peer');

  await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Bravo');

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).not.toContainText('Alpha Peer');
});

test('expires an idle managed session cleanly and resets the desktop state', async ({ appHarness }) => {
  const { page } = appHarness;

  await openManagedSession(page);
  await sleep(3200);

  await page.locator('#managedRefreshChannelsBtn').click();
  await expect(page.locator('#managedErrorText')).toContainText(/expired/i);
  await expect(page.locator('#managedIdentityMeta')).not.toContainText('Session ses_');
  await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
  await expect(page.locator('#managedJoinPasscodeInput')).toHaveValue('');
});

test('supports real dual-slot membership and aggregates peers from Alpha and Bravo', async ({ appHarness }) => {
  const { page, getSentHostMessages } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await openManagedSession(page);
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
  await expect(page.locator('#managedGroupAStatus')).toContainText('joined');

  const alphaPeer = await openPeerSession(managedBackendBaseUrl, 'Peer Alpha');
  await joinPeerChannel(managedBackendBaseUrl, alphaPeer.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, alphaPeer.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.40',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Peer Alpha');

  await page.locator('#managedSelectGroupB').click();
  await expect(page.locator('#managedActiveSlotLabel')).toHaveText('Group B');
  await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedGroupBTitle')).toHaveText('Bravo');
  await expect(page.locator('#managedGroupBStatus')).toContainText('joined');

  const bravoPeer = await openPeerSession(managedBackendBaseUrl, 'Peer Bravo');
  await joinPeerChannel(managedBackendBaseUrl, bravoPeer.identity.sessionId, 'chn_bravo', 'A', 'alpha-secret');
  await sendPeerPresence(managedBackendBaseUrl, bravoPeer.identity.sessionId, 'chn_bravo', {
    kind: 'public',
    ip: '198.51.100.41',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Peer Alpha');
  await expect(page.locator('#networkTable tbody')).toContainText('Peer Bravo');

  await expect.poll(async () => {
    const messages = await getSentHostMessages();
    const configureMessages = messages.filter((message) => message.type === 'configure');
    const lastConfigure = configureMessages.at(-1);
    return Array.isArray(lastConfigure?.peers)
      ? lastConfigure.peers.map((peer) => peer.name).sort().join(',')
      : '';
  }).toBe('Peer Alpha,Peer Bravo');
});

test('leaving real Group B membership preserves active Group A state and peers', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await openManagedSession(page);
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');

  const alphaPeer = await openPeerSession(managedBackendBaseUrl, 'Alpha Survivor');
  await joinPeerChannel(managedBackendBaseUrl, alphaPeer.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, alphaPeer.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.42',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Alpha Survivor');

  await page.locator('#managedSelectGroupB').click();
  await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedGroupBTitle')).toHaveText('Bravo');

  const bravoPeer = await openPeerSession(managedBackendBaseUrl, 'Bravo Temporary');
  await joinPeerChannel(managedBackendBaseUrl, bravoPeer.identity.sessionId, 'chn_bravo', 'A', 'alpha-secret');
  await sendPeerPresence(managedBackendBaseUrl, bravoPeer.identity.sessionId, 'chn_bravo', {
    kind: 'public',
    ip: '198.51.100.43',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Alpha Survivor');
  await expect(page.locator('#networkTable tbody')).toContainText('Bravo Temporary');

  await leavePeerChannel(managedBackendBaseUrl, bravoPeer.identity.sessionId, 'chn_bravo');
  await page.locator('#managedLeaveChannelBtn').click();
  await expect(page.locator('#managedGroupATitle')).toHaveText('Alpha');
  await expect(page.locator('#managedGroupAStatus')).toContainText('joined');
  await expect(page.locator('#managedGroupBStatus')).toContainText('No active managed membership');
  await expect(page.locator('#networkTable tbody')).toContainText('Alpha Survivor');
  await expect(page.locator('#networkTable tbody')).not.toContainText('Bravo Temporary');
});
