// RodmanSlides — deck data model + serialization.
// Single global: window.RodmanDeck.
(function () {
  'use strict';

  const SCHEMA = 1;
  const SLIDE_W = 1280;
  const SLIDE_H = 720;

  let nextId = 1;
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

  function newTextElement({ x, y, w, h, html, role, fontSize, fontWeight, align, color, fontFamily }) {
    return {
      id: newId('el'),
      kind: 'text',
      x, y, w, h,
      html: html ?? '',
      role: role ?? 'free',
      fontSize: fontSize ?? 24,
      fontWeight: fontWeight ?? 400,
      align: align ?? 'left',
      color: color ?? null,
      fontFamily: fontFamily ?? null,
    };
  }

  function newShapeElement({ x, y, w, h, shape, fill, stroke, strokeWidth }) {
    return {
      id: newId('el'),
      kind: 'shape',
      x, y, w, h,
      shape: shape ?? 'rect',
      fill: fill ?? '#b7472a',
      stroke: stroke ?? null,
      strokeWidth: strokeWidth ?? 0,
    };
  }

  function newImageElement({ x, y, w, h, src }) {
    return {
      id: newId('el'),
      kind: 'image',
      x, y, w, h,
      src,
    };
  }

  // Layouts return an array of elements positioned for a 1280x720 stage.
  const LAYOUTS = {
    title(theme) {
      return [
        newTextElement({
          x: 120, y: 240, w: 1040, h: 140,
          html: 'Click to add title', role: 'title',
          fontSize: 60, fontWeight: 700, align: 'center',
        }),
        newTextElement({
          x: 200, y: 400, w: 880, h: 70,
          html: 'Click to add subtitle', role: 'subtitle',
          fontSize: 28, fontWeight: 300, align: 'center',
        }),
      ];
    },
    titleAndContent(theme) {
      return [
        newTextElement({
          x: 80, y: 60, w: 1120, h: 90,
          html: 'Click to add title', role: 'title',
          fontSize: 44, fontWeight: 700, align: 'left',
        }),
        newTextElement({
          x: 80, y: 180, w: 1120, h: 480,
          html: '<ul><li>Click to add text</li></ul>', role: 'body',
          fontSize: 24, fontWeight: 400, align: 'left',
        }),
      ];
    },
    twoContent(theme) {
      return [
        newTextElement({
          x: 80, y: 60, w: 1120, h: 90,
          html: 'Click to add title', role: 'title',
          fontSize: 44, fontWeight: 700, align: 'left',
        }),
        newTextElement({
          x: 80, y: 180, w: 540, h: 480,
          html: '<ul><li>Click to add text</li></ul>', role: 'body',
          fontSize: 22, fontWeight: 400, align: 'left',
        }),
        newTextElement({
          x: 660, y: 180, w: 540, h: 480,
          html: '<ul><li>Click to add text</li></ul>', role: 'body',
          fontSize: 22, fontWeight: 400, align: 'left',
        }),
      ];
    },
    sectionHeader(theme) {
      return [
        newTextElement({
          x: 80, y: 280, w: 1120, h: 100,
          html: 'Section title', role: 'title',
          fontSize: 64, fontWeight: 700, align: 'left',
        }),
        newTextElement({
          x: 80, y: 400, w: 1120, h: 60,
          html: 'Click to add description', role: 'subtitle',
          fontSize: 24, fontWeight: 300, align: 'left',
        }),
      ];
    },
    blank() { return []; },
  };

  function newSlide({ layout = 'titleAndContent', theme }) {
    return {
      id: newId('slide'),
      layout,
      background: { kind: 'theme' },
      transition: { kind: 'none', durationMs: 400 },
      notes: '',
      elements: LAYOUTS[layout] ? LAYOUTS[layout](theme) : [],
    };
  }

  function newDeck({ title = 'Untitled Presentation', theme = 'office' } = {}) {
    return {
      schema: SCHEMA,
      title,
      theme,
      size: { w: SLIDE_W, h: SLIDE_H },
      slides: [newSlide({ layout: 'title', theme })],
    };
  }

  // localStorage persistence -------------------------------------------------
  const STORAGE_KEY = 'slides.deck.v1';

  function save(deck) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
      return true;
    } catch (e) {
      console.warn('RodmanSlides: autosave failed', e);
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || obj.schema !== SCHEMA) return null;
      return obj;
    } catch (e) {
      console.warn('RodmanSlides: load failed', e);
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // Validation: defensive about loading user-supplied JSON via File → Open.
  function validate(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.schema !== SCHEMA) return false;
    if (!Array.isArray(obj.slides) || obj.slides.length === 0) return false;
    if (!obj.size || typeof obj.size.w !== 'number' || typeof obj.size.h !== 'number') return false;
    return obj.slides.every((s) =>
      s && typeof s === 'object' && Array.isArray(s.elements)
    );
  }

  // Mutators (all pure-ish — return modified deck for clarity, but mutate in place)
  function addSlide(deck, opts = {}) {
    const slide = newSlide({ layout: opts.layout || 'titleAndContent', theme: deck.theme });
    deck.slides.splice((opts.afterIndex ?? deck.slides.length - 1) + 1, 0, slide);
    return slide;
  }

  function removeSlide(deck, slideId) {
    if (deck.slides.length <= 1) return false;
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return false;
    deck.slides.splice(idx, 1);
    return true;
  }

  function duplicateSlide(deck, slideId) {
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    if (idx === -1) return null;
    const original = deck.slides[idx];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = newId('slide');
    copy.elements.forEach((el) => { el.id = newId('el'); });
    deck.slides.splice(idx + 1, 0, copy);
    return copy;
  }

  function moveSlide(deck, slideId, toIndex) {
    const idx = deck.slides.findIndex((s) => s.id === slideId);
    if (idx === -1 || toIndex < 0 || toIndex >= deck.slides.length) return false;
    const [s] = deck.slides.splice(idx, 1);
    deck.slides.splice(toIndex, 0, s);
    return true;
  }

  function findSlide(deck, slideId) {
    return deck.slides.find((s) => s.id === slideId) || null;
  }

  function findElement(slide, elementId) {
    return slide.elements.find((e) => e.id === elementId) || null;
  }

  function removeElement(slide, elementId) {
    const idx = slide.elements.findIndex((e) => e.id === elementId);
    if (idx === -1) return false;
    slide.elements.splice(idx, 1);
    return true;
  }

  function bringForward(slide, elementId) {
    const idx = slide.elements.findIndex((e) => e.id === elementId);
    if (idx === -1 || idx === slide.elements.length - 1) return false;
    [slide.elements[idx], slide.elements[idx + 1]] = [slide.elements[idx + 1], slide.elements[idx]];
    return true;
  }

  function sendBackward(slide, elementId) {
    const idx = slide.elements.findIndex((e) => e.id === elementId);
    if (idx <= 0) return false;
    [slide.elements[idx - 1], slide.elements[idx]] = [slide.elements[idx], slide.elements[idx - 1]];
    return true;
  }

  // Public API
  window.RodmanDeck = {
    SCHEMA, SLIDE_W, SLIDE_H, LAYOUTS,
    newDeck, newSlide, newTextElement, newShapeElement, newImageElement,
    save, load, clear, validate,
    addSlide, removeSlide, duplicateSlide, moveSlide,
    findSlide, findElement, removeElement,
    bringForward, sendBackward,
  };
})();
