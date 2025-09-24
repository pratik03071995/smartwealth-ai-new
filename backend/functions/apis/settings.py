from __future__ import annotations

import logging
import os

from dotenv import load_dotenv

load_dotenv()

PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(PACKAGE_DIR)

DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID")
DATABRICKS_HTTP_PATH = (
    f"/sql/1.0/warehouses/{DATABRICKS_WAREHOUSE_ID}"
    if DATABRICKS_WAREHOUSE_ID
    else None
)

EARNINGS_TABLE = "workspace.sw_gold.earnings_calendar_new"
VENDOR_TABLE = "workspace.sw_gold.vendor_customer_network"
SCORES_TABLE = os.getenv("SCORES_TABLE", "workspace.sw_gold.scores")
PROFILES_TABLE = os.getenv("PROFILES_TABLE", "workspace.sw_gold.nyse_profiles")
CHAT_FEEDBACK_TABLE = os.getenv(
    "CHAT_FEEDBACK_TABLE", "workspace.sw_gold.chat_feedback_log"
)

CHAT_FEEDBACK_STATUS_APPROVED = "approved"
CHAT_FEEDBACK_STATUS_PENDING = "pending"
CHAT_FEEDBACK_STATUS_REJECTED = "rejected"

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

DATE_CANDIDATES = ["event_date", "earnings_date", "report_date", "calendar_date", "date"]
TIME_CANDIDATES = ["time", "session", "when", "period"]
NAME_CANDIDATES = ["company_name", "name", "company"]
SYMBOL_CANDIDATES = ["symbol", "ticker", "Symbol", "SYMBOL"]

EARNINGS_CACHE_TTL = int(os.getenv("EARNINGS_CACHE_TTL", "900"))
EARNINGS_CACHE_LIMIT = int(os.getenv("EARNINGS_CACHE_LIMIT", "50000"))

VENDOR_CACHE_TTL = int(os.getenv("VENDOR_CACHE_TTL", "3600"))
VENDOR_CACHE_LIMIT = int(os.getenv("VENDOR_CACHE_LIMIT", "200000"))

SCORES_CACHE_TTL = int(os.getenv("SCORES_CACHE_TTL", "600"))
SCORES_CACHE_LIMIT = int(os.getenv("SCORES_CACHE_LIMIT", "200"))

PROFILES_CACHE_TTL = int(os.getenv("PROFILES_CACHE_TTL", "900"))
PROFILES_CACHE_LIMIT = int(os.getenv("PROFILES_CACHE_LIMIT", "5000"))

FEEDBACK_LOG_PATH = os.getenv(
    "CHAT_FEEDBACK_PATH",
    os.path.join(BASE_DIR, "chat_feedback.jsonl"),
)

logger = logging.getLogger("smartwealth.chat")

__all__ = [
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_DEPLOYMENT",
    "AZURE_OPENAI_ENDPOINT",
    "BASE_DIR",
    "CHAT_FEEDBACK_STATUS_APPROVED",
    "CHAT_FEEDBACK_STATUS_PENDING",
    "CHAT_FEEDBACK_STATUS_REJECTED",
    "CHAT_FEEDBACK_TABLE",
    "DATE_CANDIDATES",
    "DATABRICKS_HOST",
    "DATABRICKS_HTTP_PATH",
    "DATABRICKS_TOKEN",
    "DATABRICKS_WAREHOUSE_ID",
    "EARNINGS_CACHE_LIMIT",
    "EARNINGS_CACHE_TTL",
    "EARNINGS_TABLE",
    "FEEDBACK_LOG_PATH",
    "LLM_MODE",
    "LLM_TEMPERATURE",
    "MOCK_DATA_PATHS",
    "OLLAMA_BASE_URL",
    "OLLAMA_FALLBACK_BASE_URL",
    "OLLAMA_MODEL",
    "OLLAMA_TIMEOUT",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "PROFILES_CACHE_LIMIT",
    "PROFILES_CACHE_TTL",
    "PROFILES_TABLE",
    "SCORES_CACHE_LIMIT",
    "SCORES_CACHE_TTL",
    "SCORES_TABLE",
    "SYMBOL_CANDIDATES",
    "TIME_CANDIDATES",
    "VENDOR_CACHE_LIMIT",
    "VENDOR_CACHE_TTL",
    "VENDOR_TABLE",
    "logger",
]
