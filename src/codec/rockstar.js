import { alpha01, rgbaToHex } from './color.js';
import { stopsSignature } from './gradient.js';
import { measurePayload } from './payload.js';

export const ROCKSTAR = Object.freeze({
  canvas: 512,
  slug: 'rectangles/21',
  slugName: '21',
  slugWidth: 66.47,
  slugHeight: 300,
  pathWidth: 66.437,
  pathHeight: 300,
  slugPath: 'M0,0H66.437V300H0V148.125C0,148.125,0.04,147.744,0,147.625C-0.063,147.437,0,147.062,0,147.062V0Z'
});

function fmt(n, precision = 3) {
  if (!Number.isFinite(n)) return '0';
  const v = Number(n.toFixed(precision));
  return Object.is(v, -0) ? '0' : String(v);
}

function backgroundLayer() {
  return {
    id: 'background', name: 'Background', type: 'square', y: 0, x: 0,
    scaleY: 100, scaleX: 100, invertedY: false, invertedX: false,
    rotation: 0, opacity: 100, index: 0, color: '#transparent',
    isFilled: true, internal: true, locked: false, tBold: false,
    tItalic: false, fontFamily: null, borderColor: '#a1a1a1', borderSize: 0,
    gradientStyle: 'Fill', slug: 'rectangles/square', width: 512, height: 512
  };
}

function contentLayer(index, x, y, w, h, precision) {
  const sx = (w / ROCKSTAR.slugWidth) * 100;
  const sy = (h / ROCKSTAR.slugHeight) * 100;
  const editorX = x - (ROCKSTAR.slugWidth - w) / 2;
  const editorY = y - (ROCKSTAR.slugHeight - h) / 2;
  return {
    id: `s${index}`, name: ROCKSTAR.slugName, type: 'path',
    y: Number(fmt(editorY, precision)), x: Number(fmt(editorX, precision)),
    scaleY: Math.max(1, Number(fmt(sy, precision))),
    scaleX: Math.max(1, Number(fmt(sx, precision))),
    invertedY: 0, invertedX: 0, rotation: 0, opacity: 100, index,
    color: '#000', isFilled: 1, internal: 0, locked: 0, tBold: 0,
    tItalic: 0, fontFamily: null, borderColor: '#0', borderSize: 0,
    gradientStyle: 'Fill', slug: ROCKSTAR.slug,
    width: ROCKSTAR.slugWidth, height: ROCKSTAR.slugHeight
  };
}

function gradientXml(id, stops, axis, precision, shortHex) {
  const orient = axis === 'y' ? ' x2="0" y2="1"' : '';
  const body = stops.map(stop => {
    const color = rgbaToHex(stop.color, shortHex);
    const opacity = alpha01(stop.color[3], 3);
    const a = opacity < 1 ? ` stop-opacity="${fmt(opacity, 3)}"` : '';
    return `<stop offset="${fmt(stop.offset, precision)}" stop-color="${color}"${a}/>`;
  }).join('');
  return `<linearGradient id="${id}"${orient}>${body}</linearGradient>`;
}

function serializedColor(color) {
  const opacity = alpha01(color[3], 3);
  return [color[0], color[1], color[2], opacity * 255];
}

function serializedStops(stops, precision) {
  return stops.map(stop => ({
    offset: Number(fmt(stop.offset, precision)),
    color: serializedColor(stop.color)
  }));
}

export function serializeRegions(model, { precision = 3, bits = 8 } = {}) {
  const defs = [];
  const paths = [];
  const layers = [backgroundLayer()];
  const gradientIds = new Map();
  const renderRegions = [];
  let nextGradient = 0;
  let layerIndex = 0;
  const scaleX = ROCKSTAR.canvas / model.width;
  const scaleY = ROCKSTAR.canvas / model.height;
  const shortHex = bits <= 4;
  // Matrix scale values can be tiny (1px / 300 = 0.003333...). Rounding
  // them to 3 decimals visibly thins strips. Keep scale precision high while
  // retaining the user-selected compact precision for positions/stops/layers.
  const scalePrecision = Math.max(5, precision);

  for (const region of model.regions) {
    if (region.type === 'transparent') continue;
    const x = region.x * scaleX;
    const y = region.y * scaleY;
    const w = region.w * scaleX;
    const h = region.h * scaleY;
    let fill;

    if (region.type === 'solid') {
      fill = rgbaToHex(region.color, shortHex);
      const opacity = alpha01(region.color[3], 3);
      const a = opacity < 1 ? ` fill-opacity="${fmt(opacity, 3)}"` : '';
      paths.push(`<path fill="${fill}"${a} d="${ROCKSTAR.slugPath}" transform="matrix(${fmt(w / ROCKSTAR.pathWidth, scalePrecision)},0,0,${fmt(h / ROCKSTAR.pathHeight, scalePrecision)},${fmt(x, precision)},${fmt(y, precision)})"/>`);
      renderRegions.push({ ...region, color: serializedColor(region.color) });
    } else {
      const axis = region.type === 'gradient-y' ? 'y' : 'x';
      const sig = `${axis}:${stopsSignature(region.stops, precision)}:${shortHex ? 1 : 0}`;
      let gid = gradientIds.get(sig);
      if (!gid) {
        gid = `g${(nextGradient++).toString(36)}`;
        gradientIds.set(sig, gid);
        defs.push(gradientXml(gid, region.stops, axis, precision, shortHex));
      }
      fill = `url(#${gid})`;
      paths.push(`<path fill="${fill}" d="${ROCKSTAR.slugPath}" transform="matrix(${fmt(w / ROCKSTAR.pathWidth, scalePrecision)},0,0,${fmt(h / ROCKSTAR.pathHeight, scalePrecision)},${fmt(x, precision)},${fmt(y, precision)})"/>`);
      renderRegions.push({ ...region, stops: serializedStops(region.stops, precision) });
    }

    layers.push(contentLayer(layerIndex++, x, y, w, h, precision));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" version="1.1"><defs>${defs.join('')}</defs><rect x="0" y="0" width="512" height="512" fill="none" stroke="#a1a1a1" fill-opacity="1" stroke-opacity="0" stroke-width="0" stroke-miterlimit="10"/>${paths.join('')}</svg>`;
  const layersJson = JSON.stringify(layers);
  const payload = measurePayload(svg, layersJson);
  return { svg, layersJson, payload, renderModel: { width: model.width, height: model.height, regions: renderRegions }, stats: { layers: layerIndex, gradients: defs.length } };
}
