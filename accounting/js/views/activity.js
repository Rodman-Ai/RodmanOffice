import { el } from "../utils.js";
import { Activity, subscribe } from "../store.js";
import { go } from "../router.js";
import { confirmDialog, toast } from "../ui.js";

const TYPE_META = {
  create: { cls: "green", verb: "Created" },
  update: { cls: "blue", verb: "Updated" },
  delete: { cls: "red", verb: "Deleted" },
};
const ENTITY_PATH = {
  deals: (id) => `/deals/${id}`,
  bills: () => `/bills`,
  contacts: () => `/contacts`,
  mileage: () => `/mileage`,
};

export default function activityView() {
  const node = el("div", {});
  let limit = 200;

  const render = () => {
    const all = Activity.all();
    const items = all.slice(0, limit);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Activity"),
          el("div", { class: "sub" }, `${all.length} entr${all.length === 1 ? "y" : "ies"} · most recent first`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn danger", onclick: async () => {
            const ok = await confirmDialog({ title: "Clear activity log?", body: "This won't affect your data.", danger: true, confirmLabel: "Clear" });
            if (ok) { Activity.clear(); toast("Activity cleared"); }
          } }, "Clear log"),
        ),
      ),
      items.length === 0
        ? el("div", { class: "card empty" }, el("div", { class: "ico" }, "·"), "No activity yet.")
        : el("div", { class: "card" },
            el("div", { class: "list" },
              ...items.map((a) => {
                const meta = TYPE_META[a.type] || { cls: "gray", verb: a.type };
                const path = ENTITY_PATH[a.entity]?.(a.entityId);
                return el("div", {
                  class: "list-row",
                  style: path ? { cursor: "pointer" } : null,
                  onclick: path ? () => go(path) : null,
                },
                  el("span", { class: `pill ${meta.cls}`, style: { minWidth: "70px", justifyContent: "center" } }, meta.verb),
                  el("div", { style: { flex: 1, minWidth: 0 } },
                    el("div", { class: "truncate" }, `${a.entity} · ${a.label}`),
                    el("div", { class: "small muted" }, new Date(a.ts).toLocaleString()),
                  ),
                );
              }),
            ),
            all.length > limit && el("div", { style: { textAlign: "center", marginTop: 12 } },
              el("button", { class: "btn", onclick: () => { limit += 200; render(); } }, "Show more"),
            ),
          ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
