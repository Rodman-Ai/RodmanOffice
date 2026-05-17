// Diagram → SVG string. One <svg> per page concatenated with <g>
// transforms; downstream PNG/PDF exporters reuse this output.

import { getStencil } from './stencils.js';

export function exportSvg(diagram, opts = {}) {
  const single = opts.pageIndex != null
    ? [diagram.pages[opts.pageIndex]]
    : diagram.pages;

  if (single.length === 1) {
    return renderPageSvg(single[0], diagram.layers || []);
  }

  // Multiple pages → stack vertically with a gap so the result is a
  // single self-contained SVG suitable for download.
  const gap = 32;
  let totalH = 0;
  let maxW = 0;
  const parts = single.map((page) => {
    const y = totalH;
    totalH += page.h + gap;
    if (page.w > maxW) maxW = page.w;
    const body = renderPageBody(page, diagram.layers || []);
    return `<g transform="translate(0, ${y})">` +
             `<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="${escAttr(page.bg || '#ffffff')}" />` +
             body +
           `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}" height="${totalH - gap}" viewBox="0 0 ${maxW} ${totalH - gap}">${parts}</svg>`;
}

function renderPageSvg(page, layers) {
  const body = renderPageBody(page, layers);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.w}" height="${page.h}" viewBox="0 0 ${page.w} ${page.h}">` +
           `<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="${escAttr(page.bg || '#ffffff')}" />` +
           body +
         `</svg>`;
}

function renderPageBody(page, layers) {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  function visible(layerId) {
    const l = layerMap.get(layerId);
    return !l || l.visible;
  }
  function opacity(layerId) {
    const l = layerMap.get(layerId);
    return l ? l.opacity : 1;
  }

  // Shapes first, then connectors on top (so arrows aren't hidden).
  const shapeSvg = (page.shapes || []).filter((s) => visible(s.layerId)).map((s) =>
    renderShape(s, opacity(s.layerId))
  ).join('');
  const connSvg = (page.connectors || []).filter((c) => visible(c.layerId)).map((c) =>
    renderConnector(c, page, opacity(c.layerId))
  ).join('');

  return `<defs>` +
    `<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/>` +
    `</marker>` +
  `</defs>` + shapeSvg + connSvg;
}

export function renderShape(shape, layerOpacity = 1) {
  const st = getStencil(shape.stencil || 'rectangle');
  const body = st.draw(shape.w, shape.h);
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const transform = shape.rotation
    ? `translate(${shape.x},${shape.y}) rotate(${shape.rotation} ${shape.w / 2} ${shape.h / 2})`
    : `translate(${shape.x},${shape.y})`;

  const fill = escAttr(shape.fill || '#ffffff');
  const stroke = escAttr(shape.stroke || '#000000');
  const strokeWidth = shape.strokeWidth || 1;
  const opacity = (shape.opacity ?? 1) * layerOpacity;

  const styled = body
    .replace(/<(rect|polygon|ellipse|circle|path)/g, `<$1 fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"`)
    .replace(/<line/g, `<line stroke="${stroke}" stroke-width="${strokeWidth}"`);

  const ts = shape.textStyle || {};
  const text = shape.text ? renderText(shape, ts) : '';

  return `<g transform="${transform}" opacity="${opacity}">${styled}${text}</g>`;
}

function renderText(shape, ts) {
  const lines = String(shape.text).split('\n');
  const fontSize = ts.fontSize || 14;
  const lineHeight = fontSize * 1.2;
  const totalH = lineHeight * lines.length;
  const startY = shape.h / 2 - totalH / 2 + fontSize * 0.85;
  const align = ts.align || 'center';
  const x = align === 'left' ? 6 : align === 'right' ? shape.w - 6 : shape.w / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const ff = ts.fontFamily ? escAttr(ts.fontFamily) : 'Segoe UI, sans-serif';
  const color = escAttr(ts.color || '#000000');
  const weight = ts.bold ? '700' : '400';
  const style = ts.italic ? 'italic' : 'normal';

  return lines.map((line, i) =>
    `<text x="${x}" y="${startY + i * lineHeight}" font-family="${ff}" font-size="${fontSize}" ` +
    `font-weight="${weight}" font-style="${style}" fill="${color}" text-anchor="${anchor}">${escXml(line)}</text>`
  ).join('');
}

function renderConnector(conn, page, layerOpacity = 1) {
  const fromShape = page.shapes.find((s) => s.id === conn.fromShapeId);
  const toShape = page.shapes.find((s) => s.id === conn.toShapeId);
  if (!fromShape || !toShape) return '';

  const a = portPoint(fromShape, conn.fromPort);
  const b = portPoint(toShape, conn.toPort);
  const path = orthogonalPath(a, b, conn.fromPort, conn.toPort);

  const stroke = escAttr(conn.stroke || '#444');
  const sw = conn.strokeWidth || 1.5;
  const markerStart = conn.endStart === 'arrow' ? ' marker-start="url(#arr)"' : '';
  const markerEnd = conn.endEnd === 'arrow' ? ' marker-end="url(#arr)"' : '';

  let label = '';
  if (conn.label) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    label = `<text x="${mx}" y="${my - 4}" font-family="Segoe UI, sans-serif" font-size="11" fill="${stroke}" text-anchor="middle">${escXml(conn.label)}</text>`;
  }

  return `<g opacity="${layerOpacity}"><path d="${path}" fill="none" stroke="${stroke}" stroke-width="${sw}"${markerStart}${markerEnd} />${label}</g>`;
}

function portPoint(shape, port) {
  switch (port) {
    case 'top':    return { x: shape.x + shape.w / 2, y: shape.y };
    case 'right':  return { x: shape.x + shape.w,     y: shape.y + shape.h / 2 };
    case 'bottom': return { x: shape.x + shape.w / 2, y: shape.y + shape.h };
    case 'left':   return { x: shape.x,               y: shape.y + shape.h / 2 };
    default:       return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  }
}

// Build a 3-segment orthogonal path from a to b. Direction of the
// first segment matches the source port; last segment matches the
// destination port. Good enough for any "left/right/top/bottom"
// port combination.
export function orthogonalPath(a, b, fromPort, toPort) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const horiz = (port) => port === 'left' || port === 'right';
  if (horiz(fromPort) && horiz(toPort)) {
    return `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
  }
  if (!horiz(fromPort) && !horiz(toPort)) {
    return `M${a.x},${a.y} L${a.x},${my} L${b.x},${my} L${b.x},${b.y}`;
  }
  if (horiz(fromPort) && !horiz(toPort)) {
    return `M${a.x},${a.y} L${b.x},${a.y} L${b.x},${b.y}`;
  }
  return `M${a.x},${a.y} L${a.x},${b.y} L${b.x},${b.y}`;
}

function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escAttr(s) {
  return escXml(s);
}
