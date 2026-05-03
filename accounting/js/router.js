/**
 * @file Tiny hash router (~80 lines). Routes register a handler that returns
 * a DOM node, a `{ node, unmount }` object, or a string of HTML. Supports
 * URL parameters (`/deals/:id`) and query strings (`?paid=no&svc=v`).
 *
 * @module router
 */

const routes = [];
let mounted = null;

/**
 * Register a route. Path syntax: literal `/` segments + `:param` placeholders.
 * The handler is called with `(params, ctx)` where `ctx.query` is a parsed
 * `{key: value}` object from the hash query string.
 *
 * @param {string} path e.g. `"/deals"` or `"/deals/:id"`.
 * @param {(params: object, ctx: {outlet: HTMLElement, query: object}) =>
 *          (HTMLElement|string|{node?: any, unmount?: () => void}|Promise<any>)} handler
 * @param {object} [opts] Reserved for future options.
 */
export function register(path, handler, opts = {}) {
  // path can include :params, e.g. /deals/:id
  const re = new RegExp("^" + path.replace(/:[a-zA-Z]+/g, "([^/]+)") + "/?$");
  const params = (path.match(/:[a-zA-Z]+/g) || []).map((s) => s.slice(1));
  routes.push({ path, re, params, handler, opts });
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, queryStr] = raw.split("?");
  const query = {};
  if (queryStr) {
    new URLSearchParams(queryStr).forEach((v, k) => { query[k] = v; });
  }
  return { path: path || "/", query };
}

/**
 * Update query parameters on the current hash without re-rendering the route.
 * Subscribers can listen to the synthetic `rb:query` event for changes.
 * Pass `null`/`""` for a key to remove it.
 *
 * Note: `pushState`/`replaceState` don't fire `hashchange` in modern browsers,
 * so we don't need to suppress anything — the route handler simply isn't
 * invoked. (A previous version armed a `suppressNext` flag here that swallowed
 * the next *real* navigation, e.g. clicking a sidebar link after changing a
 * filter — fixed.)
 *
 * @param {Record<string, string|null>} patch
 * @param {{replace?: boolean}} [opts] Use replaceState vs pushState.
 */
export function setQuery(patch, { replace = false } = {}) {
  const { path, query } = parseHash();
  const next = { ...query };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") delete next[k];
    else next[k] = v;
  }
  const qs = new URLSearchParams(next).toString();
  const target = "#" + path + (qs ? "?" + qs : "");
  if (location.hash === target) return;
  if (replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  // Manually trigger one synthetic re-broadcast so subscribers can read new query
  window.dispatchEvent(new CustomEvent("rb:query"));
}

/** @returns {Record<string,string>} Parsed query string from the current hash. */
export function getQuery() {
  return parseHash().query;
}

/**
 * Boot the router. Renders the matching route into `outlet` on every
 * `hashchange`. `onChange({ path, query, route })` fires after each render.
 * @param {{outlet: HTMLElement, onChange?: (info: {path: string, query: object, route: object}) => void}} cfg
 */
export function start({ outlet, onChange }) {
  async function render() {
    const { path, query } = parseHash();
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) {
        const p = {};
        r.params.forEach((k, i) => (p[k] = decodeURIComponent(m[i + 1])));
        outlet.innerHTML = "";
        if (mounted && typeof mounted.unmount === "function") {
          try { mounted.unmount(); } catch {}
        }
        const result = await r.handler(p, { outlet, query });
        mounted = result?.unmount ? result : { node: result };
        if (mounted.node && mounted.node.nodeType) outlet.append(mounted.node);
        else if (typeof mounted.node === "string") outlet.innerHTML = mounted.node;
        if (onChange) onChange({ path, query, route: r });
        window.scrollTo(0, 0);
        return;
      }
    }
    outlet.innerHTML = '<div class="empty"><div class="ico">∅</div>Not found</div>';
  }
  window.addEventListener("hashchange", render);
  render();
}

/**
 * Navigate. If the path equals the current hash, force a re-render.
 * Accepts paths with or without the leading `#`.
 * @param {string} path
 */
export function go(path) {
  if (!path.startsWith("#")) path = "#" + path;
  if (location.hash === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = path;
  }
}
