import { ManagedApiError, createManagedApiClient } from './managed-api.js';
import {
  DEFAULT_RUNTIME_CONFIG,
  buildManagedPresenceEndpoints,
  createRuntimeConfig,
  getConfiguredManagedBaseUrl,
  getEffectiveManagedBaseUrl,
  getManagedRequestTimeoutMs
} from './managed-runtime.js';

export function createManagedController(deps) {
  const PRIMARY_SLOT_ID = 'A';
  let runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  let managedHeartbeatTimer = null;
  let managedPeerRefreshTimer = null;

  function getAppState() {
    return deps.getAppState();
  }

  function getManagedProfile() {
    return deps.getManagedProfile();
  }

  function getManagedCache() {
    return deps.getManagedCache();
  }

  function getDashboardState() {
    return deps.getDashboardState();
  }

  function getManagedSession() {
    return deps.getManagedSession();
  }

  function getPrimaryManagedSlot() {
    return deps.getManagedSlot(PRIMARY_SLOT_ID);
  }

  function getRuntimeConfig() {
    return runtimeConfig;
  }

  function getManagedBaseUrl() {
    return getEffectiveManagedBaseUrl({
      runtimeConfig,
      managedProfile: getManagedProfile()
    });
  }

  function getConfiguredBaseUrl() {
    return getConfiguredManagedBaseUrl(getManagedProfile());
  }

  function createManagedApi() {
    return createManagedApiClient({
      baseUrl: getManagedBaseUrl(),
      fetchImpl: deps.fetchImpl,
      requestTimeoutMs: getManagedRequestTimeoutMs(runtimeConfig)
    });
  }

  function stopManagedTimers() {
    if (managedHeartbeatTimer) {
      clearInterval(managedHeartbeatTimer);
      managedHeartbeatTimer = null;
    }
    if (managedPeerRefreshTimer) {
      clearInterval(managedPeerRefreshTimer);
      managedPeerRefreshTimer = null;
    }
  }

  function startManagedTimers() {
    stopManagedTimers();
    const managedSession = getManagedSession();
    if (!managedSession.channelId || !managedSession.sessionId) return;
    const heartbeatIntervalMs = Math.max(5000, Number(managedSession.heartbeatIntervalMs) || 15000);
    managedHeartbeatTimer = setInterval(() => {
      sendManagedPresence().catch((err) => handleManagedBackgroundError(err, 'Managed presence heartbeat failed.'));
    }, heartbeatIntervalMs);
    managedPeerRefreshTimer = setInterval(() => {
      refreshManagedPeers({ ensureTransport: true }).catch((err) => handleManagedBackgroundError(err, 'Managed peer refresh failed.'));
    }, 15000);
  }

  async function loadRuntimeConfig() {
    if (typeof deps.platform?.getRuntimeConfig !== 'function') {
      runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
      return runtimeConfig;
    }
    try {
      runtimeConfig = createRuntimeConfig(await deps.platform.getRuntimeConfig());
    } catch (error) {
      console.error('runtime config error', error);
      runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
    }
    return runtimeConfig;
  }

  function isManagedSessionInvalidError(error) {
    if (!(error instanceof ManagedApiError)) return false;
    if (error.status === 401 || error.status === 403) return true;
    const code = String(error.code || '').toLowerCase();
    const message = String(error.message || '').toLowerCase();
    return code.includes('session')
      || /session.+(expired|invalid|not found|missing|closed)/.test(message);
  }

  function isManagedMembershipInvalidError(error) {
    if (!(error instanceof ManagedApiError)) return false;
    const code = String(error.code || '').toLowerCase();
    const message = String(error.message || '').toLowerCase();
    return code.includes('membership')
      || code.includes('channel_not_found')
      || /channel.+(not found|missing)/.test(message)
      || /membership.+(not found|missing)/.test(message)
      || /not joined/.test(message);
  }

  async function resetManagedSessionState(message) {
    const appState = getAppState();
    const managedProfile = getManagedProfile();
    const primarySlot = getPrimaryManagedSlot();
    stopManagedTimers();
    appState.managed.transportPeers = [];
    appState.managed.session.sessionId = '';
    appState.managed.session.channelId = '';
    appState.managed.session.channelName = '';
    appState.managed.session.membershipState = 'none';
    appState.managed.session.presenceState = 'offline';
    appState.managed.session.lastPeerSyncAt = '';
    appState.managed.session.status = 'idle';
    primarySlot.channelId = '';
    primarySlot.channelName = '';
    primarySlot.securityMode = '';
    primarySlot.membershipState = 'none';
    primarySlot.presenceState = 'offline';
    primarySlot.lastPeerSyncAt = '';
    primarySlot.errorMessage = '';
    managedProfile.lastSessionId = '';
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (deps.isTransportConnected()) deps.disconnectTransport();
    deps.setManagedError(message || 'Managed session expired. Open a new session.');
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
  }

  async function resetManagedMembershipState(message) {
    const appState = getAppState();
    const primarySlot = getPrimaryManagedSlot();
    stopManagedTimers();
    appState.managed.transportPeers = [];
    appState.managed.session.channelId = '';
    appState.managed.session.channelName = '';
    appState.managed.session.membershipState = 'none';
    appState.managed.session.presenceState = 'offline';
    appState.managed.session.lastPeerSyncAt = '';
    appState.managed.session.status = getManagedSession().sessionId ? 'open' : 'idle';
    primarySlot.channelId = '';
    primarySlot.channelName = '';
    primarySlot.securityMode = '';
    primarySlot.membershipState = 'none';
    primarySlot.presenceState = 'offline';
    primarySlot.lastPeerSyncAt = '';
    primarySlot.errorMessage = '';
    deps.setManagedJoinPasscode('');
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (deps.isTransportConnected()) deps.disconnectTransport();
    deps.setManagedError(message || 'Managed channel membership is no longer active.');
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
  }

  async function recoverManagedApiError(error, fallbackMessage) {
    if (isManagedSessionInvalidError(error)) {
      await resetManagedSessionState(error?.message || fallbackMessage);
      return true;
    }
    if (isManagedMembershipInvalidError(error)) {
      await resetManagedMembershipState(error?.message || fallbackMessage);
      return true;
    }
    return false;
  }

  async function handleManagedBackgroundError(error, fallbackMessage) {
    const recovered = await recoverManagedApiError(error, fallbackMessage);
    if (!recovered) {
      deps.setManagedError(error?.message || fallbackMessage);
      deps.renderManagedShell();
    }
    console.error('managed background error', error);
  }

  function shouldAttemptManagedResume() {
    const managedProfile = getManagedProfile();
    return deps.getOperatingMode() === deps.operatingModes.MANAGED
      && !!managedProfile.displayName.trim()
      && !!getManagedBaseUrl()
      && !!(managedProfile.lastSessionId || deps.getManagedSlotIntent(PRIMARY_SLOT_ID) || managedProfile.preferredChannelId || getManagedSession().channelId);
  }

  async function ensureManagedSession(options = {}) {
    const { force = false, fresh = false } = options;
    const currentSession = getManagedSession();
    const primarySlot = getPrimaryManagedSlot();
    if (!force && currentSession.sessionId) return currentSession;
    const managedProfile = getManagedProfile();
    if (!managedProfile.displayName.trim()) {
      throw new ManagedApiError('Display name is required before opening a managed session.', {
        code: 'managed_display_name_required'
      });
    }
    const api = createManagedApi();
    deps.clearManagedError();
    currentSession.status = 'opening';
    deps.renderManagedShell();
    let response;
    try {
      response = await api.openSession({
        displayName: managedProfile.displayName.trim(),
        clientVersion: deps.version,
        mode: 'managed',
        requestedUserId: managedProfile.userId || null,
        resumeSessionId: fresh ? null : (managedProfile.lastSessionId || null)
      });
    } catch (error) {
      const shouldRetryWithoutResume = !!managedProfile.lastSessionId
        && !fresh
        && error instanceof ManagedApiError
        && (error.status === 400 || error.status === 401 || error.status === 404 || error.status === 409);
      if (!shouldRetryWithoutResume) throw error;
      managedProfile.lastSessionId = '';
      response = await api.openSession({
        displayName: managedProfile.displayName.trim(),
        clientVersion: deps.version,
        mode: 'managed',
        requestedUserId: managedProfile.userId || null,
        resumeSessionId: null
      });
    }
    const identity = response?.identity || {};
    const session = response?.session || {};
    const previousSessionId = currentSession.sessionId || '';
    const shouldResetManagedMembership = (fresh || (previousSessionId && previousSessionId !== (identity.sessionId || '')))
      && !!(currentSession.channelId || getAppState().managed.transportPeers.length || deps.isTransportConnected() || managedHeartbeatTimer || managedPeerRefreshTimer);
    if (shouldResetManagedMembership) {
      stopManagedTimers();
      getAppState().managed.transportPeers = [];
      currentSession.channelId = '';
      currentSession.channelName = '';
      currentSession.membershipState = 'none';
      currentSession.presenceState = 'offline';
      currentSession.lastPeerSyncAt = '';
      primarySlot.channelId = '';
      primarySlot.channelName = '';
      primarySlot.securityMode = '';
      primarySlot.membershipState = 'none';
      primarySlot.presenceState = 'offline';
      primarySlot.lastPeerSyncAt = '';
      primarySlot.errorMessage = '';
      await deps.syncTransportPeerRows({
        mode: deps.operatingModes.MANAGED,
        sendHostUpdate: getDashboardState().nativeHostConnected
      });
      if (deps.isTransportConnected()) deps.disconnectTransport();
    }
    currentSession.status = 'open';
    currentSession.displayName = identity.displayName || managedProfile.displayName.trim();
    currentSession.userId = identity.userId || '';
    currentSession.sessionId = identity.sessionId || '';
    currentSession.heartbeatIntervalMs = Number(session.heartbeatIntervalMs) || 15000;
    currentSession.expiresAt = session.expiresAt || '';
    currentSession.lastOpenedAt = session.openedAt || '';
    currentSession.errorMessage = '';
    managedProfile.displayName = identity.displayName || managedProfile.displayName.trim();
    managedProfile.userId = identity.userId || managedProfile.userId || '';
    managedProfile.lastSessionId = identity.sessionId || managedProfile.lastSessionId || '';
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
    return getManagedSession();
  }

  async function resumeManagedMode(options = {}) {
    if (!shouldAttemptManagedResume()) return false;
    await ensureManagedSession({ force: !!options.forceSession });
    await refreshManagedChannels();
    const managedProfile = getManagedProfile();
    const targetChannelId = getPrimaryManagedSlot().channelId
      || deps.getManagedSlotIntent(PRIMARY_SLOT_ID)
      || managedProfile.preferredChannelId
      || '';
    if (options.rejoinChannel !== false && targetChannelId) {
      await joinManagedChannel(targetChannelId);
    }
    return true;
  }

  async function refreshManagedChannels(options = {}) {
    const managedSession = await ensureManagedSession({ force: !!options.forceSession });
    const api = createManagedApi();
    deps.clearManagedError();
    let response;
    try {
      response = await api.listChannels(managedSession.sessionId);
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed channel list is no longer available.')) return [];
      throw error;
    }
    const appState = getAppState();
    const managedProfile = getManagedProfile();
    const managedCache = getManagedCache();
    const selectedChannelId = deps.getManagedSlotIntent(PRIMARY_SLOT_ID);
    managedCache.channels = Array.isArray(response?.channels) ? response.channels.map((channel) => ({ ...channel })) : [];
    managedCache.lastUpdatedAt = response?.syncedAt || new Date().toISOString();
    if (!selectedChannelId && managedProfile.preferredChannelId) {
      deps.setManagedSlotIntent(PRIMARY_SLOT_ID, managedProfile.preferredChannelId);
    }
    if (!deps.getManagedSlotIntent(PRIMARY_SLOT_ID) && managedCache.channels[0]?.channelId) {
      deps.setManagedSlotIntent(PRIMARY_SLOT_ID, managedCache.channels[0].channelId);
    }
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
    return managedCache.channels;
  }

  async function sendManagedPresence() {
    const managedSession = getManagedSession();
    const primarySlot = getPrimaryManagedSlot();
    if (!managedSession.sessionId || !managedSession.channelId) return null;
    const api = createManagedApi();
    let response;
    try {
      response = await api.sendPresence(managedSession.channelId, {
        sessionId: managedSession.sessionId,
        userId: managedSession.userId || getManagedProfile().userId || null,
        slotId: PRIMARY_SLOT_ID,
        onlineState: 'online',
        clientVersion: deps.version,
        endpoints: buildManagedPresenceEndpoints({
          localPort: deps.getSettings().localPort,
          runtimeConfig
        })
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed presence update failed.')) return null;
      throw error;
    }
    getManagedSession().presenceState = response?.presence?.onlineState || 'online';
    primarySlot.presenceState = getManagedSession().presenceState;
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
    return response;
  }

  async function refreshManagedPeers(options = {}) {
    const managedSession = getManagedSession();
    const primarySlot = getPrimaryManagedSlot();
    if (!managedSession.sessionId || !managedSession.channelId) return [];
    const api = createManagedApi();
    deps.clearManagedError();
    let response;
    try {
      response = await api.listPeers(managedSession.channelId, managedSession.sessionId);
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed peer resolution is no longer available.')) return [];
      throw error;
    }
    const appState = getAppState();
    const resolvedPeers = Array.isArray(response?.peers) ? response.peers.map((peer) => ({ ...peer })) : [];
    appState.managed.transportPeers = resolvedPeers.map(deps.adaptResolvedPeerToTransportPeer).filter(Boolean);
    managedSession.lastPeerSyncAt = response?.resolvedAt || new Date().toISOString();
    managedSession.status = 'active';
    primarySlot.lastPeerSyncAt = managedSession.lastPeerSyncAt;
    primarySlot.errorMessage = '';
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (options.ensureTransport) {
      await deps.ensureManagedTransportConnected();
    }
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
    return appState.managed.transportPeers;
  }

  async function joinManagedChannel(channelId) {
    const managedSession = await ensureManagedSession();
    const api = createManagedApi();
    const managedProfile = getManagedProfile();
    const primarySlot = getPrimaryManagedSlot();
    const selectedChannelId = channelId || deps.getManagedSlotIntent(PRIMARY_SLOT_ID) || managedProfile.preferredChannelId || '';
    if (!selectedChannelId) {
      throw new ManagedApiError('Select a channel before joining managed mode.', {
        code: 'managed_channel_required'
      });
    }
    const channel = deps.findManagedChannel(selectedChannelId);
    const passcode = String(deps.getManagedJoinPasscode() || '').trim();
    if (deps.channelRequiresPasscode(channel) && !passcode) {
      throw new ManagedApiError('This channel requires a passcode before you can join it.', {
        code: 'managed_passcode_required'
      });
    }
    deps.clearManagedError();
    managedSession.status = 'joining';
    deps.setManagedSlotIntent(PRIMARY_SLOT_ID, selectedChannelId);
    managedProfile.preferredChannelId = selectedChannelId;
    deps.renderManagedShell();
    let response;
    try {
      response = await api.joinChannel(selectedChannelId, {
        sessionId: managedSession.sessionId,
        slotId: PRIMARY_SLOT_ID,
        passcode: passcode || null
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed join could not be completed.')) return;
      throw error;
    }
    const membership = response?.membership || {};
    const joinedChannel = response?.channel || channel || {};
    managedSession.status = 'joined';
    managedSession.channelId = membership.channelId || selectedChannelId;
    managedSession.channelName = joinedChannel.name || '';
    managedSession.membershipState = membership.membershipState || 'joined';
    managedSession.presenceState = 'offline';
    managedSession.errorMessage = '';
    primarySlot.channelId = managedSession.channelId;
    primarySlot.channelName = managedSession.channelName;
    primarySlot.securityMode = joinedChannel.securityMode || '';
    primarySlot.membershipState = managedSession.membershipState;
    primarySlot.presenceState = managedSession.presenceState;
    primarySlot.lastPeerSyncAt = '';
    primarySlot.errorMessage = '';
    deps.setManagedJoinPasscode('');
    await deps.ensureManagedTransportConnected();
    await sendManagedPresence();
    await refreshManagedPeers({ ensureTransport: false });
    startManagedTimers();
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
  }

  async function leaveManagedChannel(options = {}) {
    const { preserveSession = true } = options;
    const managedSession = getManagedSession();
    const appState = getAppState();
    const primarySlot = getPrimaryManagedSlot();
    const activeChannelId = managedSession.channelId;
    const activeSessionId = managedSession.sessionId;
    stopManagedTimers();
    if (activeChannelId && activeSessionId) {
      try {
        const api = createManagedApi();
        await api.leaveChannel(activeChannelId, {
          sessionId: activeSessionId,
          slotId: PRIMARY_SLOT_ID
        });
      } catch (error) {
        if (await recoverManagedApiError(error, 'Managed channel membership is no longer active.')) return;
        deps.setManagedError(error?.message || 'Failed to leave the managed channel cleanly.');
      }
    }
    appState.managed.transportPeers = [];
    managedSession.channelId = '';
    managedSession.channelName = '';
    managedSession.membershipState = 'none';
    managedSession.presenceState = 'offline';
    managedSession.lastPeerSyncAt = '';
    managedSession.status = preserveSession && activeSessionId ? 'open' : 'idle';
    primarySlot.channelId = '';
    primarySlot.channelName = '';
    primarySlot.securityMode = '';
    primarySlot.membershipState = 'none';
    primarySlot.presenceState = 'offline';
    primarySlot.lastPeerSyncAt = '';
    primarySlot.errorMessage = '';
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (deps.isTransportConnected()) deps.disconnectTransport();
    deps.renderManagedShell();
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
  }

  async function handleManagedSessionOpen() {
    try {
      await deps.updateManagedProfileFromInputs();
      await ensureManagedSession({ force: true, fresh: true });
      await refreshManagedChannels();
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to open managed session.');
      deps.renderManagedShell();
      await deps.persistAppState({
        includeLegacyLastPeers: true,
        includeManagedProfile: true,
        includeManagedCache: true
      });
    }
  }

  async function handleManagedRefreshChannels() {
    try {
      await deps.updateManagedProfileFromInputs();
      await refreshManagedChannels();
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to refresh channels.');
      deps.renderManagedShell();
    }
  }

  async function handleManagedRefreshPeers() {
    try {
      await refreshManagedPeers({ ensureTransport: true });
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to refresh managed peers.');
      deps.renderManagedShell();
    }
  }

  async function handleManagedLeaveChannel() {
    try {
      await leaveManagedChannel();
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to leave the managed channel.');
      deps.renderManagedShell();
    }
  }

  return {
    getRuntimeConfig,
    getConfiguredManagedBaseUrl: getConfiguredBaseUrl,
    getManagedBaseUrl,
    loadRuntimeConfig,
    shouldAttemptManagedResume,
    stopManagedTimers,
    ensureManagedSession,
    resumeManagedMode,
    refreshManagedChannels,
    sendManagedPresence,
    refreshManagedPeers,
    joinManagedChannel,
    leaveManagedChannel,
    handleManagedSessionOpen,
    handleManagedRefreshChannels,
    handleManagedRefreshPeers,
    handleManagedLeaveChannel
  };
}
