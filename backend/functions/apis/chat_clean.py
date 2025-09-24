"""Clean chat handler with clear routing logic."""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional
from .llm_router import route_query_with_llm as route_query
from .chat import (
    ChatPlan, _heuristic_plan_data, _augment_plan_with_prompt, _fetch_rows,
    _summarize_answer, _render_sql_with_params, _build_table_payload,
    _build_chart_payload, _prepare_preview_rows, _generate_followups,
    logger, CHAT_FEEDBACK_STATUS_PENDING
)
from .feedback import log_chat_interaction

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
    """Finalize chat response with logging."""
    message_id = resp.get("messageId") or str(uuid.uuid4())
    resp["messageId"] = message_id
    resp["status"] = status
    
    table_data = table_payload if table_payload is not None else resp.get("table")
    chart_data = chart_payload if chart_payload is not None else resp.get("chart")
    sql_text = resp.get("sql") or resp.get("sql_raw")
    latency_ms = resp.get("latencyMs")
    
    if followups is None:
        followups = resp.get("followups") if isinstance(resp.get("followups"), list) else None
    
    log_chat_interaction(
        message_id=message_id,
        prompt="",  # Will be set by caller
        answer=resp.get("reply"),
        plan=resp.get("plan"),
        dataset=resp.get("dataset"),
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

def handle_chat_clean(user_prompt: str) -> dict[str, Any]:
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

def _handle_web_search_query(user_prompt: str, analysis: Dict[str, Any]) -> dict[str, Any]:
    """
    Handle queries that need web search (real-time data, news, etc.).
    
    Args:
        user_prompt: User's question
        analysis: Query analysis result
    
    Returns:
        Web search response
    """
    try:
        # For stock price queries, use financial API directly
        if analysis.get('search_type') == 'financial_api' or any(keyword in user_prompt.lower() for keyword in ['stock price', 'price', 'current price', 'quote']):
            from .financial_api import get_stock_price, format_stock_price_response
            from .web_search import _extract_symbol_from_query
            from .response_enhancer import enhance_financial_response_with_ollama
            
            symbol = _extract_symbol_from_query(user_prompt)
            if symbol:
                stock_data = get_stock_price(symbol)
                if stock_data:
                    # Use Ollama to enhance the response
                    response = enhance_financial_response_with_ollama(stock_data, user_prompt)
                    return finalize_response({
                        "reply": response,
                        "web_search": True,
                        "data_source": "financial_api_enhanced"
                    })
                else:
                    # If financial API fails, try web search
                    from .web_search import search_web, format_search_results
                    web_results = search_web(f"{symbol} stock price current", num_results=3)
                    if web_results:
                        response = format_search_results(web_results, query=user_prompt)
                        return finalize_response({
                            "reply": response,
                            "web_search": True,
                            "data_source": "web_search"
                        })
                    else:
                        return finalize_response({
                            "reply": f"I couldn't find current stock price information for {symbol}. Please try again or check a financial website.",
                            "web_search": True,
                            "data_source": "error"
                        })
            else:
                # Extract symbol from the query more aggressively
                import re
                # Look for 3-5 letter ticker symbols
                ticker_match = re.search(r'\b([A-Z]{3,5})\b', user_prompt.upper())
                if ticker_match:
                    symbol = ticker_match.group(1)
                    stock_data = get_stock_price(symbol)
                    if stock_data:
                        response = enhance_financial_response_with_ollama(stock_data, user_prompt)
                        return finalize_response({
                            "reply": response,
                            "web_search": True,
                            "data_source": "financial_api_enhanced"
                        })
                
                return finalize_response({
                    "reply": "I couldn't identify a stock symbol in your query. Please specify the ticker symbol (e.g., 'AAPL stock price' or 'Apple stock price').",
                    "web_search": True,
                    "data_source": "error"
                })
        
        # For other web searches, use web search API
        from .web_search import search_web, format_search_results
        
        web_search_results = search_web(user_prompt, num_results=5)
        if web_search_results:
            response = format_search_results(web_search_results, query=user_prompt)
            return finalize_response({
                "reply": response,
                "web_search": True,
                "data_source": "web_search"
            })
        
        # Fallback if web search fails
        return finalize_response({
            "reply": "I couldn't find current information on that topic. Please try again later.",
            "web_search": True
        })
        
    except Exception as exc:
        logger.error(f"Web search failed: {exc}")
        return finalize_response({
            "reply": "I encountered an issue retrieving real-time information. Please try again.",
            "web_search": True
        })

def _handle_database_query(user_prompt: str, analysis: Dict[str, Any]) -> dict[str, Any]:
    """
    Handle queries that need database search (analytical data, comparisons, etc.).
    
    Args:
        user_prompt: User's question
        analysis: Query analysis result
    
    Returns:
        Database response
    """
    # Use heuristic planning for database queries
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
    plan_snapshot = plan.to_dict()

    try:
        rows, sql_raw, sql_params = _fetch_rows(plan)
    except Exception as exc:
        logger.error("Dataset fetch failed: %s", exc)
        return finalize_response({
            "reply": "I ran into an issue accessing the database. Please try again in a minute.",
            "status": "error"
        })

    if not rows:
        return finalize_response({
            "reply": f"I couldn't find matching records in the SmartWealth {plan.dataset} dataset. Try another ticker or adjust the filters.",
            "sql": _render_sql_with_params(sql_raw, sql_params),
            "sql_raw": sql_raw,
            "plan": plan_snapshot,
        })

    # Generate response from database results
    summary = _summarize_answer(user_prompt, plan, sql_raw, rows)
    display_sql = _render_sql_with_params(sql_raw, sql_params)
    
    # Enhance database response with Ollama for natural language
    from .response_enhancer import enhance_database_response_with_ollama
    summary = enhance_database_response_with_ollama(summary, user_prompt)

    table_payload = _build_table_payload(plan, rows)
    chart_payload = _build_chart_payload(plan, rows)
    detail_preview = _prepare_preview_rows(rows, limit=3) if table_payload else None

    response: dict[str, Any] = {
        "reply": summary,
        "sql": display_sql,
        "sql_raw": sql_raw,
        "plan": plan_snapshot,
        "data_source": "database"
    }
    
    if table_payload:
        response["table"] = table_payload
    if detail_preview:
        response["tablePreview"] = detail_preview
    if chart_payload:
        response["chart"] = chart_payload
    
    followups = _generate_followups(plan, rows, table_payload)
    if followups:
        response["followups"] = followups

    return finalize_response(response)

def chat():
    """Chat endpoint using clean routing."""
    from flask import request, jsonify
    
    try:
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Message is required"}), 400
        
        user_message = data["message"]
        result = handle_chat_clean(user_message)
        
        return jsonify(result)
    except Exception as exc:
        logger.error(f"Chat request failed: {exc}")
        return jsonify({"reply": "I ran into an unexpected issue answering that. Please try again shortly."}), 500
