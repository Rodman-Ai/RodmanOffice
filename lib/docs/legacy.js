// =============================================================
//  Legacy MS Office binary readers — DOC (Word 97-2003) and
//  PPT (PowerPoint 97-2003).
//
//  Both formats are OLE2 / Compound File Binary documents whose
//  text streams contain UTF-16 LE (and occasionally CP1252) text
//  runs interleaved with binary metadata. Writing a full Word /
//  PowerPoint Binary File Format parser would be ~1000s of lines
//  per format and well beyond the scope of a static-site converter.
//
//  Instead we do best-effort text extraction: scan the raw bytes
//  for printable UTF-16 LE runs above a minimum length, fall back
//  to ANSI scanning if the UTF-16 pass yields nothing useful, and
//  emit each surviving run as an HTML paragraph. The result loses
//  formatting, images, tables, and slide layout — but it gets the
//  body text out, which is what most users actually need.
//
//  Users who need fidelity should re-save the file as DOCX / PPTX
//  in Word / PowerPoint / LibreOffice first; the converter handles
//  those modern formats with full structure.
// =============================================================

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Walk a UTF-16 LE byte stream and collect runs of printable BMP
// codepoints. Anything outside BMP printable ranges (or a non-zero
// high byte that doesn't correspond to a known Latin-extended
// block) breaks the current run.
function extractUtf16Runs(bytes, minLen) {
  const runs = [];
  let cur = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    const cp = (hi << 8) | lo;
    const printableAscii = hi === 0 && (lo === 0x09 || lo === 0x0A || lo === 0x0D ||
                                        (lo >= 0x20 && lo <= 0x7E));
    const latinExtended = hi === 0 && lo >= 0xA0;
    const europeanBlock = hi >= 0x01 && hi <= 0x04 && lo >= 0x20;
    const generalPunctuation = hi === 0x20 && lo >= 0x00 && lo <= 0x6F;
    const arrowsBlock = hi === 0x21 && lo >= 0x90 && lo <= 0xFF;
    if (printableAscii || latinExtended || europeanBlock ||
        generalPunctuation || arrowsBlock) {
      // U+0000 already filtered by the test above; everything that
      // reaches here is a real character.
      cur += String.fromCharCode(cp);
    } else {
      if (cur.length >= minLen) runs.push(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen) runs.push(cur);
  return runs;
}

// Backstop scanner for older docs that stored ANSI/CP1252 text
// instead of UTF-16. Used only when the UTF-16 pass returns
// suspiciously little.
function extractAnsiRuns(bytes, minLen) {
  const runs = [];
  let cur = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x09 || b === 0x0A || b === 0x0D || (b >= 0x20 && b <= 0x7E)) {
      cur += String.fromCharCode(b);
    } else if (b >= 0xA0 && b <= 0xFF) {
      cur += String.fromCharCode(b);
    } else {
      if (cur.length >= minLen) runs.push(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen) runs.push(cur);
  return runs;
}

function runsToHtml(runs) {
  if (!runs.length) {
    return '<p>(no text could be extracted from this legacy binary file — re-save it as DOCX or PPTX in Word / PowerPoint and try again)</p>';
  }
  return runs
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter((r) => r.length > 0)
    .map((r) => `<p>${escapeHtml(r)}</p>`)
    .join('');
}

function legacyExtract(bytes, minLen) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const utf16 = extractUtf16Runs(u8, minLen);
  // If the UTF-16 pass returns very few runs the document is
  // probably ANSI/CP1252 — try that next.
  if (utf16.length >= 3) return utf16;
  const ansi = extractAnsiRuns(u8, minLen);
  return ansi.length > utf16.length ? ansi : utf16;
}

/**
 * Best-effort text extraction from a Word 97-2003 .doc file.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string} HTML
 */
export function docImport(bytes) {
  return runsToHtml(legacyExtract(bytes, 5));
}

/**
 * Best-effort text extraction from a PowerPoint 97-2003 .ppt file.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string} HTML
 */
export function pptImport(bytes) {
  // Slightly higher minimum length for PPT — its records contain
  // shorter binary fragments that look like 3-4-character runs.
  return runsToHtml(legacyExtract(bytes, 6));
}
