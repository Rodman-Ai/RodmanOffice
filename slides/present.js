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
      <button class="pc-btn" data-act="presenter" title="Open presenter view (notes + next + timer)" aria-label="Presenter view">👁</button>
      <button class="pc-btn" data-act="exit" aria-label="Exit">✕</button>
    `;
    overlay.appendChild(controls);

    // BroadcastChannel for the presenter-view popup.
    let presenterChannel = null;
    let presenterWindow = null;
    function ensurePresenterChannel() {
      if (presenterChannel) return presenterChannel;
      presenterChannel = new BroadcastChannel('rodmanslides-present');
      presenterChannel.addEventListener('message', (ev) => {
        const msg = ev.data;
        if (msg.type === 'request-sync') {
          presenterChannel.postMessage({ type: 'sync', deck, idx });
        } else if (msg.type === 'go') {
          go(msg.delta);
        } else if (msg.type === 'goto-idx') {
          idx = Math.max(0, Math.min(msg.idx, deck.slides.length - 1));
          showSlide(idx, 'none');
        }
      });
      return presenterChannel;
    }
    function broadcastSync() {
      if (presenterChannel) presenterChannel.postMessage({ type: 'sync', deck, idx });
    }
    function openPresenterView() {
      ensurePresenterChannel();
      presenterWindow = window.open('./presenter.html', 'rodman-presenter',
        'width=1280,height=720,toolbar=no,menubar=no,location=no');
      // Wait a beat then push initial state (presenter requests on its own too).
      setTimeout(broadcastSync, 400);
    }

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

      // ----- Per-element animations -----
      // Elements with `el.animation = { kind, trigger, durationMs }`:
      //   - trigger 'onEnter' fires immediately when the slide is shown
      //   - trigger 'onClick' fires once per click on the slide (in
      //     authoring order)
      // Element nodes are hidden until their animation runs (so a
      // click-triggered element doesn't "pop in" before the click).
      const onClickQueue = [];
      slide.elements.forEach((el) => {
        if (!el.animation || el.animation.kind === 'none') return;
        const node = stage.querySelector(`[data-element-id="${el.id}"]`);
        if (!node) return;
        const a = el.animation;
        if (a.trigger === 'onClick') {
          node.style.opacity = '0';
          onClickQueue.push({ node, anim: a });
        } else {
          requestAnimationFrame(() => playAnim(node, a));
        }
      });

      stage.addEventListener('click', (ev) => {
        // Hyperlink takes priority over animation queue
        const linkNode = ev.target.closest('.slide-element');
        if (linkNode) {
          const el = slide.elements.find((e) => e.id === linkNode.dataset.elementId);
          if (el && el.href) {
            ev.preventDefault();
            window.open(el.href, '_blank', 'noopener');
            return;
          }
        }
        // Otherwise, advance the click-triggered animation queue.
        const next = onClickQueue.shift();
        if (next) {
          next.node.style.opacity = '';
          playAnim(next.node, next.anim);
        }
      });

      function playAnim(node, a) {
        const dur = (a.durationMs || 500) + 'ms';
        node.style.animation = `${a.kind} ${dur} cubic-bezier(0.16, 1, 0.3, 1) both`;
      }

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
      broadcastSync();
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
      if (presenterChannel) { try { presenterChannel.close(); } catch (e) {} presenterChannel = null; }
      if (presenterWindow && !presenterWindow.closed) { try { presenterWindow.close(); } catch (e) {} }
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
      else if (act === 'presenter') openPresenterView();
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
