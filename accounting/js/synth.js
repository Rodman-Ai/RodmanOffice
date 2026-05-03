// Synthetic data generator: fictional brand names, 6-year growth curve, expenses.
// Deterministic per-seed so the demo is repeatable.

import { uid, Deals, Bills, Contacts, Settings } from "./store.js";

// Seeded RNG so generated data is stable across reloads.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RNG = mulberry32(0xC0FFEE);
const rand = () => RNG();
const rint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

// Fictional creator-economy / B2B SaaS startups
const FAKE_BRANDS = [
  "Lumira AI", "Vortex Studio", "Quantra Labs", "Nebulink", "Stratos HQ",
  "Pixelmint", "Cobalt Stack", "Helio Cloud", "Apex Forge", "Lattice IO",
  "Echoware", "Vivid Loop", "Orbit Tap", "Ember Sync", "Frostfield",
  "Glyphbase", "Halocode", "Kindle Mesh", "Loomstack", "Mesa Wave",
  "Nimbus Grid", "Onyxly", "Prismic", "Runecast", "Slate Bench",
  "Tideway", "Veridian", "Wispr Flow Pro", "Zenith Reels", "Atlas Beam",
  "Boreal Print", "Cinderpath", "Driftboard", "Fluxgate", "Gladewright",
  "Hushframe", "Iristack", "Juniper Pages", "Knotwork", "Larkspur",
  "Maelstrom", "Northwind", "Octolab", "Petalmark", "Quartzly",
  "Riverstone", "Saltcove", "Talonpath", "Underscore Co", "Vellumly",
  "Wattgrid", "Xenoflow", "Yotta Print", "Zephyr Reels", "Aetherly",
  "Bluemark", "Crestfall", "Daybreak Labs", "Edgewise", "Foresight AI",
  "Glassroot", "Heron Hub", "Indigowire", "Joist", "Kairos Books",
  "Lighthouse Type", "Mossly", "Notes & Co", "Oakloop", "Pinecast",
  "Quillstack", "Reverbly", "Sundial", "Truenorth", "Updraft",
  "Vantage Lane", "Wavelength", "Yieldbase", "Zest Reports", "Plume",
  "Mango Build", "Ledgerly", "Spool", "Pivotwise", "Brightspeak",
];

const SERVICES = ["v", "p", "p", "p", "qrt", "rt", "incentive", "c+l", "qrt rt"];
const PAY_METHODS = [
  "Brex eft", "Stripe", "ACH", "limelight", "partnerstack",
  "Wise", "Wire", "Mercury", "Woo", "Airwallex"
];
const POSITIONS = ["Partnerships Manager", "Creator Partnerships Lead", "Marketing Director", "Brand Partner", "Growth Lead"];
const FIRSTS = ["Alex", "Sam", "Jordan", "Riley", "Morgan", "Avery", "Casey", "Drew", "Quinn", "Reese", "Taylor", "Skylar", "Cameron", "Hayden", "Parker", "Sage", "Rowan", "Ellis"];
const LASTS = ["Chen", "Patel", "Rivera", "Okafor", "Nguyen", "Kim", "Sato", "Hassan", "Cohen", "Ortiz", "Park", "Singh", "Mendez", "Lopez", "Walker", "Khan", "Diaz", "Reyes"];

function fakeEmail(first, last, brand) {
  const slug = brand.toLowerCase().replace(/[^a-z]/g, "");
  return `${first.toLowerCase()}.${last.toLowerCase()}@${slug}.com`;
}

function isoFromDate(d) { return d.toISOString().slice(0, 10); }
function dateInMonth(year, month) {
  const day = rint(1, 27);
  return isoFromDate(new Date(year, month - 1, day));
}

// Growth curve: number of deals per year, average net fee, partner-fee likelihood.
// 2026 is YTD; only fill through current month +1 buffer.
function yearProfile(year) {
  const profiles = {
    2021: { count: 14, avgFee: 600,  feeStd: 250,  pPaid: 0.95, pPartner: 0.10 },
    2022: { count: 28, avgFee: 850,  feeStd: 350,  pPaid: 0.93, pPartner: 0.15 },
    2023: { count: 46, avgFee: 1300, feeStd: 500,  pPaid: 0.92, pPartner: 0.20 },
    2024: { count: 72, avgFee: 1900, feeStd: 700,  pPaid: 0.90, pPartner: 0.25 },
    2025: { count: 138, avgFee: 2650, feeStd: 950, pPaid: 0.88, pPartner: 0.28, q4Spike: 1.4 },
    2026: { count: 32, avgFee: 2900, feeStd: 1100, pPaid: 0.55, pPartner: 0.30 }, // YTD, many unpaid
  };
  return profiles[year];
}

// Normal-ish via Box-Muller, clamped.
function randomFee(mean, std) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  let v = mean + z * std;
  v = Math.max(150, v);
  // Snap to typical creator pricing tiers
  v = Math.round(v / 50) * 50;
  return v;
}

function generateContacts(brands) {
  const contacts = [];
  for (const brand of brands) {
    const first = pick(FIRSTS);
    const last = pick(LASTS);
    contacts.push({
      id: uid(),
      name: `${first} ${last}`,
      company: brand,
      email: fakeEmail(first, last, brand),
      phone: chance(0.3) ? `+1 555-${rint(100, 999)}-${rint(1000, 9999)}` : "",
      type: "brand",
      notes: pick(POSITIONS),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return contacts;
}

function generateDeals(contactsByBrand) {
  const deals = [];
  const brands = Object.keys(contactsByBrand);
  const today = new Date();
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1; // 1-12

  for (let year = 2021; year <= thisYear; year++) {
    const p = yearProfile(year);
    if (!p) continue;

    for (let i = 0; i < p.count; i++) {
      const brand = pick(brands);
      const contact = contactsByBrand[brand];
      let month;
      if (year === thisYear) {
        month = rint(1, Math.min(12, thisMonth));
      } else if (p.q4Spike && rand() < 0.4) {
        month = rint(10, 12); // 40% of deals concentrated in Q4
      } else {
        month = rint(1, 12);
      }
      const serviceDate = dateInMonth(year, month);
      const sd = new Date(serviceDate);
      // Post date 0-21 days after service
      const postShift = rint(0, 21);
      const postDate = isoFromDate(new Date(sd.getTime() + postShift * 86400000));
      const draftDue = isoFromDate(new Date(sd.getTime() - rint(2, 7) * 86400000));

      const svc = pick(SERVICES);
      const fee = randomFee(p.avgFee, p.feeStd);
      const partnerPct = chance(p.pPartner) ? pick([2.5, 3, 3.5, 5, 10, 15]) : 0;
      const isPaid = chance(p.pPaid);
      const paidShift = rint(7, 60);
      const paidDate = isPaid ? isoFromDate(new Date(sd.getTime() + paidShift * 86400000)) : "";
      const paidAmount = isPaid ? Math.round(fee * (1 - partnerPct / 100) * 100) / 100 : 0;
      const invDate = chance(0.85) ? isoFromDate(new Date(sd.getTime() + rint(0, 7) * 86400000)) : "";
      const hasPortal = chance(0.4);
      const hasContract = chance(0.7);
      const hasBrief = chance(0.6);
      const hasDraft = chance(isPaid ? 0.95 : 0.5);
      const invNumber = invDate ? `RB-${1000 + deals.length}` : "";

      deals.push({
        id: uid(),
        contactId: contact.id,
        company: brand,
        svc,
        fee,
        partnerFeePct: partnerPct,
        paidAmount,
        paid: isPaid,
        paidDate,
        payMethod: isPaid ? pick(PAY_METHODS) : "",
        serviceDate,
        postDate,
        draftDue,
        contractUrl: hasContract ? `https://docs.example.com/contracts/${uid()}` : "",
        briefUrl: hasBrief ? `https://docs.example.com/briefs/${uid()}` : "",
        draftUrl: hasDraft ? `https://drive.example.com/drafts/${uid()}` : "",
        portalUrl: hasPortal ? `https://portal.${brand.toLowerCase().replace(/[^a-z]/g, "")}.com` : "",
        notesUrl: "",
        invoiceNumber: invNumber,
        invoiceDate: invDate,
        invoiceUrl: invNumber ? `https://invoices.example.com/${invNumber}` : "",
        invoiceTo: chance(0.9) ? `${brand}, Inc.` : "",
        transactionId: isPaid ? `tx_${uid().slice(0, 12)}` : "",
        notes: chance(0.15) ? pick(["delay", "renew Q3?", "great fit", "asked for repost", "ask for upsell", "recurring opp"]) : "",
        year,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // ----- 2025 highlights: retainer, flagship videos, cancellations, repost cadence -----
  // Pick a "retainer" brand: 11 monthly posts at $2,400 each (Feb–Dec 2025)
  const retainerBrand = brands.find((b) => /labs|stack|flow|hub|cloud|grid/i.test(b)) || pick(brands);
  const retainerContact = contactsByBrand[retainerBrand];
  for (let m = 2; m <= 12; m++) {
    const sd = new Date(2025, m - 1, rint(3, 14));
    const post = new Date(sd.getTime() + rint(5, 14) * 86400000);
    const isPaid = m <= 10 || chance(0.5);
    deals.push({
      id: uid(),
      contactId: retainerContact.id,
      company: retainerBrand,
      svc: "p",
      fee: 2400,
      partnerFeePct: 0,
      paidAmount: isPaid ? 2400 : 0,
      paid: isPaid,
      paidDate: isPaid ? isoFromDate(new Date(sd.getTime() + rint(14, 35) * 86400000)) : "",
      payMethod: isPaid ? "Brex eft" : "",
      serviceDate: isoFromDate(sd),
      postDate: isoFromDate(post),
      draftDue: isoFromDate(new Date(sd.getTime() - 4 * 86400000)),
      contractUrl: m === 2 ? `https://docs.example.com/contracts/${uid()}` : `https://docs.example.com/retainer/${retainerBrand.toLowerCase().replace(/[^a-z]/g, "")}-2025`,
      briefUrl: `https://docs.example.com/briefs/${uid()}`,
      draftUrl: `https://drive.example.com/drafts/${uid()}`,
      portalUrl: `https://portal.${retainerBrand.toLowerCase().replace(/[^a-z]/g, "")}.com`,
      notesUrl: "",
      invoiceNumber: `RB-RET-${m.toString().padStart(2, "0")}`,
      invoiceDate: isoFromDate(sd),
      invoiceUrl: `https://invoices.example.com/RB-RET-${m.toString().padStart(2, "0")}`,
      invoiceTo: `${retainerBrand}, Inc.`,
      transactionId: isPaid ? `tx_${uid().slice(0, 12)}` : "",
      notes: m === 2 ? "Retainer kickoff — 11mo · $2400/mo" : "Retainer cycle",
      year: 2025,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Three flagship video deals (Q2/Q3/Q4) at premium fees
  const flagships = [
    { svc: "v", fee: 9500, month: 4, title: "Annual product launch" },
    { svc: "v", fee: 12000, month: 8, title: "Co-marketed deep dive" },
    { svc: "v", fee: 15000, month: 11, title: "Black-Friday hero spot" },
  ];
  for (const f of flagships) {
    const brand = pick(brands.filter((b) => b !== retainerBrand));
    const contact = contactsByBrand[brand];
    const sd = new Date(2025, f.month - 1, rint(5, 18));
    const post = new Date(sd.getTime() + rint(10, 28) * 86400000);
    const partnerPct = chance(0.5) ? 5 : 0;
    deals.push({
      id: uid(),
      contactId: contact.id,
      company: brand,
      svc: f.svc,
      fee: f.fee,
      partnerFeePct: partnerPct,
      paidAmount: f.fee * (1 - partnerPct / 100),
      paid: true,
      paidDate: isoFromDate(new Date(sd.getTime() + rint(30, 70) * 86400000)),
      payMethod: pick(["Wise", "limelight", "ACH", "Brex eft"]),
      serviceDate: isoFromDate(sd),
      postDate: isoFromDate(post),
      draftDue: isoFromDate(new Date(sd.getTime() - 7 * 86400000)),
      contractUrl: `https://docs.example.com/contracts/flagship-${uid()}`,
      briefUrl: `https://docs.example.com/briefs/${uid()}`,
      draftUrl: `https://drive.example.com/drafts/${uid()}`,
      portalUrl: "",
      notesUrl: "",
      invoiceNumber: `RB-FL-${f.month}-25`,
      invoiceDate: isoFromDate(sd),
      invoiceUrl: `https://invoices.example.com/flagship-${f.month}-25`,
      invoiceTo: `${brand}, Inc.`,
      transactionId: `tx_${uid().slice(0, 12)}`,
      notes: f.title,
      year: 2025,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Cancelled / killed deals (svc:x) — useful for filter/funnel testing
  for (let i = 0; i < 4; i++) {
    const brand = pick(brands);
    const contact = contactsByBrand[brand];
    const sd = new Date(2025, rint(0, 11), rint(1, 27));
    deals.push({
      id: uid(),
      contactId: contact.id,
      company: brand,
      svc: "x",
      fee: 0,
      partnerFeePct: 0,
      paidAmount: 0,
      paid: false,
      paidDate: "", payMethod: "",
      serviceDate: isoFromDate(sd),
      postDate: "", draftDue: "",
      contractUrl: chance(0.5) ? `https://docs.example.com/contracts/${uid()}` : "",
      briefUrl: chance(0.4) ? `https://docs.example.com/briefs/${uid()}` : "",
      draftUrl: "", portalUrl: "", notesUrl: "",
      invoiceNumber: "", invoiceDate: "", invoiceUrl: "", invoiceTo: "",
      transactionId: "",
      notes: pick(["killed by brand legal", "scope changed, paused", "budget cut Q3", "ghosted after brief"]),
      year: 2025,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Cluster of small repost / quote-tweet deals (cheap, fast)
  for (let i = 0; i < 8; i++) {
    const brand = pick(brands);
    const contact = contactsByBrand[brand];
    const sd = new Date(2025, rint(0, 11), rint(1, 27));
    const fee = pick([200, 300, 400, 500, 750]);
    const isPaid = chance(0.85);
    deals.push({
      id: uid(),
      contactId: contact.id,
      company: brand,
      svc: pick(["qrt", "rt", "qrt rt", "c+l"]),
      fee,
      partnerFeePct: 0,
      paidAmount: isPaid ? fee : 0,
      paid: isPaid,
      paidDate: isPaid ? isoFromDate(new Date(sd.getTime() + rint(7, 30) * 86400000)) : "",
      payMethod: isPaid ? pick(["Stripe", "PayPal", "Wise"]) : "",
      serviceDate: isoFromDate(sd),
      postDate: isoFromDate(new Date(sd.getTime() + rint(0, 3) * 86400000)),
      draftDue: "",
      contractUrl: "", briefUrl: "", draftUrl: "", portalUrl: "", notesUrl: "",
      invoiceNumber: "", invoiceDate: "", invoiceUrl: "", invoiceTo: "",
      transactionId: isPaid ? `tx_${uid().slice(0, 12)}` : "",
      notes: "", year: 2025,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Add a few "in flight" 2026 deals near the post date
  const recentBoosters = [
    { fee: 3300, svc: "v", paid: true, payMethod: "limelight" },
    { fee: 2100, svc: "p", paid: false },
    { fee: 2700, svc: "p", paid: false },
    { fee: 4500, svc: "v", paid: true, payMethod: "Brex eft" },
    { fee: 1500, svc: "qrt", paid: false },
  ];
  for (const r of recentBoosters) {
    const brand = pick(brands);
    const contact = contactsByBrand[brand];
    const sd = new Date(thisYear, Math.max(0, thisMonth - 2), rint(1, 27));
    deals.push({
      id: uid(),
      contactId: contact.id,
      company: brand,
      svc: r.svc,
      fee: r.fee,
      partnerFeePct: 0,
      paidAmount: r.paid ? r.fee : 0,
      paid: r.paid,
      paidDate: r.paid ? isoFromDate(new Date(sd.getTime() + rint(7, 30) * 86400000)) : "",
      payMethod: r.paid ? r.payMethod : "",
      serviceDate: isoFromDate(sd),
      postDate: isoFromDate(new Date(sd.getTime() + rint(3, 14) * 86400000)),
      draftDue: isoFromDate(new Date(sd.getTime() - 3 * 86400000)),
      contractUrl: `https://docs.example.com/contracts/${uid()}`,
      briefUrl: `https://docs.example.com/briefs/${uid()}`,
      draftUrl: `https://drive.example.com/drafts/${uid()}`,
      portalUrl: "",
      notesUrl: "",
      invoiceNumber: `RB-${2000 + deals.length}`,
      invoiceDate: isoFromDate(sd),
      invoiceUrl: "",
      invoiceTo: `${brand}, Inc.`,
      transactionId: r.paid ? `tx_${uid().slice(0, 12)}` : "",
      notes: "",
      year: thisYear,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return deals;
}

const EXPENSE_CATALOG = [
  { vendor: "Adobe Creative Cloud", category: "Software", amt: [55, 90], recurring: "monthly" },
  { vendor: "Final Cut Pro", category: "Software", amt: [299, 299] },
  { vendor: "Notion Team", category: "Software", amt: [10, 30], recurring: "monthly" },
  { vendor: "Riverside.fm", category: "Software", amt: [24, 30], recurring: "monthly" },
  { vendor: "Backblaze", category: "Software", amt: [9, 18], recurring: "monthly" },
  { vendor: "Frame.io", category: "Software", amt: [15, 25], recurring: "monthly" },
  { vendor: "Descript Pro", category: "Software", amt: [12, 24], recurring: "monthly" },
  { vendor: "ChatGPT Pro", category: "Software", amt: [20, 200], recurring: "monthly" },
  { vendor: "B&H Photo - Lens", category: "Equipment", amt: [400, 2200] },
  { vendor: "B&H Photo - Mic", category: "Equipment", amt: [180, 700] },
  { vendor: "B&H Photo - Lights", category: "Equipment", amt: [220, 900] },
  { vendor: "Apple - Mac upgrade", category: "Equipment", amt: [1800, 4500] },
  { vendor: "Travel - Creator summit", category: "Travel", amt: [350, 1800] },
  { vendor: "Hotel", category: "Travel", amt: [120, 500] },
  { vendor: "Flights", category: "Travel", amt: [180, 900] },
  { vendor: "Coffee meetings", category: "Meals", amt: [25, 120] },
  { vendor: "Client dinner", category: "Meals", amt: [80, 300] },
  { vendor: "Editor (1099)", category: "Contractors", amt: [400, 1500] },
  { vendor: "Thumbnail designer (1099)", category: "Contractors", amt: [200, 600] },
  { vendor: "Bookkeeping", category: "Contractors", amt: [200, 500], recurring: "monthly" },
  { vendor: "Course - Skillshare", category: "Education", amt: [60, 250] },
  { vendor: "Domain renewal", category: "Subscriptions", amt: [12, 30] },
  { vendor: "Email hosting", category: "Subscriptions", amt: [6, 24], recurring: "monthly" },
  { vendor: "Internet (home office)", category: "Phone & Internet", amt: [40, 90], recurring: "monthly" },
  { vendor: "Phone plan", category: "Phone & Internet", amt: [60, 110], recurring: "monthly" },
  { vendor: "Office co-work day pass", category: "Office", amt: [25, 60] },
  { vendor: "Storage unit", category: "Office", amt: [80, 180], recurring: "monthly" },
];

function generateBills() {
  const bills = [];
  const today = new Date();
  const thisYear = today.getFullYear();
  for (let year = 2021; year <= thisYear; year++) {
    // bill volume grows with the business
    const monthsThisYear = year === thisYear ? today.getMonth() + 1 : 12;
    const yearScale = (year - 2020) / 5; // 0.2 → 1.2
    for (let m = 1; m <= monthsThisYear; m++) {
      // recurring software: pick a stable subset, charge them this month
      const recurring = EXPENSE_CATALOG.filter((e) => e.recurring === "monthly" && rand() < 0.7);
      for (const e of recurring) {
        const [lo, hi] = e.amt;
        const amount = Math.round((lo + (hi - lo) * (year >= 2024 ? 0.7 : 0.4)) * 100) / 100;
        bills.push(billRow({
          vendor: e.vendor, category: e.category, amount,
          date: dateInMonth(year, m), recurring: "monthly",
        }));
      }
      // 2-6 one-time bills depending on year
      const oneOff = rint(2, Math.max(2, Math.round(2 + yearScale * 5)));
      for (let i = 0; i < oneOff; i++) {
        const e = pick(EXPENSE_CATALOG.filter((x) => !x.recurring));
        const [lo, hi] = e.amt;
        const amount = Math.round((lo + rand() * (hi - lo)) * 100) / 100;
        bills.push(billRow({
          vendor: e.vendor, category: e.category, amount,
          date: dateInMonth(year, m), recurring: "",
        }));
      }
    }
  }
  return bills;
}

function billRow(b) {
  return {
    id: uid(),
    vendor: b.vendor,
    category: b.category,
    amount: b.amount,
    date: b.date,
    paid: true,
    paidDate: b.date,
    payMethod: pick(["Brex card", "Brex eft", "Amex", "ACH"]),
    recurring: b.recurring || "",
    receiptUrl: "",
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Public entry: generate a full synthetic dataset.
export function buildSyntheticDataset() {
  // Use a curated subset of brands so we have repeat customers.
  const shuffled = [...FAKE_BRANDS].sort(() => rand() - 0.5);
  const used = shuffled.slice(0, 60);
  const contacts = generateContacts(used);
  const contactsByBrand = Object.fromEntries(used.map((b, i) => [b, contacts[i]]));
  const deals = generateDeals(contactsByBrand);
  const bills = generateBills();
  return { contacts, deals, bills };
}
