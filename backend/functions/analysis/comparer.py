from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Tuple

from .timeseries_repository import fetch_series


def _growth_pct(points: List[dict]) -> float | None:
    if not points:
        return None
    start = next((p["close"] for p in points if p.get("close") is not None), None)
    end = next((p["close"] for p in reversed(points) if p.get("close") is not None), None)
    if not start or not end:
        return None
    return (end / start - 1.0) * 100.0


def _cagr(points: List[dict]) -> float | None:
    if not points:
        return None
    start = next((p["close"] for p in points if p.get("close") is not None), None)
    end = next((p["close"] for p in reversed(points) if p.get("close") is not None), None)
    if not start or not end or start <= 0:
        return None
    n = len(points)
    years = max(1.0, n / 12.0)
    return ((end / start) ** (1 / years) - 1.0) * 100.0


def compare_symbols(symbols: List[str], window: str) -> tuple[dict, list[dict], list[dict]]:
    """Legacy helper returning table + bar chart data for growth % visualization."""
    series_map = fetch_series(symbols, window)

    rows: List[Dict[str, Any]] = []
    bar: List[Dict[str, Any]] = []
    preview_rows: List[Dict[str, Any]] = []

    for sym in symbols:
        pts = series_map.get(sym) or []
        g = _growth_pct(pts)
        cg = _cagr(pts)
        start = next((p["close"] for p in pts if p.get("close") is not None), None)
        end = next((p["close"] for p in reversed(pts) if p.get("close") is not None), None)
        rows.append({
            "symbol": sym,
            "start": start,
            "end": end,
            "growth_pct": g,
            "cagr_pct": cg,
        })
        if g is not None:
            bar.append({"label": sym, "value": round(g, 2)})

    table = {
        "columns": [
            {"key": "symbol", "label": "Symbol"},
            {"key": "start", "label": "Start"},
            {"key": "end", "label": "End"},
            {"key": "growth_pct", "label": "Growth %"},
            {"key": "cagr_pct", "label": "CAGR %"},
        ],
        "rows": rows,
    }
    return table, bar, rows[:3]


def _parse_ts(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        try:
            return datetime.strptime(value, "%Y-%m-%d").timestamp()
        except Exception:
            return 0.0


def build_normalized_comparison(
    symbols: List[str],
    window: str,
    *,
    base_investment: float = 100.0,
) -> Dict[str, Any]:
    """Return normalized comparison result (aligned series + summary stats)."""

    if not symbols:
        return {
            "series": [],
            "table": {"columns": [], "rows": []},
            "tablePreview": [],
            "summary": [],
            "start": None,
            "end": None,
            "baseInvestment": base_investment,
            "symbols": [],
            "window": window,
        }

    if base_investment <= 0:
        base_investment = 100.0

    # Deduplicate while keeping the requested order
    deduped: List[str] = []
    seen = set()
    for sym in symbols:
        sym_norm = (sym or "").strip().upper()
        if not sym_norm:
            continue
        if sym_norm not in seen:
            seen.add(sym_norm)
            deduped.append(sym_norm)
    symbols = deduped

    raw_map = fetch_series(symbols, window)

    cleaned_map: Dict[str, List[Dict[str, Any]]] = {}
    timestamp_sets: Dict[str, set[str]] = {}
    for sym in symbols:
        points = raw_map.get(sym) or []
        filtered = [
            {"t": str(p["t"]), "close": float(p["close"])}
            for p in points
            if p.get("t") and p.get("close") is not None
        ]
        filtered.sort(key=lambda p: _parse_ts(p["t"]))
        if filtered:
            timestamp_sets[sym] = {entry["t"] for entry in filtered}
        cleaned_map[sym] = filtered

    removed_symbols_set: set[str] = set()
    active_symbols = [sym for sym in symbols if cleaned_map.get(sym)]
    for sym in symbols:
        if not cleaned_map.get(sym):
            removed_symbols_set.add(sym)

    common_timestamps: List[str] = []
    while len(active_symbols) >= 2:
        symbol_sets = {sym: timestamp_sets.get(sym, set()) for sym in active_symbols}
        empty_symbols = [sym for sym, ts in symbol_sets.items() if not ts]
        if empty_symbols:
            for sym in empty_symbols:
                removed_symbols_set.add(sym)
                active_symbols = [s for s in active_symbols if s != sym]
            continue

        intersection = set.intersection(*symbol_sets.values()) if symbol_sets else set()
        if len(intersection) >= 2:
            common_timestamps = sorted(intersection, key=_parse_ts)
            break

        limiting = min(symbol_sets.items(), key=lambda item: len(item[1]))[0]
        removed_symbols_set.add(limiting)
        active_symbols = [s for s in active_symbols if s != limiting]

    if len(active_symbols) < 2 or len(common_timestamps) < 2:
        return {
            "series": [],
            "table": {"columns": [], "rows": []},
            "tablePreview": [],
            "summary": [],
            "start": None,
            "end": None,
            "baseInvestment": base_investment,
            "symbols": [],
            "availableSymbols": [],
            "removedSymbols": sorted(removed_symbols_set, key=lambda s: symbols.index(s) if s in symbols else 0),
            "window": window,
        }

    start_ts = common_timestamps[0]
    end_ts = common_timestamps[-1]

    available_symbols = [sym for sym in symbols if sym in active_symbols]
    normalized_series: List[Dict[str, Any]] = []
    summary_rows: List[Dict[str, Any]] = []
    table_rows: List[Dict[str, Any]] = []

    for sym in available_symbols:
        pts = cleaned_map.get(sym) or []
        price_by_ts = {p["t"]: float(p["close"]) for p in pts}

        try:
            start_price = price_by_ts[start_ts]
            end_price = price_by_ts[end_ts]
        except KeyError:
            removed_symbols_set.add(sym)
            continue
        if start_price <= 0:
            removed_symbols_set.add(sym)
            continue

        series_points: List[Dict[str, Any]] = []
        for ts in common_timestamps:
            price = price_by_ts.get(ts)
            if price is None:
                continue
            normalized = base_investment * (price / start_price)
            series_points.append({"t": ts, "close": round(normalized, 4)})

        if len(series_points) < 2:
            removed_symbols_set.add(sym)
            continue

        final_investment = base_investment * (end_price / start_price)
        absolute_return = final_investment - base_investment
        return_pct = (end_price / start_price - 1.0) * 100.0

        normalized_series.append({"name": sym, "points": series_points})
        table_rows.append({
            "symbol": sym,
            "start_price": start_price,
            "end_price": end_price,
            "end_investment": round(final_investment, 2),
            "return_pct": round(return_pct, 4),
        })
        summary_rows.append({
            "symbol": sym,
            "startPrice": start_price,
            "endPrice": end_price,
            "finalInvestment": round(final_investment, 2),
            "absoluteReturn": round(absolute_return, 2),
            "returnPct": round(return_pct, 4),
        })

    available_symbols = [entry["name"] for entry in normalized_series]
    if len(available_symbols) < 2:
        removed = sorted(removed_symbols_set, key=lambda s: symbols.index(s) if s in symbols else 0)
        return {
            "series": [],
            "table": {"columns": [], "rows": []},
            "tablePreview": [],
            "summary": [],
            "start": None,
            "end": None,
            "baseInvestment": base_investment,
            "symbols": [],
            "availableSymbols": [],
            "removedSymbols": removed,
            "window": window,
        }

    base_label = (
        f"Value of ${int(base_investment):,}"
        if float(base_investment).is_integer()
        else f"Value of ${base_investment:,.2f}"
    )

    table = {
        "columns": [
            {"key": "symbol", "label": "Symbol"},
            {"key": "start_price", "label": "Start Price"},
            {"key": "end_price", "label": "End Price"},
            {"key": "end_investment", "label": base_label},
            {"key": "return_pct", "label": "Return %"},
        ],
        "rows": table_rows,
    }

    removed_symbols = [sym for sym in symbols if sym in removed_symbols_set and sym not in available_symbols]

    return {
        "series": normalized_series,
        "table": table,
        "tablePreview": table_rows[:3],
        "summary": summary_rows,
        "start": start_ts,
        "end": end_ts,
        "baseInvestment": base_investment,
        "symbols": available_symbols,
        "availableSymbols": available_symbols,
        "removedSymbols": removed_symbols,
        "window": window,
    }
