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
];

const SHEET_OUTPUTS = [
  { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel (.xlsx)' },
  { ext: 'csv',  mime: 'text/csv', label: 'CSV (.csv)' },
  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF (.pdf)' },
];

const IMAGE_OUTPUTS = [
  { ext: 'png',  mime: 'image/png', label: 'PNG (.png)' },
  { ext: 'jpg',  mime: 'image/jpeg', label: 'JPEG (.jpg)' },
  { ext: 'webp', mime: 'image/webp', label: 'WebP (.webp)' },
  { ext: 'psd',  mime: 'image/vnd.adobe.photoshop', label: 'Photoshop (.psd)' },
  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF (.pdf)' },
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
// but can also be rasterized into any image format — surface those
// extra options on PDF inputs so the dropdown actually offers them.
const PDF_IMAGE_BRIDGE = IMAGE_OUTPUTS.filter((o) => o.ext !== 'pdf');

export function targetsForItem({ family, ext }) {
  const base = targetsFor(family);
  if (family === 'document' && ext === 'pdf') return [...base, ...PDF_IMAGE_BRIDGE];
  return base;
}
