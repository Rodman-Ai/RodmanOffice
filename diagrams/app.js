/* RodmanVision — main app.
 *
 * Three-tier state:
 *   1. window.RodmanDiagram — pure data model + storage helpers
 *   2. The state object below — selection, zoom, mode, active page/layer
 *   3. DOM — re-rendered from state on every dispatch
 *
 * Single IIFE under 'use strict'. Sections, in rough order:
 *   - State + constants
 *   - Autosave + bootstrap
 *   - Tab switching (ribbon)
 *   - Stencil drawer (left rail)
 *   - Canvas rendering + zoom
 *   - Interaction: select, drag, resize, marquee, connector creation
 *   - Property panel + Layers panel
 *   - Ribbon command dispatch
 *   - Save / Open dialogs (the unified Save modal)
 *   - Ask Claude wiring (matches Slides exactly)
 *   - Keyboard shortcuts
 */
(function () {
  'use strict';

  const D = window.RodmanDiagram;
  const R = window.RodmanRender;
  const IO = window.RodmanDiagramsIO;
  const STENCILS = window.RodmanStencils;
  const THEMES_MOD = window.RodmanDiagramThemes;

  const HELP_REPO_URL = 'https://github.com/Rodman-Ai/RodmanOffice';

  // ---------- State ----------
  let diagram = D.load() || D.newDiagram();
  sanitizeDiagram(diagram);
  let state = {
    activePageId: diagram.pages[0].id,
    selectedShapeIds: new Set(),
    selectedConnectorIds: new Set(),
    zoom: 1,
    showGrid: true,
    snapToGrid: true,
    showRulers: false,
    sideTab: 'properties',  // 'properties' | 'layers'
    panOpen: { stencils: true, side: true },
    clipboard: null,
    isEditingText: false,
    paintMode: null,        // { fill, stroke, strokeWidth, opacity, textStyle } | null
    smartGuides: [],        // active guide lines during drag: { x1, y1, x2, y2 }
  };

  // ---------- Undo / Redo history ----------
  // We snapshot the entire diagram before each mutation. Cheap because
  // diagrams are small and JSON.stringify is fast for our model.
  const HISTORY_MAX = 50;
  const history = { stack: [], index: -1 };

  function snapshotDiagram() {
    return JSON.stringify(diagram);
  }

  function restoreSnapshot(snap) {
    try {
      const obj = JSON.parse(snap);
      sanitizeDiagram(obj);
      diagram = obj;
      // Keep activePageId pointing at a real page.
      if (!D.findPage(diagram, state.activePageId)) {
        state.activePageId = diagram.pages[0].id;
      }
      state.selectedShapeIds.clear();
      state.selectedConnectorIds.clear();
      $('#diagramTitle').value = diagram.title;
      renderAll();
    } catch (_) { /* ignore */ }
  }

  function pushHistory() {
    const snap = snapshotDiagram();
    // Drop any redo tail.
    if (history.index < history.stack.length - 1) {
      history.stack = history.stack.slice(0, history.index + 1);
    }
    history.stack.push(snap);
    if (history.stack.length > HISTORY_MAX) history.stack.shift();
    history.index = history.stack.length - 1;
  }

  // ---------- Helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function activePage() {
    return D.findPage(diagram, state.activePageId) || diagram.pages[0];
  }

  function activeLayer() {
    return diagram.layers.find((l) => l.id === diagram.activeLayerId) || diagram.layers[0];
  }

  function sanitizeDiagram(d) {
    if (!d || !Array.isArray(d.pages)) return;
    if (!Array.isArray(d.layers) || !d.layers.length) {
      d.layers = [D.newLayer()];
    }
    if (!d.activeLayerId) d.activeLayerId = d.layers[0].id;
    for (const page of d.pages) {
      page.shapes = page.shapes || [];
      page.connectors = page.connectors || [];
      for (const s of page.shapes) {
        if (!s.layerId) s.layerId = d.layers[0].id;
        if (!s.textStyle) s.textStyle = { fontFamily: '', fontSize: 14, color: '#1F2937', align: 'center' };
      }
      for (const c of page.connectors) {
        if (!c.layerId) c.layerId = d.layers[0].id;
      }
    }
  }

  // ---------- Autosave ----------
  let saveTimer = null;
  let historyPushPending = false;
  function scheduleSave() {
    setSaveIndicator('saving');
    // Coalesce history pushes per "mutation batch" so drag-moves don't
    // record dozens of intermediate states. We push once per save flush.
    historyPushPending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (historyPushPending) {
        pushHistory();
        historyPushPending = false;
      }
      const ok = D.save(diagram);
      setSaveIndicator(ok ? 'saved' : 'error');
    }, 400);
  }

  function setSaveIndicator(kind) {
    const el = $('#saveIndicator');
    if (!el) return;
    if (kind === 'saving') { el.textContent = 'Saving…'; el.style.opacity = 0.7; }
    else if (kind === 'saved') { el.textContent = 'Saved'; el.style.opacity = 0.85; }
    else { el.textContent = 'Save error'; el.style.opacity = 1; }
  }

  // ---------- Tabs (ribbon) ----------
  function bindTabs() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const id = tab.dataset.tab;
        $$('.ribbon-panel').forEach((p) => {
          p.classList.toggle('active', p.dataset.panel === id);
        });
      });
    });
    // Double-click on a tab collapses the ribbon (Office-classic gesture).
    const tabs = $('.tabs');
    let ribbonCollapsed = false;
    tabs.addEventListener('dblclick', () => {
      ribbonCollapsed = !ribbonCollapsed;
      $('#ribbon').style.display = ribbonCollapsed ? 'none' : '';
    });
  }

  // ---------- Stencil drawer ----------
  const FAVORITES_KEY = 'vision.favorites.v1';
  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((id) => STENCILS.STENCILS[id]) : [];
    } catch (_) { return []; }
  }
  function saveFavorites(arr) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(arr)); } catch (_) {}
  }

  // Fuzzy match: subsequence of query chars in name (case-insensitive).
  // Returns rank score (lower = better, 0 = exact substring) or -1 if no
  // match. Exact substring beats fuzzy; acronym match (initials of words)
  // beats arbitrary subsequence.
  function fuzzyScore(haystack, needle) {
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    if (!n) return 0;
    const sub = h.indexOf(n);
    if (sub !== -1) return sub;
    // Acronym match: first letter of each word.
    const acronym = h.split(/[\s\-_]+/).map((w) => w[0] || '').join('');
    if (acronym.startsWith(n)) return 100;
    // Subsequence match.
    let i = 0, j = 0, gaps = 0;
    while (i < h.length && j < n.length) {
      if (h[i] === n[j]) { j++; if (i > 0 && h[i - 1] !== n[j - 2]) gaps++; }
      i++;
    }
    return j === n.length ? 1000 + gaps : -1;
  }

  function renderStencilDrawer() {
    const list = $('#stencilList');
    list.innerHTML = '';
    const groups = STENCILS.stencilsByCategory();
    const filter = ($('#stencilSearch').value || '').trim();
    const favorites = loadFavorites();

    // Favorites pseudo-category (only when populated)
    if (favorites.length && !filter) {
      const wrap = document.createElement('div');
      wrap.className = 'stencil-category';
      const header = document.createElement('div');
      header.className = 'stencil-category-header';
      header.textContent = '★ Favorites';
      header.addEventListener('click', () => wrap.classList.toggle('collapsed'));
      wrap.appendChild(header);
      const grid = document.createElement('div');
      grid.className = 'stencil-grid';
      for (const id of favorites) {
        const stencil = STENCILS.getStencil(id);
        if (stencil) grid.appendChild(makeStencilTile(stencil, true));
      }
      wrap.appendChild(grid);
      list.appendChild(wrap);
    }

    for (const cat of STENCILS.CATEGORIES) {
      let items = groups[cat] || [];
      if (filter) {
        items = items
          .map((s) => ({ s, score: Math.max(fuzzyScore(s.name, filter), fuzzyScore(s.id, filter)) }))
          .filter((x) => x.score >= 0)
          .sort((a, b) => a.score - b.score)
          .map((x) => x.s);
      }
      if (!items.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'stencil-category';
      const header = document.createElement('div');
      header.className = 'stencil-category-header';
      header.textContent = cat;
      header.addEventListener('click', () => wrap.classList.toggle('collapsed'));
      wrap.appendChild(header);
      const grid = document.createElement('div');
      grid.className = 'stencil-grid';
      for (const stencil of items) grid.appendChild(makeStencilTile(stencil));
      wrap.appendChild(grid);
      list.appendChild(wrap);
    }
  }

  function makeStencilTile(stencil, isFavorite) {
    const tile = document.createElement('div');
    tile.className = 'stencil-tile';
    tile.draggable = true;
    tile.dataset.stencil = stencil.id;
    tile.title = `${stencil.name} (right-click to ${isFavorite ? 'unpin' : 'pin'})`;
    const thumb = R.renderStencilThumb(stencil, 36);
    tile.appendChild(thumb);
    const name = document.createElement('div');
    name.className = 'stencil-tile-name';
    name.textContent = stencil.name;
    tile.appendChild(name);
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-rodman-stencil', stencil.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    tile.addEventListener('click', () => {
      dropStencilAt(stencil.id, activePage().w / 2, activePage().h / 2);
    });
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const favs = loadFavorites();
      const idx = favs.indexOf(stencil.id);
      if (idx === -1) favs.push(stencil.id);
      else favs.splice(idx, 1);
      saveFavorites(favs);
      renderStencilDrawer();
    });
    return tile;
  }

  function bindStencilSearch() {
    const input = $('#stencilSearch');
    input.addEventListener('input', () => renderStencilDrawer());
  }

  // ---------- Canvas ----------
  function renderCanvas() {
    const shadow = $('#canvasShadow');
    shadow.innerHTML = '';
    const page = activePage();
    const svg = R.renderPage(page, diagram.layers, { showGrid: state.showGrid });
    shadow.appendChild(svg);
    shadow.style.width = page.w + 'px';
    shadow.style.height = page.h + 'px';
    shadow.style.background = page.bg || '#ffffff';
    shadow.style.transform = `scale(${state.zoom})`;
    bindCanvasInteractions(svg, shadow);
    renderSelectionOverlays(shadow);
    renderHoverPorts(shadow);
    renderSmartGuides(shadow);
    renderAutoConnectArrows(shadow);
    renderConnectorHandles(shadow);
    renderRulers();
    renderPageStrip();
    updateStatusBar();
  }

  // ---------- Rulers ----------
  function renderRulers() {
    const wrap = $('#canvasArea');
    if (!wrap) return;
    let topRuler = wrap.querySelector('.ruler-top');
    let leftRuler = wrap.querySelector('.ruler-left');
    if (!state.showRulers) {
      if (topRuler) topRuler.remove();
      if (leftRuler) leftRuler.remove();
      wrap.classList.remove('with-rulers');
      return;
    }
    wrap.classList.add('with-rulers');
    if (!topRuler) {
      topRuler = document.createElement('canvas');
      topRuler.className = 'ruler ruler-top';
      wrap.appendChild(topRuler);
    }
    if (!leftRuler) {
      leftRuler = document.createElement('canvas');
      leftRuler.className = 'ruler ruler-left';
      wrap.appendChild(leftRuler);
    }
    const scroll = $('#canvasScroll');
    const sw = scroll.clientWidth;
    const sh = scroll.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    drawRuler(topRuler, sw - 22, 22, 'horizontal', dpr);
    drawRuler(leftRuler, 22, sh - 22, 'vertical', dpr);
  }

  function drawRuler(canvas, w, h, orientation, dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#94a3b8';
    ctx.fillStyle = '#475569';
    ctx.font = '10px Segoe UI, sans-serif';
    const minor = 10 * state.zoom;
    const major = 100 * state.zoom;
    const scroll = $('#canvasScroll');
    const shadow = $('#canvasShadow');
    const sRect = shadow.getBoundingClientRect();
    const cRect = scroll.getBoundingClientRect();
    if (orientation === 'horizontal') {
      const originPx = sRect.left - cRect.left;
      for (let x = 0; x < w; x++) {
        const pageX = (x - originPx) / state.zoom;
        if (pageX < 0) continue;
        const onMajor = Math.abs(((x - originPx) % major)) < 1;
        const onMinor = Math.abs(((x - originPx) % minor)) < 1;
        if (onMajor) {
          ctx.beginPath();
          ctx.moveTo(x + 0.5, h * 0.4);
          ctx.lineTo(x + 0.5, h);
          ctx.stroke();
          ctx.fillText(String(Math.round(pageX)), x + 2, h * 0.4);
        } else if (onMinor) {
          ctx.beginPath();
          ctx.moveTo(x + 0.5, h * 0.7);
          ctx.lineTo(x + 0.5, h);
          ctx.stroke();
        }
      }
    } else {
      const originPx = sRect.top - cRect.top;
      for (let y = 0; y < h; y++) {
        const pageY = (y - originPx) / state.zoom;
        if (pageY < 0) continue;
        const onMajor = Math.abs(((y - originPx) % major)) < 1;
        const onMinor = Math.abs(((y - originPx) % minor)) < 1;
        if (onMajor) {
          ctx.beginPath();
          ctx.moveTo(w * 0.4, y + 0.5);
          ctx.lineTo(w, y + 0.5);
          ctx.stroke();
          ctx.save();
          ctx.translate(w * 0.4 - 2, y + 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(Math.round(pageY)), 0, 0);
          ctx.restore();
        } else if (onMinor) {
          ctx.beginPath();
          ctx.moveTo(w * 0.7, y + 0.5);
          ctx.lineTo(w, y + 0.5);
          ctx.stroke();
        }
      }
    }
  }

  // ---------- Smart guides (alignment lines during drag) ----------
  function renderSmartGuides(shadow) {
    shadow.querySelectorAll('.smart-guide').forEach((el) => el.remove());
    if (!state.smartGuides || !state.smartGuides.length) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'smart-guide');
    const page = activePage();
    svg.setAttribute('width', page.w);
    svg.setAttribute('height', page.h);
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.pointerEvents = 'none';
    for (const ln of state.smartGuides) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', ln.x1);
      line.setAttribute('y1', ln.y1);
      line.setAttribute('x2', ln.x2);
      line.setAttribute('y2', ln.y2);
      line.setAttribute('stroke', '#ec4899');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4 3');
      svg.appendChild(line);
    }
    shadow.appendChild(svg);
  }

  // Mouse coords → page-local coords (accounting for zoom + scroll).
  function eventToPagePoint(e, shadow) {
    const rect = shadow.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / state.zoom,
      y: (e.clientY - rect.top) / state.zoom,
    };
  }

  let drag = null;

  function bindCanvasInteractions(svg, shadow) {
    // Click on background = clear selection or start marquee
    svg.addEventListener('mousedown', (e) => {
      if (state.isEditingText) return;
      const target = e.target.closest('.shape, .connector');
      const pt = eventToPagePoint(e, shadow);

      if (!target) {
        if (!e.shiftKey) clearSelection();
        drag = { mode: 'marquee', startX: pt.x, startY: pt.y, x: pt.x, y: pt.y };
        renderSelectionOverlays(shadow);
        return;
      }

      if (target.classList.contains('shape')) {
        const id = target.getAttribute('data-shape-id');
        const page = activePage();

        // Format painter: clicking a shape paints, doesn't select.
        if (state.paintMode) {
          const sh = D.findShape(page, id);
          if (sh) {
            sh.fill = state.paintMode.fill;
            sh.stroke = state.paintMode.stroke;
            sh.strokeWidth = state.paintMode.strokeWidth;
            sh.opacity = state.paintMode.opacity;
            sh.textStyle = JSON.parse(JSON.stringify(state.paintMode.textStyle));
            sh._themed = false;
            scheduleSave();
            renderCanvas();
          }
          // Hold Alt to keep painting; otherwise exit after first paint.
          if (!e.altKey) {
            state.paintMode = null;
            document.body.classList.remove('format-painter-active');
          }
          return;
        }

        if (e.shiftKey) {
          if (state.selectedShapeIds.has(id)) state.selectedShapeIds.delete(id);
          else state.selectedShapeIds.add(id);
        } else if (!state.selectedShapeIds.has(id)) {
          state.selectedShapeIds.clear();
          state.selectedConnectorIds.clear();
          state.selectedShapeIds.add(id);
        }
        // Group-aware selection: if any selected shape is in a group,
        // pull every group member into the selection.
        state.selectedShapeIds = D.expandSelectionToGroups(page, state.selectedShapeIds);

        // Start a move drag carrying every selected shape.
        const initial = new Map();
        for (const sid of state.selectedShapeIds) {
          const sh = D.findShape(page, sid);
          if (sh) initial.set(sid, { x: sh.x, y: sh.y });
        }
        drag = { mode: 'move', startX: pt.x, startY: pt.y, initial };
        renderSelectionOverlays(shadow);
        renderPropertiesPanel();
      } else if (target.classList.contains('connector')) {
        const id = target.getAttribute('data-connector-id');
        if (e.shiftKey) {
          if (state.selectedConnectorIds.has(id)) state.selectedConnectorIds.delete(id);
          else state.selectedConnectorIds.add(id);
        } else {
          state.selectedShapeIds.clear();
          state.selectedConnectorIds.clear();
          state.selectedConnectorIds.add(id);
        }
        renderSelectionOverlays(shadow);
        renderPropertiesPanel();
      }
    });

    svg.addEventListener('dblclick', (e) => {
      const target = e.target.closest('.shape');
      if (!target) return;
      const id = target.getAttribute('data-shape-id');
      startTextEdit(id, shadow);
    });

    // DnD drop from stencil drawer
    shadow.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-rodman-stencil')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    shadow.addEventListener('drop', (e) => {
      const stencilId = e.dataTransfer.getData('application/x-rodman-stencil');
      if (!stencilId) return;
      e.preventDefault();
      const pt = eventToPagePoint(e, shadow);
      dropStencilAt(stencilId, pt.x, pt.y);
    });

    // Mousemove / mouseup live on document for drag continuity.
  }

  // Listen at document level so drags don't abort when the pointer
  // leaves the canvas.
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const shadow = $('#canvasShadow');
    const pt = eventToPagePoint(e, shadow);
    if (drag.mode === 'move') {
      let dx = pt.x - drag.startX;
      let dy = pt.y - drag.startY;
      const page = activePage();
      // Smart guides: snap the *primary* dragged shape's edges/center to
      // matching edges/centers of any non-selected shape. The other
      // selected shapes follow the same dx/dy so multi-selection drag
      // stays coherent.
      const primaryId = [...drag.initial.keys()][0];
      const primaryInit = drag.initial.get(primaryId);
      const primary = D.findShape(page, primaryId);
      if (primary && primaryInit) {
        const guides = computeSmartGuides(page, primary, primaryInit, dx, dy);
        if (guides.snapX != null) dx = guides.snapX - primaryInit.x;
        if (guides.snapY != null) dy = guides.snapY - primaryInit.y;
        state.smartGuides = guides.lines;
      } else {
        state.smartGuides = [];
      }
      for (const [sid, init] of drag.initial.entries()) {
        const sh = D.findShape(page, sid);
        if (!sh) continue;
        sh.x = state.snapToGrid ? D.snapTo(init.x + dx, 10) : Math.round(init.x + dx);
        sh.y = state.snapToGrid ? D.snapTo(init.y + dy, 10) : Math.round(init.y + dy);
      }
      drag.hasMoved = true;
      renderCanvas();
    } else if (drag.mode === 'marquee') {
      drag.x = pt.x; drag.y = pt.y;
      renderSelectionOverlays(shadow);
    } else if (drag.mode === 'resize') {
      resizeDrag(pt);
      renderCanvas();
    } else if (drag.mode === 'rotate') {
      rotateDrag(pt);
      renderCanvas();
    } else if (drag.mode === 'connect') {
      drag.x = pt.x; drag.y = pt.y;
      renderConnectorPreview(shadow);
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const shadow = $('#canvasShadow');
    if (drag.mode === 'marquee') {
      // Finalise marquee → select every shape whose bounding box
      // overlaps the marquee rect.
      const x0 = Math.min(drag.startX, drag.x);
      const y0 = Math.min(drag.startY, drag.y);
      const x1 = Math.max(drag.startX, drag.x);
      const y1 = Math.max(drag.startY, drag.y);
      if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
        const page = activePage();
        for (const sh of page.shapes) {
          if (sh.x < x1 && sh.x + sh.w > x0 && sh.y < y1 && sh.y + sh.h > y0) {
            state.selectedShapeIds.add(sh.id);
          }
        }
      }
    } else if (drag.mode === 'connect') {
      finishConnectorDrag(e);
    }
    if (drag.hasMoved || drag.mode === 'resize' || drag.mode === 'rotate' || drag.mode === 'connect') {
      scheduleSave();
    }
    drag = null;
    state.smartGuides = [];
    renderCanvas();
  });

  // Compute smart-guide snap suggestions for a moving shape.
  // Returns { snapX, snapY, lines } where snapX/snapY are absolute
  // top-left coordinates the shape should snap to (or null) and lines
  // is the list of pink alignment lines to draw in page space.
  const SMART_GUIDE_THRESHOLD = 5;
  function computeSmartGuides(page, primary, primaryInit, dx, dy) {
    const targetX = primaryInit.x + dx;
    const targetY = primaryInit.y + dy;
    const candidateX = [
      { v: targetX, kind: 'left' },
      { v: targetX + primary.w / 2, kind: 'cx' },
      { v: targetX + primary.w, kind: 'right' },
    ];
    const candidateY = [
      { v: targetY, kind: 'top' },
      { v: targetY + primary.h / 2, kind: 'cy' },
      { v: targetY + primary.h, kind: 'bottom' },
    ];
    let bestX = null, bestY = null;
    const lines = [];
    for (const other of page.shapes) {
      if (state.selectedShapeIds.has(other.id)) continue;
      const otherEdges = [
        { v: other.x, line: other.x },
        { v: other.x + other.w / 2, line: other.x + other.w / 2 },
        { v: other.x + other.w, line: other.x + other.w },
      ];
      for (const cx of candidateX) {
        for (const ox of otherEdges) {
          if (Math.abs(cx.v - ox.v) < SMART_GUIDE_THRESHOLD) {
            const candidate = ox.v - (cx.kind === 'left' ? 0 : cx.kind === 'cx' ? primary.w / 2 : primary.w);
            if (bestX == null || Math.abs(candidate - targetX) < Math.abs(bestX - targetX)) {
              bestX = candidate;
            }
            const top = Math.min(other.y, targetY) - 12;
            const bot = Math.max(other.y + other.h, targetY + primary.h) + 12;
            lines.push({ x1: ox.line, y1: top, x2: ox.line, y2: bot });
          }
        }
      }
      const otherEdgesY = [
        { v: other.y, line: other.y },
        { v: other.y + other.h / 2, line: other.y + other.h / 2 },
        { v: other.y + other.h, line: other.y + other.h },
      ];
      for (const cy of candidateY) {
        for (const oy of otherEdgesY) {
          if (Math.abs(cy.v - oy.v) < SMART_GUIDE_THRESHOLD) {
            const candidate = oy.v - (cy.kind === 'top' ? 0 : cy.kind === 'cy' ? primary.h / 2 : primary.h);
            if (bestY == null || Math.abs(candidate - targetY) < Math.abs(bestY - targetY)) {
              bestY = candidate;
            }
            const left = Math.min(other.x, targetX) - 12;
            const right = Math.max(other.x + other.w, targetX + primary.w) + 12;
            lines.push({ x1: left, y1: oy.line, x2: right, y2: oy.line });
          }
        }
      }
    }
    return { snapX: bestX, snapY: bestY, lines };
  }

  function dropStencilAt(stencilId, cx, cy, opts) {
    opts = opts || {};
    const stencil = STENCILS.getStencil(stencilId);
    const w = 140, h = 80;
    const theme = THEMES_MOD.getTheme(diagram.theme);
    const shape = D.newShape({
      stencil: stencilId,
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
      w, h,
      fill: theme.fill,
      stroke: theme.stroke,
      textStyle: {
        fontFamily: '', fontSize: 14, color: theme.textColor,
        bold: false, italic: false, align: 'center',
      },
      layerId: activeLayer().id,
      text: stencil.name,
    });
    activePage().shapes.push(shape);
    lastDroppedStencil = stencilId;
    if (!opts.suppressSelect) {
      state.selectedShapeIds.clear();
      state.selectedConnectorIds.clear();
      state.selectedShapeIds.add(shape.id);
    }
    scheduleSave();
    renderCanvas();
    renderPropertiesPanel();
    return shape;
  }

  // ---------- Selection overlays + handles ----------
  function clearSelection() {
    state.selectedShapeIds.clear();
    state.selectedConnectorIds.clear();
    renderPropertiesPanel();
  }

  function renderSelectionOverlays(shadow) {
    // Remove any previous overlays + handles + marquee.
    shadow.querySelectorAll('.selection-overlay, .selection-handles, .marquee, .connector-preview, .port-dot').forEach((el) => el.remove());

    if (drag && drag.mode === 'marquee') {
      const x0 = Math.min(drag.startX, drag.x);
      const y0 = Math.min(drag.startY, drag.y);
      const w = Math.abs(drag.x - drag.startX);
      const h = Math.abs(drag.y - drag.startY);
      const m = document.createElement('div');
      m.className = 'marquee';
      m.style.left = x0 + 'px';
      m.style.top = y0 + 'px';
      m.style.width = w + 'px';
      m.style.height = h + 'px';
      shadow.appendChild(m);
    }

    const page = activePage();
    for (const sid of state.selectedShapeIds) {
      const sh = D.findShape(page, sid);
      if (!sh) continue;
      // Overlay box
      const ov = document.createElement('div');
      ov.className = 'selection-overlay';
      ov.style.left = sh.x + 'px';
      ov.style.top = sh.y + 'px';
      ov.style.width = sh.w + 'px';
      ov.style.height = sh.h + 'px';
      shadow.appendChild(ov);
      // Handles
      const handles = document.createElement('div');
      handles.className = 'selection-handles';
      handles.style.left = sh.x + 'px';
      handles.style.top = sh.y + 'px';
      handles.style.width = sh.w + 'px';
      handles.style.height = sh.h + 'px';
      handles.style.position = 'absolute';
      const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const dir of dirs) {
        const h = document.createElement('div');
        h.className = 'selection-handle h-' + dir;
        h.dataset.handleDir = dir;
        h.dataset.shapeId = sh.id;
        h.addEventListener('mousedown', (e) => startResize(e, sh, dir));
        handles.appendChild(h);
      }
      // Rotation handle
      const rot = document.createElement('div');
      rot.className = 'selection-handle h-rot';
      rot.dataset.shapeId = sh.id;
      rot.addEventListener('mousedown', (e) => startRotate(e, sh));
      handles.appendChild(rot);
      shadow.appendChild(handles);

      // Port dots (only when exactly one shape selected → connector creation)
      if (state.selectedShapeIds.size === 1) {
        const ports = [
          { p: 'top',    x: sh.x + sh.w / 2 - 4, y: sh.y - 4 },
          { p: 'right',  x: sh.x + sh.w - 4,     y: sh.y + sh.h / 2 - 4 },
          { p: 'bottom', x: sh.x + sh.w / 2 - 4, y: sh.y + sh.h - 4 },
          { p: 'left',   x: sh.x - 4,            y: sh.y + sh.h / 2 - 4 },
        ];
        for (const port of ports) {
          const dot = document.createElement('div');
          dot.className = 'port-dot';
          dot.style.left = port.x + 'px';
          dot.style.top = port.y + 'px';
          dot.dataset.shapeId = sh.id;
          dot.dataset.port = port.p;
          dot.addEventListener('mousedown', (e) => startConnect(e, sh, port.p));
          shadow.appendChild(dot);
        }
      }
    }
  }

  function renderHoverPorts(_shadow) { /* placeholder for future hover ports on unselected shapes */ }

  // ---------- Resize / Rotate ----------
  function startResize(e, shape, dir) {
    e.stopPropagation();
    e.preventDefault();
    const shadow = $('#canvasShadow');
    const pt = eventToPagePoint(e, shadow);
    drag = {
      mode: 'resize',
      startX: pt.x, startY: pt.y,
      dir,
      shapeId: shape.id,
      initial: { x: shape.x, y: shape.y, w: shape.w, h: shape.h },
    };
  }

  function resizeDrag(pt) {
    const page = activePage();
    const sh = D.findShape(page, drag.shapeId);
    if (!sh) return;
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    const init = drag.initial;
    let { x, y, w, h } = init;
    const minSize = 20;
    if (drag.dir.includes('e')) w = Math.max(minSize, init.w + dx);
    if (drag.dir.includes('s')) h = Math.max(minSize, init.h + dy);
    if (drag.dir.includes('w')) { w = Math.max(minSize, init.w - dx); x = init.x + (init.w - w); }
    if (drag.dir.includes('n')) { h = Math.max(minSize, init.h - dy); y = init.y + (init.h - h); }
    if (state.snapToGrid) {
      x = D.snapTo(x, 10); y = D.snapTo(y, 10);
      w = D.snapTo(w, 10); h = D.snapTo(h, 10);
    }
    sh.x = Math.round(x); sh.y = Math.round(y); sh.w = Math.round(w); sh.h = Math.round(h);
  }

  function startRotate(e, shape) {
    e.stopPropagation();
    e.preventDefault();
    drag = {
      mode: 'rotate',
      shapeId: shape.id,
      cx: shape.x + shape.w / 2,
      cy: shape.y + shape.h / 2,
    };
  }

  function rotateDrag(pt) {
    const page = activePage();
    const sh = D.findShape(page, drag.shapeId);
    if (!sh) return;
    const ang = (Math.atan2(pt.y - drag.cy, pt.x - drag.cx) * 180) / Math.PI + 90;
    sh.rotation = state.snapToGrid ? Math.round(ang / 15) * 15 : Math.round(ang);
  }

  // ---------- Connector creation ----------
  function startConnect(e, fromShape, fromPort) {
    e.stopPropagation();
    e.preventDefault();
    const shadow = $('#canvasShadow');
    const pt = eventToPagePoint(e, shadow);
    drag = {
      mode: 'connect',
      fromShapeId: fromShape.id,
      fromPort,
      x: pt.x, y: pt.y,
    };
    renderConnectorPreview(shadow);
  }

  function renderConnectorPreview(shadow) {
    shadow.querySelectorAll('.connector-preview').forEach((el) => el.remove());
    const page = activePage();
    const from = D.findShape(page, drag.fromShapeId);
    if (!from) return;
    const a = R.portPoint(from, drag.fromPort);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'connector-preview');
    svg.setAttribute('width', page.w);
    svg.setAttribute('height', page.h);
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${a.x},${a.y} L${drag.x},${drag.y}`);
    path.setAttribute('stroke', '#1a8e9a');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '4 3');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
    shadow.appendChild(svg);
  }

  function finishConnectorDrag(e) {
    const page = activePage();
    const from = D.findShape(page, drag.fromShapeId);
    if (!from) return;
    // Find the shape under the mouse (excluding the source).
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const shapeEl = target && target.closest && target.closest('.shape');
    if (!shapeEl) return;
    const toId = shapeEl.getAttribute('data-shape-id');
    if (!toId || toId === drag.fromShapeId) return;
    const toShape = D.findShape(page, toId);
    if (!toShape) return;
    // Pick the closest port on the target.
    const shadow = $('#canvasShadow');
    const pt = eventToPagePoint(e, shadow);
    const ports = ['top', 'right', 'bottom', 'left'];
    let bestPort = 'left', bestDist = Infinity;
    for (const p of ports) {
      const pp = R.portPoint(toShape, p);
      const d = (pp.x - pt.x) ** 2 + (pp.y - pt.y) ** 2;
      if (d < bestDist) { bestDist = d; bestPort = p; }
    }
    const theme = THEMES_MOD.getTheme(diagram.theme);
    const conn = D.newConnector({
      fromShapeId: from.id,
      toShapeId: toShape.id,
      fromPort: drag.fromPort,
      toPort: bestPort,
      stroke: theme.stroke,
      layerId: activeLayer().id,
    });
    page.connectors.push(conn);
  }

  // ---------- Inline text editing ----------
  function startTextEdit(shapeId, shadow) {
    const page = activePage();
    const sh = D.findShape(page, shapeId);
    if (!sh) return;
    state.isEditingText = true;
    const overlay = document.createElement('textarea');
    overlay.className = 'text-edit-overlay';
    overlay.value = sh.text || '';
    overlay.style.left = sh.x + 'px';
    overlay.style.top = sh.y + 'px';
    overlay.style.width = sh.w + 'px';
    overlay.style.height = sh.h + 'px';
    overlay.style.font = `${(sh.textStyle.fontSize || 14)}px ${sh.textStyle.fontFamily || 'Segoe UI, sans-serif'}`;
    overlay.style.color = sh.textStyle.color || '#000000';
    overlay.style.textAlign = sh.textStyle.align || 'center';
    shadow.appendChild(overlay);
    overlay.focus();
    overlay.select();
    overlay.addEventListener('blur', commit);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.removeEventListener('blur', commit);
        overlay.remove();
        state.isEditingText = false;
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    });
    function commit() {
      sh.text = overlay.value;
      state.isEditingText = false;
      overlay.remove();
      scheduleSave();
      renderCanvas();
    }
  }

  // ---------- Properties + Layers ----------
  function bindSideTabs() {
    $$('.side-pane-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.side-pane-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const id = tab.dataset.sideTab;
        state.sideTab = id;
        $$('[data-side-body]').forEach((body) => {
          body.hidden = body.dataset.sideBody !== id;
        });
      });
    });
  }

  function renderPropertiesPanel() {
    const empty = $('#propsEmpty');
    const grid = $('#propsGrid');
    if (state.selectedShapeIds.size !== 1) {
      empty.hidden = false;
      grid.hidden = true;
      return;
    }
    empty.hidden = true;
    grid.hidden = false;
    const page = activePage();
    const sh = D.findShape(page, [...state.selectedShapeIds][0]);
    if (!sh) return;
    $('#propX').value = sh.x;
    $('#propY').value = sh.y;
    $('#propW').value = sh.w;
    $('#propH').value = sh.h;
    $('#propRot').value = sh.rotation || 0;
    $('#propFill').value = ensureHex(sh.fill);
    $('#propStroke').value = ensureHex(sh.stroke);
    $('#propStrokeWidth').value = sh.strokeWidth || 0;
    $('#propOpacity').value = Math.round((sh.opacity ?? 1) * 100);
    $('#propText').value = sh.text || '';
    const layerSel = $('#propLayer');
    layerSel.innerHTML = diagram.layers.map((l) =>
      `<option value="${l.id}" ${l.id === sh.layerId ? 'selected' : ''}>${escHtml(l.name)}</option>`
    ).join('');
  }

  function bindPropertyInputs() {
    const fields = ['propX', 'propY', 'propW', 'propH', 'propRot', 'propStrokeWidth', 'propOpacity', 'propText'];
    for (const id of fields) {
      $('#' + id).addEventListener('input', () => applyPropertyEdits());
    }
    for (const id of ['propFill', 'propStroke']) {
      $('#' + id).addEventListener('change', () => applyPropertyEdits());
    }
    $('#propLayer').addEventListener('change', () => applyPropertyEdits());
  }

  function applyPropertyEdits() {
    if (state.selectedShapeIds.size !== 1) return;
    const page = activePage();
    const sh = D.findShape(page, [...state.selectedShapeIds][0]);
    if (!sh) return;
    sh.x = parseFloat($('#propX').value) || 0;
    sh.y = parseFloat($('#propY').value) || 0;
    sh.w = Math.max(20, parseFloat($('#propW').value) || 20);
    sh.h = Math.max(20, parseFloat($('#propH').value) || 20);
    sh.rotation = parseFloat($('#propRot').value) || 0;
    sh.fill = $('#propFill').value;
    sh.stroke = $('#propStroke').value;
    sh.strokeWidth = parseFloat($('#propStrokeWidth').value) || 0;
    sh.opacity = Math.max(0, Math.min(1, parseFloat($('#propOpacity').value) / 100));
    sh.text = $('#propText').value;
    sh.layerId = $('#propLayer').value;
    sh._themed = false; // user customised
    scheduleSave();
    renderCanvas();
  }

  // ---------- Layers panel ----------
  function renderLayersPanel() {
    const list = $('#layerList');
    list.innerHTML = '';
    diagram.layers.forEach((layer) => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      if (layer.id === diagram.activeLayerId) row.classList.add('active');

      const visBtn = document.createElement('button');
      visBtn.className = 'layer-toggle';
      visBtn.title = layer.visible ? 'Visible' : 'Hidden';
      visBtn.textContent = layer.visible ? '👁' : '⊘';
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        scheduleSave();
        renderCanvas();
        renderLayersPanel();
      });
      row.appendChild(visBtn);

      const lockBtn = document.createElement('button');
      lockBtn.className = 'layer-toggle';
      lockBtn.title = layer.locked ? 'Locked' : 'Unlocked';
      lockBtn.textContent = layer.locked ? '🔒' : '🔓';
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.locked = !layer.locked;
        scheduleSave();
        renderLayersPanel();
      });
      row.appendChild(lockBtn);

      const nameInput = document.createElement('input');
      nameInput.className = 'layer-name';
      nameInput.type = 'text';
      nameInput.value = layer.name;
      nameInput.addEventListener('change', () => {
        layer.name = nameInput.value || 'Layer';
        scheduleSave();
      });
      row.appendChild(nameInput);

      const op = document.createElement('input');
      op.type = 'range';
      op.className = 'layer-opacity';
      op.min = '0'; op.max = '100';
      op.value = Math.round(layer.opacity * 100);
      op.addEventListener('input', () => {
        layer.opacity = parseInt(op.value, 10) / 100;
        renderCanvas();
        scheduleSave();
      });
      row.appendChild(op);

      row.addEventListener('click', () => {
        diagram.activeLayerId = layer.id;
        renderLayersPanel();
      });
      list.appendChild(row);
    });
  }

  function bindLayersToolbar() {
    $('#addLayerBtn').addEventListener('click', () => {
      const newLayer = D.newLayer({ name: `Layer ${diagram.layers.length + 1}` });
      diagram.layers.push(newLayer);
      diagram.activeLayerId = newLayer.id;
      scheduleSave();
      renderLayersPanel();
    });
    $('#deleteLayerBtn').addEventListener('click', () => {
      if (diagram.layers.length <= 1) {
        alert('A diagram needs at least one layer.');
        return;
      }
      const id = diagram.activeLayerId;
      const idx = diagram.layers.findIndex((l) => l.id === id);
      if (idx === -1) return;
      const fallback = diagram.layers[idx === 0 ? 1 : 0].id;
      // Reassign anything on the deleted layer.
      for (const page of diagram.pages) {
        for (const s of page.shapes) if (s.layerId === id) s.layerId = fallback;
        for (const c of page.connectors) if (c.layerId === id) c.layerId = fallback;
      }
      diagram.layers.splice(idx, 1);
      diagram.activeLayerId = fallback;
      scheduleSave();
      renderLayersPanel();
      renderCanvas();
    });
  }

  // ---------- Page strip ----------
  function renderPageStrip() {
    const strip = $('#pageStrip');
    strip.innerHTML = '';
    diagram.pages.forEach((page, idx) => {
      const tab = document.createElement('div');
      tab.className = 'page-tab';
      if (page.id === state.activePageId) tab.classList.add('active');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = page.name || `Page ${idx + 1}`;
      tab.appendChild(nameSpan);
      tab.addEventListener('click', () => {
        state.activePageId = page.id;
        clearSelection();
        renderCanvas();
      });
      tab.addEventListener('dblclick', () => {
        const next = prompt('Rename page', page.name);
        if (next != null) { page.name = next.trim() || page.name; scheduleSave(); renderPageStrip(); }
      });
      if (diagram.pages.length > 1) {
        const close = document.createElement('button');
        close.className = 'page-close';
        close.textContent = '×';
        close.title = 'Delete page';
        close.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${page.name}"?`)) return;
          D.removePage(diagram, page.id);
          if (state.activePageId === page.id) state.activePageId = diagram.pages[0].id;
          scheduleSave();
          renderCanvas();
        });
        tab.appendChild(close);
      }
      strip.appendChild(tab);
    });
    const add = document.createElement('button');
    add.className = 'page-add';
    add.textContent = '+ Page';
    add.addEventListener('click', () => commands.addPage());
    strip.appendChild(add);
  }

  // ---------- Theme strip ----------
  function renderThemeStrip() {
    const strip = $('#themeStrip');
    strip.innerHTML = '';
    for (const theme of THEMES_MOD.THEMES) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      if (theme.id === diagram.theme) card.classList.add('active');
      card.title = theme.name;
      card.innerHTML =
        `<div class="tc-bar" style="background:${theme.stroke};"></div>` +
        `<div class="tc-swatches">` +
          theme.palette.slice(0, 5).map((c) => `<div class="tc-swatch" style="background:${c};"></div>`).join('') +
        `</div>` +
        `<div class="tc-name">${escHtml(theme.name)}</div>`;
      card.addEventListener('click', () => {
        diagram.theme = theme.id;
        THEMES_MOD.applyThemeToDiagram(diagram);
        scheduleSave();
        renderThemeStrip();
        renderCanvas();
        updateStatusBar();
      });
      strip.appendChild(card);
    }
  }

  // ---------- Status bar ----------
  function updateStatusBar() {
    const pageIdx = diagram.pages.findIndex((p) => p.id === state.activePageId);
    $('#statusPageCounter').textContent = `Page ${pageIdx + 1} of ${diagram.pages.length}`;
    const total = state.selectedShapeIds.size + state.selectedConnectorIds.size;
    $('#statusSelection').textContent = total ? `${total} selected` : 'No selection';
    const theme = THEMES_MOD.getTheme(diagram.theme);
    $('#statusTheme').textContent = theme.name;
    $('#statusZoom').textContent = Math.round(state.zoom * 100) + '%';
    $('#zoomDisplay').textContent = Math.round(state.zoom * 100) + '%';
  }

  // ---------- Commands ----------
  const commands = {
    // File
    newDiagram() {
      if (!confirm('Discard the current diagram and start a new one?')) return;
      diagram = D.newDiagram();
      state.activePageId = diagram.pages[0].id;
      state.selectedShapeIds.clear();
      state.selectedConnectorIds.clear();
      $('#diagramTitle').value = diagram.title;
      scheduleSave();
      renderAll();
    },
    openDiagram() { $('#openFileInput').click(); },
    showSaveDialog() {
      const dlg = $('#saveDialog');
      $('#saveDialogName').value = (diagram.title || 'diagram').replace(/[^\w\-]+/g, '_');
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    },
    saveAsVsdx() { saveDiagramAs('vsdx'); },
    saveAsSvg() { saveDiagramAs('svg'); },
    saveAsPng() { saveDiagramAs('png'); },
    saveAsPdf() { saveDiagramAs('pdf'); },
    resetDiagram() {
      if (!confirm('Wipe local diagram storage and start fresh? This cannot be undone.')) return;
      D.clear();
      diagram = D.newDiagram();
      state.activePageId = diagram.pages[0].id;
      state.selectedShapeIds.clear();
      state.selectedConnectorIds.clear();
      $('#diagramTitle').value = diagram.title;
      bootstrap();
    },

    // Clipboard / editing
    cut() { commands.copy(); commands.deleteSelection(); },
    copy() {
      const page = activePage();
      const shapes = [...state.selectedShapeIds].map((id) => D.findShape(page, id)).filter(Boolean);
      const conns = [...state.selectedConnectorIds].map((id) => D.findConnector(page, id)).filter(Boolean);
      if (!shapes.length && !conns.length) return;
      state.clipboard = JSON.parse(JSON.stringify({ shapes, conns }));
    },
    paste() {
      if (!state.clipboard) return;
      const page = activePage();
      const idMap = new Map();
      const newSel = new Set();
      for (const s of state.clipboard.shapes) {
        const copy = D.cloneShape(s);
        copy.x += 20; copy.y += 20;
        copy.layerId = activeLayer().id;
        idMap.set(s.id, copy.id);
        page.shapes.push(copy);
        newSel.add(copy.id);
      }
      for (const c of state.clipboard.conns) {
        const copy = JSON.parse(JSON.stringify(c));
        copy.id = 'c-' + Math.random().toString(36).slice(2, 8);
        copy.fromShapeId = idMap.get(c.fromShapeId) || c.fromShapeId;
        copy.toShapeId = idMap.get(c.toShapeId) || c.toShapeId;
        copy.layerId = activeLayer().id;
        page.connectors.push(copy);
      }
      state.selectedShapeIds = newSel;
      state.selectedConnectorIds.clear();
      scheduleSave();
      renderCanvas();
      renderPropertiesPanel();
    },
    duplicateSelection() { commands.copy(); commands.paste(); },
    deleteSelection() {
      const page = activePage();
      [...state.selectedShapeIds].forEach((id) => D.removeShape(page, id));
      [...state.selectedConnectorIds].forEach((id) => D.removeConnector(page, id));
      clearSelection();
      scheduleSave();
      renderCanvas();
    },
    selectAll() {
      const page = activePage();
      state.selectedShapeIds = new Set(page.shapes.map((s) => s.id));
      state.selectedConnectorIds.clear();
      renderCanvas();
      renderPropertiesPanel();
    },

    bold() { applyTextStyle({ bold: true, toggle: true }); },
    italic() { applyTextStyle({ italic: true, toggle: true }); },
    alignLeft() { applyTextStyle({ align: 'left' }); },
    alignCenter() { applyTextStyle({ align: 'center' }); },
    alignRight() { applyTextStyle({ align: 'right' }); },

    bringForward() {
      const page = activePage();
      [...state.selectedShapeIds].forEach((id) => D.bringForward(page, id));
      scheduleSave(); renderCanvas();
    },
    sendBackward() {
      const page = activePage();
      [...state.selectedShapeIds].forEach((id) => D.sendBackward(page, id));
      scheduleSave(); renderCanvas();
    },
    group() {
      const page = activePage();
      const ids = [...state.selectedShapeIds];
      if (ids.length < 2) return;
      D.groupShapes(page, ids);
      scheduleSave();
      renderCanvas();
    },
    ungroup() {
      const page = activePage();
      const ids = [...state.selectedShapeIds];
      if (!ids.length) return;
      if (D.ungroupShapes(page, ids)) {
        scheduleSave();
        renderCanvas();
      }
    },

    // Align (selection ≥ 2 shapes)
    alignSelLeft()   { alignSelection('left'); },
    alignSelCenter() { alignSelection('center'); },
    alignSelRight()  { alignSelection('right'); },
    alignSelTop()    { alignSelection('top'); },
    alignSelMiddle() { alignSelection('middle'); },
    alignSelBottom() { alignSelection('bottom'); },

    // Distribute (selection ≥ 3 shapes)
    distributeH()    { distributeSelection('horizontal'); },
    distributeV()    { distributeSelection('vertical'); },
    spaceEvenly()    { distributeSelection('evenly'); },

    // Flip
    flipH() { flipSelection('h'); },
    flipV() { flipSelection('v'); },

    // Format painter
    pickFormat() {
      if (state.selectedShapeIds.size !== 1) {
        alert('Select one shape to copy its format, then click Format Painter again on the targets.');
        return;
      }
      const page = activePage();
      const sh = D.findShape(page, [...state.selectedShapeIds][0]);
      if (!sh) return;
      state.paintMode = {
        fill: sh.fill,
        stroke: sh.stroke,
        strokeWidth: sh.strokeWidth,
        opacity: sh.opacity,
        textStyle: JSON.parse(JSON.stringify(sh.textStyle || {})),
      };
      document.body.classList.add('format-painter-active');
    },

    // Find / Replace
    showFind() {
      const dlg = $('#findDialog');
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      $('#findInput').focus();
    },

    // Insert
    addPage() {
      D.addPage(diagram);
      state.activePageId = diagram.pages[diagram.pages.length - 1].id;
      clearSelection();
      scheduleSave();
      renderCanvas();
    },
    duplicatePage() {
      const page = D.duplicatePage(diagram, state.activePageId);
      if (page) {
        state.activePageId = page.id;
        scheduleSave();
        renderCanvas();
      }
    },
    deletePage() {
      if (diagram.pages.length <= 1) return alert('Need at least one page.');
      if (!confirm('Delete this page?')) return;
      D.removePage(diagram, state.activePageId);
      state.activePageId = diagram.pages[0].id;
      clearSelection();
      scheduleSave();
      renderCanvas();
    },
    toggleStencils() {
      const pane = $('#stencilPane');
      pane.classList.toggle('is-open');
    },
    toggleSidePane() {
      const pane = $('#sidePane');
      pane.classList.toggle('is-open');
    },
    dropStencil(btn) {
      const id = btn.dataset.stencil;
      dropStencilAt(id, activePage().w / 2, activePage().h / 2);
    },

    // View
    zoomIn() { state.zoom = Math.min(4, state.zoom * 1.2); renderCanvas(); },
    zoomOut() { state.zoom = Math.max(0.2, state.zoom / 1.2); renderCanvas(); },
    zoom100() { state.zoom = 1; renderCanvas(); },
    zoomFit() {
      const scroll = $('#canvasScroll');
      const page = activePage();
      const aw = scroll.clientWidth - 48;
      const ah = scroll.clientHeight - 48;
      state.zoom = Math.max(0.2, Math.min(4, Math.min(aw / page.w, ah / page.h)));
      renderCanvas();
    },

    // Help
    showHelp() {
      showHelpModal('Keyboard shortcuts',
        '<ul>' +
          '<li><b>Ctrl/Cmd+S</b> — Save dialog</li>' +
          '<li><b>Ctrl/Cmd+C / V / X</b> — Copy / Paste / Cut</li>' +
          '<li><b>Ctrl/Cmd+D</b> — Duplicate selection</li>' +
          '<li><b>Ctrl/Cmd+A</b> — Select all on page</li>' +
          '<li><b>Delete</b> — Remove selection</li>' +
          '<li><b>Arrow keys</b> — Nudge 1 px (Shift = 10 px)</li>' +
          '<li><b>+ / − / 0</b> — Zoom in / out / reset</li>' +
          '<li><b>Double-click shape</b> — Edit text label</li>' +
          '<li><b>Drag from port dot</b> — Create connector</li>' +
        '</ul>');
    },
    showAbout() {
      showHelpModal('About RodmanVision',
        '<p>RodmanVision is a browser-first Visio clone. Native format is VSDX (Visio OOXML/ZIP) — files round-trip cleanly with Microsoft Visio and LibreOffice Draw. Also exports to SVG, PNG and multi-page PDF.</p>' +
        `<p><a href="${HELP_REPO_URL}" target="_blank" rel="noopener">Source on GitHub</a></p>`);
    },
    askClaude() {
      const panel = $('#askClaudePanel');
      if (panel?.hidden) $('#askClaudeBtn')?.click();
      else ($('#askClaudeKey')?.value.trim() ? $('#askClaudeInput') : $('#askClaudeKey'))?.focus();
    },

    // Undo / Redo (real)
    undo() {
      if (history.index <= 0) return;
      history.index--;
      restoreSnapshot(history.stack[history.index]);
      setSaveIndicator('saved');
    },
    redo() {
      if (history.index >= history.stack.length - 1) return;
      history.index++;
      restoreSnapshot(history.stack[history.index]);
      setSaveIndicator('saved');
    },

    // View toggles
    toggleRulers() {
      state.showRulers = !state.showRulers;
      $('#rulersToggle').checked = state.showRulers;
      renderCanvas();
    },

    // ---------- Phase 3: connectors + layout ----------
    setConnectorRoute(btn) { setConnectorProp('routeStyle', btn?.dataset.route || 'orthogonal'); },
    setConnectorLine(btn)  { setConnectorProp('lineStyle',  btn?.dataset.line  || 'solid'); },
    setConnectorWeight(btn){ setConnectorProp('strokeWidth', parseFloat(btn?.dataset.weight) || 1.5); },
    editConnectorLabel() {
      const page = activePage();
      if (state.selectedConnectorIds.size !== 1) return;
      const c = D.findConnector(page, [...state.selectedConnectorIds][0]);
      if (!c) return;
      const next = prompt('Connector label', c.label || '');
      if (next != null) { c.label = next; scheduleSave(); renderCanvas(); }
    },
    autoLayoutHierarchy() {
      const page = activePage();
      autoLayoutHierarchical(page);
      scheduleSave();
      renderCanvas();
    },
    autoLayoutForce() {
      const page = activePage();
      autoLayoutForceDirected(page, 120);
      scheduleSave();
      renderCanvas();
    },
    addCustomPort() {
      if (state.selectedShapeIds.size !== 1) return;
      const page = activePage();
      const sh = D.findShape(page, [...state.selectedShapeIds][0]);
      if (!sh) return;
      const fx = parseFloat(prompt('Port X (0..1 across width)', '0.5'));
      const fy = parseFloat(prompt('Port Y (0..1 down height)', '0.5'));
      if (!isFinite(fx) || !isFinite(fy)) return;
      sh.customPorts = sh.customPorts || [];
      sh.customPorts.push({ fx: Math.max(0, Math.min(1, fx)), fy: Math.max(0, Math.min(1, fy)) });
      scheduleSave();
      renderCanvas();
    },

    // Replace selected shape's stencil (preserves geometry / text /
    // connectors / data). Opens the Replace dialog with a stencil list.
    showReplaceShape() {
      if (state.selectedShapeIds.size === 0) return;
      const dlg = $('#replaceShapeDialog');
      const list = $('#replaceShapeList');
      list.innerHTML = '';
      const groups = STENCILS.stencilsByCategory();
      for (const cat of STENCILS.CATEGORIES) {
        const items = groups[cat] || [];
        if (!items.length) continue;
        const header = document.createElement('div');
        header.className = 'stencil-category-header';
        header.textContent = cat;
        list.appendChild(header);
        const grid = document.createElement('div');
        grid.className = 'stencil-grid';
        for (const stencil of items) {
          const tile = document.createElement('div');
          tile.className = 'stencil-tile';
          tile.title = stencil.name;
          tile.appendChild(R.renderStencilThumb(stencil, 32));
          const name = document.createElement('div');
          name.className = 'stencil-tile-name';
          name.textContent = stencil.name;
          tile.appendChild(name);
          tile.addEventListener('click', () => {
            const page = activePage();
            for (const id of state.selectedShapeIds) {
              const sh = D.findShape(page, id);
              if (sh) sh.stencil = stencil.id;
            }
            scheduleSave();
            renderCanvas();
            dlg.close();
          });
          grid.appendChild(tile);
        }
        list.appendChild(grid);
      }
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    },
  };

  // ---------- Align / Distribute / Flip implementations ----------
  function alignSelection(mode) {
    const page = activePage();
    const shapes = [...state.selectedShapeIds]
      .map((id) => D.findShape(page, id))
      .filter(Boolean);
    if (shapes.length < 2) return;
    const bounds = D.boundsOfShapes(shapes);
    for (const s of shapes) {
      switch (mode) {
        case 'left':   s.x = bounds.x; break;
        case 'center': s.x = bounds.x + (bounds.w - s.w) / 2; break;
        case 'right':  s.x = bounds.x + bounds.w - s.w; break;
        case 'top':    s.y = bounds.y; break;
        case 'middle': s.y = bounds.y + (bounds.h - s.h) / 2; break;
        case 'bottom': s.y = bounds.y + bounds.h - s.h; break;
      }
      s.x = Math.round(s.x);
      s.y = Math.round(s.y);
    }
    scheduleSave();
    renderCanvas();
  }

  function distributeSelection(mode) {
    const page = activePage();
    const shapes = [...state.selectedShapeIds]
      .map((id) => D.findShape(page, id))
      .filter(Boolean);
    if (shapes.length < 3) return;
    if (mode === 'horizontal' || mode === 'evenly') {
      shapes.sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2));
      const first = shapes[0];
      const last = shapes[shapes.length - 1];
      const firstCx = first.x + first.w / 2;
      const lastCx = last.x + last.w / 2;
      const step = (lastCx - firstCx) / (shapes.length - 1);
      shapes.forEach((s, i) => {
        if (i === 0 || i === shapes.length - 1) return;
        const cx = firstCx + i * step;
        s.x = Math.round(cx - s.w / 2);
      });
    }
    if (mode === 'vertical' || mode === 'evenly') {
      shapes.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
      const first = shapes[0];
      const last = shapes[shapes.length - 1];
      const firstCy = first.y + first.h / 2;
      const lastCy = last.y + last.h / 2;
      const step = (lastCy - firstCy) / (shapes.length - 1);
      shapes.forEach((s, i) => {
        if (i === 0 || i === shapes.length - 1) return;
        const cy = firstCy + i * step;
        s.y = Math.round(cy - s.h / 2);
      });
    }
    scheduleSave();
    renderCanvas();
  }

  function flipSelection(axis) {
    const page = activePage();
    let changed = false;
    for (const id of state.selectedShapeIds) {
      const sh = D.findShape(page, id);
      if (!sh) continue;
      if (axis === 'h') sh.flipH = !sh.flipH;
      else if (axis === 'v') sh.flipV = !sh.flipV;
      changed = true;
    }
    if (changed) { scheduleSave(); renderCanvas(); }
  }

  // ---------- Find / Replace ----------
  function findMatches(query, caseSensitive) {
    const results = [];
    if (!query) return results;
    const normalized = caseSensitive ? query : query.toLowerCase();
    for (let pi = 0; pi < diagram.pages.length; pi++) {
      const page = diagram.pages[pi];
      for (const s of page.shapes) {
        const txt = (s.text || '');
        const probe = caseSensitive ? txt : txt.toLowerCase();
        if (probe.includes(normalized)) {
          results.push({ pageIndex: pi, shapeId: s.id, text: txt });
        }
      }
    }
    return results;
  }

  function replaceInDiagram(query, replacement, caseSensitive) {
    const re = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      caseSensitive ? 'g' : 'gi'
    );
    let count = 0;
    for (const page of diagram.pages) {
      for (const s of page.shapes) {
        if (s.text && re.test(s.text)) {
          s.text = s.text.replace(re, replacement);
          count++;
          re.lastIndex = 0;
        }
      }
    }
    if (count) { scheduleSave(); renderCanvas(); }
    return count;
  }

  function jumpToMatch(match) {
    state.activePageId = diagram.pages[match.pageIndex].id;
    state.selectedShapeIds = new Set([match.shapeId]);
    state.selectedConnectorIds.clear();
    renderCanvas();
    renderPropertiesPanel();
  }

  // ---------- Phase 3 helpers ----------
  function setConnectorProp(field, value) {
    const page = activePage();
    let changed = false;
    for (const id of state.selectedConnectorIds) {
      const c = D.findConnector(page, id);
      if (c) { c[field] = value; changed = true; }
    }
    if (changed) { scheduleSave(); renderCanvas(); renderPropertiesPanel(); }
  }

  // Hierarchical (Sugiyama-lite) auto-layout: assign layers by BFS
  // depth from roots (shapes with no incoming connectors), then
  // arrange each layer left-to-right with even spacing.
  function autoLayoutHierarchical(page) {
    if (!page.shapes.length) return;
    const inDeg = new Map(page.shapes.map((s) => [s.id, 0]));
    const adj = new Map(page.shapes.map((s) => [s.id, []]));
    for (const c of page.connectors) {
      if (inDeg.has(c.toShapeId)) inDeg.set(c.toShapeId, inDeg.get(c.toShapeId) + 1);
      if (adj.has(c.fromShapeId)) adj.get(c.fromShapeId).push(c.toShapeId);
    }
    const layer = new Map();
    const queue = page.shapes.filter((s) => inDeg.get(s.id) === 0).map((s) => s.id);
    if (!queue.length && page.shapes.length) queue.push(page.shapes[0].id);
    for (const id of queue) layer.set(id, 0);
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      const l = layer.get(id);
      for (const next of adj.get(id) || []) {
        const nextLayer = l + 1;
        if (!layer.has(next) || layer.get(next) < nextLayer) {
          layer.set(next, nextLayer);
          queue.push(next);
        }
      }
    }
    // Default un-layered shapes to layer 0 (disconnected nodes).
    for (const s of page.shapes) if (!layer.has(s.id)) layer.set(s.id, 0);

    // Bucket by layer.
    const buckets = new Map();
    for (const s of page.shapes) {
      const l = layer.get(s.id);
      if (!buckets.has(l)) buckets.set(l, []);
      buckets.get(l).push(s);
    }
    const layers = [...buckets.keys()].sort((a, b) => a - b);
    const ySpacing = 140;
    const xSpacing = 200;
    const startX = 100;
    const startY = 100;
    for (let li = 0; li < layers.length; li++) {
      const l = layers[li];
      const shapes = buckets.get(l);
      const rowY = startY + li * ySpacing;
      shapes.forEach((s, i) => {
        s.x = startX + i * xSpacing;
        s.y = rowY;
      });
    }
  }

  // Force-directed (spring-electric) auto-layout. Light-weight,
  // suitable for ~50 shapes; not a Fruchterman-Reingold textbook
  // implementation but produces readable layouts.
  function autoLayoutForceDirected(page, iterations) {
    const shapes = page.shapes;
    if (shapes.length < 2) return;
    const k = 120;          // ideal edge length
    const repulsion = 8000; // node-node repulsion strength
    const damp = 0.85;
    const adj = new Map(shapes.map((s) => [s.id, new Set()]));
    for (const c of page.connectors) {
      if (adj.has(c.fromShapeId)) adj.get(c.fromShapeId).add(c.toShapeId);
      if (adj.has(c.toShapeId))   adj.get(c.toShapeId).add(c.fromShapeId);
    }
    // Velocity state.
    const vel = new Map(shapes.map((s) => [s.id, { vx: 0, vy: 0 }]));
    for (let iter = 0; iter < iterations; iter++) {
      for (const a of shapes) {
        let fx = 0, fy = 0;
        const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
        // Repulsion from every other shape.
        for (const b of shapes) {
          if (a === b) continue;
          const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
          const dx = acx - bcx, dy = acy - bcy;
          const distSq = Math.max(dx * dx + dy * dy, 100);
          const f = repulsion / distSq;
          fx += (dx / Math.sqrt(distSq)) * f;
          fy += (dy / Math.sqrt(distSq)) * f;
        }
        // Spring attraction along edges.
        for (const otherId of adj.get(a.id)) {
          const b = shapes.find((s) => s.id === otherId);
          if (!b) continue;
          const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
          const dx = bcx - acx, dy = bcy - acy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (dist - k) * 0.05;
          fx += (dx / dist) * f;
          fy += (dy / dist) * f;
        }
        const v = vel.get(a.id);
        v.vx = (v.vx + fx) * damp;
        v.vy = (v.vy + fy) * damp;
      }
      for (const s of shapes) {
        const v = vel.get(s.id);
        s.x = Math.max(20, Math.min(page.w - s.w - 20, s.x + v.vx));
        s.y = Math.max(20, Math.min(page.h - s.h - 20, s.y + v.vy));
      }
    }
    for (const s of shapes) { s.x = Math.round(s.x); s.y = Math.round(s.y); }
  }

  // AutoConnect: when a single shape is selected and the cursor is
  // near (but outside) its edge, show 4 small blue arrows that drop a
  // pre-connected copy of the most-recently-used stencil on click.
  // The state is tracked in canvas-level event listeners below.
  let lastDroppedStencil = 'rectangle';
  function renderAutoConnectArrows(shadow) {
    shadow.querySelectorAll('.autoconnect-arrow').forEach((el) => el.remove());
    if (state.selectedShapeIds.size !== 1) return;
    const page = activePage();
    const sh = D.findShape(page, [...state.selectedShapeIds][0]);
    if (!sh) return;
    const arrows = [
      { dir: 'top',    x: sh.x + sh.w / 2 - 8, y: sh.y - 22, glyph: '▲', port: 'top',    place: { dx: 0,           dy: -120 } },
      { dir: 'right',  x: sh.x + sh.w + 8,     y: sh.y + sh.h / 2 - 8, glyph: '▶', port: 'right',  place: { dx: 160,         dy: 0 } },
      { dir: 'bottom', x: sh.x + sh.w / 2 - 8, y: sh.y + sh.h + 8, glyph: '▼', port: 'bottom', place: { dx: 0,           dy: 120 } },
      { dir: 'left',   x: sh.x - 22,           y: sh.y + sh.h / 2 - 8, glyph: '◀', port: 'left',   place: { dx: -160,        dy: 0 } },
    ];
    for (const a of arrows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'autoconnect-arrow';
      btn.textContent = a.glyph;
      btn.style.left = a.x + 'px';
      btn.style.top = a.y + 'px';
      btn.title = `AutoConnect ${a.dir}`;
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cx = sh.x + sh.w / 2 + a.place.dx;
        const cy = sh.y + sh.h / 2 + a.place.dy;
        const newShape = dropStencilAt(lastDroppedStencil, cx, cy, { suppressSelect: true });
        if (!newShape) return;
        const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[a.port];
        const theme = THEMES_MOD.getTheme(diagram.theme);
        page.connectors.push(D.newConnector({
          fromShapeId: sh.id, toShapeId: newShape.id,
          fromPort: a.port, toPort: opposite,
          stroke: theme.stroke, layerId: activeLayer().id,
        }));
        scheduleSave();
        renderCanvas();
      });
      shadow.appendChild(btn);
    }
  }

  // Connector bend handles: midpoints of each segment become drag
  // handles that insert a new waypoint. Existing waypoints become
  // draggable round handles.
  function renderConnectorHandles(shadow) {
    shadow.querySelectorAll('.connector-handle').forEach((el) => el.remove());
    if (state.selectedConnectorIds.size !== 1) return;
    const page = activePage();
    const c = D.findConnector(page, [...state.selectedConnectorIds][0]);
    if (!c) return;
    const fromShape = page.shapes.find((s) => s.id === c.fromShapeId);
    const toShape   = page.shapes.find((s) => s.id === c.toShapeId);
    if (!fromShape || !toShape) return;
    const a = R.portPoint(fromShape, c.fromPort);
    const b = R.portPoint(toShape, c.toPort);
    const points = [a, ...(c.waypoints || []), b];
    // Existing waypoints
    (c.waypoints || []).forEach((wp, idx) => {
      const h = document.createElement('div');
      h.className = 'connector-handle waypoint';
      h.style.left = (wp.x - 5) + 'px';
      h.style.top = (wp.y - 5) + 'px';
      h.addEventListener('mousedown', (e) => startWaypointDrag(e, c, idx));
      shadow.appendChild(h);
    });
    // Midpoint "add" handles between consecutive points
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i + 1];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const h = document.createElement('div');
      h.className = 'connector-handle midpoint';
      h.style.left = (mid.x - 4) + 'px';
      h.style.top = (mid.y - 4) + 'px';
      h.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        c.waypoints = c.waypoints || [];
        c.waypoints.splice(i, 0, mid);
        startWaypointDrag(e, c, i);
      });
      shadow.appendChild(h);
    }
  }

  function startWaypointDrag(e, conn, idx) {
    e.stopPropagation();
    e.preventDefault();
    const shadow = $('#canvasShadow');
    drag = {
      mode: 'waypoint',
      connId: conn.id,
      waypointIdx: idx,
      hasMoved: false,
    };
    // Reuse the document-level mousemove via a custom branch below.
    function move(ev) {
      const pt = eventToPagePoint(ev, shadow);
      conn.waypoints[idx] = { x: Math.round(pt.x), y: Math.round(pt.y) };
      drag.hasMoved = true;
      renderCanvas();
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (drag && drag.hasMoved) scheduleSave();
      drag = null;
      renderCanvas();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function applyTextStyle(opts) {
    const page = activePage();
    let changed = false;
    for (const id of state.selectedShapeIds) {
      const sh = D.findShape(page, id);
      if (!sh) continue;
      sh.textStyle = sh.textStyle || {};
      if (opts.toggle && 'bold' in opts) sh.textStyle.bold = !sh.textStyle.bold;
      else if (opts.toggle && 'italic' in opts) sh.textStyle.italic = !sh.textStyle.italic;
      else if (opts.align) sh.textStyle.align = opts.align;
      changed = true;
    }
    if (changed) { scheduleSave(); renderCanvas(); }
  }

  function bindRibbonCommands() {
    $$('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (commands[cmd]) commands[cmd](btn);
      });
    });

    // Color / size inputs that affect selected shapes
    $('#shapeFill').addEventListener('change', (e) => {
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) { sh.fill = e.target.value; sh._themed = false; }
      }
      scheduleSave(); renderCanvas(); renderPropertiesPanel();
    });
    $('#shapeStroke').addEventListener('change', (e) => {
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) { sh.stroke = e.target.value; sh._themed = false; }
      }
      for (const cid of state.selectedConnectorIds) {
        const c = D.findConnector(page, cid);
        if (c) { c.stroke = e.target.value; c._themed = false; }
      }
      scheduleSave(); renderCanvas(); renderPropertiesPanel();
    });
    $('#shapeStrokeWidth').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value) || 0;
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) sh.strokeWidth = v;
      }
      scheduleSave(); renderCanvas(); renderPropertiesPanel();
    });
    $('#shapeOpacity').addEventListener('input', (e) => {
      const v = Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100));
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) sh.opacity = v;
      }
      scheduleSave(); renderCanvas(); renderPropertiesPanel();
    });
    $('#textColor').addEventListener('change', (e) => {
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) { sh.textStyle = sh.textStyle || {}; sh.textStyle.color = e.target.value; }
      }
      scheduleSave(); renderCanvas();
    });
    $('#fontSize').addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10) || 14;
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) { sh.textStyle = sh.textStyle || {}; sh.textStyle.fontSize = v; }
      }
      scheduleSave(); renderCanvas();
    });
    $('#fontFamily').addEventListener('change', (e) => {
      const v = e.target.value;
      const page = activePage();
      for (const id of state.selectedShapeIds) {
        const sh = D.findShape(page, id);
        if (sh) { sh.textStyle = sh.textStyle || {}; sh.textStyle.fontFamily = v; }
      }
      scheduleSave(); renderCanvas();
    });

    // Design controls
    $('#snapToggle').addEventListener('change', (e) => { state.snapToGrid = e.target.checked; });
    $('#gridToggle').addEventListener('change', (e) => { state.showGrid = e.target.checked; renderCanvas(); });
    $('#rulersToggle').addEventListener('change', (e) => { state.showRulers = e.target.checked; renderCanvas(); });
    $('#pageSizeSelect').addEventListener('change', (e) => {
      const [w, h] = e.target.value.split(',').map(Number);
      const page = activePage();
      page.w = w; page.h = h;
      scheduleSave();
      renderCanvas();
    });
    $('#pageBgColor').addEventListener('change', (e) => {
      const page = activePage();
      page.bg = e.target.value;
      scheduleSave();
      renderCanvas();
    });

    // Title
    $('#diagramTitle').addEventListener('input', (e) => {
      diagram.title = e.target.value;
      scheduleSave();
    });

    // Toolbar buttons in the title bar
    $('#stencilToggleBtn').addEventListener('click', () => commands.toggleStencils());
    $('#sideToggleBtn').addEventListener('click', () => commands.toggleSidePane());
    $('#helpBtn').addEventListener('click', () => commands.showHelp());
  }

  // ---------- Help modal ----------
  function showHelpModal(title, html) {
    $('#helpInfoTitle').textContent = title;
    $('#helpInfoBody').innerHTML = html;
    $('#helpInfoModal').hidden = false;
  }
  function bindHelpModal() {
    $('#helpInfoCloseBtn').addEventListener('click', () => { $('#helpInfoModal').hidden = true; });
    $('#helpInfoDoneBtn').addEventListener('click', () => { $('#helpInfoModal').hidden = true; });
  }

  // ---------- Save / Open ----------
  function bindSaveDialog() {
    const dlg = $('#saveDialog');
    $('#saveDialogCloseBtn').addEventListener('click', () => dlg.close());
    $('#saveDialogCancelBtn').addEventListener('click', (e) => { e.preventDefault(); dlg.close(); });
    $('#saveDialogSaveBtn').addEventListener('click', (e) => {
      e.preventDefault();
      const name = ($('#saveDialogName').value || 'diagram').replace(/[^\w\-]+/g, '_') || 'diagram';
      const format = $('#saveDialogFormat').value;
      diagram.title = $('#diagramTitle').value || name;
      saveDiagramAs(format, name);
      dlg.close();
    });
  }

  async function saveDiagramAs(format, baseName) {
    const name = baseName || (diagram.title || 'diagram').replace(/[^\w\-]+/g, '_');
    try {
      let blob, ext;
      switch (format) {
        case 'vsdx': blob = IO.saveVsdx(diagram); ext = 'vsdx'; break;
        case 'svg':  blob = new Blob([IO.exportSvg(diagram)], { type: 'image/svg+xml' }); ext = 'svg'; break;
        case 'png':  blob = await IO.exportPng(diagram, { scale: 2 }); ext = 'png'; break;
        case 'pdf':  blob = await IO.exportPdf(diagram); ext = 'pdf'; break;
        default: throw new Error('Unknown format: ' + format);
      }
      downloadBlob(blob, `${name}.${ext}`);
    } catch (err) {
      alert(`Save as .${format} failed: ${err.message || err}`);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function bindOpenFile() {
    $('#openFileInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // reset so reopening the same file fires
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      try {
        if (ext === 'vsdx' || ext === 'vsdm') {
          const buf = await file.arrayBuffer();
          const next = await IO.loadVsdx(buf);
          next.title = next.title || file.name.replace(/\.[^.]+$/, '');
          sanitizeDiagram(next);
          diagram = next;
          state.activePageId = diagram.pages[0].id;
          state.selectedShapeIds.clear();
          state.selectedConnectorIds.clear();
          $('#diagramTitle').value = diagram.title;
          scheduleSave();
          renderAll();
        } else if (ext === 'svg') {
          // Wrap the imported SVG as a single shape on a new page so the
          // user can keep editing in our format.
          const text = await file.text();
          const blobUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
          alert('SVG imported as a reference image — open it in any image editor for source-level edits.');
          URL.revokeObjectURL(blobUrl);
        } else {
          alert('Unsupported file type. Open .vsdx or .vsdm files.');
        }
      } catch (err) {
        alert(`Open failed: ${err.message || err}`);
      }
    });
  }

  // ---------- Ask Claude ----------
  // Same wiring pattern as slides/app.js initAskClaudePanel.
  function bindAskClaude() {
    const button = $('#askClaudeBtn');
    const panel = $('#askClaudePanel');
    const close = $('#askClaudeCloseBtn');
    const input = $('#askClaudeInput');
    const keyInput = $('#askClaudeKey');
    const send = $('#askClaudeSendBtn');
    const output = $('#askClaudeOutput');
    const form = panel?.querySelector('form');
    if (!button || !panel) return;
    let busy = false;

    const setOutput = (message, kind = '') => {
      if (!output) return;
      output.hidden = !message;
      output.textContent = message || '';
      output.classList.toggle('status', kind === 'status');
      output.classList.toggle('error', kind === 'error');
    };

    const updateSend = () => {
      if (!send) return;
      send.disabled = busy || !keyInput?.value.trim() || !input?.value.trim();
    };

    const setOpen = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) (keyInput?.value.trim() ? input : keyInput)?.focus();
    };

    button.addEventListener('click', () => setOpen(panel.hidden));
    close?.addEventListener('click', () => {
      setOpen(false);
      button.focus();
    });
    panel.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-claude-prompt]');
      if (!chip || !input) return;
      input.value = chip.dataset.claudePrompt || chip.textContent.trim();
      updateSend();
      if (keyInput && !keyInput.value.trim()) keyInput.focus();
      else { input.focus(); input.select(); }
    });
    keyInput?.addEventListener('input', updateSend);
    input?.addEventListener('input', updateSend);
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy || !input || !keyInput) return;
      let apiKey = keyInput.value.trim();
      const prompt = input.value.trim();
      if (!apiKey || !prompt) { updateSend(); return; }
      keyInput.value = '';
      busy = true;
      updateSend();
      setOutput('Claude is thinking...', 'status');
      try {
        const result = await window.RodmanClaude.sendClaudeMessage({
          apiKey,
          system: 'You are Claude inside RodmanVision. Help the user design clear diagrams — flowcharts, BPMN, network topologies, and Visio-style drawings. Propose shape choices, layout improvements, and labels the user can apply manually. Be concise.',
          messages: [{ role: 'user', content: prompt }],
        });
        setOutput(result.text || 'Claude returned an empty response.');
      } catch (err) {
        setOutput(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        apiKey = '';
        busy = false;
        updateSend();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) setOpen(false);
    });
    updateSend();
  }

  // ---------- Keyboard shortcuts ----------
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (state.isEditingText) return;
      const target = e.target;
      const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Save dialog: Ctrl/Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        commands.showSaveDialog();
        return;
      }
      // Find: Ctrl/Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        commands.showFind();
        return;
      }
      // Undo / Redo: Ctrl/Cmd+Z (shift = redo) and Ctrl/Cmd+Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) commands.redo();
        else commands.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        commands.redo();
        return;
      }
      // Group / Ungroup: Ctrl/Cmd+G, Ctrl/Cmd+Shift+G
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) commands.ungroup();
        else commands.group();
        return;
      }
      if (inField && target.id === 'diagramTitle') return;
      if (inField) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        commands.deleteSelection();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        commands.copy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        commands.paste();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        commands.cut();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        commands.duplicateSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        commands.selectAll();
      } else if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commands.zoomIn();
      } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commands.zoomOut();
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commands.zoom100();
      } else if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 10 : 1;
        const page = activePage();
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (dx || dy) {
          for (const id of state.selectedShapeIds) {
            const sh = D.findShape(page, id);
            if (sh) { sh.x += dx; sh.y += dy; }
          }
          if (state.selectedShapeIds.size) {
            e.preventDefault();
            scheduleSave();
            renderCanvas();
          }
        }
      }
    });
  }

  // ---------- Bootstrap ----------
  function renderAll() {
    renderStencilDrawer();
    renderThemeStrip();
    renderLayersPanel();
    renderCanvas();
    renderPropertiesPanel();
  }

  function bootstrap() {
    $('#diagramTitle').value = diagram.title;
    bindTabs();
    bindStencilSearch();
    bindSideTabs();
    bindLayersToolbar();
    bindRibbonCommands();
    bindSaveDialog();
    bindOpenFile();
    bindAskClaude();
    bindHelpModal();
    bindFindDialog();
    bindPropertyInputs();
    bindKeyboard();
    renderAll();
    setSaveIndicator('saved');
    // Seed the history stack with the initial diagram so the first
    // undo never empties out below an unsaved state.
    pushHistory();
    // Keep rulers redraw in sync with viewport changes.
    window.addEventListener('resize', () => { if (state.showRulers) renderRulers(); });
    $('#canvasScroll')?.addEventListener('scroll', () => { if (state.showRulers) renderRulers(); });
    // Resize fit-to-window on first paint
    setTimeout(() => commands.zoomFit(), 0);
  }

  function bindFindDialog() {
    const dlg = $('#findDialog');
    if (!dlg) return;
    const input = $('#findInput');
    const replInput = $('#findReplaceInput');
    const caseChk = $('#findCaseChk');
    const resultsEl = $('#findResults');
    const status = $('#findStatus');

    function renderResults() {
      const q = input.value;
      const cs = caseChk.checked;
      resultsEl.innerHTML = '';
      if (!q) {
        status.textContent = '';
        return;
      }
      const matches = findMatches(q, cs);
      status.textContent = matches.length === 0
        ? 'No matches.'
        : `${matches.length} match${matches.length === 1 ? '' : 'es'}`;
      matches.forEach((m, i) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'find-result';
        const page = diagram.pages[m.pageIndex];
        item.textContent = `${page.name}: ${m.text.slice(0, 60)}`;
        item.addEventListener('click', () => {
          jumpToMatch(m);
        });
        resultsEl.appendChild(item);
      });
    }

    input.addEventListener('input', renderResults);
    caseChk.addEventListener('change', renderResults);
    $('#findCloseBtn').addEventListener('click', () => dlg.close());
    $('#findReplaceBtn').addEventListener('click', (e) => {
      e.preventDefault();
      const q = input.value;
      if (!q) return;
      const cs = caseChk.checked;
      const count = replaceInDiagram(q, replInput.value, cs);
      status.textContent = count === 0
        ? 'No replacements made.'
        : `Replaced ${count} occurrence${count === 1 ? '' : 's'}.`;
      renderResults();
    });
  }

  // ---------- Misc utilities ----------
  function ensureHex(color) {
    if (!color) return '#000000';
    let c = String(color).trim().replace(/^#/, '');
    if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return '#000000';
    return '#' + c.toLowerCase();
  }
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
