from __future__ import annotations

from flask import jsonify, request

from .auth import _current_user
from .chat_sessions_store import (
    create_session,
    delete_session,
    list_sessions,
    update_session,
    get_session_messages,
)


def list_chat_sessions():
    user = _current_user()
    if not user:
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    sessions = list_sessions(user.id)
    return jsonify({"ok": True, "sessions": sessions})


def create_chat_session():
    user = _current_user()
    if not user:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    title = data.get('title')

    record = create_session(user.id, title=title)
    return jsonify({"ok": True, "session": record}), 201


def update_chat_session(session_id: str):
    user = _current_user()
    if not user:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    allowed_fields = {"title", "lastPrompt", "firstPrompt", "lastUsedAt"}
    payload = {key: data.get(key) for key in allowed_fields if key in data}

    record = update_session(session_id, user.id, **payload)
    if not record:
        return jsonify({"ok": False, "error": "not_found"}), 404
    record.pop('messages', None)
    return jsonify({"ok": True, "session": record})


def delete_chat_session(session_id: str):
    user = _current_user()
    if not user:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    removed = delete_session(session_id, user.id)
    if not removed:
        return jsonify({"ok": False, "error": "not_found"}), 404
    return jsonify({"ok": True})


def list_chat_session_messages(session_id: str):
    user = _current_user()
    if not user:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    messages = get_session_messages(session_id, user.id)
    if messages is None:
        return jsonify({"ok": False, "error": "not_found"}), 404
    return jsonify({"ok": True, "messages": messages})
