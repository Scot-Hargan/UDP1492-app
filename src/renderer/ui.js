import {
  AUDIO_HEADER_SIZE,
  base64FromUint8,
  base64ToUint8,
  checksum32,
  decodeALaw,
  decodeMuLaw,
  encodeALaw,
  encodeMuLaw,
  packEncodedChunk,
  packPayloadWithHeader
} from './audio-packet.js';
import {
  CODECS,
  CODEC_IDS,
  DEFAULT_CODEC,
  DEFAULT_SETTINGS,
  INPUT_GAIN_STORAGE_KEY,
  SELECTED_CODEC_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  TYPE_AUDIO_OPUS,
  TYPE_AUDIO_PCM,
  buildDecoderConfig,
  buildEncoderConfig,
  getCodecByDataType,
  getCodecConfig,
  getCodecDefaults,
  getDecoderKey,
  getInputGainStorageKey,
  getSettingsStorageKey,
  getValidCodecId
} from './codec-config.js';
import {
  createPeerTableRow,
  getPeerMuteButtonId,
  getPeerRowId,
  refreshPeerSelects as syncPeerSelects,
  setMuteButtonVisual as applyMuteButtonVisual
} from './peer-ui.js';
import { createPeerRuntimeTracker } from './peer-runtime-stats.js';
import { createStatusDashboard } from './status-dashboard.js';
import { sanitizeManagedBaseUrl } from './managed-api.js';
import { createManagedController } from './managed-controller.js';

// ui.js v0.4.13
(() => {
  'use strict';
  const VERSION = '0.4.13';
  const platform = window.udp1492;
  const testPlatform = window.udp1492Test || null;

  const storage = {
    async get(keys) {
      return platform.storageGet(keys);
    },
    async set(obj) {
      return platform.storageSet(obj);
    }
  };
  const $ = sel => document.querySelector(sel);

  const THEME_STORAGE_KEY = 'udp1492_theme';
  const APP_STATE_V2_STORAGE_KEY = 'udp1492_app_state_v2';
  const MANAGED_PROFILE_STORAGE_KEY = 'udp1492_managed_profile';
  const MANAGED_CACHE_STORAGE_KEY = 'udp1492_managed_cache';
  const NEW_PEER_VALUE = '__new__';
  const OPERATING_MODES = Object.freeze({
    DIRECT: 'direct',
    MANAGED: 'managed'
  });
  const GROUP_SLOT_IDS = Object.freeze({
    A: 'A',
    B: 'B'
  });
  const DEFAULT_MANAGED_SLOT_ID = GROUP_SLOT_IDS.A;

  const connectBtn = $('#connectBtn');
  const disconnectBtn = $('#disconnectBtn');
  const directModeBtn = $('#operatingModeDirect');
  const managedModeBtn = $('#operatingModeManaged');
  const operatingModeSummaryEl = $('#operatingModeSummary');
  const transportPeersHeadingEl = $('#transportPeersHeading');
  const managedModeShellEl = $('#managedModeShell');
  const managedModeStatusEl = $('#managedModeStatus');
  const managedIdentityNameEl = $('#managedIdentityName');
  const managedIdentityMetaEl = $('#managedIdentityMeta');
  const managedProfileStatusEl = $('#managedProfileStatus');
  const managedChannelListEl = $('#managedChannelList');
  const managedLobbyStatusEl = $('#managedLobbyStatus');
  const managedActiveChannelEl = $('#managedActiveChannel');
  const managedGroupAStatusEl = $('#managedGroupAStatus');
  const managedDisplayNameInputEl = $('#managedDisplayNameInput');
  const managedBackendBaseUrlInputEl = $('#managedBackendBaseUrlInput');
  const managedOpenSessionBtn = $('#managedOpenSessionBtn');
  const managedRefreshChannelsBtn = $('#managedRefreshChannelsBtn');
  const managedRefreshPeersBtn = $('#managedRefreshPeersBtn');
  const managedLeaveChannelBtn = $('#managedLeaveChannelBtn');
  const managedPeerSyncMetaEl = $('#managedPeerSyncMeta');
  const managedErrorTextEl = $('#managedErrorText');
  const managedPasscodeLabelEl = $('#managedPasscodeLabel');
  const managedJoinPasscodeInputEl = $('#managedJoinPasscodeInput');

  const nativeHostDot = $('#nativeHostDot');
  const nativeHostStatus = $('#nativeHostStatus');
  const localEncryptionDot = $('#localEncryptionDot');
  const localEncryptionStatus = $('#localEncryptionStatus');
  const peerDot = $('#peerDot');
  const peerStatus = $('#peerStatus');
  const audioRxDot = $('#audioRxDot');
  const audioRxStatus = $('#audioRxStatus');
  const micMeterEl = $('#micMeter');

  const peerListEl = $('#peerList');
  const openPeerModalBtn = $('#openPeerModalBtn');
  const peerModalEl = $('#peerModal');
  const peerModalCloseBtn = $('#peerModalClose');
  const peerModalSelectEl = $('#peerModalSelect');
  const peerModalNameEl = $('#peerModalName');
  const peerModalIpEl = $('#peerModalIp');
  const peerModalPortEl = $('#peerModalPort');
  const peerModalKeyEl = $('#peerModalKey');
  const peerModalGainEl = $('#peerModalGain');
  const peerModalGainValueEl = $('#peerModalGainValue');
  const peerModalOtherFieldsEl = $('#peerModalOtherFields');
  const peerModalCancelBtn = $('#peerModalCancel');
  const peerModalSaveBtn = $('#peerModalSave');
  const peerModalDeleteBtn = $('#peerModalDelete');

  const encryptBtn = $('#encryptToggle');
  const frameMsEl = $('#frameMs');
  const sampleRateEl = $('#sampleRate');
  const pingIntervalEl = $('#pingInterval');
  const deadTimeEl = $('#deadTime');
  const statsIntervalEl = $('#statsInterval');
  const jitterSamplesEl = $('#jitterSamples');
  const pingHistoryEl = $('#pingHistory');
  const localPortEl = $('#localPort');
  const gainValueEl = $('#gainValue');
  const inputGainEl = $('#inputGain');
  const codecSelect = $('#codecSelect');
  const codecOptionsEl = $('#codecOptions');
  const codecBitrateEl = $('#codecBitrate');
  const codecProfileEl = $('#codecProfile');
  const codecBitrateRow = $('#codecBitrateRow');
  const codecProfileRow = $('#codecProfileRow');
  const codecSupportWarningEl = $('#codecSupportWarning');

  const darkModeToggle = $('#darkModeToggle');
  const themeStatusEl = $('#themeStatus');
  const openSettingsBtn = $('#openSettingsBtn');
  const settingsModalEl = $('#settingsModal');
  const settingsCloseBtn = $('#settingsCloseBtn');
  const settingsSaveBtn = $('#settingsSaveBtn');
  const settingsCancelBtn = $('#settingsCancelBtn');
  const settingsResetBtn = $('#settingsResetBtn');

  const toggleLogBtn = $('#toggleLogBtn');
  const clearLogBtn = $('#clearLogBtn');
  const debugLogEl = $('#debugLog');

  connectBtn?.addEventListener('click', () => { connect().catch(err => console.error('connect error', err)); });
  disconnectBtn?.addEventListener('click', () => doDisconnect());
  directModeBtn?.addEventListener('click', () => setOperatingMode(OPERATING_MODES.DIRECT).catch(err => console.error('direct mode error', err)));
  managedModeBtn?.addEventListener('click', () => setOperatingMode(OPERATING_MODES.MANAGED).catch(err => console.error('managed mode error', err)));
  managedOpenSessionBtn?.addEventListener('click', () => handleManagedSessionOpen().catch(err => console.error('managed session open error', err)));
  managedRefreshChannelsBtn?.addEventListener('click', () => handleManagedRefreshChannels().catch(err => console.error('managed refresh channels error', err)));
  managedRefreshPeersBtn?.addEventListener('click', () => handleManagedRefreshPeers().catch(err => console.error('managed refresh peers error', err)));
  managedLeaveChannelBtn?.addEventListener('click', () => handleManagedLeaveChannel().catch(err => console.error('managed leave error', err)));
  managedDisplayNameInputEl?.addEventListener('input', () => syncManagedInputButtonState());
  managedBackendBaseUrlInputEl?.addEventListener('input', () => syncManagedInputButtonState());
  managedDisplayNameInputEl?.addEventListener('change', () => updateManagedProfileFromInputs().catch(err => console.error('managed display name error', err)));
  managedBackendBaseUrlInputEl?.addEventListener('change', () => updateManagedProfileFromInputs().catch(err => console.error('managed backend url error', err)));
  managedJoinPasscodeInputEl?.addEventListener('input', () => { managedJoinPasscode = managedJoinPasscodeInputEl.value || ''; });

  peerListEl?.addEventListener('change', () => handlePeerSelection(peerListEl.value));
  openPeerModalBtn?.addEventListener('click', () => openPeerModal(peerListEl?.value || NEW_PEER_VALUE));
  peerModalCloseBtn?.addEventListener('click', () => closePeerModal(true));
  peerModalCancelBtn?.addEventListener('click', () => closePeerModal(true));
  peerModalSaveBtn?.addEventListener('click', () => savePeerFromModal());
  peerModalDeleteBtn?.addEventListener('click', () => deletePeerFromModal());
  peerModalSelectEl?.addEventListener('change', () => loadPeerIntoModal(peerModalSelectEl.value));
  peerModalGainEl?.addEventListener('input', () => updatePeerGainLabel(peerModalGainValueEl, peerModalGainEl.value));
  peerModalEl?.addEventListener('click', (evt) => { if (evt.target === peerModalEl) closePeerModal(true); });

  inputGainEl?.addEventListener('input', () => updateInputGain(inputGainEl.value, { persist: false, updateSettings: false, applyWorklet: false }));
  encryptBtn?.addEventListener('click', () => setEncryptButtonState(!getEncryptButtonState()));

  darkModeToggle?.addEventListener('change', () => applyTheme(darkModeToggle.checked ? 'dark' : 'light'));
  openSettingsBtn?.addEventListener('click', () => openSettingsModal());
  settingsCloseBtn?.addEventListener('click', () => closeSettingsModal(true));
  settingsCancelBtn?.addEventListener('click', () => closeSettingsModal(true));
  settingsSaveBtn?.addEventListener('click', () => saveSettingsFromModal());
  settingsResetBtn?.addEventListener('click', () => resetSettingsToDefault());
  settingsModalEl?.addEventListener('click', (evt) => { if (evt.target === settingsModalEl) closeSettingsModal(true); });
  codecSelect?.addEventListener('change', () => changeCodec(codecSelect.value).catch(err => console.error('codec change error', err)));

  toggleLogBtn?.addEventListener('click', () => setDebugEnabled(!debugEnabled));
  clearLogBtn?.addEventListener('click', () => { if (debugLogEl) debugLogEl.textContent = ''; });
  let activeCodecId = DEFAULT_CODEC;
  let allPeers = [];
  let activePeers = new Map();
  const statusDashboard = createStatusDashboard({
    activePeers,
    elements: {
      nativeHostDot,
      nativeHostStatus,
      localEncryptionDot,
      localEncryptionStatus,
      peerDot,
      peerStatus,
      audioRxDot,
      audioRxStatus
    }
  });
  let dashboardState = statusDashboard.state;
  const refreshPeerSelects = (mainSelected = NEW_PEER_VALUE, modalSelected) => syncPeerSelects({
    allPeers,
    peerListEl,
    peerModalSelectEl,
    mainSelected,
    modalSelected,
    newPeerValue: NEW_PEER_VALUE
  });
  const setMuteButtonVisual = (button, muted) => applyMuteButtonVisual(button, muted);
  const refreshPeerConnectionState = () => statusDashboard.refreshPeerConnectionState(getTransportPeersForMode());
  const markAudioReceiveActivity = (message) => statusDashboard.markAudioReceiveActivity(message);
  const updateStatusDashboard = () => statusDashboard.render();
  let debugEnabled = false;
  let inputGain = DEFAULT_SETTINGS.inputGain;
  let settings = { ...DEFAULT_SETTINGS };
  let themePreference = 'dark';
  let appState = createDefaultAppStateV2();
  let managedProfile = createDefaultManagedProfile();
  let managedCache = createDefaultManagedCache();
  let managedJoinPasscode = '';
  let nativeHost = null;
  let connected = false;
  let encryptionKeyHex = null;
  let encoder;
  let debugDecoder;
  let decoders = new Map();       // `${codecId}::${peerKey}` -> AudioDecoder
  let peerPlaybackTimes = new Map(); // peerKey -> scheduled playback head
  let peerGains = new Map();      // peerKey -> GainNode
  let peerMeters = new Map();     // peerKey -> <progress> element
  let peerMuteStates = new Map(); // peerKey -> boolean muted
  let masterGain = null;
  let ac, micStream , micSource, workletNode;
  let samplesPerFrame = 960;
  let targetSampleRate = 48000;
  let PLAYBACK_HEADROOM = 0.05; // seconds of lead time to absorb jitter
  const nowTS = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
  let debugCounters = { sent:0, recv:0, headerOk:0, headerMissing:0, checksumMismatch:0, decodeErrors:0 };
  let debugTimer = null;
  let unknownHeaderWarned = false;
  let audioDebug = { rxFrames: [], schedule: [] };
  const peerRuntimeStats = createPeerRuntimeTracker();
  const codecSupportCache = new Map();

  function sanitizeOperatingMode(mode) {
    return mode === OPERATING_MODES.MANAGED ? OPERATING_MODES.MANAGED : OPERATING_MODES.DIRECT;
  }
  function sanitizeManagedSlotId(slotId) {
    if (slotId === GROUP_SLOT_IDS.B || slotId === 'group-b') return GROUP_SLOT_IDS.B;
    return GROUP_SLOT_IDS.A;
  }
  function normalizeManagedChannelId(value) {
    if (typeof value !== 'string') return null;
    const channelId = value.trim();
    return channelId || null;
  }
  function normalizePeerKey(value) {
    return typeof value === 'string' && value.includes(':') ? value : null;
  }
  function dedupePeerKeys(values) {
    const keys = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const key = normalizePeerKey(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return keys;
  }
  function sanitizeTransportPeers(values) {
    const peers = [];
    const seen = new Set();
    for (const peer of Array.isArray(values) ? values : []) {
      if (!peer?.ip || !peer?.port) continue;
      const key = `${peer.ip}:${peer.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      peers.push({ ...peer });
    }
    return peers;
  }
  function createDefaultManagedProfile(seed = {}) {
    return {
      version: 1,
      displayName: typeof seed.displayName === 'string' ? seed.displayName : '',
      callsign: typeof seed.callsign === 'string' ? seed.callsign : '',
      preferredChannelId: typeof seed.preferredChannelId === 'string' ? seed.preferredChannelId : '',
      backendBaseUrl: sanitizeManagedBaseUrl(seed.backendBaseUrl),
      userId: typeof seed.userId === 'string' ? seed.userId : '',
      lastSessionId: typeof seed.lastSessionId === 'string' ? seed.lastSessionId : ''
    };
  }
  function createDefaultManagedCache(seed = {}) {
    return {
      version: 1,
      channels: Array.isArray(seed.channels) ? seed.channels.filter((channel) => channel && typeof channel === 'object').map((channel) => ({ ...channel })) : [],
      lastUpdatedAt: typeof seed.lastUpdatedAt === 'string' ? seed.lastUpdatedAt : null
    };
  }
  function createDefaultManagedSlotState(seed = {}, slotId = DEFAULT_MANAGED_SLOT_ID) {
    return {
      slotId: sanitizeManagedSlotId(seed.slotId || slotId),
      intendedChannelId: normalizeManagedChannelId(seed.intendedChannelId),
      channelId: typeof seed.channelId === 'string' ? seed.channelId : '',
      channelName: typeof seed.channelName === 'string' ? seed.channelName : '',
      securityMode: typeof seed.securityMode === 'string' ? seed.securityMode : '',
      membershipState: typeof seed.membershipState === 'string' ? seed.membershipState : 'none',
      presenceState: typeof seed.presenceState === 'string' ? seed.presenceState : 'offline',
      lastPeerSyncAt: typeof seed.lastPeerSyncAt === 'string' ? seed.lastPeerSyncAt : '',
      errorMessage: typeof seed.errorMessage === 'string' ? seed.errorMessage : ''
    };
  }
  function createDefaultAppStateV2(seed = {}) {
    const direct = seed.direct && typeof seed.direct === 'object' ? seed.direct : {};
    const managed = seed.managed && typeof seed.managed === 'object' ? seed.managed : {};
    const managedShell = managed.shell && typeof managed.shell === 'object' ? managed.shell : {};
    const managedSlots = managed.slots && typeof managed.slots === 'object' ? managed.slots : {};
    const legacySelectedChannelId = normalizeManagedChannelId(managedShell.selectedChannelId);
    const slotASeed = managedSlots.A && typeof managedSlots.A === 'object'
      ? managedSlots.A
      : { intendedChannelId: legacySelectedChannelId };
    const slotBSeed = managedSlots.B && typeof managedSlots.B === 'object' ? managedSlots.B : {};
    return {
      version: 2,
      operatingMode: sanitizeOperatingMode(seed.operatingMode),
      direct: {
        activePeerKeys: dedupePeerKeys(direct.activePeerKeys)
      },
      managed: {
        session: {
          status: 'idle',
          displayName: '',
          sessionId: '',
          channelId: '',
          channelName: '',
          userId: '',
          membershipState: 'none',
          presenceState: 'offline',
          heartbeatIntervalMs: 15000,
          expiresAt: '',
          lastOpenedAt: '',
          lastPeerSyncAt: '',
          errorMessage: ''
        },
        shell: {
          activeSlotId: sanitizeManagedSlotId(managedShell.activeSlotId)
        },
        slots: {
          A: createDefaultManagedSlotState(slotASeed, GROUP_SLOT_IDS.A),
          B: createDefaultManagedSlotState(slotBSeed, GROUP_SLOT_IDS.B)
        },
        transportPeers: []
      }
    };
  }
  function buildPersistedAppStateV2(source = appState) {
    return {
      version: 2,
      operatingMode: sanitizeOperatingMode(source?.operatingMode),
      direct: {
        activePeerKeys: dedupePeerKeys(source?.direct?.activePeerKeys)
      },
      managed: {
        shell: {
          activeSlotId: sanitizeManagedSlotId(source?.managed?.shell?.activeSlotId)
        },
        slots: {
          A: {
            intendedChannelId: normalizeManagedChannelId(source?.managed?.slots?.A?.intendedChannelId)
          },
          B: {
            intendedChannelId: normalizeManagedChannelId(source?.managed?.slots?.B?.intendedChannelId)
          }
        }
      }
    };
  }
  function synthesizeAppStateV2(legacyState = {}) {
    const directPeerKeys = dedupePeerKeys(
      Array.isArray(legacyState.lastPeers) && legacyState.lastPeers.length
        ? legacyState.lastPeers
        : (Array.isArray(legacyState.peers) ? legacyState.peers.map((peer) => `${peer.ip}:${peer.port}`) : [])
    );
    return createDefaultAppStateV2({
      operatingMode: OPERATING_MODES.DIRECT,
      direct: {
        activePeerKeys: directPeerKeys
      }
    });
  }
  function getManagedSession() {
    return appState?.managed?.session || createDefaultAppStateV2().managed.session;
  }
  function getManagedSlot(slotId = DEFAULT_MANAGED_SLOT_ID) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    return appState?.managed?.slots?.[managedSlotId] || createDefaultAppStateV2().managed.slots[managedSlotId];
  }
  function getActiveManagedSlotId() {
    return sanitizeManagedSlotId(appState?.managed?.shell?.activeSlotId);
  }
  function getManagedSlotIntent(slotId = DEFAULT_MANAGED_SLOT_ID) {
    return getManagedSlot(slotId).intendedChannelId || null;
  }
  function setManagedSlotIntent(slotId, channelId) {
    const targetSlot = getManagedSlot(slotId);
    targetSlot.intendedChannelId = normalizeManagedChannelId(channelId);
    return targetSlot.intendedChannelId;
  }
  function setManagedError(message = '') {
    appState.managed.session.errorMessage = typeof message === 'string' ? message : String(message || '');
  }
  function clearManagedError() {
    appState.managed.session.errorMessage = '';
  }
  function formatManagedTimestamp(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  }
  function findManagedChannel(channelId) {
    return managedCache.channels.find((channel) => channel?.channelId === channelId) || null;
  }
  function getSelectedManagedChannel() {
    const selectedChannelId = getManagedSlotIntent(getActiveManagedSlotId()) || managedProfile.preferredChannelId || '';
    return findManagedChannel(selectedChannelId);
  }
  function channelRequiresPasscode(channel) {
    return !!channel?.requiresPasscode || channel?.securityMode === 'passcode';
  }
  function getOperatingMode() {
    return sanitizeOperatingMode(appState?.operatingMode);
  }
  function getPeerKey(peer) {
    if (!peer?.ip || !peer?.port) return null;
    return `${peer.ip}:${peer.port}`;
  }
  function findSavedPeer(key) {
    return allPeers.find((peer) => getPeerKey(peer) === key) || null;
  }
  function getDirectTransportPeers() {
    return dedupePeerKeys(appState?.direct?.activePeerKeys)
      .map((key) => findSavedPeer(key))
      .filter(Boolean);
  }
  function getManagedTransportPeers() {
    return sanitizeTransportPeers(appState?.managed?.transportPeers);
  }
  function pickManagedEndpoint(peer) {
    const endpoints = Array.isArray(peer?.endpoints) ? peer.endpoints : [];
    const readyEndpoints = endpoints.filter((endpoint) => endpoint?.ip && Number.isFinite(Number(endpoint?.port)) && endpoint.registrationState !== 'invalid');
    if (!readyEndpoints.length) return null;
    return readyEndpoints.find((endpoint) => endpoint.kind === 'public')
      || readyEndpoints.find((endpoint) => endpoint.kind === 'local')
      || readyEndpoints[0];
  }
  function adaptResolvedPeerToTransportPeer(peer) {
    const endpoint = pickManagedEndpoint(peer);
    if (!endpoint) return null;
    return {
      name: peer?.displayName || endpoint.ip,
      ip: endpoint.ip,
      port: Number(endpoint.port),
      sharedKey: '',
      gain: 1.0
    };
  }
  function getTransportPeersForMode(mode = getOperatingMode()) {
    return sanitizeOperatingMode(mode) === OPERATING_MODES.MANAGED ? getManagedTransportPeers() : getDirectTransportPeers();
  }
  function buildHostConfigurePayload(mode = getOperatingMode()) {
    return {
      type: 'configure',
      peers: getTransportPeersForMode(mode),
      port: settings.localPort,
      deadTime: settings.deadTime,
      pingInterval: settings.pingInterval,
      pingHistoryDuration: settings.pingHistory,
      statsReportInterval: settings.statsInterval,
      jitterSamplesCount: settings.jitterSamples,
      encryptionEnabled: !!settings.encrypt
    };
  }
  function buildHostPeerDeltaPayload(peer, options = {}) {
    if (!peer) return null;
    const payloadPeer = structuredClone(peer);
    if (options.remove) payloadPeer.remove = true;
    return {
      type: 'configure',
      peers: [payloadPeer]
    };
  }
  function rememberDirectPeerSelection(keys = Array.from(activePeers.keys())) {
    appState.direct.activePeerKeys = dedupePeerKeys(keys);
    return appState.direct.activePeerKeys;
  }
  async function persistAppState(options = {}) {
    const payload = {
      [APP_STATE_V2_STORAGE_KEY]: buildPersistedAppStateV2()
    };
    if (options.includeLegacyLastPeers) {
      payload.udp1492_last_peers = dedupePeerKeys(appState?.direct?.activePeerKeys);
    }
    if (options.includeManagedProfile) {
      payload[MANAGED_PROFILE_STORAGE_KEY] = managedProfile;
    }
    if (options.includeManagedCache) {
      payload[MANAGED_CACHE_STORAGE_KEY] = managedCache;
    }
    await storage.set(payload);
  }
  const managedController = createManagedController({
    platform,
    fetchImpl: window.fetch.bind(window),
    version: VERSION,
    operatingModes: OPERATING_MODES,
    getAppState: () => appState,
    getManagedProfile: () => managedProfile,
    getManagedCache: () => managedCache,
    getManagedSession,
    getDashboardState: () => dashboardState,
    getSettings: () => settings,
    getOperatingMode,
    getManagedSlot,
    getManagedSlotIntent,
    setManagedSlotIntent,
    getManagedJoinPasscode: () => managedJoinPasscode,
    setManagedJoinPasscode: (value) => {
      managedJoinPasscode = value || '';
    },
    setManagedError,
    clearManagedError,
    renderManagedShell,
    persistAppState,
    syncTransportPeerRows,
    ensureManagedTransportConnected,
    isTransportConnected: () => connected,
    disconnectTransport: () => doDisconnect(),
    findManagedChannel,
    channelRequiresPasscode,
    adaptResolvedPeerToTransportPeer,
    updateManagedProfileFromInputs
  });
  function getManagedRuntimeConfig() {
    return managedController.getRuntimeConfig();
  }
  function getConfiguredManagedBaseUrl() {
    return managedController.getConfiguredManagedBaseUrl();
  }
  function getManagedBaseUrl() {
    return managedController.getManagedBaseUrl();
  }
  async function loadRuntimeConfig() {
    return managedController.loadRuntimeConfig();
  }
  function shouldAttemptManagedResume() {
    return managedController.shouldAttemptManagedResume();
  }
  function stopManagedTimers() {
    managedController.stopManagedTimers();
  }
  async function ensureManagedSession(options = {}) {
    return managedController.ensureManagedSession(options);
  }
  async function resumeManagedMode(options = {}) {
    return managedController.resumeManagedMode(options);
  }
  async function refreshManagedChannels(options = {}) {
    return managedController.refreshManagedChannels(options);
  }
  async function sendManagedPresence() {
    return managedController.sendManagedPresence();
  }
  async function refreshManagedPeers(options = {}) {
    return managedController.refreshManagedPeers(options);
  }
  async function joinManagedChannel(channelId) {
    return managedController.joinManagedChannel(channelId);
  }
  async function leaveManagedChannel(options = {}) {
    return managedController.leaveManagedChannel(options);
  }
  async function handleManagedSessionOpen() {
    return managedController.handleManagedSessionOpen();
  }
  async function handleManagedRefreshChannels() {
    return managedController.handleManagedRefreshChannels();
  }
  async function handleManagedRefreshPeers() {
    return managedController.handleManagedRefreshPeers();
  }
  async function handleManagedLeaveChannel() {
    return managedController.handleManagedLeaveChannel();
  }
  function updateOperatingModeButtons() {
    const operatingMode = getOperatingMode();
    if (directModeBtn) {
      directModeBtn.classList.toggle('is-active', operatingMode === OPERATING_MODES.DIRECT);
      directModeBtn.setAttribute('aria-pressed', String(operatingMode === OPERATING_MODES.DIRECT));
    }
    if (managedModeBtn) {
      managedModeBtn.classList.toggle('is-active', operatingMode === OPERATING_MODES.MANAGED);
      managedModeBtn.setAttribute('aria-pressed', String(operatingMode === OPERATING_MODES.MANAGED));
    }
  }
  function syncManagedInputButtonState() {
    const operatingMode = getOperatingMode();
    const runtimeConfig = getManagedRuntimeConfig();
    const pendingDisplayName = (managedDisplayNameInputEl?.value || managedProfile.displayName || '').trim();
    const pendingBaseUrl = sanitizeManagedBaseUrl(
      managedBackendBaseUrlInputEl?.value || getConfiguredManagedBaseUrl() || runtimeConfig?.managedBackendUrl || ''
    );
    if (managedOpenSessionBtn) {
      managedOpenSessionBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !pendingDisplayName || !pendingBaseUrl;
    }
  }
  function renderManagedShell() {
    const operatingMode = getOperatingMode();
    const managedSession = getManagedSession();
    const managedSlot = getManagedSlot(GROUP_SLOT_IDS.A);
    const runtimeConfig = getManagedRuntimeConfig();
    const effectiveManagedBaseUrl = getManagedBaseUrl();
    const backendUrlSource = getConfiguredManagedBaseUrl()
      ? 'profile'
      : (runtimeConfig?.managedBackendUrl ? 'app config' : '');
    const selectedChannelId = managedSlot.intendedChannelId || managedProfile.preferredChannelId || '';
    const joinedChannel = findManagedChannel(managedSlot.channelId || managedSession.channelId);
    const selectedChannel = findManagedChannel(selectedChannelId);
    const passcodeRequired = channelRequiresPasscode(selectedChannel) || channelRequiresPasscode(joinedChannel);
    const resolvedCount = getManagedTransportPeers().length;
    document.body.dataset.operatingMode = operatingMode;
    updateOperatingModeButtons();
    if (transportPeersHeadingEl) {
      transportPeersHeadingEl.textContent = operatingMode === OPERATING_MODES.MANAGED ? 'Transport Peers' : 'Active Peers';
    }
    if (operatingModeSummaryEl) {
      operatingModeSummaryEl.textContent = operatingMode === OPERATING_MODES.MANAGED
        ? 'Managed mode uses the documented session, channel, presence, and peer-resolution contract over HTTP.'
        : 'Direct mode uses the saved UDP peer list and current host bridge.';
    }
    if (managedModeShellEl) managedModeShellEl.hidden = operatingMode !== OPERATING_MODES.MANAGED;
    if (managedModeStatusEl) {
      managedModeStatusEl.textContent = operatingMode === OPERATING_MODES.MANAGED
        ? (managedSession.sessionId
            ? `Session ${managedSession.status || 'open'}${managedSession.expiresAt ? ` until ${formatManagedTimestamp(managedSession.expiresAt)}` : ''}`
            : 'Open a managed session, then join one channel into Group A.')
        : 'Managed shell is idle while direct mode is active.';
    }
    if (managedIdentityNameEl) {
      managedIdentityNameEl.textContent = managedProfile.displayName || managedSession.displayName || managedProfile.callsign || 'Unconfigured operator';
    }
    if (managedIdentityMetaEl) {
      managedIdentityMetaEl.textContent = managedSession.userId
        ? `User ${managedSession.userId}${managedSession.sessionId ? ` | Session ${managedSession.sessionId}` : ''}`
        : (managedProfile.callsign ? `Callsign ${managedProfile.callsign}` : 'Managed identity scaffold only');
    }
    if (managedProfileStatusEl) {
      managedProfileStatusEl.textContent = effectiveManagedBaseUrl
        ? `Backend ${effectiveManagedBaseUrl}${backendUrlSource === 'app config' ? ' | app config' : ''}`
        : 'Backend base URL not set yet';
    }
    if (managedDisplayNameInputEl) managedDisplayNameInputEl.value = managedProfile.displayName || '';
    if (managedBackendBaseUrlInputEl) {
      managedBackendBaseUrlInputEl.value = getConfiguredManagedBaseUrl() || '';
      managedBackendBaseUrlInputEl.placeholder = runtimeConfig?.managedBackendUrl || 'https://managed.example.test';
    }
    if (managedLobbyStatusEl) {
      managedLobbyStatusEl.textContent = managedCache.channels.length
        ? `${managedCache.channels.length} channel(s) cached${managedCache.lastUpdatedAt ? ` | synced ${formatManagedTimestamp(managedCache.lastUpdatedAt)}` : ''}`
        : 'No channels loaded yet';
    }
    if (managedActiveChannelEl) {
      managedActiveChannelEl.textContent = managedSlot.channelId
        ? (joinedChannel?.name || managedSlot.channelName || managedSlot.channelId)
        : 'No managed channel joined yet';
    }
    if (managedGroupAStatusEl) {
      managedGroupAStatusEl.textContent = managedSlot.channelId
        ? `${managedSlot.membershipState || 'joined'} | presence ${managedSlot.presenceState || 'offline'}`
        : 'No active managed membership';
    }
    if (managedPeerSyncMetaEl) {
      managedPeerSyncMetaEl.textContent = managedSlot.lastPeerSyncAt
        ? `${resolvedCount} transport peer(s) resolved | ${formatManagedTimestamp(managedSlot.lastPeerSyncAt)}`
        : `${resolvedCount} transport peer(s) resolved`;
    }
    if (managedPasscodeLabelEl) {
      managedPasscodeLabelEl.textContent = passcodeRequired ? 'Join Passcode (Required)' : 'Join Passcode';
    }
    if (managedJoinPasscodeInputEl) {
      managedJoinPasscodeInputEl.placeholder = passcodeRequired
        ? 'Enter the protected channel passcode'
        : 'Only for protected channels';
      managedJoinPasscodeInputEl.value = managedJoinPasscode;
    }
    if (managedErrorTextEl) {
      const errorMessage = managedSession.errorMessage || '';
      managedErrorTextEl.hidden = !errorMessage;
      managedErrorTextEl.textContent = errorMessage;
    }
    syncManagedInputButtonState();
    if (managedRefreshChannelsBtn) {
      managedRefreshChannelsBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !managedSession.sessionId;
    }
    if (managedRefreshPeersBtn) {
      managedRefreshPeersBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !managedSlot.channelId;
    }
    if (managedLeaveChannelBtn) {
      managedLeaveChannelBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !managedSlot.channelId;
    }
    if (managedChannelListEl) {
      managedChannelListEl.innerHTML = '';
      const channels = managedCache.channels.length ? managedCache.channels : [];
      if (!channels.length) {
        const item = document.createElement('li');
        item.className = 'managed-list-item';
        const title = document.createElement('strong');
        title.textContent = managedSession.sessionId ? 'No visible channels' : 'Session not opened';
        const detail = document.createElement('span');
        detail.textContent = managedSession.sessionId
          ? 'Refresh channels or verify the backend returned lobby data.'
          : 'Open a managed session to load the channel lobby.';
        item.append(title, detail);
        managedChannelListEl.appendChild(item);
      }
      for (const channel of channels) {
        const item = document.createElement('li');
        item.className = 'managed-list-item';
        const header = document.createElement('div');
        header.className = 'managed-list-item-header';
        const summary = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = channel.name || channel.channelId || 'Unnamed channel';
        const detail = document.createElement('span');
        detail.textContent = channel.description || channel.note || channel.channelId || 'Managed channel';
        const meta = document.createElement('div');
        meta.className = 'managed-list-meta';
        const security = document.createElement('span');
        security.textContent = channel.securityMode || 'open';
        const members = document.createElement('span');
        members.textContent = `${Number(channel.memberCount) || 0} member(s)`;
        meta.append(security, members);
        summary.append(title, detail, meta);
        const action = document.createElement('button');
        const isActive = managedSlot.channelId === channel.channelId;
        const isSelected = !isActive && selectedChannelId === channel.channelId;
        action.type = 'button';
        action.className = isActive ? 'secondary' : 'primary';
        action.textContent = isActive ? 'Joined' : (isSelected ? 'Join Selected' : 'Join');
        action.disabled = !managedSession.sessionId || isActive;
        action.addEventListener('click', () => {
          setManagedSlotIntent(GROUP_SLOT_IDS.A, channel.channelId);
          managedProfile.preferredChannelId = channel.channelId;
          renderManagedShell();
          joinManagedChannel(channel.channelId).catch((err) => {
            setManagedError(err?.message || 'Failed to join the managed channel.');
            renderManagedShell();
            console.error('managed join error', err);
          });
        });
        header.append(summary, action);
        item.append(header);
        managedChannelListEl.appendChild(item);
      }
    }
  }
  async function updateManagedProfileFromInputs() {
    managedProfile.displayName = (managedDisplayNameInputEl?.value || '').trim();
    managedProfile.backendBaseUrl = sanitizeManagedBaseUrl(managedBackendBaseUrlInputEl?.value || '');
    managedProfile.preferredChannelId = getManagedSlotIntent(GROUP_SLOT_IDS.A) || managedProfile.preferredChannelId || '';
    renderManagedShell();
    await persistAppState({
      includeLegacyLastPeers: true,
      includeManagedProfile: true,
      includeManagedCache: true
    });
  }
  async function ensureManagedTransportConnected() {
    await startNativeHost();
    if (!dashboardState.nativeHostConnected) return;
    await hostSend(buildHostConfigurePayload(OPERATING_MODES.MANAGED));
    if (!connected) {
      await startAudioCapture();
      connected = true;
    }
    dashboardState.localEncryptionEnabled = !!settings.encrypt;
    updateStatusDashboard();
    updateUIbuttons(true);
  }
  async function syncTransportPeerRows(options = {}) {
    const desiredPeers = getTransportPeersForMode(options.mode);
    const desiredKeys = new Set(desiredPeers.map((peer) => getPeerKey(peer)).filter(Boolean));
    for (const key of Array.from(activePeers.keys())) {
      if (!desiredKeys.has(key)) {
        deactivatePeer(key, {
          trackDirectState: false,
          persistState: false,
          sendHostUpdate: false,
          refreshSelects: false
        });
      }
    }
    for (const peer of desiredPeers) {
      if (!activePeers.has(getPeerKey(peer))) {
        activatePeer(peer, {
          trackDirectState: false,
          persistState: false,
          sendHostUpdate: false,
          refreshSelects: false
        });
      }
    }
    refreshPeerSelects(peerListEl?.value || NEW_PEER_VALUE, peerModalSelectEl?.value || NEW_PEER_VALUE);
    refreshPeerConnectionState();
    updateStatusDashboard();
    if (options.sendHostUpdate && nativeHost) {
      await hostSend(buildHostConfigurePayload(options.mode));
    }
  }
  async function setOperatingMode(nextMode, options = {}) {
    const previousMode = getOperatingMode();
    const mode = sanitizeOperatingMode(nextMode);
    const changed = mode !== previousMode;
    if (changed && previousMode === OPERATING_MODES.MANAGED) {
      await leaveManagedChannel({ preserveSession: true });
    }
    if (changed && previousMode === OPERATING_MODES.DIRECT && connected) {
      doDisconnect();
    }
    appState.operatingMode = mode;
    renderManagedShell();
    if (mode === OPERATING_MODES.MANAGED) closePeerModal(true);
    await syncTransportPeerRows({
      mode,
      sendHostUpdate: changed && dashboardState.nativeHostConnected
    });
    if (changed && mode === OPERATING_MODES.MANAGED && managedProfile.preferredChannelId && !getManagedSlotIntent(GROUP_SLOT_IDS.A)) {
      setManagedSlotIntent(GROUP_SLOT_IDS.A, managedProfile.preferredChannelId);
    }
    if (changed && mode === OPERATING_MODES.MANAGED && shouldAttemptManagedResume()) {
      try {
        await resumeManagedMode({ rejoinChannel: true });
      } catch (error) {
        setManagedError(error?.message || 'Failed to resume managed mode.');
        renderManagedShell();
      }
    }
    if (options.persist !== false) {
      await persistAppState({
        includeLegacyLastPeers: true,
        includeManagedProfile: true,
        includeManagedCache: true
      });
    }
  }
  function setCodecWarning(msg) {
    if (!codecSupportWarningEl) return;
    if (msg) {
      codecSupportWarningEl.textContent = msg;
      codecSupportWarningEl.hidden = false;
    } else {
      codecSupportWarningEl.textContent = '';
      codecSupportWarningEl.hidden = true;
    }
  }
  async function getCodecSupport(codecId, sampleRate, cfg = {}) {
    const sr = sampleRate || cfg.sampleRate || getCodecDefaults(codecId).sampleRate || 48000;
    const key = `${codecId}:${sr}`;
    if (codecSupportCache.has(key)) return codecSupportCache.get(key);
    const codecDef = getCodecConfig(codecId);
    let encoderOk = false;
    let decoderOk = false;
    if (codecDef.softwareEncoder) {
      encoderOk = true;
    } else {
      try {
        const encCfg = { ...buildEncoderConfig(codecDef, sr) };
        const bitrateKbps = Number(cfg?.bitrateKbps ?? codecDef.defaults?.bitrateKbps);
        if (Number.isFinite(bitrateKbps) && bitrateKbps > 0) encCfg.bitrate = Math.trunc(bitrateKbps * 1000);
        encoderOk = !!(await AudioEncoder.isConfigSupported(encCfg)).supported;
      } catch (e) {
        encoderOk = false;
      }
    }
    if (codecDef.softwareDecoder) {
      decoderOk = true;
    } else {
      try {
        const decCfg = buildDecoderConfig(codecDef, sr);
        decoderOk = !!(await AudioDecoder.isConfigSupported(decCfg)).supported;
      } catch (e) {
        decoderOk = false;
      }
    }
    const result = { encoder: encoderOk, decoder: decoderOk };
    codecSupportCache.set(key, result);
    return result;
  }
  async function refreshCodecSupportUI(currentCfg) {
    const sampleRate = Number(sampleRateEl?.value) || getCodecDefaults(activeCodecId).sampleRate;
    const supportResults = {};
    for (const id of CODEC_IDS) {
      const codecDef = getCodecConfig(id);
      const allowUnsupported = !!codecDef.allowUnsupported || !!codecDef.softwareEncoder || !!codecDef.softwareDecoder;
      supportResults[id] = await getCodecSupport(id, sampleRate, currentCfg);
      const opt = codecSelect?.querySelector(`option[value="${id}"]`);
      if (opt) opt.disabled = !allowUnsupported && !(supportResults[id].encoder && supportResults[id].decoder);
    }
    const activeSupport = supportResults[activeCodecId] || { encoder: true, decoder: true };
    if (!activeSupport.encoder || !activeSupport.decoder) {
      setCodecWarning(`${CODECS[activeCodecId].label} not supported by this browser; using Opus instead.`);
      if (codecSelect) codecSelect.value = activeCodecId;
    } else {
      setCodecWarning(null);
    }
  }
  function updateCodecOptionsUI(cfg) {
    const codecDef = getCodecConfig(activeCodecId);
    const showBitrate = !!codecDef.options?.bitrate;
    const showProfile = !!codecDef.options?.profile;
    const bitrateVal = Number(cfg?.bitrateKbps);
    const profileVal = cfg?.profile;

    if (codecOptionsEl) codecOptionsEl.hidden = !(showBitrate || showProfile);
    if (codecBitrateRow) codecBitrateRow.hidden = !showBitrate;
    if (codecProfileRow) codecProfileRow.hidden = !showProfile;

    if (showBitrate && codecBitrateEl) {
      codecBitrateEl.value = Number.isFinite(bitrateVal) ? bitrateVal : (codecDef.defaults?.bitrateKbps || '');
    }
    if (showProfile && codecProfileEl) {
      codecProfileEl.value = profileVal || codecDef.defaults?.profile || '';
    }
  }

  function formatGain(val) {
    const num = Number(val);
    const defaults = getCodecDefaults(activeCodecId);
    const safe = Number.isFinite(num) ? num : defaults.inputGain;
    return `${safe.toFixed(2)}x`;
  }
  function setEncryptButtonState(on) {
    if (!encryptBtn) return;
    const isOn = !!on;
    encryptBtn.dataset.state = isOn ? 'on' : 'off';
    encryptBtn.classList.toggle('active', isOn);
    encryptBtn.textContent = isOn ? 'Encryption: On' : 'Encryption: Off';
    encryptBtn.setAttribute('aria-pressed', String(isOn));
  }
  function getEncryptButtonState() {
    return encryptBtn?.dataset.state === 'on';
  }
  function updatePeerGainLabel(el, val) {
    if (!el) return;
    el.textContent = formatGain(val);
  }
  function applyTheme(theme) {
    themePreference = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('theme-light', themePreference === 'light');
    document.body.classList.toggle('theme-dark', themePreference !== 'light');
    if (darkModeToggle) darkModeToggle.checked = themePreference === 'dark';
    if (themeStatusEl) themeStatusEl.textContent = themePreference === 'dark' ? 'Dark mode' : 'Light mode';
    storage.set({ [THEME_STORAGE_KEY]: themePreference });
  }
  function updateInputGain(val, opts = {}) {
    const { persist = false, applyWorklet = true, updateSettings = true } = opts;
    const defaults = getCodecDefaults(activeCodecId);
    const nextGain = Math.max(0.01, Math.min(4.0, Number(val) || defaults.inputGain));
    if (updateSettings) {
      settings.inputGain = nextGain;
      inputGain = nextGain;
    }
    if (inputGainEl) inputGainEl.value = String(nextGain);
    if (gainValueEl) gainValueEl.textContent = formatGain(nextGain);
    if (applyWorklet && workletNode) workletNode.port.postMessage({ type: 'config', gain: nextGain });
    if (persist) {
      storage.set({
        [getSettingsStorageKey(activeCodecId)]: settings,
        [getInputGainStorageKey(activeCodecId)]: nextGain,
        [SELECTED_CODEC_STORAGE_KEY]: activeCodecId
      });
      log(`inputGain set to ${nextGain.toFixed(2)}x`);
    }
  }
  function syncSettingsForm(values) {
    const defaults = getCodecDefaults(activeCodecId);
    const cfg = { ...defaults, ...(values || settings) };
    setEncryptButtonState(cfg.encrypt);
    if (codecSelect) codecSelect.value = activeCodecId;
    updateCodecOptionsUI(cfg);
    if (frameMsEl) frameMsEl.value = cfg.frameMs;
    if (sampleRateEl) sampleRateEl.value = cfg.sampleRate;
    if (localPortEl) localPortEl.value = cfg.localPort;
    if (deadTimeEl) deadTimeEl.value = cfg.deadTime;
    if (statsIntervalEl) statsIntervalEl.value = cfg.statsInterval;
    if (jitterSamplesEl) jitterSamplesEl.value = cfg.jitterSamples;
    if (pingIntervalEl) pingIntervalEl.value = cfg.pingInterval;
    if (pingHistoryEl) pingHistoryEl.value = cfg.pingHistory;
    if (inputGainEl) inputGainEl.value = cfg.inputGain;
    updatePeerGainLabel(gainValueEl, cfg.inputGain);
  }
  function collectSettingsFromForm() {
    const defaults = getCodecDefaults(activeCodecId);
    return {
      encrypt: getEncryptButtonState(),
      frameMs: Number(frameMsEl?.value) || defaults.frameMs,
      sampleRate: Number(sampleRateEl?.value) || defaults.sampleRate,
      localPort: Number(localPortEl?.value) || defaults.localPort,
      deadTime: Number(deadTimeEl?.value) || defaults.deadTime,
      statsInterval: Number(statsIntervalEl?.value) || defaults.statsInterval,
      jitterSamples: Number(jitterSamplesEl?.value) || defaults.jitterSamples,
      pingInterval: Number(pingIntervalEl?.value) || defaults.pingInterval,
      pingHistory: Number(pingHistoryEl?.value) || defaults.pingHistory,
      inputGain: Number(inputGainEl?.value) || defaults.inputGain,
      bitrateKbps: codecOptionsEl?.hidden || !codecBitrateEl ? defaults.bitrateKbps : (Number(codecBitrateEl.value) || defaults.bitrateKbps),
      profile: codecOptionsEl?.hidden || !codecProfileEl ? defaults.profile : (codecProfileEl.value || defaults.profile)
    };
  }
  async function saveSettingsFromModal() {
    const next = collectSettingsFromForm();
    const defaults = getCodecDefaults(activeCodecId);
    settings = { ...defaults, ...next };
    applySettingsToInputs(settings, { persistGain: false });
    await storage.set({
      [getSettingsStorageKey(activeCodecId)]: settings,
      [getInputGainStorageKey(activeCodecId)]: settings.inputGain,
      [SELECTED_CODEC_STORAGE_KEY]: activeCodecId
    });
    closeSettingsModal();
  }
  async function resetSettingsToDefault() {
    settings = { ...getCodecDefaults(activeCodecId) };
    applySettingsToInputs(settings, { persistGain: false });
    syncSettingsForm(settings);
    await storage.set({
      [getSettingsStorageKey(activeCodecId)]: settings,
      [getInputGainStorageKey(activeCodecId)]: settings.inputGain,
      [SELECTED_CODEC_STORAGE_KEY]: activeCodecId
    });
  }
  function applySettingsToInputs(cfg, opts = {}) {
    const defaults = getCodecDefaults(activeCodecId);
    const merged = { ...defaults, ...(cfg || {}) };
    settings = merged;
    setEncryptButtonState(merged.encrypt);
    if (codecSelect) codecSelect.value = activeCodecId;
    updateCodecOptionsUI(merged);
    if (frameMsEl) frameMsEl.value = merged.frameMs;
    if (sampleRateEl) sampleRateEl.value = merged.sampleRate;
    if (localPortEl) localPortEl.value = merged.localPort;
    if (deadTimeEl) deadTimeEl.value = merged.deadTime;
    if (statsIntervalEl) statsIntervalEl.value = merged.statsInterval;
    if (jitterSamplesEl) jitterSamplesEl.value = merged.jitterSamples;
    if (pingIntervalEl) pingIntervalEl.value = merged.pingInterval;
    if (pingHistoryEl) pingHistoryEl.value = merged.pingHistory;
    updateInputGain(merged.inputGain, { persist: !!opts.persistGain, applyWorklet: opts.applyWorklet ?? true });
    dashboardState.localEncryptionEnabled = !!merged.encrypt;
    updateStatusDashboard();
  }
  function openSettingsModal() {
    if (!settingsModalEl) return;
    syncSettingsForm(settings);
    settingsModalEl.hidden = false;
  }
  function closeSettingsModal(resetForm) {
    if (settingsModalEl) settingsModalEl.hidden = true;
    if (resetForm) syncSettingsForm(settings);
  }
  async function changeCodec(nextCodecId) {
    const validId = getValidCodecId(nextCodecId);
    const codecDef = getCodecConfig(validId);
    const allowUnsupported = !!codecDef.allowUnsupported || !!codecDef.softwareEncoder || !!codecDef.softwareDecoder;
    if (validId === activeCodecId) {
      if (codecSelect && codecSelect.value !== validId) codecSelect.value = validId;
      return;
    }
    const settingsKey = getSettingsStorageKey(validId);
    const gainKey = getInputGainStorageKey(validId);
    const defaults = getCodecDefaults(validId);
    const got = await storage.get([settingsKey, gainKey]);
    const storedSettings = got[settingsKey];
    const merged = storedSettings && typeof storedSettings === 'object'
      ? { ...defaults, ...storedSettings }
      : { ...defaults };
    if (typeof got[gainKey] === 'number') merged.inputGain = got[gainKey];

    const support = await getCodecSupport(validId, merged.sampleRate, merged);
    if (!allowUnsupported && (!support.encoder || !support.decoder)) {
      const prevId = activeCodecId;
      if (codecSelect) codecSelect.value = prevId;
      setCodecWarning(`${CODECS[validId].label} not supported by this browser (encoder/decoder check failed).`);
      await refreshCodecSupportUI(settings);
      return;
    }
    if (allowUnsupported && (!support.encoder || !support.decoder)) {
      setCodecWarning(`${CODECS[validId].label} encoder/decoder not reported by this browser; will attempt anyway and may fall back if it fails.`);
    } else {
      setCodecWarning(null);
    }

    activeCodecId = validId;
    settings = merged;
    await storage.set({ [SELECTED_CODEC_STORAGE_KEY]: validId });
    applySettingsToInputs(settings, { persistGain: false, applyWorklet: false });
    syncSettingsForm(settings);
    await refreshCodecSupportUI(settings);
  }

  function onHostMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const msgText = msg.text || msg.message;
    if (msg.type === 'log' || msg.type === 'info' || msg.type === 'status') {
      if (msgText) log(msgText);
      return;
    } else if (msg.type === 'error') {
      log(`ERROR: ${JSON.stringify(msg)}`);
      return;
    } else if (msg.type === 'encryption_mismatch') {
      dashboardState.encryptionMismatch = true;
      log(`ENCRYPTION MISMATCH: Local=${msg.localState ?? 'unknown'}, Remote=${msg.remoteState ?? 'unknown'}`);
      updateStatusDashboard();
      return;
    } else if (msg.type === 'receivedata') {
      markAudioReceiveActivity(msg);
      playAudio(msg.peerKey, msg.data, msg.timestamp, msg.dataType);
      return;
    } else if (msg.type === 'state') {
      if (typeof msg.latched === 'boolean') {
        dashboardState.peerLatched = msg.latched;
      }
      if (typeof msg.encryptionEnabled === 'boolean') {
        settings.encrypt = msg.encryptionEnabled;
        dashboardState.localEncryptionEnabled = !!msg.encryptionEnabled;
        setEncryptButtonState(msg.encryptionEnabled);
        updateStatusDashboard();
        if (!msg.encryptionEnabled) encryptionKeyHex = null;
      }
      return;
    } else if (msg.type === 'pingHistory') {
      const id = getPeerRowId(msg.peerKey);
      let pingHistory = msg.pingHistory.map(x => x.rtt).filter(x => x != null)
      let avg = pingHistory.reduce((a, x) => a + x, 0) / pingHistory.length / 1000;
      const row = document.getElementById(id);
      if (row) row.querySelector("td.rtt").textContent = Math.round(avg);
      updatePeerRuntimeStats(msg.peerKey, { rtt: Number.isFinite(avg) ? Math.round(avg) : null });
    } else if (msg.type === 'stats') {
      if (msg.stats) {
        const id = getPeerRowId(msg.peerKey);
        let s = msg.stats.jitterSamples
        let jitter
        if (s.length < 2) {
          jitter = 0
        } else {
          let sum = 0
          for (let i = 1; i < s.length; i++) {
            sum += Math.abs(s[i] - s[i - 1])
          }
          jitter = Math.round((sum / (s.length - 1)) / 1000 )
        }
        const row = document.getElementById(id);
        if (row) {
          row.querySelector("td.jitter").textContent = Math.round(jitter);
          row.querySelector("td.ooo").textContent = msg.stats.oooCount;
          row.querySelector("td.dups").textContent = msg.stats.duplicateCount;
          row.querySelector("td.loss").textContent = msg.stats.lossDetected;
        }
        updatePeerRuntimeStats(msg.peerKey, {
          jitter: Math.round(jitter),
          ooo: Number(msg.stats.oooCount) || 0,
          dups: Number(msg.stats.duplicateCount) || 0,
          loss: Number(msg.stats.lossDetected) || 0
        });
      }
    } else if (msg.type === 'version') {
      dashboardState.nativeHostVersion = msg.version
    } else if (msg.type === 'peerUpdate') {
      let peer = allPeers.find(p => `${p.ip}:${p.port}` === msg.key);
      if (!peer && getOperatingMode() === OPERATING_MODES.MANAGED) {
        peer = appState.managed.transportPeers.find((entry) => `${entry.ip}:${entry.port}` === msg.key) || null;
      }
      if (!peer || !msg.field) {
        if (msgText) log(`peerUpdate ignored: ${msgText}`);
      } else {
        peer[msg.field] = msg[msg.field];
        if (allPeers.includes(peer)) storage.set({ udp1492_peers: allPeers });
      }
      if (msg.field == 'connected' && peer){
        if (msg[msg.field]){
          playSound("enter")
        } else {
          playSound("exit")
        }
        refreshPeerConnectionState();
      }
    }
    updateStatusDashboard();
    if (msgText) log(`${msg.type || 'message'}: ${msgText}`);
  }
  async function hostSend(obj) {
    if (!nativeHost) return false;
    try {
      await platform.sendHostMessage(obj);
      return true;
    } catch (e) {
      log(`postMessage error: ${e.message}`);
      return false;
    }
  }

  async function startAudioCapture() {
    if (testPlatform?.flags?.skipAudioCapture) {
      dashboardState.micActive = false;
      dashboardState.audioTxActive = false;
      updateStatusDashboard();
      log('audio capture skipped in test mode');
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: Number(sampleRateEl?.value) || 48000 });
      targetSampleRate = ac.sampleRate;
      const frameMs = Number(frameMsEl?.value) || 20;
      samplesPerFrame = Math.max(1, Math.round(frameMs * targetSampleRate / 1000));

      if (!masterGain) {
        masterGain = new GainNode(ac, { gain: 1 });
        masterGain.connect(ac.destination);
      }
      let codecDef = getCodecConfig(activeCodecId);
      let softwareEncode = !!codecDef.softwareEncoder;
      let useHeader = codecDef.useHeader !== false;
      let dataType = codecDef.dataType || TYPE_AUDIO_OPUS;
      await ac.audioWorklet.addModule(new URL('./capture-processor.js', window.location.href).toString());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: false, echoCancellation: false, autoGainControl: false, sampleRate: targetSampleRate },
        video: false
      });
      micStream = stream;

      if (!softwareEncode) {
        encoder = new AudioEncoder({
          output: (chunk) => {
            const payload = packEncodedChunk(chunk, useHeader);
            if (debugEnabled) verifyLocally(chunk);
            let config = {
              type: 'sendData',
              dataType,
              data: base64FromUint8(payload),
              isBase64: true,
              doStats: true,
              timestamp: Math.trunc(chunk.timestamp ?? performance.now() * 1000) // microseconds
            }
            if (dataType == TYPE_AUDIO_PCM) config.doGzip = true;
            hostSend(config);
          },
          error: (e) => console.error('Encoder error:', e)
        });
        let encoderConfig = buildEncoderConfig(codecDef, targetSampleRate);
        const bitrateKbps = Number(settings.bitrateKbps);
        if (Number.isFinite(bitrateKbps) && bitrateKbps > 0) {
          encoderConfig.bitrate = Math.trunc(bitrateKbps * 1000);
        } else if (codecDef.id === 'opus') {
          encoderConfig.bitrate = 32000;
        }
        try {
          encoder.configure(encoderConfig);
        } catch (e) {
          console.warn(`Encoder configure failed for codec ${codecDef.id}, falling back to ${DEFAULT_CODEC}:`, e);
          activeCodecId = DEFAULT_CODEC;
          codecDef = getCodecConfig(activeCodecId);
          softwareEncode = !!codecDef.softwareEncoder;
          useHeader = codecDef.useHeader !== false;
          dataType = codecDef.dataType || TYPE_AUDIO_OPUS;
          const fallbackDef = codecDef;
          encoderConfig = buildEncoderConfig(fallbackDef, targetSampleRate);
          encoderConfig.bitrate = 32000;
          if (codecSelect) codecSelect.value = activeCodecId;
          encoder.configure(encoderConfig);
        }
      } else {
        encoder = null;
      }

      micSource = ac.createMediaStreamSource(stream);
      workletNode = new AudioWorkletNode(ac, 'capture-processor', { processorOptions: { frameSamples: samplesPerFrame, gain: inputGain } });
      workletNode.port.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type === 'frame' && d.buf) {
          const i16 = new Int16Array(d.buf);
          if (micMeterEl && typeof d.peak === 'number') micMeterEl.value = d.peak;

          if (softwareEncode) {
            const timestampUs = Math.trunc(performance.now() * 1000);
            const durationUs = Math.trunc(samplesPerFrame * 1000000 / targetSampleRate);
            let encoded;
            if (codecDef.id === 'g711a') {
              encoded = encodeALaw(i16);
            } else if (codecDef.id === 'g711u') {
              encoded = encodeMuLaw(i16);
            } else {
              encoded = new Uint8Array(i16.buffer.slice(i16.byteOffset, i16.byteOffset + i16.byteLength));
            }
            const payload = useHeader ? packPayloadWithHeader(encoded, timestampUs, durationUs) : encoded;
            hostSend({
              type: 'sendData',
              dataType,
              data: base64FromUint8(payload),
              isBase64: true,
              doStats: true,
              timestamp: timestampUs
            });
            return;
          }

          // Convert Int16 → Float32 for encoder
          const f32 = new Float32Array(i16.length);
          for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

          const audioData = new AudioData({
            format: 'f32',
            sampleRate: targetSampleRate,
            numberOfFrames: f32.length,
            numberOfChannels: 1,
            timestamp: performance.now() * 1000,
            data: f32
          });
          encoder.encode(audioData);
        }
      };
      micSource.connect(workletNode);
      const silentSink = new GainNode(ac, { gain: 0 });
      workletNode.connect(silentSink).connect(ac.destination);
      dashboardState.micActive = true;
      updateStatusDashboard();
      log(`audio capture started @ ${targetSampleRate} Hz, frame ${samplesPerFrame} samples`);
    } catch (e) {
      log('AudioWorklet path failed, will fallback: ' + e.message);
      try { ac?.close(); } catch {}
      ac = null; workletNode = null; micSource = null;
      dashboardState.micActive = false;
      updateStatusDashboard();
    }
  }
  async function initDecoder(peerKey, codecId) {
    if (!peerKey) return null;
    const decoderKey = getDecoderKey(peerKey, codecId);
    if (decoders.has(decoderKey)) return decoders.get(decoderKey);

    const codecDef = getCodecConfig(codecId);
    if (codecDef.softwareDecoder) return null;
    const decoder = new AudioDecoder({
      output: (audioData) => {
        handleDecodedAudio(peerKey, audioData);
      },
      error: e => console.error('Decoder error:', e)
    });

    let decoderConfig = buildDecoderConfig(codecDef, targetSampleRate);
    try {
      decoder.configure(decoderConfig);
    } catch (e) {
      console.warn(`Decoder configure failed for codec ${codecDef.id}, falling back to ${DEFAULT_CODEC}:`, e);
      const fallbackDef = getCodecConfig(DEFAULT_CODEC);
      decoderConfig = buildDecoderConfig(fallbackDef, targetSampleRate);
      decoder.configure(decoderConfig);
    }
    decoders.set(decoderKey, decoder);
    return decoder;
  }
  function stopAudioCapture() {
    try { workletNode?.disconnect(); } catch {}
    try { micSource?.disconnect(); } catch {}
    try { ac?.close(); } catch {}
    micStream?.getTracks()?.forEach(t => t.stop());
    workletNode = micSource = micStream = ac = null;
    peerPlaybackTimes.clear();
    decoders.forEach(d => { try { d.close(); } catch {} });
    decoders.clear();
    peerGains.forEach(g => { try { g.disconnect(); } catch {} });
    peerGains.clear();
    peerMeters.clear();
    peerMuteStates.clear();
    statusDashboard.clearAudioReceiveActivity();
    masterGain = null;
    dashboardState.micActive = false;
    dashboardState.audioTxActive = false;
    updateStatusDashboard();
    log('audio capture stopped');
    PLAYBACK_HEADROOM = 0.05;
  }
  async function playAudio(peerKey, audio_base64, timestamp, dataType) {
    if (!peerKey) {
      console.warn('Received audio without peerKey, dropping frame');
      return;
    }
    const codecDef = getCodecByDataType(Number(dataType));
    const codecId = codecDef.id;
    const useHeader = codecDef.useHeader !== false;
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: Number(sampleRateEl?.value) || 48000 });
      targetSampleRate = ac.sampleRate;
    }
    if (!masterGain) {
      masterGain = new GainNode(ac, { gain: 1 });
      masterGain.connect(ac.destination);
    }
    await initDecoder(peerKey, codecId);

    const audio = base64ToUint8(audio_base64);
    let hasHeader = useHeader && audio.length >= AUDIO_HEADER_SIZE;
    let chunkType = 'key';
    let chunkTimestamp = timestamp || performance.now() * 1000;
    let chunkDuration = undefined;
    let frameData = audio;

    if (hasHeader) {
      const view = new DataView(audio.buffer, audio.byteOffset, AUDIO_HEADER_SIZE);
      const typeByte = view.getUint8(0);
      chunkType = typeByte === 1 ? 'delta' : 'key';
      chunkTimestamp = Number(view.getBigUint64(1));
      chunkDuration = view.getUint32(9);
      const expectedChecksum = view.getUint32(13);
      const payload = audio.subarray(AUDIO_HEADER_SIZE);
      const actualChecksum = checksum32(payload);
      if (actualChecksum === expectedChecksum) {
        frameData = payload;
        debugCounters.recv++;
        debugCounters.headerOk++;
        recordRxFrame({ ts: chunkTimestamp, len: frameData.length, duration: chunkDuration, type: chunkType, header: 'ok' });
      } else {
        debugCounters.checksumMismatch++;
        if (!unknownHeaderWarned) {
          console.warn('Received audio without valid checksum header; falling back to legacy decode');
          unknownHeaderWarned = true;
        }
        hasHeader = false;
        frameData = audio;
        chunkType = 'key';
        chunkTimestamp = timestamp || performance.now() * 1000;
        chunkDuration = undefined;
        recordRxFrame({ ts: chunkTimestamp, len: frameData.length, duration: chunkDuration, type: chunkType, header: 'bad' });
      }
    } else if (useHeader) {
      debugCounters.headerMissing++;
      if (!unknownHeaderWarned) {
        console.warn('Received audio payload too small for header; falling back to legacy decode');
        unknownHeaderWarned = true;
      }
      recordRxFrame({ ts: chunkTimestamp, len: frameData.length, duration: chunkDuration, type: chunkType, header: 'missing' });
    }

    if (codecDef.softwareDecoder) {
      let decodedFrames = null;
      if (codecDef.id === 'g711a') {
        decodedFrames = decodeALaw(frameData);
      } else if (codecDef.id === 'g711u') {
        decodedFrames = decodeMuLaw(frameData);
      } else if (codecDef.id === 'pcm') {
        const pcm = new Int16Array(frameData.buffer, frameData.byteOffset, Math.trunc(frameData.byteLength / 2));
        const f32 = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
        decodedFrames = f32;
      }
      if (decodedFrames) {
        schedulePcmFrames(peerKey, decodedFrames, codecDef.defaults?.sampleRate || targetSampleRate || 48000);
      }
      return;
    }

    const chunk = new EncodedAudioChunk({
      type: chunkType,
      timestamp: chunkTimestamp || performance.now() * 1000,
      duration: chunkDuration || undefined,
      data: frameData
    });

    const decoder = decoders.get(getDecoderKey(peerKey, codecId));
    if (decoder) decoder.decode(chunk);
  }
  function getPeerBaseGain(peerKey) {
    const p = activePeers.get(peerKey);
    const val = Number(p?.gain);
    return Number.isFinite(val) && val > 0 ? val : 1;
  }
  function getPeerGain(peerKey) {
    if (peerGains.has(peerKey)) return peerGains.get(peerKey);
    const baseGain = getPeerBaseGain(peerKey);
    const muted = !!peerMuteStates.get(peerKey);
    const g = new GainNode(ac, { gain: muted ? 0 : baseGain });
    if (masterGain) {
      g.connect(masterGain);
    } else {
      g.connect(ac.destination);
    }
    peerGains.set(peerKey, g);
    return g;
  }
  function schedulePcmFrames(peerKey, frames, sampleRateHint) {
    let peak = 0;
    for (let i = 0; i < frames.length; i++) {
      const v = Math.abs(frames[i]);
      if (v > peak) peak = v;
    }
    updatePeerMeter(peerKey, peak);

    const effectiveSampleRate = Number.isFinite(sampleRateHint) && sampleRateHint > 0
      ? sampleRateHint
      : (targetSampleRate || 48000); // AudioData sampleRate is unreliable (often 0)
    const frameDuration = Number.isFinite(frames.length / effectiveSampleRate) && effectiveSampleRate > 0
      ? frames.length / effectiveSampleRate
      : (samplesPerFrame / (targetSampleRate || 48000));

    const buf = ac.createBuffer(1, frames.length, ac.sampleRate || targetSampleRate || 48000);
    buf.copyToChannel(frames, 0);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const peerGain = getPeerGain(peerKey);
    src.connect(peerGain);

    const now = ac.currentTime;
    let playbackTime = peerPlaybackTimes.get(peerKey);
    if (!Number.isFinite(playbackTime) || playbackTime <= now || (playbackTime - now) > 1) {
      playbackTime = now + PLAYBACK_HEADROOM;
    }

    const scheduledFor = playbackTime;
    src.start(scheduledFor);
    playbackTime += frameDuration;
    peerPlaybackTimes.set(peerKey, playbackTime);
    if (debugEnabled) {
      audioDebug.schedule.push({
        peerKey,
        now,
        scheduledFor,
        delta: scheduledFor - now,
        frameDuration,
        sampleRate: sampleRateHint,
        effectiveSampleRate
      });
      if (audioDebug.schedule.length > 50) audioDebug.schedule.shift();
    }
  }
  function handleDecodedAudio(peerKey, audioData) {
    const frames = new Float32Array(audioData.numberOfFrames * audioData.numberOfChannels);
    audioData.copyTo(frames, { planeIndex: 0 });
    audioData.close();
    schedulePcmFrames(peerKey, frames, audioData.sampleRate);
  }
  function updatePeerMeter(peerKey, peak) {
    const meter = peerMeters.get(peerKey);
    if (!meter) return;
    meter.value = Math.max(0, Math.min(1, peak || 0));
  }
  function togglePeerMute(peerKey) {
    const next = !peerMuteStates.get(peerKey);
    peerMuteStates.set(peerKey, next);
    const gainNode = getPeerGain(peerKey);
    gainNode.gain.value = next ? 0 : getPeerBaseGain(peerKey);
    const btn = document.getElementById(getPeerMuteButtonId(peerKey));
    if (btn) {
      setMuteButtonVisual(btn, next);
      btn.classList.toggle('peer-muted', next);
    }
  }

  async function connect() {
    if (getOperatingMode() === OPERATING_MODES.MANAGED) {
      return;
    }
    await startNativeHost();
    if (!dashboardState.nativeHostConnected) {
      log('native host unavailable; connect aborted');
      return;
    }
    await hostSend(buildHostConfigurePayload());
    await startAudioCapture();
    connected = true;
    dashboardState.localEncryptionEnabled = !!settings.encrypt;
    updateStatusDashboard();
    updateUIbuttons(true);
  }
  function doDisconnect() {
    if (getOperatingMode() === OPERATING_MODES.MANAGED) stopManagedTimers();
    stopAudioCapture();
    connected = false;
    dashboardState.nativeHostConnected = false;
    dashboardState.nativeHostVersion = null;
    updateStatusDashboard();
    updateUIbuttons(false);
    platform.stopHost().catch((err) => log(`stopHost error: ${err.message}`));
    log('sent disconnect');
  }
  async function deriveKeyHex(secret) {
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(secret);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const view = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
    return hex;
  }
  function updateUIbuttons(isConnected) {
    const managedMode = getOperatingMode() === OPERATING_MODES.MANAGED;
    if (connectBtn) connectBtn.disabled = managedMode || isConnected;
    if (disconnectBtn) disconnectBtn.disabled = managedMode || !isConnected;
    if (encryptBtn) encryptBtn.disabled = isConnected;
  }
  async function startNativeHost() {
    if (nativeHost) return nativeHost;
    let removeMessageListener = () => {};
    let removeDisconnectListener = () => {};
    try {
      removeMessageListener = platform.onHostMessage(onHostMessage);
      removeDisconnectListener = platform.onHostDisconnect(() => {
        log('native host disconnected');
        dashboardState.nativeHostConnected = false;
        dashboardState.nativeHostVersion = null;
        updateUIbuttons(false);
        updateStatusDashboard();
        removeMessageListener();
        removeDisconnectListener();
        nativeHost = null;
        if (connected) doDisconnect();
      });
      await platform.startHost();
      nativeHost = { removeMessageListener, removeDisconnectListener };
      dashboardState.nativeHostConnected = true;
      updateStatusDashboard();
      log('connected to native host');
      await hostSend({type: 'version',version: VERSION });
    } catch (e) {
      removeMessageListener();
      removeDisconnectListener();
      log('failed to start native host: ' + e.message);
      dashboardState.nativeHostConnected = false;
      updateStatusDashboard();
    }
    return nativeHost;
  }
  async function loadSaved() {
    const settingsKeys = CODEC_IDS.map((id) => getSettingsStorageKey(id));
    const gainKeys = CODEC_IDS.map((id) => getInputGainStorageKey(id));
    const got = await storage.get([
      SETTINGS_STORAGE_KEY,
      THEME_STORAGE_KEY,
      APP_STATE_V2_STORAGE_KEY,
      MANAGED_PROFILE_STORAGE_KEY,
      MANAGED_CACHE_STORAGE_KEY,
      'udp1492_peers',
      'udp1492_last_peers',
      'udp1492_debug_enabled',
      INPUT_GAIN_STORAGE_KEY,
      SELECTED_CODEC_STORAGE_KEY,
      ...settingsKeys,
      ...gainKeys
    ]);

    const migrations = {};
    const storedCodec = got[SELECTED_CODEC_STORAGE_KEY];
    const hasValidStoredCodec = CODECS[storedCodec];
    activeCodecId = getValidCodecId(storedCodec || DEFAULT_CODEC);
    const opusSettingsKey = getSettingsStorageKey('opus');
    const opusGainKey = getInputGainStorageKey('opus');
    if (!got[opusSettingsKey] && got[SETTINGS_STORAGE_KEY] && typeof got[SETTINGS_STORAGE_KEY] === 'object') {
      migrations[opusSettingsKey] = { ...getCodecDefaults('opus'), ...got[SETTINGS_STORAGE_KEY] };
    }
    if (typeof got[INPUT_GAIN_STORAGE_KEY] === 'number' && typeof got[opusGainKey] !== 'number') {
      migrations[opusGainKey] = got[INPUT_GAIN_STORAGE_KEY];
    }
    if (!storedCodec || !hasValidStoredCodec) {
      migrations[SELECTED_CODEC_STORAGE_KEY] = activeCodecId;
    }
    if (Object.keys(migrations).length) {
      Object.assign(got, migrations);
      await storage.set(migrations);
    }

    const activeSettingsKey = getSettingsStorageKey(activeCodecId);
    const activeGainKey = getInputGainStorageKey(activeCodecId);
    const storedSettings = got[activeSettingsKey];
    const defaults = getCodecDefaults(activeCodecId);
    settings = storedSettings && typeof storedSettings === 'object'
      ? { ...defaults, ...storedSettings }
      : { ...defaults };
    if (typeof got[activeGainKey] === 'number') settings.inputGain = got[activeGainKey];

    applySettingsToInputs(settings, { persistGain: false, applyWorklet: false });
    syncSettingsForm(settings);

    const storedTheme = got[THEME_STORAGE_KEY];
    applyTheme(typeof storedTheme === 'string' ? storedTheme : themePreference);

    allPeers = Array.isArray(got['udp1492_peers']) ? got['udp1492_peers'] : [];
    const storedAppState = got[APP_STATE_V2_STORAGE_KEY];
    const hasStoredAppState = storedAppState && typeof storedAppState === 'object' && Number(storedAppState.version) === 2;
    const needsAppStateNormalization = !hasStoredAppState
      || !!storedAppState?.managed?.session
      || Array.isArray(storedAppState?.managed?.transportPeers)
      || typeof storedAppState?.managed?.shell?.selectedChannelId === 'string'
      || !storedAppState?.managed?.slots;
    appState = hasStoredAppState
      ? createDefaultAppStateV2(storedAppState)
      : synthesizeAppStateV2({
          peers: allPeers,
          lastPeers: got['udp1492_last_peers']
        });
    managedProfile = createDefaultManagedProfile(got[MANAGED_PROFILE_STORAGE_KEY]);
    managedCache = createDefaultManagedCache(got[MANAGED_CACHE_STORAGE_KEY]);
    if (!getManagedSlotIntent(GROUP_SLOT_IDS.A) && managedProfile.preferredChannelId) {
      setManagedSlotIntent(GROUP_SLOT_IDS.A, managedProfile.preferredChannelId);
    }
    renderManagedShell();
    await syncTransportPeerRows({ sendHostUpdate: false });
    if (needsAppStateNormalization || !got[MANAGED_PROFILE_STORAGE_KEY] || !got[MANAGED_CACHE_STORAGE_KEY]) {
      await persistAppState({
        includeLegacyLastPeers: true,
        includeManagedProfile: true,
        includeManagedCache: true
      });
    }
    if (shouldAttemptManagedResume()) {
      try {
        await resumeManagedMode({ rejoinChannel: true });
      } catch (error) {
        setManagedError(error?.message || 'Failed to restore managed mode.');
        renderManagedShell();
      }
    }


    if (typeof got['udp1492_debug_enabled'] === 'boolean') setDebugEnabled(got['udp1492_debug_enabled']);
    await refreshCodecSupportUI(settings);
    const activeDef = getCodecConfig(activeCodecId);
    const allowUnsupported = !!activeDef.allowUnsupported || !!activeDef.softwareEncoder || !!activeDef.softwareDecoder;
    const activeSupport = await getCodecSupport(activeCodecId, settings.sampleRate, settings);
    if (!activeSupport.encoder || !activeSupport.decoder) {
      if (allowUnsupported) {
        setCodecWarning(`${CODECS[activeCodecId].label} encoder/decoder not reported by this browser; attempting anyway. Expect fallback if it fails.`);
      } else {
        setCodecWarning(`${CODECS[activeCodecId].label} not supported by this browser (encoder/decoder check failed). Switching to Opus.`);
        await changeCodec(DEFAULT_CODEC);
      }
    } else {
      setCodecWarning(null);
    }
  }

  function handlePeerSelection(value) {
    if (getOperatingMode() !== OPERATING_MODES.DIRECT) return;
    if (value === NEW_PEER_VALUE) {
      openPeerModal(NEW_PEER_VALUE);
      return;
    }
    const peer = allPeers.find(p => `${p.ip}:${p.port}` === value);
    if (!peer) {
      refreshPeerSelects(NEW_PEER_VALUE);
      return;
    }
    if (!activePeers.has(value)) activatePeer(peer);
  }
  function openPeerModal(initialKey = NEW_PEER_VALUE) {
    if (getOperatingMode() !== OPERATING_MODES.DIRECT) return;
    refreshPeerSelects(peerListEl?.value || initialKey, initialKey);
    loadPeerIntoModal(initialKey);
    if (peerModalEl) peerModalEl.hidden = false;
  }
  function closePeerModal(resetForm) {
    if (peerModalEl) peerModalEl.hidden = true;
    if (resetForm) loadPeerIntoModal(peerListEl?.value || NEW_PEER_VALUE);
  }
  function loadPeerIntoModal(key) {
    if (!peerModalSelectEl) return;
    if (peerModalSelectEl.value !== key) peerModalSelectEl.value = key;
    const defaults = getCodecDefaults(activeCodecId);
    const peer = allPeers.find(p => `${p.ip}:${p.port}` === key) || { name: '', ip: '', port: settings.localPort || defaults.localPort, gain: defaults.inputGain };
    if (peerModalNameEl) peerModalNameEl.value = peer.name || '';
    if (peerModalIpEl) peerModalIpEl.value = peer.ip || '';
    if (peerModalPortEl) peerModalPortEl.value = peer.port || defaults.localPort;
    if (peerModalKeyEl) peerModalKeyEl.value = peer.sharedKey || '';
    if (peerModalGainEl) peerModalGainEl.value = peer.gain || defaults.inputGain;
    updatePeerGainLabel(peerModalGainValueEl, peerModalGainEl?.value);
    if (peerModalDeleteBtn) peerModalDeleteBtn.hidden = key === NEW_PEER_VALUE;
    if (peerModalOtherFieldsEl) {
      peerModalOtherFieldsEl.innerHTML = '';
        if (key !== NEW_PEER_VALUE) {
          for (const attr of Object.keys(peer)) {
            if (['name','ip','port','sharedKey','gain'].includes(attr)) continue;
          const row = document.createElement("div");
          row.className = "other-row";
          const delBtn = document.createElement("button");
          delBtn.textContent = "Remove";
          delBtn.onclick = () => { row.remove(); };
          const label = document.createElement("span");
          label.textContent = attr;
          row.appendChild(delBtn);
          row.appendChild(label);
          peerModalOtherFieldsEl.appendChild(row);
        }
      }
    }
  }
  async function savePeerFromModal() {
    const selection = peerModalSelectEl?.value || NEW_PEER_VALUE;
    const isNew = selection === NEW_PEER_VALUE;
    const name = (peerModalNameEl?.value || '').trim();
    const ip = (peerModalIpEl?.value || '').trim();
    const port = parseInt(peerModalPortEl?.value, 10);
    let gain = Number(peerModalGainEl?.value);
    const defaults = getCodecDefaults(activeCodecId);
    if (!Number.isFinite(gain)) gain = defaults.inputGain;
    let sharedKey = (peerModalKeyEl?.value || '').trim();
    if (sharedKey) sharedKey = await deriveKeyHex(sharedKey);

    if (!name || !ip || !port) {
      alert("Name, IP, and Port are required.");
      return;
    }
    const nextKey = `${ip}:${port}`;
    if (isNew && allPeers.some(p => `${p.ip}:${p.port}` === nextKey)) {
      alert("Duplicate Peer.");
      return;
    }

    let peer = allPeers.find(p => `${p.ip}:${p.port}` === (isNew ? nextKey : selection));
    if (!peer || isNew) {
      peer = { name, ip, port, sharedKey, gain };
      allPeers.push(peer);
      if (getOperatingMode() === OPERATING_MODES.DIRECT) activatePeer(peer);
    } else {
      const otherLabels = new Set(Array.from(peerModalOtherFieldsEl?.querySelectorAll(".other-row span") || []).map(s => s.textContent));
      for (const attr of Object.keys(peer)) {
        if (['name','ip','port','sharedKey','gain'].includes(attr)) continue;
        if (!otherLabels.has(attr)) delete peer[attr];
      }
      const oldKey = `${peer.ip}:${peer.port}`;
      peer.name = name;
      peer.ip = ip;
      peer.port = port;
      peer.sharedKey = sharedKey;
      peer.gain = gain;
      const updatedKey = `${peer.ip}:${peer.port}`;
      if (activePeers.has(oldKey)) {
        deactivatePeer(oldKey);
        activatePeer(peer);
      }
      if (selection !== updatedKey && !isNew) {
        refreshPeerSelects(updatedKey, updatedKey);
      }
    }

    const peerPayload = { udp1492_peers: allPeers };
    if (getOperatingMode() === OPERATING_MODES.DIRECT) {
      rememberDirectPeerSelection();
      peerPayload[APP_STATE_V2_STORAGE_KEY] = appState;
      peerPayload.udp1492_last_peers = dedupePeerKeys(appState?.direct?.activePeerKeys);
    }
    await storage.set(peerPayload);
    refreshPeerSelects(nextKey, nextKey);
    if (peerListEl) peerListEl.value = nextKey;
    closePeerModal();
  }
  function deletePeerFromModal() {
    const key = peerModalSelectEl?.value;
    if (!key || key === NEW_PEER_VALUE) {
      closePeerModal(true);
      return;
    }
    if (activePeers.has(key)) deactivatePeer(key);
    allPeers = allPeers.filter(p => `${p.ip}:${p.port}` !== key);
    if (getOperatingMode() === OPERATING_MODES.DIRECT) {
      rememberDirectPeerSelection();
      storage.set({
        udp1492_peers: allPeers,
        [APP_STATE_V2_STORAGE_KEY]: appState,
        udp1492_last_peers: dedupePeerKeys(appState?.direct?.activePeerKeys)
      });
    } else {
      storage.set({ udp1492_peers: allPeers });
    }
    refreshPeerSelects(NEW_PEER_VALUE, NEW_PEER_VALUE);
    closePeerModal(true);
  }
  function activatePeer(peer, options = {}) {
    if (!peer) return;
    const table = document.querySelector("#networkTable tbody");
    if (!table) return;
    const peerKey = `${peer.ip}:${peer.port}`;
    if (activePeers.has(peerKey)) return;
    const trackDirectState = options.trackDirectState ?? (getOperatingMode() === OPERATING_MODES.DIRECT);
    const { row, meterEl } = createPeerTableRow({
      document,
      peer,
      onDeactivate: deactivatePeer,
      onToggleMute: togglePeerMute
    });
    table.appendChild(row);
    if (meterEl) peerMeters.set(peerKey, meterEl);
    activePeers.set(peerKey, peer);
    if (trackDirectState) {
      rememberDirectPeerSelection();
    }
    if (options.persistState !== false) {
      saveActivePeers();
    } else {
      refreshPeerConnectionState();
      updateStatusDashboard();
    }
    if ((options.sendHostUpdate ?? dashboardState.nativeHostConnected)) {
      const payload = buildHostPeerDeltaPayload(peer);
      if (payload) hostSend(payload);
    }
    if (options.refreshSelects !== false) refreshPeerSelects(peerListEl?.value || NEW_PEER_VALUE, peerModalSelectEl?.value || NEW_PEER_VALUE);
  }
  function saveActivePeers(){
    rememberDirectPeerSelection();
    storage.set({
      udp1492_last_peers: dedupePeerKeys(appState?.direct?.activePeerKeys),
      [APP_STATE_V2_STORAGE_KEY]: appState
    });
    refreshPeerConnectionState();
    updateStatusDashboard();
  }
  function deactivatePeer(key, options = {}){
    const row = document.getElementById(getPeerRowId(key));
    if (row) row.remove();
    peerMeters.delete(key);
    peerPlaybackTimes.delete(key);
    peerMuteStates.delete(key);
    const gainNode = peerGains.get(key);
    if (gainNode) { try { gainNode.disconnect(); } catch {} }
    peerGains.delete(key);
    for (const [decKey, decoder] of decoders.entries()) {
      if (decKey.endsWith(`::${key}`)) {
        try { decoder.close(); } catch {}
        decoders.delete(decKey);
      }
    }
    if (options.sendHostUpdate ?? dashboardState.nativeHostConnected) {
      const peerCopy = structuredClone(allPeers.find(p => `${p.ip}:${p.port}` === key)) || { ip: key.split(':')[0], port: Number(key.split(':')[1]) };
      const payload = buildHostPeerDeltaPayload(peerCopy, { remove: true });
      if (payload) hostSend(payload);
    }
    activePeers.delete(key);
    peerRuntimeStats.remove(key);
    if (options.trackDirectState ?? (getOperatingMode() === OPERATING_MODES.DIRECT)) {
      rememberDirectPeerSelection();
    }
    if (options.persistState !== false) {
      saveActivePeers();
    } else {
      refreshPeerConnectionState();
      updateStatusDashboard();
    }
    refreshSelfStats();
    if (options.refreshSelects !== false) refreshPeerSelects(peerListEl?.value || NEW_PEER_VALUE, peerModalSelectEl?.value || NEW_PEER_VALUE);
  }
  function updateSelfStat(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value == null ? '--' : String(value);
  }
  function updatePeerRuntimeStats(peerKey, patch) {
    peerRuntimeStats.update(peerKey, patch);
    refreshSelfStats();
  }
  function refreshSelfStats() {
    const summary = peerRuntimeStats.summarize(Array.from(activePeers.keys()));
    updateSelfStat('selfRtt', summary.rtt);
    updateSelfStat('selfJitter', summary.jitter);
    updateSelfStat('selfOoo', summary.ooo);
    updateSelfStat('selfDups', summary.dups);
    updateSelfStat('selfLoss', summary.loss);
  }
  function recordRxFrame(meta) {
    if (!debugEnabled) return;
    const entry = { ...meta, receivedAt: performance.now() };
    audioDebug.rxFrames.push(entry);
    if (audioDebug.rxFrames.length > 50) audioDebug.rxFrames.shift();
  }
  function startDebugTimer() {
    if (debugTimer || !debugEnabled) return;
    debugTimer = setInterval(() => {
      console.info('Audio debug counters', { ...debugCounters });
    }, 2000);
  }
  function verifyLocally(chunk) {
    try {
      if (!debugDecoder) {
        debugDecoder = new AudioDecoder({
          output: (audioData) => audioData.close(),
          error: (e) => console.error('Debug decode error:', e)
        });
        const codecDef = getCodecConfig(activeCodecId);
        let debugConfig = buildDecoderConfig(codecDef, targetSampleRate);
        try {
          debugDecoder.configure(debugConfig);
        } catch (e) {
          console.warn(`Debug decoder configure failed for codec ${codecDef.id}, falling back to ${DEFAULT_CODEC}:`, e);
          const fallbackDef = getCodecConfig(DEFAULT_CODEC);
          debugConfig = buildDecoderConfig(fallbackDef, targetSampleRate);
          debugDecoder.configure(debugConfig);
        }
      }
      const encoded = new Uint8Array(chunk.byteLength);
      chunk.copyTo(encoded);
      debugDecoder.decode(new EncodedAudioChunk({
        type: chunk.type,
        timestamp: chunk.timestamp || 0,
        duration: chunk.duration,
        data: encoded
      }));
    } catch (e) {
      console.error('Local encode/decode check failed:', e);
    }
  }
  function log(line) {
    if (!debugEnabled) return;
    if (!debugLogEl) return;
    const atBottom = debugLogEl.scrollTop + debugLogEl.clientHeight >= debugLogEl.scrollHeight - 5;
    debugLogEl.textContent += `[${nowTS()}] ${line}\n`;
    if (atBottom) debugLogEl.scrollTop = debugLogEl.scrollHeight;
  }
  function setDebugEnabled(on) {
    debugEnabled = !!on;
    if (toggleLogBtn) toggleLogBtn.textContent = on ? 'Stop log' : 'Start log';
    if (debugLogEl) debugLogEl.setAttribute('aria-live', on ? 'polite' : 'off');
    storage.set({ ['udp1492_debug_enabled']: debugEnabled });
    if (debugEnabled && !debugTimer) {
      startDebugTimer();
      if (typeof window !== 'undefined') window.audioDebug = audioDebug;
    } else if (!debugEnabled && debugTimer) {
      clearInterval(debugTimer);
      debugTimer = null;
    }
    log(`debug ${on ? 'ENABLED' : 'DISABLED'}`);
  }
  function playSound(type) {
    if (testPlatform?.flags?.skipAudioCapture) return;
    let ctx = new AudioContext();
    let o = ctx.createOscillator();
    let g = ctx.createGain();

    if (type == "enter") {
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.15);
      
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    } else if (type == "exit"){
      o.type = 'sine';
      o.frequency.setValueAtTime(600, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.15);
  
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    }
    
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  }

  (async function init() {
    try {
      await loadRuntimeConfig();
      await loadSaved();
      updateUIbuttons(false);
      log('ui loaded');
    } catch (e) {
      console.error('init error', e);
    }
  })();
})();
