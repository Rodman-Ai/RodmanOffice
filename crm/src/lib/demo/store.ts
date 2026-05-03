// Tiny localStorage-backed table store used in DEMO_MODE.

import {
  SEED_ACTIVITY,
  SEED_AUDIT,
  SEED_AUTOMATIONS,
  SEED_CAMPAIGNS,
  SEED_COMPANIES,
  SEED_CONTACTS,
  SEED_DEALS,
  SEED_EMAIL_EVENTS,
  SEED_EMAILS,
  SEED_ENROLLMENTS,
  SEED_FORMS,
  SEED_LEADS,
  SEED_MEETINGS,
  SEED_MEMBERS,
  SEED_PIPELINES,
  SEED_SCHEDULED,
  SEED_SEQUENCES,
  SEED_SEQUENCE_STEPS,
  SEED_SNIPPETS,
  SEED_SUPPRESSION,
  SEED_TAGS,
  SEED_TASKS,
  SEED_TEMPLATES,
  SEED_TOKENS,
  SEED_VIEWS,
  SEED_WEBHOOKS,
} from "./seed";

const PREFIX = "leocrm.demo.";
const SEED_FLAG = `${PREFIX}seeded.v1`;

// Intentionally permissive — every demo table has an `id` column at runtime.
type AnyRow = unknown;

export const TABLES = {
  contacts: SEED_CONTACTS,
  leads: SEED_LEADS,
  campaigns: SEED_CAMPAIGNS,
  templates: SEED_TEMPLATES,
  emails: SEED_EMAILS,
  tasks: SEED_TASKS,
  activity: SEED_ACTIVITY,
  sequences: SEED_SEQUENCES,
  sequenceSteps: SEED_SEQUENCE_STEPS,
  enrollments: SEED_ENROLLMENTS,
  companies: SEED_COMPANIES,
  forms: SEED_FORMS,
  views: SEED_VIEWS,
  members: SEED_MEMBERS,
  audit: SEED_AUDIT,
  pipelines: SEED_PIPELINES,
  deals: SEED_DEALS,
  emailEvents: SEED_EMAIL_EVENTS,
  scheduled: SEED_SCHEDULED,
  suppression: SEED_SUPPRESSION,
  snippets: SEED_SNIPPETS,
  automations: SEED_AUTOMATIONS,
  webhooks: SEED_WEBHOOKS,
  tokens: SEED_TOKENS,
  meetings: SEED_MEETINGS,
  tags: SEED_TAGS,
} as const;

export type TableName = keyof typeof TABLES;

function lsAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function ensureSeeded() {
  if (!lsAvailable()) return;
  if (window.localStorage.getItem(SEED_FLAG)) return;
  for (const [name, rows] of Object.entries(TABLES)) {
    window.localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  }
  window.localStorage.setItem(SEED_FLAG, "1");
}

export function readTable<T = AnyRow>(name: TableName): T[] {
  if (!lsAvailable()) {
    return [...(TABLES[name] as unknown as T[])];
  }
  ensureSeeded();
  const raw = window.localStorage.getItem(PREFIX + name);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function writeTable<T = AnyRow>(name: TableName, rows: T[]) {
  if (!lsAvailable()) return;
  window.localStorage.setItem(PREFIX + name, JSON.stringify(rows));
}

export function newId(prefix: string) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function resetDemo() {
  if (!lsAvailable()) return;
  for (const name of Object.keys(TABLES)) {
    window.localStorage.removeItem(PREFIX + name);
  }
  window.localStorage.removeItem(SEED_FLAG);
  ensureSeeded();
}
