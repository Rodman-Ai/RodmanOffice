// RodmanDiagrams — diagram data model + localStorage persistence.
// Single global: window.RodmanDiagram.
(function () {
  'use strict';

  const SCHEMA = 1;
  const DEFAULT_W = 1100;
  const DEFAULT_H = 850;

  let nextId = 1;
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

  function newLayer(opts = {}) {
    return {
      id: newId('layer'),
      name: opts.name || 'Layer 1',
      visible: true,
      locked: false,
      opacity: 1,
      color: opts.color || '#3b82f6',
    };
  }

  function newPage(opts = {}) {
    return {
      id: newId('page'),
      name: opts.name || 'Page 1',
      w: opts.w || DEFAULT_W,
      h: opts.h || DEFAULT_H,
      bg: opts.bg || '#ffffff',
      shapes: [],
      connectors: [],
    };
  }

  function newShape(opts = {}) {
    return {
      id: newId('s'),
      stencil: opts.stencil || 'rectangle',
      x: opts.x ?? 100,
      y: opts.y ?? 100,
      w: opts.w ?? 140,
      h: opts.h ?? 80,
      rotation: opts.rotation || 0,
      fill: opts.fill || '#DAE3F3',
      stroke: opts.stroke || '#2E5597',
      strokeWidth: opts.strokeWidth ?? 1.5,
      opacity: opts.opacity ?? 1,
      text: opts.text || '',
      textStyle: Object.assign({
        fontFamily: '',
        fontSize: 14,
        color: '#1F2937',
        bold: false,
        italic: false,
        align: 'center',
      }, opts.textStyle || {}),
      layerId: opts.layerId || null,
      _themed: opts._themed !== false,
    };
  }

  function newConnector(opts = {}) {
    return {
      id: newId('c'),
      fromShapeId: opts.fromShapeId,
      toShapeId: opts.toShapeId,
      fromPort: opts.fromPort || 'right',
      toPort: opts.toPort || 'left',
      stroke: opts.stroke || '#2E5597',
      strokeWidth: opts.strokeWidth ?? 1.5,
      endStart: opts.endStart || 'none',
      endEnd: opts.endEnd || 'arrow',
      label: opts.label || '',
      layerId: opts.layerId || null,
      _themed: opts._themed !== false,
    };
  }

  function newDiagram(opts = {}) {
    const layer = newLayer();
    return {
      schema: SCHEMA,
      title: opts.title || 'Untitled Diagram',
      theme: opts.theme || 'office',
      pages: [newPage()],
      layers: [layer],
      activeLayerId: layer.id,
    };
  }

  // ---------- localStorage persistence ----------
  const STORAGE_KEY = 'diagrams.diagram.v1';

  function save(diagram) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram));
      return true;
    } catch (e) {
      console.warn('RodmanDiagrams: autosave failed', e);
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
      console.warn('RodmanDiagrams: load failed', e);
      return null;
    }
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function validate(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.schema !== SCHEMA) return false;
    if (!Array.isArray(obj.pages) || obj.pages.length === 0) return false;
    if (!Array.isArray(obj.layers) || obj.layers.length === 0) return false;
    return obj.pages.every((p) =>
      p && Array.isArray(p.shapes) && Array.isArray(p.connectors)
    );
  }

  // ---------- Mutators ----------
  function addPage(diagram, opts = {}) {
    const idx = diagram.pages.length;
    const page = newPage({ name: opts.name || `Page ${idx + 1}` });
    diagram.pages.splice(opts.afterIndex != null ? opts.afterIndex + 1 : idx, 0, page);
    return page;
  }

  function removePage(diagram, pageId) {
    if (diagram.pages.length <= 1) return false;
    const idx = diagram.pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return false;
    diagram.pages.splice(idx, 1);
    return true;
  }

  function duplicatePage(diagram, pageId) {
    const idx = diagram.pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return null;
    const original = diagram.pages[idx];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = newId('page');
    copy.name = (original.name || 'Page') + ' copy';
    const idRemap = new Map();
    copy.shapes.forEach((s) => { const nid = newId('s'); idRemap.set(s.id, nid); s.id = nid; });
    copy.connectors.forEach((c) => {
      c.id = newId('c');
      if (idRemap.has(c.fromShapeId)) c.fromShapeId = idRemap.get(c.fromShapeId);
      if (idRemap.has(c.toShapeId)) c.toShapeId = idRemap.get(c.toShapeId);
    });
    diagram.pages.splice(idx + 1, 0, copy);
    return copy;
  }

  function findPage(diagram, pageId) {
    return diagram.pages.find((p) => p.id === pageId) || null;
  }

  function findShape(page, shapeId) {
    return page.shapes.find((s) => s.id === shapeId) || null;
  }

  function findConnector(page, connId) {
    return page.connectors.find((c) => c.id === connId) || null;
  }

  function removeShape(page, shapeId) {
    const idx = page.shapes.findIndex((s) => s.id === shapeId);
    if (idx === -1) return false;
    page.shapes.splice(idx, 1);
    // Cascade: remove any connector touching this shape.
    page.connectors = page.connectors.filter((c) =>
      c.fromShapeId !== shapeId && c.toShapeId !== shapeId
    );
    return true;
  }

  function removeConnector(page, connId) {
    const idx = page.connectors.findIndex((c) => c.id === connId);
    if (idx === -1) return false;
    page.connectors.splice(idx, 1);
    return true;
  }

  function bringForward(page, shapeId) {
    const idx = page.shapes.findIndex((s) => s.id === shapeId);
    if (idx === -1 || idx === page.shapes.length - 1) return false;
    [page.shapes[idx], page.shapes[idx + 1]] = [page.shapes[idx + 1], page.shapes[idx]];
    return true;
  }

  function sendBackward(page, shapeId) {
    const idx = page.shapes.findIndex((s) => s.id === shapeId);
    if (idx <= 0) return false;
    [page.shapes[idx - 1], page.shapes[idx]] = [page.shapes[idx], page.shapes[idx - 1]];
    return true;
  }

  function cloneShape(shape) {
    const copy = JSON.parse(JSON.stringify(shape));
    copy.id = newId('s');
    return copy;
  }

  // ---------- Geometry helpers ----------
  function snapTo(v, step) {
    if (!step || step <= 0) return v;
    return Math.round(v / step) * step;
  }

  function boundsOfShapes(shapes) {
    if (!shapes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of shapes) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x + s.w > maxX) maxX = s.x + s.w;
      if (s.y + s.h > maxY) maxY = s.y + s.h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  window.RodmanDiagram = {
    SCHEMA, DEFAULT_W, DEFAULT_H,
    newDiagram, newPage, newShape, newConnector, newLayer,
    save, load, clear, validate,
    addPage, removePage, duplicatePage,
    findPage, findShape, findConnector,
    removeShape, removeConnector,
    bringForward, sendBackward, cloneShape,
    snapTo, boundsOfShapes,
  };
})();
