"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEMO_MODE } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-leo-50 via-white to-leo-100 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-leo-900/40">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-leo-600 text-white">
          <span className="text-2xl font-bold">L</span>
        </div>
        <h1 className="text-2xl font-semibold">Welcome to LeoCRM</h1>
        <p className="mt-2 text-sm text-slate-500">
          AI-powered lead generation, stored entirely in your Google Workspace.
        </p>
        <button
          className="btn-primary mt-6 w-full"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            if (DEMO_MODE) {
              if (typeof window !== "undefined") {
                window.localStorage.setItem("leocrm.demo.session", "1");
              }
              router.push("/");
              return;
            }
            signIn("google", { callbackUrl: "/" });
          }}
        >
          {loading
            ? "Loading…"
            : DEMO_MODE
              ? "Try the demo →"
              : "Continue with Google Workspace"}
        </button>
        <p className="mt-4 text-xs text-slate-400">
          {DEMO_MODE
            ? "Demo mode: data is stored locally in your browser. No Google login, no emails sent. Refresh and choose Reset demo from settings to start over."
            : "We request access to Sheets, Drive, and Gmail-send to manage your CRM data and send AI emails on your behalf."}
        </p>
      </div>
    </main>
  );
}
