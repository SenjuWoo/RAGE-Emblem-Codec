export function asciiBase64Length(asciiByteLength) {
  if (!asciiByteLength) return 0;
  return 4 * Math.ceil(asciiByteLength / 3);
}

export function utf8Length(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}

export function measurePayload(svg, layersJson, { hashReserve = 64 } = {}) {
  const svgBytes = utf8Length(svg);
  const layersBytes = utf8Length(layersJson);
  const svgBase64Bytes = asciiBase64Length(svgBytes);
  const layersBase64Bytes = asciiBase64Length(layersBytes);
  const base64DataBytes = svgBase64Bytes + layersBase64Bytes;
  // Body shape mirrors the Rockstar request. The live page supplies hash at send time.
  const bodySkeleton = JSON.stringify({
    crewId: '0', emblemId: '', parentId: '',
    svgData: 'S'.repeat(svgBase64Bytes),
    layerData: 'L'.repeat(layersBase64Bytes),
    hash: 'H'.repeat(hashReserve)
  });
  return {
    svgBytes,
    layersBytes,
    svgBase64Bytes,
    layersBase64Bytes,
    base64DataBytes,
    estimatedRequestBytes: utf8Length(bodySkeleton)
  };
}
