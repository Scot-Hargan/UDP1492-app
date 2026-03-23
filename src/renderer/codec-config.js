export const SETTINGS_STORAGE_KEY = 'udp1492_settings';
export const INPUT_GAIN_STORAGE_KEY = 'udp1492_input_gain';
export const SELECTED_CODEC_STORAGE_KEY = 'udp1492_selected_codec';

const SETTINGS_STORAGE_PREFIX = 'udp1492_settings_';
const INPUT_GAIN_STORAGE_PREFIX = 'udp1492_input_gain_';

export const DEFAULT_CODEC = 'opus';
export const DEFAULT_SETTINGS = {
  encrypt: true,
  frameMs: 20,
  sampleRate: 48000,
  localPort: 1492,
  deadTime: 15000,
  statsInterval: 1000,
  jitterSamples: 100,
  pingInterval: 5000,
  pingHistory: 60000,
  inputGain: 1.15
};

export const TYPE_AUDIO_OPUS = 0x01;
export const TYPE_AUDIO_PCM = 0x02;
export const TYPE_FILE_TRANSFER = 0x04;
export const TYPE_TEXT_MESSAGE = 0x05;
export const TYPE_STATS_ECHO = 0x06;
export const TYPE_AUDIO_AAC = 0x10;
export const TYPE_AUDIO_FLAC = 0x11;
export const TYPE_AUDIO_VORBIS = 0x12;
export const TYPE_AUDIO_G711U = 0x13;
export const TYPE_AUDIO_G711A = 0x14;

export const CODECS = {
  opus: {
    id: 'opus',
    label: 'Opus',
    dataType: TYPE_AUDIO_OPUS,
    defaults: { ...DEFAULT_SETTINGS, bitrateKbps: 32 },
    useHeader: true,
    encoder: { codec: 'opus', numberOfChannels: 1 },
    decoder: { codec: 'opus', numberOfChannels: 1 },
    options: { bitrate: true, profile: false }
  },
  aac: {
    id: 'aac',
    label: 'AAC',
    dataType: TYPE_AUDIO_AAC,
    defaults: { ...DEFAULT_SETTINGS, bitrateKbps: 96, profile: 'aac-lc' },
    useHeader: true,
    encoder: { codec: 'aac', numberOfChannels: 1 },
    decoder: { codec: 'aac', numberOfChannels: 1 },
    options: { bitrate: true, profile: true },
    allowUnsupported: true
  },
  flac: {
    id: 'flac',
    label: 'FLAC',
    dataType: TYPE_AUDIO_FLAC,
    defaults: { ...DEFAULT_SETTINGS },
    useHeader: true,
    encoder: { codec: 'flac', numberOfChannels: 1 },
    decoder: { codec: 'flac', numberOfChannels: 1 },
    options: { bitrate: false, profile: false },
    allowUnsupported: true
  },
  vorbis: {
    id: 'vorbis',
    label: 'Vorbis',
    dataType: TYPE_AUDIO_VORBIS,
    defaults: { ...DEFAULT_SETTINGS, bitrateKbps: 96 },
    useHeader: true,
    encoder: { codec: 'vorbis', numberOfChannels: 1 },
    decoder: { codec: 'vorbis', numberOfChannels: 1 },
    options: { bitrate: true, profile: false }
  },
  g711u: {
    id: 'g711u',
    label: 'G.711 mu-law',
    dataType: TYPE_AUDIO_G711U,
    defaults: { ...DEFAULT_SETTINGS, sampleRate: 8000, bitrateKbps: 64, frameMs: 20 },
    useHeader: false,
    encoder: { codec: 'g711u', numberOfChannels: 1 },
    decoder: { codec: 'g711u', numberOfChannels: 1 },
    options: { bitrate: false, profile: false },
    softwareEncoder: true,
    softwareDecoder: true
  },
  g711a: {
    id: 'g711a',
    label: 'G.711 A-law',
    dataType: TYPE_AUDIO_G711A,
    defaults: { ...DEFAULT_SETTINGS, sampleRate: 8000, bitrateKbps: 64, frameMs: 20 },
    useHeader: false,
    encoder: { codec: 'g711a', numberOfChannels: 1 },
    decoder: { codec: 'g711a', numberOfChannels: 1 },
    options: { bitrate: false, profile: false },
    softwareEncoder: true,
    softwareDecoder: true
  },
  pcm: {
    id: 'pcm',
    label: 'PCM',
    dataType: TYPE_AUDIO_PCM,
    defaults: { ...DEFAULT_SETTINGS, frameMs: 10 },
    useHeader: false,
    encoder: { codec: 'pcm', numberOfChannels: 1 },
    decoder: { codec: 'pcm', numberOfChannels: 1 },
    options: { bitrate: false, profile: false },
    softwareEncoder: true,
    softwareDecoder: true
  }
};

export const CODEC_IDS = Object.keys(CODECS);

export function getValidCodecId(codecId) {
  return CODECS[codecId] ? codecId : DEFAULT_CODEC;
}

export function getCodecDefaults(codecId = DEFAULT_CODEC) {
  return CODECS[getValidCodecId(codecId)].defaults;
}

export function getCodecByDataType(dataType) {
  const found = CODEC_IDS.map((id) => CODECS[id]).find((codec) => codec.dataType === dataType);
  return found || CODECS[DEFAULT_CODEC];
}

export function getCodecConfig(codecId = DEFAULT_CODEC) {
  return CODECS[getValidCodecId(codecId)];
}

export function getSettingsStorageKey(codecId = DEFAULT_CODEC) {
  return `${SETTINGS_STORAGE_PREFIX}${getValidCodecId(codecId)}`;
}

export function getInputGainStorageKey(codecId = DEFAULT_CODEC) {
  return `${INPUT_GAIN_STORAGE_PREFIX}${getValidCodecId(codecId)}`;
}

export function buildEncoderConfig(codecDef, sampleRate) {
  const config = { ...codecDef.encoder };
  if (sampleRate) config.sampleRate = sampleRate;
  return config;
}

export function buildDecoderConfig(codecDef, sampleRate) {
  const config = { ...codecDef.decoder };
  if (sampleRate) config.sampleRate = sampleRate;
  return config;
}

export function getDecoderKey(peerKey, codecId) {
  return `${codecId || DEFAULT_CODEC}::${peerKey}`;
}
