import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { googleClients } from "@/lib/google/client";
import { ensureWorkspace } from "@/lib/google/setup";

export async function POST() {
  const session = await getSession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const clients = googleClients(session.accessToken);
  const ws = await ensureWorkspace(clients);
  return NextResponse.json(ws);
}
