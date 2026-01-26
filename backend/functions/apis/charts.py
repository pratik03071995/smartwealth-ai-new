from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List

from flask import request

from ..analysis.chart_builder import build_single_series_line, build_multi_series_comparison
from ..analysis.timeseries_repository import fetch_series
from ..analysis.comparer import build_normalized_comparison


def _normalize_window(raw: str | None) -> str:
    if not raw:
        return "1Y"
    window = raw.strip().upper()
    if window == "ALL":
        return "5Y"
    if window == "1W":
        return "5D"
    return window or "1Y"


def _point_timestamp(raw: object) -> datetime | None:
    try:
        if isinstance(raw, (int, float)):
            return datetime.fromtimestamp(float(raw), tz=timezone.utc)
        if isinstance(raw, str):
            text = raw.strip()
            if not text:
                return None
            # Try ISO with timezone information first
            try:
                dt = datetime.fromisoformat(text)
            except ValueError:
                # Fallbacks: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
                for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
                    try:
                        dt = datetime.strptime(text, fmt)
                        break
                    except ValueError:
                        dt = None
                if dt is None:
                    return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
    except Exception:
        return None
    return None


def _slice_points(points: List[Dict[str, object]], window: str) -> List[Dict[str, object]]:
    if not points:
        return points

    now = datetime.now(timezone.utc)
    window = window.upper()
    cutoff: datetime | None = None

    if window == "1M":
        cutoff = now - timedelta(days=30)
    elif window == "1W":
        cutoff = now - timedelta(days=7)
    elif window == "1D":
        cutoff = now - timedelta(days=1)
    elif window == "6M":
        cutoff = now - timedelta(days=182)
    elif window == "3M":
        cutoff = now - timedelta(days=90)
    elif window == "YTD":
        cutoff = datetime(now.year, 1, 1, tzinfo=timezone.utc)

    if cutoff is None:
        return points

    filtered = []
    for point in points:
        ts = _point_timestamp(point.get("t")) or now
        if ts >= cutoff:
            filtered.append(point)
    return filtered or points


def stock_chart() -> tuple[dict, int]:
    symbol = (request.args.get("symbol") or "").strip().upper()
    if not symbol:
        return {"error": "symbol_required"}, 400

    requested_window = (request.args.get("window") or "1Y").strip().upper()
    window = _normalize_window(requested_window)

    series_map = fetch_series([symbol], window)
    points = series_map.get(symbol) or []

    if not points:
        fallback_window = None
        if requested_window.upper() == '1M':
            fallback_window = '3M'
        elif requested_window.upper() == '1W':
            fallback_window = '1M'
        elif requested_window.upper() == '1D':
            fallback_window = '1W'
        elif requested_window.upper() == '6M':
            fallback_window = '1Y'

        if fallback_window:
            series_map = fetch_series([symbol], fallback_window)
            points = series_map.get(symbol) or []
            points = _slice_points(points, requested_window)

    else:
        points = _slice_points(points, requested_window)

    if not points:
        return {"error": "no_data", "symbol": symbol, "window": requested_window}, 404

    chart = build_single_series_line(symbol, points, window=requested_window)
    return {"chart": chart}, 200


def comparison_chart() -> tuple[dict, int]:
    raw_symbols = request.args.getlist("symbols")
    if not raw_symbols:
        raw = (request.args.get("symbols") or "").strip()
        if raw:
            raw_symbols = [s.strip().upper() for s in raw.split(",") if s.strip()]

    symbols = [s.strip().upper() for s in raw_symbols if s.strip()]
    if len(symbols) < 2:
        return {"error": "two_symbols_required"}, 400

    window = (request.args.get("window") or "1Y").strip().upper()
    base = request.args.get("baseInvestment")
    try:
        base_investment = float(base) if base is not None else 100.0
    except ValueError:
        base_investment = 100.0

    comparison = build_normalized_comparison(symbols, window, base_investment=base_investment)
    chart = build_multi_series_comparison(
        series=comparison.get('series') or [],
        title="Normalized Investment Comparison",
        base_investment=comparison.get('baseInvestment', base_investment),
        window=comparison.get('window', window),
        available_windows=['1M', '3M', '6M', '1Y', '2Y', '5Y'],
    )
    return {
        "chart": chart,
        "comparison": {
            "summary": comparison.get('summary'),
            "table": comparison.get('table'),
            "tablePreview": comparison.get('tablePreview'),
            "start": comparison.get('start'),
            "end": comparison.get('end'),
            "baseInvestment": comparison.get('baseInvestment'),
            "symbols": comparison.get('symbols'),
            "availableSymbols": comparison.get('availableSymbols'),
            "removedSymbols": comparison.get('removedSymbols'),
            "window": comparison.get('window'),
        },
    }, 200
