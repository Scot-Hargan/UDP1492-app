export function parseIceCandidateString(candidateString) {
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

export function buildIceServersForNatDiscovery({ runtimeConfig, defaultStunServerUrls = [] } = {}) {
  const urls = Array.isArray(runtimeConfig?.managedStunServerUrls) && runtimeConfig.managedStunServerUrls.length
    ? runtimeConfig.managedStunServerUrls
    : defaultStunServerUrls;
  return urls.map((url) => ({ urls: url }));
}

export async function gatherNatCandidatesWithWebRtc({
  testMode = false,
  mockResult = null,
  RTCPeerConnectionImpl = globalThis.RTCPeerConnection,
  windowRef = globalThis.window,
  runtimeConfig = {},
  defaultStunServerUrls = [],
  natCandidateKinds = {
    LOCAL: 'local',
    PUBLIC: 'public'
  }
} = {}) {
  if (testMode) {
    if (mockResult?.errorMessage) {
      throw new Error(mockResult.errorMessage);
    }
    if (mockResult) {
      return {
        localCandidates: mockResult.localCandidates || [],
        publicCandidates: mockResult.publicCandidates || []
      };
    }
    return {
      localCandidates: [],
      publicCandidates: []
    };
  }

  if (typeof RTCPeerConnectionImpl !== 'function') {
    throw new Error('RTCPeerConnection is unavailable for NAT discovery.');
  }

  return new Promise((resolve, reject) => {
    const peerConnection = new RTCPeerConnectionImpl({
      iceServers: buildIceServersForNatDiscovery({
        runtimeConfig,
        defaultStunServerUrls
      })
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
    const timeoutId = windowRef?.setTimeout
      ? windowRef.setTimeout(() => complete(), 4000)
      : setTimeout(() => complete(), 4000);

    peerConnection.createDataChannel('udp1492-nat');
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        if (windowRef?.clearTimeout) {
          windowRef.clearTimeout(timeoutId);
        } else {
          clearTimeout(timeoutId);
        }
        complete();
        return;
      }
      const parsed = parseIceCandidateString(event.candidate.candidate);
      if (!parsed || parsed.protocol !== 'udp') return;
      if (parsed.type === 'srflx') {
        publicCandidates.push({
          kind: natCandidateKinds.PUBLIC,
          ip: parsed.ip,
          port: parsed.port,
          protocol: parsed.protocol,
          source: 'stun'
        });
      } else if (parsed.type === 'host') {
        localCandidates.push({
          kind: natCandidateKinds.LOCAL,
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
        if (windowRef?.clearTimeout) {
          windowRef.clearTimeout(timeoutId);
        } else {
          clearTimeout(timeoutId);
        }
        fail(error);
      });
  });
}
