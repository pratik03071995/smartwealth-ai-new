from __future__ import annotations

from typing import Dict, List, Tuple
from math import log

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
    # Approximate years using number of points assuming ~monthly
    n = len(points)
    years = max(1.0, n / 12.0)
    return ((end / start) ** (1 / years) - 1.0) * 100.0


def compare_symbols(symbols: List[str], window: str) -> tuple[dict, list[dict], list[dict]]:
    """
    Fetch series for symbols, compute growth metrics, and return:
      - comparison_table: dict with columns + rows
      - bar_chart_data: list of { label, value }
      - aligned preview rows (for table preview)
    """
    series_map = fetch_series(symbols, window)

    rows: List[Dict] = []
    bar: List[Dict] = []
    preview_rows: List[Dict] = []
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

