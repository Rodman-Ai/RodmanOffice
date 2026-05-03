// Receipt OCR via tesseract.js (lazy-loaded from CDN). Returns parsed { vendor, amount, date }.

let _tesseractPromise = null;

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (_tesseractPromise) return _tesseractPromise;
  _tesseractPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.async = true;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("Failed to load tesseract.js"));
    document.head.append(s);
  });
  return _tesseractPromise;
}

export async function ocrImage(file, onProgress) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(file, "eng", {
    logger: (m) => { if (onProgress && m.status === "recognizing text") onProgress(m.progress); },
  });
  return result.data.text || "";
}

export function extractReceiptFields(text) {
  const out = { vendor: "", amount: 0, date: "" };
  if (!text) return out;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Vendor: first non-empty line that looks like a name (alphanumeric, < 40 chars)
  for (const ln of lines) {
    if (/^[A-Z][A-Za-z0-9 &',.\-]{2,40}$/.test(ln)) { out.vendor = ln.trim(); break; }
  }
  if (!out.vendor && lines.length) out.vendor = lines[0].slice(0, 40);

  // Amount: prefer lines containing "TOTAL"; else max of all $ matches.
  const moneyRe = /\$?\s*(\d{1,4}(?:[.,]\d{2}))/g;
  let totalLine = lines.find((l) => /\btotal\b/i.test(l) && !/sub.?total/i.test(l));
  if (!totalLine) totalLine = lines.find((l) => /\bamount\s*due\b/i.test(l));
  if (totalLine) {
    const m = totalLine.match(/(\d{1,4}(?:[.,]\d{2}))/);
    if (m) out.amount = parseFloat(m[1].replace(",", "."));
  }
  if (!out.amount) {
    let max = 0;
    text.replace(moneyRe, (_m, n) => { const v = parseFloat(n.replace(",", ".")); if (v > max) max = v; });
    out.amount = max;
  }

  // Date: first ISO / m/d / month-name match.
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) out.date = iso[1];
  else {
    const us = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (us) {
      let yr = us[3].length === 2 ? "20" + us[3] : us[3];
      out.date = `${yr}-${String(+us[1]).padStart(2, "0")}-${String(+us[2]).padStart(2, "0")}`;
    } else {
      const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
      for (let i = 0; i < months.length; i++) {
        const re = new RegExp(`\\b${months[i]}\\w*\\s+(\\d{1,2})(?:[\\s,]+(\\d{4}))?`, "i");
        const m = text.match(re);
        if (m) {
          const yr = m[2] || new Date().getFullYear();
          out.date = `${yr}-${String(i + 1).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
          break;
        }
      }
    }
  }
  return out;
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
