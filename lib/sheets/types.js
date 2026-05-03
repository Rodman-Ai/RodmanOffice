// =============================================================
//  Workbook types — JSDoc shapes lifted from /sheets/packages/
//  shared/src/index.ts. JS-only subset used by /lib/sheets/csv.js
//  and the converter.
// =============================================================

/**
 * @typedef {Object} Cell
 * @property {string} raw — the cell's raw value as a string.
 */

/**
 * @typedef {Object} Sheet
 * @property {string} id
 * @property {string} name
 * @property {Record<string, Cell>} cells — sparse map keyed by "row,col".
 * @property {number} rowCount
 * @property {number} colCount
 */

/**
 * @typedef {Object} Workbook
 * @property {string} id
 * @property {string} name
 * @property {Sheet[]} sheets
 */

export const cellKey = (row, col) => `${row},${col}`;
