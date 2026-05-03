// Deterministic-but-varied avatar colors so a list of contacts is visually
// distinguishable.

const PALETTE = [
  ["bg-leo-100", "text-leo-700"],
  ["bg-emerald-100", "text-emerald-700"],
  ["bg-amber-100", "text-amber-700"],
  ["bg-rose-100", "text-rose-700"],
  ["bg-sky-100", "text-sky-700"],
  ["bg-fuchsia-100", "text-fuchsia-700"],
  ["bg-violet-100", "text-violet-700"],
  ["bg-orange-100", "text-orange-700"],
];

export function avatarClasses(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const [bg, fg] = PALETTE[Math.abs(h) % PALETTE.length];
  return `${bg} ${fg}`;
}

export function avatarInitials(name: string, fallback = "?"): string {
  const parts = (name || fallback).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
