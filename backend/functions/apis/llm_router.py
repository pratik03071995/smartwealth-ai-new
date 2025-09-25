"""LLM-based query routing using Ollama for intelligent decision making."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Tuple

# Import moved to avoid circular dependency

logger = logging.getLogger("smartwealth.llm_router")

def route_query_with_llm(user_prompt: str) -> Tuple[str, Dict[str, Any]]:
    """
    Use LLM to intelligently route queries between database and web search.
    
    Args:
        user_prompt: User's question
    
    Returns:
        Tuple of (strategy, analysis)
    """
    analysis_prompt = f"""
    Analyze this user query and determine the best search strategy:

    User Query: "{user_prompt}"

    CRITICAL RULES - READ CAREFULLY:
    1. If the query asks for STOCK PRICE, CURRENT PRICE, or REAL-TIME QUOTES → use "web_search" with "financial_api"
    2. If the query asks for NEWS, LATEST UPDATES, or RECENT INFORMATION → use "web_search" with "web_search"  
    3. If the query asks for ANALYTICAL DATA, SECTOR ANALYSIS, COMPARISONS, or DATABASE QUERIES → use "database_search"
    4. If the query asks for FACTUAL INFORMATION (CEO, company info, general facts, "who is", "what is") → use "web_search" with "web_search"
    5. For stock price queries ONLY, extract the ticker symbol if mentioned
    6. DO NOT use financial_api for factual questions about companies

    Examples:
    - "What is the stock price of AAPL?" → web_search, financial_api, symbol: AAPL
    - "AAL stock price" → web_search, financial_api, symbol: AAL  
    - "Latest news about Tesla" → web_search, web_search
    - "Who is the CEO of Amazon?" → web_search, web_search, intent: factual
    - "What is Apple's headquarters?" → web_search, web_search, intent: factual
    - "Compare Apple and Microsoft earnings" → database_search
    - "Top performing sectors" → database_search

    Respond with JSON only:
    {{
        "strategy": "web_search" or "database_search",
        "reason": "brief explanation",
        "search_type": "financial_api" or "web_search" or "databricks",
        "intent": "stock_price" or "news" or "analysis" or "comparison" or "factual",
        "symbol": "ticker if extracted" or null,
        "confidence": 0.0-1.0
    }}
    """

    try:
        messages = [
            {"role": "system", "content": "You are an expert query router. Analyze user queries and determine the best search strategy. Always respond with valid JSON only."},
            {"role": "user", "content": analysis_prompt}
        ]
        
        # Import here to avoid circular dependency
        from .chat import _llm_chat
        llm_response = _llm_chat(messages)
        
        # Parse LLM response
        try:
            analysis = json.loads(llm_response.strip())
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse LLM response as JSON: {llm_response}")
            # Fallback to heuristic routing
            return _fallback_heuristic_routing(user_prompt)
        
        # Validate required fields
        required_fields = ['strategy', 'reason', 'search_type', 'intent']
        if not all(field in analysis for field in required_fields):
            logger.warning(f"LLM response missing required fields: {analysis}")
            return _fallback_heuristic_routing(user_prompt)
        
        # Ensure strategy is valid
        if analysis['strategy'] not in ['web_search', 'database_search']:
            logger.warning(f"Invalid strategy from LLM: {analysis['strategy']}")
            return _fallback_heuristic_routing(user_prompt)
        
        logger.info(f"LLM routing: '{user_prompt}' -> {analysis['strategy']} ({analysis['reason']})")
        logger.info(f"LLM analysis details: {analysis}")
        return analysis['strategy'], analysis
        
    except Exception as exc:
        logger.error(f"LLM routing failed: {exc}")
        return _fallback_heuristic_routing(user_prompt)

def _fallback_heuristic_routing(user_prompt: str) -> Tuple[str, Dict[str, Any]]:
    """Fallback to heuristic routing when LLM fails."""
    prompt_lower = user_prompt.lower()
    
    # Stock price keywords
    stock_price_keywords = [
        'stock price', 'current price', 'price', 'quote', 'trading price',
        'market price', 'share price', 'stock value'
    ]
    
    # News keywords  
    news_keywords = [
        'news', 'latest', 'recent', 'today', 'announcement', 'update',
        'breaking', 'reports', 'plans', 'launches'
    ]
    
    if any(keyword in prompt_lower for keyword in stock_price_keywords):
        return 'web_search', {
            'strategy': 'web_search',
            'reason': 'stock_price_query',
            'search_type': 'financial_api',
            'intent': 'stock_price',
            'confidence': 0.8
        }
    
    if any(keyword in prompt_lower for keyword in news_keywords):
        return 'web_search', {
            'strategy': 'web_search', 
            'reason': 'news_query',
            'search_type': 'web_search',
            'intent': 'news',
            'confidence': 0.8
        }
    
    # Default to database search
    return 'database_search', {
        'strategy': 'database_search',
        'reason': 'analytical_query',
        'search_type': 'databricks', 
        'intent': 'analysis',
        'confidence': 0.6
    }