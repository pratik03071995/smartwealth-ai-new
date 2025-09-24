"""Web search service for SmartWealth AI chatbot."""
from __future__ import annotations

import json
import logging
import os
import re
import requests
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus
from .financial_api import get_stock_price, format_stock_price_response

logger = logging.getLogger("smartwealth.web_search")

# Web search configuration
SEARCH_API_KEY = os.getenv("SEARCH_API_KEY")  # You can use Google Custom Search, Bing, or other APIs
SEARCH_ENGINE_ID = os.getenv("SEARCH_ENGINE_ID")  # For Google Custom Search
BING_SEARCH_KEY = os.getenv("BING_SEARCH_KEY")  # For Bing Search API
SEARCH_PROVIDER = os.getenv("SEARCH_PROVIDER", "google")  # google, bing, or serpapi
SERPAPI_KEY = os.getenv("SERPAPI_KEY")  # For SerpAPI

# Search intent detection keywords
SEARCH_INTENT_KEYWORDS = {
    "news": ["news", "latest", "recent", "today", "yesterday", "breaking", "update", "announcement"],
    "market": ["market", "trading", "price", "stock price", "market cap", "valuation", "trading volume"],
    "analysis": ["analysis", "forecast", "prediction", "outlook", "trend", "expert opinion"],
    "events": ["earnings", "conference", "meeting", "event", "call", "webinar", "presentation"],
    "regulatory": ["sec", "filing", "regulation", "compliance", "legal", "lawsuit", "investigation"],
    "industry": ["sector", "industry", "competitor", "peer", "market share", "competition"],
    "financial": ["revenue", "profit", "earnings", "financial results", "quarterly", "annual"],
    "general": ["what is", "who is", "when did", "how does", "explain", "define", "meaning"]
}

def detect_search_intent(query: str) -> Tuple[bool, str, List[str]]:
    """
    Detect if a query requires web search and determine the search intent.
    
    Returns:
        Tuple of (needs_search, intent_type, keywords)
    """
    query_lower = query.lower()
    
    # Check for explicit search indicators
    search_indicators = [
        "latest news", "recent news", "what's happening", "current events",
        "today's", "yesterday's", "breaking news", "market news",
        "stock price", "trading", "market update", "financial news"
    ]
    
    if any(indicator in query_lower for indicator in search_indicators):
        return True, "news", ["news", "latest", "financial"]
    
    # Check for specific intent keywords
    for intent, keywords in SEARCH_INTENT_KEYWORDS.items():
        if any(keyword in query_lower for keyword in keywords):
            return True, intent, keywords
    
    # Check for questions that likely need current information
    question_patterns = [
        r"what (is|are|was|were) .* (now|today|currently|recently)",
        r"how (is|are) .* (doing|performing|trading)",
        r"what (happened|happens) .* (today|yesterday|recently)",
        r"latest .* (news|update|information)",
        r"current .* (status|situation|state)"
    ]
    
    for pattern in question_patterns:
        if re.search(pattern, query_lower):
            return True, "general", ["current", "latest", "recent"]
    
    return False, "", []

def search_web(query: str, num_results: int = 5, intent: str = "general") -> List[Dict[str, Any]]:
    """
    Perform web search and return formatted results.
    
    Args:
        query: Search query
        num_results: Number of results to return
        intent: Search intent for better targeting
    
    Returns:
        List of search results with title, snippet, url, and relevance score
    """
    try:
        if SEARCH_PROVIDER == "google":
            return _search_google(query, num_results)
        elif SEARCH_PROVIDER == "bing":
            return _search_bing(query, num_results)
        elif SEARCH_PROVIDER == "serpapi":
            return _search_serpapi(query, num_results)
        else:
            logger.warning(f"Unknown search provider: {SEARCH_PROVIDER}")
            return []
    except Exception as exc:
        logger.error(f"Web search failed: {exc}")
        return []

def _search_google(query: str, num_results: int) -> List[Dict[str, Any]]:
    """Search using Google Custom Search API."""
    if not SEARCH_API_KEY or not SEARCH_ENGINE_ID:
        logger.warning("Google Custom Search API not configured")
        return []
    
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": SEARCH_API_KEY,
        "cx": SEARCH_ENGINE_ID,
        "q": query,
        "num": min(num_results, 10),  # Google API limit
        "safe": "medium"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for item in data.get("items", []):
            results.append({
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "url": item.get("link", ""),
                "relevance_score": 0.8,  # Default relevance
                "source": "Google"
            })
        
        return results
    except Exception as exc:
        logger.error(f"Google search failed: {exc}")
        return []

def _search_bing(query: str, num_results: int) -> List[Dict[str, Any]]:
    """Search using Bing Search API."""
    if not BING_SEARCH_KEY:
        logger.warning("Bing Search API not configured")
        return []
    
    url = "https://api.bing.microsoft.com/v7.0/search"
    headers = {"Ocp-Apim-Subscription-Key": BING_SEARCH_KEY}
    params = {
        "q": query,
        "count": min(num_results, 50),  # Bing API limit
        "mkt": "en-US",
        "safeSearch": "Moderate"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for item in data.get("webPages", {}).get("value", []):
            results.append({
                "title": item.get("name", ""),
                "snippet": item.get("snippet", ""),
                "url": item.get("url", ""),
                "relevance_score": 0.8,  # Default relevance
                "source": "Bing"
            })
        
        return results
    except Exception as exc:
        logger.error(f"Bing search failed: {exc}")
        return []

def _search_serpapi(query: str, num_results: int) -> List[Dict[str, Any]]:
    """Search using SerpAPI."""
    if not SERPAPI_KEY:
        logger.warning("SerpAPI not configured")
        return []
    
    url = "https://serpapi.com/search"
    params = {
        "api_key": SERPAPI_KEY,
        "q": query,
        "num": min(num_results, 20),
        "engine": "google",
        "safe": "medium"
    }
    
    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for item in data.get("organic_results", []):
            results.append({
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "url": item.get("link", ""),
                "relevance_score": 0.8,  # Default relevance
                "source": "SerpAPI"
            })
        
        return results
    except Exception as exc:
        logger.error(f"SerpAPI search failed: {exc}")
        return []

def extract_stock_price_from_results(results: List[Dict[str, Any]]) -> str:
    """
    Extract actual stock price information from search results.
    
    Args:
        results: List of search results
    
    Returns:
        Formatted stock price information
    """
    if not results:
        return "I couldn't find current stock price information."
    
    # Look for price patterns in snippets
    price_patterns = [
        r'\$(\d+\.?\d*)\s*(?:per share|share|stock)',
        r'(\d+\.?\d*)\s*USD',
        r'Price:\s*\$(\d+\.?\d*)',
        r'Current price:\s*\$(\d+\.?\d*)',
        r'Stock price:\s*\$(\d+\.?\d*)',
        r'(\d+\.?\d*)\s*per share'
    ]
    
    prices = []
    for result in results:
        snippet = result.get("snippet", "").lower()
        title = result.get("title", "").lower()
        text = f"{title} {snippet}"
        
        for pattern in price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    price = float(match)
                    if 1 < price < 10000:  # Reasonable stock price range
                        prices.append(price)
                except ValueError:
                    continue
    
    if prices:
        # Return the most common price or average
        most_common = max(set(prices), key=prices.count)
        return f"**Current Stock Price: ${most_common:.2f}**"
    
    # Fallback to general information
    return "Current stock information is available, but specific price data needs verification from official sources."

def format_search_results(results: List[Dict[str, Any]], max_results: int = 3, query: str = "") -> str:
    """
    Format search results using LLM for intelligent response generation.
    
    Args:
        results: List of search results
        max_results: Maximum number of results to include
        query: Original user query for context
    
    Returns:
        LLM-generated response based on search results
    """
    if not results:
        return "I couldn't find any recent information on that topic."
    
    # Check if this is a stock price query (only for explicit price requests)
    if query:
        query_lower = query.lower()
        if any(keyword in query_lower for keyword in ['stock price', 'current price', 'price', 'trading price', 'share price']):
            # Try to extract stock symbol from query
            symbol = _extract_symbol_from_query(query)
            if symbol:
                # Use financial API for real-time data
                try:
                    stock_data = get_stock_price(symbol)
                    if stock_data:
                        return format_stock_price_response(stock_data)
                except Exception as exc:
                    logger.error(f"Financial API failed: {exc}")
                    # Fall back to LLM-based search results
    
    # Use LLM-based formatting for all cases
    return _format_basic_search_results(results, query)

def _extract_symbol_from_query(query: str) -> Optional[str]:
    """
    Extract stock symbol from query.
    
    Args:
        query: User query
    
    Returns:
        Stock symbol or None
    """
    # Common company name to symbol mapping
    company_to_symbol = {
        'tesla': 'TSLA',
        'apple': 'AAPL',
        'microsoft': 'MSFT',
        'google': 'GOOGL',
        'amazon': 'AMZN',
        'meta': 'META',
        'nvidia': 'NVDA',
        'netflix': 'NFLX',
        'adobe': 'ADBE',
        'salesforce': 'CRM',
        'oracle': 'ORCL',
        'intel': 'INTC',
        'ibm': 'IBM',
        'cisco': 'CSCO',
        'qualcomm': 'QCOM',
        'american airlines': 'AAL',
        'aal': 'AAL',
        'boeing': 'BA',
        'delta': 'DAL',
        'united': 'UAL',
        'southwest': 'LUV'
    }
    
    query_lower = query.lower()
    
    # Check for company names first
    for company, symbol in company_to_symbol.items():
        if company in query_lower:
            return symbol
    
    # Check for ticker symbols (3-5 uppercase letters)
    import re
    ticker_match = re.search(r'\b([A-Z]{3,5})\b', query.upper())
    if ticker_match:
        return ticker_match.group(1)
    
    return None

def _format_basic_search_results(results: List[Dict[str, Any]], query: str) -> str:
    """
    Format search results using LLM for intelligent response generation.
    
    Args:
        results: List of search results
        query: Original user query
    
    Returns:
        LLM-generated response based on search results
    """
    if not results:
        return "I couldn't find any recent information on that topic."
    
    # Prepare search results for LLM processing
    search_context = []
    for i, result in enumerate(results[:3], 1):
        title = result.get("title", "No title")
        snippet = result.get("snippet", "No description")
        url = result.get("url", "")
        
        search_context.append(f"Result {i}: {title}\n{snippet}\nURL: {url}\n")
    
    # Create LLM prompt for intelligent response generation
    llm_prompt = f"""
    Based on the following search results, provide a direct, accurate answer to the user's question: "{query}"

    Search Results:
    {''.join(search_context)}

    Instructions:
    1. ALWAYS start your response with "Based on the search results"
    2. Analyze the search results to find the most relevant information
    3. Provide a direct, concise answer that directly addresses the user's question
    4. If the question asks for a specific fact (like CEO name, location, etc.), extract that specific information
    5. Keep the response clean and professional
    6. If you cannot find a direct answer, say "Based on the search results, I couldn't find a specific answer to your question."

    Answer:
    """
    
    try:
        # Import LLM function locally to avoid circular imports
        from .chat import _llm_chat
        
        messages = [
            {"role": "system", "content": "You are a helpful assistant that provides direct, accurate answers based on search results. Always be concise and directly answer the user's question."},
            {"role": "user", "content": llm_prompt}
        ]
        
        llm_response = _llm_chat(messages)
        return llm_response.strip()
        
    except Exception as exc:
        # Fallback to basic formatting if LLM fails
        first_result = results[0]
        snippet = first_result.get("snippet", "")
        if snippet and len(snippet) > 50:
            if len(snippet) > 200:
                snippet = snippet[:200] + "..."
            return snippet
        
        return "I found some information but couldn't provide a direct answer to your question."

def enhance_query_with_context(query: str, context: Dict[str, Any]) -> str:
    """
    Enhance search query with additional context for better results.
    
    Args:
        query: Original query
        context: Additional context (company names, tickers, etc.)
    
    Returns:
        Enhanced query string
    """
    enhanced_parts = [query]
    
    # Add company context if available
    if context.get("tickers"):
        tickers = ", ".join(context["tickers"])
        enhanced_parts.append(f"({tickers})")
    
    # Add financial context
    if context.get("intent") == "financial":
        enhanced_parts.append("financial news stock market")
    elif context.get("intent") == "news":
        enhanced_parts.append("latest news today")
    
    return " ".join(enhanced_parts)

def should_use_web_search(query: str, database_results: List[Dict[str, Any]]) -> bool:
    """
    Determine if web search should be used based on query and database results.
    
    Args:
        query: User query
        database_results: Results from database query
    
    Returns:
        True if web search should be used
    """
    # Always use web search for news and current events
    needs_search, intent, _ = detect_search_intent(query)
    if needs_search:
        return True
    
    # Use web search if database results are insufficient
    if not database_results or len(database_results) < 2:
        return True
    
    # Use web search for questions about current events
    current_event_indicators = [
        "today", "yesterday", "recent", "latest", "breaking", "news", "update"
    ]
    if any(indicator in query.lower() for indicator in current_event_indicators):
        return True
    
    return False

def combine_search_and_database_results(
    search_results: List[Dict[str, Any]], 
    database_results: List[Dict[str, Any]],
    query: str
) -> str:
    """
    Combine web search results with database results for comprehensive response.
    
    Args:
        search_results: Web search results
        database_results: Database query results
        query: Original user query
    
    Returns:
        Combined response string
    """
    response_parts = []
    
    # Add database insights if available
    if database_results:
        response_parts.append("**Database Insights:**")
        # Include key database findings here
        response_parts.append("Based on our financial database, here are the key insights...")
    
    # Add web search results
    if search_results:
        response_parts.append("\n**Latest Information:**")
        response_parts.append(format_search_results(search_results))
    
    # Add disclaimer
    response_parts.append(
        "\n*Note: Web search results are for informational purposes only. "
        "Please verify information from official sources before making investment decisions.*"
    )
    
    return "\n".join(response_parts)
