from __future__ import annotations

import re
from typing import List

# Canonical mapping of company names / aliases to tickers used in the dataset.
_NAME_TO_TICKER = {
    "APPLE": "AAPL",
    "AAPL": "AAPL",
    "AMAZON": "AMZN",
    "AMZN": "AMZN",
    "TESLA": "TSLA",
    "TSLA": "TSLA",
    "META": "META",
    "FACEBOOK": "META",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "GOOGL": "GOOGL",
    "GOOG": "GOOGL",
    "MICROSOFT": "MSFT",
    "MSFT": "MSFT",
    "NETFLIX": "NFLX",
    "NFLX": "NFLX",
    "NVIDIA": "NVDA",
    "NVDA": "NVDA",
    "SNOWFLAKE": "SNOW",
    "SNOW": "SNOW",
    "ADOBE": "ADBE",
    "ADBE": "ADBE",
}

_STOPWORDS = {
    "AND",
    "OR",
    "VS",
    "VERSUS",
    "STOCK",
    "PRICE",
    "FOR",
    "LAST",
    "YEAR",
    "MONTH",
    "WEEK",
    "COMPARE",
    "COMPARISON",
    "WITH",
    "AGAINST",
    "IN",
    "THE",
    "OF",
    "SHOW",
    "PLEASE",
    "CHART",
    "GRAPH",
    "PERFORMANCE",
    "OVER",
    "PAST",
    "YEARS",
    "MONTHS",
    "DAYS",
    "TODAY",
    "CURRENT",
    "PRICE",
    "WHAT",
    "IF",
    "INVEST",
    "INVESTED",
}

_TICKERS = {ticker for ticker in _NAME_TO_TICKER.values()}


def extract_symbols_from_prompt(prompt: str) -> List[str]:
    """Return ordered unique list of symbols inferred from the natural-language prompt."""
    if not prompt:
        return []

    tokens = re.findall(r"[A-Za-z0-9&']+", prompt)
    seen = set()
    resolved: List[str] = []
    for token in tokens:
        upper = token.upper()
        if len(upper) == 1:
            continue
        if upper in _STOPWORDS:
            continue
        # Handle possessive forms like "Tesla's"
        if upper.endswith("'S"):
            upper = upper[:-2]
        mapped = _NAME_TO_TICKER.get(upper)
        if mapped is None and 1 < len(upper) <= 5 and upper.isalpha():
            if upper in _NAME_TO_TICKER:
                mapped = _NAME_TO_TICKER[upper]
            elif upper in _TICKERS:
                mapped = upper
        if mapped and mapped not in seen:
            seen.add(mapped)
            resolved.append(mapped)
    return resolved
