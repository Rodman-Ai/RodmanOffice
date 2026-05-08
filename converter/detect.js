// File-type detection: extension first, magic bytes as a tiebreaker.
// Returns { family, mime, ext } where family is one of:
//   'document', 'spreadsheet', 'image', or 'unknown'.

const EXT_TABLE = {
  // Documents
  docx: { family: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  pdf:  { family: 'document', mime: 'application/pdf', ext: 'pdf' },
  rtf:  { family: 'document', mime: 'application/rtf', ext: 'rtf' },
  odt:  { family: 'document', mime: 'application/vnd.oasis.opendocument.text', ext: 'odt' },
  epub: { family: 'document', mime: 'application/epub+zip', ext: 'epub' },
  md:   { family: 'document', mime: 'text/markdown', ext: 'md' },
  markdown: { family: 'document', mime: 'text/markdown', ext: 'md' },
  html: { family: 'document', mime: 'text/html', ext: 'html' },
  htm:  { family: 'document', mime: 'text/html', ext: 'html' },
  txt:  { family: 'document', mime: 'text/plain', ext: 'txt' },

  // Spreadsheets
  xlsx: { family: 'spreadsheet', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  xls:  { family: 'spreadsheet', mime: 'application/vnd.ms-excel', ext: 'xls' },
  csv:  { family: 'spreadsheet', mime: 'text/csv', ext: 'csv' },
  tsv:  { family: 'spreadsheet', mime: 'text/tab-separated-values', ext: 'tsv' },
  json: { family: 'spreadsheet', mime: 'application/json', ext: 'json' },
  ndjson: { family: 'spreadsheet', mime: 'application/x-ndjson', ext: 'ndjson' },
  jsonl: { family: 'spreadsheet', mime: 'application/x-ndjson', ext: 'ndjson' },
  yaml: { family: 'spreadsheet', mime: 'application/yaml', ext: 'yaml' },
  yml:  { family: 'spreadsheet', mime: 'application/yaml', ext: 'yaml' },
  vcf:  { family: 'spreadsheet', mime: 'text/vcard', ext: 'vcf' },
  ics:  { family: 'spreadsheet', mime: 'text/calendar', ext: 'ics' },

  // Slides
  pptx: { family: 'slides', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },

  // Images
  png:  { family: 'image', mime: 'image/png', ext: 'png' },
  jpg:  { family: 'image', mime: 'image/jpeg', ext: 'jpg' },
  jpeg: { family: 'image', mime: 'image/jpeg', ext: 'jpg' },
  gif:  { family: 'image', mime: 'image/gif', ext: 'gif' },
  bmp:  { family: 'image', mime: 'image/bmp', ext: 'bmp' },
  webp: { family: 'image', mime: 'image/webp', ext: 'webp' },
  svg:  { family: 'image', mime: 'image/svg+xml', ext: 'svg' },
  psd:  { family: 'image', mime: 'image/vnd.adobe.photoshop', ext: 'psd' },
  psb:  { family: 'image', mime: 'image/vnd.adobe.photoshop', ext: 'psb' },
  ico:  { family: 'image', mime: 'image/x-icon', ext: 'ico' },
  tif:  { family: 'image', mime: 'image/tiff', ext: 'tif' },
  tiff: { family: 'image', mime: 'image/tiff', ext: 'tif' },
  ppm:  { family: 'image', mime: 'image/x-portable-pixmap', ext: 'ppm' },
  tga:  { family: 'image', mime: 'image/x-targa', ext: 'tga' },
};

function magicSniff(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const b = bytes;
  // PDF: %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return EXT_TABLE.pdf;
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return EXT_TABLE.png;
  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return EXT_TABLE.jpg;
  // GIF: GIF8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return EXT_TABLE.gif;
  // BMP: BM
  if (b[0] === 0x42 && b[1] === 0x4D) return EXT_TABLE.bmp;
  // WEBP: RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return EXT_TABLE.webp;
  // RTF: {\rtf
  if (b[0] === 0x7B && b[1] === 0x5C && b[2] === 0x72 && b[3] === 0x74) return EXT_TABLE.rtf;
  // ICO: 00 00 01 00
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return EXT_TABLE.ico;
  // TIFF (little-endian): 49 49 2A 00
  if (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00) return EXT_TABLE.tif;
  // TIFF (big-endian): 4D 4D 00 2A
  if (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A) return EXT_TABLE.tif;
  // ZIP-based (DOCX, XLSX, ODT, EPUB) — PK\x03\x04. Can't disambiguate from magic alone.
  if (b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) return null;
  return null;
}

export function detect(name, bytes) {
  const lower = (name || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : '';
  const byExt = EXT_TABLE[ext];
  if (byExt) return byExt;
  const byMagic = bytes ? magicSniff(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) : null;
  if (byMagic) return byMagic;
  return { family: 'unknown', mime: 'application/octet-stream', ext: ext || 'bin' };
}
