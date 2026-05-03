"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  action?: { label: string; onClick: () => void };
}

interface UI {
  toast: (message: string, opts?: { kind?: ToastKind; action?: Toast["action"]; ttl?: number }) => void;
  confirm: (message: string, opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
}

const Ctx = createContext<UI | null>(null);

export function useUI(): UI {
  const v = useContext(Ctx);
  if (v) return v;
  // Fallback for early renders / SSR — falls back to native APIs.
  return {
    toast: (message) => {
      if (typeof window !== "undefined") console.log("[toast]", message);
    },
    confirm: async (message) =>
      typeof window !== "undefined" ? window.confirm(message) : false,
  };
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<{
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    danger: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);
  const idCounter = useRef(0);

  const toast = useCallback<UI["toast"]>((message, opts) => {
    const id = `t${idCounter.current++}`;
    const kind = opts?.kind ?? "info";
    setToasts((ts) => [...ts, { id, message, kind, action: opts?.action }]);
    const ttl = opts?.ttl ?? 4000;
    if (ttl > 0) {
      setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), ttl);
    }
  }, []);

  const confirm = useCallback<UI["confirm"]>(
    (message, opts) =>
      new Promise<boolean>((resolve) => {
        setPending({
          message,
          confirmLabel: opts?.confirmLabel ?? "Confirm",
          cancelLabel: opts?.cancelLabel ?? "Cancel",
          danger: !!opts?.danger,
          resolve,
        });
      }),
    [],
  );

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2 text-sm shadow-lg ${
              t.kind === "success"
                ? "bg-emerald-600 text-white"
                : t.kind === "error"
                  ? "bg-red-600 text-white"
                  : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            }`}
          >
            <span>{t.message}</span>
            {t.action ? (
              <button
                onClick={() => {
                  t.action!.onClick();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              onClick={() =>
                setToasts((ts) => ts.filter((x) => x.id !== t.id))
              }
              className="opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {pending ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            pending.resolve(false);
            setPending(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
          >
            <p className="text-sm">{pending.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  pending.resolve(false);
                  setPending(null);
                }}
              >
                {pending.cancelLabel}
              </button>
              <button
                className={`btn ${
                  pending.danger
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-leo-600 text-white hover:bg-leo-700"
                }`}
                onClick={() => {
                  pending.resolve(true);
                  setPending(null);
                }}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
