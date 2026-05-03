import { el, fmtMoney, initials, debounce, netFee, lastTouchedAt, brandHealth, fmtDateShort } from "../utils.js";
import { Contacts, Deals, subscribe } from "../store.js";
import { openContactForm } from "../forms.js";
import { confirmDialog, toast } from "../ui.js";
import { go } from "../router.js";

export default function contacts() {
  const node = el("div", {});
  let filters = { search: "", type: "all" };

  const render = () => {
    const all = Contacts.all();
    const deals = Deals.all();
    const filtered = all.filter((c) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!`${c.name} ${c.company} ${c.email} ${c.notes}`.toLowerCase().includes(q)) return false;
      }
      if (filters.type !== "all" && c.type !== filters.type) return false;
      return true;
    });

    const stats = (c) => {
      const ds = deals.filter((d) => d.contactId === c.id || (d.company || "").toLowerCase() === (c.name || "").toLowerCase());
      const total = ds.reduce((s, d) => s + netFee(d), 0);
      const unpaid = ds.filter((d) => !d.paid).reduce((s, d) => s + netFee(d), 0);
      const touched = lastTouchedAt(ds, c);
      const daysSince = touched ? Math.round((Date.now() - touched) / 86400000) : null;
      const health = brandHealth(ds, c);
      const needsNudge = ds.length > 0 && daysSince != null && daysSince > 60 && unpaid === 0;
      return { count: ds.length, total, unpaid, touched, daysSince, health, needsNudge };
    };

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Contacts"),
          el("div", { class: "sub" }, `${filtered.length} of ${all.length}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn primary", onclick: () => openContactForm() }, "+ New contact"),
        ),
      ),
      el("div", { class: "table-wrap" },
        el("div", { class: "table-toolbar" },
          (function () {
            const i = el("input", { class: "input search", placeholder: "Search name, email, company", value: filters.search });
            i.addEventListener("input", debounce((e) => { filters.search = e.target.value; render(); }, 150));
            return i;
          })(),
          (function () {
            const s = el("select", { class: "select" });
            for (const o of [
              { value: "all", label: "All types" },
              { value: "brand", label: "Brand" },
              { value: "agency", label: "Agency" },
              { value: "vendor", label: "Vendor" },
              { value: "partner", label: "Partner" },
              { value: "personal", label: "Personal" },
            ]) {
              const opt = el("option", { value: o.value }, o.label);
              if (o.value === filters.type) opt.selected = true;
              s.append(opt);
            }
            s.addEventListener("change", () => { filters.type = s.value; render(); });
            return s;
          })(),
        ),
        el("div", { class: "table-scroll" },
          filtered.length === 0
            ? el("div", { class: "empty" },
                el("div", { class: "ico" }, "☺"),
                el("div", {}, "No contacts yet."),
                el("div", { style: { marginTop: 12 } }, el("button", { class: "btn primary", onclick: () => openContactForm() }, "+ Add a contact")),
              )
            : (function () {
                const t = el("table", { class: "data" });
                t.append(el("thead", {}, el("tr", {},
                  el("th", {}, "Name"),
                  el("th", {}, "Type"),
                  el("th", {}, "Email"),
                  el("th", {}, "Phone"),
                  el("th", { class: "num" }, "Deals"),
                  el("th", { class: "num" }, "Total"),
                  el("th", { class: "num" }, "Outstanding"),
                  el("th", {}, "Last touched"),
                  el("th", {}, "Health"),
                  el("th", {}, ""),
                )));
                const tbody = el("tbody");
                filtered.forEach((c) => {
                  const s = stats(c);
                  tbody.append(el("tr", { onclick: () => openContactForm(c) },
                    el("td", {},
                      el("div", { class: "row" }, el("div", { class: "avatar" }, initials(c.name)), el("span", {}, c.name)),
                      (c.tags && c.tags.length) ? el("div", { class: "row", style: { gap: "4px", marginTop: "4px" } }, ...c.tags.slice(0, 4).map((t) => el("span", { class: "pill gray", style: { padding: "1px 6px", fontSize: "10px" } }, t))) : null,
                    ),
                    el("td", {}, el("span", { class: "pill gray" }, c.type || "—")),
                    el("td", { class: "small muted" }, c.email || "—"),
                    el("td", { class: "small muted" }, c.phone || "—"),
                    el("td", { class: "num" }, s.count),
                    el("td", { class: "num" }, fmtMoney(s.total)),
                    el("td", { class: "num" }, fmtMoney(s.unpaid)),
                    el("td", { class: "small" },
                      s.touched ? fmtDateShort(new Date(s.touched).toISOString().slice(0, 10)) : el("span", { class: "muted" }, "—"),
                      s.needsNudge ? el("span", { class: "pill amber", style: { marginLeft: 6 } }, "Nudge?") : null,
                    ),
                    el("td", {}, s.count > 0 ? el("span", { class: `pill ${s.health.cls}` }, `${s.health.score}° ${s.health.label}`) : el("span", { class: "muted small" }, "—")),
                    el("td", {},
                      el("button", { class: "btn sm danger", onclick: async (e) => {
                        e.stopPropagation();
                        const ok = await confirmDialog({ title: "Delete contact?", body: `Remove "${c.name}"?`, danger: true, confirmLabel: "Delete" });
                        if (ok) { Contacts.remove(c.id); toast("Deleted"); }
                      } }, "Delete"),
                    ),
                  ));
                });
                t.append(tbody);
                return t;
              })(),
        ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
