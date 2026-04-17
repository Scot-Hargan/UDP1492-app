function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function splitPathSegments(value) {
  return String(value || '').split('/').filter(Boolean);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolOr(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeIsoString(value) {
  return typeof value === 'string' ? value : '';
}

function sanitizeErrorCode(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'managed_api_error';
}

function describeHttpStatus(status, statusText) {
  if (!status) return 'request failed';
  return statusText ? `${status} ${statusText}` : String(status);
}

function getErrorMessage(parsed, response) {
  if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
  if (isPlainObject(parsed)) {
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    if (isPlainObject(parsed.error) && typeof parsed.error.message === 'string' && parsed.error.message.trim()) {
      return parsed.error.message.trim();
    }
    if (Array.isArray(parsed.errors) && parsed.errors.length) {
      for (const entry of parsed.errors) {
        if (typeof entry === 'string' && entry.trim()) return entry.trim();
        if (isPlainObject(entry) && typeof entry.message === 'string' && entry.message.trim()) return entry.message.trim();
      }
    }
  }
  return `Managed API request failed with ${describeHttpStatus(response?.status, response?.statusText)}.`;
}

function getErrorCode(parsed, fallback = 'managed_http_error') {
  if (isPlainObject(parsed)) {
    if (typeof parsed.code === 'string' && parsed.code.trim()) return parsed.code.trim();
    if (isPlainObject(parsed.error) && typeof parsed.error.code === 'string' && parsed.error.code.trim()) {
      return parsed.error.code.trim();
    }
  }
  return fallback;
}

function assertObject(value, message, details) {
  if (isPlainObject(value)) return value;
  throw new ManagedApiError(message, {
    code: 'managed_response_invalid',
    details: details ?? value
  });
}

function normalizeChannel(channel) {
  if (!isPlainObject(channel)) return null;
  const channelId = stringOrEmpty(channel.channelId).trim();
  if (!channelId) return null;
  const securityMode = stringOrEmpty(channel.securityMode).trim() || 'open';
  return {
    channelId,
    name: stringOrEmpty(channel.name).trim() || channelId,
    description: stringOrEmpty(channel.description).trim(),
    note: stringOrEmpty(channel.note).trim(),
    securityMode,
    requiresPasscode: boolOr(channel.requiresPasscode, securityMode === 'passcode'),
    concurrentAccessAllowed: boolOr(channel.concurrentAccessAllowed, true),
    memberCount: numberOrNull(channel.memberCount) ?? 0
  };
}

function normalizeEndpoint(endpoint) {
  if (!isPlainObject(endpoint)) return null;
  const ip = stringOrEmpty(endpoint.ip).trim();
  const port = numberOrNull(endpoint.port);
  if (!ip || port == null || port <= 0) return null;
  return {
    endpointId: stringOrEmpty(endpoint.endpointId).trim(),
    kind: stringOrEmpty(endpoint.kind).trim() || 'unknown',
    ip,
    port,
    registrationState: stringOrEmpty(endpoint.registrationState).trim() || 'unknown',
    lastValidatedAt: sanitizeIsoString(endpoint.lastValidatedAt)
  };
}

function normalizePeer(peer) {
  if (!isPlainObject(peer)) return null;
  const endpoints = Array.isArray(peer.endpoints) ? peer.endpoints.map(normalizeEndpoint).filter(Boolean) : [];
  const displayName = stringOrEmpty(peer.displayName).trim();
  const userId = stringOrEmpty(peer.userId).trim();
  const sessionId = stringOrEmpty(peer.sessionId).trim();
  if (!displayName && !userId && !sessionId && !endpoints.length) return null;
  return {
    userId,
    sessionId,
    channelId: stringOrEmpty(peer.channelId).trim(),
    displayName: displayName || userId || sessionId || endpoints[0]?.ip || 'Unknown peer',
    connectionState: stringOrEmpty(peer.connectionState).trim() || 'unknown',
    endpoints
  };
}

function normalizeOpenSessionResponse(payload) {
  const root = assertObject(payload, 'Managed backend returned an invalid session response.');
  const identity = assertObject(root.identity, 'Managed backend omitted session identity data.', root);
  const session = assertObject(root.session, 'Managed backend omitted session metadata.', root);
  const sessionId = stringOrEmpty(identity.sessionId).trim();
  if (!sessionId) {
    throw new ManagedApiError('Managed backend returned an invalid session response.', {
      code: 'managed_response_invalid',
      details: root
    });
  }
  return {
    identity: {
      userId: stringOrEmpty(identity.userId).trim(),
      sessionId,
      displayName: stringOrEmpty(identity.displayName).trim()
    },
    session: {
      openedAt: sanitizeIsoString(session.openedAt),
      expiresAt: sanitizeIsoString(session.expiresAt),
      heartbeatIntervalMs: numberOrNull(session.heartbeatIntervalMs) ?? 15000
    }
  };
}

function normalizeChannelListResponse(payload) {
  const root = assertObject(payload, 'Managed backend returned an invalid channel list response.');
  return {
    channels: Array.isArray(root.channels) ? root.channels.map(normalizeChannel).filter(Boolean) : [],
    syncedAt: sanitizeIsoString(root.syncedAt)
  };
}

function normalizeJoinResponse(payload, fallbackChannelId) {
  const root = assertObject(payload, 'Managed backend returned an invalid join response.');
  const membership = assertObject(root.membership, 'Managed backend omitted join membership data.', root);
  const joinedChannel = normalizeChannel(root.channel) || null;
  const channelId = stringOrEmpty(membership.channelId).trim() || fallbackChannelId;
  if (!channelId) {
    throw new ManagedApiError('Managed backend returned an invalid join response.', {
      code: 'managed_response_invalid',
      details: root
    });
  }
  return {
    membership: {
      channelId,
      slotId: stringOrEmpty(membership.slotId).trim() || 'A',
      membershipState: stringOrEmpty(membership.membershipState).trim() || 'joined',
      joinedAt: sanitizeIsoString(membership.joinedAt),
      leftAt: sanitizeIsoString(membership.leftAt)
    },
    channel: joinedChannel || {
      channelId,
      name: channelId,
      description: '',
      note: '',
      securityMode: 'open',
      requiresPasscode: false,
      concurrentAccessAllowed: true,
      memberCount: 0
    }
  };
}

function normalizePresenceResponse(payload) {
  const root = assertObject(payload, 'Managed backend returned an invalid presence response.');
  const presence = isPlainObject(root.presence) ? root.presence : {};
  return {
    presence: {
      channelId: stringOrEmpty(presence.channelId).trim(),
      sessionId: stringOrEmpty(presence.sessionId).trim(),
      onlineState: stringOrEmpty(presence.onlineState).trim() || 'online',
      lastSeenAt: sanitizeIsoString(presence.lastSeenAt)
    },
    registrations: Array.isArray(root.registrations)
      ? root.registrations.map((entry) => ({
          endpointId: stringOrEmpty(entry?.endpointId).trim(),
          kind: stringOrEmpty(entry?.kind).trim() || 'unknown',
          registrationState: stringOrEmpty(entry?.registrationState).trim() || 'unknown',
          lastValidatedAt: sanitizeIsoString(entry?.lastValidatedAt)
        }))
      : [],
    nextHeartbeatAt: sanitizeIsoString(root.nextHeartbeatAt)
  };
}

function normalizePeersResponse(payload) {
  const root = assertObject(payload, 'Managed backend returned an invalid peer list response.');
  return {
    channelId: stringOrEmpty(root.channelId).trim(),
    peers: Array.isArray(root.peers) ? root.peers.map(normalizePeer).filter(Boolean) : [],
    resolvedAt: sanitizeIsoString(root.resolvedAt)
  };
}

function normalizeLeaveResponse(payload, fallbackChannelId) {
  if (payload == null) {
    return {
      membership: {
        channelId: fallbackChannelId,
        slotId: 'A',
        membershipState: 'none',
        leftAt: ''
      }
    };
  }
  const root = assertObject(payload, 'Managed backend returned an invalid leave response.');
  const membership = assertObject(root.membership, 'Managed backend omitted leave membership data.', root);
  return {
    membership: {
      channelId: stringOrEmpty(membership.channelId).trim() || fallbackChannelId,
      slotId: stringOrEmpty(membership.slotId).trim() || 'A',
      membershipState: stringOrEmpty(membership.membershipState).trim() || 'none',
      leftAt: sanitizeIsoString(membership.leftAt)
    }
  };
}

function buildPath(pathname, query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const suffix = search.size ? `?${search.toString()}` : '';
  return `${pathname}${suffix}`;
}

function buildRequestUrl(baseUrl, pathname, query = {}) {
  const url = new URL(baseUrl);
  const baseSegments = splitPathSegments(url.pathname);
  const requestSegments = splitPathSegments(pathname);
  let overlap = 0;
  const maxOverlap = Math.min(baseSegments.length, requestSegments.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const baseTail = baseSegments.slice(-size).join('/');
    const requestHead = requestSegments.slice(0, size).join('/');
    if (baseTail === requestHead) {
      overlap = size;
      break;
    }
  }
  url.pathname = `/${[...baseSegments, ...requestSegments.slice(overlap)].join('/')}`;
  url.search = '';
  return `${url.toString().replace(/\/+$/, '')}${buildPath('', query)}`;
}

export function sanitizeManagedBaseUrl(value) {
  const trimmed = trimTrailingSlash(value).trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return trimTrailingSlash(url.toString());
  } catch {
    return '';
  }
}

export class ManagedApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ManagedApiError';
    this.status = options.status ?? 0;
    this.code = options.code || 'managed_api_error';
    this.details = options.details ?? null;
    this.url = options.url || '';
  }
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createManagedApiClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 10000
} = {}) {
  const normalizedBaseUrl = sanitizeManagedBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new ManagedApiError('Managed backend URL is required.', {
      code: 'managed_base_url_required'
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new ManagedApiError('Fetch is unavailable in this renderer.', {
      code: 'managed_fetch_unavailable'
    });
  }

  async function requestJson(pathname, options = {}) {
    const {
      method = 'GET',
      body,
      query,
      headers = {}
    } = options;
    const url = buildRequestUrl(normalizedBaseUrl, pathname, query);
    const requestHeaders = {
      Accept: 'application/json',
      ...headers
    };
    let payload;
    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const timeoutMs = Math.max(1000, Math.min(60000, Math.trunc(Number(requestTimeoutMs) || 10000)));
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: requestHeaders,
        body: payload,
        signal: controller?.signal
      });
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      const isAbort = error?.name === 'AbortError';
      throw new ManagedApiError(
        isAbort
          ? `Managed backend request timed out after ${timeoutMs} ms.`
          : `Unable to reach the managed backend at ${normalizedBaseUrl}.`,
        {
          code: isAbort ? 'managed_request_timeout' : 'managed_network_error',
          details: {
            cause: error?.message || String(error)
          },
          url
        }
      );
    }
    if (timeout) clearTimeout(timeout);
    const parsed = await readJsonSafe(response);
    if (!response.ok) {
      throw new ManagedApiError(getErrorMessage(parsed, response), {
        status: response.status,
        code: getErrorCode(parsed),
        details: parsed,
        url
      });
    }
    return parsed;
  }

  return {
    openSession(payload) {
      return requestJson('/api/session/open', {
        method: 'POST',
        body: payload
      }).then(normalizeOpenSessionResponse);
    },
    listChannels(sessionId) {
      return requestJson('/api/channels', {
        query: { sessionId }
      }).then(normalizeChannelListResponse);
    },
    joinChannel(channelId, payload) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/join`, {
        method: 'POST',
        body: payload
      }).then((response) => normalizeJoinResponse(response, channelId));
    },
    sendPresence(channelId, payload) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/presence`, {
        method: 'POST',
        body: payload
      }).then(normalizePresenceResponse);
    },
    listPeers(channelId, sessionId) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/peers`, {
        query: { sessionId }
      }).then(normalizePeersResponse);
    },
    leaveChannel(channelId, payload) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/leave`, {
        method: 'POST',
        body: payload
      }).then((response) => normalizeLeaveResponse(response, channelId));
    }
  };
}
