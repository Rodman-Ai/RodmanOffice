// Generate an iCalendar (.ics) file from a list of deals.
// One event per stage that has a date: draftDue, serviceDate, postDate, invoiceDate, paidDate.

import { Deals, downloadFile } from "./store.js";

const STAGE_LABELS = {
  draftDue: "Draft due",
  serviceDate: "Service / film",
  postDate: "Post",
  invoiceDate: "Invoice",
  paidDate: "Paid",
};

function fmt(dateStr) {
  // YYYY-MM-DD -> YYYYMMDD
  return dateStr.replace(/-/g, "");
}

function escIcs(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs(deals = Deals.all(), { calendarName = "RodBooks" } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RodBooks//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escIcs(calendarName)}`,
  ];
  for (const d of deals) {
    for (const [key, label] of Object.entries(STAGE_LABELS)) {
      const dt = d[key];
      if (!dt) continue;
      const uid = `${d.id}-${key}@rodbooks`;
      const summary = `${d.company} · ${label}`;
      const desc = [
        `Brand: ${d.company}`,
        d.svc && `Type: ${d.svc}`,
        d.fee && `Fee: $${d.fee}`,
        d.invoiceNumber && `Invoice #: ${d.invoiceNumber}`,
        d.notes && `Notes: ${d.notes}`,
      ].filter(Boolean).join("\\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${fmt(dt)}T000000Z`,
        `DTSTART;VALUE=DATE:${fmt(dt)}`,
        `DTEND;VALUE=DATE:${fmt(dt)}`,
        `SUMMARY:${escIcs(summary)}`,
        `DESCRIPTION:${desc}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(deals, name = "rodbooks.ics") {
  const ics = buildIcs(deals);
  downloadFile(name, ics, "text/calendar");
}
