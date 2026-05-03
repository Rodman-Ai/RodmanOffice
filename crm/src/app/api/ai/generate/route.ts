import { NextRequest } from "next/server";
import { withAuth, ok, bad } from "@/lib/api";
import { generateEmail } from "@/lib/ai/email";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as {
    contact?: {
      name: string;
      email: string;
      company?: string;
      role?: string;
      notes?: string;
      tags?: string;
    };
    goal?: string;
    tone?: string;
    context?: string;
    senderCompany?: string;
    abTest?: boolean;
  };
  if (!body.contact?.email || !body.goal) {
    return bad("contact.email and goal are required");
  }
  try {
    const email = await generateEmail({
      contact: body.contact,
      goal: body.goal,
      tone: body.tone,
      context: body.context,
      senderName: r.ctx.name,
      senderCompany: body.senderCompany,
      subjectVariants: body.abTest ? 2 : 1,
    });
    return ok(email);
  } catch (err) {
    return bad((err as Error).message, 500);
  }
}
