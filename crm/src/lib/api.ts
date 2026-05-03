import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { googleClients } from "./google/client";
import { ensureWorkspace, type WorkspaceIds } from "./google/setup";

export interface AuthedContext {
  email: string;
  name: string;
  accessToken: string;
  clients: ReturnType<typeof googleClients>;
  workspace: WorkspaceIds;
}

export async function withAuth(): Promise<
  { ctx: AuthedContext } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session?.accessToken || !session.user?.email) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.error === "RefreshAccessTokenError") {
    return {
      error: NextResponse.json(
        { error: "google_token_expired" },
        { status: 401 },
      ),
    };
  }
  const clients = googleClients(session.accessToken);
  const workspace = await ensureWorkspace(clients);
  return {
    ctx: {
      email: session.user.email,
      name: session.user.name ?? session.user.email,
      accessToken: session.accessToken,
      clients,
      workspace,
    },
  };
}

export function ok<T>(data: T) {
  return NextResponse.json(data);
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function newId(prefix: string) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export function nowIso() {
  return new Date().toISOString();
}
