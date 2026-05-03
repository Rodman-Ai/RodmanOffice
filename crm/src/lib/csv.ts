// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes, CRLF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Map a header row into known contact fields. Looks for common synonyms.
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "contact", "contact name"],
  email: ["email", "email address", "e-mail"],
  company: ["company", "organisation", "organization", "account"],
  role: ["role", "title", "job title", "position"],
  phone: ["phone", "mobile", "telephone"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile"],
  tags: ["tags", "labels", "segments"],
  notes: ["notes", "comments", "description"],
};

export function mapContactHeaders(headers: string[]): Record<string, number> {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const map: Record<string, number> = {};
  for (const field of Object.keys(FIELD_ALIASES)) {
    for (const alias of FIELD_ALIASES[field]) {
      const idx = lower.indexOf(alias);
      if (idx !== -1) {
        map[field] = idx;
        break;
      }
    }
  }
  return map;
}

export interface ParsedContact {
  name: string;
  email: string;
  company: string;
  role: string;
  phone: string;
  linkedin: string;
  tags: string;
  notes: string;
}

export function csvToContacts(text: string): {
  contacts: ParsedContact[];
  skipped: number;
  total: number;
} {
  const rows = parseCsv(text);
  if (rows.length === 0) return { contacts: [], skipped: 0, total: 0 };
  const [head, ...rest] = rows;
  const map = mapContactHeaders(head);
  const emailIdx = map.email;
  if (emailIdx === undefined) {
    return { contacts: [], skipped: rest.length, total: rest.length };
  }
  let skipped = 0;
  const contacts = rest
    .map<ParsedContact | null>((r) => {
      const get = (k: string) =>
        map[k] !== undefined ? (r[map[k]] ?? "").trim() : "";
      const email = get("email");
      if (!email || !/.+@.+\..+/.test(email)) {
        skipped++;
        return null;
      }
      return {
        name: get("name"),
        email,
        company: get("company"),
        role: get("role"),
        phone: get("phone"),
        linkedin: get("linkedin"),
        tags: get("tags"),
        notes: get("notes"),
      };
    })
    .filter((c): c is ParsedContact => c !== null);
  return { contacts, skipped, total: rest.length };
}
