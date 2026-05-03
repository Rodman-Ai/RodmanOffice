// /connect — placeholder for backend integrations. Stores keys locally in
// settings.connect.* so feature flags can light up later code paths without
// requiring schema migrations.

import { el } from "../utils.js";
import { Settings, subscribe } from "../store.js";
import { toast } from "../ui.js";

const INTEGRATIONS = [
  {
    id: "plaid",
    name: "Plaid (live bank feeds)",
    desc: "Live transaction sync. Today RodBooks imports bank data from CSV/OFX. With keys here, future code can call Plaid Link from the browser. Requires a server proxy for secret-side calls — store credentials at your own risk.",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "secret", label: "Secret", type: "password" },
      { key: "env", label: "Environment", options: ["sandbox", "development", "production"] },
    ],
  },
  {
    id: "stripe",
    name: "Stripe Checkout (\"Pay now\" links)",
    desc: "Generate hosted invoice payment links. Today the invoice template is print/PDF only. Once a publishable key is set, future code can attach checkout links per invoice.",
    fields: [
      { key: "publishableKey", label: "Publishable key (pk_…)" },
      { key: "secretKey", label: "Secret key (sk_…)", type: "password" },
    ],
  },
  {
    id: "dropboxSign",
    name: "Dropbox Sign (HelloSign)",
    desc: "Embedded e-sign for contracts. Drop in the API key here; the contract template library will offer a 'Send for signature' button when present.",
    fields: [
      { key: "apiKey", label: "API key", type: "password" },
    ],
  },
  {
    id: "llm",
    name: "AI assistant (LLM)",
    desc: "Powers the AI redline reviewer (#66), brief summarizer (#85), deal grader (#86), and coach mode (#89). Calls go directly from your browser to the provider with your key — keep that in mind. Default: Claude Sonnet 4.6.",
    fields: [
      { key: "provider", label: "Provider", options: ["anthropic", "openai", "google", "ollama"] },
      { key: "apiKey", label: "API key", type: "password" },
      { key: "model", label: "Model", options: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "gpt-4.1", "gpt-4.1-mini", "gemini-2.5-pro"] },
    ],
  },
];

export default function connectView() {
  const node = el("div", {});

  const render = () => {
    const s = Settings.get();
    const conn = s.connect || {};

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Connect"),
          el("div", { class: "sub" }, "Optional integrations. Keys are stored in localStorage on this device only — never sent anywhere except the provider's own API."),
        ),
      ),
      el("div", { class: "card", style: { borderLeft: "3px solid var(--warn)" } },
        el("strong", {}, "Heads-up about credentials"),
        el("div", { class: "small muted", style: { marginTop: 4 } },
          "RodBooks is a static client app — it has no server, so any API call has to come from your browser with your key attached. For Plaid/Stripe secret keys this is risky in production; treat them as sandbox-only. Enable encryption-at-rest in Settings so the keys aren't stored in plaintext."),
      ),
      ...INTEGRATIONS.map((i) => renderIntegration(i, conn[i.id] || {})),
    );
  };

  function renderIntegration(integration, current) {
    const inputs = {};
    integration.fields.forEach((f) => {
      let inp;
      if (f.options) {
        inp = el("select", { class: "select" });
        f.options.forEach((opt) => {
          const o = el("option", { value: opt }, opt);
          if (current[f.key] === opt) o.selected = true;
          inp.append(o);
        });
      } else {
        inp = el("input", { class: "input", type: f.type || "text", value: current[f.key] || "", placeholder: f.label });
      }
      inputs[f.key] = inp;
    });
    const isConfigured = integration.fields.every((f) => f.options ? !!inputs[f.key].value : !!(current[f.key] || "").trim());

    return el("div", { class: "card" },
      el("div", { class: "spread" },
        el("div", {},
          el("strong", {}, integration.name),
          el("div", { class: "small muted", style: { marginTop: 4 } }, integration.desc),
        ),
        el("span", { class: `pill ${isConfigured ? "green" : "gray"}` }, isConfigured ? "Connected" : "Not connected"),
      ),
      el("div", { class: "form-grid", style: { marginTop: 12 } },
        ...integration.fields.map((f) => el("div", { class: `field ${f.options ? "" : "full"}` }, el("label", {}, f.label), inputs[f.key])),
      ),
      el("div", { class: "row", style: { marginTop: 8 } },
        el("button", { class: "btn primary", onclick: () => {
          const next = { ...(Settings.get().connect || {}) };
          next[integration.id] = {};
          integration.fields.forEach((f) => { next[integration.id][f.key] = inputs[f.key].value; });
          Settings.update({ connect: next });
          toast(`${integration.name} saved`);
        } }, "Save"),
        isConfigured && el("button", { class: "btn danger", onclick: () => {
          const next = { ...(Settings.get().connect || {}) };
          next[integration.id] = {};
          integration.fields.forEach((f) => { next[integration.id][f.key] = ""; });
          Settings.update({ connect: next });
          toast(`${integration.name} cleared`);
        } }, "Clear"),
      ),
    );
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
