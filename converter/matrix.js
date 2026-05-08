// Capability matrix — for each input family, the list of output
// formats we can write. Cross-family entries (e.g. CSV → PDF) ride
// through the document engine's PDF writer.
//
// Entry shape: { ext, mime, label }.

const DOC_OUTPUTS = [
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word (.docx)' },
  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF (.pdf)' },
  { ext: 'rtf',  mime: 'application/rtf', label: 'Rich Text (.rtf)' },
  { ext: 'odt',  mime: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument (.odt)' },
  { ext: 'epub', mime: 'application/epub+zip', label: 'EPUB (.epub)' },
  { ext: 'md',   mime: 'text/markdown', label: 'Markdown (.md)' },
  { ext: 'html', mime: 'text/html', label: 'HTML (.html)' },
  { ext: 'txt',  mime: 'text/plain', label: 'Plain text (.txt)' },
  { ext: 'adoc', mime: 'text/asciidoc', label: 'AsciiDoc (.adoc)' },
  { ext: 'tex',  mime: 'application/x-tex', label: 'LaTeX (.tex)' },
  // Newly added doc targets.
  { ext: 'json', mime: 'application/json', label: 'JSON document (.json)' },
  { ext: 'yaml', mime: 'application/yaml', label: 'YAML document (.yaml)' },
  { ext: 'wiki', mime: 'text/x-wiki', label: 'MediaWiki (.wiki)' },
  { ext: 'rst',  mime: 'text/x-rst', label: 'reStructuredText (.rst)' },
  { ext: 'org',  mime: 'text/x-org', label: 'Org-mode (.org)' },
  { ext: 'dbk',  mime: 'application/docbook+xml', label: 'DocBook (.dbk)' },
  { ext: 'fb2',  mime: 'application/x-fictionbook+xml', label: 'FictionBook (.fb2)' },
];

const SHEET_OUTPUTS = [
  { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel (.xlsx)' },
  { ext: 'csv',  mime: 'text/csv', label: 'CSV (.csv)' },
  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF (.pdf)' },
  // Newly added spreadsheet targets.
  { ext: 'tsv',  mime: 'text/tab-separated-values', label: 'TSV (.tsv)' },
  { ext: 'psv',  mime: 'text/plain', label: 'PSV pipe-separated (.psv)' },
  { ext: 'json', mime: 'application/json', label: 'JSON (.json)' },
  { ext: 'ndjson', mime: 'application/x-ndjson', label: 'NDJSON (.ndjson)' },
  { ext: 'html', mime: 'text/html', label: 'HTML tables (.html)' },
  { ext: 'md',   mime: 'text/markdown', label: 'Markdown tables (.md)' },
  { ext: 'xml',  mime: 'application/vnd.ms-excel.sheet.xml', label: 'Excel 2003 XML (.xml)' },
  { ext: 'ods',  mime: 'application/vnd.oasis.opendocument.spreadsheet', label: 'OpenDocument (.ods)' },
];

const IMAGE_OUTPUTS = [
  { ext: 'png',  mime: 'image/png', label: 'PNG (.png)' },
  { ext: 'jpg',  mime: 'image/jpeg', label: 'JPEG (.jpg)' },
  { ext: 'webp', mime: 'image/webp', label: 'WebP (.webp)' },
  { ext: 'psd',  mime: 'image/vnd.adobe.photoshop', label: 'Photoshop (.psd)' },
  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF (.pdf)' },
  // Newly added image targets.
  { ext: 'bmp',  mime: 'image/bmp', label: 'Bitmap (.bmp)' },
  { ext: 'ico',  mime: 'image/x-icon', label: 'Icon (.ico)' },
  { ext: 'ppm',  mime: 'image/x-portable-pixmap', label: 'Netpbm PPM (.ppm)' },
  { ext: 'tga',  mime: 'image/x-targa', label: 'Targa (.tga)' },
  { ext: 'cbz',  mime: 'application/vnd.comicbook+zip', label: 'Comic Book ZIP (.cbz)' },
];

export const MATRIX = {
  document: DOC_OUTPUTS,
  spreadsheet: SHEET_OUTPUTS,
  image: IMAGE_OUTPUTS,
  unknown: [],
};

export function targetsFor(family) {
  return MATRIX[family] || [];
}

// Per-source augmentation. PDF is a document for text/PDF→PDF flows
// but can also be rasterized into any image format (or every page
// into a CBZ archive). Surface those extra options on PDF inputs so
// the dropdown actually offers them.
const PDF_IMAGE_BRIDGE = IMAGE_OUTPUTS.filter((o) => o.ext !== 'pdf');

export function targetsForItem({ family, ext }) {
  const base = targetsFor(family);
  if (family === 'document' && ext === 'pdf') return [...base, ...PDF_IMAGE_BRIDGE];
  return base;
}
