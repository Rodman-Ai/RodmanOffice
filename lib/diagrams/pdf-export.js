// Diagram → PDF via the existing lib/docs/pdfio.js writer.
//
// We render each page to a PNG, embed those PNGs as data URLs in a
// single HTML document with page breaks, and let savePdf paginate
// it. The PDF page size matches the diagram page size in PDF points
// (72 pt = 1 in), so the diagram fits edge-to-edge with no scaling
// loss. For multi-page diagrams we size the PDF to the largest page
// and center smaller pages inside.

import { savePdf } from '../docs/index.js';
import { exportPng } from './png-export.js';

const PT_PER_IN = 72;
const PX_PER_IN = 96;

export async function exportPdf(diagram, opts = {}) {
  const pages = diagram.pages || [];
  if (!pages.length) throw new Error('Diagram has no pages');

  // Largest page wins. PDFs require a single page size for the whole
  // document; per-page sizing is supported but our doc writer treats
  // the size as global.
  let maxW = 0, maxH = 0;
  for (const p of pages) {
    if (p.w > maxW) maxW = p.w;
    if (p.h > maxH) maxH = p.h;
  }
  const pageWpt = (maxW / PX_PER_IN) * PT_PER_IN;
  const pageHpt = (maxH / PX_PER_IN) * PT_PER_IN;

  const imgs = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await exportPng(diagram, { pageIndex: i, scale: 2 });
    const dataUrl = await blobToDataUrl(blob);
    imgs.push(dataUrl);
  }

  const html = imgs.map((src, i) => {
    const page = pages[i];
    const wIn = (page.w / PX_PER_IN);
    const hIn = (page.h / PX_PER_IN);
    return `<div style="page-break-after: always; width: ${wIn}in; height: ${hIn}in;">` +
      `<img src="${src}" style="width: ${wIn}in; height: ${hIn}in; display: block;" />` +
    `</div>`;
  }).join('');

  return savePdf(html, {
    title: diagram.title || 'Diagram',
    pageW: pageWpt,
    pageH: pageHpt,
    margin: 0,
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
