// Shared two-finger pan + pinch-zoom helper for the suite's canvas
// apps (Vision, Image, Slides). Single-finger touches pass through
// untouched so existing drag / paint / select logic keeps working.
//
// Usage from a classic-script app:
//   const detach = window.RodmanGestures.attachPanZoom(scrollEl, {
//     onPinch: (ratio, centerXY) => { state.zoom *= ratio; render(); },
//   });
// Call detach() to remove listeners.

const PINCH_THRESHOLD_DEFAULT = 0.05;   // report once cumulative ratio crosses 1±this
const PAN_THRESHOLD_PX = 2;             // ignore micro-jitter

export function attachPanZoom(scrollEl, opts = {}) {
  if (!scrollEl) throw new Error('attachPanZoom: scrollEl is required');
  const onPinch = typeof opts.onPinch === 'function' ? opts.onPinch : null;
  const onPan = typeof opts.onPan === 'function' ? opts.onPan : null;
  const pinchThreshold = opts.pinchThreshold ?? PINCH_THRESHOLD_DEFAULT;

  // Active 2-finger gesture state.
  let active = null;   // { lastMid: {x,y}, baseDist, lastReportedDist, scrollLeft0, scrollTop0 }

  function touchPos(t) {
    // Use clientX/Y; we translate to scrollEl-local coords below.
    const r = scrollEl.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e) {
    if (e.touches.length >= 2) {
      const a = touchPos(e.touches[0]);
      const b = touchPos(e.touches[1]);
      active = {
        lastMid: midpoint(a, b),
        baseDist: distance(a, b),
        lastReportedDist: distance(a, b),
        scrollLeft0: scrollEl.scrollLeft,
        scrollTop0: scrollEl.scrollTop,
      };
      e.preventDefault();
    } else {
      // Single finger — let the app's own handlers run.
      active = null;
    }
  }

  function onTouchMove(e) {
    if (e.touches.length < 2) {
      // Lost the second finger mid-gesture; cancel.
      active = null;
      return;
    }
    if (!active) {
      // Started with one finger, second arrived; initialize now.
      const a = touchPos(e.touches[0]);
      const b = touchPos(e.touches[1]);
      active = {
        lastMid: midpoint(a, b),
        baseDist: distance(a, b),
        lastReportedDist: distance(a, b),
        scrollLeft0: scrollEl.scrollLeft,
        scrollTop0: scrollEl.scrollTop,
      };
    }
    e.preventDefault();

    const a = touchPos(e.touches[0]);
    const b = touchPos(e.touches[1]);
    const mid = midpoint(a, b);
    const dist = distance(a, b);

    // Pan: midpoint movement → scroll delta (inverted so finger drag
    // pulls content with the fingers).
    const dx = mid.x - active.lastMid.x;
    const dy = mid.y - active.lastMid.y;
    if (Math.abs(dx) >= PAN_THRESHOLD_PX || Math.abs(dy) >= PAN_THRESHOLD_PX) {
      const newLeft = scrollEl.scrollLeft - dx;
      const newTop = scrollEl.scrollTop - dy;
      scrollEl.scrollLeft = newLeft;
      scrollEl.scrollTop = newTop;
      if (onPan) onPan({ dx: -dx, dy: -dy, mid });
      active.lastMid = mid;
    }

    // Pinch: report ratio against the last reported distance so the
    // app can integrate small changes smoothly.
    const ratio = dist / active.lastReportedDist;
    if (onPinch && Math.abs(ratio - 1) >= pinchThreshold) {
      onPinch(ratio, mid);
      active.lastReportedDist = dist;
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length < 2) active = null;
  }

  // Trackpad pinch on macOS / Ctrl+wheel on Win/Linux is the de-facto
  // standard for "user wants to zoom". Convert wheel deltaY into a
  // pinch ratio centered on the cursor position.
  function onWheel(e) {
    if (!e.ctrlKey || !onPinch) return;
    e.preventDefault();
    const r = scrollEl.getBoundingClientRect();
    const center = { x: e.clientX - r.left, y: e.clientY - r.top };
    // Negative deltaY = zoom in; positive = zoom out. Map to ~5% per
    // wheel tick.
    const ratio = e.deltaY < 0 ? 1.05 : 1 / 1.05;
    onPinch(ratio, center);
  }

  scrollEl.addEventListener('touchstart', onTouchStart, { passive: false });
  scrollEl.addEventListener('touchmove', onTouchMove, { passive: false });
  scrollEl.addEventListener('touchend', onTouchEnd, { passive: true });
  scrollEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
  scrollEl.addEventListener('wheel', onWheel, { passive: false });

  return function detach() {
    scrollEl.removeEventListener('touchstart', onTouchStart);
    scrollEl.removeEventListener('touchmove', onTouchMove);
    scrollEl.removeEventListener('touchend', onTouchEnd);
    scrollEl.removeEventListener('touchcancel', onTouchEnd);
    scrollEl.removeEventListener('wheel', onWheel);
  };
}
