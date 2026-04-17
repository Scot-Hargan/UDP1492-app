import { sanitizeManagedBaseUrl } from './managed-api.js';

export const DEFAULT_MANAGED_REQUEST_TIMEOUT_MS = 10000;
export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  managedBackendUrl: '',
  managedRequestTimeoutMs: DEFAULT_MANAGED_REQUEST_TIMEOUT_MS,
  managedLocalAddresses: []
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

export function createRuntimeConfig(seed = {}) {
  return {
    managedBackendUrl: sanitizeManagedBaseUrl(seed.managedBackendUrl),
    managedRequestTimeoutMs: sanitizeManagedRequestTimeoutMs(seed.managedRequestTimeoutMs),
    managedLocalAddresses: sanitizeManagedLocalAddresses(seed.managedLocalAddresses)
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

export function buildManagedPresenceEndpoints({ localPort, runtimeConfig = DEFAULT_RUNTIME_CONFIG } = {}) {
  const port = Number(localPort);
  if (!Number.isFinite(port) || port <= 0) return [];
  return sanitizeManagedLocalAddresses(runtimeConfig?.managedLocalAddresses).map((ip) => ({
    kind: 'local',
    ip,
    port
  }));
}
