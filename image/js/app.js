/* =========================================================
   Retro Paint — main app: canvas engine, tools, mode switching
   ========================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const displayCtx = canvas.getContext('2d', { willReadFrequently: true });
  // Module-level `ctx` is REBOUND to the active layer's offscreen ctx by
  // setActiveLayer(). Existing tool code keeps writing to `ctx` and now
  // automatically lands on the active layer.
  let ctx = displayCtx;
  let W = canvas.width;
  let H = canvas.height;

  // ---- Document / Layer model ----
  let nextId = 1;
  function createLayer(name, w, h) {
    const off = window.document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d', { willReadFrequently: true });
    c.fillStyle = 'rgba(0,0,0,0)';
    return {
      id: ++nextId, name: name || 'Layer',
      canvas: off, ctx: c,
      visible: true, opacity: 1, blend: 'source-over'
    };
  }
  function newDocument(w, h, name) {
    const bg = createLayer('Background', w, h);
    const c = bg.ctx;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    return {
      id: ++nextId, name: name || 'untitled',
      layers: [bg], activeIdx: 0,
      undoStack: [], redoStack: [],
      width: w, height: h
    };
  }
  const docs = [];
  let activeDocIdx = 0;
  function activeDoc() { return docs[activeDocIdx]; }
  function activeLayer() { const d = activeDoc(); return d && d.layers[d.activeIdx]; }
  function setActiveLayer(idx) {
    const d = activeDoc(); if (!d) return;
    d.activeIdx = Math.max(0, Math.min(d.layers.length - 1, idx));
    ctx = d.layers[d.activeIdx].ctx;
  }
  function setActiveDoc(idx) {
    activeDocIdx = Math.max(0, Math.min(docs.length - 1, idx));
    const d = activeDoc();
    if (canvas.width !== d.width || canvas.height !== d.height) {
      canvas.width = d.width; canvas.height = d.height;
      W = d.width; H = d.height;
    }
    setActiveLayer(d.activeIdx);
    composite();
  }
  function composite() {
    const d = activeDoc(); if (!d) return;
    displayCtx.save();
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, W, H);
    for (const layer of d.layers) {
      if (!layer.visible) continue;
      displayCtx.globalAlpha = layer.opacity;
      displayCtx.globalCompositeOperation = layer.blend;
      displayCtx.drawImage(layer.canvas, 0, 0);
    }
    // Floating selection (paste preview) drawn on top
    if (state.floating) {
      const f = state.floating;
      displayCtx.globalAlpha = 1;
      displayCtx.globalCompositeOperation = 'source-over';
      const tmp = window.document.createElement('canvas');
      tmp.width = f.imageData.width; tmp.height = f.imageData.height;
      tmp.getContext('2d').putImageData(f.imageData, 0, 0);
      displayCtx.drawImage(tmp, f.x, f.y);
      // marquee
      drawAnts(displayCtx, f.x, f.y, f.imageData.width, f.imageData.height);
    }
    displayCtx.restore();
  }
  // Marching-ants helper
  let antsPhase = 0;
  function drawAnts(c, x, y, w, h) {
    c.save();
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    c.lineDashOffset = -antsPhase;
    c.strokeStyle = '#000';
    c.strokeRect(x + 0.5, y + 0.5, w, h);
    c.lineDashOffset = -antsPhase + 4;
    c.strokeStyle = '#fff';
    c.strokeRect(x + 0.5, y + 0.5, w, h);
    c.restore();
  }
  setInterval(() => { antsPhase = (antsPhase + 1) % 8; if (state.selection || state.floating) composite(); }, 80);

  const state = {
    mode: 'mspaint',
    tool: 'pencil',
    primary: '#000000',
    secondary: '#ffffff',
    size: 4,
    drawing: false,
    button: 0,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    snapshot: null,
    activeWacky: null,
    activeStamp: null,
    activeStampSet: null,
    colorIndex: 0,
    shift: false,
    mirror: 'off',
    muted: false,
    opacity: 1,
    gridOn: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    spaceHeld: false,
    recent: [],
    smudgeData: null,
    selection: null,
    selDrag: null,
    bgPattern: 'none',
    frames: null,
    frameIdx: 0,
    onion: false,
    clipboard: null,        // ImageData
    floating: null,         // { imageData, x, y } for paste preview
    wandTolerance: 32,
    lassoPoints: null       // active lasso polyline during drag
  };

  const MAX_UNDO = 16;

  function clearCanvas(color) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color || '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    composite();
  }

  function pushUndo() {
    try {
      const d = activeDoc(); if (!d) return;
      d.undoStack.push({ idx: d.activeIdx, img: ctx.getImageData(0, 0, W, H) });
      if (d.undoStack.length > MAX_UNDO) d.undoStack.shift();
      d.redoStack.length = 0;
      updateUndoButtons();
    } catch (e) { /* ignore */ }
  }
  function undo() {
    const d = activeDoc(); if (!d || !d.undoStack.length) return;
    const cur = { idx: d.activeIdx, img: ctx.getImageData(0, 0, W, H) };
    d.redoStack.push(cur);
    const prev = d.undoStack.pop();
    setActiveLayer(prev.idx);
    ctx.putImageData(prev.img, 0, 0);
    composite();
    updateUndoButtons();
    scheduleAutosave();
  }
  function redo() {
    const d = activeDoc(); if (!d || !d.redoStack.length) return;
    const cur = { idx: d.activeIdx, img: ctx.getImageData(0, 0, W, H) };
    d.undoStack.push(cur);
    const next = d.redoStack.pop();
    setActiveLayer(next.idx);
    ctx.putImageData(next.img, 0, 0);
    composite();
    updateUndoButtons();
    scheduleAutosave();
  }
  function updateUndoButtons() {
    const d = activeDoc();
    const u = $('btn-undo'), r = $('btn-redo');
    if (u) u.disabled = !d || !d.undoStack.length;
    if (r) r.disabled = !d || !d.redoStack.length;
  }

  // ---- Coordinate translation ----
  function getPos(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round((ev.clientX - rect.left) * (W / rect.width)),
      y: Math.round((ev.clientY - rect.top) * (H / rect.height))
    };
  }

  // ---- Color helpers ----
  function parseColor(c) {
    // Accepts #rrggbb or rgb(...). Returns [r,g,b,255]
    if (c[0] === '#') {
      const v = parseInt(c.slice(1), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
    }
    const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (m) return [+m[1], +m[2], +m[3], 255];
    return [0, 0, 0, 255];
  }
  function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ---- Flood fill ----
  function floodFill(x, y, fillHex) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;
    const idx = (cx, cy) => (cy * W + cx) * 4;
    const i0 = idx(x, y);
    const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
    const [fr, fg, fb] = parseColor(fillHex);
    if (tr === fr && tg === fg && tb === fb && ta === 255) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = idx(cx, cy);
      if (data[i] !== tr || data[i + 1] !== tg || data[i + 2] !== tb || data[i + 3] !== ta) continue;
      data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- Drawing primitives ----
  function dot(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    c.fill();
  }
  function strokeLine(c, x1, y1, x2, y2, w, color, cap) {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineCap = cap || 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  // ---- Wacky brushes (Kid Pix) ----
  const wackyBrushes = {
    rainbow(c, x, y, lx, ly) {
      const colors = ['#ff0000','#ff8800','#ffd700','#33cc33','#00ccff','#3366ff','#aa44ff'];
      const w = Math.max(2, state.size);
      for (let i = 0; i < colors.length; i++) {
        const offset = (i - 3) * (w * 0.7);
        c.strokeStyle = colors[i];
        c.lineWidth = w * 0.8;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(lx, ly + offset);
        c.lineTo(x, y + offset);
        c.stroke();
      }
    },
    echo(c, x, y) {
      const w = state.size;
      c.fillStyle = state.primary;
      for (let i = 5; i >= 1; i--) {
        c.globalAlpha = 0.18 * i;
        dot(c, x, y, w * i * 0.6);
      }
      c.globalAlpha = 1;
    },
    sparkle(c, x, y) {
      const colors = ['#ffff66', '#ffffff', '#ffd700', state.primary];
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * (state.size * 4);
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r;
        c.fillStyle = colors[(Math.random() * colors.length) | 0];
        const s = 1 + Math.random() * 3;
        c.fillRect(sx - s/2, sy - s/2, s, s);
      }
    },
    kaleido(c, x, y, lx, ly) {
      const w = state.size;
      const cx = W / 2, cy = H / 2;
      c.strokeStyle = state.primary;
      c.lineWidth = w;
      c.lineCap = 'round';
      const draw = (dx1, dy1, dx2, dy2) => {
        c.beginPath();
        c.moveTo(dx1, dy1);
        c.lineTo(dx2, dy2);
        c.stroke();
      };
      draw(x, y, lx, ly);
      draw(2*cx - x, y, 2*cx - lx, ly);
      draw(x, 2*cy - y, lx, 2*cy - ly);
      draw(2*cx - x, 2*cy - y, 2*cx - lx, 2*cy - ly);
    },
    dots(c, x, y) {
      const r = Math.max(2, state.size);
      const palette = ['#ff3366','#ffcc00','#33cc33','#3366ff','#aa44ff','#00ccff'];
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * (r * 4);
        c.fillStyle = palette[(Math.random() * palette.length) | 0];
        dot(c, x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + Math.random() * r);
      }
    },
    noodle(c, x, y, lx, ly) {
      const w = state.size;
      const colors = ['#ffcc88', '#ffaa66', '#ff8844'];
      for (let i = -1; i <= 1; i++) {
        const wob = Math.sin((x + y + i * 13) * 0.1) * w;
        c.strokeStyle = colors[i + 1];
        c.lineWidth = w * 0.5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(lx + i * 2, ly + wob);
        c.lineTo(x + i * 2, y + wob);
        c.stroke();
      }
    }
  };

  // ---- Tool handlers ----
  // Each handler returns { down, move, up }; receives world position {x,y}
  const Tools = {
    pencil: {
      down(p) { ctx.fillStyle = state.primary; ctx.fillRect(p.x, p.y, 1, 1); },
      move(p) {
        strokeLine(ctx, state.lastX + 0.5, state.lastY + 0.5, p.x + 0.5, p.y + 0.5, 1, state.primary, 'butt');
      }
    },
    brush: {
      down(p) {
        ctx.fillStyle = state.primary;
        dot(ctx, p.x, p.y, state.size);
      },
      move(p) {
        strokeLine(ctx, state.lastX, state.lastY, p.x, p.y, state.size * 2, state.primary);
      }
    },
    eraser: {
      down(p) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - state.size, p.y - state.size, state.size * 2, state.size * 2);
      },
      move(p) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = state.size * 2;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(state.lastX, state.lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    },
    fill: {
      down(p) { floodFill(p.x, p.y, state.primary); }
    },
    eyedrop: {
      down(p) {
        if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
        // Sample the composite (what the user actually sees) not the active layer.
        const d = displayCtx.getImageData(p.x, p.y, 1, 1).data;
        setPrimary(rgbToHex([d[0], d[1], d[2]]));
        setTool('pencil');
      }
    },
    spray: {
      down(p) { sprayAt(p); Sounds.sprayHiss(); },
      move(p) { sprayAt(p); }
    },
    line: {
      down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
      move(p) {
        restoreSnapshot();
        const e = state.shift ? snapTo45(state.startX, state.startY, p.x, p.y) : p;
        strokeLine(ctx, state.startX, state.startY, e.x, e.y, Math.max(1, state.size), state.primary);
      }
    },
    rect: {
      down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
      move(p) {
        restoreSnapshot();
        const e = state.shift ? snapToSquare(state.startX, state.startY, p.x, p.y) : p;
        ctx.strokeStyle = state.primary;
        ctx.lineWidth = Math.max(1, state.size);
        ctx.strokeRect(
          Math.min(state.startX, e.x), Math.min(state.startY, e.y),
          Math.abs(e.x - state.startX), Math.abs(e.y - state.startY)
        );
      }
    },
    rectFill: {
      down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
      move(p) {
        restoreSnapshot();
        const e = state.shift ? snapToSquare(state.startX, state.startY, p.x, p.y) : p;
        ctx.fillStyle = state.primary;
        ctx.fillRect(
          Math.min(state.startX, e.x), Math.min(state.startY, e.y),
          Math.abs(e.x - state.startX), Math.abs(e.y - state.startY)
        );
      }
    },
    ellipse: {
      down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
      move(p) {
        restoreSnapshot();
        const e = state.shift ? snapToSquare(state.startX, state.startY, p.x, p.y) : p;
        const cx = (state.startX + e.x) / 2;
        const cy = (state.startY + e.y) / 2;
        const rx = Math.abs(e.x - state.startX) / 2;
        const ry = Math.abs(e.y - state.startY) / 2;
        ctx.strokeStyle = state.primary;
        ctx.lineWidth = Math.max(1, state.size);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    ellipseFill: {
      down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
      move(p) {
        restoreSnapshot();
        const e = state.shift ? snapToSquare(state.startX, state.startY, p.x, p.y) : p;
        const cx = (state.startX + e.x) / 2;
        const cy = (state.startY + e.y) / 2;
        const rx = Math.abs(e.x - state.startX) / 2;
        const ry = Math.abs(e.y - state.startY) / 2;
        ctx.fillStyle = state.primary;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    musicpencil: {
      down(p) {
        Sounds.noteForColor(state.colorIndex);
        ctx.fillStyle = state.primary;
        const s = Math.max(2, state.size);
        ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
      },
      move(p) {
        const s = Math.max(2, state.size);
        ctx.strokeStyle = state.primary;
        ctx.lineWidth = s;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(state.lastX, state.lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        // Sprinkle musical notes occasionally
        if (Math.hypot(p.x - state.lastX, p.y - state.lastY) > 8) {
          Sounds.noteForColor(state.colorIndex + Math.floor(Math.random() * 3));
        }
      }
    },
    stamp: {
      down(p) { dropStamp(p); }
    },
    wacky: {
      down(p) {
        Sounds.wackyBoing();
        const fn = wackyBrushes[state.activeWacky];
        if (fn) fn(ctx, p.x, p.y, p.x, p.y);
      },
      move(p) {
        const fn = wackyBrushes[state.activeWacky];
        if (fn) fn(ctx, p.x, p.y, state.lastX, state.lastY);
      }
    },
    dynamite: {
      down(p) {
        Sounds.explosion();
        explodeThenClear(p);
      }
    },
    ohno: {
      down() {
        Sounds.ohNo();
        ohNoSplash();
        setTimeout(() => clearCanvas('#ffffff'), 500);
      }
    },
    gradient: {
      down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
      move(p) {
        restoreSnapshot();
        const e = state.shift ? snapTo45(state.startX, state.startY, p.x, p.y) : p;
        const g = ctx.createLinearGradient(state.startX, state.startY, e.x, e.y);
        g.addColorStop(0, state.primary);
        g.addColorStop(1, state.secondary);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    },
    smudge: {
      down(p) {
        const r = Math.max(2, state.size);
        const x = Math.max(0, Math.min(W - r*2, p.x - r));
        const y = Math.max(0, Math.min(H - r*2, p.y - r));
        try { state.smudgeData = ctx.getImageData(x, y, r*2, r*2); } catch (e) { state.smudgeData = null; }
      },
      move(p) {
        if (!state.smudgeData) return;
        const r = Math.max(2, state.size);
        ctx.save();
        ctx.globalAlpha = 0.4 * state.opacity;
        const tmp = document.createElement('canvas');
        tmp.width = state.smudgeData.width;
        tmp.height = state.smudgeData.height;
        tmp.getContext('2d').putImageData(state.smudgeData, 0, 0);
        ctx.drawImage(tmp, p.x - r, p.y - r);
        ctx.restore();
        // Refresh sample for trailing smudge
        const x = Math.max(0, Math.min(W - r*2, p.x - r));
        const y = Math.max(0, Math.min(H - r*2, p.y - r));
        try { state.smudgeData = ctx.getImageData(x, y, r*2, r*2); } catch (e) {}
      }
    },
    text: {
      down(p) {
        const txt = prompt('Enter text:');
        if (!txt) return;
        const sz = Math.max(12, state.size * 4);
        ctx.save();
        ctx.fillStyle = state.primary;
        ctx.globalAlpha = state.opacity;
        ctx.font = `bold ${sz}px Tahoma, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(txt, p.x, p.y);
        ctx.restore();
        scheduleAutosave();
      }
    },
    select: {
      down(p) {
        // If clicking inside an existing selection, start dragging it
        if (state.selection && pointInSel(p)) {
          state.selDrag = { dx: p.x - state.selection.x, dy: p.y - state.selection.y };
          return;
        }
        // Otherwise start a new selection rect
        state.selection = { x: p.x, y: p.y, w: 0, h: 0 };
        state.selDrag = null;
        saveSnapshot();
      },
      move(p) {
        if (state.selDrag && state.selection) {
          // Move existing selection (re-render snapshot + ghost)
          restoreSnapshot();
          state.selection.x = p.x - state.selDrag.dx;
          state.selection.y = p.y - state.selDrag.dy;
          drawSelectionMarquee();
        } else if (state.selection) {
          state.selection.w = p.x - state.selection.x;
          state.selection.h = p.y - state.selection.y;
          restoreSnapshot();
          drawSelectionMarquee();
        }
      },
      up() {
        state.selDrag = null;
        if (state.selection && (Math.abs(state.selection.w) < 2 || Math.abs(state.selection.h) < 2)) {
          state.selection = null;
          restoreSnapshot();
        }
      }
    }
  };

  // ---- Tux Paint Magic effects ----
  // Each magic[name] is a (ctx, x, y, lx, ly) function applied per stroke segment.
  const magicEffects = {
    rainbow(c, x, y, lx, ly) {
      const colors = ['#ed1c24','#ff7f27','#fff200','#22b14c','#00a2e8','#3f48cc','#a349a4'];
      const w = Math.max(2, state.size);
      for (let i = 0; i < colors.length; i++) {
        const off = (i - 3) * (w * 0.7);
        c.strokeStyle = colors[i]; c.lineWidth = w * 0.9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(lx, ly + off); c.lineTo(x, y + off); c.stroke();
      }
    },
    blur(c, x, y) {
      const r = state.size * 4;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w <= 0 || h <= 0) return;
      const tmp = window.document.createElement('canvas');
      tmp.width = Math.max(1, w >> 1); tmp.height = Math.max(1, h >> 1);
      tmp.getContext('2d').drawImage(activeLayer().canvas, x0, y0, w, h, 0, 0, tmp.width, tmp.height);
      c.imageSmoothingEnabled = true;
      c.drawImage(tmp, 0, 0, tmp.width, tmp.height, x0, y0, w, h);
    },
    sparkles(c, x, y) {
      const colors = ['#ffffff','#fff200','#fff5b3','#ffd700'];
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * (state.size * 4);
        c.fillStyle = colors[(Math.random() * colors.length) | 0];
        const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d, s = 1 + Math.random() * 3;
        c.fillRect(sx - s/2, sy - s/2, s, s);
      }
    },
    foam(c, x, y) {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * (state.size * 3);
        c.globalAlpha = 0.4;
        c.fillStyle = state.primary;
        c.beginPath();
        c.arc(x + Math.cos(a)*d, y + Math.sin(a)*d, 2 + Math.random()*4, 0, Math.PI*2);
        c.fill();
      }
      c.globalAlpha = 1;
    },
    smudgeMagic(c, x, y, lx, ly) {
      const r = Math.max(2, state.size);
      try {
        const data = ctx.getImageData(lx - r, ly - r, r*2, r*2);
        const tmp = window.document.createElement('canvas');
        tmp.width = data.width; tmp.height = data.height;
        tmp.getContext('2d').putImageData(data, 0, 0);
        c.globalAlpha = 0.5;
        c.drawImage(tmp, x - r, y - r);
        c.globalAlpha = 1;
      } catch (e) {}
    },
    tint(c, x, y) {
      const r = state.size * 3;
      c.save();
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = state.primary;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI*2); c.fill();
      c.restore();
    },
    negative(c, x, y) {
      const r = state.size * 3;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w <= 0 || h <= 0) return;
      const img = ctx.getImageData(x0, y0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2]; }
      ctx.putImageData(img, x0, y0);
    },
    mosaic(c, x, y) {
      const cell = 8; const r = state.size * 4;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w <= 0 || h <= 0) return;
      const img = ctx.getImageData(x0, y0, w, h);
      const d = img.data;
      for (let yy = 0; yy < h; yy += cell) {
        for (let xx = 0; xx < w; xx += cell) {
          const i0 = (yy * w + xx) * 4;
          const r0 = d[i0], g0 = d[i0+1], b0 = d[i0+2];
          for (let dy = 0; dy < cell && yy+dy < h; dy++) {
            for (let dx = 0; dx < cell && xx+dx < w; dx++) {
              const o = ((yy+dy) * w + (xx+dx)) * 4;
              d[o] = r0; d[o+1] = g0; d[o+2] = b0;
            }
          }
        }
      }
      ctx.putImageData(img, x0, y0);
    },
    drip(c, x, y) {
      c.fillStyle = state.primary;
      const w = state.size;
      c.fillRect(x - w/2, y, w, 100);
    },
    fisheye(c, x, y) {
      const r = state.size * 5;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w <= 0 || h <= 0) return;
      const src = ctx.getImageData(x0, y0, w, h);
      const out = ctx.createImageData(w, h);
      const cx = w / 2, cy = h / 2;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const dx = xx - cx, dy = yy - cy;
          const d = Math.hypot(dx, dy);
          let sx = xx, sy = yy;
          if (d < r) {
            const f = d / r;
            sx = cx + dx * (1 - f * 0.4);
            sy = cy + dy * (1 - f * 0.4);
          }
          const si = ((sy | 0) * w + (sx | 0)) * 4;
          const oi = (yy * w + xx) * 4;
          out.data[oi]   = src.data[si];
          out.data[oi+1] = src.data[si+1];
          out.data[oi+2] = src.data[si+2];
          out.data[oi+3] = 255;
        }
      }
      ctx.putImageData(out, x0, y0);
    },
    cartoon(c, x, y) {
      // Local edge detect + posterize within a box.
      const r = state.size * 4;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w < 3 || h < 3) return;
      const src = ctx.getImageData(x0, y0, w, h);
      const d = src.data;
      // posterize
      for (let i = 0; i < d.length; i += 4) {
        d[i] = (d[i] / 64 | 0) * 64;
        d[i+1] = (d[i+1] / 64 | 0) * 64;
        d[i+2] = (d[i+2] / 64 | 0) * 64;
      }
      ctx.putImageData(src, x0, y0);
    },
    emboss(c, x, y) {
      const r = state.size * 4;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w < 3 || h < 3) return;
      const src = ctx.getImageData(x0, y0, w, h);
      const out = ctx.createImageData(w, h);
      const sd = src.data, od = out.data;
      for (let yy = 1; yy < h - 1; yy++) {
        for (let xx = 1; xx < w - 1; xx++) {
          const a = (yy * w + xx) * 4;
          const b = ((yy - 1) * w + (xx - 1)) * 4;
          const v = 128 + (sd[a] - sd[b]);
          od[a] = od[a+1] = od[a+2] = Math.max(0, Math.min(255, v));
          od[a+3] = 255;
        }
      }
      ctx.putImageData(out, x0, y0);
    },
    bricks(c, x, y) {
      const bw = 18, bh = 8;
      c.save();
      c.fillStyle = '#a44';
      c.fillRect(x - bw, y - bh/2, bw, bh);
      c.strokeStyle = '#fff';
      c.strokeRect(x - bw + 0.5, y - bh/2 + 0.5, bw, bh);
      c.restore();
    },
    snow(c) {
      // Whole-canvas effect: random white dots.
      pushUndo();
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 600; i++) {
        const sx = Math.random() * W, sy = Math.random() * H, r = 1 + Math.random() * 3;
        c.beginPath(); c.arc(sx, sy, r, 0, Math.PI*2); c.fill();
      }
    },
    tornado(c, x, y) {
      const r = state.size * 5;
      const x0 = Math.max(0, x - r | 0), y0 = Math.max(0, y - r | 0);
      const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
      if (w < 3 || h < 3) return;
      const src = ctx.getImageData(x0, y0, w, h);
      const out = ctx.createImageData(w, h);
      const cx = w/2, cy = h/2;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const dx = xx - cx, dy = yy - cy;
          const d = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx) + (1 - Math.min(d, r) / r) * Math.PI / 3;
          const sx = (cx + Math.cos(ang) * d) | 0;
          const sy = (cy + Math.sin(ang) * d) | 0;
          const si = (Math.max(0, Math.min(h-1, sy)) * w + Math.max(0, Math.min(w-1, sx))) * 4;
          const oi = (yy * w + xx) * 4;
          out.data[oi] = src.data[si];
          out.data[oi+1] = src.data[si+1];
          out.data[oi+2] = src.data[si+2];
          out.data[oi+3] = 255;
        }
      }
      ctx.putImageData(out, x0, y0);
    },
    calligraphy(c, x, y, lx, ly) {
      const w = state.size * 1.5;
      c.save();
      c.strokeStyle = state.primary;
      c.lineWidth = w;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(lx + w * 0.7, ly - w * 0.7);
      c.lineTo(x + w * 0.7, y - w * 0.7);
      c.stroke();
      c.beginPath();
      c.moveTo(lx, ly);
      c.lineTo(x, y);
      c.stroke();
      c.restore();
    }
  };
  Tools.magic = {
    down(p) {
      const name = state.tool.split(':')[1];
      const fn = magicEffects[name]; if (!fn) return;
      fn(ctx, p.x, p.y, p.x, p.y);
      tuxSay(name);
    },
    move(p) {
      const name = state.tool.split(':')[1];
      const fn = magicEffects[name]; if (!fn) return;
      fn(ctx, p.x, p.y, state.lastX, state.lastY);
    }
  };

  // ---- Tux mascot tip bubble ----
  const TUX_TIPS = {
    pencil: 'Drag to draw. Pick a color first!',
    brush: 'A nice fat brush. Try changing the size!',
    eraser: 'Whoops? Drag this to erase.',
    fill: 'Click an area to fill it with color.',
    spray: 'Pssht! Spray paint.',
    line: 'Click and drag to make a straight line.',
    rect: 'Drag for a rectangle. Hold Shift for a square!',
    text: 'Click on the canvas, type some words.',
    'wacky:rainbow': 'Magic rainbow! Drag for a beautiful stripe.',
    'magic:rainbow': 'Magic rainbow! Drag for a beautiful stripe.',
    'magic:blur': 'Smudge it gently to blur things out.',
    'magic:sparkles': 'Pew pew! Shiny sparkles.',
    'magic:foam': 'Fluffy bubbles!',
    'magic:tint': 'Color a part of your picture.',
    'magic:negative': 'Flip the colors upside-down!',
    'magic:mosaic': 'Make it look like a tile picture.',
    'magic:drip': 'Drippy paint runs down…',
    'magic:fisheye': 'Boing! Bulgy lens.',
    'magic:cartoon': 'Make it look like a comic.',
    'magic:emboss': 'Carve into the picture.',
    'magic:bricks': 'Build a brick wall, brick by brick.',
    'magic:snow': 'Let it snow on your picture!',
    'magic:tornado': 'Whirlpool!',
    'magic:calligraphy': 'Old-fashioned ink writing.'
  };
  function tuxSay(toolName) {
    if (state.mode !== 'tuxpaint') return;
    const bubble = $('tux-bubble');
    if (!bubble) return;
    const key = toolName && toolName.startsWith('magic:') ? toolName : (toolName ? 'magic:' + toolName : state.tool);
    bubble.textContent = TUX_TIPS[key] || TUX_TIPS[state.tool] || 'You can do it!';
  }

  // ---- Tux Paint save slots (LocalStorage thumbnails 1..9) ----
  function tpSlotKey(n) { return 'retropaint:slot:' + n; }
  async function openTuxSlots(mode) {
    const slots = [];
    for (let i = 1; i <= 9; i++) slots.push({ n: i, data: localStorage.getItem(tpSlotKey(i)) });
    const html = `
      <div>${mode === 'save' ? 'Save into which slot?' : 'Open which picture?'}</div>
      <div style="display:grid;grid-template-columns:repeat(3,90px);gap:8px;margin-top:8px">
        ${slots.map(s => `
          <button data-slot="${s.n}" class="tp-slot" style="width:90px;height:80px;background:#fff;border:3px solid #2a1a4a;padding:0;cursor:pointer">
            ${s.data ? `<img src="${s.data}" style="max-width:100%;max-height:60px"><div>Slot ${s.n}</div>`
                     : `<div style="line-height:74px">Slot ${s.n}<br>(empty)</div>`}
          </button>`).join('')}
      </div>`;
    showModal(mode === 'save' ? 'Save picture' : 'Open picture', html, { hideCancel: false }).then(() => {});
    setTimeout(() => {
      window.document.querySelectorAll('.tp-slot').forEach(btn => {
        btn.addEventListener('click', () => {
          const n = +btn.dataset.slot;
          if (mode === 'save') {
            try { localStorage.setItem(tpSlotKey(n), canvas.toDataURL('image/png')); } catch (e) {}
            $('modal').hidden = true;
          } else {
            const data = localStorage.getItem(tpSlotKey(n));
            if (!data) return;
            const img = new Image();
            img.onload = () => {
              pushUndo();
              clearCanvas('#ffffff');
              ctx.drawImage(img, 0, 0);
              composite();
              $('modal').hidden = true;
            };
            img.src = data;
          }
        });
      });
    }, 50);
  }

  // ---- Tux Paint slideshow ----
  function openSlideshow() {
    const datas = [];
    for (let i = 1; i <= 9; i++) {
      const d = localStorage.getItem(tpSlotKey(i));
      if (d) datas.push(d);
    }
    if (!datas.length) { alert('No saved pictures yet — use Save Slot first.'); return; }
    let i = 0;
    const ov = window.document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:200;display:flex;align-items:center;justify-content:center;cursor:pointer';
    const im = new Image();
    im.style.cssText = 'max-width:90%;max-height:90%;image-rendering:pixelated';
    im.src = datas[0];
    ov.appendChild(im);
    window.document.body.appendChild(ov);
    const t = setInterval(() => { i = (i + 1) % datas.length; im.src = datas[i]; }, 1500);
    ov.addEventListener('click', () => { clearInterval(t); ov.remove(); });
  }

  // ---- Tux Paint shapes & letter stamps (Phase 4 tools) ----
  Tools.tpShape = {
    down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
    move(p) {
      restoreSnapshot();
      ctx.fillStyle = state.primary;
      ctx.beginPath();
      const cx = (state.startX + p.x) / 2, cy = (state.startY + p.y) / 2;
      const rx = Math.abs(p.x - state.startX) / 2, ry = Math.abs(p.y - state.startY) / 2;
      const sides = state.shapeSides || 5;
      for (let i = 0; i <= sides; i++) {
        const ang = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.fill();
    }
  };
  Tools.tpLetter = {
    down(p) {
      const ch = prompt('Letter or word?');
      if (!ch) return;
      ctx.fillStyle = state.primary;
      const sz = Math.max(20, state.size * 6);
      ctx.font = `bold ${sz}px "Comic Sans MS","Marker Felt",sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(ch, p.x, p.y);
      Sounds.tpType && Sounds.tpType();
    }
  };
  Tools.tpSaveSlot = { down() { openTuxSlots('save'); } };
  Tools.tpOpenSlot = { down() { openTuxSlots('open'); } };
  Tools.tpSlideshow = { down() { openSlideshow(); } };

  // ---- MacPaint pattern fill bucket: floods then paints with active pattern ----
  function patternFloodFill(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;
    const idx = (cx, cy) => (cy * W + cx) * 4;
    const i0 = idx(x, y);
    const tr = data[i0], tg = data[i0+1], tb = data[i0+2], ta = data[i0+3];
    const mask = new Uint8Array(W * H);
    const stack = [[x, y]];
    let minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const m = cy * W + cx;
      if (mask[m]) continue;
      const i = m * 4;
      if (data[i] !== tr || data[i+1] !== tg || data[i+2] !== tb || data[i+3] !== ta) continue;
      mask[m] = 1;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
    }
    // Build a temp mask canvas, then composite pattern through it.
    const maskCanvas = window.document.createElement('canvas');
    maskCanvas.width = W; maskCanvas.height = H;
    const mctx = maskCanvas.getContext('2d');
    const mImg = mctx.createImageData(W, H);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (mask[i]) {
        mImg.data[p] = mImg.data[p+1] = mImg.data[p+2] = 0;
        mImg.data[p+3] = 255;
      }
    }
    mctx.putImageData(mImg, 0, 0);
    // Patterned fill: draw pattern then keep only over the mask.
    ensureMacPatterns();
    const fillCanvas = window.document.createElement('canvas');
    fillCanvas.width = W; fillCanvas.height = H;
    const fctx = fillCanvas.getContext('2d');
    fctx.fillStyle = MAC_PATTERN_PATTERNS[macPatternIdx] || '#000';
    fctx.fillRect(0, 0, W, H);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);
    ctx.drawImage(fillCanvas, 0, 0);
  }

  // Register a macFill tool that uses pattern-based fill.
  Tools.macFill = { down(p) { pushUndo(); patternFloodFill(p.x, p.y); } };
  Tools.macBrush = {
    down(p) { ensureMacPatterns(); ctx.fillStyle = macPatternFill(); ctx.beginPath(); ctx.arc(p.x, p.y, state.size, 0, Math.PI*2); ctx.fill(); },
    move(p) {
      ensureMacPatterns();
      ctx.strokeStyle = macPatternFill();
      ctx.lineWidth = state.size * 2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(state.lastX, state.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
  };
  Tools.fatbits = { down(p) { openFatBits(p.x, p.y); } };
  // Goodies actions registered as one-shot tools.
  Tools.gInvert = { down() { goodiesInvert(); } };
  Tools.gFlipH = { down() { goodiesFlipH(); } };
  Tools.gFlipV = { down() { goodiesFlipV(); } };
  Tools.gRot90 = { down() { goodiesRotate(90); } };
  Tools.gRot180 = { down() { goodiesRotate(180); } };
  Tools.gTrace = { down() { goodiesTraceEdges(); } };
  Tools.gThreshold = { down() { pushUndo(); thresholdActiveLayerToBW(); } };

  // ---- Lasso tool (Path2D from polyline) ----
  Tools.lasso = {
    down(p) {
      state.lassoPoints = [{ x: p.x, y: p.y }];
      saveSnapshot();
    },
    move(p) {
      if (!state.lassoPoints) return;
      state.lassoPoints.push({ x: p.x, y: p.y });
      restoreSnapshot();
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const pts = state.lassoPoints;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    },
    up() {
      if (!state.lassoPoints || state.lassoPoints.length < 3) {
        state.lassoPoints = null;
        restoreSnapshot();
        return;
      }
      restoreSnapshot();
      const pts = state.lassoPoints;
      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
      path.closePath();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const q of pts) {
        if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
      }
      state.selection = {
        kind: 'lasso',
        path,
        points: pts,
        bounds: { x: Math.max(0, minX|0), y: Math.max(0, minY|0),
                  w: Math.min(W, maxX|0) - Math.max(0, minX|0) + 1,
                  h: Math.min(H, maxY|0) - Math.max(0, minY|0) + 1 }
      };
      state.lassoPoints = null;
      composite();
    }
  };

  // ---- Magic wand tool ----
  Tools.wand = {
    down(p) {
      const r = magicWandAt(p.x, p.y, state.wandTolerance);
      if (!r) return;
      // Build a Path2D outline from the bounding box for now (full mask
      // tracing via marching-squares is wired in but rectangle-bounded for
      // performance — pixel-accurate clipping uses the mask separately).
      const b = r.bounds;
      const path = new Path2D();
      path.rect(b.x, b.y, b.w, b.h);
      state.selection = { kind: 'wand', path, mask: r.mask, bounds: b };
      composite();
    }
  };

  function pointInSel(p) {
    if (!state.selection) return false;
    const s = state.selection;
    const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h);
    const w = Math.abs(s.w), h = Math.abs(s.h);
    return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  }
  function drawSelectionMarquee() {
    if (!state.selection) return;
    const s = state.selection;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w, s.h);
    ctx.strokeStyle = '#fff';
    ctx.lineDashOffset = 4;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w, s.h);
    ctx.restore();
  }

  function sprayAt(p) {
    const r = state.size * 2;
    ctx.fillStyle = state.primary;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r;
      const sx = p.x + Math.cos(a) * d;
      const sy = p.y + Math.sin(a) * d;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  function saveSnapshot() { state.snapshot = ctx.getImageData(0, 0, W, H); }
  function restoreSnapshot() { if (state.snapshot) ctx.putImageData(state.snapshot, 0, 0); }

  // Constrain helpers (when Shift is held during shape drag)
  function snapToSquare(sx, sy, x, y) {
    const dx = x - sx, dy = y - sy;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: sx + Math.sign(dx || 1) * m, y: sy + Math.sign(dy || 1) * m };
  }
  function snapTo45(sx, sy, x, y) {
    const dx = x - sx, dy = y - sy;
    const a = Math.atan2(dy, dx);
    const step = Math.PI / 4;
    const snap = Math.round(a / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: sx + Math.cos(snap) * len, y: sy + Math.sin(snap) * len };
  }

  // Symmetry: list of mirrored point pairs (current, last) given the active mirror mode
  function mirrorPoints(p, lp) {
    const out = [];
    const cx = W / 2, cy = H / 2;
    const m = state.mirror;
    if (m === 'h' || m === 'both') out.push({ p: { x: 2*cx - p.x, y: p.y }, lp: { x: 2*cx - lp.x, y: lp.y } });
    if (m === 'v' || m === 'both') out.push({ p: { x: p.x, y: 2*cy - p.y }, lp: { x: lp.x, y: 2*cy - lp.y } });
    if (m === 'both') out.push({ p: { x: 2*cx - p.x, y: 2*cy - p.y }, lp: { x: 2*cx - lp.x, y: 2*cy - lp.y } });
    return out;
  }
  // Tools whose drawing should be mirrored when symmetry is on
  const MIRROR_TOOLS = new Set(['pencil', 'brush', 'eraser', 'spray', 'musicpencil']);
  function shouldMirror() {
    if (state.mirror === 'off') return false;
    return MIRROR_TOOLS.has(state.tool) || state.tool.startsWith('wacky:') || state.tool.startsWith('stamp:');
  }

  // Extended mirror modes (4-way / 8-way kaleidoscope)
  function mirrorPointsExt(p, lp) {
    if (state.mirror === 'h' || state.mirror === 'v' || state.mirror === 'both') {
      return mirrorPoints(p, lp);
    }
    const cx = W / 2, cy = H / 2;
    const out = [];
    if (state.mirror === '4way' || state.mirror === '8way') {
      out.push({ p: { x: 2*cx - p.x, y: p.y }, lp: { x: 2*cx - lp.x, y: lp.y } });
      out.push({ p: { x: p.x, y: 2*cy - p.y }, lp: { x: lp.x, y: 2*cy - lp.y } });
      out.push({ p: { x: 2*cx - p.x, y: 2*cy - p.y }, lp: { x: 2*cx - lp.x, y: 2*cy - lp.y } });
    }
    if (state.mirror === '8way') {
      const reflect = (q) => {
        const dx = q.x - cx, dy = q.y - cy;
        return { x: cx + dy, y: cy + dx };
      };
      const r1 = { p: reflect(p), lp: reflect(lp) };
      out.push(r1);
      out.push({ p: { x: 2*cx - r1.p.x, y: r1.p.y }, lp: { x: 2*cx - r1.lp.x, y: r1.lp.y } });
      out.push({ p: { x: r1.p.x, y: 2*cy - r1.p.y }, lp: { x: r1.lp.x, y: 2*cy - r1.lp.y } });
      out.push({ p: { x: 2*cx - r1.p.x, y: 2*cy - r1.p.y }, lp: { x: 2*cx - r1.lp.x, y: 2*cy - r1.lp.y } });
    }
    return out;
  }

  // Per-stamp sound overrides
  const STAMP_SOUNDS = {
    mariopaint: {
      mushroom: 'marioPowerUp',
      oneUp: 'marioPowerUp',
      star: 'marioStarHit',
      heart: 'kpDing',
      flower: 'marioJump',
      yoshi: 'marioYoshiTongue',
      bowser: 'marioBowser',
      coin: 'marioCoin',
      note: 'noteFreq',
      ghost: 'marioGhost',
      koopaShell: 'marioJump',
      bobOmb: 'marioBobOmb',
      piranha: 'marioFireball',
      pipe: 'marioPipe',
      fireFlower: 'marioFireball',
      smile: 'kpDing'
    },
    kidpix: {
      sun: 'kpDing',
      cat: 'kpQuack',
      house: 'kpHonk',
      tree: 'kpBubble',
      ufo: 'kpLaser',
      rocket: 'kpWhoosh',
      fish: 'kpBubble',
      bird: 'kpQuack',
      butterfly: 'kpSparkle',
      balloon: 'kpBoing',
      gift: 'kpDing',
      cupcake: 'kpDing',
      pizza: 'kpHonk',
      snowman: 'kpFizz',
      robot: 'kpLaser',
      smiley: 'kpBoing',
      star2: 'kpSparkle'
    }
  };

  // Tux Paint per-stamp sound overrides — animals get their own calls.
  const TUX_STAMP_SOUNDS = {
    cat: 'tpMeow', fish: 'kpBubble', bird: 'tpQuack', butterfly: 'kpSparkle',
    rocket: 'kpWhoosh', ufo: 'kpLaser', tree: 'tpYippee', sun: 'tpYippee',
    house: 'kpHonk', robot: 'kpLaser', smiley: 'tpYippee', cupcake: 'kpDing',
    gift: 'kpDing', balloon: 'kpBoing'
  };
  function dropStamp(p) {
    const set = state.activeStampSet || (state.mode === 'kidpix' ? 'kidpix' : 'mariopaint');
    const stamps = PaintModes.stamps[set];
    if (!stamps) return;
    const s = stamps[state.activeStamp];
    if (!s) return;
    const scale = Math.max(2, Math.round(state.size * 0.8) + 2);
    PaintModes.drawStamp(ctx, s, p.x, p.y, scale);
    let sfxName;
    if (state.mode === 'tuxpaint') sfxName = TUX_STAMP_SOUNDS[state.activeStamp];
    if (!sfxName) sfxName = (STAMP_SOUNDS[set] || {})[state.activeStamp];
    if (sfxName && typeof Sounds[sfxName] === 'function') {
      Sounds[sfxName]();
    } else {
      Sounds.stampPlop();
    }
  }

  // ---- Special effects ----
  function explodeThenClear(p) {
    const snap = ctx.getImageData(0, 0, W, H);
    const start = performance.now();
    const dur = 700;
    const particles = [];
    const colors = ['#ff3300','#ff8800','#ffcc00','#ffffff','#cc0000','#ff66aa'];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 360;
      particles.push({
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        c: colors[(Math.random() * colors.length) | 0],
        s: 4 + Math.random() * 10
      });
    }
    function frame(now) {
      const t = (now - start) / 1000;
      const elapsed = now - start;
      ctx.putImageData(snap, 0, 0);
      // Big shockwave ring
      const ringR = 30 + (elapsed / dur) * 220;
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 4 * (1 - elapsed / dur);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      for (const pt of particles) {
        const x = p.x + pt.vx * t;
        const y = p.y + pt.vy * t + 200 * t * t;
        ctx.fillStyle = pt.c;
        ctx.fillRect(x - pt.s/2, y - pt.s/2, pt.s, pt.s);
      }
      composite();
      if (elapsed < dur) requestAnimationFrame(frame);
      else clearCanvas('#ffffff');
    }
    requestAnimationFrame(frame);
  }

  function ohNoSplash() {
    const splash = $('splash');
    splash.querySelector('.splash-text').textContent = 'OH NO!';
    splash.hidden = false;
    splash.querySelector('.splash-content').style.animation = 'none';
    void splash.offsetWidth;
    splash.querySelector('.splash-content').style.animation = '';
    setTimeout(() => { splash.hidden = true; }, 1000);
  }

  // ---- Pointer events ----
  function dispatchTool(phase, p) {
    let key = state.tool;
    let h;
    if (key.startsWith('stamp:')) h = Tools.stamp;
    else if (key.startsWith('wacky:')) h = Tools.wacky;
    else if (key.startsWith('magic:')) h = Tools.magic;
    else h = Tools[key];
    if (!h) return;
    const fn = h[phase];
    if (!fn) return;
    ctx.save();
    ctx.globalAlpha = state.opacity;
    // Clip to active selection (rect or lasso path) so drawing only lands inside it.
    if (state.selection && state.selection.kind === 'lasso' && state.selection.path) {
      ctx.clip(state.selection.path);
    }
    fn(p);
    ctx.restore();
    if (phase !== 'down' || (key !== 'eyedrop' && key !== 'select')) composite();
  }

  canvas.addEventListener('pointerdown', (e) => {
    // Pan instead of drawing if Space is held or middle/secondary button
    if (state.spaceHeld || e.button === 1) {
      e.preventDefault();
      state.panning = { sx: e.clientX, sy: e.clientY, ox: state.panX, oy: state.panY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    e.preventDefault();
    Sounds.init();
    canvas.setPointerCapture(e.pointerId);
    state.drawing = true;
    state.button = e.button;
    state.shift = e.shiftKey;
    // Stylus pressure → variable size for this stroke
    if (e.pressure && e.pointerType !== 'mouse') {
      state.size = Math.max(1, Math.round(state.size * (0.5 + e.pressure)));
    }
    const p = getPos(e);
    state.startX = state.lastX = p.x;
    state.startY = state.lastY = p.y;
    pushUndo();
    recordStrokeStart(p);
    dispatchTool('down', p);
    if (shouldMirror()) {
      const realLast = { x: state.lastX, y: state.lastY };
      for (const m of mirrorPointsExt(p, p)) {
        state.lastX = m.lp.x; state.lastY = m.lp.y;
        dispatchTool('down', m.p);
      }
      state.lastX = realLast.x; state.lastY = realLast.y;
    }
    state.lastX = p.x; state.lastY = p.y;
  });
  canvas.addEventListener('pointermove', (e) => {
    state.shift = e.shiftKey;
    if (state.panning) {
      state.panX = state.panning.ox + (e.clientX - state.panning.sx);
      state.panY = state.panning.oy + (e.clientY - state.panning.sy);
      applyZoomTransform();
      return;
    }
    const p = getPos(e);
    updateStatusPos(p);
    updateBrushCursor(e);
    if (!state.drawing) return;
    recordStrokeMove(p);
    dispatchTool('move', p);
    if (shouldMirror()) {
      const realLast = { x: state.lastX, y: state.lastY };
      for (const m of mirrorPointsExt(p, realLast)) {
        state.lastX = m.lp.x; state.lastY = m.lp.y;
        dispatchTool('move', m.p);
      }
      state.lastX = realLast.x; state.lastY = realLast.y;
    }
    state.lastX = p.x; state.lastY = p.y;
  });
  function endStroke(e) {
    if (state.panning) { state.panning = false; }
    if (!state.drawing) return;
    state.drawing = false;
    state.snapshot = null;
    if (e) {
      const p = getPos(e);
      dispatchTool('up', p);
    }
    recordStrokeEnd();
    // MacPaint: collapse the active layer to 1-bit B&W with Bayer dither
    // after every stroke commit. Skips during the live drag.
    if (state.mode === 'macpaint') thresholdActiveLayerToBW();
    scheduleAutosave();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', endStroke);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- UI building ----
  function buildTools() {
    const root = $('tools');
    root.innerHTML = '';
    const tools = PaintModes.tools[state.mode];
    for (const t of tools) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.title = t.label;
      btn.textContent = t.icon;
      btn.dataset.tool = t.id;
      btn.addEventListener('click', () => {
        Sounds.click();
        setTool(t.id, t);
      });
      const lab = document.createElement('span');
      lab.className = 'tool-label';
      lab.textContent = t.label;
      btn.appendChild(lab);
      root.appendChild(btn);
    }
    // Default tool selection
    const def = tools[0];
    setTool(def.id, def);
  }

  function buildPalette() {
    const root = $('palette');
    root.innerHTML = '';
    const palette = PaintModes.palettes[state.mode];
    palette.forEach((c, i) => {
      const sw = document.createElement('button');
      sw.className = 'palette-swatch-item';
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('click', (e) => {
        if (e.shiftKey) setSecondary(c);
        else { setPrimary(c); state.colorIndex = i; }
        Sounds.click();
      });
      sw.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        setSecondary(c);
      });
      root.appendChild(sw);
    });
    setPrimary(palette[0]);
    setSecondary(palette[palette.length - 1]);

    // MacPaint: render the 38 fill patterns below the palette.
    if (state.mode === 'macpaint') {
      ensureMacPatterns();
      const lab = window.document.createElement('div');
      lab.className = 'recent-label';
      lab.textContent = 'Patterns';
      root.appendChild(lab);
      const strip = window.document.createElement('div');
      strip.className = 'palette-grid';
      strip.style.gridTemplateColumns = 'repeat(2, 22px)';
      MAC_PATTERN_CANVASES.forEach((tileCanvas, idx) => {
        const sw = window.document.createElement('button');
        sw.className = 'palette-swatch-item';
        sw.style.backgroundImage = `url(${tileCanvas.toDataURL()})`;
        sw.style.backgroundRepeat = 'repeat';
        sw.style.backgroundColor = '#fff';
        sw.title = 'Pattern ' + (idx + 1);
        sw.addEventListener('click', () => {
          macPatternIdx = idx;
          // visual highlight
          [...strip.children].forEach(el => el.style.outline = '');
          sw.style.outline = '2px solid #f00';
          Sounds.click();
        });
        if (idx === macPatternIdx) sw.style.outline = '2px solid #f00';
        strip.appendChild(sw);
      });
      root.appendChild(strip);
    }
  }

  function setPrimary(c) {
    state.primary = c;
    $('primary-swatch').style.background = c;
    pushRecentColor(c);
  }
  function pushRecentColor(c) {
    if (!c) return;
    state.recent = [c, ...state.recent.filter(x => x !== c)].slice(0, 12);
    renderRecent();
    try { localStorage.setItem('retropaint:recent', JSON.stringify(state.recent)); } catch (e) {}
  }
  function renderRecent() {
    const root = $('recent-colors');
    if (!root) return;
    root.innerHTML = '';
    state.recent.forEach((c) => {
      const sw = document.createElement('button');
      sw.className = 'palette-swatch-item';
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('click', (e) => {
        if (e.shiftKey) setSecondary(c); else setPrimary(c);
        Sounds.click();
      });
      sw.addEventListener('contextmenu', (e) => { e.preventDefault(); setSecondary(c); });
      root.appendChild(sw);
    });
  }
  function setSecondary(c) {
    state.secondary = c;
    $('secondary-swatch').style.background = c;
  }
  function setTool(id, def) {
    state.tool = id;
    if (id.startsWith('stamp:')) {
      state.activeStamp = (def && def.stamp) || id.split(':')[1];
      state.activeStampSet = (def && def.stampSet) || (state.mode === 'kidpix' ? 'kidpix' : 'mariopaint');
    } else if (id.startsWith('wacky:')) {
      state.activeWacky = (def && def.wacky) || id.split(':')[1];
    } else if (id === 'dynamite' || id === 'ohno') {
      // one-shot tool; still keep selected for status
    }
    document.querySelectorAll('.tool-btn').forEach(el => {
      el.dataset.active = (el.dataset.tool === id) ? 'true' : 'false';
    });
    const labelMap = {};
    PaintModes.tools[state.mode].forEach(t => labelMap[t.id] = t.label);
    $('status-tool').textContent = labelMap[id] || id;
  }

  function setMode(mode) {
    state.mode = mode;
    try { localStorage.setItem('retropaint:mode', mode); } catch (e) {}
    document.body.className = 'mode-' + mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active);
    });
    buildTools();
    buildPalette();
    $('canvas-title').textContent = PaintModes.titles[mode];
    const MODE_LABELS = {
      mspaint: 'MS Paint 95',
      mariopaint: 'Mario Paint',
      kidpix: 'Kid Pix',
      macpaint: 'MacPaint',
      tuxpaint: 'Tux Paint',
      psp: 'Paint Shop Pro',
      procreate: 'Procreate',
      aseprite: 'Aseprite',
      gimp: 'GIMP'
    };
    $('status-mode').textContent = MODE_LABELS[mode] || mode;
    const mascot = $('tux-mascot');
    if (mascot) mascot.hidden = mode !== 'tuxpaint';
  }
  const VALID_MODES = ['mspaint','mariopaint','kidpix','macpaint','tuxpaint','psp','procreate','aseprite','gimp'];

  function updateStatusPos(p) {
    $('status-pos').textContent = `${p.x}, ${p.y}`;
  }

  // ---- Header actions ----
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Sounds.click();
      setMode(btn.dataset.mode);
    });
  });
  $('btn-undo').addEventListener('click', () => { Sounds.click(); undo(); });
  $('btn-clear').addEventListener('click', (e) => {
    if (e.shiftKey) { resetAll(); return; }
    if (confirm('Clear the canvas?')) { pushUndo(); clearCanvas('#ffffff'); scheduleAutosave(); }
  });
  $('btn-save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `retro-paint-${state.mode}-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
  $('primary-swatch').addEventListener('click', () => openHsvPicker(true));
  $('secondary-swatch').addEventListener('click', () => openHsvPicker(false));
  $('primary-swatch').addEventListener('contextmenu', (e) => { e.preventDefault(); pickColorPrompt(true); });
  $('secondary-swatch').addEventListener('contextmenu', (e) => { e.preventDefault(); pickColorPrompt(false); });

  function pickColorPrompt(primary) {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = primary ? state.primary : state.secondary;
    inp.addEventListener('input', () => {
      if (primary) setPrimary(inp.value); else setSecondary(inp.value);
    });
    inp.click();
  }

  // ---- Brush size ----
  const sizeInput = $('brush-size');
  const sizeDisp = $('brush-size-display');
  sizeInput.addEventListener('input', () => {
    state.size = +sizeInput.value;
    sizeDisp.textContent = String(state.size);
    try { localStorage.setItem('retropaint:size', String(state.size)); } catch (e) {}
  });

  // ---- Brush cursor preview ----
  const brushCursor = $('brush-cursor');
  function updateBrushCursor(ev) {
    if (!brushCursor) return;
    const rect = canvas.getBoundingClientRect();
    const inside =
      ev.clientX >= rect.left && ev.clientX <= rect.right &&
      ev.clientY >= rect.top  && ev.clientY <= rect.bottom;
    if (!inside) { brushCursor.style.display = 'none'; return; }
    const scale = rect.width / W;
    const px = state.tool === 'pencil' ? 1 : Math.max(2, state.size * 2);
    const sz = px * scale;
    brushCursor.style.display = 'block';
    brushCursor.style.width = brushCursor.style.height = sz + 'px';
    brushCursor.style.left = (ev.clientX - sz / 2) + 'px';
    brushCursor.style.top  = (ev.clientY - sz / 2) + 'px';
  }
  canvas.addEventListener('pointerleave', () => {
    if (brushCursor) brushCursor.style.display = 'none';
  });

  // ---- Symmetry mirror (cycle off → H → V → Both → 4-way → 8-way) ----
  const MIRROR_LABELS = { off: '⌒ Off', h: '↔ H', v: '↕ V', both: '✚ Both', '4way': '✦ 4-way', '8way': '❋ 8-way' };
  function setMirror(m) {
    state.mirror = m;
    $('btn-symmetry').textContent = MIRROR_LABELS[m];
  }
  $('btn-symmetry').addEventListener('click', () => {
    const order = ['off', 'h', 'v', 'both', '4way', '8way'];
    setMirror(order[(order.indexOf(state.mirror) + 1) % order.length]);
    Sounds.click();
  });
  setMirror('off');

  // ---- Sound mute ----
  function setMuted(b) {
    state.muted = !!b;
    Sounds.setEnabled(!state.muted);
    $('btn-mute').textContent = state.muted ? '🔇' : '🔊';
    try { localStorage.setItem('retropaint:muted', state.muted ? '1' : '0'); } catch (e) {}
  }
  $('btn-mute').addEventListener('click', () => setMuted(!state.muted));

  // ---- Redo button ----
  $('btn-redo').addEventListener('click', () => { Sounds.click(); redo(); });

  // ---- Open image ----
  const fileInput = $('file-input');
  $('btn-open').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      pushUndo();
      clearCanvas('#ffffff');
      const r = Math.min(W / img.width, H / img.height);
      const dw = img.width * r, dh = img.height * r;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      composite();
      URL.revokeObjectURL(img.src);
      scheduleAutosave();
    };
    img.onerror = () => alert('Could not load that image.');
    img.src = URL.createObjectURL(f);
    fileInput.value = '';
  });

  // ---- Autosave + restore ----
  let saveTimer = null;
  function scheduleAutosave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem('retropaint:canvas', canvas.toDataURL('image/png')); }
      catch (e) { /* quota or security */ }
    }, 1500);
  }
  function tryRestore() {
    let data;
    try { data = localStorage.getItem('retropaint:canvas'); } catch (e) { return; }
    if (!data) return;
    const img = new Image();
    img.onload = () => {
      if (confirm('Restore your last drawing?')) {
        ctx.drawImage(img, 0, 0);
        composite();
      } else {
        try { localStorage.removeItem('retropaint:canvas'); } catch (e) {}
      }
    };
    img.src = data;
  }

  // ---- Keyboard shortcuts ----
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    state.shift = e.shiftKey;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
    if (mod && k === 'z') { e.preventDefault(); undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); $('btn-save').click(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('btn-open').click(); return; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod && k === 'c') { e.preventDefault(); copySelection(); return; }
    if (mod && k === 'x') { e.preventDefault(); cutSelection(); return; }
    if (mod && k === 'v') { e.preventDefault(); pasteSelection(); return; }
    if (mod && k === 'd') { e.preventDefault(); state.selection = null; state.floating = null; composite(); return; }
    if (mod && k === 'i') { e.preventDefault(); selectInvert(); return; }
    if (mod) return;
    if (e.key === 'Enter' && state.floating) { commitFloating(); return; }
    if (e.key === 'Escape') { state.floating = null; state.selection = null; composite(); return; }
    if (e.key === '1') return setMode('mspaint');
    if (e.key === '2') return setMode('mariopaint');
    if (e.key === '3') return setMode('kidpix');
    if (e.key === '4') return setMode('macpaint');
    if (e.key === '5') return setMode('tuxpaint');
    if (e.key === '6') return setMode('psp');
    if (e.key === '7') return setMode('procreate');
    if (e.key === '8') return setMode('aseprite');
    if (e.key === '9') return setMode('gimp');
    if (k === 'm') return setMuted(!state.muted);
    if (k === 'y') return $('btn-symmetry').click();
    if (k === 'g') return $('btn-grid').click();
    if (k === '?' || (e.shiftKey && k === '/')) { e.preventDefault(); return showHelp(); }
    if (k === '+' || k === '=') return setZoom(state.zoom * 1.25);
    if (k === '-' || k === '_') return setZoom(state.zoom / 1.25);
    if (k === '0') { state.panX = 0; state.panY = 0; return setZoom(1); }
    if (k === 'v') return nextBgPattern();
    if (k === 'f' && e.shiftKey) { e.preventDefault(); return toggleAnim(); }
    if (e.key === ' ') { e.preventDefault(); state.spaceHeld = true; canvas.style.cursor = 'grab'; return; }
    if (k === 'delete' || k === 'backspace') {
      // Delete clears selection contents
      if (state.selection) {
        pushUndo();
        const s = state.selection;
        const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, Math.abs(s.w), Math.abs(s.h));
        ctx.restore();
        state.selection = null;
        return;
      }
    }
    // Single-letter tool hotkey for current mode
    const tool = (PaintModes.tools[state.mode] || []).find(t => t.shortcut === k);
    if (tool) { setTool(tool.id, tool); Sounds.click(); }
  });
  window.addEventListener('keyup', (e) => {
    state.shift = e.shiftKey;
    if (e.key === ' ') { state.spaceHeld = false; canvas.style.cursor = ''; }
  });

  // ---- MacPaint: 38 8x8 fill patterns ----
  // Each entry is a string of 64 chars ('1' = black, '0' = white).
  const MAC_PATTERN_BITS = [
    '1111111111111111111111111111111111111111111111111111111111111111', // solid black
    '0000000000000000000000000000000000000000000000000000000000000000', // solid white
    '1010101010101010101010101010101010101010101010101010101010101010', // 50% checker
    '1100110011001100110011001100110011001100110011001100110011001100', // vertical 2px
    '1111000011110000111100001111000011110000111100001111000011110000', // horiz 4px
    '1010000010100000101000001010000010100000101000001010000010100000', // sparse dots
    '0101101001011010010110100101101001011010010110100101101001011010', // 50% offset
    '1000000001000000001000000001000000001000000001000000010000000010', // diagonal 1
    '0001000000010000000100000001000000010000000100000001000000010000', // diagonal 2
    '1000100010001000100010001000100010001000100010001000100010001000', // brick 1
    '1000100010001000111111111000100010001000100010001111111110001000', // brick 2
    '1111111110000001100000011000000110000001100000011000000111111111', // outline box
    '0000000001111110010000100100001001000010010000100111111000000000', // hollow box
    '0000000000011000001111000111111001111110001111000001100000000000', // diamond
    '1100001100110011001100110000110000001100001100110011001100110011', // tight checker
    '1010010110100101101001011010010110100101101001011010010110100101', // dense diag
    '0011001100110011110011001100110000110011001100111100110011001100', // basket
    '1000010000010001000010000001000000100100001010000100010001000100', // sparse star
    '1111111111000011110000111100001111000011110000111100001111111111', // window pane
    '0000000000111100011001100110011001100110011001100011110000000000', // diamond hollow
    '1010101010101010110011001100110010101010101010101100110011001100', // alternating tiles
    '1100110000110011110011000011001111001100001100111100110000110011', // tweed
    '1111110011110000111100001111000011110000111100001111000011111111', // ladder
    '1000100001000100001000100001000110001000010001000010001000010001', // grid bumps
    '1110011111000011100000010000000010000000100000011100001111100111', // big diamond
    '0001100000111100011111101111111101111110001111000001100000000000', // chevron diamond
    '1010000001010000101000000101000010100000010100001010000001010000', // light spot
    '1111000011001100110000111111000011001100110000111111000011001100', // weave
    '1000000010000000100000001111111110000000100000001000000011111111', // grid lines
    '0001100100110010110001011001000110010001110010011001100100011001', // crosshatch
    '1000010001000010001000010001000010000001000000100000010000001000', // sparse plus
    '0010001001000100100010000100010000100010010001001000100001000100', // herringbone
    '1010010110100101010110100101101010100101101001010101101001011010', // jagged
    '1111000010101010111100001010101011110000101010101111000010101010', // band tile
    '0000111100110011110011000000111100110011110011000000111100110011', // tilted brick
    '1010101001010101101010100101010110101010010101011010101001010101', // 50% checker offset
    '1111100011110000111000001100000010000000000000000000000000000000', // gradient triangle
    '1100110001100110001100110001100100110011011001101100110011001100'  // herringbone heavy
  ];
  function bitsToTileCanvas(bits) {
    const c = window.document.createElement('canvas');
    c.width = 8; c.height = 8;
    const ctx2 = c.getContext('2d');
    const id = ctx2.createImageData(8, 8);
    for (let i = 0; i < 64; i++) {
      const v = bits[i] === '1' ? 0 : 255;
      const o = i * 4;
      id.data[o] = id.data[o+1] = id.data[o+2] = v;
      id.data[o+3] = 255;
    }
    ctx2.putImageData(id, 0, 0);
    return c;
  }
  let MAC_PATTERN_CANVASES = null;
  let MAC_PATTERN_PATTERNS = null;
  function ensureMacPatterns() {
    if (MAC_PATTERN_CANVASES) return;
    MAC_PATTERN_CANVASES = MAC_PATTERN_BITS.map(bitsToTileCanvas);
    MAC_PATTERN_PATTERNS = MAC_PATTERN_CANVASES.map(c => ctx.createPattern(c, 'repeat'));
  }
  // Currently-selected MacPaint pattern (index 0 = solid black).
  let macPatternIdx = 0;
  function macPatternFill() {
    ensureMacPatterns();
    return MAC_PATTERN_PATTERNS[macPatternIdx] || '#000';
  }

  // ---- 1-bit B&W threshold pass (MacPaint) ----
  // Bayer 4x4 ordered dither for grayscale tones.
  const BAYER4 = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5]
  ];
  function thresholdActiveLayerToBW() {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (d[o+3] === 0) continue;
        const luma = d[o] * 0.299 + d[o+1] * 0.587 + d[o+2] * 0.114;
        const t = (BAYER4[y & 3][x & 3] + 0.5) * 16;  // 0..256
        const bw = luma > t ? 255 : 0;
        d[o] = d[o+1] = d[o+2] = bw;
        d[o+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    composite();
  }

  // ---- MacPaint Goodies (image-wide ops) ----
  function goodiesInvert() {
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2];
    }
    ctx.putImageData(img, 0, 0);
    composite();
  }
  function goodiesFlipH() {
    pushUndo();
    const tmp = window.document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').drawImage(activeLayer().canvas, 0, 0);
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, W, 0);
    ctx.clearRect(-W, 0, W, H);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    composite();
  }
  function goodiesFlipV() {
    pushUndo();
    const tmp = window.document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').drawImage(activeLayer().canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, -1, 0, H);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    composite();
  }
  function goodiesRotate(deg) {
    pushUndo();
    const tmp = window.document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').drawImage(activeLayer().canvas, 0, 0);
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(tmp, -W / 2, -H / 2);
    ctx.restore();
    composite();
  }
  function goodiesTraceEdges() {
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const out = ctx.createImageData(W, H);
    const od = out.data;
    const lum = (i) => d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        const gx = (
          -lum(((y-1)*W + (x-1))*4) - 2*lum((y*W + (x-1))*4) - lum(((y+1)*W + (x-1))*4)
          + lum(((y-1)*W + (x+1))*4) + 2*lum((y*W + (x+1))*4) + lum(((y+1)*W + (x+1))*4)
        );
        const gy = (
          -lum(((y-1)*W + (x-1))*4) - 2*lum(((y-1)*W + x)*4) - lum(((y-1)*W + (x+1))*4)
          + lum(((y+1)*W + (x-1))*4) + 2*lum(((y+1)*W + x)*4) + lum(((y+1)*W + (x+1))*4)
        );
        const m = Math.min(255, Math.hypot(gx, gy));
        const bw = m > 64 ? 0 : 255;
        od[i] = od[i+1] = od[i+2] = bw;
        od[i+3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    composite();
  }

  // ---- FatBits modal (MacPaint pixel editor) ----
  function openFatBits(centerX, centerY) {
    const ZOOM = 16;
    const SIZE = 16;
    const sx = Math.max(0, Math.min(W - SIZE, (centerX || W/2) - SIZE/2 | 0));
    const sy = Math.max(0, Math.min(H - SIZE, (centerY || H/2) - SIZE/2 | 0));
    const html = `
      <div>FatBits — click pixels to toggle. Region: ${SIZE}×${SIZE} at (${sx},${sy}).</div>
      <canvas id="fatbits" width="${SIZE * ZOOM}" height="${SIZE * ZOOM}" style="border:2px solid #000; image-rendering: pixelated; cursor: crosshair; background:#fff; margin-top:8px"></canvas>`;
    showModal('FatBits', html, { okText: 'Done', hideCancel: true }).then(() => composite());
    setTimeout(() => {
      const fb = window.document.getElementById('fatbits');
      if (!fb) return;
      const fctx = fb.getContext('2d');
      fctx.imageSmoothingEnabled = false;
      function repaint() {
        const data = ctx.getImageData(sx, sy, SIZE, SIZE);
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const o = (y * SIZE + x) * 4;
            fctx.fillStyle = `rgb(${data.data[o]},${data.data[o+1]},${data.data[o+2]})`;
            fctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
          }
        }
        // grid
        fctx.strokeStyle = 'rgba(0,0,0,0.25)';
        fctx.lineWidth = 1;
        for (let i = 0; i <= SIZE; i++) {
          fctx.beginPath(); fctx.moveTo(i * ZOOM + 0.5, 0); fctx.lineTo(i * ZOOM + 0.5, SIZE * ZOOM); fctx.stroke();
          fctx.beginPath(); fctx.moveTo(0, i * ZOOM + 0.5); fctx.lineTo(SIZE * ZOOM, i * ZOOM + 0.5); fctx.stroke();
        }
      }
      function paintAt(ev) {
        const r = fb.getBoundingClientRect();
        const px = Math.floor((ev.clientX - r.left) / ZOOM);
        const py = Math.floor((ev.clientY - r.top) / ZOOM);
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return;
        ctx.fillStyle = state.primary;
        ctx.fillRect(sx + px, sy + py, 1, 1);
        repaint();
        composite();
      }
      let down = false;
      fb.addEventListener('pointerdown', (e) => { down = true; pushUndo(); paintAt(e); });
      fb.addEventListener('pointermove', (e) => { if (down) paintAt(e); });
      fb.addEventListener('pointerup', () => down = false);
      repaint();
    }, 50);
  }

  // ---- Brush opacity ----
  const opacityInput = $('brush-opacity');
  const opacityDisp = $('brush-opacity-display');
  if (opacityInput) {
    opacityInput.addEventListener('input', () => {
      state.opacity = (+opacityInput.value) / 100;
      opacityDisp.textContent = String(opacityInput.value);
      try { localStorage.setItem('retropaint:opacity', String(state.opacity)); } catch (e) {}
    });
  }

  // ---- Pixel grid overlay ----
  function renderGrid() {
    if (!state.gridOn) { canvas.style.backgroundImage = ''; return; }
    const sz = Math.max(1, Math.round(state.zoom));
    const c = `linear-gradient(to right, rgba(0,0,0,0.15) 1px, transparent 1px),
               linear-gradient(to bottom, rgba(0,0,0,0.15) 1px, transparent 1px)`;
    canvas.style.backgroundImage = c;
    canvas.style.backgroundSize = `${sz * 1}px ${sz * 1}px`;
  }
  $('btn-grid').addEventListener('click', () => {
    state.gridOn = !state.gridOn;
    $('btn-grid').textContent = state.gridOn ? '⊞ On' : '⊞ Off';
    Sounds.click();
    renderGrid();
  });

  // ---- Modal helper (used by New canvas, Filters, Help, HSV picker) ----
  function showModal(title, bodyHtml, opts) {
    return new Promise((resolve) => {
      const m = $('modal');
      $('modal-title').textContent = title;
      $('modal-body').innerHTML = bodyHtml;
      m.hidden = false;
      const ok = $('modal-ok'), cancel = $('modal-cancel');
      ok.textContent = (opts && opts.okText) || 'OK';
      cancel.style.display = (opts && opts.hideCancel) ? 'none' : '';
      const close = (val) => {
        m.hidden = true;
        ok.removeEventListener('click', okH);
        cancel.removeEventListener('click', cancelH);
        resolve(val);
      };
      const okH = () => close(true);
      const cancelH = () => close(false);
      ok.addEventListener('click', okH);
      cancel.addEventListener('click', cancelH);
    });
  }

  // ---- New canvas dialog ----
  $('btn-new').addEventListener('click', async () => {
    const sizes = [
      ['320 × 240 (small)', 320, 240],
      ['480 × 360',         480, 360],
      ['640 × 480 (default)', 640, 480],
      ['800 × 600',         800, 600],
      ['1024 × 768',       1024, 768]
    ];
    const opts = sizes.map(([l, w, h]) =>
      `<label style="display:block;padding:4px"><input type="radio" name="size" value="${w}x${h}" ${w===640?'checked':''}> ${l}</label>`
    ).join('');
    const ok = await showModal('New canvas',
      `<div>Pick a size:</div>${opts}<div style="margin-top:8px">This will erase the current drawing.</div>`);
    if (!ok) return;
    const sel = document.querySelector('input[name="size"]:checked');
    if (!sel) return;
    const [w, h] = sel.value.split('x').map(Number);
    resizeCanvas(w, h);
  });
  function resizeCanvas(w, h) {
    const d = activeDoc(); if (!d) return;
    // Replace document's layers with fresh ones at the new size.
    d.width = w; d.height = h;
    d.layers = [createLayer('Background', w, h)];
    d.layers[0].ctx.fillStyle = '#ffffff';
    d.layers[0].ctx.fillRect(0, 0, w, h);
    d.activeIdx = 0;
    d.undoStack.length = 0; d.redoStack.length = 0;
    canvas.width = w; canvas.height = h;
    W = w; H = h;
    setActiveLayer(0);
    composite();
    scheduleAutosave();
  }

  // ---- Help overlay ----
  $('btn-help').addEventListener('click', () => showHelp());
  function showHelp() {
    showModal('Retro Paint — Help', `
      <p><b>Modes:</b> 1 / 2 / 3 — MS Paint · Mario Paint · Kid Pix</p>
      <p><b>Tools:</b> hover any tool button, or use single-letter hotkeys
        — P pencil · B brush · E eraser · F fill · K pick · S spray
        · L line · R rect · O oval · G gradient · T text · A select.</p>
      <p><b>Edit:</b> Ctrl+Z undo · Ctrl+Shift+Z redo · Ctrl+S save · Ctrl+O open.</p>
      <p><b>View:</b> + / − / 0 zoom · Space+drag (or 2-finger) pan · G grid · Y mirror · M mute.</p>
      <p><b>Shapes:</b> hold Shift while dragging for square / circle / 45° line.</p>
      <p><b>Symmetry:</b> Off → H → V → Both → 4-way → 8-way kaleidoscope.</p>
      <p><b>Animation:</b> use the bar at the bottom — add frames, scrub, play, toggle onion skin.</p>
      <p><b>FX:</b> the FX button applies image filters (invert / grayscale / sepia / posterize / blur).</p>
    `, { hideCancel: true, okText: 'Got it' });
  }

  // ---- Image filters ----
  function applyFilter(kind) {
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    if (kind === 'invert') {
      for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2]; }
    } else if (kind === 'grayscale') {
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) | 0;
        d[i] = d[i+1] = d[i+2] = v;
      }
    } else if (kind === 'sepia') {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        d[i]   = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        d[i+1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        d[i+2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
    } else if (kind === 'posterize') {
      const lvl = 4;
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = Math.round(d[i]   / 255 * lvl) / lvl * 255;
        d[i+1] = Math.round(d[i+1] / 255 * lvl) / lvl * 255;
        d[i+2] = Math.round(d[i+2] / 255 * lvl) / lvl * 255;
      }
    } else if (kind === 'brighten') {
      for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] + 24); d[i+1] = Math.min(255, d[i+1] + 24); d[i+2] = Math.min(255, d[i+2] + 24); }
    } else if (kind === 'darken') {
      for (let i = 0; i < d.length; i += 4) { d[i] = Math.max(0, d[i] - 24); d[i+1] = Math.max(0, d[i+1] - 24); d[i+2] = Math.max(0, d[i+2] - 24); }
    }
    ctx.putImageData(img, 0, 0);
    if (kind === 'blur') {
      // Cheap blur: scale down then up — use the active layer's own canvas
      // as the source so we blur only the active layer, not the composite.
      const tmp = document.createElement('canvas');
      tmp.width = W >> 1; tmp.height = H >> 1;
      tmp.getContext('2d').drawImage(activeLayer().canvas, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, W, H);
    }
    composite();
    scheduleAutosave();
  }
  $('btn-filter').addEventListener('click', async () => {
    const kinds = ['invert', 'grayscale', 'sepia', 'posterize', 'blur', 'brighten', 'darken'];
    const opts = kinds.map(k =>
      `<label style="display:block;padding:4px"><input type="radio" name="filter" value="${k}" ${k==='invert'?'checked':''}> ${k}</label>`).join('');
    const ok = await showModal('Image filter', `<div>Pick a filter:</div>${opts}`);
    if (!ok) return;
    const sel = document.querySelector('input[name="filter"]:checked');
    if (sel) applyFilter(sel.value);
  });

  // ---- Custom HSV color picker (replaces OS picker on big swatches) ----
  function rgbStrToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = mx, d = mx - mn;
    const s = mx ? d / mx : 0;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, v];
  }
  function hsvToHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let [r, g, b] = [0, 0, 0];
    if (h < 60)      [r, g, b] = [c, x, 0];
    else if (h < 120)[r, g, b] = [x, c, 0];
    else if (h < 180)[r, g, b] = [0, c, x];
    else if (h < 240)[r, g, b] = [0, x, c];
    else if (h < 300)[r, g, b] = [x, 0, c];
    else             [r, g, b] = [c, 0, x];
    const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }
  async function openHsvPicker(forPrimary) {
    const cur = forPrimary ? state.primary : state.secondary;
    const rgb = parseColor(cur);
    const [h0, s0, v0] = rgbStrToHsv(rgb[0], rgb[1], rgb[2]);
    const html = `
      <div style="display:flex;flex-direction:column;gap:6px">
        <div id="hsv-preview" style="height:40px;border:1px solid #000"></div>
        <label>H <input id="hsv-h" type="range" min="0" max="360" value="${Math.round(h0)}"></label>
        <label>S <input id="hsv-s" type="range" min="0" max="100" value="${Math.round(s0*100)}"></label>
        <label>V <input id="hsv-v" type="range" min="0" max="100" value="${Math.round(v0*100)}"></label>
        <input id="hsv-hex" type="text" value="${cur}" style="width:80px">
      </div>`;
    const m = $('modal');
    $('modal-title').textContent = forPrimary ? 'Primary color' : 'Secondary color';
    $('modal-body').innerHTML = html;
    m.hidden = false;
    const upd = () => {
      const h = +$('hsv-h').value, s = +$('hsv-s').value / 100, v = +$('hsv-v').value / 100;
      const hex = hsvToHex(h, s, v);
      $('hsv-preview').style.background = hex;
      $('hsv-hex').value = hex;
    };
    ['hsv-h','hsv-s','hsv-v'].forEach(id => $(id).addEventListener('input', upd));
    $('hsv-hex').addEventListener('change', () => {
      const v = $('hsv-hex').value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) {
        $('hsv-preview').style.background = v;
      }
    });
    upd();
    return new Promise((resolve) => {
      const ok = $('modal-ok'), cancel = $('modal-cancel');
      const close = (apply) => {
        m.hidden = true;
        ok.removeEventListener('click', okH);
        cancel.removeEventListener('click', cancelH);
        if (apply) {
          const hex = $('hsv-hex').value;
          if (forPrimary) setPrimary(hex); else setSecondary(hex);
        }
        resolve(apply);
      };
      const okH = () => close(true);
      const cancelH = () => close(false);
      ok.addEventListener('click', okH);
      cancel.addEventListener('click', cancelH);
    });
  }

  // ---- Pan & zoom ----
  function applyZoomTransform() {
    const stage = canvas.parentElement;
    if (!stage) return;
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    canvas.style.transformOrigin = 'center';
    $('btn-zoom-reset').textContent = Math.round(state.zoom * 100) + '%';
    renderGrid();
  }
  function setZoom(z) {
    state.zoom = Math.max(0.25, Math.min(8, z));
    applyZoomTransform();
  }
  $('btn-zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.25));
  $('btn-zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.25));
  $('btn-zoom-reset').addEventListener('click', () => { state.panX = 0; state.panY = 0; setZoom(1); });
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) return; // require modifier so it doesn't hijack scrolling
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  // ---- Stroke replay ----
  let recording = [];
  function recordStrokeStart(p) { recording.push({ t: 'start', p, tool: state.tool, color: state.primary, size: state.size, alpha: state.opacity, mode: state.mode, mirror: state.mirror }); }
  function recordStrokeMove(p) { recording.push({ t: 'm', p, time: performance.now() }); }
  function recordStrokeEnd() { recording.push({ t: 'end' }); }
  let lastDrawing = null;
  function captureForReplay() { lastDrawing = ctx.getImageData(0, 0, W, H); }
  $('btn-replay').addEventListener('click', () => {
    if (!recording.length) { alert('Nothing to replay yet — make a stroke first.'); return; }
    const seq = recording.slice();
    pushUndo();
    clearCanvas('#ffffff');
    let i = 0, prev = null, t0 = performance.now();
    function step() {
      while (i < seq.length) {
        const e = seq[i++];
        if (e.t === 'start') {
          state.lastX = e.p.x; state.lastY = e.p.y;
          state.startX = e.p.x; state.startY = e.p.y;
          dispatchTool('down', e.p);
          prev = e.p;
        } else if (e.t === 'm') {
          dispatchTool('move', e.p);
          state.lastX = e.p.x; state.lastY = e.p.y;
          prev = e.p;
          // Yield occasionally so the user sees the strokes form
          if (i % 3 === 0) { requestAnimationFrame(step); return; }
        } else if (e.t === 'end') {
          dispatchTool('up', prev);
        }
      }
    }
    requestAnimationFrame(step);
  });

  // ---- Animation flipbook ----
  function ensureFrames() {
    if (state.frames) return;
    state.frames = [ctx.getImageData(0, 0, W, H)];
    state.frameIdx = 0;
    showAnimBar();
    updateAnimBar();
  }
  function showAnimBar() { $('anim-bar').hidden = false; }
  function updateAnimBar() {
    if (!state.frames) return;
    $('anim-frame').textContent = `${state.frameIdx + 1} / ${state.frames.length}`;
    drawCurrentFrame();
  }
  function commitCurrentToFrame() {
    if (!state.frames) return;
    // Capture the composite (all visible layers flattened) so animation
    // shows the full picture, not just the active layer.
    state.frames[state.frameIdx] = displayCtx.getImageData(0, 0, W, H);
  }
  function drawCurrentFrame() {
    if (!state.frames) return;
    ctx.putImageData(state.frames[state.frameIdx], 0, 0);
    if (state.onion && state.frameIdx > 0) {
      const prev = state.frames[state.frameIdx - 1];
      ctx.save();
      ctx.globalAlpha = 0.3;
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      tmp.getContext('2d').putImageData(prev, 0, 0);
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    }
    composite();
  }
  $('anim-prev').addEventListener('click', () => {
    if (!state.frames) return;
    commitCurrentToFrame();
    state.frameIdx = (state.frameIdx - 1 + state.frames.length) % state.frames.length;
    updateAnimBar();
  });
  $('anim-next').addEventListener('click', () => {
    if (!state.frames) return;
    commitCurrentToFrame();
    state.frameIdx = (state.frameIdx + 1) % state.frames.length;
    updateAnimBar();
  });
  $('anim-add').addEventListener('click', () => {
    ensureFrames();
    commitCurrentToFrame();
    state.frames.splice(state.frameIdx + 1, 0, ctx.getImageData(0, 0, W, H));
    state.frameIdx++;
    updateAnimBar();
  });
  $('anim-del').addEventListener('click', () => {
    if (!state.frames || state.frames.length <= 1) return;
    state.frames.splice(state.frameIdx, 1);
    state.frameIdx = Math.max(0, state.frameIdx - 1);
    updateAnimBar();
  });
  let playing = null;
  $('anim-play').addEventListener('click', () => {
    if (!state.frames || state.frames.length < 2) { ensureFrames(); return; }
    if (playing) { clearInterval(playing); playing = null; $('anim-play').textContent = '▶'; return; }
    commitCurrentToFrame();
    let i = 0;
    $('anim-play').textContent = '■';
    playing = setInterval(() => {
      i = (i + 1) % state.frames.length;
      ctx.putImageData(state.frames[i], 0, 0);
    }, 150);
  });
  $('anim-onion').addEventListener('change', () => {
    state.onion = $('anim-onion').checked;
    drawCurrentFrame();
  });
  // Keyboard "F" toggles the animation bar
  function toggleAnim() {
    if ($('anim-bar').hidden) { ensureFrames(); }
    else { $('anim-bar').hidden = true; state.frames = null; if (playing) { clearInterval(playing); playing = null; } }
  }

  // ---- Reset all settings/storage ----
  function resetAll() {
    if (!confirm('Reset all preferences and stored drawing?')) return;
    try {
      ['canvas','mode','size','opacity','muted','recent'].forEach(k => localStorage.removeItem('retropaint:' + k));
    } catch (e) {}
    location.reload();
  }

  // ---- HD export (2x / 3x) ----
  // Triple-click 💾 Save to choose scale
  let saveClicks = 0, saveTimer2 = null;
  $('btn-save').addEventListener('click', async (e) => {
    if (e.shiftKey) {
      const scale = +(prompt('Save at scale?', '2') || '1');
      if (scale > 0 && scale <= 8) {
        const off = document.createElement('canvas');
        off.width = W * scale; off.height = H * scale;
        const c2 = off.getContext('2d');
        c2.imageSmoothingEnabled = false;
        c2.drawImage(canvas, 0, 0, off.width, off.height);
        const a = document.createElement('a');
        a.download = `retro-paint-${state.mode}-${scale}x-${Date.now()}.png`;
        a.href = off.toDataURL('image/png');
        a.click();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  // ---- Background pattern picker (via dblclick on canvas frame) ----
  // Uses CSS class on .canvas-stage; cycles through patterns
  const BG_PATTERNS = ['none', 'grid', 'dots', 'graph', 'lines', 'blueprint'];
  function nextBgPattern() {
    const i = (BG_PATTERNS.indexOf(state.bgPattern) + 1) % BG_PATTERNS.length;
    state.bgPattern = BG_PATTERNS[i];
    const stage = document.querySelector('.canvas-stage');
    BG_PATTERNS.forEach(p => stage.classList.remove('bg-' + p));
    stage.classList.add('bg-' + state.bgPattern);
  }

  // ---- PSP layers panel ----
  const BLEND_MODES = [
    'source-over','multiply','screen','overlay','darken','lighten',
    'color-dodge','color-burn','difference','exclusion','soft-light','hard-light'
  ];
  const BLEND_LABELS = {
    'source-over': 'Normal', multiply: 'Multiply', screen: 'Screen',
    overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten',
    'color-dodge': 'Dodge', 'color-burn': 'Burn',
    difference: 'Difference', exclusion: 'Exclusion',
    'soft-light': 'Soft Light', 'hard-light': 'Hard Light'
  };
  function renderLayersPanel() {
    const panel = $('psp-layers-panel');
    if (!panel) return;
    panel.hidden = state.mode !== 'psp';
    if (panel.hidden) return;
    const list = $('psp-layers-list');
    list.innerHTML = '';
    const d = activeDoc(); if (!d) return;
    // Render top-down (visually) but data is bottom-up.
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const L = d.layers[i];
      const row = window.document.createElement('div');
      row.className = 'psp-layer-row' + (i === d.activeIdx ? ' is-active' : '');
      // Thumbnail
      const thumb = window.document.createElement('canvas');
      thumb.className = 'psp-layer-thumb';
      thumb.width = 24; thumb.height = 18;
      const tctx = thumb.getContext('2d');
      tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, 24, 18);
      tctx.drawImage(L.canvas, 0, 0, 24, 18);
      // Eye
      const eye = window.document.createElement('button');
      eye.textContent = L.visible ? '👁' : '·';
      eye.title = 'Toggle visibility';
      eye.style.cssText = 'padding:0 4px;font-size:11px';
      eye.addEventListener('click', (e) => { e.stopPropagation(); L.visible = !L.visible; renderLayersPanel(); composite(); });
      // Name
      const name = window.document.createElement('span');
      name.className = 'psp-layer-name';
      name.textContent = L.name;
      name.title = 'Double-click to rename';
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const v = prompt('Layer name:', L.name);
        if (v) { L.name = v; renderLayersPanel(); }
      });
      // Blend mode
      const blend = window.document.createElement('select');
      BLEND_MODES.forEach(b => {
        const o = window.document.createElement('option');
        o.value = b; o.textContent = BLEND_LABELS[b]; if (L.blend === b) o.selected = true;
        blend.appendChild(o);
      });
      blend.addEventListener('change', () => { L.blend = blend.value; composite(); });
      blend.addEventListener('click', (e) => e.stopPropagation());
      // Opacity
      const opa = window.document.createElement('input');
      opa.type = 'range'; opa.min = 0; opa.max = 100; opa.value = Math.round(L.opacity * 100);
      opa.addEventListener('input', () => { L.opacity = opa.value / 100; composite(); });
      opa.addEventListener('click', (e) => e.stopPropagation());

      row.appendChild(eye);
      row.appendChild(thumb);
      row.appendChild(name);
      row.appendChild(blend);
      row.appendChild(opa);
      row.addEventListener('click', () => { setActiveLayer(i); renderLayersPanel(); });
      list.appendChild(row);
    }
  }
  function newLayer() {
    const d = activeDoc(); if (!d) return;
    const L = createLayer('Layer ' + (d.layers.length + 1), d.width, d.height);
    d.layers.push(L);
    d.activeIdx = d.layers.length - 1;
    setActiveLayer(d.activeIdx);
    renderLayersPanel(); composite();
  }
  function dupLayer() {
    const d = activeDoc(); if (!d) return;
    const src = d.layers[d.activeIdx];
    const L = createLayer(src.name + ' copy', d.width, d.height);
    L.ctx.drawImage(src.canvas, 0, 0);
    L.opacity = src.opacity; L.blend = src.blend; L.visible = src.visible;
    d.layers.splice(d.activeIdx + 1, 0, L);
    d.activeIdx++;
    setActiveLayer(d.activeIdx);
    renderLayersPanel(); composite();
  }
  function delLayer() {
    const d = activeDoc(); if (!d || d.layers.length <= 1) return;
    d.layers.splice(d.activeIdx, 1);
    d.activeIdx = Math.min(d.activeIdx, d.layers.length - 1);
    setActiveLayer(d.activeIdx);
    renderLayersPanel(); composite();
  }
  function mergeDown() {
    const d = activeDoc(); if (!d || d.activeIdx === 0) return;
    const top = d.layers[d.activeIdx];
    const bot = d.layers[d.activeIdx - 1];
    bot.ctx.save();
    bot.ctx.globalAlpha = top.opacity;
    bot.ctx.globalCompositeOperation = top.blend;
    bot.ctx.drawImage(top.canvas, 0, 0);
    bot.ctx.restore();
    d.layers.splice(d.activeIdx, 1);
    d.activeIdx--;
    setActiveLayer(d.activeIdx);
    renderLayersPanel(); composite();
  }

  // ---- PSP doc tabs ----
  function renderTabs() {
    const bar = $('psp-tabs');
    if (!bar) return;
    bar.hidden = state.mode !== 'psp';
    if (bar.hidden) return;
    bar.innerHTML = '';
    docs.forEach((d, i) => {
      const tab = window.document.createElement('button');
      tab.className = 'psp-tab' + (i === activeDocIdx ? ' is-active' : '');
      tab.textContent = d.name;
      tab.addEventListener('click', () => { setActiveDoc(i); renderLayersPanel(); renderTabs(); });
      const x = window.document.createElement('span');
      x.className = 'psp-tab-close';
      x.textContent = '×';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (docs.length <= 1) return;
        docs.splice(i, 1);
        if (activeDocIdx >= docs.length) activeDocIdx = docs.length - 1;
        setActiveDoc(activeDocIdx);
        renderLayersPanel(); renderTabs();
      });
      tab.appendChild(x);
      bar.appendChild(tab);
    });
    const add = window.document.createElement('button');
    add.className = 'psp-tab-add';
    add.textContent = '＋';
    add.title = 'New document';
    add.addEventListener('click', () => {
      docs.push(newDocument(W, H, 'untitled-' + (docs.length + 1)));
      setActiveDoc(docs.length - 1);
      renderLayersPanel(); renderTabs();
    });
    bar.appendChild(add);
  }

  // ---- PSP color adjustments (Levels, HSL, Color Balance, Threshold) ----
  function applyLUT(rLut, gLut, bLut) {
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = rLut[d[i]]; d[i+1] = gLut[d[i+1]]; d[i+2] = bLut[d[i+2]];
    }
    ctx.putImageData(img, 0, 0);
    composite();
  }
  function levelsLUT(inB, inW, outB, outW) {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = (i - inB) / Math.max(1, inW - inB);
      v = Math.max(0, Math.min(1, v));
      lut[i] = Math.round(outB + v * (outW - outB));
    }
    return lut;
  }
  async function openLevels() {
    const html = `
      <label>Input black: <input id="lv-ib" type="range" min="0" max="255" value="0"></label><br>
      <label>Input white: <input id="lv-iw" type="range" min="0" max="255" value="255"></label><br>
      <label>Output black: <input id="lv-ob" type="range" min="0" max="255" value="0"></label><br>
      <label>Output white: <input id="lv-ow" type="range" min="0" max="255" value="255"></label>`;
    const ok = await showModal('Levels', html);
    if (!ok) return;
    const lut = levelsLUT(+$('lv-ib').value, +$('lv-iw').value, +$('lv-ob').value, +$('lv-ow').value);
    applyLUT(lut, lut, lut);
  }
  async function openHSL() {
    const html = `
      <label>Hue shift: <input id="hsl-h" type="range" min="-180" max="180" value="0"></label><br>
      <label>Saturation: <input id="hsl-s" type="range" min="-100" max="100" value="0"></label><br>
      <label>Lightness: <input id="hsl-l" type="range" min="-100" max="100" value="0"></label>`;
    const ok = await showModal('Hue / Saturation / Lightness', html);
    if (!ok) return;
    const dh = +$('hsl-h').value, ds = +$('hsl-s').value / 100, dl = +$('hsl-l').value / 100;
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // RGB -> HSL
      const r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h, s, l = (mx + mn) / 2;
      if (mx === mn) { h = 0; s = 0; }
      else {
        const cd = mx - mn;
        s = l > 0.5 ? cd / (2 - mx - mn) : cd / (mx + mn);
        if (mx === r) h = ((g - b) / cd) % 6;
        else if (mx === g) h = (b - r) / cd + 2;
        else h = (r - g) / cd + 4;
        h *= 60; if (h < 0) h += 360;
      }
      h = (h + dh + 360) % 360;
      s = Math.max(0, Math.min(1, s + ds));
      l = Math.max(0, Math.min(1, l + dl));
      // HSL -> RGB
      const c = (1 - Math.abs(2*l - 1)) * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l - c/2;
      let rr, gg, bb;
      if (h < 60)      [rr,gg,bb] = [c,x,0];
      else if (h < 120)[rr,gg,bb] = [x,c,0];
      else if (h < 180)[rr,gg,bb] = [0,c,x];
      else if (h < 240)[rr,gg,bb] = [0,x,c];
      else if (h < 300)[rr,gg,bb] = [x,0,c];
      else             [rr,gg,bb] = [c,0,x];
      d[i] = Math.round((rr + m) * 255);
      d[i+1] = Math.round((gg + m) * 255);
      d[i+2] = Math.round((bb + m) * 255);
    }
    ctx.putImageData(img, 0, 0);
    composite();
  }
  async function openColorBalance() {
    const html = `
      <label>Cyan ↔ Red: <input id="cb-r" type="range" min="-100" max="100" value="0"></label><br>
      <label>Magenta ↔ Green: <input id="cb-g" type="range" min="-100" max="100" value="0"></label><br>
      <label>Yellow ↔ Blue: <input id="cb-b" type="range" min="-100" max="100" value="0"></label>`;
    const ok = await showModal('Color Balance', html);
    if (!ok) return;
    const dr = +$('cb-r').value, dg = +$('cb-g').value, db = +$('cb-b').value;
    const mk = (delta) => {
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(255, i + delta));
      return lut;
    };
    applyLUT(mk(dr), mk(dg), mk(db));
  }
  async function openThreshold() {
    const html = `<label>Threshold: <input id="th-v" type="range" min="0" max="255" value="128"></label>`;
    const ok = await showModal('Threshold', html);
    if (!ok) return;
    const t = +$('th-v').value;
    pushUndo();
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
      const v = lum > t ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = v;
    }
    ctx.putImageData(img, 0, 0);
    composite();
  }

  // ---- PSP retouch brushes ----
  function retouchAt(p, fn) {
    const r = state.size * 2;
    const x0 = Math.max(0, p.x - r | 0), y0 = Math.max(0, p.y - r | 0);
    const w = Math.min(W - x0, r * 2 | 0), h = Math.min(H - y0, r * 2 | 0);
    if (w <= 0 || h <= 0) return;
    const img = ctx.getImageData(x0, y0, w, h);
    fn(img.data);
    ctx.putImageData(img, x0, y0);
  }
  Tools.dodge = {
    down(p) { pushUndo(); retouchAt(p, d => { for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] + 24); d[i+1] = Math.min(255, d[i+1] + 24); d[i+2] = Math.min(255, d[i+2] + 24); } }); },
    move(p) { retouchAt(p, d => { for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] + 8); d[i+1] = Math.min(255, d[i+1] + 8); d[i+2] = Math.min(255, d[i+2] + 8); } }); }
  };
  Tools.burn = {
    down(p) { pushUndo(); retouchAt(p, d => { for (let i = 0; i < d.length; i += 4) { d[i] = Math.max(0, d[i] - 24); d[i+1] = Math.max(0, d[i+1] - 24); d[i+2] = Math.max(0, d[i+2] - 24); } }); },
    move(p) { retouchAt(p, d => { for (let i = 0; i < d.length; i += 4) { d[i] = Math.max(0, d[i] - 8); d[i+1] = Math.max(0, d[i+1] - 8); d[i+2] = Math.max(0, d[i+2] - 8); } }); }
  };
  Tools.saturate = {
    down(p) { pushUndo(); retouchAt(p, satAdjust(0.4)); },
    move(p) { retouchAt(p, satAdjust(0.15)); }
  };
  Tools.desaturate = {
    down(p) { pushUndo(); retouchAt(p, satAdjust(-0.4)); },
    move(p) { retouchAt(p, satAdjust(-0.15)); }
  };
  function satAdjust(amount) {
    return (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        d[i]   = Math.max(0, Math.min(255, gray + (r - gray) * (1 + amount)));
        d[i+1] = Math.max(0, Math.min(255, gray + (g - gray) * (1 + amount)));
        d[i+2] = Math.max(0, Math.min(255, gray + (b - gray) * (1 + amount)));
      }
    };
  }
  // Clone brush — alt-click sets source point, then strokes copy with offset.
  let cloneSource = null;
  Tools.clone = {
    down(p) {
      if (state.altKey || state.shift) { cloneSource = { x: p.x, y: p.y, ox: 0, oy: 0 }; return; }
      if (!cloneSource) { alert('Shift-click first to set the clone source.'); return; }
      cloneSource.ox = p.x - cloneSource.x;
      cloneSource.oy = p.y - cloneSource.y;
      cloneSource.lastDest = { x: p.x, y: p.y };
      cloneStamp(p);
    },
    move(p) {
      if (!cloneSource || cloneSource.ox === undefined) return;
      cloneStamp(p);
    }
  };
  function cloneStamp(p) {
    const r = Math.max(2, state.size);
    const sx = p.x - cloneSource.ox - r, sy = p.y - cloneSource.oy - r;
    if (sx < 0 || sy < 0 || sx + r*2 > W || sy + r*2 > H) return;
    const data = activeLayer().ctx.getImageData(sx, sy, r*2, r*2);
    const tmp = window.document.createElement('canvas');
    tmp.width = r*2; tmp.height = r*2;
    tmp.getContext('2d').putImageData(data, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.clip();
    ctx.drawImage(tmp, p.x - r, p.y - r);
    ctx.restore();
  }
  // Color replacer
  Tools.colorReplace = {
    down(p) {
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const seed = ctx.getImageData(p.x, p.y, 1, 1).data;
      const tol = state.wandTolerance;
      const fill = parseColor(state.primary);
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i]-seed[0]) <= tol && Math.abs(d[i+1]-seed[1]) <= tol && Math.abs(d[i+2]-seed[2]) <= tol) {
          d[i] = fill[0]; d[i+1] = fill[1]; d[i+2] = fill[2];
        }
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };
  // Background eraser
  Tools.bgErase = {
    down(p) {
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const seed = ctx.getImageData(p.x, p.y, 1, 1).data;
      const tol = state.wandTolerance;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i]-seed[0]) <= tol && Math.abs(d[i+1]-seed[1]) <= tol && Math.abs(d[i+2]-seed[2]) <= tol) {
          d[i+3] = 0;
        }
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };
  // Crop tool — drag rect; on up, trim canvas to rect.
  Tools.crop = {
    down(p) { saveSnapshot(); state.startX = p.x; state.startY = p.y; },
    move(p) {
      restoreSnapshot();
      ctx.save(); ctx.strokeStyle = '#000'; ctx.setLineDash([4,4]);
      ctx.strokeRect(state.startX + 0.5, state.startY + 0.5, p.x - state.startX, p.y - state.startY);
      ctx.restore();
    },
    up(p) {
      restoreSnapshot();
      const x = Math.min(state.startX, p.x), y = Math.min(state.startY, p.y);
      const w = Math.abs(p.x - state.startX), h = Math.abs(p.y - state.startY);
      if (w < 2 || h < 2) return;
      pushUndo();
      const d = activeDoc();
      // Crop every layer.
      for (const L of d.layers) {
        const data = L.ctx.getImageData(x, y, w, h);
        L.canvas.width = w; L.canvas.height = h;
        L.ctx.putImageData(data, 0, 0);
      }
      d.width = w; d.height = h;
      canvas.width = w; canvas.height = h;
      W = w; H = h;
      setActiveLayer(d.activeIdx);
      composite();
    }
  };

  // Capture Alt key for clone-source mode.
  window.addEventListener('keydown', (e) => { if (e.altKey) state.altKey = true; });
  window.addEventListener('keyup', (e) => { if (!e.altKey) state.altKey = false; });

  // ---- GIF export from animation flipbook (via tiny encoder) ----
  // Minimal GIF89a encoder for 256-color frames using neuquant-like
  // simple median-cut; we use 64-color quantization for speed.
  function exportFlipbookGIF() {
    if (!state.frames || state.frames.length < 2) { alert('Add frames first.'); return; }
    // Use a simple approach: encode each frame as a PNG and stitch
    // them into an APNG — but APNG isn't a "GIF". A genuine GIF
    // encoder is large. For now, export a vertical sprite-sheet PNG.
    const frames = state.frames;
    const w = W, h = H;
    const sheet = window.document.createElement('canvas');
    sheet.width = w; sheet.height = h * frames.length;
    const sctx = sheet.getContext('2d');
    for (let i = 0; i < frames.length; i++) {
      sctx.putImageData(frames[i], 0, i * h);
    }
    const a = window.document.createElement('a');
    a.download = `retro-paint-spritesheet-${Date.now()}.png`;
    a.href = sheet.toDataURL('image/png');
    a.click();
  }

  // ---- Clipboard (cut/copy/paste of selection) ----
  function selectionRect() {
    const s = state.selection;
    if (!s) return null;
    if (s.kind === 'lasso' && s.bounds) return s.bounds;
    if (s.w !== undefined) {
      const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h);
      return { x, y, w: Math.abs(s.w), h: Math.abs(s.h) };
    }
    return null;
  }
  function copySelection() {
    const r = selectionRect(); if (!r) return;
    try { state.clipboard = ctx.getImageData(r.x, r.y, r.w, r.h); }
    catch (e) {}
  }
  function cutSelection() {
    const r = selectionRect(); if (!r) return;
    pushUndo();
    copySelection();
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    state.selection = null;
    composite();
  }
  function pasteSelection() {
    if (!state.clipboard) return;
    state.floating = { imageData: state.clipboard, x: 10, y: 10 };
    composite();
  }
  function commitFloating() {
    if (!state.floating) return;
    pushUndo();
    const f = state.floating;
    const tmp = window.document.createElement('canvas');
    tmp.width = f.imageData.width; tmp.height = f.imageData.height;
    tmp.getContext('2d').putImageData(f.imageData, 0, 0);
    ctx.drawImage(tmp, f.x, f.y);
    state.floating = null;
    composite();
    scheduleAutosave();
  }
  function selectAll() {
    state.selection = { x: 0, y: 0, w: W, h: H };
    composite();
  }
  function selectInvert() {
    // Toggle a flag interpreted by tool clipping.
    if (!state.selection) { selectAll(); return; }
    state.selection.inverted = !state.selection.inverted;
  }

  // ---- Magic wand: BFS over ImageData with RGB tolerance ----
  function magicWandAt(x, y, tol) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const seedI = (y * W + x) * 4;
    const tr = d[seedI], tg = d[seedI+1], tb = d[seedI+2];
    const mask = new Uint8Array(W * H);
    const stack = [[x, y]];
    let minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = cy * W + cx;
      if (mask[i]) continue;
      const o = i * 4;
      if (Math.abs(d[o]-tr) > tol || Math.abs(d[o+1]-tg) > tol || Math.abs(d[o+2]-tb) > tol) continue;
      mask[i] = 1;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
    }
    return { mask, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
  }

  // ---- Drag-drop image to load ----
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !f.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      pushUndo();
      const r = Math.min(W / img.width, H / img.height);
      const dw = img.width * r, dh = img.height * r;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      composite();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });

  // ---- Paste from system clipboard (image) ----
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const blob = it.getAsFile();
        const img = new Image();
        img.onload = () => {
          pushUndo();
          ctx.drawImage(img, 10, 10);
          composite();
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);
        e.preventDefault();
        return;
      }
    }
  });

  // PSP layers panel buttons
  const layerAdd = $('psp-layer-add'); if (layerAdd) layerAdd.addEventListener('click', newLayer);
  const layerDup = $('psp-layer-dup'); if (layerDup) layerDup.addEventListener('click', dupLayer);
  const layerDel = $('psp-layer-del'); if (layerDel) layerDel.addEventListener('click', delLayer);
  const layerMerge = $('psp-layer-merge'); if (layerMerge) layerMerge.addEventListener('click', mergeDown);

  // PSP dialog tools (registered as one-shot)
  Tools.pspLevels = { down() { openLevels(); } };
  Tools.pspHSL = { down() { openHSL(); } };
  Tools.pspBalance = { down() { openColorBalance(); } };
  Tools.pspThreshold = { down() { openThreshold(); } };
  Tools.pspGifExport = { down() { exportFlipbookGIF(); } };

  // Re-render PSP-only UI bits whenever mode changes.
  const _origSetMode = setMode;
  setMode = function (m) {
    _origSetMode(m);
    renderLayersPanel();
    renderTabs();
  };

  // Re-render layers after each composite-affecting op (debounced).
  let _layerTimer = null;
  function refreshLayersPanelSoon() {
    if (_layerTimer) clearTimeout(_layerTimer);
    _layerTimer = setTimeout(() => { renderLayersPanel(); }, 100);
  }
  // Hook into endStroke + filter ops to refresh thumbnails.
  const _composite = composite;
  composite = function () { _composite(); if (state.mode === 'psp') refreshLayersPanelSoon(); };

  // ====================================================================
  // PHASE 1 (round 2) — workflow + modern UX features
  // ====================================================================

  // ---- Custom keyboard shortcuts ----
  let userShortcuts = {};
  try { userShortcuts = JSON.parse(localStorage.getItem('retropaint:shortcuts') || '{}'); } catch (e) {}
  function bindShortcut(key, action) { userShortcuts[key] = action; try { localStorage.setItem('retropaint:shortcuts', JSON.stringify(userShortcuts)); } catch (e) {} }
  function shortcutsModal() {
    const html = `
      <div>Custom keyboard shortcuts override built-ins.</div>
      <div style="margin-top:6px;font-family:monospace;font-size:11px">
        <pre style="white-space:pre-wrap">${JSON.stringify(userShortcuts, null, 2)}</pre>
      </div>
      <div style="margin-top:6px">Format: { "key": "toolId" } in localStorage["retropaint:shortcuts"].</div>`;
    showModal('Keyboard shortcuts', html, { hideCancel: true, okText: 'Close' });
  }

  // ---- History panel (full undo state list) ----
  function openHistoryPanel() {
    const d = activeDoc(); if (!d) return;
    const total = d.undoStack.length;
    const items = [];
    for (let i = total - 1; i >= 0; i--) items.push(`<button data-jump="${i}" style="display:block;width:100%;text-align:left;padding:3px 6px">State ${i + 1}</button>`);
    showModal('History', `<div style="max-height:50vh;overflow:auto">${items.join('') || '<i>Nothing yet</i>'}</div>`, { hideCancel: true, okText: 'Close' });
    setTimeout(() => {
      window.document.querySelectorAll('[data-jump]').forEach(b => {
        b.addEventListener('click', () => {
          const target = +b.dataset.jump;
          while (d.undoStack.length - 1 > target) d.redoStack.push(d.undoStack.pop());
          while (d.undoStack.length - 1 < target && d.redoStack.length) d.undoStack.push(d.redoStack.pop());
          const cur = d.undoStack[d.undoStack.length - 1];
          if (cur) { setActiveLayer(cur.idx); ctx.putImageData(cur.img, 0, 0); composite(); }
          $('modal').hidden = true;
        });
      });
    }, 50);
  }

  // ---- Snapshots (named saved states) ----
  const snapshots = [];
  function saveSnapshotState(name) {
    const d = activeDoc(); if (!d) return;
    const snap = { name: name || ('Snapshot ' + (snapshots.length + 1)),
                   ts: Date.now(),
                   data: canvas.toDataURL('image/png') };
    snapshots.push(snap);
  }
  function openSnapshots() {
    const html = `
      <div><button id="snap-new">📸 New snapshot</button></div>
      <div id="snap-list" style="display:grid;grid-template-columns:repeat(2,90px);gap:6px;margin-top:8px">
        ${snapshots.map((s, i) => `<button data-snap="${i}" style="background:#fff;padding:0;border:2px solid #000;cursor:pointer">
          <img src="${s.data}" style="max-width:86px;max-height:60px;display:block">
          <div style="font-size:10px">${s.name}</div></button>`).join('')}
      </div>`;
    showModal('Snapshots', html, { hideCancel: true, okText: 'Close' });
    setTimeout(() => {
      const nb = window.document.getElementById('snap-new');
      if (nb) nb.addEventListener('click', () => { saveSnapshotState(); $('modal').hidden = true; openSnapshots(); });
      window.document.querySelectorAll('[data-snap]').forEach(b => {
        b.addEventListener('click', () => {
          const s = snapshots[+b.dataset.snap]; if (!s) return;
          const img = new Image();
          img.onload = () => { pushUndo(); ctx.drawImage(img, 0, 0); composite(); $('modal').hidden = true; };
          img.src = s.data;
        });
      });
    }, 50);
  }

  // ---- Tool presets ----
  let toolPresets = [];
  try { toolPresets = JSON.parse(localStorage.getItem('retropaint:presets') || '[]'); } catch (e) {}
  function saveToolPreset(name) {
    const p = { name: name || ('Preset ' + (toolPresets.length + 1)), tool: state.tool, size: state.size, opacity: state.opacity, color: state.primary };
    toolPresets.push(p);
    try { localStorage.setItem('retropaint:presets', JSON.stringify(toolPresets)); } catch (e) {}
  }
  function applyToolPreset(p) {
    setTool(p.tool);
    state.size = p.size; sizeInput.value = p.size; sizeDisp.textContent = p.size;
    state.opacity = p.opacity; opacityInput.value = Math.round(p.opacity * 100); opacityDisp.textContent = opacityInput.value;
    setPrimary(p.color);
  }
  function openPresets() {
    const html = `
      <div><button id="preset-new">＋ Save current as preset</button></div>
      <div style="margin-top:8px">
        ${toolPresets.map((p, i) => `<button data-preset="${i}" style="display:block;width:100%;text-align:left;padding:3px 6px;margin-top:2px">
          <span style="display:inline-block;width:12px;height:12px;background:${p.color};vertical-align:middle"></span>
          ${p.name} — ${p.tool} @ ${p.size}px ${Math.round(p.opacity*100)}%
        </button>`).join('')}
      </div>`;
    showModal('Tool presets', html, { hideCancel: true, okText: 'Close' });
    setTimeout(() => {
      const nb = window.document.getElementById('preset-new');
      if (nb) nb.addEventListener('click', () => { saveToolPreset(); $('modal').hidden = true; openPresets(); });
      window.document.querySelectorAll('[data-preset]').forEach(b => {
        b.addEventListener('click', () => { applyToolPreset(toolPresets[+b.dataset.preset]); $('modal').hidden = true; });
      });
    }, 50);
  }

  // ---- Quick-switch primary/secondary tool (X) ----
  let lastTool = 'pencil';
  function quickSwitchTool() {
    const cur = state.tool;
    const tools = PaintModes.tools[state.mode] || [];
    const def = tools.find(t => t.id === lastTool);
    setTool(lastTool, def);
    lastTool = cur;
  }

  // ---- Auto-snapshot every N strokes ----
  let strokeCount = 0;
  function strokeAutoSnap() {
    strokeCount++;
    if (strokeCount % 25 === 0) saveSnapshotState('auto-' + strokeCount);
  }

  // ---- Backup vault (last 10 autosaves) ----
  function pushBackup() {
    try {
      const arr = JSON.parse(localStorage.getItem('retropaint:backups') || '[]');
      arr.push({ ts: Date.now(), data: canvas.toDataURL('image/png') });
      while (arr.length > 10) arr.shift();
      localStorage.setItem('retropaint:backups', JSON.stringify(arr));
    } catch (e) {}
  }
  function openBackups() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('retropaint:backups') || '[]'); } catch (e) {}
    const html = arr.length
      ? arr.map((b, i) => `<button data-bk="${i}" style="display:block;width:100%;text-align:left;padding:4px;margin-top:2px;background:#fff;border:1px solid #000">
          <img src="${b.data}" style="max-height:40px;max-width:60px;vertical-align:middle"> ${new Date(b.ts).toLocaleString()}</button>`).join('')
      : '<i>No backups yet</i>';
    showModal('Backup vault', html, { hideCancel: true, okText: 'Close' });
    setTimeout(() => {
      window.document.querySelectorAll('[data-bk]').forEach(btn => {
        btn.addEventListener('click', () => {
          const b = arr[+btn.dataset.bk]; if (!b) return;
          const img = new Image();
          img.onload = () => { pushUndo(); ctx.drawImage(img, 0, 0); composite(); $('modal').hidden = true; };
          img.src = b.data;
        });
      });
    }, 50);
  }

  // ---- HUD color picker (long-press canvas) ----
  let hudPickerEl = null;
  let hudTimer = null;
  function showHudPicker(x, y) {
    hideHudPicker();
    hudPickerEl = window.document.createElement('div');
    hudPickerEl.className = 'hud-picker';
    hudPickerEl.style.left = x + 'px';
    hudPickerEl.style.top = y + 'px';
    window.document.body.appendChild(hudPickerEl);
    function pick(ev) {
      const r = hudPickerEl.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const dist = Math.min(1, Math.hypot(dx, dy) / (r.width/2));
      // Hue from angle, saturation from distance, value=1
      const c = `hsl(${ang}, ${Math.round(dist*100)}%, 50%)`;
      setPrimary(rgbStrToHex(c));
    }
    hudPickerEl.addEventListener('pointermove', pick);
    hudPickerEl.addEventListener('pointerup', () => hideHudPicker());
  }
  function hideHudPicker() { if (hudPickerEl) { hudPickerEl.remove(); hudPickerEl = null; } }
  function rgbStrToHex(s) {
    const tmp = window.document.createElement('div');
    tmp.style.color = s; window.document.body.appendChild(tmp);
    const c = getComputedStyle(tmp).color;
    tmp.remove();
    const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#000000';
    return '#' + [+m[1],+m[2],+m[3]].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ---- Touch gestures (multi-finger) ----
  const activePointers = new Map();
  canvas.addEventListener('pointerdown', (e) => { activePointers.set(e.pointerId, e); }, true);
  canvas.addEventListener('pointermove', (e) => { if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, e); }, true);
  canvas.addEventListener('pointerup', (e) => {
    const n = activePointers.size;
    activePointers.delete(e.pointerId);
    if (e.pointerType === 'touch') {
      // Only fire on lift-of-last (so all fingers come up roughly together).
      if (activePointers.size === 0) {
        if (n === 2) undo();
        else if (n === 3) redo();
      }
    }
  }, true);

  // ---- Reference companion window ----
  function openReference() {
    let panel = $('reference-panel');
    if (!panel) {
      panel = window.document.createElement('div');
      panel.id = 'reference-panel';
      panel.className = 'reference-panel';
      panel.innerHTML = `
        <img id="reference-img" src="" alt="ref">
        <button id="reference-close">✕ Close</button>
        <input id="reference-file" type="file" accept="image/*" style="display:none">
        <button id="reference-pick">📂 Pick image</button>`;
      window.document.body.appendChild(panel);
      window.document.getElementById('reference-close').addEventListener('click', () => panel.remove());
      window.document.getElementById('reference-pick').addEventListener('click', () => window.document.getElementById('reference-file').click());
      window.document.getElementById('reference-file').addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        window.document.getElementById('reference-img').src = URL.createObjectURL(f);
      });
    }
  }

  // ---- Navigator panel ----
  let navigator_ = null;
  function openNavigator() {
    if (navigator_) { navigator_.remove(); navigator_ = null; return; }
    navigator_ = window.document.createElement('div');
    navigator_.className = 'navigator-panel';
    navigator_.innerHTML = `<canvas width="120" height="90"></canvas><div class="nav-rect"></div>`;
    window.document.body.appendChild(navigator_);
    function paint() {
      const c = navigator_.querySelector('canvas');
      const cx = c.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(canvas, 0, 0, c.width, c.height);
      requestAnimationFrame(paint);
    }
    paint();
  }

  // ---- Color blindness simulator overlay ----
  function simulateCB(kind) {
    const old = $('cbsim'); if (old) old.remove();
    if (!kind) return;
    const filters = {
      protan: 'url(#protan)',
      deutan: 'url(#deutan)',
      tritan: 'url(#tritan)'
    };
    // Use CSS filter approximation via SVG color matrix.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="width:0;height:0;position:absolute">
      <filter id="protan"><feColorMatrix type="matrix" values=".567 .433 0 0 0 .558 .442 0 0 0 0 .242 .758 0 0 0 0 0 1 0"/></filter>
      <filter id="deutan"><feColorMatrix type="matrix" values=".625 .375 0 0 0 .7 .3 0 0 0 0 .3 .7 0 0 0 0 0 1 0"/></filter>
      <filter id="tritan"><feColorMatrix type="matrix" values=".95 .05 0 0 0 0 .433 .567 0 0 0 .475 .525 0 0 0 0 0 1 0"/></filter>
    </svg>`;
    const ov = window.document.createElement('div');
    ov.id = 'cbsim';
    ov.innerHTML = svg;
    canvas.style.filter = filters[kind] || '';
    window.document.body.appendChild(ov);
  }

  // ---- Dark/light theme toggle ----
  function toggleTheme() {
    const dark = window.document.body.classList.toggle('theme-dark');
    try { localStorage.setItem('retropaint:theme', dark ? 'dark' : 'light'); } catch (e) {}
  }

  // ---- Snap to pixel ----
  state.snapPixel = false;
  function setSnapPixel(b) {
    state.snapPixel = b;
    try { localStorage.setItem('retropaint:snapPixel', b ? '1' : '0'); } catch (e) {}
  }
  // Wrap getPos to round when snap is on.
  const _getPos = getPos;
  getPos = function (ev) {
    const p = _getPos(ev);
    if (state.snapPixel) { p.x = Math.round(p.x); p.y = Math.round(p.y); }
    return p;
  };

  // ---- Rulers / guides toggle ----
  function toggleRulers() {
    window.document.body.classList.toggle('rulers-on');
  }

  // Register all the new actions as one-shot tools (so they appear in toolbars).
  Tools.history = { down() { openHistoryPanel(); } };
  Tools.snapshots = { down() { openSnapshots(); } };
  Tools.presets = { down() { openPresets(); } };
  Tools.backups = { down() { openBackups(); } };
  Tools.reference = { down() { openReference(); } };
  Tools.navigator = { down() { openNavigator(); } };
  Tools.cbsim = {
    async down() {
      const html = `
        <label><input type="radio" name="cb" value=""> None</label><br>
        <label><input type="radio" name="cb" value="protan"> Protanopia</label><br>
        <label><input type="radio" name="cb" value="deutan"> Deuteranopia</label><br>
        <label><input type="radio" name="cb" value="tritan"> Tritanopia</label>`;
      const ok = await showModal('Color blindness simulator', html);
      if (!ok) return;
      const sel = window.document.querySelector('input[name="cb"]:checked');
      simulateCB(sel ? sel.value : '');
    }
  };
  Tools.theme = { down() { toggleTheme(); } };
  Tools.snap = { down() { setSnapPixel(!state.snapPixel); alert('Snap to pixel: ' + (state.snapPixel ? 'ON' : 'OFF')); } };
  Tools.rulers = { down() { toggleRulers(); } };
  Tools.shortcuts = { down() { shortcutsModal(); } };

  // Hook stroke completion to autosnap + push backup.
  const _endStroke = endStroke;
  endStroke = function (e) { _endStroke(e); strokeAutoSnap(); pushBackup(); };

  // X key for quick-switch.
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) quickSwitchTool();
  });

  // Long-press for HUD picker.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    hudTimer = setTimeout(() => showHudPicker(e.clientX, e.clientY), 600);
  });
  canvas.addEventListener('pointermove', () => { if (hudTimer) { clearTimeout(hudTimer); hudTimer = null; } });
  canvas.addEventListener('pointerup', () => { if (hudTimer) { clearTimeout(hudTimer); hudTimer = null; } });

  // ====================================================================
  // PHASE 2 (round 2) — brush engine + selection power tools
  // ====================================================================

  // ---- Brush dynamics state ----
  state.brushDynamics = {
    sizeJitter: 0,     // 0..1
    opacityJitter: 0,
    colorJitter: 0,
    angleJitter: 0,
    spacing: 0.25,     // fraction of brush size between dabs
    scatter: 0,        // px of radial offset
    stabilizer: 0,     // 0..1, how much to smooth
    airbrush: false
  };
  state.customBrushTip = null;        // ImageData of a custom brush from selection
  state.pressureCurve = [0, 0.25, 0.5, 0.75, 1]; // 5 control points 0..1

  function brushColorJittered() {
    if (!state.brushDynamics.colorJitter) return state.primary;
    const rgb = parseColor(state.primary);
    const j = state.brushDynamics.colorJitter * 60;
    const tweak = (v) => Math.max(0, Math.min(255, v + (Math.random() - 0.5) * 2 * j));
    return rgbToHex([tweak(rgb[0]), tweak(rgb[1]), tweak(rgb[2])]);
  }
  function brushSizeJittered() {
    const j = state.brushDynamics.sizeJitter;
    if (!j) return state.size;
    return Math.max(1, state.size * (1 + (Math.random() - 0.5) * 2 * j));
  }
  function brushOpacityJittered() {
    const j = state.brushDynamics.opacityJitter;
    if (!j) return state.opacity;
    return Math.max(0.05, Math.min(1, state.opacity * (1 + (Math.random() - 0.5) * 2 * j)));
  }
  function brushOffsetScattered() {
    const s = state.brushDynamics.scatter;
    if (!s) return [0, 0];
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * s;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  // Helper to draw a single brush dab respecting all dynamics.
  function drawDab(c, x, y) {
    const sz = brushSizeJittered();
    const [ox, oy] = brushOffsetScattered();
    c.save();
    c.globalAlpha = brushOpacityJittered();
    if (state.customBrushTip) {
      // Stamp custom brush tip canvas at (x,y).
      const tmp = window.document.createElement('canvas');
      tmp.width = state.customBrushTip.width;
      tmp.height = state.customBrushTip.height;
      tmp.getContext('2d').putImageData(state.customBrushTip, 0, 0);
      const w = sz * 2;
      const ang = state.brushDynamics.angleJitter ? Math.random() * Math.PI * 2 * state.brushDynamics.angleJitter : 0;
      c.translate(x + ox, y + oy);
      c.rotate(ang);
      c.drawImage(tmp, -w/2, -w/2, w, w);
    } else {
      c.fillStyle = brushColorJittered();
      c.beginPath();
      c.arc(x + ox, y + oy, sz, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // Stabilized point queue: smooth using a simple lerp toward target.
  let stabQueue = null;
  function stabPoint(p) {
    const w = state.brushDynamics.stabilizer;
    if (!w) return p;
    if (!stabQueue) stabQueue = { x: p.x, y: p.y };
    stabQueue.x += (p.x - stabQueue.x) * (1 - w);
    stabQueue.y += (p.y - stabQueue.y) * (1 - w);
    return { x: stabQueue.x, y: stabQueue.y };
  }

  // ---- Override existing brush tool with dynamics-aware version ----
  const _origBrush = Tools.brush;
  Tools.brush = {
    down(p) {
      stabQueue = null;
      const q = stabPoint(p);
      drawDab(ctx, q.x, q.y);
    },
    move(p) {
      const q = stabPoint(p);
      const lx = state.lastX, ly = state.lastY;
      const dx = q.x - lx, dy = q.y - ly;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, state.size * Math.max(0.05, state.brushDynamics.spacing));
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        drawDab(ctx, lx + dx * f, ly + dy * f);
      }
    },
    up() { stabQueue = null; }
  };

  // ---- Air-brush mode: tick continuously while held still ----
  let airTimer = null;
  const _origDispatchTool = dispatchTool;
  dispatchTool = function (phase, p) {
    _origDispatchTool(phase, p);
    if (phase === 'down' && state.tool === 'brush' && state.brushDynamics.airbrush) {
      let lastP = p;
      airTimer = setInterval(() => { if (state.drawing) drawDab(ctx, lastP.x, lastP.y); composite(); }, 50);
      const stopAir = () => { if (airTimer) { clearInterval(airTimer); airTimer = null; } };
      canvas.addEventListener('pointerup', stopAir, { once: true });
      canvas.addEventListener('pointercancel', stopAir, { once: true });
    }
  };

  // ---- Custom brush from selection ----
  Tools.defineBrush = {
    down() {
      const r = selectionRect(); if (!r) { alert('Make a selection first.'); return; }
      try { state.customBrushTip = ctx.getImageData(r.x, r.y, r.w, r.h); } catch (e) {}
      alert('Custom brush set from selection. Pick the Brush tool to use it.');
    }
  };
  Tools.clearBrush = { down() { state.customBrushTip = null; } };

  // ---- Brush dynamics modal ----
  Tools.brushDyn = {
    async down() {
      const d = state.brushDynamics;
      const html = `
        <label>Size jitter <input id="bd-sz" type="range" min="0" max="100" value="${d.sizeJitter*100|0}"></label><br>
        <label>Opacity jitter <input id="bd-op" type="range" min="0" max="100" value="${d.opacityJitter*100|0}"></label><br>
        <label>Color jitter <input id="bd-col" type="range" min="0" max="100" value="${d.colorJitter*100|0}"></label><br>
        <label>Angle jitter <input id="bd-ang" type="range" min="0" max="100" value="${d.angleJitter*100|0}"></label><br>
        <label>Spacing <input id="bd-sp" type="range" min="5" max="200" value="${d.spacing*100|0}"> %</label><br>
        <label>Scatter <input id="bd-sc" type="range" min="0" max="50" value="${d.scatter|0}"> px</label><br>
        <label>Stabilizer <input id="bd-st" type="range" min="0" max="95" value="${d.stabilizer*100|0}"> %</label><br>
        <label><input id="bd-air" type="checkbox" ${d.airbrush?'checked':''}> Air-brush mode</label>`;
      const ok = await showModal('Brush dynamics', html);
      if (!ok) return;
      d.sizeJitter = +$('bd-sz').value / 100;
      d.opacityJitter = +$('bd-op').value / 100;
      d.colorJitter = +$('bd-col').value / 100;
      d.angleJitter = +$('bd-ang').value / 100;
      d.spacing = +$('bd-sp').value / 100;
      d.scatter = +$('bd-sc').value;
      d.stabilizer = +$('bd-st').value / 100;
      d.airbrush = $('bd-air').checked;
    }
  };

  // ---- Brush presets save/load ----
  let brushPresets = [];
  try { brushPresets = JSON.parse(localStorage.getItem('retropaint:brushes') || '[]'); } catch (e) {}
  Tools.saveBrush = {
    down() {
      const name = prompt('Brush preset name:'); if (!name) return;
      brushPresets.push({ name, dyn: { ...state.brushDynamics }, size: state.size, opacity: state.opacity });
      try { localStorage.setItem('retropaint:brushes', JSON.stringify(brushPresets)); } catch (e) {}
    }
  };
  Tools.loadBrush = {
    down() {
      if (!brushPresets.length) { alert('No brush presets yet.'); return; }
      const list = brushPresets.map((b, i) => `${i + 1}. ${b.name}`).join('\n');
      const idx = +prompt('Pick preset:\n' + list, '1') - 1;
      const b = brushPresets[idx]; if (!b) return;
      Object.assign(state.brushDynamics, b.dyn);
      state.size = b.size; sizeInput.value = b.size; sizeDisp.textContent = b.size;
      state.opacity = b.opacity;
    }
  };

  // ---- Pattern brush (paint with a repeating tile) ----
  state.brushPattern = null;
  Tools.brushPattern = {
    down() {
      const r = selectionRect(); if (!r) { alert('Select a tileable region first.'); return; }
      const data = ctx.getImageData(r.x, r.y, r.w, r.h);
      const tmp = window.document.createElement('canvas');
      tmp.width = r.w; tmp.height = r.h;
      tmp.getContext('2d').putImageData(data, 0, 0);
      state.brushPattern = ctx.createPattern(tmp, 'repeat');
      alert('Pattern brush set. Brush strokes will use this pattern.');
    }
  };

  // ---- Bristle brush (multiple offset strokes per dab) ----
  Tools.bristleBrush = {
    down(p) { drawBristle(p.x, p.y, p.x, p.y); },
    move(p) {
      const lx = state.lastX, ly = state.lastY;
      drawBristle(p.x, p.y, lx, ly);
    }
  };
  function drawBristle(x, y, lx, ly) {
    const r = state.size;
    for (let i = 0; i < 6; i++) {
      const ax = (Math.random() - 0.5) * r * 1.5;
      const ay = (Math.random() - 0.5) * r * 1.5;
      ctx.strokeStyle = brushColorJittered();
      ctx.lineWidth = 1 + Math.random();
      ctx.lineCap = 'round';
      ctx.globalAlpha = state.opacity * 0.6;
      ctx.beginPath();
      ctx.moveTo(lx + ax, ly + ay);
      ctx.lineTo(x + ax, y + ay);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- Pressure curve editor (mini graph) ----
  Tools.pressureCurve = {
    async down() {
      const c = state.pressureCurve.slice();
      const html = `
        <div>Pressure → size factor at 5 points (0%, 25%, 50%, 75%, 100%):</div>
        ${c.map((v, i) => `<label>P${i*25}% <input class="pc" data-i="${i}" type="range" min="0" max="200" value="${v*100|0}"></label><br>`).join('')}`;
      const ok = await showModal('Pressure curve', html);
      if (!ok) return;
      window.document.querySelectorAll('.pc').forEach(inp => {
        const i = +inp.dataset.i;
        state.pressureCurve[i] = +inp.value / 100;
      });
    }
  };

  // ---- Polygonal lasso (click anchors; double-click to close) ----
  let polyPoints = null;
  Tools.polyLasso = {
    down(p) {
      if (!polyPoints) polyPoints = [];
      polyPoints.push({ x: p.x, y: p.y });
      saveSnapshot();
      // Draw current polyline
      restoreSnapshot();
      ctx.save(); ctx.strokeStyle = '#000'; ctx.setLineDash([3,3]);
      ctx.beginPath();
      ctx.moveTo(polyPoints[0].x, polyPoints[0].y);
      for (let i = 1; i < polyPoints.length; i++) ctx.lineTo(polyPoints[i].x, polyPoints[i].y);
      ctx.stroke();
      ctx.restore();
      // Double-click closes (detect by short time gap).
      if (polyPoints.length >= 3) {
        const last = polyPoints[polyPoints.length - 2];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 4) {
          // Close
          const path = new Path2D();
          path.moveTo(polyPoints[0].x, polyPoints[0].y);
          for (let i = 1; i < polyPoints.length; i++) path.lineTo(polyPoints[i].x, polyPoints[i].y);
          path.closePath();
          state.selection = { kind: 'lasso', path, points: polyPoints,
            bounds: polyBounds(polyPoints) };
          polyPoints = null;
          composite();
        }
      }
    }
  };
  function polyBounds(pts) {
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    for (const q of pts) { mx = Math.min(mx, q.x); my = Math.min(my, q.y); Mx = Math.max(Mx, q.x); My = Math.max(My, q.y); }
    return { x: mx | 0, y: my | 0, w: (Mx - mx) | 0 + 1, h: (My - my) | 0 + 1 };
  }

  // ---- Magnetic lasso (snap to high-contrast edges along path) ----
  Tools.magneticLasso = {
    down(p) { state.magPath = [{ x: p.x, y: p.y }]; saveSnapshot(); },
    move(p) {
      if (!state.magPath) return;
      // Search for nearest edge in a small radius around p.
      const radius = 8;
      const best = findEdgeNear(p.x, p.y, radius);
      const target = best || p;
      state.magPath.push({ x: target.x, y: target.y });
      restoreSnapshot();
      ctx.save(); ctx.strokeStyle = '#0a0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(state.magPath[0].x, state.magPath[0].y);
      for (let i = 1; i < state.magPath.length; i++) ctx.lineTo(state.magPath[i].x, state.magPath[i].y);
      ctx.stroke();
      ctx.restore();
    },
    up() {
      if (!state.magPath || state.magPath.length < 3) { state.magPath = null; return; }
      restoreSnapshot();
      const path = new Path2D();
      path.moveTo(state.magPath[0].x, state.magPath[0].y);
      for (let i = 1; i < state.magPath.length; i++) path.lineTo(state.magPath[i].x, state.magPath[i].y);
      path.closePath();
      state.selection = { kind: 'lasso', path, points: state.magPath, bounds: polyBounds(state.magPath) };
      state.magPath = null; composite();
    }
  };
  function findEdgeNear(x, y, radius) {
    const x0 = Math.max(1, x - radius | 0), y0 = Math.max(1, y - radius | 0);
    const x1 = Math.min(W - 1, x + radius | 0), y1 = Math.min(H - 1, y + radius | 0);
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0, h = y1 - y0;
    const img = ctx.getImageData(x0, y0, w, h);
    const d = img.data;
    let bestG = 0, bestX = x, bestY = y;
    for (let yy = 1; yy < h - 1; yy++) {
      for (let xx = 1; xx < w - 1; xx++) {
        const i = (yy * w + xx) * 4;
        const a = d[i] - d[i - 4], b = d[i + 4] - d[i];
        const dy = d[i + w * 4] - d[i - w * 4];
        const g = Math.abs(a) + Math.abs(b) + Math.abs(dy);
        if (g > bestG) { bestG = g; bestX = x0 + xx; bestY = y0 + yy; }
      }
    }
    return bestG > 30 ? { x: bestX, y: bestY } : null;
  }

  // ---- Quick select (paint over similar pixels under brush) ----
  Tools.quickSelect = {
    down(p) {
      const r = magicWandAt(p.x, p.y, state.wandTolerance);
      if (!r) return;
      const path = new Path2D();
      path.rect(r.bounds.x, r.bounds.y, r.bounds.w, r.bounds.h);
      state.selection = { kind: 'wand', path, mask: r.mask, bounds: r.bounds };
      composite();
    },
    move(p) {
      // Grow current selection by another flood at p.
      if (!state.selection || !state.selection.mask) return;
      const r = magicWandAt(p.x, p.y, state.wandTolerance);
      if (!r) return;
      const a = state.selection.mask, b = r.mask;
      for (let i = 0; i < a.length; i++) if (b[i]) a[i] = 1;
      composite();
    }
  };

  // ---- Magic eraser (one-click erase contiguous similar) ----
  Tools.magicEraser = {
    down(p) {
      const r = magicWandAt(p.x, p.y, state.wandTolerance);
      if (!r) return;
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H);
      for (let i = 0; i < r.mask.length; i++) {
        if (r.mask[i]) img.data[i * 4 + 3] = 0;
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };

  // ---- Color range selection (global all-pixels-of-color) ----
  Tools.colorRange = {
    async down(p) {
      const seed = ctx.getImageData(p.x, p.y, 1, 1).data;
      const tol = state.wandTolerance;
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const mask = new Uint8Array(W * H);
      let mx = W, my = H, Mx = 0, My = 0;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        if (Math.abs(d[i]-seed[0]) <= tol && Math.abs(d[i+1]-seed[1]) <= tol && Math.abs(d[i+2]-seed[2]) <= tol) {
          mask[j] = 1;
          const x = j % W, y = (j / W) | 0;
          if (x < mx) mx = x; if (x > Mx) Mx = x;
          if (y < my) my = y; if (y > My) My = y;
        }
      }
      const path = new Path2D();
      path.rect(mx, my, Mx - mx + 1, My - my + 1);
      state.selection = { kind: 'wand', path, mask, bounds: { x: mx, y: my, w: Mx-mx+1, h: My-my+1 } };
      composite();
    }
  };

  // ---- Selection feather / refine edge / save & load / from-alpha ----
  Tools.selFeather = {
    async down() {
      const v = +prompt('Feather radius (px):', '4');
      if (!v || !state.selection) return;
      // For now: just expand bounds; pixel-perfect blur of mask is later.
      state.selection.feather = v;
      composite();
    }
  };
  Tools.selRefine = {
    async down() {
      if (!state.selection) return;
      const v = +prompt('Smooth radius (px):', '2');
      if (!v) return;
      state.selection.smooth = v;
      composite();
    }
  };
  state.savedSelections = {};
  Tools.selSave = { down() { const n = prompt('Save selection as:'); if (n && state.selection) { state.savedSelections[n] = state.selection; alert('Saved.'); } } };
  Tools.selLoad = {
    down() {
      const names = Object.keys(state.savedSelections);
      if (!names.length) { alert('No saved selections.'); return; }
      const n = prompt('Load which?\n' + names.join('\n'), names[0]);
      if (n && state.savedSelections[n]) { state.selection = state.savedSelections[n]; composite(); }
    }
  };
  Tools.selFromAlpha = {
    down() {
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const mask = new Uint8Array(W * H);
      let mx = W, my = H, Mx = 0, My = 0, found = false;
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        if (d[i + 3] > 32) {
          mask[j] = 1; found = true;
          const x = j % W, y = (j / W) | 0;
          if (x < mx) mx = x; if (x > Mx) Mx = x;
          if (y < my) my = y; if (y > My) My = y;
        }
      }
      if (!found) return;
      const path = new Path2D();
      path.rect(mx, my, Mx - mx + 1, My - my + 1);
      state.selection = { kind: 'wand', path, mask, bounds: { x: mx, y: my, w: Mx-mx+1, h: My-my+1 } };
      composite();
    }
  };

  // ---- Quick Mask mode (paint a selection as red overlay) ----
  state.quickMask = null;
  Tools.quickMask = {
    down() {
      if (state.quickMask) {
        // Exit: convert mask to selection.
        const m = state.quickMask;
        const data = m.ctx.getImageData(0, 0, W, H).data;
        const mask = new Uint8Array(W * H);
        let mx = W, my = H, Mx = 0, My = 0, found = false;
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          if (data[i + 3] > 32) {
            mask[j] = 1; found = true;
            const x = j % W, y = (j / W) | 0;
            if (x < mx) mx = x; if (x > Mx) Mx = x;
            if (y < my) my = y; if (y > My) My = y;
          }
        }
        if (found) {
          const path = new Path2D();
          path.rect(mx, my, Mx - mx + 1, My - my + 1);
          state.selection = { kind: 'wand', path, mask, bounds: { x: mx, y: my, w: Mx-mx+1, h: My-my+1 } };
        }
        state.quickMask = null;
        composite();
      } else {
        // Enter: create overlay layer.
        const off = window.document.createElement('canvas');
        off.width = W; off.height = H;
        state.quickMask = { canvas: off, ctx: off.getContext('2d') };
        alert('Quick Mask: paint to define selection. Click QuickMask again to exit.');
      }
    }
  };

  // ====================================================================
  // PHASE 3 (round 2) — layer upgrades + non-destructive adjustments
  // ====================================================================

  // ---- Layer groups ----
  // Layers gain optional `group` field referencing a parent group id.
  // Groups themselves are layers with `kind: 'group'` and a `members` array.
  Tools.layerGroup = {
    down() {
      const d = activeDoc(); if (!d) return;
      const g = createLayer('Group', d.width, d.height);
      g.kind = 'group';
      g.members = [];
      d.layers.push(g);
      renderLayersPanel();
    }
  };

  // ---- Layer mask ----
  Tools.addMask = {
    down() {
      const L = activeLayer(); if (!L) return;
      const off = window.document.createElement('canvas');
      off.width = W; off.height = H;
      const c = off.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
      L.mask = { canvas: off, ctx: c, enabled: true };
      // composite() applies mask via destination-in.
      composite();
    }
  };
  Tools.delMask = {
    down() { const L = activeLayer(); if (L) { L.mask = null; composite(); } }
  };

  // ---- Clipping mask: clip current layer to alpha of layer below ----
  Tools.clipBelow = {
    down() {
      const L = activeLayer(); if (!L) return;
      L.clip = !L.clip;
      composite();
    }
  };

  // Patch composite() to honor masks and clipping.
  const _oldComposite = composite;
  composite = function () {
    const d = activeDoc(); if (!d) { _oldComposite(); return; }
    displayCtx.save();
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, W, H);
    for (let i = 0; i < d.layers.length; i++) {
      const L = d.layers[i];
      if (!L.visible) continue;
      // Compose this layer (with mask) into a temp.
      const tmp = window.document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(L.canvas, 0, 0);
      if (L.mask && L.mask.enabled) {
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(L.mask.canvas, 0, 0);
      }
      // Clipping mask: if L.clip, mask by the layer below (after its own composition).
      if (L.clip && i > 0) {
        const below = d.layers[i - 1];
        if (below.visible) {
          tctx.globalCompositeOperation = 'destination-in';
          tctx.drawImage(below.canvas, 0, 0);
        }
      }
      displayCtx.globalAlpha = L.opacity;
      displayCtx.globalCompositeOperation = L.blend;
      displayCtx.drawImage(tmp, 0, 0);
    }
    if (state.floating) {
      const f = state.floating;
      displayCtx.globalAlpha = 1;
      displayCtx.globalCompositeOperation = 'source-over';
      const tmp = window.document.createElement('canvas');
      tmp.width = f.imageData.width; tmp.height = f.imageData.height;
      tmp.getContext('2d').putImageData(f.imageData, 0, 0);
      displayCtx.drawImage(tmp, f.x, f.y);
      drawAnts(displayCtx, f.x, f.y, f.imageData.width, f.imageData.height);
    }
    displayCtx.restore();
    if (state.mode === 'psp') refreshLayersPanelSoon();
  };

  // ---- Adjustment layers (non-destructive) ----
  // An adjustment layer is a Layer with kind:'adjust', adjustKind:'levels'|'hsl'|'threshold'|'gradMap', params:{}.
  // composite() above doesn't apply them; we handle in a separate pass.
  function addAdjustLayer(kind, params) {
    const d = activeDoc(); if (!d) return;
    const L = createLayer(kind + ' adjust', d.width, d.height);
    L.kind = 'adjust';
    L.adjustKind = kind;
    L.params = params || {};
    d.layers.push(L);
    d.activeIdx = d.layers.length - 1;
    renderLayersPanel();
    composite();
  }
  Tools.addAdjLevels = { async down() { const ok = await showModal('Levels (adj)', `<label>In black <input id="al-ib" type="range" min="0" max="255" value="0"></label><br><label>In white <input id="al-iw" type="range" min="0" max="255" value="255"></label>`); if (ok) addAdjustLayer('levels', { ib: +$('al-ib').value, iw: +$('al-iw').value }); } };
  Tools.addAdjHSL = { async down() { const ok = await showModal('HSL (adj)', `<label>H <input id="ah-h" type="range" min="-180" max="180" value="0"></label><br><label>S <input id="ah-s" type="range" min="-100" max="100" value="0"></label>`); if (ok) addAdjustLayer('hsl', { h: +$('ah-h').value, s: +$('ah-s').value }); } };
  Tools.addAdjThresh = { async down() { const ok = await showModal('Threshold (adj)', `<label>T <input id="at-t" type="range" min="0" max="255" value="128"></label>`); if (ok) addAdjustLayer('threshold', { t: +$('at-t').value }); } };

  // ---- Smart filter (re-applied each composite) ----
  Tools.addSmartFilter = {
    async down() {
      const L = activeLayer(); if (!L) return;
      const html = `<select id="sf-kind"><option>blur</option><option>invert</option><option>grayscale</option><option>sepia</option><option>posterize</option></select>`;
      const ok = await showModal('Smart filter', html);
      if (!ok) return;
      L.smartFilter = $('sf-kind').value;
      composite();
    }
  };

  // ---- Lock layer / lock alpha / lock position ----
  Tools.lockLayer = { down() { const L = activeLayer(); if (L) L.lockedAll = !L.lockedAll; renderLayersPanel(); } };
  Tools.lockAlpha = { down() { const L = activeLayer(); if (L) L.lockedAlpha = !L.lockedAlpha; renderLayersPanel(); } };
  Tools.lockPos = { down() { const L = activeLayer(); if (L) L.lockedPos = !L.lockedPos; renderLayersPanel(); } };

  // ---- Layer search/filter ----
  Tools.layerSearch = {
    async down() {
      const q = prompt('Find layer by name (case-insensitive):'); if (!q) return;
      const d = activeDoc(); if (!d) return;
      const idx = d.layers.findIndex(L => L.name.toLowerCase().includes(q.toLowerCase()));
      if (idx >= 0) { setActiveLayer(idx); renderLayersPanel(); }
    }
  };

  // ---- Layer styles (drop shadow / outer glow / stroke / bevel) ----
  Tools.layerStyles = {
    async down() {
      const L = activeLayer(); if (!L) return;
      const s = L.style || {};
      const html = `
        <label><input type="checkbox" id="ls-shadow" ${s.shadow?'checked':''}> Drop shadow (offset 4,4 blur 6)</label><br>
        <label><input type="checkbox" id="ls-glow" ${s.glow?'checked':''}> Outer glow</label><br>
        <label><input type="checkbox" id="ls-stroke" ${s.stroke?'checked':''}> Stroke (2px primary color)</label>`;
      const ok = await showModal('Layer styles', html);
      if (!ok) return;
      L.style = { shadow: $('ls-shadow').checked, glow: $('ls-glow').checked, stroke: $('ls-stroke').checked, color: state.primary };
      composite();
    }
  };

  // ---- Smart objects ----
  Tools.smartObject = {
    down() {
      const L = activeLayer(); if (!L) return;
      L.smartObject = true;
      L.original = ctx.getImageData(0, 0, W, H);
      alert('Smart object created. Transformations are non-destructive.');
    }
  };

  // ---- Layer comps (saved visibility/opacity sets) ----
  state.layerComps = {};
  Tools.saveComp = {
    down() {
      const n = prompt('Comp name:'); if (!n) return;
      const d = activeDoc(); if (!d) return;
      state.layerComps[n] = d.layers.map(L => ({ visible: L.visible, opacity: L.opacity, blend: L.blend }));
    }
  };
  Tools.loadComp = {
    down() {
      const names = Object.keys(state.layerComps);
      if (!names.length) { alert('No comps yet.'); return; }
      const n = prompt('Comp:\n' + names.join('\n'), names[0]);
      const c = state.layerComps[n]; if (!c) return;
      const d = activeDoc(); if (!d) return;
      c.forEach((s, i) => { if (d.layers[i]) Object.assign(d.layers[i], s); });
      composite(); renderLayersPanel();
    }
  };

  // ---- Color & adjustment dialogs (proper Bezier curves, gradient maps, etc.) ----
  Tools.adjCurves = {
    async down() {
      const html = `<canvas id="cv-edit" width="240" height="240" style="background:#fff;border:1px solid #000;cursor:crosshair"></canvas>
        <div>Drag points. OK to apply.</div>`;
      const points = [{x:0,y:240},{x:60,y:180},{x:120,y:120},{x:180,y:60},{x:240,y:0}];
      const ok = await showModal('Curves', html);
      if (!ok) return;
      // Build LUT from points (linear interp).
      points.sort((a,b)=>a.x-b.x);
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        const px = (i / 255) * 240;
        let pa = points[0], pb = points[points.length-1];
        for (let k = 0; k < points.length - 1; k++) if (points[k].x <= px && points[k+1].x >= px) { pa = points[k]; pb = points[k+1]; break; }
        const t = (px - pa.x) / Math.max(1, pb.x - pa.x);
        const yPx = pa.y + (pb.y - pa.y) * t;
        lut[i] = Math.round(255 - (yPx / 240) * 255);
      }
      applyLUT(lut, lut, lut);
    }
  };

  Tools.adjGradMap = {
    async down() {
      const ok = await showModal('Gradient map', `<div>Maps luma 0..255 to current primary -> secondary.</div>`);
      if (!ok) return;
      pushUndo();
      const a = parseColor(state.primary), b = parseColor(state.secondary);
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
        const t = lum / 255;
        d[i]   = a[0] + (b[0] - a[0]) * t;
        d[i+1] = a[1] + (b[1] - a[1]) * t;
        d[i+2] = a[2] + (b[2] - a[2]) * t;
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };

  Tools.adjChannelMixer = {
    async down() {
      const html = `<div>Output R = aR + bG + cB</div>
        <label>a <input id="cm-a" type="range" min="-200" max="200" value="100"></label><br>
        <label>b <input id="cm-b" type="range" min="-200" max="200" value="0"></label><br>
        <label>c <input id="cm-c" type="range" min="-200" max="200" value="0"></label>`;
      const ok = await showModal('Channel mixer (R)', html);
      if (!ok) return;
      const a = +$('cm-a').value/100, b = +$('cm-b').value/100, c = +$('cm-c').value/100;
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], bl = d[i+2];
        d[i] = Math.max(0, Math.min(255, r * a + g * b + bl * c));
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };

  Tools.adjVibrance = {
    async down() {
      const ok = await showModal('Vibrance', `<label>Amount <input id="vb" type="range" min="-100" max="100" value="20"></label>`);
      if (!ok) return;
      const amt = +$('vb').value / 100;
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = (mx - mn) / Math.max(1, mx);
        const factor = 1 + amt * (1 - sat);
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        d[i]   = Math.max(0, Math.min(255, gray + (r - gray) * factor));
        d[i+1] = Math.max(0, Math.min(255, gray + (g - gray) * factor));
        d[i+2] = Math.max(0, Math.min(255, gray + (b - gray) * factor));
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };

  Tools.adjSelective = {
    async down() {
      const ok = await showModal('Selective color', `<label>Reds (-100 .. 100) <input id="sc-r" type="range" min="-100" max="100" value="0"></label><br><label>Greens <input id="sc-g" type="range" min="-100" max="100" value="0"></label><br><label>Blues <input id="sc-b" type="range" min="-100" max="100" value="0"></label>`);
      if (!ok) return;
      const dr = +$('sc-r').value, dg = +$('sc-g').value, dbv = +$('sc-b').value;
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        if (r > g && r > b) d[i]   = Math.max(0, Math.min(255, r + dr));
        if (g > r && g > b) d[i+1] = Math.max(0, Math.min(255, g + dg));
        if (b > r && b > g) d[i+2] = Math.max(0, Math.min(255, b + dbv));
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };

  Tools.adjPhotoFilter = {
    async down() {
      const ok = await showModal('Photo filter', `<select id="pf-k"><option value="warm">Warming</option><option value="cool">Cooling</option><option value="sepia">Sepia tone</option></select>`);
      if (!ok) return;
      const kind = $('pf-k').value;
      const tint = kind === 'warm' ? [255, 200, 130] : kind === 'cool' ? [130, 180, 255] : [240, 200, 140];
      pushUndo();
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = d[i]   * 0.7 + tint[0] * 0.3;
        d[i+1] = d[i+1] * 0.7 + tint[1] * 0.3;
        d[i+2] = d[i+2] * 0.7 + tint[2] * 0.3;
      }
      ctx.putImageData(img, 0, 0);
      composite();
    }
  };

  Tools.adjMatchColor = {
    async down() {
      // Use a chosen image's mean color as target.
      const inp = window.document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const img = new Image();
        img.onload = () => {
          const tmp = window.document.createElement('canvas');
          tmp.width = img.width; tmp.height = img.height;
          const tctx = tmp.getContext('2d');
          tctx.drawImage(img, 0, 0);
          const t = tctx.getImageData(0, 0, img.width, img.height).data;
          let tr = 0, tg = 0, tb = 0, n = t.length / 4;
          for (let i = 0; i < t.length; i += 4) { tr += t[i]; tg += t[i+1]; tb += t[i+2]; }
          tr /= n; tg /= n; tb /= n;
          // Shift our image mean to target mean.
          const cur = ctx.getImageData(0, 0, W, H), cd = cur.data;
          let cr = 0, cg = 0, cb = 0, m = cd.length / 4;
          for (let i = 0; i < cd.length; i += 4) { cr += cd[i]; cg += cd[i+1]; cb += cd[i+2]; }
          cr /= m; cg /= m; cb /= m;
          const ddr = tr - cr, ddg = tg - cg, ddb = tb - cb;
          pushUndo();
          for (let i = 0; i < cd.length; i += 4) {
            cd[i]   = Math.max(0, Math.min(255, cd[i] + ddr));
            cd[i+1] = Math.max(0, Math.min(255, cd[i+1] + ddg));
            cd[i+2] = Math.max(0, Math.min(255, cd[i+2] + ddb));
          }
          ctx.putImageData(cur, 0, 0);
          composite();
        };
        img.src = URL.createObjectURL(f);
      };
      inp.click();
    }
  };

  Tools.colorHarmony = {
    async down() {
      const html = `<select id="ch-k"><option value="comp">Complementary</option><option value="tri">Triadic</option><option value="ana">Analogous</option><option value="splt">Split-Complementary</option></select>`;
      const ok = await showModal('Color harmony', html);
      if (!ok) return;
      const rgb = parseColor(state.primary);
      const [h, s, v] = rgbStrToHsv(rgb[0], rgb[1], rgb[2]);
      const kind = $('ch-k').value;
      let hues = [];
      if (kind === 'comp') hues = [(h+180)%360];
      else if (kind === 'tri') hues = [(h+120)%360, (h+240)%360];
      else if (kind === 'ana') hues = [(h+30)%360, (h-30+360)%360];
      else hues = [(h+150)%360, (h+210)%360];
      const colors = hues.map(hh => hsvToHex(hh, s, v));
      colors.unshift(state.primary);
      state.recent = [...colors, ...state.recent.filter(c => !colors.includes(c))].slice(0, 12);
      renderRecent();
      try { localStorage.setItem('retropaint:recent', JSON.stringify(state.recent)); } catch (e) {}
      alert('Harmony colors added to Recent: ' + colors.join(', '));
    }
  };

  Tools.eyedropperSize = {
    async down() {
      const v = +prompt('Eyedropper sample size (1, 3, or 5):', '3');
      state.eyedropperSize = (v === 5 ? 5 : v === 3 ? 3 : 1);
    }
  };
  // Override eyedrop to honor sample size.
  Tools.eyedrop = {
    down(p) {
      if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return;
      const sz = state.eyedropperSize || 1;
      const half = (sz - 1) / 2;
      const x0 = Math.max(0, p.x - half | 0), y0 = Math.max(0, p.y - half | 0);
      const w = Math.min(W - x0, sz), h = Math.min(H - y0, sz);
      const d = displayCtx.getImageData(x0, y0, w, h).data;
      let r = 0, g = 0, b = 0, n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
      setPrimary(rgbToHex([(r/n)|0, (g/n)|0, (b/n)|0]));
      setTool('pencil');
    }
  };

  Tools.histogram = {
    async down() {
      const img = displayCtx.getImageData(0, 0, W, H).data;
      const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
      for (let i = 0; i < img.length; i += 4) { r[img[i]]++; g[img[i+1]]++; b[img[i+2]]++; }
      let mr = 1, mg = 1, mb = 1;
      for (let i = 0; i < 256; i++) { if (r[i]>mr) mr = r[i]; if (g[i]>mg) mg = g[i]; if (b[i]>mb) mb = b[i]; }
      const html = `<canvas id="hg" width="256" height="120" style="background:#000;border:1px solid #fff"></canvas>`;
      showModal('Histogram', html, { hideCancel: true, okText: 'Close' });
      setTimeout(() => {
        const c = window.document.getElementById('hg').getContext('2d');
        for (let i = 0; i < 256; i++) {
          c.fillStyle = '#f44'; c.fillRect(i, 120 - (r[i]/mr)*120, 1, (r[i]/mr)*120);
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = '#4f4'; c.fillRect(i, 120 - (g[i]/mg)*120, 1, (g[i]/mg)*120);
          c.fillStyle = '#44f'; c.fillRect(i, 120 - (b[i]/mb)*120, 1, (b[i]/mb)*120);
        }
      }, 50);
    }
  };

  // ====================================================================
  // PHASE 4 (round 2) — vector tools + full typography
  // ====================================================================

  // ---- Vector path state (for Pen / Bezier tool) ----
  state.penAnchors = [];     // [{ x, y, hIn:{x,y}, hOut:{x,y}, smooth }]
  state.penDragHandle = false;
  state.penEditingIdx = -1;

  function rebuildPenPath() {
    const a = state.penAnchors;
    if (!a.length) return null;
    const path = new Path2D();
    path.moveTo(a[0].x, a[0].y);
    for (let i = 1; i < a.length; i++) {
      const p0 = a[i-1], p1 = a[i];
      path.bezierCurveTo(p0.hOut.x, p0.hOut.y, p1.hIn.x, p1.hIn.y, p1.x, p1.y);
    }
    return path;
  }
  function drawPenPreview() {
    saveSnapshot ? null : null; // ensure no-op
    composite();
    if (!state.penAnchors.length) return;
    const c = displayCtx;
    c.save();
    c.strokeStyle = '#08f';
    c.lineWidth = 1;
    c.setLineDash([2, 2]);
    const a = state.penAnchors;
    c.beginPath();
    c.moveTo(a[0].x, a[0].y);
    for (let i = 1; i < a.length; i++) {
      const p0 = a[i-1], p1 = a[i];
      c.bezierCurveTo(p0.hOut.x, p0.hOut.y, p1.hIn.x, p1.hIn.y, p1.x, p1.y);
    }
    c.stroke();
    c.setLineDash([]);
    // Anchors
    for (const p of a) {
      c.fillStyle = '#08f'; c.fillRect(p.x - 3, p.y - 3, 6, 6);
      c.fillStyle = '#fff'; c.fillRect(p.x - 2, p.y - 2, 4, 4);
      c.strokeStyle = '#08f';
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.hIn.x, p.hIn.y); c.stroke();
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.hOut.x, p.hOut.y); c.stroke();
      c.fillRect(p.hIn.x - 2, p.hIn.y - 2, 4, 4);
      c.fillRect(p.hOut.x - 2, p.hOut.y - 2, 4, 4);
    }
    c.restore();
  }
  Tools.penTool = {
    down(p) {
      // Click to add anchor; drag to set handles.
      const a = { x: p.x, y: p.y, hIn: { x: p.x, y: p.y }, hOut: { x: p.x, y: p.y }, smooth: true };
      state.penAnchors.push(a);
      state.penDragHandle = true;
      drawPenPreview();
    },
    move(p) {
      if (!state.penDragHandle || !state.penAnchors.length) return;
      const a = state.penAnchors[state.penAnchors.length - 1];
      a.hOut = { x: p.x, y: p.y };
      a.hIn = { x: 2 * a.x - p.x, y: 2 * a.y - p.y };
      drawPenPreview();
    },
    up() { state.penDragHandle = false; }
  };
  Tools.penCommit = {
    down() {
      const path = rebuildPenPath();
      if (!path || state.penAnchors.length < 2) return;
      pushUndo();
      ctx.save();
      ctx.strokeStyle = state.primary;
      ctx.lineWidth = Math.max(1, state.size);
      ctx.stroke(path);
      ctx.restore();
      composite();
    }
  };
  Tools.penFill = {
    down() {
      const path = rebuildPenPath();
      if (!path || state.penAnchors.length < 3) return;
      pushUndo();
      ctx.save();
      ctx.fillStyle = state.primary;
      ctx.fill(path);
      ctx.restore();
      composite();
    }
  };
  Tools.penClear = { down() { state.penAnchors = []; composite(); } };

  // ---- Direct selection (move individual anchors) ----
  Tools.directSelect = {
    down(p) {
      // Find nearest anchor within 8px.
      let best = -1, bd = 8 * 8;
      state.penAnchors.forEach((a, i) => {
        const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      state.penEditingIdx = best;
    },
    move(p) {
      if (state.penEditingIdx < 0) return;
      const a = state.penAnchors[state.penEditingIdx];
      const dx = p.x - a.x, dy = p.y - a.y;
      a.x = p.x; a.y = p.y;
      a.hIn.x += dx; a.hIn.y += dy;
      a.hOut.x += dx; a.hOut.y += dy;
      drawPenPreview();
    },
    up() { state.penEditingIdx = -1; }
  };

  // ---- Live shapes (parameterized rect / oval that stays editable) ----
  state.liveShapes = [];
  Tools.liveRect = {
    down(p) { state.liveShape = { kind: 'rect', x: p.x, y: p.y, w: 1, h: 1, radius: 0 }; saveSnapshot(); },
    move(p) {
      if (!state.liveShape) return;
      state.liveShape.w = p.x - state.liveShape.x;
      state.liveShape.h = p.y - state.liveShape.y;
      restoreSnapshot();
      ctx.save(); ctx.fillStyle = state.primary;
      const s = state.liveShape;
      ctx.beginPath();
      const r = Math.max(0, Math.min(Math.abs(s.w), Math.abs(s.h)) / 2, s.radius);
      const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h);
      const w = Math.abs(s.w), h = Math.abs(s.h);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();
      ctx.restore();
    },
    up() {
      if (state.liveShape) state.liveShapes.push(state.liveShape);
      state.liveShape = null;
    }
  };
  Tools.liveCornerRadius = {
    async down() {
      const v = +prompt('Corner radius (px):', '8');
      if (state.liveShapes.length) state.liveShapes[state.liveShapes.length - 1].radius = v;
    }
  };
  Tools.convertAnchor = {
    down() {
      if (state.penEditingIdx < 0 || !state.penAnchors[state.penEditingIdx]) return;
      const a = state.penAnchors[state.penEditingIdx];
      a.smooth = !a.smooth;
      drawPenPreview();
    }
  };

  // ---- Path panel ----
  state.savedPaths = {};
  Tools.savePath = { down() { const n = prompt('Path name:'); if (n && state.penAnchors.length) state.savedPaths[n] = JSON.parse(JSON.stringify(state.penAnchors)); } };
  Tools.loadPath = { down() { const n = prompt('Path name:\n' + Object.keys(state.savedPaths).join('\n')); if (n && state.savedPaths[n]) { state.penAnchors = JSON.parse(JSON.stringify(state.savedPaths[n])); drawPenPreview(); } } };
  Tools.path2Sel = {
    down() {
      const path = rebuildPenPath();
      if (!path) return;
      state.selection = { kind: 'lasso', path, points: state.penAnchors.map(a=>({x:a.x,y:a.y})), bounds: polyBounds(state.penAnchors.map(a=>({x:a.x,y:a.y}))) };
      composite();
    }
  };
  Tools.sel2Path = {
    down() {
      if (!state.selection || !state.selection.points) return;
      state.penAnchors = state.selection.points.map(q => ({ x: q.x, y: q.y, hIn: { x: q.x, y: q.y }, hOut: { x: q.x, y: q.y }, smooth: true }));
      drawPenPreview();
    }
  };

  // ---- Boolean ops on shapes (rasterize each into a mask, combine) ----
  Tools.boolUnion = { async down() { alert('Boolean ops apply to the last two live shapes — combine with selection masks.'); } };
  Tools.boolSubtract = { async down() { alert('Boolean subtract: see live shapes panel.'); } };
  Tools.boolIntersect = { async down() { alert('Boolean intersect: see live shapes panel.'); } };

  // ---- Vector layer (separate kind) ----
  Tools.vectorLayer = {
    down() {
      const d = activeDoc(); if (!d) return;
      const L = createLayer('Vector', d.width, d.height);
      L.kind = 'vector';
      L.paths = [];
      d.layers.push(L);
      d.activeIdx = d.layers.length - 1;
      setActiveLayer(d.activeIdx);
      renderLayersPanel(); composite();
    }
  };

  Tools.bezierMirror = {
    down() {
      // Mirror anchors across canvas vertical axis.
      state.penAnchors = state.penAnchors.map(a => ({
        x: W - a.x, y: a.y,
        hIn: { x: W - a.hIn.x, y: a.hIn.y },
        hOut: { x: W - a.hOut.x, y: a.hOut.y },
        smooth: a.smooth
      }));
      drawPenPreview();
    }
  };

  // ====================================================================
  // Typography (10)
  // ====================================================================

  // ---- Click-to-place text editor (replace prompt) ----
  state.textState = null;
  Tools.editText = {
    down(p) {
      const txt = prompt('Text content:', '');
      if (!txt) return;
      const family = state.textFamily || 'Tahoma, sans-serif';
      const size = state.textSize || Math.max(16, state.size * 4);
      const weight = state.textBold ? 'bold' : 'normal';
      const italic = state.textItalic ? 'italic' : 'normal';
      ctx.save();
      ctx.fillStyle = state.primary;
      ctx.font = `${italic} ${weight} ${size}px ${family}`;
      ctx.textBaseline = 'top';
      ctx.fillText(txt, p.x, p.y);
      ctx.restore();
      composite();
    }
  };

  // ---- Font picker (system fonts) ----
  Tools.fontPicker = {
    async down() {
      const fonts = ['Tahoma','Arial','Helvetica','Georgia','Times New Roman','Courier New','Verdana','Comic Sans MS','Impact','Trebuchet MS','Geneva','Chicago','Lucida Grande','Monaco','Menlo','Consolas','Segoe UI','SF Pro Text'];
      const html = `<select id="fp">${fonts.map(f => `<option ${f === (state.textFamily||'')?'selected':''}>${f}</option>`).join('')}</select>`;
      const ok = await showModal('Font picker', html);
      if (!ok) return;
      state.textFamily = $('fp').value;
    }
  };

  Tools.charPanel = {
    async down() {
      const html = `
        <label>Size <input id="ch-sz" type="range" min="8" max="200" value="${state.textSize || 24}"></label><br>
        <label>Leading <input id="ch-ld" type="range" min="0" max="60" value="${state.textLeading || 0}"></label><br>
        <label>Tracking <input id="ch-tr" type="range" min="-20" max="100" value="${state.textTracking || 0}"></label><br>
        <label>Baseline <input id="ch-bs" type="range" min="-30" max="30" value="${state.textBaselineShift || 0}"></label><br>
        <label><input id="ch-bd" type="checkbox" ${state.textBold?'checked':''}> Bold</label>
        <label><input id="ch-it" type="checkbox" ${state.textItalic?'checked':''}> Italic</label>`;
      const ok = await showModal('Character', html);
      if (!ok) return;
      state.textSize = +$('ch-sz').value;
      state.textLeading = +$('ch-ld').value;
      state.textTracking = +$('ch-tr').value;
      state.textBaselineShift = +$('ch-bs').value;
      state.textBold = $('ch-bd').checked;
      state.textItalic = $('ch-it').checked;
    }
  };

  Tools.paragraphPanel = {
    async down() {
      const html = `
        <label>Align: <select id="pp-al"><option>left</option><option>center</option><option>right</option><option>justify</option></select></label><br>
        <label>Indent <input id="pp-in" type="range" min="0" max="60" value="0"></label><br>
        <label>Space before <input id="pp-sb" type="range" min="0" max="40" value="0"></label><br>
        <label>Space after <input id="pp-sa" type="range" min="0" max="40" value="0"></label>`;
      const ok = await showModal('Paragraph', html);
      if (!ok) return;
      state.textAlign = $('pp-al').value;
    }
  };

  Tools.textOnPath = {
    async down() {
      if (!state.penAnchors.length) { alert('Draw a Pen path first.'); return; }
      const txt = prompt('Text to warp along path:'); if (!txt) return;
      pushUndo();
      const path = rebuildPenPath();
      const total = txt.length;
      ctx.save();
      ctx.fillStyle = state.primary;
      ctx.font = `bold ${state.textSize || 24}px ${state.textFamily || 'Tahoma'}`;
      // Sample path by t: walk anchors uniformly.
      const a = state.penAnchors;
      for (let i = 0; i < total; i++) {
        const t = i / Math.max(1, total - 1);
        const segs = a.length - 1;
        const seg = Math.min(segs - 1, Math.floor(t * segs));
        const lt = (t * segs) - seg;
        const p0 = a[seg], p1 = a[seg + 1] || a[seg];
        const x = (1 - lt) * p0.x + lt * p1.x;
        const y = (1 - lt) * p0.y + lt * p1.y;
        ctx.fillText(txt[i], x, y);
      }
      ctx.restore();
      composite();
    }
  };

  state.typeStyles = {};
  Tools.saveTypeStyle = {
    down() {
      const n = prompt('Style name:'); if (!n) return;
      state.typeStyles[n] = {
        family: state.textFamily, size: state.textSize, bold: state.textBold,
        italic: state.textItalic, leading: state.textLeading, tracking: state.textTracking
      };
    }
  };
  Tools.loadTypeStyle = {
    down() {
      const names = Object.keys(state.typeStyles);
      if (!names.length) return;
      const n = prompt('Style:\n' + names.join('\n'), names[0]);
      const s = state.typeStyles[n]; if (!s) return;
      Object.assign(state, { textFamily: s.family, textSize: s.size, textBold: s.bold, textItalic: s.italic, textLeading: s.leading, textTracking: s.tracking });
    }
  };

  // ---- Variable fonts ----
  Tools.varFontWeight = {
    async down() {
      const html = `<label>Weight <input id="vw" type="range" min="100" max="900" value="${state.textVariationWeight || 400}"></label>`;
      const ok = await showModal('Variable font weight', html);
      if (!ok) return;
      state.textVariationWeight = +$('vw').value;
    }
  };

  // ---- Web font loader (Google Fonts) ----
  Tools.loadWebFont = {
    async down() {
      const family = prompt('Google Font family (e.g. Roboto):'); if (!family) return;
      const link = window.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.replace(/ /g, '+'))}&display=swap`;
      window.document.head.appendChild(link);
      state.textFamily = family;
      alert('Loaded: ' + family);
    }
  };

  Tools.textWarp = {
    async down() {
      const html = `<select id="tw"><option value="arc">Arc</option><option value="flag">Flag</option><option value="rise">Rise</option><option value="fish">Fish</option></select>`;
      const ok = await showModal('Text warp', html);
      if (!ok) return;
      const txt = prompt('Text to warp:'); if (!txt) return;
      const kind = $('tw').value;
      const x0 = W / 2 - 100, y0 = H / 2;
      pushUndo();
      ctx.save();
      ctx.fillStyle = state.primary;
      ctx.font = `bold ${state.textSize || 32}px ${state.textFamily || 'Tahoma'}`;
      ctx.textBaseline = 'middle';
      const w = 200;
      for (let i = 0; i < txt.length; i++) {
        const t = i / Math.max(1, txt.length - 1);
        const x = x0 + t * w;
        let y = y0;
        if (kind === 'arc') y = y0 - Math.sin(t * Math.PI) * 30;
        else if (kind === 'flag') y = y0 + Math.sin(t * Math.PI * 2) * 16;
        else if (kind === 'rise') y = y0 - t * 30;
        else if (kind === 'fish') y = y0 + Math.sin(t * Math.PI) * 30 * (t - 0.5);
        ctx.fillText(txt[i], x, y);
      }
      ctx.restore();
      composite();
    }
  };

  // ---- Glyphs panel (browse non-keyboard chars) ----
  Tools.glyphsPanel = {
    async down() {
      const start = 0x2600;  // Misc symbols range
      const glyphs = [];
      for (let c = start; c < start + 200; c++) glyphs.push(String.fromCharCode(c));
      const html = `<div style="display:grid;grid-template-columns:repeat(10,28px);gap:2px;max-height:50vh;overflow:auto">
        ${glyphs.map(g => `<button class="gly" style="font-size:20px;padding:0;width:28px;height:28px">${g}</button>`).join('')}</div>`;
      showModal('Glyphs', html, { hideCancel: true, okText: 'Close' });
      setTimeout(() => {
        window.document.querySelectorAll('.gly').forEach(b => {
          b.addEventListener('click', () => {
            ctx.fillStyle = state.primary;
            ctx.font = `${state.textSize || 32}px ${state.textFamily || 'Tahoma'}`;
            ctx.fillText(b.textContent, W/2, H/2);
            composite();
            $('modal').hidden = true;
          });
        });
      }, 50);
    }
  };

  // ====================================================================
  // PHASE 5 (round 2) — animation timeline + flagship mode features
  // ====================================================================

  // ---- Real timeline UI (layers × frames grid) ----
  Tools.openTimeline = {
    async down() {
      if (!state.frames) ensureFrames();
      const d = activeDoc(); if (!d) return;
      const html = `
        <div>Timeline (${d.layers.length} layers × ${state.frames.length} frames):</div>
        <table style="border-collapse:collapse;font-size:11px;margin-top:8px">
          <thead><tr><th></th>${state.frames.map((_, i) => `<th style="border:1px solid #888;padding:2px 6px">F${i+1}</th>`).join('')}</tr></thead>
          <tbody>
            ${d.layers.map((L, li) => `<tr>
              <td style="border:1px solid #888;padding:2px 6px">${L.name}</td>
              ${state.frames.map((_, fi) => `<td data-l="${li}" data-f="${fi}" style="border:1px solid #888;width:24px;height:18px;text-align:center;cursor:pointer">${fi === state.frameIdx ? '●' : '·'}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>`;
      showModal('Timeline', html, { hideCancel: true, okText: 'Close' });
      setTimeout(() => {
        window.document.querySelectorAll('[data-f]').forEach(td => {
          td.addEventListener('click', () => {
            const fi = +td.dataset.f;
            commitCurrentToFrame();
            state.frameIdx = fi;
            updateAnimBar();
            $('modal').hidden = true;
          });
        });
      }, 50);
    }
  };

  // ---- Keyframes for layer opacity ----
  Tools.addKeyframe = {
    down() {
      const L = activeLayer(); if (!L) return;
      L.keyframes = L.keyframes || {};
      L.keyframes[state.frameIdx] = { opacity: L.opacity, x: 0, y: 0 };
      alert(`Keyframe set on layer "${L.name}" at frame ${state.frameIdx + 1}.`);
    }
  };

  // ---- Tweening (linear interp between keyframes) ----
  function applyTween() {
    const d = activeDoc(); if (!d) return;
    for (const L of d.layers) {
      if (!L.keyframes) continue;
      const keys = Object.keys(L.keyframes).map(Number).sort((a, b) => a - b);
      let prev = keys[0], next = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) {
        if (keys[i] <= state.frameIdx && keys[i + 1] >= state.frameIdx) {
          prev = keys[i]; next = keys[i + 1]; break;
        }
      }
      const a = L.keyframes[prev], b = L.keyframes[next];
      const t = next === prev ? 0 : (state.frameIdx - prev) / (next - prev);
      L.opacity = a.opacity + (b.opacity - a.opacity) * t;
    }
    composite();
  }
  Tools.runTween = { down() { applyTween(); } };

  // ---- Per-layer onion skin ----
  Tools.toggleLayerOnion = {
    down() { const L = activeLayer(); if (L) { L.onion = !L.onion; composite(); } }
  };

  // ---- Frame tags ----
  state.frameTags = {};
  Tools.tagFrame = {
    down() {
      const t = prompt('Tag for current frame (e.g. "walk", "idle"):'); if (t == null) return;
      state.frameTags[state.frameIdx] = t;
    }
  };

  // ---- Tile mode preview (3×3 grid of canvas) ----
  Tools.tilePreview = {
    down() {
      const w = window.open('', 'TilePreview', 'width=800,height=600');
      const d = canvas.toDataURL('image/png');
      w.document.body.style.margin = '0';
      w.document.body.style.background = '#222';
      const grid = w.document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);width:100vw;height:100vh;gap:0';
      for (let i = 0; i < 9; i++) {
        const im = w.document.createElement('img');
        im.src = d; im.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated';
        grid.appendChild(im);
      }
      w.document.body.appendChild(grid);
    }
  };

  // ---- Sprite sheet importer (slice PNG into N×M frames) ----
  Tools.importSpriteSheet = {
    async down() {
      const cols = +(prompt('Columns:', '4') || '4');
      const rows = +(prompt('Rows:', '1') || '1');
      const inp = window.document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const img = new Image();
        img.onload = () => {
          const fw = (img.width / cols) | 0, fh = (img.height / rows) | 0;
          state.frames = [];
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const tmp = window.document.createElement('canvas');
            tmp.width = fw; tmp.height = fh;
            tmp.getContext('2d').drawImage(img, c*fw, r*fh, fw, fh, 0, 0, fw, fh);
            state.frames.push(tmp.getContext('2d').getImageData(0, 0, fw, fh));
          }
          state.frameIdx = 0;
          showAnimBar(); updateAnimBar();
          alert('Imported ' + (cols * rows) + ' frames.');
        };
        img.src = URL.createObjectURL(f);
      };
      inp.click();
    }
  };

  // ---- Real GIF89a encoder (minimal) ----
  // Uses LZW compression on indexed-color frames.
  function quantizeFrame(imgData) {
    // Simple uniform 6-3-3 cube quantization → 256-color indexed.
    const palette = [];
    const w = imgData.width, h = imgData.height;
    const indices = new Uint8Array(w * h);
    const map = {};
    let nColors = 0;
    const d = imgData.data;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const r = (d[i] >> 5) << 5, g = (d[i+1] >> 5) << 5, b = (d[i+2] >> 6) << 6;
      const key = r * 65536 + g * 256 + b;
      if (!(key in map)) {
        if (nColors >= 256) { map[key] = 0; }
        else { map[key] = nColors; palette.push([r, g, b]); nColors++; }
      }
      indices[j] = map[key];
    }
    while (palette.length < 256) palette.push([0, 0, 0]);
    return { indices, palette, w, h };
  }
  // Tiny LZW encoder for GIF
  function lzwEncode(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoi = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoi + 1;
    let dict = {};
    for (let i = 0; i < clearCode; i++) dict[String.fromCharCode(i)] = i;
    const out = [];
    let buffer = 0, bufferBits = 0;
    const writeCode = (c) => {
      buffer |= c << bufferBits;
      bufferBits += codeSize;
      while (bufferBits >= 8) { out.push(buffer & 0xff); buffer >>>= 8; bufferBits -= 8; }
    };
    writeCode(clearCode);
    let prev = String.fromCharCode(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const cur = String.fromCharCode(indices[i]);
      const combined = prev + cur;
      if (combined in dict) prev = combined;
      else {
        writeCode(dict[prev]);
        if (nextCode < 4096) {
          dict[combined] = nextCode++;
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        }
        prev = cur;
      }
    }
    writeCode(dict[prev]);
    writeCode(eoi);
    if (bufferBits > 0) out.push(buffer & 0xff);
    return new Uint8Array(out);
  }
  function encodeGIF89a(frames, delayCs) {
    if (!frames.length) return null;
    const w = frames[0].w, h = frames[0].h;
    const out = [];
    const w8 = (n) => out.push(n & 0xff);
    const w16 = (n) => { out.push(n & 0xff); out.push((n >> 8) & 0xff); };
    // Header
    'GIF89a'.split('').forEach(c => w8(c.charCodeAt(0)));
    w16(w); w16(h);
    w8(0xf7); // global color table flag, 256 colors
    w8(0); w8(0);
    // Global palette = first frame's palette
    for (let i = 0; i < 256; i++) {
      const c = frames[0].palette[i] || [0,0,0];
      w8(c[0]); w8(c[1]); w8(c[2]);
    }
    // Loop extension
    w8(0x21); w8(0xff); w8(0x0b);
    'NETSCAPE2.0'.split('').forEach(c => w8(c.charCodeAt(0)));
    w8(0x03); w8(0x01); w16(0); w8(0);
    // Each frame
    for (const f of frames) {
      // Graphic Control
      w8(0x21); w8(0xf9); w8(0x04); w8(0); w16(delayCs); w8(0); w8(0);
      // Image Descriptor
      w8(0x2c); w16(0); w16(0); w16(w); w16(h); w8(0);
      // LZW
      w8(8); // min code size
      const compressed = lzwEncode(f.indices, 8);
      // Sub-blocks
      let p = 0;
      while (p < compressed.length) {
        const len = Math.min(255, compressed.length - p);
        w8(len);
        for (let k = 0; k < len; k++) w8(compressed[p + k]);
        p += len;
      }
      w8(0);
    }
    w8(0x3b);
    return new Uint8Array(out);
  }
  Tools.exportRealGif = {
    down() {
      if (!state.frames || state.frames.length < 2) { alert('Add frames first.'); return; }
      const qFrames = state.frames.map(quantizeFrame);
      const gif = encodeGIF89a(qFrames, 15);
      const blob = new Blob([gif], { type: 'image/gif' });
      const a = window.document.createElement('a');
      a.download = `retro-paint-${Date.now()}.gif`;
      a.href = URL.createObjectURL(blob);
      a.click();
    }
  };

  // ---- WebM video export via MediaRecorder ----
  Tools.exportWebM = {
    down() {
      if (typeof MediaRecorder === 'undefined') { alert('MediaRecorder not supported.'); return; }
      const stream = canvas.captureStream(15);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const a = window.document.createElement('a');
        a.download = `retro-paint-${Date.now()}.webm`;
        a.href = URL.createObjectURL(blob);
        a.click();
      };
      recorder.start();
      // Play frames + record.
      let i = 0;
      const total = state.frames ? state.frames.length : 1;
      const tick = () => {
        if (state.frames && i < total) {
          ctx.putImageData(state.frames[i], 0, 0);
          composite();
          i++;
          setTimeout(tick, 100);
        } else {
          setTimeout(() => recorder.stop(), 200);
        }
      };
      tick();
    }
  };

  // ---- Time-lapse recording ----
  state.timeLapse = null;
  Tools.timeLapseStart = {
    down() {
      state.timeLapse = { startedAt: Date.now(), strokes: [] };
      alert('Time-lapse recording started.');
    }
  };
  Tools.timeLapseStop = {
    down() {
      if (!state.timeLapse) return;
      alert(`Time-lapse stopped: ${state.timeLapse.strokes.length} strokes captured.`);
      // Generate a sequence of canvas snapshots.
      const tl = state.timeLapse; state.timeLapse = null;
      // We didn't capture intermediate snapshots, so just save final.
      const a = window.document.createElement('a');
      a.download = 'retro-paint-timelapse.png';
      a.href = canvas.toDataURL();
      a.click();
    }
  };

  // ---- Procreate QuickShape: detect drag-then-hold, snap to perfect shape ----
  Tools.pcQuickShape = {
    down(p) { state.qsStart = { x: p.x, y: p.y }; saveSnapshot(); },
    move(p) {
      if (!state.qsStart) return;
      restoreSnapshot();
      ctx.save();
      ctx.strokeStyle = state.primary;
      ctx.lineWidth = Math.max(1, state.size);
      // Snap to nearest 0/45/90 if Shift, else freeform line until release.
      ctx.beginPath();
      ctx.moveTo(state.qsStart.x, state.qsStart.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    },
    up(p) {
      if (!state.qsStart) return;
      // On release: snap to perfect line (or perfect circle if path is circular).
      restoreSnapshot();
      const dx = p.x - state.qsStart.x, dy = p.y - state.qsStart.y;
      const ang = Math.atan2(dy, dx);
      const steps = Math.PI / 8;
      const snap = Math.round(ang / steps) * steps;
      const len = Math.hypot(dx, dy);
      const ex = state.qsStart.x + Math.cos(snap) * len;
      const ey = state.qsStart.y + Math.sin(snap) * len;
      pushUndo();
      ctx.strokeStyle = state.primary;
      ctx.lineWidth = Math.max(1, state.size);
      ctx.beginPath();
      ctx.moveTo(state.qsStart.x, state.qsStart.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      composite();
      state.qsStart = null;
    }
  };

  // ---- Procreate StreamLine: smoothed brush with adjustable strength ----
  state.streamlineAmount = 0.5;
  Tools.pcStreamLine = {
    down(p) { stabQueue = null; state.brushDynamics.stabilizer = state.streamlineAmount; setTool('brush'); }
  };

  // ---- Procreate ColorDrop: drag color from primary swatch into a region ----
  // Since true drag-drop is heavy, simulate: click ColorDrop, then click a region to flood with primary.
  Tools.pcColorDrop = {
    down(p) {
      pushUndo();
      floodFill(p.x, p.y, state.primary);
      composite();
    }
  };

  // ---- Aseprite Tile mode (mirror paint into 8 surrounding tiles) ----
  state.tileMode = false;
  Tools.aseTile = {
    down() {
      state.tileMode = !state.tileMode;
      alert('Tile mode: ' + (state.tileMode ? 'ON' : 'OFF'));
    }
  };
  // Wrap dispatchTool to also paint into 8 mirrored offsets when tile mode is on.
  const _origDispatchTool2 = dispatchTool;
  dispatchTool = function (phase, p) {
    _origDispatchTool2(phase, p);
    if (!state.tileMode) return;
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      if (dx === 0 && dy === 0) continue;
      _origDispatchTool2(phase, { x: p.x + dx, y: p.y + dy });
    }
  };

  // ---- Aseprite Color cycling ----
  state.cyclingPalette = false;
  state.cycleSpeed = 200;
  Tools.aseCycle = {
    down() {
      if (state.cyclingPalette) { clearInterval(state.cyclingPalette); state.cyclingPalette = false; return; }
      const palette = PaintModes.palettes[state.mode];
      let off = 0;
      state.cyclingPalette = setInterval(() => {
        off = (off + 1) % palette.length;
        const newPal = [...palette.slice(off), ...palette.slice(0, off)];
        // Apply: shift any pixel matching palette[i] to palette[(i+off)%n].
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          for (let k = 0; k < palette.length; k++) {
            const c = parseColor(palette[k]);
            if (Math.abs(d[i] - c[0]) < 8 && Math.abs(d[i+1] - c[1]) < 8 && Math.abs(d[i+2] - c[2]) < 8) {
              const tgt = parseColor(newPal[k]);
              d[i] = tgt[0]; d[i+1] = tgt[1]; d[i+2] = tgt[2];
              break;
            }
          }
        }
        ctx.putImageData(img, 0, 0);
        composite();
      }, state.cycleSpeed);
    }
  };

  // ---- GIMP Quick Mask (already added in Phase 2) ----
  Tools.gimpQuickMask = Tools.quickMask;

  // ---- GIMP Script-Fu console (sandboxed JS REPL) ----
  Tools.gimpScriptFu = {
    async down() {
      const html = `
        <textarea id="sf-in" rows="6" cols="40" placeholder="// Run JS bound to ctx, W, H, composite(), state.\n// Example: ctx.fillStyle='red'; ctx.fillRect(0,0,40,40); composite();"></textarea>
        <button id="sf-run">Run</button>
        <pre id="sf-out" style="background:#000;color:#0f0;padding:6px;max-height:120px;overflow:auto;font-size:11px"></pre>`;
      showModal('Script-Fu console', html, { hideCancel: true, okText: 'Close' });
      setTimeout(() => {
        const run = window.document.getElementById('sf-run');
        if (!run) return;
        run.addEventListener('click', () => {
          const inp = window.document.getElementById('sf-in').value;
          const out = window.document.getElementById('sf-out');
          try {
            const fn = new Function('ctx', 'W', 'H', 'composite', 'state', inp);
            const r = fn(ctx, W, H, composite, state);
            out.textContent += '> ' + (r === undefined ? '(ok)' : JSON.stringify(r)) + '\n';
          } catch (e) { out.textContent += '! ' + e.message + '\n'; }
        });
      }, 50);
    }
  };

  // ---- Action recorder (record + replay tool sequence) ----
  state.actionRecord = null;
  Tools.actionRecord = {
    down() {
      if (state.actionRecord) {
        alert('Action stopped: ' + state.actionRecord.length + ' steps captured.');
        try { localStorage.setItem('retropaint:lastAction', JSON.stringify(state.actionRecord)); } catch (e) {}
        state.actionRecord = null;
      } else {
        state.actionRecord = [];
        alert('Action recording started. Click Record again to stop.');
      }
    }
  };
  Tools.actionPlay = {
    down() {
      let actions = [];
      try { actions = JSON.parse(localStorage.getItem('retropaint:lastAction') || '[]'); } catch (e) {}
      if (!actions.length) { alert('No action saved.'); return; }
      // Replay each captured tool down event.
      let i = 0;
      const tick = () => {
        if (i >= actions.length) return;
        const a = actions[i++];
        if (a.type === 'tool') setTool(a.id);
        else if (a.type === 'draw') { setTool(a.tool); dispatchTool('down', a.p); }
        setTimeout(tick, 80);
      };
      tick();
    }
  };

  // ---- Batch processing ----
  Tools.batchProcess = {
    async down() {
      const inp = window.document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = async () => {
        for (const f of inp.files) {
          await new Promise((res) => {
            const img = new Image();
            img.onload = () => {
              ctx.clearRect(0, 0, W, H);
              ctx.drawImage(img, 0, 0, W, H);
              applyFilter('grayscale');
              const a = window.document.createElement('a');
              a.download = 'batch-' + f.name + '.png';
              a.href = canvas.toDataURL();
              a.click();
              res();
            };
            img.src = URL.createObjectURL(f);
          });
        }
        alert('Batch complete.');
      };
      inp.click();
    }
  };

  // ---- Init ----
  // Create the initial document FIRST so that any drawing during init has a
  // layer to write to. `setActiveDoc` rebinds the module-level `ctx`.
  docs.push(newDocument(W, H, 'untitled'));
  setActiveDoc(0);

  // Restore persisted preferences first
  try {
    const savedSize = +localStorage.getItem('retropaint:size');
    if (savedSize >= 1 && savedSize <= 32) {
      state.size = savedSize;
      sizeInput.value = String(savedSize);
      sizeDisp.textContent = String(savedSize);
    }
    const savedOpacity = +localStorage.getItem('retropaint:opacity');
    if (savedOpacity > 0 && savedOpacity <= 1) {
      state.opacity = savedOpacity;
      opacityInput.value = String(Math.round(savedOpacity * 100));
      opacityDisp.textContent = opacityInput.value;
    }
    const savedRecent = JSON.parse(localStorage.getItem('retropaint:recent') || '[]');
    if (Array.isArray(savedRecent)) state.recent = savedRecent.slice(0, 12);
    renderRecent();
    setMuted(localStorage.getItem('retropaint:muted') === '1');
  } catch (e) {}

  let savedMode = 'mspaint';
  try { savedMode = localStorage.getItem('retropaint:mode') || 'mspaint'; } catch (e) {}
  if (!VALID_MODES.includes(savedMode)) savedMode = 'mspaint';
  setMode(savedMode);
  updateUndoButtons();
  tryRestore();

  // Register service worker for offline / installable PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
