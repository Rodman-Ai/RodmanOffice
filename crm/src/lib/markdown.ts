// Tiny markdown subset: **bold**, *italic*, `code`, links [text](url),
// list items "- ", and @[Name] mentions resolved against contacts.

import type { Contact } from "./types";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderMarkdown(
  text: string,
  contacts: Contact[] = [],
): string {
  if (!text) return "";
  const byName = new Map<string, Contact>();
  for (const c of contacts) {
    if (c.name) byName.set(c.name.toLowerCase(), c);
    if (c.email) byName.set(c.email.toLowerCase(), c);
  }
  const lines = text.split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    let line = escapeHtml(raw);
    line = line.replace(/`([^`]+)`/g, "<code>$1</code>");
    line = line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    line = line.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    line = line.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-leo-600 underline">$1</a>',
    );
    line = line.replace(/@\[([^\]]+)\]/g, (_, name: string) => {
      const c = byName.get(name.toLowerCase());
      if (c) {
        return `<a href="/contacts/${c.id}" class="rounded bg-leo-50 px-1 text-leo-700 dark:bg-leo-900/30 dark:text-leo-200">@${escapeHtml(name)}</a>`;
      }
      return `@${escapeHtml(name)}`;
    });
    if (/^- /.test(raw)) {
      if (!inList) {
        out.push("<ul class=\"list-disc pl-5\">");
        inList = true;
      }
      out.push(`<li>${line.replace(/^- /, "")}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(line);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("<br>");
}
