// RodmanSlides — present mode (fullscreen + transitions + keyboard nav).
// Single global: window.RodmanPresent.
(function () {
  'use strict';

  const TRANSITION_KINDS = ['none', 'fade', 'push', 'wipe', 'zoom'];

  function start({ deck, startIndex = 0, onExit }) {
    const overlay = document.createElement('div');
    overlay.className = 'present-overlay';
    overlay.tabIndex = -1;
    document.body.appendChild(overlay);

    const stageWrap = document.createElement('div');
    stageWrap.className = 'present-stage-wrap';
    overlay.appendChild(stageWrap);

    const controls = document.createElement('div');
    controls.className = 'present-controls';
    controls.innerHTML = `
      <button class="pc-btn" data-act="prev" aria-label="Previous">‹</button>
      <span class="pc-counter"></span>
      <button class="pc-btn" data-act="next" aria-label="Next">›</button>
      <button class="pc-btn" data-act="exit" aria-label="Exit">✕</button>
    `;
    overlay.appendChild(controls);

    let idx = Math.max(0, Math.min(startIndex, deck.slides.length - 1));
    let prevStage = null;

    function applyTheme() {
      window.RodmanThemes.applyToStage(overlay, deck.theme);
    }

    function showSlide(targetIdx, transitionKind) {
      const slide = deck.slides[targetIdx];
      if (!slide) return;

      const stage = document.createElement('div');
      stage.className = 'present-stage';
      stage.dataset.transition = transitionKind || 'none';
      stageWrap.appendChild(stage);

      window.RodmanRender.renderSlide(stage, slide, { editable: false });

      if (prevStage) {
        // Animate transition; remove prev after animation completes
        stage.classList.add('enter');
        prevStage.classList.add('leave');
        const oldStage = prevStage;
        oldStage.addEventListener('animationend', () => {
          oldStage.remove();
        }, { once: true });
        // Fallback: if animation doesn't fire, clean up after 600ms
        setTimeout(() => oldStage.remove(), 700);
        requestAnimationFrame(() => {
          stage.classList.remove('enter');
          stage.classList.add('entering');
        });
      }

      prevStage = stage;
      controls.querySelector('.pc-counter').textContent =
        `${targetIdx + 1} / ${deck.slides.length}`;
    }

    function go(delta) {
      const ni = idx + delta;
      if (ni < 0 || ni >= deck.slides.length) return;
      const target = deck.slides[ni];
      const tk = target.transition?.kind || 'none';
      idx = ni;
      showSlide(idx, tk);
    }

    function exit() {
      window.removeEventListener('keydown', onKey);
      controls.removeEventListener('click', onCtrlClick);
      overlay.removeEventListener('click', onOverlayClick);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      overlay.remove();
      onExit && onExit();
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); exit(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') {
        e.preventDefault(); go(1); return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') {
        e.preventDefault(); go(-1); return;
      }
      if (e.key === 'Home') { e.preventDefault(); idx = 0; showSlide(0, 'none'); return; }
      if (e.key === 'End') { e.preventDefault(); idx = deck.slides.length - 1; showSlide(idx, 'none'); return; }
    }

    function onCtrlClick(e) {
      const btn = e.target.closest('.pc-btn');
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'next') go(1);
      else if (act === 'prev') go(-1);
      else if (act === 'exit') exit();
    }

    function onOverlayClick(e) {
      // Click-anywhere-but-controls advances
      if (e.target.closest('.present-controls')) return;
      go(1);
    }

    applyTheme();
    showSlide(idx, 'none');
    window.addEventListener('keydown', onKey);
    controls.addEventListener('click', onCtrlClick);
    overlay.addEventListener('click', onOverlayClick);

    // Try fullscreen but don't fail if rejected (some browsers require
    // direct user gesture, which we have since this is called from a click).
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(() => {});
    }
    overlay.focus();
  }

  window.RodmanPresent = { start, TRANSITION_KINDS };
})();
