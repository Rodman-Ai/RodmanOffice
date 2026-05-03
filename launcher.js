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

  // Keyboard shortcut: 1-6 jumps to the corresponding app tile.
  document.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const idx = Number(e.key) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx > 5) return;
    const tiles = grid.querySelectorAll('.tile');
    const tile = tiles[idx];
    if (!tile || tile.classList.contains('is-disabled')) return;
    e.preventDefault();
    tile.click();
  });
})();
