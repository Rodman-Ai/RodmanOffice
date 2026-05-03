/**
 * @file html2pdf wrapper. The library loads via `<script defer>` from a CDN,
 * so a user clicking a "Download PDF" button within ~100ms of page load can
 * race the script. This module exposes `withHtml2Pdf()` which waits up to
 * `timeoutMs` for the global to appear before either resolving with it or
 * rejecting.
 *
 * @module pdf
 */

/**
 * Wait for `window.html2pdf` to exist, then call `fn(html2pdf)`. Resolves
 * with the function's return value. Rejects after `timeoutMs` if the
 * library never appears (e.g. CDN blocked offline).
 *
 * @template T
 * @param {(html2pdf: any) => T} fn
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<T>}
 */
export function withHtml2Pdf(fn, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) { try { resolve(fn(window.html2pdf)); } catch (e) { reject(e); } return; }
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.html2pdf) {
        clearInterval(interval);
        try { resolve(fn(window.html2pdf)); } catch (e) { reject(e); }
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("PDF library couldn't load. Are you offline?"));
      }
    }, 50);
  });
}
