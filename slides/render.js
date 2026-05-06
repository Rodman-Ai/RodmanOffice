// RodmanSlides — slide rendering, selection, drag, resize.
// Single global: window.RodmanRender.
(function () {
  'use strict';

  const HANDLE_SIZE = 10;
  const RESIZE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const TEXT_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'I', 'LI', 'OL',
    'P', 'PRE', 'S', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'UL',
  ]);
  const DROP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH',
    'LINK', 'META',
  ]);

  function sanitizeTextHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    for (const node of Array.from(template.content.querySelectorAll('*'))) {
      if (DROP_TAGS.has(node.tagName)) {
        node.remove();
        continue;
      }
      if (!TEXT_TAGS.has(node.tagName)) {
        const parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        node.remove();
        continue;
      }
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const keepHref = node.tagName === 'A' && name === 'href' && isSafeUrl(attr.value);
        const keepTarget = node.tagName === 'A' && name === 'target' && attr.value === '_blank';
        if (!keepHref && !keepTarget) node.removeAttribute(attr.name);
      }
      if (node.tagName === 'A') {
        node.rel = 'noopener noreferrer';
      }
    }
    return template.innerHTML;
  }

  function isSafeUrl(value) {
    if (String(value || '').trim().startsWith('#')) return true;
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
    } catch (e) {
      return false;
    }
  }

  // Render a slide into a container element. Container should be the
  // 1280x720 stage; this function clears it and re-creates element nodes.
  // `opts.selectedId` highlights one element; `opts.editable` enables drag/
  // resize/dblclick-to-edit; `opts.readonly` is the present-mode path.
  function renderSlide(container, slide, opts = {}) {
    container.innerHTML = '';
    container.style.background =
      slide.background && slide.background.kind === 'solid' && slide.background.color
        ? slide.background.color
        : 'var(--slide-bg)';
    container.style.fontFamily = 'var(--slide-font-body)';

    slide.elements.forEach((el) => {
      const node = renderElement(el, slide, opts);
      container.appendChild(node);
    });

    // Keep a reference for later DOM lookups
    container.dataset.slideId = slide.id;
  }

  function renderElement(el, slide, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'slide-element';
    wrap.dataset.elementId = el.id;
    wrap.dataset.kind = el.kind;
    Object.assign(wrap.style, {
      position: 'absolute',
      left: el.x + 'px',
      top: el.y + 'px',
      width: el.w + 'px',
      height: el.h + 'px',
      boxSizing: 'border-box',
    });

    // selectedIds (set/array) marks all selected elements with a
    // border; the primary (last-clicked) selectedId gets resize
    // handles. Both are optional.
    const selSet = opts.selectedIds
      ? (opts.selectedIds instanceof Set ? opts.selectedIds : new Set(opts.selectedIds))
      : (opts.selectedId ? new Set([opts.selectedId]) : new Set());
    const isSelected = selSet.has(el.id);
    const isPrimary = opts.selectedId === el.id;
    if (isSelected) wrap.classList.add('is-selected');
    if (isPrimary) wrap.classList.add('is-primary');
    if (el.href) wrap.dataset.href = el.href;

    if (el.kind === 'text') {
      renderTextInto(wrap, el);
    } else if (el.kind === 'shape') {
      renderShapeInto(wrap, el);
    } else if (el.kind === 'image') {
      renderImageInto(wrap, el);
    } else if (el.kind === 'video') {
      renderVideoInto(wrap, el);
    } else if (el.kind === 'table') {
      renderTableInto(wrap, el);
    }

    if (opts.editable && isPrimary) {
      addResizeHandles(wrap);
    }

    return wrap;
  }

  function renderTextInto(wrap, el) {
    const inner = document.createElement('div');
    inner.className = 'slide-text';
    inner.dataset.role = el.role || 'free';
    inner.contentEditable = 'false'; // toggled to true while editing
    inner.innerHTML = sanitizeTextHtml(el.html);

    const isTitle = el.role === 'title';
    const themeColor = isTitle ? 'var(--slide-title)' : 'var(--slide-body)';
    const themeFont = isTitle ? 'var(--slide-font-heading)' : 'var(--slide-font-body)';

    Object.assign(inner.style, {
      width: '100%',
      height: '100%',
      fontSize: (el.fontSize || 24) + 'px',
      fontWeight: (el.fontWeight || 400),
      textAlign: el.align || 'left',
      color: el.color || themeColor,
      fontFamily: el.fontFamily || themeFont,
      outline: 'none',
      overflow: 'hidden',
      lineHeight: String(el.lineHeight || 1.25),
      letterSpacing: (el.letterSpacing || 0) + 'px',
      whiteSpace: 'normal',
      wordWrap: 'break-word',
    });

    wrap.appendChild(inner);
  }

  function renderShapeInto(wrap, el) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${el.w} ${el.h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.display = 'block';
    svg.style.pointerEvents = 'none';

    const fill = el.fill || 'var(--slide-primary)';
    const stroke = el.stroke || 'transparent';
    const strokeWidth = el.strokeWidth || 0;

    let shape;
    if (el.shape === 'rect') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shape.setAttribute('x', '0'); shape.setAttribute('y', '0');
      shape.setAttribute('width', el.w); shape.setAttribute('height', el.h);
    } else if (el.shape === 'ellipse') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      shape.setAttribute('cx', el.w / 2); shape.setAttribute('cy', el.h / 2);
      shape.setAttribute('rx', el.w / 2); shape.setAttribute('ry', el.h / 2);
    } else if (el.shape === 'line') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      shape.setAttribute('x1', '0'); shape.setAttribute('y1', el.h / 2);
      shape.setAttribute('x2', el.w); shape.setAttribute('y2', el.h / 2);
      shape.setAttribute('stroke', fill);
      shape.setAttribute('stroke-width', Math.max(2, strokeWidth || 4));
      svg.appendChild(shape);
      wrap.appendChild(svg);
      return;
    } else if (el.shape === 'arrow') {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      const markerId = 'arrow-' + el.id;
      marker.setAttribute('id', markerId);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      path.setAttribute('fill', fill);
      marker.appendChild(path);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0'); line.setAttribute('y1', el.h / 2);
      line.setAttribute('x2', el.w - 10); line.setAttribute('y2', el.h / 2);
      line.setAttribute('stroke', fill);
      line.setAttribute('stroke-width', Math.max(2, strokeWidth || 4));
      line.setAttribute('marker-end', `url(#${markerId})`);
      svg.appendChild(line);
      wrap.appendChild(svg);
      return;
    } else if (el.shape === 'triangle') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      shape.setAttribute('points', `${el.w / 2},0 ${el.w},${el.h} 0,${el.h}`);
    } else if (el.shape === 'star') {
      // 5-point star inscribed in the bounding box
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const cx = el.w / 2, cy = el.h / 2;
      const ro = Math.min(el.w, el.h) / 2;
      const ri = ro * 0.5;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI / 5);
        const r = i % 2 === 0 ? ro : ri;
        pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
      }
      shape.setAttribute('points', pts.join(' '));
    } else if (el.shape === 'callout') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const r = 12;
      const tipX = el.w * 0.2, tipY = el.h + 20;
      const d = `
        M ${r},0
        H ${el.w - r}
        Q ${el.w},0 ${el.w},${r}
        V ${el.h - r}
        Q ${el.w},${el.h} ${el.w - r},${el.h}
        H ${tipX + 30}
        L ${tipX},${Math.min(tipY, el.h + 18)}
        L ${tipX + 12},${el.h}
        H ${r}
        Q 0,${el.h} 0,${el.h - r}
        V ${r}
        Q 0,0 ${r},0
        Z
      `;
      shape.setAttribute('d', d.trim());
    } else {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shape.setAttribute('x', '0'); shape.setAttribute('y', '0');
      shape.setAttribute('width', el.w); shape.setAttribute('height', el.h);
    }

    shape.setAttribute('fill', fill);
    if (strokeWidth > 0) {
      shape.setAttribute('stroke', stroke);
      shape.setAttribute('stroke-width', strokeWidth);
    }
    svg.appendChild(shape);
    wrap.appendChild(svg);
  }

  function renderImageInto(wrap, el) {
    const img = document.createElement('img');
    img.src = el.src;
    img.alt = '';
    img.draggable = false;
    const adj = el.adjust || {};
    const brightness = adj.brightness != null ? adj.brightness : 100;
    const contrast = adj.contrast != null ? adj.contrast : 100;
    const opacity = adj.opacity != null ? adj.opacity : 100;
    const radius = adj.radius || 0;
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      pointerEvents: 'none',
      userSelect: 'none',
      display: 'block',
      filter: `brightness(${brightness}%) contrast(${contrast}%)`,
      opacity: String(opacity / 100),
      borderRadius: radius + 'px',
    });
    wrap.appendChild(img);
  }

  function ytEmbedFromUrl(url) {
    // Returns an embed URL for YouTube / Vimeo / null if not recognised.
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (host === 'youtu.be') {
        const id = u.pathname.slice(1);
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (host === 'vimeo.com') {
        const id = u.pathname.slice(1).split('/')[0];
        if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function renderVideoInto(wrap, el) {
    const src = el.src || '';
    const embed = ytEmbedFromUrl(src);
    if (embed) {
      const f = document.createElement('iframe');
      f.src = embed;
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      f.loading = 'lazy';
      Object.assign(f.style, { width: '100%', height: '100%', border: '0', display: 'block' });
      wrap.appendChild(f);
      return;
    }
    if (/^(https?:|data:|blob:)/.test(src)) {
      const v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.preload = 'metadata';
      Object.assign(v.style, { width: '100%', height: '100%', display: 'block' });
      wrap.appendChild(v);
      return;
    }
    // No usable src — show a placeholder.
    const ph = document.createElement('div');
    ph.className = 'video-placeholder';
    ph.textContent = 'Click to set a video URL';
    Object.assign(ph.style, {
      width: '100%', height: '100%',
      display: 'grid', placeItems: 'center',
      background: '#0f172a', color: '#94a3b8',
      border: '1px dashed #334155', boxSizing: 'border-box',
      fontSize: '14px', fontFamily: 'system-ui, sans-serif',
    });
    wrap.appendChild(ph);
  }

  function renderTableInto(wrap, el) {
    const t = document.createElement('table');
    t.className = 'slide-table';
    Object.assign(t.style, {
      width: '100%', height: '100%', borderCollapse: 'collapse',
      tableLayout: 'fixed', background: 'rgba(255,255,255,0.95)',
      color: '#1f2937', fontSize: '14px',
    });
    for (let r = 0; r < el.rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < el.cols; c++) {
        const isHeader = el.headerRow && r === 0;
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.contentEditable = 'false';
        cell.textContent = (el.cells[r] && el.cells[r][c]) != null ? el.cells[r][c] : '';
        Object.assign(cell.style, {
          border: '1px solid #cbd5e1',
          padding: '6px 8px',
          textAlign: 'left',
          verticalAlign: 'top',
          background: isHeader ? '#f1f5f9' : 'transparent',
          fontWeight: isHeader ? '600' : '400',
        });
        tr.appendChild(cell);
      }
      t.appendChild(tr);
    }
    wrap.appendChild(t);
  }

  function addResizeHandles(wrap) {
    RESIZE_DIRS.forEach((dir) => {
      const h = document.createElement('div');
      h.className = `resize-handle handle-${dir}`;
      h.dataset.dir = dir;
      Object.assign(h.style, {
        position: 'absolute',
        width: HANDLE_SIZE + 'px',
        height: HANDLE_SIZE + 'px',
        background: '#fff',
        border: '1.5px solid var(--primary)',
        borderRadius: '2px',
      });
      const half = -HANDLE_SIZE / 2;
      const positions = {
        nw: { left: half, top: half, cursor: 'nwse-resize' },
        n:  { left: '50%', top: half, marginLeft: half, cursor: 'ns-resize' },
        ne: { right: half, top: half, cursor: 'nesw-resize' },
        e:  { right: half, top: '50%', marginTop: half, cursor: 'ew-resize' },
        se: { right: half, bottom: half, cursor: 'nwse-resize' },
        s:  { left: '50%', bottom: half, marginLeft: half, cursor: 'ns-resize' },
        sw: { left: half, bottom: half, cursor: 'nesw-resize' },
        w:  { left: half, top: '50%', marginTop: half, cursor: 'ew-resize' },
      };
      Object.entries(positions[dir]).forEach(([k, v]) => {
        h.style[k] = typeof v === 'number' ? v + 'px' : v;
      });
      wrap.appendChild(h);
    });
  }

  // Render a single slide into a thumbnail node, scaled.
  function renderThumb(container, slide, scale) {
    container.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'thumb-stage';
    Object.assign(stage.style, {
      width: '1280px', height: '720px',
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      position: 'relative',
      overflow: 'hidden',
    });
    container.appendChild(stage);
    renderSlide(stage, slide, { selectedId: null, editable: false });
  }

  // Hit-test a point in stage coords against the slide elements; returns
  // the topmost element under (x,y), or null.
  function hitTest(slide, x, y) {
    for (let i = slide.elements.length - 1; i >= 0; i--) {
      const e = slide.elements[i];
      if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return e;
    }
    return null;
  }

  // Convert client coords (mouse) to stage coords given the stage element
  // and its current scale (from app.js layout).
  function clientToStage(stageEl, scale, clientX, clientY) {
    const rect = stageEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }

  // Apply a resize delta from a handle direction; returns new {x,y,w,h}.
  function applyResize(start, dir, dx, dy, minSize = 30) {
    let { x, y, w, h } = start;
    if (dir.includes('n')) { y += dy; h -= dy; }
    if (dir.includes('s')) { h += dy; }
    if (dir.includes('w')) { x += dx; w -= dx; }
    if (dir.includes('e')) { w += dx; }
    if (w < minSize) {
      if (dir.includes('w')) x -= (minSize - w);
      w = minSize;
    }
    if (h < minSize) {
      if (dir.includes('n')) y -= (minSize - h);
      h = minSize;
    }
    return { x, y, w, h };
  }

  window.RodmanRender = {
    renderSlide, renderThumb, hitTest, clientToStage, applyResize, sanitizeTextHtml,
    HANDLE_SIZE, RESIZE_DIRS,
  };
})();
