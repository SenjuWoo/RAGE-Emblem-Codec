export function makeImage(width, height, data) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions');
  }
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new Error('RGBA data length does not match image dimensions');
  }
  return { width, height, data };
}

export function pixelAt(image, x, y) {
  const xx = Math.max(0, Math.min(image.width - 1, x | 0));
  const yy = Math.max(0, Math.min(image.height - 1, y | 0));
  const i = (yy * image.width + xx) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

export function isFullyTransparent(image) {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0) return false;
  return true;
}
