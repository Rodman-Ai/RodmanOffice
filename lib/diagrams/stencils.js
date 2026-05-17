// The 52-shape stencil catalog.
//
// Each entry maps an id to a draw function that returns an SVG path
// or group string. The function receives (w, h) where w, h are the
// shape's bounding box in page-local pixels. Coordinates inside the
// returned <path>/<polygon> are 0..w by 0..h.
//
// Connection ports are the four edge midpoints (top, right, bottom,
// left). Stencils that want different anchors override `ports`.

function rect(w, h, r = 0) {
  if (r > 0) {
    return `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" />`;
  }
  return `<rect x="0" y="0" width="${w}" height="${h}" />`;
}

function poly(points) {
  return `<polygon points="${points}" />`;
}

function path(d) {
  return `<path d="${d}" />`;
}

function ellipse(w, h) {
  return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" />`;
}

function circle(w, h) {
  const r = Math.min(w, h) / 2;
  return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" />`;
}

// Build a polygon string from a list of [x, y] points expressed as
// fractions of (w, h) — keeps stencil definitions readable.
function fpoly(w, h, pts) {
  return pts.map(([fx, fy]) => `${(fx * w).toFixed(2)},${(fy * h).toFixed(2)}`).join(' ');
}

// ---------- Basic Shapes (12) ----------

const BASIC = {
  rectangle:        { name: 'Rectangle',         draw: (w, h) => rect(w, h) },
  roundedRectangle: { name: 'Rounded Rectangle', draw: (w, h) => rect(w, h, Math.min(w, h) * 0.12) },
  ellipse:          { name: 'Ellipse',           draw: (w, h) => ellipse(w, h) },
  diamond:          { name: 'Diamond',           draw: (w, h) => poly(fpoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])) },
  triangle:         { name: 'Triangle',          draw: (w, h) => poly(fpoly(w, h, [[0.5, 0], [1, 1], [0, 1]])) },
  parallelogram:    { name: 'Parallelogram',     draw: (w, h) => poly(fpoly(w, h, [[0.2, 0], [1, 0], [0.8, 1], [0, 1]])) },
  trapezoid:        { name: 'Trapezoid',         draw: (w, h) => poly(fpoly(w, h, [[0.2, 0], [0.8, 0], [1, 1], [0, 1]])) },
  pentagon:         { name: 'Pentagon',          draw: (w, h) => poly(fpoly(w, h, [[0.5, 0], [1, 0.4], [0.8, 1], [0.2, 1], [0, 0.4]])) },
  hexagon:          { name: 'Hexagon',           draw: (w, h) => poly(fpoly(w, h, [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]])) },
  octagon:          { name: 'Octagon',           draw: (w, h) => poly(fpoly(w, h, [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]])) },
  star:             { name: 'Star',              draw: (w, h) => {
    // 5-point star inscribed in (w, h)
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2, r = R * 0.4;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? R : r;
      pts.push(`${(cx + rr * Math.cos(ang)).toFixed(2)},${(cy + rr * Math.sin(ang)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" />`;
  } },
  cross:            { name: 'Cross',             draw: (w, h) => poly(fpoly(w, h, [
    [0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65],
    [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]
  ])) },
};

// ---------- Flowchart (18) — ISO 5807 / ANSI flowchart symbols ----------

const FLOWCHART = {
  flowProcess:       { name: 'Process',           draw: (w, h) => rect(w, h) },
  flowDecision:      { name: 'Decision',          draw: (w, h) => poly(fpoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])) },
  flowTerminator:    { name: 'Terminator',        draw: (w, h) => rect(w, h, Math.min(w, h) / 2) },
  flowDocument:      { name: 'Document',          draw: (w, h) =>
    path(`M0,0 L${w},0 L${w},${h * 0.82} Q${w * 0.75},${h * 0.62} ${w * 0.5},${h * 0.82} Q${w * 0.25},${h * 1.02} 0,${h * 0.82} Z`) },
  flowManualInput:   { name: 'Manual Input',      draw: (w, h) => poly(fpoly(w, h, [[0, 0.2], [1, 0], [1, 1], [0, 1]])) },
  flowManualOp:      { name: 'Manual Operation',  draw: (w, h) => poly(fpoly(w, h, [[0, 0], [1, 0], [0.85, 1], [0.15, 1]])) },
  flowData:          { name: 'Data',              draw: (w, h) => poly(fpoly(w, h, [[0.2, 0], [1, 0], [0.8, 1], [0, 1]])) },
  flowPredefined:    { name: 'Predefined Process',draw: (w, h) =>
    `${rect(w, h)}<line x1="${w * 0.1}" y1="0" x2="${w * 0.1}" y2="${h}" /><line x1="${w * 0.9}" y1="0" x2="${w * 0.9}" y2="${h}" />` },
  flowOnPageRef:     { name: 'On-Page Reference', draw: (w, h) => circle(w, h) },
  flowOffPageRef:    { name: 'Off-Page Reference',draw: (w, h) => poly(fpoly(w, h, [[0, 0], [1, 0], [1, 0.7], [0.5, 1], [0, 0.7]])) },
  flowDatabase:      { name: 'Database',          draw: (w, h) =>
    path(`M0,${h * 0.12} Q${w / 2},0 ${w},${h * 0.12} L${w},${h * 0.88} Q${w / 2},${h} 0,${h * 0.88} Z M0,${h * 0.12} Q${w / 2},${h * 0.24} ${w},${h * 0.12}`) },
  flowDirectAccess:  { name: 'Direct Access',     draw: (w, h) =>
    path(`M${w * 0.12},0 L${w * 0.88},0 Q${w},${h / 2} ${w * 0.88},${h} L${w * 0.12},${h} Q0,${h / 2} ${w * 0.12},0 Z`) },
  flowInternalStorage: { name: 'Internal Storage', draw: (w, h) =>
    `${rect(w, h)}<line x1="${w * 0.15}" y1="0" x2="${w * 0.15}" y2="${h}" /><line x1="0" y1="${h * 0.2}" x2="${w}" y2="${h * 0.2}" />` },
  flowMagneticTape:  { name: 'Magnetic Tape',     draw: (w, h) =>
    path(`M${w / 2},0 A${w / 2},${h / 2} 0 1,0 ${w / 2},${h} L${w},${h} L${w},${h * 0.86} Z`) },
  flowDisplay:       { name: 'Display',           draw: (w, h) =>
    path(`M${w * 0.18},0 L${w * 0.82},0 Q${w},${h / 2} ${w * 0.82},${h} L${w * 0.18},${h} L0,${h / 2} Z`) },
  flowPreparation:   { name: 'Preparation',       draw: (w, h) => poly(fpoly(w, h, [[0.15, 0], [0.85, 0], [1, 0.5], [0.85, 1], [0.15, 1], [0, 0.5]])) },
  flowCard:          { name: 'Card',              draw: (w, h) => poly(fpoly(w, h, [[0.15, 0], [1, 0], [1, 1], [0, 1], [0, 0.3]])) },
  flowPaperTape:     { name: 'Paper Tape',        draw: (w, h) =>
    path(`M0,${h * 0.18} Q${w / 4},0 ${w / 2},${h * 0.18} Q${w * 3 / 4},${h * 0.36} ${w},${h * 0.18} L${w},${h * 0.82} Q${w * 3 / 4},${h} ${w / 2},${h * 0.82} Q${w / 4},${h * 0.64} 0,${h * 0.82} Z`) },
};

// ---------- BPMN (12) ----------

const BPMN = {
  bpmnStartEvent:    { name: 'Start Event',       draw: (w, h) => `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 2}" />` },
  bpmnIntermediate:  { name: 'Intermediate Event',draw: (w, h) => {
    const r = Math.min(w, h) / 2 - 2;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" />` +
           `<circle cx="${w / 2}" cy="${h / 2}" r="${r - 4}" fill="none" />`;
  } },
  bpmnEndEvent:      { name: 'End Event',         draw: (w, h) => {
    const r = Math.min(w, h) / 2 - 2;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" stroke-width="3" />`;
  } },
  bpmnMessageEvent:  { name: 'Message Event',     draw: (w, h) => {
    const r = Math.min(w, h) / 2 - 2;
    const mx = w * 0.25, my = h * 0.35, mw = w * 0.5, mh = h * 0.3;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" />` +
           `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" fill="none" />` +
           `<path d="M${mx},${my} L${w / 2},${my + mh / 2} L${mx + mw},${my}" fill="none" />`;
  } },
  bpmnTimerEvent:    { name: 'Timer Event',       draw: (w, h) => {
    const r = Math.min(w, h) / 2 - 2;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" />` +
           `<circle cx="${w / 2}" cy="${h / 2}" r="${r * 0.55}" fill="none" />` +
           `<line x1="${w / 2}" y1="${h / 2}" x2="${w / 2}" y2="${h / 2 - r * 0.5}" />` +
           `<line x1="${w / 2}" y1="${h / 2}" x2="${w / 2 + r * 0.35}" y2="${h / 2}" />`;
  } },
  bpmnTask:          { name: 'Task',              draw: (w, h) => rect(w, h, Math.min(w, h) * 0.18) },
  bpmnSubProcess:    { name: 'Sub-Process',       draw: (w, h) =>
    `${rect(w, h, Math.min(w, h) * 0.18)}<rect x="${w / 2 - 6}" y="${h - 16}" width="12" height="12" fill="none" /><line x1="${w / 2 - 4}" y1="${h - 10}" x2="${w / 2 + 4}" y2="${h - 10}" /><line x1="${w / 2}" y1="${h - 14}" x2="${w / 2}" y2="${h - 6}" />` },
  bpmnExclusive:     { name: 'Exclusive Gateway', draw: (w, h) => {
    const d = poly(fpoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]));
    return `${d}<path d="M${w * 0.3},${h * 0.3} L${w * 0.7},${h * 0.7} M${w * 0.7},${h * 0.3} L${w * 0.3},${h * 0.7}" stroke-width="3" />`;
  } },
  bpmnParallel:      { name: 'Parallel Gateway',  draw: (w, h) => {
    const d = poly(fpoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]));
    return `${d}<line x1="${w * 0.5}" y1="${h * 0.25}" x2="${w * 0.5}" y2="${h * 0.75}" stroke-width="3" /><line x1="${w * 0.25}" y1="${h * 0.5}" x2="${w * 0.75}" y2="${h * 0.5}" stroke-width="3" />`;
  } },
  bpmnInclusive:     { name: 'Inclusive Gateway', draw: (w, h) => {
    const d = poly(fpoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]));
    return `${d}<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.22}" fill="none" stroke-width="2" />`;
  } },
  bpmnDataObject:    { name: 'Data Object',       draw: (w, h) =>
    `<path d="M0,0 L${w * 0.75},0 L${w},${h * 0.25} L${w},${h} L0,${h} Z" />` +
    `<path d="M${w * 0.75},0 L${w * 0.75},${h * 0.25} L${w},${h * 0.25}" fill="none" />` },
  bpmnPool:          { name: 'Pool / Swimlane',   draw: (w, h) =>
    `${rect(w, h)}<line x1="${Math.min(36, w * 0.15)}" y1="0" x2="${Math.min(36, w * 0.15)}" y2="${h}" />` },
};

// ---------- Network (10) ----------

const NETWORK = {
  netServer:         { name: 'Server',            draw: (w, h) =>
    `${rect(w, h)}<line x1="0" y1="${h * 0.3}" x2="${w}" y2="${h * 0.3}" /><line x1="0" y1="${h * 0.55}" x2="${w}" y2="${h * 0.55}" /><circle cx="${w * 0.85}" cy="${h * 0.15}" r="3" /><circle cx="${w * 0.85}" cy="${h * 0.42}" r="3" />` },
  netRouter:         { name: 'Router',            draw: (w, h) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 2;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" />` +
           `<path d="M${cx - r * 0.55},${cy} L${cx + r * 0.55},${cy} M${cx - r * 0.5},${cy - r * 0.2} L${cx - r * 0.5},${cy + r * 0.2} M${cx + r * 0.5},${cy - r * 0.2} L${cx + r * 0.5},${cy + r * 0.2}" stroke-width="2" fill="none" />`;
  } },
  netSwitch:         { name: 'Switch',            draw: (w, h) =>
    `${rect(w, h)}<line x1="${w * 0.15}" y1="${h * 0.65}" x2="${w * 0.15}" y2="${h * 0.35}" /><line x1="${w * 0.35}" y1="${h * 0.65}" x2="${w * 0.35}" y2="${h * 0.35}" /><line x1="${w * 0.55}" y1="${h * 0.65}" x2="${w * 0.55}" y2="${h * 0.35}" /><line x1="${w * 0.75}" y1="${h * 0.65}" x2="${w * 0.75}" y2="${h * 0.35}" />` },
  netFirewall:       { name: 'Firewall',          draw: (w, h) => {
    // Brick-wall pattern
    let out = rect(w, h);
    const rows = 4, cols = 4;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      out += `<line x1="0" y1="${(r + 1) * rh}" x2="${w}" y2="${(r + 1) * rh}" />`;
      const offset = r % 2 === 0 ? 0 : w / cols / 2;
      for (let c = 0; c <= cols; c++) {
        const x = c * (w / cols) + offset;
        if (x > 0 && x < w) {
          out += `<line x1="${x}" y1="${r * rh}" x2="${x}" y2="${(r + 1) * rh}" />`;
        }
      }
    }
    return out;
  } },
  netCloud:          { name: 'Cloud',             draw: (w, h) =>
    path(`M${w * 0.2},${h * 0.7} Q0,${h * 0.7} ${w * 0.1},${h * 0.45} Q${w * 0.05},${h * 0.2} ${w * 0.3},${h * 0.3} Q${w * 0.4},${h * 0.1} ${w * 0.55},${h * 0.2} Q${w * 0.75},${h * 0.1} ${w * 0.8},${h * 0.35} Q${w},${h * 0.4} ${w * 0.9},${h * 0.65} Q${w * 0.95},${h * 0.85} ${w * 0.7},${h * 0.8} Q${w * 0.5},${h * 0.95} ${w * 0.35},${h * 0.85} Q${w * 0.15},${h * 0.9} ${w * 0.2},${h * 0.7} Z`) },
  netWorkstation:    { name: 'Workstation',       draw: (w, h) =>
    `<rect x="${w * 0.1}" y="${h * 0.1}" width="${w * 0.8}" height="${h * 0.55}" /><rect x="${w * 0.35}" y="${h * 0.65}" width="${w * 0.3}" height="${h * 0.15}" /><rect x="${w * 0.2}" y="${h * 0.8}" width="${w * 0.6}" height="${h * 0.1}" rx="2" />` },
  netLaptop:         { name: 'Laptop',            draw: (w, h) =>
    `<rect x="${w * 0.15}" y="${h * 0.15}" width="${w * 0.7}" height="${h * 0.5}" /><polygon points="${w * 0.05},${h * 0.85} ${w * 0.95},${h * 0.85} ${w * 0.85},${h * 0.65} ${w * 0.15},${h * 0.65}" />` },
  netMobile:         { name: 'Mobile',            draw: (w, h) =>
    `<rect x="${w * 0.3}" y="${h * 0.08}" width="${w * 0.4}" height="${h * 0.84}" rx="${Math.min(w, h) * 0.06}" /><circle cx="${w / 2}" cy="${h * 0.85}" r="3" /><line x1="${w * 0.4}" y1="${h * 0.16}" x2="${w * 0.6}" y2="${h * 0.16}" />` },
  netPrinter:        { name: 'Printer',           draw: (w, h) =>
    `<rect x="${w * 0.2}" y="${h * 0.05}" width="${w * 0.6}" height="${h * 0.3}" /><rect x="${w * 0.05}" y="${h * 0.35}" width="${w * 0.9}" height="${h * 0.4}" rx="3" /><rect x="${w * 0.2}" y="${h * 0.65}" width="${w * 0.6}" height="${h * 0.3}" /><circle cx="${w * 0.85}" cy="${h * 0.5}" r="3" />` },
  netStorage:        { name: 'Storage',           draw: (w, h) =>
    `<ellipse cx="${w / 2}" cy="${h * 0.15}" rx="${w / 2 - 2}" ry="${h * 0.15}" />` +
    `<path d="M2,${h * 0.15} L2,${h * 0.85} A${w / 2 - 2},${h * 0.15} 0 0 0 ${w - 2},${h * 0.85} L${w - 2},${h * 0.15}" fill="none" />` },
};

// ---------- UML (12) ----------

const UML = {
  umlClass: { name: 'Class', draw: (w, h) => {
    const headerH = Math.min(24, h * 0.3);
    return rect(w, h) +
      `<line x1="0" y1="${headerH}" x2="${w}" y2="${headerH}" />` +
      `<line x1="0" y1="${headerH + (h - headerH) / 2}" x2="${w}" y2="${headerH + (h - headerH) / 2}" />`;
  } },
  umlInterface: { name: 'Interface', draw: (w, h) => rect(w, h) +
    `<text x="${w / 2}" y="14" font-size="9" text-anchor="middle" font-style="italic">«interface»</text>` },
  umlPackage: { name: 'Package', draw: (w, h) => {
    const tabW = Math.min(60, w * 0.35);
    const tabH = Math.min(18, h * 0.2);
    return `<rect x="0" y="0" width="${tabW}" height="${tabH}" />` +
           `<rect x="0" y="${tabH}" width="${w}" height="${h - tabH}" />`;
  } },
  umlComponent: { name: 'Component', draw: (w, h) => rect(w, h) +
    `<rect x="-6" y="${h * 0.2}" width="12" height="8" fill="#fff" />` +
    `<rect x="-6" y="${h * 0.5}" width="12" height="8" fill="#fff" />` },
  umlNode: { name: 'Node', draw: (w, h) => poly(fpoly(w, h, [[0.08, 0.2], [0.92, 0.2], [0.92, 1], [0.08, 1]])) +
    `<line x1="${w * 0.08}" y1="${h * 0.2}" x2="${w * 0.2}" y2="0" />` +
    `<line x1="${w * 0.92}" y1="${h * 0.2}" x2="${w}" y2="0" />` +
    `<line x1="${w * 0.2}" y1="0" x2="${w}" y2="0" />` },
  umlActor: { name: 'Actor', draw: (w, h) => {
    const cx = w / 2, headR = Math.min(w, h) * 0.12, headY = h * 0.18;
    return `<circle cx="${cx}" cy="${headY}" r="${headR}" fill="none" />` +
           `<line x1="${cx}" y1="${headY + headR}" x2="${cx}" y2="${h * 0.7}" />` +
           `<line x1="${cx - w * 0.25}" y1="${h * 0.45}" x2="${cx + w * 0.25}" y2="${h * 0.45}" />` +
           `<line x1="${cx}" y1="${h * 0.7}" x2="${cx - w * 0.2}" y2="${h}" />` +
           `<line x1="${cx}" y1="${h * 0.7}" x2="${cx + w * 0.2}" y2="${h}" />`;
  } },
  umlUseCase: { name: 'Use Case', draw: (w, h) => ellipse(w, h) },
  umlState: { name: 'State', draw: (w, h) => rect(w, h, Math.min(w, h) * 0.18) },
  umlInitialState: { name: 'Initial State', draw: (w, h) => circle(w, h) },
  umlFinalState: { name: 'Final State', draw: (w, h) => {
    const r = Math.min(w, h) / 2 - 2;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="none" />` +
           `<circle cx="${w / 2}" cy="${h / 2}" r="${r - 6}" />`;
  } },
  umlDecision: { name: 'Decision', draw: (w, h) => poly(fpoly(w, h, [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])) },
  umlForkJoin: { name: 'Fork / Join', draw: (w, h) => `<rect x="0" y="${h * 0.45}" width="${w}" height="${h * 0.1}" />` },
};

// ---------- Org chart (6) ----------

const ORG = {
  orgExecutive: { name: 'Executive', draw: (w, h) => rect(w, h, 4) +
    `<line x1="0" y1="${h * 0.35}" x2="${w}" y2="${h * 0.35}" />` },
  orgManager: { name: 'Manager', draw: (w, h) => rect(w, h, 4) },
  orgPosition: { name: 'Position', draw: (w, h) => rect(w, h) },
  orgAssistant: { name: 'Assistant', draw: (w, h) => poly(fpoly(w, h, [[0.15, 0], [0.85, 0], [1, 0.5], [0.85, 1], [0.15, 1], [0, 0.5]])) },
  orgVacancy: { name: 'Vacancy', draw: (w, h) => rect(w, h) +
    `<text x="${w / 2}" y="${h - 6}" font-size="9" text-anchor="middle" fill="#9ca3af">vacant</text>` },
  orgConsultant: { name: 'Consultant', draw: (w, h) => rect(w, h) +
    `<line x1="0" y1="0" x2="${w}" y2="${h}" stroke-dasharray="3 3" />` +
    `<line x1="${w}" y1="0" x2="0" y2="${h}" stroke-dasharray="3 3" />` },
};

// ---------- Swimlanes / cross-functional flowchart (5) ----------

const SWIMLANE = {
  swimlaneHorizontal: { name: 'Horizontal Lane', draw: (w, h) => {
    const labelW = Math.min(48, w * 0.1);
    return rect(w, h) + `<line x1="${labelW}" y1="0" x2="${labelW}" y2="${h}" />`;
  } },
  swimlaneVertical: { name: 'Vertical Lane', draw: (w, h) => {
    const labelH = Math.min(36, h * 0.1);
    return rect(w, h) + `<line x1="0" y1="${labelH}" x2="${w}" y2="${labelH}" />`;
  } },
  swimlanePhase: { name: 'Phase Divider', draw: (w, h) =>
    `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke-dasharray="6 3" stroke-width="1.5" />` },
  swimlaneTitle: { name: 'Swimlane Title', draw: (w, h) => `<rect x="0" y="0" width="${w}" height="${h}" />` },
  swimlanePool: { name: 'Pool', draw: (w, h) => {
    const labelW = Math.min(60, w * 0.12);
    return rect(w, h) +
      `<line x1="${labelW}" y1="0" x2="${labelW}" y2="${h}" />` +
      `<line x1="${labelW}" y1="${h / 2}" x2="${w}" y2="${h / 2}" />`;
  } },
};

// ---------- Wireframe / UI mockup (12) ----------

const WIREFRAME = {
  uiButton: { name: 'Button', draw: (w, h) => rect(w, h, 4) },
  uiInput: { name: 'Text Input', draw: (w, h) => rect(w, h, 2) },
  uiDropdown: { name: 'Dropdown', draw: (w, h) => rect(w, h, 2) +
    `<polyline points="${w - 14},${h / 2 - 2} ${w - 8},${h / 2 + 4} ${w - 2},${h / 2 - 2}" fill="none" />` },
  uiCheckbox: { name: 'Checkbox', draw: (w, h) => {
    const s = Math.min(w, h) * 0.7;
    return `<rect x="${(w - s) / 2}" y="${(h - s) / 2}" width="${s}" height="${s}" />`;
  } },
  uiRadio: { name: 'Radio Button', draw: (w, h) => circle(w, h) },
  uiContainer: { name: 'Container', draw: (w, h) => `<rect x="0" y="0" width="${w}" height="${h}" stroke-dasharray="4 3" />` },
  uiLabel: { name: 'Label', draw: (w, h) => `<line x1="2" y1="${h - 6}" x2="${w - 2}" y2="${h - 6}" />` },
  uiModal: { name: 'Modal', draw: (w, h) => rect(w, h, 6) +
    `<line x1="0" y1="24" x2="${w}" y2="24" />` +
    `<circle cx="${w - 14}" cy="12" r="4" fill="none" />` },
  uiNav: { name: 'Nav Bar', draw: (w, h) => rect(w, h) +
    `<line x1="${w * 0.25}" y1="0" x2="${w * 0.25}" y2="${h}" />` +
    `<line x1="${w * 0.5}" y1="0" x2="${w * 0.5}" y2="${h}" />` +
    `<line x1="${w * 0.75}" y1="0" x2="${w * 0.75}" y2="${h}" />` },
  uiList: { name: 'List', draw: (w, h) => rect(w, h) +
    `<line x1="0" y1="${h / 3}" x2="${w}" y2="${h / 3}" />` +
    `<line x1="0" y1="${h * 2 / 3}" x2="${w}" y2="${h * 2 / 3}" />` },
  uiImage: { name: 'Image Placeholder', draw: (w, h) => rect(w, h) +
    `<line x1="0" y1="0" x2="${w}" y2="${h}" />` +
    `<line x1="${w}" y1="0" x2="0" y2="${h}" />` },
  uiTabs: { name: 'Tabs', draw: (w, h) => {
    const tabH = Math.min(20, h * 0.3);
    return `<line x1="0" y1="${tabH}" x2="${w}" y2="${tabH}" />` +
      `<rect x="2" y="0" width="${w / 4 - 4}" height="${tabH}" />` +
      `<rect x="${w / 4 + 2}" y="2" width="${w / 4 - 4}" height="${tabH - 2}" fill="none" />` +
      `<rect x="${w * 2 / 4 + 2}" y="2" width="${w / 4 - 4}" height="${tabH - 2}" fill="none" />`;
  } },
};

// ---------- Electrical (8) ----------

const ELECTRICAL = {
  elecResistor: { name: 'Resistor', draw: (w, h) => {
    const mid = h / 2;
    return `<polyline points="0,${mid} ${w * 0.2},${mid} ${w * 0.27},${mid - h * 0.25} ${w * 0.4},${mid + h * 0.25} ${w * 0.53},${mid - h * 0.25} ${w * 0.67},${mid + h * 0.25} ${w * 0.8},${mid} ${w},${mid}" fill="none" />`;
  } },
  elecCapacitor: { name: 'Capacitor', draw: (w, h) => {
    const cx = w / 2;
    return `<line x1="0" y1="${h / 2}" x2="${cx - 4}" y2="${h / 2}" />` +
           `<line x1="${cx - 4}" y1="${h * 0.2}" x2="${cx - 4}" y2="${h * 0.8}" stroke-width="2" />` +
           `<line x1="${cx + 4}" y1="${h * 0.2}" x2="${cx + 4}" y2="${h * 0.8}" stroke-width="2" />` +
           `<line x1="${cx + 4}" y1="${h / 2}" x2="${w}" y2="${h / 2}" />`;
  } },
  elecInductor: { name: 'Inductor', draw: (w, h) => {
    const mid = h / 2;
    let s = `<line x1="0" y1="${mid}" x2="${w * 0.2}" y2="${mid}" />`;
    for (let i = 0; i < 4; i++) {
      const cx = w * 0.25 + i * w * 0.125;
      s += `<path d="M${cx - w * 0.06},${mid} A${w * 0.06},${h * 0.18} 0 0 1 ${cx + w * 0.06},${mid}" fill="none" />`;
    }
    s += `<line x1="${w * 0.8}" y1="${mid}" x2="${w}" y2="${mid}" />`;
    return s;
  } },
  elecBattery: { name: 'Battery', draw: (w, h) => {
    const cx = w / 2;
    return `<line x1="0" y1="${h / 2}" x2="${cx - 6}" y2="${h / 2}" />` +
           `<line x1="${cx - 6}" y1="${h * 0.15}" x2="${cx - 6}" y2="${h * 0.85}" stroke-width="3" />` +
           `<line x1="${cx + 6}" y1="${h * 0.3}" x2="${cx + 6}" y2="${h * 0.7}" stroke-width="2" />` +
           `<line x1="${cx + 6}" y1="${h / 2}" x2="${w}" y2="${h / 2}" />`;
  } },
  elecGround: { name: 'Ground', draw: (w, h) => {
    const cx = w / 2;
    return `<line x1="${cx}" y1="0" x2="${cx}" y2="${h * 0.5}" />` +
           `<line x1="${cx - w * 0.4}" y1="${h * 0.5}" x2="${cx + w * 0.4}" y2="${h * 0.5}" stroke-width="2" />` +
           `<line x1="${cx - w * 0.27}" y1="${h * 0.65}" x2="${cx + w * 0.27}" y2="${h * 0.65}" />` +
           `<line x1="${cx - w * 0.13}" y1="${h * 0.8}" x2="${cx + w * 0.13}" y2="${h * 0.8}" />`;
  } },
  elecSwitch: { name: 'Switch', draw: (w, h) => {
    const mid = h / 2;
    return `<line x1="0" y1="${mid}" x2="${w * 0.3}" y2="${mid}" />` +
           `<circle cx="${w * 0.3}" cy="${mid}" r="3" fill="#fff" />` +
           `<line x1="${w * 0.3}" y1="${mid}" x2="${w * 0.7}" y2="${h * 0.25}" />` +
           `<circle cx="${w * 0.7}" cy="${mid}" r="3" fill="#fff" />` +
           `<line x1="${w * 0.7}" y1="${mid}" x2="${w}" y2="${mid}" />`;
  } },
  elecLED: { name: 'LED', draw: (w, h) => {
    const mid = h / 2, cx = w / 2;
    return `<line x1="0" y1="${mid}" x2="${cx - 8}" y2="${mid}" />` +
           `<polygon points="${cx - 8},${mid - 8} ${cx + 8},${mid} ${cx - 8},${mid + 8}" />` +
           `<line x1="${cx + 8}" y1="${mid - 8}" x2="${cx + 8}" y2="${mid + 8}" stroke-width="2" />` +
           `<line x1="${cx + 8}" y1="${mid}" x2="${w}" y2="${mid}" />` +
           `<line x1="${cx + 4}" y1="${mid - 12}" x2="${cx + 12}" y2="${mid - 18}" />` +
           `<line x1="${cx + 10}" y1="${mid - 12}" x2="${cx + 18}" y2="${mid - 18}" />`;
  } },
  elecTransistor: { name: 'Transistor', draw: (w, h) => {
    const cx = w * 0.5, cy = h / 2, r = Math.min(w, h) * 0.35;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" />` +
           `<line x1="${cx - r * 0.4}" y1="${cy - r * 0.6}" x2="${cx - r * 0.4}" y2="${cy + r * 0.6}" stroke-width="2" />` +
           `<line x1="${cx - r * 0.4}" y1="${cy - r * 0.3}" x2="${cx + r}" y2="${cy - r}" />` +
           `<line x1="${cx - r * 0.4}" y1="${cy + r * 0.3}" x2="${cx + r}" y2="${cy + r}" />` +
           `<line x1="${cx - r}" y1="${cy}" x2="${cx - r * 0.4}" y2="${cy}" />`;
  } },
};

// ---------- Floor plan (8) ----------

const FLOORPLAN = {
  fpWall: { name: 'Wall', draw: (w, h) => `<rect x="0" y="0" width="${w}" height="${h}" />` },
  fpDoor: { name: 'Door', draw: (w, h) =>
    `<line x1="0" y1="${h}" x2="0" y2="0" stroke-width="2" />` +
    `<path d="M0,${h} A${w},${h} 0 0 1 ${w},0" fill="none" />` +
    `<line x1="0" y1="${h}" x2="${w}" y2="${h}" />` },
  fpWindow: { name: 'Window', draw: (w, h) =>
    rect(w, h) + `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" />` },
  fpRoom: { name: 'Room', draw: (w, h) => `<rect x="0" y="0" width="${w}" height="${h}" stroke-width="2" />` },
  fpDesk: { name: 'Desk', draw: (w, h) => rect(w, h, 2) +
    `<line x1="${w * 0.1}" y1="${h * 0.7}" x2="${w * 0.9}" y2="${h * 0.7}" />` },
  fpChair: { name: 'Chair', draw: (w, h) => rect(w, h, 4) +
    `<rect x="${w * 0.15}" y="0" width="${w * 0.7}" height="${h * 0.25}" />` },
  fpSofa: { name: 'Sofa', draw: (w, h) => rect(w, h, 6) +
    `<rect x="0" y="0" width="${w * 0.15}" height="${h}" />` +
    `<rect x="${w * 0.85}" y="0" width="${w * 0.15}" height="${h}" />` +
    `<rect x="${w * 0.15}" y="0" width="${w * 0.7}" height="${h * 0.3}" />` },
  fpTable: { name: 'Table', draw: (w, h) => ellipse(w, h) },
};

// ---------- Mind-map / brainstorm (5) ----------

const MINDMAP = {
  mmCentral: { name: 'Central Topic', draw: (w, h) => ellipse(w, h) },
  mmBranch: { name: 'Primary Branch', draw: (w, h) => rect(w, h, h / 2) },
  mmSubBranch: { name: 'Sub-Branch', draw: (w, h) => `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke-width="2" />` +
    `<text x="${w / 2}" y="${h - 4}" font-size="11" text-anchor="middle" fill="currentColor">topic</text>` },
  mmCallout: { name: 'Callout', draw: (w, h) => rect(w, h, 6) +
    `<polygon points="${w * 0.15},${h} ${w * 0.25},${h + 10} ${w * 0.35},${h}" />` },
  mmCloud: { name: 'Cloud Bubble', draw: (w, h) =>
    path(`M${w * 0.2},${h * 0.7} Q0,${h * 0.7} ${w * 0.1},${h * 0.45} Q${w * 0.05},${h * 0.2} ${w * 0.3},${h * 0.3} Q${w * 0.4},${h * 0.1} ${w * 0.55},${h * 0.2} Q${w * 0.75},${h * 0.1} ${w * 0.8},${h * 0.35} Q${w},${h * 0.4} ${w * 0.9},${h * 0.65} Q${w * 0.95},${h * 0.85} ${w * 0.7},${h * 0.8} Q${w * 0.5},${h * 0.95} ${w * 0.35},${h * 0.85} Q${w * 0.15},${h * 0.9} ${w * 0.2},${h * 0.7} Z`) },
};

// ---------- Combined catalog ----------

function mark(cat, stencils) {
  const out = {};
  for (const [id, def] of Object.entries(stencils)) {
    out[id] = { ...def, category: cat, id };
  }
  return out;
}

export const STENCILS = {
  ...mark('Basic Shapes', BASIC),
  ...mark('Flowchart', FLOWCHART),
  ...mark('BPMN', BPMN),
  ...mark('Network', NETWORK),
  ...mark('UML', UML),
  ...mark('Org Chart', ORG),
  ...mark('Swimlanes', SWIMLANE),
  ...mark('Wireframe', WIREFRAME),
  ...mark('Electrical', ELECTRICAL),
  ...mark('Floor Plan', FLOORPLAN),
  ...mark('Mind Map', MINDMAP),
};

export const CATEGORIES = [
  'Basic Shapes', 'Flowchart', 'BPMN', 'Network',
  'UML', 'Org Chart', 'Swimlanes', 'Wireframe',
  'Electrical', 'Floor Plan', 'Mind Map',
];

export function getStencil(id) {
  return STENCILS[id] || STENCILS.rectangle;
}

export function stencilsByCategory() {
  const out = {};
  for (const cat of CATEGORIES) out[cat] = [];
  for (const s of Object.values(STENCILS)) out[s.category].push(s);
  return out;
}
