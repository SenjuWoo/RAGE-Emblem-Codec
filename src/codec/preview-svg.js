const VIEWBOX = 'viewBox="0 0 512 512"';
const ASPECT = 'preserveAspectRatio="xMidYMid meet"';

function patchOpenTag(open, attr) {
  const name = attr.split('=')[0];
  if (new RegExp(`\\s${name}\\s*=`).test(open)) return open;
  return `${open} ${attr}`;
}

export function withPreviewViewBox(svg) {
  if (typeof svg !== 'string') return svg;
  const start = svg.indexOf('<svg');
  if (start < 0) return svg;
  const end = svg.indexOf('>', start);
  if (end < 0) return svg;
  let open = svg.slice(start, end);
  open = patchOpenTag(open, VIEWBOX);
  open = patchOpenTag(open, ASPECT);
  return svg.slice(0, start) + open + svg.slice(end);
}
