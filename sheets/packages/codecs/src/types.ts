/**
 * Tabular sheet expressed as a dense matrix of raw string cells.
 * Used as the lingua franca between codecs — no formulas, no formats.
 */
export type Sheet2D = {
  name: string;
  rows: string[][];
};
