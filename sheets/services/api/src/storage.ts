import { mkdir, readdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Workbook } from "@aicell/shared";

/**
 * Persistence interface — Phase 0 ships FileStore.
 * Phase 1 adds PostgresStore behind the same interface.
 */
export interface WorkbookStore {
  list(): Promise<Array<{ id: string; name: string; updatedAt: number }>>;
  get(id: string): Promise<Workbook | null>;
  save(workbook: Workbook): Promise<{ updatedAt: number }>;
}

type FileMeta = { name: string; updatedAt: number };

/**
 * One JSON file per workbook on disk: `<dir>/<id>.json`.
 * Atomic write via tmp file + rename.
 */
export class FileStore implements WorkbookStore {
  constructor(private readonly dir: string) {}

  private path(id: string): string {
    return join(this.dir, `${this.safeId(id)}.json`);
  }

  private safeId(id: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new Error(`Invalid workbook id: ${id}`);
    }
    return id;
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true });
    }
  }

  async list(): Promise<Array<{ id: string; name: string; updatedAt: number }>> {
    await this.ensureDir();
    const entries = await readdir(this.dir);
    const out: Array<{ id: string; name: string; updatedAt: number }> = [];
    for (const f of entries) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      try {
        const wb = await this.get(id);
        if (wb) out.push({ id: wb.id, name: wb.name, updatedAt: (wb as Workbook & FileMeta).updatedAt ?? 0 });
      } catch {
        // skip corrupt files
      }
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  async get(id: string): Promise<Workbook | null> {
    await this.ensureDir();
    const p = this.path(id);
    if (!existsSync(p)) return null;
    const text = await readFile(p, "utf8");
    return JSON.parse(text) as Workbook;
  }

  async save(workbook: Workbook): Promise<{ updatedAt: number }> {
    await this.ensureDir();
    const p = this.path(workbook.id);
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
    const updatedAt = Date.now();
    const payload = JSON.stringify({ ...workbook, updatedAt });
    await writeFile(tmp, payload, "utf8");
    await rename(tmp, p);
    return { updatedAt };
  }
}
