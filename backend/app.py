# app.py
from __future__ import annotations

import os, re
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta
from contextlib import contextmanager

from flask import Flask, jsonify, request
from flask_cors import CORS
from dateutil import parser as dateparser
from dotenv import load_dotenv

load_dotenv()

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
EARNINGS_TABLE = "workspace.sw_gold.earnings_calendar_new"
VENDOR_TABLE   = "workspace.sw_gold.vendor_customer_network"

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
        return jsonify({"reply": "Ask me anything about stocks, earnings, or sectors."})
    reply = f"🤖 SmartWealth AI: You said: '{user}'. Try 'show AAPL last 5 years graph' or 'earnings AAPL this quarter'."
    return jsonify({"reply": reply})

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
