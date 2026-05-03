"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ReactNode } from "react";
import { DEMO_MODE } from "@/lib/client";
import { DemoBanner } from "./DemoBanner";
import { CommandPalette } from "./CommandPalette";
import { QuickAdd } from "./QuickAdd";
import { GlobalShortcuts } from "./GlobalShortcuts";
import { RecentlyViewed } from "./RecentlyViewed";
import { OnboardingTour } from "./OnboardingTour";
import { MentionsBell } from "./MentionsBell";
import { PWAInstallPrompt } from "./PWAInstallPrompt";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Companies" },
  { href: "/leads", label: "Pipeline" },
  { href: "/deals", label: "Deals" },
  { href: "/sequences", label: "Sequences" },
  { href: "/automations", label: "Automations" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/compose", label: "AI Compose" },
  { href: "/inbox", label: "Inbox" },
  { href: "/tasks", label: "Tasks" },
  { href: "/reports", label: "Reports" },
  { href: "/templates", label: "Templates" },
  { href: "/forms", label: "Forms" },
  { href: "/members", label: "Team" },
  { href: "/audit", label: "Audit" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/settings", label: "Settings" },
];

const MOBILE_NAV = [
  { href: "/", label: "Home" },
  { href: "/contacts", label: "Contacts" },
  { href: "/leads", label: "Pipeline" },
  { href: "/compose", label: "Compose" },
  { href: "/tasks", label: "Tasks" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const userName = DEMO_MODE
    ? "Demo user"
    : (data?.user?.name ?? data?.user?.email ?? "");

  function handleSignOut() {
    if (DEMO_MODE) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("leocrm.demo.session");
      }
      router.push("/login");
      return;
    }
    signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <DemoBanner />
      <CommandPalette />
      <GlobalShortcuts />
      <OnboardingTour />
      <PWAInstallPrompt />
      <div className="flex min-h-0 flex-1">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:flex md:flex-col">
        <a
          href="/RodmanOffice/"
          title="Back to RodmanOffice apps"
          className="mx-3 mt-3 flex w-fit items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span aria-hidden>←</span>
          <span>Apps</span>
        </a>
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-leo-600 text-sm font-bold text-white">
            L
          </div>
          <span className="font-semibold">LeoCRM</span>
        </div>
        <nav className="flex-1 px-2 py-2">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-leo-50 text-leo-700 dark:bg-leo-900/40 dark:text-leo-200"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <RecentlyViewed />
        <div className="border-t border-slate-200 p-3 text-xs dark:border-slate-800">
          <div className="truncate font-medium">{userName}</div>
          <button
            onClick={handleSignOut}
            className="mt-1 text-slate-500 hover:text-leo-600"
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950 md:hidden">
          <div className="flex items-center gap-2">
            <a
              href="/RodmanOffice/"
              title="Back to RodmanOffice apps"
              aria-label="Back to RodmanOffice apps"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              ←
            </a>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-leo-600 text-sm font-bold text-white">
              L
            </div>
            <span className="font-semibold">LeoCRM</span>
          </div>
          <div className="flex items-center gap-2">
            <QuickAdd />
            <button
              onClick={handleSignOut}
              className="text-xs text-slate-500"
            >
              Sign out
            </button>
          </div>
        </header>
        <header className="hidden h-14 items-center gap-3 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950 md:flex">
          <span className="text-xs text-slate-400">Press ⌘K to search · n to add contact · c to compose</span>
          <div className="ml-auto flex items-center gap-2">
            <MentionsBell />
            <QuickAdd />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:py-6">
          {children}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-950 md:hidden">
          {MOBILE_NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center justify-center px-2 py-3 ${
                  active ? "text-leo-600" : "text-slate-500"
                }`}
              >
                <span className="font-medium">{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      </div>
    </div>
  );
}
