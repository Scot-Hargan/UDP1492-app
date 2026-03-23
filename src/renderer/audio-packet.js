export const AUDIO_HEADER_SIZE = 17;

export function packEncodedChunk(chunk, useHeader = true) {
  const encoded = new Uint8Array(chunk.byteLength);
  chunk.copyTo(encoded);
  if (!useHeader) return encoded;

  const header = new ArrayBuffer(AUDIO_HEADER_SIZE);
  const view = new DataView(header);
  const typeByte = chunk.type === 'delta' ? 1 : 0;
  view.setUint8(0, typeByte);
  const ts = typeof chunk.timestamp === 'number' ? BigInt(Math.max(0, Math.trunc(chunk.timestamp))) : 0n;
  view.setBigUint64(1, ts);
  const dur = typeof chunk.duration === 'number' ? Math.max(0, Math.trunc(chunk.duration)) : 0;
  view.setUint32(9, dur >>> 0);
  view.setUint32(13, checksum32(encoded));

  const out = new Uint8Array(AUDIO_HEADER_SIZE + encoded.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(encoded, AUDIO_HEADER_SIZE);
  return out;
}

export function packPayloadWithHeader(payload, timestamp, duration, useHeader = true) {
  if (!useHeader) return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const encoded = payload instanceof Uint8Array ? payload : new Uint8Array(payload);

  const header = new ArrayBuffer(AUDIO_HEADER_SIZE);
  const view = new DataView(header);
  view.setUint8(0, 0);
  const ts = typeof timestamp === 'number' ? BigInt(Math.max(0, Math.trunc(timestamp))) : 0n;
  view.setBigUint64(1, ts);
  const dur = typeof duration === 'number' ? Math.max(0, Math.trunc(duration)) : 0;
  view.setUint32(9, dur >>> 0);
  view.setUint32(13, checksum32(encoded));

  const out = new Uint8Array(AUDIO_HEADER_SIZE + encoded.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(encoded, AUDIO_HEADER_SIZE);
  return out;
}

export function checksum32(u8) {
  let sum = 0;
  for (let i = 0; i < u8.length; i++) {
    sum = (sum + u8[i]) >>> 0;
  }
  return sum >>> 0;
}

function linearToMuLawSample(sample) {
  const CLIP = 32635;
  const BIAS = 132;
  let s = sample;
  let sign = 0;
  if (s < 0) {
    s = -s;
    sign = 0x80;
  }
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; expMask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0F;
  return (~(sign | (exponent << 4) | mantissa)) & 0xFF;
}

function muLawToLinearSample(uVal) {
  const mu = (~uVal) & 0xFF;
  const sign = mu & 0x80;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0F;
  let sample = ((mantissa << 4) + 0x08) << (exponent + 3);
  sample -= 132;
  return sign ? -sample : sample;
}

function linearToALawSample(sample) {
  const CLIP = 32635;
  let pcm = sample;
  let mask;
  if (pcm >= 0) {
    mask = 0xD5;
  } else {
    mask = 0x55;
    pcm = -pcm - 1;
  }
  if (pcm > CLIP) pcm = CLIP;

  let seg = 0;
  for (let val = pcm; val > 0x1F; val >>= 1) seg++;

  let aval;
  if (seg >= 8) {
    aval = 0x7F;
  } else {
    aval = seg << 4;
    if (seg < 2) {
      aval |= (pcm >> 4) & 0x0F;
    } else {
      aval |= (pcm >> (seg + 3)) & 0x0F;
    }
  }
  return (aval ^ mask) & 0xFF;
}

function aLawToLinearSample(aVal) {
  let aval = aVal ^ 0x55;
  let t = (aval & 0x0F) << 4;
  const seg = (aval & 0x70) >> 4;
  if (seg) {
    t = (t + 0x100) << (seg - 1);
  } else {
    t += 8;
  }
  return (aval & 0x80) ? t : -t;
}

export function encodeMuLaw(i16) {
  const out = new Uint8Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = linearToMuLawSample(i16[i]);
  return out;
}

export function encodeALaw(i16) {
  const out = new Uint8Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = linearToALawSample(i16[i]);
  return out;
}

export function decodeMuLaw(u8) {
  const out = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) out[i] = muLawToLinearSample(u8[i]) / 32768;
  return out;
}

export function decodeALaw(u8) {
  const out = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) out[i] = aLawToLinearSample(u8[i]) / 32768;
  return out;
}

export function base64FromUint8(u8) {
  let binary = '';
  const len = u8.length;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = u8.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
