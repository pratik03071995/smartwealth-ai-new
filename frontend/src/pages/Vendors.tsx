import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../services/api";

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

/* =========== Utils =========== */
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

function normalizeRel(rel: string) {
  const t = (rel || "").toLowerCase();
  if (t.includes("supplier")) return "supplier";
  if (t.includes("customer")) return "customer";
  return rel || "other";
}

/* =========== Logos =========== */
function logoProvidersFromTicker(symbol: string) {
  const sym = (symbol || "").toUpperCase().trim();
  const a = `https://img.logo.dev/ticker/${encodeURIComponent(sym)}?size=128`;
  const b = `https://storage.googleapis.com/iex/api/logos/${encodeURIComponent(sym)}.png`;
  return [a, b];
}
function TickerGlyph({ text }: { text: string }) {
  const init = (text || "?").slice(0, 3).toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold"
         style={{ background: "linear-gradient(90deg, var(--brand2), var(--brand1))", color: "#0A1630" }}>
      {init}
    </div>
  );
}
type LogoCache = Record<string, string | null>;
const LS_KEY = "vendorLogoCache_v1";
const memLogo = new Map<string, string | null>();
function readLsCache(): LogoCache { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function writeLsCache(c: LogoCache) { try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch {} }
function extractTickerFromName(name: string): string | null {
  const m = name.match(/\(([A-Z][A-Z0-9.\-]{1,12})\)/);
  return m ? m[1] : null;
}
function probeImage(url: string): Promise<boolean> {
  return new Promise((res) => { const img = new Image(); img.onload = () => res(true); img.onerror = () => res(false); img.src = url; });
}
function useLogo(name: string, tickerHint?: string) {
  const key = (tickerHint?.toUpperCase() || name.toLowerCase().trim());
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!key) { setUrl(null); return; }
      if (memLogo.has(key)) { setUrl(memLogo.get(key)!); return; }
      const ls = readLsCache(); if (ls[key] !== undefined) { memLogo.set(key, ls[key]); setUrl(ls[key]); return; }
      const cands: string[] = [];
      const ticker = (tickerHint || "").toUpperCase().trim() || extractTickerFromName(name) || "";
      if (ticker) cands.push(...logoProvidersFromTicker(ticker));
      try {
        const resp = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`, { mode: "cors" });
        if (resp.ok) { const js = await resp.json(); if (js?.[0]?.logo) cands.unshift(js[0].logo as string); }
      } catch {}
      for (const u of cands) { if (await probeImage(u)) { if (!cancelled) { memLogo.set(key, u); writeLsCache({ ...ls, [key]: u }); setUrl(u); } return; } }
      if (!cancelled) { memLogo.set(key, null); writeLsCache({ ...ls, [key]: null }); setUrl(null); }
    })();
    return () => { cancelled = true; };
  }, [key, name, tickerHint]);
  return url;
}
function Globe({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="opacity-80">
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--text)" strokeWidth="1.5" />
      <path d="M3 12h18M12 2c3.5 4 3.5 16 0 20M12 2c-3.5 4-3.5 16 0 20" fill="none" stroke="var(--text)" strokeWidth="1.2" />
    </svg>
  );
}
const looksGlobal = (regions?: string[] | string) => {
  const s = Array.isArray(regions) ? regions.join(" ").toLowerCase() : String(regions || "").toLowerCase();
  return /global|worldwide|intl|international/.test(s);
}

/* =========== Graph Types =========== */
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
type Link = { source: string; target: string; weight: number; side: "supplier" | "customer"; iconType?: string };

/* =========== Edge Icon =========== */
function detectIconType(name: string, products: string[], categories: string[], ticker?: string | null): string {
  const s = `${name} ${products.join(" ")} ${categories.join(" ")}`.toLowerCase();
  const t = (ticker || "").toUpperCase();
  if (["TSM","NVDA","AMD","INTC","ASML","MU","QCOM","AVGO"].includes(t)) return "chip";
  if (["TSLA","F","GM","TM","HMC","RIVN","LCID"].includes(t)) return "car";
  if (["MSFT","GOOG","GOOGL","AMZN","ORCL","CRM","NOW","SNOW"].includes(t)) return "cloud";
  if (/chip|semi|gpu|asic|foundry|wafer|silicon/.test(s)) return "chip";
  if (/auto|vehicle|car|ev/.test(s)) return "car";
  if (/cloud|saas|compute|storage|api|azure|aws|gcp/.test(s)) return "cloud";
  if (/battery|cathode|anode|pack/.test(s)) return "battery";
  if (/display|oled|lcd|panel/.test(s)) return "display";
  if (/sensor|camera|lidar|radar/.test(s)) return "sensor";
  if (/bank|payments|fintech|visa|mastercard/.test(s)) return "bank";
  return "package";
}
function EdgeIcon({ type }: { type?: string }) {
  const sz = 14;
  switch (type) {
    case "chip": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="var(--text)" strokeWidth="1.5"/><rect x="10" y="10" width="4" height="4" fill="var(--text)"/></svg>);
    case "car": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><path d="M3 13l2-5h14l2 5v5H3v-5Z" fill="none" stroke="var(--text)" strokeWidth="1.5"/><circle cx="7.5" cy="18" r="1.5" fill="var(--text)"/><circle cx="16.5" cy="18" r="1.5" fill="var(--text)"/></svg>);
    case "cloud": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><path d="M6 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11-1 4 4 0 0 0 1 9Z" fill="none" stroke="var(--text)" strokeWidth="1.5"/></svg>);
    case "battery": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><rect x="3" y="8" width="16" height="8" rx="2" fill="none" stroke="var(--text)" strokeWidth="1.5"/><rect x="5" y="10" width="8" height="4" fill="var(--text)"/><rect x="19" y="10" width="2" height="4" fill="var(--text)"/></svg>);
    case "display": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="var(--text)" strokeWidth="1.5"/><rect x="10" y="17" width="4" height="2" fill="var(--text)"/></svg>);
    case "sensor": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="var(--text)"/><circle cx="12" cy="12" r="7" fill="none" stroke="var(--text)" strokeWidth="1.5" opacity="0.7"/></svg>);
    case "bank": return (<svg width={sz} height={sz} viewBox="0 0 24 24"><path d="M4 10h16L12 5 4 10Z" fill="none" stroke="var(--text)" strokeWidth="1.5"/><path d="M5 10v7h14v-7" fill="none" stroke="var(--text)" strokeWidth="1.5"/></svg>);
    default: return (<svg width={sz} height={sz} viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10" rx="2" fill="none" stroke="var(--text)" strokeWidth="1.5"/><rect x="6" y="9" width="6" height="6" fill="var(--text)"/></svg>);
  }
}

/* =========== Combobox =========== */
function CompanyCombobox({ label, items, value, onPick, placeholder }: {
  label: string; items: { key: string; label: string }[]; value: string; onPick: (label: string) => void; placeholder?: string;
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
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as any)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative z-[1100]">
      <label className="text-xs text-[var(--muted)]">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
        <input
          value={open ? q : value}
          onChange={(e) => { setQ(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, Math.max(0, filtered.length - 1))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); const pick = filtered[hi] || filtered[0]; if (pick) { onPick(pick.label); setOpen(false); } }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
        {value && (
          <button className="text-xs text-[var(--muted)] hover:text-white/80"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick("")}
                  title="Clear">×</button>
        )}
        <button className="ml-auto text-[var(--muted)] hover:text-white/80"
                onMouseDown={(e)=>e.preventDefault()}
                onClick={() => setOpen((o) => !o)} title="Toggle">▾</button>
      </div>
      {open && (
        <div className="absolute z-[1200] mt-2 max-h-72 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl"
             style={{ boxShadow: "0 12px 50px rgba(0,0,0,.35)" }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">No matches</div>
          ) : filtered.map((it, i) => (
            <div key={it.key} onMouseEnter={() => setHi(i)}
                 onMouseDown={(e) => { e.preventDefault(); onPick(it.label); setOpen(false); }}
                 className={`flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm ${hi === i ? "bg-white/10" : "hover:bg-white/5"}`}>
              <span className="truncate">{it.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========== Node badge (logo) =========== */
function NodeBadge({ name, size, regions, tickerHint }: { name: string; size: number; regions?: string[]; tickerHint?: string | null }) {
  const url = useLogo(name, tickerHint || undefined);
  const isGlobal = looksGlobal(regions || []);
  if (url) return <img src={url} alt={name} className="h-full w-full object-contain" />;
  if (isGlobal) return <div className="flex h-full w-full items-center justify-center"><Globe size={Math.max(12, Math.min(22, size - 6))} /></div>;
  return <TickerGlyph text={name} />;
}

/* =========== Page =========== */
export default function Vendors() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [companyQuery, setCompanyQuery] = useState("");
  const [selected, setSelected] = useState<{ company: string; ticker: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem("vendor:selected") || "null"); } catch { return null; }
  });

  const [filterRel, setFilterRel] = useState<"all" | "supplier" | "customer">("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");

  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setErr(null);
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
    return () => { cancel = true; };
  }, []);

  const companies = useMemo(() => {
    const m = new Map<string, { company: string; ticker: string; count: number }>();
    for (const r of rows) {
      const c = title(r.company); const t = (r.ticker || "").toUpperCase(); const key = `${c}||${t}`;
      if (!m.has(key)) m.set(key, { company: c, ticker: t, count: 0 }); m.get(key)!.count += 1;
    }
    return Array.from(m.values()).filter(x => x.company || x.ticker).sort((a,b)=>a.company.localeCompare(b.company || b.ticker));
  }, [rows]);

  const activeRows = useMemo(() => {
    if (!selected) return [];
    const { company, ticker } = selected;
    return rows.filter(r => title(r.company) === company && (r.ticker || "").toUpperCase() === ticker);
  }, [rows, selected]);

  const regionChoices = useMemo(() => {
    const s = new Set<string>(); for (const r of activeRows) if (r.region) s.add(String(r.region));
    return ["all", ...Array.from(s).sort()];
  }, [activeRows]);
  const tierChoices = useMemo(() => {
    const s = new Set<string>(); for (const r of activeRows) if (r.tier != null && r.tier !== "") s.add(String(r.tier));
    return ["all", ...Array.from(s).sort((a,b)=>String(a).localeCompare(String(b), undefined, {numeric:true}))];
  }, [activeRows]);

  const filtered = useMemo(() => {
    let out = activeRows;
    if (filterRel !== "all") out = out.filter(r => normalizeRel(r.relation_type) === filterRel);
    if (filterRegion !== "all") out = out.filter(r => String(r.region) === filterRegion);
    if (filterTier !== "all") out = out.filter(r => String(r.tier) === filterTier);
    return out;
  }, [activeRows, filterRel, filterRegion, filterTier]);

  // Build graph
  const graph = useMemo(() => {
    if (!selected) return { nodes: [] as Node[], links: [] as Link[], counts: { suppliers: 0, customers: 0 }, dim: { W: 640, H: 420 } };
    const centerId = `center:${selected.ticker}`;
    const nodes: Node[] = [];
    const links: Link[] = [];
    nodes.push({ id: centerId, label: selected.company || selected.ticker, side: "center", rPx: 34, strength: 1, usdM: null, regions: [], tiers: [], categories: [], products: [], count: 0, x: 0, y: 0, inferredTicker: selected.ticker });

    const suppliers = filtered.filter(r => normalizeRel(r.relation_type) === "supplier");
    const customers = filtered.filter(r => normalizeRel(r.relation_type) === "customer");

    type Agg = { name: string; side: "supplier"|"customer"; usdM: number; strength: number; regions: string[]; tiers: string[]; categories: string[]; products: string[]; notes: string[]; isDummy: boolean; rows: Row[]; inferredTicker?: string | null; };
    const aggMap = new Map<string, Agg>();
    const addAgg = (r: Row, side: "supplier"|"customer") => {
      const key = `${side}::${(r.counterparty_name || "").toLowerCase().trim()}`;
      const usd = toNum(r.est_contract_value_usd_m) || 0;
      const sRaw = toNum(r.relationship_strength); const s = sRaw == null ? 0.5 : sRaw > 1 ? Math.max(0, Math.min(1, sRaw/100)) : Math.max(0, Math.min(1, sRaw));
      const inferredTicker = (r.counterparty_ticker || r.cp_ticker || extractTickerFromName(r.counterparty_name || "")) || null;
      const a = aggMap.get(key) || { name: r.counterparty_name || "Unknown", side, usdM: 0, strength: 0, regions: [], tiers: [], categories: [], products: [], notes: [], isDummy: !!r.is_dummy, rows: [], inferredTicker };
      a.usdM += usd; a.strength = Math.max(a.strength, s);
      a.regions = uniq([...a.regions, r.region]); a.tiers = uniq([...a.tiers, r.tier]);
      a.categories = uniq([...a.categories, r.category]); a.products = uniq([...a.products, r.component_or_product]);
      if (r.notes) a.notes.push(String(r.notes)); a.isDummy = a.isDummy || !!r.is_dummy; a.rows.push(r);
      if (!a.inferredTicker && inferredTicker) a.inferredTicker = inferredTicker; aggMap.set(key, a);
    };
    suppliers.forEach(r => addAgg(r, "supplier"));
    customers.forEach(r => addAgg(r, "customer"));

    const aggs = Array.from(aggMap.values());
    const vmax = Math.max(1, ...aggs.map(a => a.usdM || 0));
    const rFor = (usdM: number) => Math.max(10, Math.min(28, 10 + (usdM / vmax) * 18));

    const W = 640, H = 420;
    const colX = { left: -200, center: 0, right: 200 };
    const ySpread = (n: number) => { const gap = 340 / Math.max(1, n); const top = -((n - 1) * gap) / 2; return (i: number) => top + i * gap; };

    const leftAgg = aggs.filter(a => a.side === "supplier");
    const rightAgg = aggs.filter(a => a.side === "customer");

    const yLeft = ySpread(leftAgg.length);
    const yRight = ySpread(rightAgg.length);

    leftAgg.forEach((a,i) => {
      const id = `supplier:${a.name}:${i}`;
      nodes.push({ id, label: a.name, side: "supplier", rPx: rFor(a.usdM), strength: a.strength, usdM: a.usdM || null, regions: a.regions, tiers: a.tiers, categories: a.categories, products: a.products, notes: uniq(a.notes).join(" • "), isDummy: a.isDummy, count: a.rows.length, x: colX.left, y: yLeft(i), inferredTicker: a.inferredTicker || null });
      const iconType = detectIconType(a.name, a.products, a.categories, a.inferredTicker || undefined);
      links.push({ source: id, target: centerId, weight: 1 + a.strength * 4, side: "supplier", iconType });
    });
    rightAgg.forEach((a,i) => {
      const id = `customer:${a.name}:${i}`;
      nodes.push({ id, label: a.name, side: "customer", rPx: rFor(a.usdM), strength: a.strength, usdM: a.usdM || null, regions: a.regions, tiers: a.tiers, categories: a.categories, products: a.products, notes: uniq(a.notes).join(" • "), isDummy: a.isDummy, count: a.rows.length, x: colX.right, y: yRight(i), inferredTicker: a.inferredTicker || null });
      const iconType = detectIconType(a.name, a.products, a.categories, a.inferredTicker || undefined);
      links.push({ source: centerId, target: id, weight: 1 + a.strength * 4, side: "customer", iconType });
    });

    return { nodes, links, counts: { suppliers: leftAgg.length, customers: rightAgg.length }, dim: { W, H } };
  }, [filtered, selected]);

  const companyItems = useMemo(() => companies.map(c => ({ key: `${c.company}||${c.ticker}`, label: `${c.company} (${c.ticker || "?"})` })), [companies]);
  const handleCompanyPick = (label: string) => {
    const m = label.match(/^(.*)\s+\(([A-Z0-9.\-]+)\)\s*$/); setCompanyQuery(label); if (!m) return;
    const s = { company: m[1].trim(), ticker: m[2].trim().toUpperCase() }; setSelected(s); localStorage.setItem("vendor:selected", JSON.stringify(s)); setZoom(1);
  };

  return (
    <section className="mx-auto max-w-6xl px-6 py-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold">Vendor Network</h1>
        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-white/5" onClick={()=>setZoom(z=>Math.max(0.9,z-0.1))}>−</button>
          <span className="w-10 text-center text-sm">{Math.round(zoom*100)}%</span>
          <button className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-white/5" onClick={()=>setZoom(z=>Math.min(1.3,z+0.1))}>+</button>
          <button className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-white/5" onClick={()=>setZoom(1)}>Reset</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-12 relative z-[1000]" style={{ transform:`scale(${zoom})`, transformOrigin:"top left", isolation:"isolate" }}>
        <div className="md:col-span-6">
          <CompanyCombobox label="Select company" items={companyItems} value={companyQuery} onPick={handleCompanyPick} placeholder="Type to search… e.g., NVIDIA (NVDA)"/>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-[var(--muted)]">Relation</label>
          <select value={filterRel} onChange={(e)=>setFilterRel(e.target.value as any)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm">
            <option value="all">All</option><option value="supplier">Suppliers</option><option value="customer">Customers</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-[var(--muted)]">Region</label>
          <select value={filterRegion} onChange={(e)=>setFilterRegion(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm">
            {regionChoices.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-[var(--muted)]">Tier</label>
          <select value={filterTier} onChange={(e)=>setFilterTier(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm">
            {tierChoices.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-2 text-sm text-[var(--muted)]">Loading vendor network…</div>
          <div className="relative h-3 overflow-hidden rounded-full" style={{ background:"linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))" }}>
            <div className="absolute inset-y-0 left-0 w-1/3 animate-[sweep_12s_linear_infinite] rounded-full" style={{ background:"linear-gradient(90deg, rgba(255,255,255,.8), rgba(255,255,255,.15))" }} />
          </div>
          <style>{`@keyframes sweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(260%)} }`}</style>
        </div>
      )}
      {err && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">Error: {err}</div>}

      {selected ? <NetworkCanvas selected={selected} graph={graph}/> : <div className="text-sm text-[var(--muted)]">Pick a company to view its supplier & customer network.</div>}

      <Legend suppliers={graph.counts?.suppliers || 0} customers={graph.counts?.customers || 0} />

      {selected && (
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-2 text-sm font-semibold">Underlying rows ({filtered.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[var(--muted)]">
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="py-2 pr-3">Relation</th><th className="py-2 pr-3">Counterparty</th><th className="py-2 pr-3">Tier</th>
                  <th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Product/Component</th><th className="py-2 pr-3">Region</th>
                  <th className="py-2 pr-3">Strength</th><th className="py-2 pr-3">Est. $ (M)</th><th className="py-2 pr-3">Start</th><th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {activeRows
                  .filter(r => (filterRel === "all" ? true : normalizeRel(r.relation_type) === filterRel))
                  .map((r,i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-white/5">
                    <td className="py-2 pr-3">{normalizeRel(r.relation_type)}</td>
                    <td className="py-2 pr-3">{r.counterparty_name}</td>
                    <td className="py-2 pr-3">{String(r.tier ?? "")}</td>
                    <td className="py-2 pr-3">{r.category || ""}</td>
                    <td className="py-2 pr-3">{r.component_or_product || ""}</td>
                    <td className="py-2 pr-3">{r.region || ""}</td>
                    <td className="py-2 pr-3">{toNum(r.relationship_strength)?.toFixed(2) ?? "—"}</td>
                    <td className="py-2 pr-3">{toNum(r.est_contract_value_usd_m)?.toFixed(2) ?? "—"}</td>
                    <td className="py-2 pr-3">{r.start_year || ""}</td>
                    <td className="py-2 pr-3">{r.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* =========== Canvas (with “always-visible backbone” links) =========== */
function NetworkCanvas({ selected, graph }: {
  selected: { company: string; ticker: string };
  graph: { nodes: Node[]; links: Link[]; dim?: { W: number; H: number } };
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [modalNode, setModalNode] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [selected]);

  const W = graph.dim?.W ?? 640, H = graph.dim?.H ?? 420;
  const [logoIdx, setLogoIdx] = useState(0);
  const centerLogoCandidates = useMemo(() => logoProvidersFromTicker(selected.ticker), [selected.ticker]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setZoom(z => Math.max(0.7, Math.min(1.5, z + (e.deltaY > 0 ? -0.06 : 0.06)))); };
    el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const tipNode = hover ? graph.nodes.find(n => n.id === hover) : null;

  return (
    <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/[0.22] p-3 relative z-0">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{selected.company} ({selected.ticker})</div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5" onClick={()=>setZoom(z=>Math.max(0.7,z-0.1))}>−</button>
          <span className="w-10 text-center text-xs">{Math.round(zoom*100)}%</span>
          <button className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5" onClick={()=>setZoom(z=>Math.min(1.5,z+0.1))}>+</button>
          <button className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5" onClick={()=>setZoom(1)}>Reset</button>
        </div>
      </div>

      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-xl">
        {/* subtle particles */}
        <div className="pointer-events-none absolute inset-0">
          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
            <g className="opacity-35">
              {Array.from({ length: 24 }).map((_, i) => {
                const x = (i * 97) % W, y = (i * 53) % H, r = 0.8 + ((i * 7) % 8) / 10, d = 42 + (i % 10) * 9;
                return <circle key={i} cx={x} cy={y} r={r} fill="white" opacity="0.45" style={{ animation:`drift ${d}s linear infinite`, transformOrigin:`${x}px ${y}px` }} />;
              })}
            </g>
          </svg>
          <style>{`@keyframes drift{0%{transform:translateY(0);opacity:.32}50%{transform:translateY(-8px);opacity:.5}100%{transform:translateY(0);opacity:.32}}`}</style>
        </div>

        <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} className="block relative" shapeRendering="geometricPrecision">
          <defs>
            <linearGradient id="grad-supplier" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--brand2)"/><stop offset="100%" stopColor="var(--text)"/></linearGradient>
            <linearGradient id="grad-customer" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--text)"/><stop offset="100%" stopColor="var(--brand1)"/></linearGradient>
          </defs>

          <g transform={`translate(${W/2} ${H/2}) scale(${zoom})`}>
            {graph.links.map((l, i) => {
              const s = graph.nodes.find(n => n.id === l.source)!;
              const t = graph.nodes.find(n => n.id === l.target)!;
              const sel = hover && (hover === s.id || hover === t.id);
              const x1 = s.x, y1 = s.y, x2 = t.x, y2 = t.y;
              const dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx*dx + dy*dy);

              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
              const grad = l.side === "supplier" ? "url(#grad-supplier)" : "url(#grad-customer)";
              const w = sel ? l.weight + 1.4 : l.weight;

              // BACKBONE (solid, always visible)
              const baseOpacity = sel ? 0.35 : 0.25;

              // Decorative dash selection
              let dash: string | undefined;
              if (L > 220) dash = "12 24";
              else if (L > 160) dash = "8 16";
              // <=160 -> solid decorative stroke too

              // Randomized phase per edge so gaps never align invisibly
              const seed = (i * 131) % 97;
              const dashOffset = dash ? -(seed % 24) : 0;

              // Mid chevron
              const arrowSize = 8;
              const poly = [
                { x: 0, y: 0 },
                { x: -arrowSize, y: arrowSize * 0.7 },
                { x: -arrowSize * 0.4, y: 0 },
                { x: -arrowSize, y: -arrowSize * 0.7 },
              ];
              const off = 14;
              const rad = (ang * Math.PI) / 180;
              const ix = mx + off * Math.cos(rad);
              const iy = my + off * Math.sin(rad);
              const glow = sel ? "0 0 18px rgba(255,255,255,.35)" : "0 0 0 rgba(0,0,0,0)";

              return (
                <g key={i} style={{ filter: `drop-shadow(${glow})` }}>
                  {/* Solid backbone */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={grad} strokeOpacity={baseOpacity} strokeWidth={Math.max(1.25, w * 0.45)} strokeLinecap="round" />
                  {/* Decorative (dashed or solid) */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={grad} strokeOpacity={sel ? 0.95 : 0.6} strokeWidth={w}
                        strokeLinecap="round"
                        {...(dash ? { strokeDasharray: dash, style: { animation: "flow 32s linear infinite", strokeDashoffset: dashOffset } } : {})}
                  />
                  {/* Midpoint chevron */}
                  <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
                    <polygon points={poly.map(p => `${p.x},${p.y}`).join(" ")} fill="var(--text)" opacity={sel ? 0.95 : 0.8} />
                  </g>
                  {/* Midpoint icon */}
                  <g transform={`translate(${ix} ${iy}) rotate(${ang})`}>
                    <foreignObject x={-8} y={-8} width="16" height="16">
                      <div className="h-4 w-4 rounded-full bg-[var(--panel)]/90 border border-[var(--border)] flex items-center justify-center">
                        <EdgeIcon type={l.iconType}/>
                      </div>
                    </foreignObject>
                  </g>
                </g>
              );
            })}

            {graph.nodes.map((n) => {
              const cx = n.x, cy = n.y; const isCenter = n.side === "center";
              const r = isCenter ? 30 : Math.max(9, Math.min(28, n.rPx));
              const glow = hover === n.id ? "0 0 22px rgba(255,255,255,.25)" : "none";
              return (
                <g key={n.id} onMouseEnter={()=>setHover(n.id)} onMouseLeave={()=>setHover(null)}
                   onClick={()=>!isCenter && setModalNode(n)} style={{ cursor: isCenter ? "default" : "pointer", filter: `drop-shadow(${glow})` }}>
                  <circle cx={cx} cy={cy} r={r+4} fill="transparent" stroke="white" strokeOpacity={hover===n.id?0.18:0.08}/>
                  <circle cx={cx} cy={cy} r={r} fill="var(--panel)" stroke="var(--border)" strokeWidth={1}/>
                  {isCenter ? (
                    <foreignObject x={cx-18} y={cy-18} width="36" height="36">
                      <div className="h-9 w-9 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)]">
                        <img src={centerLogoCandidates[Math.min(logoIdx, centerLogoCandidates.length-1)]}
                             alt={selected.ticker} className="h-full w-full object-contain" onError={()=>setLogoIdx(i=>i+1)} />
                      </div>
                    </foreignObject>
                  ) : (
                    <foreignObject x={cx-14} y={cy-14} width="28" height="28">
                      <div className="h-7 w-7 overflow-hidden rounded bg-[var(--panel)]/60 border border-[var(--border)] flex items-center justify-center">
                        <NodeBadge name={n.label} size={28} regions={n.regions} tickerHint={n.inferredTicker}/>
                      </div>
                    </foreignObject>
                  )}
                  <text x={cx} y={cy + r + 12} textAnchor="middle" className="fill-[var(--text)]" style={{ fontSize: "10px" }}>{n.label}</text>
                </g>
              );
            })}
          </g>

          <style>{`@keyframes flow { to { stroke-dashoffset: -600; } }`}</style>
        </svg>

        {tipNode && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--panel)]/95 px-2 py-1 text-[11px]" style={{ boxShadow:"0 2px 18px rgba(0,0,0,0.15)" }}>
            <div className="font-semibold">{tipNode.label}</div>
            <div className="text-[var(--muted)]">{tipNode.side === "supplier" ? "Supplier → Company" : tipNode.side === "customer" ? "Company → Customer" : ""}</div>
            <div>Est. Contract: {abbrevMoney(tipNode.usdM)}</div>
            <div>Rel. Strength: {(tipNode.strength*100).toFixed(0)}%</div>
            {!!tipNode.tiers.length && <div>Tier: {tipNode.tiers.join(", ")}</div>}
            {!!tipNode.regions.length && <div>Region: {tipNode.regions.join(", ")}</div>}
          </div>
        )}
      </div>

      {modalNode && <NodeModal node={modalNode} onClose={()=>setModalNode(null)}/>}
    </div>
  );
}

/* =========== Legend & Modal =========== */
function Legend({ suppliers, customers }: { suppliers: number; customers: number }) {
  return (
    <div className="mt-2 mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
      <span className="inline-flex items-center gap-2"><span className="inline-block h-[10px] w-[18px] rounded border border-[var(--border)] bg-[var(--panel)]" /> Supplier <span className="opacity-70">({suppliers})</span></span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-[10px] w-[18px] rounded border border-[var(--border)] bg-[var(--panel)]" /> Customer <span className="opacity-70">({customers})</span></span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border border-[var(--border)]" /> Node size = contract value</span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-6 rounded bg-white/40" /> Arrow width = relationship strength</span>
      <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-6 rounded bg-white/40" /> Midpoint icon = product type</span>
    </div>
  );
}
function NodeModal({ node, onClose }: { node: Node; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4" onClick={(e)=>e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5">Close</button>
        <div className="mb-3">
          <div className="text-lg font-semibold">{node.label}</div>
          <div className="text-xs text-[var(--muted)]">{node.side === "supplier" ? "Supplier" : node.side === "customer" ? "Customer" : ""}{node.count>1?` • ${node.count} links`:""}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Est. Contract" value={abbrevMoney(node.usdM)} />
          <Info label="Rel. Strength" value={`${(node.strength*100).toFixed(0)}%`} />
          <Info label="Tier(s)" value={node.tiers.length ? node.tiers.join(", ") : "—"} />
          <Info label="Region(s)" value={node.regions.length ? node.regions.join(", ") : "—"} />
          <Info label="Category" value={node.categories.length ? node.categories.join(", ") : "—"} />
          <Info label="Product/Component" value={node.products.length ? node.products.join(", ") : "—"} />
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
  return (<div><div className="text-xs text-[var(--muted)]">{label}</div><div className="font-medium">{value}</div></div>);
}
