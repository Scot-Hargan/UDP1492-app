const DEFAULT_DASHBOARD_STATE = {
  nativeHostConnected: false,
  micActive: false,
  audioTxActive: false,
  localEncryptionEnabled: true,
  peerConnectedCount: 0,
  peerLatched: false,
  audioRxActive: false,
  audioRxEncrypted: false,
  encryptionMismatch: false,
  nativeHostVersion: null
};

export function createStatusDashboard({ activePeers, elements }) {
  const state = { ...DEFAULT_DASHBOARD_STATE };
  let audioRxActivityTimer = null;

  const {
    nativeHostDot,
    nativeHostStatus,
    localEncryptionDot,
    localEncryptionStatus,
    peerDot,
    peerStatus,
    audioRxDot,
    audioRxStatus
  } = elements;

  function render() {
    if (nativeHostDot && nativeHostStatus) {
      if (state.nativeHostConnected) {
        const version = state.nativeHostVersion || 'unknown';
        nativeHostDot.className = 'status-dot dot-green';
        nativeHostStatus.textContent = `Connected (v${version})`;
      } else {
        nativeHostDot.className = 'status-dot dot-red';
        nativeHostStatus.textContent = 'Disconnected';
      }
    }

    if (localEncryptionDot && localEncryptionStatus) {
      if (state.localEncryptionEnabled) {
        localEncryptionDot.className = 'status-dot dot-green';
        localEncryptionStatus.textContent = 'Enabled';
      } else {
        localEncryptionDot.className = 'status-dot dot-gray';
        localEncryptionStatus.textContent = 'Disabled';
      }
    }

    if (peerDot && peerStatus) {
      if (state.peerConnectedCount > 0) {
        peerDot.className = 'status-dot dot-green dot-pulse';
        peerStatus.textContent = `${state.peerConnectedCount} Connected`;
      } else if (activePeers.size > 0) {
        peerDot.className = 'status-dot dot-yellow';
        peerStatus.textContent = 'Waiting for Peer';
      } else {
        peerDot.className = 'status-dot dot-gray';
        peerStatus.textContent = 'No Active Peers';
      }
    }

    if (audioRxDot && audioRxStatus) {
      if (state.encryptionMismatch) {
        audioRxDot.className = 'status-dot dot-red dot-flash';
        audioRxStatus.textContent = 'MISMATCH DETECTED';
      } else if (state.audioRxActive) {
        audioRxDot.className = state.audioRxEncrypted
          ? 'status-dot dot-green dot-pulse'
          : 'status-dot dot-yellow dot-pulse';
        audioRxStatus.textContent = state.audioRxEncrypted
          ? 'Active (Encrypted)'
          : 'Active (Unencrypted)';
      } else {
        audioRxDot.className = 'status-dot dot-gray';
        audioRxStatus.textContent = 'Inactive';
      }
    }
  }

  function refreshPeerConnectionState(allPeers) {
    let connectedCount = 0;
    for (const key of activePeers.keys()) {
      const peer = allPeers.find((entry) => `${entry.ip}:${entry.port}` === key);
      if (peer?.connected) connectedCount++;
    }
    state.peerConnectedCount = connectedCount;
    state.peerLatched = connectedCount > 0;
  }

  function markAudioReceiveActivity(message) {
    state.audioRxActive = true;
    state.audioRxEncrypted = !!message?.encrypted;
    if (audioRxActivityTimer) clearTimeout(audioRxActivityTimer);
    audioRxActivityTimer = setTimeout(() => {
      state.audioRxActive = false;
      state.audioRxEncrypted = false;
      render();
    }, 1500);
    render();
  }

  function clearAudioReceiveActivity() {
    if (audioRxActivityTimer) {
      clearTimeout(audioRxActivityTimer);
      audioRxActivityTimer = null;
    }
    state.audioRxActive = false;
    state.audioRxEncrypted = false;
  }

  function dispose() {
    clearAudioReceiveActivity();
  }

  return {
    state,
    render,
    refreshPeerConnectionState,
    markAudioReceiveActivity,
    clearAudioReceiveActivity,
    dispose
  };
}
