from __future__ import annotations

import os
import secrets
import logging
from dataclasses import dataclass, asdict
from typing import Dict, Optional

from flask import request, jsonify, make_response

from .chat_sessions_store import delete_all_sessions_for_user
from .auth_sessions_store import (
    create_session as create_auth_session,
    get_user_id as auth_get_user_id,
    delete_session as delete_auth_session,
    delete_all_sessions as delete_all_auth_sessions,
)


logger = logging.getLogger("smartwealth.auth")


# Simple profile store (MVP)
_PROFILES: Dict[str, dict] = {}


@dataclass
class User:
    id: str
    name: str
    username: str
    password: str  # Plain for MVP only; replace with hashed in production

    @property
    def initials(self) -> str:
        parts = [p for p in self.name.split() if p]
        if not parts:
            return (self.username[:1] or "").upper()
        return (parts[0][:1] + (parts[1][:1] if len(parts) > 1 else "")).upper()


def _hardcoded_users() -> Dict[str, User]:
    # Optional ENV override: SMARTWEALTH_USERS in form "name|username|password;name2|username2|password2"
    raw = os.getenv("SMARTWEALTH_USERS", "").strip()
    users: Dict[str, User] = {}
    if raw:
        for idx, chunk in enumerate([c for c in raw.split(";") if c.strip()]):
            try:
                name, username, pwd = [s.strip() for s in chunk.split("|")]
                uid = f"u{idx+1}"
                users[username.lower()] = User(id=uid, name=name, username=username.lower(), password=pwd)
            except Exception:
                continue
        if users:
            return users

    # Default demo users (requested): pratik/saurav/shubham with password demo123
    defaults = [
        ("Pratik", "pratik", "demo123"),
        ("Saurav", "saurav", "demo123"),
        ("Shubham", "shubham", "demo123"),
    ]
    for i, (name, email, pwd) in enumerate(defaults, start=1):
        users[email.lower()] = User(id=f"u{i}", name=name, username=email.lower(), password=pwd)
    return users


_USERS = _hardcoded_users()
_USERS_BY_ID = {user.id: user for user in _USERS.values()}


def _current_user() -> Optional[User]:
    token = request.cookies.get("sw_session")
    if not token:
        return None
    user_id = auth_get_user_id(token)
    if not user_id:
        return None
    return _USERS_BY_ID.get(user_id)


def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).lower().strip()
    password = str(data.get("password", "")).strip()
    user = _USERS.get(username)
    if not user or user.password != password:
        return jsonify({"ok": False, "error": "invalid_credentials"}), 401

    token = secrets.token_urlsafe(32)
    create_auth_session(token, user.id)
    resp = make_response(jsonify({"ok": True, "user": _public_user(user)}))
    resp.set_cookie(
        "sw_session",
        token,
        max_age=60 * 60 * 24,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",
    )
    return resp


def logout():
    token = request.cookies.get("sw_session")
    user = _USERS_BY_ID.get(auth_get_user_id(token)) if token else None
    if token:
        delete_auth_session(token)

    if user:
        try:
            deleted = delete_all_sessions_for_user(user.id)
            if deleted:
                logger.info("auth.logout.cleared_sessions user_id=%s count=%s", user.id, deleted)
            delete_all_auth_sessions(user.id)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("auth.logout.session_cleanup_failed user_id=%s error=%s", user.id, exc)

    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("sw_session", path="/")
    return resp


def me():
    user = _current_user()
    if not user:
        return jsonify({"ok": False}), 401
    profile = _PROFILES.get(user.id)
    return jsonify({"ok": True, "user": _public_user(user), "profile": profile})


def save_portfolio():
    user = _current_user()
    if not user:
        return jsonify({"ok": False}), 401
    data = request.get_json(silent=True) or {}
    # Minimal schema validation
    profile = {
        "risk": data.get("risk"),
        "horizon": data.get("horizon"),
        "baseCurrency": data.get("baseCurrency", "USD"),
        "holdings": data.get("holdings", []),  # list of {symbol, shares, avgCost}
        "watchlist": data.get("watchlist", []),
    }
    _PROFILES[user.id] = profile
    return jsonify({"ok": True})


def get_portfolio():
    user = _current_user()
    if not user:
        return jsonify({"ok": False}), 401
    return jsonify({"ok": True, "profile": _PROFILES.get(user.id)})


def _public_user(user: User) -> dict:
    data = asdict(user)
    # Do not expose password
    data.pop("password", None)
    data["initials"] = user.initials
    return data
