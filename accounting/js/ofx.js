// Minimal OFX 1.x (SGML) and 2.x (XML) parser. Returns { transactions: [{date, vendor, amount, type}] }.
// Tested against typical bank/credit-card exports.

export function parseOfx(text) {
  if (!text) return { transactions: [] };
  // Strip OFX header lines (key:value before first <OFX>) and clean up.
  const ofxStart = text.indexOf("<OFX>");
  const body = ofxStart >= 0 ? text.slice(ofxStart) : text;

  const transactions = [];
  // Match each <STMTTRN>…</STMTTRN> block (1.x) or <STMTTRN>…<STMTTRN> XML.
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  while ((m = blockRe.exec(body)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const re = new RegExp(`<${tag}>([^<\\n\\r]+)`, "i");
      const r = block.match(re);
      return r ? r[1].trim() : "";
    };
    const dt = get("DTPOSTED");
    const amt = get("TRNAMT");
    const name = get("NAME") || get("MEMO") || get("PAYEE");
    const trntype = get("TRNTYPE").toLowerCase();
    const fitid = get("FITID");
    if (!dt || !amt) continue;
    const numeric = parseFloat(amt);
    transactions.push({
      date: parseOfxDate(dt),
      vendor: name || trntype || "—",
      amount: Math.abs(numeric),
      type: numeric < 0 || trntype === "debit" ? "debit" : "credit",
      memo: get("MEMO"),
      fitid,
    });
  }
  return { transactions };
}

function parseOfxDate(s) {
  // OFX dates are YYYYMMDD or YYYYMMDDHHMMSS, optionally with [TZ] suffix.
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}
