"""Intelligent error handling and recovery for the chatbot."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict
from .chat import _llm_chat # Assuming _llm_chat is accessible

logger = logging.getLogger("smartwealth.error_handler")

def handle_error_gracefully(exc: Exception, user_prompt: str, context: Dict[str, Any]) -> str:
    """
    Handle exceptions gracefully, providing user-friendly and helpful responses.
    Uses LLM to generate context-aware error messages.
    """
    error_type = type(exc).__name__
    error_message = str(exc)
    
    logger.error(f"Chatbot error: {error_type} - {error_message}. User prompt: '{user_prompt}'")

    # Use LLM to generate a helpful, non-technical error message
    llm_prompt = f"""
    A user encountered an error while asking: "{user_prompt}"
    The technical error was: {error_type}: {error_message}
    Current conversation context: {json.dumps(context)}

    Please generate a friendly, empathetic, and helpful response to the user.
    Avoid technical jargon. Suggest next steps or rephrasing the query.
    Keep it concise.
    """

    messages = [
        {"role": "system", "content": "You are a helpful and empathetic AI assistant. When an error occurs, provide a friendly, non-technical explanation and suggest how the user can proceed."},
        {"role": "user", "content": llm_prompt}
    ]

    try:
        llm_response = _llm_chat(messages)
        return llm_response
    except Exception as llm_exc:
        logger.error(f"Failed to generate LLM-based error response: {llm_exc}")
        # Fallback to a generic error message
        return (
            "Oops! I ran into a bit of a snag trying to answer that. "
            "It might be a temporary issue, or perhaps I misunderstood. "
            "Could you please try rephrasing your question or asking something else?"
        )

def categorize_error(exc: Exception) -> str:
    """Categorize different types of errors for analytics and specific handling."""
    if isinstance(exc, TimeoutError) or "timeout" in str(exc).lower():
        return "TimeoutError"
    if "databricks" in str(exc).lower() or "sql" in str(exc).lower():
        return "DatabaseError"
    if "ollama" in str(exc).lower() or "llm" in str(exc).lower():
        return "LLMError"
    if "api" in str(exc).lower() or "requests" in str(exc).lower():
        return "APIError"
    if isinstance(exc, ValueError) or isinstance(exc, TypeError):
        return "InputValidationError"
    return "GeneralError"
