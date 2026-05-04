import { el, fmtMoney, fmtDate, todayISO, debounce, kpi, field } from "../utils.js";
import { Mileage, Settings, subscribe } from "../store.js";
import { openModal, toast, confirmDialog } from "../ui.js";

export default function mileageView() {
  const node = el("div", {});
  let filter = { search: "", year: "all" };

  const render = () => {
    const all = Mileage.all();
    const rate = Settings.get().mileageRate || 0.725;
    const years = Array.from(new Set(all.map((m) => (m.date || "").slice(0, 4)).filter(Boolean))).sort().reverse();

    const filtered = all.filter((m) => {
      if (filter.year !== "all" && (m.date || "").slice(0, 4) !== filter.year) return false;
      if (filter.search && !`${m.purpose} ${m.fromTo} ${m.notes}`.toLowerCase().includes(filter.search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const totalMiles = filtered.reduce((s, m) => s + (+m.miles || 0), 0);
    const totalDeduction = totalMiles * rate;
    const ytd = all.filter((m) => (m.date || "").startsWith(String(new Date().getFullYear())));
    const ytdMiles = ytd.reduce((s, m) => s + (+m.miles || 0), 0);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Mileage"),
          el("div", { class: "sub" }, `Rate $${rate.toFixed(2)}/mi · YTD ${ytdMiles.toLocaleString()} mi · ${fmtMoney(ytdMiles * rate)} deductible`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn primary", onclick: () => openMileageForm() }, "+ Log a trip"),
        ),
      ),
      el("div", { class: "kpi-grid" },
        kpi("Trips", filtered.length),
        kpi("Miles", totalMiles.toLocaleString()),
        kpi("Deductible", fmtMoney(totalDeduction)),
        kpi("Avg per trip", filtered.length ? fmtMoney((totalMiles / filtered.length) * rate) : "—"),
      ),
      el("div", { class: "table-wrap" },
        el("div", { class: "table-toolbar" },
          (function () {
            const i = el("input", { class: "input search", placeholder: "Search purpose / route", value: filter.search });
            i.addEventListener("input", debounce((e) => { filter.search = e.target.value; render(); }, 150));
            return i;
          })(),
          (function () {
            const s = el("select", { class: "select" });
            for (const o of [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))]) {
              const opt = el("option", { value: o.value }, o.label);
              if (o.value === filter.year) opt.selected = true;
              s.append(opt);
            }
            s.addEventListener("change", () => { filter.year = s.value; render(); });
            return s;
          })(),
        ),
        el("div", { class: "table-scroll" },
          filtered.length === 0
            ? el("div", { class: "empty" }, el("div", { class: "ico" }, "↗"), "No trips logged yet.")
            : (function () {
                const t = el("table", { class: "data" });
                t.append(el("thead", {}, el("tr", {},
                  el("th", {}, "Date"),
                  el("th", {}, "Purpose"),
                  el("th", {}, "From → To"),
                  el("th", { class: "num" }, "Miles"),
                  el("th", { class: "num" }, "Deductible"),
                  el("th", {}, ""),
                )));
                const tb = el("tbody");
                filtered.forEach((m) => {
                  tb.append(el("tr", { onclick: () => openMileageForm(m) },
                    el("td", { class: "small muted" }, fmtDate(m.date)),
                    el("td", {}, m.purpose || "—"),
                    el("td", { class: "small muted truncate" }, m.fromTo || "—"),
                    el("td", { class: "num" }, (+m.miles || 0).toLocaleString()),
                    el("td", { class: "num" }, fmtMoney((+m.miles || 0) * rate)),
                    el("td", {}, el("button", {
                      class: "btn sm danger",
                      onclick: async (e) => {
                        e.stopPropagation();
                        const ok = await confirmDialog({ title: "Delete trip?", body: m.purpose || "", danger: true, confirmLabel: "Delete" });
                        if (ok) { Mileage.remove(m.id); toast("Deleted"); }
                      },
                    }, "Delete")),
                  ));
                });
                t.append(tb);
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

function openMileageForm(trip) {
  const isNew = !trip?.id;
  const t = trip || { date: todayISO(), miles: 0, purpose: "", fromTo: "", notes: "" };
  const date = el("input", { class: "input", type: "date", value: t.date || "" });
  const miles = el("input", { class: "input", type: "number", min: "0", step: "0.1", value: t.miles ?? "" });
  const purpose = el("input", { class: "input", value: t.purpose || "", placeholder: "e.g. Studio shoot for Brand X" });
  const fromAddr = el("input", { class: "input", value: t.fromAddr || "", placeholder: "Start address" });
  const toAddr = el("input", { class: "input", value: t.toAddr || "", placeholder: "End address" });
  const fromTo = el("input", { class: "input", value: t.fromTo || "", placeholder: "Home → Studio" });
  const notes = el("textarea", { class: "textarea" }, t.notes || "");
  const mapsLink = el("div", { class: "small muted" });
  const refreshMaps = () => {
    if (fromAddr.value && toAddr.value) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromAddr.value)}&destination=${encodeURIComponent(toAddr.value)}`;
      mapsLink.innerHTML = `<a href="${url}" target="_blank" rel="noreferrer">Open route in Google Maps ↗</a>`;
    } else mapsLink.textContent = "Add both addresses to generate a Maps link.";
  };
  fromAddr.addEventListener("input", refreshMaps);
  toAddr.addEventListener("input", refreshMaps);
  refreshMaps();

  const body = el("div", { class: "form-grid" },
    field("Date", date),
    field("Miles", miles),
    field("Purpose", purpose, true),
    field("From address", fromAddr),
    field("To address", toAddr),
    el("div", { class: "field full" }, mapsLink),
    field("From → To (label)", fromTo, true),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!miles.value) { toast("Miles required", "warn"); return; }
    Mileage.save({
      id: t.id,
      date: date.value,
      miles: +miles.value || 0,
      purpose: purpose.value.trim(),
      fromAddr: fromAddr.value.trim(),
      toAddr: toAddr.value.trim(),
      fromTo: fromTo.value.trim(),
      notes: notes.value,
    });
    toast(isNew ? "Trip logged" : "Trip updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Log trip" : "Save"),
  );
  m = openModal({ title: isNew ? "Log mileage" : "Edit trip", body, footer });
  setTimeout(() => miles.focus(), 30);
}

