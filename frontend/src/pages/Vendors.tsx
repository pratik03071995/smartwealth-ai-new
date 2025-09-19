import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildApiUrl } from "../services/api";
import { CompanyLogo } from "../utils/logos";

/* =========== Types =========== */
type Row = {
  company: string;
  ticker: string;
  relation_type: string;
  counterparty_name: string;
  counterparty_type?: string;
  tier?: string | number;
  category?: string;
  component_or_product?: string;
  region?: string;
  relationship_strength?: number | string;
  est_contract_value_usd_m?: number | string;
  start_year?: number | string;
  notes?: string;
  is_dummy?: boolean | number | string;
  counterparty_ticker?: string;
  cp_ticker?: string;
};
type VendorsResp = { count: number; items: Row[]; cached_at?: string; error?: string };

type Aggregate = {
  name: string;
  side: "supplier" | "customer";
  usdM: number;
  strength: number;
  regions: string[];
  tiers: string[];
  categories: string[];
  products: string[];
  notes: string[];
  isDummy: boolean;
  rows: Row[];
  inferredTicker?: string | null;
};

type Node = {
  id: string;
  label: string;
  side: "center" | "supplier" | "customer";
  rPx: number;
  strength: number;
  usdM: number | null;
  regions: string[];
  tiers: string[];
  categories: string[];
  products: string[];
  notes?: string;
  isDummy?: boolean;
  count: number;
  x: number;
  y: number;
  inferredTicker?: string | null;
};

type Link = {
  source: string;
  target: string;
  weight: number;
  side: "supplier" | "customer";
  iconType?: string;
  length?: number;
};

/* =========== Helpers =========== */
const toNum = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.\-]/g, "")) : Number(v);
  return Number.isNaN(n) ? null : n;
};

const abbrevMoney = (n: number | null): string => {
  if (n === null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(0);
};

const title = (s?: string) => (s || "").trim();

const uniq = (arr: (string | number | undefined | null)[]) =>
  Array.from(new Set(arr.map((x) => (x == null ? "" : String(x).trim())).filter(Boolean)));

const normalizeRel = (rel: string) => {
  const t = (rel || "").toLowerCase();
  if (t.includes("supplier")) return "supplier";
  if (t.includes("customer")) return "customer";
  return rel || "other";
};

function extractTickerFromName(name: string): string | null {
  const m = name.match(/\(([A-Z][A-Z0-9.\-]{1,12})\)/);
  return m ? m[1] : null;
}

function detectIconType(name: string, products: string[], categories: string[], ticker?: string | null): string {
  const s = `${name} ${products.join(" ")} ${categories.join(" ")}`.toLowerCase();
  const t = (ticker || "").toUpperCase();
  if (["TSM", "NVDA", "AMD", "INTC", "ASML", "MU", "QCOM", "AVGO"].includes(t)) return "chip";
  if (["TSLA", "F", "GM", "TM", "HMC", "RIVN", "LCID"].includes(t)) return "car";
  if (["MSFT", "GOOG", "GOOGL", "AMZN", "ORCL", "CRM", "NOW", "SNOW"].includes(t)) return "cloud";
  if (/chip|semi|gpu|asic|foundry|wafer|silicon/.test(s)) return "chip";
  if (/auto|vehicle|car|ev/.test(s)) return "car";
  if (/cloud|saas|compute|storage|api|azure|aws|gcp/.test(s)) return "cloud";
  if (/battery|cathode|anode|pack/.test(s)) return "battery";
  if (/display|oled|lcd|panel/.test(s)) return "display";
  if (/sensor|camera|lidar|radar/.test(s)) return "sensor";
  if (/bank|payments|fintech|visa|mastercard/.test(s)) return "bank";
  return "package";
}

/* =========== Combobox =========== */
function CompanyCombobox({ label, items, value, onPick, placeholder }: {
  label: string;
  items: { key: string; label: string }[];
  value: string;
  onPick: (label: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => setQ(value), [value]);

  const filtered = useMemo(() => {
    const s = (q || "").toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(s)).slice(0, 200);
  }, [items, q]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as any)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="text-xs text-[var(--muted)]">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 shadow-[0_10px_32px_rgba(8,12,35,0.35)]">
        <input
          value={open ? q : value}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const pick = filtered[hi] || filtered[0];
              if (pick) {
                onPick(pick.label);
                setOpen(false);
              }
            }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
        {value && (
          <button
          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick("")}
            title="Clear"
          >
            ×
          </button>
        )}
        <button
          className="ml-auto text-[var(--muted)] hover:text-[var(--text)]"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          title="Toggle"
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="absolute z-[1200] mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[var(--border)]/70 bg-[#080f25]/95 p-1 shadow-[0_28px_60px_rgba(8,12,35,0.6)] backdrop-blur">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">No matches</div>
          ) : (
            filtered.map((it, i) => (
              <div
                key={it.key}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(it.label);
                  setOpen(false);
                }}
                className={`flex cursor-pointer items-center rounded-xl px-3 py-2 text-sm transition ${
                  hi === i ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span className="truncate">{it.label}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const SIDE_STYLES = {
  supplier: {
    gradient: "from-[#76fcb9]/30 to-[#3cc4ff]/12",
    border: "border-[#76fcb9]/35",
    badge: "text-[#76fcb9]",
    badgeColor: "#76fcb9",
    chip: "bg-[#76fcb9]/18 border-[#76fcb9]/25 text-[#b9ffe8]",
  },
  customer: {
    gradient: "from-[#ff9add]/25 to-[#7f5bff]/12",
    border: "border-[#b28bff]/35",
    badge: "text-[#d5b3ff]",
    badgeColor: "#d5b3ff",
    chip: "bg-[#7f5bff]/18 border-[#7f5bff]/28 text-[#e9ddff]",
  },
} as const;

type Accent = typeof SIDE_STYLES[keyof typeof SIDE_STYLES];

/* =========== Page =========== */
export default function Vendors() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [companyQuery, setCompanyQuery] = useState("");
  const [selected, setSelected] = useState<{ company: string; ticker: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("vendor:selected") || "null");
    } catch {
      return null;
    }
  });

  const [filterRel, setFilterRel] = useState<"all" | "supplier" | "customer">("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(buildApiUrl("vendors/network"));
        const j: VendorsResp = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancel) setRows(j.items || []);
      } catch (e: any) {
        if (!cancel) setErr(e?.message || "Failed to load vendor network");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const companies = useMemo(() => {
    const m = new Map<string, { company: string; ticker: string; count: number }>();
    for (const r of rows) {
      const c = title(r.company);
      const t = (r.ticker || "").toUpperCase();
      const key = `${c}||${t}`;
      if (!m.has(key)) m.set(key, { company: c, ticker: t, count: 0 });
      m.get(key)!.count += 1;
    }
    return Array.from(m.values())
      .filter((x) => x.company || x.ticker)
      .sort((a, b) => a.company.localeCompare(b.company || b.ticker));
  }, [rows]);

  const activeRows = useMemo(() => {
    if (!selected) return [];
    const { company, ticker } = selected;
    return rows.filter(
      (r) => title(r.company) === company && (r.ticker || "").toUpperCase() === ticker
    );
  }, [rows, selected]);

  const regionChoices = useMemo(() => {
    const s = new Set<string>();
    for (const r of activeRows) if (r.region) s.add(String(r.region));
    return ["all", ...Array.from(s).sort()];
  }, [activeRows]);

  const tierChoices = useMemo(() => {
    const s = new Set<string>();
    for (const r of activeRows) if (r.tier != null && r.tier !== "") s.add(String(r.tier));
    return ["all", ...Array.from(s).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))];
  }, [activeRows]);

  const filtered = useMemo(() => {
    let out = activeRows;
    if (filterRel !== "all") out = out.filter((r) => normalizeRel(r.relation_type) === filterRel);
    if (filterRegion !== "all") out = out.filter((r) => String(r.region) === filterRegion);
    if (filterTier !== "all") out = out.filter((r) => String(r.tier) === filterTier);
    return out;
  }, [activeRows, filterRel, filterRegion, filterTier]);

  const graph = useMemo(() => {
    if (!selected)
      return {
        nodes: [] as Node[],
        links: [] as Link[],
        counts: { suppliers: 0, customers: 0 },
        dim: { W: 640, H: 420 },
        aggregates: { suppliers: [] as Aggregate[], customers: [] as Aggregate[] },
      };

    const centerId = `center:${selected.ticker}`;
    const nodes: Node[] = [];
    const links: Link[] = [];

    const w = 640;
    const h = 420;

    const suppliers = filtered.filter((r) => normalizeRel(r.relation_type) === "supplier");
    const customers = filtered.filter((r) => normalizeRel(r.relation_type) === "customer");

    const aggMap = new Map<string, Aggregate>();
    const addAgg = (r: Row, side: "supplier" | "customer") => {
      const key = `${side}::${(r.counterparty_name || "").toLowerCase().trim()}`;
      const usd = toNum(r.est_contract_value_usd_m) || 0;
      const sRaw = toNum(r.relationship_strength);
      const s =
        sRaw == null
          ? 0.5
          : sRaw > 1
          ? Math.max(0, Math.min(1, sRaw / 100))
          : Math.max(0, Math.min(1, sRaw));
      const inferredTicker =
        (r.counterparty_ticker || r.cp_ticker || extractTickerFromName(r.counterparty_name || "")) || null;
      const a =
        aggMap.get(key) ||
        ({
          name: r.counterparty_name || "Unknown",
          side,
          usdM: 0,
          strength: 0,
          regions: [],
          tiers: [],
          categories: [],
          products: [],
          notes: [],
          isDummy: !!r.is_dummy,
          rows: [],
          inferredTicker,
        } as Aggregate);
      a.usdM += usd;
      a.strength = Math.max(a.strength, s);
      a.regions = uniq([...a.regions, r.region]);
      a.tiers = uniq([...a.tiers, r.tier]);
      a.categories = uniq([...a.categories, r.category]);
      a.products = uniq([...a.products, r.component_or_product]);
      if (r.notes) a.notes.push(String(r.notes));
      a.isDummy = a.isDummy || !!r.is_dummy;
      a.rows.push(r);
      if (!a.inferredTicker && inferredTicker) a.inferredTicker = inferredTicker;
      aggMap.set(key, a);
    };
    suppliers.forEach((r) => addAgg(r, "supplier"));
    customers.forEach((r) => addAgg(r, "customer"));

    const aggs = Array.from(aggMap.values());
    const vmax = Math.max(1, ...aggs.map((a) => a.usdM || 0));
    const rFor = (usdM: number) => Math.max(10, Math.min(28, 10 + (usdM / vmax) * 18));

    const colX = { left: -220, center: 0, right: 220 };
    const ySpread = (n: number) => {
      const gap = 340 / Math.max(1, n);
      const top = -((n - 1) * gap) / 2;
      return (i: number) => top + i * gap;
    };

    const leftAgg = aggs.filter((a) => a.side === "supplier");
    const rightAgg = aggs.filter((a) => a.side === "customer");
    const yLeft = ySpread(leftAgg.length);
    const yRight = ySpread(rightAgg.length);

    nodes.push({
      id: centerId,
      label: selected.company,
      side: "center",
      rPx: 30,
      strength: 1,
      usdM: null,
      regions: [],
      tiers: [],
      categories: [],
      products: [],
      notes: "",
      isDummy: false,
      count: filtered.length,
      x: colX.center,
      y: 0,
      inferredTicker: selected.ticker,
    });

    leftAgg.forEach((a, i) => {
      const id = `supplier:${a.name}:${i}`;
      nodes.push({
        id,
        label: a.name,
        side: "supplier",
        rPx: rFor(a.usdM),
        strength: a.strength,
        usdM: a.usdM || null,
        regions: a.regions,
        tiers: a.tiers,
        categories: a.categories,
        products: a.products,
        notes: uniq(a.notes).join(" • "),
        isDummy: a.isDummy,
        count: a.rows.length,
        x: colX.left,
        y: yLeft(i),
        inferredTicker: a.inferredTicker || null,
      });
      links.push({
        source: id,
        target: centerId,
        weight: 1 + a.strength * 4,
        side: "supplier",
        iconType: detectIconType(a.name, a.products, a.categories, a.inferredTicker),
      });
    });

    rightAgg.forEach((a, i) => {
      const id = `customer:${a.name}:${i}`;
      nodes.push({
        id,
        label: a.name,
        side: "customer",
        rPx: rFor(a.usdM),
        strength: a.strength,
        usdM: a.usdM || null,
        regions: a.regions,
        tiers: a.tiers,
        categories: a.categories,
        products: a.products,
        notes: uniq(a.notes).join(" • "),
        isDummy: a.isDummy,
        count: a.rows.length,
        x: colX.right,
        y: yRight(i),
        inferredTicker: a.inferredTicker || null,
      });
      links.push({
        source: centerId,
        target: id,
        weight: 1 + a.strength * 4,
        side: "customer",
        iconType: detectIconType(a.name, a.products, a.categories, a.inferredTicker),
      });
    });

    return {
      nodes,
      links,
      counts: { suppliers: leftAgg.length, customers: rightAgg.length },
      dim: { W: w, H: h },
      aggregates: { suppliers: leftAgg, customers: rightAgg },
    };
  }, [filtered, selected]);

  const supplierAggregates = graph.aggregates.suppliers;
  const customerAggregates = graph.aggregates.customers;

  const companyItems = useMemo(
    () => companies.map((c) => ({ key: `${c.company}||${c.ticker}`, label: `${c.company} (${c.ticker || "?"})` })),
    [companies]
  );

  const handleCompanyPick = (label: string) => {
    const m = label.match(/^(.*)\s+\(([A-Z0-9.\-]+)\)\s*$/);
    setCompanyQuery(label);
    if (!m) {
      setSelected(null);
      localStorage.removeItem("vendor:selected");
      return;
    }
    const s = { company: m[1].trim(), ticker: m[2].trim().toUpperCase() };
    setSelected(s);
    localStorage.setItem("vendor:selected", JSON.stringify(s));
  };

  const summary = useMemo(() => {
    if (!selected) return null;
    const all = [...supplierAggregates, ...customerAggregates];
    if (!all.length)
      return {
        suppliers: supplierAggregates.length,
        customers: customerAggregates.length,
        totalContract: 0,
        uniqueRegions: 0,
        tiers: 0,
        connections: filtered.length,
      };
    const contract = all.reduce((acc, item) => acc + (item.usdM || 0), 0);
    const regions = new Set<string>();
    const tiers = new Set<string>();
    all.forEach((item) => {
      item.regions.forEach((r) => r && regions.add(String(r)));
      item.tiers.forEach((t) => t && tiers.add(String(t)));
    });
    return {
      suppliers: supplierAggregates.length,
      customers: customerAggregates.length,
      totalContract: contract,
      uniqueRegions: regions.size,
      tiers: tiers.size,
      connections: filtered.length,
    };
  }, [selected, supplierAggregates, customerAggregates, filtered.length]);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6 md:py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-extrabold">Vendor Network Intelligence</h1>
        <p className="text-sm text-[var(--muted)]">
          Explore supplier and customer relationships with live metrics pulled from the SmartWealth warehouse.
        </p>
        {rows.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)]/60 bg-[var(--panel)]/60 px-3 py-1 text-xs text-[var(--muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--brand2)]" />
            {rows.length.toLocaleString()} relationships · {companies.length.toLocaleString()} companies
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="rounded-3xl border border-[var(--border)]/60 bg-[var(--panel)]/70 p-5 shadow-[0_24px_60px_rgba(8,12,35,0.45)]">
            <CompanyCombobox
              label="Select company"
              items={companyItems}
              value={companyQuery}
              onPick={handleCompanyPick}
              placeholder="Type to search… e.g., NVIDIA (NVDA)"
            />
            <p className="mt-3 text-xs text-[var(--muted)]">
              Choose a hub company to load its ecosystem of suppliers and downstream customers.
            </p>
          </div>

          <div className="rounded-3xl border border-[var(--border)]/60 bg-[var(--panel)]/65 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => {
                  setFilterRel("all");
                  setFilterRegion("all");
                  setFilterTier("all");
                }}
              >
                Reset
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Relation</label>
                <select
                  value={filterRel}
                  onChange={(e) => setFilterRel(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)]/80 px-3 py-2 text-sm outline-none focus:border-[var(--brand2)]/60 focus:ring-2 focus:ring-[var(--brand2)]/30"
                >
                  <option value="all">All</option>
                  <option value="supplier">Suppliers</option>
                  <option value="customer">Customers</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Region</label>
                <select
                  value={filterRegion}
                  onChange={(e) => setFilterRegion(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)]/80 px-3 py-2 text-sm outline-none focus:border-[var(--brand2)]/60 focus:ring-2 focus:ring-[var(--brand2)]/30"
                >
                  {regionChoices.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Tier</label>
                <select
                  value={filterTier}
                  onChange={(e) => setFilterTier(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)]/80 px-3 py-2 text-sm outline-none focus:border-[var(--brand2)]/60 focus:ring-2 focus:ring-[var(--brand2)]/30"
                >
                  {tierChoices.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {selected && summary && <SummaryPanel summary={summary} selected={selected} />}
        </aside>

        <main className="space-y-6">
          <div className="rounded-3xl border border-[var(--border)]/50 bg-[radial-gradient(circle_at_top,_rgba(124,140,255,0.18),rgba(10,22,48,0.35))] p-4 sm:p-6 shadow-[0_28px_60px_rgba(10,16,48,0.45)]">
            {selected ? (
              <NetworkCanvas selected={selected} graph={graph} />
            ) : (
              <div className="grid h-64 place-items-center text-sm text-[var(--muted)]">
                Select a company to visualise its supplier & customer graph.
              </div>
            )}
          </div>

          <Legend suppliers={graph.counts.suppliers} customers={graph.counts.customers} />

          {selected && !err && (
            <VendorColumns suppliers={supplierAggregates} customers={customerAggregates} />
          )}
        </main>
      </div>

      {err && (
        <div className="rounded-3xl border border-red-500/30 bg-red-500/15 p-5 text-sm text-red-200">{err}</div>
      )}
    </section>
  );
}

function SummaryPanel({ summary, selected }: { summary: SummaryMetrics; selected: { company: string; ticker: string } }) {
  return (
    <div className="rounded-3xl border border-[var(--border)]/60 bg-[var(--panel)]/70 p-5 shadow-[0_24px_60px_rgba(8,12,35,0.45)]">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 overflow-hidden rounded-2xl border border-[var(--border)]/60 bg-[var(--panel)]/80">
          <CompanyLogo symbol={selected.ticker} name={selected.company} className="h-full w-full" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Overview</div>
          <div className="text-lg font-semibold text-[var(--text)]">{selected.company}</div>
          <div className="text-xs text-[var(--muted)]">{selected.ticker}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label="Suppliers"
          value={summary.suppliers}
          caption="Unique upstream partners"
          accent="from-[#76fcb9] to-[#3cc4ff]"
        />
        <SummaryCard
          label="Customers"
          value={summary.customers}
          caption="Downstream counterparties"
          accent="from-[#ff9add] to-[#7f5bff]"
        />
        <SummaryCard
          label="Est. contract"
          value={summary.totalContract ? `$${abbrevMoney(summary.totalContract)}+` : "Not disclosed"}
          caption="Aggregate USD (M)"
          accent="from-[#fdf06f] to-[#fc924c]"
        />
        <SummaryCard
          label="Footprint"
          value={`${summary.uniqueRegions} regions`}
          caption={`${summary.tiers} tiers • ${summary.connections} rows`}
          accent="from-[#7cf0ff] to-[#3bb0ff]"
        />
      </div>
    </div>
  );
}

type SummaryMetrics = {
  suppliers: number;
  customers: number;
  totalContract: number;
  uniqueRegions: number;
  tiers: number;
  connections: number;
};

function SummaryCard({ label, value, caption, accent }: { label: string; value: React.ReactNode; caption?: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]/45 bg-[var(--panel)]/70 p-4">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-2xl font-bold text-[var(--text)]">{value}</div>
      {caption && <div className="mt-1 text-[11px] text-[var(--muted)]">{caption}</div>}
    </div>
  );
}

function VendorColumns({ suppliers, customers }: { suppliers: Aggregate[]; customers: Aggregate[] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ColumnBlock title="Suppliers" items={suppliers} accent={SIDE_STYLES.supplier} />
        <ColumnBlock title="Customers" items={customers} accent={SIDE_STYLES.customer} align="right" />
      </div>
    </div>
  );
}

function ColumnBlock({
  title,
  items,
  accent,
  align = "left",
}: {
  title: string;
  items: Aggregate[];
  accent: Accent;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "space-y-3 md:items-end" : "space-y-3"}>
      <div className={`flex items-center justify-between ${align === "right" ? "md:flex-row-reverse md:space-x-reverse" : ""}`}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-[var(--muted)]">{items.length} counterparties</span>
      </div>
      <AnimatePresence initial={false}>
        {items.map((item, idx) => (
          <motion.div
            key={`${title}-${item.name}-${idx}`}
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <VendorCard item={item} accent={accent} />
          </motion.div>
        ))}
      </AnimatePresence>
      {items.length === 0 && <EmptyState text={`No ${title.toLowerCase()} match the current filters.`} align={align} />}
    </div>
  );
}

function VendorCard({ item, accent }: { item: Aggregate; accent: Accent }) {
  const strength = Math.round((item.strength || 0) * 100);
  const regions = item.regions.filter(Boolean);
  const tiers = item.tiers.filter(Boolean);
  const categories = item.categories.filter(Boolean);
  const products = item.products.filter(Boolean);
  const notes = Array.from(new Set(item.notes.filter(Boolean))).slice(0, 2);

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-[var(--panel)]/82 p-4 transition-all duration-200 ease-out ${accent.border} hover:border-white/40 hover:-translate-y-1`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-80`} />
      <div className="relative space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)]/60 bg-[var(--panel)]/80">
            <CompanyLogo symbol={item.inferredTicker} name={item.name} className="h-full w-full" fallback={item.name} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold text-[var(--text)]">{item.name}</div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${accent.badge}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {item.side === "supplier" ? "Supplier" : "Customer"}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {products.slice(0, 2).join(" • ") || categories.slice(0, 2).join(" • ") || "No product metadata"}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <StatPill label="Strength" value={`${strength}%`} accent={accent} />
          <StatPill label="Contracts" value={item.rows.length} caption="relationships" accent={accent} />
          <StatPill label="Est. value" value={item.usdM ? `$${abbrevMoney(item.usdM)}+` : "Not disclosed"} accent={accent} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip accent={accent}>{regions.length ? regions.join(" • ") : "Region N/A"}</Chip>
          <Chip accent={accent}>{tiers.length ? `Tier ${tiers.join(", ")}` : "Tier N/A"}</Chip>
          <Chip accent={accent}>{item.usdM ? `${item.rows.length} line items` : "Qualitative only"}</Chip>
        </div>

        {notes.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)]/40 bg-black/15 px-3 py-2 text-[11px] text-[var(--muted)]">
            {notes.join(" • ")}
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, caption, accent }: { label: string; value: React.ReactNode; caption?: string; accent: Accent }) {
  return (
    <div
      className="rounded-2xl border border-[var(--border)]/40 bg-[var(--panel)]/70 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 26px rgba(8,12,35,0.22)" }}
    >
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold" style={{ color: accent.badgeColor }}>{value}</div>
      {caption && <div className="text-[10px] text-[var(--muted)]">{caption}</div>}
    </div>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent: Accent }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] leading-tight ${accent.chip}`}>
      {children}
    </span>
  );
}

function EmptyState({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <div className={`rounded-2xl border border-dashed border-[var(--border)]/40 bg-[var(--panel)]/40 px-4 py-3 text-xs text-[var(--muted)] ${align === "right" ? "md:text-right" : ""}`}>
      {text}
    </div>
  );
}

/* =========== Network Canvas =========== */
function NetworkCanvas({ selected, graph }: { selected: { company: string; ticker: string }; graph: { nodes: Node[]; links: Link[]; dim: { W: number; H: number } } }) {
  const [hover, setHover] = useState<string | null>(null);
  const [modalNode, setModalNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => setZoom(1), [selected]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.65, Math.min(1.6, z + (e.deltaY > 0 ? -0.08 : 0.08))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const { nodes, links, dim } = graph;
  const tipNode = hover ? nodes.find((n) => n.id === hover) : null;

  const W = dim.W;
  const H = dim.H;

  return (
    <div className="rounded-2xl border border-[var(--border)]/50 bg-[var(--bg)]/[0.25] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="font-semibold text-sm text-[var(--text)]">
          {selected.company} ({selected.ticker})
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-white/5" onClick={() => setZoom((z) => Math.max(0.65, z - 0.1))}>
            −
          </button>
          <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-white/5" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>
            +
          </button>
          <button className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-white/5" onClick={() => setZoom(1)}>
            Reset
          </button>
        </div>
      </div>

      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-xl bg-[var(--panel)]/70">
        <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} className="block" shapeRendering="geometricPrecision">
          <defs>
            <linearGradient id="grad-supplier" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#76fcb9" />
              <stop offset="100%" stopColor="#3cc4ff" />
            </linearGradient>
            <linearGradient id="grad-customer" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d5b3ff" />
              <stop offset="100%" stopColor="#7f5bff" />
            </linearGradient>
          </defs>

          <g transform={`translate(${W / 2} ${H / 2}) scale(${zoom})`}>
            {links.map((l, i) => {
              const s = nodes.find((n) => n.id === l.source)!;
              const t = nodes.find((n) => n.id === l.target)!;
              const sel = hover && (hover === s.id || hover === t.id);
              const grad = l.side === "supplier" ? "url(#grad-supplier)" : "url(#grad-customer)";
              const w = sel ? l.weight + 0.6 : l.weight + 0.25;
              return (
                <line
                  key={`base-${i}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={grad}
                  strokeWidth={Math.max(1.2, w * 0.3)}
                  strokeLinecap="round"
                  strokeOpacity={sel ? 0.4 : 0.22}
                />
              );
            })}

            {links.map((l, i) => {
              const s = nodes.find((n) => n.id === l.source)!;
              const t = nodes.find((n) => n.id === l.target)!;
              const sel = hover && (hover === s.id || hover === t.id);
              const x1 = s.x;
              const y1 = s.y;
              const x2 = t.x;
              const y2 = t.y;
              const L = Math.hypot(x2 - x1, y2 - y1);
              const grad = l.side === "supplier" ? "url(#grad-supplier)" : "url(#grad-customer)";
              const w = sel ? l.weight + 0.9 : l.weight + 0.5;
              return (
                <line
                  key={`solid-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={grad}
                  strokeWidth={Math.max(1.9, w * 0.38)}
                  strokeLinecap="round"
                  strokeOpacity={sel ? 0.92 : 0.7}
                />
              );
            })}

            {links.map((l, i) => {
              const s = nodes.find((n) => n.id === l.source)!;
              const t = nodes.find((n) => n.id === l.target)!;
              const sel = hover && (hover === s.id || hover === t.id);
              const x1 = s.x;
              const y1 = s.y;
              const x2 = t.x;
              const y2 = t.y;
              const L = Math.hypot(x2 - x1, y2 - y1);
              const grad = l.side === "supplier" ? "url(#grad-supplier)" : "url(#grad-customer)";
              const dash = L > 220 ? "14 26" : L > 160 ? "10 22" : "6 18";
              const w = sel ? l.weight + 0.6 : l.weight + 0.1;
              const angle = Math.atan2(y2 - y1, x2 - x1);
              const arrowX = x1 + (x2 - x1) * 0.58;
              const arrowY = y1 + (y2 - y1) * 0.58;
              return (
                <g key={`overlay-${i}`}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={grad}
                    strokeWidth={Math.max(1.3, w * 0.3)}
                    strokeLinecap="round"
                    strokeOpacity={sel ? 0.85 : 0.48}
                    strokeDasharray={dash}
                    style={dash ? { animation: "flow 28s linear infinite" } : undefined}
                  />
                  <g transform={`translate(${arrowX} ${arrowY}) rotate(${(angle * 180) / Math.PI})`}>
                    <polygon points="0,0 -10,6 -10,-6" fill={l.side === "supplier" ? "#76fcb9" : "#b28bff"} opacity={sel ? 0.95 : 0.75} />
                  </g>
                </g>
              );
            })}

            {nodes.map((n) => {
              const isCenter = n.side === "center";
              const r = isCenter ? 30 : Math.max(12, Math.min(28, n.rPx));
              const glow = hover === n.id ? "0 0 22px rgba(255,255,255,.35)" : "0 0 0 rgba(0,0,0,0)";
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => !isCenter && setModalNode(n)}
                  style={{ cursor: isCenter ? "default" : "pointer", filter: `drop-shadow(${glow})` }}
                >
                  <circle cx={n.x} cy={n.y} r={r + 4} fill="transparent" stroke="white" strokeOpacity={0.12} />
                  <circle cx={n.x} cy={n.y} r={r} fill="var(--panel)" stroke="var(--border)" strokeWidth={1.2} />
                  <foreignObject x={n.x - r + 4} y={n.y - r + 4} width={2 * (r - 4)} height={2 * (r - 4)}>
                    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--border)]/40 bg-[var(--panel)]/60">
                      <CompanyLogo symbol={n.inferredTicker} name={n.label} className="h-full w-full" fallback={n.label} />
                    </div>
                  </foreignObject>
                  <text x={n.x} y={n.y + r + 14} textAnchor="middle" className="fill-[var(--text)]" style={{ fontSize: "10px" }}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>

          <style>{`@keyframes flow { to { stroke-dashoffset: -600; } }`}</style>
        </svg>

        {tipNode && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--panel)]/95 px-3 py-2 text-[11px]" style={{ boxShadow: "0 2px 18px rgba(0,0,0,0.22)" }}>
            <div className="font-semibold text-[var(--text)]">{tipNode.label}</div>
            <div className="text-[var(--muted)]">
              {tipNode.side === "supplier"
                ? "Supplier → Hub"
                : tipNode.side === "customer"
                ? "Hub → Customer"
                : "Hub"}
            </div>
            <div>Est. Contract: {abbrevMoney(tipNode.usdM)}</div>
            <div>Rel. Strength: {(tipNode.strength * 100).toFixed(0)}%</div>
            {!!tipNode.tiers.length && <div>Tier: {tipNode.tiers.join(", ")}</div>}
            {!!tipNode.regions.length && <div>Region: {tipNode.regions.join(", ")}</div>}
          </div>
        )}
      </div>

      {modalNode && <NodeModal node={modalNode} onClose={() => setModalNode(null)} />}
    </div>
  );
}

/* =========== Legend & Modal =========== */
function Legend({ suppliers, customers }: { suppliers: number; customers: number }) {
  return (
    <div className="mt-2 mb-4 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
      <span className="inline-flex items-center gap-2"><span className="inline-block h-[10px] w-[18px] rounded border border-[#76fcb9]/40 bg-[#76fcb9]/20" /> Supplier <span className="opacity-70">({suppliers})</span></span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-[10px] w-[18px] rounded border border-[#b28bff]/40 bg-[#b28bff]/20" /> Customer <span className="opacity-70">({customers})</span></span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border border-white/30" /> Node size = est. contract value</span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-1.5 w-6 rounded bg-white/60" /> Stroke width = relationship strength</span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-1.5 w-6 rounded bg-white/60" /> Chevron indicates direction of flow</span>
    </div>
  );
}

function NodeModal({ node, onClose }: { node: Node; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5">
          Close
        </button>
        <div className="mb-3">
          <div className="text-lg font-semibold">{node.label}</div>
          <div className="text-xs text-[var(--muted)]">
            {node.side === "supplier" ? "Supplier" : node.side === "customer" ? "Customer" : "Hub"}
            {node.count > 1 ? ` • ${node.count} links` : ""}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Est. Contract" value={abbrevMoney(node.usdM)} />
          <Info label="Rel. Strength" value={`${(node.strength * 100).toFixed(0)}%`} />
          <Info label="Tier(s)" value={node.tiers.length ? node.tiers.join(", ") : "—"} />
          <Info label="Region(s)" value={node.regions.length ? node.regions.join(", ") : "—"} />
          <Info label="Category" value={node.categories.length ? node.categories.join(", ") : "—"} />
          <Info label="Product" value={node.products.length ? node.products.join(", ") : "—"} />
          <div className="col-span-2">
            <div className="mb-1 text-xs text-[var(--muted)]">Notes</div>
            <div className="min-h-[48px] rounded-xl border border-[var(--border)] p-2 text-sm">{node.notes || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="font-medium text-white/90">{value}</div>
    </div>
  );
}
