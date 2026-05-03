"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/PageHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/client";

interface Workspace {
  spreadsheetId: string;
  driveFolderId: string;
}

interface OwnerCreds {
  LEOCRM_OWNER_EMAIL: string;
  LEOCRM_SPREADSHEET_ID: string;
  LEOCRM_DRIVE_FOLDER_ID: string;
  LEOCRM_OWNER_REFRESH_TOKEN: string;
  configured: boolean;
}

export default function SettingsPage() {
  const { data } = useSession();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [creds, setCreds] = useState<OwnerCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [w, c] = await Promise.all([
          api.post<Workspace>("/api/setup", {}),
          api.get<OwnerCreds>("/api/owner-credentials"),
        ]);
        setWs(w);
        setCreds(c);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connected Google Workspace storage."
      />
      <div className="card mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Theme</div>
          <div className="text-xs text-slate-500">
            System follows your OS preference.
          </div>
        </div>
        <ThemeToggle />
      </div>

      <SignatureCard />

      <div className="card space-y-3">
        <Row label="Account" value={data?.user?.email ?? ""} />
        {loading ? (
          <p className="text-sm text-slate-500">Provisioning workspace…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : ws ? (
          <>
            <Row
              label="Google Sheet"
              value={ws.spreadsheetId}
              link={`https://docs.google.com/spreadsheets/d/${ws.spreadsheetId}`}
            />
            <Row
              label="Drive Folder"
              value={ws.driveFolderId || "—"}
              link={
                ws.driveFolderId
                  ? `https://drive.google.com/drive/folders/${ws.driveFolderId}`
                  : undefined
              }
            />
          </>
        ) : null}
      </div>
      {creds ? (
        <div className="card mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Public form credentials</h3>
            <span
              className={`badge ${
                creds.configured
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {creds.configured ? "configured" : "not configured"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Public form submissions are unauthenticated, so the server uses
            stored OAuth credentials to write to your spreadsheet. Copy these
            into your deployment&apos;s environment variables (Vercel → Project
            → Settings → Environment Variables) and redeploy.
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            <Env name="LEOCRM_OWNER_EMAIL" value={creds.LEOCRM_OWNER_EMAIL} />
            <Env
              name="LEOCRM_SPREADSHEET_ID"
              value={creds.LEOCRM_SPREADSHEET_ID}
            />
            <Env
              name="LEOCRM_DRIVE_FOLDER_ID"
              value={creds.LEOCRM_DRIVE_FOLDER_ID}
            />
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  LEOCRM_OWNER_REFRESH_TOKEN
                </span>
                <button
                  onClick={() => setShowToken((s) => !s)}
                  className="text-leo-600"
                >
                  {showToken ? "Hide" : "Reveal"}
                </button>
              </div>
              <div className="mt-1 break-all">
                {showToken
                  ? creds.LEOCRM_OWNER_REFRESH_TOKEN || "(none on this session)"
                  : "•".repeat(36)}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            Treat the refresh token like a password — it grants the same
            Sheets/Drive/Gmail access you granted at sign-in. Store it only in
            your own deployment&apos;s env config.
          </p>
        </div>
      ) : null}

      <div className="card mt-4">
        <h3 className="mb-2 text-sm font-semibold">Where is my data?</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>
            Contacts, leads, campaigns, templates, and sent-email history are
            stored as tabs in <span className="font-mono">LeoCRM Workspace</span>{" "}
            on your Google Drive.
          </li>
          <li>
            Attachments and uploads land in the{" "}
            <span className="font-mono">LeoCRM</span> Drive folder.
          </li>
          <li>
            Outbound mail is sent through your Gmail using OAuth — no SMTP
            credentials required.
          </li>
          <li>
            AI generation runs server-side via Anthropic Claude using your
            configured API key.
          </li>
        </ul>
      </div>
    </div>
  );
}

function SignatureCard() {
  const [sig, setSig] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSig(window.localStorage.getItem("leocrm.compose.signature") ?? "");
  }, []);
  return (
    <div className="card mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Email signature</div>
        {saved ? (
          <span className="text-xs text-emerald-600">Saved</span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Auto-appended to the body when you send from Compose.
      </p>
      <textarea
        className="input min-h-[100px] font-mono text-sm"
        placeholder={"— You\nyourco.com"}
        value={sig}
        onChange={(e) => {
          setSig(e.target.value);
          window.localStorage.setItem("leocrm.compose.signature", e.target.value);
          setSaved(true);
          setTimeout(() => setSaved(false), 1200);
        }}
      />
    </div>
  );
}

function Env({ name, value }: { name: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{name}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(value)}
          className="text-leo-600"
        >
          Copy
        </button>
      </div>
      <div className="mt-1 break-all">{value || "—"}</div>
    </div>
  );
}

function Row({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 dark:border-slate-800 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="flex-1 break-all font-mono text-sm">
        {link ? (
          <a
            className="text-leo-600 hover:underline"
            href={link}
            target="_blank"
            rel="noreferrer"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
