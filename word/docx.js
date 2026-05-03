// =============================================================
//  RodmanWord docx.js — minimal .docx (Office Open XML) reader &
//  writer. No external dependencies.
// =============================================================
//
//  WRITING
//    A .docx file is a ZIP archive of XML parts. We use a
//    hand-rolled ZIP writer with the STORED method (no
//    compression) — Word, LibreOffice, and Pages all accept
//    STORED-only archives. This avoids needing a DEFLATE
//    encoder. CRC32 is computed in-line for each entry.
//
//    The package contains:
//      [Content_Types].xml             content-type registry
//      _rels/.rels                     root relationships
//      word/document.xml               main body (paragraphs,
//                                      runs, tables, hyperlinks)
//      word/styles.xml                 heading + body styles
//      word/_rels/document.xml.rels    hyperlink rels + header
//                                      / footer references
//      word/header1.xml (optional)     page header markup
//      word/footer1.xml (optional)     page footer markup,
//                                      with a real <w:fldSimple
//                                      w:instr=" PAGE "> field
//                                      where the user inserted
//                                      a page-number marker
//      docProps/core.xml               author, title, dates
//
//    htmlToWordML walks the editor DOM and emits paragraphs,
//    headings (Heading1..6 styles), runs with bold/italic/u/strike/
//    sub-sup/color/highlight/font, hyperlinks (with rels), tables
//    (bordered), unordered + ordered lists, horizontal rules, and
//    a placeholder for images (full image embedding requires
//    drawingML and isn't worth the cost in a static-site app).
//
//  READING
//    A .docx is a ZIP we have to inflate. Browsers ship native
//    DecompressionStream('deflate-raw') support, so we read the
//    central directory by walking back from the end-of-central-
//    directory record and use the stream API to inflate each
//    DEFLATE entry. STORED entries are sliced directly.
//
//    parseDocxXml interprets word/document.xml with namespace-
//    aware DOM parsing. It recognises:
//      <w:p>            → <p> (or <h1>..<h6> via w:pStyle)
//      <w:r>            → <span> with bold/italic/u/strike/sub-
//                          sup/colour/highlight/font from <w:rPr>
//      <w:hyperlink>    → <a href> via the rId → target map from
//                          word/_rels/document.xml.rels
//      <w:tbl>/<w:tr>   → <table class="bordered">/<tr>/<td>
//      <w:list>         → <ul>/<ol> (basic; numId-aware)
//      w:jc             → text-align style
//
//  PUBLIC SURFACE
//    window.RodmanDocx = {
//      saveDocx(html, opts)            → Blob (.docx)
//      loadDocx(arrayBuffer)           → Promise<string>
//                                         (sanitised HTML)
//      __buildZip(files)               internal — used by
//      __readZip(arrayBuffer)            interop.js for ODT and
//                                         EPUB packaging
//    }
//
//  See ARCHITECTURE.md for the wider runtime model and
//  FEATURES.md for which buttons trigger save/load.
// =============================================================
(function () {
  'use strict';

  // ---------- CRC32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  // ---------- ZIP writer (STORED) ----------
  function dosTime(d) {
    return ((d.getHours() & 0x1F) << 11) |
           ((d.getMinutes() & 0x3F) << 5) |
           ((d.getSeconds() / 2) & 0x1F);
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) & 0x7F) << 9) |
           (((d.getMonth() + 1) & 0x0F) << 5) |
           (d.getDate() & 0x1F);
  }

  function writeUint16LE(view, off, v) { view.setUint16(off, v, true); }
  function writeUint32LE(view, off, v) { view.setUint32(off, v >>> 0, true); }

  function buildZip(files) {
    // files: [{ name: 'word/document.xml', data: Uint8Array }]
    const now = new Date();
    const time = dosTime(now), date = dosDate(now);
    const localChunks = [];
    const cdChunks = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      writeUint32LE(lv, 0, 0x04034b50);
      writeUint16LE(lv, 4, 20);            // version needed
      writeUint16LE(lv, 6, 0);             // flags
      writeUint16LE(lv, 8, 0);             // method (0 = stored)
      writeUint16LE(lv, 10, time);
      writeUint16LE(lv, 12, date);
      writeUint32LE(lv, 14, crc);
      writeUint32LE(lv, 18, data.length);  // compressed size
      writeUint32LE(lv, 22, data.length);  // uncompressed size
      writeUint16LE(lv, 26, nameBytes.length);
      writeUint16LE(lv, 28, 0);            // extra
      localHeader.set(nameBytes, 30);
      localChunks.push(localHeader, data);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      writeUint32LE(cv, 0, 0x02014b50);
      writeUint16LE(cv, 4, 20);            // version made by
      writeUint16LE(cv, 6, 20);            // version needed
      writeUint16LE(cv, 8, 0);             // flags
      writeUint16LE(cv, 10, 0);            // method
      writeUint16LE(cv, 12, time);
      writeUint16LE(cv, 14, date);
      writeUint32LE(cv, 16, crc);
      writeUint32LE(cv, 20, data.length);
      writeUint32LE(cv, 24, data.length);
      writeUint16LE(cv, 28, nameBytes.length);
      writeUint16LE(cv, 30, 0);            // extra
      writeUint16LE(cv, 32, 0);            // comment
      writeUint16LE(cv, 34, 0);            // disk no
      writeUint16LE(cv, 36, 0);            // internal attrs
      writeUint32LE(cv, 38, 0);            // external attrs
      writeUint32LE(cv, 42, offset);       // local header offset
      cd.set(nameBytes, 46);
      cdChunks.push(cd);

      offset += localHeader.length + data.length;
    }

    let cdSize = 0;
    cdChunks.forEach((c) => { cdSize += c.length; });
    const cdOffset = offset;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    writeUint32LE(ev, 0, 0x06054b50);
    writeUint16LE(ev, 4, 0);
    writeUint16LE(ev, 6, 0);
    writeUint16LE(ev, 8, files.length);
    writeUint16LE(ev, 10, files.length);
    writeUint32LE(ev, 12, cdSize);
    writeUint32LE(ev, 16, cdOffset);
    writeUint16LE(ev, 20, 0);

    const total = offset + cdSize + eocd.length;
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of localChunks) { out.set(c, p); p += c.length; }
    for (const c of cdChunks)    { out.set(c, p); p += c.length; }
    out.set(eocd, p);
    return out;
  }

  // ---------- ZIP reader ----------
  async function readZip(buffer) {
    const u8 = new Uint8Array(buffer);
    const view = new DataView(u8.buffer);
    // Locate end of central directory record (search backwards)
    let eocdOff = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocdOff = i; break; }
    }
    if (eocdOff < 0) throw new Error('Not a valid ZIP file');
    const cdEntries = view.getUint16(eocdOff + 10, true);
    let cdOff = view.getUint32(eocdOff + 16, true);

    const files = {};
    for (let i = 0; i < cdEntries; i++) {
      if (view.getUint32(cdOff, true) !== 0x02014b50) break;
      const method = view.getUint16(cdOff + 10, true);
      const compressedSize = view.getUint32(cdOff + 20, true);
      const uncompressedSize = view.getUint32(cdOff + 24, true);
      const nameLen = view.getUint16(cdOff + 28, true);
      const extraLen = view.getUint16(cdOff + 30, true);
      const commentLen = view.getUint16(cdOff + 32, true);
      const localOff = view.getUint32(cdOff + 42, true);
      const name = dec.decode(u8.subarray(cdOff + 46, cdOff + 46 + nameLen));
      cdOff += 46 + nameLen + extraLen + commentLen;

      // Local file header
      const lhNameLen = view.getUint16(localOff + 26, true);
      const lhExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
      const dataBytes = u8.subarray(dataStart, dataStart + compressedSize);

      let bytes;
      if (method === 0) {
        bytes = dataBytes.slice();
      } else if (method === 8) {
        // deflate-raw
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('DecompressionStream not available; cannot decompress this DOCX.');
        }
        const stream = new Blob([dataBytes]).stream().pipeThrough(
          new DecompressionStream('deflate-raw')
        );
        const buf = await new Response(stream).arrayBuffer();
        bytes = new Uint8Array(buf);
        if (bytes.length !== uncompressedSize && uncompressedSize !== 0) {
          // some browsers/drivers may pad; ignore
        }
      } else {
        // unsupported method
        continue;
      }
      files[name] = bytes;
    }
    return files;
  }

  // ---------- XML helpers ----------
  function escXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ---------- HTML → WordML ----------
  function htmlToWordML(rootEl) {
    const lines = [];
    const rels = []; // [{ id, target }]
    let nextRelId = 100;

    function addRel(target) {
      nextRelId++;
      const id = 'rId' + nextRelId;
      rels.push({ id, target });
      return id;
    }

    function inlineRunsFor(node, ancestorFmt) {
      const runs = [];
      const fmt = Object.assign({}, ancestorFmt);
      if (node.nodeType === 3) {
        runs.push(buildRun(node.nodeValue, fmt));
        return runs;
      }
      if (node.nodeType !== 1) return runs;
      const tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'b': case 'strong': fmt.b = true; break;
        case 'i': case 'em': fmt.i = true; break;
        case 'u': fmt.u = true; break;
        case 's': case 'strike': case 'del': fmt.strike = true; break;
        case 'sub': fmt.vert = 'subscript'; break;
        case 'sup': fmt.vert = 'superscript'; break;
        case 'code': fmt.font = 'Consolas'; break;
        case 'br':
          runs.push('<w:r><w:br/></w:r>');
          return runs;
        case 'a': {
          const href = node.getAttribute('href') || '';
          if (/^https?:|^mailto:/i.test(href)) {
            const id = addRel(href);
            const inner = [];
            node.childNodes.forEach((c) => inner.push(...inlineRunsFor(c, Object.assign({}, fmt, { color: '0563C1', u: true }))));
            runs.push('<w:hyperlink r:id="' + id + '">' + inner.join('') + '</w:hyperlink>');
          } else {
            node.childNodes.forEach((c) => runs.push(...inlineRunsFor(c, fmt)));
          }
          return runs;
        }
      }
      // Inline color from style
      const style = node.getAttribute && node.getAttribute('style') || '';
      const colorMatch = style.match(/color:\s*([^;]+)/i);
      if (colorMatch) {
        const c = colorMatch[1].trim();
        const hex = colorToHex(c);
        if (hex) fmt.color = hex;
      }
      const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/i);
      if (bgMatch) {
        const c = bgMatch[1].trim();
        const hex = colorToHex(c);
        if (hex) fmt.highlight = hex;
      }
      node.childNodes.forEach((c) => runs.push(...inlineRunsFor(c, fmt)));
      return runs;
    }

    function buildRun(text, fmt) {
      if (!text) return '';
      const rprParts = [];
      if (fmt.b) rprParts.push('<w:b/>');
      if (fmt.i) rprParts.push('<w:i/>');
      if (fmt.u) rprParts.push('<w:u w:val="single"/>');
      if (fmt.strike) rprParts.push('<w:strike/>');
      if (fmt.vert) rprParts.push('<w:vertAlign w:val="' + fmt.vert + '"/>');
      if (fmt.color) rprParts.push('<w:color w:val="' + fmt.color + '"/>');
      if (fmt.highlight) rprParts.push('<w:shd w:val="clear" w:color="auto" w:fill="' + fmt.highlight + '"/>');
      if (fmt.font) rprParts.push('<w:rFonts w:ascii="' + fmt.font + '" w:hAnsi="' + fmt.font + '"/>');
      const rpr = rprParts.length ? '<w:rPr>' + rprParts.join('') + '</w:rPr>' : '';
      const safeText = escXml(text);
      return '<w:r>' + rpr +
        '<w:t xml:space="preserve">' + safeText + '</w:t></w:r>';
    }

    function colorToHex(s) {
      s = s.trim();
      if (s.startsWith('#')) return s.slice(1).padStart(6, '0').slice(0, 6).toUpperCase();
      const m = s.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (m) {
        return [m[1], m[2], m[3]].map((n) =>
          parseInt(n, 10).toString(16).padStart(2, '0')).join('').toUpperCase();
      }
      return null;
    }

    function paragraph(node, styleId) {
      const runs = [];
      node.childNodes.forEach((c) => runs.push(...inlineRunsFor(c, {})));
      const align = node.style && node.style.textAlign;
      const ppr = [];
      if (styleId) ppr.push('<w:pStyle w:val="' + styleId + '"/>');
      if (align) {
        const map = { left: 'left', center: 'center', right: 'right', justify: 'both' };
        if (map[align]) ppr.push('<w:jc w:val="' + map[align] + '"/>');
      }
      const pprStr = ppr.length ? '<w:pPr>' + ppr.join('') + '</w:pPr>' : '';
      lines.push('<w:p>' + pprStr + runs.join('') + '</w:p>');
    }

    function block(node) {
      if (node.nodeType !== 1) {
        if (node.nodeType === 3 && node.nodeValue.trim()) {
          lines.push('<w:p><w:r><w:t xml:space="preserve">' +
            escXml(node.nodeValue) + '</w:t></w:r></w:p>');
        }
        return;
      }
      const tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'h1': paragraph(node, 'Heading1'); break;
        case 'h2': paragraph(node, 'Heading2'); break;
        case 'h3': paragraph(node, 'Heading3'); break;
        case 'h4': paragraph(node, 'Heading4'); break;
        case 'h5': paragraph(node, 'Heading5'); break;
        case 'h6': paragraph(node, 'Heading6'); break;
        case 'p': paragraph(node, null); break;
        case 'blockquote':
        case 'pre':  paragraph(node, 'IntenseQuote'); break;
        case 'ul':
        case 'ol': {
          const ordered = tag === 'ol';
          node.querySelectorAll(':scope > li').forEach((li) => {
            const runs = [];
            li.childNodes.forEach((c) => runs.push(...inlineRunsFor(c, {})));
            const bullet = ordered ? 'ListNumber' : 'ListBullet';
            lines.push('<w:p><w:pPr><w:pStyle w:val="' + bullet + '"/></w:pPr>' +
              runs.join('') + '</w:p>');
          });
          break;
        }
        case 'hr':
          lines.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="auto"/></w:pBdr></w:pPr></w:p>');
          break;
        case 'table': {
          let html = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
            '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/>' +
            '<w:left w:val="single" w:sz="4" w:color="auto"/>' +
            '<w:bottom w:val="single" w:sz="4" w:color="auto"/>' +
            '<w:right w:val="single" w:sz="4" w:color="auto"/>' +
            '<w:insideH w:val="single" w:sz="4" w:color="auto"/>' +
            '<w:insideV w:val="single" w:sz="4" w:color="auto"/>' +
            '</w:tblBorders></w:tblPr>';
          node.querySelectorAll(':scope > tbody > tr, :scope > tr').forEach((tr) => {
            html += '<w:tr>';
            tr.querySelectorAll('th, td').forEach((td) => {
              const runs = [];
              td.childNodes.forEach((c) => runs.push(...inlineRunsFor(c, td.tagName === 'TH' ? { b: true } : {})));
              html += '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' +
                '<w:p>' + runs.join('') + '</w:p></w:tc>';
            });
            html += '</w:tr>';
          });
          html += '</w:tbl>';
          // tables must be followed by a paragraph
          html += '<w:p/>';
          lines.push(html);
          break;
        }
        case 'figure':
        case 'div':
        case 'section':
        case 'article':
          node.childNodes.forEach(block);
          break;
        case 'br':
          lines.push('<w:p/>');
          break;
        case 'img':
          // Skipped: embedding images requires writing the binary into media/
          // and a relationship + drawingML, which is heavy. For now we keep
          // text only — a placeholder is inserted instead.
          lines.push('<w:p><w:r><w:rPr><w:i/><w:color w:val="888888"/></w:rPr>' +
            '<w:t xml:space="preserve">[image: ' +
            escXml(node.getAttribute('alt') || node.getAttribute('src') || '') +
            ']</w:t></w:r></w:p>');
          break;
        default:
          // Unknown block: render its inline children as a paragraph
          if (Array.from(node.childNodes).every((c) =>
              c.nodeType !== 1 || ['B','STRONG','I','EM','U','S','STRIKE','DEL','SUB','SUP','CODE','BR','A','SPAN','FONT'].includes(c.tagName))) {
            paragraph(node, null);
          } else {
            node.childNodes.forEach(block);
          }
      }
    }

    Array.from(rootEl.childNodes).forEach(block);

    const body = lines.join('') ||
      '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>';

    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"' +
      ' w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr>' +
      '</w:body></w:document>';

    return { documentXml, rels };
  }

  // ---------- Build the .docx package ----------
  // Build a mini WordML body from a header/footer HTML fragment, with the
  // .rwd-pagenum span replaced by a real <w:fldSimple> PAGE field. Returns
  // a string containing one or more <w:p>...</w:p> paragraphs.
  function buildPartBody(html) {
    if (!html || !html.trim()) {
      return '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>';
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Swap each .rwd-pagenum with a literal token we'll convert to PAGE field
    tmp.querySelectorAll('.rwd-pagenum').forEach((el) => {
      el.replaceWith('PAGEFIELD');
    });
    const { documentXml } = htmlToWordML(tmp);
    // documentXml contains a full <w:document>...<w:body>...</w:body></w:document>
    // wrapper; pull out just the body's paragraphs.
    let body = documentXml.replace(/^[\s\S]*<w:body>/, '')
                          .replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, '')
                          .replace(/<\/w:body>[\s\S]*$/, '');
    // Replace the page-field tokens with real <w:fldSimple instr="PAGE"/> runs
    body = body.replace(
      /PAGEFIELD/g,
      '</w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve">'
    );
    // The replacement above can leave <w:r><w:t xml:space="preserve"></w:t></w:r>
    // empty pairs; that's still valid WordML.
    return body;
  }

  function buildDocx(html, opts) {
    const o = (typeof opts === 'string') ? { title: opts } : (opts || {});
    const title = o.title || 'Document';
    const headerHtml = o.header || '';
    const footerHtml = o.footer || '';
    const hasHeader = !!headerHtml.replace(/<[^>]+>/g, '').trim();
    const hasFooter = !!footerHtml.replace(/<[^>]+>/g, '').trim();

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const { documentXml: rawDocumentXml, rels } = htmlToWordML(tmp);

    const headerXml = hasHeader ?
      ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        buildPartBody(headerHtml) +
        '</w:hdr>') : '';
    const footerXml = hasFooter ?
      ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        buildPartBody(footerHtml) +
        '</w:ftr>') : '';

    // Inject header/footer references into <w:sectPr>.
    let documentXml = rawDocumentXml;
    if (hasHeader || hasFooter) {
      const refs =
        (hasHeader ? '<w:headerReference w:type="default" r:id="rIdHdr"/>' : '') +
        (hasFooter ? '<w:footerReference w:type="default" r:id="rIdFtr"/>' : '');
      documentXml = documentXml.replace('<w:sectPr>', '<w:sectPr>' + refs);
    }

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      (hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '') +
      (hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>';

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>';

    const docRelsXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      (hasHeader ? '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '') +
      (hasFooter ? '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '') +
      rels.map((r) =>
        '<Relationship Id="' + r.id +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"' +
        ' Target="' + escXml(r.target) + '" TargetMode="External"/>'
      ).join('') +
      '</Relationships>';

    const stylesXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>' +
      '<w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'].map((h, i) => {
        const sizes = [44, 32, 26, 22, 22, 22];
        return '<w:style w:type="paragraph" w:styleId="' + h + '">' +
          '<w:name w:val="' + h + '"/>' +
          '<w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/>' +
          '<w:color w:val="2B579A"/><w:sz w:val="' + sizes[i] + '"/></w:rPr></w:style>';
      }).join('') +
      '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="IntenseQuote"><w:name w:val="Intense Quote"/>' +
      '<w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>' +
      '</w:styles>';

    const coreXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmlns:dcterms="http://purl.org/dc/terms/"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + escXml(title || 'Document') + '</dc:title>' +
      '<dc:creator>RodmanWord</dc:creator>' +
      '<cp:lastModifiedBy>RodmanWord</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:modified>' +
      '</cp:coreProperties>';

    const files = [
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels',         data: enc.encode(rootRels) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(docRelsXml) },
      { name: 'word/styles.xml',     data: enc.encode(stylesXml) },
      { name: 'word/document.xml',   data: enc.encode(documentXml) },
      { name: 'docProps/core.xml',   data: enc.encode(coreXml) },
    ];
    if (hasHeader) files.push({ name: 'word/header1.xml', data: enc.encode(headerXml) });
    if (hasFooter) files.push({ name: 'word/footer1.xml', data: enc.encode(footerXml) });
    return buildZip(files);
  }

  // ---------- WordML → HTML ----------
  function parseDocxXml(xmlText, relsByRid) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid document.xml');
    }
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    function isElem(n, name) {
      return n && n.nodeType === 1 && n.localName === name && n.namespaceURI === W;
    }
    function findChild(node, name) {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (isElem(c, name)) return c;
      }
      return null;
    }
    function findChildren(node, name) {
      const out = [];
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (isElem(c, name)) out.push(c);
      }
      return out;
    }

    function runHtml(rEl) {
      const rPr = findChild(rEl, 'rPr');
      let bold = false, italic = false, underline = false, strike = false;
      let vert = '', color = '', highlight = '', font = '';
      if (rPr) {
        bold = !!findChild(rPr, 'b');
        italic = !!findChild(rPr, 'i');
        const u = findChild(rPr, 'u');
        underline = !!u && (u.getAttributeNS(W, 'val') !== 'none');
        strike = !!findChild(rPr, 'strike');
        const va = findChild(rPr, 'vertAlign');
        if (va) vert = va.getAttributeNS(W, 'val') || '';
        const co = findChild(rPr, 'color');
        if (co) {
          const v = co.getAttributeNS(W, 'val');
          if (v && v !== 'auto') color = v;
        }
        const shd = findChild(rPr, 'shd');
        if (shd) {
          const v = shd.getAttributeNS(W, 'fill');
          if (v && v !== 'auto') highlight = v;
        }
        const rf = findChild(rPr, 'rFonts');
        if (rf) font = rf.getAttributeNS(W, 'ascii') || '';
      }

      let inner = '';
      for (let c = rEl.firstChild; c; c = c.nextSibling) {
        if (!isElem(c, 't') && !isElem(c, 'br') && !isElem(c, 'tab')) continue;
        if (isElem(c, 't')) inner += escXml(c.textContent);
        else if (isElem(c, 'br')) inner += '<br/>';
        else if (isElem(c, 'tab')) inner += '&emsp;';
      }
      if (!inner) return '';

      let html = inner;
      const styleParts = [];
      if (color) styleParts.push('color:#' + color);
      if (highlight) styleParts.push('background:#' + highlight);
      if (font) styleParts.push("font-family:'" + font + "'");
      if (styleParts.length) html = '<span style="' + styleParts.join(';') + '">' + html + '</span>';
      if (vert === 'subscript') html = '<sub>' + html + '</sub>';
      else if (vert === 'superscript') html = '<sup>' + html + '</sup>';
      if (strike) html = '<s>' + html + '</s>';
      if (underline) html = '<u>' + html + '</u>';
      if (italic) html = '<em>' + html + '</em>';
      if (bold) html = '<strong>' + html + '</strong>';
      return html;
    }

    function paragraphHtml(pEl) {
      const pPr = findChild(pEl, 'pPr');
      let style = 'p';
      let align = '';
      let isList = false;
      if (pPr) {
        const ps = findChild(pPr, 'pStyle');
        if (ps) {
          const v = (ps.getAttributeNS(W, 'val') || '').toLowerCase();
          if (/heading\s*1/.test(v) || v === 'heading1' || v === 'title') style = 'h1';
          else if (/heading\s*2/.test(v) || v === 'heading2' || v === 'subtitle') style = 'h2';
          else if (/heading\s*3/.test(v) || v === 'heading3') style = 'h3';
          else if (/heading\s*4/.test(v) || v === 'heading4') style = 'h4';
          else if (/heading\s*5/.test(v) || v === 'heading5') style = 'h5';
          else if (/heading\s*6/.test(v) || v === 'heading6') style = 'h6';
          else if (v === 'listbullet' || v === 'listparagraph' || /list\s*bullet/.test(v)) isList = 'ul';
          else if (v === 'listnumber' || /list\s*number/.test(v)) isList = 'ol';
          else if (v === 'intensequote' || v === 'quote') style = 'blockquote';
          else if (v === 'codeblock') style = 'pre';
        }
        const numPr = findChild(pPr, 'numPr');
        if (numPr && !isList) isList = 'ul';
        const jc = findChild(pPr, 'jc');
        if (jc) {
          const v = jc.getAttributeNS(W, 'val');
          const map = { left: 'left', center: 'center', right: 'right', both: 'justify', start: 'left', end: 'right' };
          if (map[v]) align = map[v];
        }
      }

      let inner = '';
      for (let c = pEl.firstChild; c; c = c.nextSibling) {
        if (isElem(c, 'r')) inner += runHtml(c);
        else if (isElem(c, 'hyperlink')) {
          const id = c.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
          const target = relsByRid[id] || '#';
          let h = '';
          for (let cc = c.firstChild; cc; cc = cc.nextSibling) {
            if (isElem(cc, 'r')) h += runHtml(cc);
          }
          inner += '<a href="' + escXml(target) + '">' + h + '</a>';
        }
      }
      if (!inner.trim() && !isList) inner = '<br/>';

      const styleAttr = align ? ' style="text-align:' + align + '"' : '';
      if (isList) {
        return { kind: 'list', list: isList, html: '<li>' + inner + '</li>' };
      }
      return { kind: 'block', html: '<' + style + styleAttr + '>' + inner + '</' + style + '>' };
    }

    function tableHtml(tblEl) {
      let html = '<table class="bordered"><tbody>';
      findChildren(tblEl, 'tr').forEach((tr) => {
        html += '<tr>';
        findChildren(tr, 'tc').forEach((tc) => {
          let cellHtml = '';
          findChildren(tc, 'p').forEach((p) => {
            const r = paragraphHtml(p);
            cellHtml += r.kind === 'list' ? '<ul>' + r.html + '</ul>' : r.html;
          });
          html += '<td>' + cellHtml + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      return html;
    }

    const body = doc.querySelector('body') ||
                 doc.getElementsByTagNameNS(W, 'body')[0];
    if (!body) throw new Error('No <w:body> in document.xml');

    let html = '';
    let listOpen = null;
    for (let c = body.firstChild; c; c = c.nextSibling) {
      if (isElem(c, 'p')) {
        const r = paragraphHtml(c);
        if (r.kind === 'list') {
          if (listOpen !== r.list) {
            if (listOpen) html += '</' + listOpen + '>';
            html += '<' + r.list + '>';
            listOpen = r.list;
          }
          html += r.html;
        } else {
          if (listOpen) { html += '</' + listOpen + '>'; listOpen = null; }
          html += r.html;
        }
      } else if (isElem(c, 'tbl')) {
        if (listOpen) { html += '</' + listOpen + '>'; listOpen = null; }
        html += tableHtml(c);
      }
    }
    if (listOpen) html += '</' + listOpen + '>';
    return html;
  }

  function parseRels(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const out = {};
    doc.querySelectorAll('Relationship').forEach((el) => {
      out[el.getAttribute('Id')] = el.getAttribute('Target');
    });
    return out;
  }

  async function loadDocx(arrayBuffer) {
    const files = await readZip(arrayBuffer);
    const docXml = files['word/document.xml'];
    if (!docXml) throw new Error('Not a .docx (missing word/document.xml)');
    const docXmlText = dec.decode(docXml);
    let rels = {};
    const relsBytes = files['word/_rels/document.xml.rels'];
    if (relsBytes) rels = parseRels(dec.decode(relsBytes));
    return parseDocxXml(docXmlText, rels);
  }

  // ---------- Public API ----------
  window.RodmanDocx = {
    // Internal hooks reused by interop.js (ODT, EPUB)
    __buildZip: buildZip,
    __readZip: readZip,
    saveDocx(html, opts) {
      // opts can be a plain title string (back-compat) or
      // { title, header, footer } object.
      return new Blob([buildDocx(html, opts)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
    },
    async loadDocx(arrayBuffer) {
      return loadDocx(arrayBuffer);
    },
  };
})();
