function visibleQuality(c) {
  const bits = Number.isFinite(c.bits) ? c.bits : 8;
  const columnTax = c.encoder === 'strips-columns' ? 0.35 : 0;
  return c.quality - Math.max(0, 8 - bits) * 0.22 - columnTax;
}

export function chooseBestCandidate(candidates, budget) {
  const feasible = candidates.filter(c => c.payloadBytes <= budget);
  if (!feasible.length) return null;
  return [...feasible].sort((a, b) =>
    visibleQuality(b) - visibleQuality(a) ||
    (b.bits ?? 8) - (a.bits ?? 8) ||
    (b.resolution ?? 0) - (a.resolution ?? 0) ||
    b.payloadBytes - a.payloadBytes ||
    String(a.id ?? '').localeCompare(String(b.id ?? ''))
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
