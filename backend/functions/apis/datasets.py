from __future__ import annotations

import json
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from dateutil import parser as dateparser

from . import settings
from .databricks import db_cursor
from .utils import first_key, to_iso, to_native

_EARN_CACHE: dict[str, Any] = {"rows": None, "used_date_col": None, "ts": None}
_VENDOR_CACHE: dict[str, Any] = {"rows": None, "ts": None}
_SCORES_CACHE: dict[str, Any] = {"rows": None, "ts": None}
_PROFILES_CACHE: dict[str, Any] = {"rows": None, "ts": None}
_PROFILE_NAME_INDEX: dict[str, set[str]] | None = None


def normalize_earn_row(row: dict[str, Any], used_date_col: Optional[str]) -> Optional[dict[str, Any]]:
    event_date = row.get("_event_date")
    if not event_date and used_date_col:
        event_date = row.get(used_date_col)
    if not event_date:
        for candidate in settings.DATE_CANDIDATES:
            if candidate in row:
                event_date = row[candidate]
                break
    iso = to_iso(event_date)
    if not iso:
        return None

    time_hint = first_key(row, settings.TIME_CANDIDATES, default=None)
    company = first_key(row, settings.NAME_CANDIDATES, default="")
    symbol = (first_key(row, settings.SYMBOL_CANDIDATES, default="") or "").upper()
    response = {
        "event_date": iso,
        "time_hint": time_hint,
        "company_name": company,
        "symbol": symbol,
        "raw": row,
    }
    return response


def try_query_by_date_col(start: str, end: str, column: str) -> tuple[list[dict[str, Any]], Optional[str]]:
    with db_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {settings.EARNINGS_TABLE}
            WHERE {column} >= ? AND {column} <= ?
            ORDER BY {column} ASC
            LIMIT {settings.EARNINGS_CACHE_LIMIT}
            """,
            (start, end),
        )
        columns = [desc[0] for desc in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    return rows, column


def earn_cache_stale() -> bool:
    if not _EARN_CACHE["rows"] or not _EARN_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _EARN_CACHE["ts"]).total_seconds() > settings.EARNINGS_CACHE_TTL


def earn_load_all(force: bool = False) -> tuple[list[dict[str, Any]], Optional[str]]:
    if not force and not earn_cache_stale():
        return _EARN_CACHE["rows"] or [], _EARN_CACHE["used_date_col"]

    used_date_col = None
    with db_cursor() as cur:
        for candidate in settings.DATE_CANDIDATES:
            try:
                cur.execute(f"SELECT {candidate} FROM {settings.EARNINGS_TABLE} LIMIT 1")
                used_date_col = candidate
                break
            except Exception:
                continue
        if used_date_col:
            query = (
                f"SELECT *, {used_date_col} AS _event_date "
                f"FROM {settings.EARNINGS_TABLE} "
                f"ORDER BY {used_date_col} ASC LIMIT {settings.EARNINGS_CACHE_LIMIT}"
            )
        else:
            query = f"SELECT * FROM {settings.EARNINGS_TABLE} LIMIT {settings.EARNINGS_CACHE_LIMIT}"
        cur.execute(query)
        columns = [desc[0] for desc in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]

    _EARN_CACHE.update({
        "rows": rows,
        "used_date_col": used_date_col,
        "ts": datetime.utcnow(),
    })
    return rows, used_date_col


def earn_cache_timestamp() -> Optional[datetime]:
    return _EARN_CACHE.get("ts")


def vendor_cache_stale() -> bool:
    if not _VENDOR_CACHE["rows"] or not _VENDOR_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _VENDOR_CACHE["ts"]).total_seconds() > settings.VENDOR_CACHE_TTL


def vendor_load_all(force: bool = False) -> list[dict[str, Any]]:
    if not force and not vendor_cache_stale():
        return _VENDOR_CACHE["rows"] or []

    query = (
        f"""
        SELECT company, ticker, relation_type, counterparty_name, counterparty_type,
               tier, category, component_or_product, region,
               relationship_strength, est_contract_value_usd_m, start_year,
               notes, is_dummy
        FROM {settings.VENDOR_TABLE}
        LIMIT {settings.VENDOR_CACHE_LIMIT}
        """
    )
    with db_cursor() as cur:
        cur.execute(query)
        columns = [desc[0] for desc in cur.description]
        raw_rows = [dict(zip(columns, row)) for row in cur.fetchall()]

    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        converted = {key: to_native(value) for key, value in raw.items()}
        start_year = converted.get("start_year")
        if isinstance(start_year, str):
            try:
                converted["start_year"] = int(start_year)
            except ValueError:
                pass
        rows.append(converted)

    _VENDOR_CACHE.update({"rows": rows, "ts": datetime.utcnow()})
    return rows


def vendor_cache_timestamp() -> Optional[datetime]:
    return _VENDOR_CACHE.get("ts")


def scores_cache_stale() -> bool:
    if not _SCORES_CACHE["rows"] or not _SCORES_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _SCORES_CACHE["ts"]).total_seconds() > settings.SCORES_CACHE_TTL


def scores_load_all(force: bool = False) -> list[dict[str, Any]]:
    if not force and not scores_cache_stale():
        return _SCORES_CACHE["rows"] or []

    query = f"""
        SELECT symbol, as_of, sector, industry, px, pe,
               score_fundamentals, score_valuation, score_sentiment,
               score_innovation, score_macro, overall_score
        FROM {settings.SCORES_TABLE}
        WHERE overall_score IS NOT NULL
        ORDER BY overall_score DESC
        LIMIT {settings.SCORES_CACHE_LIMIT}
    """
    try:
        with db_cursor() as cur:
            cur.execute(query)
            columns = [desc[0] for desc in cur.description]
            raw_rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception:
        raw_rows = load_mock_dataset("scores")
        _SCORES_CACHE.update({"rows": raw_rows, "ts": datetime.utcnow()})
        return raw_rows

    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        converted = {key: to_native(value) for key, value in raw.items()}
        as_of = converted.get("as_of")
        if isinstance(as_of, str):
            try:
                converted["as_of"] = dateparser.parse(as_of).date().isoformat()
            except Exception:
                pass
        rows.append(converted)

    _SCORES_CACHE.update({"rows": rows, "ts": datetime.utcnow()})
    return rows


def scores_cache_timestamp() -> Optional[datetime]:
    return _SCORES_CACHE.get("ts")


def profiles_cache_stale() -> bool:
    if not _PROFILES_CACHE["rows"] or not _PROFILES_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _PROFILES_CACHE["ts"]).total_seconds() > settings.PROFILES_CACHE_TTL


def profiles_load_all(force: bool = False) -> list[dict[str, Any]]:
    if not force and not profiles_cache_stale():
        return _PROFILES_CACHE["rows"] or []

    query = f"""
        SELECT symbol, price, marketCap, beta, lastDividend, `range`, change, changePercentage,
               volume, averageVolume, companyName, currency, cik, isin, cusip,
               exchangeFullName, exchange, industry, website, description,
               ceo, sector, country, fullTimeEmployees, phone, address, city,
               state, zip, image, ipoDate, defaultImage, isEtf, isActivelyTrading,
               isAdr, isFund
        FROM {settings.PROFILES_TABLE}
        ORDER BY companyName ASC
        LIMIT {settings.PROFILES_CACHE_LIMIT}
    """
    with db_cursor() as cur:
        cur.execute(query)
        columns = [desc[0] for desc in cur.description]
        records = [dict(zip(columns, row)) for row in cur.fetchall()]

    rows: list[dict[str, Any]] = []
    for record in records:
        converted: dict[str, Any] = {}
        for key, value in record.items():
            if isinstance(value, Decimal):
                converted[key] = float(value)
            else:
                converted[key] = value
        ipo = converted.get("ipoDate")
        if isinstance(ipo, datetime):
            converted["ipoDate"] = ipo.date().isoformat()
        rows.append(converted)

    _PROFILES_CACHE.update({"rows": rows, "ts": datetime.utcnow()})
    return rows


def profiles_cache_timestamp() -> Optional[datetime]:
    return _PROFILES_CACHE.get("ts")


def load_mock_dataset(dataset: str) -> list[dict[str, Any]]:
    path = settings.MOCK_DATA_PATHS.get(dataset)
    if not path:
        return []
    full_path = path
    if not os.path.isabs(full_path):
        full_path = os.path.join(settings.BASE_DIR, full_path)
    try:
        with open(full_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return [dict(item) for item in data]
        settings.logger.warning("Mock dataset %s is not a list; using empty list", dataset)
        return []
    except Exception as exc:  # pragma: no cover - optional file
        settings.logger.error("Failed to load mock dataset %s from %s: %s", dataset, full_path, exc)
        return []


def build_profile_name_index(force: bool = False) -> dict[str, set[str]]:
    global _PROFILE_NAME_INDEX
    if _PROFILE_NAME_INDEX is not None and not force:
        return _PROFILE_NAME_INDEX
    rows = profiles_load_all(force=force)
    index: dict[str, set[str]] = {}
    for row in rows:
        name = str(row.get("companyName") or "").strip().lower()
        ticker = str(row.get("symbol") or "").strip().upper()
        if not name and not ticker:
            continue
        tokens = {slugify_word(part) for part in name.split() if slugify_word(part)}
        if ticker:
            tokens.add(slugify_word(ticker))
        for token in tokens:
            index.setdefault(token, set()).add(ticker)
    _PROFILE_NAME_INDEX = index
    return index


def slugify_word(word: str) -> str:
    return "".join(ch for ch in word.lower() if ch.isalnum())


__all__ = [
    "build_profile_name_index",
    "earn_cache_stale",
    "earn_load_all",
    "earn_cache_timestamp",
    "load_mock_dataset",
    "normalize_earn_row",
    "profiles_load_all",
    "profiles_cache_timestamp",
    "scores_load_all",
    "scores_cache_timestamp",
    "slugify_word",
    "try_query_by_date_col",
    "vendor_load_all",
    "vendor_cache_timestamp",
]
