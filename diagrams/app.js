/* RodmanDiagrams — main app.
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
    sideTab: 'properties',  // 'properties' | 'layers'
    panOpen: { stencils: true, side: true },
    clipboard: null,
    isEditingText: false,
  };

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
  function scheduleSave() {
    setSaveIndicator('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
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
  function renderStencilDrawer() {
    const list = $('#stencilList');
    list.innerHTML = '';
    const groups = STENCILS.stencilsByCategory();
    const filter = ($('#stencilSearch').value || '').trim().toLowerCase();

    for (const cat of STENCILS.CATEGORIES) {
      const items = groups[cat].filter((s) =>
        !filter || s.name.toLowerCase().includes(filter) || s.id.toLowerCase().includes(filter)
      );
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
      for (const stencil of items) {
        const tile = document.createElement('div');
        tile.className = 'stencil-tile';
        tile.draggable = true;
        tile.dataset.stencil = stencil.id;
        tile.title = stencil.name;
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
          // click-to-drop at canvas center
          dropStencilAt(stencil.id, activePage().w / 2, activePage().h / 2);
        });
        grid.appendChild(tile);
      }
      wrap.appendChild(grid);
      list.appendChild(wrap);
    }
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
    renderPageStrip();
    updateStatusBar();
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
        if (e.shiftKey) {
          if (state.selectedShapeIds.has(id)) state.selectedShapeIds.delete(id);
          else state.selectedShapeIds.add(id);
        } else if (!state.selectedShapeIds.has(id)) {
          state.selectedShapeIds.clear();
          state.selectedConnectorIds.clear();
          state.selectedShapeIds.add(id);
        }
        // Start a move drag carrying every selected shape.
        const page = activePage();
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
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const page = activePage();
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
    renderCanvas();
  });

  function dropStencilAt(stencilId, cx, cy) {
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
    state.selectedShapeIds.clear();
    state.selectedConnectorIds.clear();
    state.selectedShapeIds.add(shape.id);
    scheduleSave();
    renderCanvas();
    renderPropertiesPanel();
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
        alert('Diagrams need at least one layer.');
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
    group() { /* Placeholder: visual grouping; current model treats them as a multi-select. */ },
    ungroup() { /* Mirror of group(). */ },

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
      showHelpModal('About RodmanDiagrams',
        '<p>RodmanDiagrams is a browser-first Visio clone. Native format is VSDX (Visio OOXML/ZIP) — files round-trip cleanly with Microsoft Visio and LibreOffice Draw. Also exports to SVG, PNG and multi-page PDF.</p>' +
        `<p><a href="${HELP_REPO_URL}" target="_blank" rel="noopener">Source on GitHub</a></p>`);
    },
    askClaude() {
      const panel = $('#askClaudePanel');
      if (panel?.hidden) $('#askClaudeBtn')?.click();
      else ($('#askClaudeKey')?.value.trim() ? $('#askClaudeInput') : $('#askClaudeKey'))?.focus();
    },

    // Stubs for forward compatibility
    undo() { /* roadmap */ },
    redo() { /* roadmap */ },
  };

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
          system: 'You are Claude inside RodmanDiagrams. Help the user design clear diagrams — flowcharts, BPMN, network topologies, and Visio-style drawings. Propose shape choices, layout improvements, and labels the user can apply manually. Be concise.',
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
    bindPropertyInputs();
    bindKeyboard();
    renderAll();
    setSaveIndicator('saved');
    // Resize fit-to-window on first paint
    setTimeout(() => commands.zoomFit(), 0);
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
