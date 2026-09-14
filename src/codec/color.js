export function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function quantizeByte(value, bits = 8) {
  const b = Math.max(1, Math.min(8, Math.round(bits)));
  if (b === 8) return clampByte(value);
  const levels = (1 << b) - 1;
  const q = Math.round((clampByte(value) / 255) * levels);
  return Math.round((q / levels) * 255);
}

export function quantizeRgba(rgba, bits = 8, alphaBits = 8) {
  return [
    quantizeByte(rgba[0], bits),
    quantizeByte(rgba[1], bits),
    quantizeByte(rgba[2], bits),
    quantizeByte(rgba[3], alphaBits)
  ];
}

export function rgbaDistance(a, b) {
  // Compare visible (premultiplied) RGB so hidden colors under zero/low alpha do
  // not consume optimization budget or create artificial edge importance.
  const aa = clampByte(a[3]) / 255;
  const ba = clampByte(b[3]) / 255;
  const dr = clampByte(a[0]) * aa - clampByte(b[0]) * ba;
  const dg = clampByte(a[1]) * aa - clampByte(b[1]) * ba;
  const db = clampByte(a[2]) * aa - clampByte(b[2]) * ba;
  const da = clampByte(a[3]) - clampByte(b[3]);
  // Green and alpha receive extra weight because luminance edges and transparency
  // errors are especially visible in crew emblems.
  return Math.sqrt(0.22 * dr * dr + 0.52 * dg * dg + 0.16 * db * db + 0.75 * da * da);
}

export function rgbaToHex(rgba, short = false) {
  const hex = rgba.slice(0, 3).map(v => clampByte(v).toString(16).padStart(2, '0')).join('');
  if (!short) return `#${hex}`;
  const q = rgba.slice(0, 3).map(v => Math.round(clampByte(v) / 17).toString(16));
  return `#${q.join('')}`;
}

export function alpha01(a, precision = 3) {
  return Number((clampByte(a) / 255).toFixed(precision));
}

export function lerpRgba(a, b, t) {
  return [0, 1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t);
}
