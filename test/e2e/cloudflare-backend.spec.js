const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');

const repoRoot = path.resolve(__dirname, '..', '..');
const localConfigPath = path.join(repoRoot, '.udp1492.local.json');

function sanitizeManagedBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function loadCloudflareManagedBaseUrl() {
  const envUrl = sanitizeManagedBaseUrl(process.env.UDP1492_MANAGED_BACKEND_URL);
  if (envUrl) return envUrl;
  try {
    const parsed = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    return sanitizeManagedBaseUrl(parsed?.managedBackendUrl);
  } catch {
    return '';
  }
}

const managedBackendBaseUrl = loadCloudflareManagedBaseUrl();

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

async function openPeerSession(baseUrl, displayName) {
  const opened = await requestManagedBackend(baseUrl, '/api/session/open', {
    method: 'POST',
    body: {
      displayName,
      mode: 'managed',
      clientVersion: 'playwright-cloudflare'
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

function uniqueLabel(prefix) {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe.configure({ mode: 'serial' });

test.use({
  runtimeEnv: managedBackendBaseUrl
    ? {
        UDP1492_MANAGED_BACKEND_URL: managedBackendBaseUrl,
        UDP1492_MANAGED_REQUEST_TIMEOUT_MS: '8000'
      }
    : {}
});

test.beforeAll(() => {
  if (!managedBackendBaseUrl) {
    throw new Error(
      'Cloudflare managed backend URL is missing. Set UDP1492_MANAGED_BACKEND_URL or populate .udp1492.local.json.'
    );
  }
});

test('opens a managed session against the hosted Cloudflare Worker, joins Alpha, and leaves cleanly', async ({ appHarness }) => {
  const { page } = appHarness;

  await page.locator('#operatingModeManaged').click();
  await page.locator('#managedDisplayNameInput').fill('Cloudflare Smoke');
  await expect(page.locator('#managedProfileStatus')).toContainText('app config');

  await page.locator('#managedOpenSessionBtn').click();
  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');
  await expect(page.locator('#managedLobbyStatus')).toContainText('1 open | 1 protected');
  await expect(page.locator('#managedChannelList')).toContainText('Alpha');
  await expect(page.locator('#managedChannelList')).toContainText('Bravo');

  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');
  await expect(page.locator('#managedGroupAStatus')).toContainText('joined');

  await page.locator('#managedLeaveChannelBtn').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
});

test('enforces protected Bravo passcodes against the hosted Cloudflare Worker', async ({ appHarness }) => {
  const { page } = appHarness;

  await page.locator('#operatingModeManaged').click();
  await page.locator('#managedDisplayNameInput').fill(uniqueLabel('Cloudflare Bravo'));
  await page.locator('#managedOpenSessionBtn').click();
  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');
  await expect(page.locator('#managedChannelList')).toContainText('Bravo');

  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedErrorText')).toContainText(/requires a passcode/i);

  await page.locator('#managedJoinPasscodeInput').fill('wrong-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedErrorText')).toContainText(/invalid.*passcode|supplied passcode is invalid/i);

  await page.locator('#managedJoinPasscodeInput').fill('alpha-secret');
  await page.locator('#managedChannelList li').filter({ hasText: 'Bravo' }).locator('button').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Bravo');

  await page.locator('#managedLeaveChannelBtn').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
});

test('resolves one real hosted peer from Cloudflare-backed managed presence', async ({ appHarness }) => {
  const { page } = appHarness;
  const peerName = uniqueLabel('Cloudflare Peer');

  await page.locator('#operatingModeManaged').click();
  await page.locator('#managedDisplayNameInput').fill(uniqueLabel('Cloudflare Session'));
  await page.locator('#managedOpenSessionBtn').click();
  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');

  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  const peerSession = await openPeerSession(managedBackendBaseUrl, peerName);
  await joinPeerChannel(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha');
  await sendPeerPresence(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha', {
    kind: 'public',
    ip: '198.51.100.88',
    port: 1492
  });

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText(peerName);
  await expect(page.locator('#networkTable tbody')).toContainText('198.51.100.88');

  await leavePeerChannel(managedBackendBaseUrl, peerSession.identity.sessionId, 'chn_alpha');
  await page.locator('#managedLeaveChannelBtn').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
});
