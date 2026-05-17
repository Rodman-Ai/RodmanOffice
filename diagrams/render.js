// RodmanVision — DOM renderer for the editor canvas.
//
// We don't render via the engine's exportSvg() here because the
// editor needs interactive overlays (selection handles, port dots,
// hover ports) that don't belong in the export output. Instead we
// build live SVG elements and update them per state change.
//
// Single global: window.RodmanRender.

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STENCILS = window.RodmanStencils;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function renderPage(page, layers, opts = {}) {
    const layerMap = new Map((layers || []).map((l) => [l.id, l]));
    const visible = (id) => {
      const l = layerMap.get(id);
      return !l || l.visible;
    };
    const opacity = (id) => {
      const l = layerMap.get(id);
      return l ? l.opacity : 1;
    };
    const svg = el('svg', {
      class: 'canvas-svg',
      width: page.w,
      height: page.h,
      viewBox: `0 0 ${page.w} ${page.h}`,
      xmlns: SVG_NS,
    });

    // Defs (arrow markers + grid pattern)
    const defs = el('defs', null, svg);
    defs.innerHTML =
      '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/>' +
      '</marker>' +
      '<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">' +
        '<path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" stroke-width="1"/>' +
      '</pattern>';

    // Page background + grid
    el('rect', { x: 0, y: 0, width: page.w, height: page.h, fill: page.bg || '#ffffff' }, svg);
    if (opts.showGrid) {
      el('rect', { x: 0, y: 0, width: page.w, height: page.h, fill: 'url(#grid)' }, svg);
    }

    // Shapes
    const shapesG = el('g', { class: 'shapes-layer' }, svg);
    for (const shape of page.shapes) {
      if (!visible(shape.layerId)) continue;
      renderShape(shape, shapesG, opacity(shape.layerId));
    }

    // Connectors (above shapes so arrowheads aren't covered)
    const connsG = el('g', { class: 'conns-layer' }, svg);
    for (const conn of page.connectors) {
      if (!visible(conn.layerId)) continue;
      renderConnector(conn, page, connsG, opacity(conn.layerId));
    }

    return svg;
  }

  function renderShape(shape, parent, layerOpacity) {
    const transforms = [`translate(${shape.x},${shape.y})`];
    if (shape.rotation) transforms.push(`rotate(${shape.rotation} ${shape.w / 2} ${shape.h / 2})`);
    if (shape.flipH || shape.flipV) {
      const sx = shape.flipH ? -1 : 1;
      const sy = shape.flipV ? -1 : 1;
      // Scale around the shape's center: move center → origin, scale, move back.
      transforms.push(`translate(${shape.w / 2},${shape.h / 2})`);
      transforms.push(`scale(${sx},${sy})`);
      transforms.push(`translate(${-shape.w / 2},${-shape.h / 2})`);
    }
    const g = el('g', {
      class: 'shape',
      'data-shape-id': shape.id,
      transform: transforms.join(' '),
      opacity: (shape.opacity ?? 1) * (layerOpacity ?? 1),
    }, parent);

    // Native tooltip — stencil name + dimensions (+ shape data summary in later phases)
    if (window.RodmanStencils) {
      const stDef = window.RodmanStencils.getStencil(shape.stencil || 'rectangle');
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${stDef.name} • ${Math.round(shape.w)}×${Math.round(shape.h)}`;
      g.appendChild(title);
    }

    const st = STENCILS.getStencil(shape.stencil || 'rectangle');
    const body = st.draw(shape.w, shape.h);
    const fill = shape.fill || '#ffffff';
    const stroke = shape.stroke || '#000000';
    const sw = shape.strokeWidth ?? 1;

    // The stencil draw() returns raw SVG markup; we inject it and
    // then walk the children to apply fill/stroke. setAttribute on
    // the root <g> won't propagate to children defined inline.
    g.innerHTML += body;
    for (const child of Array.from(g.children)) {
      if (child.tagName === 'rect' || child.tagName === 'polygon' ||
          child.tagName === 'ellipse' || child.tagName === 'circle' ||
          child.tagName === 'path') {
        if (!child.getAttribute('fill') || child.getAttribute('fill') === '') {
          child.setAttribute('fill', fill);
        }
        if (!child.getAttribute('stroke')) {
          child.setAttribute('stroke', stroke);
        }
        if (!child.getAttribute('stroke-width')) {
          child.setAttribute('stroke-width', String(sw));
        }
      } else if (child.tagName === 'line') {
        child.setAttribute('stroke', stroke);
        child.setAttribute('stroke-width', String(sw));
      }
    }

    if (shape.text) renderShapeText(shape, g);
    return g;
  }

  function renderShapeText(shape, parent) {
    const ts = shape.textStyle || {};
    const fontSize = ts.fontSize || 14;
    const lineHeight = fontSize * 1.2;
    const lines = String(shape.text).split('\n');
    const totalH = lineHeight * lines.length;
    const startY = shape.h / 2 - totalH / 2 + fontSize * 0.85;
    const align = ts.align || 'center';
    const x = align === 'left' ? 6 : align === 'right' ? shape.w - 6 : shape.w / 2;
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
    lines.forEach((line, i) => {
      const t = el('text', {
        x, y: startY + i * lineHeight,
        'font-family': ts.fontFamily || 'Segoe UI, sans-serif',
        'font-size': fontSize,
        'font-weight': ts.bold ? '700' : '400',
        'font-style': ts.italic ? 'italic' : 'normal',
        fill: ts.color || '#000000',
        'text-anchor': anchor,
        class: 'shape-text',
        'pointer-events': 'none',
      }, parent);
      t.textContent = line;
    });
  }

  function renderConnector(conn, page, parent, layerOpacity) {
    const fromShape = page.shapes.find((s) => s.id === conn.fromShapeId);
    const toShape = page.shapes.find((s) => s.id === conn.toShapeId);
    if (!fromShape || !toShape) return null;

    const a = portPoint(fromShape, conn.fromPort);
    const b = portPoint(toShape, conn.toPort);
    const d = orthogonalPath(a, b, conn.fromPort, conn.toPort);

    const g = el('g', {
      class: 'connector',
      'data-connector-id': conn.id,
      opacity: (layerOpacity ?? 1),
    }, parent);

    el('path', {
      d,
      fill: 'none',
      stroke: conn.stroke || '#444',
      'stroke-width': conn.strokeWidth || 1.5,
      class: 'connector-path',
      ...(conn.endStart === 'arrow' ? { 'marker-start': 'url(#arr)' } : {}),
      ...(conn.endEnd === 'arrow' ? { 'marker-end': 'url(#arr)' } : {}),
    }, g);

    // Wider invisible hit path for easier clicking
    el('path', {
      d,
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': 12,
      class: 'connector-hit',
    }, g);

    if (conn.label) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const t = el('text', {
        x: mx, y: my - 4,
        'font-family': 'Segoe UI, sans-serif',
        'font-size': 11,
        fill: conn.stroke || '#444',
        'text-anchor': 'middle',
        class: 'connector-label',
        'pointer-events': 'none',
      }, g);
      t.textContent = conn.label;
    }

    return g;
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

  function orthogonalPath(a, b, fromPort, toPort) {
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

  function renderStencilThumb(stencil, size = 32) {
    const svg = el('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
    const g = el('g', { transform: `translate(2,2)` }, svg);
    g.innerHTML = stencil.draw(size - 4, size - 4);
    for (const child of Array.from(g.children)) {
      if (!child.getAttribute('fill') || child.getAttribute('fill') === '') {
        child.setAttribute('fill', '#DAE3F3');
      }
      if (!child.getAttribute('stroke')) child.setAttribute('stroke', '#2E5597');
      if (!child.getAttribute('stroke-width')) child.setAttribute('stroke-width', '1');
    }
    return svg;
  }

  window.RodmanRender = {
    renderPage, renderShape, renderConnector,
    portPoint, orthogonalPath,
    renderStencilThumb,
  };
})();
