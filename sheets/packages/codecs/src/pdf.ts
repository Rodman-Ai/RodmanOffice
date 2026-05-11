// PDF export — composed: render the workbook as HTML tables via the
// existing exportWorkbookAsHtml serializer, then hand the markup to
// the document-engine PDF writer in lib/docs/pdfio.js.

import { exportWorkbookAsHtml } from "./serializers";

// @ts-expect-error untyped JS module
import { savePdf as libSavePdf } from "../../../../lib/docs/pdfio.js";

type Workbook = any;

const dec = new TextDecoder("utf-8");

export async function exportWorkbookAsPdf(workbook: Workbook): Promise<Blob> {
  const htmlBytes: Uint8Array = exportWorkbookAsHtml(workbook);
  const html = dec.decode(htmlBytes);
  const blob: Blob = await libSavePdf(html, { title: workbook.name || "Workbook" });
  return blob;
}
