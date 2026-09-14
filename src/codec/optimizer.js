export function chooseBestCandidate(candidates, budget) {
  const feasible = candidates.filter(c => c.payloadBytes <= budget);
  if (!feasible.length) return null;
  return [...feasible].sort((a, b) =>
    b.quality - a.quality || b.payloadBytes - a.payloadBytes || String(a.id ?? '').localeCompare(String(b.id ?? ''))
  )[0];
}

export function paretoFrontier(candidates) {
  const sorted = [...candidates].sort((a, b) => a.payloadBytes - b.payloadBytes || b.quality - a.quality);
  const out = [];
  let bestQuality = -Infinity;
  for (const c of sorted) {
    if (c.quality > bestQuality) {
      out.push(c);
      bestQuality = c.quality;
    }
  }
  return out;
}

export function rankCandidates(candidates, budget) {
  return [...candidates].sort((a, b) => {
    const af = a.payloadBytes <= budget ? 1 : 0;
    const bf = b.payloadBytes <= budget ? 1 : 0;
    if (af !== bf) return bf - af;
    if (af) return b.quality - a.quality || b.payloadBytes - a.payloadBytes;
    return a.payloadBytes - b.payloadBytes || b.quality - a.quality;
  });
}
