// RodmanSlides — theme definitions.
// Each theme exposes CSS variables consumed by the slide stage and elements.
// Single global: window.RodmanThemes.
(function () {
  'use strict';

  const THEMES = {
    office: {
      name: 'Office',
      background: '#ffffff',
      primary: '#b7472a',
      accent: '#1f6fb2',
      titleColor: '#1a1a1a',
      bodyColor: '#333333',
      fontHeading: '"Calibri Light", "Segoe UI", -apple-system, sans-serif',
      fontBody: 'Calibri, "Segoe UI", -apple-system, sans-serif',
    },
    berlin: {
      name: 'Berlin',
      background: '#0e1116',
      primary: '#f59e0b',
      accent: '#fbbf24',
      titleColor: '#f1f5f9',
      bodyColor: '#cbd5e1',
      fontHeading: '"Trebuchet MS", "Segoe UI", sans-serif',
      fontBody: '"Trebuchet MS", "Segoe UI", sans-serif',
    },
    crop: {
      name: 'Crop',
      background: '#f8f5e9',
      primary: '#5b8c5a',
      accent: '#3a6b39',
      titleColor: '#2d4a2c',
      bodyColor: '#3a3a3a',
      fontHeading: 'Georgia, "Times New Roman", serif',
      fontBody: 'Georgia, "Times New Roman", serif',
    },
    facet: {
      name: 'Facet',
      background: '#e8f1ff',
      primary: '#1e3a8a',
      accent: '#3b82f6',
      titleColor: '#1e3a8a',
      bodyColor: '#1e293b',
      fontHeading: '"Segoe UI", -apple-system, sans-serif',
      fontBody: '"Segoe UI", -apple-system, sans-serif',
    },
    ion: {
      name: 'Ion',
      background: '#1a1a2e',
      primary: '#06b6d4',
      accent: '#8b5cf6',
      titleColor: '#f0f9ff',
      bodyColor: '#cbd5e1',
      fontHeading: '"Segoe UI", -apple-system, sans-serif',
      fontBody: '"Segoe UI", -apple-system, sans-serif',
    },
    slice: {
      name: 'Slice',
      background: '#fff8f0',
      primary: '#dc2626',
      accent: '#f59e0b',
      titleColor: '#7f1d1d',
      bodyColor: '#1f2937',
      fontHeading: '"Helvetica Neue", "Arial", sans-serif',
      fontBody: '"Helvetica Neue", "Arial", sans-serif',
    },
    wisp: {
      name: 'Wisp',
      background: '#f5f5f5',
      primary: '#525252',
      accent: '#a855f7',
      titleColor: '#1f2937',
      bodyColor: '#4b5563',
      fontHeading: '"Avenir", "Segoe UI", sans-serif',
      fontBody: '"Avenir", "Segoe UI", sans-serif',
    },
    retrospect: {
      name: 'Retrospect',
      background: '#fef3c7',
      primary: '#92400e',
      accent: '#b45309',
      titleColor: '#78350f',
      bodyColor: '#451a03',
      fontHeading: '"Cambria", Georgia, serif',
      fontBody: '"Cambria", Georgia, serif',
    },
  };

  function get(name) {
    return THEMES[name] || THEMES.office;
  }

  function applyToStage(stageEl, theme) {
    const t = typeof theme === 'string' ? get(theme) : theme;
    stageEl.style.setProperty('--slide-bg', t.background);
    stageEl.style.setProperty('--slide-primary', t.primary);
    stageEl.style.setProperty('--slide-accent', t.accent);
    stageEl.style.setProperty('--slide-title', t.titleColor);
    stageEl.style.setProperty('--slide-body', t.bodyColor);
    stageEl.style.setProperty('--slide-font-heading', t.fontHeading);
    stageEl.style.setProperty('--slide-font-body', t.fontBody);
  }

  function names() { return Object.keys(THEMES); }

  // Return a small palette of colors derived from a theme — used by
  // the shape-fill swatch row so users can pick "the theme blue"
  // instead of authoring every shape with a raw hex code. The
  // ordering is stable across themes: title, body, primary, accent
  // (+ light/dark variants of the two accents).
  function shadeHex(hex, lightenPct) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const adj = (v) => {
      const t = lightenPct >= 0 ? 255 : 0;
      return Math.round(v + (t - v) * Math.abs(lightenPct) / 100);
    };
    const out = [adj(r), adj(g), adj(b)].map((v) => Math.max(0, Math.min(255, v)));
    return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function getPalette(name) {
    const t = get(name);
    return [
      t.titleColor,
      t.bodyColor,
      t.primary,
      shadeHex(t.primary, 30),
      shadeHex(t.primary, -30),
      t.accent,
      shadeHex(t.accent, 30),
      shadeHex(t.accent, -30),
    ];
  }

  window.RodmanThemes = { THEMES, get, applyToStage, names, getPalette };
})();
