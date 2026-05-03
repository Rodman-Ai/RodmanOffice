"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import type { Meeting, Member } from "@/lib/types";

function nextSlots(): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  const now = new Date();
  for (let dayOff = 1; dayOff <= 5 && out.length < 8; dayOff++) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOff);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    for (const hr of [10, 11, 14]) {
      const slot = new Date(d);
      slot.setHours(hr, 0, 0, 0);
      out.push({
        iso: slot.toISOString(),
        label: slot.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      });
      if (out.length >= 8) break;
    }
  }
  return out;
}

export default function MeetingClient() {
  const { slug } = useParams<{ slug: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [host, setHost] = useState<Member | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Meeting[]>("/api/meetings"),
      api.get<Member[]>("/api/members"),
    ]).then(([mts, ms]) => {
      const m = mts.find((x) => x.slug === slug);
      setMeeting(m ?? null);
      if (m) setHost(ms.find((x) => x.id === m.memberId) ?? null);
    });
  }, [slug]);

  const slots = useMemo(nextSlots, []);

  async function book() {
    if (!meeting || !picked || !email) return;
    // Create a contact + a task as the booked event.
    const c = await api.post<{ id: string }>("/api/contacts", {
      name,
      email,
      tags: "meeting-booked",
      notes: `Booked ${meeting.title} via /m/${meeting.slug}`,
    });
    await api.post("/api/tasks", {
      contactId: c.id,
      title: `${meeting.title} with ${name || email}`,
      dueAt: picked.slice(0, 10),
      notes: `Booked via /m/${meeting.slug} at ${new Date(picked).toLocaleString()}`,
    });
    setDone(true);
  }

  if (!meeting) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-sm text-center text-sm text-slate-500">
          Meeting not found.
        </div>
      </main>
    );
  }
  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-xl font-semibold">Booked ✓</h1>
          <p className="mt-2 text-sm text-slate-500">
            We'll send a calendar invite to {email}.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-gradient-to-br from-leo-50 via-white to-leo-100 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-leo-900/40">
      <div className="card w-full max-w-lg">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {host?.name || host?.email || "LeoCRM"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{meeting.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {meeting.duration}-minute meeting · {meeting.availability}
        </p>
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Pick a time
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {slots.map((s) => (
              <button
                key={s.iso}
                onClick={() => setPicked(s.iso)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  picked === s.iso
                    ? "border-leo-500 bg-leo-50 text-leo-700 dark:bg-leo-900/30"
                    : "border-slate-300 hover:border-leo-400 dark:border-slate-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {picked ? (
          <div className="mt-4 space-y-2">
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              onClick={book}
              disabled={!email}
              className="btn-primary w-full"
            >
              Confirm booking
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
