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
      // 100% so the SVG fills its parent (.canvas-shadow). Using
      // page.w / page.h as fixed sizes here makes iOS Safari ignore
      // the CSS `width: 100%` override and render the SVG at 1100×850
      // regardless of shadow size — exactly the bug PR #66's overlay-
      // layer fix tried to address. viewBox handles internal scaling
      // independently of these outer dimensions.
      width: '100%',
      height: '100%',
      viewBox: `0 0 ${page.w} ${page.h}`,
      preserveAspectRatio: 'none',
      xmlns: SVG_NS,
    });

    // Defs (arrow markers + grid pattern)
    const defs = el('defs', null, svg);
    // Wave 3: extra arrow-head markers. Each marker uses
    // fill / stroke = context-stroke so the head inherits the
    // connector's color. `arr` is the original closed-triangle
    // head; the rest are wave-3 additions.
    defs.innerHTML =
      '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/>' +
      '</marker>' +
      '<marker id="arr-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10" fill="none" stroke="context-stroke" stroke-width="1.5"/>' +
      '</marker>' +
      '<marker id="arr-diamond" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,5 L6,0 L12,5 L6,10 z" fill="context-stroke"/>' +
      '</marker>' +
      '<marker id="arr-circle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
        '<circle cx="5" cy="5" r="4" fill="context-stroke"/>' +
      '</marker>' +
      '<marker id="arr-bar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
        '<path d="M9,0 L9,10" stroke="context-stroke" stroke-width="2"/>' +
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
    renderDataGraphicsOverlay(shape, g);
    renderShapeIndicators(shape, g);
    return g;
  }

  // Hyperlink / comment indicator badges in the top-right corner.
  function renderShapeIndicators(shape, g) {
    const has = (Array.isArray(shape.hyperlinks) && shape.hyperlinks.length)
             || (Array.isArray(shape.comments)   && shape.comments.length);
    if (!has) return;
    const cx = shape.w - 6;
    const cy = 8;
    if (Array.isArray(shape.comments) && shape.comments.length) {
      const c = el('circle', {
        cx, cy, r: 5, fill: '#f59e0b', stroke: '#fff', 'stroke-width': 1,
        class: 'shape-indicator comment',
      }, g);
      const t = el('text', {
        x: cx, y: cy + 3,
        'font-family': 'Segoe UI, sans-serif', 'font-size': 8,
        fill: '#fff', 'text-anchor': 'middle',
        'pointer-events': 'none',
      }, g);
      t.textContent = String(shape.comments.length);
    }
    if (Array.isArray(shape.hyperlinks) && shape.hyperlinks.length) {
      const x = cx - (shape.comments?.length ? 14 : 0);
      el('circle', {
        cx: x, cy, r: 5, fill: '#3b82f6', stroke: '#fff', 'stroke-width': 1,
        class: 'shape-indicator hyperlink',
      }, g);
      const t = el('text', {
        x, y: cy + 3,
        'font-family': 'Segoe UI, sans-serif', 'font-size': 8,
        fill: '#fff', 'text-anchor': 'middle',
        'pointer-events': 'none',
      }, g);
      t.textContent = '↗';
    }
  }

  // Data graphics overlay: re-tint background, draw a corner icon, or
  // overlay a bar based on a numeric field. Driven by the diagram-level
  // dataGraphics config exposed via window.RodmanRender.dataGraphicsCfg.
  function renderDataGraphicsOverlay(shape, g) {
    const cfg = window.RodmanRender && window.RodmanRender.dataGraphicsCfg;
    if (!cfg || !cfg.field) return;
    const entry = shape.data && shape.data[cfg.field];
    if (!entry) return;
    const value = entry.value != null ? entry.value : entry;
    if (cfg.mode === 'color' && cfg.palette) {
      const color = cfg.palette[String(value)] || pickColorByHash(String(value), cfg.fallback || ['#fef3c7', '#dbeafe', '#dcfce7', '#fee2e2', '#fae8ff']);
      // Overlay a translucent recolor rectangle.
      el('rect', {
        x: 0, y: 0, width: shape.w, height: shape.h,
        fill: color, opacity: 0.5,
        'pointer-events': 'none',
        class: 'data-graphic color',
      }, g);
    } else if (cfg.mode === 'icon' && cfg.iconMap) {
      const icon = cfg.iconMap[String(value)] || '•';
      const t = el('text', {
        x: 8, y: shape.h - 6,
        'font-family': 'Segoe UI, sans-serif', 'font-size': 14,
        fill: cfg.iconColor || '#0f172a',
        class: 'data-graphic icon',
        'pointer-events': 'none',
      }, g);
      t.textContent = icon;
    } else if (cfg.mode === 'bar') {
      const num = parseFloat(value);
      if (!isFinite(num)) return;
      const max = cfg.max || 100;
      const min = cfg.min || 0;
      const pct = Math.max(0, Math.min(1, (num - min) / (max - min)));
      el('rect', {
        x: 4, y: 2, width: Math.max(2, (shape.w - 8) * pct), height: 6,
        fill: cfg.barColor || '#0ea5e9',
        class: 'data-graphic bar',
        'pointer-events': 'none',
      }, g);
      el('rect', {
        x: 4, y: 2, width: shape.w - 8, height: 6,
        fill: 'none', stroke: cfg.barColor || '#0ea5e9', 'stroke-width': 0.5, opacity: 0.5,
        'pointer-events': 'none',
      }, g);
    }
  }

  function pickColorByHash(s, palette) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
  }

  function renderShapeText(shape, parent) {
    const ts = shape.textStyle || {};
    const fontSize = ts.fontSize || 14;
    const lineHeight = fontSize * 1.2;
    // Bullet / numbered list pre-processing: lines that start with
    // `- `, `* `, or `N. ` render with a bullet glyph / number.
    // Auto-numbering tracks across consecutive numbered lines.
    let numCount = 0;
    const lines = String(shape.text).split('\n').map((raw) => {
      if (/^\s*[-*]\s+/.test(raw)) {
        numCount = 0;
        return { prefix: '• ', body: raw.replace(/^\s*[-*]\s+/, '') };
      }
      if (/^\s*\d+\.\s+/.test(raw)) {
        numCount++;
        return { prefix: `${numCount}. `, body: raw.replace(/^\s*\d+\.\s+/, '') };
      }
      numCount = 0;
      return { prefix: '', body: raw };
    });
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
      // Light Markdown-style per-character rich text: **bold** and *italic*
      // segments become <tspan> children with the corresponding font
      // weight / style.
      const full = line.prefix + line.body;
      const runs = parseRichRuns(full);
      if (runs.length === 1 && !runs[0].bold && !runs[0].italic) {
        t.textContent = runs[0].text;
      } else {
        for (const r of runs) {
          const ts2 = el('tspan', {}, t);
          if (r.bold) ts2.setAttribute('font-weight', '700');
          if (r.italic) ts2.setAttribute('font-style', 'italic');
          ts2.textContent = r.text;
        }
      }
    });
  }

  // Parse a line into { text, bold, italic } runs. Recognises
  // **bold** and *italic* (no nesting). Defensive against mismatched
  // markers — extras render as literal characters.
  function parseRichRuns(line) {
    const runs = [];
    let bold = false, italic = false, buf = '';
    function flush() { if (buf) runs.push({ text: buf, bold, italic }); buf = ''; }
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '*' && line[i + 1] === '*') {
        flush(); bold = !bold; i++;
      } else if (line[i] === '*') {
        flush(); italic = !italic;
      } else {
        buf += line[i];
      }
    }
    flush();
    return runs.length ? runs : [{ text: line, bold: false, italic: false }];
  }

  function renderConnector(conn, page, parent, layerOpacity) {
    const fromShape = page.shapes.find((s) => s.id === conn.fromShapeId);
    const toShape = page.shapes.find((s) => s.id === conn.toShapeId);
    if (!fromShape || !toShape) return null;

    const a = portPoint(fromShape, conn.fromPort);
    const b = portPoint(toShape, conn.toPort);
    const route = conn.routeStyle || 'orthogonal';
    const wp = Array.isArray(conn.waypoints) ? conn.waypoints : [];
    let d;
    if (route === 'straight') {
      d = `M${a.x},${a.y} L${b.x},${b.y}`;
    } else if (route === 'curved') {
      const dx = b.x - a.x;
      d = `M${a.x},${a.y} C${a.x + dx * 0.4},${a.y} ${b.x - dx * 0.4},${b.y} ${b.x},${b.y}`;
    } else if (route === 'tree') {
      const midX = (a.x + b.x) / 2;
      d = `M${a.x},${a.y} L${midX},${a.y} L${midX},${b.y} L${b.x},${b.y}`;
    } else if (wp.length) {
      // Orthogonal with user-placed waypoints.
      d = `M${a.x},${a.y}` + wp.map((p) => ` L${p.x},${p.y}`).join('') + ` L${b.x},${b.y}`;
    } else {
      d = orthogonalPath(a, b, conn.fromPort, conn.toPort);
    }

    const g = el('g', {
      class: 'connector',
      'data-connector-id': conn.id,
      opacity: (layerOpacity ?? 1),
    }, parent);

    const stroke = conn.stroke || '#444';
    const sw = conn.strokeWidth || 1.5;
    const dashAttr = lineStyleDash(conn.lineStyle, sw);

    const lineAttrs = {
      d,
      fill: 'none',
      stroke,
      'stroke-width': sw,
      class: 'connector-path',
    };
    if (dashAttr) lineAttrs['stroke-dasharray'] = dashAttr;
    // Wave 3: per-end arrow-head choice. `endStart` / `endEnd` may
    // be 'arrow' (default closed triangle), 'open', 'diamond',
    // 'circle', 'bar', or 'none'. Legacy 'arrow' still works.
    const markerForEnd = (kind) => {
      switch (kind) {
        case 'arrow': return 'url(#arr)';
        case 'open': return 'url(#arr-open)';
        case 'diamond': return 'url(#arr-diamond)';
        case 'circle': return 'url(#arr-circle)';
        case 'bar': return 'url(#arr-bar)';
        default: return null;
      }
    };
    const ms = markerForEnd(conn.endStart);
    const me = markerForEnd(conn.endEnd);
    if (ms) lineAttrs['marker-start'] = ms;
    if (me) lineAttrs['marker-end'] = me;

    el('path', lineAttrs, g);

    // Double-line: render a second offset path. Quick approximation —
    // not a true parallel offset, but matches the visual of double-rule
    // borders close enough for diagram use.
    if (conn.lineStyle === 'double') {
      el('path', { d, fill: 'none', stroke, 'stroke-width': Math.max(1, sw + 2), opacity: 0.4 }, g);
    }

    // Wider invisible hit path for easier clicking
    el('path', {
      d,
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': 12,
      class: 'connector-hit',
    }, g);

    // Wave 3: label position. labelPos in 'src' | 'mid' | 'dst'
    // controls where label + text2 anchor along the connector.
    if (conn.label || conn.text2) {
      const pos = conn.labelPos === 'src' ? 0.2
                 : conn.labelPos === 'dst' ? 0.8
                 : 0.5;
      const lx = a.x + (b.x - a.x) * pos;
      const ly = a.y + (b.y - a.y) * pos;
      if (conn.label) {
        const t = el('text', {
          x: lx, y: ly - 4,
          'font-family': 'Segoe UI, sans-serif',
          'font-size': 11,
          fill: conn.stroke || '#444',
          'text-anchor': 'middle',
          class: 'connector-label',
          'pointer-events': 'none',
        }, g);
        t.textContent = conn.label;
      }
      if (conn.text2) {
        const t2 = el('text', {
          x: lx, y: ly + 10,
          'font-family': 'Segoe UI, sans-serif',
          'font-size': 10,
          fill: conn.stroke || '#888',
          'text-anchor': 'middle',
          class: 'connector-sublabel',
          'pointer-events': 'none',
        }, g);
        t2.textContent = conn.text2;
      }
    }

    return g;
  }

  function lineStyleDash(style, sw) {
    switch (style) {
      case 'dashed': return `${sw * 3} ${sw * 2}`;
      case 'dotted': return `${sw} ${sw * 1.5}`;
      case 'double': return null;
      default: return null;
    }
  }

  function portPoint(shape, port) {
    // Custom ports are stored as fractional offsets in [0..1] and
    // addressed as "custom:<index>".
    if (typeof port === 'string' && port.startsWith('custom:')) {
      const idx = parseInt(port.slice(7), 10);
      const custom = shape.customPorts && shape.customPorts[idx];
      if (custom) {
        return {
          x: shape.x + custom.fx * shape.w,
          y: shape.y + custom.fy * shape.h,
        };
      }
    }
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
    // Live data-graphics config the app sets before re-rendering.
    dataGraphicsCfg: null,
  };
})();
