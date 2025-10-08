from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import logging
from datetime import datetime, timedelta, timezone

from ..apis.databricks import db_cursor

# Source table (updated to GOLD per request)
TABLE = "workspace.sw_gold.fmp_stockprice_timeseries_chart"

WINDOWS = {"1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"}

logger = logging.getLogger("smartwealth.timeseries_repo")

# Minimal symbol synonym mapping to handle common alternate tickers stored in datasets
# (not a fallback – ensures we query the actual stored symbol variant).
_SYMBOL_SYNONYMS: Dict[str, List[str]] = {
    "GOOGL": ["GOOG"],
    "GOOG": ["GOOGL"],
}

def _expand_symbols(symbols: List[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for s in symbols:
        u = (s or "").upper().strip()
        if not u:
            continue
        if u not in seen:
            seen.add(u)
            out.append(u)
        for alt in _SYMBOL_SYNONYMS.get(u, []):
            au = alt.upper()
            if au not in seen:
                seen.add(au)
                out.append(au)
    return out


def _resolve_window_for_range(window_or_range: str) -> Tuple[str, Optional[datetime]]:
    w = (window_or_range or "").upper().strip()
    if w in WINDOWS:
        if w == "YTD":
            start = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)
            return "5Y", start  # Use 5Y bucket then filter from Jan 1
        return w, None

    # Support custom ranges like "2Y", "3M"
    if w.endswith("Y") and w[:-1].isdigit():
        years = int(w[:-1])
        start = datetime.now(timezone.utc) - timedelta(days=365 * years)
        return "5Y", start
    if w.endswith("M") and w[:-1].isdigit():
        months = int(w[:-1])
        start = datetime.now(timezone.utc) - timedelta(days=30 * months)
        return "1Y", start
    if w.endswith("D") and w[:-1].isdigit():
        days = int(w[:-1])
        start = datetime.now(timezone.utc) - timedelta(days=days)
        return "1Y", start

    # Default to 1Y
    return "1Y", None


def fetch_series(symbols: List[str], window: str = "1Y") -> Dict[str, List[Dict[str, float]]]:
    """Fetch time series from Databricks for the given symbols and logical window.

    Returns mapping symbol -> list of { t: iso, close: float }
    """
    if not symbols:
        return {}
    base_window, start_filter = _resolve_window_for_range(window)
    # Canonicalize originals and build alias mapping so we return data keyed by the
    # originally requested symbols (not the storage variant).
    originals = [(s or "").upper().strip() for s in symbols if (s or "").strip()]
    symbols_expanded = _expand_symbols(originals)
    alias_to_canon: Dict[str, str] = {}
    for s in originals:
        alias_to_canon[s] = s
        for alt in _SYMBOL_SYNONYMS.get(s, []):
            alias_to_canon[alt.upper()] = s
    placeholders = ",".join(["?"] * len(symbols_expanded))

    # NOTE: Databricks SQL connector uses DBAPI paramstyle = qmark
    if start_filter is None:
        sql = f"""
            SELECT date, price, symbol
            FROM {TABLE}
            WHERE UPPER(symbol) IN ({placeholders}) AND UPPER(window) = ?
            ORDER BY date
        """
        params = [*(s.upper() for s in symbols_expanded), base_window.upper()]
    else:
        sql = f"""
            SELECT date, price, symbol
            FROM {TABLE}
            WHERE UPPER(symbol) IN ({placeholders}) AND UPPER(window) = ? AND date >= ?
            ORDER BY date
        """
        params = [*(s.upper() for s in symbols_expanded), base_window.upper(), start_filter.strftime("%Y-%m-%d")]

    out: Dict[str, List[Dict[str, float]]] = {s: [] for s in originals}
    with db_cursor() as cur:
        cur.execute(sql, params)
        for row in cur.fetchall():
            # Expecting: date, price, symbol
            d, price, sym = row[0], row[1], row[2]
            if price is None:
                continue
            # Convert date to ISO string
            ts = d.isoformat() if hasattr(d, "isoformat") else str(d)
            canon = alias_to_canon.get((sym or "").upper(), (sym or "").upper())
            if canon in out:
                out[canon].append({"t": ts, "close": float(price)})
    # Log a hint if empty
    if all(len(v) == 0 for v in out.values()):
        logger.info(
            "timeseries_repo.empty_result table=%s symbols=%s window=%s base_window=%s",
            TABLE,
            symbols_expanded,
            window,
            base_window,
        )
    return out
