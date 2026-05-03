/* =========================================================
   Menu bar — dropdown behavior, item population, dispatch
   ========================================================= */
(function () {
  const menubar = document.querySelector('.menubar');
  if (!menubar) return;

  const menus = Array.from(menubar.querySelectorAll('.menu'));

  function closeAll() {
    menus.forEach(m => {
      const trigger = m.querySelector('.menu-trigger');
      const drop = m.querySelector('.menu-dropdown');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (drop) drop.hidden = true;
      m.classList.remove('is-open');
    });
  }

  function toggle(menu) {
    const trigger = menu.querySelector('.menu-trigger');
    const drop = menu.querySelector('.menu-dropdown');
    const open = menu.classList.contains('is-open');
    closeAll();
    if (!open) {
      menu.classList.add('is-open');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      if (drop) drop.hidden = false;
    }
  }

  menus.forEach(menu => {
    const trigger = menu.querySelector('.menu-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle(menu);
      });
      trigger.addEventListener('mouseenter', () => {
        const anyOpen = menus.some(m => m.classList.contains('is-open'));
        if (anyOpen && !menu.classList.contains('is-open')) toggle(menu);
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (!menubar.contains(e.target)) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  menubar.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    setTimeout(closeAll, 0);
  });

  // ---- Dispatch helpers ----
  function clickButton(id) {
    const btn = document.getElementById(id);
    if (btn) btn.click();
  }
  function shiftClickButton(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }));
  }
  function rp(name, ...args) {
    const fn = window.RP && window.RP[name];
    if (typeof fn === 'function') fn(...args);
  }

  function showAbout() {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const ok = document.getElementById('modal-ok');
    const cancel = document.getElementById('modal-cancel');
    if (!modal || !title || !body || !ok || !cancel) return;
    title.textContent = 'About';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;min-width:280px">
        <div style="font-size:18px;font-weight:bold">Rodman Image Editor</div>
        <div>A browser-based image editor with a Photoshop-style workspace.</div>
        <div>Bonus: nine pixel-perfect retro modes — MS Paint 95, Mario Paint,
          Kid Pix, MacPaint, Tux Paint, Paint Shop Pro, Procreate, Aseprite,
          and GIMP — all reachable from the <b>Bonus</b> menu.</div>
        <div style="opacity:0.7;font-size:11px;margin-top:4px">
          Part of RodmanOffice. No build step. Vanilla JS + HTML5 Canvas.
        </div>
      </div>`;
    ok.textContent = 'OK';
    cancel.style.display = 'none';
    modal.hidden = false;
    const close = () => {
      modal.hidden = true;
      ok.removeEventListener('click', close);
      cancel.style.display = '';
    };
    ok.addEventListener('click', close);
  }

  // ---- Menu item declarations ----
  // Each item: { label, shortcut?, run, sep? }. A `sep: true` entry renders
  // as a horizontal divider.
  const SEP = { sep: true };
  const MENUS = {
    file: [
      { label: 'New Canvas…',  shortcut: '',          run: () => clickButton('btn-new') },
      { label: 'Open…',        shortcut: 'Ctrl+O',    run: () => clickButton('btn-open') },
      SEP,
      { label: 'Save PNG',     shortcut: 'Ctrl+S',    run: () => clickButton('btn-save') },
      { label: 'Save HD…',     shortcut: 'Shift+Ctrl+S', run: () => shiftClickButton('btn-save') },
      SEP,
      { label: 'Clear Canvas',                        run: () => clickButton('btn-clear') },
      { label: 'Reset All Settings',                  run: () => shiftClickButton('btn-clear') }
    ],
    edit: [
      { label: 'Undo',         shortcut: 'Ctrl+Z',         run: () => clickButton('btn-undo') },
      { label: 'Redo',         shortcut: 'Shift+Ctrl+Z',   run: () => clickButton('btn-redo') },
      SEP,
      { label: 'Keyboard Shortcuts…',                       run: () => rp('shortcutsModal') },
      { label: 'History…',                                  run: () => rp('openHistoryPanel') },
      { label: 'Snapshots…',                                run: () => rp('openSnapshots') },
      { label: 'Save Snapshot',                             run: () => rp('saveSnapshotState') }
    ],
    image: [
      { label: 'Image Size / Canvas Size…',                 run: () => clickButton('btn-new') },
      SEP,
      { label: 'Adjustments — Levels…',                     run: () => rp('openLevels') },
      { label: 'Adjustments — HSL…',                        run: () => rp('openHSL') },
      { label: 'Adjustments — Color Balance…',              run: () => rp('openColorBalance') },
      { label: 'Adjustments — Threshold…',                  run: () => rp('openThreshold') },
      SEP,
      { label: 'Replay Last Drawing',                       run: () => clickButton('btn-replay') }
    ],
    layer: [
      { label: 'New Layer',                                 run: () => rp('newLayer') },
      { label: 'Duplicate Layer',                           run: () => rp('dupLayer') },
      { label: 'Merge Down',                                run: () => rp('mergeDown') },
      SEP,
      { label: 'Delete Layer',                              run: () => rp('delLayer') }
    ],
    select: [
      // Selection ops are tied to the current tool/marquee state. For now,
      // expose the marquee tool via toolbar.
      { label: 'Use the Marquee tool to start a selection.',
        disabled: true, run: () => {} }
    ],
    filter: [
      { label: 'Filter Gallery…',   shortcut: '',           run: () => clickButton('btn-filter') },
      SEP,
      { label: 'Invert',                                    run: () => rp('applyFilter', 'invert') },
      { label: 'Grayscale',                                 run: () => rp('applyFilter', 'grayscale') },
      { label: 'Sepia',                                     run: () => rp('applyFilter', 'sepia') },
      { label: 'Posterize',                                 run: () => rp('applyFilter', 'posterize') },
      { label: 'Blur',                                      run: () => rp('applyFilter', 'blur') },
      { label: 'Brighten',                                  run: () => rp('applyFilter', 'brighten') },
      { label: 'Darken',                                    run: () => rp('applyFilter', 'darken') }
    ],
    view: [
      { label: 'Zoom In',          shortcut: '+',           run: () => clickButton('btn-zoom-in') },
      { label: 'Zoom Out',         shortcut: '−',           run: () => clickButton('btn-zoom-out') },
      { label: 'Reset Zoom',       shortcut: '0',           run: () => clickButton('btn-zoom-reset') },
      SEP,
      { label: 'Toggle Pixel Grid', shortcut: 'G',          run: () => clickButton('btn-grid') },
      { label: 'Toggle Mirror / Symmetry', shortcut: 'Y',   run: () => clickButton('btn-symmetry') },
      { label: 'Cycle Background Pattern', shortcut: 'V',   run: () => rp('nextBgPattern') }
    ],
    window: [
      { label: 'History Panel…',                            run: () => rp('openHistoryPanel') },
      { label: 'Snapshots…',                                run: () => rp('openSnapshots') },
      SEP,
      { label: 'Mute / Unmute Sound', shortcut: 'M',        run: () => clickButton('btn-mute') }
    ]
  };

  // ---- Populate dropdowns from MENUS ----
  Object.keys(MENUS).forEach((key) => {
    const menu = menubar.querySelector(`.menu[data-menu="${key}"]`);
    if (!menu) return;
    const drop = menu.querySelector('.menu-dropdown');
    if (!drop) return;
    drop.innerHTML = '';
    MENUS[key].forEach((item) => {
      if (item.sep) {
        const hr = document.createElement('div');
        hr.className = 'menu-sep';
        drop.appendChild(hr);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-item';
      btn.setAttribute('role', 'menuitem');
      if (item.disabled) btn.disabled = true;
      const main = document.createElement('span');
      main.className = 'menu-item-label';
      main.textContent = item.label;
      btn.appendChild(main);
      if (item.shortcut) {
        const sc = document.createElement('span');
        sc.className = 'menu-item-shortcut';
        sc.textContent = item.shortcut;
        btn.appendChild(sc);
      }
      btn.addEventListener('click', () => {
        try { item.run(); } catch (e) { /* ignore */ }
      });
      drop.appendChild(btn);
    });
  });

  // ---- Help / About items (kept HTML-defined) ----
  menubar.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const kind = action.dataset.action;
    if (kind === 'help') clickButton('btn-help');
    else if (kind === 'about') showAbout();
  });
})();
