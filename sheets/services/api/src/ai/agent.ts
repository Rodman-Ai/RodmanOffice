import Anthropic from "@anthropic-ai/sdk";
import type { Workbook } from "@aicell/shared";
import { renderWorkbookContext } from "./chat";
import { auditFormulas, forecastFromWorkbook } from "./tools";

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** A pending edit recorded by the agent. The user reviews & applies on the client. */
export type PlanStep =
  | { tool: "set_cell"; args: { sheet: string; row: number; col: number; raw: string } }
  | { tool: "add_sheet"; args: { name: string } }
  | {
      tool: "create_chart";
      args: {
        sheet: string;
        title: string;
        type: "bar" | "line" | "area" | "pie" | "scatter";
        range: string;
      };
    };

export type AgentResult = {
  reply: string;
  plan: PlanStep[];
};

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "set_cell",
    description:
      "Set the value or formula of a single cell. Pending — applied only after the user approves the plan. Formulas start with '='.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet name" },
        row: { type: "integer", description: "Zero-indexed row", minimum: 0 },
        col: { type: "integer", description: "Zero-indexed column", minimum: 0 },
        raw: { type: "string", description: "Cell value or formula" },
      },
      required: ["sheet", "row", "col", "raw"],
    },
  },
  {
    name: "add_sheet",
    description: "Create a new sheet in the workbook. Pending — applied only after user approval.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Sheet name" } },
      required: ["name"],
    },
  },
  {
    name: "create_chart",
    description:
      "Create a chart over a range of cells. Pending — applied only after user approval.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: ["bar", "line", "area", "pie", "scatter"] },
        range: { type: "string", description: "A1-style range like A1:B10" },
      },
      required: ["sheet", "title", "type", "range"],
    },
  },
  {
    name: "audit_formulas",
    description:
      "Audit formulas in the workbook. Returns out-of-range refs, self-references, and other issues. Read-only.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "forecast",
    description:
      "Forecast N future values from a numeric range using least-squares linear regression. Returns predictions, slope, intercept, R². Read-only.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        range: { type: "string", description: "A1-style range, e.g. B2:B12" },
        periods: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["sheet", "range", "periods"],
    },
  },
];

const MUTATING_TOOLS = new Set(["set_cell", "add_sheet", "create_chart"]);

const MAX_GRID_DIM = 1_000_000;
const MAX_FORECAST_PERIODS = 240;
const VALID_CHART_TYPES = new Set(["bar", "line", "area", "pie", "scatter"]);

/**
 * Validate the model's tool_use input before we record it as a plan step
 * or hand it to a server-side helper. The model is generally well-behaved,
 * but a malformed call (non-numeric coords, huge `periods`, etc.) can
 * corrupt client row counts or burn server cycles.
 */
function validateToolInput(
  name: string,
  args: Record<string, unknown>
): { ok: true; step?: PlanStep; forecast?: { sheet: string; range: string; periods: number } } | { ok: false; reason: string } {
  const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 256;
  const isInt = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_GRID_DIM;

  if (name === "set_cell") {
    if (!isStr(args.sheet)) return { ok: false, reason: "sheet must be a non-empty string" };
    if (!isInt(args.row)) return { ok: false, reason: `row must be an integer in [0, ${MAX_GRID_DIM}]` };
    if (!isInt(args.col)) return { ok: false, reason: `col must be an integer in [0, ${MAX_GRID_DIM}]` };
    if (typeof args.raw !== "string") return { ok: false, reason: "raw must be a string" };
    if ((args.raw as string).length > 16_000) return { ok: false, reason: "raw too long (>16k chars)" };
    return {
      ok: true,
      step: { tool: "set_cell", args: { sheet: args.sheet, row: args.row, col: args.col, raw: args.raw } },
    };
  }
  if (name === "add_sheet") {
    if (!isStr(args.name)) return { ok: false, reason: "name must be a non-empty string" };
    return { ok: true, step: { tool: "add_sheet", args: { name: args.name } } };
  }
  if (name === "create_chart") {
    if (!isStr(args.sheet)) return { ok: false, reason: "sheet must be a non-empty string" };
    if (!isStr(args.title)) return { ok: false, reason: "title must be a non-empty string" };
    if (typeof args.type !== "string" || !VALID_CHART_TYPES.has(args.type)) {
      return { ok: false, reason: `type must be one of ${[...VALID_CHART_TYPES].join(", ")}` };
    }
    if (!isStr(args.range)) return { ok: false, reason: "range must be a non-empty A1 string" };
    const chartType = args.type as "bar" | "line" | "area" | "pie" | "scatter";
    return {
      ok: true,
      step: {
        tool: "create_chart",
        args: {
          sheet: args.sheet,
          title: args.title,
          type: chartType,
          range: args.range,
        },
      },
    };
  }
  if (name === "forecast") {
    if (!isStr(args.sheet)) return { ok: false, reason: "sheet must be a non-empty string" };
    if (!isStr(args.range)) return { ok: false, reason: "range must be a non-empty A1 string" };
    if (typeof args.periods !== "number" || !Number.isInteger(args.periods) || args.periods < 1 || args.periods > MAX_FORECAST_PERIODS) {
      return { ok: false, reason: `periods must be an integer in [1, ${MAX_FORECAST_PERIODS}]` };
    }
    return {
      ok: true,
      forecast: { sheet: args.sheet, range: args.range, periods: args.periods },
    };
  }
  if (name === "audit_formulas") {
    // No required arguments — the tool reads the attached workbook.
    return { ok: true };
  }
  return { ok: false, reason: `unknown tool: ${name}` };
}

const AGENT_SYSTEM = [
  "You are AiCell, an agentic spreadsheet assistant. You see a snapshot of the user's workbook.",
  "Plan and execute changes through the provided tools.",
  "",
  "Tool semantics:",
  "- set_cell / add_sheet / create_chart record PENDING edits that the user must approve before they apply. Use them freely; the user sees a plan and can reject any step.",
  "- audit_formulas and forecast execute immediately and return results you can use to inform the plan.",
  "",
  "Style:",
  "- Be concise. After proposing a plan, summarize what you queued in 1-2 sentences.",
  "- Prefer Excel-compatible formulas. Use =SUM, =AVERAGE, =VLOOKUP, etc.",
  "- For 'audit my workbook' type requests, run audit_formulas first, then propose set_cell fixes.",
  "- For forecasting, run forecast with the right range, then write predictions back via set_cell.",
].join("\n");

/**
 * Adapter so tests can drive the agent loop without a real API key.
 * Real impl wraps the Anthropic SDK; tests provide a fake.
 */
export interface AgentLLM {
  step(req: {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
  }): Promise<Anthropic.Message>;
}

export class AnthropicAgentLLM implements AgentLLM {
  constructor(private readonly sdk: Anthropic) {}

  async step(req: {
    system: Anthropic.TextBlockParam[];
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
  }): Promise<Anthropic.Message> {
    return this.sdk.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 8192,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      thinking: { type: "adaptive" },
    });
  }
}

export async function runAgent(
  llm: AgentLLM,
  req: { messages: ChatTurn[]; workbook?: Workbook }
): Promise<AgentResult> {
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: AGENT_SYSTEM, cache_control: { type: "ephemeral" } },
  ];
  if (req.workbook) {
    system.push({
      type: "text",
      text: `Current workbook:\n${renderWorkbookContext(req.workbook)}`,
      cache_control: { type: "ephemeral" },
    });
  }

  const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const plan: PlanStep[] = [];
  let finalReply = "";

  for (let iter = 0; iter < 10; iter++) {
    const response = await llm.step({ system, messages, tools: TOOL_DEFS });
    messages.push({ role: "assistant", content: response.content });

    // Always pull text out — last text block before end_turn becomes the reply
    let turnText = "";
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        turnText += block.text;
      } else if (block.type === "tool_use") {
        const rawArgs = (block.input ?? {}) as Record<string, unknown>;
        const validation = validateToolInput(block.name, rawArgs);
        if (!validation.ok) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Invalid arguments for ${block.name}: ${validation.reason}`,
            is_error: true,
          });
          continue;
        }
        if (MUTATING_TOOLS.has(block.name) && validation.step) {
          plan.push(validation.step);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Recorded as plan step. The user will review and apply.",
          });
        } else if (block.name === "audit_formulas") {
          const issues = req.workbook ? auditFormulas(req.workbook) : [];
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ issues }),
          });
        } else if (block.name === "forecast" && validation.forecast) {
          if (!req.workbook) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "No workbook attached.",
              is_error: true,
            });
          } else {
            const result = forecastFromWorkbook(req.workbook, validation.forecast);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
              is_error: "error" in result,
            });
          }
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
        }
      }
    }

    if (turnText) finalReply = turnText;

    if (response.stop_reason === "end_turn" || toolResults.length === 0) break;
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: finalReply.trim(), plan };
}
