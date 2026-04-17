function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
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
  }
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
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

export function createManagedApiClient({ baseUrl, fetchImpl = globalThis.fetch } = {}) {
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
    const url = `${normalizedBaseUrl}${buildPath(pathname, query)}`;
    const requestHeaders = {
      Accept: 'application/json',
      ...headers
    };
    let payload;
    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetchImpl(url, {
      method,
      headers: requestHeaders,
      body: payload
    });
    const parsed = await readJsonSafe(response);
    if (!response.ok) {
      throw new ManagedApiError(
        parsed?.message || `Managed API request failed with ${response.status}.`,
        {
          status: response.status,
          code: parsed?.code || 'managed_http_error',
          details: parsed
        }
      );
    }
    return parsed || {};
  }

  return {
    openSession(payload) {
      return requestJson('/api/session/open', {
        method: 'POST',
        body: payload
      });
    },
    listChannels(sessionId) {
      return requestJson('/api/channels', {
        query: { sessionId }
      });
    },
    joinChannel(channelId, payload) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/join`, {
        method: 'POST',
        body: payload
      });
    },
    sendPresence(channelId, payload) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/presence`, {
        method: 'POST',
        body: payload
      });
    },
    listPeers(channelId, sessionId) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/peers`, {
        query: { sessionId }
      });
    },
    leaveChannel(channelId, payload) {
      return requestJson(`/api/channels/${encodeURIComponent(channelId)}/leave`, {
        method: 'POST',
        body: payload
      });
    }
  };
}
