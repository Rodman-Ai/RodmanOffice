// =============================================================
//  PPTX (PowerPoint Open XML) reader and writer.
//
//  WRITES a minimal-but-valid PPTX: a ZIP of XML parts following
//  the Office Open XML spec. PowerPoint, Keynote and LibreOffice
//  Impress all open the output. The slide stage is fixed to the
//  RodmanSlides 1280x720 px canvas, mapped to the standard 16:9
//  PowerPoint widescreen size (12192000 x 6858000 EMU; 1px = 9525
//  EMU at 96 DPI).
//
//  READS a PPTX and produces a Deck shaped like RodmanSlides'
//  in-memory model. Per-slide it extracts:
//    - shape elements (<p:sp> with <a:prstGeom prst="rect|ellipse">)
//    - text frames (<p:sp> with <p:txBody>) — runs are flattened
//      to plain text, line breaks become <br>.
//    - image elements (<p:pic>) — embedded media is decoded back
//      into base64 dataURLs so the editor can render them.
//
//  Legacy binary .ppt (OLE compound document) is NOT supported;
//  it requires a much larger reader. Only Office 2007+ .pptx.
//
//  Builds on /lib/docs/docx.js's hand-rolled buildZip / readZip.
// =============================================================

import { buildZip, readZip } from '../docs/docx.js';

// 1 pixel @ 96 DPI = 9525 EMU. Slides app uses a 1280x720 stage,
// which maps to PowerPoint's 16:9 widescreen exactly.
const EMU_PER_PX = 9525;
const SLIDE_W_PX = 1280;
const SLIDE_H_PX = 720;
const SLIDE_W_EMU = SLIDE_W_PX * EMU_PER_PX;   // 12192000
const SLIDE_H_EMU = SLIDE_H_PX * EMU_PER_PX;   // 6858000

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

// ---------- XML helpers ----------

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function px2emu(px) {
  return Math.round(px * EMU_PER_PX);
}
function emu2px(emu) {
  return Math.round(emu / EMU_PER_PX);
}

function srgbHex(color, fallback = '000000') {
  if (!color) return fallback;
  let c = String(color).trim().replace(/^#/, '');
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return fallback;
  return c.toUpperCase();
}

// HTML -> plain paragraphs ([{ text, runs?: [{ text, bold, italic }] }])
// For v1 we strip everything except <br>, <p>, <div>, <li> as paragraph
// breaks and <b>/<strong>/<i>/<em> as run markers.
function htmlToParagraphs(html) {
  if (!html) return [{ runs: [{ text: '' }] }];
  // Normalise block-level tags to newlines.
  let s = String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  const paragraphs = [];
  // Split on the inserted newlines, but keep run markup so we can
  // emit bold/italic runs.
  const blocks = s.split(/\n+/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed && paragraphs.length) continue;
    paragraphs.push({ runs: parseRuns(trimmed) });
  }
  if (!paragraphs.length) paragraphs.push({ runs: [{ text: '' }] });
  return paragraphs;
}

function parseRuns(html) {
  const runs = [];
  let i = 0;
  let bold = 0, italic = 0;
  let buf = '';
  function flush() {
    if (buf) {
      runs.push({ text: decodeEntities(buf), bold: bold > 0, italic: italic > 0 });
      buf = '';
    }
  }
  while (i < html.length) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      if (close === -1) break;
      const tag = html.slice(i + 1, close).toLowerCase().trim();
      flush();
      if (/^(b|strong)\b/.test(tag)) bold++;
      else if (/^\/(b|strong)\b/.test(tag)) bold = Math.max(0, bold - 1);
      else if (/^(i|em)\b/.test(tag)) italic++;
      else if (/^\/(i|em)\b/.test(tag)) italic = Math.max(0, italic - 1);
      // Other tags ignored.
      i = close + 1;
    } else {
      buf += html[i++];
    }
  }
  flush();
  if (!runs.length) runs.push({ text: '', bold: false, italic: false });
  return runs;
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ---------- Text frame XML emitter ----------

function buildTxBody(el) {
  const paragraphs = htmlToParagraphs(el.html || '');
  const sz = Math.max(8, Math.round((el.fontSize || 24) * 100)); // PPTX uses 1/100pt
  const align =
    el.align === 'center' ? 'ctr' :
    el.align === 'right'  ? 'r' :
    el.align === 'justify' ? 'just' : 'l';
  const bold = (el.fontWeight || 400) >= 600 ? '1' : '0';

  const paraXml = paragraphs.map((p) => {
    const runsXml = p.runs.map((r) => {
      const rPr = `<a:rPr lang="en-US" sz="${sz}" b="${(r.bold || bold === '1') ? '1' : '0'}" i="${r.italic ? '1' : '0'}">` +
        (el.color ? `<a:solidFill><a:srgbClr val="${srgbHex(el.color)}"/></a:solidFill>` : '') +
        (el.fontFamily ? `<a:latin typeface="${escXml(el.fontFamily)}"/>` : '') +
        `</a:rPr>`;
      return `<a:r>${rPr}<a:t>${escXml(r.text)}</a:t></a:r>`;
    }).join('');
    return `<a:p><a:pPr algn="${align}"/>${runsXml || `<a:endParaRPr lang="en-US" sz="${sz}"/>`}</a:p>`;
  }).join('');

  return `<p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${paraXml}</p:txBody>`;
}

// ---------- Shape & image XML emitters ----------

let _idCounter = 1;
function nextId() { return ++_idCounter; }

function emitTextSp(el) {
  const id = nextId();
  return `<p:sp>` +
    `<p:nvSpPr>` +
      `<p:cNvPr id="${id}" name="TextBox ${id}"/>` +
      `<p:cNvSpPr txBox="1"/>` +
      `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
      `<a:xfrm><a:off x="${px2emu(el.x)}" y="${px2emu(el.y)}"/><a:ext cx="${px2emu(el.w)}" cy="${px2emu(el.h)}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
      `<a:noFill/>` +
    `</p:spPr>` +
    buildTxBody(el) +
  `</p:sp>`;
}

function emitShapeSp(el) {
  const id = nextId();
  const prst = el.shape === 'ellipse' ? 'ellipse' : 'rect';
  const fillHex = srgbHex(el.fill || '#b7472a', 'B7472A');
  const stroke = el.stroke
    ? `<a:ln w="${Math.max(1, Math.round((el.strokeWidth || 1) * 12700))}"><a:solidFill><a:srgbClr val="${srgbHex(el.stroke)}"/></a:solidFill></a:ln>`
    : '';
  return `<p:sp>` +
    `<p:nvSpPr>` +
      `<p:cNvPr id="${id}" name="${prst === 'ellipse' ? 'Oval' : 'Rectangle'} ${id}"/>` +
      `<p:cNvSpPr/>` +
      `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
      `<a:xfrm><a:off x="${px2emu(el.x)}" y="${px2emu(el.y)}"/><a:ext cx="${px2emu(el.w)}" cy="${px2emu(el.h)}"/></a:xfrm>` +
      `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>` +
      stroke +
    `</p:spPr>` +
  `</p:sp>`;
}

function emitImagePic(el, rId) {
  const id = nextId();
  return `<p:pic>` +
    `<p:nvPicPr>` +
      `<p:cNvPr id="${id}" name="Picture ${id}"/>` +
      `<p:cNvPicPr/>` +
      `<p:nvPr/>` +
    `</p:nvPicPr>` +
    `<p:blipFill>` +
      `<a:blip r:embed="${rId}"/>` +
      `<a:stretch><a:fillRect/></a:stretch>` +
    `</p:blipFill>` +
    `<p:spPr>` +
      `<a:xfrm><a:off x="${px2emu(el.x)}" y="${px2emu(el.y)}"/><a:ext cx="${px2emu(el.w)}" cy="${px2emu(el.h)}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</p:spPr>` +
  `</p:pic>`;
}

// ---------- Per-slide XML ----------

function buildSlideXml(slide, mediaRels) {
  _idCounter = 1; // reset per slide so cNvPr ids start at 2
  const shapes = (slide.elements || []).map((el) => {
    if (el.kind === 'text')  return emitTextSp(el);
    if (el.kind === 'shape') return emitShapeSp(el);
    if (el.kind === 'image') {
      const rel = mediaRels.find((m) => m.elementId === el.id);
      return rel ? emitImagePic(el, rel.rId) : '';
    }
    return '';
  }).filter(Boolean).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
           `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
           `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:cSld>` +
        `<p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
          shapes +
        `</p:spTree>` +
      `</p:cSld>` +
    `</p:sld>`;
}

function buildSlideRelsXml(mediaRels) {
  // rId1 is always the layout reference; image rIds start at rId2.
  const layoutRel = `<Relationship Id="rId1" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" ` +
    `Target="../slideLayouts/slideLayout1.xml"/>`;
  const imgRels = mediaRels.map((m) =>
    `<Relationship Id="${m.rId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="../media/${m.target}"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    layoutRel + imgRels +
    `</Relationships>`;
}

// ---------- Boilerplate parts ----------

function buildContentTypesXml(slideCount, mediaTypes) {
  const overrides = [];
  for (let i = 1; i <= slideCount; i++) {
    overrides.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
  }
  // Default extension types for each unique image format used.
  const defaults = new Set(['rels', 'xml']);
  for (const m of mediaTypes) defaults.add(m);

  const defaultsXml = [...defaults].map((ext) => {
    const ct =
      ext === 'rels' ? 'application/vnd.openxmlformats-package.relationships+xml' :
      ext === 'xml'  ? 'application/xml' :
      ext === 'png'  ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'gif'  ? 'image/gif' :
      ext === 'webp' ? 'image/webp' :
      ext === 'bmp'  ? 'image/bmp' :
      'application/octet-stream';
    return `<Default Extension="${ext}" ContentType="${ct}"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    defaultsXml +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    overrides.join('') +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;
}

function buildPresentationXml(slideCount) {
  const sldIds = [];
  // sldIds must be >= 256 by spec; rIds for slides start after the master.
  for (let i = 0; i < slideCount; i++) {
    sldIds.push(`<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
                    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
                    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${sldIds.join('')}</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE_W_EMU}" cy="${SLIDE_H_EMU}" type="screen16x9"/>` +
      `<p:notesSz cx="${SLIDE_H_EMU}" cy="${SLIDE_W_EMU}"/>` +
    `</p:presentation>`;
}

function buildPresentationRelsXml(slideCount) {
  const slideRels = [];
  for (let i = 0; i < slideCount; i++) {
    slideRels.push(`<Relationship Id="rId${i + 2}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" ` +
      `Target="slides/slide${i + 1}.xml"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
      slideRels.join('') +
      `<Relationship Id="rId${slideCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
    `</Relationships>`;
}

const SLIDE_MASTER_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
               `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
               `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld>` +
      `<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>` +
      `<p:spTree>` +
        `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
        `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
      `</p:spTree>` +
    `</p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles>` +
      `<p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>` +
      `<p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle>` +
      `<p:otherStyle/>` +
    `</p:txStyles>` +
  `</p:sldMaster>`;

const SLIDE_MASTER_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>` +
  `</Relationships>`;

const SLIDE_LAYOUT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
               `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
               `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
               `type="blank" preserve="1">` +
    `<p:cSld name="Blank">` +
      `<p:spTree>` +
        `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
        `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
      `</p:spTree>` +
    `</p:cSld>` +
  `</p:sldLayout>`;

const SLIDE_LAYOUT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
  `</Relationships>`;

// Extremely minimal generic theme — PowerPoint requires it to exist.
const THEME_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">` +
    `<a:themeElements>` +
      `<a:clrScheme name="Office">` +
        `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
        `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
        `<a:dk2><a:srgbClr val="44546A"/></a:dk2>` +
        `<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
        `<a:accent1><a:srgbClr val="4472C4"/></a:accent1>` +
        `<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
        `<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>` +
        `<a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
        `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>` +
        `<a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
        `<a:hlink><a:srgbClr val="0563C1"/></a:hlink>` +
        `<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
      `</a:clrScheme>` +
      `<a:fontScheme name="Office">` +
        `<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
        `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>` +
      `</a:fontScheme>` +
      `<a:fmtScheme name="Office">` +
        `<a:fillStyleLst>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
        `</a:fillStyleLst>` +
        `<a:lnStyleLst>` +
          `<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
          `<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
          `<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
        `</a:lnStyleLst>` +
        `<a:effectStyleLst>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle>` +
        `</a:effectStyleLst>` +
        `<a:bgFillStyleLst>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
        `</a:bgFillStyleLst>` +
      `</a:fmtScheme>` +
    `</a:themeElements>` +
  `</a:theme>`;

function buildCoreXml(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escXml(title || 'Presentation')}</dc:title>` +
      `<cp:revision>1</cp:revision>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    `</cp:coreProperties>`;
}

function buildAppXml(slideCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>RodmanSlides</Application>` +
      `<Slides>${slideCount}</Slides>` +
    `</Properties>`;
}

// ---------- Image helpers ----------

function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

function extFromMime(mime) {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/bmp': return 'bmp';
    default: return 'png';
  }
}

function bytesToDataUrl(bytes, mime) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

// ---------- Public: savePptx ----------

/**
 * Build a PPTX Blob from a RodmanSlides deck.
 * @param {object} deck — { title, slides: [{ elements: [...] }] }
 * @returns {Blob}
 */
export function savePptx(deck) {
  const slides = (deck && deck.slides) || [];
  const files = [];
  let mediaCounter = 0;
  const usedExts = new Set();
  const allMediaForContentTypes = new Set();

  // Walk slides, build image media list per slide
  const perSlideRels = slides.map((slide) => {
    const rels = [];
    let rIdSeq = 1; // rId1 reserved for layout
    for (const el of slide.elements || []) {
      if (el.kind !== 'image' || !el.src) continue;
      const decoded = dataUrlToBytes(el.src);
      if (!decoded) continue;
      mediaCounter++;
      const ext = extFromMime(decoded.mime);
      usedExts.add(ext);
      const target = `image${mediaCounter}.${ext}`;
      files.push({ name: `ppt/media/${target}`, data: decoded.bytes });
      allMediaForContentTypes.add(ext);
      rIdSeq++;
      rels.push({ elementId: el.id, rId: `rId${rIdSeq}`, target });
    }
    return rels;
  });

  // Slide XMLs + rels
  slides.forEach((slide, i) => {
    const slideXml = buildSlideXml(slide, perSlideRels[i]);
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: enc.encode(slideXml) });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: enc.encode(buildSlideRelsXml(perSlideRels[i])) });
  });

  // Boilerplate
  files.push({ name: '[Content_Types].xml', data: enc.encode(buildContentTypesXml(slides.length, allMediaForContentTypes)) });
  files.push({ name: '_rels/.rels', data: enc.encode(buildRootRelsXml()) });
  files.push({ name: 'ppt/presentation.xml', data: enc.encode(buildPresentationXml(slides.length)) });
  files.push({ name: 'ppt/_rels/presentation.xml.rels', data: enc.encode(buildPresentationRelsXml(slides.length)) });
  files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: enc.encode(SLIDE_MASTER_XML) });
  files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: enc.encode(SLIDE_MASTER_RELS_XML) });
  files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: enc.encode(SLIDE_LAYOUT_XML) });
  files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: enc.encode(SLIDE_LAYOUT_RELS_XML) });
  files.push({ name: 'ppt/theme/theme1.xml', data: enc.encode(THEME_XML) });
  files.push({ name: 'docProps/core.xml', data: enc.encode(buildCoreXml(deck && deck.title)) });
  files.push({ name: 'docProps/app.xml', data: enc.encode(buildAppXml(slides.length)) });

  return new Blob([buildZip(files)], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

// ---------- Public: loadPptx ----------

/**
 * Parse a PPTX into a deck-shaped object.
 * @param {ArrayBuffer | Uint8Array} arrayBuffer
 * @returns {Promise<object>}
 */
export async function loadPptx(arrayBuffer) {
  const files = await readZip(arrayBuffer);
  // Map of path -> Uint8Array
  const presXmlBytes = files['ppt/presentation.xml'];
  if (!presXmlBytes) throw new Error('Not a .pptx (missing ppt/presentation.xml)');
  const presRelsBytes = files['ppt/_rels/presentation.xml.rels'];

  const presXml = dec.decode(presXmlBytes);
  const presDoc = parseXml(presXml);
  const sldIdNodes = Array.from(presDoc.getElementsByTagNameNS('*', 'sldId'));

  const presRels = presRelsBytes ? parseRels(dec.decode(presRelsBytes)) : {};
  const slidePaths = sldIdNodes
    .map((n) => n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || n.getAttribute('r:id'))
    .map((rid) => presRels[rid])
    .filter(Boolean)
    .map((p) => 'ppt/' + p);

  const slides = [];
  let slideIdx = 0;
  for (const path of slidePaths) {
    slideIdx++;
    const slideBytes = files[path];
    if (!slideBytes) continue;
    const slideXml = dec.decode(slideBytes);
    const relsPath = path.replace(/\/([^/]+)$/, '/_rels/$1.rels');
    const slideRels = files[relsPath] ? parseRels(dec.decode(files[relsPath])) : {};
    slides.push(parseSlide(slideXml, slideRels, files, path, slideIdx));
  }

  const titleMatch = files['docProps/core.xml']
    ? dec.decode(files['docProps/core.xml']).match(/<dc:title>([^<]*)<\/dc:title>/)
    : null;
  return {
    schema: 1,
    title: (titleMatch && titleMatch[1]) || 'Imported Presentation',
    theme: 'default',
    slides,
  };
}

function parseXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Malformed PPTX XML');
  return doc;
}

function parseRels(xmlText) {
  const doc = parseXml(xmlText);
  const out = {};
  doc.querySelectorAll('Relationship').forEach((el) => {
    out[el.getAttribute('Id')] = el.getAttribute('Target');
  });
  return out;
}

function parseSlide(xmlText, slideRels, files, slidePath, slideIdx) {
  const doc = parseXml(xmlText);
  const elements = [];
  let elSeq = 0;
  const newElId = () => `el-pptx-${slideIdx}-${++elSeq}`;

  const spTree = doc.getElementsByTagNameNS('*', 'spTree')[0];
  if (!spTree) return { id: `slide-pptx-${slideIdx}`, elements: [], notes: '' };

  // Walk the spTree recursively. Real-world PPTX (PowerPoint, Google
  // Slides, LibreOffice Impress) frequently nests shapes and pictures
  // inside <p:grpSp> groups; iterating only direct children misses
  // those — which manifested as "RodmanSlides won't import images".
  // We descend into grpSp / spTree children and emit each sp/pic at
  // whatever depth it appears.
  walkChildren(spTree);

  function walkChildren(parent) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType !== 1) continue;
      const local = node.localName;
      if (local === 'sp') emitShape(node);
      else if (local === 'pic') emitPic(node);
      else if (local === 'grpSp' || local === 'spTree') walkChildren(node);
      // Other element types (graphicFrame, contentPart, AlternateContent…)
      // are ignored for v1; AlternateContent's <mc:Fallback> is a common
      // wrapper too — handle it conservatively below.
      else if (local === 'AlternateContent' || (node.namespaceURI || '').includes('markup-compatibility')) {
        // Prefer Choice; fall back to Fallback.
        const choice = node.getElementsByTagNameNS('*', 'Choice')[0];
        const fb = node.getElementsByTagNameNS('*', 'Fallback')[0];
        if (choice) walkChildren(choice);
        else if (fb) walkChildren(fb);
      }
    }
  }

  function emitShape(node) {
    const xfrm = readXfrm(node);
    if (!xfrm) return;
    const txBody = node.getElementsByTagNameNS('*', 'txBody')[0];
    const prstGeom = node.getElementsByTagNameNS('*', 'prstGeom')[0];
    const prst = prstGeom && prstGeom.getAttribute('prst');
    const solidFill = node.getElementsByTagNameNS('*', 'spPr')[0]
      ?.getElementsByTagNameNS('*', 'solidFill')[0]
      ?.getElementsByTagNameNS('*', 'srgbClr')[0]
      ?.getAttribute('val');

    if (txBody) {
      const { html, fontSize, align } = txBodyToHtml(txBody);
      elements.push({
        id: newElId(),
        kind: 'text',
        x: xfrm.x, y: xfrm.y, w: xfrm.w, h: xfrm.h,
        html,
        role: 'free',
        fontSize: fontSize || 24,
        fontWeight: 400,
        align: align || 'left',
        color: null,
        fontFamily: null,
      });
    } else if (prst === 'rect' || prst === 'ellipse') {
      elements.push({
        id: newElId(),
        kind: 'shape',
        x: xfrm.x, y: xfrm.y, w: xfrm.w, h: xfrm.h,
        shape: prst === 'ellipse' ? 'ellipse' : 'rect',
        fill: solidFill ? '#' + solidFill : '#b7472a',
        stroke: null,
        strokeWidth: 0,
      });
    }
  }

  function emitPic(node) {
    const xfrm = readXfrm(node);
    const blip = node.getElementsByTagNameNS('*', 'blip')[0];
    if (!blip) return;
    // r:embed in OOXML uses the relationships namespace. Try qualified
    // name first (works in most browsers when the prefix is preserved),
    // fall back to namespace-aware lookup, fall back to scanning all
    // attributes for any local name "embed" — covers documents where
    // the namespace prefix differs from the standard "r".
    let rEmbed =
      blip.getAttribute('r:embed') ||
      blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
    if (!rEmbed) {
      for (const attr of Array.from(blip.attributes || [])) {
        if (attr.localName === 'embed') { rEmbed = attr.value; break; }
      }
    }
    if (!rEmbed) return;
    const target = slideRels[rEmbed];
    if (!target) return;
    const resolved = resolvePath(slidePath, target);
    const mediaBytes = files[resolved];
    if (!mediaBytes) return;
    const mime = guessMimeFromPath(resolved);
    if (mime === 'application/octet-stream') return; // unsupported (e.g. .emf, .wmf)
    const dataUrl = bytesToDataUrl(mediaBytes, mime);
    // If the picture has no xfrm of its own, fall back to a centred
    // 600x400 placement so the image is at least visible. (PowerPoint
    // sometimes inherits geometry from a layout placeholder.)
    const placement = xfrm || { x: (1280 - 600) / 2, y: (720 - 400) / 2, w: 600, h: 400 };
    elements.push({
      id: newElId(),
      kind: 'image',
      x: placement.x, y: placement.y, w: placement.w, h: placement.h,
      src: dataUrl,
    });
  }

  return {
    id: `slide-pptx-${slideIdx}`,
    elements,
    notes: '',
    transition: 'none',
    layout: 'titleAndContent',
  };
}

function readXfrm(node) {
  const xfrm = node.getElementsByTagNameNS('*', 'xfrm')[0];
  if (!xfrm) return null;
  const off = xfrm.getElementsByTagNameNS('*', 'off')[0];
  const ext = xfrm.getElementsByTagNameNS('*', 'ext')[0];
  if (!off || !ext) return null;
  return {
    x: emu2px(parseInt(off.getAttribute('x') || '0', 10)),
    y: emu2px(parseInt(off.getAttribute('y') || '0', 10)),
    w: emu2px(parseInt(ext.getAttribute('cx') || '0', 10)),
    h: emu2px(parseInt(ext.getAttribute('cy') || '0', 10)),
  };
}

function txBodyToHtml(txBody) {
  const paras = Array.from(txBody.getElementsByTagNameNS('*', 'p'));
  let firstSz = 0;
  let firstAlign = '';
  const html = paras.map((p) => {
    const pPr = p.getElementsByTagNameNS('*', 'pPr')[0];
    if (pPr && !firstAlign) {
      const algn = pPr.getAttribute('algn');
      if (algn === 'ctr') firstAlign = 'center';
      else if (algn === 'r') firstAlign = 'right';
      else if (algn === 'just') firstAlign = 'justify';
      else firstAlign = 'left';
    }
    const runs = Array.from(p.getElementsByTagNameNS('*', 'r'));
    const text = runs.map((r) => {
      const rPr = r.getElementsByTagNameNS('*', 'rPr')[0];
      if (rPr && !firstSz) {
        const sz = parseInt(rPr.getAttribute('sz') || '0', 10);
        if (sz > 0) firstSz = Math.round(sz / 100);
      }
      const tNode = r.getElementsByTagNameNS('*', 't')[0];
      let t = tNode ? (tNode.textContent || '') : '';
      const bold = rPr && rPr.getAttribute('b') === '1';
      const italic = rPr && rPr.getAttribute('i') === '1';
      let escaped = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (bold) escaped = `<b>${escaped}</b>`;
      if (italic) escaped = `<i>${escaped}</i>`;
      return escaped;
    }).join('');
    return `<p>${text || '<br>'}</p>`;
  }).join('');
  return { html: html || '<p><br></p>', fontSize: firstSz, align: firstAlign };
}

function resolvePath(fromPath, relative) {
  // fromPath like 'ppt/slides/slide1.xml'; relative like '../media/image1.png'
  const fromDir = fromPath.replace(/\/[^/]+$/, '');
  const parts = fromDir.split('/');
  for (const seg of relative.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg === '.' || seg === '') continue;
    else parts.push(seg);
  }
  return parts.join('/');
}

function guessMimeFromPath(p) {
  const ext = (p.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg':
    case 'jpe':
    case 'jfif': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'tif':
    case 'tiff': return 'image/tiff';
    case 'svg': return 'image/svg+xml';
    // .emf and .wmf are vector formats Windows-only; the browser
    // can't render them, so we return octet-stream which the caller
    // treats as "skip this image".
    default: return 'application/octet-stream';
  }
}
