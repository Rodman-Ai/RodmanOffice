// RodmanOffice launcher — keeps the picker tiny and dependency-free.
// Each tile is a real <a href>, so navigation is a normal page load:
// the browser fetches only the picked sub-app.
(function () {
  'use strict';

  const grid = document.getElementById('tileGrid');
  if (!grid) return;

  // Block clicks on disabled tiles without losing the link semantics
  // (so middle-click / "open in new tab" still does something
  // sensible — it'll hit the "Coming soon" stub page).
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    if (tile.classList.contains('is-disabled') && e.button === 0 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
    }
  });

  // Keyboard shortcut: 1-9 open the first nine app tiles, 0 the tenth.
  // Modified presses (Ctrl/Cmd+1 switches browser tabs) are left alone.
  document.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    const tiles = grid.querySelectorAll('.tile');
    const tile = tiles[idx];
    if (!tile || tile.classList.contains('is-disabled')) return;
    e.preventDefault();
    tile.click();
  });
})();
