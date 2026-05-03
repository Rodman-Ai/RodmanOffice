import type { ClaudeClient } from "./client";
import { MODELS } from "./client";
import type { Workbook } from "@aicell/shared";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  messages: ChatTurn[];
  /** Workbook snapshot — the model uses this to ground answers in the user's data. */
  workbook?: Workbook;
};

export type ChatResponse = {
  reply: string;
};

const CHAT_SYSTEM = [
  "You are AiCell, an assistant embedded in a spreadsheet web app.",
  "You can see a snapshot of the user's workbook. Reason directly over the cells.",
  "When asked to make a change, describe the change concretely (which sheet, which cell, what value/formula).",
  "Prefer Excel-compatible formulas. Keep replies short and grounded in the data shown.",
].join(" ");

/**
 * Render a compact representation of the workbook for the model — enough to
 * answer most analytical questions without blowing up tokens. Truncates large
 * sheets to the first 50 rows and 26 cols. Stable across calls so the prompt
 * cache hits on follow-up turns within the same workbook.
 */
export function renderWorkbookContext(wb: Workbook): string {
  const SHEET_LIMIT = 5;
  const ROW_LIMIT = 50;
  const COL_LIMIT = 26;
  const lines: string[] = [`Workbook: ${wb.name}`];
  for (const sheet of wb.sheets.slice(0, SHEET_LIMIT)) {
    lines.push("");
    lines.push(`# Sheet: ${sheet.name}  (${sheet.rowCount} rows × ${sheet.colCount} cols)`);
    const rows = Math.min(sheet.rowCount, ROW_LIMIT);
    const cols = Math.min(sheet.colCount, COL_LIMIT);
    for (let r = 0; r < rows; r++) {
      const cells: string[] = [];
      let any = false;
      for (let c = 0; c < cols; c++) {
        const cell = sheet.cells[`${r},${c}`];
        const val = cell?.raw ?? "";
        if (val !== "") any = true;
        cells.push(val);
      }
      if (any) lines.push(`row ${r + 1}: ${cells.join(" | ")}`);
    }
    if (sheet.rowCount > ROW_LIMIT) {
      lines.push(`… (${sheet.rowCount - ROW_LIMIT} more rows)`);
    }
  }
  if (wb.sheets.length > SHEET_LIMIT) {
    lines.push("");
    lines.push(`… (${wb.sheets.length - SHEET_LIMIT} more sheets)`);
  }
  return lines.join("\n");
}

export async function runChat(
  req: ChatRequest,
  client: ClaudeClient
): Promise<ChatResponse> {
  // System prompt: stable instructions first (cacheable),
  // then workbook context as a separate cacheable block so it can be reused
  // across every chat turn for the same workbook.
  const system = [
    {
      type: "text" as const,
      text: CHAT_SYSTEM,
      cache_control: { type: "ephemeral" as const },
    },
  ];
  if (req.workbook) {
    system.push({
      type: "text" as const,
      text: `Current workbook:\n${renderWorkbookContext(req.workbook)}`,
      cache_control: { type: "ephemeral" as const },
    });
  }

  const transcript = req.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const reply = await client.complete({
    model: MODELS.agent,
    system,
    user: transcript,
    maxTokens: 4096,
  });
  return { reply };
}
