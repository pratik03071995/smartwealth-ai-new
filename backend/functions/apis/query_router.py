"""Query routing system to determine database vs web search."""
from __future__ import annotations

import logging
from typing import Any, Dict, Tuple

logger = logging.getLogger("smartwealth.query_router")

def analyze_query_intent(user_prompt: str) -> Dict[str, Any]:
    """
    Analyze user query to determine the best search strategy.
    
    Args:
        user_prompt: User's question
    
    Returns:
        Analysis result with search strategy
    """
    prompt_lower = user_prompt.lower()
    
    # Stock price keywords
    stock_price_keywords = [
        'stock price', 'current price', 'price', 'quote', 'trading price',
        'market price', 'share price', 'stock value'
    ]
    
    # Real-time companies
    real_time_companies = [
        'tesla', 'apple', 'microsoft', 'google', 'amazon', 'meta', 'nvidia',
        'netflix', 'adobe', 'salesforce', 'oracle', 'intel', 'ibm', 'cisco'
    ]
    
    # Database keywords
    database_keywords = [
        'sector', 'industry', 'market cap', 'earnings', 'revenue', 'profit',
        'fundamentals', 'valuation', 'score', 'rank', 'analysis', 'compare',
        'top companies', 'best performers', 'sector analysis'
    ]
    
    # News keywords
    news_keywords = [
        'news', 'latest', 'recent', 'today', 'announcement', 'update',
        'breaking', 'reports', 'plans', 'launches'
    ]
    
    if any(keyword in prompt_lower for keyword in stock_price_keywords):
        return {
            'strategy': 'web_search',
            'reason': 'stock_price_query',
            'priority': 'real_time_data',
            'search_type': 'financial_api'
        }
    
    if any(company in prompt_lower for company in real_time_companies):
        if any(keyword in prompt_lower for keyword in ['price', 'stock', 'quote', 'trading']):
            return {
                'strategy': 'web_search',
                'reason': 'company_real_time_query',
                'priority': 'real_time_data',
                'search_type': 'financial_api'
            }
    
    if any(keyword in prompt_lower for keyword in news_keywords):
        return {
            'strategy': 'web_search',
            'reason': 'news_query',
            'priority': 'latest_information',
            'search_type': 'web_search'
        }
    
    if any(keyword in prompt_lower for keyword in database_keywords):
        return {
            'strategy': 'database_search',
            'reason': 'analytical_query',
            'priority': 'structured_data',
            'search_type': 'databricks'
        }
    
    return {
        'strategy': 'database_search',
        'reason': 'general_query',
        'priority': 'structured_data',
        'search_type': 'databricks'
    }

def route_query(user_prompt: str) -> Tuple[str, Dict[str, Any]]:
    """
    Route query to appropriate handler.
    
    Args:
        user_prompt: User's question
    
    Returns:
        Tuple of (strategy, analysis)
    """
    analysis = analyze_query_intent(user_prompt)
    strategy = analysis['strategy']
    
    logger.info(f"Query routing: '{user_prompt}' -> {strategy} ({analysis['reason']})")
    
    return strategy, analysis

def should_use_web_search(user_prompt: str) -> bool:
    """Check if query should use web search."""
    strategy, _ = route_query(user_prompt)
    return strategy == 'web_search'

def should_use_database_search(user_prompt: str) -> bool:
    """Check if query should use database search."""
    strategy, _ = route_query(user_prompt)
    return strategy == 'database_search'
