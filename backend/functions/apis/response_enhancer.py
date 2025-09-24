"""Response enhancement using Ollama for natural language generation."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from .chat import _llm_chat

logger = logging.getLogger("smartwealth.response_enhancer")

def enhance_database_response_with_ollama(response: str, user_prompt: str) -> str:
    """
    Enhance database response using Ollama for more natural language.
    
    Args:
        response: Original database response
        user_prompt: User's original question
    
    Returns:
        Enhanced response in natural language
    """
    try:
        enhancement_prompt = f"""
        The user asked: "{user_prompt}"
        
        Here's the data response: {response}
        
        Please rewrite this response in a more conversational, natural way that directly answers the user's question.
        Keep it concise but informative. Use plain English and avoid technical jargon.
        Focus on what the user actually asked for.
        """
        
        messages = [
            {"role": "system", "content": "You are a helpful financial assistant. Rewrite technical data responses into natural, conversational language that directly answers user questions."},
            {"role": "user", "content": enhancement_prompt}
        ]
        
        enhanced_response = _llm_chat(messages)
        logger.info("Enhanced database response with Ollama")
        return enhanced_response
        
    except Exception as exc:
        logger.error(f"Failed to enhance database response: {exc}")
        return response

def enhance_financial_response_with_ollama(stock_data: Dict[str, Any], user_prompt: str) -> str:
    """
    Enhance financial API response using Ollama for better formatting.
    
    Args:
        stock_data: Stock data from financial API
        user_prompt: User's original question
    
    Returns:
        Enhanced response with natural language
    """
    try:
        # Format stock data for LLM
        stock_info = f"""
        Symbol: {stock_data.get('symbol', 'N/A')}
        Price: ${stock_data.get('price', 'N/A')}
        Change: {stock_data.get('change', 'N/A')}
        Change Percent: {stock_data.get('change_percent', 'N/A')}
        Volume: {stock_data.get('volume', 'N/A')}
        Market Cap: {stock_data.get('market_cap', 'N/A')}
        """
        
        enhancement_prompt = f"""
        The user asked: "{user_prompt}"
        
        Here's the stock data: {stock_info}
        
        Please provide a clean, one-line response about the stock price that directly answers the user's question.
        Use plain English and be concise.
        """
        
        messages = [
            {"role": "system", "content": "You are a financial assistant. Provide clean, concise stock price information in plain English."},
            {"role": "user", "content": enhancement_prompt}
        ]
        
        enhanced_response = _llm_chat(messages)
        logger.info("Enhanced financial response with Ollama")
        return enhanced_response
        
    except Exception as exc:
        logger.error(f"Failed to enhance financial response: {exc}")
        # Fallback to basic formatting
        return f"{stock_data.get('symbol', 'Stock')} is trading at ${stock_data.get('price', 'N/A')}"

def enhance_web_search_response_with_ollama(search_results: List[Dict[str, Any]], user_prompt: str) -> str:
    """
    Enhance web search results using Ollama for better summarization.
    
    Args:
        search_results: Web search results
        user_prompt: User's original question
    
    Returns:
        Enhanced response with natural language
    """
    try:
        # Format search results for LLM
        results_text = ""
        for i, result in enumerate(search_results[:3], 1):
            results_text += f"{i}. {result.get('title', 'No title')}\n"
            results_text += f"   {result.get('snippet', 'No snippet')}\n\n"
        
        enhancement_prompt = f"""
        The user asked: "{user_prompt}"
        
        Here are the search results:
        {results_text}
        
        Please provide a clean, concise answer based on the most relevant information from these results.
        Focus on directly answering the user's question.
        Use plain English and be informative but brief.
        """
        
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Summarize search results to directly answer user questions in a clean, concise way."},
            {"role": "user", "content": enhancement_prompt}
        ]
        
        enhanced_response = _llm_chat(messages)
        logger.info("Enhanced web search response with Ollama")
        return enhanced_response
        
    except Exception as exc:
        logger.error(f"Failed to enhance web search response: {exc}")
        # Fallback to basic formatting
        if search_results:
            return f"Based on the search results: {search_results[0].get('snippet', 'No information found')}"
        return "I couldn't find relevant information for your query."

def create_conversational_response(data: Any, user_prompt: str, response_type: str = "general") -> str:
    """
    Create conversational responses using Ollama based on data type.
    
    Args:
        data: Response data
        user_prompt: User's question
        response_type: Type of response (stock_price, earnings, news, etc.)
    
    Returns:
        Conversational response
    """
    try:
        if response_type == "stock_price":
            return enhance_financial_response_with_ollama(data, user_prompt)
        elif response_type == "database":
            return enhance_database_response_with_ollama(data, user_prompt)
        elif response_type == "web_search":
            return enhance_web_search_response_with_ollama(data, user_prompt)
        else:
            # Generic enhancement
            enhancement_prompt = f"""
            The user asked: "{user_prompt}"
            
            Here's the response data: {str(data)}
            
            Please provide a clean, conversational answer that directly addresses the user's question.
            Use plain English and be helpful.
            """
            
            messages = [
                {"role": "system", "content": "You are a helpful assistant. Provide clean, conversational responses that directly answer user questions."},
                {"role": "user", "content": enhancement_prompt}
            ]
            
            return _llm_chat(messages)
            
    except Exception as exc:
        logger.error(f"Failed to create conversational response: {exc}")
        return str(data) if data else "I couldn't process that request."