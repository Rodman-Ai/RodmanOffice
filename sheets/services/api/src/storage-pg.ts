import pg from "pg";
import type { Workbook } from "@aicell/shared";
import type { WorkbookStore } from "./storage";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workbooks (
  id text PRIMARY KEY,
  name text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workbooks_updated_at_idx
  ON workbooks (updated_at DESC);
`;

export class PostgresStore implements WorkbookStore {
  constructor(private readonly pool: pg.Pool) {}

  private safeId(id: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new Error(`Invalid workbook id: ${id}`);
    }
    return id;
  }

  async list(): Promise<Array<{ id: string; name: string; updatedAt: number }>> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      updated_at: Date;
    }>(
      "SELECT id, name, updated_at FROM workbooks ORDER BY updated_at DESC LIMIT 200"
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updated_at.getTime(),
    }));
  }

  async get(id: string): Promise<Workbook | null> {
    const safeId = this.safeId(id);
    const { rows } = await this.pool.query<{ data: Workbook }>(
      "SELECT data FROM workbooks WHERE id = $1",
      [safeId]
    );
    return rows[0]?.data ?? null;
  }

  async save(workbook: Workbook): Promise<{ updatedAt: number }> {
    const safeId = this.safeId(workbook.id);
    const now = new Date();
    await this.pool.query(
      `INSERT INTO workbooks (id, name, data, updated_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at`,
      [safeId, workbook.name, JSON.stringify(workbook), now]
    );
    return { updatedAt: now.getTime() };
  }
}

export async function createPostgresStore(
  databaseUrl: string
): Promise<PostgresStore> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(SCHEMA);
  return new PostgresStore(pool);
}
