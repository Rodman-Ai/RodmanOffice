// Thin TypeScript re-export of the canonical XLSX codec from
// /lib/sheets/. /lib/ vendors xlsx.mjs (the ESM build of @e965/xlsx)
// so AiCell no longer needs the npm dependency.
//
// /lib/sheets/csv.js is plain JS with JSDoc; the bundler (Vite) and
// the TS Bundler resolver both follow the relative path fine, but
// `import` of an untyped JS file would otherwise be an error here.
// @ts-expect-error
import { parseXlsx as libParseXlsx, buildXlsx as libBuildXlsx } from "../../../../lib/sheets/csv.js";
import type { Sheet2D } from "./types";

export function parseXlsx(buf: ArrayBuffer): Sheet2D[] {
  return libParseXlsx(buf);
}

export function buildXlsx(sheets: Sheet2D[]): ArrayBuffer {
  const bytes: Uint8Array = libBuildXlsx(sheets);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
