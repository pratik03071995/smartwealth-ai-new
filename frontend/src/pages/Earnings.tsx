import React, { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../services/api";

/* ============== Types & API base ============== */
type Item = {
  event_date: string; // ISO
  symbol: string;
  company_name?: string;
  time_hint?: string;
  raw?: any;
};
type ApiAll = {
  from: string;
  to: string;
  count: number;
  items: Item[];
  cached_at?: string;
  error?: string;
};

/* ============== Date helpers ============== */
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const WEEK = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastOfMonth(d: Date)  { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfGrid(d: Date) {
  const f = firstOfMonth(d);
  const day = (f.getDay() + 6) % 7; // Mon=0
  const s = new Date(f);
  s.setDate(f.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}
function endOfGrid(d: Date) {
  const l = lastOfMonth(d);
  const day = (l.getDay() + 6) % 7; // Mon=0
  const e = new Date(l);
  e.setDate(l.getDate() + (6 - day));
  e.setHours(23, 59, 59, 999);
  return e;
}
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function iso(d: Date) { return d.toISOString().split("T")[0]; }

/* ============== Page ============== */
export default function Earnings() {
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => firstOfMonth(new Date()));
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState<Item | null>(null);
  const [activeDay, setActiveDay] = useState<{ date: string; items: Item[] } | null>(null);

  const gridStart = useMemo(() => startOfGrid(monthAnchor), [monthAnchor]);
  const gridEnd   = useMemo(() => endOfGrid(monthAnchor),   [monthAnchor]);

  useEffect(() => {
    let cancel = false;
    async function run() {
      setLoading(true); setErr(null);
      try {
        const from = iso(gridStart), to = iso(gridEnd);
        const res = await fetch(buildApiUrl(`earnings/all?from=${from}&to=${to}`));
        const j: ApiAll = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
        if (!cancel) setData(j.items || []);
      } catch (e: any) {
        if (!cancel) setErr(e?.message || "Failed to load");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    run();
    return () => { cancel = true; };
  }, [gridStart, gridEnd]);

  // Group by ISO date
  const byDate = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const it of data) (map[it.event_date] ||= []).push(it);
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return map;
  }, [data]);

  // Build grid cells
  const cells = useMemo(() => {
    const out: { date: Date; iso: string; inMonth: boolean; items: Item[] }[] = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const copy = new Date(d);
      const key = iso(copy);
      out.push({
        date: copy,
        iso: key,
        inMonth: copy.getMonth() === monthAnchor.getMonth(),
        items: byDate[key] || [],
      });
    }
    return out;
  }, [gridStart, gridEnd, monthAnchor, byDate]);

  const today = new Date();

  return (
    <section className="mx-auto max-w-6xl px-6 py-6 md:py-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            {MONTHS[monthAnchor.getMonth()]} {monthAnchor.getFullYear()}
          </h1>
          <FunFact />
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Today" onClick={() => setMonthAnchor(firstOfMonth(new Date()))} />
          <IconButton label="Prev"  onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))} dir="left" />
          <IconButton label="Next"  onClick={() => setMonthAnchor(addMonths(monthAnchor, +1))} dir="right" />
        </div>
      </div>

      {/* Loader / Error */}
      {loading && <Loader />}
      {err && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
          Error: {err}
        </div>
      )}

      {/* Weekday row */}
      <div className="grid grid-cols-7 gap-2 text-[12px] text-[var(--muted)] mb-2">
        {WEEK.map((d) => <div key={d} className="px-2">{d}</div>)}
      </div>

      {/* Month grid */}
      {!loading && (
        <div className="grid grid-cols-7 gap-2">
          {cells.map((c, i) => (
            <div
              key={c.iso + i}
              className={`relative min-h-[120px] rounded-2xl border p-2
                ${c.inMonth ? "border-[var(--border)] bg-[var(--panel)]" : "border-[var(--border)]/40 bg-[var(--panel)]/40"}
              `}
              style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)" }}
            >
              {/* day number & quick-open */}
              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={() => c.items.length && setActiveDay({ date: c.iso, items: c.items })}
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    c.items.length ? "border-[var(--border)] hover:bg-white/5" : "border-transparent text-[var(--muted)]"
                  }`}
                  title={c.items.length ? "View all on this day" : ""}
                >
                  {c.date.getDate()}
                </button>
                {sameDay(c.date, today) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-[var(--border)]">Today</span>
                )}
              </div>

              {/* tickers */}
              <div className="space-y-1.5">
                {c.items.slice(0, 4).map((it, idx) => (
                  <TickerPill key={it.symbol + idx} item={it} onOpen={() => setActiveTicker(it)} />
                ))}
                {c.items.length > 4 && (
                  <button
                    onClick={() => setActiveDay({ date: c.iso, items: c.items })}
                    className="text-[11px] text-left w-full rounded-md border border-[var(--border)] px-2 py-1 hover:bg-white/5"
                  >
                    +{c.items.length - 4} more
                  </button>
                )}
              </div>

              {/* bottom accent */}
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 -bottom-px h-[2px] ${
                  c.items.length ? "opacity-100" : "opacity-40"
                }`}
                style={{ background: "linear-gradient(90deg, var(--brand2), var(--brand1))" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Day drawer & Ticker modal */}
      {activeDay && (
        <DayDrawer
          date={activeDay.date}
          items={activeDay.items}
          onClose={() => setActiveDay(null)}
          onOpenTicker={(it) => setActiveTicker(it)}
        />
      )}
      {activeTicker && <DetailsModal item={activeTicker} onClose={() => setActiveTicker(null)} />}
    </section>
  );
}

/* ============== Header bits ============== */
function IconButton({ label, onClick, dir }: { label: string; onClick: () => void; dir?: "left" | "right" }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-white/5 flex items-center gap-1"
    >
      {dir === "left" && <span>←</span>}
      {label}
      {dir === "right" && <span>→</span>}
    </button>
  );
}

function FunFact() {
  const facts = [
    "Earnings surprises >5% often move stocks sharply.",
    "Tech + Health Care dominate S&P 500 earnings weight.",
    "BMO = before market open, AMC = after market close.",
    "Revenue beats without EPS beats can flag margin pressure.",
    "Multi-year EPS trends matter more than one quarter.",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % facts.length), 3000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden md:block text-xs px-2 py-1 rounded-full border border-[var(--border)] text-[var(--muted)]">
      <span className="opacity-70">Fact:</span> {facts[i]}
    </div>
  );
}

/* ============== Day Drawer ============== */
function DayDrawer({
  date, items, onClose, onOpenTicker,
}: {
  date: string;
  items: Item[];
  onClose: () => void;
  onOpenTicker: (it: Item) => void;
}) {
  return (
    <div className="fixed inset-0 z-[210] bg-black/50" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl border border-[var(--border)] bg-[var(--panel)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">All earnings on {date}</div>
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[50vh] overflow-auto">
          {items.map((it, idx) => (
            <TickerPill key={it.symbol + idx} item={it} onOpen={() => onOpenTicker(it)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============== Ticker pill ============== */
function TickerPill({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const [logoIdx, setLogoIdx] = useState(0);
  const providers = useMemo(() => logoProviders(item.symbol), [item.symbol]);
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 hover:bg-[var(--bg)]/80 px-2 py-1.5 flex items-center gap-2 transition"
      title={item.company_name || item.symbol}
    >
      <div className="h-6 w-6 rounded-md border border-[var(--border)] overflow-hidden bg-[var(--panel)] shrink-0">
        {providers.length ? (
          <img
            src={providers[Math.min(logoIdx, providers.length - 1)]}
            alt={item.symbol}
            className="h-full w-full object-contain"
            onError={() => setLogoIdx((i) => i + 1)}
            loading="lazy"
          />
        ) : (
          <TickerGlyph symbol={item.symbol} />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{item.symbol}</div>
        <div className="truncate text-[11px] text-[var(--muted)]">{item.company_name || "\u00A0"}</div>
      </div>
      <div className="ml-auto text-[10px] text-[var(--muted)]">
        {item.time_hint ? normalizeSession(item.time_hint) : ""}
      </div>
    </button>
  );
}

/* ============== Futuristic Loader (full-width sweep) ============== */
function Loader() {
  return (
    <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="text-sm text-[var(--muted)] mb-2">Loading monthly calendar…</div>
      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))" }}
      >
        <div
          className="absolute inset-y-0 left-0 w-1/3 rounded-full animate-[sweep_1.8s_ease-in-out_infinite]"
          style={{
            background: "linear-gradient(90deg, var(--brand2), var(--brand1))",
            boxShadow: "0 0 28px rgba(123,91,251,.55)",
          }}
        />
      </div>
      <style>{`
        @keyframes sweep {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(190%); }
          100% { transform: translateX(190%); }
        }
      `}</style>
    </div>
  );
}

/* ============== Details Modal (EPS/Revenue + surprises) ============== */
function DetailsModal({ item, onClose }: { item: Item; onClose: () => void }) {
  // EPS
  const epsEst = pickNumber(item.raw, ["eps_estimate","estimate_eps","eps_est","consensus_eps","epsEst"]);
  const epsAct = pickNumber(item.raw, ["eps_actual","actual_eps","reported_eps","epsAct"]);
  const epsSurprise = (epsEst != null && epsAct != null && epsEst !== 0)
    ? ((epsAct - epsEst) / Math.abs(epsEst)) * 100
    : null;

  // Revenue
  const revEst = pickNumber(item.raw, ["revenue_estimate","rev_estimate","est_revenue","revenueEst","sales_estimate"]);
  const revAct = pickNumber(item.raw, ["revenue_actual","rev_actual","reported_revenue","revenueAct","sales_actual"]);
  const revSurprise = (revEst != null && revAct != null && revEst !== 0)
    ? ((revAct - revEst) / Math.abs(revEst)) * 100
    : null;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-xl w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 relative" onClick={(e)=>e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5">
          Close
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="h-11 w-11 rounded-lg border border-[var(--border)] flex items-center justify-center"
            style={{ background: "linear-gradient(90deg, var(--brand2), var(--brand1))", color: "#0A1630" }}
          >
            <strong>{(item.symbol || "?").slice(0, 3)}</strong>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold">{item.symbol}</div>
            <div className="text-sm text-[var(--muted)] truncate">{item.company_name || "\u00A0"}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-sm">{item.event_date}</div>
            {item.time_hint && <div className="text-xs text-[var(--muted)]">{normalizeSession(item.time_hint)}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatBox label="EPS Est." value={fmtNum(epsEst)} />
          <StatBox label="EPS Act." value={fmtNum(epsAct)} />
          <StatBox label="Rev Est." value={fmtMoney(revEst)} />
          <StatBox label="Rev Act." value={fmtMoney(revAct)} />
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <Badge label="EPS Surprise" value={epsSurprise} unit="%" />
            <Badge label="Revenue Surprise" value={revSurprise} unit="%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function Badge({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  const good = (value ?? 0) >= 0;
  return (
    <div className={`rounded-xl border p-3 ${good ? "border-green-500/30" : "border-red-500/30"}`}>
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-lg font-semibold ${good ? "text-green-400" : "text-red-400"}`}>
        {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}${unit || ""}`}
      </div>
    </div>
  );
}

/* ============== Utilities ============== */
function TickerGlyph({ symbol }: { symbol: string }) {
  const init = (symbol || "?").slice(0, 3).toUpperCase();
  return (
    <div
      className="flex h-full w-full items-center justify-center text-[10px] font-bold"
      style={{ background: "linear-gradient(90deg, var(--brand2), var(--brand1))", color: "#0A1630" }}
    >
      {init}
    </div>
  );
}

function normalizeSession(s: string) {
  const t = (s || "").toLowerCase();
  if (t.includes("before") || t.includes("bmo") || t.includes("pre")) return "BMO";
  if (t.includes("after") || t.includes("amc") || t.includes("post") || t.includes("close")) return "AMC";
  if (t.includes("open")) return "Open";
  if (t.includes("close")) return "Close";
  return (s || "").toUpperCase();
}

function logoProviders(symbol: string) {
  const sym = (symbol || "").toUpperCase().trim();
  const a = `https://img.logo.dev/ticker/${encodeURIComponent(sym)}?size=64`;
  const b = `https://storage.googleapis.com/iex/api/logos/${encodeURIComponent(sym)}.png`;
  return [a, b];
}

function pickNumber(raw: any, keys: string[]): number | null {
  if (!raw) return null;
  for (const k of keys) {
    if (raw[k] == null) continue;
    const n = typeof raw[k] === "string" ? parseFloat(String(raw[k]).replace(/[^\d\.\-]/g, "")) : Number(raw[k]);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}
function fmtNum(n: number | null): string {
  if (n == null) return "—";
  const v = Math.abs(n) < 1 ? n.toFixed(3) : n.toFixed(2);
  return `${v}`;
}
function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const units: Array<[string, number]> = [["T", 1e12], ["B", 1e9], ["M", 1e6], ["K", 1e3]];
  for (const [u, v] of units) if (abs >= v) return `${(n / v).toFixed(2)}${u}`;
  return n.toFixed(0);
}
