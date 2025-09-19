# app.py
from __future__ import annotations

import json, logging, math, os, re
from typing import List, Dict, Any, Tuple, Literal, Optional
from datetime import datetime, timedelta, date
from contextlib import contextmanager
from decimal import Decimal

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dateutil import parser as dateparser
from dotenv import load_dotenv
try:
    from openai import AzureOpenAI, OpenAI, OpenAIError
except Exception:  # pragma: no cover - optional dependency
    AzureOpenAI = None
    OpenAI = None
    class _DummyOpenAIError(Exception):
        pass

    OpenAIError = _DummyOpenAIError

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------- Databricks SQL connector ----------------
try:
    from databricks import sql as dbsql
except Exception:
    dbsql = None

# ======== Env vars (local/ngrok/Vercel/Railway) ========
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")  # e.g. https://dbc-xxxx.cloud.databricks.com
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID")
DATABRICKS_HTTP_PATH = f"/sql/1.0/warehouses/{DATABRICKS_WAREHOUSE_ID}" if DATABRICKS_WAREHOUSE_ID else None

# ======== Tables ========
EARNINGS_TABLE  = "workspace.sw_gold.earnings_calendar_new"
VENDOR_TABLE    = "workspace.sw_gold.vendor_customer_network"
SCORES_TABLE    = os.getenv("SCORES_TABLE", "workspace.sw_gold.scores")
PROFILES_TABLE  = os.getenv("PROFILES_TABLE", "workspace.sw_gold.nyse_profiles")

# ======== LLM config ========
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", os.getenv("LLM_MODEL", "gpt-4o-mini"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.1"))

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3:8b-instruct")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))
OLLAMA_FALLBACK_BASE_URL = os.getenv("OLLAMA_FALLBACK_BASE_URL")

LLM_MODE = (os.getenv("LLM_MODE") or "").strip().lower()
MOCK_PROFILES_PATH = os.getenv("MOCK_PROFILES_PATH")
MOCK_SCORES_PATH = os.getenv("MOCK_SCORES_PATH")
MOCK_EARNINGS_PATH = os.getenv("MOCK_EARNINGS_PATH")
MOCK_VENDORS_PATH = os.getenv("MOCK_VENDORS_PATH")

MOCK_DATA_PATHS = {
    "profiles": MOCK_PROFILES_PATH,
    "scores": MOCK_SCORES_PATH,
    "earnings": MOCK_EARNINGS_PATH,
    "vendors": MOCK_VENDORS_PATH,
}

logger = logging.getLogger("smartwealth.chat")

# Candidate column names (earnings tolerant schema)
DATE_CANDIDATES = ["event_date", "earnings_date", "report_date", "calendar_date", "date"]
TIME_CANDIDATES = ["time", "session", "when", "period"]
NAME_CANDIDATES = ["company_name", "name", "company"]
SYMBOL_CANDIDATES = ["symbol", "ticker", "Symbol", "SYMBOL"]

# ======== Cache config ========
EARNINGS_CACHE_TTL = int(os.getenv("EARNINGS_CACHE_TTL", "900"))   # 15 min
EARNINGS_CACHE_LIMIT = int(os.getenv("EARNINGS_CACHE_LIMIT", "50000"))

VENDOR_CACHE_TTL   = int(os.getenv("VENDOR_CACHE_TTL", "3600"))    # 60 min
VENDOR_CACHE_LIMIT = int(os.getenv("VENDOR_CACHE_LIMIT", "200000"))

SCORES_CACHE_TTL   = int(os.getenv("SCORES_CACHE_TTL", "600"))      # 10 min
SCORES_CACHE_LIMIT = int(os.getenv("SCORES_CACHE_LIMIT", "200"))

PROFILES_CACHE_TTL = int(os.getenv("PROFILES_CACHE_TTL", "900"))    # 15 min
PROFILES_CACHE_LIMIT = int(os.getenv("PROFILES_CACHE_LIMIT", "5000"))

# ---------------- helpers ----------------
def _require_dbsql():
    if not dbsql:
        raise RuntimeError("databricks-sql-connector is not installed. Run: pip install databricks-sql-connector")
    if not (DATABRICKS_HOST and DATABRICKS_TOKEN and DATABRICKS_HTTP_PATH):
        raise RuntimeError(
            "Missing Databricks env vars. Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID"
        )

@contextmanager
def _db_cursor():
    """Context manager that opens a connection + cursor and guarantees close()."""
    _require_dbsql()
    conn = dbsql.connect(
        server_hostname=DATABRICKS_HOST.replace("https://", "").replace("http://", ""),
        http_path=DATABRICKS_HTTP_PATH,
        access_token=DATABRICKS_TOKEN,
    )
    try:
        cur = conn.cursor()
        try:
            yield cur
        finally:
            cur.close()
    finally:
        conn.close()

def _first_key(d: dict, keys: list[str], default=None):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default

def _to_iso(dt) -> str | None:
    if isinstance(dt, str):
        try:
            return dateparser.parse(dt).date().isoformat()
        except Exception:
            return None
    try:
        return dt.isoformat()
    except Exception:
        return None


def _to_native(val):
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    return val

def _normalize_earn_row(r: dict, used_date_col: str | None = None) -> dict | None:
    event_date = r.get("_event_date")
    if not event_date and used_date_col:
        event_date = r.get(used_date_col)
    if not event_date:
        for dc in DATE_CANDIDATES:
            if dc in r:
                event_date = r[dc]
                break
    iso = _to_iso(event_date)
    if not iso:
        return None

    symbol = _first_key(r, SYMBOL_CANDIDATES)
    if not symbol:
        return None

    company_name = _first_key(r, NAME_CANDIDATES, default="")
    time_hint = _first_key(r, TIME_CANDIDATES, default="")
    return {
        "event_date": iso,
        "symbol": str(symbol).upper(),
        "company_name": company_name,
        "time_hint": time_hint,
        "raw": r,
    }

def _try_query_by_date_col(start_str: str, end_str: str, date_col: str):
    q = f"""
        SELECT *, {date_col} AS _event_date
        FROM {EARNINGS_TABLE}
        WHERE {date_col} >= '{start_str}' AND {date_col} <= '{end_str}'
        ORDER BY {date_col} ASC
        LIMIT 5000
    """
    with _db_cursor() as c:
        c.execute(q)
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    return rows, date_col

# ---------------- Flask app ----------------
app = Flask(__name__)

# CORS: allow local + any ngrok subdomain (regex), extend via FRONTEND_ORIGINS env
_default_origins = {"http://localhost:5173", "http://127.0.0.1:5173"}
_env_origins = {o.strip() for o in (os.getenv("FRONTEND_ORIGINS") or "").split(",") if o.strip()}
NGROK_REGEX = re.compile(r"^https://[a-z0-9-]+\.ngrok-free\.app$")
CORS(app, resources={r"/api/*": {"origins": list(_default_origins.union(_env_origins)) + [NGROK_REGEX]}},
     supports_credentials=True)

# ---------------- earnings cache ----------------
_EARN_CACHE = {"rows": None, "used_date_col": None, "ts": None}

def _earn_cache_stale() -> bool:
    if not _EARN_CACHE["rows"] or not _EARN_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _EARN_CACHE["ts"]).total_seconds() > EARNINGS_CACHE_TTL

def _earn_load_all(force: bool = False):
    if not force and not _earn_cache_stale():
        return _EARN_CACHE["rows"], _EARN_CACHE["used_date_col"]
    used_date_col = None
    with _db_cursor() as c:
        for dc in DATE_CANDIDATES:
            try:
                c.execute(f"SELECT {dc} FROM {EARNINGS_TABLE} LIMIT 1")
                used_date_col = dc
                break
            except Exception:
                continue
        if used_date_col:
            q = f"SELECT *, {used_date_col} AS _event_date FROM {EARNINGS_TABLE} ORDER BY {used_date_col} ASC LIMIT {EARNINGS_CACHE_LIMIT}"
        else:
            q = f"SELECT * FROM {EARNINGS_TABLE} LIMIT {EARNINGS_CACHE_LIMIT}"
        c.execute(q)
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    _EARN_CACHE.update({"rows": rows, "used_date_col": used_date_col, "ts": datetime.utcnow()})
    return rows, used_date_col

# ---------------- vendor cache ----------------
_VENDOR_CACHE = {"rows": None, "ts": None}

def _vendor_cache_stale() -> bool:
    if not _VENDOR_CACHE["rows"] or not _VENDOR_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _VENDOR_CACHE["ts"]).total_seconds() > VENDOR_CACHE_TTL

def _vendor_load_all(force: bool = False):
    if not force and not _vendor_cache_stale():
        return _VENDOR_CACHE["rows"]
    with _db_cursor() as c:
        q = f"""
            SELECT company, ticker, relation_type, counterparty_name, counterparty_type,
                   tier, category, component_or_product, region, relationship_strength,
                   est_contract_value_usd_m, start_year, notes, is_dummy
            FROM {VENDOR_TABLE}
            LIMIT {VENDOR_CACHE_LIMIT}
        """
        c.execute(q)
        cols = [d[0] for d in c.description]
        rows = [dict(zip(cols, r)) for r in c.fetchall()]
    _VENDOR_CACHE.update({"rows": rows, "ts": datetime.utcnow()})
    return rows

# ---------------- scores cache ----------------
_SCORES_CACHE = {"rows": None, "ts": None}

_PROFILES_CACHE = {"rows": None, "ts": None}


_MOCK_DATA_CACHE: dict[str, Optional[list[dict[str, Any]]]] = {}
_PROFILE_NAME_INDEX: Optional[dict[str, set[str]]] = None
_PROFILE_NAME_INDEX_TS: Optional[datetime] = None


def _build_profile_name_index(force: bool = False) -> dict[str, set[str]]:
    global _PROFILE_NAME_INDEX, _PROFILE_NAME_INDEX_TS
    if _PROFILE_NAME_INDEX is not None and not force:
        # rebuild cache every 30 minutes in case of updates
        if _PROFILE_NAME_INDEX_TS and (datetime.utcnow() - _PROFILE_NAME_INDEX_TS).total_seconds() < 1800:
            return _PROFILE_NAME_INDEX
    index: dict[str, set[str]] = {}
    try:
        rows = _profiles_load_all(force=force)
    except Exception:
        rows = _load_mock_dataset("profiles")
    for row in rows:
        symbol = str((row.get("symbol") or "")).upper()
        if not symbol:
            continue
        name = str(row.get("companyName") or "")
        tokens = { _slugify_word(name) }
        parts = re.split(r"[^A-Za-z0-9]+", name)
        tokens.update(_slugify_word(part) for part in parts if part)
        tokens = {t for t in tokens if t and t.upper() not in SYMBOL_STOPWORDS}
        for token in tokens:
            index.setdefault(token, set()).add(symbol)
    _PROFILE_NAME_INDEX = index
    _PROFILE_NAME_INDEX_TS = datetime.utcnow()
    return index


def _slugify_word(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


SYMBOL_STOPWORDS = {
    "A", "AN", "AND", "THE", "OF", "FOR", "WITH", "VS", "VERSUS", "PLEASE",
    "SHOW", "ABOUT", "ON", "IN", "COMPARE", "TO", "FROM", "US",
    "WE", "YOU", "HELP", "INFO", "DATA", "STOCK", "COMPANY", "CAP", "MARKET",
    "LIST", "GIVE", "WHAT", "IS", "ARE", "DO", "PLEASE", "HELP", "JUST",
    "WHERE", "WHEN", "ME", "VALUE", "DEAL", "ISIN", "CUSIP", "RELATION", "RELATIONSHIP",
    "CUSTOMER", "SUPPLIER", "VENDOR", "CLIENT", "PARTNER", "GUIDANCE"
}

SYMBOL_SYNONYMS = {
    "alphabet": "GOOGL",
    "google": "GOOGL",
    "meta": "META",
    "facebook": "META",
    "nvidia": "NVDA",
    "tesla": "TSLA",
    "amazon": "AMZN",
    "apple": "AAPL",
    "microsoft": "MSFT",
    "blackrock": "BLK",
    "riot": "RIOT",
    "unitedhealth": "UNH",
    "berkshire": "BRK.B",
    "broadcom": "AVGO",
    "netflix": "NFLX",
    "advanced micro devices": "AMD",
    "amd": "AMD",
    "salesforce": "CRM",
    "snowflake": "SNOW",
    "uber": "UBER",
    "visa": "V",
    "mastercard": "MA",
    "oracle": "ORCL",
    "intel": "INTC",
    "qualcomm": "QCOM",
    "disney": "DIS",
    "adobe": "ADBE",
}

SYMBOL_SYNONYMS_SLUG = { _slugify_word(k): v.upper() for k, v in SYMBOL_SYNONYMS.items() }

KNOWN_SECTORS = {
    "technology": "Technology",
    "information technology": "Technology",
    "communication services": "Communication Services",
    "financial services": "Financial Services",
    "healthcare": "Healthcare",
    "industrials": "Industrials",
    "consumer cyclical": "Consumer Cyclical",
    "consumer defensive": "Consumer Defensive",
    "energy": "Energy",
    "utilities": "Utilities",
    "real estate": "Real Estate",
    "materials": "Basic Materials"
}

COUNTRY_SYNONYMS = {
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "u.s.": "US",
    "u s": "US",
    "canada": "Canada",
    "china": "China",
    "japan": "Japan"
}

MARKET_CAP_FILTERS = {
    "mega cap": 200_000_000_000,
    "large cap": 100_000_000_000,
    "mid cap": 10_000_000_000,
    "small cap": 2_000_000_000,
}

VENDOR_KEYWORDS = {"vendor", "vendors", "supplier", "suppliers", "customer", "customers", "client", "clients", "counterparty", "counterparties", "buyer", "buyers", "seller", "sellers", "partner", "partnership"}
EARNINGS_KEYWORDS = {"earnings", "eps", "guidance", "revenue guidance", "report", "call"}
SCORE_KEYWORDS = {"score", "ranking", "rank", "valuation score", "innovation score", "sentiment score", "overall score"}


def _scores_cache_stale() -> bool:
    if not _SCORES_CACHE["rows"] or not _SCORES_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _SCORES_CACHE["ts"]).total_seconds() > SCORES_CACHE_TTL


def _scores_load_all(force: bool = False):
    if not force and not _scores_cache_stale():
        return _SCORES_CACHE["rows"]

    q = f"""
        SELECT symbol,
               as_of,
               sector,
               industry,
               px,
               ev_ebitda,
               score_fundamentals,
               score_valuation,
               score_sentiment,
               score_innovation,
               score_macro,
               overall_score,
               rank_overall
        FROM {SCORES_TABLE}
        WHERE rank_overall IS NOT NULL
        ORDER BY rank_overall ASC
        LIMIT {SCORES_CACHE_LIMIT}
    """
    with _db_cursor() as c:
        c.execute(q)
        cols = [d[0] for d in c.description]
        raw_rows = [dict(zip(cols, r)) for r in c.fetchall()]

    rows = []
    for r in raw_rows:
        clean = {k: _to_native(v) for k, v in r.items()}
        if clean.get("as_of") and isinstance(clean["as_of"], str):
            try:
                clean["as_of"] = dateparser.parse(clean["as_of"]).date().isoformat()
            except Exception:
                pass
        rows.append(clean)

    _SCORES_CACHE.update({"rows": rows, "ts": datetime.utcnow()})
    return rows


def _profiles_cache_stale() -> bool:
    if not _PROFILES_CACHE["rows"] or not _PROFILES_CACHE["ts"]:
        return True
    return (datetime.utcnow() - _PROFILES_CACHE["ts"]).total_seconds() > PROFILES_CACHE_TTL


def _profiles_load_all(force: bool = False):
    if not force and not _profiles_cache_stale():
        return _PROFILES_CACHE["rows"]

    q = f"""
        SELECT symbol, price, marketCap, beta, lastDividend, `range`, change, changePercentage,
               volume, averageVolume, companyName, currency, cik, isin, cusip,
               exchangeFullName, exchange, industry, website, description,
               ceo, sector, country, fullTimeEmployees, phone, address, city,
               state, zip, image, ipoDate, defaultImage, isEtf, isActivelyTrading,
               isAdr, isFund
        FROM {PROFILES_TABLE}
        ORDER BY companyName ASC
        LIMIT {PROFILES_CACHE_LIMIT}
    """

    with _db_cursor() as c:
        c.execute(q)
        cols = [d[0] for d in c.description]
        records = [dict(zip(cols, r)) for r in c.fetchall()]

    rows: list[dict[str, Any]] = []
    for r in records:
        clean: dict[str, Any] = {}
        for k, v in r.items():
            if isinstance(v, Decimal):
                clean[k] = float(v)
            else:
                clean[k] = v
        ipo = clean.get("ipoDate")
        if isinstance(ipo, datetime):
            clean["ipoDate"] = ipo.date().isoformat()
        rows.append(clean)

    _PROFILES_CACHE.update({"rows": rows, "ts": datetime.utcnow()})
    return rows


def _load_mock_dataset(dataset: str) -> list[dict[str, Any]]:
    if dataset in _MOCK_DATA_CACHE:
        return _MOCK_DATA_CACHE[dataset] or []
    path = MOCK_DATA_PATHS.get(dataset)
    if not path:
        _MOCK_DATA_CACHE[dataset] = []
        return []
    full_path = path
    if not os.path.isabs(full_path):
        full_path = os.path.join(BASE_DIR, full_path)
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            parsed = [dict(item) for item in data]
        else:
            logger.warning("Mock dataset %s is not a list; using empty list", dataset)
            parsed = []
    except Exception as exc:
        logger.error("Failed to load mock dataset %s from %s: %s", dataset, full_path, exc)
        parsed = []
    _MOCK_DATA_CACHE[dataset] = parsed
    return parsed


def _compare_scalar(lhs: Any, rhs: Any, op: str) -> bool:
    if op == "eq":
        return lhs == rhs
    if op == "neq":
        return lhs != rhs
    if op == "gt":
        return lhs > rhs
    if op == "lt":
        return lhs < rhs
    if op == "gte":
        return lhs >= rhs
    if op == "lte":
        return lhs <= rhs
    return False


def _row_matches_filter(row: dict[str, Any], flt: PlanFilter, plan: ChatPlan) -> bool:
    config = plan.config
    col = flt.column
    op = flt.operator
    target = flt.value
    value = row.get(col)
    if value is None:
        return False

    numeric_cols = config.numeric_columns.union(config.currency_columns).union(config.percent_columns)
    if col in numeric_cols:
        try:
            lhs = float(value)
            rhs = float(target)
        except Exception:
            return False
        return _compare_scalar(lhs, rhs, op)

    if col in config.date_columns:
        lhs_iso = _to_iso(value) or str(value)
        rhs_iso = str(target)
        return _compare_scalar(lhs_iso, rhs_iso, op)

    text = str(value)
    if op == "contains":
        return str(target).lower() in text.lower()
    if op == "starts_with":
        return text.lower().startswith(str(target).lower())
    lhs = text.upper()
    rhs = str(target).upper()
    return _compare_scalar(lhs, rhs, op)


def _apply_plan_filters(rows: list[dict[str, Any]], plan: ChatPlan) -> list[dict[str, Any]]:
    config = plan.config
    ticker_col = config.ticker_column
    ticker_set = {t.upper() for t in plan.tickers} if plan.tickers and ticker_col else None

    filtered: list[dict[str, Any]] = []
    for row in rows:
        if ticker_set is not None:
            ticker_val = str(row.get(ticker_col) or "").upper()
            if ticker_val not in ticker_set:
                continue
        ok = True
        for flt in plan.filters:
            if flt.column not in config.allowed_columns:
                continue
            if not _row_matches_filter(row, flt, plan):
                ok = False
                break
        if ok:
            filtered.append(row)

    sort_col: Optional[str] = None
    sort_desc = True
    if plan.sort:
        sort_col = plan.sort.column
        sort_desc = plan.sort.direction == "desc"
    elif plan.intent == "compare":
        metrics = plan.metrics_for_chart() or plan.metrics
        for metric in metrics:
            if metric in config.allowed_columns:
                sort_col = metric
                sort_desc = True
                break
    elif config.default_sort:
        sort_col, default_dir = config.default_sort
        sort_desc = (default_dir or "desc").lower() != "asc"

    if sort_col and sort_col in config.allowed_columns:
        def sort_key(row: dict[str, Any]):
            val = row.get(sort_col)
            if val is None:
                return float("-inf") if sort_desc else float("inf")
            if sort_col in config.numeric_columns or sort_col in config.currency_columns or sort_col in config.percent_columns:
                try:
                    return float(val)
                except Exception:
                    return float("-inf") if sort_desc else float("inf")
            if sort_col in config.date_columns:
                return _to_iso(val) or str(val)
            return str(val).upper()

        filtered.sort(key=sort_key, reverse=sort_desc)

    return filtered[: plan.limit]


def _mock_execute_plan(plan: ChatPlan) -> list[dict[str, Any]]:
    rows = [dict(r) for r in _load_mock_dataset(plan.dataset)]
    if not rows:
        return []
    return _apply_plan_filters(rows, plan)


def _search_symbols_by_hints(config: DatasetConfig, hints: list[str], limit: int = 5) -> list[tuple[str, str]]:
    if not hints:
        return []
    if config.key != "profiles":
        return []
    index = _build_profile_name_index()
    results: list[tuple[str, str]] = []
    try:
        with _db_cursor() as c:
            for hint in hints:
                matches = index.get(hint)
                if matches:
                    placeholders = ", ".join(["?"] * len(matches))
                    q = f"SELECT symbol, companyName FROM {config.table} WHERE UPPER(symbol) IN ({placeholders}) LIMIT {limit}"
                    c.execute(q, list(matches))
                    for symbol, name in c.fetchall():
                        tup = (str(symbol).upper(), str(name))
                        if tup not in results:
                            results.append(tup)
                        if len(results) >= limit:
                            return results
                else:
                    q = f"SELECT symbol, companyName FROM {config.table} WHERE LOWER(companyName) LIKE ? LIMIT 2"
                    c.execute(q, (f"%{hint.lower()}%",))
                    for symbol, name in c.fetchall():
                        tup = (str(symbol).upper(), str(name))
                        if tup not in results:
                            results.append(tup)
                        if len(results) >= limit:
                            return results
    except Exception:
        pass
    if not results:
        # fallback to mock data if available
        for row in _load_mock_dataset(config.key):
            symbol = str(row.get(config.ticker_column or "symbol") or "").upper()
            name = str(row.get("companyName") or "")
            if not symbol:
                continue
            lowered = name.lower()
            for hint in hints:
                if hint and hint.lower() in lowered:
                    tup = (symbol, name)
                    if tup not in results:
                        results.append(tup)
                    if len(results) >= limit:
                        return results
    return results


def _extract_prompt_hints(prompt: str) -> list[str]:
    words = re.findall(r"[A-Za-z]{3,}", prompt)
    hints: list[str] = []
    for word in words:
        slug = _slugify_word(word)
        if not slug or slug.upper() in SYMBOL_STOPWORDS:
            continue
        if slug not in hints:
            hints.append(slug)
        if len(hints) >= 6:
            break
    return hints


def _filter_existing_tickers(symbols: list[str], config: DatasetConfig) -> list[str]:
    if not symbols:
        return []
    ticker_col = config.ticker_column
    if not ticker_col:
        return symbols[:]
    upper_symbols = [s.upper() for s in symbols]

    if LLM_MODE == "mock":
        rows = _load_mock_dataset(config.key)
        existing = {str(r.get(ticker_col) or "").upper() for r in rows}
        return [s for s in symbols if s.upper() in existing]

    placeholders = ", ".join(["?"] * len(upper_symbols))
    sql = f"SELECT UPPER({ticker_col}) AS sym FROM {config.table} WHERE UPPER({ticker_col}) IN ({placeholders})"
    try:
        _, rows = _execute_sql(sql, upper_symbols)
        found = {str(r.get("sym") or "").upper() for r in rows}
        return [s for s in symbols if s.upper() in found]
    except Exception:
        return symbols[:]


def _ensure_plan_column(plan: ChatPlan, column: str) -> None:
    config = plan.config
    norm = config.normalize_column(column)
    if not norm:
        return
    if norm in config.numeric_columns or norm in config.currency_columns or norm in config.percent_columns:
        if norm not in plan.metrics:
            plan.metrics.append(norm)
    else:
        if norm not in plan.include:
            plan.include.append(norm)


def _add_columns_from_keywords(plan: ChatPlan, prompt: str) -> None:
    config = plan.config
    mapping = PROMPT_COLUMN_KEYWORDS.get(plan.dataset, [])
    if not mapping:
        return
    text = prompt.lower()
    def _contains_keyword(keyword: str) -> bool:
        keyword = keyword.lower()
        if not keyword:
            return False
        if any(ch in keyword for ch in {" ", "-", "/"}):
            return keyword in text
        return re.search(rf"\b{re.escape(keyword)}\b", text) is not None
    for keywords, columns in mapping:
        if any(_contains_keyword(keyword) for keyword in keywords):
            for column in columns:
                _ensure_plan_column(plan, column)

    if config.key == "profiles":
        if any(keyword in text for keyword in {"where ", "where is", "located", "location", "office", "offices", "hq", "headquarter"}):
            for column in ["address", "city", "state", "zip", "country"]:
                _ensure_plan_column(plan, column)
        if any(keyword in text for keyword in {"phone", "contact", "call", "reach"}):
            _ensure_plan_column(plan, "phone")
        if any(keyword in text for keyword in {"identifier", "cik", "isin", "cusip"}):
            for column in ["cik", "isin", "cusip"]:
                _ensure_plan_column(plan, column)
        if "status" in text or "active" in text:
            for column in ["isActivelyTrading", "isEtf", "isAdr", "isFund"]:
                _ensure_plan_column(plan, column)

    elif config.key == "earnings":
        if any(keyword in text for keyword in {"when", "next", "upcoming", "date", "schedule", "time"}):
            for column in ["event_date", "time_hint", "period"]:
                _ensure_plan_column(plan, column)
        if "guidance" in text:
            for column in ["guidanceEPS", "guidanceRevenue"]:
                _ensure_plan_column(plan, column)
        if any(keyword in text for keyword in {"eps", "estimate", "forecast"}):
            for column in ["eps", "epsEstimated", "consensusEPS"]:
                _ensure_plan_column(plan, column)
        if "revenue" in text or "sales" in text:
            for column in ["revenue", "revenueEstimated", "revenueEstimate"]:
                _ensure_plan_column(plan, column)

    elif config.key == "vendors":
        if any(keyword in text for keyword in {"partner", "supplier", "customer", "client", "counterparty"}):
            for column in ["counterparty_name", "counterparty_type", "relation_type"]:
                _ensure_plan_column(plan, column)
        if "value" in text or "contract" in text or "deal" in text:
            _ensure_plan_column(plan, "est_contract_value_usd_m")
        if "since" in text or "start" in text:
            _ensure_plan_column(plan, "start_year")
        if "strength" in text or "score" in text:
            _ensure_plan_column(plan, "relationship_strength")

    # trim to reasonable sizes
    if len(plan.metrics) > 8:
        plan.metrics = plan.metrics[:8]
    if len(plan.include) > config.max_columns:
        plan.include = plan.include[: config.max_columns]


def _add_filters_from_prompt(plan: ChatPlan, prompt: str) -> None:
    config = plan.config
    text = prompt.lower()
    # standard comparison patterns
    numeric_patterns = [
        (r"beta\s*(?:over|above|greater than|>)+\s*([0-9\.]+)", "beta", "gt"),
        (r"beta\s*(?:below|under|less than|<)+\s*([0-9\.]+)", "beta", "lt"),
        (r"market cap(?:italization)?\s*(?:over|above|greater than|>)+\s*([0-9,.]+)\s*([a-z]+)?", "marketCap", "gt"),
        (r"employees\s*(?:over|above|greater than|>)+\s*([0-9,.]+)", "fullTimeEmployees", "gt"),
        (r"employees\s*(?:below|under|less than|<)+\s*([0-9,.]+)", "fullTimeEmployees", "lt"),
    ]

    def _parse_number(raw: str, suffix: Optional[str] = None) -> Optional[float]:
        raw = raw.replace(",", "").strip()
        try:
            value = float(raw)
        except Exception:
            return None
        unit = (suffix or "").lower()
        if unit in {"b", "bn", "billion"}:
            value *= 1_000_000_000
        elif unit in {"m", "mn", "million"}:
            value *= 1_000_000
        elif unit in {"k", "thousand"}:
            value *= 1_000
        return value

    # market cap size keywords (large cap, etc.)
    for label, threshold in MARKET_CAP_FILTERS.items():
        if label in text and config.key == "profiles":
            plan.filters.append(PlanFilter({
                "column": "marketCap",
                "operator": "gte",
                "value": threshold,
            }))

    for pattern, column, op in numeric_patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        norm_col = config.normalize_column(column)
        if not norm_col:
            continue
        groups = match.groups()
        value = _parse_number(groups[0], groups[1] if len(groups) > 1 else None)
        if value is None:
            continue
        plan.filters.append(PlanFilter({
            "column": norm_col,
            "operator": op if op in {"gt", "lt"} else "eq",
            "value": value,
        }))

    if config.key == "profiles":
        filter_map = {
            "sector": "sector",
            "industry": "industry",
            "country": "country",
            "state": "state",
            "city": "city",
        }
        for keyword, column in filter_map.items():
            if keyword not in text:
                continue
            pattern = rf"{keyword}(?:\s+(?:is|for|in|=))?\s+([a-z0-9&\- ]+)"
            match = re.search(pattern, text)
            if not match:
                continue
            value = match.group(1).strip().strip(',.;')
            if not value:
                continue
            norm = config.normalize_column(column)
            if not norm:
                continue
            value = value[:64]
            lower_value = value.lower()
            exists = any((flt.column == norm and lower_value in str(flt.value).lower()) for flt in plan.filters)
            if exists:
                continue
            plan.filters.append(PlanFilter({
                "column": norm,
                "operator": "contains",
                "value": value,
            }))
        # sector detection without keyword
        for slug, proper in KNOWN_SECTORS.items():
            if slug in text and all(keyword not in text for keyword in ["sector", "industry"]):
                plan.filters.append(PlanFilter({
                    "column": "sector",
                    "operator": "contains",
                    "value": proper,
                }))
        for slug, proper in COUNTRY_SYNONYMS.items():
            if slug in text:
                plan.filters.append(PlanFilter({
                    "column": "country",
                    "operator": "eq",
                    "value": proper,
                }))
    elif config.key == "earnings":
        # capture phrases like "after October" or specific dates
        date_match = re.search(r"after\s+([a-z0-9\- ]+)" , text)
        if date_match:
            try:
                parsed = dateparser.parse(date_match.group(1)).date().isoformat()
                plan.filters.append(PlanFilter({
                    "column": "event_date",
                    "operator": "gte",
                    "value": parsed,
                }))
            except Exception:
                pass
        date_match = re.search(r"before\s+([a-z0-9\- ]+)", text)
        if date_match:
            try:
                parsed = dateparser.parse(date_match.group(1)).date().isoformat()
                plan.filters.append(PlanFilter({
                    "column": "event_date",
                    "operator": "lte",
                    "value": parsed,
                }))
            except Exception:
                pass
    elif config.key == "vendors":
        wants_customer = any(word in text for word in {"customer", "customers", "client", "clients", "buyer", "buyers"})
        wants_supplier = any(word in text for word in {"supplier", "suppliers", "vendor", "vendors", "seller", "sellers", "partner", "partners"})
        if wants_customer and not wants_supplier:
            plan.filters.append(PlanFilter({
                "column": "relation_type",
                "operator": "contains",
                "value": "Customer",
            }))
        elif wants_supplier and not wants_customer:
            plan.filters.append(PlanFilter({
                "column": "relation_type",
                "operator": "contains",
                "value": "Supplier",
            }))

def _augment_plan_with_prompt(plan: ChatPlan, prompt: str) -> None:
    text = prompt.lower()

    def resolve_dataset(default: str) -> str:
        if any(keyword in text for keyword in VENDOR_KEYWORDS):
            return "vendors"
        if any(keyword in text for keyword in EARNINGS_KEYWORDS):
            return "earnings"
        if any(keyword in text for keyword in SCORE_KEYWORDS):
            return "scores"
        return default

    desired_dataset = resolve_dataset(plan.dataset)
    if desired_dataset != plan.dataset:
        plan.dataset = desired_dataset
        plan.config = DATASET_CONFIGS[desired_dataset]
        plan.metrics = []
        plan.include = []
        plan.filters = []
        plan.tickers = []

    config = plan.config
    ticker_col = config.ticker_column
    hints = _extract_prompt_hints(prompt)

    if ticker_col:
        # Add synonym-based tickers
        for hint in hints:
            syn = SYMBOL_SYNONYMS_SLUG.get(hint)
            if syn:
                plan.tickers.append(syn)

        plan.tickers = _filter_existing_tickers(plan.tickers, config)

        if not plan.tickers:
            matches = _search_symbols_by_hints(DATASET_CONFIGS["profiles"], hints, limit=plan.limit or 5)
            plan.tickers = [sym for sym, _ in matches if sym]

    # ensure deduped and trimmed
    deduped: list[str] = []
    for sym in plan.tickers:
        if sym and sym not in deduped:
            deduped.append(sym)
        if len(deduped) >= (plan.limit or 5):
            break
    plan.tickers = deduped

    _add_columns_from_keywords(plan, prompt)
    _add_filters_from_prompt(plan, prompt)

    # final sanity for tickers after adjustments
    if ticker_col:
        plan.tickers = _filter_existing_tickers(plan.tickers, config)

    if config.key == "vendors" and not plan.tickers:
        # fall back to filtering by company name using hints
        hints = _extract_prompt_hints(prompt)
        if hints:
            plan.filters.append(PlanFilter({
                "column": "company",
                "operator": "contains",
                "value": hints[0],
            }))

    # Deduplicate filters and limit
    unique_filters: list[PlanFilter] = []
    seen_filters = set()
    for flt in plan.filters:
        key = (flt.column, flt.operator, str(flt.value).lower())
        if key in seen_filters:
            continue
        seen_filters.add(key)
        unique_filters.append(flt)
        if len(unique_filters) >= 8:
            break
    plan.filters = unique_filters

    if not plan.metrics and not plan.include:
        plan.metrics = config.default_metrics[:]
        plan.include = config.default_include[:]

    plan.metrics = list(dict.fromkeys(plan.metrics))[:8]
    plan.include = list(dict.fromkeys(plan.include))[: config.max_columns]


def _fetch_rows(plan: ChatPlan) -> tuple[list[dict[str, Any]], str, list[Any]]:
    config = plan.config
    if LLM_MODE == "mock":
        rows = _mock_execute_plan(plan)
        return rows, f"MOCK:{plan.dataset}", []

    if config.query_mode == "sql":
        sql, params = _build_sql(plan, config)
        _, rows = _execute_sql(sql, params)
        return rows, sql, params

    loader = config.loader
    if loader is None:
        raise RuntimeError(f"No loader configured for dataset '{config.key}'")

    try:
        loaded = loader(force=False)
    except TypeError:
        loaded = loader()

    rows = [dict(r) for r in loaded]
    rows = _apply_plan_filters(rows, plan)
    sql = f"SELECT * FROM {config.table} /* cached */" if config.table else f"CACHE:{config.key}"
    return rows, sql, []



# ========================= LLM Chat Agent =========================

PROFILES_ALLOWED_COLUMNS: set[str] = {
    "symbol",
    "companyName",
    "sector",
    "industry",
    "country",
    "currency",
    "price",
    "marketCap",
    "beta",
    "lastDividend",
    "change",
    "changePercentage",
    "volume",
    "averageVolume",
    "ceo",
    "website",
    "description",
    "exchangeFullName",
    "exchange",
    "ipoDate",
    "fullTimeEmployees",
    "address",
    "city",
    "state",
    "zip",
    "phone",
    "cik",
    "isin",
    "cusip",
    "image",
    "range",
    "defaultImage",
    "isEtf",
    "isActivelyTrading",
    "isAdr",
    "isFund",
    "symbol_queried",
    "symbol_original",
}

PROFILES_NUMERIC_COLUMNS: set[str] = {
    "price",
    "marketCap",
    "beta",
    "lastDividend",
    "change",
    "changePercentage",
    "volume",
    "averageVolume",
    "fullTimeEmployees",
}

PROFILES_PERCENT_COLUMNS: set[str] = {"changePercentage"}

PROFILES_DATE_COLUMNS: set[str] = {"ipoDate"}
PROFILES_CURRENCY_COLUMNS: set[str] = {"price", "marketCap", "lastDividend", "change"}

SCORES_ALLOWED_COLUMNS: set[str] = {
    "symbol",
    "as_of",
    "sector",
    "industry",
    "px",
    "ev_ebitda",
    "score_fundamentals",
    "score_valuation",
    "score_sentiment",
    "score_innovation",
    "score_macro",
    "overall_score",
    "rank_overall",
}

SCORES_NUMERIC_COLUMNS: set[str] = {
    "px",
    "ev_ebitda",
    "score_fundamentals",
    "score_valuation",
    "score_sentiment",
    "score_innovation",
    "score_macro",
    "overall_score",
    "rank_overall",
}

SCORES_PERCENT_COLUMNS: set[str] = set()
SCORES_DATE_COLUMNS: set[str] = {"as_of"}
SCORES_CURRENCY_COLUMNS: set[str] = {"px"}

EARNINGS_ALLOWED_COLUMNS: set[str] = {
    "symbol",
    "company_name",
    "event_date",
    "time_hint",
    "period",
    "estimateEPS",
    "epsEstimated",
    "consensusEPS",
    "eps",
    "epsActual",
    "surprise",
    "surprisePercent",
    "revenue",
    "revenueEstimate",
    "revenueEstimated",
    "fiscalDateEnding",
    "event_type",
    "eventStatus",
    "guidanceEPS",
    "guidanceRevenue",
}

EARNINGS_NUMERIC_COLUMNS: set[str] = {
    "estimateEPS",
    "epsEstimated",
    "consensusEPS",
    "eps",
    "epsActual",
    "surprise",
    "surprisePercent",
    "revenue",
    "revenueEstimate",
    "revenueEstimated",
    "guidanceEPS",
    "guidanceRevenue",
}

EARNINGS_PERCENT_COLUMNS: set[str] = {"surprisePercent"}
EARNINGS_DATE_COLUMNS: set[str] = {"event_date", "fiscalDateEnding"}
EARNINGS_CURRENCY_COLUMNS: set[str] = {
    "estimateEPS",
    "epsEstimated",
    "consensusEPS",
    "eps",
    "epsActual",
    "revenue",
    "revenueEstimate",
    "revenueEstimated",
    "guidanceEPS",
    "guidanceRevenue",
}

VENDORS_ALLOWED_COLUMNS: set[str] = {
    "company",
    "ticker",
    "relation_type",
    "counterparty_name",
    "counterparty_type",
    "tier",
    "category",
    "component_or_product",
    "region",
    "relationship_strength",
    "est_contract_value_usd_m",
    "start_year",
    "notes",
    "is_dummy",
}

VENDORS_NUMERIC_COLUMNS: set[str] = {"relationship_strength", "est_contract_value_usd_m", "start_year"}
VENDORS_PERCENT_COLUMNS: set[str] = set()
VENDORS_DATE_COLUMNS: set[str] = set()
VENDORS_CURRENCY_COLUMNS: set[str] = {"est_contract_value_usd_m"}

COLUMN_ALIASES: dict[str, str] = {
    "market cap": "marketCap",
    "market_cap": "marketCap",
    "market capitalization": "marketCap",
    "marketcapitalization": "marketCap",
    "company name": "companyName",
    "ticker": "symbol",
    "share price": "price",
    "stock price": "price",
    "price per share": "price",
    "avg volume": "averageVolume",
    "average volume": "averageVolume",
    "volume average": "averageVolume",
    "change percent": "changePercentage",
    "percent change": "changePercentage",
    "percentage change": "changePercentage",
    "employees": "fullTimeEmployees",
    "headcount": "fullTimeEmployees",
    "workforce": "fullTimeEmployees",
    "employee count": "fullTimeEmployees",
    "people": "fullTimeEmployees",
    "chief executive": "ceo",
    "ceo name": "ceo",
    "chief executive officer": "ceo",
    "leadership": "ceo",
    "exchange name": "exchangeFullName",
    "listing": "exchangeFullName",
    "listed exchange": "exchangeFullName",
    "listing venue": "exchangeFullName",
    "overall score": "overall_score",
    "overallscore": "overall_score",
    "total score": "overall_score",
    "fundamental score": "score_fundamentals",
    "valuation score": "score_valuation",
    "sentiment score": "score_sentiment",
    "innovation score": "score_innovation",
    "macro score": "score_macro",
    "rank": "rank_overall",
    "earnings per share": "eps",
    "reported eps": "eps",
    "eps": "eps",
    "eps estimate": "epsEstimated",
    "estimated eps": "epsEstimated",
    "eps forecast": "epsEstimated",
    "consensus eps": "consensusEPS",
    "guidance": "guidanceEPS",
    "earnings guidance": "guidanceEPS",
    "revenue guidance": "guidanceRevenue",
    "guidance revenue": "guidanceRevenue",
    "contract value": "est_contract_value_usd_m",
    "relationship strength": "relationship_strength",
    "relationship score": "relationship_strength",
    "relationship rating": "relationship_strength",
    "location": "address",
    "headquarters": "address",
    "headquarter": "address",
    "hq": "address",
    "office": "address",
    "offices": "address",
    "corporate office": "address",
    "main office": "address",
    "primary location": "address",
    "where located": "address",
    "where is": "address",
    "campus": "address",
    "home base": "address",
    "address line": "address",
    "phone number": "phone",
    "contact number": "phone",
    "telephone": "phone",
    "cik number": "cik",
    "isin number": "isin",
    "cusip number": "cusip",
    "ipo": "ipoDate",
    "ipo date": "ipoDate",
    "ipo year": "ipoDate",
    "ipo listing": "ipoDate",
    "employees count": "fullTimeEmployees",
    "staff count": "fullTimeEmployees",
    "workforce size": "fullTimeEmployees",
    "actives trading": "isActivelyTrading",
    "actively traded": "isActivelyTrading",
    "actively trading": "isActivelyTrading",
    "adr": "isAdr",
    "etf": "isEtf",
    "fund": "isFund",
    "image url": "image",
    "logo": "image",
    "picture": "image",
    "symbol queried": "symbol_queried",
    "symbol original": "symbol_original",
    "revenue estimate": "revenueEstimated",
    "estimated revenue": "revenueEstimated",
    "revenue forecast": "revenueEstimated",
    "eps estimated": "epsEstimated",
    "sales": "revenue",
    "top line": "revenue",
    "deal size": "est_contract_value_usd_m",
    "start year": "start_year",
    "since": "start_year",
    "session": "time_hint",
    "time": "time_hint",
    "pre-market": "time_hint",
    "after hours": "time_hint",
    "status": "eventStatus",
    "event status": "eventStatus",
    "event type": "event_type",
    "call": "event_type",
    "quarter": "period",
    "fiscal period": "period",
    "summary": "description",
    "overview": "description",
    "webpage": "website",
    "link": "website",
    "trading volume": "volume",
    "avg trading volume": "averageVolume",
    "day change": "change",
    "price change": "change",
    "trading range": "range",
    "52 week range": "range",
    "52w range": "range",
    "volatility": "beta",
    "payout": "lastDividend",
    "value score": "score_valuation",
    "quality score": "score_fundamentals",
    "innovation": "score_innovation",
    "macro": "score_macro",
    "ranking": "rank_overall",
    "position": "rank_overall",
    "score date": "as_of",
    "last updated": "as_of",
    "comment": "notes",
    "details": "notes",
}

PROFILES_LABELS: dict[str, str] = {
    "symbol": "Ticker",
    "companyName": "Company",
    "marketCap": "Market Cap",
    "price": "Price",
    "beta": "Beta",
    "lastDividend": "Last Dividend",
    "change": "Change",
    "changePercentage": "Change %",
    "volume": "Volume",
    "averageVolume": "Avg Volume",
    "sector": "Sector",
    "industry": "Industry",
    "country": "Country",
    "currency": "Currency",
    "ceo": "CEO",
    "website": "Website",
    "description": "Description",
    "exchangeFullName": "Exchange",
    "exchange": "Exchange Code",
    "ipoDate": "IPO Date",
    "fullTimeEmployees": "Employees",
    "address": "Address",
    "city": "City",
    "state": "State",
    "zip": "ZIP",
    "phone": "Phone",
    "cik": "CIK",
    "isin": "ISIN",
    "cusip": "CUSIP",
    "image": "Logo",
    "range": "52W Range",
    "defaultImage": "Default Image",
    "isEtf": "ETF?",
    "isActivelyTrading": "Actively Trading",
    "isAdr": "ADR?",
    "isFund": "Fund?",
    "symbol_queried": "Symbol Queried",
    "symbol_original": "Symbol Original",
}

SCORES_LABELS: dict[str, str] = {
    "symbol": "Ticker",
    "as_of": "As Of",
    "sector": "Sector",
    "industry": "Industry",
    "px": "Price",
    "ev_ebitda": "EV/EBITDA",
    "score_fundamentals": "Fundamentals",
    "score_valuation": "Valuation",
    "score_sentiment": "Sentiment",
    "score_innovation": "Innovation",
    "score_macro": "Macro",
    "overall_score": "Overall Score",
    "rank_overall": "Rank",
}

EARNINGS_LABELS: dict[str, str] = {
    "symbol": "Ticker",
    "company_name": "Company",
    "event_date": "Event Date",
    "time_hint": "Session",
    "period": "Period",
    "estimateEPS": "Est. EPS",
    "epsEstimated": "Est. EPS",
    "consensusEPS": "Consensus EPS",
    "eps": "Reported EPS",
    "epsActual": "Actual EPS",
    "surprise": "Surprise",
    "surprisePercent": "Surprise %",
    "revenue": "Revenue",
    "revenueEstimate": "Revenue Est.",
    "revenueEstimated": "Revenue Est.",
    "fiscalDateEnding": "Fiscal Date",
    "event_type": "Event Type",
    "eventStatus": "Status",
    "guidanceEPS": "Guidance EPS",
    "guidanceRevenue": "Guidance Revenue",
}

VENDORS_LABELS: dict[str, str] = {
    "company": "Company",
    "ticker": "Ticker",
    "relation_type": "Relation",
    "counterparty_name": "Counterparty",
    "counterparty_type": "Counterparty Type",
    "tier": "Tier",
    "category": "Category",
    "component_or_product": "Component/Product",
    "region": "Region",
    "relationship_strength": "Strength",
    "est_contract_value_usd_m": "Contract Value (USDm)",
    "start_year": "Start Year",
    "notes": "Notes",
    "is_dummy": "Dummy",
}


class DatasetConfig:
    def __init__(
        self,
        key: str,
        table: Optional[str],
        allowed_columns: set[str],
        numeric_columns: set[str],
        percent_columns: set[str],
        date_columns: set[str],
        currency_columns: set[str],
        default_metrics: list[str],
        default_include: list[str],
        base_columns: list[str],
        display_labels: dict[str, str],
        ticker_column: Optional[str],
        query_mode: Literal["sql", "cache"] = "sql",
        loader=None,
        max_columns: int = 12,
        default_sort: Optional[tuple[str, str]] = None,
    ):
        self.key = key
        self.table = table
        self.allowed_columns = allowed_columns
        self.numeric_columns = numeric_columns
        self.percent_columns = percent_columns
        self.date_columns = date_columns
        self.currency_columns = currency_columns
        self.default_metrics = default_metrics
        self.default_include = default_include
        self.base_columns = base_columns
        self.display_labels = display_labels
        self.ticker_column = ticker_column
        self.query_mode = query_mode
        self.loader = loader
        self.max_columns = max_columns
        self.default_sort = default_sort

    def normalize_column(self, name: str | None) -> Optional[str]:
        if not name:
            return None
        key = name.strip()
        if not key:
            return None
        mapped = COLUMN_ALIASES.get(key.lower(), key)
        for col in self.allowed_columns:
            if mapped.lower() == col.lower():
                return col
        return None


def _earnings_loader_wrapper(force: bool = False) -> list[dict[str, Any]]:
    rows, used_date_col = _earn_load_all(force=force)
    normalized: list[dict[str, Any]] = []
    for r in rows:
        norm = _normalize_earn_row(r, used_date_col)
        if not norm:
            continue
        combined = dict(norm.get("raw") or {})
        combined.setdefault("symbol", norm.get("symbol"))
        combined.setdefault("company_name", norm.get("company_name"))
        combined.setdefault("event_date", norm.get("event_date"))
        combined.setdefault("time_hint", norm.get("time_hint"))
        normalized.append({k: _to_native(v) for k, v in combined.items()})
    return normalized


DATASET_CONFIGS: dict[str, DatasetConfig] = {
    "profiles": DatasetConfig(
        key="profiles",
        table=PROFILES_TABLE,
        allowed_columns=PROFILES_ALLOWED_COLUMNS,
        numeric_columns=PROFILES_NUMERIC_COLUMNS,
        percent_columns=PROFILES_PERCENT_COLUMNS,
        date_columns=PROFILES_DATE_COLUMNS,
        currency_columns=PROFILES_CURRENCY_COLUMNS,
        default_metrics=["marketCap", "price"],
        default_include=["sector", "industry"],
        base_columns=["symbol", "companyName"],
        display_labels=PROFILES_LABELS,
        ticker_column="symbol",
        query_mode="sql",
        max_columns=18,
    ),
    "scores": DatasetConfig(
        key="scores",
        table=SCORES_TABLE,
        allowed_columns=SCORES_ALLOWED_COLUMNS,
        numeric_columns=SCORES_NUMERIC_COLUMNS,
        percent_columns=SCORES_PERCENT_COLUMNS,
        date_columns=SCORES_DATE_COLUMNS,
        currency_columns=SCORES_CURRENCY_COLUMNS,
        default_metrics=["overall_score", "px"],
        default_include=["sector", "industry"],
        base_columns=["symbol", "as_of"],
        display_labels=SCORES_LABELS,
        ticker_column="symbol",
        query_mode="sql",
        default_sort=("overall_score", "desc"),
    ),
    "earnings": DatasetConfig(
        key="earnings",
        table=EARNINGS_TABLE,
        allowed_columns=EARNINGS_ALLOWED_COLUMNS,
        numeric_columns=EARNINGS_NUMERIC_COLUMNS,
        percent_columns=EARNINGS_PERCENT_COLUMNS,
        date_columns=EARNINGS_DATE_COLUMNS,
        currency_columns=EARNINGS_CURRENCY_COLUMNS,
        default_metrics=["event_date", "epsEstimated"],
        default_include=["period", "time_hint"],
        base_columns=["symbol", "company_name", "event_date"],
        display_labels=EARNINGS_LABELS,
        ticker_column="symbol",
        query_mode="cache",
        loader=_earnings_loader_wrapper,
        default_sort=("event_date", "asc"),
    ),
    "vendors": DatasetConfig(
        key="vendors",
        table=VENDOR_TABLE,
        allowed_columns=VENDORS_ALLOWED_COLUMNS,
        numeric_columns=VENDORS_NUMERIC_COLUMNS,
        percent_columns=VENDORS_PERCENT_COLUMNS,
        date_columns=VENDORS_DATE_COLUMNS,
        currency_columns=VENDORS_CURRENCY_COLUMNS,
        default_metrics=["relationship_strength", "est_contract_value_usd_m"],
        default_include=["counterparty_type", "region"],
        base_columns=["company", "ticker", "relation_type", "counterparty_name"],
        display_labels=VENDORS_LABELS,
        ticker_column="ticker",
        query_mode="cache",
        loader=_vendor_load_all,
        default_sort=("relationship_strength", "desc"),
    ),
}

PROMPT_COLUMN_KEYWORDS: dict[str, list[tuple[tuple[str, ...], list[str]]]] = {
    "profiles": [
        (("market cap", "marketcap", "capitalization", "market capitalization", "company value"), ["marketCap"]),
        (("price", "share price", "stock price", "trading price", "current price"), ["price"]),
        (("dividend", "payout"), ["lastDividend"]),
        (("beta", "volatility"), ["beta"]),
        (("volume", "trading volume"), ["volume"]),
        (("average volume", "avg volume", "avg trading volume"), ["averageVolume"]),
        (("percent change", "change percent", "change%", "percentage change"), ["changePercentage"]),
        (("change", "price change", "day change"), ["change"]),
        (("range", "52 week range", "52w range", "trading range"), ["range"]),
        (("employees", "headcount", "staff", "workforce", "employee count", "people"), ["fullTimeEmployees"]),
        (("ceo", "chief executive", "chief executive officer", "leadership", "ceo name"), ["ceo"]),
        (("website", "site", "url", "webpage", "link"), ["website"]),
        (("description", "summary", "profile", "about", "overview"), ["description"]),
        ((
            "address",
            "headquarters",
            "headquarter",
            "headquartered",
            "hq",
            "office",
            "offices",
            "corporate office",
            "main office",
            "location",
            "located",
            "where located",
            "where is",
            "campus",
            "base of operations",
            "home base",
            "primary location",
        ), ["address", "city", "state", "zip", "country"]),
        (("city", "town"), ["city"]),
        (("state", "province", "region"), ["state"]),
        (("country", "nation"), ["country"]),
        (("phone", "contact", "telephone", "contact number", "phone number", "call"), ["phone"]),
        (("exchange", "listing", "listed exchange", "trading venue", "stock exchange"), ["exchangeFullName", "exchange"]),
        (("ipo", "listing", "went public", "ipo date", "ipo year"), ["ipoDate"]),
        (("currency", "denominated"), ["currency"]),
        (("sector", "business sector"), ["sector"]),
        (("industry", "business line"), ["industry"]),
        (("cik", "cik number", "sec id", "sec identifier"), ["cik"]),
        (("isin", "isin code", "international securities identification"), ["isin"]),
        (("cusip", "cusip code"), ["cusip"]),
        (("logo", "image", "picture", "brand mark", "brand logo"), ["image"]),
        (("default image", "placeholder image"), ["defaultImage"]),
        (("actively trading", "trading status", "status", "active listing"), ["isActivelyTrading"]),
        (("etf", "exchange traded fund"), ["isEtf"]),
        (("adr", "american depositary"), ["isAdr"]),
        (("fund", "mutual fund"), ["isFund"]),
        (("symbol queried", "input symbol", "search symbol"), ["symbol_queried"]),
        (("symbol original", "original symbol", "primary ticker"), ["symbol_original"]),
    ],
    "scores": [
        (("overall score", "overall rating", "score"), ["overall_score"]),
        (("valuation score", "value score", "valuation"), ["score_valuation"]),
        (("fundamental score", "fundamentals", "quality score"), ["score_fundamentals"]),
        (("sentiment score", "sentiment"), ["score_sentiment"]),
        (("innovation score", "innovation"), ["score_innovation"]),
        (("macro score", "macro"), ["score_macro"]),
        (("price", "share price"), ["px"]),
        (("ev/ebitda", "ev ebitda", "enterprise multiple"), ["ev_ebitda"]),
        (("rank", "ranking", "position"), ["rank_overall"]),
        (("as of", "score date", "last updated"), ["as_of"]),
        (("sector", "score sector"), ["sector"]),
        (("industry", "score industry"), ["industry"]),
    ],
    "earnings": [
        (("estimate", "estimated eps", "eps estimate", "eps forecast"), ["epsEstimated", "estimateEPS"]),
        (("consensus", "consensus eps"), ["consensusEPS"]),
        (("reported eps", "actual eps", "eps reported"), ["eps", "epsActual"]),
        (("surprise", "beat", "miss"), ["surprise", "surprisePercent"]),
        (("revenue", "sales", "top line"), ["revenue", "revenueEstimate", "revenueEstimated"]),
        (("guidance", "guidance eps", "guidance revenue"), ["guidanceEPS", "guidanceRevenue"]),
        (("period", "quarter", "fiscal period"), ["period"]),
        (("event date", "date", "earnings date", "report date", "next earnings", "upcoming earnings", "when"), ["event_date", "time_hint"]),
        (("time", "time slot", "session", "pre-market", "after hours"), ["time_hint"]),
        (("fiscal", "fiscal date", "fiscal quarter"), ["fiscalDateEnding"]),
        (("status", "event status"), ["eventStatus"]),
        (("type", "event type", "call"), ["event_type"]),
    ],
    "vendors": [
        (("relation", "relationship", "relationship type"), ["relation_type", "relationship_strength"]),
        (("relationship strength", "relationship score", "strength"), ["relationship_strength"]),
        (("customer", "customers", "client", "clients", "buyer", "buyers"), ["counterparty_name", "counterparty_type"]),
        (("supplier", "suppliers", "vendor", "vendors", "partner", "partners", "counterparty", "counterparties", "ecosystem"), ["counterparty_name", "counterparty_type"]),
        (("contract", "deal", "value", "contract value", "deal size"), ["est_contract_value_usd_m"]),
        (("region", "geo", "geography", "location"), ["region"]),
        (("tier", "tiering"), ["tier"]),
        (("category", "segment", "classification"), ["category"]),
        (("component", "product", "solution", "offering"), ["component_or_product"]),
        (("start year", "since", "relationship start"), ["start_year"]),
        (("notes", "comment", "details"), ["notes"]),
        (("dummy", "placeholder", "sample"), ["is_dummy"]),
    ],
}

class SortSpec:
    def __init__(self, data: Optional[dict[str, Any]] = None):
        data = data or {}
        self.column: str = str(data.get("column") or "").strip()
        direction = str(data.get("direction") or "desc").lower()
        self.direction: Literal["asc", "desc"] = "asc" if direction == "asc" else "desc"

    def sanitize(self, config: "DatasetConfig") -> Optional["SortSpec"]:
        col = config.normalize_column(self.column)
        if not col or col not in config.allowed_columns:
            return None
        self.column = col
        if self.direction not in ("asc", "desc"):
            self.direction = "desc"
        return self

    def to_dict(self) -> dict[str, Any]:
        return {"column": self.column, "direction": self.direction}


class PlanFilter:
    def __init__(self, data: Optional[dict[str, Any]] = None):
        data = data or {}
        self.column: str = str(data.get("column") or "").strip()
        self.operator: str = str(data.get("operator") or "eq").lower()
        self.value: Any = data.get("value")

    def to_dict(self) -> dict[str, Any]:
        return {"column": self.column, "operator": self.operator, "value": self.value}


class ChatPlan:
    def __init__(self, data: Optional[dict[str, Any]] = None):
        data = data or {}
        self.intent: str = str((data.get("intent") or "lookup")).lower()

        raw_tickers = data.get("tickers")
        if isinstance(raw_tickers, str):
            raw_tickers = [raw_tickers]
        elif raw_tickers is None:
            raw_tickers = []
        self.tickers: List[str] = [str(t).upper() for t in raw_tickers if t]

        raw_metrics = data.get("metrics")
        if isinstance(raw_metrics, str):
            raw_metrics = [raw_metrics]
        elif raw_metrics is None:
            raw_metrics = []
        self.metrics: List[str] = [str(m) for m in raw_metrics if m]

        raw_include = data.get("include")
        if isinstance(raw_include, str):
            raw_include = [raw_include]
        elif raw_include is None:
            raw_include = []
        self.include: List[str] = [str(m) for m in raw_include if m]

        raw_filters = data.get("filters") or []
        self.filters: List[PlanFilter] = [PlanFilter(f) for f in raw_filters if isinstance(f, dict)]
        self.limit: int = int(data.get("limit") or 5)
        self.needs_chart: bool = bool(data.get("needs_chart", False))
        self.needs_table: bool = bool(data.get("needs_table", True))
        summary = data.get("summary_instruction")
        self.summary_instruction: Optional[str] = str(summary) if summary else None
        raw_followups = data.get("followups")
        if isinstance(raw_followups, str):
            raw_followups = [raw_followups]
        elif raw_followups is None:
            raw_followups = []
        self.followups: List[str] = [str(f) for f in raw_followups if f]
        sort_data = data.get("sort")
        self.sort: Optional[SortSpec] = SortSpec(sort_data) if isinstance(sort_data, dict) else None
        dataset = str(data.get("dataset") or data.get("data_source") or data.get("table") or "profiles").lower().strip()
        self.dataset: str = dataset if dataset in DATASET_CONFIGS else "profiles"
        self.config: DatasetConfig = DATASET_CONFIGS[self.dataset]

    def sanitize(self) -> None:
        if self.dataset not in DATASET_CONFIGS:
            self.dataset = "profiles"
        self.config = DATASET_CONFIGS[self.dataset]

        # Tickers
        clean_tickers: list[str] = []
        for t in self.tickers:
            if not t:
                continue
            ticker = re.sub(r"[^A-Za-z0-9]", "", str(t).upper())
            if not ticker:
                continue
            if len(ticker) > 6:
                continue
            if ticker in SYMBOL_STOPWORDS:
                continue
            if ticker not in clean_tickers and len(clean_tickers) < 8:
                clean_tickers.append(ticker)
        self.tickers = clean_tickers
        if self.intent == "compare" and len(self.tickers) < 2:
            self.intent = "lookup"
            self.needs_chart = False

        # Metrics & include columns
        def _clean_columns(items: list[str], limit: int) -> list[str]:
            seen: list[str] = []
            for item in items:
                col = self.config.normalize_column(item)
                if col and col not in seen and col in self.config.allowed_columns:
                    seen.append(col)
                if len(seen) >= limit:
                    break
            return seen

        metric_limit = max(2, min(6, self.config.max_columns))
        include_limit = max(4, self.config.max_columns)
        self.metrics = _clean_columns(self.metrics, metric_limit)
        self.include = _clean_columns(self.include, include_limit)

        if not self.metrics and self.intent != "chitchat":
            self.metrics = list(self.config.default_metrics)

        self.limit = max(1, min(10, int(self.limit or 5)))

        # Filters
        sanitized_filters: list[PlanFilter] = []
        for flt in self.filters:
            col = self.config.normalize_column(flt.column)
            if not col or col not in self.config.allowed_columns:
                continue
            op = (flt.operator or "eq").lower()
            if op not in {"eq", "neq", "gt", "lt", "gte", "lte", "contains", "starts_with"}:
                op = "eq"
            value = flt.value
            if col in self.config.numeric_columns:
                try:
                    value = float(value)
                except Exception:
                    continue
            elif col in self.config.date_columns:
                if isinstance(value, str):
                    try:
                        value = dateparser.parse(value).date().isoformat()
                    except Exception:
                        continue
                else:
                    continue
            else:
                value = str(value)
            sanitized_filters.append(PlanFilter({"column": col, "operator": op, "value": value}))
            if len(sanitized_filters) >= 4:
                break
        self.filters = sanitized_filters

        if self.sort:
            self.sort = self.sort.sanitize(self.config)

        if not isinstance(self.needs_chart, bool):
            self.needs_chart = False
        if not isinstance(self.needs_table, bool):
            self.needs_table = True

        if self.intent == "unknown":
            self.intent = "chitchat"
        if self.intent not in {"lookup", "compare", "list", "chitchat"}:
            self.intent = "lookup"

    def final_columns(self) -> list[str]:
        cols: list[str] = []
        for base in self.config.base_columns:
            if base in self.config.allowed_columns and base not in cols:
                cols.append(base)
        for col in self.include + self.metrics:
            if col in self.config.allowed_columns and col not in cols:
                cols.append(col)
        return cols[: min(len(cols), self.config.max_columns)]

    def metrics_for_chart(self) -> list[str]:
        return [m for m in self.metrics if m in self.config.numeric_columns]

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "intent": self.intent,
            "dataset": self.dataset,
            "tickers": self.tickers,
            "metrics": self.metrics,
            "include": self.include,
            "limit": self.limit,
            "needs_chart": self.needs_chart,
            "needs_table": self.needs_table,
            "summary_instruction": self.summary_instruction,
            "followups": self.followups,
        }
        if self.filters:
            data["filters"] = [flt.to_dict() for flt in self.filters]
        if self.sort:
            data["sort"] = self.sort.to_dict()
        return data


class LLMConfigurationError(RuntimeError):
    pass


_LLM_CLIENT_CACHE: Optional[tuple[str, Any, Any]] = None


def _ensure_llm_client() -> tuple[str, Any, Any]:
    global _LLM_CLIENT_CACHE
    if _LLM_CLIENT_CACHE:
        return _LLM_CLIENT_CACHE

    if LLM_MODE == "mock":
        _LLM_CLIENT_CACHE = ("mock", None, None)
        return _LLM_CLIENT_CACHE

    if OLLAMA_BASE_URL:
        base = OLLAMA_BASE_URL.rstrip("/")
        fallbacks: list[str] = []
        if OLLAMA_FALLBACK_BASE_URL:
            fallbacks = [OLLAMA_FALLBACK_BASE_URL.rstrip("/")]
        elif "host.docker.internal" in base:
            fallbacks.append("http://172.17.0.1:11434")
        session = requests.Session()
        config = {
            "base_urls": [base] + fallbacks,
            "model": OLLAMA_MODEL,
            "timeout": OLLAMA_TIMEOUT,
        }
        _LLM_CLIENT_CACHE = ("ollama", session, config)
        return _LLM_CLIENT_CACHE

    if AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT:
        if AzureOpenAI is None:
            raise LLMConfigurationError(
                "Azure OpenAI configured but 'openai' package is not installed. Run 'pip install openai'."
            )
        client = AzureOpenAI(
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
        )
        _LLM_CLIENT_CACHE = ("azure", client, AZURE_OPENAI_DEPLOYMENT)
        return _LLM_CLIENT_CACHE

    if OPENAI_API_KEY:
        if OpenAI is None:
            raise LLMConfigurationError(
                "OpenAI API key provided but 'openai' package is not installed. Run 'pip install openai'."
            )
        client = OpenAI(api_key=OPENAI_API_KEY)
        _LLM_CLIENT_CACHE = ("openai", client, OPENAI_MODEL)
        return _LLM_CLIENT_CACHE

    raise LLMConfigurationError(
        "LLM credentials missing. Provide Azure OpenAI settings or OPENAI_API_KEY/OPENAI_MODEL."
    )


def _heuristic_plan_data(prompt: str) -> dict[str, Any]:
    text = prompt.lower()
    ticker_tokens = re.findall(r"\b[A-Z]{1,5}\b", prompt.upper())
    stopwords = {
        "VS",
        "AND",
        "THE",
        "WITH",
        "FOR",
        "SHOW",
        "LIST",
        "KEY",
        "NEXT",
        "UPCOMING",
        "EPS",
        "CAP",
        "SCORE",
        "GRAPH",
        "CHART",
        "FROM",
        "DATA",
    }
    tickers: list[str] = [tok for tok in ticker_tokens if tok not in stopwords]

    greeting_words = {"hi", "hello", "hey", "thanks", "thank you", "good morning", "good evening"}
    if any(word in text for word in greeting_words) and not tickers:
        return {
            "intent": "chitchat",
            "dataset": "profiles",
            "tickers": [],
            "metrics": [],
            "include": [],
            "filters": [],
            "limit": 1,
            "needs_chart": False,
            "needs_table": False,
            "summary_instruction": None,
            "followups": [],
        }

    dataset = "profiles"
    if any(word in text for word in ["vendor", "supplier", "counterparty", "customer network", "relationship"]):
        dataset = "vendors"
    elif any(word in text for word in ["earning", "earnings", "report", "eps", "guidance", "calendar"]):
        dataset = "earnings"
    elif any(word in text for word in ["score", "rank", "factor", "rating"]):
        dataset = "scores"

    config = DATASET_CONFIGS.get(dataset, DATASET_CONFIGS["profiles"])

    if not tickers:
        hints = _extract_prompt_hints(prompt)
        matches = _search_symbols_by_hints(config, hints, limit=6)
        for sym, _ in matches:
            if sym not in tickers:
                tickers.append(sym)

    metrics: list[str] = []
    include: list[str] = []

    def ensure(lst: list[str], value: str) -> None:
        if value and value not in lst:
            lst.append(value)

    if dataset == "profiles":
        if "market cap" in text or "marketcap" in text:
            ensure(metrics, "marketCap")
        if "price" in text or "share price" in text:
            ensure(metrics, "price")
        if "dividend" in text:
            ensure(metrics, "lastDividend")
        if "beta" in text:
            ensure(metrics, "beta")
        if "volume" in text:
            ensure(metrics, "volume")
        if "employees" in text or "headcount" in text:
            ensure(metrics, "fullTimeEmployees")
        if "sector" in text:
            ensure(include, "sector")
        if "industry" in text:
            ensure(include, "industry")
    elif dataset == "scores":
        metrics = ["overall_score", "px"]
        if "valuation" in text:
            ensure(metrics, "score_valuation")
        if "sentiment" in text:
            ensure(metrics, "score_sentiment")
        if "innovation" in text:
            ensure(metrics, "score_innovation")
        if "macro" in text:
            ensure(metrics, "score_macro")
        include = ["sector", "industry"]
    elif dataset == "earnings":
        metrics = ["epsEstimated", "consensusEPS"]
        if "surprise" in text:
            ensure(metrics, "surprisePercent")
        if "revenue" in text:
            ensure(metrics, "revenue")
            ensure(metrics, "revenueEstimate")
            ensure(metrics, "revenueEstimated")
        if "guidance" in text:
            ensure(metrics, "guidanceEPS")
            ensure(metrics, "guidanceRevenue")
        include = ["period", "event_date", "time_hint"]
    else:  # vendors
        metrics = ["relationship_strength", "est_contract_value_usd_m"]
        include = ["counterparty_name", "counterparty_type", "region"]

    intent = "compare" if len(tickers) >= 2 or "compare" in text else "lookup"
    if dataset == "earnings" and any(word in text for word in ["upcoming", "next", "calendar", "schedule"]):
        intent = "list"
    if "list" in text and not tickers:
        intent = "list"

    needs_chart = intent == "compare" or "chart" in text or "graph" in text
    needs_table = True
    limit = max(len(tickers), 3) if intent == "compare" else (5 if dataset != "earnings" else 8)

    if not metrics:
        metrics = list(config.default_metrics)
    if not include:
        include = list(config.default_include)

    filters: list[dict[str, Any]] = []

    def add_like_filter(column: str, value: str) -> None:
        if value:
            filters.append({"column": column, "operator": "contains", "value": value})

    # basic filter extraction
    if dataset == "profiles":
        if "sector" in text:
            match = re.search(r"sector(?:\s+is|\s+for)?\s+([a-zA-Z& ]+)", text)
            if match:
                add_like_filter("sector", match.group(1).strip())
        if "industry" in text:
            match = re.search(r"industry(?:\s+is|\s+for)?\s+([a-zA-Z& ]+)", text)
            if match:
                add_like_filter("industry", match.group(1).strip())
        if "country" in text:
            match = re.search(r"country(?:\s+is|\s+for)?\s+([a-zA-Z ]+)", text)
            if match:
                add_like_filter("country", match.group(1).strip())

    if dataset == "vendors" and tickers:
        # ensure vendor dataset includes the main symbol as ticker filter
        pass

    plan = {
        "intent": intent,
        "dataset": dataset,
        "tickers": tickers,
        "metrics": metrics,
        "include": include,
        "filters": filters,
        "limit": limit,
        "needs_chart": needs_chart,
        "needs_table": needs_table,
        "summary_instruction": None,
        "followups": [],
    }
    if intent == "compare" and len(tickers) >= 2:
        plan["needs_chart"] = True

    return plan


def _mock_llm_response(messages: list[dict[str, str]]) -> str:
    last = messages[-1]["content"] if messages else ""
    if not last:
        return "I'm ready to help with company fundamentals."

    stripped = last.strip()
    # Summary payloads arrive as JSON
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            payload = json.loads(stripped)
        except Exception:
            return "Here's what I found."
        if isinstance(payload, dict) and "preview_rows" in payload:
            rows = payload.get("preview_rows", [])
            plan_info = payload.get("plan", {}) or {}
            metrics = plan_info.get("metrics") or []
            dataset_key = plan_info.get("dataset", "profiles")
            config = DATASET_CONFIGS.get(dataset_key, DATASET_CONFIGS["profiles"])
            tickers = plan_info.get("tickers") or []
            if rows:
                snippets = []
                for row in rows[:3]:
                    label = row.get("symbol") or row.get("companyName") or row.get("company") or row.get("company_name") or "Company"
                    parts = []
                    for metric in metrics[:2]:
                        if metric in row and isinstance(row[metric], (int, float)):
                            parts.append(
                                f"{config.display_labels.get(metric, metric)} {_format_number(row[metric], metric, config)}"
                            )
                    if parts:
                        snippets.append(f"{label}: {', '.join(parts)}")
                body = "; ".join(snippets) if snippets else f"{len(rows)} companies matched."
                return f"Based on the latest data, {body}."
            return "I couldn't find matching companies in the sample dataset. Try another ticker."
        return "Thanks for the details—I'm ready for your next question."

    plan = _heuristic_plan_data(stripped)
    return json.dumps(plan)


def _llm_chat(messages: list[dict[str, str]], temperature: float = LLM_TEMPERATURE, max_tokens: int = 700) -> str:
    mode, client, model_info = _ensure_llm_client()

    if mode == "mock":
        return _mock_llm_response(messages)

    if mode == "ollama":
        base_urls = model_info.get("base_urls") or [model_info.get("base_url")]
        model_name = model_info.get("model")
        timeout = model_info.get("timeout", OLLAMA_TIMEOUT)
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }

        last_error: Optional[Exception] = None
        for base_url in base_urls:
            if not base_url:
                continue
            chat_url = f"{base_url}/api/chat"
            try:
                resp = client.post(chat_url, json=payload, timeout=timeout)
                resp.raise_for_status()
                data = resp.json()
                content: Optional[str] = None
                if isinstance(data.get("message"), dict):
                    content = data["message"].get("content")
                if not content and isinstance(data.get("messages"), list):
                    parts = [m.get("content", "") for m in data["messages"] if m.get("role") == "assistant"]
                    content = "".join(parts).strip() if parts else None
                if not content and "response" in data:
                    content = str(data.get("response"))
                if not content:
                    raise RuntimeError("Empty response from Ollama")
                return content.strip()
            except requests.HTTPError as e:
                last_error = e
                status = e.response.status_code if e.response else None
                logger.error("Ollama request failed via %s: %s", base_url, e)
                if status == 404:
                    try:
                        content = _ollama_generate_fallback(client, base_url, model_name, messages, temperature, timeout)
                        if content:
                            return content.strip()
                    except Exception as inner:
                        last_error = inner
                        logger.error("Ollama generate fallback failed via %s: %s", base_url, inner)
                continue
            except requests.RequestException as e:
                last_error = e
                logger.error("Ollama request failed via %s: %s", base_url, e)
                continue
        if last_error:
            raise last_error
        raise RuntimeError("No valid Ollama base URL configured")

    try:
        resp = client.chat.completions.create(
            model=model_info,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=messages,
        )
    except OpenAIError as e:
        logger.error("LLM request failed: %s", e)
        raise
    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise RuntimeError("Empty response from LLM")
    return content.strip()


def _extract_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception as exc:
                raise ValueError(f"Failed to parse JSON from LLM response: {exc}") from exc
        raise ValueError("LLM response was not valid JSON")


PLAN_SYSTEM_PROMPT = """
You are SmartWealth AI's planning assistant. Convert each user request into a JSON plan with keys:
dataset, intent, tickers, metrics, include, filters, limit, needs_chart, needs_table, summary_instruction, followups, sort.

- dataset ∈ {"profiles", "scores", "earnings", "vendors"}
- intent ∈ {lookup, compare, list, chitchat, unknown}
- tickers = array of uppercase ticker symbols (resolve company names to tickers when possible)
- metrics/include = column names from the chosen dataset (see schemas below)
- filters = array of {column, operator (eq|neq|gt|lt|gte|lte|contains|starts_with), value}
- limit ≤ 10, needs_chart / needs_table are booleans
- If the prompt is outside our tables, set intent=chitchat and keep metrics empty

Dataset schemas & examples:
1. profiles (workspace.sw_gold.nyse_profiles)
   Columns: symbol, companyName, sector, industry, country, currency, price, marketCap, beta, lastDividend, change,
            changePercentage, volume, averageVolume, ceo, website, description, exchangeFullName, exchange, ipoDate,
            fullTimeEmployees, address, city, state, zip, phone, range.
   Examples:
     - "market cap of Meta" → dataset="profiles", tickers=["META"], metrics=["marketCap"], include=["sector","industry"].
     - "address and phone for Nvidia" → metrics=["address","city","state","zip"], include=["phone"].
     - "technology sector companies" → filters=[{"column":"sector","operator":"contains","value":"Technology"}].

2. scores (workspace.sw_gold.scores)
   Columns: symbol, as_of, sector, industry, px, ev_ebitda, score_fundamentals, score_valuation, score_sentiment,
            score_innovation, score_macro, overall_score, rank_overall.
   Example: "compare valuation and sentiment scores for MSFT and AAPL" → metrics=["score_valuation","score_sentiment"].

3. earnings (workspace.sw_gold.earnings_calendar_new)
   Columns: symbol, company_name, event_date, time_hint, period, estimateEPS, consensusEPS, eps, surprise,
            surprisePercent, revenue, revenueEstimate, fiscalDateEnding, event_type, eventStatus, guidanceEPS,
            guidanceRevenue.
   Example: "next earnings for Tesla" → metrics=["event_date","time_hint","estimateEPS","consensusEPS"].

4. vendors (workspace.sw_gold.vendor_customer_network)
   Columns: company, ticker, relation_type, counterparty_name, counterparty_type, tier, category, component_or_product,
            region, relationship_strength, est_contract_value_usd_m, start_year, notes, is_dummy.
   Example: "major suppliers for Apple" → metrics=["relationship_strength","est_contract_value_usd_m"], include=["counterparty_name","counterparty_type"].

Always return JSON only—no commentary. Prefer precise column names from the schemas and include useful descriptive fields.
""".strip()


SUMMARY_SYSTEM_PROMPT = """
You are SmartWealth AI, a senior research analyst. Use ONLY the supplied rows and plan metadata to craft a polished,
insightful response:
- Start with a one-sentence headline that answers the question directly.
- Provide 2–3 supporting observations using human-friendly formatting (e.g. $1.2T, 15.4%, 22k employees).
- If multiple tickers are present, compare or rank them and note any standout.
- If the dataset is earnings, mention upcoming dates/guidance; if scores, interpret high/low scores; if vendors, describe the relationship context.
- End with a takeaway or suggestion (e.g. what to watch next).
- If no rows are returned, say so and suggest another query instead of guessing.
Keep the tone professional but approachable. Avoid repeating raw table data verbatim when a summary suffices.
""".strip()


def _format_number(value: Any, col: str, config: DatasetConfig) -> str:
    try:
        num = float(value)
    except Exception:
        return str(value)
    if col in config.percent_columns:
        return f"{num:.2f}%"
    if col in config.currency_columns:
        abs_num = abs(num)
        if abs_num >= 1_000_000_000:
            return f"${num/1_000_000_000:.2f}B"
        if abs_num >= 1_000_000:
            return f"${num/1_000_000:.2f}M"
        if abs_num >= 10_000:
            return f"${num/1_000:.1f}K"
        return f"${num:,.2f}"
    return f"{num:,.2f}"


def _build_sql(plan: ChatPlan, config: DatasetConfig) -> tuple[str, list[Any]]:
    columns = plan.final_columns()
    if not columns:
        base = config.base_columns + [c for c in config.default_metrics if c not in config.base_columns]
        columns = base[: config.max_columns]

    select_clause = ", ".join(columns)
    where_parts: list[str] = []
    params: list[Any] = []

    ticker_col = config.ticker_column
    if plan.tickers and ticker_col:
        placeholders = ", ".join(["?"] * len(plan.tickers))
        where_parts.append(f"{ticker_col} IN ({placeholders})")
        params.extend(plan.tickers)

    op_map = {
        "eq": "=",
        "neq": "!=",
        "gt": ">",
        "lt": "<",
        "gte": ">=",
        "lte": "<=",
    }
    text_columns = config.allowed_columns.difference(config.numeric_columns).difference(config.currency_columns).difference(config.percent_columns).difference(config.date_columns)

    for flt in plan.filters:
        col = flt.column
        if col not in config.allowed_columns:
            continue
        op = flt.operator
        if op in {"contains", "starts_with"}:
            if col not in text_columns:
                continue
            comparator = "LOWER"
            expr = f"{comparator}({col}) LIKE ?"
            pattern = str(flt.value).lower()
            if op == "contains":
                params.append(f"%{pattern}%")
            else:
                params.append(f"{pattern}%")
            where_parts.append(expr)
        else:
            sql_op = op_map.get(op, "=")
            if col in config.numeric_columns or col in config.currency_columns or col in config.percent_columns:
                where_parts.append(f"{col} {sql_op} ?")
                params.append(float(flt.value))
            elif col in config.date_columns:
                where_parts.append(f"{col} {sql_op} ?")
                params.append(str(flt.value))
            else:
                where_parts.append(f"UPPER({col}) {sql_op} ?")
                params.append(str(flt.value).upper())

    where_clause = f" WHERE {' AND '.join(where_parts)}" if where_parts else ""

    order_clause = ""
    sort = plan.sort
    if sort and sort.column in config.allowed_columns:
        order_clause = f" ORDER BY {sort.column} {sort.direction.upper()}"
    elif plan.intent == "compare" and plan.metrics:
        metrics = plan.metrics_for_chart() or plan.metrics
        for primary in metrics:
            if primary in config.allowed_columns:
                order_clause = f" ORDER BY {primary} DESC"
                break
    elif config.default_sort:
        col, direction = config.default_sort
        if col in config.allowed_columns:
            order_clause = f" ORDER BY {col} {(direction or 'DESC').upper()}"

    limit_clause = f" LIMIT {plan.limit}" if plan.limit else ""
    sql = f"SELECT {select_clause} FROM {config.table}{where_clause}{order_clause}{limit_clause}"
    return sql, params


def _render_sql_with_params(sql: str, params: list[Any]) -> str:
    rendered = sql
    for param in params:
        if isinstance(param, (int, float)):
            replacement = str(param)
        else:
            safe = str(param).replace("'", "''")
            replacement = f"'{safe}'"
        rendered = rendered.replace("?", replacement, 1)
    return rendered


def _flatten_messages_for_prompt(messages: list[dict[str, str]]) -> str:
    parts: list[str] = []
    for msg in messages:
        role = msg.get("role") or "user"
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            parts.append(f"System: {content}")
        elif role == "assistant":
            parts.append(f"Assistant: {content}")
        else:
            parts.append(f"User: {content}")
    parts.append("Assistant:")
    return "\n".join(parts)


def _ollama_generate_fallback(client, base_url: str, model_name: str, messages: list[dict[str, str]], temperature: float, timeout: int) -> str:
    prompt = _flatten_messages_for_prompt(messages)
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
        },
    }
    resp = client.post(f"{base_url}/api/generate", json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):
        if "response" in data:
            return str(data.get("response") or "").strip()
        if "output" in data:
            return str(data.get("output") or "").strip()
    raise RuntimeError("Empty response from Ollama generate API")


def _prepare_preview_rows(rows: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    preview: list[dict[str, Any]] = []
    for row in rows[: min(limit, len(rows))]:
        clean: dict[str, Any] = {}
        for k, v in row.items():
            if isinstance(v, dict):
                clean[k] = {ik: _to_native(iv) for ik, iv in v.items()}
            elif isinstance(v, (list, tuple)):
                clean[k] = [_to_native(iv) for iv in v]
            else:
                clean[k] = _to_native(v)
        preview.append(clean)
    return preview


def _execute_sql(sql: str, params: list[Any]) -> tuple[list[str], list[dict[str, Any]]]:
    with _db_cursor() as c:
        c.execute(sql, params)
        columns = [d[0] for d in c.description]
        raw_rows = [dict(zip(columns, row)) for row in c.fetchall()]

    cleaned: list[dict[str, Any]] = []
    for row in raw_rows:
        clean_row: dict[str, Any] = {}
        for k, v in row.items():
            clean_row[k] = _to_native(v)
        cleaned.append(clean_row)
    return columns, cleaned


def _build_table_payload(plan: ChatPlan, rows: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not plan.needs_table or not rows:
        return None
    columns = plan.final_columns()
    labels_map = plan.config.display_labels
    meta = [{"key": col, "label": labels_map.get(col, col)} for col in columns]
    trimmed_rows = []
    for row in rows[: min(len(rows), plan.limit)]:
        trimmed_rows.append({col: row.get(col) for col in columns})
    return {"columns": meta, "rows": trimmed_rows}


def _build_chart_payload(plan: ChatPlan, rows: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not rows:
        return None

    metrics = plan.metrics_for_chart()
    auto_trigger = plan.needs_chart or len(plan.tickers) >= 2 or (len(metrics) >= 2 and len(rows) == 1)
    if not auto_trigger or not metrics:
        return None

    top_rows = rows[: min(len(rows), plan.limit)]
    labels = []
    for row in top_rows:
        label = None
        for candidate in [plan.config.ticker_column, "symbol", "companyName", "company", "company_name", "counterparty_name", "period"]:
            if not candidate:
                continue
            val = row.get(candidate)
            if val:
                label = str(val)
                break
        labels.append(label or f"Item {len(labels) + 1}")

    numeric_metrics = [
        m for m in metrics
        if m in plan.config.numeric_columns or m in plan.config.currency_columns or m in plan.config.percent_columns
    ]

    if len(numeric_metrics) >= 2 and len(top_rows) >= 2:
        x_metric, y_metric = numeric_metrics[0], numeric_metrics[1]
        size_metric = numeric_metrics[2] if len(numeric_metrics) >= 3 else None
        scatter_data: list[dict[str, Any]] = []
        for idx, row in enumerate(top_rows):
            xv = row.get(x_metric)
            yv = row.get(y_metric)
            if not isinstance(xv, (int, float)) or not isinstance(yv, (int, float)):
                continue
            point: dict[str, Any] = {
                "label": labels[idx],
                "x": float(xv),
                "y": float(yv),
            }
            if size_metric and isinstance(row.get(size_metric), (int, float)):
                point["size"] = float(row.get(size_metric))
            scatter_data.append(point)
        if len(scatter_data) >= 2:
            return {
                "type": "scatter",
                "title": f"{plan.config.display_labels.get(x_metric, x_metric)} vs {plan.config.display_labels.get(y_metric, y_metric)}",
                "xKey": x_metric,
                "yKey": y_metric,
                "format": {
                    "x": "currency" if x_metric in plan.config.currency_columns else ("percent" if x_metric in plan.config.percent_columns else "number"),
                    "y": "currency" if y_metric in plan.config.currency_columns else ("percent" if y_metric in plan.config.percent_columns else "number"),
                    "size": "currency" if size_metric and size_metric in plan.config.currency_columns else None,
                },
                "data": scatter_data,
                "sizeKey": size_metric,
            }

    # Compare multiple tickers using first numeric metric
    first_metric = numeric_metrics[0] if numeric_metrics else metrics[0]
    numeric_values: list[dict[str, Any]] = []
    for idx, row in enumerate(top_rows):
        val = row.get(first_metric)
        if isinstance(val, (int, float)):
            numeric_values.append({"label": labels[idx], "value": float(val)})

    if len(numeric_values) >= 2:
        if first_metric in plan.config.percent_columns:
            fmt = "percent"
        elif first_metric in plan.config.currency_columns:
            fmt = "currency"
        else:
            fmt = "number"
        return {
            "type": "bar",
            "title": f"{plan.config.display_labels.get(first_metric, first_metric)} comparison",
            "metric": first_metric,
            "format": fmt,
            "data": numeric_values,
        }

    if len(top_rows) == 1 and len(metrics) >= 2:
        single = top_rows[0]
        bars: list[dict[str, Any]] = []
        for metric in metrics[:4]:
            val = single.get(metric)
            if isinstance(val, (int, float)):
                bars.append({
                    "label": plan.config.display_labels.get(metric, metric),
                    "value": float(val),
                    "key": metric,
                })
        if len(bars) >= 2:
            title_label = None
            for candidate in [plan.config.ticker_column, "symbol", "companyName", "company", "company_name"]:
                if candidate and single.get(candidate):
                    title_label = str(single.get(candidate))
                    break
            return {
                "type": "bar",
                "title": f"{title_label or 'Company'} – metric breakdown",
                "metric": "multi",
                "format": "number",
                "data": bars,
            }

    return None


def _summarize_answer(user_prompt: str, plan: ChatPlan, sql: str, rows: list[dict[str, Any]]) -> str:
    preview = _prepare_preview_rows(rows, limit=10)
    payload = {
        "question": user_prompt,
        "plan": plan.to_dict(),
        "row_count": len(rows),
        "preview_rows": preview,
        "sql": sql,
        "dataset": plan.dataset,
    }
    messages = [
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload)},
    ]

    try:
        summary = _llm_chat(messages, temperature=min(0.3, LLM_TEMPERATURE + 0.1), max_tokens=400)
    except Exception as exc:
        logger.error("Failed to generate summary: %s", exc)
        if rows:
            first = rows[0]
            parts = []
            for metric in plan.metrics[:3]:
                if metric in first and isinstance(first[metric], (int, float)):
                    parts.append(
                        f"{plan.config.display_labels.get(metric, metric)} {_format_number(first[metric], metric, plan.config)}"
                    )
            fallback = ", ".join(parts) if parts else "data retrieved"
            return f"Here is what I found for {', '.join(plan.tickers) or 'the request'}: {fallback}."
        return "I couldn't summarize that just now, but the raw data is available above."
    return summary


def _fallback_smalltalk(user_prompt: str) -> str:
    if LLM_MODE == "mock":
        return "Hi! I'm SmartWealth AI. Ask me about market caps, valuations, or company fundamentals."
    messages = [
        {"role": "system", "content": "You are SmartWealth AI. If a question is outside the data scope, respond briefly and politely."},
        {"role": "user", "content": user_prompt},
    ]
    try:
        return _llm_chat(messages, temperature=0.6, max_tokens=200)
    except Exception:
        return "I focus on company fundamentals and market data. Try asking about a listed company or metric."


def handle_chat(user_prompt: str) -> dict[str, Any]:
    plan_dict: Optional[dict[str, Any]] = None
    try:
        plan_resp = _llm_chat([
            {"role": "system", "content": PLAN_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ], temperature=0.0, max_tokens=500)
        plan_dict = _extract_json_object(plan_resp)
    except LLMConfigurationError as cfg_err:
        raise cfg_err
    except Exception as exc:
        logger.error("LLM planning failed: %s", exc)
        plan_dict = _heuristic_plan_data(user_prompt)

    if not isinstance(plan_dict, dict):
        plan_dict = _heuristic_plan_data(user_prompt)

    try:
        plan = ChatPlan(plan_dict)
        plan.sanitize()
    except ValueError as exc:
        logger.error("Plan parsing failed: %s", exc)
        plan_dict = _heuristic_plan_data(user_prompt)
        plan = ChatPlan(plan_dict)
        plan.sanitize()

    _augment_plan_with_prompt(plan, user_prompt)

    if plan.intent == "chitchat" and not plan.metrics:
        return {"reply": _fallback_smalltalk(user_prompt)}

    try:
        rows, sql_raw, sql_params = _fetch_rows(plan)
    except Exception as exc:
        logger.error("Dataset fetch failed: %s", exc)
        if LLM_MODE != "mock" and plan.config.query_mode == "sql":
            return {"reply": "I ran into an issue reaching Databricks. Please try again in a minute."}
        return {"reply": "I couldn't retrieve data for that request just now."}

    if not rows:
        no_data_msg = (
            f"I couldn't find matching records in the SmartWealth {plan.dataset} dataset. "
            "Try another ticker or adjust the filters."
        )
        return {
            "reply": no_data_msg,
            "sql": _render_sql_with_params(sql_raw, sql_params),
            "sql_raw": sql_raw,
            "plan": plan.to_dict(),
        }

    table_payload = _build_table_payload(plan, rows)
    chart_payload = _build_chart_payload(plan, rows)
    summary = _summarize_answer(user_prompt, plan, sql_raw, rows)
    display_sql = _render_sql_with_params(sql_raw, sql_params)

    response: dict[str, Any] = {
        "reply": summary,
        "sql": display_sql,
        "sql_raw": sql_raw,
        "plan": plan.to_dict(),
    }
    if table_payload:
        response["table"] = table_payload
    if chart_payload:
        response["chart"] = chart_payload
    return response

# ========================= Earnings API =========================
@app.get("/api/earnings/week")
def earnings_week():
    try:
        today = datetime.utcnow().date()
        start_param = request.args.get("start")
        nocache = request.args.get("nocache") == "1"

        if start_param:
            start_date = dateparser.parse(start_param).date()
        else:
            start_date = today - timedelta(days=today.weekday())  # Monday
        end_date = start_date + timedelta(days=6)
        start_str, end_str = start_date.isoformat(), end_date.isoformat()

        items: list[dict] = []
        if not nocache:
            rows, used_date_col = _earn_load_all(force=False)
            for r in rows:
                norm = _normalize_earn_row(r, used_date_col)
                if not norm:
                    continue
                d = norm["event_date"]
                if start_str <= d <= end_str:
                    items.append(norm)
        else:
            rows = []
            used_date_col = None
            for dc in DATE_CANDIDATES:
                try:
                    rows, used_date_col = _try_query_by_date_col(start_str, end_str, dc)
                    if rows:
                        break
                except Exception:
                    continue
            if not rows:
                with _db_cursor() as c:
                    c.execute(f"SELECT * FROM {EARNINGS_TABLE} LIMIT 5000")
                    cols = [d[0] for d in c.description]
                    rows = [dict(zip(cols, r)) for r in c.fetchall()]
            for r in rows:
                norm = _normalize_earn_row(r, used_date_col)
                if norm:
                    items.append(norm)

        items.sort(key=lambda x: (x["event_date"], x["symbol"]))
        resp = jsonify({"start": start_str, "end": end_str, "count": len(items), "items": items})
        resp.headers["Cache-Control"] = "public, max-age=60"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get("/api/earnings/all")
def earnings_all():
    try:
        days = int(request.args.get("days") or 60)
        refresh = request.args.get("refresh") == "1"
        from_str = request.args.get("from")
        to_str = request.args.get("to")

        if from_str and to_str:
            from_date = dateparser.parse(from_str).date()
            to_date = dateparser.parse(to_str).date()
        else:
            from_date = datetime.utcnow().date() - timedelta(days=1)
            to_date = from_date + timedelta(days=days)

        rows, used_date_col = _earn_load_all(force=refresh)

        items: list[dict] = []
        s_str, e_str = from_date.isoformat(), to_date.isoformat()
        for r in rows:
            norm = _normalize_earn_row(r, used_date_col)
            if not norm:
                continue
            d = norm["event_date"]
            if s_str <= d <= e_str:
                items.append(norm)

        items.sort(key=lambda x: (x["event_date"], x["symbol"]))
        resp = jsonify({"from": s_str, "to": e_str, "count": len(items), "items": items, "cached_at": _EARN_CACHE["ts"].isoformat() if _EARN_CACHE["ts"] else None})
        resp.headers["Cache-Control"] = "public, max-age=60"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ========================= Vendor Network API =========================
@app.get("/api/vendors/network")
def vendors_network():
    """
    GET /api/vendors/network?refresh=1
    Returns ALL rows from workspace.sw_gold.vendor_customer_network (cached).
    Columns: company, ticker, relation_type, counterparty_name, counterparty_type,
             tier, category, component_or_product, region, relationship_strength,
             est_contract_value_usd_m, start_year, notes, is_dummy
    """
    try:
        refresh = request.args.get("refresh") == "1"
        rows = _vendor_load_all(force=refresh)
        resp = jsonify({"count": len(rows), "items": rows, "cached_at": _VENDOR_CACHE["ts"].isoformat() if _VENDOR_CACHE["ts"] else None})
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get("/api/vendors/companies")
def vendors_companies():
    """
    GET /api/vendors/companies
    Returns a de-duped list of companies with their tickers and counts.
    """
    try:
        rows = _vendor_load_all(force=False)
        seen = {}
        for r in rows:
            key = (r.get("company") or "").strip(), (r.get("ticker") or "").strip().upper()
            if key not in seen:
                seen[key] = {"company": key[0], "ticker": key[1], "count": 0}
            seen[key]["count"] += 1
        items = sorted(seen.values(), key=lambda x: (x["company"] or "", x["ticker"]))
        return jsonify({"count": len(items), "items": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ========================= Demo & Misc (unchanged) =========================
def demo_earnings(symbol: str) -> List[Dict[str, Any]]:
    today = datetime.utcnow().date()
    return [
        {"symbol": symbol.upper(), "reportDate": str(today + timedelta(days=7)), "period": "Q2 2025", "estimateEPS": 2.34},
        {"symbol": symbol.upper(), "reportDate": str(today + timedelta(days=98)), "period": "Q3 2025", "estimateEPS": 2.51},
        {"symbol": symbol.upper(), "reportDate": str(today + timedelta(days=189)), "period": "Q4 2025", "estimateEPS": 2.73},
    ]

def demo_score(symbol: str) -> Dict[str, Any]:
    import random
    factors = {
        "growth": round(random.uniform(60, 95), 2),
        "profitability": round(random.uniform(55, 92), 2),
        "moat": round(random.uniform(40, 90), 2),
        "valuation": round(random.uniform(35, 85), 2),
        "momentum": round(random.uniform(50, 95), 2),
    }
    weights = {"growth": 0.25, "profitability": 0.2, "moat": 0.15, "valuation": 0.2, "momentum": 0.2}
    overall = round(sum(factors[k] * w for k, w in weights.items()), 2)
    verdict = "Buy" if overall >= 75 else ("Watch" if overall >= 60 else "Avoid")
    return {"symbol": symbol.upper(), "factors": factors, "overall": overall, "verdict": verdict}

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200

@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True) or {}
    user = (data.get("message") or "").strip()
    if not user:
        return jsonify({"reply": "Ask me anything about companies, fundamentals, or comparisons."})
    try:
        result = handle_chat(user)
        return jsonify(result)
    except LLMConfigurationError as cfg_err:
        logger.error("Chat request failed due to configuration: %s", cfg_err)
        return jsonify({
            "reply": "The AI assistant is not configured yet. Please add Azure OpenAI or OpenAI credentials.",
        }), 500
    except Exception as exc:
        logger.exception("Chat request failed")
        return jsonify({
            "reply": "I ran into an unexpected issue answering that. Please try again shortly.",
        }), 500

@app.get("/api/earnings")
def earnings():
    symbol = (request.args.get("symbol") or "AAPL").upper()
    return jsonify({"symbol": symbol, "items": demo_earnings(symbol)})

@app.get("/api/score")
def score():
    symbol = (request.args.get("symbol") or "AAPL").upper()
    return jsonify(demo_score(symbol))

@app.get("/api/vendors")
def vendors():
    return jsonify({
        "vendors": [
            {"name": "Yahoo Finance", "status": "connected", "notes": "Community libs"},
            {"name": "Alpha Vantage", "status": "optional", "notes": "API key required"},
            {"name": "EDGAR", "status": "optional", "notes": "SEC filings"},
        ]
    })


@app.get("/api/scores/ranked")
def scores_ranked():
    try:
        refresh = request.args.get("refresh") == "1"
        sector_filter = (request.args.get("sector") or "").strip().lower()

        rows = _scores_load_all(force=refresh)
        items = []
        for r in rows:
            if sector_filter and (r.get("sector") or "").strip().lower() != sector_filter:
                continue
            items.append(r)

        resp = jsonify({
            "count": len(items),
            "items": items,
            "cached_at": _SCORES_CACHE["ts"].isoformat() if _SCORES_CACHE["ts"] else None,
        })
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/api/companies/profiles")
def companies_profiles():
    try:
        refresh = request.args.get("refresh") == "1"
        query = (request.args.get("q") or "").strip().lower()

        rows = _profiles_load_all(force=refresh)

        if query:
            def matches(r: dict) -> bool:
                sym = (r.get("symbol") or "").lower()
                name = (r.get("companyName") or "").lower()
                sector = (r.get("sector") or "").lower()
                return query in sym or query in name or query in sector

            rows = [r for r in rows if matches(r)]

        return jsonify({
            "count": len(rows),
            "items": rows,
            "cached_at": _PROFILES_CACHE["ts"].isoformat() if _PROFILES_CACHE["ts"] else None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get("/api/sectors")
def sectors():
    return jsonify({"items": [
        {"name": "Technology", "1w": 1.2, "1m": 4.8, "ytd": 22.4},
        {"name": "Healthcare", "1w": -0.3, "1m": 1.9, "ytd": 6.7},
        {"name": "Financials", "1w": 0.7, "1m": 3.1, "ytd": 12.2},
    ]})

# ---------------- Entrypoint ----------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = (os.getenv("FLASK_DEBUG", "true").lower() == "true")
    app.run(host="0.0.0.0", port=port, debug=debug)
