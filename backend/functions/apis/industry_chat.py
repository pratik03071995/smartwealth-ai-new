"""Comprehensive industry-standard chatbot implementation."""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, Optional

from flask import request, jsonify

from .analytics import chatbot_analytics
from .chat import ( # Import necessary functions from original chat for data fetching/processing
    ChatPlan, _heuristic_plan_data, _augment_plan_with_prompt, _fetch_rows,
    _summarize_answer, _render_sql_with_params, _build_table_payload,
    _build_chart_payload, _prepare_preview_rows, _generate_followups,
    logger, CHAT_FEEDBACK_STATUS_PENDING, reset_llm_provider,
    get_llm_source_label, get_last_llm_provider, build_source_label
)
from .conversation_manager import conversation_manager
from .error_handler import handle_error_gracefully, categorize_error
from .feedback import log_chat_interaction
from .financial_api import get_stock_price
from .llm_router import route_query_with_llm as route_query # Use LLM-based router
from .personalization import personalization_engine
from .response_enhancer import enhance_database_response_with_ollama, enhance_financial_response_with_ollama
from .security import rate_limiter, sanitize_input
from .translation import detect_language, translate_text, get_localized_response
from .web_search import search_web, format_search_results, _extract_symbol_from_query, SEARCH_PROVIDER


def finalize_response_industry(
    resp: dict[str, Any],
    *,
    user_id: str,
    session_id: str,
    user_prompt: str,
    strategy: str,
    intent: str,
    data_source: str,
    latency_ms: float,
    status: str = CHAT_FEEDBACK_STATUS_PENDING,
    table_payload: Optional[dict[str, Any]] = None,
    chart_payload: Optional[dict[str, Any]] = None,
    sql_raw: Optional[str] = None,
    match_score: Optional[float] = None,
    followups: Optional[list[str]] = None,
    error_type: Optional[str] = None,
) -> dict[str, Any]:
    """Finalize chat response with logging, analytics, and personalization updates."""
    message_id = resp.get("messageId") or str(uuid.uuid4())
    resp["messageId"] = message_id
    resp["status"] = status
    resp.setdefault("data_source", data_source)

    table_data = table_payload if table_payload is not None else resp.get("table")
    chart_data = chart_payload if chart_payload is not None else resp.get("chart")
    sql_text = sql_raw if sql_raw is not None else resp.get("sql")

    llm_label = get_llm_source_label()
    resp.setdefault("llmSource", llm_label)
    resp.setdefault("llmSourceRaw", get_last_llm_provider())
    resp.setdefault("search_provider", resp.get("search_provider"))
    resp["sourceLabel"] = build_source_label(resp.get("data_source"), resp.get("search_provider"), llm_label)

    if followups is None:
        followups = resp.get("followups") if isinstance(resp.get("followups"), list) else None
    
    # Log chat interaction for feedback
    log_chat_interaction(
        message_id=message_id,
        prompt=user_prompt,
        answer=resp.get("reply"),
        plan=resp.get("plan"),
        dataset=resp.get("dataset"),
        table_payload=table_data,
        chart_payload=chart_data,
        sql=sql_text,
        latency_ms=latency_ms,
        status=status,
        source_message_id=None,
        match_score=match_score,
        followups=followups,
    )
    
    # Update analytics
    chatbot_analytics.log_query(
        user_id=user_id,
        session_id=session_id,
        prompt=user_prompt,
        response=resp.get("reply", ""),
        strategy=strategy,
        intent=intent,
        data_source=data_source,
        latency_ms=latency_ms,
        status=status,
        error_type=error_type,
    )
    
    # Update conversation session
    session = conversation_manager.get_session(session_id, user_id)
    session.add_message("assistant", resp.get("reply", ""), is_user=False)
    session.update_context("last_strategy", strategy)
    session.update_context("last_intent", intent)
    
    # Update user preferences based on interaction
    user_profile = personalization_engine.get_user_profile(user_id)
    user_profile.add_interaction(user_prompt, resp.get("reply", ""), intent, data_source)
    user_profile.learn_from_interactions()
    personalization_engine.save_user_profile(user_profile)
    
    return resp


def handle_chat_industry(user_prompt: str, user_id: str = "anonymous", session_id: str = None) -> Dict[str, Any]:
    """
    Industry-standard chat handler with comprehensive features.
    
    Args:
        user_prompt: User's question
        user_id: User identifier for personalization
        session_id: Session identifier for conversation tracking
    
    Returns:
        Chat response with enhanced features
    """
    if not session_id:
        session_id = str(uuid.uuid4())

    start_time = time.time()

    try:
        reset_llm_provider()
        # Security: Rate limiting and input sanitization
        client_ip = request.remote_addr if request else "unknown"
        if not rate_limiter.check_request(client_ip):
            return {
                "reply": "Rate limit exceeded. Please wait a moment before making another request.",
                "status": "rate_limited",
                "messageId": str(uuid.uuid4())
            }
        
        # Sanitize input
        sanitized_prompt = sanitize_input(user_prompt)
        
        # Language detection and translation
        detected_language = detect_language(sanitized_prompt)
        if detected_language != "en":
            # Translate to English for processing
            sanitized_prompt = translate_text(sanitized_prompt, "en", detected_language)
        
        # Get conversation session
        session = conversation_manager.get_session(session_id, user_id)
        session.add_message("user", sanitized_prompt, is_user=True)
        
        # Route query using LLM
        strategy, analysis = route_query(sanitized_prompt)
        
        # Handle based on strategy
        if strategy == 'web_search':
            response = _handle_web_search_industry(sanitized_prompt, analysis, user_id, session_id)
        else:
            response = _handle_database_industry(sanitized_prompt, analysis, user_id, session_id)
        
        # Calculate latency
        latency_ms = (time.time() - start_time) * 1000
        
        # Finalize response with all enhancements
        return finalize_response_industry(
            response,
            user_id=user_id,
            session_id=session_id,
            user_prompt=sanitized_prompt,
            strategy=strategy,
            intent=analysis.get('intent', 'general'),
            data_source=response.get('data_source', 'unknown'),
            latency_ms=latency_ms,
            table_payload=response.get('table'),
            chart_payload=response.get('chart'),
            sql_raw=response.get('sql'),
            followups=response.get('followups')
        )
        
    except Exception as exc:
        error_type = categorize_error(exc)
        latency_ms = (time.time() - start_time) * 1000
        
        # Generate graceful error response
        context = {
            "user_id": user_id,
            "session_id": session_id,
            "strategy": "error_handling"
        }
        
        error_response = handle_error_gracefully(exc, user_prompt, context)
        
        return finalize_response_industry(
            {"reply": error_response, "messageId": str(uuid.uuid4())},
            user_id=user_id,
            session_id=session_id,
            user_prompt=user_prompt,
            strategy="error_handling",
            intent="error_recovery",
            data_source="error_handler",
            latency_ms=latency_ms,
            status="error",
            error_type=error_type
        )


def _handle_web_search_industry(user_prompt: str, analysis: Dict[str, Any], user_id: str, session_id: str) -> Dict[str, Any]:
    """Handle web search queries with industry features."""
    message_id = str(uuid.uuid4())
    
    try:
        # Prioritize financial API for stock price queries
        if analysis.get('search_type') == 'financial_api' and analysis.get('symbol'):
            symbol = analysis['symbol']
            stock_data = get_stock_price(symbol)
            if stock_data:
                # Use the configured LLM to enhance the response
                response = enhance_financial_response_with_ollama(stock_data, user_prompt)
                return {
                    "reply": response,
                    "web_search": True,
                    "data_source": "financial_api_enhanced",
                    "search_provider": "Financial API",
                    "messageId": message_id,
                }
        
        # Fallback to general web search
        enhanced_query = enhance_query_with_context(user_prompt, analysis)
        web_search_results = search_web(enhanced_query, num_results=5, intent=analysis.get('search_type', 'general'))
        provider_label = None
        if web_search_results:
            provider_label = web_search_results[0].get("source")
        if not provider_label:
            provider_label = SEARCH_PROVIDER.title()
        
        if web_search_results:
            web_response = format_search_results(web_search_results, query=user_prompt)
            return {
                "reply": web_response,
                "web_search": True,
                "data_source": "web_search",
                "search_provider": provider_label,
                "messageId": message_id,
            }
        else:
            return {
                "reply": "I couldn't find any relevant information on the web for that query.",
                "web_search": True,
                "data_source": "web_search",
                "search_provider": provider_label,
                "messageId": message_id,
            }
    except Exception as exc:
        logger.error(f"Web search handler failed: {exc}")
        return {
            "reply": "I ran into an unexpected issue answering that. Please try again shortly.",
            "data_source": "error",
            "search_provider": provider_label if 'provider_label' in locals() else SEARCH_PROVIDER.title(),
            "messageId": message_id,
        }


def _handle_database_industry(user_prompt: str, analysis: Dict[str, Any], user_id: str, session_id: str) -> Dict[str, Any]:
    """Handle database queries with industry features."""
    message_id = str(uuid.uuid4())

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
        return {
            "reply": "I ran into an issue reaching Databricks. Please try again in a minute.",
            "messageId": message_id,
            "plan": plan_snapshot,
        }

    if not rows:
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
            "messageId": message_id,
            "data_source": "database",
        }
        if empty_followups:
            response["followups"] = empty_followups
        return response

    table_payload = _build_table_payload(plan, rows)
    chart_payload = _build_chart_payload(plan, rows)
    
    summary = _summarize_answer(user_prompt, plan, sql_raw, rows)
    display_sql = _render_sql_with_params(sql_raw, sql_params)
    
    # Enhance database response with the configured LLM for natural language
    summary = enhance_database_response_with_ollama(summary, user_prompt)

    response: dict[str, Any] = {
        "reply": summary,
        "sql": display_sql,
        "sql_raw": sql_raw,
        "plan": plan_snapshot,
        "messageId": message_id,
        "data_source": "database",
    }
    
    if table_payload:
        response["table"] = table_payload
    if chart_payload:
        response["chart"] = chart_payload
    
    followups = _generate_followups(plan, rows, table_payload)
    if followups:
        response["followups"] = followups

    return response


def chat_industry(user_prompt: str) -> dict[str, Any]:
    """Industry-standard chat endpoint."""
    from flask import request, jsonify
    
    try:
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Message is required"}), 400
        
        user_message = data["message"]
        user_id = data.get("user_id", "anonymous")
        session_id = data.get("session_id")
        
        result = handle_chat_industry(user_message, user_id, session_id)
        
        return jsonify(result)
    except Exception as exc:
        logger.error(f"Chat request failed: {exc}")
        return jsonify({"reply": "I ran into an unexpected issue answering that. Please try again shortly."}), 500
