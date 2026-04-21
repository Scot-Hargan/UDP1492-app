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
  DEFAULT_CODEC,
  TYPE_AUDIO_OPUS,
  TYPE_AUDIO_PCM,
  buildDecoderConfig,
  buildEncoderConfig,
  getCodecByDataType,
  getCodecConfig,
  getDecoderKey
} from './codec-config.js';

export function createAudioEngine(options = {}) {
  const {
    windowRef = globalThis.window,
    navigatorRef = globalThis.navigator,
    testPlatform = null,
    getActiveCodecId = () => DEFAULT_CODEC,
    setActiveCodecId = () => {},
    getSettings = () => ({}),
    getSampleRatePreference = () => 48000,
    getFrameMs = () => 20,
    dispatchOutgoingAudio = async () => false,
    getOperatingMode = () => 'direct',
    getPeerAudioRoute = () => 'center',
    getAudioRoutePanValue = () => 0,
    getAudioRouteLabel = () => 'Both ears',
    getPeerBaseGain = () => 1,
    onPeerRouteApplied = () => {},
    onPeerMeter = () => {},
    onMicMeter = () => {},
    onCaptureStateChange = () => {},
    onLog = () => {},
    onCodecFallback = () => {},
    onCodecSupportWarning = () => {},
    isDebugEnabled = () => false
  } = options;

  let encoder = null;
  let debugDecoder = null;
  const decoders = new Map();
  const peerPlaybackTimes = new Map();
  const peerGains = new Map();
  const peerRoutingNodes = new Map();
  const peerMuteStates = new Map();
  let masterGain = null;
  let ac = null;
  let micStream = null;
  let micSource = null;
  let workletNode = null;
  let samplesPerFrame = 960;
  let targetSampleRate = 48000;
  let playbackHeadroom = 0.05;
  let debugEnabled = false;
  const debugCounters = {
    sent: 0,
    recv: 0,
    headerOk: 0,
    headerMissing: 0,
    checksumMismatch: 0,
    decodeErrors: 0
  };
  const audioDebug = {
    rxFrames: [],
    schedule: []
  };
  let unknownHeaderWarned = false;

  function getPerformanceNow() {
    return windowRef?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
  }

  function getAudioContextCtor() {
    return windowRef?.AudioContext || windowRef?.webkitAudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
  }

  function recordRxFrame(meta) {
    if (!debugEnabled) return;
    audioDebug.rxFrames.push({
      ...meta,
      receivedAt: getPerformanceNow()
    });
    if (audioDebug.rxFrames.length > 50) {
      audioDebug.rxFrames.shift();
    }
  }

  function verifyLocally(chunk) {
    try {
      if (!debugDecoder) {
        debugDecoder = new AudioDecoder({
          output: (audioData) => audioData.close(),
          error: (error) => console.error('Debug decode error:', error)
        });
        const codecDef = getCodecConfig(getActiveCodecId());
        let debugConfig = buildDecoderConfig(codecDef, targetSampleRate);
        try {
          debugDecoder.configure(debugConfig);
        } catch (error) {
          console.warn(`Debug decoder configure failed for codec ${codecDef.id}, falling back to ${DEFAULT_CODEC}:`, error);
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
    } catch (error) {
      console.error('Local encode/decode check failed:', error);
    }
  }

  function ensureAudioContext() {
    if (ac) return ac;
    const AudioContextCtor = getAudioContextCtor();
    if (typeof AudioContextCtor !== 'function') {
      throw new Error('AudioContext is unavailable.');
    }
    ac = new AudioContextCtor({ sampleRate: Number(getSampleRatePreference()) || 48000 });
    targetSampleRate = ac.sampleRate;
    return ac;
  }

  function ensureMasterGain() {
    if (!ac) return null;
    if (!masterGain) {
      masterGain = new GainNode(ac, { gain: 1 });
      masterGain.connect(ac.destination);
    }
    return masterGain;
  }

  async function startCapture() {
    if (testPlatform?.flags?.skipAudioCapture) {
      onCaptureStateChange({ micActive: false, audioTxActive: false });
      onLog('audio capture skipped in test mode');
      return false;
    }

    try {
      ensureAudioContext();
      const frameMs = Number(getFrameMs()) || 20;
      samplesPerFrame = Math.max(1, Math.round(frameMs * targetSampleRate / 1000));
      ensureMasterGain();

      let codecDef = getCodecConfig(getActiveCodecId());
      let softwareEncode = !!codecDef.softwareEncoder;
      let useHeader = codecDef.useHeader !== false;
      let dataType = codecDef.dataType || TYPE_AUDIO_OPUS;

      await ac.audioWorklet.addModule(new URL('./capture-processor.js', windowRef.location.href).toString());
      micStream = await navigatorRef.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: false,
          echoCancellation: false,
          autoGainControl: false,
          sampleRate: targetSampleRate
        },
        video: false
      });

      if (!softwareEncode) {
        encoder = new AudioEncoder({
          output: (chunk) => {
            const payload = packEncodedChunk(chunk, useHeader);
            if (debugEnabled) verifyLocally(chunk);
            const config = {
              type: 'sendData',
              dataType,
              data: base64FromUint8(payload),
              isBase64: true,
              doStats: true,
              timestamp: Math.trunc(chunk.timestamp ?? getPerformanceNow() * 1000)
            };
            if (dataType === TYPE_AUDIO_PCM) config.doGzip = true;
            dispatchOutgoingAudio(config);
          },
          error: (error) => console.error('Encoder error:', error)
        });

        let encoderConfig = buildEncoderConfig(codecDef, targetSampleRate);
        const bitrateKbps = Number(getSettings().bitrateKbps);
        if (Number.isFinite(bitrateKbps) && bitrateKbps > 0) {
          encoderConfig.bitrate = Math.trunc(bitrateKbps * 1000);
        } else if (codecDef.id === 'opus') {
          encoderConfig.bitrate = 32000;
        }

        try {
          encoder.configure(encoderConfig);
        } catch (error) {
          console.warn(`Encoder configure failed for codec ${codecDef.id}, falling back to ${DEFAULT_CODEC}:`, error);
          setActiveCodecId(DEFAULT_CODEC);
          onCodecFallback(DEFAULT_CODEC);
          codecDef = getCodecConfig(DEFAULT_CODEC);
          softwareEncode = !!codecDef.softwareEncoder;
          useHeader = codecDef.useHeader !== false;
          dataType = codecDef.dataType || TYPE_AUDIO_OPUS;
          encoderConfig = buildEncoderConfig(codecDef, targetSampleRate);
          encoderConfig.bitrate = 32000;
          encoder.configure(encoderConfig);
        }
      } else {
        encoder = null;
      }

      micSource = ac.createMediaStreamSource(micStream);
      workletNode = new AudioWorkletNode(ac, 'capture-processor', {
        processorOptions: {
          frameSamples: samplesPerFrame,
          gain: Number(getSettings().inputGain) || 1
        }
      });
      workletNode.port.onmessage = (event) => {
        const data = event.data || {};
        if (data.type !== 'frame' || !data.buf) return;
        const i16 = new Int16Array(data.buf);
        if (typeof data.peak === 'number') onMicMeter(data.peak);

        if (softwareEncode) {
          const timestampUs = Math.trunc(getPerformanceNow() * 1000);
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

        const f32 = new Float32Array(i16.length);
        for (let index = 0; index < i16.length; index += 1) {
          f32[index] = i16[index] / 32768;
        }

        const audioData = new AudioData({
          format: 'f32',
          sampleRate: targetSampleRate,
          numberOfFrames: f32.length,
          numberOfChannels: 1,
          timestamp: getPerformanceNow() * 1000,
          data: f32
        });
        encoder.encode(audioData);
      };

      micSource.connect(workletNode);
      const silentSink = new GainNode(ac, { gain: 0 });
      workletNode.connect(silentSink).connect(ac.destination);
      onCaptureStateChange({ micActive: true });
      onLog(`audio capture started @ ${targetSampleRate} Hz, frame ${samplesPerFrame} samples`);
      return true;
    } catch (error) {
      onLog(`AudioWorklet path failed, will fallback: ${error.message}`);
      try { ac?.close(); } catch {}
      ac = null;
      workletNode = null;
      micSource = null;
      micStream = null;
      masterGain = null;
      onCaptureStateChange({ micActive: false, audioTxActive: false });
      return false;
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
      error: (error) => console.error('Decoder error:', error)
    });

    let decoderConfig = buildDecoderConfig(codecDef, targetSampleRate);
    try {
      decoder.configure(decoderConfig);
    } catch (error) {
      console.warn(`Decoder configure failed for codec ${codecDef.id}, falling back to ${DEFAULT_CODEC}:`, error);
      const fallbackDef = getCodecConfig(DEFAULT_CODEC);
      decoderConfig = buildDecoderConfig(fallbackDef, targetSampleRate);
      decoder.configure(decoderConfig);
    }
    decoders.set(decoderKey, decoder);
    return decoder;
  }

  function removePeer(peerKey) {
    peerPlaybackTimes.delete(peerKey);
    peerMuteStates.delete(peerKey);

    const gainNode = peerGains.get(peerKey);
    if (gainNode) {
      try { gainNode.disconnect(); } catch {}
    }
    peerGains.delete(peerKey);

    const routingNode = peerRoutingNodes.get(peerKey);
    if (routingNode) {
      try { routingNode.disconnect(); } catch {}
    }
    peerRoutingNodes.delete(peerKey);

    for (const [decoderKey, decoder] of decoders.entries()) {
      if (!decoderKey.endsWith(`::${peerKey}`)) continue;
      try { decoder.close(); } catch {}
      decoders.delete(decoderKey);
    }
  }

  function stopCapture() {
    try { workletNode?.disconnect(); } catch {}
    try { micSource?.disconnect(); } catch {}
    try { ac?.close(); } catch {}
    micStream?.getTracks()?.forEach((track) => track.stop());
    workletNode = null;
    micSource = null;
    micStream = null;
    ac = null;
    peerPlaybackTimes.clear();
    decoders.forEach((decoder) => {
      try { decoder.close(); } catch {}
    });
    decoders.clear();
    peerGains.forEach((gainNode) => {
      try { gainNode.disconnect(); } catch {}
    });
    peerGains.clear();
    peerRoutingNodes.forEach((routingNode) => {
      try { routingNode.disconnect(); } catch {}
    });
    peerRoutingNodes.clear();
    peerMuteStates.clear();
    masterGain = null;
    onCaptureStateChange({ micActive: false, audioTxActive: false });
    onLog('audio capture stopped');
    playbackHeadroom = 0.05;
  }

  async function playAudio(peerKey, audioBase64, timestamp, dataType) {
    if (!peerKey) {
      console.warn('Received audio without peerKey, dropping frame');
      return;
    }

    const codecDef = getCodecByDataType(Number(dataType));
    const codecId = codecDef.id;
    const useHeader = codecDef.useHeader !== false;
    ensureAudioContext();
    ensureMasterGain();
    await initDecoder(peerKey, codecId);

    const audio = base64ToUint8(audioBase64);
    let hasHeader = useHeader && audio.length >= AUDIO_HEADER_SIZE;
    let chunkType = 'key';
    let chunkTimestamp = timestamp || getPerformanceNow() * 1000;
    let chunkDuration;
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
        debugCounters.recv += 1;
        debugCounters.headerOk += 1;
        recordRxFrame({
          ts: chunkTimestamp,
          len: frameData.length,
          duration: chunkDuration,
          type: chunkType,
          header: 'ok'
        });
      } else {
        debugCounters.checksumMismatch += 1;
        if (!unknownHeaderWarned) {
          console.warn('Received audio without valid checksum header; falling back to legacy decode');
          unknownHeaderWarned = true;
        }
        hasHeader = false;
        frameData = audio;
        chunkType = 'key';
        chunkTimestamp = timestamp || getPerformanceNow() * 1000;
        chunkDuration = undefined;
        recordRxFrame({
          ts: chunkTimestamp,
          len: frameData.length,
          duration: chunkDuration,
          type: chunkType,
          header: 'bad'
        });
      }
    } else if (useHeader) {
      debugCounters.headerMissing += 1;
      if (!unknownHeaderWarned) {
        console.warn('Received audio payload too small for header; falling back to legacy decode');
        unknownHeaderWarned = true;
      }
      recordRxFrame({
        ts: chunkTimestamp,
        len: frameData.length,
        duration: chunkDuration,
        type: chunkType,
        header: 'missing'
      });
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
        for (let index = 0; index < pcm.length; index += 1) {
          f32[index] = pcm[index] / 32768;
        }
        decodedFrames = f32;
      }
      if (decodedFrames) {
        schedulePcmFrames(peerKey, decodedFrames, codecDef.defaults?.sampleRate || targetSampleRate || 48000);
      }
      return;
    }

    const chunk = new EncodedAudioChunk({
      type: chunkType,
      timestamp: chunkTimestamp || getPerformanceNow() * 1000,
      duration: chunkDuration || undefined,
      data: frameData
    });

    const decoder = decoders.get(getDecoderKey(peerKey, codecId));
    if (decoder) decoder.decode(chunk);
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
    onPeerRouteApplied(peerKey, route, getAudioRouteLabel(route));
    return route;
  }

  function applyActivePeerAudioRouting(mode = getOperatingMode(), peerKeys = []) {
    for (const peerKey of peerKeys) {
      applyPeerAudioRouting(peerKey, mode);
    }
  }

  function getPeerGain(peerKey) {
    if (peerGains.has(peerKey)) return peerGains.get(peerKey);
    const baseGain = getPeerBaseGain(peerKey);
    const muted = !!peerMuteStates.get(peerKey);
    const gainNode = new GainNode(ac, { gain: muted ? 0 : baseGain });
    const routingNode = getOrCreatePeerRoutingNode(peerKey);
    if (routingNode) {
      gainNode.connect(routingNode);
      applyPeerAudioRouting(peerKey);
    } else if (masterGain) {
      gainNode.connect(masterGain);
    } else {
      gainNode.connect(ac.destination);
    }
    peerGains.set(peerKey, gainNode);
    return gainNode;
  }

  function schedulePcmFrames(peerKey, frames, sampleRateHint) {
    let peak = 0;
    for (let index = 0; index < frames.length; index += 1) {
      const value = Math.abs(frames[index]);
      if (value > peak) peak = value;
    }
    onPeerMeter(peerKey, peak);

    const effectiveSampleRate = Number.isFinite(sampleRateHint) && sampleRateHint > 0
      ? sampleRateHint
      : (targetSampleRate || 48000);
    const frameDuration = Number.isFinite(frames.length / effectiveSampleRate) && effectiveSampleRate > 0
      ? frames.length / effectiveSampleRate
      : (samplesPerFrame / (targetSampleRate || 48000));

    const buffer = ac.createBuffer(1, frames.length, ac.sampleRate || targetSampleRate || 48000);
    buffer.copyToChannel(frames, 0);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.connect(getPeerGain(peerKey));

    const now = ac.currentTime;
    let playbackTime = peerPlaybackTimes.get(peerKey);
    if (!Number.isFinite(playbackTime) || playbackTime <= now || (playbackTime - now) > 1) {
      playbackTime = now + playbackHeadroom;
    }

    const scheduledFor = playbackTime;
    source.start(scheduledFor);
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
      if (audioDebug.schedule.length > 50) {
        audioDebug.schedule.shift();
      }
    }
  }

  function handleDecodedAudio(peerKey, audioData) {
    const frames = new Float32Array(audioData.numberOfFrames * audioData.numberOfChannels);
    audioData.copyTo(frames, { planeIndex: 0 });
    audioData.close();
    schedulePcmFrames(peerKey, frames, audioData.sampleRate);
  }

  function togglePeerMute(peerKey) {
    const nextMuted = !peerMuteStates.get(peerKey);
    peerMuteStates.set(peerKey, nextMuted);
    const gainNode = getPeerGain(peerKey);
    gainNode.gain.value = nextMuted ? 0 : getPeerBaseGain(peerKey);
    return nextMuted;
  }

  function setInputGain(nextGain) {
    if (workletNode) {
      workletNode.port.postMessage({ type: 'config', gain: nextGain });
    }
  }

  async function getCodecSupport(codecId, sampleRate, cfg = {}) {
    const codecDef = getCodecConfig(codecId);
    if (!codecDef) return { encoder: false, decoder: false };

    let encoderOk = !!codecDef.softwareEncoder;
    let decoderOk = !!codecDef.softwareDecoder;
    if (!codecDef.softwareEncoder && typeof AudioEncoder !== 'undefined') {
      try {
        const encoderConfig = buildEncoderConfig(codecDef, sampleRate, cfg);
        if (codecDef.id === 'opus') {
          const bitrateKbps = Number(cfg.bitrateKbps);
          encoderConfig.bitrate = Number.isFinite(bitrateKbps) && bitrateKbps > 0
            ? Math.trunc(bitrateKbps * 1000)
            : 32000;
        }
        encoderOk = !!(await AudioEncoder.isConfigSupported(encoderConfig)).supported;
      } catch {
        encoderOk = false;
      }
    }
    if (!codecDef.softwareDecoder && typeof AudioDecoder !== 'undefined') {
      try {
        const decoderConfig = buildDecoderConfig(codecDef, sampleRate, cfg);
        decoderOk = !!(await AudioDecoder.isConfigSupported(decoderConfig)).supported;
      } catch {
        decoderOk = false;
      }
    }
    return { encoder: encoderOk, decoder: decoderOk };
  }

  function playSound(type) {
    if (testPlatform?.flags?.skipAudioCapture) return;
    const AudioContextCtor = getAudioContextCtor();
    if (typeof AudioContextCtor !== 'function') return;

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'enter') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    } else if (type === 'exit') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    } else {
      return;
    }

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
  }

  function setDebugEnabled(nextValue) {
    debugEnabled = !!nextValue;
  }

  function getDebugCounters() {
    return { ...debugCounters };
  }

  function getDebugState() {
    return audioDebug;
  }

  return {
    applyActivePeerAudioRouting,
    applyPeerAudioRouting,
    getCodecSupport,
    getDebugCounters,
    getDebugState,
    playAudio,
    playSound,
    removePeer,
    setDebugEnabled,
    setInputGain,
    startCapture,
    stopCapture,
    togglePeerMute
  };
}
