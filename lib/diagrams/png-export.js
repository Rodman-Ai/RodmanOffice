// Diagram → PNG via canvas rasterization.
//
// We render the diagram as SVG then draw it to a canvas via
// drawImage(<img src=blob>) — same pattern Word/Slides use for
// image-stamp export. opts.scale controls DPI: 1 = 96 DPI,
// 2 = 192 DPI ("retina"), 4 = 384 DPI ("print").

import { exportSvg } from './svg-export.js';

export async function exportPng(diagram, opts = {}) {
  const pageIndex = opts.pageIndex ?? 0;
  const scale = opts.scale || 2;
  const page = diagram.pages[pageIndex];
  if (!page) throw new Error('Page index out of range');

  const svg = exportSvg(diagram, { pageIndex });
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(page.w * scale);
    canvas.height = Math.round(page.h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = page.bg || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize SVG'));
    img.src = url;
  });
}

function canvasToBlob(canvas, mime) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, mime);
  });
}
