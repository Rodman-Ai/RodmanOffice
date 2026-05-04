/* RodmanSlides — main app.
 *
 * Three-tier state:
 *   1. window.RodmanDeck — pure data model + storage helpers
 *   2. The state object below — current selection, view mode, zoom, etc.
 *   3. DOM — re-rendered from state on every dispatch
 *
 * Single IIFE under 'use strict'. Sections, in rough order:
 *   - State + constants
 *   - Autosave + bootstrap
 *   - Tab switching (ribbon)
 *   - Slide list rendering + thumbnail painting
 *   - Editor canvas rendering + zoom
 *   - Element interaction: select, drag, resize, double-click-to-edit
 *   - Ribbon command dispatch
 *   - Theme + transition strips
 *   - File operations (open / save / export PDF)
 *   - Present mode wiring
 *   - Keyboard shortcuts
 */
(function () {
  'use strict';

  const D = window.RodmanDeck;
  const T = window.RodmanThemes;
  const R = window.RodmanRender;
  const P = window.RodmanPresent;

  // ---------- State ----------
  let deck = D.load() || D.newDeck();
  sanitizeDeck(deck);
  let state = {
    selectedSlideId: deck.slides[0].id,
    selectedElementId: null,
    zoom: 1,            // 1 = fit; auto-computed in layoutEditor()
    autoFit: true,
    viewMode: 'normal', // 'normal' | 'sorter'
    showNotes: false,
    transitionPreview: null, // string, last clicked transition card
    isEditingText: false,
  };

  // ---------- Autosave ----------
  let saveTimer = null;
  function scheduleSave() {
    setSaveIndicator('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = D.save(deck);
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

  // ---------- Helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function activeSlide() {
    return D.findSlide(deck, state.selectedSlideId) || deck.slides[0];
  }
  function selectedElement() {
    if (!state.selectedElementId) return null;
    return D.findElement(activeSlide(), state.selectedElementId);
  }

  // ---------- Multi-selection ----------
  // state.selectedElementId holds the *primary* (last-clicked) selection
  // for back-compat with single-element ops (formatting, properties).
  // state.selectedElementIds is the full set; populated alongside.
  state.selectedElementIds = new Set();

  function setSelection(ids, primary) {
    state.selectedElementIds = ids instanceof Set ? new Set(ids) : new Set(ids || []);
    state.selectedElementId = primary != null
      ? primary
      : (state.selectedElementIds.size ? [...state.selectedElementIds].pop() : null);
  }
  function clearSelection() { setSelection([], null); }
  function isSelected(id) { return state.selectedElementIds.has(id); }
  function selectedElements() {
    const slide = activeSlide();
    return [...state.selectedElementIds]
      .map((id) => D.findElement(slide, id))
      .filter(Boolean);
  }

  function sanitizeDeck(targetDeck) {
    if (!targetDeck || !Array.isArray(targetDeck.slides)) return targetDeck;
    targetDeck.slides.forEach((slide) => {
      (slide.elements || []).forEach((el) => {
        if (el.kind === 'text') el.html = R.sanitizeTextHtml(el.html);
      });
    });
    return targetDeck;
  }

  // ---------- Image format panel (visible only when an image is selected) ----------
  function syncImageFormatPanel() {
    const group = $('#imageFormatGroup');
    if (!group) return;
    const el = selectedElement();
    if (el && el.kind === 'image') {
      group.hidden = false;
      const adj = el.adjust || {};
      $('#adjBrightness').value = adj.brightness != null ? adj.brightness : 100;
      $('#adjContrast').value   = adj.contrast   != null ? adj.contrast   : 100;
      $('#adjOpacity').value    = adj.opacity    != null ? adj.opacity    : 100;
      $('#adjRadius').value     = adj.radius     != null ? adj.radius     : 0;
    } else {
      group.hidden = true;
    }
  }
  let _animBound = false;
  function bindAnimationControls() {
    if (_animBound) return;
    _animBound = true;
    ['#animTrigger', '#animDuration'].forEach((sel) => {
      const inp = $(sel);
      if (!inp) return;
      inp.addEventListener('input', () => {
        const els = selectedElements();
        els.forEach((el) => {
          if (!el.animation) return;
          el.animation.trigger = $('#animTrigger').value;
          el.animation.durationMs = parseInt($('#animDuration').value, 10);
        });
        scheduleSave();
      });
    });
  }

  let _imageSlidersBound = false;
  function bindImageAdjustSliders() {
    if (_imageSlidersBound) return;
    _imageSlidersBound = true;
    const ids = [['adjBrightness', 'brightness'], ['adjContrast', 'contrast'], ['adjOpacity', 'opacity'], ['adjRadius', 'radius']];
    ids.forEach(([elId, key]) => {
      const inp = $('#' + elId);
      if (!inp) return;
      inp.addEventListener('input', () => {
        const el = selectedElement();
        if (!el || el.kind !== 'image') return;
        if (!el.adjust) el.adjust = {};
        el.adjust[key] = parseInt(inp.value, 10);
        // Live update: tweak the rendered <img> directly, no full re-render.
        const node = stageEl && stageEl.querySelector(`[data-element-id="${el.id}"] img`);
        if (node) {
          const a = el.adjust;
          node.style.filter = `brightness(${a.brightness != null ? a.brightness : 100}%) contrast(${a.contrast != null ? a.contrast : 100}%)`;
          node.style.opacity = String((a.opacity != null ? a.opacity : 100) / 100);
          node.style.borderRadius = (a.radius || 0) + 'px';
        }
        scheduleSave();
      });
    });
  }

  // ---------- Initial render ----------
  function bootstrap() {
    // Ensure selected slide still exists (e.g., after deck reset)
    if (!D.findSlide(deck, state.selectedSlideId)) {
      state.selectedSlideId = deck.slides[0].id;
    }
    setDeckTitleInput();
    paintThemeStrip();
    paintThemeSwatches();
    paintTransitionStrip();
    renderSlideList();
    renderEditor();
    updateStatusBar();
    setSaveIndicator('saved');
    bindImageAdjustSliders();
    bindAnimationControls();
  }

  // ---------- Deck title ----------
  function setDeckTitleInput() { $('#deckTitle').value = deck.title; }
  $('#deckTitle').addEventListener('input', (e) => {
    deck.title = e.target.value || 'Untitled Presentation';
    scheduleSave();
  });

  // ---------- Tabs ----------
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $$('.tab').forEach((t) => { t.classList.remove('active'); t.removeAttribute('aria-selected'); });
    $$('.ribbon-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const panel = $(`.ribbon-panel[data-panel="${tab.dataset.tab}"]`);
    if (panel) panel.classList.add('active');
  });

  // ---------- Theme strip ----------
  function paintThemeStrip() {
    const strip = $('#themeStrip');
    strip.innerHTML = '';
    T.names().forEach((name) => {
      const t = T.get(name);
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.dataset.theme = name;
      if (deck.theme === name) card.classList.add('active');
      card.style.background = t.background;
      card.innerHTML = `
        <div class="tc-bar" style="background:${t.primary}"></div>
        <div class="tc-block" style="background:${t.titleColor};top:18px;width:60%"></div>
        <div class="tc-block" style="background:${t.bodyColor};top:30px;width:80%;height:5px"></div>
        <div class="tc-name">${t.name}</div>
      `;
      card.addEventListener('click', () => applyTheme(name));
      strip.appendChild(card);
    });
  }

  function applyTheme(name) {
    deck.theme = name;
    paintThemeStrip();
    paintThemeSwatches();
    renderEditor();
    renderSlideList();
    updateStatusBar();
    scheduleSave();
  }

  function paintThemeSwatches() {
    const host = $('#themeSwatches');
    if (!host) return;
    host.innerHTML = '';
    T.getPalette(deck.theme).forEach((hex) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'theme-swatch';
      sw.title = hex;
      sw.style.background = hex;
      sw.addEventListener('click', () => {
        $('#shapeFill').value = hex;
        // If a shape is selected, recolor it immediately.
        const el = selectedElement();
        if (el && el.kind === 'shape') {
          el.fill = hex;
          renderEditor(); scheduleSave();
        }
      });
      host.appendChild(sw);
    });
  }

  // ---------- Transition strip ----------
  function paintTransitionStrip() {
    const strip = $('#transitionStrip');
    strip.innerHTML = '';
    const icons = { none: '⊝', fade: '◐', push: '⇉', wipe: '▥', zoom: '⊕' };
    P.TRANSITION_KINDS.forEach((kind) => {
      const card = document.createElement('div');
      card.className = 'transition-card';
      card.dataset.kind = kind;
      const slide = activeSlide();
      if ((slide.transition?.kind || 'none') === kind) card.classList.add('active');
      card.innerHTML = `<span class="tc-icon">${icons[kind] || '·'}</span><span>${kind}</span>`;
      card.addEventListener('click', () => {
        slide.transition = { kind, durationMs: 400 };
        paintTransitionStrip();
        scheduleSave();
      });
      strip.appendChild(card);
    });
  }

  // ---------- Slide list ----------
  function renderSlideList() {
    const list = $('#slideList');
    list.innerHTML = '';
    deck.slides.forEach((slide, i) => {
      const item = document.createElement('div');
      item.className = 'slide-list-item';
      if (slide.id === state.selectedSlideId) item.classList.add('active');
      item.dataset.slideId = slide.id;
      item.draggable = true;
      item.innerHTML = `
        <div class="sli-num">${i + 1}</div>
        <div class="sli-thumb"></div>
      `;
      const thumb = item.querySelector('.sli-thumb');
      const scale = 184 / 1280;
      requestAnimationFrame(() => {
        const stageEl = document.createElement('div');
        thumb.appendChild(stageEl);
        stageEl.className = 'thumb-stage';
        Object.assign(stageEl.style, {
          width: '1280px', height: '720px',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute', top: 0, left: 0,
        });
        T.applyToStage(stageEl, deck.theme);
        R.renderSlide(stageEl, slide, { editable: false, selectedId: null });
      });
      item.addEventListener('click', () => {
        state.selectedSlideId = slide.id;
        clearSelection();
        renderSlideList();
        renderEditor();
        paintTransitionStrip();
        updateStatusBar();
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (deck.slides.length > 1 && confirm(`Delete slide ${i + 1}?`)) {
          D.removeSlide(deck, slide.id);
          if (state.selectedSlideId === slide.id) {
            state.selectedSlideId = deck.slides[Math.max(0, i - 1)].id;
          }
          renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
        }
      });

      // Drag-to-reorder. dragstart stores the source slide id;
      // dragover marks the drop target with a visual cue and
      // chooses before/after based on cursor Y; drop calls
      // D.moveSlide and re-renders.
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-rodman-slide-id', slide.id);
        item.classList.add('is-dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        list.querySelectorAll('.is-drop-before, .is-drop-after').forEach((n) => {
          n.classList.remove('is-drop-before', 'is-drop-after');
        });
      });
      item.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('application/x-rodman-slide-id')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = item.getBoundingClientRect();
        const isBefore = (e.clientY - r.top) < r.height / 2;
        item.classList.toggle('is-drop-before', isBefore);
        item.classList.toggle('is-drop-after', !isBefore);
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('is-drop-before', 'is-drop-after');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('application/x-rodman-slide-id');
        if (!sourceId || sourceId === slide.id) return;
        const r = item.getBoundingClientRect();
        const isBefore = (e.clientY - r.top) < r.height / 2;
        const targetIdx = deck.slides.findIndex((s) => s.id === slide.id);
        if (targetIdx === -1) return;
        D.moveSlide(deck, sourceId, isBefore ? targetIdx : targetIdx + (deck.slides.findIndex((s) => s.id === sourceId) < targetIdx ? 0 : 1));
        renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
      });

      list.appendChild(item);
    });
  }

  // Add-slide button at the bottom of the slide list
  $('#addSlideBottom').addEventListener('click', () => {
    cmd_newSlide();
  });

  // ---------- Editor (slide canvas) ----------
  let stageEl, stageShadowEl;
  function renderEditor() {
    if (state.viewMode === 'sorter') {
      $('#editorScroll').hidden = true;
      $('#sorterArea').hidden = false;
      renderSorter();
      return;
    }
    $('#editorScroll').hidden = false;
    $('#sorterArea').hidden = true;

    stageEl = $('#stage');
    stageShadowEl = $('#stageShadow');
    T.applyToStage(stageEl, deck.theme);
    const slide = activeSlide();
    R.renderSlide(stageEl, slide, {
      editable: true,
      selectedId: state.selectedElementId,
      selectedIds: state.selectedElementIds,
    });
    layoutEditor();
    if (state.showNotes) {
      $('#notesArea').value = slide.notes || '';
    }
    syncImageFormatPanel();
  }

  function layoutEditor() {
    if (!stageEl) return;
    const scroll = $('#editorScroll');
    const availW = scroll.clientWidth - 48;
    const availH = scroll.clientHeight - 48;
    const fitScale = Math.min(availW / 1280, availH / 720);
    const z = state.autoFit ? Math.max(0.1, fitScale) : state.zoom;
    state.zoom = z;
    stageEl.style.transform = `scale(${z})`;
    stageShadowEl.style.width = (1280 * z) + 'px';
    stageShadowEl.style.height = (720 * z) + 'px';
    stageShadowEl.style.position = 'relative';
    stageShadowEl.style.overflow = 'hidden';
    $('#zoomDisplay').textContent = Math.round(z * 100) + '%';
    $('#statusZoom').textContent = Math.round(z * 100) + '%';
  }

  window.addEventListener('resize', () => {
    if (state.autoFit) layoutEditor();
  });

  // ---------- Element interaction (click/drag/resize/edit) ----------
  let drag = null;

  function onStageMouseDown(e) {
    if (state.isEditingText) return;
    const handle = e.target.closest('.resize-handle');
    if (handle) {
      const el = selectedElement();
      if (!el) return;
      drag = {
        kind: 'resize',
        dir: handle.dataset.dir,
        startX: e.clientX, startY: e.clientY,
        start: { x: el.x, y: el.y, w: el.w, h: el.h },
      };
      e.preventDefault();
      return;
    }

    const elNode = e.target.closest('.slide-element');
    if (!elNode) {
      // Clicked empty stage → deselect (unless shift-modifier "preserve")
      if (!e.shiftKey) clearSelection();
      renderEditor();
      return;
    }
    const elId = elNode.dataset.elementId;
    if (e.shiftKey) {
      // Toggle: shift-click an already-selected element removes it,
      // shift-click an unselected element adds it. Last-touched
      // becomes the new primary.
      const next = new Set(state.selectedElementIds);
      if (next.has(elId)) {
        next.delete(elId);
        const primary = next.size ? [...next].pop() : null;
        setSelection(next, primary);
      } else {
        next.add(elId);
        setSelection(next, elId);
      }
    } else if (!state.selectedElementIds.has(elId)) {
      // Click on an unselected element → start fresh single selection
      setSelection([elId], elId);
    } else {
      // Click on an already-selected element keeps the multi-select
      // intact and just promotes this one to primary so subsequent
      // formatting / resize affect it.
      setSelection(state.selectedElementIds, elId);
    }
    renderEditor();

    // Begin group drag — capture starting positions for every selected
    // element so we can move them all together.
    const slide = activeSlide();
    const sel = [...state.selectedElementIds]
      .map((id) => D.findElement(slide, id))
      .filter(Boolean);
    if (!sel.length) return;
    drag = {
      kind: 'move',
      startX: e.clientX, startY: e.clientY,
      starts: sel.map((el) => ({ id: el.id, x: el.x, y: el.y })),
    };
    e.preventDefault();
  }

  function onStageMouseMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / state.zoom;
    const dy = (e.clientY - drag.startY) / state.zoom;

    if (drag.kind === 'resize') {
      const el = selectedElement();
      if (!el) return;
      const r = R.applyResize(drag.start, drag.dir, dx, dy);
      el.x = Math.round(r.x); el.y = Math.round(r.y);
      el.w = Math.round(r.w); el.h = Math.round(r.h);
      updateElementNode(el);
      drawSnapGuides([]);
      return;
    }

    // kind === 'move': move every dragged element by the same (dx, dy),
    // optionally snapped against sibling edges + slide center when
    // exactly one element is being dragged.
    let snapDx = dx, snapDy = dy;
    let guides = [];
    if (drag.starts.length === 1) {
      const startEl = drag.starts[0];
      const moving = D.findElement(activeSlide(), startEl.id);
      if (moving) {
        const snapped = computeSnap(moving, startEl.x + dx, startEl.y + dy);
        snapDx = snapped.x - startEl.x;
        snapDy = snapped.y - startEl.y;
        guides = snapped.guides;
      }
    }

    const slide = activeSlide();
    drag.starts.forEach((start) => {
      const el = D.findElement(slide, start.id);
      if (!el) return;
      el.x = Math.round(start.x + snapDx);
      el.y = Math.round(start.y + snapDy);
      updateElementNode(el);
    });
    drawSnapGuides(guides);
  }

  function updateElementNode(el) {
    const node = stageEl.querySelector(`[data-element-id="${el.id}"]`);
    if (node) {
      node.style.left = el.x + 'px';
      node.style.top = el.y + 'px';
      node.style.width = el.w + 'px';
      node.style.height = el.h + 'px';
    }
  }

  // ---------- Smart alignment guides + snap ----------
  const SNAP_THRESHOLD = 6; // px, in stage coords
  function computeSnap(movingEl, proposedX, proposedY) {
    const slide = activeSlide();
    const w = movingEl.w, h = movingEl.h;
    const movingEdgesX = [proposedX, proposedX + w / 2, proposedX + w]; // left, center, right
    const movingEdgesY = [proposedY, proposedY + h / 2, proposedY + h]; // top, middle, bottom

    // Candidate snap targets: each sibling element's three edges + slide center.
    const SLIDE_W = D.SLIDE_W, SLIDE_H = D.SLIDE_H;
    const targetsX = [SLIDE_W / 2];
    const targetsY = [SLIDE_H / 2];
    for (const el of slide.elements) {
      if (el.id === movingEl.id) continue;
      targetsX.push(el.x, el.x + el.w / 2, el.x + el.w);
      targetsY.push(el.y, el.y + el.h / 2, el.y + el.h);
    }

    let bestDx = null, bestEdgeIdxX = -1, bestTargetX = null;
    for (let mi = 0; mi < movingEdgesX.length; mi++) {
      for (const t of targetsX) {
        const d = t - movingEdgesX[mi];
        if (Math.abs(d) <= SNAP_THRESHOLD && (bestDx === null || Math.abs(d) < Math.abs(bestDx))) {
          bestDx = d; bestEdgeIdxX = mi; bestTargetX = t;
        }
      }
    }
    let bestDy = null, bestEdgeIdxY = -1, bestTargetY = null;
    for (let mi = 0; mi < movingEdgesY.length; mi++) {
      for (const t of targetsY) {
        const d = t - movingEdgesY[mi];
        if (Math.abs(d) <= SNAP_THRESHOLD && (bestDy === null || Math.abs(d) < Math.abs(bestDy))) {
          bestDy = d; bestEdgeIdxY = mi; bestTargetY = t;
        }
      }
    }

    const finalX = proposedX + (bestDx || 0);
    const finalY = proposedY + (bestDy || 0);
    const guides = [];
    if (bestDx !== null) guides.push({ kind: 'v', x: bestTargetX });
    if (bestDy !== null) guides.push({ kind: 'h', y: bestTargetY });
    return { x: finalX, y: finalY, guides };
  }

  function drawSnapGuides(guides) {
    if (!stageEl) return;
    let layer = stageEl.querySelector('.snap-guide-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'snap-guide-layer';
      Object.assign(layer.style, {
        position: 'absolute', inset: '0',
        pointerEvents: 'none',
        zIndex: 999,
      });
      stageEl.appendChild(layer);
    }
    layer.innerHTML = '';
    for (const g of guides) {
      const ln = document.createElement('div');
      Object.assign(ln.style, {
        position: 'absolute',
        background: '#ff44dd',
        boxShadow: '0 0 0 0.5px #ff44dd',
        pointerEvents: 'none',
      });
      if (g.kind === 'v') {
        Object.assign(ln.style, { left: g.x + 'px', top: '0', width: '1px', height: '100%' });
      } else {
        Object.assign(ln.style, { left: '0', top: g.y + 'px', width: '100%', height: '1px' });
      }
      layer.appendChild(ln);
    }
  }

  function onStageMouseUp() {
    if (!drag) return;
    drag = null;
    drawSnapGuides([]);
    renderEditor();
    scheduleSave();
  }

  function onStageDoubleClick(e) {
    const elNode = e.target.closest('.slide-element');
    if (!elNode) return;
    const el = D.findElement(activeSlide(), elNode.dataset.elementId);
    if (!el) return;

    // Table cells: dblclick the cell to edit its text.
    if (el.kind === 'table') {
      const cell = e.target.closest('td, th');
      if (!cell) return;
      const r = parseInt(cell.dataset.r, 10);
      const c = parseInt(cell.dataset.c, 10);
      cell.contentEditable = 'true';
      cell.focus();
      state.isEditingText = true;
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      cell.addEventListener('blur', () => {
        if (!el.cells[r]) el.cells[r] = [];
        el.cells[r][c] = cell.textContent;
        cell.contentEditable = 'false';
        state.isEditingText = false;
        scheduleSave();
      }, { once: true });
      return;
    }

    // Video placeholder: dblclick re-prompts for URL.
    if (el.kind === 'video') {
      const url = window.prompt('Video URL:', el.src || '');
      if (url === null) return;
      el.src = url;
      renderEditor(); scheduleSave();
      return;
    }

    if (el.kind !== 'text') return;
    const inner = elNode.querySelector('.slide-text');
    if (!inner) return;
    state.isEditingText = true;
    inner.contentEditable = 'true';
    inner.focus();
    const range = document.createRange();
    range.selectNodeContents(inner);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);

    inner.addEventListener('blur', () => {
      el.html = R.sanitizeTextHtml(inner.innerHTML);
      state.isEditingText = false;
      inner.contentEditable = 'false';
      scheduleSave();
    }, { once: true });
  }

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('#stage')) onStageMouseDown(e);
  });
  document.addEventListener('mousemove', onStageMouseMove);
  document.addEventListener('mouseup', onStageMouseUp);
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('#stage')) onStageDoubleClick(e);
  });

  // ---------- Sorter view ----------
  function renderSorter() {
    const grid = $('#sorterGrid');
    grid.innerHTML = '';
    deck.slides.forEach((slide, i) => {
      const item = document.createElement('div');
      item.className = 'slide-list-item';
      if (slide.id === state.selectedSlideId) item.classList.add('active');
      item.innerHTML = `
        <div class="sli-num">${i + 1}</div>
        <div class="sli-thumb"></div>
      `;
      const thumb = item.querySelector('.sli-thumb');
      const stageEl = document.createElement('div');
      thumb.appendChild(stageEl);
      stageEl.style.cssText = 'width:1280px;height:720px;transform-origin:top left;position:absolute;top:0;left:0';
      // 220px width target for sorter (responsive grid uses minmax 220px)
      const targetW = 220;
      stageEl.style.transform = `scale(${targetW / 1280})`;
      T.applyToStage(stageEl, deck.theme);
      R.renderSlide(stageEl, slide, { editable: false });
      item.addEventListener('click', () => {
        state.selectedSlideId = slide.id;
        clearSelection();
        state.viewMode = 'normal';
        renderSlideList(); renderEditor(); updateStatusBar();
      });
      grid.appendChild(item);
    });
  }

  // ---------- Ribbon command dispatch ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.ribbon-btn[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    const handler = COMMANDS[cmd];
    if (handler) { e.preventDefault(); handler(btn); }
  });

  function cmd_newSlide() {
    const layout = $('#layoutSelect').value || 'titleAndContent';
    const i = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
    const slide = D.addSlide(deck, { layout, afterIndex: i });
    state.selectedSlideId = slide.id;
    clearSelection();
    renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
  }

  const COMMANDS = {
    newSlide: cmd_newSlide,
    duplicateSlide() {
      const dup = D.duplicateSlide(deck, state.selectedSlideId);
      if (dup) state.selectedSlideId = dup.id;
      renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
    },
    deleteSlide() {
      if (deck.slides.length <= 1) return;
      const i = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
      const removed = D.removeSlide(deck, state.selectedSlideId);
      if (removed) {
        state.selectedSlideId = deck.slides[Math.max(0, i - 1)].id;
        clearSelection();
        renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
      }
    },
    deleteElement() {
      const slide = activeSlide();
      if (!state.selectedElementIds.size) return;
      [...state.selectedElementIds].forEach((id) => D.removeElement(slide, id));
      clearSelection();
      renderEditor(); scheduleSave();
    },
    duplicateElement() {
      const slide = activeSlide();
      if (!state.selectedElementIds.size) return;
      const newIds = [];
      [...state.selectedElementIds].forEach((id) => {
        const original = D.findElement(slide, id);
        if (!original) return;
        const copy = D.cloneElement(original);
        copy.x += 20; copy.y += 20;
        slide.elements.push(copy);
        newIds.push(copy.id);
      });
      if (newIds.length) setSelection(newIds, newIds[newIds.length - 1]);
      renderEditor(); scheduleSave();
    },
    bringForward() {
      const slide = activeSlide();
      if (!state.selectedElementId) return;
      D.bringForward(slide, state.selectedElementId);
      renderEditor(); scheduleSave();
    },
    sendBackward() {
      const slide = activeSlide();
      if (!state.selectedElementId) return;
      D.sendBackward(slide, state.selectedElementId);
      renderEditor(); scheduleSave();
    },

    // Text formatting (delegate to execCommand while a text element is being edited)
    bold() { document.execCommand('bold'); persistEditingText(); },
    italic() { document.execCommand('italic'); persistEditingText(); },
    underline() { document.execCommand('underline'); persistEditingText(); },
    alignLeft() { applyAlign('left'); },
    alignCenter() { applyAlign('center'); },
    alignRight() { applyAlign('right'); },
    bulletList() {
      const inner = currentEditingTextNode();
      if (inner) {
        document.execCommand('insertUnorderedList');
        persistEditingText();
      }
    },
    numberedList() {
      const inner = currentEditingTextNode();
      if (inner) {
        document.execCommand('insertOrderedList');
        persistEditingText();
      }
    },
    indent() {
      const inner = currentEditingTextNode();
      if (inner) {
        document.execCommand('indent');
        persistEditingText();
      }
    },
    outdent() {
      const inner = currentEditingTextNode();
      if (inner) {
        document.execCommand('outdent');
        persistEditingText();
      }
    },
    insertLink() {
      // Two paths:
      // - If a text element is being edited and there's a selection,
      //   wrap that selection in <a>.
      // - Otherwise the active element gets an `href`; clicking it in
      //   present mode opens the URL.
      const inner = currentEditingTextNode();
      if (inner) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          alert('Select some text first, then click the link button.');
          return;
        }
        const url = window.prompt('Link URL:', 'https://');
        if (!url) return;
        document.execCommand('createLink', false, url);
        persistEditingText();
        return;
      }
      const el = selectedElement();
      if (!el) return;
      const url = window.prompt('Link URL (opens in present mode):', el.href || 'https://');
      if (url === null) return;
      el.href = url || null;
      renderEditor(); scheduleSave();
    },

    insertText() {
      const slide = activeSlide();
      slide.elements.push(D.newTextElement({
        x: 360, y: 300, w: 560, h: 100,
        html: 'Click to edit', role: 'free',
        fontSize: 24, fontWeight: 400, align: 'left',
      }));
      setSelection([slide.elements[slide.elements.length - 1].id], slide.elements[slide.elements.length - 1].id);
      renderEditor(); scheduleSave();
    },
    insertImage() { $('#imageFileInput').click(); },
    insertVideo() {
      const url = window.prompt('Video URL — YouTube, Vimeo, or a direct .mp4 link:', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      if (!url) return;
      const slide = activeSlide();
      slide.elements.push(D.newVideoElement({
        x: 240, y: 160, w: 800, h: 450, src: url,
      }));
      const elId = slide.elements[slide.elements.length - 1].id;
      setSelection([elId], elId);
      renderEditor(); scheduleSave();
    },
    setAnim(btn) {
      const kind = btn.dataset.animKind;
      const els = selectedElements();
      if (!els.length) {
        alert('Select an element first, then choose an animation.');
        return;
      }
      const trigger = $('#animTrigger') ? $('#animTrigger').value : 'onEnter';
      const durationMs = $('#animDuration') ? parseInt($('#animDuration').value, 10) : 500;
      els.forEach((el) => {
        if (kind === 'none') {
          delete el.animation;
        } else {
          el.animation = { kind, trigger, durationMs };
        }
      });
      scheduleSave();
    },
    insertTable() {
      const dim = window.prompt('Table size (rows × cols):', '3 × 3');
      if (!dim) return;
      const m = dim.match(/(\d+)\s*[xX×]\s*(\d+)/);
      const rows = m ? Math.max(1, Math.min(20, parseInt(m[1], 10))) : 3;
      const cols = m ? Math.max(1, Math.min(12, parseInt(m[2], 10))) : 3;
      const slide = activeSlide();
      slide.elements.push(D.newTableElement({
        x: 240, y: 200, w: 800, h: 60 + rows * 40, rows, cols,
      }));
      const elId = slide.elements[slide.elements.length - 1].id;
      setSelection([elId], elId);
      renderEditor(); scheduleSave();
    },
    insertShape(btn) {
      const shape = btn.dataset.shape || 'rect';
      const slide = activeSlide();
      const fill = $('#shapeFill').value || '#b7472a';
      const dims = shape === 'line' || shape === 'arrow'
        ? { x: 360, y: 360, w: 560, h: 30 }
        : { x: 480, y: 250, w: 320, h: 220 };
      slide.elements.push(D.newShapeElement({
        ...dims, shape, fill, strokeWidth: 0,
      }));
      setSelection([slide.elements[slide.elements.length - 1].id], slide.elements[slide.elements.length - 1].id);
      renderEditor(); scheduleSave();
    },

    applyTransitionToAll() {
      const cur = activeSlide().transition || { kind: 'none', durationMs: 400 };
      deck.slides.forEach((s) => { s.transition = { ...cur }; });
      paintTransitionStrip();
      scheduleSave();
    },

    // File / deck
    newDeck() {
      if (!confirm('Discard current deck and start a new one?')) return;
      deck = D.newDeck();
      state.selectedSlideId = deck.slides[0].id;
      clearSelection();
      bootstrap();
      scheduleSave();
    },
    openDeck() { $('#deckFileInput').click(); },
    saveDeck() {
      const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (deck.title || 'presentation').replace(/[^\w\-]+/g, '_') + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    importPptx() { $('#pptxFileInput').click(); },
    exportPptx() {
      if (!window.RodmanSlidesIO || !window.RodmanSlidesIO.savePptx) {
        alert('PPTX engine failed to load. Reload the page and try again.');
        return;
      }
      try {
        const blob = window.RodmanSlidesIO.savePptx(deck);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (deck.title || 'presentation').replace(/[^\w\-]+/g, '_') + '.pptx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch (err) {
        alert('Could not export .pptx: ' + (err.message || err));
      }
    },
    exportPdf() { exportToPdf(); },
    resetDeck() {
      if (!confirm('Wipe local deck storage and start fresh? This cannot be undone.')) return;
      D.clear();
      deck = D.newDeck();
      state.selectedSlideId = deck.slides[0].id;
      clearSelection();
      bootstrap();
    },

    // Undo/redo not implemented yet — placeholder
    undo() { /* roadmap */ },
    redo() { /* roadmap */ },

    // View
    toggleNotes() {
      state.showNotes = !state.showNotes;
      $('#notesPane').hidden = !state.showNotes;
      document.querySelector('.workspace').classList.toggle('with-notes', state.showNotes);
      if (state.showNotes) $('#notesArea').value = activeSlide().notes || '';
      layoutEditor();
    },
    toggleSorter() {
      state.viewMode = state.viewMode === 'sorter' ? 'normal' : 'sorter';
      renderEditor();
    },
    zoomIn() { state.autoFit = false; state.zoom = Math.min(4, state.zoom + 0.1); layoutEditor(); },
    zoomOut() { state.autoFit = false; state.zoom = Math.max(0.1, state.zoom - 0.1); layoutEditor(); },
    zoomFit() { state.autoFit = true; layoutEditor(); },

    presentFromStart() { startPresent(0); },
    presentFromCurrent() {
      const idx = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
      startPresent(Math.max(0, idx));
    },
  };

  function currentEditingTextNode() {
    const focus = document.activeElement;
    if (focus && focus.classList && focus.classList.contains('slide-text')) return focus;
    return null;
  }
  function persistEditingText() {
    const inner = currentEditingTextNode();
    if (!inner) return;
    const wrap = inner.closest('.slide-element');
    if (!wrap) return;
    const el = D.findElement(activeSlide(), wrap.dataset.elementId);
    if (el) el.html = R.sanitizeTextHtml(inner.innerHTML);
    scheduleSave();
  }

  function applyAlign(dir) {
    const el = selectedElement();
    if (!el || el.kind !== 'text') return;
    el.align = dir;
    renderEditor(); scheduleSave();
  }

  // ---------- File inputs ----------
  $('#imageFileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const slide = activeSlide();
      slide.elements.push(D.newImageElement({
        x: 320, y: 180, w: 640, h: 360, src: reader.result,
      }));
      setSelection([slide.elements[slide.elements.length - 1].id], slide.elements[slide.elements.length - 1].id);
      renderEditor(); scheduleSave();
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  });

  $('#deckFileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!D.validate(obj)) { alert('That file does not look like a RodmanSlides deck.'); return; }
        deck = sanitizeDeck(obj);
        state.selectedSlideId = deck.slides[0].id;
        clearSelection();
        bootstrap();
        scheduleSave();
      } catch (err) {
        alert('Could not parse JSON: ' + err.message);
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  $('#pptxFileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!window.RodmanSlidesIO || !window.RodmanSlidesIO.loadPptx) {
      alert('PPTX engine failed to load. Reload the page and try again.');
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      const imported = await window.RodmanSlidesIO.loadPptx(buf);
      // Merge imported shape into the deck shape the editor expects: keep
      // the existing theme, take over title + slides.
      const fresh = D.newDeck();
      fresh.title = imported.title || f.name.replace(/\.pptx$/i, '');
      fresh.slides = imported.slides;
      deck = sanitizeDeck(fresh);
      state.selectedSlideId = deck.slides[0] ? deck.slides[0].id : null;
      clearSelection();
      bootstrap();
      scheduleSave();
    } catch (err) {
      alert('Could not import .pptx: ' + (err.message || err));
    }
  });

  // ---------- Notes pane ----------
  $('#notesArea').addEventListener('input', (e) => {
    activeSlide().notes = e.target.value;
    scheduleSave();
  });

  // ---------- Font/color/size handlers (Home tab) ----------
  $('#fontFamily').addEventListener('change', (e) => {
    const el = selectedElement();
    if (!el || el.kind !== 'text') return;
    el.fontFamily = e.target.value || null;
    renderEditor(); scheduleSave();
  });
  $('#fontSize').addEventListener('change', (e) => {
    const el = selectedElement();
    if (!el || el.kind !== 'text') return;
    el.fontSize = parseInt(e.target.value, 10) || 24;
    renderEditor(); scheduleSave();
  });
  $('#textColor').addEventListener('input', (e) => {
    const el = selectedElement();
    if (!el || el.kind !== 'text') return;
    el.color = e.target.value;
    renderEditor(); scheduleSave();
  });
  $('#shapeFill').addEventListener('input', (e) => {
    const el = selectedElement();
    if (!el || el.kind !== 'shape') return;
    el.fill = e.target.value;
    renderEditor(); scheduleSave();
  });
  $('#layoutSelect').addEventListener('change', (e) => {
    // Apply layout to current slide by replacing its elements with the
    // layout's defaults, but only if the slide is empty or user confirms.
    const slide = activeSlide();
    if (slide.elements.length > 0) {
      if (!confirm('Replace this slide\'s contents with the new layout?')) {
        e.target.value = slide.layout;
        return;
      }
    }
    slide.layout = e.target.value;
    slide.elements = D.LAYOUTS[slide.layout] ? D.LAYOUTS[slide.layout]() : [];
    renderEditor(); renderSlideList(); scheduleSave();
  });
  $('#slideSizeSelect').addEventListener('change', (e) => {
    if (e.target.value === '4:3') { deck.size = { w: 1024, h: 768 }; }
    else { deck.size = { w: 1280, h: 720 }; }
    // Note: stage element is hardcoded to 1280x720 in CSS for v1; full
    // 4:3 support would require dynamic stage sizing. Save the
    // preference for round-trip but warn:
    if (deck.size.w !== 1280) {
      alert('4:3 mode is saved with the deck but the editor stage stays 16:9 in this version.');
    }
    scheduleSave();
  });

  // ---------- Status bar ----------
  function updateStatusBar() {
    const idx = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
    $('#statusSlideCounter').textContent = `Slide ${idx + 1} of ${deck.slides.length}`;
    $('#statusTheme').textContent = T.get(deck.theme).name;
  }

  // ---------- Present mode ----------
  function startPresent(startIdx) {
    P.start({
      deck,
      startIndex: startIdx,
      onExit() {
        // Restore focus to editor
        renderEditor();
      },
    });
  }
  $('#presentBtn').addEventListener('click', () => startPresent(0));
  $('#helpBtn').addEventListener('click', () => {
    alert(
      'RodmanSlides keyboard shortcuts:\n\n' +
      'Ctrl/⌘ + N  — New slide\n' +
      'Ctrl/⌘ + D  — Duplicate slide\n' +
      'Ctrl/⌘ + B/I/U — Bold / Italic / Underline\n' +
      'Delete      — Delete selected element\n' +
      'F5          — Present from start\n' +
      'Esc (in present mode) — Exit\n' +
      'Arrow keys / Space (in present mode) — Navigate'
    );
  });

  // ---------- Export to PDF (via window.print) ----------
  function exportToPdf() {
    // Build a hidden .print-deck that contains rendered copies of every slide.
    const existing = document.querySelector('.print-deck');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'print-deck';
    document.body.appendChild(wrap);

    deck.slides.forEach((slide) => {
      const stage = document.createElement('div');
      stage.className = 'print-slide';
      wrap.appendChild(stage);
      T.applyToStage(stage, deck.theme);
      R.renderSlide(stage, slide, { editable: false });
    });

    // Trigger print and clean up afterwards
    setTimeout(() => {
      window.print();
      setTimeout(() => wrap.remove(), 500);
    }, 100);
  }

  // ---------- Element clipboard (in-memory, cross-slide) ----------
  // Stores cloned element JSON (no DOM references). Survives switching
  // slides; lost on page reload (mirrors how Photoshop / PowerPoint's
  // app-local clipboard works for object selections).
  let elementClipboard = [];

  function copySelectionToClipboard(cut) {
    if (!state.selectedElementIds.size) return false;
    const slide = activeSlide();
    elementClipboard = [...state.selectedElementIds]
      .map((id) => D.findElement(slide, id))
      .filter(Boolean)
      .map((el) => JSON.parse(JSON.stringify(el)));
    if (cut) COMMANDS.deleteElement();
    return true;
  }
  function pasteFromClipboard() {
    if (!elementClipboard.length) return;
    const slide = activeSlide();
    const newIds = [];
    elementClipboard.forEach((tpl) => {
      const copy = D.cloneElement(tpl);
      copy.x += 20; copy.y += 20;
      slide.elements.push(copy);
      newIds.push(copy.id);
    });
    setSelection(newIds, newIds[newIds.length - 1]);
    renderEditor(); scheduleSave();
  }

  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input or contentEditable
    const tag = (e.target.tagName || '').toLowerCase();
    const isFormField = tag === 'input' || tag === 'textarea' || tag === 'select';
    const isEditableEl = e.target.isContentEditable;

    if (e.key === 'F5' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); startPresent(0); return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
      // Note: browser will hijack Ctrl+N; we still try
      e.preventDefault(); cmd_newSlide(); return;
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      // Ctrl+D: duplicate selected element(s) if any are selected,
      // otherwise duplicate the slide (the original behaviour).
      e.preventDefault();
      if (state.selectedElementIds.size && !isEditableEl) COMMANDS.duplicateElement();
      else COMMANDS.duplicateSlide();
      return;
    }
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); COMMANDS.insertLink(); return;
    }

    // Clipboard operations only fire when we're not capturing the
    // browser's native clipboard for text editing.
    if (mod && !isEditableEl && !isFormField) {
      if (e.key === 'c' || e.key === 'C') {
        if (copySelectionToClipboard(false)) e.preventDefault();
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        if (copySelectionToClipboard(true)) e.preventDefault();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        if (elementClipboard.length) { e.preventDefault(); pasteFromClipboard(); }
        return;
      }
    }

    if (!isFormField && !isEditableEl) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementIds.size) {
        e.preventDefault();
        COMMANDS.deleteElement();
        return;
      }
      // Arrow nudging — only when one or more elements are selected.
      // Empty selection falls through to slide navigation below.
      if (state.selectedElementIds.size && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft')  dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp')    dy = -step;
        if (e.key === 'ArrowDown')  dy = step;
        const slide = activeSlide();
        [...state.selectedElementIds].forEach((id) => {
          const el = D.findElement(slide, id);
          if (!el) return;
          el.x += dx; el.y += dy;
          updateElementNode(el);
        });
        e.preventDefault(); scheduleSave(); return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const i = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
        if (i < deck.slides.length - 1) {
          state.selectedSlideId = deck.slides[i + 1].id;
          clearSelection();
          renderSlideList(); renderEditor(); updateStatusBar();
        }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const i = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
        if (i > 0) {
          state.selectedSlideId = deck.slides[i - 1].id;
          clearSelection();
          renderSlideList(); renderEditor(); updateStatusBar();
        }
        return;
      }
    }

    // Tab/Shift+Tab inside a text edit: indent / outdent
    if (isEditableEl && e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      persistEditingText();
      return;
    }
  });

  // ---------- Drag & drop image onto stage ----------
  ['dragover', 'drop'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      if (!e.target.closest('#stage') && !e.target.closest('#editorScroll')) return;
      e.preventDefault();
      if (evt !== 'drop') return;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const slide = activeSlide();
        slide.elements.push(D.newImageElement({
          x: 320, y: 180, w: 640, h: 360, src: reader.result,
        }));
        setSelection([slide.elements[slide.elements.length - 1].id], slide.elements[slide.elements.length - 1].id);
        renderEditor(); scheduleSave();
      };
      reader.readAsDataURL(f);
    });
  });

  // ---------- Boot ----------
  bootstrap();
})();
