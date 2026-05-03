import {
  FunctionPlugin,
  FunctionArgumentType,
  HyperFormula,
} from "hyperformula";

// HF doesn't export AST/state types from the public entry — treat as opaque.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProcedureAst = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InterpreterState = any;

/** Sentinel returned while an AI request is in flight. */
export const AI_LOADING = "…";

export type CellFn =
  | "AI"
  | "CLASSIFY"
  | "EXTRACT"
  | "SUMMARIZE"
  | "TRANSLATE"
  | "SENTIMENT"
  | "FORMULA";

export type AIRunner = (req: {
  fn: CellFn;
  prompt: string;
  args?: string[];
}) => Promise<string>;

type CacheVal = { state: "ready"; value: string } | { state: "pending" };

/**
 * Module-level cache shared by all engine instances. Keyed by a stable hash
 * of (fn + prompt + args) so identical formulas across cells share one fetch.
 * Provider is set by the host app at startup; tests can override it.
 */
class AIRegistry {
  private cache = new Map<string, CacheVal>();
  private listeners = new Set<() => void>();
  private runner: AIRunner | null = null;

  setRunner(runner: AIRunner | null): void {
    this.runner = runner;
  }

  hasRunner(): boolean {
    return this.runner !== null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  resolve(fn: CellFn, prompt: string, args: string[]): string {
    const key = JSON.stringify([fn, prompt, args]);
    const hit = this.cache.get(key);
    if (hit?.state === "ready") return hit.value;
    if (hit?.state === "pending") return AI_LOADING;
    if (!this.runner) return "#AI_DISABLED";

    this.cache.set(key, { state: "pending" });
    const runner = this.runner;
    runner({ fn, prompt, args })
      .then((value) => {
        this.cache.set(key, { state: "ready", value });
        this.notify();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.cache.set(key, { state: "ready", value: `#AI! ${msg}` });
        this.notify();
      });
    return AI_LOADING;
  }

  /** Useful for tests. */
  clear(): void {
    this.cache.clear();
  }
}

export const aiRegistry = new AIRegistry();

const FN_DEF = (name: CellFn, parameters: number) => ({
  method: name.toLowerCase(),
  parameters: Array.from({ length: parameters }, () => ({
    argumentType: FunctionArgumentType.STRING,
  })),
});

class AIFunctionPlugin extends FunctionPlugin {
  static override implementedFunctions = {
    AI: FN_DEF("AI", 1),
    CLASSIFY: FN_DEF("CLASSIFY", 2),
    EXTRACT: FN_DEF("EXTRACT", 2),
    SUMMARIZE: FN_DEF("SUMMARIZE", 1),
    TRANSLATE: FN_DEF("TRANSLATE", 2),
    SENTIMENT: FN_DEF("SENTIMENT", 1),
    FORMULA: FN_DEF("FORMULA", 1),
  };

  ai(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("AI"), (prompt: string) =>
      aiRegistry.resolve("AI", prompt, [])
    );
  }

  classify(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("CLASSIFY"),
      (prompt: string, labels: string) =>
        aiRegistry.resolve("CLASSIFY", prompt, splitLabels(labels))
    );
  }

  extract(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("EXTRACT"),
      (prompt: string, field: string) =>
        aiRegistry.resolve("EXTRACT", prompt, [field])
    );
  }

  summarize(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SUMMARIZE"),
      (prompt: string) => aiRegistry.resolve("SUMMARIZE", prompt, [])
    );
  }

  translate(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("TRANSLATE"),
      (prompt: string, lang: string) =>
        aiRegistry.resolve("TRANSLATE", prompt, [lang])
    );
  }

  sentiment(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("SENTIMENT"),
      (prompt: string) => aiRegistry.resolve("SENTIMENT", prompt, [])
    );
  }

  formula(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("FORMULA"),
      (prompt: string) => aiRegistry.resolve("FORMULA", prompt, [])
    );
  }
}

function splitLabels(s: string): string[] {
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

const TRANSLATIONS = {
  enGB: {
    AI: "AI",
    CLASSIFY: "CLASSIFY",
    EXTRACT: "EXTRACT",
    SUMMARIZE: "SUMMARIZE",
    TRANSLATE: "TRANSLATE",
    SENTIMENT: "SENTIMENT",
    FORMULA: "FORMULA",
  },
};

let registered = false;
export function ensureAIPluginRegistered(): void {
  if (registered) return;
  HyperFormula.registerFunctionPlugin(AIFunctionPlugin, TRANSLATIONS);
  registered = true;
}
