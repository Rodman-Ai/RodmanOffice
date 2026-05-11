// =============================================================
//  HTML <-> deck bridges.
//
//  The doc family (Word, converter doc inputs) speaks HTML; the
//  slides family (Slides app, PPTX, ODP) speaks { title, slides:
//  [{ elements: [{ kind:'text', html, … }] }] }. These two helpers
//  translate between the shapes:
//
//    deckToHtml(deck)        -> string  (H2 per slide title + body)
//    htmlToDeck(html, title) -> deck    (split on H1, fallback H2)
//
//  Both depend on a browser DOM (document.createElement, etc.) so
//  this module is browser-only — same constraint as image-io.js.
//  Hoisted here from converter/app.js so the Word and Slides apps
//  can reuse the implementation without duplicating it.
// =============================================================

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Render a deck object (the shape returned by `loadPptx`) as a
 * monolithic HTML string. Each slide becomes `<h2>title</h2>` plus
 * the slide body's inline HTML.
 * @param {{ title?: string, slides?: Array }} deck
 * @returns {string}
 */
export function deckToHtml(deck) {
  let html = '';
  if (deck && deck.title) html += `<h1>${escapeHtml(deck.title)}</h1>`;
  for (const slide of (deck && deck.slides) || []) {
    let firstText = true;
    for (const el of slide.elements || []) {
      if (el.kind !== 'text') continue;
      if (firstText) {
        // First text element's first paragraph becomes the H2 slide
        // title; everything else in that element flows as body.
        const tmp = document.createElement('div');
        tmp.innerHTML = el.html || '';
        const first = tmp.firstChild;
        const titleText = first ? (first.textContent || '').trim() : '';
        if (titleText) html += `<h2>${escapeHtml(titleText)}</h2>`;
        if (first) first.remove();
        html += tmp.innerHTML;
        firstText = false;
      } else {
        html += el.html || '';
      }
    }
  }
  return html || '<p>(empty deck)</p>';
}

/**
 * Split a document HTML string into slides on H1 (falling back to
 * H2) boundaries. Each slide gets a title element (the heading text)
 * and a body element (everything until the next heading).
 * @param {string} html
 * @param {string} [title] — Deck title fallback if no headings present.
 * @returns {{ title?: string, slides: Array }}
 */
export function htmlToDeck(html, title) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const headingTag = tmp.querySelector('h1') ? 'H1'
    : (tmp.querySelector('h2') ? 'H2' : null);
  const slidesOut = [];
  let bucket = { title: title || 'Slide', body: '' };
  if (!headingTag) {
    bucket.body = tmp.innerHTML;
    slidesOut.push(bucket);
  } else {
    Array.from(tmp.childNodes).forEach((n) => {
      if (n.nodeType === 1 && n.tagName === headingTag) {
        if (bucket.body || slidesOut.length === 0) slidesOut.push(bucket);
        bucket = { title: n.textContent || 'Slide', body: '' };
      } else {
        bucket.body += n.outerHTML || (n.nodeValue || '');
      }
    });
    if (bucket.body || !slidesOut.length) slidesOut.push(bucket);
  }
  return {
    title,
    slides: slidesOut.map((s) => ({
      elements: [
        {
          id: `t-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'text',
          x: 40, y: 40, w: 1200, h: 80,
          html: `<b>${escapeHtml(s.title)}</b>`,
          role: 'free', fontSize: 36, fontWeight: 700, align: 'left',
          color: null, fontFamily: null,
        },
        {
          id: `b-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'text',
          x: 40, y: 140, w: 1200, h: 540,
          html: s.body || '<p></p>',
          role: 'free', fontSize: 20, fontWeight: 400, align: 'left',
          color: null, fontFamily: null,
        },
      ],
    })),
  };
}
