// Thin TypeScript re-export of the canonical CSV codec from
// /lib/sheets/. /lib/ ships its own RFC-4180 parser/serializer so
// AiCell no longer needs papaparse.
//
// /lib/sheets/csv.js is plain JS with JSDoc; the bundler (Vite) and
// the TS Bundler resolver both follow the relative path fine, but
// `import` of an untyped JS file would otherwise be an error here.
// @ts-expect-error
import { parseCsv as libParseCsv, unparseCsv as libUnparseCsv } from "../../../../lib/sheets/csv.js";

export function parseCsv(text: string): string[][] {
  return libParseCsv(text);
}

export function unparseCsv(rows: string[][]): string {
  return libUnparseCsv(rows);
}
