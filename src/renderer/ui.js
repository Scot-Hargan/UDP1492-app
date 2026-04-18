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
import {
  buildManagedLocalCandidates,
  buildManagedPresenceEndpoints,
  DEFAULT_MANAGED_STUN_SERVER_URLS
} from './managed-runtime.js';

// ui.js v0.4.22
(() => {
  'use strict';
  const VERSION = '0.4.22';
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
  const MANAGED_SLOT_ORDER = Object.freeze([GROUP_SLOT_IDS.A, GROUP_SLOT_IDS.B]);
  const DEFAULT_MANAGED_SLOT_ID = GROUP_SLOT_IDS.A;
  const AUDIO_ROUTE_IDS = Object.freeze({
    LEFT: 'left',
    RIGHT: 'right',
    CENTER: 'center'
  });
  const MIC_MODE_IDS = Object.freeze({
    SINGLE: 'single',
    COMMANDER: 'commander'
  });
  const COMMANDER_SCOPE_IDS = Object.freeze({
    ALL: 'all',
    A: GROUP_SLOT_IDS.A,
    B: GROUP_SLOT_IDS.B
  });
  const ADMIN_REFRESH_ACTIONS = Object.freeze({
    ALL: 'all',
    CHANNELS: 'channels',
    PEERS: 'peers'
  });
  const NAT_DISCOVERY_STATES = Object.freeze({
    IDLE: 'idle',
    GATHERING: 'gathering',
    READY: 'ready',
    FAILED: 'failed'
  });
  const NAT_PROBE_STATES = Object.freeze({
    IDLE: 'idle',
    GATHERING: 'gathering',
    READY: 'ready',
    PROBING: 'probing',
    SUCCEEDED: 'succeeded',
    TIMED_OUT: 'timed_out',
    FAILED: 'failed'
  });
  const NAT_CANDIDATE_KINDS = Object.freeze({
    LOCAL: 'local',
    PUBLIC: 'public',
    PEER: 'peer',
    UNKNOWN: 'unknown'
  });

  const openAdminWindowBtn = $('#openAdminWindowBtn');
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
  const managedActiveSlotLabelEl = $('#managedActiveSlotLabel');
  const managedSelectGroupABtn = $('#managedSelectGroupA');
  const managedSelectGroupBBtn = $('#managedSelectGroupB');
  const managedActiveChannelEl = $('#managedActiveChannel');
  const managedActiveSlotStatusEl = $('#managedActiveSlotStatus');
  const managedGroupATitleEl = $('#managedGroupATitle');
  const managedGroupAStatusEl = $('#managedGroupAStatus');
  const managedGroupAIntentEl = $('#managedGroupAIntent');
  const managedGroupAPeerSyncEl = $('#managedGroupAPeerSync');
  const managedGroupBTitleEl = $('#managedGroupBTitle');
  const managedGroupBStatusEl = $('#managedGroupBStatus');
  const managedGroupBIntentEl = $('#managedGroupBIntent');
  const managedGroupBPeerSyncEl = $('#managedGroupBPeerSync');
  const managedIntentStatusEl = $('#managedIntentStatus');
  const managedDisplayNameInputEl = $('#managedDisplayNameInput');
  const managedBackendBaseUrlInputEl = $('#managedBackendBaseUrlInput');
  const managedOpenSessionBtn = $('#managedOpenSessionBtn');
  const managedRefreshChannelsBtn = $('#managedRefreshChannelsBtn');
  const managedRefreshNatBtn = $('#managedRefreshNatBtn');
  const managedRefreshPeersBtn = $('#managedRefreshPeersBtn');
  const managedLeaveChannelBtn = $('#managedLeaveChannelBtn');
  const managedPeerSyncMetaEl = $('#managedPeerSyncMeta');
  const managedNatStatusEl = $('#managedNatStatus');
  const managedRoutingStatusEl = $('#managedRoutingStatus');
  const managedCommanderStatusEl = $('#managedCommanderStatus');
  const managedMicModeSingleBtn = $('#managedMicModeSingle');
  const managedMicModeCommanderBtn = $('#managedMicModeCommander');
  const managedMuteAllBtn = $('#managedMuteAllBtn');
  const managedMuteGroupABtn = $('#managedMuteGroupABtn');
  const managedMuteGroupBBtn = $('#managedMuteGroupBBtn');
  const managedPttAllBtn = $('#managedPttAllBtn');
  const managedPttGroupABtn = $('#managedPttGroupABtn');
  const managedPttGroupBBtn = $('#managedPttGroupBBtn');
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
  managedRefreshNatBtn?.addEventListener('click', () => refreshManagedNatDiscovery({
    probePeers: true,
    forcePeerProbes: true
  }).catch(err => console.error('managed refresh nat error', err)));
  managedRefreshPeersBtn?.addEventListener('click', () => handleManagedRefreshPeers().catch(err => console.error('managed refresh peers error', err)));
  managedLeaveChannelBtn?.addEventListener('click', () => handleManagedLeaveChannel().catch(err => console.error('managed leave error', err)));
  managedSelectGroupABtn?.addEventListener('click', () => setActiveManagedSlot(GROUP_SLOT_IDS.A).catch(err => console.error('managed slot A error', err)));
  managedSelectGroupBBtn?.addEventListener('click', () => setActiveManagedSlot(GROUP_SLOT_IDS.B).catch(err => console.error('managed slot B error', err)));
  managedDisplayNameInputEl?.addEventListener('input', () => syncManagedInputButtonState());
  managedBackendBaseUrlInputEl?.addEventListener('input', () => syncManagedInputButtonState());
  managedDisplayNameInputEl?.addEventListener('change', () => updateManagedProfileFromInputs().catch(err => console.error('managed display name error', err)));
  managedBackendBaseUrlInputEl?.addEventListener('change', () => updateManagedProfileFromInputs().catch(err => console.error('managed backend url error', err)));
  managedJoinPasscodeInputEl?.addEventListener('input', () => {
    setManagedJoinPasscode(getActiveManagedSlotId(), managedJoinPasscodeInputEl.value || '');
  });
  managedMicModeSingleBtn?.addEventListener('click', () => setCommanderMicMode(MIC_MODE_IDS.SINGLE).catch(err => console.error('commander single mode error', err)));
  managedMicModeCommanderBtn?.addEventListener('click', () => setCommanderMicMode(MIC_MODE_IDS.COMMANDER).catch(err => console.error('commander mode error', err)));
  managedMuteAllBtn?.addEventListener('click', () => toggleCommanderMute(COMMANDER_SCOPE_IDS.ALL).catch(err => console.error('commander mute all error', err)));
  managedMuteGroupABtn?.addEventListener('click', () => toggleCommanderMute(COMMANDER_SCOPE_IDS.A).catch(err => console.error('commander mute A error', err)));
  managedMuteGroupBBtn?.addEventListener('click', () => toggleCommanderMute(COMMANDER_SCOPE_IDS.B).catch(err => console.error('commander mute B error', err)));
  openAdminWindowBtn?.addEventListener('click', () => openAdminWindow().catch(err => console.error('open admin window error', err)));
  bindMomentaryPttButton(managedPttAllBtn, COMMANDER_SCOPE_IDS.ALL);
  bindMomentaryPttButton(managedPttGroupABtn, COMMANDER_SCOPE_IDS.A);
  bindMomentaryPttButton(managedPttGroupBBtn, COMMANDER_SCOPE_IDS.B);

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
  const updateStatusDashboard = () => {
    statusDashboard.render();
    queueAdminSnapshotPublish();
  };
  let debugEnabled = false;
  let inputGain = DEFAULT_SETTINGS.inputGain;
  let settings = { ...DEFAULT_SETTINGS };
  let themePreference = 'dark';
  let appState = createDefaultAppStateV2();
  let managedProfile = createDefaultManagedProfile();
  let managedCache = createDefaultManagedCache();
  let managedJoinPasscodes = createDefaultManagedJoinPasscodes();
  let managedResolvedPeers = createDefaultManagedResolvedPeers();
  let natRuntime = createDefaultNatRuntimeState();
  let adminSurfaceState = createDefaultAdminSurfaceState();
  let nativeHost = null;
  let connected = false;
  let encryptionKeyHex = null;
  let encoder;
  let debugDecoder;
  let decoders = new Map();       // `${codecId}::${peerKey}` -> AudioDecoder
  let peerPlaybackTimes = new Map(); // peerKey -> scheduled playback head
  let peerGains = new Map();      // peerKey -> GainNode
  let peerRoutingNodes = new Map(); // peerKey -> StereoPannerNode
  let peerMeters = new Map();     // peerKey -> <progress> element
  let peerMuteStates = new Map(); // peerKey -> boolean muted
  let commanderHoldState = createDefaultCommanderHoldState();
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
  let adminSnapshotPublishTimer = null;
  let natDiscoveryPromise = null;
  let natMockDiscoveryResult = null;
  let natMockProbeResults = {};
  const natProbeTimeouts = new Map();

  function sanitizeOperatingMode(mode) {
    return mode === OPERATING_MODES.MANAGED ? OPERATING_MODES.MANAGED : OPERATING_MODES.DIRECT;
  }
  function bindMomentaryPttButton(button, scopeId) {
    if (!button) return;
    const setActive = (active) => {
      setCommanderHoldScope(scopeId, active);
      renderManagedShell();
    };
    button.addEventListener('pointerdown', () => setActive(true));
    button.addEventListener('pointerup', () => setActive(false));
    button.addEventListener('pointerleave', () => setActive(false));
    button.addEventListener('pointercancel', () => setActive(false));
    button.addEventListener('blur', () => setActive(false));
    button.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setActive(true);
      }
    });
    button.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setActive(false);
      }
    });
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
  function createDefaultManagedJoinPasscodes(seed = {}) {
    return {
      A: typeof seed?.A === 'string' ? seed.A : '',
      B: typeof seed?.B === 'string' ? seed.B : ''
    };
  }
  function createDefaultManagedResolvedPeers(seed = {}) {
    return {
      A: Array.isArray(seed?.A) ? seed.A.filter((peer) => peer && typeof peer === 'object').map((peer) => ({ ...peer })) : [],
      B: Array.isArray(seed?.B) ? seed.B.filter((peer) => peer && typeof peer === 'object').map((peer) => ({ ...peer })) : []
    };
  }
  function createDefaultManagedSlotTransportPeers(seed = {}) {
    return {
      A: sanitizeTransportPeers(seed?.A),
      B: sanitizeTransportPeers(seed?.B)
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
  function sanitizeMicMode(value) {
    return value === MIC_MODE_IDS.COMMANDER ? MIC_MODE_IDS.COMMANDER : MIC_MODE_IDS.SINGLE;
  }
  function createDefaultCommanderMuteState(seed = {}) {
    return {
      allMuted: !!seed?.allMuted,
      slotA: !!seed?.slotA,
      slotB: !!seed?.slotB
    };
  }
  function createDefaultCommanderPttBindings(seed = {}) {
    return {
      all: typeof seed?.all === 'string' ? seed.all : null,
      slotA: typeof seed?.slotA === 'string' ? seed.slotA : null,
      slotB: typeof seed?.slotB === 'string' ? seed.slotB : null
    };
  }
  function createDefaultCommanderPreferences(seed = {}) {
    return {
      micMode: sanitizeMicMode(seed?.micMode),
      muteState: createDefaultCommanderMuteState(seed?.muteState),
      pttBindings: createDefaultCommanderPttBindings(seed?.pttBindings)
    };
  }
  function createDefaultCommanderHoldState(seed = {}) {
    return {
      all: !!seed?.all,
      A: !!seed?.A,
      B: !!seed?.B
    };
  }
  function createDefaultAdminSurfaceState(seed = {}) {
    return {
      loadingAction: typeof seed?.loadingAction === 'string' ? seed.loadingAction : 'idle',
      lastAction: typeof seed?.lastAction === 'string' ? seed.lastAction : '',
      errorMessage: typeof seed?.errorMessage === 'string' ? seed.errorMessage : '',
      lastRequestedAt: typeof seed?.lastRequestedAt === 'string' ? seed.lastRequestedAt : '',
      lastCompletedAt: typeof seed?.lastCompletedAt === 'string' ? seed.lastCompletedAt : ''
    };
  }
  function sanitizeNatCandidateKind(value) {
    if (value === NAT_CANDIDATE_KINDS.PUBLIC) return NAT_CANDIDATE_KINDS.PUBLIC;
    if (value === NAT_CANDIDATE_KINDS.PEER) return NAT_CANDIDATE_KINDS.PEER;
    if (value === NAT_CANDIDATE_KINDS.UNKNOWN) return NAT_CANDIDATE_KINDS.UNKNOWN;
    return NAT_CANDIDATE_KINDS.LOCAL;
  }
  function sanitizeNatCandidate(candidate = {}, fallbackKind = NAT_CANDIDATE_KINDS.UNKNOWN) {
    const ip = String(candidate?.ip || '').trim();
    const port = Number(candidate?.port);
    if (!ip || !Number.isFinite(port) || port <= 0) return null;
    return {
      kind: sanitizeNatCandidateKind(candidate?.kind || fallbackKind),
      ip,
      port,
      protocol: String(candidate?.protocol || 'udp').trim().toLowerCase() || 'udp',
      source: String(candidate?.source || '').trim() || 'unknown',
      discoveredAt: typeof candidate?.discoveredAt === 'string' ? candidate.discoveredAt : new Date().toISOString()
    };
  }
  function dedupeNatCandidates(candidates = []) {
    const normalized = [];
    const seen = new Set();
    for (const entry of Array.isArray(candidates) ? candidates : []) {
      const candidate = sanitizeNatCandidate(entry, entry?.kind || NAT_CANDIDATE_KINDS.UNKNOWN);
      if (!candidate) continue;
      const key = `${candidate.kind}:${candidate.protocol}:${candidate.ip}:${candidate.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(candidate);
    }
    return normalized;
  }
  function createDefaultNatProbeState(seed = {}) {
    return {
      status: Object.values(NAT_PROBE_STATES).includes(seed?.status) ? seed.status : NAT_PROBE_STATES.IDLE,
      slotId: sanitizeManagedSlotId(seed?.slotId),
      peerKey: typeof seed?.peerKey === 'string' ? seed.peerKey : '',
      displayName: typeof seed?.displayName === 'string' ? seed.displayName : '',
      endpointKind: sanitizeNatCandidateKind(seed?.endpointKind || NAT_CANDIDATE_KINDS.UNKNOWN),
      authority: seed?.authority === 'transport' ? 'transport' : 'advisory',
      ip: typeof seed?.ip === 'string' ? seed.ip : '',
      port: Number.isFinite(Number(seed?.port)) ? Number(seed.port) : 0,
      lastRttMs: Number.isFinite(Number(seed?.lastRttMs)) ? Number(seed.lastRttMs) : null,
      lastStartedAt: typeof seed?.lastStartedAt === 'string' ? seed.lastStartedAt : '',
      lastCompletedAt: typeof seed?.lastCompletedAt === 'string' ? seed.lastCompletedAt : '',
      lastSuccessAt: typeof seed?.lastSuccessAt === 'string' ? seed.lastSuccessAt : '',
      lastFailureAt: typeof seed?.lastFailureAt === 'string' ? seed.lastFailureAt : '',
      lastError: typeof seed?.lastError === 'string' ? seed.lastError : ''
    };
  }
  function createDefaultNatSlotState(seed = {}) {
    return {
      localCandidates: dedupeNatCandidates(seed?.localCandidates),
      publicCandidates: dedupeNatCandidates(seed?.publicCandidates),
      lastGatheredAt: typeof seed?.lastGatheredAt === 'string' ? seed.lastGatheredAt : '',
      summaryStatus: typeof seed?.summaryStatus === 'string' ? seed.summaryStatus : NAT_DISCOVERY_STATES.IDLE
    };
  }
  function createDefaultNatRuntimeState(seed = {}) {
    const probes = {};
    if (seed?.probes && typeof seed.probes === 'object') {
      for (const [key, value] of Object.entries(seed.probes)) {
        probes[key] = createDefaultNatProbeState(value);
      }
    }
    return {
      status: Object.values(NAT_DISCOVERY_STATES).includes(seed?.status) ? seed.status : NAT_DISCOVERY_STATES.IDLE,
      gatherer: {
        status: Object.values(NAT_DISCOVERY_STATES).includes(seed?.gatherer?.status) ? seed.gatherer.status : NAT_DISCOVERY_STATES.IDLE,
        source: typeof seed?.gatherer?.source === 'string' ? seed.gatherer.source : 'none',
        lastStartedAt: typeof seed?.gatherer?.lastStartedAt === 'string' ? seed.gatherer.lastStartedAt : '',
        lastCompletedAt: typeof seed?.gatherer?.lastCompletedAt === 'string' ? seed.gatherer.lastCompletedAt : '',
        lastError: typeof seed?.gatherer?.lastError === 'string' ? seed.gatherer.lastError : ''
      },
      slots: {
        A: createDefaultNatSlotState(seed?.slots?.A),
        B: createDefaultNatSlotState(seed?.slots?.B)
      },
      probes
    };
  }
  function buildNatProbeKey(slotId, peerKey) {
    return `${sanitizeManagedSlotId(slotId)}:${String(peerKey || '').trim()}`;
  }
  function setNatProbeState(probeKey, patch = {}) {
    const currentProbe = createDefaultNatProbeState(natRuntime.probes?.[probeKey]);
    natRuntime.probes[probeKey] = createDefaultNatProbeState({
      ...currentProbe,
      ...patch
    });
    return natRuntime.probes[probeKey];
  }
  function removeNatProbeState(probeKey) {
    if (!probeKey || !natRuntime.probes?.[probeKey]) return;
    const timeoutId = natProbeTimeouts.get(probeKey);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      natProbeTimeouts.delete(probeKey);
    }
    delete natRuntime.probes[probeKey];
  }
  function getNatProbeState(probeKey) {
    return createDefaultNatProbeState(natRuntime.probes?.[probeKey]);
  }
  function getNatProbeStatesForSlot(slotId = getActiveManagedSlotId()) {
    const targetSlotId = sanitizeManagedSlotId(slotId);
    return Object.entries(natRuntime.probes || {})
      .filter(([, probe]) => sanitizeManagedSlotId(probe?.slotId) === targetSlotId)
      .map(([probeKey, probe]) => ({
        probeKey,
        ...createDefaultNatProbeState(probe)
      }))
      .sort((left, right) => `${left.slotId}:${left.displayName || left.peerKey}:${left.peerKey}`.localeCompare(`${right.slotId}:${right.displayName || right.peerKey}:${right.peerKey}`));
  }
  function getNatProbeSummary(slotId = getActiveManagedSlotId()) {
    const summary = {
      total: 0,
      ready: 0,
      probing: 0,
      succeeded: 0,
      transportSucceeded: 0,
      advisorySucceeded: 0,
      timedOut: 0,
      failed: 0
    };
    for (const probe of getNatProbeStatesForSlot(slotId)) {
      summary.total += 1;
      if (probe.status === NAT_PROBE_STATES.READY) summary.ready += 1;
      if (probe.status === NAT_PROBE_STATES.PROBING) summary.probing += 1;
      if (probe.status === NAT_PROBE_STATES.SUCCEEDED) {
        summary.succeeded += 1;
        if (probe.authority === 'transport') {
          summary.transportSucceeded += 1;
        } else {
          summary.advisorySucceeded += 1;
        }
      }
      if (probe.status === NAT_PROBE_STATES.TIMED_OUT) summary.timedOut += 1;
      if (probe.status === NAT_PROBE_STATES.FAILED) summary.failed += 1;
    }
    return summary;
  }
  function getManagedNatProbeTargets(slotId = getActiveManagedSlotId()) {
    const targetSlotId = sanitizeManagedSlotId(slotId);
    return getManagedSlotResolvedPeers(targetSlotId)
      .map((peer) => {
        const endpoint = pickManagedEndpoint(peer);
        if (!endpoint?.ip || !Number.isFinite(Number(endpoint?.port))) return null;
        const peerKey = `${endpoint.ip}:${Number(endpoint.port)}`;
        return {
          slotId: targetSlotId,
          peerKey,
          displayName: peer?.displayName || peer?.userId || peer?.sessionId || peerKey,
          endpointKind: sanitizeNatCandidateKind(endpoint?.kind || NAT_CANDIDATE_KINDS.UNKNOWN),
          ip: endpoint.ip,
          port: Number(endpoint.port)
        };
      })
      .filter(Boolean);
  }
  function reconcileManagedNatProbeTargets(slotId = getActiveManagedSlotId()) {
    const targetSlotId = sanitizeManagedSlotId(slotId);
    const targets = getManagedNatProbeTargets(targetSlotId);
    const targetKeys = new Set(targets.map((target) => buildNatProbeKey(target.slotId, target.peerKey)));
    for (const probe of getNatProbeStatesForSlot(targetSlotId)) {
      if (!targetKeys.has(probe.probeKey)) removeNatProbeState(probe.probeKey);
    }
    const hasProbeablePublicCandidates = getNatPublicCandidates(targetSlotId).length > 0;
    for (const target of targets) {
      const probeKey = buildNatProbeKey(target.slotId, target.peerKey);
      const currentProbe = getNatProbeState(probeKey);
      const nextStatus = hasProbeablePublicCandidates && target.endpointKind === NAT_CANDIDATE_KINDS.PUBLIC
        ? (currentProbe.status === NAT_PROBE_STATES.SUCCEEDED
            || currentProbe.status === NAT_PROBE_STATES.TIMED_OUT
            || currentProbe.status === NAT_PROBE_STATES.FAILED
            || currentProbe.status === NAT_PROBE_STATES.PROBING
              ? currentProbe.status
              : NAT_PROBE_STATES.READY)
        : NAT_PROBE_STATES.IDLE;
      setNatProbeState(probeKey, {
        ...target,
        status: nextStatus,
        lastError: nextStatus === NAT_PROBE_STATES.IDLE ? '' : currentProbe.lastError
      });
    }
    queueAdminSnapshotPublish();
    return getNatProbeStatesForSlot(targetSlotId);
  }
  function getNatProbeStatusText(slotId = getActiveManagedSlotId()) {
    const summary = getNatProbeSummary(slotId);
    if (!summary.total) return '';
    if (summary.probing) return ` | ${summary.probing} peer probe(s) in progress`;
    if (summary.timedOut) return ` | ${summary.timedOut} peer probe(s) timed out`;
    if (summary.failed) return ` | ${summary.failed} peer probe(s) failed`;
    if (summary.transportSucceeded) return ` | ${summary.transportSucceeded} transport-authoritative probe(s) succeeded`;
    if (summary.advisorySucceeded) return ` | ${summary.advisorySucceeded} advisory probe(s) succeeded`;
    if (summary.ready) return ` | ${summary.ready} peer probe(s) ready`;
    return '';
  }
  function getMockNatProbeResult(probeKey) {
    if (!natMockProbeResults || typeof natMockProbeResults !== 'object') return null;
    return natMockProbeResults[probeKey] || natMockProbeResults.default || null;
  }
  function clearNatProbeTimeout(probeKey) {
    const timeoutId = natProbeTimeouts.get(probeKey);
    if (!timeoutId) return;
    window.clearTimeout(timeoutId);
    natProbeTimeouts.delete(probeKey);
  }
  function completeNatProbeSuccess(probeKey, patch = {}) {
    const currentProbe = getNatProbeState(probeKey);
    if (!currentProbe.peerKey) return currentProbe;
    clearNatProbeTimeout(probeKey);
    const completedAt = new Date().toISOString();
    const nextProbe = setNatProbeState(probeKey, {
      status: NAT_PROBE_STATES.SUCCEEDED,
      authority: patch.authority === 'transport' ? 'transport' : currentProbe.authority,
      lastCompletedAt: completedAt,
      lastSuccessAt: completedAt,
      lastError: '',
      ...patch
    });
    renderManagedShell();
    queueAdminSnapshotPublish();
    return nextProbe;
  }
  function completeNatProbeTimeout(probeKey, message = 'Transport-authoritative NAT probe timed out.') {
    const currentProbe = getNatProbeState(probeKey);
    if (currentProbe.status !== NAT_PROBE_STATES.PROBING) return currentProbe;
    clearNatProbeTimeout(probeKey);
    const completedAt = new Date().toISOString();
    const nextProbe = setNatProbeState(probeKey, {
      status: NAT_PROBE_STATES.TIMED_OUT,
      authority: 'transport',
      lastCompletedAt: completedAt,
      lastFailureAt: completedAt,
      lastError: message
    });
    renderManagedShell();
    queueAdminSnapshotPublish();
    return nextProbe;
  }
  function scheduleNatProbeTimeout(probeKey, timeoutMs = 5000) {
    clearNatProbeTimeout(probeKey);
    natProbeTimeouts.set(probeKey, window.setTimeout(() => {
      natProbeTimeouts.delete(probeKey);
      completeNatProbeTimeout(probeKey);
    }, Math.max(1000, Number(timeoutMs) || 5000)));
  }
  function handleTransportNatProbeEvidence(peerKey, patch = {}) {
    for (const probe of Object.entries(natRuntime.probes || {}).map(([probeKey, value]) => ({
      probeKey,
      ...createDefaultNatProbeState(value)
    })).filter((probe) => probe.peerKey === peerKey)) {
      completeNatProbeSuccess(probe.probeKey, {
        authority: 'transport',
        ...patch
      });
    }
  }
  async function runManagedNatPeerProbes(options = {}) {
    const slotIds = Array.isArray(options.slotIds) && options.slotIds.length
      ? options.slotIds.map((slotId) => sanitizeManagedSlotId(slotId))
      : [getActiveManagedSlotId()];
    const completedStates = [];
    for (const slotId of slotIds) {
      reconcileManagedNatProbeTargets(slotId);
      const readyProbes = getNatProbeStatesForSlot(slotId)
        .filter((probe) => probe.status === NAT_PROBE_STATES.READY || (options.force && probe.status !== NAT_PROBE_STATES.PROBING && probe.status !== NAT_PROBE_STATES.IDLE));
      for (const probe of readyProbes) {
        const probeKey = probe.probeKey;
        const startedAt = new Date().toISOString();
        setNatProbeState(probeKey, {
          status: NAT_PROBE_STATES.PROBING,
          lastStartedAt: startedAt,
          lastError: ''
        });
        renderManagedShell();
        queueAdminSnapshotPublish();
        const mockResult = getMockNatProbeResult(probeKey);
        if (!testPlatform || !mockResult) {
          scheduleNatProbeTimeout(probeKey, options.timeoutMs || 5000);
          completedStates.push(getNatProbeState(probeKey));
          renderManagedShell();
          queueAdminSnapshotPublish();
          continue;
        }
        const delayMs = Math.max(0, Number(mockResult.delayMs) || 0);
        if (delayMs) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        const completedAt = new Date().toISOString();
        const outcome = String(mockResult.outcome || '').trim().toLowerCase();
        if (outcome === NAT_PROBE_STATES.SUCCEEDED) {
          clearNatProbeTimeout(probeKey);
          setNatProbeState(probeKey, {
            status: NAT_PROBE_STATES.SUCCEEDED,
            lastCompletedAt: completedAt,
            lastSuccessAt: completedAt,
            lastError: ''
          });
        } else if (outcome === NAT_PROBE_STATES.FAILED) {
          clearNatProbeTimeout(probeKey);
          setNatProbeState(probeKey, {
            status: NAT_PROBE_STATES.FAILED,
            lastCompletedAt: completedAt,
            lastFailureAt: completedAt,
            lastError: String(mockResult.errorMessage || 'NAT probe failed.')
          });
        } else if (outcome === NAT_PROBE_STATES.TIMED_OUT) {
          clearNatProbeTimeout(probeKey);
          setNatProbeState(probeKey, {
            status: NAT_PROBE_STATES.TIMED_OUT,
            lastCompletedAt: completedAt,
            lastFailureAt: completedAt,
            lastError: String(mockResult.errorMessage || 'NAT probe timed out.')
          });
        } else {
          setNatProbeState(probeKey, {
            status: NAT_PROBE_STATES.READY,
            lastCompletedAt: completedAt,
            lastError: ''
          });
        }
        completedStates.push(getNatProbeState(probeKey));
        renderManagedShell();
        queueAdminSnapshotPublish();
      }
    }
    return completedStates;
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
      preferences: createDefaultCommanderPreferences(seed.preferences),
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
        slotTransportPeers: createDefaultManagedSlotTransportPeers(managed.slotTransportPeers)
      }
    };
  }
  function buildPersistedAppStateV2(source = appState) {
    return {
      version: 2,
      operatingMode: sanitizeOperatingMode(source?.operatingMode),
      preferences: createDefaultCommanderPreferences(source?.preferences),
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
  function getCommanderPreferences() {
    if (!appState?.preferences || typeof appState.preferences !== 'object') {
      appState.preferences = createDefaultCommanderPreferences();
    }
    return appState.preferences;
  }
  function getCommanderMicMode() {
    return sanitizeMicMode(getCommanderPreferences().micMode);
  }
  function getCommanderMuteState() {
    return createDefaultCommanderMuteState(getCommanderPreferences().muteState);
  }
  function setCommanderMuteState(nextState = {}) {
    getCommanderPreferences().muteState = createDefaultCommanderMuteState(nextState);
    return getCommanderPreferences().muteState;
  }
  function isCommanderScopeMuted(scopeId) {
    const muteState = getCommanderMuteState();
    if (scopeId === COMMANDER_SCOPE_IDS.ALL) return muteState.allMuted;
    if (scopeId === COMMANDER_SCOPE_IDS.A) return muteState.slotA;
    if (scopeId === COMMANDER_SCOPE_IDS.B) return muteState.slotB;
    return false;
  }
  function setCommanderHoldScope(scopeId, active) {
    if (scopeId === COMMANDER_SCOPE_IDS.ALL) commanderHoldState.all = !!active;
    if (scopeId === COMMANDER_SCOPE_IDS.A) commanderHoldState.A = !!active;
    if (scopeId === COMMANDER_SCOPE_IDS.B) commanderHoldState.B = !!active;
    return commanderHoldState;
  }
  function clearCommanderHoldState() {
    commanderHoldState = createDefaultCommanderHoldState();
    return commanderHoldState;
  }
  function getManagedSlotIds() {
    return [...MANAGED_SLOT_ORDER];
  }
  function getManagedSlot(slotId = DEFAULT_MANAGED_SLOT_ID) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    return appState?.managed?.slots?.[managedSlotId] || createDefaultAppStateV2().managed.slots[managedSlotId];
  }
  function getActiveManagedSlotId() {
    return sanitizeManagedSlotId(appState?.managed?.shell?.activeSlotId);
  }
  function getInactiveManagedSlotId() {
    return getActiveManagedSlotId() === GROUP_SLOT_IDS.A ? GROUP_SLOT_IDS.B : GROUP_SLOT_IDS.A;
  }
  function getManagedSlotTransportPeers(slotId = DEFAULT_MANAGED_SLOT_ID) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    return sanitizeTransportPeers(appState?.managed?.slotTransportPeers?.[managedSlotId]);
  }
  function setManagedSlotTransportPeers(slotId, peers) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    if (!appState?.managed?.slotTransportPeers || typeof appState.managed.slotTransportPeers !== 'object') {
      appState.managed.slotTransportPeers = createDefaultManagedSlotTransportPeers();
    }
    appState.managed.slotTransportPeers[managedSlotId] = sanitizeTransportPeers(peers);
    return appState.managed.slotTransportPeers[managedSlotId];
  }
  function clearManagedSlotTransportPeers(slotId) {
    return setManagedSlotTransportPeers(slotId, []);
  }
  function clearAllManagedSlotTransportPeers() {
    for (const slotId of getManagedSlotIds()) clearManagedSlotTransportPeers(slotId);
  }
  function getManagedSlotResolvedPeers(slotId = DEFAULT_MANAGED_SLOT_ID) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    return createDefaultManagedResolvedPeers(managedResolvedPeers)[managedSlotId];
  }
  function setManagedSlotResolvedPeers(slotId, peers) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    managedResolvedPeers[managedSlotId] = Array.isArray(peers)
      ? peers.filter((peer) => peer && typeof peer === 'object').map((peer) => ({ ...peer }))
      : [];
    return getManagedSlotResolvedPeers(managedSlotId);
  }
  function clearManagedSlotResolvedPeers(slotId) {
    return setManagedSlotResolvedPeers(slotId, []);
  }
  function clearAllManagedSlotResolvedPeers() {
    for (const slotId of getManagedSlotIds()) clearManagedSlotResolvedPeers(slotId);
  }
  function getNatSlotState(slotId = DEFAULT_MANAGED_SLOT_ID) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    return natRuntime?.slots?.[managedSlotId] || createDefaultNatRuntimeState().slots[managedSlotId];
  }
  function setNatSlotCandidates(slotId, patch = {}) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    natRuntime.slots[managedSlotId] = createDefaultNatSlotState({
      ...getNatSlotState(managedSlotId),
      ...patch,
      localCandidates: patch.localCandidates ?? getNatSlotState(managedSlotId).localCandidates,
      publicCandidates: patch.publicCandidates ?? getNatSlotState(managedSlotId).publicCandidates
    });
    return getNatSlotState(managedSlotId);
  }
  function setNatCandidatesForAllSlots(patch = {}) {
    for (const slotId of getManagedSlotIds()) setNatSlotCandidates(slotId, patch);
  }
  function getNatPublicCandidates(slotId = getActiveManagedSlotId()) {
    return dedupeNatCandidates(getNatSlotState(slotId).publicCandidates);
  }
  function getNatLocalCandidates(slotId = getActiveManagedSlotId()) {
    return dedupeNatCandidates(getNatSlotState(slotId).localCandidates);
  }
  function getManagedPresenceEndpoints() {
    return buildManagedPresenceEndpoints({
      localPort: settings.localPort,
      runtimeConfig: getManagedRuntimeConfig(),
      additionalEndpoints: getNatPublicCandidates(getActiveManagedSlotId()).map((candidate) => ({
        kind: candidate.kind,
        ip: candidate.ip,
        port: candidate.port
      }))
    });
  }
  function getManagedJoinPasscode(slotId = getActiveManagedSlotId()) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    return managedJoinPasscodes?.[managedSlotId] || '';
  }
  function setManagedJoinPasscode(slotId, value = '') {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    managedJoinPasscodes[managedSlotId] = typeof value === 'string' ? value : String(value || '');
    if (managedJoinPasscodeInputEl && managedSlotId === getActiveManagedSlotId()) {
      managedJoinPasscodeInputEl.value = managedJoinPasscodes[managedSlotId];
    }
    return managedJoinPasscodes[managedSlotId];
  }
  function clearManagedJoinPasscodes(slotId) {
    if (slotId) {
      setManagedJoinPasscode(slotId, '');
      return;
    }
    for (const managedSlotId of getManagedSlotIds()) setManagedJoinPasscode(managedSlotId, '');
  }
  function getManagedSlotIntent(slotId = DEFAULT_MANAGED_SLOT_ID) {
    return getManagedSlot(slotId).intendedChannelId || null;
  }
  function setManagedSlotIntent(slotId, channelId) {
    const targetSlot = getManagedSlot(slotId);
    targetSlot.intendedChannelId = normalizeManagedChannelId(channelId);
    return targetSlot.intendedChannelId;
  }
  async function setActiveManagedSlot(slotId, options = {}) {
    appState.managed.shell.activeSlotId = sanitizeManagedSlotId(slotId);
    renderManagedShell();
    if (options.persist !== false) {
      await persistAppState({
        includeLegacyLastPeers: true,
        includeManagedProfile: true,
        includeManagedCache: true
      });
    }
  }
  function syncManagedSlotRuntimeState(slotId = DEFAULT_MANAGED_SLOT_ID) {
    const targetSlot = getManagedSlot(slotId);
    const activeChannel = targetSlot.channelId ? findManagedChannel(targetSlot.channelId) : null;
    const intendedChannel = targetSlot.intendedChannelId ? findManagedChannel(targetSlot.intendedChannelId) : null;
    if (activeChannel) {
      targetSlot.channelName = activeChannel.name || targetSlot.channelName || '';
      targetSlot.securityMode = activeChannel.securityMode || '';
      return targetSlot;
    }
    if (intendedChannel) {
      targetSlot.securityMode = intendedChannel.securityMode || '';
      return targetSlot;
    }
    if (!targetSlot.channelId) {
      targetSlot.channelName = '';
      targetSlot.securityMode = '';
    }
    return targetSlot;
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
    const selectedChannelId = getManagedSlotIntent(getActiveManagedSlotId()) || '';
    return findManagedChannel(selectedChannelId);
  }
  function channelRequiresPasscode(channel) {
    return !!channel?.requiresPasscode || channel?.securityMode === 'passcode';
  }
  function getManagedChannelSecurityMode(channel) {
    return channelRequiresPasscode(channel) ? 'passcode' : 'open';
  }
  function getManagedChannelSecurityLabel(channel) {
    return channelRequiresPasscode(channel) ? 'Protected' : 'Open';
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
    const mergedPeers = [];
    const seenKeys = new Set();
    for (const slotId of getManagedSlotIds()) {
      for (const peer of getManagedSlotTransportPeers(slotId)) {
        const key = getPeerKey(peer);
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        mergedPeers.push(peer);
      }
    }
    return mergedPeers;
  }
  function findManagedTransportPeer(key) {
    for (const slotId of getManagedSlotIds()) {
      const peer = getManagedSlotTransportPeers(slotId).find((entry) => getPeerKey(entry) === key);
      if (peer) return peer;
    }
    return null;
  }
  function getManagedPeerOwningSlots(key) {
    if (!key) return [];
    return getManagedSlotIds().filter((slotId) => getManagedSlotTransportPeers(slotId).some((peer) => getPeerKey(peer) === key));
  }
  function getManagedPeerAudioRoute(key) {
    const owningSlots = getManagedPeerOwningSlots(key);
    if (owningSlots.includes(GROUP_SLOT_IDS.A) && owningSlots.includes(GROUP_SLOT_IDS.B)) return AUDIO_ROUTE_IDS.CENTER;
    if (owningSlots.includes(GROUP_SLOT_IDS.A)) return AUDIO_ROUTE_IDS.LEFT;
    if (owningSlots.includes(GROUP_SLOT_IDS.B)) return AUDIO_ROUTE_IDS.RIGHT;
    return AUDIO_ROUTE_IDS.CENTER;
  }
  function getPeerAudioRoute(key, mode = getOperatingMode()) {
    return sanitizeOperatingMode(mode) === OPERATING_MODES.MANAGED ? getManagedPeerAudioRoute(key) : AUDIO_ROUTE_IDS.CENTER;
  }
  function getAudioRoutePanValue(route) {
    if (route === AUDIO_ROUTE_IDS.LEFT) return -1;
    if (route === AUDIO_ROUTE_IDS.RIGHT) return 1;
    return 0;
  }
  function getAudioRouteLabel(route) {
    if (route === AUDIO_ROUTE_IDS.LEFT) return 'Left ear';
    if (route === AUDIO_ROUTE_IDS.RIGHT) return 'Right ear';
    return 'Both ears';
  }
  function getManagedSlotRoutingLabel(slotId) {
    return sanitizeManagedSlotId(slotId) === GROUP_SLOT_IDS.B ? 'Right ear when active' : 'Left ear when active';
  }
  function getManagedRoutingSummary() {
    return 'Managed routing: Group A left | Group B right | shared peers centered.';
  }
  function getAudioRoutingSnapshot(mode = getOperatingMode()) {
    const targetMode = sanitizeOperatingMode(mode);
    return Array.from(activePeers.entries())
      .map(([peerKey, peer]) => {
        const owningSlots = targetMode === OPERATING_MODES.MANAGED ? getManagedPeerOwningSlots(peerKey) : [];
        const route = getPeerAudioRoute(peerKey, targetMode);
        return {
          peerKey,
          name: peer?.name || peerKey,
          mode: targetMode,
          owningSlots,
          route,
          routeLabel: getAudioRouteLabel(route),
          pan: getAudioRoutePanValue(route)
        };
      })
      .sort((left, right) => left.peerKey.localeCompare(right.peerKey));
  }
  function getCommanderScopeLabel(scopeId) {
    if (scopeId === COMMANDER_SCOPE_IDS.ALL) return 'All';
    if (scopeId === COMMANDER_SCOPE_IDS.A) return 'Group A';
    if (scopeId === COMMANDER_SCOPE_IDS.B) return 'Group B';
    return 'Unknown';
  }
  function getCommanderScopeTargetKeys(scopeId, mode = getOperatingMode()) {
    const targetMode = sanitizeOperatingMode(mode);
    if (scopeId === COMMANDER_SCOPE_IDS.ALL) {
      return dedupePeerKeys(getTransportPeersForMode(targetMode).map((peer) => getPeerKey(peer)).filter(Boolean));
    }
    if (targetMode !== OPERATING_MODES.MANAGED) return [];
    const slotId = sanitizeManagedSlotId(scopeId);
    return dedupePeerKeys(getManagedSlotTransportPeers(slotId).map((peer) => getPeerKey(peer)).filter(Boolean));
  }
  function getCommanderActiveTargetKeys(mode = getOperatingMode()) {
    const targetMode = sanitizeOperatingMode(mode);
    if (targetMode !== OPERATING_MODES.MANAGED) return [];
    if (isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL)) return [];
    if (getCommanderMicMode() === MIC_MODE_IDS.SINGLE) {
      return getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.ALL, targetMode);
    }
    const keys = [];
    if (commanderHoldState.all) keys.push(...getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.ALL, targetMode));
    if (commanderHoldState.A && !isCommanderScopeMuted(COMMANDER_SCOPE_IDS.A)) keys.push(...getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.A, targetMode));
    if (commanderHoldState.B && !isCommanderScopeMuted(COMMANDER_SCOPE_IDS.B)) keys.push(...getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.B, targetMode));
    return dedupePeerKeys(keys);
  }
  function getCommanderSnapshot(mode = getOperatingMode()) {
    const targetMode = sanitizeOperatingMode(mode);
    const muteState = getCommanderMuteState();
    return {
      mode: targetMode,
      micMode: getCommanderMicMode(),
      muteState: {
        allMuted: !!muteState.allMuted,
        slotA: !!muteState.slotA,
        slotB: !!muteState.slotB
      },
      holdState: {
        all: !!commanderHoldState.all,
        slotA: !!commanderHoldState.A,
        slotB: !!commanderHoldState.B
      },
      targets: {
        all: getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.ALL, targetMode),
        slotA: getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.A, targetMode),
        slotB: getCommanderScopeTargetKeys(COMMANDER_SCOPE_IDS.B, targetMode),
        active: getCommanderActiveTargetKeys(targetMode)
      }
    };
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
  async function setCommanderMicMode(nextMode, options = {}) {
    getCommanderPreferences().micMode = sanitizeMicMode(nextMode);
    clearCommanderHoldState();
    renderManagedShell();
    if (options.persist !== false) {
      await persistAppState({ includeLegacyLastPeers: true });
    }
  }
  async function toggleCommanderMute(scopeId, options = {}) {
    const muteState = getCommanderMuteState();
    if (scopeId === COMMANDER_SCOPE_IDS.ALL) {
      muteState.allMuted = !muteState.allMuted;
    } else if (scopeId === COMMANDER_SCOPE_IDS.A) {
      muteState.slotA = !muteState.slotA;
    } else if (scopeId === COMMANDER_SCOPE_IDS.B) {
      muteState.slotB = !muteState.slotB;
    }
    setCommanderMuteState(muteState);
    renderManagedShell();
    if (options.persist !== false) {
      await persistAppState({ includeLegacyLastPeers: true });
    }
  }
  const managedController = createManagedController({
    platform,
    fetchImpl: window.fetch.bind(window),
    version: VERSION,
    operatingModes: OPERATING_MODES,
    getManagedSlotIds,
    getActiveManagedSlotId,
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
    getManagedJoinPasscode,
    setManagedJoinPasscode,
    clearManagedJoinPasscodes,
    getManagedSlotTransportPeers,
    setManagedSlotTransportPeers,
    clearManagedSlotTransportPeers,
    clearAllManagedSlotTransportPeers,
    getManagedSlotResolvedPeers,
    setManagedSlotResolvedPeers,
    clearManagedSlotResolvedPeers,
    clearAllManagedSlotResolvedPeers,
    setManagedError,
    clearManagedError,
    renderManagedShell,
    onManagedPeersRefreshed: handleManagedPeersRefreshed,
    persistAppState,
    syncTransportPeerRows,
    getManagedPresenceEndpoints,
    ensureManagedNatDiscovery,
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
  async function sendManagedPresence(slotId) {
    return managedController.sendManagedPresence(slotId);
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
    const result = await managedController.handleManagedSessionOpen();
    if (getOperatingMode() === OPERATING_MODES.MANAGED) {
      await refreshManagedNatDiscovery({ silent: true });
    }
    return result;
  }
  async function handleManagedRefreshChannels() {
    const result = await managedController.handleManagedRefreshChannels();
    if (getOperatingMode() === OPERATING_MODES.MANAGED) {
      await refreshManagedNatDiscovery({ silent: true });
    }
    return result;
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
  function getManagedSlotLabel(slotId) {
    return `Group ${sanitizeManagedSlotId(slotId)}`;
  }
  function buildManagedSlotViewModel(slotId) {
    const managedSlotId = sanitizeManagedSlotId(slotId);
    const slot = syncManagedSlotRuntimeState(managedSlotId);
    const selectedChannelId = slot.intendedChannelId || '';
    const joinedChannel = findManagedChannel(slot.channelId || '');
    const selectedChannel = findManagedChannel(selectedChannelId);
    const activeChannelId = slot.channelId || '';
    const activeChannelName = joinedChannel?.name || slot.channelName || activeChannelId || '';
    const selectedChannelName = selectedChannel?.name || selectedChannelId || '';
    const hasDifferentIntent = !!selectedChannelId && !!activeChannelId && selectedChannelId !== activeChannelId;
    const resolvedCount = getManagedSlotTransportPeers(managedSlotId).length;
    const statusText = slot.channelId
      ? `${slot.membershipState || 'joined'} | presence ${slot.presenceState || 'offline'} | ${getManagedChannelSecurityLabel(joinedChannel)}`
      : (selectedChannel
          ? `No active managed membership | target ${selectedChannelName} | ${getManagedChannelSecurityLabel(selectedChannel)}`
          : 'No active managed membership');
    let intentText = '';
    if (slot.errorMessage) {
      intentText = slot.errorMessage;
    } else if (hasDifferentIntent && selectedChannel) {
      intentText = `${selectedChannelName} is selected next for ${getManagedSlotLabel(managedSlotId)}. Current membership stays on ${activeChannelName} until the replacement join succeeds.${channelRequiresPasscode(selectedChannel) ? ' Passcode required.' : ''}`;
    } else if (!slot.channelId && selectedChannel) {
      intentText = channelRequiresPasscode(selectedChannel)
        ? `${selectedChannelName} is the selected ${getManagedSlotLabel(managedSlotId)} target. Enter its passcode, then choose Join Selected to complete resume or join.`
        : `${selectedChannelName} is selected for ${getManagedSlotLabel(managedSlotId)} and ready to join.`;
    } else {
      intentText = `No intended channel selected for ${getManagedSlotLabel(managedSlotId)}.`;
    }
    const peerSyncParts = [`${resolvedCount} transport peer(s) resolved`, getManagedSlotRoutingLabel(managedSlotId)];
    if (slot.lastPeerSyncAt) peerSyncParts.push(formatManagedTimestamp(slot.lastPeerSyncAt));
    const peerSyncText = peerSyncParts.join(' | ');
    return {
      slot: managedSlotId,
      slotState: slot,
      joinedChannel,
      selectedChannel,
      selectedChannelId,
      activeChannelId,
      activeChannelName,
      selectedChannelName,
      hasDifferentIntent,
      resolvedCount,
      title: slot.channelId
        ? (joinedChannel?.name || slot.channelName || slot.channelId)
        : (selectedChannelName || 'No channel selected'),
      statusText,
      intentText,
      peerSyncText,
      passcodeRequired: channelRequiresPasscode(selectedChannel) || channelRequiresPasscode(joinedChannel)
    };
  }
  function normalizeAdminRefreshAction(value) {
    if (value === ADMIN_REFRESH_ACTIONS.CHANNELS) return ADMIN_REFRESH_ACTIONS.CHANNELS;
    if (value === ADMIN_REFRESH_ACTIONS.PEERS) return ADMIN_REFRESH_ACTIONS.PEERS;
    return ADMIN_REFRESH_ACTIONS.ALL;
  }
  function formatAdminRefreshActionLabel(action) {
    if (action === ADMIN_REFRESH_ACTIONS.CHANNELS) return 'Channels';
    if (action === ADMIN_REFRESH_ACTIONS.PEERS) return 'Peers';
    return 'All Data';
  }
  function getManagedJoinedSlotCount() {
    return getManagedSlotIds().filter((slotId) => !!getManagedSlot(slotId).channelId).length;
  }
  function getConnectedTransportPeerCount() {
    return Array.from(activePeers.values()).filter((peer) => !!peer?.connected).length;
  }
  function buildAdminHostStatusSummary() {
    return `${dashboardState.nativeHostConnected ? 'Host connected' : 'Host disconnected'} | ${dashboardState.localEncryptionEnabled ? 'encryption on' : 'encryption off'} | ${getConnectedTransportPeerCount()} connected peer(s)`;
  }
  function buildAdminRouteSummary() {
    const snapshot = getAudioRoutingSnapshot();
    if (!snapshot.length) return 'No active routes';
    const counts = {
      [AUDIO_ROUTE_IDS.LEFT]: 0,
      [AUDIO_ROUTE_IDS.RIGHT]: 0,
      [AUDIO_ROUTE_IDS.CENTER]: 0
    };
    for (const entry of snapshot) counts[entry.route] += 1;
    return `${counts.left} left | ${counts.right} right | ${counts.center} centered`;
  }
  function buildAdminChannelSnapshot() {
    return managedCache.channels.map((channel) => {
      const slotLabels = getManagedSlotIds()
        .filter((slotId) => getManagedSlot(slotId).channelId === channel.channelId)
        .map((slotId) => getManagedSlotLabel(slotId));
      const slotIntentLabels = getManagedSlotIds()
        .filter((slotId) => getManagedSlotIntent(slotId) === channel.channelId)
        .map((slotId) => getManagedSlotLabel(slotId));
      return {
        channelId: channel.channelId,
        name: channel.name || channel.channelId,
        description: channel.description || '',
        note: channel.note || '',
        securityMode: channel.securityMode || 'open',
        requiresPasscode: channelRequiresPasscode(channel),
        memberCount: Number(channel.memberCount) || 0,
        slotLabels,
        slotIntentLabels
      };
    });
  }
  function buildAdminSlotSnapshot() {
    return getManagedSlotIds().map((slotId) => {
      const slot = syncManagedSlotRuntimeState(slotId);
      const intendedChannel = slot.intendedChannelId ? findManagedChannel(slot.intendedChannelId) : null;
      return {
        slotId,
        isActiveSlot: getActiveManagedSlotId() === slotId,
        channelId: slot.channelId || '',
        channelName: slot.channelName || '',
        intendedChannelId: slot.intendedChannelId || '',
        intendedChannelName: intendedChannel?.name || slot.intendedChannelId || '',
        membershipState: slot.membershipState || 'none',
        presenceState: slot.presenceState || 'offline',
        securityMode: slot.securityMode || '',
        lastPeerSyncAt: slot.lastPeerSyncAt || '',
        errorMessage: slot.errorMessage || '',
        transportPeerCount: getManagedSlotTransportPeers(slotId).length
      };
    });
  }
  function buildAdminResolvedEndpointSnapshot() {
    const rows = [];
    for (const slotId of getManagedSlotIds()) {
      const slot = getManagedSlot(slotId);
      for (const peer of getManagedSlotResolvedPeers(slotId)) {
        const selectedEndpoint = pickManagedEndpoint(peer);
        const endpoints = Array.isArray(peer?.endpoints) ? peer.endpoints : [];
        for (const endpoint of endpoints) {
          rows.push({
            slotId,
            peerKey: endpoint?.ip && endpoint?.port ? `${endpoint.ip}:${endpoint.port}` : '',
            channelId: peer?.channelId || slot.channelId || '',
            channelName: findManagedChannel(peer?.channelId || slot.channelId || '')?.name || slot.channelName || '',
            displayName: peer?.displayName || peer?.userId || peer?.sessionId || 'Unknown peer',
            connectionState: peer?.connectionState || 'unknown',
            ip: endpoint?.ip || '',
            port: Number(endpoint?.port) || 0,
            kind: endpoint?.kind || 'unknown',
            registrationState: endpoint?.registrationState || 'unknown',
            lastValidatedAt: endpoint?.lastValidatedAt || '',
            selectedTransport: !!selectedEndpoint && selectedEndpoint.ip === endpoint?.ip && Number(selectedEndpoint.port) === Number(endpoint?.port)
          });
        }
      }
    }
    return rows.sort((left, right) => `${left.slotId}:${left.displayName}:${left.ip}:${left.port}`.localeCompare(`${right.slotId}:${right.displayName}:${right.ip}:${right.port}`));
  }
  function parseIceCandidateString(candidateString) {
    const parts = String(candidateString || '').trim().split(/\s+/);
    if (parts[0]?.indexOf('candidate:') !== 0 || parts.length < 8) return null;
    let type = '';
    for (let index = 6; index < parts.length; index += 1) {
      if (parts[index] === 'typ' && parts[index + 1]) {
        type = parts[index + 1];
        break;
      }
    }
    return {
      protocol: String(parts[2] || '').toLowerCase(),
      ip: String(parts[4] || '').trim(),
      port: Number(parts[5]),
      type
    };
  }
  function buildLocalNatCandidatesFromRuntime() {
    return dedupeNatCandidates(buildManagedLocalCandidates({
      localPort: settings.localPort,
      runtimeConfig: getManagedRuntimeConfig()
    }).map((candidate) => ({
      ...candidate,
      protocol: 'udp',
      source: 'runtime-config',
      discoveredAt: new Date().toISOString()
    })));
  }
  function getNatGatherSourceLabel() {
    const urls = getManagedRuntimeConfig()?.managedStunServerUrls || [];
    return urls.length ? 'stun' : 'none';
  }
  function buildIceServersForNatDiscovery() {
    const urls = Array.isArray(getManagedRuntimeConfig()?.managedStunServerUrls) && getManagedRuntimeConfig().managedStunServerUrls.length
      ? getManagedRuntimeConfig().managedStunServerUrls
      : DEFAULT_MANAGED_STUN_SERVER_URLS;
    return urls.map((url) => ({ urls: url }));
  }
  function applyNatGatherResult(result = {}, options = {}) {
    const discoveredAt = new Date().toISOString();
    const localCandidates = dedupeNatCandidates([
      ...buildLocalNatCandidatesFromRuntime(),
      ...((Array.isArray(result?.localCandidates) ? result.localCandidates : []).map((candidate) => ({
        ...candidate,
        kind: NAT_CANDIDATE_KINDS.LOCAL,
        source: candidate?.source || 'stun'
      })))
    ]);
    const publicCandidates = dedupeNatCandidates(
      (Array.isArray(result?.publicCandidates) ? result.publicCandidates : []).map((candidate) => ({
        ...candidate,
        kind: NAT_CANDIDATE_KINDS.PUBLIC,
        source: candidate?.source || 'stun'
      }))
    );
    natRuntime.gatherer.status = NAT_DISCOVERY_STATES.READY;
    natRuntime.gatherer.source = getNatGatherSourceLabel();
    natRuntime.gatherer.lastCompletedAt = discoveredAt;
    natRuntime.gatherer.lastError = '';
    natRuntime.status = NAT_DISCOVERY_STATES.READY;
    setNatCandidatesForAllSlots({
      localCandidates,
      publicCandidates,
      lastGatheredAt: discoveredAt,
      summaryStatus: publicCandidates.length ? NAT_DISCOVERY_STATES.READY : NAT_DISCOVERY_STATES.IDLE
    });
    for (const slotId of getManagedSlotIds()) reconcileManagedNatProbeTargets(slotId);
    if (options.publishPresence && getManagedSession().sessionId) {
      for (const slotId of getManagedSlotIds().filter((entry) => !!getManagedSlot(entry).channelId)) {
        sendManagedPresence(slotId).catch((error) => {
          console.error('managed nat presence refresh error', error);
        });
      }
    }
  }
  function applyNatGatherFailure(error) {
    const localCandidates = buildLocalNatCandidatesFromRuntime();
    const completedAt = new Date().toISOString();
    natRuntime.gatherer.status = NAT_DISCOVERY_STATES.FAILED;
    natRuntime.gatherer.source = getNatGatherSourceLabel();
    natRuntime.gatherer.lastCompletedAt = completedAt;
    natRuntime.gatherer.lastError = error?.message || 'Failed to gather NAT candidates.';
    natRuntime.status = NAT_DISCOVERY_STATES.FAILED;
    setNatCandidatesForAllSlots({
      localCandidates,
      publicCandidates: [],
      lastGatheredAt: completedAt,
      summaryStatus: localCandidates.length ? NAT_DISCOVERY_STATES.READY : NAT_DISCOVERY_STATES.FAILED
    });
    for (const slotId of getManagedSlotIds()) reconcileManagedNatProbeTargets(slotId);
  }
  function getNatStatusText(slotId = getActiveManagedSlotId()) {
    const slotState = getNatSlotState(slotId);
    const localCount = slotState.localCandidates.length;
    const publicCount = slotState.publicCandidates.length;
    const probeStatusText = getNatProbeStatusText(slotId);
    if (natRuntime.gatherer.status === NAT_DISCOVERY_STATES.GATHERING) {
      return 'NAT readiness: gathering local and mapped public candidates.';
    }
    if (natRuntime.gatherer.status === NAT_DISCOVERY_STATES.FAILED) {
      return `NAT readiness: ${localCount} local candidate(s) | mapped public candidate discovery failed.${probeStatusText}`;
    }
    if (publicCount) {
      return `NAT readiness: ${localCount} local | ${publicCount} mapped public candidate(s) | advisory until transport-authoritative probing exists.${probeStatusText}`;
    }
    if (slotState.lastGatheredAt) {
      return `NAT readiness: ${localCount} local candidate(s) | no mapped public candidate discovered.${probeStatusText}`;
    }
    if (localCount) {
      return `NAT readiness: ${localCount} local candidate(s) ready | mapped public candidate not gathered yet.${probeStatusText}`;
    }
    return 'NAT readiness not evaluated yet.';
  }
  async function gatherNatCandidatesWithWebRtc() {
    if (testPlatform) {
      if (natMockDiscoveryResult?.errorMessage) {
        throw new Error(natMockDiscoveryResult.errorMessage);
      }
      if (natMockDiscoveryResult) {
        return {
          localCandidates: natMockDiscoveryResult.localCandidates || [],
          publicCandidates: natMockDiscoveryResult.publicCandidates || []
        };
      }
      return {
        localCandidates: [],
        publicCandidates: []
      };
    }
    if (typeof RTCPeerConnection !== 'function') {
      throw new Error('RTCPeerConnection is unavailable for NAT discovery.');
    }
    return new Promise((resolve, reject) => {
      const peerConnection = new RTCPeerConnection({
        iceServers: buildIceServersForNatDiscovery()
      });
      const publicCandidates = [];
      const localCandidates = [];
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        try { peerConnection.close(); } catch {}
        resolve({ localCandidates, publicCandidates });
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        try { peerConnection.close(); } catch {}
        reject(error);
      };
      const timeout = window.setTimeout(() => complete(), 4000);
      peerConnection.createDataChannel('udp1492-nat');
      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          window.clearTimeout(timeout);
          complete();
          return;
        }
        const parsed = parseIceCandidateString(event.candidate.candidate);
        if (!parsed || parsed.protocol !== 'udp') return;
        if (parsed.type === 'srflx') {
          publicCandidates.push({
            kind: NAT_CANDIDATE_KINDS.PUBLIC,
            ip: parsed.ip,
            port: parsed.port,
            protocol: parsed.protocol,
            source: 'stun'
          });
        } else if (parsed.type === 'host') {
          localCandidates.push({
            kind: NAT_CANDIDATE_KINDS.LOCAL,
            ip: parsed.ip,
            port: parsed.port,
            protocol: parsed.protocol,
            source: 'stun'
          });
        }
      };
      peerConnection.createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .catch((error) => {
          window.clearTimeout(timeout);
          fail(error);
        });
    });
  }
  async function ensureManagedNatDiscovery(options = {}) {
    if (!options.force && !natDiscoveryPromise) {
      const activeSlotState = getNatSlotState(getActiveManagedSlotId());
      if (
        natRuntime.gatherer.status === NAT_DISCOVERY_STATES.READY
        || activeSlotState.lastGatheredAt
        || natRuntime.gatherer.status === NAT_DISCOVERY_STATES.FAILED
      ) {
        return {
          localCandidates: getNatLocalCandidates(),
          publicCandidates: getNatPublicCandidates()
        };
      }
    }
    if (natDiscoveryPromise) return natDiscoveryPromise;
    natRuntime.gatherer.status = NAT_DISCOVERY_STATES.GATHERING;
    natRuntime.gatherer.source = getNatGatherSourceLabel();
    natRuntime.gatherer.lastStartedAt = new Date().toISOString();
    natRuntime.gatherer.lastError = '';
    natRuntime.status = NAT_DISCOVERY_STATES.GATHERING;
    renderManagedShell();
    queueAdminSnapshotPublish();
    natDiscoveryPromise = gatherNatCandidatesWithWebRtc()
      .then((result) => {
        applyNatGatherResult(result, options);
        if (options.probePeers) {
          return runManagedNatPeerProbes({
            slotIds: getManagedSlotIds().filter((slotId) => !!getManagedSlot(slotId).channelId),
            force: !!options.forcePeerProbes
          }).then(() => result);
        }
        return result;
      })
      .catch((error) => {
        applyNatGatherFailure(error);
        if (!options.silent) throw error;
        return { localCandidates: getNatLocalCandidates(), publicCandidates: [] };
      })
      .finally(() => {
        natDiscoveryPromise = null;
        renderManagedShell();
        queueAdminSnapshotPublish();
      });
    return natDiscoveryPromise;
  }
  async function refreshManagedNatDiscovery(options = {}) {
    return ensureManagedNatDiscovery({
      ...options,
      force: true,
      publishPresence: !!options.publishPresence
    });
  }
  async function handleManagedPeersRefreshed(slotId, resolvedPeers, options = {}) {
    reconcileManagedNatProbeTargets(slotId);
    if (options.runNatProbes) {
      await runManagedNatPeerProbes({
        slotIds: [slotId],
        force: true
      });
    }
    return resolvedPeers;
  }
  function buildAdminSnapshot() {
    return {
      generatedAt: new Date().toISOString(),
      theme: themePreference,
      operatingMode: getOperatingMode(),
      managed: {
        activeSlotId: getActiveManagedSlotId(),
        baseUrl: getManagedBaseUrl(),
        runtimeConfig: structuredClone(getManagedRuntimeConfig()),
        cache: {
          lastUpdatedAt: managedCache.lastUpdatedAt || ''
        },
        profile: {
          displayName: managedProfile.displayName || '',
          userId: managedProfile.userId || '',
          backendBaseUrl: getConfiguredManagedBaseUrl() || ''
        },
        session: {
          ...structuredClone(getManagedSession())
        },
        channels: buildAdminChannelSnapshot(),
        slots: buildAdminSlotSnapshot(),
        joinedSlotCount: getManagedJoinedSlotCount(),
        resolvedEndpoints: buildAdminResolvedEndpointSnapshot(),
        nat: structuredClone(natRuntime)
      },
      stats: {
        activeTransportPeerCount: activePeers.size,
        connectedPeerCount: getConnectedTransportPeerCount(),
        managedTransportPeerCount: getManagedTransportPeers().length,
        joinedSlotCount: getManagedJoinedSlotCount(),
        peerSummary: peerRuntimeStats.summarize(Array.from(activePeers.keys())),
        routeSummary: buildAdminRouteSummary(),
        commanderSummary: getCommanderStatusText(),
        hostStatusSummary: buildAdminHostStatusSummary()
      },
      adminSurface: createDefaultAdminSurfaceState(adminSurfaceState)
    };
  }
  function publishAdminSnapshot() {
    adminSnapshotPublishTimer = null;
    if (typeof platform?.publishAdminState !== 'function') return;
    try {
      platform.publishAdminState(buildAdminSnapshot());
    } catch (error) {
      console.error('admin snapshot publish error', error);
    }
  }
  function queueAdminSnapshotPublish() {
    if (typeof platform?.publishAdminState !== 'function') return;
    if (adminSnapshotPublishTimer) return;
    adminSnapshotPublishTimer = window.setTimeout(() => {
      publishAdminSnapshot();
    }, 0);
  }
  async function openAdminWindow() {
    if (typeof platform?.openAdminWindow !== 'function') return;
    queueAdminSnapshotPublish();
    await platform.openAdminWindow();
  }
  async function refreshAllManagedPeersForAdmin(options = {}) {
    const managedSession = getManagedSession();
    if (!managedSession.sessionId) {
      throw new Error('Open a managed session before refreshing peers.');
    }
    const joinedSlotIds = getManagedSlotIds().filter((slotId) => !!getManagedSlot(slotId).channelId);
    if (!joinedSlotIds.length) {
      if (options.allowEmpty) return [];
      throw new Error('Join a managed channel before refreshing peers.');
    }
    const refreshedPeers = [];
    for (const slotId of joinedSlotIds) {
      refreshedPeers.push(await managedController.refreshManagedPeers(slotId, {
        ensureTransport: true,
        runNatProbes: true
      }));
    }
    return refreshedPeers;
  }
  async function performAdminRefresh(action, options = {}) {
    const normalizedAction = normalizeAdminRefreshAction(action);
    const label = formatAdminRefreshActionLabel(normalizedAction);
    adminSurfaceState.loadingAction = normalizedAction;
    adminSurfaceState.lastAction = `Refreshing ${label}`;
    adminSurfaceState.errorMessage = '';
    adminSurfaceState.lastRequestedAt = new Date().toISOString();
    adminSurfaceState.lastCompletedAt = '';
    renderManagedShell();
    queueAdminSnapshotPublish();
    try {
      if (normalizedAction === ADMIN_REFRESH_ACTIONS.CHANNELS || normalizedAction === ADMIN_REFRESH_ACTIONS.ALL) {
        if (!getManagedSession().sessionId) {
          throw new Error('Open a managed session before refreshing admin data.');
        }
        await refreshManagedChannels({ slotId: getActiveManagedSlotId() });
      }
      if (normalizedAction === ADMIN_REFRESH_ACTIONS.ALL) {
        await refreshManagedNatDiscovery({
          silent: true,
          publishPresence: true,
          probePeers: true,
          forcePeerProbes: true
        });
      }
      if (normalizedAction === ADMIN_REFRESH_ACTIONS.PEERS) {
        await refreshAllManagedPeersForAdmin();
      } else if (normalizedAction === ADMIN_REFRESH_ACTIONS.ALL) {
        await refreshAllManagedPeersForAdmin({ allowEmpty: true });
      }
      adminSurfaceState.loadingAction = 'idle';
      adminSurfaceState.lastAction = `${label} refreshed`;
      adminSurfaceState.errorMessage = '';
      adminSurfaceState.lastCompletedAt = new Date().toISOString();
      renderManagedShell();
      queueAdminSnapshotPublish();
    } catch (error) {
      adminSurfaceState.loadingAction = 'idle';
      adminSurfaceState.lastAction = `${label} failed`;
      adminSurfaceState.errorMessage = error?.message || `Failed to refresh ${label.toLowerCase()}.`;
      adminSurfaceState.lastCompletedAt = new Date().toISOString();
      renderManagedShell();
      queueAdminSnapshotPublish();
      if (!options.silent) throw error;
    }
  }
  async function handleAdminRefreshRequest(request = {}) {
    const action = normalizeAdminRefreshAction(request?.action);
    await performAdminRefresh(action, { source: request?.source || 'admin-window' });
  }
  function getCommanderStatusText() {
    if (getOperatingMode() !== OPERATING_MODES.MANAGED) {
      return 'Commander controls are idle while direct mode is active.';
    }
    const activeTargetKeys = getCommanderActiveTargetKeys();
    if (getCommanderMicMode() === MIC_MODE_IDS.SINGLE) {
      if (isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL)) {
        return 'Single mode is muted for all managed peers.';
      }
      return activeTargetKeys.length
        ? `Single mode sends to ${activeTargetKeys.length} active managed peer(s).`
        : 'Single mode is ready, but no managed peers are active yet.';
    }
    const heldScopes = [
      commanderHoldState.all ? getCommanderScopeLabel(COMMANDER_SCOPE_IDS.ALL) : '',
      commanderHoldState.A ? getCommanderScopeLabel(COMMANDER_SCOPE_IDS.A) : '',
      commanderHoldState.B ? getCommanderScopeLabel(COMMANDER_SCOPE_IDS.B) : ''
    ].filter(Boolean);
    if (!heldScopes.length) {
      return 'Commander mode is armed. Hold All, Group A, or Group B to transmit.';
    }
    return `${heldScopes.join(' + ')} active | ${activeTargetKeys.length} deduped peer target(s).`;
  }
  function renderCommanderButtonState(button, { pressed = false, held = false, text = '' } = {}) {
    if (!button) return;
    if (text) button.textContent = text;
    button.classList.toggle('is-active', !!pressed);
    button.classList.toggle('is-held', !!held);
    button.setAttribute('aria-pressed', String(!!pressed));
  }
  function renderManagedSlotSummary(elements, viewModel, isActiveSlot) {
    if (elements.title) elements.title.textContent = viewModel.title;
    if (elements.status) elements.status.textContent = `${viewModel.statusText}${isActiveSlot ? ' | active slot' : ''}`;
    if (elements.intent) {
      elements.intent.textContent = viewModel.intentText;
    }
    if (elements.peerSync) {
      elements.peerSync.textContent = viewModel.peerSyncText;
    }
  }
  function renderManagedShell() {
    const operatingMode = getOperatingMode();
    const managedSession = getManagedSession();
    const activeSlotId = getActiveManagedSlotId();
    const activeSlotView = buildManagedSlotViewModel(activeSlotId);
    const slotAView = buildManagedSlotViewModel(GROUP_SLOT_IDS.A);
    const slotBView = buildManagedSlotViewModel(GROUP_SLOT_IDS.B);
    const runtimeConfig = getManagedRuntimeConfig();
    const effectiveManagedBaseUrl = getManagedBaseUrl();
    const backendUrlSource = getConfiguredManagedBaseUrl()
      ? 'profile'
      : (runtimeConfig?.managedBackendUrl ? 'app config' : '');
    const joinedSlotCount = getManagedSlotIds().filter((slotId) => !!getManagedSlot(slotId).channelId).length;
    const activeSlotLabel = getManagedSlotLabel(activeSlotId);
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
            ? `Session ${managedSession.status || 'open'} | ${joinedSlotCount} slot(s) joined${managedSession.expiresAt ? ` | until ${formatManagedTimestamp(managedSession.expiresAt)}` : ''}`
            : 'Open a managed session, then target Group A or Group B from the lobby.')
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
      const protectedCount = managedCache.channels.filter((channel) => channelRequiresPasscode(channel)).length;
      const openCount = Math.max(0, managedCache.channels.length - protectedCount);
      managedLobbyStatusEl.textContent = managedCache.channels.length
        ? `${managedCache.channels.length} channel(s) cached | ${openCount} open | ${protectedCount} protected${managedCache.lastUpdatedAt ? ` | synced ${formatManagedTimestamp(managedCache.lastUpdatedAt)}` : ''}`
        : 'No channels loaded yet';
    }
    if (managedActiveSlotLabelEl) {
      managedActiveSlotLabelEl.textContent = activeSlotLabel;
    }
    if (managedSelectGroupABtn) {
      managedSelectGroupABtn.classList.toggle('is-active', activeSlotId === GROUP_SLOT_IDS.A);
      managedSelectGroupABtn.setAttribute('aria-pressed', String(activeSlotId === GROUP_SLOT_IDS.A));
    }
    if (managedSelectGroupBBtn) {
      managedSelectGroupBBtn.classList.toggle('is-active', activeSlotId === GROUP_SLOT_IDS.B);
      managedSelectGroupBBtn.setAttribute('aria-pressed', String(activeSlotId === GROUP_SLOT_IDS.B));
    }
    if (managedActiveChannelEl) {
      managedActiveChannelEl.textContent = activeSlotView.slotState.channelId
        ? activeSlotView.title
        : `${activeSlotLabel} has no active membership`;
    }
    if (managedActiveSlotStatusEl) {
      managedActiveSlotStatusEl.textContent = `${activeSlotLabel} | ${activeSlotView.statusText}`;
    }
    if (managedIntentStatusEl) {
      managedIntentStatusEl.hidden = !activeSlotView.intentText;
      managedIntentStatusEl.textContent = activeSlotView.intentText;
    }
    if (managedPeerSyncMetaEl) {
      managedPeerSyncMetaEl.textContent = activeSlotView.peerSyncText;
    }
    if (managedNatStatusEl) {
      managedNatStatusEl.textContent = getNatStatusText(activeSlotId);
    }
    if (managedRoutingStatusEl) {
      managedRoutingStatusEl.hidden = operatingMode !== OPERATING_MODES.MANAGED;
      managedRoutingStatusEl.textContent = getManagedRoutingSummary();
    }
    if (managedCommanderStatusEl) {
      managedCommanderStatusEl.textContent = getCommanderStatusText();
    }
    renderCommanderButtonState(managedMicModeSingleBtn, {
      pressed: getCommanderMicMode() === MIC_MODE_IDS.SINGLE,
      text: 'Single'
    });
    renderCommanderButtonState(managedMicModeCommanderBtn, {
      pressed: getCommanderMicMode() === MIC_MODE_IDS.COMMANDER,
      text: 'Commander'
    });
    renderCommanderButtonState(managedMuteAllBtn, {
      pressed: isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL),
      text: isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL) ? 'Muted' : 'Mute'
    });
    renderCommanderButtonState(managedMuteGroupABtn, {
      pressed: isCommanderScopeMuted(COMMANDER_SCOPE_IDS.A),
      text: isCommanderScopeMuted(COMMANDER_SCOPE_IDS.A) ? 'Muted' : 'Mute'
    });
    renderCommanderButtonState(managedMuteGroupBBtn, {
      pressed: isCommanderScopeMuted(COMMANDER_SCOPE_IDS.B),
      text: isCommanderScopeMuted(COMMANDER_SCOPE_IDS.B) ? 'Muted' : 'Mute'
    });
    renderCommanderButtonState(managedPttAllBtn, {
      pressed: !!commanderHoldState.all,
      held: !!commanderHoldState.all,
      text: commanderHoldState.all ? 'Talking' : 'Hold To Talk'
    });
    renderCommanderButtonState(managedPttGroupABtn, {
      pressed: !!commanderHoldState.A,
      held: !!commanderHoldState.A,
      text: commanderHoldState.A ? 'Talking' : 'Hold To Talk'
    });
    renderCommanderButtonState(managedPttGroupBBtn, {
      pressed: !!commanderHoldState.B,
      held: !!commanderHoldState.B,
      text: commanderHoldState.B ? 'Talking' : 'Hold To Talk'
    });
    const commanderModeEnabled = getCommanderMicMode() === MIC_MODE_IDS.COMMANDER;
    if (managedMuteGroupABtn) managedMuteGroupABtn.disabled = !commanderModeEnabled;
    if (managedMuteGroupBBtn) managedMuteGroupBBtn.disabled = !commanderModeEnabled;
    if (managedPttAllBtn) managedPttAllBtn.disabled = !commanderModeEnabled;
    if (managedPttGroupABtn) managedPttGroupABtn.disabled = !commanderModeEnabled;
    if (managedPttGroupBBtn) managedPttGroupBBtn.disabled = !commanderModeEnabled;
    renderManagedSlotSummary({
      title: managedGroupATitleEl,
      status: managedGroupAStatusEl,
      intent: managedGroupAIntentEl,
      peerSync: managedGroupAPeerSyncEl
    }, slotAView, activeSlotId === GROUP_SLOT_IDS.A);
    renderManagedSlotSummary({
      title: managedGroupBTitleEl,
      status: managedGroupBStatusEl,
      intent: managedGroupBIntentEl,
      peerSync: managedGroupBPeerSyncEl
    }, slotBView, activeSlotId === GROUP_SLOT_IDS.B);
    if (managedPasscodeLabelEl) {
      managedPasscodeLabelEl.textContent = activeSlotView.passcodeRequired
        ? `${activeSlotLabel} Passcode (Required)`
        : `${activeSlotLabel} Passcode`;
    }
    if (managedJoinPasscodeInputEl) {
      managedJoinPasscodeInputEl.placeholder = activeSlotView.passcodeRequired
        ? (activeSlotView.hasDifferentIntent
            ? `Enter the protected channel passcode to switch ${activeSlotLabel}`
            : 'Enter the protected channel passcode')
        : 'Only for protected channels';
      managedJoinPasscodeInputEl.value = getManagedJoinPasscode(getActiveManagedSlotId());
    }
    if (managedErrorTextEl) {
      const errorMessage = activeSlotView.slotState.errorMessage || managedSession.errorMessage || '';
      managedErrorTextEl.hidden = !errorMessage;
      managedErrorTextEl.textContent = errorMessage;
    }
    syncManagedInputButtonState();
    if (managedRefreshChannelsBtn) {
      managedRefreshChannelsBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !managedSession.sessionId;
    }
    if (managedRefreshNatBtn) {
      managedRefreshNatBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || natRuntime.gatherer.status === NAT_DISCOVERY_STATES.GATHERING;
    }
    if (managedRefreshPeersBtn) {
      managedRefreshPeersBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !activeSlotView.slotState.channelId;
    }
    if (managedLeaveChannelBtn) {
      managedLeaveChannelBtn.disabled = operatingMode !== OPERATING_MODES.MANAGED || !activeSlotView.slotState.channelId;
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
        item.dataset.securityMode = getManagedChannelSecurityMode(channel);
        const header = document.createElement('div');
        header.className = 'managed-list-item-header';
        const summary = document.createElement('div');
        const titleRow = document.createElement('div');
        titleRow.className = 'managed-list-title';
        const title = document.createElement('strong');
        title.textContent = channel.name || channel.channelId || 'Unnamed channel';
        const isProtected = channelRequiresPasscode(channel);
        const isActive = activeSlotView.slotState.channelId === channel.channelId;
        const isSelected = !isActive && activeSlotView.selectedChannelId === channel.channelId;
        const stateBadge = document.createElement('span');
        stateBadge.className = 'managed-badge';
        if (isActive) {
          stateBadge.textContent = 'Joined';
        } else if (isSelected) {
          stateBadge.textContent = 'Selected';
        }
        stateBadge.hidden = !isActive && !isSelected;
        const detail = document.createElement('span');
        detail.textContent = channel.description || channel.note || channel.channelId || 'Managed channel';
        const meta = document.createElement('div');
        meta.className = 'managed-list-meta';
        const security = document.createElement('span');
        security.className = `managed-badge ${isProtected ? 'is-protected' : 'is-open'}`;
        security.textContent = getManagedChannelSecurityLabel(channel);
        const members = document.createElement('span');
        members.className = 'managed-badge';
        members.textContent = `${Number(channel.memberCount) || 0} member(s)`;
        const note = document.createElement('p');
        note.className = 'managed-list-note';
        note.textContent = isProtected
          ? 'Passcode required before join.'
          : 'Open channel. No passcode required.';
        titleRow.append(title, stateBadge);
        meta.append(security, members);
        summary.append(titleRow, detail, meta, note);
        const action = document.createElement('button');
        action.type = 'button';
        action.className = isActive ? 'secondary' : 'primary';
        action.textContent = isActive ? 'Joined' : (isSelected ? 'Join Selected' : (isProtected ? 'Join Protected' : 'Join'));
        action.disabled = !managedSession.sessionId || isActive;
        item.classList.toggle('is-active', isActive);
        item.classList.toggle('is-selected', isSelected);
        action.addEventListener('click', () => {
          setManagedSlotIntent(activeSlotId, channel.channelId);
          if (activeSlotId === GROUP_SLOT_IDS.A) managedProfile.preferredChannelId = channel.channelId;
          renderManagedShell();
          joinManagedChannel(activeSlotId, channel.channelId).catch((err) => {
            getManagedSlot(activeSlotId).errorMessage = err?.message || 'Failed to join the managed channel.';
            if (getActiveManagedSlotId() === activeSlotId) {
              setManagedError(err?.message || 'Failed to join the managed channel.');
            }
            renderManagedShell();
            console.error('managed join error', err);
          });
        });
        header.append(summary, action);
        item.append(header);
        managedChannelListEl.appendChild(item);
      }
    }
    queueAdminSnapshotPublish();
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
    const mode = sanitizeOperatingMode(options.mode || getOperatingMode());
    const desiredPeers = getTransportPeersForMode(mode);
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
    applyActivePeerAudioRouting(mode);
    refreshPeerSelects(peerListEl?.value || NEW_PEER_VALUE, peerModalSelectEl?.value || NEW_PEER_VALUE);
    refreshPeerConnectionState();
    updateStatusDashboard();
    renderManagedShell();
    if (options.sendHostUpdate && nativeHost) {
      await hostSend(buildHostConfigurePayload(mode));
    }
  }
  async function setOperatingMode(nextMode, options = {}) {
    const previousMode = getOperatingMode();
    const mode = sanitizeOperatingMode(nextMode);
    const changed = mode !== previousMode;
    if (changed) clearCommanderHoldState();
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
    queueAdminSnapshotPublish();
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
      if (Number.isFinite(avg)) {
        handleTransportNatProbeEvidence(msg.peerKey, { lastRttMs: Math.round(avg) });
      }
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
        peer = findManagedTransportPeer(msg.key);
      }
      if (!peer || !msg.field) {
        if (msgText) log(`peerUpdate ignored: ${msgText}`);
      } else {
        peer[msg.field] = msg[msg.field];
        if (allPeers.includes(peer)) storage.set({ udp1492_peers: allPeers });
      }
      if (msg.field == 'connected' && peer){
        if (msg[msg.field]){
          handleTransportNatProbeEvidence(msg.key);
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
  async function dispatchOutgoingAudio(config) {
    if (!config || config.type !== 'sendData') return false;
    const operatingMode = getOperatingMode();
    if (operatingMode !== OPERATING_MODES.MANAGED) {
      return hostSend(config);
    }
    if (getCommanderMicMode() === MIC_MODE_IDS.SINGLE) {
      if (isCommanderScopeMuted(COMMANDER_SCOPE_IDS.ALL)) return false;
      return hostSend(config);
    }
    const targetKeys = getCommanderActiveTargetKeys(operatingMode);
    if (!targetKeys.length) return false;
    let sentAny = false;
    for (const peerKey of targetKeys) {
      sentAny = (await hostSend({ ...config, destination: peerKey })) || sentAny;
    }
    return sentAny;
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
            dispatchOutgoingAudio(config);
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
            dispatchOutgoingAudio({
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
    clearCommanderHoldState();
    peerPlaybackTimes.clear();
    decoders.forEach(d => { try { d.close(); } catch {} });
    decoders.clear();
    peerGains.forEach(g => { try { g.disconnect(); } catch {} });
    peerGains.clear();
    peerRoutingNodes.forEach(node => { try { node.disconnect(); } catch {} });
    peerRoutingNodes.clear();
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
  function getOrCreatePeerRoutingNode(peerKey) {
    if (!ac) return null;
    if (peerRoutingNodes.has(peerKey)) return peerRoutingNodes.get(peerKey);
    const routingNode = typeof ac.createStereoPanner === 'function'
      ? ac.createStereoPanner()
      : (typeof StereoPannerNode === 'function' ? new StereoPannerNode(ac) : null);
    if (!routingNode) return null;
    if (masterGain) {
      routingNode.connect(masterGain);
    } else {
      routingNode.connect(ac.destination);
    }
    peerRoutingNodes.set(peerKey, routingNode);
    return routingNode;
  }
  function applyPeerAudioRouting(peerKey, mode = getOperatingMode()) {
    const route = getPeerAudioRoute(peerKey, mode);
    const routingNode = peerRoutingNodes.get(peerKey);
    if (routingNode?.pan) {
      routingNode.pan.value = getAudioRoutePanValue(route);
    }
    const row = document.getElementById(getPeerRowId(peerKey));
    if (row) {
      row.dataset.audioRoute = route;
      row.title = `Audio route: ${getAudioRouteLabel(route)}`;
    }
    return route;
  }
  function applyActivePeerAudioRouting(mode = getOperatingMode()) {
    for (const peerKey of activePeers.keys()) applyPeerAudioRouting(peerKey, mode);
  }
  function getPeerGain(peerKey) {
    if (peerGains.has(peerKey)) return peerGains.get(peerKey);
    const baseGain = getPeerBaseGain(peerKey);
    const muted = !!peerMuteStates.get(peerKey);
    const g = new GainNode(ac, { gain: muted ? 0 : baseGain });
    const routingNode = getOrCreatePeerRoutingNode(peerKey);
    if (routingNode) {
      g.connect(routingNode);
      applyPeerAudioRouting(peerKey);
    } else if (masterGain) {
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
      || !storedAppState?.managed?.slots
      || !storedAppState?.preferences
      || typeof storedAppState?.preferences !== 'object'
      || !storedAppState?.preferences?.muteState
      || !storedAppState?.preferences?.pttBindings;
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
    syncManagedSlotRuntimeState(GROUP_SLOT_IDS.A);
    syncManagedSlotRuntimeState(GROUP_SLOT_IDS.B);
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
    applyPeerAudioRouting(peerKey);
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
    const routingNode = peerRoutingNodes.get(key);
    if (routingNode) { try { routingNode.disconnect(); } catch {} }
    peerRoutingNodes.delete(key);
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
    queueAdminSnapshotPublish();
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
  function installTestHooks() {
    if (!testPlatform || typeof window === 'undefined') return;
    window.udp1492RouteDebug = {
      getSnapshot: () => structuredClone(getAudioRoutingSnapshot())
    };
    window.udp1492CommanderDebug = {
      getSnapshot: () => structuredClone(getCommanderSnapshot()),
      sendTestFrame: () => dispatchOutgoingAudio({
        type: 'sendData',
        dataType: TYPE_AUDIO_PCM,
        data: base64FromUint8(new Uint8Array([1, 2, 3, 4])),
        isBase64: true,
        doStats: false,
        timestamp: Math.trunc(performance.now() * 1000)
      })
    };
    window.udp1492AdminDebug = {
      getSnapshot: () => structuredClone(buildAdminSnapshot())
    };
    window.udp1492NatDebug = {
      getSnapshot: () => structuredClone(natRuntime),
      setMockDiscoveryResult: (value) => {
        natMockDiscoveryResult = value ? structuredClone(value) : null;
      },
      clearMockDiscoveryResult: () => {
        natMockDiscoveryResult = null;
      },
      setMockProbeResults: (value) => {
        natMockProbeResults = value && typeof value === 'object' ? structuredClone(value) : {};
      },
      clearMockProbeResults: () => {
        natMockProbeResults = {};
      },
      runProbes: (options = {}) => runManagedNatPeerProbes(options),
      refresh: (options = {}) => refreshManagedNatDiscovery(options)
    };
  }

  (async function init() {
    try {
      installTestHooks();
      if (typeof platform?.onAdminRefreshRequest === 'function') {
        platform.onAdminRefreshRequest((request) => {
          handleAdminRefreshRequest(request).catch((error) => {
            console.error('admin refresh request error', error);
          });
        });
      }
      await loadRuntimeConfig();
      await loadSaved();
      updateUIbuttons(false);
      queueAdminSnapshotPublish();
      log('ui loaded');
    } catch (e) {
      console.error('init error', e);
    }
  })();
})();
