// Module worker — runs spreadsheet conversions off the main
// thread. The document engines (docx/pdf/interop) depend on
// `document.createElement` and `DOMParser`, neither of which
// exists in Web Workers, so document jobs are handled on the
// main thread by app.js. Image jobs use canvas APIs and are
// also main-thread. Workers therefore only see spreadsheet
// jobs in v1; refactoring docs to be DOM-free is a follow-up.
//
// Message contract (unchanged from app.js's perspective):
//   { id, source: { bytes, mime, name, family }, target: { ext, mime } }
// Reply:
//   { id, ok: true,  output: { bytes, mime } }   |
//   { id, ok: false, error }
// ArrayBuffers are transferred, not cloned.

import * as sheets from '../lib/sheets/index.js';

self.addEventListener('message', async (e) => {
  const { id, source, target } = e.data;
  try {
    if (source.family !== 'spreadsheet') {
      throw new Error(`Worker only handles spreadsheets; got ${source.family}`);
    }
    const wb = sheets.importSpreadsheet(source.bytes, source.name);
    let bytes;
    if (target.ext === 'xlsx') {
      bytes = sheets.exportWorkbookAsXLSX(wb);
    } else if (target.ext === 'xls') {
      bytes = sheets.exportWorkbookAsXLS(wb);
    } else if (target.ext === 'csv') {
      bytes = sheets.exportSheetAsCSV(wb.sheets[0]);
    } else if (target.ext === 'tsv') {
      bytes = sheets.exportSheetAsTsv(wb.sheets[0]);
    } else if (target.ext === 'psv') {
      bytes = sheets.exportSheetAsPsv(wb.sheets[0]);
    } else {
      throw new Error(`Worker cannot emit .${target.ext}; route via main thread`);
    }
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ id, ok: true, output: { bytes: buf, mime: target.mime } }, [buf]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
});
