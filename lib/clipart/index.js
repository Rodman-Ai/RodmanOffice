// Clipart search across CORS-clean, key-less, browser-direct providers.
//
//   Wikimedia Commons — illustrative SVGs (mixed licenses, filtered to
//                       CC0/PD and CC-BY/CC-BY-SA with attribution).
//   Iconify           — line-art icons across 200+ sets.
//
// Open Clipart and ClipSafari are intentionally excluded — OCAL's CORS
// posture is broken from github.io and ClipSafari has no API.

const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_FILE_URL = 'https://commons.wikimedia.org/wiki/File:';
const ICONIFY_ENDPOINT = 'https://api.iconify.design';

const PERMISSIVE_ICONIFY_PREFIXES = [
  'mdi', 'tabler', 'lucide', 'carbon', 'ph', 'material-symbols',
  'streamline', 'octicon', 'simple-icons', 'fluent', 'gravity-ui',
];

// Licenses we keep. Anything else (GFDL-only, "Fair use", non-free)
// is dropped from results.
const PERMISSIVE_LICENSE_RE = /(cc[ -]?by(?:[ -]sa)?|public[ -]?domain|cc0|pd-)/i;

function extractLicense(extmetadata) {
  if (!extmetadata) return { license: '', requiresAttribution: false };
  const shortName = extmetadata.LicenseShortName?.value
    || extmetadata.License?.value
    || '';
  const author = extmetadata.Artist?.value || '';
  const lic = String(shortName).trim();
  const requiresAttribution =
    /cc[ -]?by/i.test(lic) && !/cc0/i.test(lic);
  return { license: lic, author: stripHtml(author), requiresAttribution };
}

function stripHtml(s) {
  if (!s) return '';
  const tmp = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (tmp) {
    tmp.innerHTML = s;
    return (tmp.textContent || tmp.innerText || '').trim();
  }
  return String(s).replace(/<[^>]+>/g, '').trim();
}

export async function searchCommons(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(50, opts.limit || 24));
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${q} filetype:svg`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '256',
  });
  const res = await fetch(`${COMMONS_ENDPOINT}?${params}`, {
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Commons search failed: HTTP ${res.status}`);
  const json = await res.json();
  const pages = json?.query?.pages;
  if (!pages) return [];
  const out = [];
  for (const pageId of Object.keys(pages)) {
    const p = pages[pageId];
    const info = p.imageinfo?.[0];
    if (!info) continue;
    if (info.mime !== 'image/svg+xml') continue;
    const { license, author, requiresAttribution } = extractLicense(info.extmetadata);
    if (!PERMISSIVE_LICENSE_RE.test(license)) continue;
    const title = String(p.title || '').replace(/^File:/, '');
    out.push({
      id: `commons:${pageId}`,
      title,
      thumbUrl: info.thumburl || info.url,
      svgUrl: info.url,
      sourceUrl: COMMONS_FILE_URL + encodeURIComponent(title.replace(/\s/g, '_')),
      license,
      author,
      attribution: requiresAttribution
        ? `${title} by ${author || 'Wikimedia Commons'} (${license})`
        : '',
      source: 'commons',
    });
  }
  return out;
}

export async function searchIconify(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(96, opts.limit || 48));
  const params = new URLSearchParams({
    query: q,
    limit: String(limit),
  });
  if (Array.isArray(opts.prefixes) && opts.prefixes.length) {
    params.set('prefixes', opts.prefixes.join(','));
  }
  const res = await fetch(`${ICONIFY_ENDPOINT}/search?${params}`, {
    signal: opts.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Iconify search failed: HTTP ${res.status}`);
  const json = await res.json();
  const ids = Array.isArray(json?.icons) ? json.icons : [];
  return ids.map((id) => {
    const [prefix, name] = String(id).split(':');
    if (!prefix || !name) return null;
    const svgUrl = `${ICONIFY_ENDPOINT}/${prefix}/${name}.svg`;
    return {
      id: `iconify:${id}`,
      title: `${name.replace(/-/g, ' ')} (${prefix})`,
      thumbUrl: svgUrl,
      svgUrl,
      sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
      license: prefix in (json?.licenses || {}) ? json.licenses[prefix]?.title || '' : '',
      author: prefix,
      attribution: '',
      source: 'iconify',
      prefix,
      name,
    };
  }).filter(Boolean);
}

// Strip <script>, on*-event attrs, and javascript: hrefs from an SVG
// string before inlining it into a contenteditable document. Conservative
// allowlist — leaves <style>, <use>, <defs>, gradients, paths, etc.
export function sanitizeSvg(svg) {
  if (!svg) return '';
  let s = String(svg);
  // Drop any XML declaration / DOCTYPE — we're embedding inline.
  s = s.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '');
  // Drop comments.
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Drop <script> blocks.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Drop on* event attributes (onclick, onload, …).
  s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript: hrefs (in <a> and <image> via xlink:href).
  s = s.replace(/(href|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2');
  // Drop foreignObject — can host arbitrary HTML.
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  return s.trim();
}

export async function fetchSvgInline(item, opts = {}) {
  if (!item?.svgUrl) throw new Error('fetchSvgInline: missing svgUrl');
  const res = await fetch(item.svgUrl, { signal: opts.signal });
  if (!res.ok) throw new Error(`SVG fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  return sanitizeSvg(text);
}

// Encode an inlined SVG string as a data: URL — used by Slides whose
// image element wants `src=…` rather than embedded markup.
export function svgToDataUrl(svg) {
  const safe = sanitizeSvg(svg);
  // Use base64 to avoid url-encoding edge cases with quotes/&.
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(safe)))
    : Buffer.from(safe, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

export const ICONIFY_PERMISSIVE_PREFIXES = PERMISSIVE_ICONIFY_PREFIXES;
