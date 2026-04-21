import {
  base64FromUint8,
} from './audio-packet.js';
import {
  CODECS,
  CODEC_IDS,
  DEFAULT_CODEC,
  DEFAULT_SETTINGS,
  INPUT_GAIN_STORAGE_KEY,
  SELECTED_CODEC_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  TYPE_AUDIO_PCM,
  getCodecConfig,
  getCodecDefaults,
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
import { createAudioEngine } from './audio-engine.js';
import { renderManagedShellView, renderPeerModalOtherFields } from './dom-views.js';
import { gatherNatCandidatesWithWebRtc as gatherNatCandidatesViaWebRtc } from './nat-discovery.js';

// ui.js v0.4.26
(() => {
  'use strict';
  const VERSION = '0.4.26';
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
  const LOCAL_KNOWLEDGE_STORAGE_KEY = 'udp1492_local_knowledge_v1';
  const NEW_PEER_VALUE = '__new__';
  const RETAINED_PEER_SELECTION_PREFIX = '__retained__:';
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
  const ADMIN_MUTATION_ACTIONS = Object.freeze({
    CREATE_CHANNEL: 'create-channel',
    UPDATE_CHANNEL: 'update-channel',
    DELETE_CHANNEL: 'delete-channel',
    FORGET_RETAINED_PEER: 'forget-retained-peer'
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
  let retainedPeerSelections = new Map();
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
  function buildRetainedPeerSelectionOptions() {
    const savedPeerKeys = new Set(allPeers.map((peer) => getPeerKey(peer)).filter(Boolean));
    const defaults = getCodecDefaults(activeCodecId);
    const retainedCandidates = [];
    for (const peer of Array.isArray(localKnowledge?.peers) ? localKnowledge.peers : []) {
      const peerSources = Array.isArray(peer?.sources) ? peer.sources : [];
      for (const endpoint of Array.isArray(peer?.endpoints) ? peer.endpoints : []) {
        const endpointKey = getEndpointKnowledgeKey(endpoint);
        if (!endpointKey || savedPeerKeys.has(endpointKey)) continue;
        if (endpoint?.source !== 'managed' && !peerSources.includes('managed')) continue;
        retainedCandidates.push({
          peerId: typeof peer?.peerId === 'string' ? peer.peerId : '',
          displayName: (typeof peer?.displayName === 'string' && peer.displayName.trim()) || endpointKey,
          endpointKey,
          endpointKind: typeof endpoint?.kind === 'string' && endpoint.kind.trim() ? endpoint.kind.trim() : 'unknown',
          endpoint: {
            ip: typeof endpoint?.ip === 'string' ? endpoint.ip.trim() : '',
            port: Number.parseInt(String(endpoint?.port ?? ''), 10)
          },
          draftPeer: {
            name: (typeof peer?.displayName === 'string' && peer.displayName.trim()) || endpointKey,
            ip: typeof endpoint?.ip === 'string' ? endpoint.ip.trim() : '',
            port: Number.parseInt(String(endpoint?.port ?? ''), 10),
            sharedKey: '',
            gain: defaults.inputGain
          }
        });
      }
    }
    retainedCandidates.sort((left, right) => {
      const leftKey = `${left.displayName}|${left.endpointKind}|${left.endpointKey}`;
      const rightKey = `${right.displayName}|${right.endpointKind}|${right.endpointKey}`;
      return leftKey.localeCompare(rightKey);
    });
    retainedPeerSelections = new Map();
    return retainedCandidates.map((candidate, index) => {
      const value = `${RETAINED_PEER_SELECTION_PREFIX}${index}`;
      retainedPeerSelections.set(value, candidate);
      return {
        name: `Retained: ${candidate.displayName} (${candidate.endpointKind} ${candidate.endpointKey})`,
        value
      };
    });
  }
  function getRetainedPeerSelection(selectionKey) {
    return retainedPeerSelections.get(selectionKey) || null;
  }
  function isRetainedPeerSelection(selectionKey) {
    return !!getRetainedPeerSelection(selectionKey);
  }
  function refreshPeerSelects(mainSelected = NEW_PEER_VALUE, modalSelected) {
    syncPeerSelects({
      allPeers,
      retainedOptions: buildRetainedPeerSelectionOptions(),
      peerListEl,
      peerModalSelectEl,
      mainSelected,
      modalSelected,
      newPeerValue: NEW_PEER_VALUE
    });
  }
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
  let localKnowledge = createDefaultLocalKnowledgeStore();
  let managedJoinPasscodes = createDefaultManagedJoinPasscodes();
  let managedResolvedPeers = createDefaultManagedResolvedPeers();
  let natRuntime = createDefaultNatRuntimeState();
  let adminSurfaceState = createDefaultAdminSurfaceState();
  let nativeHost = null;
  let connected = false;
  let encryptionKeyHex = null;
  let peerMeters = new Map();     // peerKey -> <progress> element
  let commanderHoldState = createDefaultCommanderHoldState();
  let targetSampleRate = Number(sampleRateEl?.value) || DEFAULT_SETTINGS.sampleRate;
  const nowTS = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
  let debugTimer = null;
  const peerRuntimeStats = createPeerRuntimeTracker();
  const codecSupportCache = new Map();
  let adminSnapshotPublishTimer = null;
  let natDiscoveryPromise = null;
  let natMockDiscoveryResult = null;
  let natMockProbeResults = {};
  const natProbeTimeouts = new Map();
  const managedShellElements = {
    operatingModeSummaryEl,
    transportPeersHeadingEl,
    managedModeShellEl,
    managedModeStatusEl,
    managedIdentityNameEl,
    managedIdentityMetaEl,
    managedProfileStatusEl,
    managedChannelListEl,
    managedLobbyStatusEl,
    managedActiveSlotLabelEl,
    managedSelectGroupABtn,
    managedSelectGroupBBtn,
    managedActiveChannelEl,
    managedActiveSlotStatusEl,
    managedGroupATitleEl,
    managedGroupAStatusEl,
    managedGroupAIntentEl,
    managedGroupAPeerSyncEl,
    managedGroupBTitleEl,
    managedGroupBStatusEl,
    managedGroupBIntentEl,
    managedGroupBPeerSyncEl,
    managedIntentStatusEl,
    managedDisplayNameInputEl,
    managedBackendBaseUrlInputEl,
    managedRefreshChannelsBtn,
    managedRefreshNatBtn,
    managedRefreshPeersBtn,
    managedLeaveChannelBtn,
    managedPeerSyncMetaEl,
    managedNatStatusEl,
    managedRoutingStatusEl,
    managedCommanderStatusEl,
    managedMicModeSingleBtn,
    managedMicModeCommanderBtn,
    managedMuteAllBtn,
    managedMuteGroupABtn,
    managedMuteGroupBBtn,
    managedPttAllBtn,
    managedPttGroupABtn,
    managedPttGroupBBtn,
    managedErrorTextEl,
    managedPasscodeLabelEl,
    managedJoinPasscodeInputEl
  };
  const audioEngine = createAudioEngine({
    windowRef: window,
    navigatorRef: navigator,
    testPlatform,
    getActiveCodecId: () => activeCodecId,
    setActiveCodecId: (codecId) => {
      activeCodecId = codecId;
    },
    getSettings: () => settings,
    getSampleRatePreference: () => Number(sampleRateEl?.value) || settings.sampleRate || DEFAULT_SETTINGS.sampleRate,
    getFrameMs: () => Number(frameMsEl?.value) || settings.frameMs || DEFAULT_SETTINGS.frameMs,
    dispatchOutgoingAudio: (config) => dispatchOutgoingAudio(config),
    getOperatingMode,
    getPeerAudioRoute,
    getAudioRoutePanValue,
    getAudioRouteLabel,
    getPeerBaseGain,
    onPeerRouteApplied: (peerKey, route, routeLabel) => {
      const row = document.getElementById(getPeerRowId(peerKey));
      if (!row) return;
      row.dataset.audioRoute = route;
      row.title = `Audio route: ${routeLabel}`;
    },
    onPeerMeter: (peerKey, peak) => updatePeerMeter(peerKey, peak),
    onMicMeter: (peak) => {
      if (micMeterEl) micMeterEl.value = peak;
    },
    onCaptureStateChange: ({ micActive, audioTxActive } = {}) => {
      if (typeof micActive === 'boolean') dashboardState.micActive = micActive;
      if (typeof audioTxActive === 'boolean') dashboardState.audioTxActive = audioTxActive;
      updateStatusDashboard();
    },
    onLog: (line) => log(line),
    onCodecFallback: (codecId) => {
      if (codecSelect) codecSelect.value = codecId;
    },
    isDebugEnabled: () => debugEnabled
  });

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
  function createDefaultManagedAdminSummary(seed = {}) {
    const viewer = seed && typeof seed === 'object' ? seed.viewer || {} : {};
    const permissions = seed && typeof seed === 'object' ? seed.permissions || {} : {};
    const directory = seed && typeof seed === 'object' ? seed.directory || {} : {};
    return {
      available: !!seed?.available,
      errorMessage: typeof seed?.errorMessage === 'string' ? seed.errorMessage : '',
      viewer: {
        sessionId: typeof viewer.sessionId === 'string' ? viewer.sessionId : '',
        userId: typeof viewer.userId === 'string' ? viewer.userId : '',
        displayName: typeof viewer.displayName === 'string' ? viewer.displayName : '',
        role: typeof viewer.role === 'string' ? viewer.role : ''
      },
      permissions: {
        canReadAdminSummary: !!permissions.canReadAdminSummary,
        canManageChannels: !!permissions.canManageChannels,
        canManagePasscodes: !!permissions.canManagePasscodes
      },
      directory: {
        channelCount: Number.isFinite(Number(directory.channelCount)) ? Number(directory.channelCount) : 0,
        protectedChannelCount: Number.isFinite(Number(directory.protectedChannelCount)) ? Number(directory.protectedChannelCount) : 0,
        openChannelCount: Number.isFinite(Number(directory.openChannelCount)) ? Number(directory.openChannelCount) : 0,
        activeSessionCount: Number.isFinite(Number(directory.activeSessionCount)) ? Number(directory.activeSessionCount) : 0,
        activeOperatorSessionCount: Number.isFinite(Number(directory.activeOperatorSessionCount)) ? Number(directory.activeOperatorSessionCount) : 0,
        activeMemberSessionCount: Number.isFinite(Number(directory.activeMemberSessionCount)) ? Number(directory.activeMemberSessionCount) : 0,
        joinedSlotCount: Number.isFinite(Number(directory.joinedSlotCount)) ? Number(directory.joinedSlotCount) : 0,
        activeChannelCount: Number.isFinite(Number(directory.activeChannelCount)) ? Number(directory.activeChannelCount) : 0,
        activeMemberCount: Number.isFinite(Number(directory.activeMemberCount)) ? Number(directory.activeMemberCount) : 0,
        onlineMemberCount: Number.isFinite(Number(directory.onlineMemberCount)) ? Number(directory.onlineMemberCount) : 0,
        readyEndpointCount: Number.isFinite(Number(directory.readyEndpointCount)) ? Number(directory.readyEndpointCount) : 0,
        sessionTtlMs: Number.isFinite(Number(directory.sessionTtlMs)) ? Number(directory.sessionTtlMs) : 0,
        presenceTtlMs: Number.isFinite(Number(directory.presenceTtlMs)) ? Number(directory.presenceTtlMs) : 0,
        observedAt: typeof directory.observedAt === 'string' ? directory.observedAt : ''
      },
      channels: Array.isArray(seed?.channels)
        ? seed.channels
            .filter((channel) => channel && typeof channel === 'object')
            .map((channel) => ({
              channelId: typeof channel.channelId === 'string' ? channel.channelId : '',
              name: typeof channel.name === 'string' ? channel.name : '',
              description: typeof channel.description === 'string' ? channel.description : '',
              note: typeof channel.note === 'string' ? channel.note : '',
              securityMode: typeof channel.securityMode === 'string' ? channel.securityMode : 'open',
              requiresPasscode: !!channel.requiresPasscode,
              concurrentAccessAllowed: channel.concurrentAccessAllowed !== false,
              memberCount: Number.isFinite(Number(channel.memberCount)) ? Number(channel.memberCount) : 0,
              onlineMemberCount: Number.isFinite(Number(channel.onlineMemberCount)) ? Number(channel.onlineMemberCount) : 0,
              readyEndpointCount: Number.isFinite(Number(channel.readyEndpointCount)) ? Number(channel.readyEndpointCount) : 0,
              lastPresenceAt: typeof channel.lastPresenceAt === 'string' ? channel.lastPresenceAt : ''
            }))
        : []
    };
  }
  function createDefaultManagedCache(seed = {}) {
    return {
      version: 1,
      channels: Array.isArray(seed.channels) ? seed.channels.filter((channel) => channel && typeof channel === 'object').map((channel) => ({ ...channel })) : [],
      adminSummary: createDefaultManagedAdminSummary(seed.adminSummary),
      lastUpdatedAt: typeof seed.lastUpdatedAt === 'string' ? seed.lastUpdatedAt : null
    };
  }
  function dedupeLocalKnowledgeSources(values = []) {
    const sources = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const source = typeof value === 'string' ? value.trim() : '';
      if (!source || seen.has(source)) continue;
      seen.add(source);
      sources.push(source);
    }
    return sources;
  }
  function normalizeLocalKnowledgeEndpoint(seed = {}, existing = null) {
    const ip = typeof seed?.ip === 'string' ? seed.ip.trim() : '';
    const port = Number.parseInt(String(seed?.port ?? ''), 10);
    if (!ip || !Number.isFinite(port) || port <= 0) return null;
    return {
      kind: typeof seed?.kind === 'string' && seed.kind.trim() ? seed.kind.trim() : (existing?.kind || 'unknown'),
      ip,
      port,
      source: typeof seed?.source === 'string' && seed.source.trim() ? seed.source.trim() : (existing?.source || ''),
      channelId: typeof seed?.channelId === 'string' ? seed.channelId : (existing?.channelId || ''),
      slotId: typeof seed?.slotId === 'string' ? seed.slotId : (existing?.slotId || ''),
      firstSeenAt: typeof seed?.firstSeenAt === 'string' ? seed.firstSeenAt : (existing?.firstSeenAt || ''),
      lastSeenAt: typeof seed?.lastSeenAt === 'string' ? seed.lastSeenAt : (existing?.lastSeenAt || ''),
      lastConnectedAt: typeof seed?.lastConnectedAt === 'string' ? seed.lastConnectedAt : (existing?.lastConnectedAt || '')
    };
  }
  function mergeLocalKnowledgeEndpoints(existing = [], incoming = []) {
    const merged = new Map();
    for (const candidate of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      const normalized = normalizeLocalKnowledgeEndpoint(candidate, merged.get(`${candidate?.kind || 'unknown'}:${candidate?.ip || ''}:${candidate?.port || ''}`));
      if (!normalized) continue;
      const key = `${normalized.kind}:${normalized.ip}:${normalized.port}`;
      const previous = merged.get(key);
      merged.set(key, normalizeLocalKnowledgeEndpoint(normalized, previous));
    }
    return Array.from(merged.values());
  }
  function createDefaultLocalKnowledgePeer(seed = {}) {
    return {
      peerId: typeof seed?.peerId === 'string' ? seed.peerId : '',
      displayName: typeof seed?.displayName === 'string' ? seed.displayName : '',
      managedUserId: typeof seed?.managedUserId === 'string' ? seed.managedUserId : '',
      manualPeerKey: typeof seed?.manualPeerKey === 'string' ? seed.manualPeerKey : '',
      sources: dedupeLocalKnowledgeSources(seed?.sources),
      endpoints: mergeLocalKnowledgeEndpoints([], seed?.endpoints),
      firstSeenAt: typeof seed?.firstSeenAt === 'string' ? seed.firstSeenAt : '',
      lastSeenAt: typeof seed?.lastSeenAt === 'string' ? seed.lastSeenAt : '',
      lastConnectedAt: typeof seed?.lastConnectedAt === 'string' ? seed.lastConnectedAt : ''
    };
  }
  function createDefaultLocalKnowledgeStore(seed = {}) {
    return {
      version: 1,
      peers: Array.isArray(seed?.peers)
        ? seed.peers
            .filter((peer) => peer && typeof peer === 'object')
            .map((peer) => createDefaultLocalKnowledgePeer(peer))
            .filter((peer) => !!peer.peerId)
        : []
    };
  }
  function getManualPeerKey(peer) {
    const ip = typeof peer?.ip === 'string' ? peer.ip.trim() : '';
    const port = Number.parseInt(String(peer?.port ?? ''), 10);
    if (!ip || !Number.isFinite(port) || port <= 0) return '';
    return `${ip}:${port}`;
  }
  function getEndpointKnowledgeKey(endpoint) {
    const ip = typeof endpoint?.ip === 'string' ? endpoint.ip.trim() : '';
    const port = Number.parseInt(String(endpoint?.port ?? ''), 10);
    if (!ip || !Number.isFinite(port) || port <= 0) return '';
    return `${ip}:${port}`;
  }
  function localKnowledgePeerHasEndpoint(peer, endpoint) {
    const endpointKey = getEndpointKnowledgeKey(endpoint);
    if (!endpointKey) return false;
    if (peer?.manualPeerKey && peer.manualPeerKey === endpointKey) return true;
    return Array.isArray(peer?.endpoints) && peer.endpoints.some((entry) => getEndpointKnowledgeKey(entry) === endpointKey);
  }
  function buildManualKnowledgePeer(peer, existingPeer = {}) {
    const manualPeerKey = getManualPeerKey(peer);
    if (!manualPeerKey) return null;
    return createDefaultLocalKnowledgePeer({
      ...existingPeer,
      peerId: existingPeer?.peerId || `manual:${manualPeerKey}`,
      displayName: (typeof peer?.name === 'string' && peer.name.trim()) || existingPeer?.displayName || manualPeerKey,
      manualPeerKey,
      sources: dedupeLocalKnowledgeSources([...(existingPeer?.sources || []), 'manual']),
      endpoints: mergeLocalKnowledgeEndpoints(existingPeer?.endpoints, [{
        kind: 'direct',
        ip: typeof peer?.ip === 'string' ? peer.ip.trim() : '',
        port: Number.parseInt(String(peer?.port ?? ''), 10),
        source: 'manual',
        channelId: '',
        slotId: ''
      }])
    });
  }
  function syncLocalKnowledgeFromManualPeers(peers = allPeers) {
    const normalizedStore = createDefaultLocalKnowledgeStore(localKnowledge);
    const nextPeers = normalizedStore.peers.map((peer) => createDefaultLocalKnowledgePeer(peer));
    const retainedManualPeerKeys = new Set();
    for (const peer of Array.isArray(peers) ? peers : []) {
      const manualPeerKey = getManualPeerKey(peer);
      if (!manualPeerKey) continue;
      retainedManualPeerKeys.add(manualPeerKey);
      let existingIndex = nextPeers.findIndex((entry) => entry.peerId === `manual:${manualPeerKey}` || entry.manualPeerKey === manualPeerKey);
      if (existingIndex < 0) {
        existingIndex = nextPeers.findIndex((entry) => localKnowledgePeerHasEndpoint(entry, peer));
      }
      const existingPeer = existingIndex >= 0 ? nextPeers[existingIndex] : {};
      const mergedPeer = buildManualKnowledgePeer(peer, existingPeer);
      if (!mergedPeer) continue;
      if (existingIndex >= 0) {
        nextPeers[existingIndex] = mergedPeer;
      } else {
        nextPeers.push(mergedPeer);
      }
    }
    const nextStore = createDefaultLocalKnowledgeStore({
      ...normalizedStore,
      peers: nextPeers.flatMap((peer) => {
        if (!peer?.manualPeerKey || retainedManualPeerKeys.has(peer.manualPeerKey)) return [peer];
        const remainingSources = dedupeLocalKnowledgeSources(peer.sources.filter((source) => source !== 'manual'));
        if (!remainingSources.length) return [];
        return [createDefaultLocalKnowledgePeer({
          ...peer,
          manualPeerKey: '',
          sources: remainingSources,
          endpoints: Array.isArray(peer?.endpoints) ? peer.endpoints.filter((endpoint) => endpoint?.source !== 'manual') : []
        })];
      })
    });
    const changed = JSON.stringify(nextStore) !== JSON.stringify(normalizedStore);
    localKnowledge = nextStore;
    return changed;
  }
  function getManagedKnowledgeEndpoints(peer, slotId, channelId, observedAt) {
    return (Array.isArray(peer?.endpoints) ? peer.endpoints : [])
      .filter((endpoint) => endpoint?.ip && Number.isFinite(Number(endpoint?.port)) && endpoint.registrationState !== 'invalid')
      .map((endpoint) => ({
        kind: typeof endpoint?.kind === 'string' && endpoint.kind.trim() ? endpoint.kind.trim() : 'unknown',
        ip: String(endpoint.ip).trim(),
        port: Number.parseInt(String(endpoint.port), 10),
        source: 'managed',
        channelId: typeof channelId === 'string' ? channelId : '',
        slotId: typeof slotId === 'string' ? slotId : '',
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        lastConnectedAt: ''
      }))
      .filter((endpoint) => !!getEndpointKnowledgeKey(endpoint));
  }
  function buildManagedKnowledgePeer(peer, slotId, channelId, observedAt, existingPeer = {}) {
    const endpoints = getManagedKnowledgeEndpoints(peer, slotId, channelId, observedAt);
    const managedUserId = typeof peer?.userId === 'string' ? peer.userId.trim() : '';
    const peerId = existingPeer?.peerId
      || (managedUserId ? `managed:${managedUserId}` : '')
      || (endpoints[0] ? `managed-endpoint:${getEndpointKnowledgeKey(endpoints[0])}` : '');
    if (!peerId) return null;
    const preserveManualDisplayName = Array.isArray(existingPeer?.sources) && existingPeer.sources.includes('manual') && existingPeer?.displayName;
    return createDefaultLocalKnowledgePeer({
      ...existingPeer,
      peerId,
      displayName: preserveManualDisplayName
        ? existingPeer.displayName
        : ((typeof peer?.displayName === 'string' && peer.displayName.trim()) || existingPeer?.displayName || peerId),
      managedUserId: managedUserId || existingPeer?.managedUserId || '',
      sources: dedupeLocalKnowledgeSources([...(existingPeer?.sources || []), 'managed']),
      endpoints: mergeLocalKnowledgeEndpoints(existingPeer?.endpoints, endpoints),
      firstSeenAt: existingPeer?.firstSeenAt || observedAt,
      lastSeenAt: observedAt,
      lastConnectedAt: existingPeer?.lastConnectedAt || ''
    });
  }
  function retainManagedPeerKnowledge(slotId, resolvedPeers = [], options = {}) {
    const normalizedStore = createDefaultLocalKnowledgeStore(localKnowledge);
    const nextPeers = normalizedStore.peers.map((peer) => createDefaultLocalKnowledgePeer(peer));
    const managedSlotId = sanitizeManagedSlotId(slotId);
    const observedAt = typeof options?.observedAt === 'string' && options.observedAt ? options.observedAt : new Date().toISOString();
    const channelId = typeof options?.channelId === 'string' ? options.channelId : (getManagedSlot(managedSlotId).channelId || '');
    for (const peer of Array.isArray(resolvedPeers) ? resolvedPeers : []) {
      const endpoints = getManagedKnowledgeEndpoints(peer, managedSlotId, channelId, observedAt);
      const managedUserId = typeof peer?.userId === 'string' ? peer.userId.trim() : '';
      if (!managedUserId && !endpoints.length) continue;
      let existingIndex = -1;
      if (managedUserId) {
        existingIndex = nextPeers.findIndex((entry) => entry.managedUserId === managedUserId);
      }
      if (existingIndex < 0 && endpoints.length) {
        existingIndex = nextPeers.findIndex((entry) => endpoints.some((endpoint) => localKnowledgePeerHasEndpoint(entry, endpoint)));
      }
      const existingPeer = existingIndex >= 0 ? nextPeers[existingIndex] : {};
      const nextPeer = buildManagedKnowledgePeer(peer, managedSlotId, channelId, observedAt, existingPeer);
      if (!nextPeer) continue;
      if (existingIndex >= 0) {
        nextPeers[existingIndex] = nextPeer;
      } else {
        nextPeers.push(nextPeer);
      }
    }
    const nextStore = createDefaultLocalKnowledgeStore({
      ...normalizedStore,
      peers: nextPeers
    });
    const changed = JSON.stringify(nextStore) !== JSON.stringify(normalizedStore);
    localKnowledge = nextStore;
    return changed;
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
      activityLabel: typeof seed?.activityLabel === 'string' ? seed.activityLabel : '',
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
  function getManagedListenPort() {
    const listenPort = Number(settings.localPort);
    return Number.isFinite(listenPort) && listenPort > 0 ? listenPort : 0;
  }
  function getManagedPresenceEndpoints() {
    const listenPort = getManagedListenPort();
    return buildManagedPresenceEndpoints({
      localPort: listenPort || settings.localPort,
      runtimeConfig: getManagedRuntimeConfig(),
      additionalEndpoints: getNatPublicCandidates(getActiveManagedSlotId()).map((candidate) => ({
        kind: candidate.kind,
        ip: candidate.ip,
        port: listenPort || candidate.port
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
    const listenPort = getManagedListenPort();
    const transportReadyEndpoints = listenPort
      ? readyEndpoints.filter((endpoint) => Number(endpoint.port) === listenPort)
      : readyEndpoints;
    if (!transportReadyEndpoints.length) return null;
    return transportReadyEndpoints.find((endpoint) => endpoint.kind === 'public')
      || transportReadyEndpoints.find((endpoint) => endpoint.kind === 'local')
      || transportReadyEndpoints[0];
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
    if (options.includeLocalKnowledge) {
      payload[LOCAL_KNOWLEDGE_STORAGE_KEY] = localKnowledge;
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
  async function createAdminChannel(input = {}) {
    return managedController.createAdminChannel(input);
  }
  async function updateAdminChannel(input = {}) {
    return managedController.updateAdminChannel(input);
  }
  async function deleteAdminChannel(input = {}) {
    return managedController.deleteAdminChannel(input);
  }
  async function forgetRetainedKnowledgePeer(input = {}) {
    const peerId = typeof input?.peerId === 'string' ? input.peerId.trim() : '';
    if (!peerId) {
      throw new Error('Choose a retained peer before requesting local deletion.');
    }
    const normalizedStore = createDefaultLocalKnowledgeStore(localKnowledge);
    const targetPeer = normalizedStore.peers.find((peer) => peer.peerId === peerId);
    if (!targetPeer) {
      throw new Error('The selected retained peer is no longer available.');
    }
    if (Array.isArray(targetPeer.sources) && targetPeer.sources.includes('manual')) {
      throw new Error('This retained entry is linked to a saved direct peer. Remove the manual peer first if you want to forget it locally.');
    }
    localKnowledge = createDefaultLocalKnowledgeStore({
      ...normalizedStore,
      peers: normalizedStore.peers.filter((peer) => peer.peerId !== peerId)
    });
    await storage.set({
      [LOCAL_KNOWLEDGE_STORAGE_KEY]: localKnowledge
    });
    refreshPeerSelects(peerListEl?.value || NEW_PEER_VALUE, peerModalSelectEl?.value || NEW_PEER_VALUE);
    renderManagedShell();
    queueAdminSnapshotPublish();
    return localKnowledge;
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
  function normalizeAdminMutationAction(value) {
    if (value === ADMIN_MUTATION_ACTIONS.FORGET_RETAINED_PEER) return ADMIN_MUTATION_ACTIONS.FORGET_RETAINED_PEER;
    if (value === ADMIN_MUTATION_ACTIONS.UPDATE_CHANNEL) return ADMIN_MUTATION_ACTIONS.UPDATE_CHANNEL;
    if (value === ADMIN_MUTATION_ACTIONS.DELETE_CHANNEL) return ADMIN_MUTATION_ACTIONS.DELETE_CHANNEL;
    return ADMIN_MUTATION_ACTIONS.CREATE_CHANNEL;
  }
  function formatAdminMutationActionLabel(action) {
    if (action === ADMIN_MUTATION_ACTIONS.FORGET_RETAINED_PEER) return 'Retained Peer Forget';
    if (action === ADMIN_MUTATION_ACTIONS.UPDATE_CHANNEL) return 'Channel Update';
    if (action === ADMIN_MUTATION_ACTIONS.DELETE_CHANNEL) return 'Channel Delete';
    return 'Channel Create';
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
        concurrentAccessAllowed: channel.concurrentAccessAllowed !== false,
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
  function buildAdminRetainedKnowledgeSnapshot() {
    const normalizedStore = createDefaultLocalKnowledgeStore(localKnowledge);
    const peers = normalizedStore.peers
      .map((peer) => {
        const endpoints = Array.isArray(peer?.endpoints)
          ? peer.endpoints
              .map((endpoint) => ({
                kind: endpoint?.kind || 'unknown',
                ip: endpoint?.ip || '',
                port: Number(endpoint?.port) || 0,
                source: endpoint?.source || '',
                channelId: endpoint?.channelId || '',
                slotId: endpoint?.slotId || '',
                firstSeenAt: endpoint?.firstSeenAt || '',
                lastSeenAt: endpoint?.lastSeenAt || '',
                lastConnectedAt: endpoint?.lastConnectedAt || ''
              }))
              .filter((endpoint) => endpoint.ip && endpoint.port > 0)
          : [];
        const latestSeenAt = [peer?.lastSeenAt || '', ...endpoints.map((endpoint) => endpoint.lastSeenAt || '')]
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || '';
        return {
          peerId: peer.peerId,
          displayName: peer.displayName || peer.peerId,
          managedUserId: peer.managedUserId || '',
          manualPeerKey: peer.manualPeerKey || '',
          sources: Array.isArray(peer.sources) ? [...peer.sources] : [],
          firstSeenAt: peer.firstSeenAt || '',
          lastSeenAt: peer.lastSeenAt || '',
          lastConnectedAt: peer.lastConnectedAt || '',
          endpointCount: endpoints.length,
          latestSeenAt,
          canForget: !(Array.isArray(peer.sources) && peer.sources.includes('manual')),
          endpoints: endpoints.sort((left, right) => `${left.source}:${left.kind}:${left.ip}:${left.port}`.localeCompare(`${right.source}:${right.kind}:${right.ip}:${right.port}`))
        };
      })
      .sort((left, right) => {
        const leftKey = `${left.latestSeenAt || left.lastConnectedAt || ''}|${left.displayName}|${left.peerId}`;
        const rightKey = `${right.latestSeenAt || right.lastConnectedAt || ''}|${right.displayName}|${right.peerId}`;
        return rightKey.localeCompare(leftKey);
      });
    return {
      version: normalizedStore.version,
      peerCount: peers.length,
      managedCount: peers.filter((peer) => peer.sources.includes('managed')).length,
      manualCount: peers.filter((peer) => peer.sources.includes('manual')).length,
      retainedOnlyCount: peers.filter((peer) => peer.canForget).length,
      endpointCount: peers.reduce((sum, peer) => sum + peer.endpointCount, 0),
      peers
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
    return gatherNatCandidatesViaWebRtc({
      testMode: !!testPlatform,
      mockResult: natMockDiscoveryResult,
      RTCPeerConnectionImpl: window.RTCPeerConnection,
      windowRef: window,
      runtimeConfig: getManagedRuntimeConfig(),
      defaultStunServerUrls: DEFAULT_MANAGED_STUN_SERVER_URLS,
      natCandidateKinds: {
        LOCAL: NAT_CANDIDATE_KINDS.LOCAL,
        PUBLIC: NAT_CANDIDATE_KINDS.PUBLIC
      }
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
    retainManagedPeerKnowledge(slotId, resolvedPeers, {
      observedAt: getManagedSlot(slotId).lastPeerSyncAt || new Date().toISOString(),
      channelId: getManagedSlot(slotId).channelId || ''
    });
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
        backendAdmin: structuredClone(createDefaultManagedAdminSummary(managedCache.adminSummary)),
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
      retainedKnowledge: buildAdminRetainedKnowledgeSnapshot(),
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
    adminSurfaceState.activityLabel = `Refreshing ${label}`;
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
      adminSurfaceState.activityLabel = '';
      adminSurfaceState.lastAction = `${label} refreshed`;
      adminSurfaceState.errorMessage = '';
      adminSurfaceState.lastCompletedAt = new Date().toISOString();
      renderManagedShell();
      queueAdminSnapshotPublish();
    } catch (error) {
      adminSurfaceState.loadingAction = 'idle';
      adminSurfaceState.activityLabel = '';
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
  async function performAdminMutation(request = {}) {
    const action = normalizeAdminMutationAction(request?.action);
    const label = formatAdminMutationActionLabel(action);
    const payload = request?.payload && typeof request.payload === 'object' ? request.payload : {};
    adminSurfaceState.loadingAction = action;
    adminSurfaceState.activityLabel = `Applying ${label}`;
    adminSurfaceState.lastAction = `Applying ${label}`;
    adminSurfaceState.errorMessage = '';
    adminSurfaceState.lastRequestedAt = new Date().toISOString();
    adminSurfaceState.lastCompletedAt = '';
    renderManagedShell();
    queueAdminSnapshotPublish();
    try {
      if (action !== ADMIN_MUTATION_ACTIONS.FORGET_RETAINED_PEER && !getManagedSession().sessionId) {
        throw new Error('Open a managed session before performing admin actions.');
      }
      if (action === ADMIN_MUTATION_ACTIONS.FORGET_RETAINED_PEER) {
        await forgetRetainedKnowledgePeer(payload);
      } else if (action === ADMIN_MUTATION_ACTIONS.CREATE_CHANNEL) {
        await createAdminChannel(payload);
      } else if (action === ADMIN_MUTATION_ACTIONS.UPDATE_CHANNEL) {
        await updateAdminChannel(payload);
      } else {
        await deleteAdminChannel(payload);
      }
      adminSurfaceState.loadingAction = 'idle';
      adminSurfaceState.activityLabel = '';
      adminSurfaceState.lastAction = `${label} complete`;
      adminSurfaceState.errorMessage = '';
      adminSurfaceState.lastCompletedAt = new Date().toISOString();
      renderManagedShell();
      queueAdminSnapshotPublish();
    } catch (error) {
      adminSurfaceState.loadingAction = 'idle';
      adminSurfaceState.activityLabel = '';
      adminSurfaceState.lastAction = `${label} failed`;
      adminSurfaceState.errorMessage = error?.message || `Failed to apply ${label.toLowerCase()}.`;
      adminSurfaceState.lastCompletedAt = new Date().toISOString();
      renderManagedShell();
      queueAdminSnapshotPublish();
      throw error;
    }
  }
  async function handleAdminActionRequest(request = {}) {
    await performAdminMutation({
      action: request?.action,
      payload: request?.payload || {}
    });
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
  function renderManagedShell() {
    renderManagedShellView({
      document,
      elements: managedShellElements,
      constants: {
        OPERATING_MODES,
        GROUP_SLOT_IDS,
        MIC_MODE_IDS,
        COMMANDER_SCOPE_IDS,
        NAT_DISCOVERY_STATES
      },
      state: {
        managedProfile,
        managedCache,
        natRuntime,
        commanderHoldState
      },
      helpers: {
        buildManagedSlotViewModel,
        channelRequiresPasscode,
        formatManagedTimestamp,
        getActiveManagedSlotId,
        getCommanderMicMode,
        getCommanderStatusText,
        getConfiguredManagedBaseUrl,
        getManagedBaseUrl,
        getManagedChannelSecurityLabel,
        getManagedChannelSecurityMode,
        getManagedJoinPasscode,
        getManagedRoutingSummary,
        getManagedRuntimeConfig,
        getManagedSession,
        getManagedSlot,
        getManagedSlotIds,
        getManagedSlotLabel,
        getNatStatusText,
        getOperatingMode,
        isCommanderScopeMuted
      },
      actions: {
        onManagedChannelAction: (slotId, channelId) => {
          setManagedSlotIntent(slotId, channelId);
          if (slotId === GROUP_SLOT_IDS.A) managedProfile.preferredChannelId = channelId;
          renderManagedShell();
          joinManagedChannel(slotId, channelId).catch((err) => {
            getManagedSlot(slotId).errorMessage = err?.message || 'Failed to join the managed channel.';
            if (getActiveManagedSlotId() === slotId) {
              setManagedError(err?.message || 'Failed to join the managed channel.');
            }
            renderManagedShell();
            console.error('managed join error', err);
          });
        },
        queueAdminSnapshotPublish,
        syncManagedInputButtonState,
        updateOperatingModeButtons
      }
    });
  }
  async function updateManagedProfileFromInputs() {
    managedProfile.displayName = (managedDisplayNameInputEl?.value || '').trim();
    managedProfile.backendBaseUrl = sanitizeManagedBaseUrl(managedBackendBaseUrlInputEl?.value || '');
    managedProfile.preferredChannelId = getManagedSlotIntent(GROUP_SLOT_IDS.A) || managedProfile.preferredChannelId || '';
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
    const result = await audioEngine.getCodecSupport(codecId, sr, cfg);
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
    if (applyWorklet) audioEngine.setInputGain(nextGain);
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
    await audioEngine.startCapture();
  }
  function stopAudioCapture() {
    audioEngine.stopCapture();
    clearCommanderHoldState();
    peerMeters.clear();
    statusDashboard.clearAudioReceiveActivity();
    updateStatusDashboard();
  }
  async function playAudio(peerKey, audio_base64, timestamp, dataType) {
    await audioEngine.playAudio(peerKey, audio_base64, timestamp, dataType);
  }
  function getPeerBaseGain(peerKey) {
    const p = activePeers.get(peerKey);
    const val = Number(p?.gain);
    return Number.isFinite(val) && val > 0 ? val : 1;
  }
  function applyPeerAudioRouting(peerKey, mode = getOperatingMode()) {
    return audioEngine.applyPeerAudioRouting(peerKey, mode);
  }
  function applyActivePeerAudioRouting(mode = getOperatingMode()) {
    audioEngine.applyActivePeerAudioRouting(mode, Array.from(activePeers.keys()));
  }
  function updatePeerMeter(peerKey, peak) {
    const meter = peerMeters.get(peerKey);
    if (!meter) return;
    meter.value = Math.max(0, Math.min(1, peak || 0));
  }
  function togglePeerMute(peerKey) {
    const next = audioEngine.togglePeerMute(peerKey);
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
      LOCAL_KNOWLEDGE_STORAGE_KEY,
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
    localKnowledge = createDefaultLocalKnowledgeStore(got[LOCAL_KNOWLEDGE_STORAGE_KEY]);
    const localKnowledgeChanged = syncLocalKnowledgeFromManualPeers(allPeers);
    if (!getManagedSlotIntent(GROUP_SLOT_IDS.A) && managedProfile.preferredChannelId) {
      setManagedSlotIntent(GROUP_SLOT_IDS.A, managedProfile.preferredChannelId);
    }
    syncManagedSlotRuntimeState(GROUP_SLOT_IDS.A);
    syncManagedSlotRuntimeState(GROUP_SLOT_IDS.B);
    renderManagedShell();
    await syncTransportPeerRows({ sendHostUpdate: false });
    if (needsAppStateNormalization || !got[MANAGED_PROFILE_STORAGE_KEY] || !got[MANAGED_CACHE_STORAGE_KEY] || !got[LOCAL_KNOWLEDGE_STORAGE_KEY] || localKnowledgeChanged) {
      await persistAppState({
        includeLegacyLastPeers: true,
        includeManagedProfile: true,
        includeManagedCache: true,
        includeLocalKnowledge: true
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
    if (isRetainedPeerSelection(value)) {
      openPeerModal(value);
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
    const retainedSelection = getRetainedPeerSelection(key);
    const peer = allPeers.find(p => `${p.ip}:${p.port}` === key)
      || retainedSelection?.draftPeer
      || { name: '', ip: '', port: settings.localPort || defaults.localPort, gain: defaults.inputGain };
    if (peerModalNameEl) peerModalNameEl.value = peer.name || '';
    if (peerModalIpEl) peerModalIpEl.value = peer.ip || '';
    if (peerModalPortEl) peerModalPortEl.value = peer.port || defaults.localPort;
    if (peerModalKeyEl) peerModalKeyEl.value = peer.sharedKey || '';
    if (peerModalGainEl) peerModalGainEl.value = peer.gain || defaults.inputGain;
    updatePeerGainLabel(peerModalGainValueEl, peerModalGainEl?.value);
    if (peerModalDeleteBtn) peerModalDeleteBtn.hidden = key === NEW_PEER_VALUE || !!retainedSelection;
    renderPeerModalOtherFields({
      document,
      container: peerModalOtherFieldsEl,
      peer,
      selectionKey: retainedSelection ? NEW_PEER_VALUE : key,
      newPeerValue: NEW_PEER_VALUE
    });
  }
  async function savePeerFromModal() {
    const selection = peerModalSelectEl?.value || NEW_PEER_VALUE;
    const retainedSelection = getRetainedPeerSelection(selection);
    const isNew = selection === NEW_PEER_VALUE || !!retainedSelection;
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
    syncLocalKnowledgeFromManualPeers(allPeers);
    peerPayload[LOCAL_KNOWLEDGE_STORAGE_KEY] = localKnowledge;
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
    syncLocalKnowledgeFromManualPeers(allPeers);
    if (getOperatingMode() === OPERATING_MODES.DIRECT) {
      rememberDirectPeerSelection();
      storage.set({
        udp1492_peers: allPeers,
        [APP_STATE_V2_STORAGE_KEY]: appState,
        udp1492_last_peers: dedupePeerKeys(appState?.direct?.activePeerKeys),
        [LOCAL_KNOWLEDGE_STORAGE_KEY]: localKnowledge
      });
    } else {
      storage.set({
        udp1492_peers: allPeers,
        [LOCAL_KNOWLEDGE_STORAGE_KEY]: localKnowledge
      });
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
    audioEngine.removePeer(key);
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
  function startDebugTimer() {
    if (debugTimer || !debugEnabled) return;
    debugTimer = setInterval(() => {
      console.info('Audio debug counters', audioEngine.getDebugCounters());
    }, 2000);
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
    audioEngine.setDebugEnabled(debugEnabled);
    if (toggleLogBtn) toggleLogBtn.textContent = on ? 'Stop log' : 'Start log';
    if (debugLogEl) debugLogEl.setAttribute('aria-live', on ? 'polite' : 'off');
    storage.set({ ['udp1492_debug_enabled']: debugEnabled });
    if (debugEnabled && !debugTimer) {
      startDebugTimer();
      if (typeof window !== 'undefined') window.audioDebug = audioEngine.getDebugState();
    } else if (!debugEnabled && debugTimer) {
      clearInterval(debugTimer);
      debugTimer = null;
    }
    log(`debug ${on ? 'ENABLED' : 'DISABLED'}`);
  }
  function playSound(type) {
    audioEngine.playSound(type);
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
    window.udp1492ManagedDebug = {
      sendPresence: (slotId) => sendManagedPresence(slotId),
      refreshPeers: (slotId, options = {}) => managedController.refreshManagedPeers(slotId, options)
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
      if (typeof platform?.onAdminActionRequest === 'function') {
        platform.onAdminActionRequest((request) => {
          handleAdminActionRequest(request).catch((error) => {
            console.error('admin action request error', error);
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
