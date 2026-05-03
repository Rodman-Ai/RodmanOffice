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

  window.RodmanThemes = { THEMES, get, applyToStage, names };
})();
