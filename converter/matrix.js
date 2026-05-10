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
  // Cross-family bridges into the presentation engines.
  { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint (.pptx)' },
  { ext: 'odp',  mime: 'application/vnd.oasis.opendocument.presentation', label: 'OpenDocument presentation (.odp)' },
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
  // Contact / calendar bridges. Read paths live alongside these
  // outputs so a .vcf or .ics input can target the regular
  // spreadsheet outputs.
  { ext: 'vcf',  mime: 'text/vcard', label: 'vCard (.vcf)' },
  { ext: 'ics',  mime: 'text/calendar', label: 'iCalendar (.ics)' },
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
  { ext: 'tif',  mime: 'image/tiff', label: 'TIFF (.tif)' },
];

const SLIDES_OUTPUTS = [
  { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint (.pptx)' },
  { ext: 'odp',  mime: 'application/vnd.oasis.opendocument.presentation', label: 'OpenDocument presentation (.odp)' },
  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF (.pdf)' },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word (.docx)' },
  { ext: 'md',   mime: 'text/markdown', label: 'Markdown (.md)' },
  { ext: 'html', mime: 'text/html', label: 'HTML (.html)' },
  { ext: 'txt',  mime: 'text/plain', label: 'Plain text (.txt)' },
];

const VIDEO_OUTPUTS = [
  // Common containers (H.264 + AAC default).
  { ext: 'mp4',  mime: 'video/mp4',         label: 'MP4 (.mp4)' },
  { ext: 'mov',  mime: 'video/quicktime',   label: 'QuickTime (.mov)' },
  { ext: 'webm', mime: 'video/webm',        label: 'WebM (.webm)' },
  { ext: 'mkv',  mime: 'video/x-matroska',  label: 'Matroska (.mkv)' },
  { ext: 'avi',  mime: 'video/x-msvideo',   label: 'AVI (.avi)' },

  // Legacy / specialised containers added in Part 7.
  { ext: 'wmv',  mime: 'video/x-ms-wmv',    label: 'Windows Media (.wmv)' },
  { ext: 'flv',  mime: 'video/x-flv',       label: 'Flash Video (.flv)' },
  { ext: '3gp',  mime: 'video/3gpp',        label: '3GP mobile (.3gp)' },
  { ext: 'ts',   mime: 'video/mp2t',        label: 'MPEG-TS (.ts)' },
  { ext: 'm2ts', mime: 'video/mp2t',        label: 'AVCHD M2TS (.m2ts)' },
  { ext: 'vob',  mime: 'video/dvd',         label: 'DVD VOB (.vob)' },
  { ext: 'ogv',  mime: 'video/ogg',         label: 'Ogg Theora (.ogv)' },
  { ext: 'dv',   mime: 'video/x-dv',        label: 'DV NTSC (.dv)' },

  // Modern codec variants. `outputExt` keeps the user-facing
  // filename plain `.mp4` / `.webm` while the matrix key stays
  // unique so the dropdown can offer multiple codec choices for
  // the same container.
  { ext: 'mp4_h265', mime: 'video/mp4',  outputExt: 'mp4',  label: 'MP4 H.265 / HEVC (.mp4)' },
  { ext: 'mp4_av1',  mime: 'video/mp4',  outputExt: 'mp4',  label: 'MP4 AV1 (.mp4)' },
  { ext: 'webm_av1', mime: 'video/webm', outputExt: 'webm', label: 'WebM AV1 (.webm)' },

  // Frame-derived outputs.
  { ext: 'gif',  mime: 'image/gif',         label: 'Animated GIF (.gif)' },
  { ext: 'png',  mime: 'image/png',         label: 'PNG (first frame)' },
  { ext: 'jpg',  mime: 'image/jpeg',        label: 'JPEG (first frame)' },
  { ext: 'webp', mime: 'image/webp',        label: 'WebP (first frame)' },
  { ext: 'pdf',  mime: 'application/pdf',   label: 'PDF (first frame)' },
  { ext: 'cbz',  mime: 'application/vnd.comicbook+zip', label: 'CBZ (frame sequence)' },
];

const AUDIO_OUTPUTS = [
  { ext: 'mp3',  mime: 'audio/mpeg', label: 'MP3 (.mp3)' },
  { ext: 'm4a',  mime: 'audio/mp4',  label: 'AAC (.m4a)' },
  { ext: 'wav',  mime: 'audio/wav',  label: 'WAV (.wav)' },
  { ext: 'ogg',  mime: 'audio/ogg',  label: 'Ogg Vorbis (.ogg)' },
  { ext: 'flac', mime: 'audio/flac', label: 'FLAC (.flac)' },
  { ext: 'opus', mime: 'audio/ogg',  label: 'Opus (.opus)' },
];

// Audio targets ride alongside video targets — every video source
// can drop the video track and emit just the audio.
VIDEO_OUTPUTS.push(...AUDIO_OUTPUTS);

export const MATRIX = {
  document: DOC_OUTPUTS,
  spreadsheet: SHEET_OUTPUTS,
  image: IMAGE_OUTPUTS,
  slides: SLIDES_OUTPUTS,
  video: VIDEO_OUTPUTS,
  audio: AUDIO_OUTPUTS,
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

// HTML and Markdown inputs may carry tables; surface the
// spreadsheet outputs so the user can extract them. Filtering by
// ext keeps the dropdown short — only the most useful destinations.
const TABLE_BRIDGE_EXTS = new Set(['csv', 'tsv', 'xlsx', 'json', 'ods']);
const HTML_TABLE_BRIDGE = SHEET_OUTPUTS.filter((o) => TABLE_BRIDGE_EXTS.has(o.ext));

export function targetsForItem({ family, ext }) {
  const base = targetsFor(family);
  if (family === 'document' && ext === 'pdf') return [...base, ...PDF_IMAGE_BRIDGE];
  if (family === 'document' && (ext === 'html' || ext === 'md')) return [...base, ...HTML_TABLE_BRIDGE];
  return base;
}
