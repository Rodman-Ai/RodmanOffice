export function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-slate-200/70 dark:bg-slate-800/70" />
          </div>
          <div className="h-5 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}
