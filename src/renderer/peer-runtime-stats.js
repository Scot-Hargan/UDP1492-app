function averageFinite(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return Math.round(finite.reduce((sum, value) => sum + value, 0) / finite.length);
}

function sumFinite(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((total, value) => total + value, 0);
}

export function createPeerRuntimeTracker() {
  const stats = new Map();

  return {
    remove(peerKey) {
      stats.delete(peerKey);
    },
    update(peerKey, patch) {
      if (!peerKey) return;
      const current = stats.get(peerKey) || {};
      stats.set(peerKey, { ...current, ...patch });
    },
    summarize(activeKeys) {
      const summaries = activeKeys
        .map((key) => stats.get(key))
        .filter(Boolean);

      return {
        rtt: averageFinite(summaries.map((entry) => entry.rtt)),
        jitter: averageFinite(summaries.map((entry) => entry.jitter)),
        ooo: sumFinite(summaries.map((entry) => entry.ooo)),
        dups: sumFinite(summaries.map((entry) => entry.dups)),
        loss: sumFinite(summaries.map((entry) => entry.loss))
      };
    }
  };
}
