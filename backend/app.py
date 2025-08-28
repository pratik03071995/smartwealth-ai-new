from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import List, Dict, Any

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

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
    # Placeholder LLM
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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
