// =============================================================
//  RodmanWord pdfio.js — minimal PDF 1.4 writer + text extractor.
//  No external dependencies.
// =============================================================
//
//  WRITING
//    PDF 1.4 with the standard 14 Type-1 fonts (Helvetica,
//    Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique,
//    Courier). No font embedding required — every PDF reader
//    has these built in.
//
//    htmlToBlocks walks the editor DOM into a flat block list:
//      h1..h6   styled headings
//      p        body paragraphs
//      ul/ol    bulleted / numbered list items
//      pre      monospace blocks
//      blockquote
//      tr       single-row table strip (one block per row)
//      hr       horizontal rules
//      img      placeholder text (image embedding skipped to
//               keep the writer small)
//
//    buildPdf lays the blocks out with manual word-wrapping
//    against a Helvetica width table (HELV_WIDTH, sampled from
//    the standard AFM), paginating on overflow. Each page emits
//    a content stream with BT/Tf/Tj/ET text operators. Optional
//    header / footer text is rendered above and below the body
//    margin on every page; {page} / {pages} placeholders are
//    substituted per-page so footers like "Page 1 of 4" work.
//
//    assemblePdf wraps the page tree, fonts, and content streams
//    in a proper PDF document with a Catalog, Pages, Font, Info
//    object set and the cross-reference table at the end.
//
//  READING
//    extractStringsFromContent tokenises a content stream and
//    pulls every literal `(...)` and hex `<...>` text fragment
//    in order. Tj/TJ operators emit text; Td / TD with a large
//    negative y-delta is interpreted as a paragraph break.
//
//    loadPdf walks the PDF byte stream looking for content
//    streams (`<< /Filter /FlateDecode >> stream … endstream`),
//    inflates them via the browser's DecompressionStream, and
//    pulls text from each one. The result is wrapped in <p>
//    elements split on the inferred paragraph breaks.
//
//  PUBLIC SURFACE
//    window.RodmanPdf = {
//      savePdf(html, opts)             → Blob (application/pdf)
//        opts.pageW / pageH (points)   default Letter (612×792)
//        opts.margin (points)          default 72
//        opts.title                    PDF metadata title
//        opts.header / footer (HTML)   optional running
//                                      header / footer
//      loadPdf(arrayBuffer)            → Promise<string>
//                                         (HTML <p> chunks)
//    }
//
//  CAVEATS
//    Built-in Type-1 fonts cover Latin-1 only; characters
//    outside that range render as `?`. The reader does best on
//    PDFs whose text streams use simple WinAnsi encoding;
//    custom-CMap PDFs (subset embedded fonts) won't extract
//    cleanly without a much larger reader.
// =============================================================

// ---------- Helvetica AFM widths (1000-units, sampled) ----------
// Subset of standard Adobe Helvetica AFM. Missing chars default to 500.
const PDF_MAX_BYTES = 50 * 1024 * 1024;
const PDF_MAX_STREAMS = 500;
const PDF_MAX_COMPRESSED_STREAM_BYTES = 10 * 1024 * 1024;
const PDF_MAX_DECOMPRESSED_STREAM_BYTES = 20 * 1024 * 1024;
const PDF_MAX_TOTAL_DECODED_BYTES = 40 * 1024 * 1024;
const PDF_MAX_EXTRACTED_TEXT_CHARS = 2_000_000;

const HELV_WIDTH = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667,
  "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333,
  '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556,
  '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667,
  Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667,
  Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556,
  i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556,
  q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500,
  y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584, ' ': 278, '—': 1000,
  '–': 556, '…': 1000, '“': 333, '”': 333,
  '‘': 222, '’': 222,
};

function charWidth(ch) {
  return HELV_WIDTH[ch] != null ? HELV_WIDTH[ch] : 500;
}
function textWidth(s, fontSize) {
  let w = 0;
  for (const c of s) w += charWidth(c);
  return (w / 1000) * fontSize;
}

// ---------- WinAnsi-safe encoding ----------
// PDF strings with Latin-1 only. Map common Unicode to ASCII fallbacks.
const UNI_FALLBACKS = {
  '“': '"', '”': '"',
  '‘': "'", '’': "'",
  '–': '-', '—': '--',
  '…': '...',
  ' ': ' ',
  '•': '*',
};
function toLatin1(s) {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code < 0x80) out += ch;
    else if (UNI_FALLBACKS[ch] != null) out += UNI_FALLBACKS[ch];
    else if (code < 0x100) out += ch;
    else out += '?';
  }
  return out;
}
function escapePdf(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

// ---------- HTML → blocks ----------
function htmlToBlocks(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  function inlineRuns(node, fmt) {
    const out = [];
    if (node.nodeType === 3) {
      const text = toLatin1(node.nodeValue.replace(/\s+/g, ' '));
      if (text) out.push({ text, ...fmt });
      return out;
    }
    if (node.nodeType !== 1) return out;
    const tag = node.tagName.toLowerCase();
    const next = { ...fmt };
    if (tag === 'b' || tag === 'strong') next.bold = true;
    if (tag === 'i' || tag === 'em') next.italic = true;
    if (tag === 'u') next.under = true;
    if (tag === 'a') next.link = node.getAttribute('href') || '';
    if (tag === 'br') { out.push({ text: '\n', ...next }); return out; }
    node.childNodes.forEach((c) => out.push(...inlineRuns(c, next)));
    return out;
  }

  function pushBlock(blocks, kind, node, fmt) {
    const align = node.style && node.style.textAlign;
    blocks.push({
      kind, align: align || 'left',
      runs: inlineRuns(node, fmt || {}),
    });
  }

  function walk(node, blocks) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    switch (tag) {
      case 'h1': pushBlock(blocks, 'h1', node); break;
      case 'h2': pushBlock(blocks, 'h2', node); break;
      case 'h3': pushBlock(blocks, 'h3', node); break;
      case 'h4': pushBlock(blocks, 'h4', node); break;
      case 'h5': pushBlock(blocks, 'h5', node); break;
      case 'h6': pushBlock(blocks, 'h6', node); break;
      case 'p':  pushBlock(blocks, 'p', node); break;
      case 'blockquote': pushBlock(blocks, 'quote', node, { italic: true }); break;
      case 'pre': pushBlock(blocks, 'code', node); break;
      case 'ul':
        node.querySelectorAll(':scope > li').forEach((li) =>
          pushBlock(blocks, 'li', li));
        break;
      case 'ol':
        {
          let i = 1;
          node.querySelectorAll(':scope > li').forEach((li) => {
            const b = { kind: 'oli', align: 'left', n: i++,
              runs: inlineRuns(li, {}) };
            blocks.push(b);
          });
        }
        break;
      case 'hr':
        blocks.push({ kind: 'hr' });
        break;
      case 'table':
        node.querySelectorAll('tr').forEach((tr) => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach((td) => {
            const isTh = td.tagName === 'TH';
            cells.push({
              runs: inlineRuns(td, isTh ? { bold: true } : {})
            });
          });
          blocks.push({ kind: 'tr', cells });
        });
        blocks.push({ kind: 'spacer' });
        break;
      case 'figure': case 'div': case 'section': case 'article':
        node.childNodes.forEach((c) => walk(c, blocks));
        break;
      case 'img':
        blocks.push({
          kind: 'p', align: 'left',
          runs: [{ text: '[image: ' +
            toLatin1(node.getAttribute('alt') || node.getAttribute('src') || '') +
            ']', italic: true }]
        });
        break;
    }
  }

  const blocks = [];
  Array.from(tmp.childNodes).forEach((c) => walk(c, blocks));
  return blocks;
}

// ---------- Layout ----------
function styleFor(kind) {
  switch (kind) {
    case 'h1': return { size: 22, bold: true, after: 8, before: 6 };
    case 'h2': return { size: 18, bold: true, after: 6, before: 4 };
    case 'h3': return { size: 14, bold: true, after: 4, before: 4 };
    case 'h4': return { size: 12, bold: true, after: 4, before: 2 };
    case 'h5': return { size: 11, bold: true, after: 2, before: 2 };
    case 'h6': return { size: 11, bold: true, after: 2, before: 2 };
    case 'quote': return { size: 11, italic: true, after: 4, before: 2, indent: 18 };
    case 'code': return { size: 10, mono: true, after: 4, before: 2, indent: 12 };
    case 'li':  return { size: 11, after: 2, indent: 18, marker: '• ' };
    case 'oli': return { size: 11, after: 2, indent: 18 };
    default:   return { size: 11, after: 4, before: 0 };
  }
}

// Returns { tokens: [{ text, bold, italic, under, link }], lineHeight }
function flattenRuns(runs, base) {
  const tokens = [];
  runs.forEach((r) => {
    const text = r.text || '';
    // Split by whitespace, preserve spaces
    const parts = text.split(/(\s+)/).filter(Boolean);
    parts.forEach((p) => {
      tokens.push({
        text: p,
        bold: r.bold || base.bold,
        italic: r.italic || base.italic,
        under: r.under,
        link: r.link,
        isSpace: /^\s+$/.test(p),
      });
    });
  });
  return tokens;
}

function wrapTokens(tokens, fontSize, maxWidth, indent) {
  const lines = [];
  let line = [];
  let width = indent;
  tokens.forEach((tok) => {
    if (tok.text === '\n') {
      lines.push(line); line = []; width = indent; return;
    }
    const w = textWidth(tok.text, fontSize);
    if (width + w > maxWidth && line.length && !tok.isSpace) {
      // Drop trailing space
      while (line.length && line[line.length - 1].isSpace) line.pop();
      lines.push(line);
      line = [tok];
      width = indent + w;
    } else {
      if (tok.isSpace && line.length === 0) return;
      line.push(tok);
      width += w;
    }
  });
  if (line.length) lines.push(line);
  return lines;
}

// ---------- PDF builder ----------
function buildPdf(blocks, opts) {
  const PAGE_W = opts.pageW;
  const PAGE_H = opts.pageH;
  const MARGIN = opts.margin;
  const MAX_W = PAGE_W - 2 * MARGIN;

  const pages = []; // each page: array of operations (text strings)
  let cur = newPage();
  let y = PAGE_H - MARGIN;

  function newPage() { return { ops: [], hasText: false }; }

  function flushPage() {
    pages.push(cur);
    cur = newPage();
    y = PAGE_H - MARGIN;
  }

  function pickFont(bold, italic, mono) {
    if (mono) return 'F5';
    if (bold && italic) return 'F4';
    if (bold) return 'F2';
    if (italic) return 'F3';
    return 'F1';
  }

  function drawLine(line, fontSize, x, lineHeight, blockBold, blockItalic, mono) {
    // Move to position, set font, emit Tj for each token, accumulate underlines
    cur.ops.push('BT');
    cur.ops.push('1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm');
    // Draw underline if any token has under
    let xCursor = x;
    let lastFontKey = '';
    line.forEach((tok) => {
      if (!tok.text) return;
      const f = pickFont(tok.bold || blockBold, tok.italic || blockItalic, mono);
      const fontKey = f + '_' + fontSize;
      if (fontKey !== lastFontKey) {
        cur.ops.push('/' + f + ' ' + fontSize + ' Tf');
        lastFontKey = fontKey;
      }
      cur.ops.push('(' + escapePdf(tok.text) + ') Tj');
    });
    cur.ops.push('ET');

    // Underlines: run a separate pass since BT/ET cannot draw shapes
    let underStart = -1;
    let xAt = x;
    line.forEach((tok) => {
      const ftSize = fontSize;
      const w = textWidth(tok.text, ftSize);
      if (tok.under) {
        if (underStart < 0) underStart = xAt;
        // extend
        const xEnd = xAt + w;
        if (line[line.length - 1] === tok ||
            !line[line.indexOf(tok) + 1] || !line[line.indexOf(tok) + 1].under) {
          cur.ops.push('q 0.5 w ' + underStart.toFixed(2) + ' ' +
            (y - 1.5).toFixed(2) + ' m ' + xEnd.toFixed(2) + ' ' +
            (y - 1.5).toFixed(2) + ' l S Q');
          underStart = -1;
        }
      } else {
        underStart = -1;
      }
      xAt += w;
    });
    cur.hasText = true;
  }

  function ensureRoom(h) {
    if (y - h < MARGIN) flushPage();
  }

  blocks.forEach((b) => {
    if (b.kind === 'hr') {
      ensureRoom(8);
      cur.ops.push('q 0.6 w ' + MARGIN.toFixed(2) + ' ' + (y - 4).toFixed(2) +
        ' m ' + (MARGIN + MAX_W).toFixed(2) + ' ' + (y - 4).toFixed(2) + ' l S Q');
      y -= 12;
      return;
    }
    if (b.kind === 'spacer') { y -= 6; return; }
    if (b.kind === 'tr') {
      const cells = b.cells;
      const colW = MAX_W / cells.length;
      const fontSize = 10;
      // Wrap each cell, take max line count
      const wrapped = cells.map((c) => {
        const t = flattenRuns(c.runs, {});
        return wrapTokens(t, fontSize, colW - 6, 0);
      });
      const maxLines = Math.max(1, ...wrapped.map((w) => w.length));
      const rowH = maxLines * (fontSize * 1.2) + 6;
      ensureRoom(rowH);
      // Borders
      cur.ops.push('q 0.5 w');
      for (let c = 0; c <= cells.length; c++) {
        const cx = MARGIN + c * colW;
        cur.ops.push(cx.toFixed(2) + ' ' + (y).toFixed(2) + ' m ' +
          cx.toFixed(2) + ' ' + (y - rowH).toFixed(2) + ' l S');
      }
      cur.ops.push(MARGIN.toFixed(2) + ' ' + (y).toFixed(2) + ' m ' +
        (MARGIN + MAX_W).toFixed(2) + ' ' + (y).toFixed(2) + ' l S');
      cur.ops.push(MARGIN.toFixed(2) + ' ' + (y - rowH).toFixed(2) + ' m ' +
        (MARGIN + MAX_W).toFixed(2) + ' ' + (y - rowH).toFixed(2) + ' l S');
      cur.ops.push('Q');

      wrapped.forEach((lines, ci) => {
        let yy = y - 4 - fontSize;
        lines.forEach((ln) => {
          const xx = MARGIN + ci * colW + 3;
          cur.ops.push('BT');
          cur.ops.push('1 0 0 1 ' + xx.toFixed(2) + ' ' + yy.toFixed(2) + ' Tm');
          let lastFont = '';
          ln.forEach((tok) => {
            const f = pickFont(tok.bold, tok.italic, false);
            if (f + fontSize !== lastFont) {
              cur.ops.push('/' + f + ' ' + fontSize + ' Tf');
              lastFont = f + fontSize;
            }
            cur.ops.push('(' + escapePdf(tok.text) + ') Tj');
          });
          cur.ops.push('ET');
          yy -= fontSize * 1.2;
        });
      });
      y -= rowH + 4;
      return;
    }

    const st = styleFor(b.kind);
    const lineH = st.size * 1.25;
    const indent = st.indent || 0;
    if (st.before) y -= st.before;

    // Marker (for unordered list)
    let markerText = '';
    if (b.kind === 'li') markerText = '•';
    else if (b.kind === 'oli') markerText = (b.n || 1) + '.';

    const tokens = flattenRuns(b.runs || [], { bold: st.bold, italic: st.italic });
    const lines = wrapTokens(tokens, st.size, MAX_W - indent, 0);
    if (!lines.length) lines.push([]);

    lines.forEach((line, li) => {
      ensureRoom(lineH);
      let xStart = MARGIN + indent;
      if (b.align === 'center') {
        const lw = line.reduce((s, t) => s + textWidth(t.text, st.size), 0);
        xStart = MARGIN + (MAX_W - lw) / 2;
      } else if (b.align === 'right') {
        const lw = line.reduce((s, t) => s + textWidth(t.text, st.size), 0);
        xStart = MARGIN + MAX_W - lw;
      }
      // Marker on first line only
      if (li === 0 && markerText) {
        cur.ops.push('BT');
        cur.ops.push('/F1 ' + st.size + ' Tf');
        cur.ops.push('1 0 0 1 ' + (MARGIN + 4).toFixed(2) + ' ' +
          (y - st.size).toFixed(2) + ' Tm');
        cur.ops.push('(' + escapePdf(markerText) + ') Tj');
        cur.ops.push('ET');
      }
      if (line.length) {
        drawLine(line, st.size, xStart, lineH, st.bold, st.italic, st.mono);
      }
      y -= lineH;
    });

    if (st.after) y -= st.after;
  });

  if (cur.hasText || cur.ops.length) flushPage();
  if (!pages.length) flushPage();

  // Render header/footer on every page
  if (opts.headerText || opts.footerSegments) {
    const total = pages.length;
    pages.forEach((p, idx) => {
      const headerOps = [];
      const footerOps = [];
      const pageNo = idx + 1;
      if (opts.headerText) {
        headerOps.push('BT');
        headerOps.push('/F3 9 Tf');
        headerOps.push('1 0 0 1 ' + MARGIN.toFixed(2) + ' ' +
          (PAGE_H - MARGIN / 2).toFixed(2) + ' Tm');
        headerOps.push('(' + escapePdf(opts.headerText) + ') Tj');
        headerOps.push('ET');
        // Thin separator under header
        headerOps.push('q 0.3 w ' + MARGIN.toFixed(2) + ' ' +
          (PAGE_H - MARGIN / 2 - 4).toFixed(2) + ' m ' +
          (PAGE_W - MARGIN).toFixed(2) + ' ' +
          (PAGE_H - MARGIN / 2 - 4).toFixed(2) + ' l S Q');
      }
      if (opts.footerSegments && opts.footerSegments.length) {
        // Compose the footer text by joining segments with current page
        let footerText = '';
        opts.footerSegments.forEach((seg) => {
          if (seg.type === 'text') footerText += seg.value;
          else if (seg.type === 'page') footerText += String(pageNo);
          else if (seg.type === 'pages') footerText += String(total);
        });
        // Append default page indicator if no field was used
        if (!opts.footerSegments.some((s) => s.type === 'page')) {
          footerText += '   ' + pageNo + ' / ' + total;
        }
        footerOps.push('q 0.3 w ' + MARGIN.toFixed(2) + ' ' +
          (MARGIN / 2 + 12).toFixed(2) + ' m ' +
          (PAGE_W - MARGIN).toFixed(2) + ' ' +
          (MARGIN / 2 + 12).toFixed(2) + ' l S Q');
        footerOps.push('BT');
        footerOps.push('/F3 9 Tf');
        footerOps.push('1 0 0 1 ' + MARGIN.toFixed(2) + ' ' +
          (MARGIN / 2).toFixed(2) + ' Tm');
        footerOps.push('(' + escapePdf(footerText) + ') Tj');
        footerOps.push('ET');
      }
      if (headerOps.length || footerOps.length) {
        p.ops = headerOps.concat(p.ops, footerOps);
        p.hasText = true;
      }
    });
  }

  return assemblePdf(pages, opts);
}

function assemblePdf(pages, opts) {
  const objects = []; // each: bytes
  function addObject(content) {
    objects.push(content);
    return objects.length; // 1-based
  }

  const enc = new TextEncoder();
  function obj(num, body) {
    return num + ' 0 obj\n' + body + '\nendobj\n';
  }

  // Allocate object numbers up-front
  // 1: Catalog, 2: Pages, 3..: Page+Contents pairs, then Fonts, then Info
  const pageObjectNums = [];
  const contentsObjNums = [];

  let nextNum = 3; // 1=Catalog, 2=Pages
  pages.forEach(() => {
    pageObjectNums.push(nextNum++);
    contentsObjNums.push(nextNum++);
  });
  const fontNums = {};
  ['F1','F2','F3','F4','F5'].forEach((n) => { fontNums[n] = nextNum++; });
  const infoNum = nextNum++;

  // Build objects in order
  // 1: Catalog
  const catalogStr = obj(1,
    '<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages
  const pagesKids = pageObjectNums.map((n) => n + ' 0 R').join(' ');
  const pagesStr = obj(2,
    '<< /Type /Pages /Kids [' + pagesKids + '] /Count ' + pages.length + ' >>');

  // 3..: Page + Contents pairs
  const pageStrs = [];
  const contentsStrs = [];
  pages.forEach((p, idx) => {
    const pageNum = pageObjectNums[idx];
    const contentsNum = contentsObjNums[idx];
    const fontDict =
      '<< /F1 ' + fontNums.F1 + ' 0 R /F2 ' + fontNums.F2 + ' 0 R /F3 ' +
      fontNums.F3 + ' 0 R /F4 ' + fontNums.F4 + ' 0 R /F5 ' +
      fontNums.F5 + ' 0 R >>';
    pageStrs.push(obj(pageNum,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      opts.pageW + ' ' + opts.pageH + ']' +
      ' /Resources << /Font ' + fontDict + ' >>' +
      ' /Contents ' + contentsNum + ' 0 R >>'));
    const stream = p.ops.join('\n');
    const length = enc.encode(stream).length;
    contentsStrs.push(obj(contentsNum,
      '<< /Length ' + length + ' >>\nstream\n' + stream + '\nendstream'));
  });

  // Fonts
  const fontStrs = [];
  [
    ['F1', 'Helvetica'],
    ['F2', 'Helvetica-Bold'],
    ['F3', 'Helvetica-Oblique'],
    ['F4', 'Helvetica-BoldOblique'],
    ['F5', 'Courier'],
  ].forEach(([key, name]) => {
    fontStrs.push(obj(fontNums[key],
      '<< /Type /Font /Subtype /Type1 /BaseFont /' + name +
      ' /Encoding /WinAnsiEncoding >>'));
  });

  // Info
  const now = new Date();
  const dateStr = 'D:' +
    now.getUTCFullYear().toString().padStart(4, '0') +
    (now.getUTCMonth() + 1).toString().padStart(2, '0') +
    now.getUTCDate().toString().padStart(2, '0') +
    now.getUTCHours().toString().padStart(2, '0') +
    now.getUTCMinutes().toString().padStart(2, '0') +
    now.getUTCSeconds().toString().padStart(2, '0') + 'Z';
  const infoStr = obj(infoNum,
    '<< /Title (' + escapePdf(toLatin1(opts.title || 'Document')) +
    ') /Producer (RodmanWord) /Creator (RodmanWord) /CreationDate (' +
    dateStr + ') >>');

  // Concat with byte offsets
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const parts = [header, catalogStr, pagesStr, ...pageStrs, ...contentsStrs, ...fontStrs, infoStr];
  let body = '';
  const offsets = [0]; // index by object number; placeholder for 0
  parts.forEach((p, i) => {
    if (i === 0) { body = p; return; }
    offsets.push(body.length);
    body += p;
  });

  const xrefOffset = body.length;
  const totalObjects = nextNum - 1;
  let xref = 'xref\n0 ' + (totalObjects + 1) + '\n';
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= totalObjects; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  body += xref;
  body += 'trailer\n<< /Size ' + (totalObjects + 1) +
    ' /Root 1 0 R /Info ' + infoNum + ' 0 R >>\n';
  body += 'startxref\n' + xrefOffset + '\n%%EOF\n';

  // Encode as Latin-1 bytes (each char 0-255)
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) {
    bytes[i] = body.charCodeAt(i) & 0xFF;
  }
  return bytes;
}

// Convert header / footer HTML to a plain text representation that the
// PDF layer can render. Footer can include {page} / {pages} placeholders
// (or .rwd-pagenum spans, replaced by {page} here).
function partTextFromHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('.rwd-pagenum').forEach((el) => el.replaceWith('{page}'));
  return toLatin1((tmp.innerText || '').replace(/\s+/g, ' ').trim());
}
function footerSegmentsFromText(text) {
  if (!text) return null;
  const segs = [];
  const re = /\{page\}|\{pages\}/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'text', value: text.slice(last, m.index) });
    segs.push({ type: m[0] === '{page}' ? 'page' : 'pages' });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'text', value: text.slice(last) });
  return segs;
}

function savePdf(html, opts) {
  opts = opts || {};
  const pageW = opts.pageW != null ? opts.pageW : 612;   // Letter default
  const pageH = opts.pageH != null ? opts.pageH : 792;
  const margin = opts.margin != null ? opts.margin : 72; // 1 inch
  const headerText = opts.header ? partTextFromHtml(opts.header) : '';
  const footerText = opts.footer ? partTextFromHtml(opts.footer) : '';
  const footerSegments = footerSegmentsFromText(footerText);
  const blocks = htmlToBlocks(html);
  const bytes = buildPdf(blocks, {
    pageW, pageH, margin,
    title: opts.title || 'Document',
    headerText,
    footerSegments,
  });
  return new Blob([bytes], { type: 'application/pdf' });
}

// ---------- PDF text extraction ----------
// Bytes-level utilities (Latin-1)
function bytesToLatin1(u8, start, end) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(u8[i]);
  return s;
}

function findStreams(text) {
  // Returns array of { dict, start, end } for each stream
  const out = [];
  const re = /(<<[^>]*?>>)\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const dict = m[1];
    const start = m.index + m[0].length;
    const endIdx = text.indexOf('endstream', start);
    if (endIdx > 0) {
      let end = endIdx;
      // Strip trailing newline before endstream
      if (text.charCodeAt(end - 1) === 10) end--;
      if (text.charCodeAt(end - 1) === 13) end--;
      out.push({ dict, start, end });
    }
  }
  return out;
}

async function readLimitedStream(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error('PDF stream expands beyond safe import limits');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function inflate(bytes, maxBytes = PDF_MAX_DECOMPRESSED_STREAM_BYTES) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream('deflate'));
    return readLimitedStream(stream, maxBytes);
  } catch (err) {
    if (err && /safe import limits/.test(String(err.message || err))) throw err;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(
        new DecompressionStream('deflate-raw'));
      return readLimitedStream(stream, maxBytes);
    } catch (err2) {
      if (err2 && /safe import limits/.test(String(err2.message || err2))) throw err2;
      return null;
    }
  }
}

function decodeWinAnsi(s) {
  // Already Latin-1; map a few common WinAnsi-only positions
  const map = { 0x91: '‘', 0x92: '’', 0x93: '“',
    0x94: '”', 0x96: '–', 0x97: '—', 0x95: '•',
    0x85: '…', 0x82: '‚', 0x84: '„' };
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += map[c] || s[i];
  }
  return out;
}

function unescapePdfString(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === 'n') { out += '\n'; i++; }
      else if (n === 'r') { out += '\r'; i++; }
      else if (n === 't') { out += '\t'; i++; }
      else if (n === '(' || n === ')' || n === '\\') { out += n; i++; }
      else if (n >= '0' && n <= '7') {
        let oct = n; i++;
        while (i + 1 < s.length && s[i + 1] >= '0' && s[i + 1] <= '7' && oct.length < 3) {
          i++; oct += s[i];
        }
        out += String.fromCharCode(parseInt(oct, 8));
      } else { out += n; i++; }
    } else {
      out += c;
    }
  }
  return out;
}

function hexStringToText(hex) {
  let out = '';
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  for (let i = 0; i < clean.length; i += 2) {
    const v = parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16);
    out += String.fromCharCode(v);
  }
  return out;
}

function extractStringsFromContent(content) {
  // Pull literal (...) and hex <...> strings + a few operators, in order.
  const out = [];
  let i = 0;
  function readNumber(idx) {
    // Read number ending at idx (idx points just past the number).
    // Walk backwards to find its start.
    let end = idx;
    while (end > 0 && content[end - 1] === ' ') end--;
    let start = end;
    while (start > 0 && /[\-0-9.]/.test(content[start - 1])) start--;
    if (start === end) return NaN;
    return parseFloat(content.slice(start, end));
  }
  while (i < content.length) {
    const c = content[i];
    if (c === '(') {
      let depth = 1; let j = i + 1; let str = '';
      while (j < content.length && depth > 0) {
        const ch = content[j];
        if (ch === '\\') { str += ch + (content[j + 1] || ''); j += 2; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { j++; break; } }
        str += ch; j++;
      }
      out.push({ type: 'lit', s: str });
      i = j;
    } else if (c === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      if (end < 0) break;
      out.push({ type: 'hex', s: content.slice(i + 1, end) });
      i = end + 1;
    } else if (c === 'T' && (content[i + 1] === 'd' || content[i + 1] === 'D')
               && /\s|\(|\[|\)|\]/.test(content[i + 2] || ' ')) {
      // Td or TD — record the y delta if we can parse it
      const y = readNumber(i);
      out.push({ type: 'move', y });
      i += 2;
    } else if (c === 'T' && content[i + 1] === '*') {
      out.push({ type: 'newline' }); i += 2;
    } else if (c === "'" || c === '"') {
      out.push({ type: 'newline' }); i++;
    } else {
      i++;
    }
  }

  // Reassemble text. A negative Td y-delta of more than ~12pt likely means
  // a paragraph break.
  let text = '';
  out.forEach((tok) => {
    if (tok.type === 'lit') {
      text += decodeWinAnsi(unescapePdfString(tok.s));
    } else if (tok.type === 'hex') {
      text += decodeWinAnsi(hexStringToText(tok.s));
    } else if (tok.type === 'newline') {
      if (!text.endsWith('\n')) text += '\n';
    } else if (tok.type === 'move') {
      if (Number.isFinite(tok.y) && tok.y < -16) {
        if (!text.endsWith('\n\n')) text += text.endsWith('\n') ? '\n' : '\n\n';
      } else if (Number.isFinite(tok.y) && tok.y < 0) {
        if (!text.endsWith('\n')) text += '\n';
      }
    }
  });
  return text;
}

async function loadPdf(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  if (u8.byteLength > PDF_MAX_BYTES) {
    throw new Error('PDF is too large to import safely');
  }
  if (u8[0] !== 0x25 || u8[1] !== 0x50 ||
      u8[2] !== 0x44 || u8[3] !== 0x46) {
    throw new Error('Not a PDF (missing %PDF header)');
  }
  const all = bytesToLatin1(u8, 0, u8.length);
  const streams = findStreams(all);
  if (streams.length > PDF_MAX_STREAMS) {
    throw new Error('PDF has too many streams to import safely');
  }
  let combined = '';
  let totalDecoded = 0;
  for (const s of streams) {
    const dict = s.dict;
    if (/\/Subtype\s*\/Image/.test(dict)) continue;
    const isFlate = /\/Filter\s*\/FlateDecode/.test(dict) ||
                    /\/Filter\s*\[\s*\/FlateDecode/.test(dict);
    let bytes = u8.subarray(s.start, s.end);
    if (bytes.byteLength > PDF_MAX_COMPRESSED_STREAM_BYTES) {
      throw new Error('PDF stream is too large to import safely');
    }
    if (isFlate) {
      const out = await inflate(bytes, PDF_MAX_DECOMPRESSED_STREAM_BYTES);
      if (!out) continue;
      bytes = out;
    }
    totalDecoded += bytes.byteLength;
    if (totalDecoded > PDF_MAX_TOTAL_DECODED_BYTES) {
      throw new Error('PDF decoded content exceeds safe import limits');
    }
    // Heuristic: skip streams that look binary (e.g. images)
    // Only consider streams that contain text-drawing operators
    const decoded = bytesToLatin1(bytes, 0, bytes.length);
    if (!/(\bTj\b|\bTJ\b)/.test(decoded)) continue;
    const txt = extractStringsFromContent(decoded);
    if (txt.trim()) {
      combined += txt + '\n\n';
      if (combined.length > PDF_MAX_EXTRACTED_TEXT_CHARS) {
        throw new Error('PDF text extraction exceeds safe import limits');
      }
    }
  }
  if (!combined.trim()) {
    throw new Error('Could not extract text from this PDF (it may be scanned, encrypted, or use custom fonts).');
  }
  // Convert plain text into HTML paragraphs
  const paragraphs = combined
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs
    .map((p) => '<p>' + escapeHtml(p.replace(/\n/g, ' ')) + '</p>')
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------- Public API ----------
export { savePdf, loadPdf };
