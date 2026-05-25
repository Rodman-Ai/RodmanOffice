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
import { CommandBar } from "./CommandBar";

// Microsoft Dynamics 365-style grouped sitemap. Each group label is a dim
// uppercase header; the entries below are flat links — same routes as before,
// just reorganized.
const NAV_GROUPS: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: "My Work",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/inbox", label: "Inbox" },
      { href: "/tasks", label: "Tasks" },
      { href: "/audit", label: "Activity" },
    ],
  },
  {
    group: "Customers",
    items: [
      { href: "/contacts", label: "Contacts" },
      { href: "/companies", label: "Companies" },
    ],
  },
  {
    group: "Sales",
    items: [
      { href: "/leads", label: "Pipeline" },
      { href: "/deals", label: "Deals" },
      { href: "/forms", label: "Forms" },
    ],
  },
  {
    group: "Outreach",
    items: [
      { href: "/sequences", label: "Sequences" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/automations", label: "Automations" },
      { href: "/compose", label: "AI Compose" },
      { href: "/templates", label: "Templates" },
    ],
  },
  {
    group: "Performance",
    items: [
      { href: "/reports", label: "Reports" },
      { href: "/assistant", label: "AI Assistant" },
    ],
  },
  {
    group: "Settings",
    items: [
      { href: "/members", label: "Team" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

const PAGE_LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i.label])),
);

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
      <aside className="hidden w-60 shrink-0 flex-col bg-dyn-sitemap text-dyn-sitemap-fg md:flex">
        <a
          href="/RodmanOffice/"
          title="Back to RodmanOffice apps"
          className="mx-3 mt-3 flex w-fit items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs font-medium text-white/90 hover:bg-white/20"
        >
          <span aria-hidden>←</span>
          <span>Apps</span>
        </a>
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dyn-accent text-sm font-bold text-white">
            L
          </div>
          <span className="font-semibold">LeoCRM</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.group} className="mb-2">
              <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-dyn-sitemap-group">
                {group.group}
              </div>
              {group.items.map((n) => {
                const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`mb-0.5 flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-white/20 text-white"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <RecentlyViewed />
        <div className="border-t border-white/10 p-3 text-xs text-white/70">
          <div className="truncate font-medium text-white">{userName}</div>
          <button
            onClick={handleSignOut}
            className="mt-1 text-white/60 hover:text-white"
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
        <CommandBar pageLabel={PAGE_LABELS[path] ?? (path === "/" ? "Dashboard" : undefined)} />
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
