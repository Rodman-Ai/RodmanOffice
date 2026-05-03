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

  // ---------- Initial render ----------
  function bootstrap() {
    // Ensure selected slide still exists (e.g., after deck reset)
    if (!D.findSlide(deck, state.selectedSlideId)) {
      state.selectedSlideId = deck.slides[0].id;
    }
    setDeckTitleInput();
    paintThemeStrip();
    paintTransitionStrip();
    renderSlideList();
    renderEditor();
    updateStatusBar();
    setSaveIndicator('saved');
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
    renderEditor();
    renderSlideList();
    updateStatusBar();
    scheduleSave();
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
      item.innerHTML = `
        <div class="sli-num">${i + 1}</div>
        <div class="sli-thumb"></div>
      `;
      const thumb = item.querySelector('.sli-thumb');
      // Thumb wrapper is ~184px wide (16:9 aspect → ~104px tall),
      // so scale 1280→184 = 0.144. Apply theme to the thumb stage.
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
      item.addEventListener('click', (e) => {
        if (e.shiftKey) {
          // Reserved for future multi-select
        }
        state.selectedSlideId = slide.id;
        state.selectedElementId = null;
        renderSlideList();
        renderEditor();
        paintTransitionStrip();
        updateStatusBar();
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // Simple context: confirm to delete
        if (deck.slides.length > 1 && confirm(`Delete slide ${i + 1}?`)) {
          D.removeSlide(deck, slide.id);
          if (state.selectedSlideId === slide.id) {
            state.selectedSlideId = deck.slides[Math.max(0, i - 1)].id;
          }
          renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
        }
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
    });
    layoutEditor();
    if (state.showNotes) {
      $('#notesArea').value = slide.notes || '';
    }
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
      // Clicked empty stage → deselect
      state.selectedElementId = null;
      renderEditor();
      return;
    }
    const elId = elNode.dataset.elementId;
    state.selectedElementId = elId;
    renderEditor();

    // Begin drag
    const el = selectedElement();
    if (!el) return;
    drag = {
      kind: 'move',
      startX: e.clientX, startY: e.clientY,
      start: { x: el.x, y: el.y },
    };
    e.preventDefault();
  }

  function onStageMouseMove(e) {
    if (!drag) return;
    const el = selectedElement();
    if (!el) return;
    const dx = (e.clientX - drag.startX) / state.zoom;
    const dy = (e.clientY - drag.startY) / state.zoom;
    if (drag.kind === 'move') {
      el.x = Math.round(drag.start.x + dx);
      el.y = Math.round(drag.start.y + dy);
    } else if (drag.kind === 'resize') {
      const r = R.applyResize(drag.start, drag.dir, dx, dy);
      el.x = Math.round(r.x); el.y = Math.round(r.y);
      el.w = Math.round(r.w); el.h = Math.round(r.h);
    }
    // Live update: just adjust style, full re-render on mouseup
    const node = stageEl.querySelector(`[data-element-id="${el.id}"]`);
    if (node) {
      node.style.left = el.x + 'px';
      node.style.top = el.y + 'px';
      node.style.width = el.w + 'px';
      node.style.height = el.h + 'px';
    }
  }

  function onStageMouseUp() {
    if (!drag) return;
    drag = null;
    renderEditor();
    scheduleSave();
  }

  function onStageDoubleClick(e) {
    const elNode = e.target.closest('.slide-element');
    if (!elNode) return;
    const el = D.findElement(activeSlide(), elNode.dataset.elementId);
    if (!el || el.kind !== 'text') return;
    const inner = elNode.querySelector('.slide-text');
    if (!inner) return;
    state.isEditingText = true;
    inner.contentEditable = 'true';
    inner.focus();
    // Place caret at end
    const range = document.createRange();
    range.selectNodeContents(inner);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);

    inner.addEventListener('blur', () => {
      el.html = inner.innerHTML;
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
        state.selectedElementId = null;
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
    state.selectedElementId = null;
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
        state.selectedElementId = null;
        renderSlideList(); renderEditor(); updateStatusBar(); scheduleSave();
      }
    },
    deleteElement() {
      const slide = activeSlide();
      if (!state.selectedElementId) return;
      D.removeElement(slide, state.selectedElementId);
      state.selectedElementId = null;
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

    insertText() {
      const slide = activeSlide();
      slide.elements.push(D.newTextElement({
        x: 360, y: 300, w: 560, h: 100,
        html: 'Click to edit', role: 'free',
        fontSize: 24, fontWeight: 400, align: 'left',
      }));
      state.selectedElementId = slide.elements[slide.elements.length - 1].id;
      renderEditor(); scheduleSave();
    },
    insertImage() { $('#imageFileInput').click(); },
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
      state.selectedElementId = slide.elements[slide.elements.length - 1].id;
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
      state.selectedElementId = null;
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
      state.selectedElementId = null;
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
    if (el) el.html = inner.innerHTML;
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
      state.selectedElementId = slide.elements[slide.elements.length - 1].id;
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
        deck = obj;
        state.selectedSlideId = deck.slides[0].id;
        state.selectedElementId = null;
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
      deck = fresh;
      state.selectedSlideId = deck.slides[0] ? deck.slides[0].id : null;
      state.selectedElementId = null;
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
      e.preventDefault(); COMMANDS.duplicateSlide(); return;
    }

    if (!isFormField && !isEditableEl) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementId) {
        e.preventDefault();
        COMMANDS.deleteElement();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const i = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
        if (i < deck.slides.length - 1) {
          state.selectedSlideId = deck.slides[i + 1].id;
          state.selectedElementId = null;
          renderSlideList(); renderEditor(); updateStatusBar();
        }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const i = deck.slides.findIndex((s) => s.id === state.selectedSlideId);
        if (i > 0) {
          state.selectedSlideId = deck.slides[i - 1].id;
          state.selectedElementId = null;
          renderSlideList(); renderEditor(); updateStatusBar();
        }
        return;
      }
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
        state.selectedElementId = slide.elements[slide.elements.length - 1].id;
        renderEditor(); scheduleSave();
      };
      reader.readAsDataURL(f);
    });
  });

  // ---------- Boot ----------
  bootstrap();
})();
