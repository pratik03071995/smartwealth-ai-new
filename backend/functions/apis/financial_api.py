"""Financial data API integration for real-time stock prices."""
from __future__ import annotations

import os
import requests
import json
from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger("smartwealth.financial_api")

def get_stock_price_yahoo(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Get stock price from Yahoo Finance using their API.
    
    Args:
        symbol: Stock symbol (e.g., 'TSLA', 'AAPL')
    
    Returns:
        Stock price data or None
    """
    try:
        # Yahoo Finance API endpoint
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if 'chart' in data and 'result' in data['chart'] and data['chart']['result']:
            result = data['chart']['result'][0]
            meta = result.get('meta', {})
            
            current_price = meta.get('regularMarketPrice', 0)
            previous_close = meta.get('previousClose', 0)
            change = current_price - previous_close
            change_percent = (change / previous_close * 100) if previous_close else 0
            
            return {
                'symbol': symbol,
                'price': current_price,
                'change': change,
                'change_percent': change_percent,
                'previous_close': previous_close,
                'market_cap': meta.get('marketCap', 0),
                'volume': meta.get('regularMarketVolume', 0)
            }
        
        return None
        
    except Exception as exc:
        logger.error(f"Failed to get stock price for {symbol}: {exc}")
        return None

def get_stock_price_alpha_vantage(symbol: str, api_key: str) -> Optional[Dict[str, Any]]:
    """
    Get stock price from Alpha Vantage API.
    
    Args:
        symbol: Stock symbol
        api_key: Alpha Vantage API key
    
    Returns:
        Stock price data or None
    """
    try:
        url = "https://www.alphavantage.co/query"
        params = {
            'function': 'GLOBAL_QUOTE',
            'symbol': symbol,
            'apikey': api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if 'Global Quote' in data:
            quote = data['Global Quote']
            return {
                'symbol': symbol,
                'price': float(quote.get('05. price', 0)),
                'change': float(quote.get('09. change', 0)),
                'change_percent': float(quote.get('10. change percent', 0).replace('%', '')),
                'previous_close': float(quote.get('08. previous close', 0)),
                'volume': int(quote.get('06. volume', 0))
            }
        
        return None
        
    except Exception as exc:
        logger.error(f"Failed to get stock price from Alpha Vantage for {symbol}: {exc}")
        return None

def get_stock_price_fallback(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Fallback method to get stock price using web scraping.
    
    Args:
        symbol: Stock symbol
    
    Returns:
        Stock price data or None
    """
    try:
        # Try to get price from a simple web request
        url = f"https://finance.yahoo.com/quote/{symbol}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Look for price in the HTML
        import re
        price_match = re.search(r'"regularMarketPrice":{"raw":(\d+\.?\d*)', response.text)
        if price_match:
            price = float(price_match.group(1))
            return {
                'symbol': symbol,
                'price': price,
                'change': 0,
                'change_percent': 0,
                'previous_close': price,
                'volume': 0
            }
        
        return None
        
    except Exception as exc:
        logger.error(f"Fallback method failed for {symbol}: {exc}")
        return None

def get_stock_price(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Get stock price using the best available method.
    
    Args:
        symbol: Stock symbol
    
    Returns:
        Stock price data or None
    """
    # Try Yahoo Finance API first
    data = get_stock_price_yahoo(symbol)
    if data:
        return data
    
    # Try Alpha Vantage if API key is available
    api_key = os.getenv('ALPHA_VANTAGE_API_KEY')
    if api_key:
        data = get_stock_price_alpha_vantage(symbol, api_key)
        if data:
            return data
    
    # Fallback to web scraping
    return get_stock_price_fallback(symbol)

def format_stock_price_response(data: Dict[str, Any]) -> str:
    """
    Format stock price data for chat response in plain English.
    
    Args:
        data: Stock price data
    
    Returns:
        Formatted response string in plain English
    """
    if not data:
        return "I couldn't get the current stock price right now."
    
    symbol = data.get('symbol', '')
    price = data.get('price', 0)
    change = data.get('change', 0)
    change_percent = data.get('change_percent', 0)
    
    # Format in plain English
    if change > 0:
        response = f"{symbol} is currently trading at ${price:.2f}, up {change_percent:.2f}% today."
    elif change < 0:
        response = f"{symbol} is currently trading at ${price:.2f}, down {abs(change_percent):.2f}% today."
    else:
        response = f"{symbol} is currently trading at ${price:.2f}, unchanged today."
    
    return response
