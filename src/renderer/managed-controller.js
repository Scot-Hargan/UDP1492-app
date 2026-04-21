import { ManagedApiError, createManagedApiClient } from './managed-api.js';
import {
  DEFAULT_RUNTIME_CONFIG,
  createRuntimeConfig,
  getConfiguredManagedBaseUrl,
  getEffectiveManagedBaseUrl,
  getManagedRequestTimeoutMs
} from './managed-runtime.js';

export function createManagedController(deps) {
  let runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  const managedHeartbeatTimers = new Map();
  const managedPeerRefreshTimers = new Map();

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

  function getManagedSlotIds() {
    return typeof deps.getManagedSlotIds === 'function' ? deps.getManagedSlotIds() : ['A', 'B'];
  }

  function normalizeSlotId(slotId) {
    if (getManagedSlotIds().includes(slotId)) return slotId;
    return typeof deps.getActiveManagedSlotId === 'function' ? deps.getActiveManagedSlotId() : getManagedSlotIds()[0];
  }

  function getManagedSlot(slotId) {
    return deps.getManagedSlot(normalizeSlotId(slotId));
  }

  function getActiveSlotId() {
    return normalizeSlotId();
  }

  function syncSlotChannelState(slotId) {
    const targetSlotId = normalizeSlotId(slotId);
    const slot = getManagedSlot(targetSlotId);
    const activeChannel = slot.channelId ? deps.findManagedChannel(slot.channelId) : null;
    const intendedChannelId = deps.getManagedSlotIntent(targetSlotId);
    const intendedChannel = intendedChannelId ? deps.findManagedChannel(intendedChannelId) : null;
    if (activeChannel) {
      slot.channelName = activeChannel.name || slot.channelName || '';
      slot.securityMode = activeChannel.securityMode || '';
      return slot;
    }
    if (intendedChannel) {
      slot.securityMode = intendedChannel.securityMode || '';
      return slot;
    }
    if (!slot.channelId) {
      slot.channelName = '';
      slot.securityMode = '';
    }
    return slot;
  }

  function syncAllSlotChannelStates() {
    for (const slotId of getManagedSlotIds()) syncSlotChannelState(slotId);
  }

  function pruneManagedIntents() {
    const managedProfile = getManagedProfile();
    for (const slotId of getManagedSlotIds()) {
      const intendedChannelId = deps.getManagedSlotIntent(slotId);
      if (!intendedChannelId) continue;
      if (deps.findManagedChannel(intendedChannelId)) continue;
      deps.setManagedSlotIntent(slotId, null);
      if (slotId === 'A' && managedProfile.preferredChannelId === intendedChannelId) {
        managedProfile.preferredChannelId = '';
      }
    }
  }

  function clearSlotRuntimeState(slotId) {
    const slot = getManagedSlot(slotId);
    slot.channelId = '';
    slot.channelName = '';
    slot.securityMode = '';
    slot.membershipState = 'none';
    slot.presenceState = 'offline';
    slot.lastPeerSyncAt = '';
    slot.errorMessage = '';
    deps.clearManagedSlotTransportPeers(slot.slotId);
    if (typeof deps.clearManagedSlotResolvedPeers === 'function') deps.clearManagedSlotResolvedPeers(slot.slotId);
    deps.setManagedJoinPasscode(slot.slotId, '');
    return slot;
  }

  function clearAllSlotRuntimeState() {
    for (const slotId of getManagedSlotIds()) clearSlotRuntimeState(slotId);
  }

  function hasAnyManagedMembership() {
    return getManagedSlotIds().some((slotId) => !!getManagedSlot(slotId).channelId);
  }

  function hasAnyManagedIntent() {
    return getManagedSlotIds().some((slotId) => !!deps.getManagedSlotIntent(slotId));
  }

  function hasAnyManagedTransportPeers() {
    return getManagedSlotIds().some((slotId) => deps.getManagedSlotTransportPeers(slotId).length > 0);
  }

  function updateManagedSessionStatus(nextStatus = null) {
    const managedSession = getManagedSession();
    if (nextStatus) {
      managedSession.status = nextStatus;
      return managedSession.status;
    }
    if (!managedSession.sessionId) {
      managedSession.status = 'idle';
    } else if (hasAnyManagedMembership()) {
      managedSession.status = 'active';
    } else {
      managedSession.status = 'open';
    }
    return managedSession.status;
  }

  function setSlotError(slotId, message = '') {
    getManagedSlot(slotId).errorMessage = typeof message === 'string' ? message : String(message || '');
    return getManagedSlot(slotId).errorMessage;
  }

  function clearSlotError(slotId) {
    setSlotError(slotId, '');
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

  function stopManagedTimers(slotId) {
    if (slotId) {
      const targetSlotId = normalizeSlotId(slotId);
      const heartbeatTimer = managedHeartbeatTimers.get(targetSlotId);
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        managedHeartbeatTimers.delete(targetSlotId);
      }
      const peerRefreshTimer = managedPeerRefreshTimers.get(targetSlotId);
      if (peerRefreshTimer) {
        clearInterval(peerRefreshTimer);
        managedPeerRefreshTimers.delete(targetSlotId);
      }
      return;
    }
    for (const activeSlotId of getManagedSlotIds()) stopManagedTimers(activeSlotId);
  }

  function startManagedTimers(slotId) {
    const targetSlotId = normalizeSlotId(slotId);
    stopManagedTimers(targetSlotId);
    const managedSession = getManagedSession();
    const slot = getManagedSlot(targetSlotId);
    if (!slot.channelId || !managedSession.sessionId) return;
    const heartbeatIntervalMs = Math.max(5000, Number(managedSession.heartbeatIntervalMs) || 15000);
    managedHeartbeatTimers.set(targetSlotId, setInterval(() => {
      sendManagedPresence(targetSlotId).catch((err) => handleManagedBackgroundError(err, 'Managed presence heartbeat failed.', targetSlotId));
    }, heartbeatIntervalMs));
    managedPeerRefreshTimers.set(targetSlotId, setInterval(() => {
      refreshManagedPeers(targetSlotId, { ensureTransport: true }).catch((err) => handleManagedBackgroundError(err, 'Managed peer refresh failed.', targetSlotId));
    }, 15000));
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
    if (error.status === 401) return true;
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

  function isManagedPasscodeRequiredError(error) {
    if (!(error instanceof ManagedApiError)) return false;
    const code = String(error.code || '').toLowerCase();
    const message = String(error.message || '').toLowerCase();
    return code.includes('passcode')
      || /passcode/.test(message);
  }

  function buildProtectedResumeMessage(slotId, channelId) {
    const channel = channelId ? deps.findManagedChannel(channelId) : null;
    const slotLabel = `Group ${normalizeSlotId(slotId)}`;
    const channelName = channel?.name || channelId || 'the selected protected channel';
    return `${slotLabel} still targets protected channel ${channelName}. Enter the passcode and choose Join Selected to complete resume.`;
  }

  async function persistManagedState() {
    await deps.persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true,
      includeLocalKnowledge: true
    });
  }

  async function resetManagedSessionState(message) {
    const managedSession = getManagedSession();
    const managedProfile = getManagedProfile();
    stopManagedTimers();
    deps.clearAllManagedSlotTransportPeers();
    if (typeof deps.clearAllManagedSlotResolvedPeers === 'function') deps.clearAllManagedSlotResolvedPeers();
    clearAllSlotRuntimeState();
    managedSession.sessionId = '';
    managedSession.status = 'idle';
    managedSession.heartbeatIntervalMs = 15000;
    managedSession.expiresAt = '';
    managedSession.lastOpenedAt = '';
    managedSession.errorMessage = '';
    managedProfile.lastSessionId = '';
    if (typeof deps.clearManagedJoinPasscodes === 'function') deps.clearManagedJoinPasscodes();
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (deps.isTransportConnected()) deps.disconnectTransport();
    deps.setManagedError(message || 'Managed session expired. Open a new session.');
    deps.renderManagedShell();
    await persistManagedState();
  }

  async function resetManagedMembershipState(slotId, message) {
    const targetSlotId = normalizeSlotId(slotId);
    const managedSession = getManagedSession();
    stopManagedTimers(targetSlotId);
    clearSlotRuntimeState(targetSlotId);
    updateManagedSessionStatus();
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (deps.isTransportConnected() && !hasAnyManagedMembership()) deps.disconnectTransport();
    const slotMessage = message || 'Managed channel membership is no longer active.';
    setSlotError(targetSlotId, slotMessage);
    if (getActiveSlotId() === targetSlotId) {
      deps.setManagedError(slotMessage);
    } else if (!managedSession.sessionId) {
      deps.clearManagedError();
    }
    deps.renderManagedShell();
    await persistManagedState();
  }

  async function recoverManagedApiError(error, fallbackMessage, slotId) {
    if (isManagedSessionInvalidError(error)) {
      await resetManagedSessionState(error?.message || fallbackMessage);
      return true;
    }
    if (isManagedMembershipInvalidError(error)) {
      await resetManagedMembershipState(slotId || getActiveSlotId(), error?.message || fallbackMessage);
      return true;
    }
    return false;
  }

  async function handleManagedBackgroundError(error, fallbackMessage, slotId) {
    const recovered = await recoverManagedApiError(error, fallbackMessage, slotId);
    if (!recovered) {
      if (slotId) setSlotError(slotId, error?.message || fallbackMessage);
      if (!slotId || getActiveSlotId() === normalizeSlotId(slotId)) {
        deps.setManagedError(error?.message || fallbackMessage);
      }
      deps.renderManagedShell();
    }
    console.error('managed background error', error);
  }

  function shouldAttemptManagedResume() {
    const managedProfile = getManagedProfile();
    return deps.getOperatingMode() === deps.operatingModes.MANAGED
      && !!managedProfile.displayName.trim()
      && !!getManagedBaseUrl()
      && !!(managedProfile.lastSessionId || hasAnyManagedIntent() || hasAnyManagedMembership());
  }

  async function ensureManagedSession(options = {}) {
    const { force = false, fresh = false } = options;
    const currentSession = getManagedSession();
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
      && !!(hasAnyManagedMembership() || hasAnyManagedTransportPeers() || deps.isTransportConnected()
        || managedHeartbeatTimers.size || managedPeerRefreshTimers.size);
    if (shouldResetManagedMembership) {
      stopManagedTimers();
      deps.clearAllManagedSlotTransportPeers();
      if (typeof deps.clearAllManagedSlotResolvedPeers === 'function') deps.clearAllManagedSlotResolvedPeers();
      clearAllSlotRuntimeState();
      if (typeof deps.clearManagedJoinPasscodes === 'function') deps.clearManagedJoinPasscodes();
      await deps.syncTransportPeerRows({
        mode: deps.operatingModes.MANAGED,
        sendHostUpdate: getDashboardState().nativeHostConnected
      });
      if (deps.isTransportConnected()) deps.disconnectTransport();
    }
    currentSession.displayName = identity.displayName || managedProfile.displayName.trim();
    currentSession.userId = identity.userId || '';
    currentSession.sessionId = identity.sessionId || '';
    currentSession.heartbeatIntervalMs = Number(session.heartbeatIntervalMs) || 15000;
    currentSession.expiresAt = session.expiresAt || '';
    currentSession.lastOpenedAt = session.openedAt || '';
    currentSession.errorMessage = '';
    updateManagedSessionStatus();
    managedProfile.displayName = identity.displayName || managedProfile.displayName.trim();
    managedProfile.userId = identity.userId || managedProfile.userId || '';
    managedProfile.lastSessionId = identity.sessionId || managedProfile.lastSessionId || '';
    syncAllSlotChannelStates();
    deps.renderManagedShell();
    await persistManagedState();
    return getManagedSession();
  }

  async function resumeManagedMode(options = {}) {
    if (!shouldAttemptManagedResume()) return false;
    await ensureManagedSession({ force: !!options.forceSession });
    await refreshManagedChannels();
    if (options.rejoinChannel === false) return true;
    for (const slotId of getManagedSlotIds()) {
      const slot = getManagedSlot(slotId);
      const targetChannelId = slot.channelId || deps.getManagedSlotIntent(slotId) || '';
      if (!targetChannelId) continue;
      try {
        await joinManagedChannel(slotId, targetChannelId);
      } catch (error) {
        deps.setManagedJoinPasscode(slotId, '');
        if (isManagedPasscodeRequiredError(error)) {
          const message = buildProtectedResumeMessage(slotId, targetChannelId);
          setSlotError(slotId, message);
          if (getActiveSlotId() === slotId) deps.setManagedError(message);
          deps.renderManagedShell();
          await persistManagedState();
          continue;
        }
        throw error;
      }
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
    const managedProfile = getManagedProfile();
    const managedCache = getManagedCache();
    const targetSlotId = normalizeSlotId(options.slotId || getActiveSlotId());
    try {
      managedCache.adminSummary = await api.getAdminSummary(managedSession.sessionId);
    } catch (error) {
      managedCache.adminSummary = {
        available: false,
        errorMessage: error?.message || 'Backend admin summary is not available for this session.',
        viewer: {
          sessionId: managedSession.sessionId || '',
          userId: managedSession.userId || managedProfile.userId || '',
          displayName: managedSession.displayName || managedProfile.displayName || '',
          role: ''
        },
        permissions: {
          canReadAdminSummary: false,
          canManageChannels: false,
          canManagePasscodes: false
        },
        directory: {
          channelCount: 0,
          protectedChannelCount: 0,
          openChannelCount: 0,
          activeSessionCount: 0,
          activeOperatorSessionCount: 0,
          activeMemberSessionCount: 0,
          joinedSlotCount: 0,
          activeChannelCount: 0,
          activeMemberCount: 0,
          onlineMemberCount: 0,
          readyEndpointCount: 0,
          sessionTtlMs: 0,
          presenceTtlMs: 0,
          observedAt: new Date().toISOString()
        },
        channels: []
      };
    }
    managedCache.channels = Array.isArray(response?.channels) ? response.channels.map((channel) => ({ ...channel })) : [];
    managedCache.lastUpdatedAt = response?.syncedAt || new Date().toISOString();
    pruneManagedIntents();
    if (!deps.getManagedSlotIntent(targetSlotId) && managedCache.channels[0]?.channelId) {
      deps.setManagedSlotIntent(targetSlotId, managedCache.channels[0].channelId);
      if (targetSlotId === 'A') managedProfile.preferredChannelId = managedCache.channels[0].channelId;
    }
    syncAllSlotChannelStates();
    deps.renderManagedShell();
    await persistManagedState();
    return managedCache.channels;
  }

  async function createAdminChannel(input = {}) {
    const managedSession = await ensureManagedSession();
    const api = createManagedApi();
    let response;
    try {
      response = await api.createAdminChannel({
        sessionId: managedSession.sessionId,
        ...input
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed channel creation failed.')) return null;
      throw error;
    }
    await refreshManagedChannels({ slotId: getActiveSlotId() });
    return response?.channel || null;
  }

  async function updateAdminChannel(input = {}) {
    const managedSession = await ensureManagedSession();
    const api = createManagedApi();
    let response;
    try {
      response = await api.updateAdminChannel({
        sessionId: managedSession.sessionId,
        ...input
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed channel update failed.')) return null;
      throw error;
    }
    await refreshManagedChannels({ slotId: getActiveSlotId() });
    return response?.channel || null;
  }

  async function deleteAdminChannel(input = {}) {
    const managedSession = await ensureManagedSession();
    const api = createManagedApi();
    let response;
    try {
      response = await api.deleteAdminChannel({
        sessionId: managedSession.sessionId,
        ...input
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed channel deletion failed.')) return null;
      throw error;
    }
    await refreshManagedChannels({ slotId: getActiveSlotId() });
    return response || null;
  }

  async function sendManagedPresence(slotId) {
    const targetSlotId = normalizeSlotId(slotId);
    const managedSession = getManagedSession();
    const slot = getManagedSlot(targetSlotId);
    if (!managedSession.sessionId || !slot.channelId) return null;
    const api = createManagedApi();
    let response;
    try {
      response = await api.sendPresence(slot.channelId, {
        sessionId: managedSession.sessionId,
        userId: managedSession.userId || getManagedProfile().userId || null,
        slotId: targetSlotId,
        onlineState: 'online',
        clientVersion: deps.version,
        endpoints: typeof deps.getManagedPresenceEndpoints === 'function'
          ? deps.getManagedPresenceEndpoints(targetSlotId)
          : []
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed presence update failed.', targetSlotId)) return null;
      throw error;
    }
    slot.presenceState = response?.presence?.onlineState || 'online';
    clearSlotError(targetSlotId);
    syncSlotChannelState(targetSlotId);
    deps.renderManagedShell();
    await persistManagedState();
    return response;
  }

  async function refreshManagedPeers(slotIdOrOptions, maybeOptions = {}) {
    const targetSlotId = typeof slotIdOrOptions === 'object' && slotIdOrOptions !== null
      ? getActiveSlotId()
      : normalizeSlotId(slotIdOrOptions);
    const options = typeof slotIdOrOptions === 'object' && slotIdOrOptions !== null
      ? slotIdOrOptions
      : maybeOptions;
    const managedSession = getManagedSession();
    const slot = getManagedSlot(targetSlotId);
    if (!managedSession.sessionId || !slot.channelId) return [];
    const api = createManagedApi();
    deps.clearManagedError();
    let response;
    try {
      response = await api.listPeers(slot.channelId, managedSession.sessionId);
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed peer resolution is no longer available.', targetSlotId)) return [];
      throw error;
    }
    const resolvedPeers = Array.isArray(response?.peers) ? response.peers.map((peer) => ({ ...peer })) : [];
    if (typeof deps.setManagedSlotResolvedPeers === 'function') {
      deps.setManagedSlotResolvedPeers(targetSlotId, resolvedPeers);
    }
    deps.setManagedSlotTransportPeers(targetSlotId, resolvedPeers.map(deps.adaptResolvedPeerToTransportPeer).filter(Boolean));
    slot.lastPeerSyncAt = response?.resolvedAt || new Date().toISOString();
    clearSlotError(targetSlotId);
    updateManagedSessionStatus();
    syncSlotChannelState(targetSlotId);
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (options.ensureTransport) {
      await deps.ensureManagedTransportConnected();
    }
    if (typeof deps.onManagedPeersRefreshed === 'function') {
      await deps.onManagedPeersRefreshed(targetSlotId, resolvedPeers, options);
    }
    deps.renderManagedShell();
    await persistManagedState();
    return deps.getManagedSlotTransportPeers(targetSlotId);
  }

  function resolveJoinArgs(slotOrChannelId, maybeChannelId) {
    if (getManagedSlotIds().includes(slotOrChannelId)) {
      return {
        slotId: normalizeSlotId(slotOrChannelId),
        channelId: maybeChannelId || ''
      };
    }
    return {
      slotId: getActiveSlotId(),
      channelId: slotOrChannelId || maybeChannelId || ''
    };
  }

  async function joinManagedChannel(slotOrChannelId, maybeChannelId) {
    const { slotId, channelId } = resolveJoinArgs(slotOrChannelId, maybeChannelId);
    const managedSession = await ensureManagedSession();
    const api = createManagedApi();
    const managedProfile = getManagedProfile();
    const slot = getManagedSlot(slotId);
    const selectedChannelId = channelId || deps.getManagedSlotIntent(slotId) || slot.channelId || '';
    if (!selectedChannelId) {
      throw new ManagedApiError('Select a channel before joining managed mode.', {
        code: 'managed_channel_required'
      });
    }
    const channel = deps.findManagedChannel(selectedChannelId);
    const passcode = String(deps.getManagedJoinPasscode(slotId) || '').trim();
    if (deps.channelRequiresPasscode(channel) && !passcode) {
      const error = new ManagedApiError('This channel requires a passcode before you can join it.', {
        code: 'managed_passcode_required'
      });
      setSlotError(slotId, error.message);
      if (getActiveSlotId() === slotId) deps.setManagedError(error.message);
      deps.renderManagedShell();
      throw error;
    }
    deps.clearManagedError();
    clearSlotError(slotId);
    getManagedSession().status = 'joining';
    deps.setManagedSlotIntent(slotId, selectedChannelId);
    if (slotId === 'A') managedProfile.preferredChannelId = selectedChannelId;
    deps.renderManagedShell();
    let response;
    try {
      response = await api.joinChannel(selectedChannelId, {
        sessionId: managedSession.sessionId,
        slotId,
        passcode: passcode || null
      });
    } catch (error) {
      if (await recoverManagedApiError(error, 'Managed join could not be completed.', slotId)) return;
      setSlotError(slotId, error?.message || 'Managed join could not be completed.');
      if (getActiveSlotId() === slotId) deps.setManagedError(error?.message || 'Managed join could not be completed.');
      deps.renderManagedShell();
      throw error;
    }
    const membership = response?.membership || {};
    const joinedChannel = response?.channel || channel || {};
    slot.channelId = membership.channelId || selectedChannelId;
    slot.channelName = joinedChannel.name || '';
    slot.securityMode = joinedChannel.securityMode || '';
    slot.membershipState = membership.membershipState || 'joined';
    slot.presenceState = 'offline';
    slot.lastPeerSyncAt = '';
    clearSlotError(slotId);
    updateManagedSessionStatus('joined');
    deps.setManagedJoinPasscode(slotId, '');
    if (typeof deps.ensureManagedNatDiscovery === 'function') {
      await deps.ensureManagedNatDiscovery({ silent: true });
    }
    await deps.ensureManagedTransportConnected();
    await sendManagedPresence(slotId);
    await refreshManagedPeers(slotId, { ensureTransport: false, runNatProbes: true });
    startManagedTimers(slotId);
    deps.renderManagedShell();
    await persistManagedState();
  }

  function resolveLeaveArgs(slotOrOptions, maybeOptions = {}) {
    if (getManagedSlotIds().includes(slotOrOptions)) {
      return {
        slotId: normalizeSlotId(slotOrOptions),
        options: maybeOptions || {}
      };
    }
    return {
      slotId: getActiveSlotId(),
      options: (slotOrOptions && typeof slotOrOptions === 'object') ? slotOrOptions : {}
    };
  }

  async function leaveManagedChannel(slotOrOptions, maybeOptions) {
    const { slotId, options } = resolveLeaveArgs(slotOrOptions, maybeOptions);
    const { preserveSession = true } = options;
    const managedSession = getManagedSession();
    const slot = getManagedSlot(slotId);
    const activeChannelId = slot.channelId;
    const activeSessionId = managedSession.sessionId;
    stopManagedTimers(slotId);
    if (activeChannelId && activeSessionId) {
      try {
        const api = createManagedApi();
        await api.leaveChannel(activeChannelId, {
          sessionId: activeSessionId,
          slotId
        });
      } catch (error) {
        if (await recoverManagedApiError(error, 'Managed channel membership is no longer active.', slotId)) return;
        setSlotError(slotId, error?.message || 'Failed to leave the managed channel cleanly.');
        if (getActiveSlotId() === slotId) deps.setManagedError(error?.message || 'Failed to leave the managed channel cleanly.');
      }
    }
    clearSlotRuntimeState(slotId);
    updateManagedSessionStatus(preserveSession && activeSessionId ? null : 'idle');
    if (!preserveSession && !hasAnyManagedMembership()) {
      managedSession.status = 'idle';
      managedSession.sessionId = '';
      managedSession.expiresAt = '';
      managedSession.lastOpenedAt = '';
    }
    await deps.syncTransportPeerRows({
      mode: deps.operatingModes.MANAGED,
      sendHostUpdate: getDashboardState().nativeHostConnected
    });
    if (deps.isTransportConnected() && !hasAnyManagedMembership()) deps.disconnectTransport();
    deps.renderManagedShell();
    await persistManagedState();
  }

  async function handleManagedSessionOpen() {
    try {
      await deps.updateManagedProfileFromInputs();
      await ensureManagedSession({ force: true, fresh: true });
      await refreshManagedChannels();
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to open managed session.');
      deps.renderManagedShell();
      await persistManagedState();
    }
  }

  async function handleManagedRefreshChannels() {
    try {
      await deps.updateManagedProfileFromInputs();
      await refreshManagedChannels({ slotId: getActiveSlotId() });
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to refresh channels.');
      deps.renderManagedShell();
    }
  }

  async function handleManagedRefreshPeers() {
    try {
      await refreshManagedPeers(getActiveSlotId(), { ensureTransport: true, runNatProbes: true });
    } catch (error) {
      deps.setManagedError(error?.message || 'Failed to refresh managed peers.');
      deps.renderManagedShell();
    }
  }

  async function handleManagedLeaveChannel() {
    try {
      await leaveManagedChannel(getActiveSlotId());
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
    createAdminChannel,
    updateAdminChannel,
    deleteAdminChannel,
    joinManagedChannel,
    leaveManagedChannel,
    handleManagedSessionOpen,
    handleManagedRefreshChannels,
    handleManagedRefreshPeers,
    handleManagedLeaveChannel
  };
}
