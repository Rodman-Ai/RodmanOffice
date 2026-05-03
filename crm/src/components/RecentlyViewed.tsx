"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRecents, onRecentsChange, type RecentItem } from "@/lib/recents";

export function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => {
    const update = () => setItems(getRecents());
    update();
    return onRecentsChange(update);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="px-2 pb-2">
      <div className="mt-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Recent
      </div>
      {items.map((r) => (
        <Link
          key={r.id}
          href={r.href}
          className="block truncate rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-100"
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}
