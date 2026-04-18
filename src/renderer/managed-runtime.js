import { sanitizeManagedBaseUrl } from './managed-api.js';

export const DEFAULT_MANAGED_REQUEST_TIMEOUT_MS = 10000;
export const DEFAULT_MANAGED_STUN_SERVER_URLS = Object.freeze([
  'stun:stun.l.google.com:19302'
]);
export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  managedBackendUrl: '',
  managedRequestTimeoutMs: DEFAULT_MANAGED_REQUEST_TIMEOUT_MS,
  managedLocalAddresses: [],
  managedStunServerUrls: DEFAULT_MANAGED_STUN_SERVER_URLS
});

export function sanitizeManagedRequestTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MANAGED_REQUEST_TIMEOUT_MS;
  return Math.max(1000, Math.min(60000, Math.trunc(parsed)));
}

export function sanitizeManagedLocalAddresses(values) {
  const addresses = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const address = String(value || '').trim();
    if (!address || address === '0.0.0.0' || seen.has(address)) continue;
    seen.add(address);
    addresses.push(address);
  }
  return addresses;
}

export function sanitizeManagedStunServerUrls(values) {
  const urls = [];
  const seen = new Set();
  const source = Array.isArray(values) && values.length ? values : DEFAULT_MANAGED_STUN_SERVER_URLS;
  for (const value of source) {
    const url = String(value || '').trim();
    if (!url || seen.has(url)) continue;
    if (!/^stuns?:/i.test(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls.length ? urls : [...DEFAULT_MANAGED_STUN_SERVER_URLS];
}

export function createRuntimeConfig(seed = {}) {
  return {
    managedBackendUrl: sanitizeManagedBaseUrl(seed.managedBackendUrl),
    managedRequestTimeoutMs: sanitizeManagedRequestTimeoutMs(seed.managedRequestTimeoutMs),
    managedLocalAddresses: sanitizeManagedLocalAddresses(seed.managedLocalAddresses),
    managedStunServerUrls: sanitizeManagedStunServerUrls(seed.managedStunServerUrls)
  };
}

export function getConfiguredManagedBaseUrl(managedProfile = {}) {
  return sanitizeManagedBaseUrl(managedProfile?.backendBaseUrl);
}

export function getEffectiveManagedBaseUrl({ runtimeConfig = DEFAULT_RUNTIME_CONFIG, managedProfile = {} } = {}) {
  return sanitizeManagedBaseUrl(getConfiguredManagedBaseUrl(managedProfile) || runtimeConfig?.managedBackendUrl || '');
}

export function getManagedRequestTimeoutMs(runtimeConfig = DEFAULT_RUNTIME_CONFIG) {
  return sanitizeManagedRequestTimeoutMs(runtimeConfig?.managedRequestTimeoutMs);
}

function sanitizePresenceEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') return null;
  const ip = String(endpoint.ip || '').trim();
  const port = Number(endpoint.port);
  if (!ip || !Number.isFinite(port) || port <= 0) return null;
  const kind = String(endpoint.kind || '').trim().toLowerCase();
  return {
    kind: kind || 'unknown',
    ip,
    port
  };
}

function dedupePresenceEndpoints(endpoints = []) {
  const normalized = [];
  const seen = new Set();
  for (const endpoint of endpoints) {
    const sanitized = sanitizePresenceEndpoint(endpoint);
    if (!sanitized) continue;
    const key = `${sanitized.kind}:${sanitized.ip}:${sanitized.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(sanitized);
  }
  return normalized;
}

export function buildManagedLocalCandidates({ localPort, runtimeConfig = DEFAULT_RUNTIME_CONFIG } = {}) {
  const port = Number(localPort);
  if (!Number.isFinite(port) || port <= 0) return [];
  return sanitizeManagedLocalAddresses(runtimeConfig?.managedLocalAddresses).map((ip) => ({
    kind: 'local',
    ip,
    port
  }));
}

export function buildManagedPresenceEndpoints({ localPort, runtimeConfig = DEFAULT_RUNTIME_CONFIG, additionalEndpoints = [] } = {}) {
  return dedupePresenceEndpoints([
    ...buildManagedLocalCandidates({ localPort, runtimeConfig }),
    ...(Array.isArray(additionalEndpoints) ? additionalEndpoints : [])
  ]);
}
