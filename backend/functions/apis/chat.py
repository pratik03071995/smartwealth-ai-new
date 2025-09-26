"""Chat service logic and API helpers."""
from __future__ import annotations

import json
import math
import random
import re
import uuid
from contextvars import ContextVar
from datetime import datetime, timedelta, date
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Any, Dict, List, Literal, Optional, Tuple

import requests
from dateutil import parser as dateparser
from flask import jsonify, request
from contextvars import ContextVar

try:
    from openai import APIError as OpenAIError, AzureOpenAI, OpenAI
except ImportError:  # pragma: no cover - optional dependency
    OpenAI = None  # type: ignore[assignment]
    AzureOpenAI = None  # type: ignore[assignment]

    class OpenAIError(Exception):
        """Fallback error type when the OpenAI SDK is unavailable."""

        pass

from . import settings
from .databricks import db_cursor
from .datasets import (
    build_profile_name_index,
    earn_load_all,
    earn_cache_timestamp,
    load_mock_dataset,
    normalize_earn_row,
    profiles_load_all,
    profiles_cache_timestamp,
    scores_load_all,
    scores_cache_timestamp,
    slugify_word,
    try_query_by_date_col,
    vendor_load_all,
    vendor_cache_timestamp,
)
from .feedback import (
    best_feedback_match,
    feedback_response,
    fetch_feedback_entry_by_id,
    log_chat_interaction,
    normalize_feedback_prompt,
    record_feedback,
)
from .utils import first_key, json_default, to_iso, to_native
from .web_search import (
    detect_search_intent,
    search_web,
    format_search_results,
    enhance_query_with_context,
    should_use_web_search,
    combine_search_and_database_results,
)
# Using llm_router for intelligent query routing
from .llm_router import route_query_with_llm as route_query

logger = settings.logger
AZURE_OPENAI_ENDPOINT = settings.AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY = settings.AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT = settings.AZURE_OPENAI_DEPLOYMENT
AZURE_OPENAI_API_VERSION = settings.AZURE_OPENAI_API_VERSION
OPENAI_API_KEY = settings.OPENAI_API_KEY
DEEPSEEK_API_BASE = (settings.DEEPSEEK_API_BASE or "").rstrip("/") or "https://api.deepseek.com/v1"
DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY
DEEPSEEK_MODEL = settings.DEEPSEEK_MODEL
DEEPSEEK_TIMEOUT = settings.DEEPSEEK_TIMEOUT

# Common stopwords that should not be treated as stock symbols
SYMBOL_STOPWORDS = {
    "THE", "AND", "OR", "BUT", "IN", "ON", "AT", "TO", "FOR", "OF", "WITH", "BY",
    "FROM", "UP", "ABOUT", "INTO", "THROUGH", "DURING", "BEFORE", "AFTER", "ABOVE",
    "BELOW", "BETWEEN", "AMONG", "UNDER", "OVER", "AGAINST", "WITHOUT", "WITHIN",
    "SHOW", "ME", "LIST", "GET", "FIND", "SEARCH", "LOOK", "SEE", "VIEW", "DISPLAY",
    "COMPARE", "ANALYZE", "ANALYSIS", "DATA", "INFORMATION", "DETAILS", "RESULTS",
    "COMPANIES", "STOCKS", "SHARES", "EQUITY", "MARKET", "FINANCIAL", "REVENUE",
    "PROFIT", "EARNINGS", "GROWTH", "VALUE", "PRICE", "VOLUME", "RETURN", "YIELD"
}

# Company name to ticker symbol mapping
COMPANY_TO_TICKER = {
    "APPLE": "AAPL",
    "NVIDIA": "NVDA", 
    "MICROSOFT": "MSFT",
    "GOOGLE": "GOOGL",
    "AMAZON": "AMZN",
    "META": "META",
    "TESLA": "TSLA",
    "NETFLIX": "NFLX",
    "ADOBE": "ADBE",
    "SALESFORCE": "CRM",
    "ORACLE": "ORCL",
    "INTEL": "INTC",
    "IBM": "IBM",
    "CISCO": "CSCO",
    "QUALCOMM": "QCOM"
}
OPENAI_MODEL = settings.OPENAI_MODEL
LLM_TEMPERATURE = settings.LLM_TEMPERATURE
OLLAMA_BASE_URL = settings.OLLAMA_BASE_URL
OLLAMA_MODEL = settings.OLLAMA_MODEL
OLLAMA_TIMEOUT = settings.OLLAMA_TIMEOUT
OLLAMA_FALLBACK_BASE_URL = settings.OLLAMA_FALLBACK_BASE_URL
LLM_MODE = settings.LLM_MODE

DATE_CANDIDATES = settings.DATE_CANDIDATES
TIME_CANDIDATES = settings.TIME_CANDIDATES
NAME_CANDIDATES = settings.NAME_CANDIDATES
SYMBOL_CANDIDATES = settings.SYMBOL_CANDIDATES

EARNINGS_TABLE = settings.EARNINGS_TABLE
VENDOR_TABLE = settings.VENDOR_TABLE
SCORES_TABLE = settings.SCORES_TABLE
PROFILES_TABLE = settings.PROFILES_TABLE

CHAT_FEEDBACK_STATUS_APPROVED = settings.CHAT_FEEDBACK_STATUS_APPROVED
CHAT_FEEDBACK_STATUS_PENDING = settings.CHAT_FEEDBACK_STATUS_PENDING
CHAT_FEEDBACK_STATUS_REJECTED = settings.CHAT_FEEDBACK_STATUS_REJECTED

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
    rows, used_date_col = earn_load_all(force=force)
    normalized: list[dict[str, Any]] = []
    for r in rows:
        norm = normalize_earn_row(r, used_date_col)
        if not norm:
            continue
        combined = dict(norm.get("raw") or {})
        combined.setdefault("symbol", norm.get("symbol"))
        combined.setdefault("company_name", norm.get("company_name"))
        combined.setdefault("event_date", norm.get("event_date"))
        combined.setdefault("time_hint", norm.get("time_hint"))
        normalized.append({k: to_native(v) for k, v in combined.items()})
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
        loader=vendor_load_all,
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

_LLM_PROVIDER_TOKEN: ContextVar[str] = ContextVar("llm_provider", default="none")


def record_llm_provider(provider: str) -> None:
    """Store the last successful LLM provider for the active request."""
    _LLM_PROVIDER_TOKEN.set((provider or "none").lower())


def reset_llm_provider() -> None:
    """Reset provider tracking for a new request lifecycle."""
    record_llm_provider("none")


def get_last_llm_provider() -> str:
    return _LLM_PROVIDER_TOKEN.get()


def get_llm_source_label() -> str:
    mapping = {
        "deepseek": "DeepSeek",
        "ollama": "Ollama",
        "openai": "OpenAI",
        "azure-openai": "Azure OpenAI",
        "mock": "Mock",
        "heuristic": "Heuristic",
        "none": "None",
        "": "None",
    }
    raw = get_last_llm_provider()
    return mapping.get(raw, raw.title() if raw else "None")


def build_source_label(data_source: Optional[str], search_provider: Optional[str], llm_label: str) -> str:
    data_source = (data_source or "").lower()
    provider_label = (search_provider or "").strip()
    parts: list[str] = []

    if data_source:
        if data_source == "web_search":
            label = provider_label or "Web Search"
            parts.append(f"Web Search ({label})" if provider_label else "Web Search")
        elif data_source == "financial_api_enhanced":
            parts.append("Financial API")
        elif data_source == "database":
            parts.append("SmartWealth Database")
        else:
            parts.append(data_source.replace("_", " ").title())
    elif provider_label:
        parts.append(f"Web Search ({provider_label})")

    llm_label = llm_label.strip()
    if llm_label and llm_label not in {"None"}:
        if llm_label == "Heuristic":
            parts.append("Heuristic Router")
        else:
            parts.append(f"LLM: {llm_label}")

    if not parts:
        return "Source: System"
    return f"Source: {' | '.join(parts)}"


def _ensure_llm_client() -> tuple[str, Any, Any]:
    global _LLM_CLIENT_CACHE
    if _LLM_CLIENT_CACHE:
        return _LLM_CLIENT_CACHE

    mode_pref = (LLM_MODE or "").strip().lower()

    if mode_pref == "mock":
        _LLM_CLIENT_CACHE = ("mock", None, None)
        return _LLM_CLIENT_CACHE

    allow_deepseek = mode_pref in {"", "deepseek"}
    if DEEPSEEK_API_KEY and allow_deepseek:
        session = requests.Session()
        fallback_config: Optional[dict[str, Any]] = None
        if OLLAMA_BASE_URL:
            base = OLLAMA_BASE_URL.rstrip("/")
            fallbacks: list[str] = []
            if OLLAMA_FALLBACK_BASE_URL:
                fallbacks = [OLLAMA_FALLBACK_BASE_URL.rstrip("/")]
            elif "host.docker.internal" in base:
                fallbacks.append("http://172.17.0.1:11434")
            fallback_config = {
                "base_urls": [base] + fallbacks,
                "model": OLLAMA_MODEL,
                "timeout": OLLAMA_TIMEOUT,
            }
        config = {
            "api_base": DEEPSEEK_API_BASE.rstrip("/") if DEEPSEEK_API_BASE else "https://api.deepseek.com/v1",
            "api_key": DEEPSEEK_API_KEY,
            "model": DEEPSEEK_MODEL,
            "timeout": DEEPSEEK_TIMEOUT,
            "fallback": fallback_config,
        }
        _LLM_CLIENT_CACHE = ("deepseek", session, config)
        return _LLM_CLIENT_CACHE

    if mode_pref == "deepseek" and not DEEPSEEK_API_KEY:
        raise LLMConfigurationError(
            "LLM_MODE is set to 'deepseek' but DEEPSEEK_API_KEY is not configured."
        )

    allow_ollama = mode_pref in {"", "ollama", "deepseek"}
    if OLLAMA_BASE_URL and allow_ollama:
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

    if AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT and mode_pref in {"", "azure"}:
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

    if OPENAI_API_KEY and mode_pref in {"", "openai"}:
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


def _identify_tickers_with_llm(user_prompt: str) -> list[str]:
    """Use LLM to identify ticker symbols from natural language queries."""
    try:
        # Get available tickers from the database
        available_tickers = []
        try:
            with db_cursor() as cur:
                cur.execute(f"SELECT DISTINCT symbol FROM {PROFILES_TABLE} LIMIT 50")
                available_tickers = [row[0] for row in cur.fetchall()]
        except Exception:
            # Fallback to common tickers if database query fails
            available_tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX", "ADBE", "CRM", "ORCL", "INTC", "IBM", "CSCO", "QCOM"]
        
        # Create prompt for LLM to identify tickers
        ticker_prompt = f"""
You are a financial data assistant. Extract ticker symbols from the user's query.

Available tickers in our database: {', '.join(available_tickers[:20])}

User query: "{user_prompt}"

Extract ONLY the ticker symbols mentioned in the query. Return them as a JSON array.
If no tickers are mentioned, return an empty array: []

Examples:
- "Show me Apple stock" → ["AAPL"]
- "Compare Microsoft and Google" → ["MSFT", "GOOGL"] 
- "What about Tesla?" → ["TSLA"]
- "Show me top companies" → []

Return only the JSON array, no other text.
"""
        
        messages = [
            {"role": "system", "content": "You are a ticker symbol extraction assistant. Return only valid JSON arrays."},
            {"role": "user", "content": ticker_prompt}
        ]
        
        response = _llm_chat(messages)
        
        # Parse JSON response
        import json
        try:
            tickers = json.loads(response.strip())
            if isinstance(tickers, list):
                # Filter to only include tickers that exist in our database
                valid_tickers = [t for t in tickers if t in available_tickers]
                return valid_tickers
        except json.JSONDecodeError:
            pass
            
    except Exception as exc:
        logger.error("LLM ticker identification failed: %s", exc)
    
    # Fallback to regex-based extraction
    ticker_tokens = re.findall(r"\b[A-Z]{1,6}\b", user_prompt.upper())
    stopwords = {
        "VS", "AND", "THE", "WITH", "FOR", "SHOW", "LIST", "KEY", "NEXT", "UPCOMING",
        "EPS", "CAP", "SCORE", "GRAPH", "CHART", "FROM", "DATA", "OK", "OKAY", "YES",
        "NO", "THANKS", "HELLO", "HI", "HEY", "COMPARE", "VERSUS", "AGAINST", "BETWEEN",
        "STOCK", "STOCKS", "SHARES", "EQUITY", "MARKET", "FINANCIAL", "REVENUE",
        "PROFIT", "EARNINGS", "GROWTH", "VALUE", "PRICE", "VOLUME", "RETURN", "YIELD",
        "DETAILS", "INFORMATION"
    }
    
    tickers = []
    for tok in ticker_tokens:
        if tok not in stopwords:
            mapped_ticker = COMPANY_TO_TICKER.get(tok, tok)
            if mapped_ticker not in tickers:
                tickers.append(mapped_ticker)
    
    return tickers

def _extract_prompt_hints(prompt: str) -> list[str]:
    """Extract hints from user prompt for symbol search."""
    hints = []
    text = prompt.lower()
    
    # Extract potential company names and keywords
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text)
    for word in words:
        if word not in {'show', 'me', 'get', 'find', 'search', 'list', 'display', 'compare', 'stock', 'stocks', 'company', 'companies', 'data', 'information', 'details'}:
            hints.append(word)
    
    return hints[:5]  # Limit to 5 hints

def _search_symbols_by_hints(config: dict, hints: list[str], limit: int = 6) -> list[tuple[str, float]]:
    """Search for symbols based on hints using the profile name index."""
    if not hints:
        return []
    
    try:
        # Get the profile name index
        name_index = build_profile_name_index()
        
        # Search for matches
        matches = []
        for hint in hints:
            hint_lower = hint.lower()
            # Look for exact matches first
            if hint_lower in name_index:
                for symbol in name_index[hint_lower]:
                    matches.append((symbol, 1.0))  # High confidence for exact matches
            # Look for partial matches
            for key, symbols in name_index.items():
                if hint_lower in key or key in hint_lower:
                    for symbol in symbols:
                        matches.append((symbol, 0.8))  # Lower confidence for partial matches
        
        # Remove duplicates and limit results
        unique_matches = {}
        for symbol, confidence in matches:
            if symbol not in unique_matches or unique_matches[symbol] < confidence:
                unique_matches[symbol] = confidence
        
        # Sort by confidence and return as list of tuples
        sorted_matches = sorted(unique_matches.items(), key=lambda x: x[1], reverse=True)
        return sorted_matches[:limit]
    except Exception as exc:
        logger.error(f"Symbol search by hints failed: {exc}")
        return []

def _map_company_to_ticker(company_name: str) -> str:
    """Map company name to ticker symbol."""
    return COMPANY_TO_TICKER.get(company_name.upper(), company_name)

def _augment_plan_with_prompt(plan: ChatPlan, user_prompt: str) -> None:
    """Augment the chat plan with additional information from the user prompt."""
    # Skip ticker extraction for simple responses
    simple_responses = {"ok", "okay", "yes", "no", "thanks", "thank you", "hello", "hi", "hey"}
    if user_prompt.lower().strip() in simple_responses:
        return
    
    # Use LLM-based ticker identification if no tickers in plan
    if not plan.tickers:
        identified_tickers = _identify_tickers_with_llm(user_prompt)
        for ticker in identified_tickers:
            if ticker not in plan.tickers:
                plan.tickers.append(ticker)
    
    # Extract metrics/keywords from the prompt
    prompt_lower = user_prompt.lower()
    
    # Check for common financial metrics
    if any(word in prompt_lower for word in ['revenue', 'sales', 'income']):
        if 'revenue' not in plan.metrics:
            plan.metrics.append('revenue')
    
    if any(word in prompt_lower for word in ['profit', 'earnings', 'eps']):
        if 'earnings' not in plan.metrics:
            plan.metrics.append('earnings')
    
    if any(word in prompt_lower for word in ['score', 'rating', 'rank']):
        if 'score' not in plan.metrics:
            plan.metrics.append('score')
    
    # Check for chart/table requirements
    if any(word in prompt_lower for word in ['chart', 'graph', 'plot', 'visualize']):
        plan.needs_chart = True
    
    if any(word in prompt_lower for word in ['table', 'list', 'show', 'display']):
        plan.needs_table = True
    
    # Check for specific datasets
    if any(word in prompt_lower for word in ['earnings', 'earnings calendar']):
        plan.dataset = 'earnings'
    elif any(word in prompt_lower for word in ['scores', 'rankings']):
        plan.dataset = 'scores'
    elif any(word in prompt_lower for word in ['vendors', 'suppliers']):
        plan.dataset = 'vendors'
    
    # Update config based on dataset
    if plan.dataset in DATASET_CONFIGS:
        plan.config = DATASET_CONFIGS[plan.dataset]


def _generate_followups(plan: ChatPlan, rows: list, table_payload: Optional[dict]) -> list[str]:
    """Generate follow-up questions based on the plan and results."""
    followups = []
    
    # Add dataset-specific followups
    if plan.dataset == "profiles":
        if plan.tickers:
            followups.append(f"Show me more details about {plan.tickers[0]}")
        followups.append("Show me top companies by market cap")
        followups.append("Compare these companies")
    
    elif plan.dataset == "scores":
        followups.append("Show me the top 10 companies by score")
        followups.append("What are the lowest scoring companies?")
        followups.append("Show me companies in the technology sector")
    
    elif plan.dataset == "earnings":
        followups.append("Show me upcoming earnings this week")
        followups.append("What companies are reporting today?")
        followups.append("Show me earnings for technology companies")
    
    elif plan.dataset == "vendors":
        followups.append("Show me the largest vendor relationships")
        followups.append("What companies have the most suppliers?")
    
    # Add metric-specific followups
    if "revenue" in plan.metrics:
        followups.append("Show me revenue trends")
    if "earnings" in plan.metrics:
        followups.append("Show me earnings growth")
    if "score" in plan.metrics:
        followups.append("Show me score breakdowns")
    
    # Add ticker-specific followups
    if plan.tickers:
        for ticker in plan.tickers[:2]:  # Limit to first 2 tickers
            followups.append(f"Show me {ticker} fundamentals")
            followups.append(f"Compare {ticker} with competitors")
    
    # Limit to 3 followups to avoid overwhelming the user
    return followups[:3]


def _fetch_rows(plan: ChatPlan) -> tuple[list[dict[str, Any]], Optional[str], Optional[dict]]:
    """Fetch rows based on the chat plan from Databricks."""
    config = plan.config
    
    # Build SQL query with proper filtering
    if config.query_mode == "sql":
        sql, params = _build_sql(plan, config)
        
        try:
            with db_cursor() as cur:
                cur.execute(sql, params)
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
                rows.append(converted)
            
            return rows, sql, params
        except Exception as exc:
            logger.error("SQL query failed: %s", exc)
            # Fallback to cache-based approach
            pass
    
    # Fallback to cache-based approach for non-SQL datasets
    if plan.dataset == "profiles":
        rows = profiles_load_all()
        # Filter by tickers if specified
        if plan.tickers:
            rows = [row for row in rows if row.get("symbol") in plan.tickers]
        return rows, None, None
    elif plan.dataset == "scores":
        rows = scores_load_all()
        if plan.tickers:
            rows = [row for row in rows if row.get("symbol") in plan.tickers]
        return rows, None, None
    elif plan.dataset == "earnings":
        rows, _ = earn_load_all()
        if plan.tickers:
            rows = [row for row in rows if row.get("symbol") in plan.tickers]
        return rows, None, None
    elif plan.dataset == "vendors":
        rows = vendor_load_all()
        if plan.tickers:
            rows = [row for row in rows if row.get("ticker") in plan.tickers]
        return rows, None, None
    else:
        # Default to profiles
        rows = profiles_load_all()
        if plan.tickers:
            rows = [row for row in rows if row.get("symbol") in plan.tickers]
        return rows, None, None


def _heuristic_plan_data(prompt: str) -> dict[str, Any]:
    text = prompt.lower()
    
    # Handle simple responses like "ok", "yes", "no", "thanks" etc.
    simple_responses = {"ok", "okay", "yes", "no", "thanks", "thank you", "hello", "hi", "hey"}
    if text.strip() in simple_responses:
        return {
            "intent": "chitchat",
            "dataset": "profiles",
            "tickers": [],
            "metrics": [],
            "include": [],
            "limit": 5,
            "needs_chart": False,
            "needs_table": False,
            "summary_instruction": None,
            "followups": []
        }
    
    # Use LLM-based ticker identification
    tickers = _identify_tickers_with_llm(prompt)

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
    
    # Handle comparison requests
    comparison_words = {"compare", "vs", "versus", "against", "between"}
    if any(word in text for word in comparison_words) and len(tickers) >= 2:
        return {
            "intent": "compare",
            "dataset": "profiles",
            "tickers": tickers,
            "metrics": ["marketCap", "price", "sector", "industry"],
            "include": ["sector", "industry"],
            "filters": [],
            "limit": len(tickers),
            "needs_chart": True,
            "needs_table": True,
            "summary_instruction": f"Compare {', '.join(tickers)} companies",
            "followups": []
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
    record_llm_provider("mock")
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


def _ollama_chat_request(
    session: requests.Session,
    config: dict[str, Any],
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> str:
    base_urls = config.get("base_urls") or [config.get("base_url")]
    model_name = config.get("model")
    timeout = config.get("timeout", OLLAMA_TIMEOUT)
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
            resp = session.post(chat_url, json=payload, timeout=timeout)
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
            record_llm_provider("ollama")
            return content.strip()
        except requests.HTTPError as e:
            last_error = e
            status = e.response.status_code if e.response else None
            logger.error("Ollama request failed via %s: %s", base_url, e)
            if status == 404:
                try:
                    content = _ollama_generate_fallback(session, base_url, model_name, messages, temperature, timeout)
                    if content:
                        record_llm_provider("ollama")
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


def _deepseek_chat_request(
    session: requests.Session,
    config: dict[str, Any],
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> str:
    api_base = (config.get("api_base") or "https://api.deepseek.com/v1").rstrip("/")
    api_key = config.get("api_key")
    model_name = config.get("model") or DEEPSEEK_MODEL
    timeout = config.get("timeout", DEEPSEEK_TIMEOUT)
    if not api_key:
        raise LLMConfigurationError("DeepSeek API key missing.")

    endpoint = f"{api_base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    resp = session.post(endpoint, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise RuntimeError("Empty response from DeepSeek")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content: Optional[str] = None
    if isinstance(message, dict):
        content = message.get("content")
        if not content:
            reasoning = message.get("reasoning_content")
            if isinstance(reasoning, str) and reasoning.strip():
                content = reasoning
    if not content:
        content = choices[0].get("text") if isinstance(choices[0], dict) else None

    if not content:
        raise RuntimeError("DeepSeek response missing content")

    record_llm_provider("deepseek")
    return str(content).strip()


def _llm_chat(messages: list[dict[str, str]], temperature: float = LLM_TEMPERATURE, max_tokens: int = 700) -> str:
    mode, client, model_info = _ensure_llm_client()
    record_llm_provider("none")

    if mode == "mock":
        return _mock_llm_response(messages)

    if mode == "ollama":
        record_llm_provider("ollama")
        return _ollama_chat_request(client, model_info, messages, temperature, max_tokens)

    if mode == "deepseek":
        try:
            return _deepseek_chat_request(client, model_info, messages, temperature, max_tokens)
        except Exception as exc:
            logger.error("DeepSeek request failed: %s", exc)
            fallback_config = model_info.get("fallback") if isinstance(model_info, dict) else None
            if fallback_config:
                try:
                    fallback_session = requests.Session()
                    return _ollama_chat_request(fallback_session, fallback_config, messages, temperature, max_tokens)
                except Exception as fallback_exc:
                    logger.error("Ollama fallback failed after DeepSeek error: %s", fallback_exc)
                    raise fallback_exc from exc
            raise

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
    if mode == "azure":
        record_llm_provider("azure-openai")
    elif mode == "openai":
        record_llm_provider("openai")
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
- Open with a succinct headline that directly answers the user’s question.
- Follow with a short paragraph (2–4 sentences) that synthesizes the most important facts from the table: highlight standout metrics, context, comparisons, and what the numbers mean.
- Mention only the most relevant values (e.g. headquarters location, market cap, revenue growth) instead of listing every column.
- If multiple tickers appear, compare or rank them and call out leaders or laggards.
- For earnings rows, include the next event date/time and any guidance; for scores, interpret high/low factors; for vendors, describe the relationship strength and value.
- Close with a forward-looking takeaway or recommended next step.
- Never repeat raw table rows verbatim; translate the data into natural language.
- If no rows are returned, say so and invite the user to refine their query.
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


def _render_sql_with_params(sql: str, params: Optional[list[Any]]) -> str:
    if not params:
        return sql
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


def _ollama_generate_fallback(session: requests.Session, base_url: str, model_name: str, messages: list[dict[str, str]], temperature: float, timeout: int) -> str:
    prompt = _flatten_messages_for_prompt(messages)
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
        },
    }
    resp = session.post(f"{base_url}/api/generate", json=payload, timeout=timeout)
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
                clean[k] = {ik: to_native(iv) for ik, iv in v.items()}
            elif isinstance(v, (list, tuple)):
                clean[k] = [to_native(iv) for iv in v]
            else:
                clean[k] = to_native(v)
        preview.append(clean)
    return preview


def _format_value_for_summary(value: Any, col: str, config: DatasetConfig) -> Optional[str]:
    if value in (None, "", "-"):
        return None
    if col in config.numeric_columns or col in config.currency_columns or col in config.percent_columns:
        try:
            return _format_number(value, col, config)
        except Exception:
            return str(value)
    if isinstance(value, (datetime, date)):
        return to_iso(value)
    return str(value)


def _auto_summary_from_rows(plan: ChatPlan, rows: list[dict[str, Any]]) -> Optional[str]:
    if not rows:
        return None
    config = plan.config
    row = rows[0]
    dataset = plan.dataset
    prompt_lower = plan.summary_instruction or ""
    prompt_lower = prompt_lower.lower()

    def get(*keys: str) -> Optional[str]:
        for key in keys:
            if key in row and row[key] not in (None, "", "-"):
                return _format_value_for_summary(row[key], key, config)
        return None

    def contains_any(*terms: str) -> bool:
        return any(term in prompt_lower for term in terms if term)

    ticker = get(config.ticker_column or "symbol", "symbol")
    name = get("companyName", "company_name", "company")

    if dataset == "profiles":
        hq_parts = [get("address"), get("city"), get("state"), get("country")]
        hq = ", ".join(part for part in hq_parts if part)
        market_cap = get("marketCap")
        price = get("price")
        ceo = get("ceo")
        sector = get("sector")
        phone = get("phone")
        pieces = []
        subject = name or ticker or "The company"
        if contains_any("phone", "contact", "call", "number") and phone:
            pieces.append(f"{subject} can be reached at {phone}.")
        if contains_any("where", "headquarter", "headquarters", "located", "address", "office") and hq:
            pieces.append(f"{subject} is headquartered at {hq}.")
        if not pieces and hq:
            pieces.append(f"{subject} is headquartered at {hq}.")
        if not pieces and name:
            pieces.append(f"{subject} is part of the {sector or 'listed'} universe.")
        if price or market_cap:
            finance = []
            if price:
                finance.append(f"trades around {price}")
            if market_cap:
                finance.append(f"with a market cap near {market_cap}")
            if finance:
                pieces.append("It " + " and ".join(finance) + ".")
        if sector and not contains_any("phone", "contact"):
            pieces.append(f"It operates within the {sector} sector.")
        if ceo:
            pieces.append(f"CEO: {ceo}.")
        if not pieces:
            return None
        return " ".join(pieces)

    if dataset == "earnings":
        event_date = get("event_date")
        time_hint = get("time_hint")
        period = get("period")
        guidance_eps = get("guidanceEPS")
        guidance_rev = get("guidanceRevenue")
        eps_est = get("estimateEPS", "epsEstimated")
        revenue_est = get("revenueEstimate", "revenueEstimated")
        subject = name or ticker or "The company"
        pieces = []
        if event_date:
            timing = f"on {event_date}"
            if time_hint:
                timing += f" ({time_hint})"
            pieces.append(f"{subject} is slated to report {period or 'earnings'} {timing}.")
        if eps_est or revenue_est:
            est_parts = []
            if eps_est:
                est_parts.append(f"EPS guidance sits near {eps_est}")
            if revenue_est:
                est_parts.append(f"revenues expected around {revenue_est}")
            pieces.append("Current estimates suggest " + " and ".join(est_parts) + ".")
        if guidance_eps or guidance_rev:
            guide_parts = []
            if guidance_eps:
                guide_parts.append(f"EPS guidance of {guidance_eps}")
            if guidance_rev:
                guide_parts.append(f"revenue guidance of {guidance_rev}")
            pieces.append("Management is signalling " + " and ".join(guide_parts) + ".")
        if not pieces:
            return None
        return " ".join(pieces)

    if dataset == "scores":
        overall = get("overall_score")
        price = get("px")
        sector = get("sector")
        innovation = get("score_innovation")
        fundamentals = get("score_fundamentals")
        valuation = get("score_valuation")
        sentiment = get("score_sentiment")
        pieces = []
        subject = name or ticker or "The company"
        if overall:
            pieces.append(f"{subject} carries an overall SmartWealth score of {overall}.")
        if sector or price:
            details = []
            if sector:
                details.append(f"operating in {sector}")
            if price:
                details.append(f"trading near {price}")
            if details:
                pieces.append(subject.split()[0] + " " + " and ".join(details) + ".")
        key_scores = []
        if fundamentals:
            key_scores.append(f"fundamentals {fundamentals}")
        if valuation:
            key_scores.append(f"valuation {valuation}")
        if sentiment:
            key_scores.append(f"sentiment {sentiment}")
        if innovation:
            key_scores.append(f"innovation {innovation}")
        if key_scores:
            pieces.append("Factor profile: " + ", ".join(key_scores) + ".")
        if not pieces:
            return None
        return " ".join(pieces)

    if dataset == "vendors":
        relation = get("relation_type")
        counterparty = get("counterparty_name")
        strength = get("relationship_strength")
        value = get("est_contract_value_usd_m")
        region = get("region")
        category = get("category")
        pieces = []
        subject = name or ticker or "The company"
        if relation and counterparty:
            pieces.append(f"{subject} has a {relation.lower()} relationship with {counterparty}.")
        if strength or value:
            detail = []
            if strength:
                detail.append(f"relationship strength ~{strength}")
            if value:
                detail.append(f"estimated contract value {value}")
            pieces.append("Key stats: " + ", ".join(detail) + ".")
        if region or category:
            geo = []
            if region:
                geo.append(region)
            if category:
                geo.append(category)
            if geo:
                pieces.append("Focus area: " + " • ".join(geo) + ".")
        if not pieces:
            return None
        return " ".join(pieces)

    return None


def _summary_is_generic(summary: str) -> bool:
    if not summary:
        return True
    lowered = summary.lower()
    generic_starts = [
        "here is what i found",
        "i couldn't", "could not", "unable to",
    ]
    if any(lowered.startswith(prefix) for prefix in generic_starts):
        return True
    return len(summary.strip()) < 80


def _execute_sql(sql: str, params: list[Any]) -> tuple[list[str], list[dict[str, Any]]]:
    with db_cursor() as c:
        c.execute(sql, params)
        columns = [d[0] for d in c.description]
        raw_rows = [dict(zip(columns, row)) for row in c.fetchall()]

    cleaned: list[dict[str, Any]] = []
    for row in raw_rows:
        clean_row: dict[str, Any] = {}
        for k, v in row.items():
            clean_row[k] = to_native(v)
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
        # Use LLM for summary generation
        summary = _llm_chat(messages)
        return summary
    except Exception as exc:
        logger.error("LLM summary failed: %s", exc)
        # Fallback to simple data-driven approach
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


def _fallback_smalltalk(user_prompt: str) -> str:
    try:
        # Use LLM for smalltalk responses
        messages = [
            {"role": "system", "content": "You are SmartWealth AI, a financial data assistant. Respond naturally to user greetings and simple queries. Keep responses concise and helpful."},
            {"role": "user", "content": user_prompt}
        ]
        return _llm_chat(messages)
    except Exception as exc:
        logger.error("LLM smalltalk failed: %s", exc)
        # Fallback to simple responses
        prompt_lower = user_prompt.lower().strip()
        
        if prompt_lower in {"ok", "okay"}:
            return "Got it! How can I help you with financial data today?"
        elif prompt_lower in {"yes", "no"}:
            return "I understand. What would you like to know about companies or markets?"
        elif prompt_lower in {"thanks", "thank you"}:
            return "You're welcome! Is there anything else I can help you with?"
        elif prompt_lower in {"hello", "hi", "hey"}:
            return "Hello! I'm SmartWealth AI. I can help you analyze companies, market data, and financial metrics. What would you like to explore?"
        else:
            return "Hi! I'm SmartWealth AI. Ask me about market caps, valuations, or company fundamentals."


def _handle_web_search_query(user_prompt: str, analysis: dict[str, Any]) -> dict[str, Any]:
    """
    Handle web search queries based on analysis.
    
    Args:
        user_prompt: User's question
        analysis: Routing analysis from LLM
    
    Returns:
        Chat response
    """
    try:
        logger.info(f"Web search handler - analysis: {analysis}")
        # Check if it's a stock price query
        if analysis.get('search_type') == 'financial_api' and analysis.get('symbol'):
            logger.info(f"Using financial API for symbol: {analysis.get('symbol')}")
            # Use financial API for stock prices
            from .web_search import get_stock_price, format_stock_price_response
            symbol = analysis['symbol']
            price_data = get_stock_price(symbol)
            if price_data:
                return format_stock_price_response(price_data, symbol)
        
        # Use general web search for other queries
        logger.info(f"Using general web search for: {user_prompt}")
        from .web_search import search_web, format_search_results
        search_results = search_web(user_prompt)
        logger.info(f"Web search results: {search_results}")
        if search_results:
            return format_search_results(search_results, user_prompt)
        
        # Fallback response
        return {
            "message": "I couldn't find specific information for that query. Could you try rephrasing your question?",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as exc:
        logger.error(f"Web search query failed: {exc}")
        return {
            "message": "I encountered an error while searching for that information. Please try again.",
            "timestamp": datetime.now().isoformat()
        }


def _handle_database_query(user_prompt: str, analysis: dict[str, Any]) -> dict[str, Any]:
    """
    Handle database queries based on analysis.
    
    Args:
        user_prompt: User's question
        analysis: Routing analysis from LLM
    
    Returns:
        Chat response
    """
    # Fall back to the original heuristic planning for database queries
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
    message_id = str(uuid.uuid4())
    plan_snapshot = plan.to_dict()

    def finalize_response(
        resp: dict[str, Any],
        *,
        plan: ChatPlan,
        message_id: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        resp["message_id"] = message_id
        resp["plan"] = plan_snapshot
        resp["timestamp"] = datetime.now().isoformat()
        return resp

    # Continue with the original database query logic...
    # [Rest of the original database query handling code would go here]
    return {
        "message": "Database query functionality is being processed...",
        "timestamp": datetime.now().isoformat()
    }


def handle_chat(user_prompt: str) -> dict[str, Any]:
    """
    Handle chat with clear routing: Database vs Web Search.
    
    Args:
        user_prompt: User's question
    
    Returns:
        Chat response
    """
    # Step 1: Route the query to determine search strategy
    strategy, analysis = route_query(user_prompt)
    logger.info(f"Query routing: '{user_prompt}' -> {strategy}")
    
    # Step 2: Follow the appropriate path
    if strategy == 'web_search':
        return _handle_web_search_query(user_prompt, analysis)
    else:
        return _handle_database_query(user_prompt, analysis)
    plan_snapshot = plan.to_dict()

    def finalize_response(
        resp: dict[str, Any],
        *,
        status: str = CHAT_FEEDBACK_STATUS_PENDING,
        table_payload: Optional[dict[str, Any]] = None,
        chart_payload: Optional[dict[str, Any]] = None,
        source_message_id: Optional[str] = None,
        match_score: Optional[float] = None,
        followups: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        resp.setdefault("plan", plan_snapshot)
        resp["messageId"] = resp.get("messageId") or message_id
        table_data = table_payload if table_payload is not None else resp.get("table")
        chart_data = chart_payload if chart_payload is not None else resp.get("chart")
        sql_text = resp.get("sql") or resp.get("sql_raw")
        latency_ms = resp.get("latencyMs")
        if followups is None:
            followups = resp.get("followups") if isinstance(resp.get("followups"), list) else None
        log_chat_interaction(
            message_id=resp["messageId"],
            prompt=user_prompt,
            answer=resp.get("reply") or "",
            plan=plan_snapshot,
            dataset=plan.dataset,
            table_payload=table_data,
            chart_payload=chart_data,
            sql=sql_text,
            latency_ms=latency_ms,
            status=status,
            source_message_id=source_message_id,
            match_score=match_score,
            followups=followups,
        )
        return resp

    if plan.intent == "chitchat" and not plan.metrics:
        response = {"reply": _fallback_smalltalk(user_prompt), "plan": plan_snapshot}
        chit_followups = _generate_followups(plan, [], None)
        if chit_followups:
            response["followups"] = chit_followups
        return finalize_response(response, followups=chit_followups)

    # Initialize web search variables
    web_search_results = []
    enhanced_query = user_prompt
    
    # Perform web search if needed
    if needs_search:
        try:
            # Enhance query with context
            context = {
                "tickers": plan.tickers,
                "intent": search_intent,
                "keywords": search_keywords
            }
            enhanced_query = enhance_query_with_context(user_prompt, context)
            
            # Perform web search
            web_search_results = search_web(enhanced_query, num_results=5, intent=search_intent)
            logger.info(f"Web search performed for query: {enhanced_query}, found {len(web_search_results)} results")
        except Exception as exc:
            logger.error(f"Web search failed: {exc}")
            web_search_results = []

    try:
        rows, sql_raw, sql_params = _fetch_rows(plan)
    except Exception as exc:
        logger.error("Dataset fetch failed: %s", exc)
        
        # If we have web search results, use them as fallback
        if web_search_results:
            web_response = format_search_results(web_search_results, query=user_prompt)
            return finalize_response({
                "reply": web_response,
                "web_search": True
            })
        
        if LLM_MODE != "mock" and plan.config.query_mode == "sql":
            error_response = {"reply": "I ran into an issue reaching Databricks. Please try again in a minute."}
            return finalize_response(error_response, status="error")
        if feedback_entry:
            fallback_entry = {**feedback_entry, "rating": "up"}
            fallback = feedback_response(fallback_entry)
            fallback.setdefault("reply", "I couldn't retrieve live data, but here's the last verified answer I have saved.")
            fallback["feedback_source"]["match_score"] = feedback_score
            fallback.setdefault("plan", plan_snapshot)
            followups = fallback.get("followups") or _generate_followups(plan, [], None)
            if followups:
                fallback["followups"] = followups
            return finalize_response(
                fallback,
                status=feedback_entry.get("status") or CHAT_FEEDBACK_STATUS_PENDING,
                source_message_id=feedback_entry.get("messageId"),
                match_score=feedback_score,
                followups=followups,
            )
        return finalize_response({"reply": "I couldn't retrieve data for that request just now."}, status="error")

    if not rows:
        if feedback_entry:
            fallback = feedback_response(feedback_entry)
            fallback["feedback_source"]["match_score"] = feedback_score
            fallback.setdefault("plan", plan_snapshot)
            if not fallback.get("sql"):
                fallback["sql"] = _render_sql_with_params(sql_raw, sql_params)
                fallback["sql_raw"] = sql_raw
            followups = fallback.get("followups") or _generate_followups(plan, [], None)
            if followups:
                fallback["followups"] = followups
            return finalize_response(
                fallback,
                status=feedback_entry.get("status") or CHAT_FEEDBACK_STATUS_PENDING,
                source_message_id=feedback_entry.get("messageId"),
                match_score=feedback_score,
                followups=followups,
            )
        no_data_msg = (
            f"I couldn't find matching records in the SmartWealth {plan.dataset} dataset. "
            "Try another ticker or adjust the filters."
        )
        empty_followups = _generate_followups(plan, [], None)
        response = {
            "reply": no_data_msg,
            "sql": _render_sql_with_params(sql_raw, sql_params),
            "sql_raw": sql_raw,
            "plan": plan_snapshot,
        }
        if empty_followups:
            response["followups"] = empty_followups
        return finalize_response(
            response,
            followups=empty_followups,
        )

    table_payload = _build_table_payload(plan, rows)
    chart_payload = _build_chart_payload(plan, rows)
    
    # Generate base summary from database results
    summary = _summarize_answer(user_prompt, plan, sql_raw, rows)
    display_sql = _render_sql_with_params(sql_raw, sql_params)

    # For stock price queries, prioritize web search results
    if any(keyword in user_prompt.lower() for keyword in ['stock price', 'current price', 'price', 'tesla', 'apple', 'microsoft']):
        if web_search_results:
            web_response = format_search_results(web_search_results, query=user_prompt)
            summary = web_response  # Use only real-time data for price queries
            logger.info(f"Using web search for stock price query: {user_prompt}")
        else:
            # If no web search results, use database but indicate it's not real-time
            summary = f"**Note: This is historical data, not real-time prices**\n\n{summary}"
    elif web_search_results:
        # For other queries, combine database and web search
        web_response = format_search_results(web_search_results, query=user_prompt)
        summary = f"**Database Insights:**\n{summary}\n\n**Latest Information:**\n{web_response}"
        logger.info(f"Combined database and web search results for query: {user_prompt}")

    auto_summary = _auto_summary_from_rows(plan, rows)
    if auto_summary and _summary_is_generic(summary):
        summary = auto_summary

    detail_preview = _prepare_preview_rows(rows, limit=3) if table_payload else None

    response: dict[str, Any] = {
        "reply": summary,
        "sql": display_sql,
        "sql_raw": sql_raw,
        "plan": plan_snapshot,
    }
    
    # Add web search metadata if used
    if web_search_results:
        response["web_search"] = True
        response["search_results_count"] = len(web_search_results)
    if table_payload:
        response["table"] = table_payload
    if detail_preview:
        response["tablePreview"] = detail_preview
    if chart_payload:
        response["chart"] = chart_payload
    if feedback_entry:
        response["feedback_reference"] = {
            "prompt": feedback_entry.get("prompt"),
            "createdAt": feedback_entry.get("createdAt"),
            "match_score": feedback_score,
        }
    followups = response.get("followups") or _generate_followups(plan, rows, table_payload)
    if followups:
        response["followups"] = followups
    return finalize_response(
        response,
        table_payload=table_payload,
        chart_payload=chart_payload,
        followups=followups,
    )

# ========================= Earnings API =========================
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
            rows, used_date_col = earn_load_all(force=False)
            for r in rows:
                norm = normalize_earn_row(r, used_date_col)
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
                    rows, used_date_col = try_query_by_date_col(start_str, end_str, dc)
                    if rows:
                        break
                except Exception:
                    continue
            if not rows:
                with db_cursor() as c:
                    c.execute(f"SELECT * FROM {EARNINGS_TABLE} LIMIT 5000")
                    cols = [d[0] for d in c.description]
                    rows = [dict(zip(cols, r)) for r in c.fetchall()]
            for r in rows:
                norm = normalize_earn_row(r, used_date_col)
                if norm:
                    items.append(norm)

        items.sort(key=lambda x: (x["event_date"], x["symbol"]))
        resp = jsonify({"start": start_str, "end": end_str, "count": len(items), "items": items})
        resp.headers["Cache-Control"] = "public, max-age=60"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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

        rows, used_date_col = earn_load_all(force=refresh)

        items: list[dict] = []
        s_str, e_str = from_date.isoformat(), to_date.isoformat()
        for r in rows:
            norm = normalize_earn_row(r, used_date_col)
            if not norm:
                continue
            d = norm["event_date"]
            if s_str <= d <= e_str:
                items.append(norm)

        items.sort(key=lambda x: (x["event_date"], x["symbol"]))
        cached_ts = earn_cache_timestamp()
        resp = jsonify({
            "from": s_str,
            "to": e_str,
            "count": len(items),
            "items": items,
            "cached_at": cached_ts.isoformat() if cached_ts else None,
        })
        resp.headers["Cache-Control"] = "public, max-age=60"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ========================= Vendor Network API =========================
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
        rows = vendor_load_all(force=refresh)
        cached_ts = vendor_cache_timestamp()
        resp = jsonify({
            "count": len(rows),
            "items": rows,
            "cached_at": cached_ts.isoformat() if cached_ts else None,
        })
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def vendors_companies():
    """
    GET /api/vendors/companies
    Returns a de-duped list of companies with their tickers and counts.
    """
    try:
        rows = vendor_load_all(force=False)
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

def health():
    return jsonify({"status": "ok"}), 200

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


def chat_feedback():
    data = request.get_json(silent=True) or {}
    rating = str(data.get("rating") or "").lower()
    if rating not in {"up", "down"}:
        return jsonify({"error": "Invalid rating"}), 400

    entry = {
        "messageId": data.get("messageId") or str(uuid.uuid4()),
        "prompt": data.get("prompt") or "",
        "answer": data.get("answer") or "",
        "plan": data.get("plan"),
        "table": data.get("table"),
        "chart": data.get("chart"),
        "sql": data.get("sql"),
        "latencyMs": data.get("latencyMs"),
        "rating": rating,
        "createdAt": data.get("createdAt") or datetime.utcnow().isoformat(),
    }

    existing = fetch_feedback_entry_by_id(entry["messageId"])
    if existing:
        entry.setdefault("prompt", existing.get("prompt"))
        entry.setdefault("answer", existing.get("answer"))
        entry.setdefault("plan", existing.get("plan"))
        entry.setdefault("dataset", existing.get("dataset"))
        entry.setdefault("table", existing.get("table"))
        entry.setdefault("chart", existing.get("chart"))
        entry.setdefault("sql", existing.get("sql"))
        entry.setdefault("createdAt", existing.get("createdAt"))
        entry.setdefault("status", existing.get("status"))
        entry.setdefault("source_message_id", existing.get("source_message_id"))

    if not entry.get("dataset") and data.get("dataset"):
        entry["dataset"] = data.get("dataset")

    if not entry["prompt"]:
        return jsonify({"error": "Prompt is required"}), 400

    entry["status"] = CHAT_FEEDBACK_STATUS_APPROVED if rating == "up" else CHAT_FEEDBACK_STATUS_REJECTED

    canonical_status = None
    try:
        record_feedback(entry)
        source_id = entry.get("source_message_id")
        if source_id and source_id != entry["messageId"]:
            canonical_entry = fetch_feedback_entry_by_id(source_id)
            if canonical_entry:
                canonical_entry["rating"] = rating
                canonical_entry["status"] = entry["status"]
                record_feedback(canonical_entry)
                canonical_status = canonical_entry["status"]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logger.error("Failed to store feedback: %s", exc)
        return jsonify({"error": "Failed to store feedback"}), 500

    return jsonify({
        "status": "stored",
        "messageId": entry["messageId"],
        "feedback_status": entry["status"],
        "canonical_status": canonical_status,
    })

def earnings():
    symbol = (request.args.get("symbol") or "AAPL").upper()
    return jsonify({"symbol": symbol, "items": demo_earnings(symbol)})

def score():
    symbol = (request.args.get("symbol") or "AAPL").upper()
    return jsonify(demo_score(symbol))

def vendors():
    return jsonify({
        "vendors": [
            {"name": "Yahoo Finance", "status": "connected", "notes": "Community libs"},
            {"name": "Alpha Vantage", "status": "optional", "notes": "API key required"},
            {"name": "EDGAR", "status": "optional", "notes": "SEC filings"},
        ]
    })


def scores_ranked():
    try:
        refresh = request.args.get("refresh") == "1"
        sector_filter = (request.args.get("sector") or "").strip().lower()

        rows = scores_load_all(force=refresh)
        items = []
        for r in rows:
            if sector_filter and (r.get("sector") or "").strip().lower() != sector_filter:
                continue
            items.append(r)

        cached_ts = scores_cache_timestamp()
        resp = jsonify({
            "count": len(items),
            "items": items,
            "cached_at": cached_ts.isoformat() if cached_ts else None,
        })
        resp.headers["Cache-Control"] = "public, max-age=120"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def companies_profiles():
    try:
        refresh = request.args.get("refresh") == "1"
        query = (request.args.get("q") or "").strip().lower()

        rows = profiles_load_all(force=refresh)

        if query:
            def matches(r: dict) -> bool:
                sym = (r.get("symbol") or "").lower()
                name = (r.get("companyName") or "").lower()
                sector = (r.get("sector") or "").lower()
                return query in sym or query in name or query in sector

            rows = [r for r in rows if matches(r)]

        cached_ts = profiles_cache_timestamp()
        return jsonify({
            "count": len(rows),
            "items": rows,
            "cached_at": cached_ts.isoformat() if cached_ts else None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def sectors():
    return jsonify({"items": [
        {"name": "Technology", "1w": 1.2, "1m": 4.8, "ytd": 22.4},
        {"name": "Healthcare", "1w": -0.3, "1m": 1.9, "ytd": 6.7},
        {"name": "Financials", "1w": 0.7, "1m": 3.1, "ytd": 12.2},
    ]})
