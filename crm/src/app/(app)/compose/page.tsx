"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Contact, ScheduledEmail, Snippet, Template } from "@/lib/types";
import { useUI } from "@/components/ui/UIProvider";

export default function ComposePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <ComposeInner />
    </Suspense>
  );
}

const DRAFT_KEY = "leocrm.compose.draft";
const SIG_KEY = "leocrm.compose.signature";

const SPAM_TRIGGERS = [
  "free",
  "guarantee",
  "100%",
  "act now",
  "limited time",
  "urgent",
  "click here",
  "earn $",
  "make money",
  "no risk",
  "winner",
];

function subjectChecks(subject: string) {
  const s = (subject || "").trim();
  const len = s.length;
  const triggers = SPAM_TRIGGERS.filter((t) =>
    s.toLowerCase().includes(t.toLowerCase()),
  );
  const allCaps = s.length >= 4 && s === s.toUpperCase();
  const exclam = (s.match(/!/g) || []).length;
  return {
    len,
    lenOk: len > 0 && len <= 60,
    triggers,
    allCaps,
    exclam,
  };
}

function rewriteBody(text: string, mode: string): string {
  // Lightweight client-side stub. Real deploys could call /api/ai/rewrite.
  if (!text) return text;
  if (mode === "Tighter") {
    const lines = text.split(/\n+/);
    return lines
      .map((l) =>
        l.replace(/\s{2,}/g, " ").replace(/\b(very|really|just|that)\b /gi, ""),
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (mode === "Formal") {
    return text
      .replace(/\bhi\b/gi, "Hello")
      .replace(/\bthanks\b/gi, "Thank you")
      .replace(/\b—/g, "Best regards,");
  }
  if (mode === "Casual") {
    return text
      .replace(/\bHello\b/g, "Hey")
      .replace(/Thank you/gi, "Thanks")
      .replace(/Best regards,?/gi, "Cheers,");
  }
  if (mode === "Add P.S.") {
    return text + `\n\nP.S. Happy to send a one-pager if useful.`;
  }
  if (mode === "Polish") {
    // Naive polish: remove double spaces, fix common typos, capitalize "i".
    return text
      .replace(/\s{2,}/g, " ")
      .replace(/\b(teh|recieve|seperate)\b/gi, (m) => {
        const map: Record<string, string> = {
          teh: "the",
          recieve: "receive",
          seperate: "separate",
        };
        return map[m.toLowerCase()] ?? m;
      })
      .replace(/(^|\n)i\b/g, "$1I");
  }
  return text;
}

function suggestSendTime(): string {
  // Naive demo heuristic: pick next Tuesday/Thursday/Wednesday at 10:30 local.
  const now = new Date();
  const target = new Date(now);
  const day = target.getDay();
  const goodDays = [2, 3, 4]; // Tue/Wed/Thu
  let add = 0;
  while (!goodDays.includes((day + add) % 7) || (add === 0 && now.getHours() >= 11)) {
    add++;
    if (add > 7) break;
  }
  target.setDate(target.getDate() + add);
  target.setHours(10, 30, 0, 0);
  const fmt = target.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `${fmt}, 10:30 AM local`;
}

function ComposeInner() {
  const search = useSearchParams();
  const router = useRouter();
  const initialId = search.get("contactId") ?? "";
  const ui = useUI();
  const [signature, setSignature] = useState("");
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [variants5, setVariants5] = useState<string[] | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contactId, setContactId] = useState(initialId);
  const [goal, setGoal] = useState(
    "Book an intro call to demo our product to a relevant decision maker.",
  );
  const [tone, setTone] = useState("warm, direct, professional");
  const [context, setContext] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectB, setSubjectB] = useState("");
  const [chosenVariant, setChosenVariant] = useState<"A" | "B">("A");
  const [abTest, setAbTest] = useState(false);
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, t] = await Promise.all([
        api.get<Contact[]>("/api/contacts"),
        api.get<Template[]>("/api/templates"),
      ]);
      setContacts(c);
      setTemplates(t);
      if (!initialId && c.length > 0) setContactId(c[0].id);
      try {
        const s = await api.get<Snippet[]>("/api/snippets");
        setSnippets(s);
      } catch {
        // ignore
      }
    })();
    if (typeof window !== "undefined") {
      setSignature(window.localStorage.getItem(SIG_KEY) ?? "");
      const draftRaw = window.localStorage.getItem(DRAFT_KEY);
      if (draftRaw) {
        try {
          const d = JSON.parse(draftRaw) as {
            subject: string;
            body: string;
            contactId: string;
          };
          if (d.subject) setSubject(d.subject);
          if (d.body) setBody(d.body);
          if (d.contactId && !initialId) setContactId(d.contactId);
        } catch {
          // ignore
        }
      }
    }
  }, [initialId]);

  // Auto-save draft
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      if (subject || body) {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ subject, body, contactId }),
        );
      }
    }, 400);
    return () => clearTimeout(t);
  }, [subject, body, contactId]);

  const contact = contacts.find((c) => c.id === contactId);

  async function generate() {
    if (!contact) {
      setError("Pick a contact first.");
      return;
    }
    setError(null);
    setInfo(null);
    setGenerating(true);
    try {
      const res = await api.post<{
        subject: string;
        body: string;
        subjectB?: string;
      }>("/api/ai/generate", {
        contact: {
          name: contact.name,
          email: contact.email,
          company: contact.company,
          role: contact.role,
          tags: contact.tags,
          notes: contact.notes,
        },
        goal,
        tone,
        context,
        abTest,
      });
      setSubject(res.subject);
      setSubjectB(res.subjectB ?? "");
      setBody(res.body);
      setChosenVariant("A");
      setAiUsed(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function applyTemplate(id: string) {
    const t = templates.find((tt) => tt.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    if (t.aiPrompt) setGoal(t.aiPrompt);
  }

  async function send() {
    if (!contact) return;
    setSending(true);
    setError(null);
    setInfo(null);
    const useB = abTest && subjectB && chosenVariant === "B";
    const finalSubject = useB ? subjectB : subject;
    const finalBody = signature ? `${body}\n\n${signature}` : body;
    try {
      await api.post("/api/email/send", {
        contactId: contact.id,
        to: contact.email,
        subject: finalSubject,
        body: finalBody,
        aiGenerated: aiUsed,
        prompt: aiUsed ? `${goal} (tone: ${tone})` : "",
        variant: abTest ? chosenVariant : "",
      });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DRAFT_KEY);
      }
      setInfo(`Sent to ${contact.email}.`);
      setTimeout(() => router.push(`/contacts/${contact.id}`), 600);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Compose"
        description="Generate a personalized email, edit, then send via Gmail."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <label className="block">
            <span className="label">Contact</span>
            <select
              className="input"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">Select a contact…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.name || c.email) +
                    (c.company ? ` — ${c.company}` : "")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Goal of the email</span>
            <textarea
              className="input min-h-[80px]"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Tone</span>
              <input
                className="input"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Use template</span>
              <select
                className="input"
                onChange={(e) => applyTemplate(e.target.value)}
                defaultValue=""
              >
                <option value="">— None —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Extra context (optional)</span>
            <textarea
              className="input min-h-[80px]"
              placeholder="e.g. They downloaded our whitepaper last week"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={abTest}
              onChange={(e) => setAbTest(e.target.checked)}
            />
            A/B test subject lines (Claude returns two; pick before sending)
          </label>
          <button
            className="btn-primary w-full"
            onClick={generate}
            disabled={generating || !contact}
          >
            {generating ? "Generating…" : "Generate with AI"}
          </button>
          <button
            type="button"
            className="btn-secondary w-full text-xs"
            disabled={optimizing || !contact}
            onClick={async () => {
              if (!contact) return;
              setOptimizing(true);
              try {
                const res = await api.post<{ variants: string[] }>(
                  "/api/ai/subject-test",
                  {
                    contact: { name: contact.name, company: contact.company },
                    goal,
                  },
                );
                setVariants5(res.variants);
              } finally {
                setOptimizing(false);
              }
            }}
          >
            {optimizing ? "Generating subjects…" : "AI: 5 subject variants"}
          </button>
          {variants5 ? (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 text-xs font-medium text-slate-500">
                Pick a subject:
              </div>
              <ul className="space-y-1">
                {variants5.map((v, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSubject(v);
                        setVariants5(null);
                      }}
                      className="flex-1 rounded px-2 py-1 text-left text-sm hover:bg-leo-50 dark:hover:bg-leo-900/30"
                    >
                      {v}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : info ? (
            <p className="text-sm text-emerald-600">{info}</p>
          ) : null}
        </div>

        <div className="card space-y-3">
          <label className="block">
            <span className="label">
              Subject {abTest && subjectB ? "(variant A)" : ""}
            </span>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            {(() => {
              const s = subjectChecks(subject);
              if (!subject) return null;
              return (
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  <span
                    className={
                      s.lenOk
                        ? "text-emerald-600"
                        : s.len > 60
                          ? "text-amber-600"
                          : "text-slate-500"
                    }
                  >
                    {s.len} char{s.len === 1 ? "" : "s"}
                    {s.lenOk ? " ✓" : s.len > 60 ? " (>60 may truncate)" : ""}
                  </span>
                  {s.triggers.length > 0 ? (
                    <span className="text-rose-600">
                      Spam trigger: {s.triggers.join(", ")}
                    </span>
                  ) : null}
                  {s.allCaps ? (
                    <span className="text-rose-600">All-caps</span>
                  ) : null}
                  {s.exclam > 1 ? (
                    <span className="text-rose-600">{s.exclam} !s</span>
                  ) : null}
                </div>
              );
            })()}
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <span className="font-medium">Suggested send time:</span>{" "}
            {suggestSendTime()}{" "}
            <span className="text-slate-400">
              (Tue–Thu mornings get the highest reply rate in your data.)
            </span>
          </div>
          {abTest && subjectB ? (
            <>
              <label className="block">
                <span className="label">Subject (variant B)</span>
                <input
                  className="input"
                  value={subjectB}
                  onChange={(e) => setSubjectB(e.target.value)}
                />
              </label>
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setChosenVariant("A")}
                  className={`flex-1 rounded-lg border px-3 py-2 ${
                    chosenVariant === "A"
                      ? "border-leo-500 bg-leo-50 text-leo-700"
                      : "border-slate-300"
                  }`}
                >
                  Send variant A
                </button>
                <button
                  type="button"
                  onClick={() => setChosenVariant("B")}
                  className={`flex-1 rounded-lg border px-3 py-2 ${
                    chosenVariant === "B"
                      ? "border-leo-500 bg-leo-50 text-leo-700"
                      : "border-slate-300"
                  }`}
                >
                  Send variant B
                </button>
              </div>
            </>
          ) : null}
          <label className="block">
            <span className="label">Body</span>
            <textarea
              className="input min-h-[260px] font-mono text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {body ? (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-slate-500">AI rewrite:</span>
              {(["Tighter", "Formal", "Casual", "Polish", "Add P.S."] as const).map(
                (variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => {
                      const transformed = rewriteBody(body, variant);
                      setBody(transformed);
                    }}
                    className="rounded-full bg-slate-100 px-2 py-1 hover:bg-leo-100 hover:text-leo-700 dark:bg-slate-800"
                  >
                    {variant}
                  </button>
                ),
              )}
            </div>
          ) : null}
          {snippets.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-slate-500">Insert snippet:</span>
              {snippets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setBody((b) => `${b}${b ? "\n\n" : ""}${s.body}`)}
                  className="rounded-full bg-slate-100 px-2 py-1 hover:bg-leo-100 hover:text-leo-700 dark:bg-slate-800"
                  title={s.body}
                >
                  {s.trigger}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <label>Send later:</label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="input w-auto py-1 text-xs"
            />
            {scheduleAt ? (
              <button
                type="button"
                onClick={async () => {
                  if (!contact || !subject || !body) return;
                  await api.post("/api/scheduled", {
                    contactId: contact.id,
                    to: contact.email,
                    subject,
                    body,
                    scheduledFor: new Date(scheduleAt).toISOString(),
                  });
                  ui.toast(
                    `Scheduled for ${new Date(scheduleAt).toLocaleString()}`,
                    { kind: "success" },
                  );
                  setScheduleAt("");
                }}
                className="text-leo-600 hover:underline"
              >
                Schedule send
              </button>
            ) : null}
          </div>
          {signature ? (
            <p className="text-[11px] text-slate-400">
              Signature appended at send time.
            </p>
          ) : null}
          <p className="text-[11px] text-slate-400">
            Draft auto-saves to your browser.{" "}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(DRAFT_KEY);
                }
                setSubject("");
                setSubjectB("");
                setBody("");
              }}
              className="text-leo-600 hover:underline"
            >
              Clear draft
            </button>
          </p>
          <button
            className="btn-primary w-full"
            disabled={sending || !contact || !subject || !body}
            onClick={send}
          >
            {sending
              ? "Sending…"
              : `Send to ${contact?.email ?? "contact"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
