const { test, expect } = require('./fixtures');

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

test.use({
  runtimeEnv: {
    UDP1492_MANAGED_BACKEND_URL: 'http://127.0.0.1:8791/api',
    UDP1492_MANAGED_REQUEST_TIMEOUT_MS: '4000'
  }
});

test('opens a managed session against the local Worker, joins a seeded channel, resolves a real peer, and leaves cleanly', async ({ appHarness }) => {
  const { page } = appHarness;
  const managedBackendBaseUrl = 'http://127.0.0.1:8791';

  await page.locator('#operatingModeManaged').click();
  await page.locator('#managedDisplayNameInput').fill('Scot');
  await expect(page.locator('#managedProfileStatus')).toContainText('app config');
  await page.locator('#managedOpenSessionBtn').click();

  await expect(page.locator('#managedIdentityMeta')).toContainText('Session ses_');
  await expect(page.locator('#managedLobbyStatus')).toContainText('1 open | 1 protected');
  await expect(page.locator('#managedChannelList')).toContainText('Alpha');
  await expect(page.locator('#managedChannelList')).toContainText('Bravo');
  await page.getByRole('button', { name: 'Join Selected' }).click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Alpha');

  const peerSession = await requestManagedBackend(managedBackendBaseUrl, '/api/session/open', {
    method: 'POST',
    body: {
      displayName: 'Peer Two',
      mode: 'managed',
      clientVersion: 'playwright-live'
    }
  });
  expect(peerSession.response.status).toBe(200);

  const peerJoin = await requestManagedBackend(managedBackendBaseUrl, '/api/channels/chn_alpha/join', {
    method: 'POST',
    body: {
      sessionId: peerSession.payload.identity.sessionId,
      slotId: 'A',
      passcode: null
    }
  });
  expect(peerJoin.response.status).toBe(200);

  const peerPresence = await requestManagedBackend(managedBackendBaseUrl, '/api/channels/chn_alpha/presence', {
    method: 'POST',
    body: {
      sessionId: peerSession.payload.identity.sessionId,
      slotId: 'A',
      onlineState: 'online',
      endpoints: [
        {
          kind: 'public',
          ip: '198.51.100.10',
          port: 1492
        }
      ]
    }
  });
  expect(peerPresence.response.status).toBe(200);

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).toContainText('Peer Two');
  await expect(page.locator('#networkTable tbody')).toContainText('198.51.100.10');

  const peerLeave = await requestManagedBackend(managedBackendBaseUrl, '/api/channels/chn_alpha/leave', {
    method: 'POST',
    body: {
      sessionId: peerSession.payload.identity.sessionId,
      slotId: 'A'
    }
  });
  expect(peerLeave.response.status).toBe(200);

  await page.locator('#managedRefreshPeersBtn').click();
  await expect(page.locator('#networkTable tbody')).not.toContainText('Peer Two');

  await page.locator('#managedLeaveChannelBtn').click();
  await expect(page.locator('#managedActiveChannel')).toHaveText('Group A has no active membership');
});
