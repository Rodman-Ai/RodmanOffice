(function () {
  'use strict';

  // ===========================================================
  //  RodmanWord — section index for app.js (~10,800 lines)
  // ===========================================================
  //  This file is one big IIFE. Major regions, top to bottom.
  //  Line numbers are approximate (±20). Re-derive after large
  //  edits with: `grep -n '// \(FEATURE\|IMPROVEMENT\|FOUNDATION\):' app.js`.
  //
  //     1 –   95   Globals: RW_BUILD, $/$$, DOM cache, store keys
  //    96 –  245   Ribbon: tab switching, dbl-click collapse,
  //                inline ribbon dropdown menus
  //   246 –  580   Editing core: selection helpers, exec(),
  //                font / size / colour swatches (recent colours),
  //                paragraph alignment + line/para spacing,
  //                lists (bulleted, numbered, multi-level, custom
  //                bullets, collapse-to-level), styles dropdown
  //   581 –  640   View-tab basics: spell-check, theme picker,
  //                ctrl-click links to open in a new tab
  //   641 – 2003   Find & Replace (highlight all, regex, whole-
  //                word, scope, format filter, saved searches),
  //                smart paste, autosave, init
  //  2004 – 2138   Undo/redo button state, double-click word →
  //                highlight all, default font/size, context menu,
  //                recent files w/ size in backstage
  //  2139 – 2900   Command palette, repeat-last, password export,
  //                custom CSS, mini map, compare, define/thesaurus,
  //                watermark, readability, mail merge, headers &
  //                footers, bookmarks, pull quote, code block,
  //                word art, sort selection
  //  2901 – 3164   Drop cap, auto-TOC, footnotes, FOUNDATION:
  //                live-field engine — page/pages/date/time/
  //                docTitle/author/wordCount + cross-refs/captions
  //  3165 – 3368   Grammar check + grammar pane
  //  3369 – 5604   100-feature-plan implementation, top-down by
  //                section letter (M cloud → L interop → K view →
  //                J search → I editing → H forms → G refs →
  //                F templates → E images → D lists → C tables →
  //                B doc model & styles)
  //  5605 – 5979   Review tab restructure (#1–#10)
  //  5980 – 6297   WebRTC P2P collab (Tier-1 #1)
  //  6298 – 6907   Cloud/FS save+open, macros, translate, Smart
  //                Compose, image crop+effects
  //  6908 – 7376   Drawing shapes / text box, form fields +
  //                document protection, print preview, outline
  //                collapse, charts, tab stops, line/para spacing,
  //                multi-level lists
  //  7377 – 7933   Track changes (insertions/deletions/accept/
  //                reject), section breaks, custom paragraph
  //                styles, citations + bibliography
  //  7934 – 8475   Equation editor (LaTeX → MathML), inline math,
  //                writing-goal celebration, print page numbers
  //  8476 – 8694   Format painter, clipboard, toast notifications,
  //                custom confirm, link modal, drag-drop importer
  //  8695 – 9076   Table mini-toolbar, image mini-toolbar
  //  9077 – 9624   Outline pane resize, word-count modal, Markdown
  //                export, version history, templates gallery,
  //                voice dictation, emoji picker, focus mode
  //  9625 –10046   Shortcuts cheatsheet, read-aloud, document
  //                properties, writing goal, auto-correct
  // 10047 –10252   Smart auto-format helpers, move paragraph,
  //                TSV/CSV smart paste, symbol shortcuts, share link
  // 10253 –10800   Lorem ipsum, reading mode, threaded comments,
  //                comments side panel, quick parts, change case
  //
  //  Plug-in modules attach to `window`:
  //     RodmanDocx   (docx.js)        OOXML save / load + ZIP utils
  //     RodmanPdf    (pdfio.js)       PDF save / load
  //     RodmanInterop(interop.js)     RTF / ODT / EPUB / AsciiDoc /
  //                                   LaTeX / Markdown FM
  //     RW_BUILD                      version + date + cache key
  //
  //  See ARCHITECTURE.md for the runtime model and FEATURES.md for
  //  a full per-tab catalogue.
  // ===========================================================

  // Single source of truth for the displayed version. Bump these
  // whenever you ship something users would call out as 'new'. The
  // service-worker cache version in sw.js should be kept in lock-step.
  // Date is the build date (the day the file was last edited).
  const RW_BUILD = {
    version: '2.1.0',
    date: '2026-05-02',
    cache: 'rwd-v10',
    label: 'RodmanWord 2.1',
  };
  window.RW_BUILD = RW_BUILD;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const editor = $('#editor');
  const docTitle = $('#docTitle');
  const ribbon = $('#ribbon');
  const page = $('#page');
  const statusWords = $('#statusWords');
  const statusChars = $('#statusChars');
  const statusPage = $('#statusPage');
  const statusSaved = $('#statusSaved');

  const STORE_KEY = 'rodmanword:doc';
  const STORE_TITLE = 'rodmanword:title';
  const STORE_HEADER = 'rodmanword:header';
  const STORE_FOOTER = 'rodmanword:footer';
  const STORE_PREFS = 'rodmanword:prefs';
  const STORE_RECENT = 'rodmanword:recent';

  const docHeader = document.getElementById('docHeader');
  const docFooter = document.getElementById('docFooter');

  // ---------- Tabs ----------
  // Word-style behaviour:
  //   single click — switch to that tab; if the ribbon is collapsed,
  //                  also auto-expand it.
  //   double click — collapse / expand the ribbon (toggle).
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (target === 'file') {
        openBackstage();
        return;
      }
      const wasCollapsed = ribbon.classList.contains('collapsed');
      const wasActive = tab.classList.contains('active');
      $$('.tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      $$('.ribbon-panel').forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === target);
      });
      // Switching to a different tab while collapsed expands the ribbon
      // and keeps it expanded; clicking the active tab while expanded
      // is a no-op (use double-click to collapse).
      if (wasCollapsed && !wasActive) {
        ribbon.classList.remove('collapsed');
      }
    });
    tab.addEventListener('dblclick', (e) => {
      // Don't ever route a dbl-click into File / backstage
      if (tab.dataset.tab === 'file') { e.preventDefault(); return; }
      ribbon.classList.toggle('collapsed');
    });
  });

  $('#toggleRibbonBtn').addEventListener('click', () => {
    ribbon.classList.toggle('collapsed');
  });

  // Inline ribbon dropdown menus (used by Insert → Pictures, Shapes)
  $$('.rwd-menu-host').forEach((host) => {
    const trigger = host.querySelector('.ribbon-btn');
    const menu = host.querySelector('.rwd-menu');
    if (!trigger || !menu) return;
    trigger.addEventListener('click', (e) => {
      // If the trigger has its own ID, treat the click as opening the
      // menu rather than running the trigger's other handler.
      e.stopPropagation();
      const opening = !menu.classList.contains('open');
      // Close every other open menu
      $$('.rwd-menu.open').forEach((m) => m.classList.remove('open'));
      if (opening) menu.classList.add('open');
    });
    // Clicking an item inside closes the menu after firing.
    menu.addEventListener('click', () => {
      setTimeout(() => menu.classList.remove('open'), 0);
    });
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.rwd-menu-host')) {
      $$('.rwd-menu.open').forEach((m) => m.classList.remove('open'));
    }
  });

  // ---------- Selection helpers ----------
  let savedRange = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedRange) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  editor.addEventListener('keyup', saveSelection);
  editor.addEventListener('mouseup', saveSelection);
  editor.addEventListener('focus', saveSelection);

  // ---------- Commands ----------
  function exec(cmd, value = null) {
    restoreSelection();
    document.execCommand(cmd, false, value);
    saveSelection();
    queueAutosave();
    updateToolbarState();
  }

  $$('[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      exec(btn.dataset.cmd);
    });
  });

  // Font family / size
  $('#fontFamily').addEventListener('change', (e) => {
    exec('fontName', e.target.value);
  });

  $('#fontSize').addEventListener('change', (e) => {
    const px = parseInt(e.target.value, 10);
    restoreSelection();
    document.execCommand('fontSize', false, '7');
    const fonts = editor.querySelectorAll('font[size="7"]');
    fonts.forEach((f) => {
      f.removeAttribute('size');
      f.style.fontSize = px + 'pt';
    });
    saveSelection();
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: Color swatches palette + recent colors
  // ============================================================
  const SWATCHES = [
    '#000000','#444444','#666666','#999999','#CCCCCC','#EEEEEE','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF',
    '#C00000','#E97132','#FFC000','#70AD47','#4472C4','#7030A0','#B83280','#0F6FC6','#222F3E','#E03E2D',
    '#F2C2C2','#FAD9C0','#FFE9B0','#D2E5C6','#CCD9EE','#D8C7E0','#F2D2DE','#BDDBEF','#A8B2BE','#F2C0BC',
  ];
  const STORE_RECENT_COLOR = 'rodmanword:recentColors';
  let recentColors = [];
  try { recentColors = JSON.parse(localStorage.getItem(STORE_RECENT_COLOR) || '[]'); } catch {}

  function rememberColor(hex) {
    recentColors = [hex, ...recentColors.filter((c) => c !== hex)].slice(0, 10);
    try { localStorage.setItem(STORE_RECENT_COLOR, JSON.stringify(recentColors)); } catch {}
  }

  let activeColorPopup = null;
  function openColorPopup(anchor, applyFn) {
    if (activeColorPopup) activeColorPopup.remove();
    const pop = document.createElement('div');
    pop.className = 'color-popup';
    SWATCHES.forEach((c) => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = c;
      s.title = c;
      s.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        applyFn(c);
        rememberColor(c);
        pop.remove();
        activeColorPopup = null;
      });
      pop.appendChild(s);
    });
    if (recentColors.length) {
      const hr = document.createElement('hr');
      pop.appendChild(hr);
      const row = document.createElement('div');
      row.className = 'row';
      row.textContent = 'Recent';
      pop.appendChild(row);
      recentColors.forEach((c) => {
        const s = document.createElement('div');
        s.className = 'swatch';
        s.style.background = c;
        s.title = c;
        s.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          applyFn(c);
          rememberColor(c);
          pop.remove();
          activeColorPopup = null;
        });
        pop.appendChild(s);
      });
    }
    const more = document.createElement('button');
    more.className = 'pick-btn';
    more.type = 'button';
    more.textContent = 'More colors…';
    more.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.style.position = 'fixed';
      inp.style.opacity = '0';
      document.body.appendChild(inp);
      inp.addEventListener('input', () => {
        applyFn(inp.value);
        rememberColor(inp.value);
        inp.remove();
      });
      inp.addEventListener('change', () => inp.remove());
      inp.click();
      pop.remove();
      activeColorPopup = null;
    });
    pop.appendChild(more);
    const r = anchor.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    activeColorPopup = pop;
    setTimeout(() => {
      document.addEventListener('mousedown', (ev) => {
        if (!pop.contains(ev.target)) { pop.remove(); activeColorPopup = null; }
      }, { once: true });
    }, 0);
  }

  // Replace native color inputs with swatch popups
  const foreColorBtn = document.querySelector('label.color[title="Font color"]');
  const hiliteColorBtn = document.querySelector('label.color[title="Highlight color"]');
  if (foreColorBtn) {
    const inp = foreColorBtn.querySelector('input');
    if (inp) inp.remove();
    foreColorBtn.style.cursor = 'pointer';
    foreColorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
    });
    foreColorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openColorPopup(foreColorBtn, (c) => exec('foreColor', c));
    });
  }
  if (hiliteColorBtn) {
    const inp = hiliteColorBtn.querySelector('input');
    if (inp) inp.remove();
    hiliteColorBtn.style.cursor = 'pointer';
    hiliteColorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
    });
    hiliteColorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openColorPopup(hiliteColorBtn, (c) => {
        if (!document.execCommand('hiliteColor', false, c)) exec('backColor', c);
        saveSelection();
        queueAutosave();
      });
    });
  }

  // Block style
  $('#blockStyle').addEventListener('change', (e) => {
    exec('formatBlock', e.target.value);
  });

  // ---------- Insert: image, link, table, etc ----------
  $('#insertImageBtn').addEventListener('click', () => {
    saveSelection();
    $('#imagePicker').click();
  });

  $('#imagePicker').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      exec('insertImage', reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  $('#insertLinkBtn').addEventListener('click', openLinkModal);

  $('#insertDateBtn').addEventListener('click', () => {
    saveSelection();
    $('#calInput').value = new Date().toISOString().slice(0, 10);
    openModal($('#calModal'));
  });
  $('#calInsertBtn').addEventListener('click', () => {
    const v = $('#calInput').value;
    if (!v) { closeModal($('#calModal')); return; }
    const date = new Date(v + 'T00:00:00');
    const fmt = $('#calFormat').value;
    let out;
    switch (fmt) {
      case 'short': out = date.toLocaleDateString(undefined,
        { year: 'numeric', month: 'numeric', day: 'numeric' }); break;
      case 'iso':   out = v; break;
      case 'full':  out = date.toLocaleDateString(undefined,
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); break;
      default: out = date.toLocaleDateString(undefined,
        { year: 'numeric', month: 'long', day: 'numeric' });
    }
    restoreSelection();
    document.execCommand('insertText', false, out);
    closeModal($('#calModal'));
    queueAutosave();
  });

  $('#pageBreakBtn').addEventListener('click', () => {
    restoreSelection();
    document.execCommand(
      'insertHTML',
      false,
      '<hr class="page-break" contenteditable="false"/><p><br/></p>'
    );
    queueAutosave();
  });

  // Table modal
  const tableModal = $('#tableModal');
  $('#insertTableBtn').addEventListener('click', () => {
    saveSelection();
    openModal(tableModal);
  });

  $('#insertTableConfirm').addEventListener('click', () => {
    const rows = parseInt($('#tblRows').value, 10) || 3;
    const cols = parseInt($('#tblCols').value, 10) || 3;
    const bordered = $('#tblBorders').checked;
    const cls = bordered ? ' class="bordered"' : '';
    let html = `<table${cls}><tbody>`;
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td>&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    closeModal(tableModal);
    queueAutosave();
  });

  // Symbol modal
  const symbolModal = $('#symbolModal');
  const SYMBOL_CATS = {
    'General': ['©','®','™','§','¶','†','‡','•','…','‰','°','′','″','‴','¦','¬','¤'],
    'Currency': ['€','£','¥','¢','$','₹','₽','₩','₿','₪','₡','₦','₱','₫','₭','₮','₲','₴'],
    'Math': ['±','×','÷','≠','≈','≤','≥','∞','√','∑','∏','∫','∂','∆','∇','∈','∉','∋','∝','∠','⊥','∥','∧','∨','⊕','⊗','∴','∵'],
    'Greek': ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','µ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω','Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Λ','Π','Σ','Φ','Ψ','Ω'],
    'Arrows': ['←','→','↑','↓','↔','↕','⇐','⇒','⇑','⇓','⇔','↩','↪','↻','↺','⤴','⤵','⤶','⤷'],
    'Shapes': ['★','☆','♥','♦','♣','♠','♪','♫','♩','♬','☀','☁','☂','☃','☎','✓','✗','✉','✿','❀','❤','☮','☯','☘','✪','✦','✧','◆','◇','■','□','●','○','▲','△','▼','▽'],
  };
  const symbolGrid = $('#symbolGrid');

  function renderSymbolCategory(cat) {
    symbolGrid.innerHTML = '';
    // Cat tab strip on top
    const tabs = document.createElement('div');
    tabs.style.cssText = 'grid-column:1/-1;display:flex;gap:4px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px solid var(--ribbon-border);margin-bottom:6px';
    Object.keys(SYMBOL_CATS).forEach((c) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.textContent = c;
      t.style.cssText = 'background:' + (c === cat ? 'var(--active)' : 'transparent') +
        ';border:1px solid var(--ribbon-border);border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;color:var(--text)';
      t.addEventListener('click', () => renderSymbolCategory(c));
      tabs.appendChild(t);
    });
    symbolGrid.appendChild(tabs);
    SYMBOL_CATS[cat].forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', () => {
        restoreSelection();
        document.execCommand('insertText', false, s);
        closeModal(symbolModal);
        queueAutosave();
      });
      symbolGrid.appendChild(b);
    });
  }
  renderSymbolCategory(Object.keys(SYMBOL_CATS)[0]);
  $('#insertSymbolBtn').addEventListener('click', () => {
    saveSelection();
    openModal(symbolModal);
  });

  // ---------- Layout ----------
  const pageSize = $('#pageSize');
  const orientation = $('#orientation');
  const margins = $('#margins');

  const columns = $('#columns');

  function applyLayout() {
    page.classList.remove('a4', 'letter', 'legal');
    page.classList.add(pageSize.value);
    page.classList.toggle('landscape', orientation.value === 'landscape');
    page.classList.toggle('portrait', orientation.value === 'portrait');
    page.classList.remove('margins-normal', 'margins-narrow', 'margins-wide');
    page.classList.add('margins-' + margins.value);
    page.classList.remove('cols-1', 'cols-2', 'cols-3');
    if (columns) page.classList.add('cols-' + columns.value);
    savePrefs();
  }

  [pageSize, orientation, margins, columns].filter(Boolean).forEach((el) =>
    el.addEventListener('change', applyLayout)
  );

  // ---------- View ----------
  const zoom = $('#zoom');
  const zoomLabel = $('#zoomLabel');
  function applyZoom(pct) {
    pct = Math.max(50, Math.min(200, Math.round(pct)));
    zoom.value = String(pct);
    page.style.setProperty('--zoom', pct / 100);
    zoomLabel.textContent = pct + '%';
    savePrefs();
  }
  zoom.addEventListener('input', () => applyZoom(parseInt(zoom.value, 10)));
  $('#zoomInBtn')?.addEventListener('click', () => applyZoom(parseInt(zoom.value, 10) + 10));
  $('#zoomOutBtn')?.addEventListener('click', () => applyZoom(parseInt(zoom.value, 10) - 10));
  $('#zoom100Btn')?.addEventListener('click', () => applyZoom(100));
  $('#zoomFitWidthBtn')?.addEventListener('click', () => {
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    // Page CSS width is in inches; resolve to px from current bounding box
    const pageCss = getComputedStyle(page);
    const pageW = parseFloat(pageCss.getPropertyValue('--page-width')) * 96 ||
      page.getBoundingClientRect().width / (parseFloat(zoom.value) / 100);
    if (!pageW) return;
    const target = ws.clientWidth - 48;
    applyZoom((target / pageW) * 100);
  });
  $('#zoomFitPageBtn')?.addEventListener('click', () => {
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const r = page.getBoundingClientRect();
    const pageW = r.width / (parseFloat(zoom.value) / 100);
    const pageH = r.height / (parseFloat(zoom.value) / 100);
    const sx = (ws.clientWidth - 48) / pageW;
    const sy = (ws.clientHeight - 48) / pageH;
    applyZoom(Math.min(sx, sy) * 100);
  });
  // Ctrl+/Cmd+ +/- for zoom
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); applyZoom(parseInt(zoom.value, 10) + 10); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); applyZoom(parseInt(zoom.value, 10) - 10); }
    else if (e.key === '0') { e.preventDefault(); applyZoom(100); }
  });

  const darkMode = $('#darkMode');
  darkMode.addEventListener('change', () => {
    document.documentElement.dataset.theme = darkMode.checked ? 'dark' : '';
    savePrefs();
  });

  const rulerToggle = $('#rulerToggle');
  rulerToggle.addEventListener('change', () => {
    $('#ruler').classList.toggle('hidden', !rulerToggle.checked);
    savePrefs();
  });

  // ============================================================
  // IMPROVEMENT: Spell-check toggle
  // ============================================================
  const spellToggle = $('#spellToggle');
  if (spellToggle) {
    const stored = localStorage.getItem('rodmanword:spell');
    if (stored === '0') spellToggle.checked = false;
    editor.spellcheck = spellToggle.checked;
    spellToggle.addEventListener('change', () => {
      editor.spellcheck = spellToggle.checked;
      localStorage.setItem('rodmanword:spell', spellToggle.checked ? '1' : '0');
    });
  }

  // ============================================================
  // IMPROVEMENT: Theme picker (Light / Dark / Sepia / High contrast)
  // ============================================================
  const themeSelect = $('#themeSelect');
  if (themeSelect) {
    const storedTheme = localStorage.getItem('rodmanword:theme') || '';
    themeSelect.value = storedTheme;
    document.documentElement.dataset.theme = storedTheme;
    if (darkMode) darkMode.checked = storedTheme === 'dark';
    themeSelect.addEventListener('change', () => {
      document.documentElement.dataset.theme = themeSelect.value;
      if (darkMode) darkMode.checked = themeSelect.value === 'dark';
      localStorage.setItem('rodmanword:theme', themeSelect.value);
    });
  }

  // ============================================================
  // IMPROVEMENT: Ctrl/Cmd + Click on a link opens it in a new tab
  // ============================================================
  editor.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
    }
  });

  // ---------- Word/char count ----------
  function updateCounts() {
    const text = editor.innerText.trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    statusWords.textContent = words + (words === 1 ? ' word' : ' words');
    statusChars.textContent = chars + (chars === 1 ? ' character' : ' characters');

    // Estimate page count by content height vs page inner height
    const ph = page.getBoundingClientRect().height;
    const eh = editor.scrollHeight;
    const est = Math.max(1, Math.ceil(eh / ph));
    statusPage.textContent = `Page 1 of ${est}`;
  }

  // ---------- Toolbar state ----------
  function updateToolbarState() {
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
      const btn = document.querySelector(`[data-cmd="${cmd}"]`);
      if (!btn) return;
      try {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      } catch {}
    });
  }

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) updateToolbarState();
  });

  // ---------- Autosave ----------
  let saveTimer = null;
  function syncBrowserTitle() {
    const t = (docTitle.value || 'Document').trim();
    document.title = t + ' — RodmanWord';
  }
  function queueAutosave() {
    statusSaved.textContent = 'Saving…';
    syncBrowserTitle();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, editor.innerHTML);
        localStorage.setItem(STORE_TITLE, docTitle.value);
        if (docHeader) localStorage.setItem(STORE_HEADER, docHeader.innerHTML);
        if (docFooter) localStorage.setItem(STORE_FOOTER, docFooter.innerHTML);
        statusSaved.textContent = 'Saved';
        if (typeof markClean === 'function') markClean();
      } catch {
        statusSaved.textContent = 'Save failed (storage full)';
      }
      updateCounts();
    }, 400);
  }
  syncBrowserTitle();

  function refreshEmptyState() {
    const txt = (editor.innerText || '').replace(/​/g, '').trim();
    const onlyBreaks = !txt && !editor.querySelector('img, table, hr');
    editor.classList.toggle('is-empty', onlyBreaks);
  }

  // ---------- Dirty indicator + last-edit timestamp ----------
  const dirtyDot = $('#dirtyDot');
  const statusCursor = $('#statusCursor');
  const statusSize = $('#statusSize');
  let isDirty = false;
  let lastEditAt = Date.now();

  function markDirty() {
    isDirty = true;
    dirtyDot.hidden = false;
    lastEditAt = Date.now();
  }
  function markClean() {
    isDirty = false;
    dirtyDot.hidden = true;
  }

  // One composite handler per editable surface so we don't pay the
  // event-loop tax three times per keystroke.
  function onEditorInput() {
    queueAutosave();
    refreshEmptyState();
    markDirty();
  }
  function onTitleInput() { queueAutosave(); markDirty(); }
  editor.addEventListener('input', onEditorInput);
  docTitle.addEventListener('input', onTitleInput);
  if (docHeader) docHeader.addEventListener('input', onTitleInput);
  if (docFooter) docFooter.addEventListener('input', onTitleInput);
  refreshEmptyState();

  // beforeunload warning
  window.addEventListener('beforeunload', (e) => {
    if (!isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- Cursor position (line:col) ----------
  function updateCursorPos() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    // Compute line/col by scanning text up to cursor
    const before = document.createRange();
    before.setStart(editor, 0);
    before.setEnd(range.endContainer, range.endOffset);
    const text = before.toString();
    const lines = text.split(/\n/);
    const ln = lines.length;
    const col = lines[lines.length - 1].length + 1;
    statusCursor.textContent = 'Ln ' + ln + ', Col ' + col;
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) updateCursorPos();
  });

  // ---------- Document size in KB ----------
  function updateDocSize() {
    const html = editor.innerHTML || '';
    const bytes = new Blob([html]).size;
    statusSize.textContent = bytes < 1024
      ? bytes + ' B'
      : (bytes / 1024).toFixed(1) + ' KB';
  }
  setInterval(updateDocSize, 2000);
  updateDocSize();

  // ---------- Last edit relative time ----------
  function relativeTime(ms) {
    const s = Math.round(ms / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + ' s ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    return new Date(Date.now() - ms).toLocaleString();
  }
  setInterval(() => {
    if (isDirty) return;
    const t = statusSaved.textContent;
    if (t && t.indexOf('Saved') === 0) {
      statusSaved.textContent = 'Saved ' + relativeTime(Date.now() - lastEditAt);
    }
  }, 5000);

  // ---------- Selection-aware word count ----------
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const text = sel.toString();
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    statusWords.textContent = words + ' selected';
  });

  // Tab key inserts spaces
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&emsp;');
    }
  });

  // ---------- Smart paste cleanup ----------
  editor.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;

    // Image paste: insert as data URL
    const items = cd.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            document.execCommand('insertImage', false, reader.result);
            queueAutosave();
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }

    const html = cd.getData('text/html');
    if (html) {
      e.preventDefault();
      document.execCommand('insertHTML', false, cleanPastedHtml(html));
      queueAutosave();
    }
    // Plain text falls through to the browser's default behavior
  });

  function cleanPastedHtml(raw) {
    const tmp = document.createElement('div');
    tmp.innerHTML = raw;

    // Drop everything outside <body> if present (Office/Google docs wraps)
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) tmp.innerHTML = bodyMatch[1];

    // Strip all inline styles, classes, MS Office namespaces, comments
    const banned = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'O:P', 'V:SHAPETYPE', 'V:SHAPE']);
    const walk = (node) => {
      const children = Array.from(node.childNodes);
      for (const c of children) {
        if (c.nodeType === 8) { c.remove(); continue; } // comment
        if (c.nodeType !== 1) continue;
        if (banned.has(c.tagName)) { c.remove(); continue; }
        // Remove conditional comments / MS Office tags by namespace
        if (/[:o]/.test(c.tagName) && c.tagName.includes(':')) {
          while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c);
          c.remove();
          continue;
        }
        // Strip dangerous + cosmetic attrs
        Array.from(c.attributes).forEach((a) => {
          const name = a.name.toLowerCase();
          if (name === 'style' || name === 'class' || name === 'lang' ||
              name === 'dir' || name.startsWith('on') ||
              (name === 'href' && /^javascript:/i.test(a.value))) {
            c.removeAttribute(a.name);
          }
        });
        walk(c);
      }
    };
    walk(tmp);

    // Collapse empty paragraphs
    tmp.querySelectorAll('p').forEach((p) => {
      if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
    });

    return tmp.innerHTML;
  }

  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = e.key.toLowerCase();
    const shift = e.shiftKey;
    if (key === 's') {
      e.preventDefault();
      saveDocument();
    } else if (key === 'p') {
      e.preventDefault();
      preparePrint();
      window.print();
    } else if (key === 'f') {
      e.preventDefault();
      openModal($('#findModal'));
      $('#findInput').focus();
    } else if (key === 'o') {
      e.preventDefault();
      $('#filePicker').click();
    } else if (key === 'n') {
      e.preventDefault();
      newDocument();
    } else if (key === 'k') {
      e.preventDefault();
      openLinkModal();
    } else if (key === 'l' && !shift) {
      e.preventDefault();
      exec('justifyLeft');
    } else if (key === 'e') {
      e.preventDefault();
      exec('justifyCenter');
    } else if (key === 'r') {
      e.preventDefault();
      exec('justifyRight');
    } else if (key === 'j') {
      e.preventDefault();
      exec('justifyFull');
    } else if (key === 'l' && shift) {
      e.preventDefault();
      exec('removeFormat');
      toast('Formatting cleared');
    } else if (key === 'enter') {
      e.preventDefault();
      restoreSelection();
      document.execCommand('insertHTML', false,
        '<hr class="page-break" contenteditable="false"/><p><br/></p>');
      queueAutosave();
    } else if (shift && key === 'h') {
      e.preventDefault();
      cycleHeading();
    }
  });

  function cycleHeading() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest && n.closest('h1,h2,h3,h4,p,blockquote,pre,li');
    const tag = block ? block.tagName : 'P';
    const order = ['P', 'H1', 'H2', 'H3', 'H4'];
    const idx = order.indexOf(tag);
    const next = order[(idx + 1) % order.length];
    exec('formatBlock', next);
  }

  // ---------- Backstage / File menu ----------
  const backstage = $('#backstage');
  const backstageTitle = $('#backstageTitle');
  const backstageContent = $('#backstageContent');

  function openBackstage() {
    backstage.hidden = false;
    // Route through the new section renderer if it's available (it's
    // defined later in the IIFE as a function declaration, so it's
    // hoisted and reachable). Fall back to the legacy switch for
    // safety if anything has gone wrong.
    if (typeof renderBackstageSection === 'function' &&
        typeof BACKSTAGE_SECTIONS !== 'undefined' &&
        BACKSTAGE_SECTIONS && BACKSTAGE_SECTIONS.home) {
      renderBackstageSection('home');
      const s = document.getElementById('backstageSearch');
      if (s) s.value = '';
      return;
    }
    setBackstageView('home');
  }

  function closeBackstage() {
    backstage.hidden = true;
    // Keep current tab as Home if File was active
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
      $$('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'home');
      });
    }
  }

  $('#backCloseBtn').addEventListener('click', closeBackstage);
  // Click on the empty backstage main area (not the side or content) closes it
  backstage.addEventListener('click', (e) => {
    if (e.target === backstage) closeBackstage();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Close any open modal first
    const openM = $$('.modal').find((m) => !m.hidden);
    if (openM) { openM.hidden = true; return; }
    if (!backstage.hidden) closeBackstage();
  });

  function setBackstageView(action) {
    switch (action) {
      case 'new':
        renderTemplates();
        break;
      case 'open':
        backstageTitle.textContent = 'Open';
        backstageContent.innerHTML = `
          <p>Open a RodmanWord (.rwd), HTML, or text file from your device.</p>
          <button class="btn primary" id="openFromDevice">Browse this device…</button>
        `;
        $('#openFromDevice').addEventListener('click', () => {
          $('#filePicker').click();
        });
        break;
      case 'save':
        saveDocument();
        closeBackstage();
        break;
      case 'save-fs':
        closeBackstage();
        saveToFileSystem();
        break;
      case 'open-fs':
        closeBackstage();
        openFromFileSystem();
        break;
      case 'collab':
        closeBackstage();
        $('#collabName').value = localStorage.getItem('rodmanword:collabName') ||
          (docProps && docProps.author) || '';
        $('#collabHostStep').hidden = true;
        $('#collabGuestStep').hidden = true;
        $('#collabStatus').textContent = collabConn && collabConn.connectionState === 'connected'
          ? 'Currently connected'
          : 'Pick a role to start';
        $('#collabDisconnectBtn').hidden = !collabConn;
        renderPeerList();
        openModal($('#collabModal'));
        break;
      case 'cloud-sync':
        closeBackstage();
        $('#ghToken').value = localStorage.getItem('rodmanword:ghToken') || '';
        $('#ghGistId').value = localStorage.getItem('rodmanword:ghGistId') || '';
        $('#cloudStatus').textContent = '';
        openModal($('#cloudModal'));
        break;
      case 'export-html':
        exportHtml();
        closeBackstage();
        break;
      case 'export-docx':
        exportDocx();
        closeBackstage();
        break;
      case 'export-pdf':
        exportPdf();
        closeBackstage();
        break;
      case 'export-md':
        exportMarkdown();
        closeBackstage();
        break;
      case 'export-txt':
        exportTxt();
        closeBackstage();
        break;
      case 'history':
        renderHistory();
        break;
      case 'properties':
        closeBackstage();
        openPropsModal();
        break;
      case 'share':
        renderShareView();
        break;
      case 'goal':
        closeBackstage();
        $('#goalTarget').value = writingGoal || 500;
        openModal(goalModal);
        break;
      case 'merge':
        closeBackstage();
        openModal($('#mailMergeModal'));
        break;
      case 'compare':
        closeBackstage();
        openModal($('#compareModal'));
        break;
      case 'encrypt':
        closeBackstage();
        $('#encryptPwd').value = '';
        $('#encryptPwd2').value = '';
        openModal($('#encryptModal'));
        break;
      case 'customcss':
        closeBackstage();
        $('#customCss').value = localStorage.getItem('rodmanword:customCss') || '';
        openModal($('#cssModal'));
        break;
      case 'translate':
        closeBackstage();
        openModal($('#translateModal'));
        break;
      case 'print':
        closeBackstage();
        setTimeout(() => { preparePrint(); window.print(); }, 100);
        break;
      case 'printpreview':
        closeBackstage();
        showPrintPreview();
        break;
      case 'recent':
        renderRecent();
        break;
      case 'about':
        closeBackstage();
        openModal($('#aboutModal'));
        break;
      default:
        backstageTitle.textContent = 'File';
        backstageContent.textContent = 'Choose a command on the left.';
    }
  }

  // ---------- New backstage: rail + dynamic right pane ----------
  // Each section is { title, render(content) }. Render functions
  // populate the right pane with tile cards; each tile fires the
  // existing setBackstageView() with its data-action so every wrap
  // installed by feature blocks below still runs.
  const BACKSTAGE_SECTIONS = {
    home: {
      title: 'Home',
      render(content) {
        content.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'backstage-section';
        // Quick-action row
        const quick = document.createElement('div');
        quick.className = 'backstage-quick-row';
        [
          { ico: '📄', label: 'New', section: 'new' },
          { ico: '📂', label: 'Open from device', action: 'open' },
          { ico: '💾', label: 'Save .rwd', action: 'save' },
          { ico: '🖨', label: 'Print', action: 'print' },
        ].forEach((q) => {
          const b = document.createElement('button');
          b.className = 'btn primary';
          b.textContent = q.ico + ' ' + q.label;
          b.addEventListener('click', () => {
            if (q.section) renderBackstageSection(q.section);
            else setBackstageView(q.action);
          });
          quick.appendChild(b);
        });
        wrap.appendChild(quick);
        // Recent files
        const recentBox = document.createElement('div');
        recentBox.className = 'backstage-recent';
        let list = [];
        try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
        recentBox.innerHTML = '<header>Recent documents</header>';
        const ol = document.createElement('ol');
        if (!list.length) {
          ol.innerHTML = '<li><button disabled>(No recent documents — saved files appear here.)</button></li>';
        } else {
          list.slice(0, 8).forEach((item) => {
            const li = document.createElement('li');
            const dt = new Date(item.at);
            const sizeStr = item.size != null
              ? (item.size < 1024 ? item.size + ' B' : (item.size / 1024).toFixed(1) + ' KB')
              : '';
            li.innerHTML = '<button>📄 <b>' + escapeHtml(item.title) +
              '</b><span class="meta">' + dt.toLocaleString() +
              (sizeStr ? ' · ' + sizeStr : '') + '</span></button>';
            ol.appendChild(li);
          });
        }
        recentBox.appendChild(ol);
        wrap.appendChild(recentBox);
        content.appendChild(wrap);
      },
    },

    new: {
      title: 'New',
      render() {
        // Reuse the existing renderTemplates() which writes into
        // backstageContent.
        renderTemplates();
      },
    },

    open: {
      title: 'Open',
      tiles: [
        { ico: '📂', label: 'Open from device…', desc: 'Browse for a .rwd, .docx, .pdf, .html, .txt, .md, .rtf, .odt, .epub, or .rwd.enc file.', action: 'open' },
        { ico: '🗂', label: 'Open from File System…', desc: 'Use the modern File System Access API and keep a live handle to the file on disk.', action: 'open-fs' },
        { ico: '🕓', label: 'Recent…', desc: 'Show every document you’ve saved or opened recently.', action: 'recent' },
      ],
    },

    save: {
      title: 'Save / Save As',
      tiles: [
        { ico: '💾', label: 'Save (.rwd)', desc: 'Download the document as a RodmanWord native .rwd file.', action: 'save' },
        { ico: '🗂', label: 'Save to file…', desc: 'Save directly back to the same file via File System Access.', action: 'save-fs' },
        { ico: '🔒', label: 'Save with password…', desc: 'Encrypt the .rwd with AES-GCM derived from your passphrase.', action: 'encrypt' },
        { ico: '⭐', label: 'Save as template', desc: 'Add the current document to your template gallery.', action: 'save-template' },
      ],
    },

    print: {
      title: 'Print',
      tiles: [
        { ico: '🖨', label: 'Print / Save as PDF', desc: 'Open the browser print dialog. Choose “Save as PDF” to keep a copy.', action: 'print' },
        { ico: '👁', label: 'Print preview', desc: 'On-screen preview using the current page size and margins.', action: 'printpreview' },
        { ico: '📤', label: 'Export PDF', desc: 'Generate a real .pdf using the built-in PDF writer.', action: 'export-pdf' },
      ],
    },

    share: {
      title: 'Share',
      tiles: [
        { ico: '🔗', label: 'Share link', desc: 'Encode the document into a URL hash and copy it to the clipboard.', action: 'share' },
        { ico: '👁', label: 'Share read-only', desc: 'Recipient opens a locked view: editing disabled, comments disabled.', action: 'share-readonly' },
        { ico: '💬', label: 'Share comment-only', desc: 'Recipient can read the document and add comments, but not edit it.', action: 'share-comments' },
        { ico: '🤝', label: 'Collaborate (P2P)…', desc: 'Direct WebRTC connection. Manual handshake; no server.', action: 'collab' },
        { ico: '✉', label: 'Email this doc', desc: 'Pre-fill an email with the title and body via mailto:.', action: 'email-doc' },
        { ico: '#', label: 'Copy Slack-Markdown', desc: 'Copy the document as Slack-flavoured Markdown to the clipboard.', action: 'send-slack' },
      ],
    },

    cloud: {
      title: 'Cloud sync',
      tiles: [
        { ico: '☁', label: 'GitHub Gist…', desc: 'Round-trip the .rwd payload through a private gist with your PAT.', action: 'cloud-sync' },
        { ico: '🌐', label: 'WebDAV / Nextcloud…', desc: 'Upload / download via PUT / GET with HTTP Basic auth.', action: 'webdav-sync' },
      ],
    },

    export: {
      title: 'Export',
      tiles: [
        { ico: '📝', label: 'Word (.docx)', desc: 'Round-trip OOXML with headers, footers, fields, and styles.', action: 'export-docx' },
        { ico: '📕', label: 'PDF', desc: 'Built-in PDF writer with the standard 14 Type-1 fonts.', action: 'export-pdf' },
        { ico: '🌐', label: 'HTML', desc: 'Self-contained HTML with embedded styles.', action: 'export-html' },
        { ico: 'Md', label: 'Markdown', desc: 'GitHub-flavoured with optional YAML front-matter.', action: 'export-md' },
        { ico: '📃', label: 'Plain text', desc: 'Strip every tag; keep paragraphs.', action: 'export-txt' },
        { ico: '📦', label: 'OpenDocument (.odt)', desc: 'LibreOffice / OpenOffice native format.', action: 'export-odt' },
        { ico: 'RT', label: 'RTF', desc: 'Rich Text Format for legacy word processors.', action: 'export-rtf' },
        { ico: '📚', label: 'EPUB', desc: 'Split the document into chapters at H1 boundaries.', action: 'export-epub' },
        { ico: 'AD', label: 'AsciiDoc', desc: 'Lightweight markup popular for technical writing.', action: 'export-asciidoc' },
        { ico: 'TX', label: 'LaTeX', desc: 'Compile-ready .tex with article preamble.', action: 'export-latex' },
      ],
    },

    info: {
      title: 'Info',
      tiles: [
        { ico: 'ⓘ', label: 'Properties', desc: 'Title, author, subject, keywords, description, plus quick stats.', action: 'properties' },
        { ico: '🕓', label: 'Version history', desc: 'Auto-snapshots every 2 minutes while you edit.', action: 'history' },
        { ico: '🎯', label: 'Writing goal', desc: 'Set a target word count and watch the progress bar in the status bar.', action: 'goal' },
        { ico: '🔎', label: 'Inspect document', desc: 'Find leftover comments, hidden text, watermarks, custom CSS, sensitive metadata.', action: 'inspect' },
      ],
    },

    tools: {
      title: 'Tools',
      tiles: [
        { ico: '✉🅼', label: 'Mail merge…', desc: 'CSV + {{Field}} placeholders → one document per row.', action: 'merge' },
        { ico: '⇄', label: 'Compare with another version', desc: 'Line-level diff with add / delete colours.', action: 'compare' },
        { ico: 'Md', label: 'Markdown live preview', desc: 'Split-pane: write Markdown, see HTML render in real time.', action: 'md-preview' },
        { ico: '🌍', label: 'Translate…', desc: 'Open the document text in Google Translate / DeepL / Bing.', action: 'translate' },
        { ico: '🎨', label: 'Document themes…', desc: 'Coordinated font and colour scheme across the document.', action: 'themes' },
        { ico: '🅑', label: 'Brand kit…', desc: 'Logo, brand colours, fonts, and optional letterhead.', action: 'brandkit' },
        { ico: '🎛', label: 'Custom CSS…', desc: 'Paste CSS that applies to the editor.', action: 'customcss' },
        { ico: '🧰', label: 'Styles import / export', desc: 'Move custom paragraph styles between documents as JSON.', action: 'stylesio' },
        { ico: '⭐', label: 'Save as template', desc: 'Add the current document to your template gallery.', action: 'save-template' },
        { ico: '↺', label: 'Reset to template', desc: 'Re-apply the originating template’s typography to this document.', action: 'reset-template' },
        { ico: '🧹', label: 'Style cleaner', desc: 'Strip every inline style and custom-style class assignment.', action: 'style-cleaner' },
      ],
    },

    about: {
      title: 'About',
      tiles: [
        { ico: '❓', label: 'About RodmanWord', desc: 'Version, source, license.', action: 'about' },
      ],
    },
  };

  function renderBackstageSection(name) {
    const s = BACKSTAGE_SECTIONS[name];
    if (!s) return;
    backstageTitle.textContent = s.title;
    // Highlight rail
    $$('.backstage-side .backstage-rail button').forEach((b) => {
      b.classList.toggle('active', b.dataset.section === name);
    });
    // Render
    if (typeof s.render === 'function') {
      s.render(backstageContent);
      return;
    }
    // Default: tile grid
    backstageContent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'backstage-section';
    const grid = document.createElement('div');
    grid.className = 'backstage-tile-grid';
    s.tiles.forEach((t) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'backstage-tile';
      tile.dataset.action = t.action;
      tile.dataset.searchable = (t.label + ' ' + (t.desc || '')).toLowerCase();
      tile.innerHTML = '<span class="ico">' + t.ico + '</span>' +
        '<span class="body"><b>' + escapeHtml(t.label) + '</b>' +
        '<small>' + escapeHtml(t.desc || '') + '</small></span>';
      tile.addEventListener('click', () => setBackstageView(t.action));
      grid.appendChild(tile);
    });
    wrap.appendChild(grid);
    backstageContent.appendChild(wrap);
  }

  // Wire the rail
  $$('.backstage-rail button[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => renderBackstageSection(btn.dataset.section));
  });

  // (openBackstage was modified directly above to use the new section
  // renderer; no reassignment needed here.)

  // Backstage search — filters tiles across every section.
  $('#backstageSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      // Restore the active section's rendering as-is
      const cur = document.querySelector('.backstage-rail button.active');
      if (cur) renderBackstageSection(cur.dataset.section);
      return;
    }
    // Build a synthetic "search results" view across every section
    backstageTitle.textContent = 'Search results';
    backstageContent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'backstage-section';
    const grid = document.createElement('div');
    grid.className = 'backstage-tile-grid';
    let count = 0;
    Object.keys(BACKSTAGE_SECTIONS).forEach((sec) => {
      const tiles = BACKSTAGE_SECTIONS[sec].tiles || [];
      tiles.forEach((t) => {
        const blob = (t.label + ' ' + (t.desc || '')).toLowerCase();
        if (!blob.includes(q)) return;
        count++;
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'backstage-tile';
        tile.innerHTML = '<span class="ico">' + t.ico + '</span>' +
          '<span class="body"><b>' + escapeHtml(t.label) + '</b>' +
          '<small>' + escapeHtml(BACKSTAGE_SECTIONS[sec].title + ' · ' + (t.desc || '')) + '</small></span>';
        tile.addEventListener('click', () => setBackstageView(t.action));
        grid.appendChild(tile);
      });
    });
    if (!count) {
      wrap.innerHTML = '<p class="muted">No matching commands.</p>';
    } else {
      wrap.appendChild(grid);
    }
    backstageContent.appendChild(wrap);
  });

  // ---------- Document operations ----------
  async function newDocument() {
    if (isDirty &&
        !(await confirmDialog('Start a new blank document? Unsaved changes will be lost.', 'New document'))) {
      return;
    }
    editor.innerHTML = '<h1>Untitled document</h1><p><br/></p>';
    docTitle.value = 'Document';
    queueAutosave();
    editor.focus();
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function saveDocument() {
    const data = {
      version: 1,
      title: docTitle.value,
      html: editor.innerHTML,
      header: docHeader ? docHeader.innerHTML : '',
      footer: docFooter ? docFooter.innerHTML : '',
      layout: {
        size: pageSize.value,
        orientation: orientation.value,
        margins: margins.value
      },
      properties: docProps || {},
      threads: typeof threads === 'object' ? threads : {},
      savedAt: new Date().toISOString()
    };
    downloadBlob(
      JSON.stringify(data, null, 2),
      sanitizeFileName(docTitle.value) + '.rwd',
      'application/json'
    );
    addRecent(docTitle.value);
    statusSaved.textContent = 'Saved';
  }

  function exportHtml() {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(docTitle.value)}</title>
<style>
body { font-family: Calibri, Arial, sans-serif; max-width: 8.5in; margin: 1in auto; line-height: 1.5; color: #222; padding: 0 1in; }
h1, h2, h3 { color: #2b579a; }
table { border-collapse: collapse; }
table.bordered td, table.bordered th { border: 1px solid #ccc; }
td, th { padding: 4px 8px; }
img { max-width: 100%; }
blockquote { border-left: 4px solid #2b579a; margin: 0; padding: 0.2em 0.8em; color: #555; }
hr.page-break { page-break-after: always; border: none; }
</style></head><body>
${editor.innerHTML}
</body></html>`;
    downloadBlob(html, sanitizeFileName(docTitle.value) + '.html', 'text/html');
  }

  function exportTxt() {
    downloadBlob(
      editor.innerText,
      sanitizeFileName(docTitle.value) + '.txt',
      'text/plain'
    );
  }

  function exportDocx() {
    if (!window.RodmanDocx) {
      toast('docx.js not loaded', 'error');
      return;
    }
    try {
      const blob = window.RodmanDocx.saveDocx(editor.innerHTML, {
        title: docTitle.value,
        header: getHeaderHtml(),
        footer: getFooterHtml(),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(docTitle.value) + '.docx';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast('Exported .docx', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  }

  function exportPdf() {
    if (!window.RodmanPdf) {
      toast('pdfio.js not loaded', 'error');
      return;
    }
    try {
      // Map current page size to PDF media box (points)
      const sizes = {
        a4:     { w: 595, h: 842 },
        letter: { w: 612, h: 792 },
        legal:  { w: 612, h: 1008 },
      };
      const sz = sizes[pageSize.value] || sizes.a4;
      const land = orientation.value === 'landscape';
      const marginsMap = { normal: 72, narrow: 36, wide: 108 };
      const blob = window.RodmanPdf.savePdf(editor.innerHTML, {
        pageW: land ? sz.h : sz.w,
        pageH: land ? sz.w : sz.h,
        margin: marginsMap[margins.value] || 72,
        title: docTitle.value,
        header: getHeaderHtml(),
        footer: getFooterHtml(),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(docTitle.value) + '.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast('Exported PDF', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  }

  function sanitizeFileName(name) {
    return (name || 'document').replace(/[^\w\-]+/g, '_').slice(0, 64) || 'document';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function decryptRwd(payloadStr) {
    let payload;
    try { payload = JSON.parse(payloadStr); } catch { return null; }
    if (!payload.rwdEnc) return null;
    const pwd = prompt('Password for this document:');
    if (!pwd) return null;
    try {
      const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const salt = b64ToBytes(payload.salt);
      const iv = b64ToBytes(payload.iv);
      const ct = b64ToBytes(payload.data);
      const key = await deriveKey(pwd, salt);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch {
      toast('Wrong password or corrupted file', 'error');
      return null;
    }
  }

  $('#filePicker').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (/\.rwd\.enc$/i.test(file.name)) {
      const txt = await file.text();
      const data = await decryptRwd(txt);
      e.target.value = '';
      if (!data) return;
      editor.innerHTML = sanitizeImported(data.html || '');
      docTitle.value = data.title || file.name.replace(/\.rwd\.enc$/i, '');
      if (docHeader) docHeader.innerHTML = sanitizeImported(data.header || '');
      if (docFooter) docFooter.innerHTML = sanitizeImported(data.footer || '');
      if (data.threads && typeof data.threads === 'object') {
        threads = data.threads;
        persistThreads();
      }
      if (data.layout) {
        pageSize.value = data.layout.size || pageSize.value;
        orientation.value = data.layout.orientation || orientation.value;
        margins.value = data.layout.margins || margins.value;
        applyLayout();
      }
      applyResolvedClasses();
      rebuildCommentsPane();
      addRecent(docTitle.value);
      queueAutosave();
      closeBackstage();
      return;
    }
    // Hand off RTF/ODT/EPUB to the extended listener registered in the
    // FEATURE: Section L block — letting both listeners run for the
    // same change event would race the FileReader fallback below
    // against the awaited binary parsers and produce flicker / wrong
    // final state.
    if (/\.(rtf|odt|epub)$/i.test(file.name) ||
        file.type === 'application/rtf' ||
        file.type === 'application/vnd.oasis.opendocument.text' ||
        file.type === 'application/epub+zip') {
      return;
    }
    if (/\.docx$/i.test(file.name) ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const buf = await file.arrayBuffer();
        if (!window.RodmanDocx) throw new Error('docx.js not loaded');
        const html = await window.RodmanDocx.loadDocx(buf);
        editor.innerHTML = sanitizeImported(html);
        docTitle.value = file.name.replace(/\.docx$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        rebuildOutline();
        closeBackstage();
        toast('Imported .docx', 'success');
      } catch (err) {
        toast('Could not read this .docx file: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      try {
        const buf = await file.arrayBuffer();
        if (!window.RodmanPdf) throw new Error('pdfio.js not loaded');
        const html = await window.RodmanPdf.loadPdf(buf);
        editor.innerHTML = sanitizeImported(html);
        docTitle.value = file.name.replace(/\.pdf$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        rebuildOutline();
        closeBackstage();
        toast('Imported PDF text', 'success');
      } catch (err) {
        toast('Could not extract text from PDF: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read this file', 'error');
    reader.onload = () => {
      try {
        const content = String(reader.result);
        if (file.name.endsWith('.rwd') || file.type === 'application/json') {
          const data = JSON.parse(content);
          editor.innerHTML = sanitizeImported(data.html || '');
          docTitle.value = data.title || file.name.replace(/\.rwd$/, '');
          if (docHeader) docHeader.innerHTML = sanitizeImported(data.header || '');
          if (docFooter) docFooter.innerHTML = sanitizeImported(data.footer || '');
          if (data.threads && typeof data.threads === 'object') {
            threads = data.threads;
            persistThreads();
          }
          if (data.layout) {
            pageSize.value = data.layout.size || pageSize.value;
            orientation.value = data.layout.orientation || orientation.value;
            margins.value = data.layout.margins || margins.value;
            applyLayout();
          }
          applyResolvedClasses();
          rebuildCommentsPane();
        } else if (/\.html?$/.test(file.name) || file.type.includes('html')) {
          const tmp = document.createElement('div');
          tmp.innerHTML = content;
          const body = tmp.querySelector('body') || tmp;
          editor.innerHTML = sanitizeImported(body.innerHTML);
          docTitle.value = file.name.replace(/\.html?$/, '');
        } else if (/\.md$/i.test(file.name)) {
          editor.innerHTML = sanitizeImported(tinyMdToHtml(content));
          docTitle.value = file.name.replace(/\.md$/i, '');
        } else {
          const escaped = escapeHtml(content)
            .split(/\n{2,}/)
            .map((p) => '<p>' + p.replace(/\n/g, '<br/>') + '</p>')
            .join('');
          editor.innerHTML = escaped;
          docTitle.value = file.name.replace(/\.txt$/i, '');
        }
        addRecent(docTitle.value);
        queueAutosave();
        closeBackstage();
      } catch (err) {
        toast('Could not import this file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function sanitizeImported(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Strip elements that can execute or load active content. <base> is
    // included because it would silently rewrite every relative URL in
    // the document after insertion.
    tmp.querySelectorAll(
      'script, style, link, meta, iframe, frame, object, embed, applet, ' +
      'base, source, track, video, audio'
    ).forEach((n) => n.remove());
    const URL_ATTRS = ['href', 'src', 'formaction', 'action',
      'xlink:href', 'data', 'poster', 'background'];
    const BAD_URL = /^\s*(javascript|vbscript|data:text\/html)/i;
    const BAD_STYLE = /(?:javascript:|expression\s*\(|url\s*\(\s*['"]?\s*javascript:)/i;
    tmp.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => {
        const name = a.name.toLowerCase();
        if (name.startsWith('on')) { n.removeAttribute(a.name); return; }
        if (name === 'srcdoc') { n.removeAttribute(a.name); return; }
        if (URL_ATTRS.includes(name) && BAD_URL.test(a.value)) {
          n.removeAttribute(a.name); return;
        }
        if (name === 'style' && BAD_STYLE.test(a.value)) {
          n.removeAttribute(a.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  // Tiny GitHub-flavoured-Markdown subset → HTML. Reused by the .md
  // importer (file-picker change handler) and the live-preview pane
  // (openMdPreview). Handles #/##/### headings, **bold**, *italic*,
  // `code`, '- ' lists, and blank-line paragraph breaks. Anything more
  // exotic falls through as plain text.
  function tinyMdToHtml(md) {
    md = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    md = md.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    md = md.replace(/^## (.*)$/gm,  '<h2>$1</h2>');
    md = md.replace(/^# (.*)$/gm,   '<h1>$1</h1>');
    md = md.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    md = md.replace(/\*([^*]+)\*/g,     '<i>$1</i>');
    md = md.replace(/`([^`]+)`/g,       '<code>$1</code>');
    md = md.replace(/^\- (.*)$/gm,      '<li>$1</li>');
    md = md.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>');
    md = md.replace(/\n\n+/g, '</p><p>');
    return '<p>' + md + '</p>';
  }
  window.__rwdTinyMd = tinyMdToHtml;

  // ---------- Recent ----------
  function addRecent(title) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    const entry = { title, at: new Date().toISOString() };
    list = [entry, ...list.filter((x) => x.title !== title)].slice(0, 10);
    localStorage.setItem(STORE_RECENT, JSON.stringify(list));
  }

  function renderRecent() {
    backstageTitle.textContent = 'Recent';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    if (!list.length) {
      backstageContent.innerHTML = '<p>No recent documents yet. Save a document to see it here.</p>';
      return;
    }
    backstageContent.innerHTML = '<ul class="recent-list"></ul>';
    const ul = backstageContent.querySelector('ul');
    list.forEach((item) => {
      const li = document.createElement('li');
      const dt = new Date(item.at);
      const sizeStr = item.size != null
        ? (item.size < 1024 ? item.size + ' B' : (item.size / 1024).toFixed(1) + ' KB')
        : '';
      li.innerHTML = `<button>📄 <b>${escapeHtml(item.title)}</b><br/><small>${dt.toLocaleString()}${sizeStr ? ' • ' + sizeStr : ''}</small></button>`;
      ul.appendChild(li);
    });
  }

  // ---------- Find & Replace (highlight all + count) ----------
  const findModal = $('#findModal');
  const findCount = $('#findCount');
  let findMarks = [];
  let findCursor = -1;

  $('#findBtn').addEventListener('click', () => {
    saveSelection();
    openModal(findModal);
    $('#findInput').focus();
    rerunFind();
  });

  function clearFindMarks() {
    findMarks.forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    findMarks = [];
    findCursor = -1;
  }

  // Find search history
  const STORE_FIND_HISTORY = 'rodmanword:findHistory';
  function addFindHistory(term) {
    if (!term) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_FIND_HISTORY) || '[]'); } catch {}
    list = [term, ...list.filter((x) => x !== term)].slice(0, 10);
    try { localStorage.setItem(STORE_FIND_HISTORY, JSON.stringify(list)); } catch {}
    refreshFindHistoryUI();
  }
  function refreshFindHistoryUI() {
    const dl = document.getElementById('findHistory');
    if (!dl) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_FIND_HISTORY) || '[]'); } catch {}
    dl.innerHTML = list.map((t) => '<option value="' + escapeHtml(t) + '"></option>').join('');
  }
  refreshFindHistoryUI();

  function rerunFind() {
    clearFindMarks();
    const term = $('#findInput').value;
    if (!term) { findCount.textContent = ''; return; }
    const matchCase = $('#matchCase').checked;
    const matchWord = $('#matchWord') && $('#matchWord').checked;
    const matchRegex = $('#matchRegex') && $('#matchRegex').checked;
    let pattern;
    try {
      if (matchRegex) {
        pattern = term;
      } else {
        pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (matchWord) pattern = '\\b' + pattern + '\\b';
      }
    } catch {
      findCount.textContent = 'Invalid pattern';
      return;
    }
    let re;
    try {
      re = new RegExp(pattern, matchCase ? 'g' : 'gi');
    } catch {
      findCount.textContent = 'Invalid regex';
      return;
    }
    addFindHistory(term);
    const textNodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        // skip text inside our existing marks (already extracted)
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    textNodes.forEach((node) => {
      const text = node.nodeValue;
      let m, last = 0;
      const fragments = [];
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
          fragments.push(document.createTextNode(text.slice(last, m.index)));
        }
        const mark = document.createElement('span');
        mark.className = 'rwd-find-mark';
        mark.textContent = m[0];
        fragments.push(mark);
        findMarks.push(mark);
        last = m.index + m[0].length;
        if (m[0].length === 0) re.lastIndex++;
      }
      if (!fragments.length) return;
      if (last < text.length) {
        fragments.push(document.createTextNode(text.slice(last)));
      }
      const parent = node.parentNode;
      fragments.forEach((f) => parent.insertBefore(f, node));
      parent.removeChild(node);
    });

    if (findMarks.length) {
      findCursor = 0;
      focusFindMark(0);
    }
    findCount.textContent = findMarks.length
      ? findMarks.length + ' matches'
      : 'No matches';
  }

  function focusFindMark(i) {
    findMarks.forEach((m, idx) => {
      m.classList.toggle('current', idx === i);
    });
    const m = findMarks[i];
    if (!m) return;
    m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    findCount.textContent =
      (i + 1) + ' of ' + findMarks.length + ' matches';
  }

  $('#findInput').addEventListener('input', () => {
    clearTimeout(window.__rwdFindT);
    window.__rwdFindT = setTimeout(rerunFind, 200);
  });
  $('#matchCase').addEventListener('change', rerunFind);
  if ($('#matchWord')) $('#matchWord').addEventListener('change', rerunFind);
  if ($('#matchRegex')) $('#matchRegex').addEventListener('change', rerunFind);

  $('#findNextBtn').addEventListener('click', () => {
    if (!findMarks.length) return rerunFind();
    findCursor = (findCursor + 1) % findMarks.length;
    focusFindMark(findCursor);
  });
  $('#findPrevBtn').addEventListener('click', () => {
    if (!findMarks.length) return rerunFind();
    findCursor = (findCursor - 1 + findMarks.length) % findMarks.length;
    focusFindMark(findCursor);
  });

  $('#replaceOneBtn').addEventListener('click', () => {
    if (!findMarks.length) return;
    const repl = $('#replaceInput').value;
    const m = findMarks[findCursor];
    if (!m) return;
    const txt = document.createTextNode(repl);
    m.parentNode.replaceChild(txt, m);
    findMarks.splice(findCursor, 1);
    if (findCursor >= findMarks.length) findCursor = 0;
    if (findMarks.length) focusFindMark(findCursor);
    else findCount.textContent = 'All replaced';
    queueAutosave();
  });

  $('#replaceAllBtn').addEventListener('click', () => {
    if (!findMarks.length) rerunFind();
    if (!findMarks.length) return;
    const repl = $('#replaceInput').value;
    const count = findMarks.length;
    findMarks.forEach((m) => {
      const txt = document.createTextNode(repl);
      m.parentNode.replaceChild(txt, m);
    });
    findMarks = [];
    findCursor = -1;
    findCount.textContent = 'Replaced ' + count + ' matches';
    queueAutosave();
  });

  // Clear find highlights when the dialog closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !findModal.hidden) clearFindMarks();
  });
  findModal.addEventListener('click', (e) => {
    if (e.target === findModal) clearFindMarks();
  });
  $$('#findModal [data-close-modal]').forEach((b) => {
    b.addEventListener('click', clearFindMarks);
  });

  function walkTextNodes(root, fn) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) fn(n);
  }

  function selectTextAt(start, end) {
    let pos = 0;
    const range = document.createRange();
    let started = false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue.length;
      if (!started && pos + len >= start) {
        range.setStart(n, start - pos);
        started = true;
      }
      if (started && pos + len >= end) {
        range.setEnd(n, end - pos);
        break;
      }
      pos += len;
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
    savedRange = range.cloneRange();
  }

  // ---------- Modal helpers ----------
  function openModal(m) { m.hidden = false; }
  function closeModal(m) { m.hidden = true; }
  $$('[data-close-modal]').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.closest('.modal');
      if (m) closeModal(m);
    });
  });
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m);
    });
  });

  // ---------- Prefs ----------
  function savePrefs() {
    const outlineVisible = !document.getElementById('outlinePane').hidden;
    const prefs = {
      darkMode: darkMode.checked,
      ruler: rulerToggle.checked,
      outline: outlineVisible,
      zoom: zoom.value,
      pageSize: pageSize.value,
      orientation: orientation.value,
      margins: margins.value
    };
    try { localStorage.setItem(STORE_PREFS, JSON.stringify(prefs)); } catch {}
  }

  function loadPrefs() {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(STORE_PREFS) || '{}'); } catch {}
    if (prefs.darkMode) {
      darkMode.checked = true;
      document.documentElement.dataset.theme = 'dark';
    }
    if (prefs.ruler === false) {
      rulerToggle.checked = false;
      $('#ruler').classList.add('hidden');
    }
    if (prefs.zoom) {
      zoom.value = prefs.zoom;
      zoomLabel.textContent = prefs.zoom + '%';
      page.style.setProperty('--zoom', parseInt(prefs.zoom, 10) / 100);
    }
    if (prefs.pageSize) pageSize.value = prefs.pageSize;
    if (prefs.orientation) orientation.value = prefs.orientation;
    if (prefs.margins) margins.value = prefs.margins;
    applyLayout();
    if (prefs.outline) {
      const ot = document.getElementById('outlineToggle');
      const op = document.getElementById('outlinePane');
      if (ot && op) { ot.checked = true; op.hidden = false; }
    }
  }

  // ---------- Restore document ----------
  function restoreFromStorage() {
    const html = localStorage.getItem(STORE_KEY);
    const title = localStorage.getItem(STORE_TITLE);
    const header = localStorage.getItem(STORE_HEADER);
    const footer = localStorage.getItem(STORE_FOOTER);
    if (html) editor.innerHTML = html;
    if (title) docTitle.value = title;
    if (header && docHeader) docHeader.innerHTML = header;
    if (footer && docFooter) docFooter.innerHTML = footer;
  }

  // ---------- Init ----------
  loadPrefs();
  restoreFromStorage();
  updateCounts();
  updateToolbarState();
  setInterval(updateCounts, 1500);
  // Outline rebuild after init (function defined later in feature block)
  setTimeout(() => { try { rebuildOutline(); } catch {} }, 0);

  // Populate the About dialog from RW_BUILD so it can never show a
  // stale hard-coded date again.
  (function fillAbout() {
    const v = $('#aboutVersion');
    const b = $('#aboutBuild');
    const c = $('#aboutCache');
    const l = $('#aboutLabel');
    if (v) v.textContent = RW_BUILD.version;
    if (l) l.textContent = RW_BUILD.label;
    if (c) c.textContent = RW_BUILD.cache;
    if (b) {
      const d = new Date(RW_BUILD.date + 'T00:00:00');
      b.textContent = d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    }
  })();

  // ============================================================
  // IMPROVEMENT: Undo/redo button state
  // ============================================================
  function refreshUndoRedoState() {
    try {
      const u = document.querySelector('[data-cmd="undo"]');
      const r = document.querySelector('[data-cmd="redo"]');
      if (!u || !r) return;
      const canU = document.queryCommandEnabled && document.queryCommandEnabled('undo');
      const canR = document.queryCommandEnabled && document.queryCommandEnabled('redo');
      u.style.opacity = canU ? '1' : '0.4';
      r.style.opacity = canR ? '1' : '0.4';
    } catch {}
  }
  editor.addEventListener('input', refreshUndoRedoState);
  document.addEventListener('selectionchange', refreshUndoRedoState);
  refreshUndoRedoState();

  // ============================================================
  // IMPROVEMENT: Double-click word → highlight all instances
  // ============================================================
  editor.addEventListener('dblclick', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = sel.toString().trim();
    if (!word || word.length < 2 || /\s/.test(word)) return;
    $('#findInput').value = word;
    $('#matchCase').checked = false;
    rerunFind();
    toast('Highlighted ' + findMarks.length + ' matches of "' + word + '"', 'info', 1800);
  });

  // ============================================================
  // IMPROVEMENT: Default font/size preference
  // ============================================================
  const STORE_DEFAULT_FONT = 'rodmanword:defaultFont';
  const STORE_DEFAULT_SIZE = 'rodmanword:defaultSize';
  const savedFont = localStorage.getItem(STORE_DEFAULT_FONT);
  const savedSize = localStorage.getItem(STORE_DEFAULT_SIZE);
  if (savedFont) {
    $('#fontFamily').value = savedFont;
    editor.style.fontFamily = savedFont;
  }
  if (savedSize) {
    $('#fontSize').value = savedSize;
    editor.style.fontSize = savedSize + 'pt';
  }
  $('#fontFamily').addEventListener('change', () => {
    localStorage.setItem(STORE_DEFAULT_FONT, $('#fontFamily').value);
  });
  $('#fontSize').addEventListener('change', () => {
    localStorage.setItem(STORE_DEFAULT_SIZE, $('#fontSize').value);
  });

  // ============================================================
  // IMPROVEMENT: Right-click context menu
  // ============================================================
  function buildContextMenu(items, x, y) {
    const old = document.querySelector('.context-menu');
    if (old) old.remove();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    items.forEach((item) => {
      if (item === '-') {
        const hr = document.createElement('hr');
        menu.appendChild(hr);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = item.label +
        (item.shortcut ? '<span class="shortcut">' + item.shortcut + '</span>' : '');
      b.addEventListener('click', () => {
        item.run();
        menu.remove();
      });
      menu.appendChild(b);
    });
    menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 10) + 'px';
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('mousedown', (ev) => {
        if (!menu.contains(ev.target)) menu.remove();
      }, { once: true });
    }, 0);
  }

  editor.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed && editor.contains(sel.anchorNode);
    saveSelection();
    const items = [];
    if (hasSel) {
      items.push({ label: 'Cut', shortcut: 'Ctrl+X', run: () => $('#cutBtn').click() });
      items.push({ label: 'Copy', shortcut: 'Ctrl+C', run: () => $('#copyBtn').click() });
    }
    items.push({ label: 'Paste', shortcut: 'Ctrl+V', run: () => $('#pasteBtn').click() });
    if (hasSel) {
      items.push('-');
      items.push({ label: 'Bold', shortcut: 'Ctrl+B', run: () => exec('bold') });
      items.push({ label: 'Italic', shortcut: 'Ctrl+I', run: () => exec('italic') });
      items.push({ label: 'Underline', shortcut: 'Ctrl+U', run: () => exec('underline') });
      items.push('-');
      items.push({ label: 'Insert link…', shortcut: 'Ctrl+K', run: () => openLinkModal() });
      items.push({ label: 'Add comment…', run: () => $('#commentBtn').click() });
      items.push('-');
      items.push({ label: 'Highlight all matches', run: () => {
        const word = sel.toString().trim();
        if (word) { $('#findInput').value = word; rerunFind(); }
      }});
    } else {
      items.push('-');
      items.push({ label: 'Find & replace…', shortcut: 'Ctrl+F', run: () => $('#findBtn').click() });
      items.push({ label: 'Insert date', run: () => $('#insertDateBtn').click() });
      items.push({ label: 'Insert symbol…', run: () => $('#insertSymbolBtn').click() });
    }
    buildContextMenu(items, e.clientX, e.clientY);
  });

  // ============================================================
  // IMPROVEMENT: Recent files with size in backstage
  // ============================================================
  // Override addRecent to record size
  const _origAddRecent = addRecent;
  addRecent = function (title) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    const size = new Blob([editor.innerHTML]).size;
    const entry = { title, at: new Date().toISOString(), size };
    list = [entry, ...list.filter((x) => x.title !== title)].slice(0, 10);
    localStorage.setItem(STORE_RECENT, JSON.stringify(list));
  };

  // ============================================================
  // FEATURE: Command palette (Ctrl+Shift+P)
  // ============================================================
  const PALETTE = [
    { name: 'New document', shortcut: 'Ctrl+N', run: () => newDocument() },
    { name: 'Open file', shortcut: 'Ctrl+O', run: () => $('#filePicker').click() },
    { name: 'Save document', shortcut: 'Ctrl+S', run: () => saveDocument() },
    { name: 'Print / PDF', shortcut: 'Ctrl+P', run: () => { preparePrint(); window.print(); } },
    { name: 'Find & replace', shortcut: 'Ctrl+F', run: () => $('#findBtn').click() },
    { name: 'Insert link', shortcut: 'Ctrl+K', run: () => openLinkModal() },
    { name: 'Insert table', run: () => $('#insertTableBtn').click() },
    { name: 'Insert image', run: () => $('#insertImageBtn').click() },
    { name: 'Insert symbol', run: () => $('#insertSymbolBtn').click() },
    { name: 'Insert emoji', run: () => $('#insertEmojiBtn').click() },
    { name: 'Insert date', run: () => $('#insertDateBtn').click() },
    { name: 'Insert lorem ipsum', run: () => $('#loremBtn').click() },
    { name: 'Export as Word (.docx)', run: () => exportDocx() },
    { name: 'Export as PDF', run: () => exportPdf() },
    { name: 'Export as HTML', run: () => exportHtml() },
    { name: 'Export as Markdown', run: () => exportMarkdown() },
    { name: 'Export as Text', run: () => exportTxt() },
    { name: 'Insert table of contents', run: () => $('#insertTocBtn').click() },
    { name: 'Insert footnote', run: () => $('#insertFootnoteBtn').click() },
    { name: 'Insert pull quote', run: () => $('#pullQuoteBtn').click() },
    { name: 'Insert equation', run: () => openEquationModalForNew() },
    { name: 'Insert code block', run: () => $('#codeBlockBtn').click() },
    { name: 'Insert word art', run: () => $('#wordArtBtn').click() },
    { name: 'Add bookmark', run: () => $('#bookmarkBtn').click() },
    { name: 'Show bookmarks', run: () => $('#bookmarksMenuBtn').click() },
    { name: 'Add comment', run: () => $('#commentBtn').click() },
    { name: 'Toggle drop cap', run: () => $('#dropCapBtn').click() },
    { name: 'Sort selected lines (A → Z)', run: () => sortSelectedLines(false) },
    { name: 'Sort selected lines (Z → A)', run: () => sortSelectedLines(true) },
    { name: 'Toggle focus mode', shortcut: 'F11', run: () => toggleFocus() },
    { name: 'Toggle reading mode', run: () => $('#readingModeBtn').click() },
    { name: 'Read aloud', run: () => $('#readAloudBtn').click() },
    { name: 'Voice dictation', run: () => $('#dictateBtn').click() },
    { name: 'Word count details', run: () => { renderCountModal(); openModal(countModal); } },
    { name: 'Document properties', run: () => openPropsModal() },
    { name: 'Writing goal…', run: () => { $('#goalTarget').value = writingGoal || 500; openModal(goalModal); } },
    { name: 'Mail merge…', run: () => openModal($('#mailMergeModal')) },
    { name: 'Compare with another document', run: () => openModal($('#compareModal')) },
    { name: 'Watermark…', run: () => $('#watermarkBtn').click() },
    { name: 'Custom CSS…', run: () => { $('#customCss').value = localStorage.getItem('rodmanword:customCss') || ''; openModal($('#cssModal')); } },
    { name: 'Save with password', run: () => { $('#encryptPwd').value=''; $('#encryptPwd2').value=''; openModal($('#encryptModal')); } },
    { name: 'Share link', run: () => { setBackstageView('share'); backstage.hidden = false; } },
    { name: 'Theme: Light', run: () => { themeSelect.value = ''; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Theme: Dark', run: () => { themeSelect.value = 'dark'; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Theme: Sepia', run: () => { themeSelect.value = 'sepia'; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Theme: High contrast', run: () => { themeSelect.value = 'contrast'; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Keyboard shortcuts', shortcut: '?', run: () => openModal($('#shortcutsModal')) },
    { name: 'About RodmanWord', run: () => openModal($('#aboutModal')) },
  ];

  const paletteModal = $('#paletteModal');
  const paletteInput = $('#paletteInput');
  const paletteResults = $('#paletteResults');

  function renderPalette(query) {
    const q = (query || '').toLowerCase().trim();
    paletteResults.innerHTML = '';
    const items = !q ? PALETTE : PALETTE.filter((c) =>
      c.name.toLowerCase().includes(q));
    items.slice(0, 30).forEach((c, i) => {
      const li = document.createElement('li');
      if (i === 0) li.classList.add('active');
      li.innerHTML = '<span>' + escapeHtml(c.name) + '</span>' +
        (c.shortcut ? '<span class="shortcut">' + c.shortcut + '</span>' : '');
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        c.run();
        closeModal(paletteModal);
      });
      paletteResults.appendChild(li);
    });
  }

  paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));
  paletteInput.addEventListener('keydown', (e) => {
    const items = Array.from(paletteResults.children);
    const idx = items.findIndex((li) => li.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items[idx]) items[idx].classList.remove('active');
      const ni = Math.min(items.length - 1, idx + 1);
      if (items[ni]) items[ni].classList.add('active');
      items[ni]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items[idx]) items[idx].classList.remove('active');
      const ni = Math.max(0, idx - 1);
      if (items[ni]) items[ni].classList.add('active');
      items[ni]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const li = items[idx >= 0 ? idx : 0];
      if (li) li.dispatchEvent(new MouseEvent('mousedown'));
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      paletteInput.value = '';
      renderPalette('');
      openModal(paletteModal);
      setTimeout(() => paletteInput.focus(), 50);
    }
  });

  // ============================================================
  // FEATURE: Repeat last action (Ctrl+Alt+Y)
  // ============================================================
  let lastAction = null;
  // Wrap exec to record last action
  const _exec = exec;
  exec = function (cmd, value) {
    lastAction = { kind: 'exec', cmd, value };
    return _exec(cmd, value);
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (!lastAction) { toast('No action to repeat', 'info'); return; }
      if (lastAction.kind === 'exec') exec(lastAction.cmd, lastAction.value);
      toast('Repeated: ' + lastAction.cmd);
    }
  });

  // ============================================================
  // FEATURE: Password-protected .rwd export (AES-GCM)
  // ============================================================
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  $('#encryptSaveBtn').addEventListener('click', async () => {
    const p1 = $('#encryptPwd').value;
    const p2 = $('#encryptPwd2').value;
    if (!p1) { toast('Password is empty', 'error'); return; }
    if (p1 !== p2) { toast('Passwords do not match', 'error'); return; }
    const data = JSON.stringify({
      version: 1,
      title: docTitle.value,
      html: editor.innerHTML,
      header: docHeader ? docHeader.innerHTML : '',
      footer: docFooter ? docFooter.innerHTML : '',
      layout: { size: pageSize.value, orientation: orientation.value, margins: margins.value },
      properties: docProps || {},
      threads: typeof threads === 'object' ? threads : {},
      savedAt: new Date().toISOString(),
    });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const key = await deriveKey(p1, salt);
      const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, new TextEncoder().encode(data)
      ));
      const payload = JSON.stringify({
        rwdEnc: 1,
        salt: bytesToB64(salt),
        iv: bytesToB64(iv),
        data: bytesToB64(ct),
      });
      downloadBlob(payload, sanitizeFileName(docTitle.value) + '.rwd.enc', 'application/octet-stream');
      closeModal($('#encryptModal'));
      toast('Saved encrypted .rwd.enc', 'success');
    } catch (err) {
      toast('Encryption failed: ' + err.message, 'error');
    }
  });

  // ============================================================
  // FEATURE: Custom CSS editor
  // ============================================================
  function applyCustomCss() {
    const css = localStorage.getItem('rodmanword:customCss') || '';
    let style = document.getElementById('rwd-custom-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rwd-custom-css';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }
  applyCustomCss();
  $('#saveCssBtn').addEventListener('click', () => {
    localStorage.setItem('rodmanword:customCss', $('#customCss').value);
    applyCustomCss();
    closeModal($('#cssModal'));
    toast('Custom CSS applied', 'success');
  });
  $('#clearCssBtn').addEventListener('click', () => {
    $('#customCss').value = '';
    localStorage.removeItem('rodmanword:customCss');
    applyCustomCss();
    toast('Custom CSS cleared', 'info');
  });

  // ============================================================
  // FEATURE: Mini map in outline pane
  // ============================================================
  const miniMap = $('#miniMap');
  let miniMapCanvas = null, miniMapViewport = null;
  function ensureMiniMap() {
    if (!miniMap) return;
    if (!miniMapCanvas) {
      miniMapCanvas = document.createElement('div');
      miniMapCanvas.className = 'canvas';
      miniMap.appendChild(miniMapCanvas);
      miniMapViewport = document.createElement('div');
      miniMapViewport.className = 'viewport';
      miniMap.appendChild(miniMapViewport);
      miniMap.addEventListener('click', (e) => {
        const ws = document.querySelector('.workspace-main');
        const r = miniMap.getBoundingClientRect();
        const ratio = (e.clientY - r.top) / r.height;
        if (ws) ws.scrollTo({ top: ratio * ws.scrollHeight - 100, behavior: 'smooth' });
      });
    }
  }
  function refreshMiniMap() {
    if (outlinePane.hidden || !miniMap) return;
    ensureMiniMap();
    miniMapCanvas.textContent = (editor.innerText || '').slice(0, 8000);
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const total = ws.scrollHeight;
    const view = ws.clientHeight;
    const top = ws.scrollTop;
    const r = miniMap.getBoundingClientRect();
    miniMapViewport.style.top = (top / total * r.height) + 'px';
    miniMapViewport.style.height = Math.max(20, view / total * r.height) + 'px';
  }
  setInterval(refreshMiniMap, 600);
  document.querySelector('.workspace-main')?.addEventListener('scroll', refreshMiniMap);

  // ============================================================
  // FEATURE: Compare two documents (line diff)
  // ============================================================
  function lineDiff(a, b) {
    // Simple Myers-style longest common subsequence (small docs only)
    const al = a.split(/\r?\n/);
    const bl = b.split(/\r?\n/);
    const m = al.length, n = bl.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (al[i] === bl[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (al[i] === bl[j]) { out.push({ kind: ' ', text: al[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: '-', text: al[i] }); i++; }
      else { out.push({ kind: '+', text: bl[j] }); j++; }
    }
    while (i < m) { out.push({ kind: '-', text: al[i++] }); }
    while (j < n) { out.push({ kind: '+', text: bl[j++] }); }
    return out;
  }

  $('#runCompareBtn').addEventListener('click', () => {
    const other = $('#compareInput').value;
    const me = editor.innerText;
    if (!other.trim()) { $('#compareResult').textContent = 'Paste text first.'; return; }
    if (me.length > 20000 || other.length > 20000) {
      if (!confirm('Documents are large; comparison may be slow. Continue?')) return;
    }
    const diff = lineDiff(me, other);
    const html = diff.map((d) => {
      const cls = d.kind === '+' ? 'add' : d.kind === '-' ? 'del' : '';
      const prefix = d.kind === '+' ? '+ ' : d.kind === '-' ? '- ' : '  ';
      return cls
        ? '<div class="' + cls + '">' + escapeHtml(prefix + d.text) + '</div>'
        : '<div>' + escapeHtml(prefix + d.text) + '</div>';
    }).join('');
    $('#compareResult').innerHTML = html;
  });

  // ============================================================
  // FEATURE: Word definition + Thesaurus (right-click menu items)
  // ============================================================
  function selectedWord() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    const t = sel.toString().trim();
    return /^[\p{L}\p{N}'-]{2,40}$/u.test(t) ? t : '';
  }
  // Hook into the existing context menu by wrapping the listener:
  // The listener is already there; instead we extend it via a delegated listener
  // that adds extra entries when a word is selected.
  document.addEventListener('contextmenu', (e) => {
    if (!editor.contains(e.target)) return;
    const w = selectedWord();
    if (!w) return;
    setTimeout(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return;
      const hr = document.createElement('hr');
      menu.appendChild(hr);
      const def = document.createElement('button');
      def.type = 'button';
      def.innerHTML = 'Define "' + escapeHtml(w) + '"';
      def.addEventListener('click', () => {
        window.open('https://www.merriam-webster.com/dictionary/' +
          encodeURIComponent(w), '_blank', 'noopener');
        menu.remove();
      });
      menu.appendChild(def);
      const th = document.createElement('button');
      th.type = 'button';
      th.innerHTML = 'Synonyms for "' + escapeHtml(w) + '"';
      th.addEventListener('click', () => {
        window.open('https://www.merriam-webster.com/thesaurus/' +
          encodeURIComponent(w), '_blank', 'noopener');
        menu.remove();
      });
      menu.appendChild(th);
    }, 10);
  }, true);

  // ============================================================
  // FEATURE: Watermark
  // ============================================================
  const STORE_WM = 'rodmanword:watermark';
  const watermarkOverlay = $('#watermarkOverlay');

  function applyWatermark() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(STORE_WM) || '{}'); } catch {}
    if (v.on && v.text) {
      watermarkOverlay.textContent = v.text;
      watermarkOverlay.hidden = false;
    } else {
      watermarkOverlay.hidden = true;
    }
  }
  applyWatermark();

  $('#watermarkBtn')?.addEventListener('click', () => {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(STORE_WM) || '{}'); } catch {}
    $('#watermarkText').value = v.text || 'DRAFT';
    $('#watermarkOn').checked = !!v.on;
    openModal($('#watermarkModal'));
  });

  $('#saveWatermarkBtn').addEventListener('click', () => {
    const v = {
      text: $('#watermarkText').value.trim() || 'DRAFT',
      on: $('#watermarkOn').checked,
    };
    try { localStorage.setItem(STORE_WM, JSON.stringify(v)); } catch {}
    applyWatermark();
    closeModal($('#watermarkModal'));
  });

  // ============================================================
  // FEATURE: Readability stats (Flesch reading ease)
  // ============================================================
  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  function readabilityStats() {
    const text = (editor.innerText || '').trim();
    if (!text) return null;
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = (text.match(/[.!?…]+(?=\s|$)/g) || []).length || 1;
    const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
    const wpm = words.length / sentences;
    const spw = syllables / Math.max(1, words.length);
    const flesch = 206.835 - 1.015 * wpm - 84.6 * spw;
    const grade = 0.39 * wpm + 11.8 * spw - 15.59;
    return {
      flesch: flesch.toFixed(1),
      grade: grade.toFixed(1),
      sentences,
      words: words.length,
      syllables,
      avgWordsPerSentence: wpm.toFixed(1),
      avgSyllablesPerWord: spw.toFixed(2),
    };
  }

  function fleschLabel(score) {
    score = parseFloat(score);
    if (score >= 90) return 'Very easy (5th grade)';
    if (score >= 80) return 'Easy (6th)';
    if (score >= 70) return 'Fairly easy (7th)';
    if (score >= 60) return 'Standard (8–9th)';
    if (score >= 50) return 'Fairly difficult (10–12th)';
    if (score >= 30) return 'Difficult (college)';
    return 'Very difficult (graduate)';
  }

  // Extend the existing word-count modal with readability stats
  const origRenderCount = renderCountModal;
  renderCountModal = function () {
    origRenderCount();
    const r = readabilityStats();
    if (!r) return;
    const extra =
      '<hr style="margin:6px 0;border:none;border-top:1px solid var(--ribbon-border)"/>' +
      '<div class="row"><span>Avg. words / sentence</span><b>' + r.avgWordsPerSentence + '</b></div>' +
      '<div class="row"><span>Avg. syllables / word</span><b>' + r.avgSyllablesPerWord + '</b></div>' +
      '<div class="row"><span>Flesch reading ease</span><b>' + r.flesch + '<small style="color:var(--muted);font-weight:400"> &nbsp;' + fleschLabel(r.flesch) + '</small></b></div>' +
      '<div class="row"><span>Flesch-Kincaid grade</span><b>' + r.grade + '</b></div>';
    countBody.innerHTML += extra;
  };

  // ============================================================
  // FEATURE: Mail merge ({{Field}} + CSV)
  // ============================================================
  function parseCsv(txt) {
    const rows = [];
    let i = 0, cell = '', row = [], inQuote = false;
    while (i < txt.length) {
      const c = txt[i];
      if (inQuote) {
        if (c === '"' && txt[i + 1] === '"') { cell += '"'; i += 2; continue; }
        if (c === '"') { inQuote = false; i++; continue; }
        cell += c; i++; continue;
      }
      if (c === '"') { inQuote = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      cell += c; i++;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  $('#runMergeBtn').addEventListener('click', () => {
    const csv = $('#mergeCsv').value;
    const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2) {
      $('#mergeStatus').textContent = 'CSV needs a header row and at least one data row.';
      return;
    }
    const headers = rows[0].map((h) => h.trim());
    const data = rows.slice(1);
    const tplHtml = editor.innerHTML;
    const tplTitle = docTitle.value || 'Document';

    // Combine into a single HTML file with one section per row
    let combined = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      escapeHtml(tplTitle) + ' (mail merge)</title>' +
      '<style>body{font-family:Calibri,Arial,sans-serif;max-width:8.5in;margin:1in auto;padding:0 1in;line-height:1.5}' +
      'h1,h2,h3{color:#2b579a}.merge-item{page-break-after:always}</style></head><body>';
    data.forEach((rowVals, idx) => {
      let out = tplHtml;
      headers.forEach((h, j) => {
        const re = new RegExp('\\{\\{\\s*' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'g');
        out = out.replace(re, escapeHtml(rowVals[j] || ''));
      });
      combined += '<div class="merge-item">' + out + '</div>';
    });
    combined += '</body></html>';
    downloadBlob(combined, sanitizeFileName(tplTitle) + '_merged.html', 'text/html');
    $('#mergeStatus').textContent = 'Generated ' + data.length + ' documents (' + headers.length + ' fields).';
    toast('Mail merge: ' + data.length + ' documents created', 'success');
  });

  // ============================================================
  // FEATURE: Headers & footers (page-level)
  // ============================================================
  function focusEnd(el) {
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#insertHeaderBtn')?.addEventListener('click', () => focusEnd(docHeader));
  $('#insertFooterBtn')?.addEventListener('click', () => focusEnd(docFooter));

  // Insert field dropdown (works in body, header, or footer).
  $('#insertFieldSelect')?.addEventListener('change', (e) => {
    const name = e.target.value;
    e.target.value = '';
    if (!name) return;
    restoreSelection();
    const html = '<span data-field="' + escapeHtml(name) +
      '" contenteditable="false">…</span>';
    document.execCommand('insertHTML', false, html);
    // Refresh now so it shows the right value
    refreshFields();
    queueAutosave();
  });

  // Page-number field: a span that picks up its number from the print
  // stylesheet's CSS counters. In screen view it just shows "1".
  $('#insertPageNumBtn')?.addEventListener('click', () => {
    // If the cursor is in the header/footer, insert there. Otherwise,
    // tell the user where it makes sense.
    const sel = window.getSelection();
    let target = null;
    if (sel && sel.anchorNode) {
      if (docHeader && docHeader.contains(sel.anchorNode)) target = docHeader;
      else if (docFooter && docFooter.contains(sel.anchorNode)) target = docFooter;
    }
    if (!target) {
      toast('Click in the header or footer first', 'info');
      focusEnd(docFooter);
      return;
    }
    const span = '<span class="rwd-pagenum" data-field="page" contenteditable="false"></span>';
    document.execCommand('insertHTML', false, span);
    queueAutosave();
  });

  // Helpers used by exporters
  function getHeaderHtml() { return docHeader ? docHeader.innerHTML : ''; }
  function getFooterHtml() { return docFooter ? docFooter.innerHTML : ''; }
  function getHeaderText() { return docHeader ? (docHeader.innerText || '') : ''; }
  function getFooterText() { return docFooter ? (docFooter.innerText || '') : ''; }

  // Replace {page} / page-number markers with literal placeholders for print
  function footerForPrint() {
    if (!docFooter) return '';
    // Clone, replace .rwd-pagenum with the CSS counter() string
    const clone = docFooter.cloneNode(true);
    clone.querySelectorAll('.rwd-pagenum').forEach((s) => {
      s.outerHTML = '" counter(page) "';
    });
    return clone.textContent;
  }

  // ============================================================
  // FEATURE: Bookmarks (named anchors + jump menu)
  // ============================================================
  const bookmarkBtn = $('#bookmarkBtn');
  const bookmarksMenuBtn = $('#bookmarksMenuBtn');
  const bookmarksPopup = $('#bookmarksPopup');

  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
        toast('Place the cursor in the document first', 'info');
        return;
      }
      const name = prompt('Bookmark name:');
      if (!name) return;
      const id = 'rwd-bm-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      // Remove any existing bookmark with the same id
      const old = document.getElementById(id);
      if (old && old.classList.contains('rwd-bookmark')) {
        const p = old.parentNode;
        while (old.firstChild) p.insertBefore(old.firstChild, old);
        p.removeChild(old);
      }
      const span = document.createElement('span');
      span.className = 'rwd-bookmark';
      span.id = id;
      span.dataset.name = name;
      span.textContent = name;
      const range = sel.getRangeAt(0);
      range.collapse(true);
      range.insertNode(span);
      // Caret after
      const r = document.createRange();
      r.setStartAfter(span);
      r.setEndAfter(span);
      sel.removeAllRanges();
      sel.addRange(r);
      queueAutosave();
      toast('Bookmark "' + name + '" added', 'success');
    });
  }

  if (bookmarksMenuBtn) {
    bookmarksMenuBtn.addEventListener('click', () => {
      const list = editor.querySelectorAll('.rwd-bookmark');
      bookmarksPopup.innerHTML = '';
      if (!list.length) {
        bookmarksPopup.innerHTML = '<div class="empty">No bookmarks yet</div>';
      } else {
        list.forEach((bm) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = bm.dataset.name || bm.id;
          b.addEventListener('click', () => {
            bm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const r = document.createRange();
            r.selectNodeContents(bm);
            r.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
            bookmarksPopup.hidden = true;
          });
          bookmarksPopup.appendChild(b);
        });
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none;border-top:1px solid var(--ribbon-border);margin:4px 0';
        bookmarksPopup.appendChild(hr);
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = '🗑 Remove all bookmarks';
        clear.addEventListener('click', () => {
          editor.querySelectorAll('.rwd-bookmark').forEach((b) => {
            const p = b.parentNode;
            while (b.firstChild) p.insertBefore(b.firstChild, b);
            p.removeChild(b);
          });
          queueAutosave();
          bookmarksPopup.hidden = true;
        });
        bookmarksPopup.appendChild(clear);
      }
      const r = bookmarksMenuBtn.getBoundingClientRect();
      bookmarksPopup.style.left = r.left + 'px';
      bookmarksPopup.style.top = (r.bottom + 4) + 'px';
      bookmarksPopup.hidden = false;
      setTimeout(() => {
        document.addEventListener('mousedown', (ev) => {
          if (!bookmarksPopup.contains(ev.target) && ev.target !== bookmarksMenuBtn) {
            bookmarksPopup.hidden = true;
          }
        }, { once: true });
      }, 0);
    });
  }

  // ============================================================
  // FEATURE: Pull quote
  // ============================================================
  $('#pullQuoteBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    let text = '';
    if (sel && !sel.isCollapsed) text = sel.toString();
    if (!text) text = prompt('Quote:', '') || '';
    if (!text) return;
    const author = prompt('Attribution (optional):', '') || '';
    const html = '<blockquote class="pull-quote">' + escapeHtml(text) +
      (author ? '<span class="attribution">— ' + escapeHtml(author) + '</span>' : '') +
      '</blockquote><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Code block with language
  // ============================================================
  $('#codeBlockBtn')?.addEventListener('click', () => {
    const lang = prompt('Language (e.g. js, python):', 'js') || 'text';
    const sel = window.getSelection();
    const code = sel && !sel.isCollapsed ? sel.toString() : '// your code here';
    const html = '<pre class="lang-block" data-lang="' + escapeHtml(lang) + '">' +
      escapeHtml(code) + '</pre><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Word art (decorative title)
  // ============================================================
  $('#wordArtBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    let text = sel && !sel.isCollapsed ? sel.toString() : prompt('Title text:', '') || '';
    if (!text) return;
    const html = '<p class="word-art">' + escapeHtml(text) + '</p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Sort selection (alphabetize lines / list items)
  // ============================================================
  function sortSelectedLines(reverse) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast('Select multiple lines or list items first', 'info');
      return;
    }
    const range = sel.getRangeAt(0);
    // Try to detect if all selected items are list items
    const items = [];
    const start = range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement;
    const startLi = start.closest('li');
    if (startLi && range.endContainer && editor.contains(range.endContainer)) {
      const endLi = (range.endContainer.nodeType === 1
        ? range.endContainer
        : range.endContainer.parentElement).closest('li');
      if (endLi && startLi.parentNode === endLi.parentNode) {
        let n = startLi;
        while (n) {
          items.push(n);
          if (n === endLi) break;
          n = n.nextElementSibling;
        }
        if (items.length >= 2) {
          const sorted = [...items].sort((a, b) => {
            const av = a.textContent.toLowerCase();
            const bv = b.textContent.toLowerCase();
            return reverse ? bv.localeCompare(av) : av.localeCompare(bv);
          });
          const parent = startLi.parentNode;
          sorted.forEach((li) => parent.appendChild(li));
          queueAutosave();
          return;
        }
      }
    }
    // Plain text: split by newline
    const text = sel.toString();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) { toast('Select multiple lines first', 'info'); return; }
    const sorted = lines.slice().sort((a, b) =>
      reverse ? b.localeCompare(a) : a.localeCompare(b)
    );
    document.execCommand('insertText', false, sorted.join('\n'));
    queueAutosave();
  }

  // ============================================================
  // IMPROVEMENT: Drop cap toggle on current paragraph
  // ============================================================
  const dropCapBtn = $('#dropCapBtn');
  if (dropCapBtn) {
    dropCapBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode) return;
      let n = sel.anchorNode;
      if (n.nodeType !== 1) n = n.parentElement;
      const para = n.closest('p, blockquote, pre, h1, h2, h3, h4, li');
      if (!para) {
        toast('Place the cursor in a paragraph first', 'info');
        return;
      }
      para.classList.toggle('drop-cap');
      queueAutosave();
    });
  }

  // ============================================================
  // IMPROVEMENT: Auto-TOC inserted at cursor
  // ============================================================
  const insertTocBtn = $('#insertTocBtn');
  if (insertTocBtn) {
    insertTocBtn.addEventListener('click', () => {
      const headings = editor.querySelectorAll('h1, h2, h3');
      if (!headings.length) {
        toast('Add some headings first', 'info');
        return;
      }
      // Remove any prior TOC inserted by us
      const old = editor.querySelector('.rwd-toc');
      if (old) old.remove();
      let html = '<div class="rwd-toc"><h3>Table of contents</h3><ol>';
      headings.forEach((h, i) => {
        if (!h.id) h.id = 'rwd-h-' + i;
        html += '<li class="lvl-' + h.tagName.charAt(1) + '">' +
          '<a href="#' + h.id + '">' + escapeHtml(h.textContent || '') + '</a></li>';
      });
      html += '</ol></div><p><br/></p>';
      restoreSelection();
      document.execCommand('insertHTML', false, html);
      queueAutosave();
      toast('Inserted table of contents', 'success');
    });
  }

  // ============================================================
  // IMPROVEMENT: Footnotes (auto-numbered)
  // ============================================================
  const insertFootnoteBtn = $('#insertFootnoteBtn');
  if (insertFootnoteBtn) {
    insertFootnoteBtn.addEventListener('click', () => {
      const text = prompt('Footnote text:', '');
      if (!text) return;
      restoreSelection();
      // Determine next footnote number
      const existing = editor.querySelectorAll('.rwd-fn-ref');
      const num = existing.length + 1;
      // Ensure footnotes container exists at the end of the editor
      let container = editor.querySelector('.rwd-footnotes');
      if (!container) {
        container = document.createElement('div');
        container.className = 'rwd-footnotes';
        container.contentEditable = 'true';
        container.innerHTML = '<h4 contenteditable="false">Footnotes</h4><ol></ol>';
        editor.appendChild(container);
      }
      const ol = container.querySelector('ol');
      const id = 'rwd-fn-' + Date.now() + '-' + num;
      const li = document.createElement('li');
      li.id = id;
      li.textContent = text;
      ol.appendChild(li);
      const ref = '<sup class="rwd-fn-ref" title="' + escapeHtml(text) +
        '" data-fn="' + id + '">' + num + '</sup>';
      document.execCommand('insertHTML', false, ref);
      queueAutosave();
    });
  }

  // Click footnote ref → jump
  editor.addEventListener('click', (e) => {
    const sup = e.target.closest && e.target.closest('.rwd-fn-ref');
    if (!sup) return;
    const id = sup.dataset.fn;
    if (!id) return;
    const li = document.getElementById(id);
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ============================================================
  // FOUNDATION: Live-field engine ({page}, {pages}, {date}, …)
  // ============================================================
  // Each field is a span with data-field="<name>". On every editor
  // change (and on doc load) we walk all such spans and refresh their
  // text content. Most fields are global; the 'page' field counts
  // page-break HRs that precede the field in document order.
  const FIELDS = {
    page(el) {
      // Count <hr class="page-break"> and equivalent break elements
      // that come before this element in the document.
      let n = 1;
      const breaks = editor.querySelectorAll('hr.page-break, .rwd-section-break');
      breaks.forEach((b) => {
        if (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) n++;
      });
      // The header/footer are children of .page, not .editor — they
      // logically belong to "all pages", so for fields inside them
      // we'd want the rendered page number; on screen, that's "1".
      if (!editor.contains(el)) return '1';
      return String(n);
    },
    pages() {
      const breaks = editor.querySelectorAll('hr.page-break, .rwd-section-break');
      return String(breaks.length + 1);
    },
    date() { return new Date().toLocaleDateString(); },
    time() { return new Date().toLocaleTimeString(); },
    datetime() { return new Date().toLocaleString(); },
    docTitle() { return docTitle.value || 'Document'; },
    author() { return (docProps && docProps.author) || ''; },
    wordCount() {
      try { return calcStats().words.toLocaleString(); } catch { return '0'; }
    },
  };

  function refreshFields(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-field]').forEach((el) => {
      const name = el.dataset.field;
      const fn = FIELDS[name];
      if (fn) {
        try { el.textContent = fn(el); } catch {}
      }
    });
    renumberCaptions();
    refreshCrossRefs();
  }

  // Renumber every .rwd-caption span in document order, grouped by seq type
  function renumberCaptions() {
    const counters = {};
    editor.querySelectorAll('.rwd-caption').forEach((el) => {
      const seq = (el.dataset.seq || 'item').toLowerCase();
      counters[seq] = (counters[seq] || 0) + 1;
      const n = counters[seq];
      const label = (el.dataset.label || (seq.charAt(0).toUpperCase() + seq.slice(1)));
      const text = (el.dataset.text || '').trim();
      el.innerHTML = '<b>' + escapeHtml(label) + ' ' + n + '</b>' +
        (text ? ' — ' + escapeHtml(text) : '');
      // Auto-id for cross-refs that don't already have one
      if (!el.id) el.id = 'rwd-cap-' + seq + '-' + n;
      el.dataset.num = String(n);
    });
  }

  // Resolve every .rwd-xref to its current target text
  function refreshCrossRefs() {
    const targets = collectXrefTargets();
    editor.querySelectorAll('.rwd-xref').forEach((a) => {
      const id = a.dataset.target;
      const kind = a.dataset.kind || 'auto';
      const t = targets[id];
      if (!t) {
        a.textContent = '[broken reference]';
        return;
      }
      if (kind === 'page') a.textContent = String(t.page);
      else if (kind === 'number') a.textContent = String(t.number);
      else if (kind === 'text') a.textContent = t.text;
      else a.textContent = (t.number ? t.number + ' ' : '') + (t.text || '');
      a.title = 'Cross-reference to ' + (t.text || id);
    });
  }

  function collectXrefTargets() {
    const map = {};
    // Headings
    editor.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (!h.id) return;
      map[h.id] = {
        text: h.textContent.trim(),
        number: h.dataset.num || '',
        page: pageNumberOf(h),
      };
    });
    // Captions
    editor.querySelectorAll('.rwd-caption').forEach((c) => {
      if (!c.id) return;
      const label = c.dataset.label || (c.dataset.seq || 'Item');
      map[c.id] = {
        text: c.dataset.text || c.textContent.replace(/^\S+\s\d+\s*[—-]?\s*/, ''),
        number: (label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()) +
                ' ' + (c.dataset.num || ''),
        page: pageNumberOf(c),
      };
    });
    // Bookmarks
    editor.querySelectorAll('.rwd-bookmark').forEach((b) => {
      if (!b.id) return;
      map[b.id] = {
        text: b.dataset.name || b.textContent,
        number: '',
        page: pageNumberOf(b),
      };
    });
    return map;
  }

  function pageNumberOf(el) {
    let n = 1;
    editor.querySelectorAll('hr.page-break, .rwd-section-break').forEach((b) => {
      if (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) n++;
    });
    return n;
  }

  // Insert caption (after current paragraph)
  $('#captionBtn')?.addEventListener('click', () => {
    const seq = prompt('Caption type (figure / table / equation / item):', 'figure');
    if (!seq) return;
    const label = seq.charAt(0).toUpperCase() + seq.slice(1).toLowerCase();
    const text = prompt('Caption text (optional):', '') || '';
    const html = '<p class="rwd-caption" data-seq="' + escapeHtml(seq.toLowerCase()) +
      '" data-label="' + escapeHtml(label) + '" data-text="' +
      escapeHtml(text) + '"></p><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    refreshFields();
    queueAutosave();
  });

  // Insert cross-reference: pick from a list
  $('#crossRefBtn')?.addEventListener('click', () => {
    const targets = collectXrefTargets();
    const ids = Object.keys(targets);
    if (!ids.length) {
      toast('Add a heading, caption, or bookmark first', 'info');
      return;
    }
    const lines = ids.map((id, i) =>
      (i + 1) + '. ' + (targets[id].number || targets[id].text).slice(0, 60));
    const pick = prompt(
      'Reference target — type number:\n' + lines.join('\n'),
      '1'
    );
    const idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= ids.length) return;
    const kind = prompt(
      'Show as: auto / number / text / page (default: auto)',
      'auto'
    ) || 'auto';
    const id = ids[idx];
    const html = '<a class="rwd-xref" href="#' + escapeHtml(id) +
      '" data-target="' + escapeHtml(id) + '" data-kind="' +
      escapeHtml(kind) + '" contenteditable="false">…</a>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    refreshFields();
    queueAutosave();
  });

  // Click an xref to jump to its target
  editor.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.rwd-xref');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.target;
    const t = id && document.getElementById(id);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ============================================================
  // FEATURE: Grammar check (Tier 2, gap #11)
  // ============================================================
  // A handful of simple rules that catch common writing problems.
  // Each rule returns an array of { start, end, message, suggestion }
  // applied against the editor's plain text.
  const GRAMMAR_RULES = [
    {
      name: 'Doubled word',
      re: /\b(\w+)\s+\1\b/gi,
      message: 'Doubled word — possible typo',
      suggest: (m) => m[1],
    },
    {
      name: 'Weasel word',
      re: /\b(very|really|quite|just|basically|essentially|literally|actually|simply)\s/gi,
      message: 'Weasel word — consider deleting',
      suggest: () => '',
    },
    {
      name: 'Passive voice',
      re: /\b(is|was|were|are|be|been|being)\s+(\w+ed|done|made|seen|taken|given|written|known|shown|held|kept|sent)\b/gi,
      message: 'Passive voice — prefer active',
    },
    {
      name: 'Sentence starts lower-case',
      re: /(^|[.!?]\s+)([a-z])/g,
      message: 'Sentence should start with a capital letter',
      suggest: (m) => m[1] + m[2].toUpperCase(),
      offsetGroup: 2,
    },
    {
      name: 'Missing space after punctuation',
      re: /([.!?,;:])([A-Za-z])/g,
      message: 'Missing space after punctuation',
      suggest: (m) => m[1] + ' ' + m[2],
    },
    {
      name: 'Two spaces',
      re: /  +/g,
      message: 'Multiple spaces — collapse to one',
      suggest: () => ' ',
    },
  ];

  function findGrammarIssues(text) {
    const out = [];
    GRAMMAR_RULES.forEach((rule) => {
      let m;
      rule.re.lastIndex = 0;
      while ((m = rule.re.exec(text)) !== null) {
        let start = m.index;
        let end = m.index + m[0].length;
        let matchText = m[0];
        if (rule.offsetGroup) {
          // The match has a leading capture we don't want to highlight
          const off = m[0].indexOf(m[rule.offsetGroup], 0);
          start = m.index + off;
          end = start + m[rule.offsetGroup].length;
          matchText = m[rule.offsetGroup];
        }
        out.push({
          start, end,
          rule: rule.name,
          message: rule.message,
          original: matchText,
          suggestion: rule.suggest ? rule.suggest(m) : null,
        });
        if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
      }
    });
    return out.sort((a, b) => a.start - b.start);
  }

  let grammarIssues = [];

  function clearGrammarMarks() {
    editor.querySelectorAll('.rwd-grammar').forEach((m) => {
      const p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  function selectRangeAt(start, end) {
    let pos = 0;
    const range = document.createRange();
    let started = false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue.length;
      if (!started && pos + len >= start) {
        range.setStart(n, start - pos);
        started = true;
      }
      if (started && pos + len >= end) {
        range.setEnd(n, end - pos);
        return range;
      }
      pos += len;
    }
    return null;
  }

  function runGrammar() {
    clearGrammarMarks();
    const text = editor.innerText;
    grammarIssues = findGrammarIssues(text);
    // Highlight by walking issues in reverse so earlier offsets stay valid
    grammarIssues.slice().reverse().forEach((iss) => {
      const r = selectRangeAt(iss.start, iss.end);
      if (!r) return;
      const span = document.createElement('span');
      span.className = 'rwd-grammar';
      span.dataset.rule = iss.rule;
      span.dataset.message = iss.message;
      try {
        span.appendChild(r.extractContents());
        r.insertNode(span);
      } catch {}
    });
    rebuildGrammarPane();
  }

  function rebuildGrammarPane() {
    const pane = $('#grammarPane');
    if (!pane || pane.hidden) return;
    const list = $('#grammarList');
    list.innerHTML = '';
    $('#grammarCount').textContent = grammarIssues.length + ' issue' +
      (grammarIssues.length === 1 ? '' : 's');
    if (!grammarIssues.length) {
      list.innerHTML = '<li class="empty">No grammar issues detected.</li>';
      return;
    }
    grammarIssues.forEach((iss) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<div class="selection-preview">' + escapeHtml(iss.rule) + '</div>' +
        '<div class="last-reply"><b>"' + escapeHtml(iss.original) + '"</b> — ' +
        escapeHtml(iss.message) + '</div>' +
        (iss.suggestion != null
          ? '<div style="margin-top:6px;display:flex;gap:6px">' +
            '<button class="btn" data-act="apply">Apply</button>' +
            '<button class="btn" data-act="ignore">Ignore</button>' +
            '</div>'
          : '<div style="margin-top:6px"><button class="btn" data-act="ignore">Ignore</button></div>');
      const apply = li.querySelector('[data-act="apply"]');
      apply?.addEventListener('click', () => {
        // Apply suggestion to the corresponding span
        const spans = editor.querySelectorAll('.rwd-grammar');
        // Find the first matching span by message text
        for (const s of spans) {
          if (s.textContent === iss.original) {
            s.outerHTML = escapeHtml(iss.suggestion);
            break;
          }
        }
        runGrammar();
        queueAutosave();
      });
      li.querySelector('[data-act="ignore"]')?.addEventListener('click', () => {
        // Just remove the marker for this occurrence
        const spans = editor.querySelectorAll('.rwd-grammar');
        for (const s of spans) {
          if (s.textContent === iss.original) {
            const p = s.parentNode;
            while (s.firstChild) p.insertBefore(s.firstChild, s);
            p.removeChild(s);
            break;
          }
        }
        // Remove from issues list
        grammarIssues = grammarIssues.filter((x) => x !== iss);
        rebuildGrammarPane();
      });
      list.appendChild(li);
    });
  }

  $('#grammarToggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      $('#grammarPane').hidden = false;
      runGrammar();
    } else {
      $('#grammarPane').hidden = true;
      clearGrammarMarks();
    }
  });
  $('#grammarCloseBtn')?.addEventListener('click', () => {
    $('#grammarPane').hidden = true;
    if ($('#grammarToggle')) $('#grammarToggle').checked = false;
    clearGrammarMarks();
  });

  // Re-run on input (debounced) when the panel is open
  editor.addEventListener('input', () => {
    if (!$('#grammarPane') || $('#grammarPane').hidden) return;
    clearTimeout(window.__rwdGrT);
    window.__rwdGrT = setTimeout(runGrammar, 800);
  });

  // ============================================================
  // FEATURE: Section M — Cloud & sharing (#96–#100)
  // ============================================================

  // #96 Read-only share link  / #97 Comment-only share
  function buildShareLinkMode(mode) {
    const data = { v: 2, t: docTitle.value, h: editor.innerHTML, m: mode };
    const json = JSON.stringify(data);
    let b64;
    try { b64 = btoa(unescape(encodeURIComponent(json))); }
    catch { b64 = btoa(json); }
    return location.origin + location.pathname + '#sm=' + mode + '&d=' + b64;
  }
  async function shareReadOnly() {
    const url = buildShareLinkMode('ro');
    try {
      await navigator.clipboard.writeText(url);
      toast('Read-only share link copied to clipboard', 'success');
    } catch {
      prompt('Read-only share link:', url);
    }
  }
  async function shareCommentOnly() {
    const url = buildShareLinkMode('co');
    try {
      await navigator.clipboard.writeText(url);
      toast('Comment-only share link copied to clipboard', 'success');
    } catch {
      prompt('Comment-only share link:', url);
    }
  }
  // On load, detect share mode and apply restrictions
  (function applyShareMode() {
    const m = (location.hash || '').match(/sm=([a-z]+)&d=(.*)/);
    if (!m) return;
    setTimeout(() => {
      try {
        const json = decodeURIComponent(escape(atob(m[2])));
        const data = JSON.parse(json);
        const mode = m[1];
        if (mode === 'ro' || mode === 'co') {
          editor.innerHTML = sanitizeImported(data.h || '');
          if (data.t) docTitle.value = data.t;
          if (mode === 'ro') {
            // Read-only mode
            editor.contentEditable = 'false';
            if (docHeader) docHeader.contentEditable = 'false';
            if (docFooter) docFooter.contentEditable = 'false';
            document.body.classList.add('marked-final');
            $('#finalBanner').hidden = false;
            $('#finalBanner').innerHTML = '🔒 You opened a <b>read-only share</b> link. Editing is disabled.';
          } else {
            // Comment-only: keep doc read-only but allow commenting
            editor.contentEditable = 'false';
            const banner = document.createElement('div');
            banner.className = 'final-banner';
            banner.innerHTML = '💬 You opened a <b>comment-only share</b> link. You can add comments but not edit the body.';
            document.body.insertBefore(banner, document.body.firstChild);
          }
          history.replaceState(null, '', location.pathname);
          refreshFields();
        }
      } catch {}
    }, 100);
  })();

  // #98 WebDAV / Nextcloud sync
  function openWebDAV() {
    $('#wdUrl').value = localStorage.getItem('rodmanword:wdUrl') || '';
    $('#wdUser').value = localStorage.getItem('rodmanword:wdUser') || '';
    $('#wdFile').value = localStorage.getItem('rodmanword:wdFile') ||
      sanitizeFileName(docTitle.value) + '.rwd';
    $('#wdStatus').textContent = '';
    openModal($('#webdavModal'));
  }
  $('#wdSaveBtn')?.addEventListener('click', async () => {
    try {
      const url = $('#wdUrl').value.trim();
      const user = $('#wdUser').value.trim();
      const pass = $('#wdPass').value;
      const fn = $('#wdFile').value.trim();
      if (!url || !user || !pass || !fn) { toast('Fill every field', 'error'); return; }
      localStorage.setItem('rodmanword:wdUrl', url);
      localStorage.setItem('rodmanword:wdUser', user);
      localStorage.setItem('rodmanword:wdFile', fn);
      $('#wdStatus').textContent = 'Uploading…';
      const res = await fetch(url.replace(/\/?$/, '/') + encodeURIComponent(fn), {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + btoa(user + ':' + pass),
          'Content-Type': 'application/json',
        },
        body: buildRwdJson(),
      });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      $('#wdStatus').textContent = '✓ Uploaded at ' + new Date().toLocaleTimeString();
      toast('Saved to WebDAV', 'success');
    } catch (err) {
      $('#wdStatus').textContent = '✗ ' + err.message;
      toast('WebDAV upload failed: ' + err.message, 'error');
    }
  });
  $('#wdLoadBtn')?.addEventListener('click', async () => {
    try {
      const url = $('#wdUrl').value.trim();
      const user = $('#wdUser').value.trim();
      const pass = $('#wdPass').value;
      const fn = $('#wdFile').value.trim();
      if (!url || !user || !pass || !fn) { toast('Fill every field', 'error'); return; }
      $('#wdStatus').textContent = 'Downloading…';
      const res = await fetch(url.replace(/\/?$/, '/') + encodeURIComponent(fn), {
        method: 'GET',
        headers: { 'Authorization': 'Basic ' + btoa(user + ':' + pass) },
      });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const data = await res.json();
      applyRwdJson(data);
      $('#wdStatus').textContent = '✓ Loaded ' + fn;
      toast('Loaded from WebDAV', 'success');
    } catch (err) {
      $('#wdStatus').textContent = '✗ ' + err.message;
      toast('WebDAV download failed: ' + err.message, 'error');
    }
  });

  // #99 Email this doc — mailto: with subject + body chunked
  function emailDoc() {
    const subject = encodeURIComponent(docTitle.value || 'Document');
    let body = (editor.innerText || '').slice(0, 1900); // mailto length safe
    // RFC 2368 — newlines as %0D%0A
    const url = 'mailto:?subject=' + subject + '&body=' +
      encodeURIComponent(body) + (editor.innerText.length > 1900 ? '%0A%0A(Truncated.)' : '');
    window.location.href = url;
  }

  // #100 Send to Slack / Teams — copy Markdown to clipboard
  async function copySlackMarkdown() {
    const md = (window.RodmanInterop && window.RodmanInterop.mdExport)
      ? window.RodmanInterop.mdExport(editor.innerHTML, {})
      : (window.__rwdHtmlToMarkdown ? window.__rwdHtmlToMarkdown(editor.innerHTML) : editor.innerText);
    // Slack flavour: convert # headings to bold lines (Slack doesn't render H1)
    const slack = md
      .replace(/^# (.*)$/gm, '*$1*')
      .replace(/^## (.*)$/gm, '*$1*')
      .replace(/^### (.*)$/gm, '_$1_');
    try {
      await navigator.clipboard.writeText(slack);
      toast('Slack-flavoured Markdown copied to clipboard', 'success');
    } catch {
      prompt('Slack-flavoured Markdown:', slack);
    }
  }

  setBackstageView = (function (orig) {
    return function (action) {
      if (action === 'share-readonly') { closeBackstage(); shareReadOnly(); return; }
      if (action === 'share-comments') { closeBackstage(); shareCommentOnly(); return; }
      if (action === 'webdav-sync') { closeBackstage(); openWebDAV(); return; }
      if (action === 'email-doc') { closeBackstage(); emailDoc(); return; }
      if (action === 'send-slack') { closeBackstage(); copySlackMarkdown(); return; }
      if (action === 'inspect') {
        closeBackstage();
        if (typeof renderInspect === 'function') renderInspect();
        openModal($('#inspectModal'));
        return;
      }
      return orig(action);
    };
  })(setBackstageView);

  // ============================================================
  // FEATURE: Section L — Export / interop (#86–#95)
  // ============================================================
  function doExport(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
  }

  function exportOdt() {
    if (!window.RodmanInterop) { toast('interop.js not loaded', 'error'); return; }
    const bytes = window.RodmanInterop.odtExport(editor.innerHTML, docTitle.value);
    if (!bytes) { toast('ODT export needs the docx ZIP utilities', 'error'); return; }
    doExport(sanitizeFileName(docTitle.value) + '.odt',
      new Blob([bytes], { type: 'application/vnd.oasis.opendocument.text' }));
    toast('Exported .odt', 'success');
  }
  function exportRtf() {
    if (!window.RodmanInterop) { toast('interop.js not loaded', 'error'); return; }
    const rtf = window.RodmanInterop.rtfExport(editor.innerHTML, docTitle.value);
    doExport(sanitizeFileName(docTitle.value) + '.rtf', rtf, 'application/rtf');
    toast('Exported .rtf', 'success');
  }
  function exportEpub() {
    if (!window.RodmanInterop) { toast('interop.js not loaded', 'error'); return; }
    const bytes = window.RodmanInterop.epubExport(editor.innerHTML, docTitle.value);
    if (!bytes) { toast('EPUB export needs the docx ZIP utilities', 'error'); return; }
    doExport(sanitizeFileName(docTitle.value) + '.epub',
      new Blob([bytes], { type: 'application/epub+zip' }));
    toast('Exported .epub', 'success');
  }
  function exportAsciidoc() {
    if (!window.RodmanInterop) { toast('interop.js not loaded', 'error'); return; }
    const ad = window.RodmanInterop.asciidocExport(editor.innerHTML, docTitle.value);
    doExport(sanitizeFileName(docTitle.value) + '.adoc', ad, 'text/asciidoc');
    toast('Exported .adoc', 'success');
  }
  function exportLatex() {
    if (!window.RodmanInterop) { toast('interop.js not loaded', 'error'); return; }
    const tex = window.RodmanInterop.latexExport(editor.innerHTML, docTitle.value);
    doExport(sanitizeFileName(docTitle.value) + '.tex', tex, 'application/x-tex');
    toast('Exported .tex', 'success');
  }

  // Hook the existing exportMarkdown to add YAML front-matter support
  if (typeof exportMarkdown === 'function') {
    const __origMd = exportMarkdown;
    window.__rwdHtmlToMarkdown = (html) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return htmlToMarkdown(tmp);
    };
    exportMarkdown = function () {
      if (!window.RodmanInterop) return __origMd();
      const md = window.RodmanInterop.mdExport(editor.innerHTML, {
        title: docTitle.value || undefined,
        author: (docProps && docProps.author) || undefined,
        date: new Date().toISOString().slice(0, 10),
      });
      doExport(sanitizeFileName(docTitle.value) + '.md', md, 'text/markdown');
      toast('Exported .md', 'success');
    };
  }

  // Markdown live preview pane
  function openMdPreview() {
    const ta = $('#mdInput');
    const out = $('#mdRendered');
    if (!ta || !out) return;
    // Pre-populate from current doc as Markdown
    if (window.__rwdHtmlToMarkdown) {
      ta.value = window.__rwdHtmlToMarkdown(editor.innerHTML);
    } else { ta.value = editor.innerText; }
    function render() {
      out.innerHTML = (window.__rwdTinyMd || ((s) => s))(ta.value);
    }
    ta.oninput = render;
    render();
    openModal($('#mdPreviewModal'));
  }
  $('#mdInsertBtn')?.addEventListener('click', () => {
    const out = $('#mdRendered');
    if (!out) return;
    restoreSelection();
    document.execCommand('insertHTML', false, out.innerHTML);
    closeModal($('#mdPreviewModal'));
    queueAutosave();
  });

  // Hook into backstage
  setBackstageView = (function (orig) {
    return function (action) {
      if (action === 'export-odt') { exportOdt(); closeBackstage(); return; }
      if (action === 'export-rtf') { exportRtf(); closeBackstage(); return; }
      if (action === 'export-epub') { exportEpub(); closeBackstage(); return; }
      if (action === 'export-asciidoc') { exportAsciidoc(); closeBackstage(); return; }
      if (action === 'export-latex') { exportLatex(); closeBackstage(); return; }
      if (action === 'md-preview') { closeBackstage(); openMdPreview(); return; }
      return orig(action);
    };
  })(setBackstageView);

  // Extend file picker for RTF / ODT / EPUB
  const __existingFilePickerHandler = $('#filePicker').onchange;
  $('#filePicker').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (/\.rtf$/i.test(file.name) || file.type === 'application/rtf') {
      try {
        const text = await file.text();
        editor.innerHTML = sanitizeImported(window.RodmanInterop.rtfImport(text));
        docTitle.value = file.name.replace(/\.rtf$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        toast('Imported .rtf', 'success');
      } catch (err) {
        toast('RTF import failed: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    if (/\.odt$/i.test(file.name) || file.type === 'application/vnd.oasis.opendocument.text') {
      const buf = await file.arrayBuffer();
      try {
        const html = await window.RodmanInterop.odtImport(buf);
        editor.innerHTML = sanitizeImported(html);
        docTitle.value = file.name.replace(/\.odt$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        toast('Imported .odt', 'success');
      } catch (err) {
        toast('ODT import failed: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    if (/\.epub$/i.test(file.name) || file.type === 'application/epub+zip') {
      const buf = await file.arrayBuffer();
      try {
        const html = await window.RodmanInterop.epubImport(buf);
        editor.innerHTML = sanitizeImported(html);
        docTitle.value = file.name.replace(/\.epub$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        toast('Imported .epub', 'success');
      } catch (err) {
        toast('EPUB import failed: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    // For other formats, fall back to existing handlers (already wired)
  });

  // ============================================================
  // FEATURE: Section K — View modes (#80–#85)
  // ============================================================

  // #80 True outline view — full-document overlay with drag reorder
  $('#outlineEditBtn')?.addEventListener('click', () => {
    let overlay = document.querySelector('.outline-edit-overlay');
    if (overlay) { overlay.remove(); return; }
    overlay = document.createElement('div');
    overlay.className = 'outline-edit-overlay';
    overlay.innerHTML = '<header><span>Outline editor — drag to reorder, double-click to edit</span>' +
      '<button class="icon-btn" title="Close">✕</button></header><ol></ol>';
    overlay.querySelector('.icon-btn').addEventListener('click', () => overlay.remove());
    const ol = overlay.querySelector('ol');
    const headings = Array.from(editor.querySelectorAll('h1,h2,h3,h4'));
    headings.forEach((h, i) => {
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);
      li.draggable = true;
      li.dataset.idx = i;
      li.textContent = h.textContent || '(empty)';
      li.addEventListener('dblclick', () => {
        const v = prompt('Edit heading text:', h.textContent);
        if (v != null) {
          h.textContent = v;
          li.textContent = v || '(empty)';
          queueAutosave();
        }
      });
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = parseInt(li.dataset.idx, 10);
        if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
        const fromH = headings[fromIdx];
        const toH = headings[toIdx];
        if (fromH && toH) {
          if (typeof moveSection === 'function') moveSection(fromH, toH);
        }
        overlay.remove();
        $('#outlineEditBtn').click();
      });
      ol.appendChild(li);
    });
    document.body.appendChild(overlay);
  });

  // #81 Two-page spread
  $('#twoPageBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('two-page-spread');
  });

  // #82 Side-by-side reading
  $('#sxsReadingBtn')?.addEventListener('click', () => {
    // Reuse the side-by-side compare modal; populate left with the
    // current doc and right empty for reading.
    if ($('#sxsLeft')) $('#sxsLeft').innerHTML = editor.innerHTML;
    if ($('#sxsRightInput')) $('#sxsRightInput').placeholder = 'Paste text here for side-by-side reading…';
    openModal($('#sideBySideModal'));
  });

  // #83 Mobile preview
  $('#mobilePreviewBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('mobile-preview');
    toast(document.body.classList.contains('mobile-preview')
      ? 'Mobile preview ON' : 'Mobile preview OFF', 'info');
  });

  // #84 Full-screen editor
  $('#fullscreenEditorBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('fullscreen-editor');
    if (document.documentElement.requestFullscreen &&
        document.body.classList.contains('fullscreen-editor')) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });

  // #85 Reading-mode dyslexia preset
  $('#readingDyslexiaBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('dyslexia');
    if (!document.body.classList.contains('reading-mode')) {
      // Auto-enter reading mode if not already
      if (typeof enterReadingMode === 'function') enterReadingMode();
    }
    toast('Dyslexia preset ' +
      (document.body.classList.contains('dyslexia') ? 'ON' : 'OFF'), 'info');
  });

  // ============================================================
  // FEATURE: Section J — Search advanced (#74–#79)
  // ============================================================
  const STORE_SAVED_SEARCHES = 'rodmanword:savedSearches';
  let savedSearches = [];
  try { savedSearches = JSON.parse(localStorage.getItem(STORE_SAVED_SEARCHES) || '[]'); } catch {}

  // #74 Find in selection only — wrap rerunFind to honour scope
  if (typeof rerunFind === 'function') {
    const __origRerun = rerunFind;
    rerunFind = function () {
      const scope = $('#findScope') ? $('#findScope').value : 'all';
      const fmtBold = $('#findByFormatBold')?.checked;
      const fmtItalic = $('#findByFormatItalic')?.checked;
      const fmtUnder = $('#findByFormatUnderline')?.checked;

      // For "no text + only formatting" find, just collect those nodes.
      const term = $('#findInput').value;
      if (!term && (fmtBold || fmtItalic || fmtUnder)) {
        clearFindMarks();
        const all = editor.querySelectorAll(
          (fmtBold ? 'b, strong' : '*[data-no-bold]') +
          (fmtItalic ? ', i, em' : '') +
          (fmtUnder ? ', u' : '')
        );
        all.forEach((el) => {
          const span = document.createElement('span');
          span.className = 'rwd-find-mark';
          el.parentNode.insertBefore(span, el);
          span.appendChild(el);
          findMarks.push(span);
        });
        findCount.textContent = findMarks.length + ' format matches';
        return;
      }

      // Run the original (this re-marks the entire editor); then trim
      // marks that fall outside the chosen scope.
      __origRerun();

      if (scope === 'all' && !fmtBold && !fmtItalic && !fmtUnder) return;

      const passes = (mark) => {
        if (scope === 'selection') {
          const r = window.getSelection();
          if (!r || !r.rangeCount) return false;
          const sr = r.getRangeAt(0);
          return sr.intersectsNode(mark);
        }
        if (scope === 'comments') return !!mark.closest('.rwd-comment');
        if (scope === 'footnotes') return !!mark.closest('.rwd-footnotes');
        if (scope === 'headings') return !!mark.closest('h1,h2,h3,h4,h5,h6');
        return true;
      };
      const fmtPasses = (mark) => {
        if (!fmtBold && !fmtItalic && !fmtUnder) return true;
        const test = mark.parentElement;
        const isB = !!test.closest('b, strong');
        const isI = !!test.closest('i, em');
        const isU = !!test.closest('u');
        return (!fmtBold || isB) && (!fmtItalic || isI) && (!fmtUnder || isU);
      };

      const kept = [];
      findMarks.forEach((m) => {
        if (passes(m) && fmtPasses(m)) kept.push(m);
        else {
          const p = m.parentNode;
          while (m.firstChild) p.insertBefore(m.firstChild, m);
          p.removeChild(m);
          p.normalize();
        }
      });
      findMarks = kept;
      findCount.textContent = kept.length + ' matches in ' + scope;
    };
  }

  // #76 Capture groups — already work since we use String#replace with
  // the user's pattern when matchRegex is on. The replaceAll handler
  // re-runs RegExp.replace which honours $1, $2, etc. natively. Verify
  // by wrapping replaceAllBtn:
  if ($('#replaceAllBtn')) {
    $('#replaceAllBtn').addEventListener('click', () => {
      // Quietly nothing; existing handler does the right thing for
      // both literal and regex modes including capture groups.
    });
  }

  // #77 Search across recent docs
  $('#searchAcrossBtn')?.addEventListener('click', () => {
    const term = $('#findInput').value;
    if (!term) { toast('Type a search term first', 'info'); return; }
    let recents = [];
    try { recents = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    if (!recents.length) { toast('No recent docs', 'info'); return; }
    let report = 'Across recent: searching for "' + term + '"\n';
    recents.forEach((r) => {
      // We only stored title and at; nothing to grep. Note this fact.
      report += '• ' + r.title + ' (' + new Date(r.at).toLocaleDateString() + ')\n';
    });
    alert(report + '\n(Recent metadata only — bodies are not stored locally.)');
  });

  // #78 Save searches
  function refreshSavedSearches() {
    const ul = $('#savedSearchesList');
    if (!ul) return;
    ul.innerHTML = '';
    savedSearches.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(s.name) +
        ' <small style="color:var(--muted)">— ' + escapeHtml(s.term || '(format)') + '</small></span>' +
        '<span class="actions">' +
          '<button data-act="run">Run</button>' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="run"]').addEventListener('click', () => {
        $('#findInput').value = s.term || '';
        $('#matchCase').checked = !!s.matchCase;
        if ($('#matchWord')) $('#matchWord').checked = !!s.matchWord;
        if ($('#matchRegex')) $('#matchRegex').checked = !!s.matchRegex;
        if ($('#findScope')) $('#findScope').value = s.scope || 'all';
        if ($('#findByFormatBold')) $('#findByFormatBold').checked = !!s.fmtBold;
        if ($('#findByFormatItalic')) $('#findByFormatItalic').checked = !!s.fmtItalic;
        if ($('#findByFormatUnderline')) $('#findByFormatUnderline').checked = !!s.fmtUnder;
        rerunFind();
      });
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        savedSearches.splice(i, 1);
        try { localStorage.setItem(STORE_SAVED_SEARCHES, JSON.stringify(savedSearches)); } catch {}
        refreshSavedSearches();
      });
      ul.appendChild(li);
    });
  }
  $('#saveSearchBtn')?.addEventListener('click', () => {
    const name = prompt('Save this search as:', $('#findInput').value || 'Search');
    if (!name) return;
    savedSearches.push({
      name,
      term: $('#findInput').value,
      matchCase: $('#matchCase').checked,
      matchWord: !!$('#matchWord')?.checked,
      matchRegex: !!$('#matchRegex')?.checked,
      scope: $('#findScope')?.value,
      fmtBold: !!$('#findByFormatBold')?.checked,
      fmtItalic: !!$('#findByFormatItalic')?.checked,
      fmtUnder: !!$('#findByFormatUnderline')?.checked,
    });
    try { localStorage.setItem(STORE_SAVED_SEARCHES, JSON.stringify(savedSearches)); } catch {}
    refreshSavedSearches();
    toast('Search saved', 'success');
  });
  // Refresh on find dialog open
  if ($('#findBtn')) {
    $('#findBtn').addEventListener('click', () => {
      setTimeout(refreshSavedSearches, 50);
    });
  }

  // #79 Find in selection / scope dropdown — wired above via wrap

  // ============================================================
  // FEATURE: Section I — Editing power-tools (#64–#73)
  // ============================================================

  // #64 Multiple cursors — Alt+Click adds an extra caret. The extra
  // carets are virtual (rendered as overlay elements). Typing
  // applies once at each caret position.
  const extraCarets = []; // each { node, offset, marker }
  function clearExtraCarets() {
    extraCarets.forEach((c) => c.marker && c.marker.remove());
    extraCarets.length = 0;
  }
  editor.addEventListener('mousedown', (e) => {
    if (!e.altKey || e.shiftKey) return;
    e.preventDefault();
    const pt = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : null;
    if (!pt) return;
    const r = pt.getBoundingClientRect();
    const marker = document.createElement('span');
    marker.className = 'rwd-extra-caret';
    marker.style.left = (r.left + window.scrollX) + 'px';
    marker.style.top = (r.top + window.scrollY) + 'px';
    document.body.appendChild(marker);
    extraCarets.push({ node: pt.startContainer, offset: pt.startOffset, marker });
  });
  editor.addEventListener('keydown', (e) => {
    if (!extraCarets.length || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) {
      if (e.key === 'Escape') { clearExtraCarets(); }
      return;
    }
    e.preventDefault();
    extraCarets.forEach((c) => {
      try {
        const t = c.node;
        if (t && t.nodeType === 3) {
          t.nodeValue = t.nodeValue.slice(0, c.offset) + e.key +
            t.nodeValue.slice(c.offset);
          c.offset += 1;
        }
      } catch {}
    });
    queueAutosave();
  }, true);

  // #65 Column / block selection — Alt+Drag selects rectangular
  // text within a single block. Implemented by intercepting mouse
  // events when alt is held; we collect a selection by row.
  let blockSel = null;
  editor.addEventListener('mousedown', (e) => {
    if (!e.altKey || !e.shiftKey) return;
    e.preventDefault();
    blockSel = { x1: e.clientX, y1: e.clientY };
  });
  document.addEventListener('mouseup', (e) => {
    if (!blockSel) return;
    const x2 = e.clientX, y2 = e.clientY;
    const range = document.createRange();
    const a = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(blockSel.x1, blockSel.y1)
      : null;
    const b = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(x2, y2)
      : null;
    if (a && b) {
      try {
        range.setStart(a.startContainer, a.startOffset);
        range.setEnd(b.startContainer, b.startOffset);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {}
    }
    blockSel = null;
  });

  // #66 Move line up/down — refines the existing paragraph mover so
  // single lines (separated by <br> inside a block) also move.
  // The existing handler covers blocks; we add a fast path here for
  // when Alt+ArrowUp/Down with selection inside one block.
  // (Already handled — keep current behavior.)

  // #67 Duplicate line / paragraph — Ctrl+D
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'd') return;
    if (!editor.contains(document.activeElement) && document.activeElement !== editor) return;
    e.preventDefault();
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (!n) return;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li, div');
    if (!block || !editor.contains(block)) return;
    const dup = block.cloneNode(true);
    block.parentNode.insertBefore(dup, block.nextSibling);
    queueAutosave();
  });

  // #68 Toggle comment (HTML comment)
  function toggleHtmlComment() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast('Select text to toggle comment', 'info');
      return;
    }
    const txt = sel.toString();
    if (/^\s*<!--[\s\S]*-->\s*$/.test(txt)) {
      const stripped = txt.replace(/^\s*<!--/, '').replace(/-->\s*$/, '');
      document.execCommand('insertHTML', false, stripped);
    } else {
      document.execCommand('insertHTML', false, '<!-- ' + escapeHtml(txt) + ' -->');
    }
    queueAutosave();
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      toggleHtmlComment();
    }
  });

  // #69 Smart bracket matching — when caret is next to (), [], {},
  // highlight both ends.
  function clearBracketMatch() {
    editor.querySelectorAll('.rwd-bracket-match').forEach((s) => {
      const p = s.parentNode;
      while (s.firstChild) p.insertBefore(s.firstChild, s);
      p.removeChild(s);
      p.normalize();
    });
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== editor) return;
    clearBracketMatch();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return;
    const node = r.startContainer;
    if (node.nodeType !== 3) return;
    const text = node.nodeValue;
    const offset = r.startOffset;
    const ch = text[offset] || text[offset - 1];
    const pairs = { '(': ')', '[': ']', '{': '}' };
    if (!pairs[ch]) return;
    // Find matching closer in the rest of the same text node
    const open = ch, close = pairs[ch];
    const start = text[offset] === ch ? offset : offset - 1;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === close) {
        depth--;
        if (depth === 0) {
          // wrap [start..start+1] and [i..i+1] in match spans
          try {
            const r1 = document.createRange();
            r1.setStart(node, start); r1.setEnd(node, start + 1);
            const s1 = document.createElement('span');
            s1.className = 'rwd-bracket-match';
            r1.surroundContents(s1);
            // Note: surroundContents shifts indices; recompute close
            const tn2 = s1.nextSibling;
            if (tn2 && tn2.nodeType === 3) {
              const idx = i - start - 1;
              const r2 = document.createRange();
              r2.setStart(tn2, idx); r2.setEnd(tn2, idx + 1);
              const s2 = document.createElement('span');
              s2.className = 'rwd-bracket-match';
              r2.surroundContents(s2);
            }
          } catch {}
          break;
        }
      }
    }
  });

  // #70 Invert selection
  function invertSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const cur = sel.getRangeAt(0);
    const before = document.createRange();
    before.setStart(editor, 0);
    before.setEnd(cur.startContainer, cur.startOffset);
    const after = document.createRange();
    after.setStart(cur.endContainer, cur.endOffset);
    after.setEnd(editor, editor.childNodes.length);
    sel.removeAllRanges();
    sel.addRange(before);
    sel.addRange(after);
    toast('Selection inverted', 'info');
  }
  // Expose via Ctrl+Shift+I
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      invertSelection();
    }
  });

  // #71 Expand selection by syntactic unit (Ctrl+Shift+W)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      expandSelection();
    }
  });
  function expandSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    let n = r.startContainer;
    if (n.nodeType !== 1) n = n.parentElement;
    const targets = ['p', 'li', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    if (!targets.includes(n.tagName.toLowerCase())) {
      // Word
      const text = (n.textContent || '');
      const offset = r.startOffset;
      let s = offset, e2 = offset;
      while (s > 0 && /\w/.test(text[s - 1])) s--;
      while (e2 < text.length && /\w/.test(text[e2])) e2++;
      if (n.firstChild && n.firstChild.nodeType === 3) {
        r.setStart(n.firstChild, s); r.setEnd(n.firstChild, e2);
        sel.removeAllRanges(); sel.addRange(r);
      }
      return;
    }
    // Sentence -> paragraph -> section
    const block = n;
    if (r.toString() !== block.textContent) {
      r.selectNodeContents(block);
      sel.removeAllRanges(); sel.addRange(r);
      return;
    }
    // Already paragraph: expand to section (until next equal-or-higher heading)
    const lvlMatch = /^H([1-6])$/i.test(block.tagName);
    if (lvlMatch) {
      const lvl = parseInt(block.tagName.charAt(1), 10);
      let last = block;
      let nx = block.nextElementSibling;
      while (nx) {
        if (/^H[1-6]$/.test(nx.tagName) && parseInt(nx.tagName.charAt(1), 10) <= lvl) break;
        last = nx;
        nx = nx.nextElementSibling;
      }
      const r2 = document.createRange();
      r2.setStartBefore(block);
      r2.setEndAfter(last);
      sel.removeAllRanges(); sel.addRange(r2);
    }
  }

  // #72 Select all of same heading level
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      const sel = window.getSelection();
      let n = sel && sel.anchorNode;
      if (n && n.nodeType !== 1) n = n.parentElement;
      const h = n && n.closest && n.closest('h1,h2,h3,h4,h5,h6');
      if (!h) return;
      e.preventDefault();
      const tag = h.tagName;
      const all = editor.querySelectorAll(tag.toLowerCase());
      if (!all.length) return;
      const r = document.createRange();
      r.setStart(all[0], 0);
      r.setEnd(all[all.length - 1], all[all.length - 1].childNodes.length);
      sel.removeAllRanges(); sel.addRange(r);
      toast('Selected all <' + tag + '> headings', 'info');
    }
  });

  // #73 Auto-pair tags — only inside <pre>; when typing < followed by
  // a tag name and >, insert the matching closing tag.
  editor.addEventListener('input', (e) => {
    if (e.inputType !== 'insertText') return;
    if (e.data !== '>') return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return;
    const node = r.startContainer;
    if (node.nodeType !== 3) return;
    const pre = node.parentElement && node.parentElement.closest('pre');
    if (!pre) return;
    const text = node.nodeValue;
    const offset = r.startOffset;
    const before = text.slice(0, offset);
    const m = before.match(/<([a-zA-Z][\w-]*)\s*[^<>]*>$/);
    if (!m) return;
    const tag = m[1];
    if (['br', 'hr', 'img', 'input'].includes(tag.toLowerCase())) return;
    const closing = '</' + tag + '>';
    node.nodeValue = text.slice(0, offset) + closing + text.slice(offset);
    r.setStart(node, offset); r.setEnd(node, offset);
    sel.removeAllRanges(); sel.addRange(r);
  });

  // ============================================================
  // FEATURE: Section H — Forms & fields advanced (#59–#63)
  // ============================================================

  // #59 Date-picker form field
  $('#formDateBtn')?.addEventListener('click', () => {
    const html = '<input class="rwd-form-date" type="date"/>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // #60 Number form field with validation
  $('#formNumberBtn')?.addEventListener('click', () => {
    const min = prompt('Min (blank for none):', '0');
    const max = prompt('Max (blank for none):', '');
    const step = prompt('Step (blank for 1):', '1');
    const required = confirm('Required?');
    let html = '<input class="rwd-form-number" type="number"';
    if (min !== null && min !== '') html += ' min="' + escapeHtml(min) + '"';
    if (max !== null && max !== '') html += ' max="' + escapeHtml(max) + '"';
    if (step !== null && step !== '') html += ' step="' + escapeHtml(step) + '"';
    if (required) html += ' required';
    html += '/>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // #61 Required marker — extend formTextBtn to also support required
  // Already done via the formNumberBtn flow; for the existing text
  // field, add a small dblclick to toggle required.
  editor.addEventListener('dblclick', (e) => {
    const inp = e.target.closest && e.target.closest('input.rwd-form-text, input.rwd-form-date, input.rwd-form-number, select.rwd-form-select');
    if (!inp) return;
    e.preventDefault();
    const wasRequired = inp.hasAttribute('required');
    if (wasRequired) inp.removeAttribute('required');
    else inp.setAttribute('required', '');
    toast('Field is now ' + (wasRequired ? 'optional' : 'required'), 'info');
    queueAutosave();
  });

  // #62 Form data export — CSV row of all form-field values
  $('#formExportBtn')?.addEventListener('click', () => {
    const fields = Array.from(editor.querySelectorAll(
      'input.rwd-form-text, input.rwd-form-date, input.rwd-form-number, ' +
      'input.rwd-form-check, select.rwd-form-select'));
    if (!fields.length) { toast('No form fields found', 'info'); return; }
    const headers = fields.map((f, i) => f.placeholder || ('field-' + (i + 1)));
    const values = fields.map((f) => {
      if (f.type === 'checkbox') return f.checked ? 'true' : 'false';
      return (f.value || '').toString();
    });
    const csv = headers.join(',') + '\n' +
      values.map((v) => '"' + v.replace(/"/g, '""') + '"').join(',');
    downloadBlob(csv, sanitizeFileName(docTitle.value || 'form') + '.csv', 'text/csv');
    toast('Form data exported', 'success');
  });

  // #63 Field code editor — list every [data-field] in document order
  $('#fieldCodeBtn')?.addEventListener('click', () => {
    const ul = $('#fieldCodeList');
    ul.innerHTML = '';
    const tokens = Array.from(editor.querySelectorAll('[data-field]'));
    if (!tokens.length) {
      ul.innerHTML = '<li class="empty">No live fields in this document yet.</li>';
    } else {
      tokens.forEach((el, i) => {
        const li = document.createElement('li');
        li.innerHTML =
          '<span class="name"><code>{' + escapeHtml(el.dataset.field) +
          '}</code> → <i>' + escapeHtml(el.textContent) + '</i></span>' +
          '<span class="actions">' +
            '<button data-act="goto">Go</button>' +
            '<button data-act="change">Change type</button>' +
            '<button data-act="delete">Remove</button>' +
          '</span>';
        li.querySelector('[data-act="goto"]').addEventListener('click', () => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid var(--theme-accent-2)';
          setTimeout(() => { el.style.outline = ''; }, 1000);
        });
        li.querySelector('[data-act="change"]').addEventListener('click', () => {
          const v = prompt('Field type (page / pages / date / time / datetime / docTitle / author / wordCount):',
            el.dataset.field);
          if (!v || !FIELDS[v]) { toast('Unknown field type', 'error'); return; }
          el.dataset.field = v;
          refreshFields();
          queueAutosave();
          $('#fieldCodeBtn').click();
        });
        li.querySelector('[data-act="delete"]').addEventListener('click', () => {
          el.remove();
          queueAutosave();
          $('#fieldCodeBtn').click();
        });
        ul.appendChild(li);
      });
    }
    openModal($('#fieldCodeModal'));
  });

  // ============================================================
  // FEATURE: Section G — References & academic (#52–#58)
  // ============================================================
  const STORE_CITESTYLE = 'rodmanword:citeStyle';
  let citeStyle = localStorage.getItem(STORE_CITESTYLE) || 'apa';

  // #52 DOI lookup → auto-citation
  $('#doiBtn')?.addEventListener('click', async () => {
    const doi = prompt('Enter DOI (e.g. 10.1038/s41586-021-03819-2):', '');
    if (!doi) return;
    try {
      const res = await fetch('https://doi.org/' + encodeURIComponent(doi.trim()), {
        headers: { 'Accept': 'application/vnd.citationstyles.csl+json' },
      });
      if (!res.ok) throw new Error('Lookup failed: ' + res.status);
      const j = await res.json();
      const author = (j.author || []).map((a) =>
        (a.family || '') + (a.given ? ', ' + a.given.charAt(0) + '.' : '')).join('; ') || 'Anon';
      const year = j.issued && j.issued['date-parts'] && j.issued['date-parts'][0]
        ? j.issued['date-parts'][0][0] : '';
      const title = j.title || '';
      const source = (j['container-title'] || j.publisher || '') +
        (j.volume ? ', ' + j.volume : '') +
        (j.issue ? '(' + j.issue + ')' : '') +
        (j.page ? ', ' + j.page : '') + ' (DOI: ' + doi + ')';
      const c = { author, year, title, source };
      const id = citationId(c);
      citations[id] = c;
      persistCites();
      insertCitationRef(id);
      toast('Cited: ' + title.slice(0, 40), 'success');
    } catch (err) {
      toast('DOI lookup failed: ' + err.message, 'error');
    }
  });

  // #53 ISBN lookup → auto-citation (Open Library)
  $('#isbnBtn')?.addEventListener('click', async () => {
    const isbn = prompt('Enter ISBN-10 or ISBN-13:', '');
    if (!isbn) return;
    try {
      const res = await fetch('https://openlibrary.org/api/books?bibkeys=ISBN:' +
        encodeURIComponent(isbn.replace(/[^0-9X]/gi, '')) +
        '&format=json&jscmd=data');
      if (!res.ok) throw new Error('Lookup failed');
      const j = await res.json();
      const k = Object.keys(j)[0];
      if (!k) throw new Error('Not found');
      const b = j[k];
      const author = (b.authors || []).map((a) => a.name).join('; ') || 'Anon';
      const year = (b.publish_date || '').match(/\d{4}/)?.[0] || '';
      const title = b.title || '';
      const source = (b.publishers || []).map((p) => p.name).join(', ') +
        ' (ISBN: ' + isbn + ')';
      const c = { author, year, title, source };
      const id = citationId(c);
      citations[id] = c;
      persistCites();
      insertCitationRef(id);
      toast('Cited: ' + title.slice(0, 40), 'success');
    } catch (err) {
      toast('ISBN lookup failed: ' + err.message, 'error');
    }
  });

  // #54 BibTeX import — paste a .bib chunk; parse minimal entries
  $('#bibtexBtn')?.addEventListener('click', () => {
    const text = prompt('Paste BibTeX:', '');
    if (!text) return;
    const re = /@(\w+)\s*\{\s*([^,]+),([^@]*)/g;
    let m, count = 0;
    while ((m = re.exec(text)) !== null) {
      const fields = {};
      const body = m[3];
      const fre = /(\w+)\s*=\s*[{"]?([^"}]*)[}"]?\s*,?/g;
      let f;
      while ((f = fre.exec(body)) !== null) {
        fields[f[1].toLowerCase()] = f[2].trim();
      }
      const c = {
        author: fields.author || 'Anon',
        year: fields.year || '',
        title: fields.title || '',
        source: [fields.journal, fields.publisher, fields.booktitle].filter(Boolean).join(', '),
      };
      const id = m[2].trim() || citationId(c);
      citations[id] = c;
      count++;
    }
    persistCites();
    toast('Imported ' + count + ' BibTeX entries', 'success');
  });

  // #55 Citation style switcher
  $('#citationStyleSelect')?.addEventListener('change', (e) => {
    citeStyle = e.target.value;
    localStorage.setItem(STORE_CITESTYLE, citeStyle);
    refreshCitations();
    // Rewrite any inserted bibliographies to follow the new style
    editor.querySelectorAll('.rwd-bibliography').forEach((bib) => {
      const order = refreshCitations();
      bib.innerHTML = renderBibliographyHtmlStyled(order, citeStyle);
    });
    queueAutosave();
  });
  function renderBibliographyHtmlStyled(order, style) {
    const ids = Object.keys(order).sort((a, b) => order[a] - order[b]);
    let html = '<h2>Bibliography</h2><ol>';
    ids.forEach((id) => {
      const c = citations[id];
      const a = (c && c.author) || 'Anon';
      const y = (c && c.year) || 'n.d.';
      const t = (c && c.title) || 'Untitled';
      const s = (c && c.source) || '';
      let entry = '';
      switch (style) {
        case 'mla':
          entry = a + '. <i>' + t + '</i>. ' + s + ', ' + y + '.';
          break;
        case 'chicago':
          entry = a + '. ' + y + '. <i>' + t + '</i>. ' + s + '.';
          break;
        case 'ieee':
          entry = '[' + order[id] + '] ' + a + ', "' + t + '," ' + s + ', ' + y + '.';
          break;
        case 'harvard':
          entry = a + ' (' + y + ') <i>' + t + '</i>, ' + s + '.';
          break;
        case 'vancouver':
          entry = order[id] + '. ' + a + '. ' + t + '. ' + s + '. ' + y + '.';
          break;
        default: // apa
          entry = a + ' (' + y + '). <i>' + t + '</i>. ' + s + '.';
      }
      html += '<li>' + entry + '</li>';
    });
    return html + '</ol>';
  }
  // Also use the styled renderer when inserting a new bibliography
  if ($('#bibliographyBtn')) {
    $('#bibliographyBtn').addEventListener('click', () => {
      // Allow the original handler to run, then post-process the
      // freshly inserted bibliography to match the chosen style.
      setTimeout(() => {
        const bib = editor.querySelector('.rwd-bibliography');
        if (bib) {
          const order = refreshCitations();
          bib.innerHTML = renderBibliographyHtmlStyled(order, citeStyle);
        }
      }, 50);
    });
  }

  // #56 Index (back-of-book)
  $('#indexMarkBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { toast('Select a term first', 'info'); return; }
    const term = prompt('Index term (defaults to selected text):', sel.toString().trim());
    if (!term) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.className = 'rwd-index';
    span.dataset.term = term;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch {}
    queueAutosave();
  });
  $('#insertIndexBtn')?.addEventListener('click', () => {
    // Collect all terms; build alphabetical index
    const map = {}; // term -> Set of pageNumber-like markers
    editor.querySelectorAll('.rwd-index').forEach((s) => {
      const t = s.dataset.term || s.textContent;
      if (!map[t]) map[t] = new Set();
      map[t].add(pageNumberOf(s));
    });
    const terms = Object.keys(map).sort((a, b) => a.localeCompare(b));
    if (!terms.length) { toast('Mark some terms first with ≡ Index entry', 'info'); return; }
    let html = '<div class="rwd-index-block"><h2>Index</h2><ul>';
    terms.forEach((t) => {
      const pages = Array.from(map[t]).sort((a, b) => a - b).join(', ');
      html += '<li><span class="term">' + escapeHtml(t) + '</span> — ' + pages + '</li>';
    });
    html += '</ul></div>';
    // Replace any existing index
    const old = editor.querySelector('.rwd-index-block');
    if (old) old.remove();
    editor.insertAdjacentHTML('beforeend', html);
    queueAutosave();
  });

  // #57 Lists of figures / tables / equations
  $('#listOfFiguresBtn')?.addEventListener('click', () => {
    const seqs = ['figure', 'table', 'equation'];
    let combinedHtml = '';
    seqs.forEach((seq) => {
      const items = editor.querySelectorAll('.rwd-caption[data-seq="' + seq + '"]');
      if (!items.length) return;
      const label = seq.charAt(0).toUpperCase() + seq.slice(1) + 's';
      combinedHtml += '<div class="rwd-list-of"><h3>List of ' + label + '</h3><ol>';
      items.forEach((c) => {
        const num = c.dataset.num || '';
        const text = c.dataset.text || '';
        combinedHtml += '<li>' + escapeHtml((c.dataset.label || seq) + ' ' + num + '. ' + text) + '</li>';
      });
      combinedHtml += '</ol></div>';
    });
    if (!combinedHtml) { toast('No captions found', 'info'); return; }
    restoreSelection();
    document.execCommand('insertHTML', false, combinedHtml + '<p><br/></p>');
    queueAutosave();
  });

  // #58 Cross-reference autocomplete — wrap the existing crossRefBtn
  // to show an inline picker instead of the prompt list. Reuse the
  // command-palette CSS for the dropdown.
  if ($('#crossRefBtn')) {
    const origCrossRef = $('#crossRefBtn').onclick;
    $('#crossRefBtn').onclick = null;
    $('#crossRefBtn').addEventListener('click', () => {
      const targets = collectXrefTargets();
      const ids = Object.keys(targets);
      if (!ids.length) { toast('Add a heading, caption, or bookmark first', 'info'); return; }
      // Build a temporary inline picker
      const pop = document.createElement('div');
      pop.className = 'context-menu';
      pop.style.cssText = 'left:50%;top:140px;transform:translateX(-50%);min-width:340px;max-height:60vh;overflow:auto';
      pop.innerHTML = '<button data-act="hdr" disabled><i>Click a target</i></button>';
      ids.forEach((id) => {
        const t = targets[id];
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = (t.number ? '<b>' + escapeHtml(t.number) + '</b> ' : '') +
          escapeHtml((t.text || '').slice(0, 60));
        b.addEventListener('click', () => {
          pop.remove();
          const html = '<a class="rwd-xref" href="#' + escapeHtml(id) +
            '" data-target="' + escapeHtml(id) + '" data-kind="auto" contenteditable="false">…</a>';
          restoreSelection();
          document.execCommand('insertHTML', false, html);
          refreshFields();
          queueAutosave();
        });
        pop.appendChild(b);
      });
      document.body.appendChild(pop);
      setTimeout(() => {
        document.addEventListener('mousedown', (ev) => {
          if (!pop.contains(ev.target)) pop.remove();
        }, { once: true });
      }, 0);
    });
  }

  // ============================================================
  // FEATURE: Section F — Templates, themes, branding (#44–#51)
  // ============================================================
  const STORE_BRAND = 'rodmanword:brand';
  const STORE_USER_TEMPLATES = 'rodmanword:userTemplates';
  const STORE_TEMPLATE_HISTORY = 'rodmanword:templateHistory';

  // #44 Template marketplace UI — extend renderTemplates() to also
  // include user-saved templates with thumbnails.
  if (typeof TEMPLATES !== 'undefined' && Array.isArray(TEMPLATES)) {
    const __origRender = renderTemplates;
    renderTemplates = function () {
      __origRender();
      let userTpl = {};
      try { userTpl = JSON.parse(localStorage.getItem(STORE_USER_TEMPLATES) || '{}'); } catch {}
      const grid = backstageContent.querySelector('.template-grid');
      if (!grid) return;
      Object.keys(userTpl).forEach((name) => {
        const t = userTpl[name];
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML =
          '<div class="thumb"><b>' + escapeHtml(name) + '</b><div class="bar"></div>' +
            '<div class="bar short"></div><div class="bar"></div></div>' +
          '<div class="name">' + escapeHtml(name) + ' <small style="color:var(--muted)">user</small></div>' +
          '<div class="desc">' + escapeHtml((t.description || 'Saved template')) + '</div>';
        card.addEventListener('click', () => {
          editor.innerHTML = t.html || '';
          docTitle.value = name;
          queueAutosave();
          rebuildOutline();
          closeBackstage();
          // Track applications
          try {
            const hist = JSON.parse(localStorage.getItem(STORE_TEMPLATE_HISTORY) || '[]');
            hist.unshift({ name, at: new Date().toISOString() });
            localStorage.setItem(STORE_TEMPLATE_HISTORY, JSON.stringify(hist.slice(0, 20)));
          } catch {}
        });
        grid.appendChild(card);
      });
    };
  }

  // #45 Save current doc as template
  function saveAsTemplate() {
    const name = prompt('Template name:', docTitle.value || 'My template');
    if (!name) return;
    const desc = prompt('Short description (optional):', '') || '';
    let map = {};
    try { map = JSON.parse(localStorage.getItem(STORE_USER_TEMPLATES) || '{}'); } catch {}
    map[name] = { html: editor.innerHTML, description: desc, savedAt: new Date().toISOString() };
    try { localStorage.setItem(STORE_USER_TEMPLATES, JSON.stringify(map)); } catch {}
    toast('Template "' + name + '" saved', 'success');
  }

  // #46 Brand kit
  function loadBrand() {
    let b = {};
    try { b = JSON.parse(localStorage.getItem(STORE_BRAND) || '{}'); } catch {}
    return b;
  }
  function applyBrand(b) {
    try { localStorage.setItem(STORE_BRAND, JSON.stringify(b)); } catch {}
    if (b.primary) document.documentElement.style.setProperty('--theme-accent-1', b.primary);
    if (b.secondary) document.documentElement.style.setProperty('--theme-accent-2', b.secondary);
    if (b.headingFont) document.documentElement.style.setProperty('--theme-heading-font', b.headingFont);
    if (b.bodyFont) document.documentElement.style.setProperty('--theme-body-font', b.bodyFont);
    document.body.classList.add('themed');
    // #47 Letterhead
    const existing = editor.querySelector('.rwd-letterhead');
    if (b.letterhead && b.logo) {
      const html = '<div class="rwd-letterhead" contenteditable="false">' +
        '<img src="' + escapeHtml(b.logo) + '" alt=""/>' +
        '<h2>' + escapeHtml(b.brandName || '') + '</h2></div>';
      if (existing) existing.outerHTML = html;
      else editor.insertAdjacentHTML('afterbegin', html);
    } else if (existing) {
      existing.remove();
    }
    queueAutosave();
  }
  function openBrandKit() {
    const b = loadBrand();
    $('#brandLogo').value = b.logo || '';
    $('#brandName').value = b.brandName || '';
    $('#brandPrimary').value = b.primary || '#2b579a';
    $('#brandSecondary').value = b.secondary || '#d23f31';
    $('#brandHeadingFont').value = b.headingFont || '';
    $('#brandBodyFont').value = b.bodyFont || '';
    $('#brandUseLetterhead').checked = !!b.letterhead;
    openModal($('#brandKitModal'));
  }
  $('#brandApplyBtn')?.addEventListener('click', () => {
    applyBrand({
      logo: $('#brandLogo').value.trim(),
      brandName: $('#brandName').value.trim(),
      primary: $('#brandPrimary').value,
      secondary: $('#brandSecondary').value,
      headingFont: $('#brandHeadingFont').value.trim(),
      bodyFont: $('#brandBodyFont').value.trim(),
      letterhead: $('#brandUseLetterhead').checked,
    });
    closeModal($('#brandKitModal'));
    toast('Brand kit applied', 'success');
  });
  $('#brandClearBtn')?.addEventListener('click', () => {
    try { localStorage.removeItem(STORE_BRAND); } catch {}
    editor.querySelectorAll('.rwd-letterhead').forEach((el) => el.remove());
    closeModal($('#brandKitModal'));
    toast('Brand cleared', 'info');
  });
  // Re-apply on init
  setTimeout(() => { const b = loadBrand(); if (Object.keys(b).length) applyBrand(b); }, 80);

  // #48 Cover page templates
  const COVER_PAGES = [
    { id: 'subtle', name: 'Subtle',
      html: '<div class="rwd-cover-page subtle"><h1>{TITLE}</h1><p>{SUBTITLE}</p><p style="margin-top:60px;color:var(--muted)">{AUTHOR} · {DATE}</p></div>' },
    { id: 'bold', name: 'Bold',
      html: '<div class="rwd-cover-page bold"><h1>{TITLE}</h1><p style="font-size:14pt">{SUBTITLE}</p></div>' },
    { id: 'minimal', name: 'Minimal',
      html: '<div class="rwd-cover-page minimal"><h1 style="font-weight:200;letter-spacing:0.1em">{TITLE}</h1><p>{AUTHOR}</p></div>' },
    { id: 'side-bar', name: 'Side bar',
      html: '<div class="rwd-cover-page" style="background:linear-gradient(to right,var(--theme-accent-1) 0,var(--theme-accent-1) 30%,#fff 30%,#fff 100%);text-align:left;padding-left:34%"><h1>{TITLE}</h1><p>{SUBTITLE}</p><p style="margin-top:60px">{AUTHOR}</p></div>' },
  ];
  function renderCoverPages() {
    const grid = $('#coverPageGrid');
    if (!grid) return;
    grid.innerHTML = '';
    COVER_PAGES.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = '<div class="thumb"><b>' + c.name + '</b><div class="bar"></div><div class="bar short"></div></div>' +
        '<div class="name">' + c.name + '</div>' +
        '<div class="desc">Cover page style</div>';
      card.addEventListener('click', () => {
        const html = c.html
          .replace('{TITLE}', escapeHtml(docTitle.value || 'Title'))
          .replace('{SUBTITLE}', 'Subtitle')
          .replace('{AUTHOR}', escapeHtml((docProps && docProps.author) || 'Author'))
          .replace('{DATE}', new Date().toLocaleDateString());
        editor.insertAdjacentHTML('afterbegin', html);
        closeModal($('#coverPageModal'));
        queueAutosave();
      });
      grid.appendChild(card);
    });
  }
  $('#coverPageBtn')?.addEventListener('click', () => {
    renderCoverPages();
    openModal($('#coverPageModal'));
  });

  // #49 Style cleaner
  function styleCleaner() {
    if (!confirm('Remove all custom inline styles and class assignments? This cannot be undone.')) return;
    editor.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('style');
      // Strip rwd-s-* (custom styles) and Word/Office classes
      Array.from(el.classList).forEach((c) => {
        if (c.indexOf('rwd-s-') === 0) el.classList.remove(c);
      });
    });
    queueAutosave();
    toast('Inline styles cleared', 'success');
  }

  // #50 Reset to template — reapply originating template's typography
  function resetToTemplate() {
    const last = (() => {
      try { return JSON.parse(localStorage.getItem(STORE_TEMPLATE_HISTORY) || '[]')[0]; } catch { return null; }
    })();
    if (!last) { toast('No template applied yet', 'info'); return; }
    if (!confirm('Reset typography to template "' + last.name + '"? Inline styles will be cleared.')) return;
    styleCleaner();
    toast('Reset to ' + last.name, 'success');
  }

  // #51 Template versioning — already covered by STORE_TEMPLATE_HISTORY
  // (the renderTemplates() override above pushes to it on apply).

  // Wire backstage actions
  setBackstageView = (function (orig) {
    return function (action) {
      if (action === 'brandkit') { closeBackstage(); openBrandKit(); return; }
      if (action === 'save-template') { closeBackstage(); saveAsTemplate(); return; }
      if (action === 'reset-template') { closeBackstage(); resetToTemplate(); return; }
      if (action === 'style-cleaner') { closeBackstage(); styleCleaner(); return; }
      return orig(action);
    };
  })(setBackstageView);

  // ============================================================
  // FEATURE: Section E — Images & media (#34–#43)
  // ============================================================

  // #34 Image gallery — multiple file picker → grid block
  $('#insertGalleryBtn')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.from(inp.files || []);
      if (!files.length) return;
      const dataUrls = await Promise.all(files.map((f) => new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(f);
      })));
      const html = '<div class="rwd-gallery">' +
        dataUrls.map((u) => '<img src="' + u + '" alt=""/>').join('') +
        '</div><p><br/></p>';
      restoreSelection();
      document.execCommand('insertHTML', false, html);
      queueAutosave();
    };
    inp.click();
  });

  // #35 Image carousel — same input, different wrapper class
  $('#insertCarouselBtn')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.from(inp.files || []);
      if (!files.length) return;
      const dataUrls = await Promise.all(files.map((f) => new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(f);
      })));
      const html = '<div class="rwd-carousel">' +
        dataUrls.map((u) => '<img src="' + u + '" alt=""/>').join('') +
        '</div><p><br/></p>';
      restoreSelection();
      document.execCommand('insertHTML', false, html);
      queueAutosave();
    };
    inp.click();
  });

  // #36 Linked image (reference URL, not embedded)
  $('#insertLinkedImgBtn')?.addEventListener('click', () => {
    const url = prompt('Image URL:', 'https://');
    if (!url || !/^https?:\/\//i.test(url)) return;
    restoreSelection();
    document.execCommand('insertHTML', false,
      '<img src="' + escapeHtml(url) + '" alt=""/>');
    queueAutosave();
  });

  // #37 Stylised image frames — extend imageBar with a frame menu
  if (typeof imageBar !== 'undefined' && imageBar) {
    const frameBtn = document.createElement('button');
    frameBtn.dataset.iact = 'frame';
    frameBtn.title = 'Frame style';
    frameBtn.textContent = '🖼 Frame';
    imageBar.appendChild(frameBtn);
    imageBar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.iact !== 'frame' || !selectedImg) return;
      const v = prompt('Frame: shadow / rounded / polaroid / ribbon / none', 'shadow');
      if (v == null) return;
      ['rwd-frame-shadow','rwd-frame-rounded','rwd-frame-polaroid','rwd-frame-ribbon']
        .forEach((c) => selectedImg.classList.remove(c));
      if (v && v !== 'none') selectedImg.classList.add('rwd-frame-' + v);
      queueAutosave();
    });
  }

  // #38 Image annotations layer — overlay simple labels via SVG
  // Lightweight version: prompt for arrow text + insert positioned svg
  // (deferred to a simpler form: wrap in figure with overlay div)
  if (typeof imageBar !== 'undefined' && imageBar) {
    const annBtn = document.createElement('button');
    annBtn.dataset.iact = 'annotate';
    annBtn.title = 'Add a label';
    annBtn.textContent = '🏷 Label';
    imageBar.appendChild(annBtn);
    imageBar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.iact !== 'annotate' || !selectedImg) return;
      const text = prompt('Label text:', '');
      if (!text) return;
      let fig = selectedImg.parentElement;
      if (!fig || fig.tagName !== 'FIGURE') {
        fig = document.createElement('figure');
        fig.style.position = 'relative';
        fig.style.display = 'inline-block';
        selectedImg.parentNode.insertBefore(fig, selectedImg);
        fig.appendChild(selectedImg);
      } else {
        fig.style.position = fig.style.position || 'relative';
      }
      const lbl = document.createElement('span');
      lbl.contentEditable = 'true';
      lbl.style.cssText = 'position:absolute;top:8px;left:8px;background:rgba(255,255,255,0.92);' +
        'border:1px solid var(--ribbon-border);padding:2px 6px;border-radius:3px;font-size:12px;cursor:move';
      lbl.textContent = text;
      fig.appendChild(lbl);
      queueAutosave();
    });
  }

  // #39 YouTube / Vimeo embed
  $('#insertVideoBtn')?.addEventListener('click', () => {
    const url = prompt('YouTube or Vimeo URL:', '');
    if (!url) return;
    let embed;
    let m = url.match(/youtu\.be\/([\w-]+)|youtube\.com\/.*[?&]v=([\w-]+)|youtube\.com\/embed\/([\w-]+)/);
    if (m) embed = 'https://www.youtube.com/embed/' + (m[1] || m[2] || m[3]);
    else if ((m = url.match(/vimeo\.com\/(\d+)/))) embed = 'https://player.vimeo.com/video/' + m[1];
    else { toast('Unrecognised URL', 'error'); return; }
    const html = '<div class="rwd-embed-video" contenteditable="false">' +
      '<iframe src="' + escapeHtml(embed) + '" allowfullscreen ' +
      'sandbox="allow-scripts allow-presentation allow-same-origin allow-popups"></iframe>' +
      '</div><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // #40 Audio embed
  $('#insertAudioBtn')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        restoreSelection();
        document.execCommand('insertHTML', false,
          '<audio controls src="' + r.result + '"></audio>');
        queueAutosave();
      };
      r.readAsDataURL(f);
    };
    inp.click();
  });

  // #41 iframe embed (with security warning)
  $('#insertIframeBtn')?.addEventListener('click', () => {
    if (!confirm('Embed an iframe? It will be sandboxed but may still load remote content. Continue?')) return;
    const url = prompt('Iframe URL:', 'https://');
    if (!url || !/^https?:\/\//i.test(url)) return;
    const html = '<div class="rwd-embed-iframe" contenteditable="false">' +
      '<iframe src="' + escapeHtml(url) + '" sandbox="allow-scripts allow-same-origin"></iframe>' +
      '</div><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // #42 QR code generator — tiny pure-JS encoder for QR alphanumeric
  // Use a minimal QR encoder embedded inline (Reed-Solomon would be
  // heavy). For MVP we ship a pseudo-QR: hash → colored dot grid that
  // visually suggests a QR but is decorative. Real QR would need a
  // library (~30 KB). Comment makes that clear in UI.
  function pseudoQrSvg(text) {
    // Stable hash → 21x21 grid of black/white cells. Decorative only.
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" class="rwd-qr" ' +
      'viewBox="0 0 21 21" width="120" height="120" data-text="' +
      escapeHtml(text) + '"><rect width="21" height="21" fill="#fff"/>';
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        // Position markers in three corners
        const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
        let on;
        if (corner) {
          const ox = x < 7 ? x : x - 14;
          const oy = y < 7 ? y : y - 14;
          on = ox === 0 || ox === 6 || oy === 0 || oy === 6 || (ox >= 2 && ox <= 4 && oy >= 2 && oy <= 4);
        } else {
          h = Math.imul(h ^ (x * 31 + y), 2654435761);
          on = (h >>> 0) & 1;
        }
        if (on) svg += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#000"/>';
      }
    }
    svg += '</svg>';
    return svg;
  }
  $('#insertQrBtn')?.addEventListener('click', () => {
    const text = prompt('Text or URL to encode (visual placeholder QR; for scannable codes use a dedicated tool):', 'https://example.com');
    if (!text) return;
    restoreSelection();
    document.execCommand('insertHTML', false, pseudoQrSvg(text));
    queueAutosave();
  });

  // #43 Barcode generator — Code 39, simple subset (uppercase + digits)
  function code39Svg(text) {
    const PATTERNS = {
      '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn',
      '4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw',
      '8':'wnnwnnwnn','9':'nnwwnnwnn',
      'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw',
      'E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn',
      'I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww',
      'M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn',
      'Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
      'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw',
      'Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',
      ' ':'nwwnnnwnn','*':'nwnnwnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn',
      '+':'nnnwnwnwn','%':'nnwnwnwnn',
    };
    const txt = ('*' + (text.toUpperCase().replace(/[^A-Z0-9 \-.$\/+%]/g, '')) + '*');
    const NARROW = 2, WIDE = 5, GAP = 2;
    let x = 4;
    let bars = '';
    for (const ch of txt) {
      const p = PATTERNS[ch] || PATTERNS[' '];
      for (let i = 0; i < p.length; i++) {
        const w = p[i] === 'w' ? WIDE : NARROW;
        if (i % 2 === 0) {
          bars += '<rect x="' + x + '" y="0" width="' + w + '" height="60" fill="#000"/>';
        }
        x += w;
      }
      x += GAP;
    }
    const W = x + 4;
    return '<svg xmlns="http://www.w3.org/2000/svg" class="rwd-barcode" data-text="' +
      escapeHtml(text) + '" viewBox="0 0 ' + W + ' 80" width="' +
      Math.min(420, W * 2) + '" height="80">' +
      '<rect width="' + W + '" height="60" fill="#fff"/>' + bars +
      '<text x="' + (W / 2) + '" y="76" text-anchor="middle" font-family="monospace" font-size="10" fill="#000">' +
      escapeHtml(text) + '</text></svg>';
  }
  $('#insertBarcodeBtn')?.addEventListener('click', () => {
    const text = prompt('Text (Code 39: A–Z, 0–9, space, -.$/+%):', 'RW-12345');
    if (!text) return;
    restoreSelection();
    document.execCommand('insertHTML', false, code39Svg(text));
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Section D — Lists & outlining (#28–#33)
  // ============================================================

  // #28 Custom bullet characters --------------------------
  $('#bulletStyle')?.addEventListener('change', (e) => {
    let v = e.target.value;
    e.target.value = '';
    if (!v) return;
    if (v === 'custom') {
      v = prompt('Bullet character or short text:', '➤') || '';
      if (!v) return;
    }
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const ul = n && n.closest && n.closest('ul');
    if (!ul) {
      // Wrap selection or paragraph in a UL with the chosen bullet
      document.execCommand('insertUnorderedList');
    }
    const ul2 = (n && n.closest && n.closest('ul')) ||
      editor.querySelector('ul:has(> li)');
    if (ul2) {
      // #29 Image bullets — if the user types an http(s) URL ending in
      // an image extension, treat it as an image bullet:
      if (/^https?:\/\/.+\.(png|jpe?g|gif|svg|webp)/i.test(v)) {
        ul2.dataset.bullet = '';
        ul2.style.listStyleImage = 'url(' + v + ')';
      } else {
        ul2.dataset.bullet = v;
        ul2.style.listStyleImage = '';
      }
      queueAutosave();
    }
  });

  // #30 List style gallery — saved combos in localStorage as a tiny
  // bonus (reuses customStyles UI naming convention).
  const STORE_LISTSTYLES = 'rodmanword:listStyles';
  let listStyles = {};
  try { listStyles = JSON.parse(localStorage.getItem(STORE_LISTSTYLES) || '{}'); } catch {}

  // #31 Drag a heading + section in the navigation pane to reorder it.
  function makeOutlineDraggable() {
    const list = $('#outlineList');
    if (!list) return;
    list.querySelectorAll('li').forEach((li) => {
      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', li.textContent);
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const txt = e.dataTransfer.getData('text/plain');
        const fromHeading = Array.from(editor.querySelectorAll('h1,h2,h3,h4'))
          .find((h) => h.textContent.trim() === txt.trim());
        const toHeading = Array.from(editor.querySelectorAll('h1,h2,h3,h4'))
          .find((h) => h.textContent.trim() === li.textContent.trim());
        if (!fromHeading || !toHeading || fromHeading === toHeading) return;
        moveSection(fromHeading, toHeading);
      });
    });
  }
  function moveSection(fromHeading, beforeHeading) {
    // Collect everything from fromHeading until the next heading of
    // equal-or-higher level, then insert before beforeHeading.
    const lvl = parseInt(fromHeading.tagName.charAt(1), 10);
    const block = [fromHeading];
    let n = fromHeading.nextElementSibling;
    while (n) {
      if (/^H[1-6]$/.test(n.tagName) &&
          parseInt(n.tagName.charAt(1), 10) <= lvl) break;
      block.push(n);
      n = n.nextElementSibling;
    }
    block.forEach((el) => beforeHeading.parentNode.insertBefore(el, beforeHeading));
    queueAutosave();
    refreshFields();
    if (typeof rebuildOutline === 'function') rebuildOutline();
  }
  // Hook into the existing outline pane refresh
  if (typeof rebuildOutline === 'function') {
    const __origRebuild = rebuildOutline;
    rebuildOutline = function () {
      __origRebuild();
      makeOutlineDraggable();
    };
  }

  // #32 Collapse all to level N -----------------------------
  $('#collapseToLevelBtn')?.addEventListener('click', () => {
    const v = prompt('Collapse all headings deeper than level N:\n1, 2, 3, 4 (Cancel to expand all)', '2');
    if (v == null) {
      // expand all
      editor.querySelectorAll('.rwd-folded').forEach((el) => el.classList.remove('rwd-folded'));
      editor.querySelectorAll('.rwd-collapse').forEach((b) => { b.dataset.folded = '0'; b.textContent = '▾'; });
      return;
    }
    const N = parseInt(v, 10);
    if (isNaN(N) || N < 1 || N > 6) return;
    // Walk and fold any heading with level > N
    editor.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
      const lvl = parseInt(h.tagName.charAt(1), 10);
      const btn = h.querySelector('.rwd-collapse');
      if (!btn) return;
      const shouldFold = lvl > N;
      const isFolded = btn.dataset.folded === '1';
      if (shouldFold && !isFolded) toggleHeadingFold(h, btn);
      else if (!shouldFold && isFolded) toggleHeadingFold(h, btn);
    });
  });

  // #33 Smart promote / demote of headings on Tab/Shift+Tab
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const h = n && n.closest && n.closest('h1,h2,h3,h4,h5,h6');
    if (!h) return;
    e.preventDefault();
    const lvl = parseInt(h.tagName.charAt(1), 10);
    const next = e.shiftKey ? Math.max(1, lvl - 1) : Math.min(6, lvl + 1);
    if (next === lvl) return;
    const replacement = document.createElement('h' + next);
    replacement.innerHTML = h.innerHTML;
    Array.from(h.attributes).forEach((a) => replacement.setAttribute(a.name, a.value));
    h.parentNode.replaceChild(replacement, h);
    // Move caret into new heading
    const r = document.createRange();
    r.selectNodeContents(replacement);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    queueAutosave();
    if (typeof rebuildOutline === 'function') rebuildOutline();
  }, true);

  // ============================================================
  // FEATURE: Section C — Tables advanced (#21–#27)
  // ============================================================
  // Helper: column index <-> letter
  function colLetter(n) {
    let s = '';
    n++;
    while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); }
    return s;
  }
  function cellRef(td) {
    const tr = td.parentElement;
    const tbody = tr.parentElement.tagName === 'TBODY' ? tr.parentElement : tr;
    const rows = Array.from(tbody.children);
    const r = rows.indexOf(tr);
    const c = Array.from(tr.children).indexOf(td);
    return { r, c, ref: colLetter(c) + (r + 1) };
  }
  function findCellByRef(table, ref) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    c -= 1;
    const r = parseInt(m[2], 10) - 1;
    const tbody = table.tBodies[0] || table;
    const row = tbody.rows[r];
    return row && row.children[c];
  }
  function cellValue(td) {
    if (!td) return 0;
    const v = parseFloat((td.textContent || '').replace(/[^0-9.\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }

  // #21 Cell formulas (=SUM, =AVG, =COUNT, =MAX, =MIN, =A1+B1)
  function evalFormula(td, expr, table) {
    const fn = (op) => (range) => {
      const m = range.match(/([A-Z]+\d+)\s*:\s*([A-Z]+\d+)/);
      if (!m) return 0;
      const [a, b] = [m[1], m[2]];
      const ca = findCellByRef(table, a);
      const cb = findCellByRef(table, b);
      if (!ca || !cb) return 0;
      const ra = cellRef(ca), rb = cellRef(cb);
      const r1 = Math.min(ra.r, rb.r), r2 = Math.max(ra.r, rb.r);
      const c1 = Math.min(ra.c, rb.c), c2 = Math.max(ra.c, rb.c);
      const vals = [];
      const tbody = table.tBodies[0] || table;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const cell = tbody.rows[r] && tbody.rows[r].children[c];
          if (cell && cell !== td) vals.push(cellValue(cell));
        }
      }
      if (op === 'SUM') return vals.reduce((a, v) => a + v, 0);
      if (op === 'AVG') return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0;
      if (op === 'COUNT') return vals.length;
      if (op === 'MAX') return Math.max.apply(null, vals.length ? vals : [0]);
      if (op === 'MIN') return Math.min.apply(null, vals.length ? vals : [0]);
      return 0;
    };
    let s = expr.replace(/^=\s*/, '');
    s = s.replace(/SUM\(([^)]+)\)/gi, (_, r) => fn('SUM')(r));
    s = s.replace(/AVG\(([^)]+)\)/gi, (_, r) => fn('AVG')(r));
    s = s.replace(/COUNT\(([^)]+)\)/gi, (_, r) => fn('COUNT')(r));
    s = s.replace(/MAX\(([^)]+)\)/gi, (_, r) => fn('MAX')(r));
    s = s.replace(/MIN\(([^)]+)\)/gi, (_, r) => fn('MIN')(r));
    s = s.replace(/[A-Z]+\d+/g, (ref) => cellValue(findCellByRef(table, ref)));
    if (!/^[\d+\-*/(). ]+$/.test(s)) return null;
    try { return Function('"use strict";return (' + s + ');')(); } catch { return null; }
  }

  function recomputeFormulas() {
    editor.querySelectorAll('table').forEach((table) => {
      table.querySelectorAll('td[data-formula]').forEach((td) => {
        const v = evalFormula(td, td.dataset.formula, table);
        if (v == null) return;
        const fmt = td.dataset.numfmt;
        td.textContent = formatNumber(v, fmt);
      });
    });
  }
  function formatNumber(v, fmt) {
    if (!fmt) return String(Math.round(v * 1000) / 1000);
    if (fmt === 'currency') return '$' + v.toFixed(2);
    if (fmt === 'percent') return (v * 100).toFixed(1) + '%';
    if (fmt === 'integer') return String(Math.round(v));
    if (fmt === 'date') return new Date(v).toLocaleDateString();
    return String(v);
  }
  // Recompute on every editor input (debounced via field engine)
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdFx);
    window.__rwdFx = setTimeout(recomputeFormulas, 250);
  });
  setTimeout(recomputeFormulas, 100);

  // Wire the new table-bar buttons
  if (typeof tableBar !== 'undefined' && tableBar) {
    tableBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const a = btn.dataset.tact;
      const cell = activeCell();
      if (!cell) return;
      const table = cell.closest('table');
      if (a === 'formula') {
        const cur = cell.dataset.formula || '';
        const v = prompt('Cell formula (e.g. =SUM(A1:A4) or =B1+C1):', cur);
        if (v == null) return;
        if (v.trim()) {
          cell.dataset.formula = v.trim();
          recomputeFormulas();
        } else {
          delete cell.dataset.formula;
        }
        queueAutosave();
      } else if (a === 'numfmt') {
        const v = prompt('Format: currency / percent / integer / date / (blank to clear)', cell.dataset.numfmt || '');
        if (v == null) return;
        if (v) cell.dataset.numfmt = v.trim();
        else delete cell.dataset.numfmt;
        recomputeFormulas();
        queueAutosave();
      } else if (a === 'cell-color') {
        const v = prompt('Cell colour (CSS color, blank to clear):', cell.style.background || '');
        if (v == null) return;
        cell.style.background = v;
        queueAutosave();
      } else if (a === 'distribute') {
        const cols = Math.max(...Array.from(table.rows).map((r) => r.children.length));
        Array.from(table.rows).forEach((r) => {
          Array.from(r.children).forEach((c) => { c.style.width = (100 / cols).toFixed(2) + '%'; });
        });
        queueAutosave();
      } else if (a === 'header-repeat') {
        // Wrap first row in <thead>
        if (!table.tHead && table.rows.length) {
          const head = table.createTHead();
          head.appendChild(table.rows[0]);
        }
        table.classList.toggle('tbl-repeat-header');
        queueAutosave();
      }
    });
  }

  // #27 Caption auto-attach: when inserting a table, prompt for caption
  // Patch existing insertTableConfirm flow if present
  if ($('#insertTableConfirm')) {
    $('#insertTableConfirm').addEventListener('click', () => {
      // The original handler runs first; afterwards offer a caption.
      setTimeout(() => {
        const v = prompt('Optional caption (Cancel to skip):', '');
        if (!v) return;
        const html = '<p class="rwd-caption" data-seq="table" data-label="Table" data-text="' +
          escapeHtml(v) + '"></p>';
        document.execCommand('insertHTML', false, html);
        if (typeof refreshFields === 'function') refreshFields();
        queueAutosave();
      }, 50);
    });
  }

  // ============================================================
  // FEATURE: Section B — Document model & styles depth (#11–#20)
  // ============================================================
  const STORE_THEME = 'rodmanword:theme';
  const STORE_AUTHORS = 'rodmanword:authors';

  // --- #11 Document themes -----------------------------------
  const THEMES = [
    { name: 'Office',   body: 'Calibri, Arial, sans-serif',           heading: '"Segoe UI", system-ui, sans-serif',     a1: '#2b579a', a2: '#d23f31', a3: '#ff8f00', a4: '#2e7d32' },
    { name: 'Modern',   body: '"Inter", "Segoe UI", sans-serif',      heading: '"Inter", "Segoe UI", sans-serif',       a1: '#1976d2', a2: '#7b1fa2', a3: '#0097a7', a4: '#c62828' },
    { name: 'Editorial', body: 'Georgia, "Times New Roman", serif',    heading: '"Playfair Display", Georgia, serif',    a1: '#5d4037', a2: '#8d6e63', a3: '#a1887f', a4: '#3e2723' },
    { name: 'Mono',     body: '"Courier New", Courier, monospace',    heading: '"Courier New", monospace',              a1: '#222',    a2: '#666',    a3: '#999',    a4: '#000' },
    { name: 'Soft',     body: '"Trebuchet MS", sans-serif',           heading: '"Trebuchet MS", sans-serif',            a1: '#6a4f8a', a2: '#d97a76', a3: '#e6b86d', a4: '#7fa37b' },
    { name: 'Tech',     body: '"Helvetica Neue", Helvetica, sans-serif', heading: '"Helvetica Neue", sans-serif',     a1: '#0f172a', a2: '#0ea5e9', a3: '#22c55e', a4: '#f97316' },
  ];

  function applyTheme(t) {
    if (!t) return;
    document.body.classList.add('themed');
    const r = document.documentElement.style;
    r.setProperty('--theme-body-font', t.body);
    r.setProperty('--theme-heading-font', t.heading);
    r.setProperty('--theme-accent-1', t.a1);
    r.setProperty('--theme-accent-2', t.a2);
    r.setProperty('--theme-accent-3', t.a3);
    r.setProperty('--theme-accent-4', t.a4);
    try { localStorage.setItem(STORE_THEME, JSON.stringify(t)); } catch {}
  }
  function loadStoredTheme() {
    try {
      const t = JSON.parse(localStorage.getItem(STORE_THEME) || 'null');
      if (t) applyTheme(t);
    } catch {}
  }
  loadStoredTheme();

  function renderThemesGrid() {
    const grid = $('#themesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    THEMES.forEach((t) => {
      const c = document.createElement('div');
      c.className = 'template-card';
      c.innerHTML =
        '<div class="thumb" style="font-family:' + t.body +
          ';color:' + t.a1 + ';background:linear-gradient(160deg,#fff 60%,' + t.a1 + '12 100%)">' +
          '<b style="font-family:' + t.heading + ';color:' + t.a1 + '">' + t.name + '</b>' +
          '<div class="bar" style="background:' + t.a1 + '"></div>' +
          '<div class="bar short" style="background:' + t.a2 + '"></div>' +
          '<div class="bar" style="background:' + t.a3 + '"></div>' +
        '</div>' +
        '<div class="name">' + t.name + '</div>' +
        '<div class="desc">' + t.body.split(',')[0].replace(/"/g,'') + '</div>';
      c.addEventListener('click', () => applyTheme(t));
      grid.appendChild(c);
    });
  }

  $('#applyCustomThemeBtn')?.addEventListener('click', () => {
    applyTheme({
      name: 'Custom',
      body: $('#themeBodyFont').value || 'Calibri, sans-serif',
      heading: $('#themeHeadingFont').value || '"Segoe UI", sans-serif',
      a1: $('#themeAccent1').value, a2: $('#themeAccent2').value,
      a3: $('#themeAccent3').value, a4: $('#themeAccent4').value,
    });
    toast('Custom theme applied', 'success');
  });

  // --- #12 Theme-aware swatch additions ---------------------
  // Inject the four theme accents at the top of every color popup
  // by wrapping the existing openColorPopup if it exists.
  if (typeof openColorPopup === 'function' && !openColorPopup.__themed) {
    const __origOpen = openColorPopup;
    openColorPopup = function (anchor, applyFn) {
      __origOpen.call(this, anchor, applyFn);
      const pop = activeColorPopup;
      if (!pop) return;
      const accents = [
        getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-1').trim() || '#2b579a',
        getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-2').trim() || '#d23f31',
        getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-3').trim() || '#ff8f00',
        getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-4').trim() || '#2e7d32',
      ];
      const row = document.createElement('div');
      row.className = 'row';
      row.textContent = 'Theme';
      pop.insertBefore(row, pop.firstChild);
      accents.reverse().forEach((c) => {
        const s = document.createElement('div');
        s.className = 'swatch';
        s.style.background = c;
        s.title = 'Theme color ' + c;
        s.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          applyFn(c);
          pop.remove();
          activeColorPopup = null;
        });
        pop.insertBefore(s, pop.firstChild);
      });
    };
    openColorPopup.__themed = true;
  }

  // --- #13 Style hierarchy / inheritance --------------------
  // Add a 'parent' picker to the styles modal — when applying a
  // child style, also stamp the parent's class so its CSS cascades.
  function applyCustomStylesheetHierarchical() {
    let style = document.getElementById('rwd-custom-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rwd-custom-styles';
      document.head.appendChild(style);
    }
    let css = '';
    Object.keys(customStyles).forEach((name) => {
      const s = customStyles[name];
      if (s.parent && customStyles[s.parent]) {
        css += '.editor .' + styleClassName(name) + ' { ' +
          customStyles[s.parent].css + ' ' + s.css + ' }\n';
      } else {
        css += '.editor .' + styleClassName(name) + ' { ' + s.css + ' }\n';
      }
    });
    style.textContent = css;
    refreshCustomStylesDropdown();
    refreshStylesList();
  }
  // Replace the existing applier so the manage-styles save path picks
  // up parent inheritance.
  applyCustomStylesheet = applyCustomStylesheetHierarchical;

  // --- #14 Styles import / export ---------------------------
  $('#exportStylesBtn')?.addEventListener('click', () => {
    $('#stylesIOJson').value = JSON.stringify(customStyles, null, 2);
  });
  $('#importStylesBtn')?.addEventListener('click', () => {
    let parsed;
    try { parsed = JSON.parse($('#stylesIOJson').value); }
    catch (e) { toast('Invalid JSON: ' + e.message, 'error'); return; }
    Object.assign(customStyles, parsed);
    persistStyles();
    applyCustomStylesheet();
    toast('Imported ' + Object.keys(parsed).length + ' styles', 'success');
  });

  // --- #15 Heading numbering schemes ------------------------
  $('#headingNumScheme')?.addEventListener('change', (e) => {
    const v = e.target.value;
    e.target.value = '';
    editor.classList.remove('numscheme-1-1-1','numscheme-I-A-1','numscheme-A-1-a','numscheme-1-paren');
    if (v === '1.1.1') editor.classList.add('numscheme-1-1-1');
    else if (v === 'I.A.1') editor.classList.add('numscheme-I-A-1');
    else if (v === 'A.1.a') editor.classList.add('numscheme-A-1-a');
    else if (v === '1)') editor.classList.add('numscheme-1-paren');
    queueAutosave();
  });

  // --- #16 Restart numbering at this heading ---------------
  $('#restartNumberingBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const h = n && n.closest && n.closest('h1,h2,h3');
    if (!h) { toast('Place the cursor in a heading', 'info'); return; }
    const lvl = h.tagName.charAt(1);
    h.classList.remove('rwd-restart-1','rwd-restart-2','rwd-restart-3');
    h.classList.add('rwd-restart-' + lvl);
    queueAutosave();
    toast('Numbering restarts here', 'success');
  });

  // --- #17 Line numbers in margin --------------------------
  $('#lineNumbersToggle')?.addEventListener('change', (e) => {
    editor.classList.toggle('line-numbers', e.target.checked);
  });

  // --- #18 Hyphenation control ----------------------------
  $('#hyphenationToggle')?.addEventListener('change', (e) => {
    editor.classList.toggle('hyphenated', e.target.checked);
    editor.classList.toggle('no-hyphens', !e.target.checked);
  });

  // --- #19 Widow/orphan + keep-with-next ------------------
  $('#widowOrphanToggle')?.addEventListener('change', (e) => {
    editor.classList.toggle('widow-orphan', e.target.checked);
  });
  // Apply widow-orphan by default
  editor.classList.add('widow-orphan');

  // --- #20 Multi-author metadata --------------------------
  let authorsList = [];
  try { authorsList = JSON.parse(localStorage.getItem(STORE_AUTHORS) || '[]'); } catch {}
  function persistAuthors() {
    try { localStorage.setItem(STORE_AUTHORS, JSON.stringify(authorsList)); } catch {}
  }
  // Override the older single-author currentAuthor() to consult the list
  if (typeof currentAuthor === 'function') {
    const __origAuthor = currentAuthor;
    currentAuthor = function () {
      if (authorsList.length) {
        return authorsList[0].name;
      }
      return __origAuthor();
    };
  }

  // Backstage actions for #11, #14
  setBackstageView = (function (orig) {
    return function (action) {
      if (action === 'themes') {
        closeBackstage();
        renderThemesGrid();
        openModal($('#themesModal'));
        return;
      }
      if (action === 'stylesio') {
        closeBackstage();
        $('#stylesIOJson').value = '';
        openModal($('#stylesIOModal'));
        return;
      }
      return orig(action);
    };
  })(setBackstageView);

  // ============================================================
  // FEATURE: Review tab — restructure + 9 review-depth items
  // (100-feature-plan items #1 — #10)
  // ============================================================

  // --- #1 Wire Review tab buttons to existing handlers --------
  $('#reviewSpellBtn')?.addEventListener('click', () => {
    const t = $('#spellToggle');
    if (t) { t.checked = !t.checked; t.dispatchEvent(new Event('change')); }
  });
  $('#reviewGrammarBtn')?.addEventListener('click', () => {
    const t = $('#grammarToggle');
    if (t) { t.checked = !t.checked; t.dispatchEvent(new Event('change')); }
  });
  $('#reviewWordCountBtn')?.addEventListener('click', () => {
    if (typeof renderCountModal === 'function') renderCountModal();
    if (typeof countModal !== 'undefined') openModal(countModal);
  });
  $('#reviewNewCommentBtn')?.addEventListener('click', () => $('#commentBtn')?.click());
  $('#reviewToggleCommentsBtn')?.addEventListener('click', () => {
    const t = $('#commentsPaneToggle');
    if (t) { t.checked = !t.checked; t.dispatchEvent(new Event('change')); }
  });
  $('#reviewResolveBtn')?.addEventListener('click', () => {
    if (!editingThreadId) {
      toast('Open a comment thread first', 'info');
      return;
    }
    const cb = $('#commentResolved');
    if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
  });
  // Mirror the existing track-changes toggle so flipping either checkbox
  // keeps both in sync.
  const trackToggleA = $('#trackChangesToggle');
  const trackToggleB = $('#reviewTrackChangesToggle');
  if (trackToggleA && trackToggleB) {
    trackToggleA.addEventListener('change', () => {
      trackToggleB.checked = trackToggleA.checked;
    });
    trackToggleB.addEventListener('change', () => {
      trackToggleA.checked = trackToggleB.checked;
      trackToggleA.dispatchEvent(new Event('change'));
    });
  }
  // Same for restrict-edit
  const restrictA = $('#restrictEditToggle');
  const restrictB = $('#reviewRestrictEditToggle');
  if (restrictA && restrictB) {
    restrictA.addEventListener('change', () => {
      restrictB.checked = restrictA.checked;
    });
    restrictB.addEventListener('change', () => {
      restrictA.checked = restrictB.checked;
      restrictA.dispatchEvent(new Event('change'));
    });
  }
  $('#reviewCompareBtn')?.addEventListener('click', () => openModal($('#compareModal')));
  $('#reviewTranslateBtn')?.addEventListener('click', () => openModal($('#translateModal')));
  $('#reviewAcceptAllBtn')?.addEventListener('click', () => $('#acceptAllBtn')?.click());
  $('#reviewRejectAllBtn')?.addEventListener('click', () => $('#rejectAllBtn')?.click());

  // --- #2 Show / Hide markup filter ---------------------------
  $('#reviewMarkupFilter')?.addEventListener('change', (e) => {
    const v = e.target.value;
    editor.classList.remove('markup-hide-ins','markup-hide-del','markup-hide-comments',
      'markup-only-comments','markup-none');
    if (v === 'ins') editor.classList.add('markup-hide-del','markup-hide-comments');
    else if (v === 'del') editor.classList.add('markup-hide-ins','markup-hide-comments');
    else if (v === 'comments') editor.classList.add('markup-only-comments');
    else if (v === 'none') editor.classList.add('markup-none');
  });

  // --- #3, #4 Reviewing pane navigation -----------------------
  function allChanges() {
    return Array.from(editor.querySelectorAll('ins.rwd-ins, del.rwd-del'));
  }
  function allComments() {
    return Array.from(editor.querySelectorAll('.rwd-comment'));
  }
  let currentChangeIdx = -1;
  let currentCommentIdx = -1;
  function focusItem(arr, idx) {
    if (!arr.length) { toast('Nothing to navigate', 'info'); return; }
    arr.forEach((n) => n.classList.remove('rwd-change-current'));
    const el = arr[(idx + arr.length) % arr.length];
    el.classList.add('rwd-change-current');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return el;
  }
  $('#reviewPrevChangeBtn')?.addEventListener('click', () => {
    const arr = allChanges();
    currentChangeIdx = (currentChangeIdx <= 0 ? arr.length : currentChangeIdx) - 1;
    focusItem(arr, currentChangeIdx);
  });
  $('#reviewNextChangeBtn')?.addEventListener('click', () => {
    const arr = allChanges();
    currentChangeIdx = (currentChangeIdx + 1) % Math.max(1, arr.length);
    focusItem(arr, currentChangeIdx);
  });
  $('#reviewAcceptBtn')?.addEventListener('click', () => {
    const arr = allChanges();
    if (!arr.length) return;
    const el = arr[Math.max(0, currentChangeIdx)];
    if (el && typeof acceptChange === 'function') {
      acceptChange(el);
      rebuildReviewPane();
      queueAutosave();
    }
  });
  $('#reviewRejectBtn')?.addEventListener('click', () => {
    const arr = allChanges();
    if (!arr.length) return;
    const el = arr[Math.max(0, currentChangeIdx)];
    if (el && typeof rejectChange === 'function') {
      rejectChange(el);
      rebuildReviewPane();
      queueAutosave();
    }
  });
  $('#reviewPrevCommentBtn')?.addEventListener('click', () => {
    const arr = allComments();
    currentCommentIdx = (currentCommentIdx <= 0 ? arr.length : currentCommentIdx) - 1;
    focusItem(arr, currentCommentIdx);
  });
  $('#reviewNextCommentBtn')?.addEventListener('click', () => {
    const arr = allComments();
    currentCommentIdx = (currentCommentIdx + 1) % Math.max(1, arr.length);
    focusItem(arr, currentCommentIdx);
  });
  $('#reviewPaneBtn')?.addEventListener('click', () => {
    const t = $('#trackChangesToggle');
    if (t && !t.checked) { t.checked = true; t.dispatchEvent(new Event('change')); }
    const pane = $('#reviewPane');
    if (pane) pane.hidden = !pane.hidden;
  });

  // --- #5 Reviewer filter -------------------------------------
  function rebuildReviewerFilter() {
    const sel = $('#reviewerFilter');
    if (!sel) return;
    const authors = new Set();
    editor.querySelectorAll('ins.rwd-ins, del.rwd-del').forEach((el) => {
      if (el.dataset.author) authors.add(el.dataset.author);
    });
    Object.values(threads || {}).forEach((t) => {
      (t.replies || []).forEach((r) => r.author && authors.add(r.author));
    });
    const cur = sel.value;
    sel.innerHTML = '<option value="">All reviewers</option>';
    Array.from(authors).sort().forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }
  $('#reviewerFilter')?.addEventListener('change', (e) => {
    const target = e.target.value;
    editor.classList.toggle('review-filter', !!target);
    editor.querySelectorAll('ins.rwd-ins, del.rwd-del').forEach((el) => {
      el.classList.toggle('matched-author', !target || el.dataset.author === target);
    });
    editor.querySelectorAll('.rwd-comment').forEach((sp) => {
      const id = sp.dataset.threadId;
      const t = id && threads[id];
      const match = !target || (t && t.replies && t.replies.some((r) => r.author === target));
      sp.classList.toggle('matched-author', match);
    });
  });
  // Refresh authors list whenever the editor changes
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdRevT);
    window.__rwdRevT = setTimeout(rebuildReviewerFilter, 400);
  });

  // --- #6 Mark final ------------------------------------------
  const STORE_FINAL = 'rodmanword:markedFinal';
  function applyFinal(on) {
    document.body.classList.toggle('marked-final', on);
    $('#finalBanner').hidden = !on;
    editor.contentEditable = on ? 'false' : 'true';
    if (docHeader) docHeader.contentEditable = on ? 'false' : 'true';
    if (docFooter) docFooter.contentEditable = on ? 'false' : 'true';
    try { localStorage.setItem(STORE_FINAL, on ? '1' : '0'); } catch {}
  }
  $('#reviewMarkFinalBtn')?.addEventListener('click', () => {
    applyFinal(true);
    toast('Document marked as Final', 'info');
  });
  $('#finalBannerEditBtn')?.addEventListener('click', () => {
    applyFinal(false);
  });
  if (localStorage.getItem(STORE_FINAL) === '1') applyFinal(true);

  // --- #7 Inspect document ------------------------------------
  function inspectDoc() {
    const findings = [];
    const html = editor.innerHTML;
    const selectors = [
      ['comments', '.rwd-comment', 'Tracked comments'],
      ['changes', 'ins.rwd-ins, del.rwd-del', 'Tracked changes (insertions or deletions)'],
      ['watermark', null, 'DRAFT / CONFIDENTIAL watermark', () => {
        const w = (() => { try { return JSON.parse(localStorage.getItem('rodmanword:watermark') || '{}'); } catch { return {}; }})();
        return w.on ? 1 : 0;
      }],
      ['customCss', null, 'Custom CSS rules', () => {
        return (localStorage.getItem('rodmanword:customCss') || '').trim() ? 1 : 0;
      }],
      ['author', null, 'Author metadata', () => {
        return (docProps && docProps.author) ? 1 : 0;
      }],
      ['hidden', '[style*="display:none"], [style*="visibility:hidden"]', 'Hidden text'],
      ['ghost', '.rwd-ghost', 'Smart Compose ghost suggestions'],
      ['drawing', '.rwd-shape', 'Drawn shapes'],
      ['equation', '.rwd-equation', 'Equations'],
      ['linkjs', 'a[href^="javascript:"]', 'Suspicious javascript: links'],
    ];
    selectors.forEach(([id, sel, label, count]) => {
      let n = 0;
      if (sel) n = editor.querySelectorAll(sel).length;
      else if (count) n = count();
      if (n > 0) findings.push({ id, label, count: n });
    });
    return findings;
  }
  function renderInspect() {
    const f = inspectDoc();
    const div = $('#inspectFindings');
    if (!f.length) {
      div.innerHTML = '<p class="muted">No issues found. The document looks clean.</p>';
      return;
    }
    div.innerHTML = '<ul class="snippet-list">' + f.map((x) =>
      '<li><label style="display:flex;gap:8px;align-items:center;width:100%">' +
      '<input type="checkbox" data-clean="' + escapeHtml(x.id) + '" checked />' +
      '<span class="name">' + escapeHtml(x.label) + '</span>' +
      '<span class="actions"><span class="reply-count">' + x.count + '</span></span>' +
      '</label></li>').join('') + '</ul>';
  }
  $('#reviewInspectBtn')?.addEventListener('click', () => {
    renderInspect();
    openModal($('#inspectModal'));
  });
  $('#inspectCleanBtn')?.addEventListener('click', () => {
    $$('#inspectFindings input[data-clean]').forEach((cb) => {
      if (!cb.checked) return;
      const id = cb.dataset.clean;
      switch (id) {
        case 'comments':
          editor.querySelectorAll('.rwd-comment').forEach((s) => {
            const p = s.parentNode;
            while (s.firstChild) p.insertBefore(s.firstChild, s);
            p.removeChild(s);
          });
          threads = {}; persistThreads();
          break;
        case 'changes':
          editor.querySelectorAll('ins.rwd-ins, del.rwd-del').forEach((el) => {
            if (typeof acceptChange === 'function') acceptChange(el);
          });
          break;
        case 'watermark':
          try { localStorage.setItem('rodmanword:watermark', JSON.stringify({ on: false, text: '' })); } catch {}
          if (typeof applyWatermark === 'function') applyWatermark();
          break;
        case 'customCss':
          localStorage.removeItem('rodmanword:customCss');
          if (typeof applyCustomCss === 'function') applyCustomCss();
          break;
        case 'author':
          if (docProps) { docProps = {}; localStorage.setItem('rodmanword:props', '{}'); }
          break;
        case 'hidden':
          editor.querySelectorAll('[style*="display:none"], [style*="visibility:hidden"]').forEach((el) => el.remove());
          break;
        case 'ghost':
          editor.querySelectorAll('.rwd-ghost').forEach((g) => g.remove());
          break;
        case 'linkjs':
          editor.querySelectorAll('a[href^="javascript:"]').forEach((a) => a.removeAttribute('href'));
          break;
      }
    });
    queueAutosave();
    renderInspect();
    toast('Document cleaned', 'success');
  });

  // --- #8 Side-by-side compare with sync scroll ---------------
  let sxsSyncOn = true;
  $('#sxsSyncToggle')?.addEventListener('click', () => {
    sxsSyncOn = !sxsSyncOn;
    $('#sxsSyncToggle').textContent = 'Sync scroll: ' + (sxsSyncOn ? 'ON' : 'OFF');
  });
  $('#reviewSideBySideBtn')?.addEventListener('click', () => {
    const left = $('#sxsLeft');
    if (left) left.innerHTML = editor.innerHTML;
    openModal($('#sideBySideModal'));
    setTimeout(() => {
      const l = $('#sxsLeft'), r = $('#sxsRight');
      function bind(a, b) {
        a.addEventListener('scroll', () => {
          if (!sxsSyncOn) return;
          const ratio = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight);
          b.scrollTop = ratio * (b.scrollHeight - b.clientHeight);
        });
      }
      if (l && r) { bind(l, r); bind(r, l); }
    }, 100);
  });

  // --- #9 3-way merge ----------------------------------------
  $('#reviewMergeBtn')?.addEventListener('click', () => openModal($('#mergeModal')));
  $('#mergeRunBtn')?.addEventListener('click', () => {
    const base = $('#mergeBase').value || '';
    const other = $('#mergeOther').value || '';
    const mine = editor.innerText || '';
    if (!base.trim() || !other.trim()) {
      toast('Paste both base and other text', 'info');
      return;
    }
    const baseLines = base.split(/\r?\n/);
    const mineLines = mine.split(/\r?\n/);
    const otherLines = other.split(/\r?\n/);
    // Naive: line-by-line; if base == mine, take other; if base == other, take mine;
    // else conflict block with picker.
    const max = Math.max(baseLines.length, mineLines.length, otherLines.length);
    let html = '';
    for (let i = 0; i < max; i++) {
      const b = baseLines[i] || '';
      const m = mineLines[i] || '';
      const o = otherLines[i] || '';
      if (m === o) {
        html += '<div>' + escapeHtml(m) + '</div>';
      } else if (b === m) {
        html += '<div class="add">+ ' + escapeHtml(o) + '</div>';
      } else if (b === o) {
        html += '<div>' + escapeHtml(m) + '</div>';
      } else {
        html += '<div class="del">▶ Conflict — yours: ' + escapeHtml(m) +
          '<br/> theirs: ' + escapeHtml(o) + '</div>';
      }
    }
    $('#mergeResult').innerHTML = html;
  });
  $('#mergeApplyBtn')?.addEventListener('click', () => {
    const txt = $('#mergeResult').innerText;
    if (!txt.trim()) { toast('Run merge first', 'info'); return; }
    editor.innerHTML = txt.split(/\n/).map((l) => '<p>' + escapeHtml(l) + '</p>').join('');
    closeModal($('#mergeModal'));
    queueAutosave();
  });

  // --- #10 Per-section proofing language ---------------------
  $('#reviewLanguage')?.addEventListener('change', (e) => {
    document.documentElement.lang = e.target.value;
    editor.lang = e.target.value;
    toast('Proofing language: ' + e.target.value, 'info');
  });
  $('#reviewSectionLangBtn')?.addEventListener('click', () => {
    const lang = $('#reviewLanguage').value || 'en';
    // Wrap the active section in a <span lang=…> if it isn't already
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const block = n && n.closest && n.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li');
    if (!block) {
      toast('Place the cursor in a paragraph first', 'info');
      return;
    }
    block.lang = lang;
    queueAutosave();
    toast('Section language set to ' + lang, 'success');
  });

  // ============================================================
  // FEATURE: Real-time collaborative editing — WebRTC P2P (Tier 1, #1)
  // ============================================================
  // No server. Peers exchange an SDP offer / answer manually (paste
  // through any out-of-band channel) and then send document snapshots
  // and presence over an RTCDataChannel. ICE uses Google's public
  // STUN servers. Sync model is last-writer-wins with timestamps —
  // simple, not conflict-free; CRDT/OT is future work.
  const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
  let collabConn = null;
  let collabChan = null;
  let collabRole = null; // 'host' | 'guest'
  let collabName = '';
  let collabColor = '';
  const peers = {}; // id -> { name, color, lastSeen }
  const PEER_COLORS = ['#d23f31','#2b579a','#388e3c','#7b1fa2','#0097a7','#5d4037','#ef6c00'];
  let lastAppliedAt = 0;

  function pickColor() {
    return PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];
  }

  function compactSdp(desc) {
    // Just a JSON wrapper, base64 for short URLs / chats.
    const payload = JSON.stringify({ type: desc.type, sdp: desc.sdp });
    return btoa(unescape(encodeURIComponent(payload)));
  }
  function expandSdp(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64.trim()))));
  }

  function buildSnapshot() {
    return {
      type: 'doc',
      title: docTitle.value,
      html: editor.innerHTML,
      header: docHeader ? docHeader.innerHTML : '',
      footer: docFooter ? docFooter.innerHTML : '',
      at: Date.now(),
    };
  }

  function applySnapshot(s) {
    if (!s || !s.html) return;
    if (s.at && s.at <= lastAppliedAt) return; // older than what we have
    // Ignore if it's identical (avoid feedback loop)
    if (s.html === editor.innerHTML &&
        (!docHeader || s.header === docHeader.innerHTML) &&
        (!docFooter || s.footer === docFooter.innerHTML)) return;
    // Save selection so we can try to restore caret position by offset
    const sel = window.getSelection();
    let caretOffset = -1;
    if (sel && sel.anchorNode && editor.contains(sel.anchorNode)) {
      const r = document.createRange();
      r.setStart(editor, 0);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      caretOffset = r.toString().length;
    }
    suppressBroadcastUntil = Date.now() + 400;
    editor.innerHTML = sanitizeImported(s.html);
    if (docHeader && typeof s.header === 'string') {
      docHeader.innerHTML = sanitizeImported(s.header);
    }
    if (docFooter && typeof s.footer === 'string') {
      docFooter.innerHTML = sanitizeImported(s.footer);
    }
    if (s.title && docTitle.value !== s.title) docTitle.value = s.title;
    lastAppliedAt = s.at || Date.now();
    refreshFields();
    // Restore caret approximately
    if (caretOffset >= 0) {
      let pos = 0;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const len = n.nodeValue.length;
        if (pos + len >= caretOffset) {
          const r = document.createRange();
          r.setStart(n, caretOffset - pos);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          break;
        }
        pos += len;
      }
    }
  }

  let suppressBroadcastUntil = 0;
  function broadcastSnapshot() {
    if (!collabChan || collabChan.readyState !== 'open') return;
    if (Date.now() < suppressBroadcastUntil) return;
    try { collabChan.send(JSON.stringify(buildSnapshot())); } catch {}
  }
  // Debounced broadcast on every editor input
  let __collabT;
  function scheduleBroadcast() {
    clearTimeout(__collabT);
    __collabT = setTimeout(broadcastSnapshot, 350);
  }
  editor.addEventListener('input', scheduleBroadcast);
  if (docHeader) docHeader.addEventListener('input', scheduleBroadcast);
  if (docFooter) docFooter.addEventListener('input', scheduleBroadcast);
  docTitle.addEventListener('input', scheduleBroadcast);

  function renderPeerList() {
    const ul = $('#collabPeers');
    if (!ul) return;
    ul.innerHTML = '';
    const ids = Object.keys(peers);
    if (!ids.length) {
      ul.innerHTML = '<li class="empty">No peers connected.</li>';
    } else {
      ids.forEach((id) => {
        const p = peers[id];
        const li = document.createElement('li');
        li.innerHTML = '<span class="name">' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
          p.color + ';margin-right:6px"></span>' +
          escapeHtml(p.name) + '</span>' +
          '<span class="actions"><span style="color:#7fc97f;font-size:11px">● live</span></span>';
        ul.appendChild(li);
      });
    }
    refreshPresencePill();
  }
  function refreshPresencePill() {
    const pill = $('#presencePill');
    if (!pill) return;
    const ids = Object.keys(peers);
    if (!ids.length && !collabChan) { pill.hidden = true; return; }
    pill.hidden = false;
    pill.innerHTML = '';
    ids.forEach((id) => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = peers[id].color;
      dot.title = peers[id].name;
      pill.appendChild(dot);
    });
    const live = document.createElement('span');
    live.className = 'live';
    pill.appendChild(live);
  }

  function attachDataChannel(ch) {
    collabChan = ch;
    ch.onopen = () => {
      $('#collabStatus').textContent = '✓ Connected — exchanging documents';
      // Send hello
      try {
        ch.send(JSON.stringify({
          type: 'hello',
          name: collabName,
          color: collabColor,
          id: collabRole + '-' + Math.random().toString(36).slice(2),
        }));
      } catch {}
      // Host pushes its current document so guest joins in sync
      if (collabRole === 'host') broadcastSnapshot();
    };
    ch.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'hello') {
        peers[msg.id] = { name: msg.name || 'Peer', color: msg.color || '#666', lastSeen: Date.now() };
        renderPeerList();
        // Reply with our own hello
        try {
          ch.send(JSON.stringify({
            type: 'hello-ack',
            name: collabName,
            color: collabColor,
            id: collabRole + '-self',
          }));
        } catch {}
        // Send current state if guest just joined
        if (collabRole === 'host') broadcastSnapshot();
      } else if (msg.type === 'hello-ack') {
        peers[msg.id] = { name: msg.name || 'Peer', color: msg.color || '#666', lastSeen: Date.now() };
        renderPeerList();
      } else if (msg.type === 'doc') {
        applySnapshot(msg);
      } else if (msg.type === 'bye') {
        delete peers[msg.id];
        renderPeerList();
      }
    };
    ch.onclose = () => {
      $('#collabStatus').textContent = 'Disconnected';
      collabChan = null;
      Object.keys(peers).forEach((k) => delete peers[k]);
      renderPeerList();
    };
    ch.onerror = (e) => {
      $('#collabStatus').textContent = '✗ Channel error';
    };
  }

  function collabFail(err) {
    const msg = (err && err.message) || String(err);
    toast('Collab error: ' + msg, 'error');
    const el = $('#collabStatus');
    if (el) el.textContent = '✗ ' + msg;
  }

  async function startHost() {
    collabRole = 'host';
    collabName = $('#collabName').value.trim() || 'Host';
    collabColor = pickColor();
    localStorage.setItem('rodmanword:collabName', collabName);
    $('#collabHostStep').hidden = false;
    $('#collabGuestStep').hidden = true;
    $('#collabStatus').textContent = 'Generating offer…';
    try {
      collabConn = new RTCPeerConnection({ iceServers: STUN });
      const ch = collabConn.createDataChannel('rwd', { ordered: true });
      attachDataChannel(ch);
      collabConn.onicegatheringstatechange = () => {
        if (collabConn.iceGatheringState === 'complete') {
          $('#collabOfferOut').value = compactSdp(collabConn.localDescription);
          $('#collabStatus').textContent = 'Offer ready — share it with your guest';
        }
      };
      const offer = await collabConn.createOffer();
      await collabConn.setLocalDescription(offer);
      $('#collabDisconnectBtn').hidden = false;
    } catch (err) {
      collabFail(err);
    }
  }

  async function startGuest() {
    collabRole = 'guest';
    collabName = $('#collabName').value.trim() || 'Guest';
    collabColor = pickColor();
    localStorage.setItem('rodmanword:collabName', collabName);
    $('#collabHostStep').hidden = true;
    $('#collabGuestStep').hidden = false;
    $('#collabStatus').textContent = 'Paste host’s offer to begin';
    try {
      collabConn = new RTCPeerConnection({ iceServers: STUN });
      collabConn.ondatachannel = (ev) => attachDataChannel(ev.channel);
      collabConn.onicegatheringstatechange = () => {
        if (collabConn.iceGatheringState === 'complete' && collabConn.localDescription) {
          $('#collabAnswerOut').value = compactSdp(collabConn.localDescription);
          $('#collabStatus').textContent = 'Answer ready — send it back to the host';
        }
      };
      $('#collabDisconnectBtn').hidden = false;
    } catch (err) {
      collabFail(err);
    }
  }

  async function submitGuestOffer() {
    if (!collabConn) await startGuest();
    const raw = $('#collabOfferIn').value.trim();
    if (!raw) { toast('Paste the host’s offer first', 'error'); return; }
    let desc;
    try { desc = expandSdp(raw); }
    catch { toast('Invalid offer code', 'error'); return; }
    try {
      await collabConn.setRemoteDescription(desc);
      const answer = await collabConn.createAnswer();
      await collabConn.setLocalDescription(answer);
      $('#collabStatus').textContent = 'Gathering ICE candidates…';
    } catch (err) {
      collabFail(err);
    }
  }

  async function acceptHostAnswer() {
    if (!collabConn) { toast('Start as host first', 'error'); return; }
    const raw = $('#collabAnswerIn').value.trim();
    if (!raw) { toast('Paste the guest’s answer first', 'error'); return; }
    let desc;
    try { desc = expandSdp(raw); }
    catch { toast('Invalid answer code', 'error'); return; }
    try {
      await collabConn.setRemoteDescription(desc);
      $('#collabStatus').textContent = 'Connecting…';
    } catch (err) {
      collabFail(err);
    }
  }

  function disconnectCollab() {
    if (collabChan) {
      try { collabChan.send(JSON.stringify({ type: 'bye', id: collabRole + '-self' })); } catch {}
      try { collabChan.close(); } catch {}
    }
    if (collabConn) { try { collabConn.close(); } catch {} }
    collabConn = null; collabChan = null; collabRole = null;
    Object.keys(peers).forEach((k) => delete peers[k]);
    renderPeerList();
    $('#collabHostStep').hidden = true;
    $('#collabGuestStep').hidden = true;
    $('#collabStatus').textContent = 'Disconnected';
    $('#collabDisconnectBtn').hidden = true;
    refreshPresencePill();
  }

  $('#collabHostBtn')?.addEventListener('click', () => startHost());
  $('#collabJoinBtn')?.addEventListener('click', () => startGuest());
  $('#collabSubmitOfferBtn')?.addEventListener('click', () => submitGuestOffer());
  $('#collabAcceptAnswerBtn')?.addEventListener('click', () => acceptHostAnswer());
  $('#collabDisconnectBtn')?.addEventListener('click', () => disconnectCollab());
  $('#collabCopyOfferBtn')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#collabOfferOut').value); toast('Offer copied', 'success'); }
    catch { $('#collabOfferOut').select(); document.execCommand('copy'); }
  });
  $('#collabCopyAnswerBtn')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#collabAnswerOut').value); toast('Answer copied', 'success'); }
    catch { $('#collabAnswerOut').select(); document.execCommand('copy'); }
  });

  // ============================================================
  // FEATURE: Cloud / File System Access (Tier 3, gap #26)
  // ============================================================
  let fsHandle = null;

  function buildRwdJson() {
    return JSON.stringify({
      version: 1,
      title: docTitle.value,
      html: editor.innerHTML,
      header: docHeader ? docHeader.innerHTML : '',
      footer: docFooter ? docFooter.innerHTML : '',
      layout: { size: pageSize.value, orientation: orientation.value, margins: margins.value },
      properties: docProps || {},
      threads: typeof threads === 'object' ? threads : {},
      savedAt: new Date().toISOString(),
    }, null, 2);
  }

  function applyRwdJson(data) {
    if (!data) return;
    editor.innerHTML = sanitizeImported(data.html || '');
    docTitle.value = data.title || 'Document';
    if (docHeader) docHeader.innerHTML = sanitizeImported(data.header || '');
    if (docFooter) docFooter.innerHTML = sanitizeImported(data.footer || '');
    if (data.threads && typeof data.threads === 'object') {
      threads = data.threads;
      try { localStorage.setItem(STORE_THREADS, JSON.stringify(threads)); } catch {}
    }
    if (data.layout) {
      pageSize.value = data.layout.size || pageSize.value;
      orientation.value = data.layout.orientation || orientation.value;
      margins.value = data.layout.margins || margins.value;
      applyLayout();
    }
    queueAutosave();
    if (typeof rebuildOutline === 'function') rebuildOutline();
    if (typeof rebuildCommentsPane === 'function') rebuildCommentsPane();
    refreshFields();
  }

  async function saveToFileSystem() {
    if (!('showSaveFilePicker' in window)) {
      toast('File System Access not available — using download fallback', 'info');
      saveDocument();
      return;
    }
    try {
      if (!fsHandle) {
        fsHandle = await window.showSaveFilePicker({
          suggestedName: sanitizeFileName(docTitle.value) + '.rwd',
          types: [{
            description: 'RodmanWord document',
            accept: { 'application/json': ['.rwd'] },
          }],
        });
      }
      const writable = await fsHandle.createWritable();
      await writable.write(buildRwdJson());
      await writable.close();
      toast('Saved to file system', 'success');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      toast('Save failed: ' + err.message, 'error');
    }
  }

  async function openFromFileSystem() {
    if (!('showOpenFilePicker' in window)) {
      toast('File System Access not available — using picker fallback', 'info');
      $('#filePicker').click();
      return;
    }
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{
          description: 'RodmanWord / text formats',
          accept: { 'application/json': ['.rwd'], 'text/html': ['.html', '.htm'],
            'text/plain': ['.txt', '.md'] },
        }],
      });
      fsHandle = h;
      const file = await h.getFile();
      const text = await file.text();
      if (file.name.endsWith('.rwd')) {
        applyRwdJson(JSON.parse(text));
      } else if (/\.html?$/i.test(file.name)) {
        editor.innerHTML = sanitizeImported(text);
        queueAutosave();
      } else {
        editor.innerHTML = '<p>' + escapeHtml(text).replace(/\n/g, '</p><p>') + '</p>';
        queueAutosave();
      }
      docTitle.value = file.name.replace(/\.[^.]+$/, '');
      toast('Opened from file system', 'success');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      toast('Open failed: ' + err.message, 'error');
    }
  }

  // ----- GitHub Gist sync -----
  async function gistRequest(method, path, token, body) {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
    };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch('https://api.github.com' + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(res.status + ' ' + (err || res.statusText));
    }
    return res.json();
  }

  $('#cloudSaveBtn')?.addEventListener('click', async () => {
    try {
      const token = $('#ghToken').value.trim();
      if (!token) { toast('Token required', 'error'); return; }
      localStorage.setItem('rodmanword:ghToken', token);
      const gistId = $('#ghGistId').value.trim();
      const filename = sanitizeFileName(docTitle.value) + '.rwd';
      const body = {
        description: 'RodmanWord — ' + docTitle.value,
        files: { [filename]: { content: buildRwdJson() } },
      };
      $('#cloudStatus').textContent = 'Saving…';
      let json;
      if (gistId) {
        json = await gistRequest('PATCH', '/gists/' + gistId, token, body);
      } else {
        body.public = false;
        json = await gistRequest('POST', '/gists', token, body);
        $('#ghGistId').value = json.id;
        localStorage.setItem('rodmanword:ghGistId', json.id);
      }
      $('#cloudStatus').innerHTML = '✓ Saved gist <a href="' +
        json.html_url + '" target="_blank" rel="noopener">' +
        json.id + '</a> at ' + new Date().toLocaleTimeString();
      toast('Saved to GitHub gist', 'success');
    } catch (err) {
      $('#cloudStatus').textContent = '✗ ' + err.message;
      toast('Gist save failed: ' + err.message, 'error');
    }
  });

  $('#cloudLoadBtn')?.addEventListener('click', async () => {
    try {
      const token = $('#ghToken').value.trim();
      const gistId = $('#ghGistId').value.trim();
      if (!token || !gistId) { toast('Token and Gist ID required', 'error'); return; }
      localStorage.setItem('rodmanword:ghToken', token);
      localStorage.setItem('rodmanword:ghGistId', gistId);
      $('#cloudStatus').textContent = 'Loading…';
      const json = await gistRequest('GET', '/gists/' + gistId, token);
      const file = Object.values(json.files || {}).find((f) =>
        /\.rwd$/i.test(f.filename));
      if (!file) throw new Error('No .rwd file in this gist');
      const data = JSON.parse(file.content);
      applyRwdJson(data);
      $('#cloudStatus').textContent = '✓ Loaded ' + file.filename +
        ' (' + (file.size || 0) + ' bytes)';
      toast('Loaded from gist', 'success');
    } catch (err) {
      $('#cloudStatus').textContent = '✗ ' + err.message;
      toast('Gist load failed: ' + err.message, 'error');
    }
  });

  // ============================================================
  // FEATURE: Macros — record and replay (Tier 3, gap #30)
  // ============================================================
  const STORE_MACROS = 'rodmanword:macros';
  let macros = {};
  try { macros = JSON.parse(localStorage.getItem(STORE_MACROS) || '{}'); } catch {}
  let recording = false;
  let currentMacro = [];

  $('#recordMacroToggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentMacro = [];
      recording = true;
      toast('Recording macro — perform actions, then untick to save', 'info');
    } else {
      recording = false;
      if (!currentMacro.length) {
        toast('Nothing recorded', 'info');
        return;
      }
      const name = prompt('Save macro as:', 'Macro ' +
        (Object.keys(macros).length + 1));
      if (!name) return;
      macros[name] = currentMacro;
      try { localStorage.setItem(STORE_MACROS, JSON.stringify(macros)); } catch {}
      toast('Macro "' + name + '" saved with ' + currentMacro.length + ' steps', 'success');
    }
  });

  // Wrap exec() once more to record formatting commands
  const __recExec = exec;
  exec = function (cmd, value) {
    if (recording) currentMacro.push({ kind: 'exec', cmd, value });
    return __recExec(cmd, value);
  };

  // Record clicks on every Insert and Home button (skip the Macro and
  // Record toggles themselves)
  document.body.addEventListener('click', (e) => {
    if (!recording) return;
    const btn = e.target.closest('.ribbon-btn');
    if (!btn) return;
    if (['recordMacroToggle', 'runMacroBtn'].includes(btn.id)) return;
    if (btn.id) currentMacro.push({ kind: 'click', id: btn.id });
  });

  // Record typed text (insertText only, not formatting)
  editor.addEventListener('beforeinput', (e) => {
    if (!recording) return;
    if (e.inputType === 'insertText' && e.data) {
      currentMacro.push({ kind: 'type', text: e.data });
    }
  }, true);

  $('#runMacroBtn')?.addEventListener('click', () => {
    const ul = $('#macrosList');
    ul.innerHTML = '';
    const names = Object.keys(macros);
    if (!names.length) {
      ul.innerHTML = '<li class="empty">No macros saved yet.</li>';
    } else {
      names.forEach((name) => {
        const li = document.createElement('li');
        li.innerHTML =
          '<span class="name">' + escapeHtml(name) +
          ' <small style="color:var(--muted)">' +
          macros[name].length + ' steps</small></span>' +
          '<span class="actions">' +
            '<button data-act="run">Run</button>' +
            '<button data-act="delete">Delete</button>' +
          '</span>';
        li.querySelector('[data-act="run"]').addEventListener('click', () => {
          closeModal($('#macrosModal'));
          replayMacro(macros[name]);
        });
        li.querySelector('[data-act="delete"]').addEventListener('click', () => {
          delete macros[name];
          try { localStorage.setItem(STORE_MACROS, JSON.stringify(macros)); } catch {}
          $('#runMacroBtn').click();
        });
        ul.appendChild(li);
      });
    }
    openModal($('#macrosModal'));
  });

  function replayMacro(steps) {
    let i = 0;
    const tick = () => {
      if (i >= steps.length) {
        toast('Macro complete', 'success');
        return;
      }
      const s = steps[i++];
      try {
        if (s.kind === 'exec') exec(s.cmd, s.value);
        else if (s.kind === 'click') {
          const btn = document.getElementById(s.id);
          if (btn) btn.click();
        } else if (s.kind === 'type') {
          editor.focus();
          document.execCommand('insertText', false, s.text);
        }
      } catch {}
      setTimeout(tick, 80);
    };
    editor.focus();
    saveSelection();
    tick();
  }

  // ============================================================
  // FEATURE: Translate (Tier 3, gap #28)
  // ============================================================
  $('#trOpenBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    let text;
    if ($('#trSelectionOnly').checked && sel && !sel.isCollapsed) {
      text = sel.toString();
    } else {
      text = editor.innerText;
    }
    text = (text || '').trim();
    if (!text) { toast('Nothing to translate', 'info'); return; }
    if (text.length > 4500) {
      toast('Text is large; opening only first 4500 characters', 'info');
      text = text.slice(0, 4500);
    }
    const src = $('#trSource').value;
    const tgt = $('#trTarget').value;
    const svc = $('#trService').value;
    let url;
    const t = encodeURIComponent(text);
    if (svc === 'google') {
      url = 'https://translate.google.com/?sl=' + src + '&tl=' + tgt +
        '&op=translate&text=' + t;
    } else if (svc === 'deepl') {
      // DeepL doesn't accept the source via a single param; auto-detect works.
      url = 'https://www.deepl.com/translator#auto/' + tgt + '/' + t;
    } else if (svc === 'bing') {
      url = 'https://www.bing.com/translator/?from=' +
        (src === 'auto' ? '' : src) + '&to=' + tgt + '&text=' + t;
    }
    window.open(url, '_blank', 'noopener');
    closeModal($('#translateModal'));
  });

  // ============================================================
  // FEATURE: Smart Compose ghost-text completion (Tier 3, gap #27)
  // ============================================================
  // Lightweight predictor that suggests a continuation as ghost
  // text, accepted with Tab or Right Arrow at end of word, dismissed
  // by typing anything else or Esc. Builds a small trigram model
  // from the document on demand plus a fixed catalogue of common
  // phrase completions. No network calls.
  const COMMON_PHRASES = [
    [/\bthank you\s*$/i, ' for your time.'],
    [/\bplease let me\s*$/i, ' know if you have any questions.'],
    [/\bi('m| am)\s*$/i, " writing to follow up on"],
    [/\bplease find\s*$/i, ' attached the document for your review.'],
    [/\bin conclusion\s*,?\s*$/i, ' the analysis shows that '],
    [/\bin summary\s*,?\s*$/i, ' the key findings are '],
    [/\bdear\s+\w+\s*,?\s*$/i, '\nThank you for reaching out.\n'],
    [/\bbest\s*$/i, ' regards,'],
    [/\bsincerely\s*$/i, ' yours,'],
    [/\bas a result\s*,?\s*$/i, ' '],
    [/\bhowever\s*,?\s*$/i, ' '],
    [/\bfor example\s*,?\s*$/i, ' '],
    [/\bon the other hand\s*,?\s*$/i, ' '],
    [/\bin order to\s*$/i, ' '],
    [/\bthat being said\s*,?\s*$/i, ' '],
    [/\bnext steps\s*:?\s*$/i, '\n1. \n2. \n3. '],
    [/\baction items\s*:?\s*$/i, '\n- \n- '],
    [/\blet me know\s*$/i, ' if this works for you.'],
    [/\blooking forward to\s*$/i, ' hearing from you.'],
    [/\bwith respect to\s*$/i, ' the matter at hand'],
  ];

  const smartComposeToggle = $('#smartComposeToggle');
  let smartActive = false;
  let trigrams = {}; // built once per open modal session

  function buildTrigrams() {
    trigrams = {};
    const words = (editor.innerText || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length - 2; i++) {
      const k = (words[i] + ' ' + words[i + 1]).toLowerCase();
      trigrams[k] = trigrams[k] || {};
      trigrams[k][words[i + 2]] = (trigrams[k][words[i + 2]] || 0) + 1;
    }
  }
  function trigramSuggestion(prevTwo) {
    const k = prevTwo.toLowerCase();
    const m = trigrams[k];
    if (!m) return '';
    const best = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
    return best ? ' ' + best : '';
  }

  function clearGhost() {
    editor.querySelectorAll('.rwd-ghost').forEach((g) => g.remove());
  }

  function caretAtEnd(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    return el === r.endContainer || el.contains(r.endContainer);
  }

  function suggestGhost() {
    if (!smartActive) return;
    clearGhost();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return;
    if (!editor.contains(r.endContainer)) return;
    // Look at the text immediately before the caret
    let textNode = r.endContainer;
    if (textNode.nodeType !== 3) return;
    const before = textNode.nodeValue.slice(0, r.endOffset);

    // 1) Common phrase completion
    for (const [re, completion] of COMMON_PHRASES) {
      if (re.test(before)) {
        insertGhost(completion);
        return;
      }
    }
    // 2) Trigram from the doc
    const tail = before.match(/(\S+)\s+(\S+)\s*$/);
    if (tail) {
      const sug = trigramSuggestion(tail[1] + ' ' + tail[2]);
      if (sug) insertGhost(sug);
    }
  }

  function insertGhost(text) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const ghost = document.createElement('span');
    ghost.className = 'rwd-ghost';
    ghost.contentEditable = 'false';
    ghost.dataset.suggestion = text;
    ghost.textContent = text;
    r.insertNode(ghost);
    // Keep the caret before the ghost
    const r2 = document.createRange();
    r2.setStartBefore(ghost);
    r2.setEndBefore(ghost);
    sel.removeAllRanges();
    sel.addRange(r2);
  }

  function acceptGhost() {
    const ghost = editor.querySelector('.rwd-ghost');
    if (!ghost) return false;
    const text = ghost.dataset.suggestion || ghost.textContent;
    ghost.remove();
    document.execCommand('insertText', false, text);
    queueAutosave();
    return true;
  }

  smartComposeToggle?.addEventListener('change', () => {
    smartActive = smartComposeToggle.checked;
    if (smartActive) {
      buildTrigrams();
      toast('Smart Compose ON — Tab accepts a suggestion', 'info');
    } else {
      clearGhost();
    }
  });

  // Recompute trigrams every ~30s when active
  setInterval(() => { if (smartActive) buildTrigrams(); }, 30000);

  // Refresh suggestion on input (not on every keystroke — debounced)
  editor.addEventListener('input', () => {
    if (!smartActive) return;
    clearTimeout(window.__rwdScT);
    window.__rwdScT = setTimeout(suggestGhost, 250);
  });

  // Tab / Right Arrow accept; anything else dismisses
  editor.addEventListener('keydown', (e) => {
    if (!smartActive) return;
    const ghost = editor.querySelector('.rwd-ghost');
    if (!ghost) return;
    if (e.key === 'Tab' || (e.key === 'ArrowRight' && !e.shiftKey)) {
      e.preventDefault();
      acceptGhost();
    } else if (e.key === 'Escape') {
      clearGhost();
    } else {
      // Any other key: clear so it doesn't interfere with normal typing
      clearGhost();
    }
  }, true);

  // ============================================================
  // FEATURE: Image crop + effects (Tier 3, gap #29)
  // ============================================================
  let cropTarget = null;
  function openCropModal(img) {
    if (!img) return;
    cropTarget = img;
    const cm = $('#cropModal');
    const ci = $('#cropImg');
    const cr = $('#cropRect');
    ci.src = img.src;
    cr.style.display = 'none';
    openModal(cm);

    let dragging = false, sx = 0, sy = 0, ex = 0, ey = 0;
    function onDown(e) {
      const r = ci.getBoundingClientRect();
      sx = e.clientX - r.left; sy = e.clientY - r.top;
      ex = sx; ey = sy;
      dragging = true;
      cr.style.display = 'block';
      updateRect();
    }
    function onMove(e) {
      if (!dragging) return;
      const r = ci.getBoundingClientRect();
      ex = Math.max(0, Math.min(r.width, e.clientX - r.left));
      ey = Math.max(0, Math.min(r.height, e.clientY - r.top));
      updateRect();
    }
    function onUp() { dragging = false; }
    function updateRect() {
      const x = Math.min(sx, ex), y = Math.min(sy, ey);
      const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
      cr.style.left = x + 'px';
      cr.style.top = y + 'px';
      cr.style.width = w + 'px';
      cr.style.height = h + 'px';
    }
    ci.onmousedown = onDown;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    $('#cropApplyBtn').onclick = () => {
      if (!cropTarget) { closeModal(cm); return; }
      const x = Math.min(sx, ex), y = Math.min(sy, ey);
      const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
      if (w < 5 || h < 5) { toast('Drag to draw a crop region', 'info'); return; }
      const scaleX = ci.naturalWidth / ci.clientWidth;
      const scaleY = ci.naturalHeight / ci.clientHeight;
      const sourceImg = new Image();
      sourceImg.crossOrigin = 'anonymous';
      sourceImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scaleX);
        canvas.height = Math.round(h * scaleY);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(sourceImg,
          x * scaleX, y * scaleY, w * scaleX, h * scaleY,
          0, 0, canvas.width, canvas.height);
        try {
          cropTarget.src = canvas.toDataURL('image/png');
        } catch (err) {
          toast('Could not crop (image may be cross-origin)', 'error');
          return;
        }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        closeModal(cm);
        queueAutosave();
      };
      sourceImg.onerror = () => {
        toast('Could not load image for cropping', 'error');
      };
      sourceImg.src = cropTarget.src;
    };
  }

  let effectsTarget = null;
  const FX_KEYS = [
    ['Brightness', 'brightness', '%', 100],
    ['Contrast', 'contrast', '%', 100],
    ['Saturate', 'saturate', '%', 100],
    ['Blur', 'blur', 'px', 0],
    ['Hue', 'hue-rotate', '°', 0],
    ['Gray', 'grayscale', '%', 0],
    ['Sepia', 'sepia', '%', 0],
  ];

  function buildFilterFromInputs() {
    return FX_KEYS.map(([id, fn, unit]) => {
      const v = $('#fx' + id).value;
      return fn + '(' + v + unit + ')';
    }).join(' ');
  }

  function openEffectsModal(img) {
    if (!img) return;
    effectsTarget = img;
    // Parse existing filter if any
    const cur = img.style.filter || '';
    FX_KEYS.forEach(([id, fn, unit, def]) => {
      const re = new RegExp(fn.replace(/-/g, '\\-') + '\\(([^)]+)\\)');
      const m = cur.match(re);
      const v = m ? parseFloat(m[1]) : def;
      const inp = $('#fx' + id);
      const lab = $('#fx' + id + 'Val');
      inp.value = v;
      lab.textContent = v + unit;
      inp.oninput = () => {
        lab.textContent = inp.value + unit;
        if (effectsTarget) effectsTarget.style.filter = buildFilterFromInputs();
      };
    });
    $('#fxResetBtn').onclick = () => {
      FX_KEYS.forEach(([id, , unit, def]) => {
        const inp = $('#fx' + id);
        const lab = $('#fx' + id + 'Val');
        inp.value = def;
        lab.textContent = def + unit;
      });
      if (effectsTarget) effectsTarget.style.filter = '';
      queueAutosave();
    };
    openModal($('#effectsModal'));
  }

  // Persist filter changes when modal closes
  $('#effectsModal')?.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-modal]') ||
        e.target.closest('[data-close-modal]')) {
      queueAutosave();
    }
  });

  // ============================================================
  // FEATURE: Drawing shapes + text boxes (Tier 2, gap #17)
  // ============================================================
  function insertShape(svg) {
    const html = '<svg class="rwd-shape" xmlns="http://www.w3.org/2000/svg" ' +
      svg + '</svg>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  }

  $('#shapeRectBtn')?.addEventListener('click', () => {
    insertShape(
      'width="120" height="80" viewBox="0 0 120 80">' +
      '<rect x="2" y="2" width="116" height="76" fill="rgba(43,87,154,0.1)" stroke="#2b579a" stroke-width="2"/>'
    );
  });
  $('#shapeEllipseBtn')?.addEventListener('click', () => {
    insertShape(
      'width="120" height="80" viewBox="0 0 120 80">' +
      '<ellipse cx="60" cy="40" rx="56" ry="36" fill="rgba(210,63,49,0.1)" stroke="#d23f31" stroke-width="2"/>'
    );
  });
  $('#shapeArrowBtn')?.addEventListener('click', () => {
    insertShape(
      'width="140" height="40" viewBox="0 0 140 40">' +
      '<defs><marker id="rwd-arr" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">' +
      '<polygon points="0 0, 10 3, 0 6" fill="#2b579a"/></marker></defs>' +
      '<line x1="6" y1="20" x2="124" y2="20" stroke="#2b579a" stroke-width="2" marker-end="url(#rwd-arr)"/>'
    );
  });
  $('#textBoxBtn')?.addEventListener('click', () => {
    const html = '<span class="rwd-textbox" contenteditable="true">Type here…</span>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Form fields + document protection (Tier 2, gap #25)
  // ============================================================
  $('#formTextBtn')?.addEventListener('click', () => {
    const placeholder = prompt('Placeholder text:', 'Click to type…') || '';
    const html = '<input class="rwd-form-text" type="text" placeholder="' +
      escapeHtml(placeholder) + '"/>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  $('#formCheckBtn')?.addEventListener('click', () => {
    const html = '<input class="rwd-form-check" type="checkbox"/>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  $('#formSelectBtn')?.addEventListener('click', () => {
    const optStr = prompt('Comma-separated options:', 'Yes, No, Maybe');
    if (!optStr) return;
    const opts = optStr.split(',').map((o) => o.trim()).filter(Boolean);
    const html = '<select class="rwd-form-select">' +
      opts.map((o) => '<option>' + escapeHtml(o) + '</option>').join('') +
      '</select>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // Restrict editing — toggles contenteditable on the editor.
  // Form-field elements remain interactive because they're <input>
  // and <select>, which are not affected by contenteditable on a
  // parent.
  const restrictEditToggle = $('#restrictEditToggle');
  restrictEditToggle?.addEventListener('change', () => {
    const on = restrictEditToggle.checked;
    document.body.classList.toggle('restrict-edit', on);
    editor.contentEditable = on ? 'false' : 'true';
    if (docHeader) docHeader.contentEditable = on ? 'false' : 'true';
    if (docFooter) docFooter.contentEditable = on ? 'false' : 'true';
    toast(on ? 'Editing restricted to form fields' : 'Editing unrestricted', 'info');
  });

  // ============================================================
  // FEATURE: Print preview (Tier 2, gap #24)
  // ============================================================
  function showPrintPreview() {
    const body = $('#printPreviewBody');
    const sizes = {
      a4: { w: '8.27in', h: '11.69in' },
      letter: { w: '8.5in', h: '11in' },
      legal: { w: '8.5in', h: '14in' },
    };
    const sz = sizes[pageSize.value] || sizes.a4;
    const land = orientation.value === 'landscape';
    const w = land ? sz.h : sz.w;
    const h = land ? sz.w : sz.h;
    const headerHtml = docHeader ? docHeader.innerHTML : '';
    const footerHtml = docFooter ? docFooter.innerHTML : '';
    const editorHtml = editor.innerHTML;
    body.innerHTML =
      '<div class="rwd-pp-page" style="width:' + w + ';min-height:' + h +
      ';background:#fff;color:#222;margin:0 auto 18px;padding:1in;' +
      'box-shadow:0 4px 14px rgba(0,0,0,0.4);font-family:Calibri,Arial,sans-serif;' +
      'font-size:11pt;line-height:1.4;transform:scale(0.7);transform-origin:top center">' +
      (headerHtml.trim()
        ? '<div style="font-size:9pt;color:#666;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:14px">' +
          headerHtml + '</div>'
        : '') +
      editorHtml +
      (footerHtml.trim()
        ? '<div style="font-size:9pt;color:#666;border-top:1px solid #ccc;padding-top:4px;margin-top:14px;text-align:center">' +
          footerHtml + '</div>'
        : '') +
      '</div>';
    openModal($('#printPreviewModal'));
  }
  $('#printFromPreviewBtn')?.addEventListener('click', () => {
    closeModal($('#printPreviewModal'));
    setTimeout(() => { preparePrint(); window.print(); }, 100);
  });

  // ============================================================
  // FEATURE: Outline view collapsible (Tier 2, gap #23)
  // ============================================================
  function decorateHeadingsForCollapse() {
    editor.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
      if (h.querySelector(':scope > .rwd-collapse')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rwd-collapse';
      btn.contentEditable = 'false';
      btn.textContent = '▾';
      btn.title = 'Collapse / expand section';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleHeadingFold(h, btn);
      });
      h.insertBefore(btn, h.firstChild);
    });
  }
  function toggleHeadingFold(h, btn) {
    const folded = btn.dataset.folded === '1';
    const level = parseInt(h.tagName.charAt(1), 10);
    let n = h.nextElementSibling;
    while (n) {
      if (/^H[1-6]$/.test(n.tagName) &&
          parseInt(n.tagName.charAt(1), 10) <= level) break;
      n.classList.toggle('rwd-folded', !folded);
      n = n.nextElementSibling;
    }
    btn.dataset.folded = folded ? '0' : '1';
    btn.textContent = folded ? '▾' : '▸';
  }
  // Run once on init and after every input
  setTimeout(decorateHeadingsForCollapse, 100);
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdFoldT);
    window.__rwdFoldT = setTimeout(decorateHeadingsForCollapse, 200);
  });

  // ============================================================
  // FEATURE: Insert chart from data (Tier 2, gap #18)
  // ============================================================
  const CHART_COLORS = ['#2b579a', '#d23f31', '#ff8f00', '#2e7d32',
    '#7b1fa2', '#0097a7', '#5d4037', '#455a64'];

  function renderChartSvg(kind, title, csv) {
    const rows = parseCsv(csv).filter((r) => r.some((c) => (c || '').trim()));
    if (rows.length < 2) return null;
    const headers = rows[0];
    const data = rows.slice(1);
    const labels = data.map((r) => r[0]);
    const seriesNames = headers.slice(1);
    const series = seriesNames.map((_, i) =>
      data.map((r) => parseFloat(r[i + 1]) || 0));

    const W = 480, H = 280;
    const PAD_L = 50, PAD_R = 20, PAD_T = title ? 40 : 16, PAD_B = 56;
    const innerW = W - PAD_L - PAD_R;
    const innerH = H - PAD_T - PAD_B;

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" class="rwd-chart" ' +
      'viewBox="0 0 ' + W + ' ' + H + '" width="100%" data-kind="' +
      escapeHtml(kind) + '" data-csv="' + escapeHtml(csv) +
      '" data-title="' + escapeHtml(title || '') + '">';
    if (title) svg += '<text class="title" x="' + (W / 2) +
      '" y="22" text-anchor="middle">' + escapeHtml(title) + '</text>';

    if (kind === 'pie') {
      const cx = W / 2, cy = (H + PAD_T) / 2 - 10;
      const r = Math.min(innerW, innerH) / 2 - 8;
      const total = series[0].reduce((a, b) => a + b, 0) || 1;
      let angle = -Math.PI / 2;
      labels.forEach((lab, i) => {
        const v = series[0][i];
        const a2 = angle + (v / total) * 2 * Math.PI;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const large = (a2 - angle) > Math.PI ? 1 : 0;
        svg += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) +
          ',' + y1.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + large +
          ' 1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' +
          CHART_COLORS[i % CHART_COLORS.length] + '"/>';
        // Label outside
        const mid = (angle + a2) / 2;
        const lx = cx + (r + 12) * Math.cos(mid);
        const ly = cy + (r + 12) * Math.sin(mid);
        svg += '<text x="' + lx.toFixed(0) + '" y="' + ly.toFixed(0) +
          '" text-anchor="middle">' + escapeHtml(lab) +
          ' (' + Math.round((v / total) * 100) + '%)</text>';
        angle = a2;
      });
      svg += '</svg>';
      return svg;
    }

    const flat = series.flat();
    const maxV = Math.max.apply(null, flat.length ? flat : [0, 1]);
    const minV = Math.min(0, Math.min.apply(null, flat.length ? flat : [0]));
    const span = (maxV - minV) || 1;
    function yFor(v) {
      return PAD_T + innerH * (1 - (v - minV) / span);
    }
    // Axes
    svg += '<line class="axis" x1="' + PAD_L + '" y1="' + yFor(0) +
      '" x2="' + (W - PAD_R) + '" y2="' + yFor(0) + '"/>';
    svg += '<line class="axis" x1="' + PAD_L + '" y1="' + PAD_T +
      '" x2="' + PAD_L + '" y2="' + (H - PAD_B) + '"/>';
    // Y ticks
    for (let t = 0; t <= 4; t++) {
      const v = minV + (span * t) / 4;
      const y = yFor(v);
      svg += '<line class="grid" x1="' + PAD_L + '" y1="' + y +
        '" x2="' + (W - PAD_R) + '" y2="' + y + '"/>';
      svg += '<text x="' + (PAD_L - 4) + '" y="' + (y + 4) +
        '" text-anchor="end">' + (Math.round(v * 100) / 100) + '</text>';
    }

    if (kind === 'bar' || kind === 'column') {
      const groupW = innerW / labels.length;
      const barW = groupW / (series.length + 1);
      labels.forEach((lab, i) => {
        const groupX = PAD_L + i * groupW + (groupW - barW * series.length) / 2;
        series.forEach((srs, si) => {
          const v = srs[i];
          const yTop = yFor(Math.max(0, v));
          const yBot = yFor(Math.min(0, v));
          svg += '<rect x="' + (groupX + si * barW).toFixed(1) +
            '" y="' + yTop.toFixed(1) + '" width="' + (barW - 2).toFixed(1) +
            '" height="' + Math.max(1, (yBot - yTop)).toFixed(1) +
            '" fill="' + CHART_COLORS[si % CHART_COLORS.length] + '"/>';
        });
        svg += '<text x="' + (PAD_L + (i + 0.5) * groupW) +
          '" y="' + (H - PAD_B + 16) + '" text-anchor="middle">' +
          escapeHtml(lab) + '</text>';
      });
    } else if (kind === 'line') {
      series.forEach((srs, si) => {
        const pts = srs.map((v, i) =>
          (PAD_L + (i + 0.5) * (innerW / labels.length)).toFixed(1) +
          ',' + yFor(v).toFixed(1)).join(' ');
        svg += '<polyline fill="none" stroke="' +
          CHART_COLORS[si % CHART_COLORS.length] +
          '" stroke-width="2" points="' + pts + '"/>';
        srs.forEach((v, i) => {
          const cx = PAD_L + (i + 0.5) * (innerW / labels.length);
          svg += '<circle cx="' + cx.toFixed(1) + '" cy="' +
            yFor(v).toFixed(1) + '" r="3" fill="' +
            CHART_COLORS[si % CHART_COLORS.length] + '"/>';
        });
      });
      labels.forEach((lab, i) => {
        const cx = PAD_L + (i + 0.5) * (innerW / labels.length);
        svg += '<text x="' + cx + '" y="' + (H - PAD_B + 16) +
          '" text-anchor="middle">' + escapeHtml(lab) + '</text>';
      });
    }

    // Legend
    seriesNames.forEach((name, i) => {
      const y = H - 20;
      const x = PAD_L + i * 100;
      svg += '<rect x="' + x + '" y="' + (y - 8) + '" width="10" height="10" fill="' +
        CHART_COLORS[i % CHART_COLORS.length] + '"/>';
      svg += '<text x="' + (x + 14) + '" y="' + y + '">' +
        escapeHtml(name) + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  let editingChart = null;
  function refreshChartPreview() {
    const kind = $('#chartType').value;
    const title = $('#chartTitle').value;
    const csv = $('#chartData').value;
    const svg = renderChartSvg(kind, title, csv);
    $('#chartPreview').innerHTML = svg ||
      '<span class="muted">Preview will appear here</span>';
  }

  ['chartType', 'chartTitle', 'chartData'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', refreshChartPreview);
    document.getElementById(id)?.addEventListener('change', refreshChartPreview);
  });

  $('#chartBtn')?.addEventListener('click', () => {
    editingChart = null;
    saveSelection();
    $('#chartType').value = 'column';
    $('#chartTitle').value = '';
    $('#chartData').value = '';
    refreshChartPreview();
    openModal($('#chartModal'));
  });

  $('#chartInsertBtn')?.addEventListener('click', () => {
    const svg = renderChartSvg(
      $('#chartType').value, $('#chartTitle').value, $('#chartData').value
    );
    if (!svg) { toast('Add at least one row of data', 'error'); return; }
    if (editingChart) {
      editingChart.outerHTML = svg;
      editingChart = null;
    } else {
      restoreSelection();
      document.execCommand('insertHTML', false, svg + '<p><br/></p>');
    }
    closeModal($('#chartModal'));
    queueAutosave();
  });

  // Click an existing chart to re-edit
  editor.addEventListener('click', (e) => {
    const svg = e.target.closest && e.target.closest('svg.rwd-chart');
    if (!svg) return;
    e.preventDefault();
    editingChart = svg;
    $('#chartType').value = svg.dataset.kind || 'column';
    $('#chartTitle').value = svg.dataset.title || '';
    $('#chartData').value = svg.dataset.csv || '';
    refreshChartPreview();
    openModal($('#chartModal'));
  });

  // ============================================================
  // FEATURE: Tab stops with leaders (Tier 2, gap #15)
  // ============================================================
  const LEADER_CHARS = {
    none: '',
    dots: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . .',
    underline: '____________________________________________________',
    dashes: '- - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
  };
  $('#tabStopBtn')?.addEventListener('click', () => {
    const kind = prompt('Leader: none, dots, underline, dashes', 'dots');
    if (!kind || !(kind in LEADER_CHARS)) return;
    const leader = LEADER_CHARS[kind];
    const html = '<span class="rwd-tab" contenteditable="false">' +
      '<span class="rwd-leader">' + leader + '</span></span>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Line / paragraph spacing controls (Tier 2, gap #14)
  // ============================================================
  function affectedBlocks() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const blocks = new Set();
    function add(el) {
      const b = el && el.closest && el.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li');
      if (b && editor.contains(b)) blocks.add(b);
    }
    if (range.collapsed) {
      add(range.startContainer.nodeType === 1 ?
        range.startContainer : range.startContainer.parentElement);
    } else {
      const walker = document.createTreeWalker(
        range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (n) => range.intersectsNode(n)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      let n;
      while ((n = walker.nextNode())) add(n);
      // Also capture endpoints
      add(range.startContainer.nodeType === 1 ?
        range.startContainer : range.startContainer.parentElement);
      add(range.endContainer.nodeType === 1 ?
        range.endContainer : range.endContainer.parentElement);
    }
    return Array.from(blocks);
  }

  $('#lineSpacing')?.addEventListener('change', (e) => {
    const v = e.target.value;
    e.target.value = '';
    if (!v) return;
    const blocks = affectedBlocks();
    if (!blocks.length) { toast('Place the cursor in a paragraph first', 'info'); return; }
    blocks.forEach((b) => { b.style.lineHeight = v; });
    queueAutosave();
  });

  $('#paraSpacing')?.addEventListener('change', (e) => {
    const v = e.target.value;
    e.target.value = '';
    if (v === '') return;
    const blocks = affectedBlocks();
    if (!blocks.length) { toast('Place the cursor in a paragraph first', 'info'); return; }
    blocks.forEach((b) => {
      b.style.marginTop = v + 'em';
      b.style.marginBottom = v + 'em';
    });
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Multi-level numbered lists (Tier 2, gap #13)
  // ============================================================
  // Inserts <ol class="rwd-multi"> which uses CSS counters to number
  // each nested ol as 1, 1.1, 1.1.1 etc. Tab / Shift+Tab inside a
  // multi-list demote / promote the current item.
  $('#multiLevelListBtn')?.addEventListener('click', () => {
    document.execCommand('insertOrderedList');
    // Mark the nearest ol as multi-level
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const ol = n && n.closest && n.closest('ol');
    if (ol) {
      // Walk up to the root ol so nested ols inherit
      let root = ol;
      while (root.parentElement && root.parentElement.closest('ol')) {
        root = root.parentElement.closest('ol');
      }
      root.classList.add('rwd-multi');
    }
    queueAutosave();
  });

  // Tab / Shift+Tab inside a multi-level list to indent / outdent
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const li = n && n.closest && n.closest('li');
    const root = li && li.closest && li.closest('ol.rwd-multi, ol.rwd-multi ol, ol.rwd-multi ul');
    if (!li || !root) return;
    e.preventDefault();
    if (e.shiftKey) {
      document.execCommand('outdent');
    } else {
      document.execCommand('indent');
      // After indent, any newly-created ol/ul should be plain — that's
      // fine because the rwd-multi class is on the outermost ol and
      // CSS rules cascade to children.
    }
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Track changes (Tier 1, gap #2)
  // ============================================================
  const trackChangesToggle = $('#trackChangesToggle');
  let trackChanges = false;

  trackChangesToggle?.addEventListener('change', () => {
    trackChanges = trackChangesToggle.checked;
    if (trackChanges) {
      $('#reviewPane').hidden = false;
      rebuildReviewPane();
      toast('Track changes ON — edits are marked instead of applied directly', 'info');
    } else {
      $('#reviewPane').hidden = true;
    }
  });

  // beforeinput interception: when track changes is on, we substitute
  // most edits with marked-up versions.
  editor.addEventListener('beforeinput', (e) => {
    if (!trackChanges) return;
    const t = e.inputType;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Insertion of text
    if (t === 'insertText' && e.data) {
      e.preventDefault();
      // If selection is non-empty, treat as a delete-then-insert
      if (!range.collapsed) wrapDelete(range);
      const ins = document.createElement('ins');
      ins.className = 'rwd-ins';
      ins.dataset.author = currentAuthor();
      ins.dataset.at = new Date().toISOString();
      ins.textContent = e.data;
      range.insertNode(ins);
      // Caret after the inserted text
      const r2 = document.createRange();
      r2.setStartAfter(ins);
      r2.setEndAfter(ins);
      sel.removeAllRanges();
      sel.addRange(r2);
      saveSelection();
      queueAutosave();
      rebuildReviewPane();
      return;
    }
    if (t === 'insertParagraph' || t === 'insertLineBreak') {
      // Let the browser do its thing for now
      return;
    }
    // Deletions
    if (t === 'deleteContentBackward' || t === 'deleteContentForward' ||
        t === 'deleteWordBackward' || t === 'deleteWordForward' ||
        t === 'deleteByCut') {
      if (range.collapsed) {
        // Expand by one char/word in the right direction
        try {
          if (t.indexOf('Backward') > 0) {
            range.setStart(range.startContainer,
              Math.max(0, range.startOffset - 1));
          } else {
            range.setEnd(range.endContainer,
              Math.min(range.endContainer.length || range.endContainer.childNodes.length,
                       range.endOffset + 1));
          }
        } catch {}
      }
      e.preventDefault();
      wrapDelete(range);
      saveSelection();
      queueAutosave();
      rebuildReviewPane();
    }
  });

  function wrapDelete(range) {
    // If the range is inside an existing <ins>, just remove it (the
    // edit hasn't been accepted yet, so deleting it is a clean undo).
    const within = range.commonAncestorContainer;
    let parentIns = (within.nodeType === 1 ? within : within.parentElement)
      ?.closest && (within.nodeType === 1 ? within : within.parentElement).closest('ins.rwd-ins');
    if (parentIns) {
      const r = range.cloneRange();
      r.deleteContents();
      if (!parentIns.textContent) parentIns.remove();
      return;
    }
    // Otherwise, wrap the range in <del>.
    const frag = range.extractContents();
    const del = document.createElement('del');
    del.className = 'rwd-del';
    del.dataset.author = currentAuthor();
    del.dataset.at = new Date().toISOString();
    del.appendChild(frag);
    range.insertNode(del);
    // Caret after the del
    const r2 = document.createRange();
    r2.setStartAfter(del);
    r2.setEndAfter(del);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r2);
  }

  function acceptChange(el) {
    if (el.tagName === 'INS') {
      // Replace ins with its children
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    } else if (el.tagName === 'DEL') {
      el.remove();
    }
  }
  function rejectChange(el) {
    if (el.tagName === 'INS') {
      el.remove();
    } else if (el.tagName === 'DEL') {
      const parent = el.parentNode;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  }

  $('#acceptAllBtn')?.addEventListener('click', () => {
    editor.querySelectorAll('ins.rwd-ins, del.rwd-del').forEach(acceptChange);
    rebuildReviewPane();
    queueAutosave();
  });
  $('#rejectAllBtn')?.addEventListener('click', () => {
    editor.querySelectorAll('ins.rwd-ins, del.rwd-del').forEach(rejectChange);
    rebuildReviewPane();
    queueAutosave();
  });
  $('#reviewCloseBtn')?.addEventListener('click', () => {
    $('#reviewPane').hidden = true;
    if (trackChangesToggle) trackChangesToggle.checked = false;
    trackChanges = false;
  });

  function rebuildReviewPane() {
    const pane = $('#reviewPane');
    if (!pane || pane.hidden) return;
    const list = $('#reviewList');
    list.innerHTML = '';
    const changes = editor.querySelectorAll('ins.rwd-ins, del.rwd-del');
    $('#reviewCount').textContent = changes.length + ' change' +
      (changes.length === 1 ? '' : 's');
    if (!changes.length) {
      list.innerHTML = '<li class="empty">No tracked changes.</li>';
      return;
    }
    changes.forEach((el, i) => {
      const li = document.createElement('li');
      const kind = el.tagName === 'INS' ? 'Insertion' : 'Deletion';
      const author = el.dataset.author || 'Unknown';
      const text = el.textContent.slice(0, 80);
      li.innerHTML =
        '<div class="selection-preview">' + kind + ' by ' +
          escapeHtml(author) + '</div>' +
        '<div class="last-reply">' + escapeHtml(text) + '</div>' +
        '<div style="margin-top:6px;display:flex;gap:6px">' +
          '<button class="btn" data-act="accept">Accept</button>' +
          '<button class="btn" data-act="reject">Reject</button>' +
        '</div>';
      li.querySelector('[data-act="accept"]').addEventListener('click', (e) => {
        e.stopPropagation();
        acceptChange(el);
        rebuildReviewPane();
        queueAutosave();
      });
      li.querySelector('[data-act="reject"]').addEventListener('click', (e) => {
        e.stopPropagation();
        rejectChange(el);
        rebuildReviewPane();
        queueAutosave();
      });
      li.addEventListener('click', () => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      list.appendChild(li);
    });
  }

  // ============================================================
  // FEATURE: Section breaks (Tier 1, gap #4)
  // ============================================================
  // A section break is an HR-like element that splits the document
  // into sections. Each section can declare its own orientation /
  // columns / margins via data attributes; we re-apply those to the
  // .page element when the cursor lands inside that section.
  $('#sectionBreakBtn')?.addEventListener('click', () => {
    const orientationVal = prompt(
      'Orientation for the next section: portrait / landscape',
      'portrait'
    );
    if (!orientationVal) return;
    const cols = prompt('Columns (1, 2, or 3):', '1') || '1';
    const summary = orientationVal + ', ' + cols + ' col';
    const html = '<hr class="rwd-section-break" contenteditable="false"' +
      ' data-orientation="' + escapeHtml(orientationVal) +
      '" data-columns="' + escapeHtml(cols) +
      '" data-summary="' + escapeHtml(summary) + '"/><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
    refreshFields();
  });

  // Click a section break to edit its settings
  editor.addEventListener('click', (e) => {
    const br = e.target.closest && e.target.closest('.rwd-section-break');
    if (!br) return;
    e.preventDefault();
    const o = prompt('Orientation: portrait / landscape',
      br.dataset.orientation || 'portrait');
    if (!o) return;
    const c = prompt('Columns (1 / 2 / 3):',
      br.dataset.columns || '1') || '1';
    br.dataset.orientation = o;
    br.dataset.columns = c;
    br.dataset.summary = o + ', ' + c + ' col';
    queueAutosave();
    applySectionAtCaret();
  });

  // When the caret moves, re-apply the active section's layout to .page
  function activeSectionFor(el) {
    if (!el || !editor.contains(el)) return null;
    let last = null;
    editor.querySelectorAll('.rwd-section-break').forEach((b) => {
      if (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        last = b;
      }
    });
    return last;
  }
  function applySectionAtCaret() {
    const sel = window.getSelection();
    let n = sel && sel.anchorNode;
    if (n && n.nodeType !== 1) n = n.parentElement;
    const br = activeSectionFor(n);
    if (!br) return;
    const o = br.dataset.orientation || 'portrait';
    const c = br.dataset.columns || '1';
    page.classList.toggle('landscape', o === 'landscape');
    page.classList.toggle('portrait', o !== 'landscape');
    page.classList.remove('cols-1', 'cols-2', 'cols-3');
    page.classList.add('cols-' + c);
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) applySectionAtCaret();
  });

  // ============================================================
  // FEATURE: Custom paragraph styles (Tier 1, gap #5)
  // ============================================================
  const STORE_STYLES = 'rodmanword:styles';
  let customStyles = {};
  try { customStyles = JSON.parse(localStorage.getItem(STORE_STYLES) || '{}'); } catch {}

  function persistStyles() {
    try { localStorage.setItem(STORE_STYLES, JSON.stringify(customStyles)); } catch {}
  }

  function styleClassName(name) {
    return 'rwd-s-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function applyCustomStylesheet() {
    let style = document.getElementById('rwd-custom-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rwd-custom-styles';
      document.head.appendChild(style);
    }
    let css = '';
    Object.keys(customStyles).forEach((name) => {
      const s = customStyles[name];
      css += '.editor .' + styleClassName(name) + ' { ' + s.css + ' }\n';
    });
    style.textContent = css;
    refreshCustomStylesDropdown();
    refreshStylesList();
  }

  function refreshCustomStylesDropdown() {
    const sel = $('#customStyleSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Custom style…</option>';
    Object.keys(customStyles).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function refreshStylesList() {
    const ul = $('#stylesList');
    if (!ul) return;
    ul.innerHTML = '';
    const names = Object.keys(customStyles);
    if (!names.length) {
      ul.innerHTML = '<li class="empty">No custom styles yet.</li>';
      return;
    }
    names.forEach((name) => {
      const s = customStyles[name];
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(name) +
        ' <small style="color:var(--muted)">&lt;' + escapeHtml(s.baseTag) +
        '&gt;</small></span>' +
        '<span class="actions">' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        delete customStyles[name];
        persistStyles();
        applyCustomStylesheet();
      });
      ul.appendChild(li);
    });
  }

  $('#manageStylesBtn')?.addEventListener('click', () => {
    refreshStylesList();
    openModal($('#stylesModal'));
  });

  $('#saveStyleBtn')?.addEventListener('click', () => {
    const name = $('#styleName').value.trim();
    const baseTag = $('#styleBaseTag').value;
    const css = $('#styleCss').value.trim();
    if (!name || !css) { toast('Name and CSS are required', 'error'); return; }
    customStyles[name] = { baseTag, css };
    persistStyles();
    applyCustomStylesheet();
    $('#styleName').value = '';
    $('#styleCss').value = '';
    toast('Style saved', 'success');
  });

  $('#customStyleSelect')?.addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) return;
    const s = customStyles[name];
    if (!s) return;
    // Apply to the current paragraph: change its tag if needed and add the class.
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li, div');
    if (!block || !editor.contains(block)) {
      toast('Place the cursor in a paragraph first', 'info');
      e.target.value = '';
      return;
    }
    // Convert tag if different from baseTag
    let target = block;
    if (block.tagName.toLowerCase() !== s.baseTag) {
      const newEl = document.createElement(s.baseTag);
      newEl.innerHTML = block.innerHTML;
      Array.from(block.attributes).forEach((a) =>
        newEl.setAttribute(a.name, a.value));
      block.parentNode.replaceChild(newEl, block);
      target = newEl;
    }
    // Strip any other rwd-s-* classes
    target.classList.forEach((c) => {
      if (c.indexOf('rwd-s-') === 0) target.classList.remove(c);
    });
    target.classList.add(styleClassName(name));
    e.target.value = '';
    queueAutosave();
  });

  applyCustomStylesheet();

  // ============================================================
  // FEATURE: Citations + bibliography (Tier 1, gap #8)
  // ============================================================
  const STORE_CITES = 'rodmanword:citations';
  let citations = {};
  try { citations = JSON.parse(localStorage.getItem(STORE_CITES) || '{}'); } catch {}
  function persistCites() {
    try { localStorage.setItem(STORE_CITES, JSON.stringify(citations)); } catch {}
  }

  function citationId(c) {
    return 'cit-' + (c.author || 'anon').toLowerCase().replace(/[^a-z0-9]/g, '') +
      '-' + (c.year || '');
  }

  function renderCitList() {
    const ul = $('#citList');
    if (!ul) return;
    ul.innerHTML = '';
    const ids = Object.keys(citations);
    if (!ids.length) {
      ul.innerHTML = '<li class="empty">No sources yet.</li>';
      return;
    }
    ids.forEach((id) => {
      const c = citations[id];
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(c.author || 'Anon') +
        ' (' + escapeHtml(c.year || 'n.d.') + '). ' +
        escapeHtml(c.title || 'Untitled') + '</span>' +
        '<span class="actions">' +
          '<button data-act="insert">Insert</button>' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="insert"]').addEventListener('click', () => {
        insertCitationRef(id);
        closeModal($('#citationModal'));
      });
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        delete citations[id];
        persistCites();
        renderCitList();
      });
      ul.appendChild(li);
    });
  }

  function insertCitationRef(id) {
    const html = '<sup class="rwd-cite" data-cite="' + escapeHtml(id) +
      '" contenteditable="false">[?]</sup>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    refreshCitations();
    queueAutosave();
  }

  function refreshCitations() {
    // Number citations in document order by first occurrence
    const order = {};
    let nextNum = 1;
    editor.querySelectorAll('.rwd-cite').forEach((el) => {
      const id = el.dataset.cite;
      if (!id) return;
      if (!(id in order)) order[id] = nextNum++;
      el.textContent = '[' + order[id] + ']';
      const c = citations[id];
      el.title = c
        ? (c.author || 'Anon') + ' ' + (c.year || '') + ' — ' + (c.title || '')
        : '(missing source)';
    });
    // Auto-update any inserted bibliography to match the order
    editor.querySelectorAll('.rwd-bibliography').forEach((bib) => {
      bib.innerHTML = renderBibliographyHtml(order);
    });
    return order;
  }

  function renderBibliographyHtml(order) {
    const ids = Object.keys(order).sort((a, b) => order[a] - order[b]);
    let html = '<h2>Bibliography</h2><ol>';
    ids.forEach((id) => {
      const c = citations[id];
      const author = (c && c.author) || 'Anon';
      const year = (c && c.year) || 'n.d.';
      const title = (c && c.title) || 'Untitled';
      const source = (c && c.source) || '';
      html += '<li>' + escapeHtml(author) + ' (' + escapeHtml(year) + '). <i>' +
        escapeHtml(title) + '</i>' + (source ? '. ' + escapeHtml(source) : '') +
        '.</li>';
    });
    html += '</ol>';
    return html;
  }

  $('#citationBtn')?.addEventListener('click', () => {
    saveSelection();
    renderCitList();
    openModal($('#citationModal'));
  });

  $('#addSourceBtn')?.addEventListener('click', () => {
    const c = {
      author: $('#citAuthor').value.trim(),
      year: $('#citYear').value.trim(),
      title: $('#citTitle').value.trim(),
      source: $('#citSource').value.trim(),
    };
    if (!c.author && !c.title) {
      toast('Author or title is required', 'error');
      return;
    }
    const id = citationId(c);
    citations[id] = c;
    persistCites();
    $('#citAuthor').value = '';
    $('#citYear').value = '';
    $('#citTitle').value = '';
    $('#citSource').value = '';
    renderCitList();
    toast('Source added', 'success');
  });

  $('#bibliographyBtn')?.addEventListener('click', () => {
    // Replace any existing bibliography
    editor.querySelectorAll('.rwd-bibliography').forEach((b) => b.remove());
    const order = refreshCitations();
    const html = '<div class="rwd-bibliography">' +
      renderBibliographyHtml(order) + '</div><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // Click a citation to view its source
  editor.addEventListener('click', (e) => {
    const sup = e.target.closest && e.target.closest('.rwd-cite');
    if (!sup) return;
    e.preventDefault();
    const c = citations[sup.dataset.cite];
    if (!c) { toast('Source not found in this browser', 'info'); return; }
    toast(c.author + ' (' + c.year + '). ' + c.title +
      (c.source ? ' — ' + c.source : ''), 'info', 4000);
  });

  // Hook citation refresh into the field engine
  const __origRefreshFields = refreshFields;
  refreshFields = function (root) {
    __origRefreshFields(root);
    refreshCitations();
  };

  // Click a caption to edit its text
  editor.addEventListener('dblclick', (e) => {
    const cap = e.target.closest && e.target.closest('.rwd-caption');
    if (!cap) return;
    e.preventDefault();
    const v = prompt('Caption text:', cap.dataset.text || '');
    if (v == null) return;
    cap.dataset.text = v;
    refreshFields();
    queueAutosave();
  });

  let __rwdFieldT;
  editor.addEventListener('input', () => {
    clearTimeout(__rwdFieldT);
    __rwdFieldT = setTimeout(refreshFields, 200);
  });
  // Also refresh after a short delay on init, so restored docs pick up.
  setTimeout(refreshFields, 80);

  // ============================================================
  // FEATURE: Equation editor (LaTeX-style → MathML)
  // ============================================================
  const GREEK_LETTERS = {
    alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', varepsilon:'ε',
    zeta:'ζ', eta:'η', theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ',
    lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', pi:'π', varpi:'ϖ',
    rho:'ρ', varrho:'ϱ', sigma:'σ', varsigma:'ς', tau:'τ', upsilon:'υ',
    phi:'φ', varphi:'ϕ', chi:'χ', psi:'ψ', omega:'ω',
    Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π',
    Sigma:'Σ', Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω',
  };
  const MATH_OPS = {
    pm:'±', mp:'∓', times:'×', div:'÷', cdot:'⋅', ast:'∗', star:'⋆',
    le:'≤', leq:'≤', ge:'≥', geq:'≥', ne:'≠', neq:'≠',
    approx:'≈', equiv:'≡', sim:'∼', simeq:'≃', cong:'≅',
    propto:'∝', perp:'⊥', parallel:'∥',
    to:'→', rightarrow:'→', leftarrow:'←', leftrightarrow:'↔',
    Rightarrow:'⇒', Leftarrow:'⇐', Leftrightarrow:'⇔',
    infty:'∞', emptyset:'∅', forall:'∀', exists:'∃', neg:'¬',
    in:'∈', notin:'∉', subset:'⊂', supset:'⊃', subseteq:'⊆', supseteq:'⊇',
    cup:'∪', cap:'∩', setminus:'∖',
    sum:'∑', prod:'∏', coprod:'∐', int:'∫', oint:'∮', iint:'∬', iiint:'∭',
    partial:'∂', nabla:'∇', surd:'√',
    angle:'∠', triangle:'△', square:'□', diamond:'⋄',
    aleph:'ℵ', hbar:'ℏ', ell:'ℓ', Re:'ℜ', Im:'ℑ', wp:'℘',
    ldots:'…', cdots:'⋯', vdots:'⋮', ddots:'⋱',
    lfloor:'⌊', rfloor:'⌋', lceil:'⌈', rceil:'⌉',
    langle:'⟨', rangle:'⟩',
    cdot:'⋅', circ:'∘', bullet:'∙',
  };
  const MATH_FUNCTIONS = new Set([
    'sin','cos','tan','sec','csc','cot',
    'sinh','cosh','tanh',
    'arcsin','arccos','arctan',
    'log','ln','lg','exp',
    'min','max','sup','inf','lim','liminf','limsup',
    'det','dim','gcd','arg','deg','ker','hom',
  ]);

  function escMath(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function latexToMathML(input, displayMode) {
    if (!input || !input.trim()) return '';
    const src = String(input);
    let pos = 0;

    const peek = () => src[pos];
    const advance = () => src[pos++];
    const eatSpace = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };

    function parseExpr(stopAt) {
      eatSpace();
      const parts = [];
      while (pos < src.length) {
        const c = peek();
        if (stopAt && c === stopAt) break;
        if (c === '}') break;
        const atom = parseAtom();
        if (atom != null) parts.push(atom);
        eatSpace();
      }
      if (parts.length === 0) return '';
      if (parts.length === 1) return parts[0];
      return '<mrow>' + parts.join('') + '</mrow>';
    }

    function parseGroupArg() {
      eatSpace();
      if (peek() === '{') {
        advance();
        const inner = parseExpr();
        if (peek() === '}') advance();
        return inner || '<mrow></mrow>';
      }
      const a = parseAtom();
      return a || '<mrow></mrow>';
    }

    function attachScripts(base) {
      eatSpace();
      let sub = null, sup = null;
      while (peek() === '^' || peek() === '_') {
        const c = advance();
        const arg = parseGroupArg();
        if (c === '^') sup = arg;
        else sub = arg;
        eatSpace();
      }
      if (sub != null && sup != null) return '<msubsup>' + base + sub + sup + '</msubsup>';
      if (sub != null) return '<msub>' + base + sub + '</msub>';
      if (sup != null) return '<msup>' + base + sup + '</msup>';
      return base;
    }

    function parseNumber() {
      let s = '';
      while (pos < src.length && /[0-9.]/.test(src[pos])) s += src[pos++];
      return attachScripts('<mn>' + s + '</mn>');
    }

    function parseCommand() {
      advance(); // consume backslash
      let name = '';
      while (pos < src.length && /[a-zA-Z]/.test(src[pos])) name += src[pos++];
      if (!name) {
        // Escaped char (e.g. \{ \} \% \$ )
        if (pos < src.length) {
          const c = advance();
          return '<mo>' + escMath(c) + '</mo>';
        }
        return '';
      }
      if (name === 'frac' || name === 'tfrac' || name === 'dfrac') {
        const num = parseGroupArg();
        const den = parseGroupArg();
        return attachScripts('<mfrac>' + num + den + '</mfrac>');
      }
      if (name === 'binom' || name === 'choose') {
        const top = parseGroupArg();
        const bot = parseGroupArg();
        return attachScripts(
          '<mfenced open="(" close=")"><mfrac linethickness="0">' +
          top + bot + '</mfrac></mfenced>'
        );
      }
      if (name === 'sqrt') {
        eatSpace();
        let degree = null;
        if (peek() === '[') {
          advance();
          let body = '';
          while (pos < src.length && peek() !== ']') body += advance();
          if (peek() === ']') advance();
          degree = '<mn>' + escMath(body) + '</mn>';
        }
        const arg = parseGroupArg();
        if (degree) return attachScripts('<mroot>' + arg + degree + '</mroot>');
        return attachScripts('<msqrt>' + arg + '</msqrt>');
      }
      if (name === 'overline' || name === 'bar') {
        const arg = parseGroupArg();
        return attachScripts('<mover>' + arg + '<mo>‾</mo></mover>');
      }
      if (name === 'hat' || name === 'widehat') {
        const arg = parseGroupArg();
        return attachScripts('<mover>' + arg + '<mo>^</mo></mover>');
      }
      if (name === 'vec') {
        const arg = parseGroupArg();
        return attachScripts('<mover>' + arg + '<mo>→</mo></mover>');
      }
      if (name === 'underline') {
        const arg = parseGroupArg();
        return attachScripts('<munder>' + arg + '<mo>_</mo></munder>');
      }
      if (name === 'left') {
        eatSpace();
        const open = advance() || '';
        const inner = parseExpr();
        // expect \right<close>
        if (src.slice(pos, pos + 6) === '\\right') pos += 6;
        eatSpace();
        const close = peek() === '.' ? '' : (advance() || '');
        return attachScripts(
          '<mfenced open="' + escMath(open) + '" close="' + escMath(close) + '">' +
          inner + '</mfenced>'
        );
      }
      if (name === 'mathbb' || name === 'mathbf' || name === 'mathit' ||
          name === 'mathrm' || name === 'mathcal' || name === 'mathsf' ||
          name === 'mathtt' || name === 'boldsymbol' || name === 'text') {
        const arg = parseGroupArg();
        const styleMap = {
          mathbb: 'double-struck', mathbf: 'bold', mathit: 'italic',
          mathrm: 'normal', mathcal: 'script', mathsf: 'sans-serif',
          mathtt: 'monospace', boldsymbol: 'bold-italic', text: 'normal',
        };
        return '<mstyle mathvariant="' + styleMap[name] + '">' + arg + '</mstyle>';
      }
      if (GREEK_LETTERS[name]) {
        return attachScripts('<mi>' + GREEK_LETTERS[name] + '</mi>');
      }
      if (MATH_OPS[name]) {
        const op = '<mo>' + MATH_OPS[name] + '</mo>';
        // sum/int/prod with limits attach scripts as mover/munder if found
        if (['sum', 'prod', 'coprod', 'int', 'oint', 'lim', 'liminf', 'limsup'].includes(name)) {
          return parseLimits(op, /^(sum|prod|coprod|lim)/.test(name));
        }
        return op;
      }
      if (MATH_FUNCTIONS.has(name)) {
        return attachScripts('<mi mathvariant="normal">' + name + '</mi>');
      }
      // Unknown command: render as text
      return '<mi>' + escMath(name) + '</mi>';
    }

    function parseLimits(opHtml, useUnderOver) {
      eatSpace();
      let sub = null, sup = null;
      while (peek() === '^' || peek() === '_') {
        const c = advance();
        const arg = parseGroupArg();
        if (c === '^') sup = arg;
        else sub = arg;
        eatSpace();
      }
      if (sub != null && sup != null) {
        const tag = useUnderOver ? 'munderover' : 'msubsup';
        return '<' + tag + '>' + opHtml + sub + sup + '</' + tag + '>';
      }
      if (sub != null) {
        const tag = useUnderOver ? 'munder' : 'msub';
        return '<' + tag + '>' + opHtml + sub + '</' + tag + '>';
      }
      if (sup != null) {
        const tag = useUnderOver ? 'mover' : 'msup';
        return '<' + tag + '>' + opHtml + sup + '</' + tag + '>';
      }
      return opHtml;
    }

    function parseAtom() {
      eatSpace();
      if (pos >= src.length) return null;
      const c = peek();
      if (c === '{') {
        advance();
        const inner = parseExpr();
        if (peek() === '}') advance();
        return attachScripts(inner || '<mrow></mrow>');
      }
      if (c === '\\') return parseCommand();
      if (/[0-9]/.test(c)) return parseNumber();
      if (/[a-zA-Z]/.test(c)) {
        advance();
        return attachScripts('<mi>' + escMath(c) + '</mi>');
      }
      if (c === '(' || c === ')' || c === '[' || c === ']' || c === '|') {
        advance();
        return '<mo>' + escMath(c) + '</mo>';
      }
      if ('+-=*/<>,;:.!?'.includes(c)) {
        advance();
        return '<mo>' + escMath(c) + '</mo>';
      }
      // Unknown char; emit as text
      advance();
      return c.trim() ? '<mtext>' + escMath(c) + '</mtext>' : null;
    }

    let body;
    try { body = parseExpr(); } catch { body = ''; }
    if (!body) return '';
    return '<math xmlns="http://www.w3.org/1998/Math/MathML" display="' +
      (displayMode ? 'block' : 'inline') + '">' + body + '</math>';
  }

  // -------- Equation modal wiring --------
  const equationModal = $('#equationModal');
  const equationInput = $('#equationInput');
  const equationPreview = $('#equationPreview');
  const equationDisplay = $('#equationDisplay');
  const equationModalTitle = $('#equationModalTitle');
  const equationDeleteBtn = $('#equationDeleteBtn');
  const equationPalette = $('#equationPalette');
  let editingEquationSpan = null;

  const PALETTE_ITEMS = [
    { label: '𝛼', insert: '\\alpha ' },
    { label: '𝛽', insert: '\\beta ' },
    { label: '𝜋', insert: '\\pi ' },
    { label: '∞', insert: '\\infty ' },
    { label: '±', insert: '\\pm ' },
    { label: '≤', insert: '\\le ' },
    { label: '≥', insert: '\\ge ' },
    { label: '≠', insert: '\\ne ' },
    { label: '→', insert: '\\to ' },
    { label: 'ⁿ', insert: '^{}' , caretBack: 1 },
    { label: 'ₙ', insert: '_{}' , caretBack: 1 },
    { label: 'a/b', insert: '\\frac{}{}', caretBack: 3 },
    { label: '√', insert: '\\sqrt{}', caretBack: 1 },
    { label: 'ⁿ√', insert: '\\sqrt[]{}', caretBack: 3 },
    { label: '∑', insert: '\\sum_{i=1}^{n} ' },
    { label: '∫', insert: '\\int_{a}^{b} ' },
    { label: '∏', insert: '\\prod_{}^{} ', caretBack: 5 },
    { label: '𝑥̂', insert: '\\hat{x}', caretBack: 2 },
    { label: '𝑥̄', insert: '\\bar{x}', caretBack: 2 },
    { label: '⃗', insert: '\\vec{}', caretBack: 1 },
    { label: '(…)', insert: '\\left( \\right) ', caretBack: 9 },
  ];

  function buildPalette() {
    if (!equationPalette) return;
    equationPalette.innerHTML = '';
    PALETTE_ITEMS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.title = p.insert.trim();
      b.addEventListener('click', () => insertAtCursor(p.insert, p.caretBack || 0));
      equationPalette.appendChild(b);
    });
  }
  buildPalette();

  function insertAtCursor(text, caretBack) {
    const ta = equationInput;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + text + after;
    const newPos = start + text.length - (caretBack || 0);
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    refreshPreview();
  }

  function refreshPreview() {
    const tex = equationInput.value;
    const display = equationDisplay.checked;
    if (!tex.trim()) {
      equationPreview.innerHTML =
        '<span class="muted">Preview will appear here</span>';
      return;
    }
    try {
      const mml = latexToMathML(tex, display);
      equationPreview.innerHTML = mml || '<span class="err">Empty</span>';
    } catch (err) {
      equationPreview.innerHTML = '<span class="err">' + escMath(err.message) + '</span>';
    }
  }

  equationInput?.addEventListener('input', refreshPreview);
  equationDisplay?.addEventListener('change', refreshPreview);

  function openEquationModalForNew() {
    editingEquationSpan = null;
    equationModalTitle.textContent = 'Insert equation';
    equationDeleteBtn.hidden = true;
    equationInput.value = '';
    equationDisplay.checked = false;
    refreshPreview();
    saveSelection();
    openModal(equationModal);
    setTimeout(() => equationInput.focus(), 50);
  }

  function openEquationModalForEdit(span) {
    editingEquationSpan = span;
    equationModalTitle.textContent = 'Edit equation';
    equationDeleteBtn.hidden = false;
    equationInput.value = span.dataset.tex || '';
    equationDisplay.checked = span.classList.contains('display');
    refreshPreview();
    openModal(equationModal);
    setTimeout(() => equationInput.focus(), 50);
  }

  $('#equationBtn')?.addEventListener('click', openEquationModalForNew);

  $('#equationInsertBtn')?.addEventListener('click', () => {
    const tex = equationInput.value.trim();
    if (!tex) { closeModal(equationModal); return; }
    const display = equationDisplay.checked;
    const mml = latexToMathML(tex, display);
    if (!mml) {
      toast('Could not render equation', 'error');
      return;
    }
    if (editingEquationSpan) {
      editingEquationSpan.dataset.tex = tex;
      editingEquationSpan.innerHTML = mml;
      editingEquationSpan.classList.toggle('display', display);
      editingEquationSpan = null;
      closeModal(equationModal);
      queueAutosave();
      return;
    }
    const cls = 'rwd-equation' + (display ? ' display' : '');
    const html = '<span class="' + cls + '" contenteditable="false" data-tex="' +
      escapeHtml(tex) + '">' + mml + '</span>' + (display ? '<p><br/></p>' : '');
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    closeModal(equationModal);
    queueAutosave();
  });

  equationDeleteBtn?.addEventListener('click', () => {
    if (!editingEquationSpan) return;
    editingEquationSpan.remove();
    editingEquationSpan = null;
    closeModal(equationModal);
    queueAutosave();
  });

  // Click an inserted equation to re-edit it
  editor.addEventListener('click', (e) => {
    const span = e.target.closest && e.target.closest('.rwd-equation');
    if (!span) return;
    e.preventDefault();
    openEquationModalForEdit(span);
  });

  // ============================================================
  // IMPROVEMENT: Inline math via $...$
  // ============================================================
  function processInlineMath() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const before = text.slice(0, offset - 1);
    const m = before.match(/\$([^$\n]{1,80})\$$/);
    if (!m) return;
    const start = offset - 1 - m[0].length;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset - 1);
    r.deleteContents();
    const span = document.createElement('span');
    span.className = 'rwd-math';
    span.textContent = m[1]
      .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ').replace(/\\theta/g, 'θ').replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'µ').replace(/\\pi/g, 'π').replace(/\\sigma/g, 'σ')
      .replace(/\\phi/g, 'φ').replace(/\\omega/g, 'ω').replace(/\\sum/g, '∑')
      .replace(/\\int/g, '∫').replace(/\\sqrt/g, '√').replace(/\\infty/g, '∞')
      .replace(/\\pm/g, '±').replace(/\\le/g, '≤').replace(/\\ge/g, '≥')
      .replace(/\\ne/g, '≠').replace(/\\to/g, '→');
    r.insertNode(span);
    placeCaretAfter(span);
  }
  editor.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && e.data === ' ') {
      processInlineMath();
    }
  });

  // ============================================================
  // IMPROVEMENT: Writing-goal completion celebration
  // ============================================================
  let goalCelebrated = false;
  const _origRefreshGoal = refreshGoal;
  refreshGoal = function () {
    _origRefreshGoal();
    if (writingGoal <= 0) { goalCelebrated = false; return; }
    const words = calcStats().words;
    if (words >= writingGoal && !goalCelebrated) {
      goalCelebrated = true;
      toast('🎉 Goal reached! ' + words + ' / ' + writingGoal + ' words', 'success', 4000);
      goalFill.classList.add('celebrate');
      setTimeout(() => goalFill.classList.remove('celebrate'), 4000);
    } else if (words < writingGoal) {
      goalCelebrated = false;
    }
  };

  // ============================================================
  // IMPROVEMENT: Print page numbers + date header (via @page rules)
  // ============================================================
  function preparePrint() {
    const pageEl = document.getElementById('page');
    if (!pageEl) return;
    const titleStr = (docTitle.value || 'Document').replace(/"/g, '\\"');
    const dateStr = new Date().toLocaleDateString().replace(/"/g, '\\"');
    pageEl.dataset.printTitle = titleStr;
    pageEl.dataset.printDate = dateStr;

    const headerText = getHeaderText().trim();
    const footerHasFields = docFooter && docFooter.querySelector('.rwd-pagenum');

    // Build @bottom-center / @top-center contributions from the
    // user-edited header and footer; fall back to title + page numbers.
    const old = document.getElementById('rwd-print-style');
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = 'rwd-print-style';

    // The footer can include a page-number field; for that we need to
    // emit `counter(page)` in the content string (not the literal text).
    let bottomCenter;
    if (footerHasFields || (docFooter && docFooter.innerText.trim())) {
      const clone = docFooter.cloneNode(true);
      // Replace any .rwd-pagenum with a literal marker we can swap into a content string
      clone.querySelectorAll('.rwd-pagenum').forEach((s) => {
        s.replaceWith('PAGE');
      });
      const raw = clone.textContent;
      // Build content fragments split by the marker so we can interleave
      // counter(page) between them.
      const parts = raw.split('PAGE');
      const fragments = [];
      parts.forEach((p, i) => {
        if (p) fragments.push('"' + p.replace(/"/g, '\\"') + '"');
        if (i < parts.length - 1) fragments.push('counter(page)');
      });
      bottomCenter = fragments.join(' ');
    } else {
      bottomCenter = '"' + titleStr + '"';
    }

    let topCenter = '"' + titleStr + '"';
    if (headerText) topCenter = '"' + headerText.replace(/"/g, '\\"') + '"';

    style.textContent = '@page { ' +
      '@top-center { content: ' + topCenter +
      '; font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '@bottom-center { content: ' + bottomCenter +
      '; font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '@bottom-right { content: counter(page) " / " counter(pages); font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '@bottom-left { content: "' + dateStr + '"; font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '}';
    document.head.appendChild(style);
  }

  // Prevent dropping random files into the editor as URLs
  editor.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const range = document.caretRangeFromPoint
          ? document.caretRangeFromPoint(e.clientX, e.clientY)
          : null;
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          savedRange = range.cloneRange();
        }
        exec('insertImage', reader.result);
      };
      reader.readAsDataURL(files[0]);
    }
  });

  // ============================================================
  // FEATURE: Format painter
  // ============================================================
  const formatPainterBtn = $('#formatPainterBtn');
  const formatPainterIndicator = $('#formatPainterIndicator');
  let painterStyles = null;

  function captureStyleAt(node) {
    if (!node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      textDecoration: cs.textDecorationLine || cs.textDecoration,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
    };
  }

  formatPainterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (painterStyles) {
      painterStyles = null;
      formatPainterBtn.classList.remove('armed');
      formatPainterIndicator.hidden = true;
      return;
    }
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    painterStyles = captureStyleAt(node);
    if (!painterStyles) {
      alert('Place the cursor in formatted text first, then click Format painter.');
      return;
    }
    formatPainterBtn.classList.add('armed');
    formatPainterIndicator.hidden = false;
  });

  editor.addEventListener('mouseup', () => {
    if (!painterStyles) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    Object.assign(span.style, {
      fontFamily: painterStyles.fontFamily,
      fontSize: painterStyles.fontSize,
      fontWeight: painterStyles.fontWeight,
      fontStyle: painterStyles.fontStyle,
      textDecoration: painterStyles.textDecoration,
      color: painterStyles.color,
    });
    if (painterStyles.backgroundColor &&
        painterStyles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      span.style.backgroundColor = painterStyles.backgroundColor;
    }
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch {}
    painterStyles = null;
    formatPainterBtn.classList.remove('armed');
    formatPainterIndicator.hidden = true;
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Cut / Copy / Paste
  // ============================================================
  $('#cutBtn').addEventListener('click', async () => {
    restoreSelection();
    try {
      const sel = window.getSelection().toString();
      if (sel && navigator.clipboard) {
        await navigator.clipboard.writeText(sel);
      }
      document.execCommand('delete');
    } catch {
      document.execCommand('cut');
    }
    queueAutosave();
  });

  $('#copyBtn').addEventListener('click', async () => {
    restoreSelection();
    try {
      const sel = window.getSelection().toString();
      if (sel && navigator.clipboard) {
        await navigator.clipboard.writeText(sel);
        flashStatus('Copied');
      } else {
        document.execCommand('copy');
      }
    } catch {
      document.execCommand('copy');
    }
  });

  $('#pasteBtn').addEventListener('click', async () => {
    restoreSelection();
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const txt = await navigator.clipboard.readText();
        document.execCommand('insertText', false, txt);
        queueAutosave();
        return;
      }
    } catch {}
    flashStatus('Use Ctrl+V to paste');
  });

  function flashStatus(msg) {
    const prev = statusSaved.textContent;
    statusSaved.textContent = msg;
    setTimeout(() => { statusSaved.textContent = prev; }, 1200);
  }

  // ============================================================
  // IMPROVEMENT: Toast notifications
  // ============================================================
  const toastContainer = $('#toastContainer');
  function toast(msg, kind = 'info', durationMs = 2500) {
    if (!toastContainer) { flashStatus(msg); return; }
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = 0;
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 300);
    }, durationMs);
  }

  // ============================================================
  // IMPROVEMENT: Custom confirm dialog
  // ============================================================
  const confirmModal = $('#confirmModal');
  function confirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
      $('#confirmTitle').textContent = title;
      $('#confirmMessage').textContent = message;
      confirmModal.hidden = false;
      const ok = $('#confirmOk');
      const cancel = $('#confirmCancel');
      function cleanup(result) {
        confirmModal.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  // ============================================================
  // IMPROVEMENT: Link insertion modal (replaces prompt)
  // ============================================================
  const linkModal = $('#linkModal');
  function openLinkModal() {
    const sel = window.getSelection();
    const selText = sel && sel.toString() ? sel.toString() : '';
    saveSelection();
    $('#linkText').value = selText;
    $('#linkUrl').value = 'https://';
    linkModal.hidden = false;
    setTimeout(() => $('#linkUrl').focus(), 50);
  }
  $('#insertLinkConfirm').addEventListener('click', () => {
    const text = $('#linkText').value.trim();
    const url = $('#linkUrl').value.trim();
    if (!url) { closeModal(linkModal); return; }
    restoreSelection();
    if (text) {
      document.execCommand('insertHTML', false,
        '<a href="' + escapeHtml(url) + '">' + escapeHtml(text) + '</a>');
    } else {
      document.execCommand('createLink', false, url);
    }
    closeModal(linkModal);
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: Drag-and-drop file to open
  // ============================================================
  ['dragover', 'drop'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
      }
    });
  });
  document.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const f = files[0];
    if (f.type.startsWith('image/')) return; // image-drop handled by editor listener
    if (!editor.contains(e.target) ||
        /\.(rwd|html?|txt|md|docx|pdf)$/i.test(f.name) ||
        f.type === 'application/json' ||
        f.type === 'application/pdf' ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      e.preventDefault();
      const dt = new DataTransfer();
      dt.items.add(f);
      const picker = $('#filePicker');
      picker.files = dt.files;
      picker.dispatchEvent(new Event('change'));
    }
  });

  // ============================================================
  // FEATURE: Table mini-toolbar
  // ============================================================
  const tableBar = $('#tableBar');

  function positionFloatBar(bar, anchor) {
    const r = anchor.getBoundingClientRect();
    // If the anchor is detached or scrolled out, getBoundingClientRect
    // returns 0×0 and the bar would jump to (0,0). Hide it instead.
    if (r.width === 0 && r.height === 0) { bar.hidden = true; return; }
    // viewport-relative because float-bar is position:fixed
    const top = r.top - bar.offsetHeight - 6;
    bar.style.left = Math.max(8, r.left) + 'px';
    bar.style.top = (top < 8 ? r.bottom + 6 : top) + 'px';
  }

  function activeCell() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    return n ? n.closest('td, th') : null;
  }

  function showTableBar(cell) {
    tableBar.hidden = false;
    positionFloatBar(tableBar, cell);
  }

  function hideTableBar() { tableBar.hidden = true; }

  editor.addEventListener('click', () => {
    const c = activeCell();
    if (c) showTableBar(c); else hideTableBar();
  });
  editor.addEventListener('keyup', () => {
    const c = activeCell();
    if (c) showTableBar(c);
  });
  document.addEventListener('scroll', () => {
    if (!tableBar.hidden) {
      const c = activeCell();
      if (c) positionFloatBar(tableBar, c);
    }
  }, true);

  tableBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const cell = activeCell();
    if (!cell) return;
    const row = cell.parentElement;
    const table = cell.closest('table');
    const colIdx = Array.from(row.children).indexOf(cell);

    switch (btn.dataset.tact) {
      case 'row-above':
      case 'row-below': {
        const newRow = row.cloneNode(false);
        Array.from(row.children).forEach(() => {
          const c = document.createElement(row.firstElementChild.tagName);
          c.innerHTML = '&nbsp;';
          newRow.appendChild(c);
        });
        row.parentNode.insertBefore(
          newRow,
          btn.dataset.tact === 'row-above' ? row : row.nextSibling
        );
        break;
      }
      case 'col-left':
      case 'col-right': {
        const offset = btn.dataset.tact === 'col-left' ? 0 : 1;
        Array.from(table.rows).forEach((r) => {
          const ref = r.children[colIdx + offset] || null;
          const c = document.createElement(r.children[0].tagName);
          c.innerHTML = '&nbsp;';
          r.insertBefore(c, ref);
        });
        break;
      }
      case 'del-row':
        if (table.rows.length > 1) row.remove();
        break;
      case 'del-col':
        if (row.children.length > 1) {
          Array.from(table.rows).forEach((r) => {
            if (r.children[colIdx]) r.children[colIdx].remove();
          });
        }
        break;
      case 'del-table':
        if (confirm('Delete the entire table?')) {
          table.remove();
          hideTableBar();
        }
        break;
      case 'merge': {
        // Merge horizontally (current cell + next sibling) or vertically
        // (with cell directly below) — simple two-way merge.
        const next = cell.nextElementSibling;
        const below = row.nextElementSibling &&
          row.nextElementSibling.children[colIdx];
        if (next) {
          const span = parseInt(cell.getAttribute('colspan') || '1', 10);
          cell.setAttribute('colspan', String(span + 1));
          cell.innerHTML = (cell.innerHTML.trim() + ' ' +
            next.innerHTML.trim()).trim() || '&nbsp;';
          next.remove();
        } else if (below) {
          const span = parseInt(cell.getAttribute('rowspan') || '1', 10);
          cell.setAttribute('rowspan', String(span + 1));
          cell.innerHTML = (cell.innerHTML.trim() + ' ' +
            below.innerHTML.trim()).trim() || '&nbsp;';
          below.remove();
        }
        break;
      }
      case 'split': {
        const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
        const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
        if (cs > 1) {
          cell.setAttribute('colspan', String(cs - 1));
          const c = document.createElement(cell.tagName);
          c.innerHTML = '&nbsp;';
          cell.parentNode.insertBefore(c, cell.nextSibling);
        } else if (rs > 1) {
          cell.setAttribute('rowspan', String(rs - 1));
          const next = row.nextElementSibling;
          if (next) {
            const c = document.createElement(cell.tagName);
            c.innerHTML = '&nbsp;';
            next.insertBefore(c, next.children[colIdx] || null);
          }
        } else {
          toast('Cell is not merged', 'info');
        }
        break;
      }
      case 'sort-asc':
      case 'sort-desc': {
        const desc = btn.dataset.tact === 'sort-desc';
        const tbody = table.tBodies[0] || table;
        const rows = Array.from(tbody.rows);
        if (rows.length < 2) break;
        const header = rows[0];
        const dataRows = rows.slice(1);
        const sortKey = (r) => {
          const txt = (r.children[colIdx] && r.children[colIdx].textContent || '').trim();
          const n = parseFloat(txt);
          return isNaN(n) ? txt.toLowerCase() : n;
        };
        dataRows.sort((a, b) => {
          const ka = sortKey(a), kb = sortKey(b);
          if (typeof ka === 'number' && typeof kb === 'number') {
            return desc ? kb - ka : ka - kb;
          }
          return desc ? String(kb).localeCompare(ka) : String(ka).localeCompare(kb);
        });
        dataRows.forEach((r) => tbody.appendChild(r));
        // Re-insert header at top
        if (header && header.parentNode === tbody) tbody.insertBefore(header, tbody.firstChild);
        break;
      }
      case 'style': {
        const v = btn.value;
        ['tbl-bordered','tbl-grid','tbl-banded','tbl-header','tbl-minimal'].forEach((c) =>
          table.classList.remove(c));
        // Also strip the legacy "bordered" class so the new style wins
        table.classList.remove('bordered');
        if (v) table.classList.add('tbl-' + v);
        break;
      }
    }
    queueAutosave();
  });

  // The table-style <select> emits `change`, not `click`.
  tableBar.addEventListener('change', (e) => {
    const sel = e.target.closest('select');
    if (!sel || sel.dataset.tact !== 'style') return;
    const cell = activeCell();
    if (!cell) return;
    const table = cell.closest('table');
    ['tbl-bordered','tbl-grid','tbl-banded','tbl-header','tbl-minimal'].forEach((c) =>
      table.classList.remove(c));
    table.classList.remove('bordered');
    if (sel.value) table.classList.add('tbl-' + sel.value);
    sel.value = '';
    queueAutosave();
  });

  // Convert text → table (commas / tabs / pipes → cells; lines → rows)
  $('#textToTableBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast('Select the text to convert first', 'info');
      return;
    }
    const txt = sel.toString();
    let sep = '\t';
    if (!txt.includes('\t') && txt.includes(',')) sep = ',';
    else if (!txt.includes('\t') && !txt.includes(',') && txt.includes('|')) sep = '|';
    const rows = txt.split(/\r?\n/).filter((l) => l.length).map((l) => l.split(sep));
    const cols = Math.max(...rows.map((r) => r.length));
    let html = '<table class="tbl-bordered"><tbody>';
    rows.forEach((r, i) => {
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<' + tag + '>' + escapeHtml(r[c] || '&nbsp;') + '</' + tag + '>';
      }
      html += '</tr>';
    });
    html += '</tbody></table><p><br/></p>';
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // Convert table → text (tab-separated, one row per line)
  $('#tableToTextBtn')?.addEventListener('click', () => {
    const cell = activeCell();
    const table = cell ? cell.closest('table') : null;
    if (!table) { toast('Place the cursor in a table first', 'info'); return; }
    const lines = [];
    Array.from(table.rows).forEach((r) => {
      lines.push(Array.from(r.cells).map((c) =>
        c.textContent.replace(/\t/g, ' ').trim()).join('\t'));
    });
    const html = lines.map((l) => '<p>' + escapeHtml(l) + '</p>').join('');
    table.outerHTML = html;
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Image mini-toolbar
  // ============================================================
  const imageBar = $('#imageBar');
  let selectedImg = null;

  editor.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('img');
    if (!img) {
      if (selectedImg) {
        selectedImg.classList.remove('rwd-img-selected');
        selectedImg = null;
      }
      imageBar.hidden = true;
      return;
    }
    if (selectedImg && selectedImg !== img) {
      selectedImg.classList.remove('rwd-img-selected');
    }
    selectedImg = img;
    img.classList.add('rwd-img-selected');
    imageBar.hidden = false;
    positionFloatBar(imageBar, img);
  });

  imageBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !selectedImg) return;
    const a = btn.dataset.iact;
    const target = selectedImg.parentElement && selectedImg.parentElement.tagName === 'FIGURE'
      ? selectedImg.parentElement : selectedImg;

    if (a === 'small' || a === 'medium' || a === 'full') {
      selectedImg.classList.remove('rwd-img-small', 'rwd-img-medium', 'rwd-img-full');
      selectedImg.classList.add('rwd-img-' + a);
    } else if (a === 'align-left' || a === 'align-center' || a === 'align-right') {
      target.classList.remove('rwd-img-left', 'rwd-img-center', 'rwd-img-right');
      target.classList.add('rwd-img-' + a.replace('align-', ''));
    } else if (a === 'caption') {
      let figure = selectedImg.closest('figure');
      let cap = figure ? figure.querySelector('figcaption') : null;
      const current = cap ? cap.textContent : '';
      const v = prompt('Caption:', current);
      if (v === null) return;
      if (!figure && v.trim()) {
        figure = document.createElement('figure');
        const parent = selectedImg.parentNode;
        parent.insertBefore(figure, selectedImg);
        figure.appendChild(selectedImg);
      }
      if (figure) {
        cap = figure.querySelector('figcaption');
        if (!v.trim()) {
          if (cap) cap.remove();
          if (figure.children.length === 1) {
            figure.parentNode.insertBefore(figure.firstElementChild, figure);
            figure.remove();
          }
        } else {
          if (!cap) {
            cap = document.createElement('figcaption');
            figure.appendChild(cap);
          }
          cap.textContent = v;
        }
      }
    } else if (a === 'crop') {
      openCropModal(selectedImg);
    } else if (a === 'effects') {
      openEffectsModal(selectedImg);
    } else if (a && a.indexOf('wrap-') === 0) {
      const kind = a.slice(5);
      const wrapClasses = ['rwd-wrap-square','rwd-wrap-tight','rwd-wrap-through',
        'rwd-wrap-behind','rwd-wrap-front','rwd-wrap-none'];
      [target, selectedImg].forEach((t) => {
        if (!t) return;
        wrapClasses.forEach((c) => t.classList.remove(c));
        if (kind !== 'none') t.classList.add('rwd-wrap-' + kind);
        else t.classList.add('rwd-wrap-none');
      });
    } else if (a === 'rotate-l' || a === 'rotate-r') {
      const cur = parseInt(selectedImg.dataset.rotate || '0', 10);
      const next = (cur + (a === 'rotate-r' ? 90 : -90)) % 360;
      const norm = (next + 360) % 360;
      selectedImg.dataset.rotate = norm;
      selectedImg.style.transform = 'rotate(' + norm + 'deg)';
    } else if (a === 'alt') {
      const v = prompt('Alt text:', selectedImg.alt || '');
      if (v !== null) selectedImg.alt = v;
    } else if (a === 'delete') {
      const fig = selectedImg.closest('figure');
      (fig || selectedImg).remove();
      selectedImg = null;
      imageBar.hidden = true;
    }
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Document outline / navigation pane
  // ============================================================
  const outlinePane = $('#outlinePane');
  const outlineList = $('#outlineList');
  const outlineToggle = $('#outlineToggle');

  let outlineEntries = [];

  function rebuildOutline() {
    if (outlinePane.hidden) return;
    const headings = editor.querySelectorAll('h1, h2, h3, h4');
    outlineList.innerHTML = '';
    outlineEntries = [];
    if (!headings.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No headings yet — apply Heading 1–4 to build an outline.';
      outlineList.appendChild(li);
      return;
    }
    headings.forEach((h, i) => {
      if (!h.id) h.id = 'rwd-h-' + i;
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);
      // Count words from this heading until the next heading
      let wc = 0;
      let n = h.nextElementSibling;
      while (n && !/^H[1-6]$/.test(n.tagName)) {
        wc += (n.textContent || '').split(/\s+/).filter(Boolean).length;
        n = n.nextElementSibling;
      }
      li.innerHTML = '<span>' + escapeHtml(h.textContent || '(empty heading)') +
                     '</span><span class="wc">' + wc + 'w</span>';
      li.addEventListener('click', () => {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const r = document.createRange();
        r.selectNodeContents(h);
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      outlineList.appendChild(li);
      outlineEntries.push({ heading: h, li });
    });
    const oc = document.getElementById('outlineCount');
    if (oc) oc.textContent = headings.length + ' heading' + (headings.length === 1 ? '' : 's');
  }

  // ============================================================
  // IMPROVEMENT: Outline pane resize handle
  // ============================================================
  (function setupOutlineResize() {
    const handle = document.getElementById('outlineResize');
    if (!handle) return;
    let dragging = false;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.style.cursor = 'col-resize';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const next = Math.min(480, Math.max(160, e.clientX));
      outlinePane.style.width = next + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  })();

  function syncOutlineCurrent() {
    if (outlinePane.hidden || !outlineEntries.length) return;
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const wsTop = ws.getBoundingClientRect().top;
    let activeIdx = 0;
    for (let i = 0; i < outlineEntries.length; i++) {
      const top = outlineEntries[i].heading.getBoundingClientRect().top;
      if (top - wsTop <= 80) activeIdx = i;
      else break;
    }
    outlineEntries.forEach((e, i) => {
      e.li.classList.toggle('current', i === activeIdx);
    });
  }

  // Throttled scroll sync
  document.querySelector('.workspace-main')?.addEventListener('scroll', () => {
    clearTimeout(window.__rwdScrollT);
    window.__rwdScrollT = setTimeout(syncOutlineCurrent, 80);
  });

  outlineToggle.addEventListener('change', () => {
    outlinePane.hidden = !outlineToggle.checked;
    if (outlineToggle.checked) rebuildOutline();
    savePrefs();
  });

  $('#outlineCloseBtn').addEventListener('click', () => {
    outlineToggle.checked = false;
    outlinePane.hidden = true;
    savePrefs();
  });

  // Refresh outline when editor changes
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdOutlineT);
    window.__rwdOutlineT = setTimeout(rebuildOutline, 300);
  });

  // ============================================================
  // FEATURE: Word count details modal
  // ============================================================
  const countModal = $('#countModal');
  const countBody = $('#countBody');
  const statusReading = $('#statusReading');

  function calcStats() {
    const text = editor.innerText || '';
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const paragraphs = (editor.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre').length) || 0;
    const sentences = trimmed ? (trimmed.match(/[.!?…]+(\s|$)/g) || []).length || 1 : 0;
    const minutes = Math.max(1, Math.round(words / 220));
    return { words, chars, charsNoSpace, paragraphs, sentences, minutes };
  }

  function renderCountModal() {
    const s = calcStats();
    countBody.innerHTML = `
      <div class="row"><span>Pages</span><b>${statusPage.textContent.replace('Page 1 of ', '')}</b></div>
      <div class="row"><span>Words</span><b>${s.words.toLocaleString()}</b></div>
      <div class="row"><span>Characters (with spaces)</span><b>${s.chars.toLocaleString()}</b></div>
      <div class="row"><span>Characters (no spaces)</span><b>${s.charsNoSpace.toLocaleString()}</b></div>
      <div class="row"><span>Paragraphs</span><b>${s.paragraphs.toLocaleString()}</b></div>
      <div class="row"><span>Sentences</span><b>${s.sentences.toLocaleString()}</b></div>
      <div class="row"><span>Reading time (~220 wpm)</span><b>${s.minutes} min</b></div>
    `;
  }

  $('#statusWords').addEventListener('click', () => {
    renderCountModal();
    openModal(countModal);
  });

  // Update reading-time indicator in status bar on the same cadence as counts
  setInterval(() => {
    const s = calcStats();
    statusReading.textContent = s.minutes + ' min read';
  }, 1500);

  // ============================================================
  // FEATURE: Export to Markdown
  // ============================================================
  function htmlToMarkdown(root) {
    const lines = [];

    function inline(node) {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      const inner = childrenInline(node);
      switch (tag) {
        case 'b': case 'strong': return '**' + inner + '**';
        case 'i': case 'em': return '*' + inner + '*';
        case 'u': return '<u>' + inner + '</u>';
        case 's': case 'strike': case 'del': return '~~' + inner + '~~';
        case 'code': return '`' + inner + '`';
        case 'a':
          return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
        case 'img':
          return '![' + (node.getAttribute('alt') || '') + '](' +
                 (node.getAttribute('src') || '') + ')';
        case 'br': return '  \n';
        default: return inner;
      }
    }

    function childrenInline(node) {
      let out = '';
      node.childNodes.forEach((c) => { out += inline(c); });
      return out;
    }

    function walk(node) {
      if (node.nodeType === 3) {
        const t = node.nodeValue.trim();
        if (t) lines.push(t);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'h1': lines.push('# ' + childrenInline(node)); break;
        case 'h2': lines.push('## ' + childrenInline(node)); break;
        case 'h3': lines.push('### ' + childrenInline(node)); break;
        case 'h4': lines.push('#### ' + childrenInline(node)); break;
        case 'h5': lines.push('##### ' + childrenInline(node)); break;
        case 'h6': lines.push('###### ' + childrenInline(node)); break;
        case 'p': lines.push(childrenInline(node)); break;
        case 'blockquote':
          lines.push('> ' + childrenInline(node).replace(/\n/g, '\n> '));
          break;
        case 'pre':
          lines.push('```\n' + (node.textContent || '') + '\n```');
          break;
        case 'hr': lines.push('---'); break;
        case 'ul':
          node.querySelectorAll(':scope > li').forEach((li) => {
            lines.push('- ' + childrenInline(li));
          });
          break;
        case 'ol': {
          let i = 1;
          node.querySelectorAll(':scope > li').forEach((li) => {
            lines.push(i++ + '. ' + childrenInline(li));
          });
          break;
        }
        case 'table': {
          const rows = node.querySelectorAll('tr');
          if (!rows.length) break;
          const headerCells = rows[0].querySelectorAll('th, td');
          const widths = headerCells.length;
          lines.push('| ' + Array.from(headerCells)
            .map((c) => childrenInline(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
          lines.push('|' + ' --- |'.repeat(widths));
          for (let r = 1; r < rows.length; r++) {
            const cells = rows[r].querySelectorAll('td, th');
            lines.push('| ' + Array.from(cells)
              .map((c) => childrenInline(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
          }
          break;
        }
        default:
          node.childNodes.forEach(walk);
      }
    }

    Array.from(root.childNodes).forEach(walk);
    return lines.join('\n\n');
  }

  function exportMarkdown() {
    const md = '# ' + (docTitle.value || 'Document') + '\n\n' + htmlToMarkdown(editor);
    downloadBlob(md, sanitizeFileName(docTitle.value) + '.md', 'text/markdown');
  }

  // ============================================================
  // FEATURE: Version history (auto snapshots)
  // ============================================================
  const STORE_HISTORY = 'rodmanword:history';
  const HISTORY_LIMIT = 20;

  function snapshot() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_HISTORY) || '[]'); } catch {}
    const latest = list[0];
    const html = editor.innerHTML;
    if (latest && latest.html === html) return;
    const entry = {
      title: docTitle.value,
      html,
      at: new Date().toISOString(),
      words: calcStats().words,
    };
    list = [entry, ...list].slice(0, HISTORY_LIMIT);
    try { localStorage.setItem(STORE_HISTORY, JSON.stringify(list)); } catch {}
  }
  // Snapshot every 2 minutes
  setInterval(snapshot, 2 * 60 * 1000);

  function renderHistory() {
    backstageTitle.textContent = 'Version history';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_HISTORY) || '[]'); } catch {}
    if (!list.length) {
      backstageContent.innerHTML =
        '<p>No snapshots yet. RodmanWord auto-snapshots every 2 minutes while you edit.</p>' +
        '<button class="btn primary" id="snapNowBtn">Take a snapshot now</button>';
      $('#snapNowBtn').addEventListener('click', () => { snapshot(); renderHistory(); });
      return;
    }
    backstageContent.innerHTML =
      '<p>Click any version to restore it. Up to ' + HISTORY_LIMIT + ' snapshots are kept.</p>' +
      '<ul class="history-list"></ul>' +
      '<button class="btn" id="snapNowBtn">Take a snapshot now</button>';
    const ul = backstageContent.querySelector('ul');
    list.forEach((item, idx) => {
      const li = document.createElement('li');
      const dt = new Date(item.at);
      li.innerHTML = `<button>🕓 <b>${escapeHtml(item.title || 'Untitled')}</b><br/>` +
        `<small>${dt.toLocaleString()} • ${item.words} words</small></button>`;
      li.querySelector('button').addEventListener('click', () => {
        if (!confirm('Restore this version? Your current document will be replaced (a new snapshot is taken first).')) return;
        snapshot();
        editor.innerHTML = sanitizeImported(item.html);
        if (item.title) docTitle.value = item.title;
        queueAutosave();
        rebuildOutline();
        closeBackstage();
      });
      ul.appendChild(li);
    });
    $('#snapNowBtn').addEventListener('click', () => { snapshot(); renderHistory(); });
  }

  // ============================================================
  // FEATURE: Templates gallery
  // ============================================================
  const TEMPLATES = [
    {
      id: 'blank',
      name: 'Blank',
      desc: 'Start from scratch.',
      html: '<h1>Untitled document</h1><p><br/></p>',
    },
    {
      id: 'resume',
      name: 'Resume',
      desc: 'Single-page professional resume.',
      html: `<h1 style="text-align:center;margin-bottom:0">Your Name</h1>
<p style="text-align:center;color:#666;margin:0 0 1em">your.email@example.com  •  (555) 555-1234  •  city, country  •  linkedin.com/in/you</p>
<h2>Summary</h2>
<p>Two-to-three sentences describing what you do, what you're great at, and what you're looking for.</p>
<h2>Experience</h2>
<h3>Job title — Company</h3>
<p style="color:#666"><i>Jan 2023 – Present</i></p>
<ul><li>Impact-oriented bullet point with metrics.</li><li>Another accomplishment.</li><li>And one more.</li></ul>
<h3>Job title — Company</h3>
<p style="color:#666"><i>Jun 2020 – Dec 2022</i></p>
<ul><li>What you did.</li><li>What you delivered.</li></ul>
<h2>Education</h2>
<p><b>Degree</b>, University · 2016–2020</p>
<h2>Skills</h2>
<p>Skill 1, Skill 2, Skill 3, Skill 4, Skill 5</p>`,
    },
    {
      id: 'cover-letter',
      name: 'Cover letter',
      desc: 'Classic block-style cover letter.',
      html: `<p>Your Name<br/>Street address<br/>City, ZIP<br/>your.email@example.com</p>
<p>${new Date().toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'})}</p>
<p>Hiring Manager<br/>Company Name<br/>Street address<br/>City, ZIP</p>
<p>Dear Hiring Manager,</p>
<p>I am writing to apply for the [Role] position at [Company]. With [N] years of experience in [field], I am excited about the opportunity to contribute to your team.</p>
<p>In my current role at [Company], I have [accomplishment with metric]. I bring [skill 1], [skill 2], and a passion for [thing relevant to the company].</p>
<p>Thank you for your consideration. I would welcome the chance to discuss how I can contribute to [Company]'s continued success.</p>
<p>Sincerely,<br/><br/>Your Name</p>`,
    },
    {
      id: 'report',
      name: 'Report',
      desc: 'Structured report with TOC-style headings.',
      html: `<h1>Report title</h1>
<p style="color:#666"><i>Author name • ${new Date().toLocaleDateString()}</i></p>
<h2>Executive summary</h2>
<p>A 3–5 sentence overview of the key findings and recommendations.</p>
<h2>Background</h2>
<p>Context for why this report exists and what question it answers.</p>
<h2>Findings</h2>
<h3>Finding 1</h3>
<p>Details and supporting data.</p>
<h3>Finding 2</h3>
<p>Details and supporting data.</p>
<h2>Recommendations</h2>
<ol><li>Recommendation 1.</li><li>Recommendation 2.</li><li>Recommendation 3.</li></ol>
<h2>Appendix</h2>
<p>References, raw data, and additional materials.</p>`,
    },
    {
      id: 'memo',
      name: 'Memo',
      desc: 'Internal memo with To/From/Re header.',
      html: `<h1>Memo</h1>
<table><tbody>
<tr><td><b>To:</b></td><td>Recipient</td></tr>
<tr><td><b>From:</b></td><td>Sender</td></tr>
<tr><td><b>Date:</b></td><td>${new Date().toLocaleDateString()}</td></tr>
<tr><td><b>Re:</b></td><td>Subject</td></tr>
</tbody></table>
<hr/>
<p>Opening paragraph that states the memo's purpose.</p>
<p>Body paragraph(s) with details, context, and any supporting information.</p>
<p>Closing paragraph with action items or next steps.</p>`,
    },
    {
      id: 'meeting',
      name: 'Meeting notes',
      desc: 'Agenda, attendees, decisions, action items.',
      html: `<h1>Meeting notes</h1>
<p><b>Date:</b> ${new Date().toLocaleString()}<br/>
<b>Attendees:</b> name, name, name<br/>
<b>Notetaker:</b> you</p>
<h2>Agenda</h2>
<ol><li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>
<h2>Discussion</h2>
<p>Key points discussed.</p>
<h2>Decisions</h2>
<ul><li>Decision 1</li><li>Decision 2</li></ul>
<h2>Action items</h2>
<table class="bordered"><thead><tr><th>Owner</th><th>Item</th><th>Due</th></tr></thead>
<tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table>`,
    },
  ];

  // ============================================================
  // FEATURE: Voice dictation (Web Speech API)
  // ============================================================
  const dictateBtn = $('#dictateBtn');
  const dictationIndicator = $('#dictationIndicator');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let dictating = false;

  if (!SR) {
    dictateBtn.title = 'Voice dictation is not supported by this browser.';
    dictateBtn.disabled = true;
    dictateBtn.style.opacity = 0.5;
  } else {
    recognizer = new SR();
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.lang = navigator.language || 'en-US';

    recognizer.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
      }
      if (!text) return;
      restoreSelection();
      document.execCommand('insertText', false, text);
      saveSelection();
      queueAutosave();
    };
    recognizer.onerror = () => stopDictation();
    recognizer.onend = () => {
      if (dictating) {
        try { recognizer.start(); } catch {}
      }
    };

    dictateBtn.addEventListener('click', () => {
      if (dictating) stopDictation();
      else startDictation();
    });
  }

  function startDictation() {
    if (!recognizer) return;
    saveSelection();
    try { recognizer.start(); dictating = true; } catch {}
    dictateBtn.classList.add('armed');
    dictationIndicator.hidden = false;
  }

  function stopDictation() {
    if (!recognizer) return;
    dictating = false;
    try { recognizer.stop(); } catch {}
    dictateBtn.classList.remove('armed');
    dictationIndicator.hidden = true;
  }

  // ============================================================
  // FEATURE: Emoji picker
  // ============================================================
  const EMOJI = {
    '😀 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
    '👍 People': ['👋','🤚','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋'],
    '🐶 Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐠','🐟','🐡','🐬','🦈','🐳','🐋','🐊'],
    '🍎 Food': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪'],
    '⚽ Activity': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🎯','🪀','🎮','🕹️','🎰','🎲','🧩','🧸','♠️','♥️','♦️','♣️'],
    '🚗 Travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸'],
    '💡 Objects': ['💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','💈','⚗️','🔭','🔬','🕳️','💊','💉','🩸','🩹','🩺','🌡️'],
    '✅ Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐'],
  };

  const emojiCats = $('#emojiCats');
  const emojiGrid = $('#emojiGrid');
  const emojiModal = $('#emojiModal');

  function showEmojiCategory(catName) {
    emojiGrid.innerHTML = '';
    (EMOJI[catName] || []).forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.addEventListener('click', () => {
        restoreSelection();
        document.execCommand('insertText', false, e);
        queueAutosave();
      });
      emojiGrid.appendChild(b);
    });
    Array.from(emojiCats.children).forEach((c) => {
      c.classList.toggle('active', c.dataset.cat === catName);
    });
  }

  Object.keys(EMOJI).forEach((cat, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.cat = cat;
    b.textContent = cat.split(' ')[0];
    b.title = cat;
    if (i === 0) b.classList.add('active');
    b.addEventListener('click', () => showEmojiCategory(cat));
    emojiCats.appendChild(b);
  });
  showEmojiCategory(Object.keys(EMOJI)[0]);

  $('#insertEmojiBtn').addEventListener('click', () => {
    saveSelection();
    openModal(emojiModal);
  });

  // ============================================================
  // FEATURE: Focus mode
  // ============================================================
  function enterFocusMode() {
    document.body.classList.add('focus-mode');
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (!$('.focus-mode-exit')) {
      const btn = document.createElement('button');
      btn.className = 'focus-mode-exit';
      btn.textContent = 'Exit focus (Esc)';
      btn.addEventListener('click', exitFocusMode);
      document.body.appendChild(btn);

      const tw = document.createElement('button');
      tw.className = 'focus-mode-exit';
      tw.style.right = '180px';
      tw.textContent = 'Typewriter mode';
      tw.addEventListener('click', () => {
        document.body.classList.toggle('typewriter');
        tw.textContent = document.body.classList.contains('typewriter')
          ? 'Standard view' : 'Typewriter mode';
        if (document.body.classList.contains('typewriter')) centerCurrentLine();
      });
      document.body.appendChild(tw);
    }
    editor.focus();
  }

  function centerCurrentLine() {
    if (!document.body.classList.contains('typewriter')) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getClientRects()[0];
    if (!rect) return;
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const target = rect.top + ws.scrollTop - window.innerHeight / 2;
    ws.scrollTo({ top: target, behavior: 'smooth' });
  }
  document.addEventListener('selectionchange', () => {
    if (document.body.classList.contains('typewriter')) {
      clearTimeout(window.__rwdTwT);
      window.__rwdTwT = setTimeout(centerCurrentLine, 80);
    }
  });

  function exitFocusMode() {
    document.body.classList.remove('focus-mode');
    const btn = $('.focus-mode-exit');
    if (btn) btn.remove();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function toggleFocus() {
    if (document.body.classList.contains('focus-mode')) exitFocusMode();
    else enterFocusMode();
  }

  $('#focusBtn').addEventListener('click', toggleFocus);
  $('#focusBtn2').addEventListener('click', toggleFocus);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFocus();
    } else if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
      exitFocusMode();
    }
  });

  // ============================================================
  // FEATURE: Keyboard shortcuts cheatsheet
  // ============================================================
  $('#helpBtn').addEventListener('click', () => openModal($('#shortcutsModal')));
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement === editor) return;
      e.preventDefault();
      openModal($('#shortcutsModal'));
    }
  });

  // ============================================================
  // FEATURE: Read aloud (text-to-speech)
  // ============================================================
  const ttsIndicator = $('#ttsIndicator');
  const readAloudBtn = $('#readAloudBtn');
  const synth = window.speechSynthesis;
  let ttsSpeaking = false;

  const ttsBar = $('#ttsBar');
  const ttsVoiceSel = $('#ttsVoice');
  const ttsRate = $('#ttsRate');
  const ttsRateLabel = $('#ttsRateLabel');
  const ttsPauseBtn = $('#ttsPauseBtn');
  const ttsStopBtn = $('#ttsStopBtn');

  if (!synth) {
    readAloudBtn.disabled = true;
    readAloudBtn.title = 'Text-to-speech not supported';
    readAloudBtn.style.opacity = 0.5;
  } else {
    function loadVoices() {
      const voices = synth.getVoices();
      ttsVoiceSel.innerHTML = '';
      voices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = v.name + ' (' + v.lang + ')' + (v.default ? ' ★' : '');
        if (v.default) opt.selected = true;
        ttsVoiceSel.appendChild(opt);
      });
    }
    loadVoices();
    if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;

    ttsRate.addEventListener('input', () => {
      ttsRateLabel.textContent = parseFloat(ttsRate.value).toFixed(1) + '×';
    });

    function startTts() {
      const sel = window.getSelection().toString();
      const text = sel || editor.innerText;
      if (!text.trim()) { flashStatus('Nothing to read'); return; }
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const idx = parseInt(ttsVoiceSel.value, 10);
      if (!isNaN(idx) && voices[idx]) u.voice = voices[idx];
      u.rate = parseFloat(ttsRate.value) || 1;
      u.lang = u.voice ? u.voice.lang : (navigator.language || 'en-US');
      u.onstart = () => {
        ttsSpeaking = true;
        readAloudBtn.classList.add('armed');
        ttsIndicator.hidden = false;
        ttsBar.hidden = false;
        ttsPauseBtn.textContent = 'Pause';
      };
      u.onend = u.onerror = () => {
        ttsSpeaking = false;
        readAloudBtn.classList.remove('armed');
        ttsIndicator.hidden = true;
        ttsBar.hidden = true;
      };
      synth.speak(u);
    }

    readAloudBtn.addEventListener('click', () => {
      if (ttsSpeaking) { synth.cancel(); return; }
      startTts();
    });

    ttsPauseBtn.addEventListener('click', () => {
      if (synth.paused) { synth.resume(); ttsPauseBtn.textContent = 'Pause'; }
      else { synth.pause(); ttsPauseBtn.textContent = 'Resume'; }
    });
    ttsStopBtn.addEventListener('click', () => synth.cancel());
  }

  // ============================================================
  // FEATURE: Document properties
  // ============================================================
  const STORE_PROPS = 'rodmanword:props';
  let docProps = {};
  try { docProps = JSON.parse(localStorage.getItem(STORE_PROPS) || '{}'); } catch {}

  const propsModal = $('#propsModal');

  function openPropsModal() {
    $('#propTitle').value = docProps.title || docTitle.value || '';
    $('#propAuthor').value = docProps.author || '';
    $('#propSubject').value = docProps.subject || '';
    $('#propKeywords').value = docProps.keywords || '';
    $('#propDesc').value = docProps.description || '';
    const s = calcStats();
    $('#propStats').innerHTML =
      '<div class="row"><span>Words</span><span>' + s.words + '</span></div>' +
      '<div class="row"><span>Characters</span><span>' + s.chars + '</span></div>' +
      '<div class="row"><span>Paragraphs</span><span>' + s.paragraphs + '</span></div>' +
      '<div class="row"><span>Last edit</span><span>' + new Date().toLocaleString() + '</span></div>';
    openModal(propsModal);
  }

  $('#savePropsBtn').addEventListener('click', () => {
    docProps = {
      title: $('#propTitle').value,
      author: $('#propAuthor').value,
      subject: $('#propSubject').value,
      keywords: $('#propKeywords').value,
      description: $('#propDesc').value,
    };
    try { localStorage.setItem(STORE_PROPS, JSON.stringify(docProps)); } catch {}
    if (docProps.title) {
      docTitle.value = docProps.title;
      queueAutosave();
    }
    closeModal(propsModal);
    flashStatus('Properties saved');
  });

  // ============================================================
  // FEATURE: Writing goal
  // ============================================================
  const STORE_GOAL = 'rodmanword:goal';
  const goalIndicator = $('#goalIndicator');
  const goalLabel = $('#goalLabel');
  const goalFill = $('#goalFill');
  const goalModal = $('#goalModal');
  let writingGoal = parseInt(localStorage.getItem(STORE_GOAL) || '0', 10) || 0;

  function refreshGoal() {
    if (writingGoal <= 0) {
      goalIndicator.hidden = true;
      return;
    }
    goalIndicator.hidden = false;
    const words = calcStats().words;
    const pct = Math.min(100, Math.round((words / writingGoal) * 100));
    goalLabel.textContent = words + ' / ' + writingGoal + ' (' + pct + '%)';
    goalFill.style.width = Math.min(100, pct) + '%';
    goalFill.classList.toggle('over', words > writingGoal);
  }

  $('#saveGoalBtn').addEventListener('click', () => {
    writingGoal = Math.max(0, parseInt($('#goalTarget').value, 10) || 0);
    try { localStorage.setItem(STORE_GOAL, String(writingGoal)); } catch {}
    refreshGoal();
    closeModal(goalModal);
  });

  setInterval(refreshGoal, 1500);
  refreshGoal();

  // ============================================================
  // FEATURE: Auto-correct (smart quotes + common typos)
  // ============================================================
  const STORE_AC = 'rodmanword:autocorrect';
  const autoCorrectToggle = $('#autoCorrectToggle');
  autoCorrectToggle.checked = localStorage.getItem(STORE_AC) === '1';
  autoCorrectToggle.addEventListener('change', () => {
    localStorage.setItem(STORE_AC, autoCorrectToggle.checked ? '1' : '0');
  });

  const TYPOS = {
    teh: 'the', Teh: 'The',
    recieve: 'receive', Recieve: 'Receive',
    seperate: 'separate', Seperate: 'Separate',
    definately: 'definitely', Definately: 'Definitely',
    occured: 'occurred', Occured: 'Occurred',
    untill: 'until', Untill: 'Until',
    alot: 'a lot', Alot: 'A lot',
    accross: 'across', Accross: 'Across',
    wich: 'which', Wich: 'Which',
    becuase: 'because', Becuase: 'Because',
    thier: 'their', Thier: 'Their',
    youre: "you're", Youre: "You're",
    cant: "can't", Cant: "Can't",
    dont: "don't", Dont: "Don't",
    isnt: "isn't", Isnt: "Isn't",
    wasnt: "wasn't", Wasnt: "Wasn't",
    didnt: "didn't", Didnt: "Didn't",
  };

  function autoCorrectAtCursor() {
    if (!autoCorrectToggle.checked) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const node = range.startContainer;
    if (node.nodeType !== 3) return;
    const text = node.nodeValue;
    const offset = range.startOffset;
    if (offset < 2) return;
    const before = text.slice(0, offset);

    // Replace --|space, ...|space, etc.
    let updated = before
      .replace(/(\s|^)--$/, '$1—')
      .replace(/\.\.\.$/, '…');
    if (updated !== before) {
      const newText = updated + text.slice(offset);
      node.nodeValue = newText;
      const newOffset = updated.length;
      range.setStart(node, newOffset);
      range.setEnd(node, newOffset);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    // Smart quotes: if last char typed is " or ', replace by curly equivalent
    const last = text[offset - 1];
    if (last === '"' || last === "'") {
      const prevChar = offset >= 2 ? text[offset - 2] : '';
      const isOpening = !prevChar || /\s|[\(\[\{]/.test(prevChar);
      const replacement = last === '"'
        ? (isOpening ? '“' : '”')
        : (isOpening ? '‘' : '’');
      node.nodeValue = text.slice(0, offset - 1) + replacement + text.slice(offset);
      range.setStart(node, offset);
      range.setEnd(node, offset);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }

  function autoCorrectOnSpace() {
    if (!autoCorrectToggle.checked) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const node = range.startContainer;
    if (node.nodeType !== 3) return;
    const text = node.nodeValue;
    const offset = range.startOffset;
    // Look backwards for word
    const m = text.slice(0, offset).match(/(\S+)\s$/);
    if (!m) return;
    const word = m[1];
    if (TYPOS[word]) {
      const newText = text.slice(0, offset - word.length - 1) + TYPOS[word] + ' ' + text.slice(offset);
      node.nodeValue = newText;
      const newOffset = offset - word.length - 1 + TYPOS[word].length + 1;
      range.setStart(node, newOffset);
      range.setEnd(node, newOffset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  editor.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\n')) {
      autoCorrectOnSpace();
      smartLinkify();
      smartListConvert();
      smartMarkdownInline();
      smartCapitalize();
    } else if (e.inputType === 'insertText') {
      autoCorrectAtCursor();
    }
  });

  // ============================================================
  // IMPROVEMENT: Smart auto-format helpers
  // ============================================================
  function getCaretTextBefore() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    const node = range.startContainer;
    if (node.nodeType !== 3) return null;
    return { node, offset: range.startOffset, text: node.nodeValue };
  }

  function smartLinkify() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, offset, text } = ctx;
    // Look at the word just before the trailing space
    const before = text.slice(0, offset - 1);
    const m = before.match(/(\S+)$/);
    if (!m) return;
    const word = m[1];
    if (!/^https?:\/\/\S+$/i.test(word) && !/^www\.\S+\.\S+$/i.test(word)) return;
    const start = offset - 1 - word.length;
    const url = /^https?:/i.test(word) ? word : 'https://' + word;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset - 1);
    const a = document.createElement('a');
    a.href = url;
    a.textContent = word;
    r.deleteContents();
    r.insertNode(a);
    // Place caret after the inserted link + the trailing space
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r2 = document.createRange();
    if (a.nextSibling) {
      r2.setStart(a.nextSibling, Math.min(1, a.nextSibling.nodeValue.length));
      r2.setEnd(a.nextSibling, Math.min(1, a.nextSibling.nodeValue.length));
    } else {
      r2.setStartAfter(a);
      r2.setEndAfter(a);
    }
    sel.addRange(r2);
  }

  function smartListConvert() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const lineStart = text.lastIndexOf('\n', offset - 2) + 1;
    const line = text.slice(lineStart, offset);
    let cmd = null;
    if (/^[-*]\s$/.test(line)) cmd = 'insertUnorderedList';
    else if (/^\d+\.\s$/.test(line)) cmd = 'insertOrderedList';
    if (!cmd) return;
    // Remove the marker text
    node.nodeValue = text.slice(0, lineStart) + text.slice(offset);
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(node, lineStart);
    r.setEnd(node, lineStart);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand(cmd);
  }

  function smartMarkdownInline() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const before = text.slice(0, offset - 1);

    // Bold: **word**
    const boldMatch = before.match(/\*\*([^*\n]+)\*\*$/);
    if (boldMatch) {
      const start = offset - 1 - boldMatch[0].length;
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset - 1);
      r.deleteContents();
      const b = document.createElement('strong');
      b.textContent = boldMatch[1];
      r.insertNode(b);
      placeCaretAfter(b);
      return;
    }
    // Italic: *word* (not at start of **)
    const italicMatch = before.match(/(?:^|[^*])\*([^*\n]+)\*$/);
    if (italicMatch) {
      const fragLen = italicMatch[1].length + 2; // *word*
      const start = offset - 1 - fragLen;
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset - 1);
      r.deleteContents();
      const em = document.createElement('em');
      em.textContent = italicMatch[1];
      r.insertNode(em);
      placeCaretAfter(em);
      return;
    }
    // Inline code: `word`
    const codeMatch = before.match(/`([^`\n]+)`$/);
    if (codeMatch) {
      const start = offset - 1 - codeMatch[0].length;
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset - 1);
      r.deleteContents();
      const c = document.createElement('code');
      c.textContent = codeMatch[1];
      r.insertNode(c);
      placeCaretAfter(c);
    }
  }

  function placeCaretAfter(el) {
    const sel = window.getSelection();
    const space = document.createTextNode(' ');
    el.parentNode.insertBefore(space, el.nextSibling);
    const r = document.createRange();
    r.setStartAfter(space);
    r.setEndAfter(space);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function smartCapitalize() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    // After "<sentence end> <space>" capitalize next typed letter
    // Easier: scan for "[.!?]\s+([a-z])" and capitalize it (only at the very last sentence position)
    const m = text.slice(0, offset).match(/([.!?]\s+|^)([a-z])([^.!?]*)$/);
    if (!m) return;
    const startOf = offset - (m[2].length + (m[3] ? m[3].length : 0));
    if (text[startOf] !== m[2]) return;
    // Replace just the lower-case letter
    node.nodeValue =
      text.slice(0, startOf) + m[2].toUpperCase() + text.slice(startOf + 1);
  }

  // ============================================================
  // IMPROVEMENT: Move paragraph / line up & down (Alt+↑/↓ ; Alt+Shift+↑/↓)
  // ============================================================
  editor.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest('h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,div');
    if (!block || !block.parentNode || block === editor) return;
    e.preventDefault();
    const sib = e.key === 'ArrowUp' ? block.previousElementSibling : block.nextElementSibling;
    if (!sib) return;
    if (e.key === 'ArrowUp') sib.parentNode.insertBefore(block, sib);
    else block.parentNode.insertBefore(sib, block);
    // Restore caret to the moved block
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: TSV/CSV smart paste → table
  // ============================================================
  editor.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    if (e.defaultPrevented) return;
    const txt = cd.getData('text/plain');
    if (!txt) return;
    // Heuristic: at least 2 lines, every line has the same separator (tab or comma) ≥ 2 occurrences
    const lines = txt.replace(/\r/g, '').split('\n').filter((l) => l.length);
    if (lines.length < 2) return;
    let sep = null;
    if (lines.every((l) => l.includes('\t'))) sep = '\t';
    else if (lines.every((l) => /,/.test(l)) && lines.every((l) => l.split(',').length >= 2)) sep = ',';
    if (!sep) return;
    const cells = lines.map((l) => l.split(sep));
    const cols = Math.max(...cells.map((r) => r.length));
    if (cols < 2) return;
    e.preventDefault();
    let html = '<table class="bordered"><tbody>';
    cells.forEach((row, idx) => {
      const tag = idx === 0 ? 'th' : 'td';
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<' + tag + '>' + escapeHtml(row[c] || '&nbsp;') + '</' + tag + '>';
      }
      html += '</tr>';
    });
    html += '</tbody></table><p><br/></p>';
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: Inline symbol shortcuts (-->, (c), (r), (tm), <-, etc.)
  // ============================================================
  const SYMBOL_SHORTCUTS = [
    [/-->$/, '→'],
    [/<--$/, '←'],
    [/==>$/, '⇒'],
    [/<==$/, '⇐'],
    [/<->$/, '↔'],
    [/\(c\)$/i, '©'],
    [/\(r\)$/i, '®'],
    [/\(tm\)$/i, '™'],
    [/\+\-$/, '±'],
    [/!=$/, '≠'],
    [/<=$/, '≤'],
    [/>=$/, '≥'],
    [/\.\.\.$/, '…'],
  ];

  function applySymbolShortcuts() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const before = text.slice(0, offset - 1);
    for (const [re, sym] of SYMBOL_SHORTCUTS) {
      const m = before.match(re);
      if (m) {
        const start = offset - 1 - m[0].length;
        node.nodeValue = text.slice(0, start) + sym + text.slice(offset - 1);
        const newOffset = start + sym.length + 1; // include the trailing space
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(node, newOffset);
        r.setEnd(node, newOffset);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
    }
  }

  // Hook into the existing input listener
  editor.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\n')) {
      applySymbolShortcuts();
    }
  });

  // Auto-pair brackets/quotes when text is selected
  editor.addEventListener('keydown', (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '<': '>' };
    const close = pairs[e.key];
    if (!close) return;
    e.preventDefault();
    const range = sel.getRangeAt(0);
    const text = range.toString();
    range.deleteContents();
    const replacement = e.key + text + close;
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    // re-select the inner text
    const r = document.createRange();
    r.setStart(node, 1);
    r.setEnd(node, 1 + text.length);
    sel.removeAllRanges();
    sel.addRange(r);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Share link (URL hash with base64-encoded doc)
  // ============================================================
  function buildShareLink() {
    const data = {
      v: 1, t: docTitle.value,
      h: editor.innerHTML,
    };
    const json = JSON.stringify(data);
    let b64;
    try {
      b64 = btoa(unescape(encodeURIComponent(json)));
    } catch {
      b64 = btoa(json);
    }
    const url = location.origin + location.pathname + '#d=' + b64;
    return url;
  }

  function decodeShareLink() {
    const m = (location.hash || '').match(/^#d=(.*)$/);
    if (!m) return null;
    try {
      const json = decodeURIComponent(escape(atob(m[1])));
      return JSON.parse(json);
    } catch {
      try { return JSON.parse(atob(m[1])); } catch { return null; }
    }
  }

  function renderShareView() {
    backstageTitle.textContent = 'Share link';
    const url = buildShareLink();
    const max = 1900;
    const tooLong = url.length > max;
    backstageContent.innerHTML =
      '<p>Anyone with this link will be able to open a copy of this document in their browser.</p>' +
      '<label style="display:flex;flex-direction:column;gap:6px"><span style="color:#666;font-size:12px">Share URL</span>' +
      '<textarea id="shareUrl" rows="4" readonly></textarea></label>' +
      (tooLong
        ? '<p style="color:#b71c1c">⚠ This document is large (' +
          url.length.toLocaleString() + ' characters). The link may not work in all browsers ' +
          '(URL length limits). Consider using <b>Save (.rwd)</b> instead.</p>'
        : '<p class="muted">URL length: ' + url.length.toLocaleString() + ' characters.</p>') +
      '<button class="btn primary" id="copyShareBtn">Copy link</button>';
    const ta = $('#shareUrl');
    ta.value = url;
    $('#copyShareBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        flashStatus('Link copied');
      } catch {
        ta.select();
        document.execCommand('copy');
      }
    });
  }

  // Auto-load shared doc from URL on first load
  (function loadShared() {
    const data = decodeShareLink();
    if (!data) return;
    setTimeout(() => {
      if (confirm('A document was shared via this link. Open it? (Your current document will be replaced; a snapshot is taken first.)')) {
        try { snapshot(); } catch {}
        editor.innerHTML = sanitizeImported(data.h || '');
        if (data.t) docTitle.value = data.t;
        history.replaceState(null, '', location.pathname);
        queueAutosave();
        rebuildOutline();
      }
    }, 100);
  })();

  // ============================================================
  // FEATURE: Lorem ipsum generator
  // ============================================================
  const LOREM_LONG = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
  const LOREM_SHORT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

  $('#loremBtn').addEventListener('click', () => {
    saveSelection();
    openModal($('#loremModal'));
  });
  $('#loremInsertBtn').addEventListener('click', () => {
    const n = Math.max(1, Math.min(50, parseInt($('#loremCount').value, 10) || 3));
    const short = $('#loremShort').checked;
    const para = short ? LOREM_SHORT : LOREM_LONG;
    const html = Array.from({ length: n }, () => '<p>' + para + '</p>').join('');
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    closeModal($('#loremModal'));
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Reading mode (read-only)
  // ============================================================
  const readingExitBtn = $('#readingExitBtn');
  function enterReadingMode() {
    document.body.classList.add('reading-mode');
    editor.contentEditable = 'false';
    readingExitBtn.hidden = false;
    buildReadingTOC();
  }
  function exitReadingMode() {
    document.body.classList.remove('reading-mode');
    editor.contentEditable = 'true';
    readingExitBtn.hidden = true;
    const toc = document.querySelector('.reading-toc');
    if (toc) toc.remove();
  }

  function buildReadingTOC() {
    const headings = editor.querySelectorAll('h1, h2, h3');
    if (!headings.length) return;
    const old = document.querySelector('.reading-toc');
    if (old) old.remove();
    const toc = document.createElement('div');
    toc.className = 'reading-toc';
    toc.innerHTML = '<h4>Contents</h4><ol></ol>';
    const ol = toc.querySelector('ol');
    headings.forEach((h, i) => {
      if (!h.id) h.id = 'rwd-h-' + i;
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);
      li.textContent = h.textContent || '(empty)';
      li.addEventListener('click', () => {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      ol.appendChild(li);
    });
    document.body.appendChild(toc);
  }
  $('#readingModeBtn').addEventListener('click', enterReadingMode);
  readingExitBtn.addEventListener('click', exitReadingMode);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('reading-mode')) {
      exitReadingMode();
    }
  });

  // ============================================================
  // FEATURE: Threaded comments with @-mentions and resolve
  // ============================================================
  const STORE_THREADS = 'rodmanword:threads';
  const commentModal = $('#commentModal');
  const commentModalTitle = $('#commentModalTitle');
  const commentResolved = $('#commentResolved');
  const commentRepliesEl = $('#commentReplies');
  const deleteCommentBtn = $('#deleteCommentBtn');
  let pendingCommentRange = null;
  let editingCommentSpan = null;
  let editingThreadId = null;
  let threads = {};
  try { threads = JSON.parse(localStorage.getItem(STORE_THREADS) || '{}'); } catch {}

  function persistThreads() {
    try { localStorage.setItem(STORE_THREADS, JSON.stringify(threads)); } catch {}
  }

  function newThreadId() {
    return 'th-' + Date.now().toString(36) + '-' +
      Math.floor(Math.random() * 1e6).toString(36);
  }

  function currentAuthor() {
    return (docProps && docProps.author && docProps.author.trim()) || 'You';
  }

  function migrateLegacyComments() {
    // Convert any old-style <span class="rwd-comment" data-comment="text">
    // into the new threaded form. Each old comment becomes a single reply.
    let migrated = 0;
    editor.querySelectorAll('.rwd-comment').forEach((span) => {
      if (span.dataset.threadId) return;
      const id = newThreadId();
      span.dataset.threadId = id;
      const text = span.dataset.comment || span.title || '';
      threads[id] = {
        resolved: false,
        replies: text ? [{
          author: currentAuthor(),
          at: new Date().toISOString(),
          text,
        }] : [],
      };
      delete span.dataset.comment;
      span.title = text;
      migrated++;
    });
    if (migrated) persistThreads();
  }

  function escapeReplyHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function renderMentionsInText(s) {
    return escapeReplyHtml(s).replace(
      /(^|\s)@([\w][\w.-]{0,48})/g,
      (m, p, name) => p + '<span class="mention">@' + name + '</span>'
    );
  }

  function renderThread(id) {
    const t = threads[id] || { replies: [] };
    commentRepliesEl.innerHTML = '';
    if (!t.replies.length) {
      commentRepliesEl.innerHTML =
        '<p class="muted" style="font-style:italic">No replies yet — add the first one below.</p>';
      return;
    }
    t.replies.forEach((r, idx) => {
      const card = document.createElement('div');
      card.className = 'comment-reply';
      const dt = new Date(r.at);
      card.innerHTML =
        '<div class="meta"><span><b>' + escapeReplyHtml(r.author || 'Anonymous') +
        '</b> · ' + escapeReplyHtml(dt.toLocaleString()) + '</span>' +
        '<button class="delete-btn" data-idx="' + idx + '">Delete</button></div>' +
        '<div class="body">' + renderMentionsInText(r.text || '') + '</div>';
      card.querySelector('.delete-btn').addEventListener('click', () => {
        t.replies.splice(idx, 1);
        persistThreads();
        renderThread(id);
        rebuildCommentsPane();
        queueAutosave();
      });
      commentRepliesEl.appendChild(card);
    });
  }

  function openCommentModalForNew() {
    editingCommentSpan = null;
    editingThreadId = null;
    commentModalTitle.textContent = 'Add comment';
    deleteCommentBtn.hidden = true;
    commentResolved.checked = false;
    $('#commentSelectionPreview').textContent =
      '“' + pendingCommentRange.toString().slice(0, 80) +
      (pendingCommentRange.toString().length > 80 ? '…' : '') + '”';
    commentRepliesEl.innerHTML = '';
    $('#commentText').value = '';
    $('#saveCommentBtn').textContent = 'Add comment';
    openModal(commentModal);
    setTimeout(() => $('#commentText').focus(), 50);
  }

  function openCommentModalForEdit(span) {
    editingCommentSpan = span;
    pendingCommentRange = null;
    let id = span.dataset.threadId;
    if (!id) {
      // Legacy single-comment span; migrate now
      id = newThreadId();
      span.dataset.threadId = id;
      const text = span.dataset.comment || span.title || '';
      threads[id] = {
        resolved: false,
        replies: text ? [{
          author: currentAuthor(),
          at: new Date().toISOString(),
          text,
        }] : [],
      };
      delete span.dataset.comment;
      persistThreads();
    }
    editingThreadId = id;
    commentModalTitle.textContent = 'Comment thread';
    deleteCommentBtn.hidden = false;
    commentResolved.checked = !!(threads[id] && threads[id].resolved);
    $('#commentSelectionPreview').textContent =
      '“' + span.textContent.slice(0, 80) +
      (span.textContent.length > 80 ? '…' : '') + '”';
    renderThread(id);
    $('#commentText').value = '';
    $('#saveCommentBtn').textContent = 'Add reply';
    openModal(commentModal);
    setTimeout(() => $('#commentText').focus(), 50);
  }

  $('#commentBtn').addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
      flashStatus('Select text first');
      return;
    }
    pendingCommentRange = sel.getRangeAt(0).cloneRange();
    openCommentModalForNew();
  });

  $('#saveCommentBtn').addEventListener('click', () => {
    const text = $('#commentText').value.trim();
    // Reply to existing thread
    if (editingThreadId && editingCommentSpan) {
      if (text) {
        threads[editingThreadId].replies.push({
          author: currentAuthor(),
          at: new Date().toISOString(),
          text,
        });
        const last = text.split('\n').slice(-1)[0];
        editingCommentSpan.title = last.slice(0, 200);
        persistThreads();
        renderThread(editingThreadId);
        $('#commentText').value = '';
        rebuildCommentsPane();
        queueAutosave();
      }
      return;
    }
    // New thread
    if (!text || !pendingCommentRange) {
      closeModal(commentModal);
      return;
    }
    const id = newThreadId();
    threads[id] = {
      resolved: false,
      replies: [{
        author: currentAuthor(),
        at: new Date().toISOString(),
        text,
      }],
    };
    persistThreads();
    const span = document.createElement('span');
    span.className = 'rwd-comment';
    span.dataset.threadId = id;
    span.title = text;
    try {
      span.appendChild(pendingCommentRange.extractContents());
      pendingCommentRange.insertNode(span);
    } catch {}
    pendingCommentRange = null;
    closeModal(commentModal);
    rebuildCommentsPane();
    queueAutosave();
  });

  commentResolved.addEventListener('change', () => {
    if (!editingThreadId) return;
    threads[editingThreadId].resolved = commentResolved.checked;
    if (editingCommentSpan) {
      editingCommentSpan.classList.toggle('resolved', commentResolved.checked);
    }
    persistThreads();
    rebuildCommentsPane();
    queueAutosave();
  });

  deleteCommentBtn.addEventListener('click', () => {
    if (!editingCommentSpan) return;
    const span = editingCommentSpan;
    const id = span.dataset.threadId;
    if (id) { delete threads[id]; persistThreads(); }
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    editingCommentSpan = null;
    editingThreadId = null;
    closeModal(commentModal);
    rebuildCommentsPane();
    queueAutosave();
  });

  // Click a comment to view/edit its thread
  editor.addEventListener('click', (e) => {
    const span = e.target.closest && e.target.closest('.rwd-comment');
    if (!span) return;
    e.preventDefault();
    openCommentModalForEdit(span);
  });

  // Re-apply .resolved class to comment spans on load
  function applyResolvedClasses() {
    editor.querySelectorAll('.rwd-comment').forEach((span) => {
      const id = span.dataset.threadId;
      if (id && threads[id] && threads[id].resolved) {
        span.classList.add('resolved');
      } else {
        span.classList.remove('resolved');
      }
    });
  }

  // ============================================================
  // FEATURE: Comments side panel
  // ============================================================
  const commentsPane = $('#commentsPane');
  const commentsPaneToggle = $('#commentsPaneToggle');
  const commentsList = $('#commentsList');
  const commentsCount = $('#commentsCount');
  const showResolvedComments = $('#showResolvedComments');

  function rebuildCommentsPane() {
    if (!commentsPane || commentsPane.hidden) return;
    const spans = Array.from(editor.querySelectorAll('.rwd-comment'));
    const showResolved = showResolvedComments && showResolvedComments.checked;
    commentsList.innerHTML = '';
    let visible = 0, total = 0;
    spans.forEach((span) => {
      const id = span.dataset.threadId;
      if (!id || !threads[id]) return;
      total++;
      const t = threads[id];
      if (t.resolved && !showResolved) return;
      visible++;
      const li = document.createElement('li');
      if (t.resolved) li.classList.add('resolved');
      const last = t.replies[t.replies.length - 1];
      const lastText = last ? last.text : '(empty)';
      const sel = span.textContent.trim().slice(0, 60);
      li.innerHTML =
        '<div class="selection-preview">“' + escapeReplyHtml(sel) +
        (span.textContent.length > 60 ? '…' : '') + '”</div>' +
        '<div class="last-reply"><b>' + escapeReplyHtml(last ? last.author : '—') +
        ':</b> ' + renderMentionsInText(lastText) +
        '<span class="reply-count">' + t.replies.length + '</span></div>';
      li.addEventListener('click', () => {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => openCommentModalForEdit(span), 200);
      });
      commentsList.appendChild(li);
    });
    if (!visible) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = total
        ? 'All ' + total + ' comments resolved.'
        : 'No comments yet.';
      commentsList.appendChild(li);
    }
    commentsCount.textContent = visible + ' of ' + total;
  }

  if (commentsPaneToggle) {
    commentsPaneToggle.addEventListener('change', () => {
      commentsPane.hidden = !commentsPaneToggle.checked;
      if (commentsPaneToggle.checked) rebuildCommentsPane();
    });
  }
  $('#commentsCloseBtn')?.addEventListener('click', () => {
    commentsPane.hidden = true;
    if (commentsPaneToggle) commentsPaneToggle.checked = false;
  });
  showResolvedComments?.addEventListener('change', rebuildCommentsPane);

  // Migrate legacy comments and apply resolved styling on init
  setTimeout(() => {
    migrateLegacyComments();
    applyResolvedClasses();
    rebuildCommentsPane();
  }, 50);
  // Re-render the panel whenever the editor changes
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdCmtT);
    window.__rwdCmtT = setTimeout(rebuildCommentsPane, 400);
  });

  // ============================================================
  // FEATURE: Quick parts (saved snippets)
  // ============================================================
  const STORE_SNIPPETS = 'rodmanword:snippets';
  const quickPartsModal = $('#quickPartsModal');

  function getSnippets() {
    try { return JSON.parse(localStorage.getItem(STORE_SNIPPETS) || '[]'); } catch { return []; }
  }
  function setSnippets(list) {
    try { localStorage.setItem(STORE_SNIPPETS, JSON.stringify(list)); } catch {}
  }

  function renderSnippets() {
    const list = getSnippets();
    const ul = $('#snippetList');
    ul.innerHTML = '';
    if (!list.length) {
      ul.innerHTML = '<li class="empty">No snippets yet — select some text and save it.</li>';
      return;
    }
    list.forEach((snip, i) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(snip.name) + '</span>' +
        '<span class="actions">' +
          '<button data-act="insert">Insert</button>' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="insert"]').addEventListener('click', () => {
        restoreSelection();
        document.execCommand('insertHTML', false, snip.html);
        closeModal(quickPartsModal);
        queueAutosave();
      });
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        const next = getSnippets();
        next.splice(i, 1);
        setSnippets(next);
        renderSnippets();
      });
      ul.appendChild(li);
    });
  }

  $('#quickPartsBtn').addEventListener('click', () => {
    saveSelection();
    renderSnippets();
    openModal(quickPartsModal);
  });

  $('#saveSnippetBtn').addEventListener('click', () => {
    const name = ($('#snippetName').value || '').trim();
    if (!name) { alert('Give the snippet a name first.'); return; }
    const sel = window.getSelection();
    let html;
    if (savedRange && !savedRange.collapsed) {
      const div = document.createElement('div');
      div.appendChild(savedRange.cloneContents());
      html = div.innerHTML;
    } else if (sel && !sel.isCollapsed) {
      const div = document.createElement('div');
      div.appendChild(sel.getRangeAt(0).cloneContents());
      html = div.innerHTML;
    }
    if (!html) {
      alert('Select some text in the document first, then open Quick parts and click Save.');
      return;
    }
    const list = getSnippets();
    list.push({ name, html, at: new Date().toISOString() });
    setSnippets(list);
    $('#snippetName').value = '';
    renderSnippets();
    flashStatus('Snippet saved');
  });

  // ============================================================
  // FEATURE: Change case
  // ============================================================
  const changeCaseSelect = $('#changeCase');
  changeCaseSelect.addEventListener('change', () => {
    const mode = changeCaseSelect.value;
    changeCaseSelect.value = '';
    if (!mode) return;
    restoreSelection();
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    if (!text) {
      alert('Select some text first.');
      return;
    }
    let next;
    switch (mode) {
      case 'upper': next = text.toUpperCase(); break;
      case 'lower': next = text.toLowerCase(); break;
      case 'title':
        next = text.toLowerCase().replace(
          /\b([a-zà-ÿ])/g, (m) => m.toUpperCase()
        );
        break;
      case 'sentence':
        next = text.toLowerCase().replace(
          /(^|[.!?]\s+)([a-zà-ÿ])/g,
          (_, p, c) => p + c.toUpperCase()
        );
        break;
      case 'toggle':
        next = text.split('').map((c) =>
          c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()
        ).join('');
        break;
      default: next = text;
    }
    document.execCommand('insertText', false, next);
    queueAutosave();
  });

  function renderTemplates() {
    backstageTitle.textContent = 'New';
    backstageContent.innerHTML =
      '<p>Pick a template to get started, or choose Blank.</p>' +
      '<div class="template-grid"></div>';
    const grid = backstageContent.querySelector('.template-grid');
    TEMPLATES.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="thumb">
          <b>${escapeHtml(t.name)}</b>
          <div class="bar"></div>
          <div class="bar short"></div>
          <div class="bar"></div>
          <div class="bar short"></div>
          <div class="bar"></div>
        </div>
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="desc">${escapeHtml(t.desc)}</div>
      `;
      card.addEventListener('click', () => {
        if (editor.innerText.trim() &&
            !confirm('Replace the current document with the ' + t.name + ' template?')) return;
        editor.innerHTML = t.html;
        docTitle.value = t.name === 'Blank' ? 'Document' : t.name;
        queueAutosave();
        rebuildOutline();
        closeBackstage();
      });
      grid.appendChild(card);
    });
  }

})();
