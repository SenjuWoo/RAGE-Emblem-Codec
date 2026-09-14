import { rgbaDistance, lerpRgba } from './color.js';

function rdpIndices(samples, start, end, tolerance) {
  if (end <= start + 1) return [start, end].filter((v, i, a) => i === 0 || v !== a[i - 1]);
  let bestIndex = -1;
  let bestError = -1;
  for (let i = start + 1; i < end; i++) {
    const t = (i - start) / (end - start);
    const expected = lerpRgba(samples[start], samples[end], t);
    const error = rgbaDistance(samples[i], expected);
    if (error > bestError) {
      bestError = error;
      bestIndex = i;
    }
  }
  if (bestError <= tolerance) return [start, end];
  const left = rdpIndices(samples, start, bestIndex, tolerance);
  const right = rdpIndices(samples, bestIndex, end, tolerance);
  return [...left.slice(0, -1), ...right];
}

function offsetFor(index, length) {
  // SVG gradients are evaluated over the region's bounding box. Source samples
  // represent pixel-cell averages, so anchor each sample at its cell center.
  return length <= 0 ? 0 : (index + 0.5) / length;
}

export function simplifySamples(samples, {
  tolerance = 0,
  edgeThreshold = 96,
  preserveEdges = true
} = {}) {
  if (!samples.length) return [];
  if (samples.length === 1) return [{ offset: 0, color: [...samples[0]] }];

  const boundaries = [];
  if (preserveEdges) {
    for (let i = 1; i < samples.length; i++) {
      if (rgbaDistance(samples[i - 1], samples[i]) >= edgeThreshold) boundaries.push(i);
    }
  }

  if (!boundaries.length) {
    return rdpIndices(samples, 0, samples.length - 1, tolerance)
      .map(i => ({ offset: offsetFor(i, samples.length), color: [...samples[i]] }));
  }

  const out = [];
  let segStart = 0;
  const cuts = [...boundaries, samples.length];
  for (const cut of cuts) {
    const segEnd = cut - 1;
    if (segEnd >= segStart) {
      const ids = rdpIndices(samples, segStart, segEnd, tolerance);
      for (const id of ids) {
        const stop = { offset: offsetFor(id, samples.length), color: [...samples[id]] };
        const prev = out.at(-1);
        if (!prev || prev.offset !== stop.offset || rgbaDistance(prev.color, stop.color) > 0) out.push(stop);
      }
    }
    if (cut < samples.length) {
      // Pair both colors at the midpoint to create a true hard edge without a
      // blended band. Duplicate SVG gradient offsets are valid and compact.
      const boundaryOffset = cut / samples.length;
      out.push({ offset: boundaryOffset, color: [...samples[cut - 1]] });
      out.push({ offset: boundaryOffset, color: [...samples[cut]] });
      segStart = cut;
    }
  }

  if (out[0].offset !== 0) out.unshift({ offset: 0, color: [...samples[0]] });
  if (out.at(-1).offset !== 1) out.push({ offset: 1, color: [...samples.at(-1)] });
  return out;
}

export function stopsSignature(stops, precision = 4) {
  return stops.map(s => {
    const o = Number(s.offset.toFixed(precision));
    return `${o}:${s.color.map(v => Math.round(v)).join('.')}`;
  }).join('|');
}

export function sampleStops(stops, t) {
  if (!stops.length) return [0, 0, 0, 0];
  if (stops.length === 1 || t <= stops[0].offset) return [...stops[0].color];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    const a = stops[i - 1];
    if (t <= b.offset) {
      if (b.offset === a.offset) return [...b.color];
      const local = (t - a.offset) / (b.offset - a.offset);
      return lerpRgba(a.color, b.color, local);
    }
  }
  return [...stops.at(-1).color];
}
