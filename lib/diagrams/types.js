// Shared JSDoc typedefs for the diagram engine.
//
// All coordinates are page-local pixels. Pages are 1100 x 850 px by
// default (US Letter at 96 DPI). VSDX export converts to Visio
// "inches × 1.0" via PX_PER_IN below.

/**
 * @typedef {object} Diagram
 * @property {number} schema
 * @property {string} title
 * @property {string} theme       Theme id from THEMES
 * @property {Page[]} pages
 * @property {Layer[]} layers
 * @property {string} activeLayerId
 */

/**
 * @typedef {object} Page
 * @property {string} id
 * @property {string} name
 * @property {number} w
 * @property {number} h
 * @property {string} bg          CSS color, e.g. "#ffffff"
 * @property {Shape[]} shapes
 * @property {Connector[]} connectors
 */

/**
 * @typedef {object} Layer
 * @property {string} id
 * @property {string} name
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {number} opacity     0..1
 * @property {string} color       Swatch color
 */

/**
 * @typedef {object} Shape
 * @property {string} id
 * @property {string} stencil     Stencil id from STENCILS
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} rotation    Degrees, 0..360
 * @property {string} fill
 * @property {string} stroke
 * @property {number} strokeWidth
 * @property {number} opacity     0..1
 * @property {string} text        Inner label (HTML-escaped plain text)
 * @property {object} textStyle   { fontFamily, fontSize, color, bold, italic, align }
 * @property {string} layerId
 */

/**
 * @typedef {object} Connector
 * @property {string} id
 * @property {string} fromShapeId
 * @property {string} toShapeId
 * @property {string} fromPort    'top' | 'right' | 'bottom' | 'left'
 * @property {string} toPort
 * @property {string} stroke
 * @property {number} strokeWidth
 * @property {string} endStart    'none' | 'arrow'
 * @property {string} endEnd      'none' | 'arrow'
 * @property {string} label
 * @property {string} layerId
 */

export const SCHEMA_VERSION = 1;
export const PX_PER_IN = 96;          // 1 in = 96 px (CSS standard)
export const DEFAULT_PAGE_W = 1100;   // US Letter at 96 DPI (landscape-ish workspace)
export const DEFAULT_PAGE_H = 850;
