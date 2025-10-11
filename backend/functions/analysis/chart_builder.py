from __future__ import annotations

from typing import List, Dict


def build_growth_bar_chart(symbol_values: List[Dict]) -> Dict:
    """Return a ChartPayload (bar) showing growth % by symbol."""
    return {
        "type": "bar",
        "title": "Growth Comparison",
        "metric": "changePercentage",
        "format": "percent",
        "data": symbol_values,
    }


def build_single_series_scatter(symbol: str, points: List[Dict]) -> Dict:
    """Return a ChartPayload (scatter) representing a line-like timeseries for a single symbol.

    The frontend renders a ScatterChart with the `line` prop and will draw a line.
    """
    data = []
    for idx, p in enumerate(points):
        close = p.get("close")
        if close is None:
            continue
        data.append({"label": symbol, "x": idx, "y": float(close)})
    return {
        "type": "scatter",
        "title": f"{symbol} Price",
        "xKey": "x",
        "yKey": "y",
        "format": {"y": "currency"},
        "data": data,
    }


def build_single_series_line(symbol: str, points: List[Dict], *, window: str = "1D") -> Dict:
    """Return a ChartPayload (line) with timestamped points and common windows metadata.

    Frontend expects `type: 'line'`, xKey='t', yKey='close', and a `series` array.
    """
    series = [{
        "name": symbol,
        "points": [
            {"t": p.get("t"), "close": float(p.get("close"))}
            for p in points
            if p.get("t") and p.get("close") is not None
        ],
    }]
    return {
        "type": "line",
        "title": f"{symbol} Price",
        "xKey": "t",
        "yKey": "close",
        "format": {"y": "currency"},
        "series": series,
        "window": window,
        "availableWindows": ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"],
        "symbol": symbol,
    }
