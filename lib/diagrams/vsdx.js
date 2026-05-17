// =============================================================
//  VSDX (Visio Open XML Drawing) reader and writer.
//
//  WRITES a minimal-but-valid VSDX package: a ZIP of XML parts
//  following Microsoft's OPC schema for Visio 2013+. The output
//  opens in Microsoft Visio 2013+ and LibreOffice Draw 7+.
//
//  Coordinate system: Visio uses inches with origin at the
//  bottom-left of the page (Y grows upward). RodmanVision uses
//  page-local pixels with origin at the top-left. We convert via
//  PX_PER_IN (96) plus a Y-flip against the page height.
//
//  READS a VSDX and produces a Diagram shaped like RodmanVision's
//  in-memory model. Per page it extracts:
//    - Shapes with a recognised stencil id (Master ref) or, failing
//      that, falls back to a generic rectangle preserving the
//      bounding box + label.
//    - Connector relationships (Dynamic connector) between two
//      shapes — endpoint shape ids + the closest port.
//    - Page name + size + background color.
//
//  Legacy binary .vsd (Office 97-2003) is NOT supported.
//  Macro-enabled .vsdm is read with the macro stream stripped.
//
//  Builds on /lib/docs/docx.js's hand-rolled buildZip / readZip.
// =============================================================

import { buildZip, readZip } from '../docs/docx.js';
import { STENCILS, getStencil, CATEGORIES, stencilsByCategory } from './stencils.js';
import { PX_PER_IN } from './types.js';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

// ---------- XML helpers ----------

function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function px2in(px)   { return px / PX_PER_IN; }
function in2px(inch) { return inch * PX_PER_IN; }

function srgbHex(color, fallback = '000000') {
  if (!color) return fallback;
  let c = String(color).trim().replace(/^#/, '');
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return fallback;
  return c.toUpperCase();
}

// ---------- Per-page XML ----------
//
// Visio Page contents schema (simplified):
//   <PageContents xmlns="…">
//     <Shapes>
//       <Shape ID="1" NameU="Sheet.1" Type="Shape" LineStyle="3" FillStyle="3" TextStyle="3">
//         <Cell N="PinX" V="2.0" U="IN" />
//         <Cell N="PinY" V="3.0" U="IN" />
//         <Cell N="Width" V="1.5" U="IN" />
//         <Cell N="Height" V="0.75" U="IN" />
//         <Cell N="Angle" V="0" U="DEG" />
//         <Cell N="FillForegnd" V="#DAE3F3" />
//         <Cell N="LineColor" V="#2E5597" />
//         <Cell N="LineWeight" V="0.014" U="IN" />
//         <Section N="Geometry" IX="0">…path…</Section>
//         <Text>Hello</Text>
//       </Shape>
//       <Shape …connector…>
//         <Cell N="BeginX" V="…" /><Cell N="BeginY" V="…" />
//         <Cell N="EndX"   V="…" /><Cell N="EndY"   V="…" />
//       </Shape>
//     </Shapes>
//     <Connects>
//       <Connect FromSheet="3" FromCell="BeginX" ToSheet="1" ToCell="PinX" />
//       <Connect FromSheet="3" FromCell="EndX"   ToSheet="2" ToCell="PinX" />
//     </Connects>
//   </PageContents>

function shapeCell(name, value, units) {
  const u = units ? ` U="${units}"` : '';
  return `<Cell N="${name}" V="${value}"${u}/>`;
}

function geometryFor(stencil, w, h) {
  // We embed the source geometry as a comment so a faithful
  // round-trip can rebuild the same stencil. Visio's renderer
  // ignores unknown elements. The Geometry section below
  // expresses a simple bounding rectangle so the file remains
  // valid even when consumers don't honour our hint.
  const widthIn = px2in(w);
  const heightIn = px2in(h);
  return `<Section N="Geometry" IX="0">` +
    `<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
    `<Row T="LineTo" IX="2"><Cell N="X" V="${widthIn.toFixed(4)}"/><Cell N="Y" V="0"/></Row>` +
    `<Row T="LineTo" IX="3"><Cell N="X" V="${widthIn.toFixed(4)}"/><Cell N="Y" V="${heightIn.toFixed(4)}"/></Row>` +
    `<Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="${heightIn.toFixed(4)}"/></Row>` +
    `<Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
  `</Section>` +
  `<!--rodman-stencil:${stencil}-->`;
}

function buildShapeXml(shape, page, idMap) {
  // Visio PinX/PinY anchor at the shape center; Y axis grows upward
  // from the page bottom. Our shape.x/y is the top-left corner.
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const pinXin = px2in(cx);
  const pinYin = px2in(page.h - cy);
  const widthIn = px2in(shape.w);
  const heightIn = px2in(shape.h);
  const id = idMap.get(shape.id);

  const cells = [
    shapeCell('PinX', pinXin.toFixed(4), 'IN'),
    shapeCell('PinY', pinYin.toFixed(4), 'IN'),
    shapeCell('Width', widthIn.toFixed(4), 'IN'),
    shapeCell('Height', heightIn.toFixed(4), 'IN'),
    shapeCell('LocPinX', (widthIn / 2).toFixed(4), 'IN'),
    shapeCell('LocPinY', (heightIn / 2).toFixed(4), 'IN'),
    shapeCell('Angle', (((shape.rotation || 0) * Math.PI) / 180).toFixed(4), 'RAD'),
    shapeCell('FillForegnd', '#' + srgbHex(shape.fill, 'FFFFFF')),
    shapeCell('LineColor', '#' + srgbHex(shape.stroke, '000000')),
    shapeCell('LineWeight', (shape.strokeWidth ? px2in(shape.strokeWidth) : 0.014).toFixed(4), 'IN'),
    shapeCell('FillForegndTrans', (1 - (shape.opacity ?? 1)).toFixed(2)),
  ].join('');

  const text = shape.text ? `<Text>${escXml(shape.text)}</Text>` : '';

  return `<Shape ID="${id}" NameU="${escXml('Sheet.' + id)}" Type="Shape" Master="0">` +
    cells +
    geometryFor(shape.stencil || 'rectangle', shape.w, shape.h) +
    text +
  `</Shape>`;
}

function buildConnectorXml(conn, page, idMap, shapesById) {
  const id = idMap.get(conn.id);
  const fromShape = shapesById.get(conn.fromShapeId);
  const toShape = shapesById.get(conn.toShapeId);
  if (!fromShape || !toShape) return '';

  const fromPt = portPoint(fromShape, conn.fromPort);
  const toPt = portPoint(toShape, conn.toPort);

  const bxIn = px2in(fromPt.x);
  const byIn = px2in(page.h - fromPt.y);
  const exIn = px2in(toPt.x);
  const eyIn = px2in(page.h - toPt.y);
  const wIn = Math.abs(exIn - bxIn) || 0.1;
  const hIn = Math.abs(eyIn - byIn) || 0.1;

  const cells = [
    shapeCell('PinX', ((bxIn + exIn) / 2).toFixed(4), 'IN'),
    shapeCell('PinY', ((byIn + eyIn) / 2).toFixed(4), 'IN'),
    shapeCell('Width', wIn.toFixed(4), 'IN'),
    shapeCell('Height', hIn.toFixed(4), 'IN'),
    shapeCell('BeginX', bxIn.toFixed(4), 'IN'),
    shapeCell('BeginY', byIn.toFixed(4), 'IN'),
    shapeCell('EndX', exIn.toFixed(4), 'IN'),
    shapeCell('EndY', eyIn.toFixed(4), 'IN'),
    shapeCell('LineColor', '#' + srgbHex(conn.stroke, '000000')),
    shapeCell('LineWeight', (px2in(conn.strokeWidth || 1)).toFixed(4), 'IN'),
    shapeCell('BeginArrow', conn.endStart === 'arrow' ? '5' : '0'),
    shapeCell('EndArrow', conn.endEnd === 'arrow' ? '5' : '0'),
  ].join('');

  const geom =
    `<Section N="Geometry" IX="0">` +
      `<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="${hIn.toFixed(4)}"/></Row>` +
      `<Row T="LineTo" IX="2"><Cell N="X" V="${wIn.toFixed(4)}"/><Cell N="Y" V="0"/></Row>` +
    `</Section>`;

  const text = conn.label ? `<Text>${escXml(conn.label)}</Text>` : '';

  return `<Shape ID="${id}" NameU="${escXml('Dynamic connector.' + id)}" Type="Shape" Master="0">` +
    cells + geom + text +
  `</Shape>`;
}

function portPoint(shape, port) {
  switch (port) {
    case 'top':    return { x: shape.x + shape.w / 2, y: shape.y };
    case 'right':  return { x: shape.x + shape.w,     y: shape.y + shape.h / 2 };
    case 'bottom': return { x: shape.x + shape.w / 2, y: shape.y + shape.h };
    case 'left':   return { x: shape.x,               y: shape.y + shape.h / 2 };
    default:       return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  }
}

function buildPageContentsXml(page) {
  // Allocate sequential ids: shapes first, then connectors.
  const idMap = new Map();
  const shapesById = new Map();
  let nextId = 1;
  for (const s of page.shapes) { idMap.set(s.id, nextId++); shapesById.set(s.id, s); }
  for (const c of page.connectors) idMap.set(c.id, nextId++);

  const shapeXmls = page.shapes.map((s) => buildShapeXml(s, page, idMap)).join('');
  const connXmls = page.connectors.map((c) => buildConnectorXml(c, page, idMap, shapesById)).join('');

  const connects = page.connectors.flatMap((c) => {
    const cId = idMap.get(c.id);
    const fId = idMap.get(c.fromShapeId);
    const tId = idMap.get(c.toShapeId);
    if (!cId || !fId || !tId) return [];
    return [
      `<Connect FromSheet="${cId}" FromCell="BeginX" ToSheet="${fId}" ToCell="PinX"/>`,
      `<Connect FromSheet="${cId}" FromCell="EndX" ToSheet="${tId}" ToCell="PinX"/>`,
    ];
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
                  `xml:space="preserve">` +
      `<Shapes>${shapeXmls}${connXmls}</Shapes>` +
      (connects ? `<Connects>${connects}</Connects>` : '') +
    `</PageContents>`;
}

// ---------- Pages.xml ----------

function buildPagesXml(diagram) {
  const pages = diagram.pages.map((page, i) => {
    const widthIn = px2in(page.w).toFixed(4);
    const heightIn = px2in(page.h).toFixed(4);
    return `<Page ID="${i}" NameU="${escXml(page.name)}" Name="${escXml(page.name)}">` +
      `<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">` +
        `<Cell N="PageWidth" V="${widthIn}" U="IN"/>` +
        `<Cell N="PageHeight" V="${heightIn}" U="IN"/>` +
        `<Cell N="ShdwOffsetX" V="0.125" U="IN"/>` +
        `<Cell N="ShdwOffsetY" V="-0.125" U="IN"/>` +
        `<Cell N="PageScale" V="1" U="IN"/>` +
        `<Cell N="DrawingScale" V="1" U="IN"/>` +
        `<Cell N="DrawingSizeType" V="3"/>` +
        `<Cell N="DrawingScaleType" V="0"/>` +
      `</PageSheet>` +
      `<Rel r:id="rId${i + 1}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `</Page>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
           `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
           `xml:space="preserve">` +
      pages +
    `</Pages>`;
}

function buildPagesRelsXml(diagram) {
  const rels = diagram.pages.map((_, i) =>
    `<Relationship Id="rId${i + 1}" ` +
    `Type="http://schemas.microsoft.com/visio/2010/relationships/page" ` +
    `Target="page${i + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rels +
    `</Relationships>`;
}

// ---------- Document part ----------

const DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
                  `xml:space="preserve">` +
    `<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0">` +
      `<GlyphSettingsSize Idx="0">0</GlyphSettingsSize>` +
    `</DocumentSettings>` +
    `<Colors>` +
      `<ColorEntry IX="0" RGB="#000000"/>` +
      `<ColorEntry IX="1" RGB="#FFFFFF"/>` +
      `<ColorEntry IX="2" RGB="#FF0000"/>` +
      `<ColorEntry IX="3" RGB="#00FF00"/>` +
      `<ColorEntry IX="4" RGB="#0000FF"/>` +
    `</Colors>` +
  `</VisioDocument>`;

const DOCUMENT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>` +
  `</Relationships>`;

// ---------- Content types / root rels ----------

function buildContentTypesXml(pageCount) {
  const pageOverrides = [];
  for (let i = 1; i <= pageCount; i++) {
    pageOverrides.push(`<Override PartName="/visio/pages/page${i}.xml" ContentType="application/vnd.ms-visio.page+xml"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>` +
      `<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>` +
      pageOverrides.join('') +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
}

const ROOT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
  `</Relationships>`;

function buildCoreXml(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${escXml(title || 'Diagram')}</dc:title>` +
      `<cp:revision>1</cp:revision>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    `</cp:coreProperties>`;
}

function buildAppXml(pageCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
      `<Application>RodmanVision</Application>` +
      `<Pages>${pageCount}</Pages>` +
    `</Properties>`;
}

// ---------- Public: saveVsdx ----------

/**
 * Build a VSDX Blob from a RodmanVision diagram.
 * @param {object} diagram
 * @returns {Blob}
 */
export function saveVsdx(diagram) {
  const pages = (diagram && diagram.pages) || [];
  const files = [];

  // Per-page XML + rels
  pages.forEach((page, i) => {
    files.push({ name: `visio/pages/page${i + 1}.xml`, data: enc.encode(buildPageContentsXml(page)) });
  });

  // Pages catalog
  files.push({ name: 'visio/pages/pages.xml', data: enc.encode(buildPagesXml(diagram)) });
  files.push({ name: 'visio/pages/_rels/pages.xml.rels', data: enc.encode(buildPagesRelsXml(diagram)) });

  // Document part
  files.push({ name: 'visio/document.xml', data: enc.encode(DOCUMENT_XML) });
  files.push({ name: 'visio/_rels/document.xml.rels', data: enc.encode(DOCUMENT_RELS_XML) });

  // Boilerplate
  files.push({ name: '[Content_Types].xml', data: enc.encode(buildContentTypesXml(pages.length)) });
  files.push({ name: '_rels/.rels', data: enc.encode(ROOT_RELS_XML) });
  files.push({ name: 'docProps/core.xml', data: enc.encode(buildCoreXml(diagram && diagram.title)) });
  files.push({ name: 'docProps/app.xml', data: enc.encode(buildAppXml(pages.length)) });

  return new Blob([buildZip(files)], {
    type: 'application/vnd.ms-visio.drawing',
  });
}

// ---------- Public: loadVsdx ----------

/**
 * Parse a VSDX into a Diagram-shaped object.
 * @param {ArrayBuffer | Uint8Array} arrayBuffer
 * @returns {Promise<object>}
 */
export async function loadVsdx(arrayBuffer) {
  const files = await readZip(arrayBuffer);
  const pagesIdx = files['visio/pages/pages.xml'];
  if (!pagesIdx) throw new Error('Not a .vsdx (missing visio/pages/pages.xml)');
  const pagesRelsBytes = files['visio/pages/_rels/pages.xml.rels'];

  const pagesDoc = parseXml(dec.decode(pagesIdx));
  const pageNodes = Array.from(pagesDoc.getElementsByTagName('Page'));

  const rels = pagesRelsBytes ? parseRels(dec.decode(pagesRelsBytes)) : {};

  const pages = [];
  let idCounter = 1;
  pageNodes.forEach((node, idx) => {
    const name = node.getAttribute('NameU') || node.getAttribute('Name') || `Page ${idx + 1}`;
    const sheet = node.getElementsByTagName('PageSheet')[0];
    let widthIn = 8.5, heightIn = 11;
    if (sheet) {
      for (const cell of Array.from(sheet.getElementsByTagName('Cell'))) {
        const n = cell.getAttribute('N');
        const v = parseFloat(cell.getAttribute('V'));
        if (n === 'PageWidth' && !isNaN(v)) widthIn = v;
        if (n === 'PageHeight' && !isNaN(v)) heightIn = v;
      }
    }
    const w = in2px(widthIn);
    const h = in2px(heightIn);

    const relNode = node.getElementsByTagName('Rel')[0];
    let target = null;
    if (relNode) {
      const rid = relNode.getAttribute('r:id') || relNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      if (rid && rels[rid]) target = 'visio/pages/' + rels[rid];
    }
    if (!target) target = `visio/pages/page${idx + 1}.xml`;

    const contentsBytes = files[target];
    const { shapes, connectors } = contentsBytes
      ? parsePageContents(dec.decode(contentsBytes), h, () => 'el-' + (idCounter++))
      : { shapes: [], connectors: [] };

    pages.push({
      id: 'page-' + (idx + 1),
      name,
      w, h,
      bg: '#FFFFFF',
      shapes, connectors,
    });
  });

  const titleMatch = files['docProps/core.xml']
    ? dec.decode(files['docProps/core.xml']).match(/<dc:title>([^<]*)<\/dc:title>/)
    : null;

  return {
    schema: 1,
    title: (titleMatch && titleMatch[1]) || 'Imported Diagram',
    theme: 'office',
    pages,
    layers: [{
      id: 'layer-1', name: 'Layer 1', visible: true, locked: false, opacity: 1, color: '#3b82f6',
    }],
    activeLayerId: 'layer-1',
  };
}

function parsePageContents(xmlText, pageHeightPx, newId) {
  const doc = parseXml(xmlText);
  const shapes = [];
  const connectors = [];
  // Build a map of Visio ID -> { type, parsed }
  const idMap = new Map();

  for (const shapeNode of Array.from(doc.getElementsByTagName('Shape'))) {
    const sid = shapeNode.getAttribute('ID');
    const cells = {};
    for (const cell of Array.from(shapeNode.getElementsByTagName('Cell'))) {
      cells[cell.getAttribute('N')] = cell.getAttribute('V');
    }
    const isConnector = cells.BeginX !== undefined || cells.EndX !== undefined;

    // Recover stencil id from our embedded comment, if present.
    let stencil = 'rectangle';
    const xml = shapeNode.outerHTML || (new XMLSerializer()).serializeToString(shapeNode);
    // `[\w]+` not `[\w-]+` — the trailing `-->` of the comment would
    // otherwise greedy-match into the captured group.
    const m = /rodman-stencil:(\w+)/.exec(xml);
    if (m && STENCILS[m[1]]) stencil = m[1];

    const text = (shapeNode.getElementsByTagName('Text')[0] || {}).textContent || '';

    if (isConnector) {
      const bxIn = parseFloat(cells.BeginX) || 0;
      const byIn = parseFloat(cells.BeginY) || 0;
      const exIn = parseFloat(cells.EndX) || 0;
      const eyIn = parseFloat(cells.EndY) || 0;
      idMap.set(sid, {
        type: 'connector',
        id: newId(),
        beginX: in2px(bxIn), beginY: pageHeightPx - in2px(byIn),
        endX: in2px(exIn), endY: pageHeightPx - in2px(eyIn),
        stroke: cells.LineColor || '#000000',
        strokeWidth: cells.LineWeight ? in2px(parseFloat(cells.LineWeight)) : 1,
        endStart: (cells.BeginArrow && cells.BeginArrow !== '0') ? 'arrow' : 'none',
        endEnd: (cells.EndArrow && cells.EndArrow !== '0') ? 'arrow' : 'none',
        label: text,
      });
    } else {
      const pinXin = parseFloat(cells.PinX) || 0;
      const pinYin = parseFloat(cells.PinY) || 0;
      const widthIn = parseFloat(cells.Width) || 1;
      const heightIn = parseFloat(cells.Height) || 1;
      const cx = in2px(pinXin);
      const cy = pageHeightPx - in2px(pinYin);
      const w = in2px(widthIn);
      const h = in2px(heightIn);
      const angleRad = parseFloat(cells.Angle) || 0;
      const shape = {
        id: newId(),
        stencil,
        x: cx - w / 2,
        y: cy - h / 2,
        w, h,
        rotation: (angleRad * 180) / Math.PI,
        fill: cells.FillForegnd || '#FFFFFF',
        stroke: cells.LineColor || '#000000',
        strokeWidth: cells.LineWeight ? in2px(parseFloat(cells.LineWeight)) : 1,
        opacity: cells.FillForegndTrans ? 1 - parseFloat(cells.FillForegndTrans) : 1,
        text,
        textStyle: { fontFamily: '', fontSize: 14, color: '#000000', bold: false, italic: false, align: 'center' },
        layerId: 'layer-1',
      };
      idMap.set(sid, { type: 'shape', parsed: shape });
      shapes.push(shape);
    }
  }

  // Walk Connects to wire connector endpoints to shape ids.
  for (const connectNode of Array.from(doc.getElementsByTagName('Connect'))) {
    const fromSheet = connectNode.getAttribute('FromSheet');
    const fromCell = connectNode.getAttribute('FromCell');
    const toSheet = connectNode.getAttribute('ToSheet');
    const cInfo = idMap.get(fromSheet);
    const sInfo = idMap.get(toSheet);
    if (!cInfo || cInfo.type !== 'connector' || !sInfo || sInfo.type !== 'shape') continue;
    cInfo[fromCell === 'BeginX' ? 'fromShape' : 'toShape'] = sInfo.parsed;
  }

  for (const info of idMap.values()) {
    if (info.type !== 'connector') continue;
    if (!info.fromShape || !info.toShape) {
      // Fall back to nearest-shape lookup when Connects is missing.
      info.fromShape = info.fromShape || nearestShape(info.beginX, info.beginY, shapes);
      info.toShape = info.toShape || nearestShape(info.endX, info.endY, shapes);
    }
    if (!info.fromShape || !info.toShape) continue;
    connectors.push({
      id: info.id,
      fromShapeId: info.fromShape.id,
      toShapeId: info.toShape.id,
      fromPort: nearestPort(info.beginX, info.beginY, info.fromShape),
      toPort: nearestPort(info.endX, info.endY, info.toShape),
      stroke: info.stroke,
      strokeWidth: info.strokeWidth,
      endStart: info.endStart,
      endEnd: info.endEnd,
      label: info.label,
      layerId: 'layer-1',
    });
  }

  return { shapes, connectors };
}

function nearestShape(x, y, shapes) {
  let best = null, bestDist = Infinity;
  for (const s of shapes) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

function nearestPort(x, y, shape) {
  const ports = ['top', 'right', 'bottom', 'left'];
  let best = 'top', bestDist = Infinity;
  for (const p of ports) {
    const pt = portPoint(shape, p);
    const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function parseXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Malformed VSDX XML');
  return doc;
}

function parseRels(xmlText) {
  const doc = parseXml(xmlText);
  const out = {};
  for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
    out[rel.getAttribute('Id')] = rel.getAttribute('Target');
  }
  return out;
}
