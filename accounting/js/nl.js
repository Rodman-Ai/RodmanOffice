// Lightweight natural-language parser: "Descript $1500 video due May 15 paid"
// Returns { company, fee, svc, draftDue, serviceDate, postDate, paid, partnerFeePct }

const SVC_KEYWORDS = {
  v: ["video", "youtube", "yt", "long form"],
  p: ["post", "tweet", "x post", "thread"],
  qrt: ["quote", "qrt", "quote tweet", "quote-rt"],
  rt: ["repost", "retweet", "rt"],
  "qrt rt": ["quote+repost", "qrt+rt"],
  "c+l": ["comment+like", "c+l", "engagement"],
  incentive: ["incentive", "bonus"],
  "p prep": ["pre-post", "prep"],
  postp: ["post-post", "follow up"],
};

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","sept","oct","nov","dec"];

function pad(n) { return String(n).padStart(2, "0"); }

function parseDateExpr(text, today = new Date()) {
  const t = text.toLowerCase();
  // ISO yyyy-mm-dd
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  // m/d or m/d/yy
  m = t.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    let yr = m[3] ? +m[3] : today.getFullYear();
    if (yr < 100) yr += 2000;
    return `${yr}-${pad(+m[1])}-${pad(+m[2])}`;
  }
  // "May 15", "May 15 2026"
  const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  for (let i = 0; i < monthNames.length; i++) {
    const re = new RegExp(`\\b${monthNames[i]}\\w*\\s+(\\d{1,2})(?:[,\\s]+(\\d{4}))?`, "i");
    const mm = t.match(re);
    if (mm) {
      const yr = mm[2] ? +mm[2] : today.getFullYear();
      return `${yr}-${pad(i + 1)}-${pad(+mm[1])}`;
    }
  }
  // "tomorrow" / "today" / "next week"
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(today.getTime() + 86400000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (/\btoday\b/.test(t)) {
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }
  if (/\bnext\s+week\b/.test(t)) {
    const d = new Date(today.getTime() + 7 * 86400000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return "";
}

export function parseDealText(text) {
  if (!text || !text.trim()) return null;
  const out = {};
  let s = text;

  // Email-style headers (#84): pull brand from From:, hint from Subject:
  const fromMatch = s.match(/^(?:From|Sender)\s*:\s*([^<\n,]+?)(?:\s*<[^>]+>)?\s*$/im);
  if (fromMatch) {
    // Take the domain or the "name part" as company guess
    const fromLine = fromMatch[1].trim();
    const dom = fromLine.match(/@([\w-]+)\./);
    if (dom) out.company = dom[1].charAt(0).toUpperCase() + dom[1].slice(1);
    else out.company = fromLine.split(/\s+from\s+/i)[0].trim();
  }
  const subjMatch = s.match(/^Subject\s*:\s*(.+)$/im);
  if (subjMatch) {
    // Subject often has the brand name in it; prepend so the keyword scan picks it up.
    s = subjMatch[1] + "\n" + s;
  }

  // Money: $1500 or $1,500 or $1.5k
  const money = s.match(/\$\s*([\d,]+(?:\.\d+)?)(k|m)?/i);
  if (money) {
    let v = parseFloat(money[1].replace(/,/g, ""));
    if (money[2]) v *= money[2].toLowerCase() === "k" ? 1000 : 1e6;
    out.fee = v;
    s = s.replace(money[0], " ");
  }

  // Partner fee: "3.5%" or "partner fee 3.5"
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) { out.partnerFeePct = parseFloat(pct[1]); s = s.replace(pct[0], " "); }

  // Service type
  for (const [code, kws] of Object.entries(SVC_KEYWORDS)) {
    for (const kw of kws) {
      const re = new RegExp(`\\b${kw.replace(/[+]/g, "\\+")}\\b`, "i");
      if (re.test(s)) { out.svc = code; s = s.replace(re, " "); break; }
    }
    if (out.svc) break;
  }

  // Paid?
  if (/\bpaid\b/i.test(s)) { out.paid = true; s = s.replace(/\bpaid\b/i, " "); }

  // Dates: detect "due X", "post X", "service X" prefixes
  const labels = [
    { re: /\bdue\s+(.+?)(?=$|,|;|\s+(?:on|paid|posted|service))/i, key: "draftDue" },
    { re: /\bpost(?:ed)?\s+(?:on\s+)?(.+?)(?=$|,|;|\s+(?:on|paid|due|service))/i, key: "postDate" },
    { re: /\b(?:service|film(?:ing)?)\s+(?:on\s+)?(.+?)(?=$|,|;|\s+(?:on|paid|due|posted))/i, key: "serviceDate" },
  ];
  for (const { re, key } of labels) {
    const m = s.match(re);
    if (m) {
      const dt = parseDateExpr(m[1]);
      if (dt) { out[key] = dt; s = s.replace(m[0], " "); }
    }
  }

  // Bare date → service date if not set
  if (!out.serviceDate && !out.draftDue && !out.postDate) {
    const bare = parseDateExpr(s);
    if (bare) out.serviceDate = bare;
  }

  // Clean residual punctuation, extract company name = leading words
  s = s.replace(/[,;:]/g, " ").replace(/\s+/g, " ").trim();
  const firstWords = [];
  const parts = s.split(/\s+/);
  for (const w of parts) {
    if (!w) break;
    if (/^(due|paid|posted|service|on|next|week|tomorrow|today|for|with)$/i.test(w)) break;
    firstWords.push(w);
    if (firstWords.length >= 4) break;
  }
  if (firstWords.length) out.company = firstWords.join(" ");

  return out;
}
