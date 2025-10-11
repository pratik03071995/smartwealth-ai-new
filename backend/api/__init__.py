from flask import Blueprint

from functions import (
    chat_clean,
    chat_stream,
    chat_feedback,
    companies_profiles,
    earnings,
    earnings_all,
    earnings_week,
    health,
    score,
    scores_ranked,
    sectors,
    vendors,
    vendors_companies,
    vendors_network,
    auth_login,
    auth_logout,
    auth_me,
    portfolio_save,
    portfolio_get,
    stock_chart,
    list_chat_sessions,
    create_chat_session,
    update_chat_session,
    delete_chat_session,
    list_chat_session_messages,
)

bp = Blueprint("api", __name__)

bp.add_url_rule("/api/health", view_func=health, methods=["GET"])
bp.add_url_rule("/api/chat", view_func=chat_clean, methods=["POST"])
bp.add_url_rule("/api/chat/stream", view_func=chat_stream, methods=["POST"])
bp.add_url_rule("/api/chat/feedback", view_func=chat_feedback, methods=["POST"])
bp.add_url_rule("/api/charts/stock", view_func=stock_chart, methods=["GET"])
bp.add_url_rule("/api/chat/sessions", view_func=list_chat_sessions, methods=["GET"])
bp.add_url_rule("/api/chat/sessions", view_func=create_chat_session, methods=["POST"])
bp.add_url_rule("/api/chat/sessions/<session_id>", view_func=update_chat_session, methods=["PATCH"])
bp.add_url_rule("/api/chat/sessions/<session_id>", view_func=delete_chat_session, methods=["DELETE"])
bp.add_url_rule("/api/chat/sessions/<session_id>/messages", view_func=list_chat_session_messages, methods=["GET"])

bp.add_url_rule("/api/earnings/week", view_func=earnings_week, methods=["GET"])
bp.add_url_rule("/api/earnings/all", view_func=earnings_all, methods=["GET"])
bp.add_url_rule("/api/earnings", view_func=earnings, methods=["GET"])

bp.add_url_rule("/api/vendors/network", view_func=vendors_network, methods=["GET"])
bp.add_url_rule("/api/vendors/companies", view_func=vendors_companies, methods=["GET"])
bp.add_url_rule("/api/vendors", view_func=vendors, methods=["GET"])

bp.add_url_rule("/api/score", view_func=score, methods=["GET"])
bp.add_url_rule("/api/scores/ranked", view_func=scores_ranked, methods=["GET"])

bp.add_url_rule("/api/companies/profiles", view_func=companies_profiles, methods=["GET"])
bp.add_url_rule("/api/sectors", view_func=sectors, methods=["GET"])

# Auth + Portfolio (MVP)
bp.add_url_rule("/api/auth/login", view_func=auth_login, methods=["POST"])
bp.add_url_rule("/api/auth/logout", view_func=auth_logout, methods=["POST"])
bp.add_url_rule("/api/auth/me", view_func=auth_me, methods=["GET"])
bp.add_url_rule("/api/portfolio", view_func=portfolio_get, methods=["GET"])
bp.add_url_rule("/api/portfolio", view_func=portfolio_save, methods=["POST"])

__all__ = ["bp"]
