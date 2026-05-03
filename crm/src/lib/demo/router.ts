// Routes /api/* fetch URLs to localStorage-backed handlers in DEMO_MODE.
// Returns parsed JSON exactly like the real API would.

import type {
  Activity,
  AuditEntry,
  Lead,
  Sequence,
  SequenceStep,
} from "../types";
import { newId, nowIso, readTable, writeTable, resetDemo } from "./store";

interface RouteCtx {
  method: string;
  pathname: string;
  search: URLSearchParams;
  body: Record<string, unknown> | null;
}

export async function demoFetch<T>(
  url: string,
  init?: { method?: string; body?: BodyInit | null },
): Promise<T> {
  const u = new URL(url, "http://demo.local");
  const ctx: RouteCtx = {
    method: (init?.method ?? "GET").toUpperCase(),
    pathname: u.pathname,
    search: u.searchParams,
    body: init?.body ? JSON.parse(String(init.body)) : null,
  };
  // Simulate latency for realism
  await new Promise((r) => setTimeout(r, 60));
  const result = await dispatch(ctx);
  return result as T;
}

async function dispatch(ctx: RouteCtx): Promise<unknown> {
  const { method, pathname, search, body } = ctx;

  // setup
  if (pathname === "/api/setup") {
    return {
      spreadsheetId: "demo-spreadsheet-id",
      driveFolderId: "demo-drive-folder-id",
    };
  }
  if (pathname === "/api/owner-credentials") {
    return {
      LEOCRM_OWNER_EMAIL: "demo@yourco.example",
      LEOCRM_SPREADSHEET_ID: "demo-spreadsheet-id",
      LEOCRM_DRIVE_FOLDER_ID: "demo-drive-folder-id",
      LEOCRM_OWNER_REFRESH_TOKEN: "(demo-mode — not applicable)",
      configured: false,
    };
  }

  // contacts
  if (pathname === "/api/contacts") return crud("contacts", "c", ctx);
  const cm = pathname.match(/^\/api\/contacts\/([^/]+)$/);
  if (cm) return crudOne("contacts", cm[1], ctx);
  if (pathname === "/api/contacts/bulk") return contactsBulk(body);

  // leads
  if (pathname === "/api/leads") return crud("leads", "l", ctx);
  const lm = pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (lm) return crudOne("leads", lm[1], ctx);

  // campaigns
  if (pathname === "/api/campaigns") return crud("campaigns", "cmp", ctx);

  // templates
  if (pathname === "/api/templates") return crud("templates", "tpl", ctx);

  // emails
  if (pathname === "/api/emails") return readTable("emails");
  if (pathname === "/api/email/send") return sendEmail(body);
  if (pathname === "/api/email/sync") return syncReplies();

  // ai
  if (pathname === "/api/ai/generate") return aiGenerate(body);
  if (pathname === "/api/ai/score") return aiScore(body);

  // tasks
  if (pathname === "/api/tasks") return crud("tasks", "t", ctx);
  const tm = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (tm) return crudOne("tasks", tm[1], ctx);

  // activity
  if (pathname === "/api/activity") {
    const cid = search.get("contactId");
    const all = readTable<Activity>("activity");
    const filtered = cid ? all.filter((a) => a.contactId === cid) : all;
    return filtered
      .slice()
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  if (pathname === "/api/activity/log") return activityLog(body);

  // companies
  if (pathname === "/api/companies") return companiesList(method, body);

  // views
  if (pathname === "/api/views") return viewsRoute(ctx);

  // sequences
  if (pathname === "/api/sequences") return sequencesList(method, body);
  if (pathname === "/api/sequences/enroll") return sequencesEnroll(body);
  if (pathname === "/api/sequences/run") return sequencesRun();
  if (pathname === "/api/enrollments") return readTable("enrollments");

  // pipelines
  if (pathname === "/api/pipelines") return crud("pipelines", "pl", ctx);
  const plm = pathname.match(/^\/api\/pipelines\/([^/]+)$/);
  if (plm) return crudOne("pipelines", plm[1], ctx);

  // deals
  if (pathname === "/api/deals") return crud("deals", "d", ctx);
  const dm = pathname.match(/^\/api\/deals\/([^/]+)$/);
  if (dm) return crudOne("deals", dm[1], ctx);

  // email events (open / click)
  if (pathname === "/api/email-events") return crud("emailEvents", "ee", ctx);

  // scheduled emails
  if (pathname === "/api/scheduled") return crud("scheduled", "se", ctx);
  const sm = pathname.match(/^\/api\/scheduled\/([^/]+)$/);
  if (sm) return crudOne("scheduled", sm[1], ctx);

  // suppression list
  if (pathname === "/api/suppression") {
    if (method === "GET") return readTable("suppression");
    if (method === "POST") return crud("suppression", "sp", ctx);
    if (method === "DELETE") {
      const id = search.get("id") ?? "";
      const rows = readTable<Record<string, string>>("suppression");
      writeTable(
        "suppression",
        rows.filter((r) => r.id !== id),
      );
      return { deleted: true };
    }
  }

  // snippets
  if (pathname === "/api/snippets") return crud("snippets", "sn", ctx);

  // automations / webhooks / tokens / meetings
  if (pathname === "/api/automations") return crud("automations", "au", ctx);
  if (pathname === "/api/webhooks") return crud("webhooks", "wh", ctx);
  if (pathname === "/api/tokens") {
    if (method === "GET") return readTable("tokens");
    if (method === "POST") {
      const rows = readTable<Record<string, string>>("tokens");
      const tok = {
        id: newId("tok"),
        name: String(body?.name ?? "Token"),
        memberId: String(body?.memberId ?? ""),
        token: `leo_pk_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`,
        createdAt: nowIso(),
        lastUsedAt: "",
      };
      rows.push(tok);
      writeTable("tokens", rows);
      return tok;
    }
  }
  if (pathname === "/api/meetings") return crud("meetings", "mt", ctx);
  if (pathname === "/api/tags") return crud("tags", "tg", ctx);

  // AI research / talking points / ask
  if (pathname === "/api/ai/research") {
    const company = String(body?.company ?? "the company");
    return {
      brief: `# ${company}\n\n**One-liner**: ${company} is operating in their market with steady growth.\n\n**Why now**:\n- Hiring signals suggest revenue-team scaling\n- Recent press / launch hints at a fresh outbound need\n- ICP fit on team size and tooling stack\n\n**Key personas**:\n- VP Sales / Head of Sales Ops\n- RevOps Manager (likely champion)\n\n**Conversation starters**:\n- Reference the recent expansion or hiring\n- Lead with a peer customer outcome\n- Offer a concise compare doc, not a demo\n\n(Generated locally in demo mode.)`,
    };
  }
  if (pathname === "/api/ai/talking-points") {
    return {
      points: [
        "Open with a quick recap of the last touchpoint.",
        "Lead with a peer customer outcome (~30s).",
        "Ask: what does success look like 6 months from now?",
        "Probe budget timing without naming a number first.",
        "Land on one concrete next step (demo, trial, or intro).",
      ],
    };
  }
  if (pathname === "/api/ai/ask") {
    const q = String(body?.question ?? "").toLowerCase();
    let answer = `I parsed: "${body?.question}". In demo mode I return a templated response.`;
    if (/stalled|stale|stuck/.test(q))
      answer = `Stalled deals are on Reports → "Stale-deal SLA alerts" (non-terminal stage 14+ days).`;
    else if (/who|prioritize|next/.test(q))
      answer = `Dashboard "Suggested next contact" already ranks your top untouched lead.`;
    else if (/reply rate|conversion/.test(q))
      answer = `Reports → AI vs non-AI panel and the top-row stats break this down.`;
    else if (/forecast|pipeline/.test(q))
      answer = `Reports → "Forecast by month" + Deals page totals show open + weighted pipeline.`;
    else if (/goal|target/.test(q))
      answer = `Dashboard → "Weekly send goal" tracks progress vs 25 sends/wk.`;
    return { answer };
  }

  // AI subject test (5 variants)
  if (pathname === "/api/ai/subject-test") {
    const c = (body?.contact ?? {}) as { name?: string; company?: string };
    const company = c.company || "your team";
    const first = (c.name || "there").split(" ")[0];
    return {
      variants: [
        `Quick idea for ${company}`,
        `${first}, 15 minutes on ${company}'s outbound?`,
        `${company} + 30% more pipeline?`,
        `One question about ${company}`,
        `${first} — worth a look?`,
      ],
    };
  }

  // members
  if (pathname === "/api/members") return crud("members", "m", ctx);
  const mm = pathname.match(/^\/api\/members\/([^/]+)$/);
  if (mm) return crudOne("members", mm[1], ctx);

  // audit log
  if (pathname === "/api/audit") {
    const rows = readTable<AuditEntry>("audit");
    const entity = search.get("entity");
    const entityId = search.get("entityId");
    let out = rows;
    if (entity) out = out.filter((r) => r.entity === entity);
    if (entityId) out = out.filter((r) => r.entityId === entityId);
    return out
      .slice()
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  const seqMatch = pathname.match(/^\/api\/sequences\/([^/]+)$/);
  if (seqMatch) {
    const seqs = readTable<Sequence>("sequences");
    const idx = seqs.findIndex((s) => s.id === seqMatch[1]);
    if (method === "PATCH" && idx !== -1) {
      seqs[idx] = { ...seqs[idx], ...(body ?? {}) } as Sequence;
      writeTable("sequences", seqs);
      return seqs[idx];
    }
    if (method === "DELETE") {
      writeTable(
        "sequences",
        seqs.filter((s) => s.id !== seqMatch[1]),
      );
      return { deleted: true };
    }
  }

  // forms
  if (pathname === "/api/forms") return crud("forms", "f", ctx);
  if (pathname === "/api/forms/public") return formsPublic(search);
  if (pathname === "/api/forms/submit") return formsSubmit(body);

  // demo-only utility
  if (pathname === "/api/demo/reset") {
    resetDemo();
    return { ok: true };
  }

  throw new Error(`Demo backend: unknown route ${method} ${pathname}`);
}

// ----- generic CRUD helpers ------------------------------------------------

function crud(table: string, idPrefix: string, ctx: RouteCtx) {
  const { method, body } = ctx;
  if (method === "GET") return readTable(table as never);
  if (method === "POST") {
    const rows = readTable<Record<string, unknown> & { id: string }>(
      table as never,
    );
    const row = {
      id: newId(idPrefix),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...(body ?? {}),
    };
    rows.push(row as never);
    writeTable(table as never, rows);
    return row;
  }
  throw new Error(`Method ${method} not supported on ${table}`);
}

function crudOne(table: string, id: string, ctx: RouteCtx) {
  const { method, body } = ctx;
  const rows = readTable<Record<string, unknown> & { id: string }>(
    table as never,
  );
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1 && method !== "DELETE") {
    throw new Error("not found");
  }
  if (method === "GET") return rows[idx];
  if (method === "PATCH") {
    const merged = { ...rows[idx], ...(body ?? {}), updatedAt: nowIso() };
    rows[idx] = merged;
    writeTable(table as never, rows);
    return merged;
  }
  if (method === "DELETE") {
    if (idx !== -1) {
      rows.splice(idx, 1);
      writeTable(table as never, rows);
    }
    return { deleted: true };
  }
  throw new Error(`Method ${method} not supported`);
}

// ----- specific handlers ---------------------------------------------------

function contactsBulk(body: Record<string, unknown> | null) {
  const list = ((body?.contacts as Array<Record<string, string>>) ??
    []) as Array<Record<string, string>>;
  const rows = readTable<Record<string, string>>("contacts");
  const have = new Set(rows.map((c) => (c.email || "").toLowerCase()));
  const created: Record<string, string>[] = [];
  for (const c of list) {
    if (!c.email || have.has(c.email.toLowerCase())) continue;
    have.add(c.email.toLowerCase());
    const row = {
      id: newId("c"),
      name: c.name ?? "",
      email: c.email,
      company: c.company ?? "",
      role: c.role ?? "",
      phone: c.phone ?? "",
      linkedin: c.linkedin ?? "",
      tags: c.tags ?? "",
      notes: c.notes ?? "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    rows.push(row);
    created.push(row);
  }
  writeTable("contacts", rows);
  if (body?.createLeads !== false) {
    const leads = readTable<Record<string, string>>("leads");
    for (const c of created) {
      leads.push({
        id: newId("l"),
        contactId: c.id,
        source: String(body?.source ?? "csv-import"),
        stage: "new",
        score: "0",
        scoreReason: "",
        value: "0",
        owner: "demo@yourco.example",
        lastContactedAt: "",
        nextActionAt: "",
        nextAction: "",
        notes: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    writeTable("leads", leads);
  }
  return {
    created: created.length,
    skipped: list.length - created.length,
    contacts: created,
  };
}

function sendEmail(body: Record<string, unknown> | null) {
  const emails = readTable<Record<string, string>>("emails");
  const rec = {
    id: newId("e"),
    contactId: String(body?.contactId ?? ""),
    campaignId: String(body?.campaignId ?? ""),
    sequenceEnrollmentId: String(body?.sequenceEnrollmentId ?? ""),
    stepIndex: String(body?.stepIndex ?? ""),
    variant: String(body?.variant ?? ""),
    subject: String(body?.subject ?? ""),
    body: String(body?.body ?? ""),
    sentAt: nowIso(),
    status: "sent",
    aiGenerated: body?.aiGenerated ? "yes" : "no",
    prompt: String(body?.prompt ?? ""),
    threadId: `thr_${newId("d")}`,
    repliedAt: "",
  };
  emails.push(rec);
  writeTable("emails", emails);

  if (rec.contactId) {
    const leads = readTable<Lead>("leads");
    const lead = leads.find((l) => l.contactId === rec.contactId);
    if (lead && lead.stage === "new") {
      lead.stage = "contacted";
      lead.lastContactedAt = nowIso();
      writeTable("leads", leads);
    } else if (lead) {
      lead.lastContactedAt = nowIso();
      writeTable("leads", leads);
    }
    pushActivity({
      contactId: rec.contactId,
      type: "email_sent",
      summary: `Sent: ${rec.subject}`,
    });
  }
  return rec;
}

function syncReplies() {
  // In demo mode, randomly mark one un-replied email as replied for drama.
  const emails = readTable<Record<string, string>>("emails");
  const candidates = emails.filter((e) => !e.repliedAt && e.status === "sent");
  if (candidates.length === 0) return { scanned: 0, replies: 0 };
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  pick.repliedAt = nowIso();
  writeTable("emails", emails);
  if (pick.contactId) {
    const leads = readTable<Lead>("leads");
    const lead = leads.find((l) => l.contactId === pick.contactId);
    if (lead && lead.stage !== "won" && lead.stage !== "lost") {
      const prev = lead.stage;
      lead.stage =
        lead.stage === "qualified" ? "qualified" : ("engaged" as Lead["stage"]);
      writeTable("leads", leads);
      pushActivity({
        contactId: pick.contactId,
        type: "stage_change",
        summary: `Stage: ${prev} → ${lead.stage} (reply detected)`,
      });
    }
    pushActivity({
      contactId: pick.contactId,
      type: "email_replied",
      summary: `Reply received: ${pick.subject}`,
    });
  }
  return { scanned: candidates.length, replies: 1 };
}

function aiGenerate(body: Record<string, unknown> | null) {
  const c = (body?.contact ?? {}) as Record<string, string>;
  const goal = String(body?.goal ?? "");
  const first = (c.name || "there").split(" ")[0];
  const company = c.company || "your team";
  const role = c.role || "your team";
  const subject = `Quick idea for ${company}`;
  const subjectB = `${first}, 15 minutes on ${company}'s outbound?`;
  const bodyText =
    `Hi ${first},\n\n` +
    `Noticed ${company} is scaling — usually a sign ${role} is rethinking outbound. ` +
    `${goal}\n\n` +
    `Worth a 15-minute look next week?\n\n— You\n\n` +
    `(Demo mode: this email was generated by a local stub, not Claude.)`;
  return body?.abTest ? { subject, subjectB, body: bodyText } : { subject, body: bodyText };
}

function aiScore(body: Record<string, unknown> | null) {
  const targetIds: string[] = body?.all
    ? readTable<{ id: string }>("contacts").map((c) => c.id)
    : body?.contactId
      ? [String(body.contactId)]
      : [];
  const contacts = readTable<Record<string, string>>("contacts");
  const leads = readTable<Lead>("leads");
  const results: Array<{ contactId: string; score: number; reason: string }> = [];
  for (const id of targetIds) {
    const c = contacts.find((c) => c.id === id);
    if (!c) continue;
    let score = 35 + Math.floor(Math.random() * 20);
    const reasons: string[] = [];
    if (c.company) {
      score += 10;
      reasons.push("company present");
    }
    if (/(VP|Director|Head|Chief|CEO|CTO|Founder)/i.test(c.role || "")) {
      score += 20;
      reasons.push("decision-maker title");
    }
    if ((c.tags || "").toLowerCase().includes("icp")) {
      score += 15;
      reasons.push("ICP-tagged");
    }
    score = Math.min(100, score);
    const reason = reasons.length
      ? reasons.join(", ")
      : "limited data on profile";
    const lead = leads.find((l) => l.contactId === id);
    if (lead) {
      lead.score = score;
      lead.scoreReason = reason;
    }
    pushActivity({
      contactId: id,
      type: "score_updated",
      summary: `AI score: ${score} — ${reason}`,
    });
    results.push({ contactId: id, score, reason });
  }
  writeTable("leads", leads);
  return { updated: results.length, results };
}

function activityLog(body: Record<string, unknown> | null) {
  const row = pushActivity({
    contactId: String(body?.contactId ?? ""),
    type: String(body?.type ?? "note") as Activity["type"],
    summary: String(body?.summary ?? ""),
    meta: body?.meta as Record<string, unknown> | undefined,
  });
  return row;
}

function pushActivity(input: {
  contactId: string;
  type: Activity["type"];
  summary: string;
  meta?: Record<string, unknown>;
}) {
  const rows = readTable<Activity>("activity");
  const row: Activity = {
    id: newId("a"),
    contactId: input.contactId,
    type: input.type,
    summary: input.summary,
    meta: input.meta ? JSON.stringify(input.meta) : "",
    createdAt: nowIso(),
    actor: "demo@yourco.example",
  };
  rows.push(row);
  writeTable("activity", rows);
  return row;
}

function companiesList(
  method: string,
  body: Record<string, unknown> | null,
) {
  if (method === "GET") {
    const companies = readTable<Record<string, string>>("companies");
    const contacts = readTable<Record<string, string>>("contacts");
    const byName = new Map<string, Record<string, string | number>>();
    for (const c of companies) {
      if (!c.name) continue;
      byName.set(c.name.toLowerCase(), { ...c, contactCount: 0 });
    }
    for (const ct of contacts) {
      if (!ct.company) continue;
      const k = ct.company.toLowerCase();
      const existing = byName.get(k);
      if (existing) {
        existing.contactCount = Number(existing.contactCount || 0) + 1;
      } else {
        byName.set(k, {
          id: "",
          name: ct.company,
          domain: (ct.email.match(/@(.+)$/) || ["", ""])[1] ?? "",
          industry: "",
          size: "",
          website: "",
          notes: "",
          createdAt: "",
          updatedAt: "",
          contactCount: 1,
        });
      }
    }
    return Array.from(byName.values()).sort(
      (a, b) => Number(b.contactCount) - Number(a.contactCount),
    );
  }
  if (method === "POST") {
    return crud("companies", "co", {
      method,
      pathname: "",
      search: new URLSearchParams(),
      body,
    });
  }
}

function viewsRoute(ctx: RouteCtx) {
  if (ctx.method === "GET") return readTable("views");
  if (ctx.method === "POST") {
    const rows = readTable<Record<string, string>>("views");
    const row = {
      id: newId("v"),
      name: String(ctx.body?.name ?? ""),
      filter: JSON.stringify(ctx.body?.filter ?? {}),
      createdAt: nowIso(),
    };
    rows.push(row);
    writeTable("views", rows);
    return row;
  }
  if (ctx.method === "DELETE") {
    const id = ctx.search.get("id") ?? "";
    const rows = readTable<Record<string, string>>("views");
    writeTable(
      "views",
      rows.filter((r) => r.id !== id),
    );
    return { deleted: true };
  }
}

function sequencesList(method: string, body: Record<string, unknown> | null) {
  if (method === "GET") {
    const seqs = readTable<Sequence>("sequences");
    const steps = readTable<SequenceStep>("sequenceSteps");
    return seqs.map((s) => ({
      ...s,
      steps: steps
        .filter((st) => st.sequenceId === s.id)
        .sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex)),
    }));
  }
  if (method === "POST") {
    const id = newId("seq");
    const seq: Sequence = {
      id,
      name: String(body?.name ?? "Untitled"),
      goal: String(body?.goal ?? ""),
      tone: String(body?.tone ?? "warm, direct, professional"),
      status: "active",
      createdAt: nowIso(),
    };
    const seqs = readTable<Sequence>("sequences");
    seqs.push(seq);
    writeTable("sequences", seqs);

    const stepDefs = (body?.steps ?? []) as Array<Record<string, unknown>>;
    const steps = readTable<SequenceStep>("sequenceSteps");
    stepDefs.forEach((s, i) => {
      steps.push({
        id: newId("step"),
        sequenceId: id,
        stepIndex: String(i),
        delayDays: String(s.delayDays ?? (i === 0 ? 0 : 3)),
        subjectHint: String(s.subjectHint ?? ""),
        instructions: String(s.instructions ?? body?.goal ?? ""),
        type: (s.type as SequenceStep["type"]) ?? "email",
        variantB: String(s.variantB ?? ""),
        conditions: String(s.conditions ?? ""),
        createdAt: nowIso(),
      });
    });
    writeTable("sequenceSteps", steps);
    return { id };
  }
}

function sequencesEnroll(body: Record<string, unknown> | null) {
  const sequenceId = String(body?.sequenceId ?? "");
  const contactIds = (body?.contactIds ?? []) as string[];
  const enrollments = readTable<Record<string, string>>("enrollments");
  const steps = readTable<SequenceStep>("sequenceSteps");
  const seqSteps = steps
    .filter((s) => s.sequenceId === sequenceId)
    .sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex));
  if (seqSteps.length === 0) return { enrolled: 0 };
  const firstDelay = Number(seqSteps[0].delayDays || 0);
  let added = 0;
  for (const cid of contactIds) {
    const dup = enrollments.find(
      (e) =>
        e.sequenceId === sequenceId &&
        e.contactId === cid &&
        e.status === "active",
    );
    if (dup) continue;
    enrollments.push({
      id: newId("en"),
      sequenceId,
      contactId: cid,
      status: "active",
      currentStep: "0",
      nextRunAt: new Date(
        Date.now() + firstDelay * 24 * 3600 * 1000,
      ).toISOString(),
      lastRunAt: "",
      createdAt: nowIso(),
      stoppedReason: "",
    });
    pushActivity({
      contactId: cid,
      type: "sequence_enrolled",
      summary: "Enrolled in sequence",
    });
    added++;
  }
  writeTable("enrollments", enrollments);
  return { enrolled: added };
}

function sequencesRun() {
  const enrollments = readTable<Record<string, string>>("enrollments");
  const due = enrollments.filter(
    (e) =>
      e.status === "active" &&
      e.nextRunAt &&
      new Date(e.nextRunAt).getTime() <= Date.now(),
  );
  let processed = 0;
  for (const en of due) {
    en.lastRunAt = nowIso();
    en.currentStep = String(Number(en.currentStep || 0) + 1);
    en.nextRunAt = new Date(
      Date.now() + 3 * 24 * 3600 * 1000,
    ).toISOString();
    pushActivity({
      contactId: en.contactId,
      type: "email_sent",
      summary: `Sequence step ${en.currentStep} sent (demo stub)`,
    });
    processed++;
  }
  writeTable("enrollments", enrollments);
  return { due: due.length, processed, failed: 0 };
}

function formsPublic(search: URLSearchParams) {
  const slug = search.get("slug");
  const forms = readTable<Record<string, string>>("forms");
  const f = forms.find((f) => f.slug === slug);
  if (!f) throw new Error("not found");
  let fields: string[];
  try {
    fields = JSON.parse(f.fields) as string[];
  } catch {
    fields = ["name", "email"];
  }
  return {
    name: f.name,
    slug: f.slug,
    fields,
    redirectUrl: f.redirectUrl,
  };
}

function formsSubmit(body: Record<string, unknown> | null) {
  const slug = String(body?.slug ?? "");
  const values = (body?.values ?? {}) as Record<string, string>;
  if (!values.email) throw new Error("email required");
  const forms = readTable<Record<string, string>>("forms");
  const form = forms.find((f) => f.slug === slug);
  if (!form) throw new Error("form not found");

  // Round-robin: assign to next active rep.
  const members = readTable<Record<string, string>>("members").filter(
    (m) => m.active === "yes" && m.role !== "viewer",
  );
  const owner =
    members.length > 0
      ? members[Math.floor(Date.now() / 1000) % members.length].email
      : "you@yourco.example";

  const contacts = readTable<Record<string, string>>("contacts");
  const contact = {
    id: newId("c"),
    name: values.name ?? "",
    email: values.email,
    company: values.company ?? "",
    role: values.role ?? "",
    phone: values.phone ?? "",
    linkedin: values.linkedin ?? "",
    tags: form.tags || "form",
    notes: values.notes ?? "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  contacts.push(contact);
  writeTable("contacts", contacts);
  const leads = readTable<Record<string, string>>("leads");
  leads.push({
    id: newId("l"),
    contactId: contact.id,
    source: `form:${form.slug}`,
    stage: "new",
    score: "0",
    scoreReason: "",
    value: "0",
    owner,
    lastContactedAt: "",
    nextActionAt: "",
    nextAction: "",
    notes: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  writeTable("leads", leads);
  pushActivity({
    contactId: contact.id,
    type: "form_submission",
    summary: `Form: ${form.name}`,
  });
  if (form.sequenceId) {
    sequencesEnroll({
      sequenceId: form.sequenceId,
      contactIds: [contact.id],
    });
  }
  return { ok: true, redirectUrl: form.redirectUrl || null };
}
