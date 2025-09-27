"""Clean chat handler with clear routing logic."""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional, Callable
from .llm_router import route_query_with_llm as route_query
from .chat import (
    ChatPlan, _heuristic_plan_data, _augment_plan_with_prompt, _fetch_rows,
    _summarize_answer, _render_sql_with_params, _build_table_payload,
    _build_chart_payload, _prepare_preview_rows, _generate_followups,
    logger, CHAT_FEEDBACK_STATUS_PENDING, reset_llm_provider,
    get_llm_source_label, get_last_llm_provider, build_source_label
)
import json
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Thread

from .feedback import log_chat_interaction
from .web_search import SEARCH_PROVIDER


NETWORK_POOL = ThreadPoolExecutor(max_workers=4)


def _truncate(text: str, limit: int = 180) -> str:
    cleaned = (text or "").replace("\n", " ").strip()
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 1]}…"

def finalize_response(
    resp: dict[str, Any],
    *,
    status: str = CHAT_FEEDBACK_STATUS_PENDING,
    table_payload: Optional[dict[str, Any]] = None,
    chart_payload: Optional[dict[str, Any]] = None,
    source_message_id: Optional[str] = None,
    match_score: Optional[float] = None,
    followups: Optional[list[str]] = None,
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Finalize chat response with logging."""
    message_id = resp.get("messageId") or str(uuid.uuid4())
    resp["messageId"] = message_id
    resp["status"] = status
    if request_id:
        resp.setdefault("requestId", request_id)
    else:
        resp.setdefault("requestId", message_id)
    
    table_data = table_payload if table_payload is not None else resp.get("table")
    chart_data = chart_payload if chart_payload is not None else resp.get("chart")
    sql_text = resp.get("sql") or resp.get("sql_raw")
    latency_ms = resp.get("latencyMs")

    llm_label = get_llm_source_label()
    resp.setdefault("llmSource", llm_label)
    resp.setdefault("llmSourceRaw", get_last_llm_provider())
    resp["sourceLabel"] = build_source_label(resp.get("data_source"), resp.get("search_provider"), llm_label)
    
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
    logger.info(
        "chat.finalized id=%s message_id=%s status=%s data_source=%s llm=%s provider=%s latency_ms=%s",
        request_id or message_id,
        message_id,
        status,
        resp.get("data_source"),
        resp.get("llmSource"),
        resp.get("llmSourceRaw"),
        latency_ms,
    )
    return resp

def handle_chat_clean(
    user_prompt: str,
    *,
    stream_handler: Optional[Callable[[str], None]] = None,
) -> dict[str, Any]:
    """
    Handle chat with clear routing: Database vs Web Search.
    
    Args:
        user_prompt: User's question
    
    Returns:
        Chat response
    """
    request_id = str(uuid.uuid4())
    safe_prompt = _truncate(user_prompt, 240)
    logger.info(
        "chat.request.start id=%s prompt_len=%s prompt=%s",
        request_id,
        len(user_prompt or ""),
        safe_prompt,
    )

    reset_llm_provider()
    try:
        strategy, analysis = route_query(user_prompt)
        logger.info(
            "chat.request.routed id=%s strategy=%s analysis=%s",
            request_id,
            strategy,
            analysis,
        )

        if strategy == 'web_search':
            return _handle_web_search_query(
                user_prompt, analysis, request_id, stream_handler=stream_handler
            )
        return _handle_database_query(
            user_prompt, analysis, request_id, stream_handler=stream_handler
        )
    except Exception as exc:
        logger.exception("chat.request.failed id=%s error=%s", request_id, exc)
        raise

def _handle_web_search_query(
    user_prompt: str,
    analysis: Dict[str, Any],
    request_id: str,
    *,
    stream_handler: Optional[Callable[[str], None]] = None,
) -> dict[str, Any]:
    """
    Handle queries that need web search (real-time data, news, etc.).
    
    Args:
        user_prompt: User's question
        analysis: Query analysis result
    
    Returns:
        Web search response
    """
    logger.info("chat.web.start id=%s analysis=%s", request_id, analysis)
    try:
        # For stock price queries, use financial API directly
        if analysis.get('search_type') == 'financial_api' or any(keyword in user_prompt.lower() for keyword in ['stock price', 'price', 'current price', 'quote']):
            from .financial_api import get_stock_price
            from .web_search import _extract_symbol_from_query, search_web, format_search_results
            from .response_enhancer import enhance_financial_response_with_ollama
            
            symbol = _extract_symbol_from_query(user_prompt)
            if symbol:
                search_future = NETWORK_POOL.submit(
                    search_web, f"{symbol} stock price current", 3
                )
                try:
                    stock_data = get_stock_price(symbol)
                except Exception as fetch_exc:
                    logger.exception("chat.web.stock_api_failed id=%s error=%s", request_id, fetch_exc)
                    stock_data = None
                if stock_data:
                    # Use the configured LLM to enhance the response
                    response = enhance_financial_response_with_ollama(
                        stock_data, user_prompt, stream_handler=stream_handler
                    )
                    search_future.cancel()
                    return finalize_response({
                        "reply": response,
                        "web_search": True,
                        "data_source": "financial_api_enhanced",
                        "search_provider": "Financial API"
                    }, request_id=request_id)
                else:
                    # If financial API fails, fall back to web results (already in flight)
                    web_results = search_future.result()
                    provider_label = None
                    if web_results:
                        provider_label = web_results[0].get("source")
                    if not provider_label:
                        provider_label = SEARCH_PROVIDER.title()
                    if web_results:
                        response = format_search_results(web_results, query=user_prompt)
                        return finalize_response({
                            "reply": response,
                            "web_search": True,
                            "data_source": "web_search",
                            "search_provider": provider_label
                        }, request_id=request_id)
                    else:
                        return finalize_response({
                            "reply": f"I couldn't find current stock price information for {symbol}. Please try again or check a financial website.",
                            "web_search": True,
                            "data_source": "error",
                            "search_provider": provider_label
                        }, request_id=request_id)
            else:
                # Extract symbol from the query more aggressively
                import re
                # Look for 3-5 letter ticker symbols
                ticker_match = re.search(r'\b([A-Z]{3,5})\b', user_prompt.upper())
                if ticker_match:
                    symbol = ticker_match.group(1)
                    stock_data = get_stock_price(symbol)
                    if stock_data:
                        response = enhance_financial_response_with_ollama(
                            stock_data, user_prompt, stream_handler=stream_handler
                        )
                        return finalize_response({
                            "reply": response,
                            "web_search": True,
                            "data_source": "financial_api_enhanced",
                            "search_provider": "Financial API"
                        }, request_id=request_id)

                return finalize_response({
                    "reply": "I couldn't identify a stock symbol in your query. Please specify the ticker symbol (e.g., 'AAPL stock price' or 'Apple stock price').",
                    "web_search": True,
                    "data_source": "error"
                }, request_id=request_id)
        
        # For other web searches, use web search API
        from .web_search import search_web, format_search_results

        web_search_results = search_web(user_prompt, num_results=5)
        provider_label = None
        if web_search_results:
            provider_label = web_search_results[0].get("source")
        if not provider_label:
            provider_label = SEARCH_PROVIDER.title()
        if web_search_results:
            response = format_search_results(web_search_results, query=user_prompt)
            return finalize_response({
                "reply": response,
                "web_search": True,
                "data_source": "web_search",
                "search_provider": provider_label
            }, request_id=request_id)

        # Fallback if web search fails
        return finalize_response({
            "reply": "I couldn't find current information on that topic. Please try again later.",
            "web_search": True,
            "data_source": "web_search",
            "search_provider": provider_label
        }, request_id=request_id)
        
    except Exception as exc:
        logger.exception("chat.web.failed id=%s error=%s", request_id, exc)
        return finalize_response({
            "reply": "I encountered an issue retrieving real-time information. Please try again.",
            "web_search": True
        }, request_id=request_id)

def _handle_database_query(
    user_prompt: str,
    analysis: Dict[str, Any],
    request_id: str,
    *,
    stream_handler: Optional[Callable[[str], None]] = None,
) -> dict[str, Any]:
    """
    Handle queries that need database search (analytical data, comparisons, etc.).
    
    Args:
        user_prompt: User's question
        analysis: Query analysis result
    
    Returns:
        Database response
    """
    logger.info("chat.database.start id=%s analysis=%s", request_id, analysis)

    # Use heuristic planning for database queries
    plan_dict = _heuristic_plan_data(user_prompt)
    
    try:
        plan = ChatPlan(plan_dict)
        plan.sanitize()
    except ValueError as exc:
        logger.exception("chat.database.plan_parse_failed id=%s error=%s", request_id, exc)
        plan_dict = _heuristic_plan_data(user_prompt)
        plan = ChatPlan(plan_dict)
        plan.sanitize()

    _augment_plan_with_prompt(plan, user_prompt)
    plan_snapshot = plan.to_dict()

    try:
        rows, sql_raw, sql_params = _fetch_rows(plan)
    except Exception as exc:
        logger.exception("chat.database.fetch_failed id=%s error=%s", request_id, exc)
        return finalize_response({
            "reply": "I ran into an issue accessing the database. Please try again in a minute.",
            "status": "error"
        }, request_id=request_id)

    if not rows:
        logger.info(
            "chat.database.no_results id=%s dataset=%s", request_id, plan.dataset
        )
        return finalize_response({
            "reply": f"I couldn't find matching records in the SmartWealth {plan.dataset} dataset. Try another ticker or adjust the filters.",
            "sql": _render_sql_with_params(sql_raw, sql_params),
            "sql_raw": sql_raw,
            "plan": plan_snapshot,
        }, request_id=request_id)

    # Generate response from database results
    summary = _summarize_answer(user_prompt, plan, sql_raw, rows)
    display_sql = _render_sql_with_params(sql_raw, sql_params)
    
    # Enhance database response with the configured LLM for natural language
    from .response_enhancer import enhance_database_response_with_ollama

    if stream_handler is None:
        enhancement_future = NETWORK_POOL.submit(
            enhance_database_response_with_ollama,
            summary,
            user_prompt,
            None,
        )
    else:
        summary = enhance_database_response_with_ollama(
            summary, user_prompt, stream_handler=stream_handler
        )

    table_payload = _build_table_payload(plan, rows)
    chart_payload = _build_chart_payload(plan, rows)
    detail_preview = _prepare_preview_rows(rows, limit=3) if table_payload else None

    if stream_handler is None:
        summary = enhancement_future.result()

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

    logger.info(
        "chat.database.success id=%s rows=%s dataset=%s",
        request_id,
        len(rows),
        plan.dataset,
    )
    return finalize_response(response, request_id=request_id)

def chat():
    """Chat endpoint using clean routing."""
    from flask import request, jsonify
    
    try:
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Message is required"}), 400
        
        user_message = data["message"]
        logger.info(
            "chat.endpoint.received ip=%s body_keys=%s", request.remote_addr, list(data.keys())
        )
        result = handle_chat_clean(user_message)
        
        return jsonify(result)
    except Exception as exc:
        logger.exception("chat.endpoint.failed error=%s", exc)
        return jsonify({"reply": "I ran into an unexpected issue answering that. Please try again shortly."}), 500


def chat_stream():
    from flask import request, Response, stream_with_context, jsonify

    data = request.get_json(silent=True) or {}
    user_message = data.get("message")
    if not user_message:
        return jsonify({"error": "Message is required"}), 400

    queue: "Queue[tuple[str, Any]]" = Queue()
    sentinel = object()

    def stream_callback(delta: str) -> None:
        queue.put(("delta", delta))

    def worker() -> None:
        try:
            result = handle_chat_clean(user_message, stream_handler=stream_callback)
            queue.put(("result", result))
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("chat.stream.worker_failed error=%s", exc)
            queue.put(("error", str(exc)))
        finally:
            queue.put(("end", sentinel))

    Thread(target=worker, daemon=True).start()

    @stream_with_context
    def event_stream():
        while True:
            kind, payload = queue.get()
            if kind == "delta":
                yield f"data: {json.dumps({'type': 'delta', 'delta': payload})}\n\n"
            elif kind == "result":
                yield f"data: {json.dumps({'type': 'result', 'data': payload})}\n\n"
            elif kind == "error":
                yield f"data: {json.dumps({'type': 'error', 'error': payload})}\n\n"
            elif kind == "end":
                yield "data: {\"type\": \"end\"}\n\n"
                break

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return Response(event_stream(), headers=headers)
