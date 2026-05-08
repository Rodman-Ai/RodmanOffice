// =============================================================
//  RodmanWord interop.js — extra import / export formats.
// =============================================================
//
//  This module ships the formats that aren't worth their own file:
//
//    Save (export)          Load (import)
//    ────────────────       ───────────────
//    .rtf  Rich Text         .rtf   minimal subset reader
//    .odt  OpenDocument      .odt   reads content.xml from the zip
//    .epub EPUB 3            .epub  concatenates every chapter
//    .md   Markdown +YAML
//    .adoc AsciiDoc
//    .tex  LaTeX
//
//  ODT and EPUB are ZIP packages, so we reuse docx.js's
//  internal ZIP writer / reader via the __buildZip / __readZip
//  hooks exposed on window.RodmanDocx. RTF, Markdown, AsciiDoc,
//  and LaTeX are plain-text walks of the editor DOM.
//
//  The Markdown live-preview pane (File → Markdown live preview)
//  also goes through this module: htmlToMarkdownWithFrontMatter
//  prepends a YAML --- block (title / author / date) when called
//  with options, and falls back to the existing exporter when
//  RodmanInterop is loaded after the editor.
//
//  PUBLIC SURFACE
//    window.RodmanInterop = {
//      rtfExport(html, title)          → string (.rtf body)
//      odtExport(html, title)          → Uint8Array (.odt zip)
//      epubExport(html, title)         → Uint8Array (.epub zip)
//      mdExport(html, frontMatter)     → string (.md body)
//      asciidocExport(html, title)     → string (.adoc)
//      latexExport(html, title)        → string (.tex)
//      rtfImport(rtfText)              → HTML
//      odtImport(arrayBuffer)          → Promise<HTML>
//      epubImport(arrayBuffer)         → Promise<HTML>
//    }
// =============================================================

import { buildZip, readZip } from './docx.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// -----------------------------------------------------------
// RTF EXPORT (#87)
// -----------------------------------------------------------
function rtfEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    .replace(/[-￿]/g, (c) => '\\u' + c.charCodeAt(0) + '?');
}
function htmlToRtf(html, title) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let out = '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
    '{\\fonttbl{\\f0\\froman Times New Roman;}{\\f1\\fswiss Arial;}}\n' +
    '{\\colortbl;\\red0\\green0\\blue0;\\red43\\green87\\blue154;}\n' +
    '\\f1\\fs22\n';
  function walk(node) {
    if (node.nodeType === 3) {
      out += rtfEscape(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    switch (tag) {
      case 'b': case 'strong': out += '{\\b '; node.childNodes.forEach(walk); out += '}'; return;
      case 'i': case 'em': out += '{\\i '; node.childNodes.forEach(walk); out += '}'; return;
      case 'u': out += '{\\ul '; node.childNodes.forEach(walk); out += '}'; return;
      case 's': case 'del': case 'strike':
        out += '{\\strike '; node.childNodes.forEach(walk); out += '}'; return;
      case 'h1': out += '\\par\\pard\\sb240\\sa120\\fs36\\b\\cf2 ';
        node.childNodes.forEach(walk); out += '\\b0\\fs22\\cf1\\par\n'; return;
      case 'h2': out += '\\par\\pard\\sb200\\sa100\\fs28\\b\\cf2 ';
        node.childNodes.forEach(walk); out += '\\b0\\fs22\\cf1\\par\n'; return;
      case 'h3': out += '\\par\\pard\\sb160\\sa80\\fs24\\b\\cf2 ';
        node.childNodes.forEach(walk); out += '\\b0\\fs22\\cf1\\par\n'; return;
      case 'p': out += '\\par\\pard\\sb60\\sa60 ';
        node.childNodes.forEach(walk); out += '\\par\n'; return;
      case 'br': out += '\\line '; return;
      case 'hr': out += '\\par\\pard\\brdrb\\brdrs\\par\n'; return;
      case 'ul':
        node.querySelectorAll(':scope > li').forEach((li) => {
          out += '\\par\\pard\\fi-360\\li360\\bullet\\tab ';
          li.childNodes.forEach(walk);
          out += '\\par';
        });
        return;
      case 'ol': {
        let n = 1;
        node.querySelectorAll(':scope > li').forEach((li) => {
          out += '\\par\\pard\\fi-360\\li360 ' + (n++) + '.\\tab ';
          li.childNodes.forEach(walk);
          out += '\\par';
        });
        return;
      }
      default:
        node.childNodes.forEach(walk);
    }
  }
  Array.from(tmp.childNodes).forEach(walk);
  out += '}';
  return out;
}

// -----------------------------------------------------------
// ODT EXPORT (#86) — relies on RodmanDocx ZIP machinery
// -----------------------------------------------------------
function htmlToOdtContent(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let body = '';
  function inline(node) {
    if (node.nodeType === 3) return escXml(node.nodeValue);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const inner = childrenInline(node);
    if (tag === 'b' || tag === 'strong')
      return '<text:span text:style-name="Bold">' + inner + '</text:span>';
    if (tag === 'i' || tag === 'em')
      return '<text:span text:style-name="Italic">' + inner + '</text:span>';
    if (tag === 'u')
      return '<text:span text:style-name="Underline">' + inner + '</text:span>';
    if (tag === 'a')
      return '<text:a xlink:type="simple" xlink:href="' + escXml(node.getAttribute('href') || '') +
        '">' + inner + '</text:a>';
    return inner;
  }
  function childrenInline(n) {
    let s = '';
    n.childNodes.forEach((c) => { s += inline(c); });
    return s;
  }
  function block(node) {
    if (node.nodeType === 3) {
      if (node.nodeValue.trim()) body += '<text:p>' + escXml(node.nodeValue) + '</text:p>';
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    switch (tag) {
      case 'h1': body += '<text:h text:outline-level="1">' + childrenInline(node) + '</text:h>'; break;
      case 'h2': body += '<text:h text:outline-level="2">' + childrenInline(node) + '</text:h>'; break;
      case 'h3': body += '<text:h text:outline-level="3">' + childrenInline(node) + '</text:h>'; break;
      case 'h4': body += '<text:h text:outline-level="4">' + childrenInline(node) + '</text:h>'; break;
      case 'p': body += '<text:p>' + childrenInline(node) + '</text:p>'; break;
      case 'blockquote': body += '<text:p text:style-name="Quote">' + childrenInline(node) + '</text:p>'; break;
      case 'pre': body += '<text:p text:style-name="Code">' + childrenInline(node) + '</text:p>'; break;
      case 'ul':
      case 'ol':
        body += '<text:list>';
        node.querySelectorAll(':scope > li').forEach((li) => {
          body += '<text:list-item><text:p>' + childrenInline(li) + '</text:p></text:list-item>';
        });
        body += '</text:list>';
        break;
      case 'hr': body += '<text:p>—</text:p>'; break;
      default:
        node.childNodes.forEach(block);
    }
  }
  Array.from(tmp.childNodes).forEach(block);

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
    ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
    ' office:version="1.2">' +
    '<office:automatic-styles>' +
      '<style:style style:name="Bold" style:family="text" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">' +
        '<style:text-properties fo:font-weight="bold" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"/></style:style>' +
      '<style:style style:name="Italic" style:family="text" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">' +
        '<style:text-properties fo:font-style="italic" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"/></style:style>' +
      '<style:style style:name="Underline" style:family="text" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0">' +
        '<style:text-properties style:text-underline-style="solid"/></style:style>' +
    '</office:automatic-styles>' +
    '<office:body><office:text>' + body + '</office:text></office:body>' +
    '</office:document-content>';
}

function buildOdt(html, title) {

  const content = htmlToOdtContent(html);
  const manifest = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
    '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
    '</manifest:manifest>';
  return buildZip([
    { name: 'mimetype', data: enc.encode('application/vnd.oasis.opendocument.text') },
    { name: 'content.xml', data: enc.encode(content) },
    { name: 'META-INF/manifest.xml', data: enc.encode(manifest) },
  ]);
}

// -----------------------------------------------------------
// EPUB EXPORT (#88)
// -----------------------------------------------------------
function buildEpub(html, title) {

  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // Split into chapters at H1
  const chapters = [];
  let buf = ''; let chapterTitle = title || 'Chapter';
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 1 && n.tagName === 'H1') {
      if (buf.trim()) chapters.push({ title: chapterTitle, html: buf });
      chapterTitle = n.textContent;
      buf = n.outerHTML;
    } else {
      buf += n.outerHTML || (n.nodeValue || '');
    }
  });
  if (buf.trim()) chapters.push({ title: chapterTitle, html: buf });
  if (!chapters.length) chapters.push({ title: title || 'Chapter', html: html });

  const id = 'rwd-' + Date.now();
  const containerXml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>' +
    '</container>';

  const manifestItems = chapters.map((_, i) =>
    '<item id="ch' + (i + 1) + '" href="ch' + (i + 1) + '.xhtml" media-type="application/xhtml+xml"/>').join('');
  const spineItems = chapters.map((_, i) =>
    '<itemref idref="ch' + (i + 1) + '"/>').join('');
  const opf = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        '<dc:identifier id="bookid">' + escXml(id) + '</dc:identifier>' +
        '<dc:title>' + escXml(title || 'Document') + '</dc:title>' +
        '<dc:language>en</dc:language>' +
        '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</meta>' +
      '</metadata>' +
      '<manifest>' + manifestItems +
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
      '</manifest>' +
      '<spine toc="ncx">' + spineItems + '</spine>' +
    '</package>';

  const ncx = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
    '<head><meta name="dtb:uid" content="' + escXml(id) + '"/></head>' +
    '<docTitle><text>' + escXml(title || 'Document') + '</text></docTitle>' +
    '<navMap>' +
    chapters.map((c, i) =>
      '<navPoint id="navPoint-' + (i + 1) + '" playOrder="' + (i + 1) + '">' +
      '<navLabel><text>' + escXml(c.title) + '</text></navLabel>' +
      '<content src="ch' + (i + 1) + '.xhtml"/></navPoint>').join('') +
    '</navMap></ncx>';

  const files = [
    { name: 'mimetype', data: enc.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: enc.encode(containerXml) },
    { name: 'OEBPS/content.opf', data: enc.encode(opf) },
    { name: 'OEBPS/toc.ncx', data: enc.encode(ncx) },
  ];
  chapters.forEach((c, i) => {
    const xhtml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/>' +
      '<title>' + escXml(c.title) + '</title></head><body>' + c.html + '</body></html>';
    files.push({ name: 'OEBPS/ch' + (i + 1) + '.xhtml', data: enc.encode(xhtml) });
  });
  return buildZip(files);
}

// -----------------------------------------------------------
// MARKDOWN with YAML front-matter (#89)
// -----------------------------------------------------------
function htmlToMarkdownWithFrontMatter(html, opts) {
  let md = '';
  if (opts && Object.keys(opts).length) {
    md += '---\n';
    Object.keys(opts).forEach((k) => {
      if (opts[k] != null) md += k + ': ' + JSON.stringify(opts[k]) + '\n';
    });
    md += '---\n\n';
  }
  // Lean on the existing exporter if available
  if (typeof window.__rwdHtmlToMarkdown === 'function') {
    md += window.__rwdHtmlToMarkdown(html);
    return md;
  }
  // Fallback: very simple HTML→MD
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function walk(n, prefix) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map((c) => walk(c, prefix)).join('');
    if (tag === 'h1') return '\n# ' + inner + '\n';
    if (tag === 'h2') return '\n## ' + inner + '\n';
    if (tag === 'h3') return '\n### ' + inner + '\n';
    if (tag === 'p') return '\n' + inner + '\n';
    if (tag === 'b' || tag === 'strong') return '**' + inner + '**';
    if (tag === 'i' || tag === 'em') return '*' + inner + '*';
    if (tag === 'br') return '\n';
    return inner;
  }
  md += Array.from(tmp.childNodes).map((c) => walk(c, '')).join('');
  return md;
}

// -----------------------------------------------------------
// ASCIIDOC EXPORT (#90)
// -----------------------------------------------------------
function htmlToAsciiDoc(html, title) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let out = '= ' + (title || 'Document') + '\n\n';
  function walk(n) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(walk).join('');
    switch (tag) {
      case 'h1': return '\n== ' + inner + '\n';
      case 'h2': return '\n=== ' + inner + '\n';
      case 'h3': return '\n==== ' + inner + '\n';
      case 'p': return '\n' + inner + '\n';
      case 'b': case 'strong': return '*' + inner + '*';
      case 'i': case 'em': return '_' + inner + '_';
      case 'code': return '`' + inner + '`';
      case 'a': return inner + ' (' + (n.getAttribute('href') || '') + ')';
      case 'ul':
        return '\n' + Array.from(n.children).map((li) => '* ' + walk(li)).join('\n') + '\n';
      case 'ol':
        return '\n' + Array.from(n.children).map((li) => '. ' + walk(li)).join('\n') + '\n';
      case 'br': return '\n';
      default: return inner;
    }
  }
  out += Array.from(tmp.childNodes).map(walk).join('');
  return out;
}

// -----------------------------------------------------------
// LATEX EXPORT (#91)
// -----------------------------------------------------------
function texEscape(s) {
  return s.replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&').replace(/%/g, '\\%').replace(/\$/g, '\\$')
    .replace(/#/g, '\\#').replace(/_/g, '\\_').replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}').replace(/\^/g, '\\^{}').replace(/~/g, '\\~{}');
}
function htmlToLaTeX(html, title) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  let body = '';
  function walk(n) {
    if (n.nodeType === 3) return texEscape(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(walk).join('');
    switch (tag) {
      case 'h1': return '\\section{' + inner + '}\n';
      case 'h2': return '\\subsection{' + inner + '}\n';
      case 'h3': return '\\subsubsection{' + inner + '}\n';
      case 'h4': return '\\paragraph{' + inner + '}\n';
      case 'p': return inner + '\n\n';
      case 'b': case 'strong': return '\\textbf{' + inner + '}';
      case 'i': case 'em': return '\\emph{' + inner + '}';
      case 'u': return '\\underline{' + inner + '}';
      case 'code': return '\\texttt{' + inner + '}';
      case 'a': return '\\href{' + (n.getAttribute('href') || '') + '}{' + inner + '}';
      case 'ul': return '\\begin{itemize}\n' +
        Array.from(n.children).map((li) => '\\item ' + walk(li)).join('\n') +
        '\n\\end{itemize}\n';
      case 'ol': return '\\begin{enumerate}\n' +
        Array.from(n.children).map((li) => '\\item ' + walk(li)).join('\n') +
        '\n\\end{enumerate}\n';
      case 'blockquote': return '\\begin{quote}\n' + inner + '\n\\end{quote}\n';
      case 'pre': return '\\begin{verbatim}\n' + (n.textContent || '') + '\n\\end{verbatim}\n';
      case 'br': return '\\\\\n';
      case 'hr': return '\\hrulefill\n';
      default: return inner;
    }
  }
  body = Array.from(tmp.childNodes).map(walk).join('');
  return '\\documentclass[11pt]{article}\n' +
    '\\usepackage[utf8]{inputenc}\n' +
    '\\usepackage{hyperref}\n' +
    '\\title{' + texEscape(title || 'Document') + '}\n' +
    '\\begin{document}\n\\maketitle\n' + body + '\n\\end{document}\n';
}

// -----------------------------------------------------------
// RTF IMPORT (#92) — strip RTF markup, keep paragraphs
// -----------------------------------------------------------
function rtfToHtml(rtf) {
  // Very small subset: strip {...} groups for fonts/colors, decode
  // \uN? unicode, \par as paragraph break, \line as <br>, \b/\i.
  let s = rtf;
  s = s.replace(/\\\*\\[a-zA-Z]+(\s|-?\d+)?\s?/g, '');
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  s = s.replace(/\{\\fonttbl[\s\S]*?\}\}/g, '');
  s = s.replace(/\{\\colortbl[\s\S]*?\}/g, '');
  s = s.replace(/\{\\stylesheet[\s\S]*?\}/g, '');
  s = s.replace(/\\b\b/g, '<b>').replace(/\\b0\b/g, '</b>');
  s = s.replace(/\\i\b/g, '<i>').replace(/\\i0\b/g, '</i>');
  s = s.replace(/\\ul\b/g, '<u>').replace(/\\ulnone\b/g, '</u>');
  s = s.replace(/\\par\b/g, '</p><p>').replace(/\\line\b/g, '<br/>');
  s = s.replace(/\\[a-zA-Z]+\d* ?/g, '');
  s = s.replace(/[{}]/g, '');
  return '<p>' + s + '</p>';
}

// -----------------------------------------------------------
// ODT IMPORT (#93) — read content.xml from an ODT zip
// -----------------------------------------------------------
async function odtToHtml(arrayBuffer) {
  const files = await readZip(arrayBuffer);
  const xml = files['content.xml'];
  if (!xml) throw new Error('Not an ODT file');
  const doc = new DOMParser().parseFromString(dec.decode(xml), 'application/xml');
  let html = '';
  const NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
  function walk(n) {
    if (!n) return '';
    let s = '';
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) s += escXml(c.nodeValue);
      else if (c.nodeType === 1) {
        if (c.namespaceURI === NS) {
          if (c.localName === 'p') s += '<p>' + walk(c) + '</p>';
          else if (c.localName === 'h') {
            const lvl = parseInt(c.getAttributeNS(NS, 'outline-level') || '1', 10);
            s += '<h' + lvl + '>' + walk(c) + '</h' + lvl + '>';
          } else if (c.localName === 'list') {
            s += '<ul>';
            c.childNodes.forEach((li) => {
              if (li.nodeType === 1 && li.localName === 'list-item')
                s += '<li>' + walk(li) + '</li>';
            });
            s += '</ul>';
          } else if (c.localName === 'a') {
            s += '<a href="' + escXml(c.getAttribute('xlink:href') || c.getAttribute('href') || '') + '">' + walk(c) + '</a>';
          } else if (c.localName === 'span') {
            s += walk(c);
          } else {
            s += walk(c);
          }
        } else {
          s += walk(c);
        }
      }
    });
    return s;
  }
  const body = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];
  html = walk(body);
  return html;
}

// -----------------------------------------------------------
// EPUB IMPORT (#94) — read first chapter as HTML
// -----------------------------------------------------------
async function epubToHtml(arrayBuffer) {
  const files = await readZip(arrayBuffer);
  // Combine every .xhtml chapter in order
  const chapters = Object.keys(files).filter((n) => /\.xhtml$|\.html$/i.test(n)).sort();
  let html = '';
  for (const f of chapters) {
    const text = dec.decode(files[f]);
    const m = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (m) html += m[1];
  }
  return html || '<p>(empty)</p>';
}

// -----------------------------------------------------------
// Plain-text walks for new doc targets (#95–#101)
// -----------------------------------------------------------
//
// All seven walk a fragment built by document.createElement and
// emit a string. They share a tiny inline helper that joins
// child node text. None of them try to be a full converter —
// the goal is "round-trips most documents written with the
// editor's standard block set", which is what the Markdown,
// AsciiDoc and LaTeX writers above already aim for.

function asFragment(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp;
}

function inlineText(node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return '';
  let s = '';
  node.childNodes.forEach((c) => { s += inlineText(c); });
  return s;
}

// JSON document tree (#95) — block list with semantic tags.
function htmlToJsonDoc(html, title) {
  const tmp = asFragment(html);
  const blocks = [];
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) blocks.push({ type: 'paragraph', text: t });
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    const text = inlineText(n).trim();
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: 'heading', level: Number(tag.slice(1)), text });
    } else if (tag === 'p') {
      blocks.push({ type: 'paragraph', text });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(n.querySelectorAll(':scope > li')).map((li) => inlineText(li).trim());
      blocks.push({ type: tag === 'ul' ? 'bullet_list' : 'ordered_list', items });
    } else if (tag === 'blockquote') {
      blocks.push({ type: 'quote', text });
    } else if (tag === 'pre') {
      blocks.push({ type: 'code', text: n.textContent || '' });
    } else if (tag === 'hr') {
      blocks.push({ type: 'rule' });
    } else if (text) {
      blocks.push({ type: 'paragraph', text });
    }
  });
  return JSON.stringify({ title: title || 'Document', blocks }, null, 2);
}

// YAML (#96) — front-matter title + body with block list.
function htmlToYaml(html, title) {
  const tmp = asFragment(html);
  function yamlString(s) {
    if (s == null) return '""';
    const str = String(s);
    if (/^[A-Za-z0-9 _.,;:?!()-]+$/.test(str) && !/^\s|\s$/.test(str)) return str;
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  let out = '---\n';
  out += `title: ${yamlString(title || 'Document')}\n`;
  out += `generated_at: ${new Date().toISOString()}\n`;
  out += 'blocks:\n';
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) out += `  - { type: paragraph, text: ${yamlString(t)} }\n`;
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    const text = inlineText(n).trim();
    if (/^h[1-6]$/.test(tag)) {
      out += `  - { type: heading, level: ${tag.slice(1)}, text: ${yamlString(text)} }\n`;
    } else if (tag === 'p') {
      out += `  - { type: paragraph, text: ${yamlString(text)} }\n`;
    } else if (tag === 'ul' || tag === 'ol') {
      out += `  - type: ${tag === 'ul' ? 'bullet_list' : 'ordered_list'}\n`;
      out += '    items:\n';
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `      - ${yamlString(inlineText(li).trim())}\n`;
      });
    } else if (tag === 'blockquote') {
      out += `  - { type: quote, text: ${yamlString(text)} }\n`;
    } else if (tag === 'pre') {
      out += `  - { type: code, text: ${yamlString(n.textContent || '')} }\n`;
    } else if (tag === 'hr') {
      out += '  - { type: rule }\n';
    } else if (text) {
      out += `  - { type: paragraph, text: ${yamlString(text)} }\n`;
    }
  });
  return out;
}

// MediaWiki (#97) — heading levels via ==, ===; lists via *, #.
function htmlToMediaWiki(html, title) {
  const tmp = asFragment(html);
  function inline(n) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(inline).join('');
    switch (tag) {
      case 'b': case 'strong': return `'''${inner}'''`;
      case 'i': case 'em': return `''${inner}''`;
      case 'u': return `<u>${inner}</u>`;
      case 's': case 'del': case 'strike': return `<s>${inner}</s>`;
      case 'code': return `<code>${inner}</code>`;
      case 'a': {
        const href = n.getAttribute('href') || '';
        return `[${href} ${inner}]`;
      }
      case 'br': return '\n';
      default: return inner;
    }
  }
  let out = '';
  if (title) out += `= ${title} =\n\n`;
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) out += `${t}\n\n`;
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const lvl = Number(tag.slice(1));
      const eq = '='.repeat(Math.min(6, lvl + 1));
      out += `${eq} ${inline(n)} ${eq}\n\n`;
    } else if (tag === 'p') {
      out += `${inline(n)}\n\n`;
    } else if (tag === 'ul') {
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `* ${inline(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'ol') {
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `# ${inline(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'blockquote') {
      out += `<blockquote>${inline(n)}</blockquote>\n\n`;
    } else if (tag === 'pre') {
      out += `<pre>${n.textContent || ''}</pre>\n\n`;
    } else if (tag === 'hr') {
      out += '----\n\n';
    } else {
      out += `${inline(n)}\n\n`;
    }
  });
  return out.trimEnd() + '\n';
}

// reStructuredText (#98) — heading underline conventions.
function htmlToRst(html, title) {
  const tmp = asFragment(html);
  const HEADING_CHARS = ['=', '-', '~', '^', '"', '+'];
  function inline(n) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(inline).join('');
    switch (tag) {
      case 'b': case 'strong': return `**${inner}**`;
      case 'i': case 'em': return `*${inner}*`;
      case 'code': return `\`\`${inner}\`\``;
      case 'a': {
        const href = n.getAttribute('href') || '';
        return `\`${inner} <${href}>\`_`;
      }
      case 'br': return '\n';
      default: return inner;
    }
  }
  function underline(text, ch) {
    return `${text}\n${ch.repeat(Math.max(text.length, 3))}`;
  }
  let out = '';
  if (title) out += `${underline(title, '=')}\n\n`;
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) out += `${t}\n\n`;
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const lvl = Math.min(HEADING_CHARS.length, Number(tag.slice(1)));
      out += `${underline(inline(n), HEADING_CHARS[lvl - 1])}\n\n`;
    } else if (tag === 'p') {
      out += `${inline(n)}\n\n`;
    } else if (tag === 'ul') {
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `* ${inline(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'ol') {
      let i = 1;
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `${i++}. ${inline(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'blockquote') {
      const text = inline(n).trim().split('\n').map((l) => `    ${l}`).join('\n');
      out += `${text}\n\n`;
    } else if (tag === 'pre') {
      const code = (n.textContent || '').split('\n').map((l) => `    ${l}`).join('\n');
      out += `::\n\n${code}\n\n`;
    } else if (tag === 'hr') {
      out += '\n----\n\n';
    } else {
      out += `${inline(n)}\n\n`;
    }
  });
  return out.trimEnd() + '\n';
}

// Org-mode (#99).
function htmlToOrg(html, title) {
  const tmp = asFragment(html);
  function inline(n) {
    if (n.nodeType === 3) return n.nodeValue;
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(inline).join('');
    switch (tag) {
      case 'b': case 'strong': return `*${inner}*`;
      case 'i': case 'em': return `/${inner}/`;
      case 'u': return `_${inner}_`;
      case 's': case 'del': case 'strike': return `+${inner}+`;
      case 'code': return `~${inner}~`;
      case 'a': {
        const href = n.getAttribute('href') || '';
        return `[[${href}][${inner}]]`;
      }
      case 'br': return '\n';
      default: return inner;
    }
  }
  let out = '';
  if (title) out += `#+TITLE: ${title}\n\n`;
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) out += `${t}\n\n`;
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const stars = '*'.repeat(Number(tag.slice(1)));
      out += `${stars} ${inline(n)}\n`;
    } else if (tag === 'p') {
      out += `${inline(n)}\n\n`;
    } else if (tag === 'ul') {
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `- ${inline(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'ol') {
      let i = 1;
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        out += `${i++}. ${inline(li)}\n`;
      });
      out += '\n';
    } else if (tag === 'blockquote') {
      out += `#+BEGIN_QUOTE\n${inline(n)}\n#+END_QUOTE\n\n`;
    } else if (tag === 'pre') {
      out += `#+BEGIN_SRC\n${n.textContent || ''}\n#+END_SRC\n\n`;
    } else if (tag === 'hr') {
      out += '-----\n\n';
    } else {
      out += `${inline(n)}\n\n`;
    }
  });
  return out.trimEnd() + '\n';
}

// DocBook 5 (#100) — <article>/<section>/<para>.
function htmlToDocBook(html, title) {
  const tmp = asFragment(html);
  function inline(n) {
    if (n.nodeType === 3) return escXml(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(inline).join('');
    switch (tag) {
      case 'b': case 'strong': return `<emphasis role="bold">${inner}</emphasis>`;
      case 'i': case 'em': return `<emphasis>${inner}</emphasis>`;
      case 'u': return `<emphasis role="underline">${inner}</emphasis>`;
      case 'code': return `<literal>${inner}</literal>`;
      case 'a': {
        const href = escXml(n.getAttribute('href') || '');
        return `<link xlink:href="${href}">${inner}</link>`;
      }
      case 'br': return '<?linebreak?>';
      default: return inner;
    }
  }
  let body = '';
  let openSection = 0;
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) body += `<para>${escXml(t)}</para>`;
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      while (openSection > 0) { body += '</section>'; openSection--; }
      body += `<section><title>${inline(n)}</title>`;
      openSection++;
    } else if (tag === 'p') {
      body += `<para>${inline(n)}</para>`;
    } else if (tag === 'ul' || tag === 'ol') {
      const wrap = tag === 'ul' ? 'itemizedlist' : 'orderedlist';
      body += `<${wrap}>`;
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        body += `<listitem><para>${inline(li)}</para></listitem>`;
      });
      body += `</${wrap}>`;
    } else if (tag === 'blockquote') {
      body += `<blockquote><para>${inline(n)}</para></blockquote>`;
    } else if (tag === 'pre') {
      body += `<programlisting>${escXml(n.textContent || '')}</programlisting>`;
    } else if (tag === 'hr') {
      body += '<para>* * *</para>';
    } else {
      body += inline(n);
    }
  });
  while (openSection > 0) { body += '</section>'; openSection--; }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<article xmlns="http://docbook.org/ns/docbook" xmlns:xlink="http://www.w3.org/1999/xlink" version="5.0">' +
    `<info><title>${escXml(title || 'Document')}</title></info>` +
    body +
    '</article>\n';
}

// FictionBook 2 (#101) — XML ebook envelope.
function htmlToFb2(html, title) {
  const tmp = asFragment(html);
  function inline(n) {
    if (n.nodeType === 3) return escXml(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const tag = n.tagName.toLowerCase();
    const inner = Array.from(n.childNodes).map(inline).join('');
    switch (tag) {
      case 'b': case 'strong': return `<strong>${inner}</strong>`;
      case 'i': case 'em': return `<emphasis>${inner}</emphasis>`;
      case 'a': return inner;
      default: return inner;
    }
  }
  let body = '<body>';
  body += `<title><p>${escXml(title || 'Document')}</p></title>`;
  let openSection = false;
  Array.from(tmp.childNodes).forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue.trim();
      if (t) {
        if (!openSection) { body += '<section>'; openSection = true; }
        body += `<p>${escXml(t)}</p>`;
      }
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      if (openSection) { body += '</section>'; }
      body += `<section><title><p>${inline(n)}</p></title>`;
      openSection = true;
    } else if (tag === 'p') {
      if (!openSection) { body += '<section>'; openSection = true; }
      body += `<p>${inline(n)}</p>`;
    } else if (tag === 'ul' || tag === 'ol') {
      if (!openSection) { body += '<section>'; openSection = true; }
      Array.from(n.querySelectorAll(':scope > li')).forEach((li) => {
        body += `<p>• ${inline(li)}</p>`;
      });
    } else if (tag === 'blockquote') {
      if (!openSection) { body += '<section>'; openSection = true; }
      body += `<cite><p>${inline(n)}</p></cite>`;
    } else if (tag === 'pre') {
      if (!openSection) { body += '<section>'; openSection = true; }
      body += `<p>${escXml(n.textContent || '')}</p>`;
    } else if (tag === 'hr') {
      if (openSection) { body += '</section>'; openSection = false; }
      body += '<empty-line/>';
    } else {
      if (!openSection) { body += '<section>'; openSection = true; }
      body += `<p>${inline(n)}</p>`;
    }
  });
  if (openSection) body += '</section>';
  body += '</body>';
  const description =
    '<description>' +
      '<title-info>' +
        '<genre>nonfiction</genre>' +
        `<book-title>${escXml(title || 'Document')}</book-title>` +
        '<lang>en</lang>' +
      '</title-info>' +
      '<document-info>' +
        `<date value="${new Date().toISOString().slice(0, 10)}">${new Date().toISOString().slice(0, 10)}</date>` +
      '</document-info>' +
    '</description>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">' +
    description + body +
    '</FictionBook>\n';
}

// -----------------------------------------------------------
// Public API
// -----------------------------------------------------------
export {
  htmlToRtf as rtfExport,
  buildOdt as odtExport,
  buildEpub as epubExport,
  htmlToMarkdownWithFrontMatter as mdExport,
  htmlToAsciiDoc as asciidocExport,
  htmlToLaTeX as latexExport,
  rtfToHtml as rtfImport,
  odtToHtml as odtImport,
  epubToHtml as epubImport,
  htmlToJsonDoc as jsonDocExport,
  htmlToYaml as yamlExport,
  htmlToMediaWiki as mediawikiExport,
  htmlToRst as rstExport,
  htmlToOrg as orgExport,
  htmlToDocBook as docbookExport,
  htmlToFb2 as fb2Export,
};
