from __future__ import annotations

import json
import logging
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional
import copy

logger = logging.getLogger("smartwealth.chat_sessions_store")

_STORE_PATH = Path(__file__).resolve().parents[2] / 'chat_sessions.json'
_LOCK = threading.Lock()
_DATA = {"sessions": []}
_MAX_SESSIONS_PER_USER = 50
_MAX_MESSAGES_PER_SESSION = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> None:
    if not _STORE_PATH.exists():
        return
    try:
        with _STORE_PATH.open('r', encoding='utf-8') as handle:
            data = json.load(handle)
            if isinstance(data, dict) and isinstance(data.get('sessions'), list):
                _DATA['sessions'] = data['sessions']
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("chat_sessions_store.load_failed path=%s error=%s", _STORE_PATH, exc)


def _save() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = _STORE_PATH.with_suffix('.json.tmp')
    with tmp_path.open('w', encoding='utf-8') as handle:
        json.dump(_DATA, handle, ensure_ascii=False, indent=2)
    tmp_path.replace(_STORE_PATH)


@dataclass
class ChatSessionRecord:
    id: str
    userId: str
    title: str
    createdAt: str
    updatedAt: str
    lastUsedAt: str
    firstPrompt: Optional[str] = None
    lastPrompt: Optional[str] = None
    messages: List[Dict[str, str]] = None

    def to_dict(self) -> Dict[str, str]:
        data = asdict(self)
        data['messages'] = data.get('messages') or []
        return data


def _ensure_loaded() -> None:
    if not _DATA['sessions']:
        _load()


def list_sessions(user_id: str) -> List[Dict[str, str]]:
    _ensure_loaded()
    with _LOCK:
        sessions_raw = [s for s in _DATA['sessions'] if s.get('userId') == user_id]
        sessions = []
        for entry in sessions_raw:
            cleaned = {k: v for k, v in entry.items() if k != 'messages'}
            sessions.append(cleaned)
    sessions.sort(key=lambda entry: entry.get('lastUsedAt') or entry.get('createdAt') or '', reverse=True)
    return sessions


def create_session(user_id: str, title: str | None = None) -> Dict[str, str]:
    _ensure_loaded()
    now = _now_iso()
    record = ChatSessionRecord(
        id=str(uuid.uuid4()),
        userId=user_id,
        title=title.strip() if title and title.strip() else 'New chat',
        createdAt=now,
        updatedAt=now,
        lastUsedAt=now,
        messages=[],
    )
    with _LOCK:
        existing = [s for s in _DATA['sessions'] if s.get('userId') == user_id]
        if len(existing) >= _MAX_SESSIONS_PER_USER:
            existing_sorted = sorted(existing, key=lambda entry: entry.get('lastUsedAt') or entry.get('createdAt') or '')
            for stale in existing_sorted[: len(existing) - _MAX_SESSIONS_PER_USER + 1]:
                _DATA['sessions'].remove(stale)
        stored = record.to_dict()
        _DATA['sessions'].append(stored)
        _save()
    return {k: v for k, v in stored.items() if k != 'messages'}


def get_session(session_id: str, user_id: str) -> Optional[Dict[str, str]]:
    _ensure_loaded()
    with _LOCK:
        for entry in _DATA['sessions']:
            if entry.get('id') == session_id and entry.get('userId') == user_id:
                return copy.deepcopy(entry)
    return None


def get_session_messages(session_id: str, user_id: str) -> Optional[List[Dict[str, str]]]:
    session = get_session(session_id, user_id)
    if not session:
        return None
    messages = session.get('messages') or []
    return copy.deepcopy(messages)


def update_session(session_id: str, user_id: str, **fields: str) -> Optional[Dict[str, str]]:
    _ensure_loaded()
    allowed = {'title', 'lastPrompt', 'firstPrompt', 'lastUsedAt', 'updatedAt'}
    cleaned = {key: value for key, value in fields.items() if key in allowed and value is not None}
    if not cleaned:
        return get_session(session_id, user_id)

    with _LOCK:
        for index, entry in enumerate(_DATA['sessions']):
            if entry.get('id') == session_id and entry.get('userId') == user_id:
                entry.update(cleaned)
                if 'updatedAt' not in cleaned:
                    entry['updatedAt'] = _now_iso()
                _DATA['sessions'][index] = entry
                _save()
                return copy.deepcopy(entry)
    return None


def delete_session(session_id: str, user_id: str) -> bool:
    _ensure_loaded()
    with _LOCK:
        for entry in list(_DATA['sessions']):
            if entry.get('id') == session_id and entry.get('userId') == user_id:
                _DATA['sessions'].remove(entry)
                _save()
                return True
    return False


def delete_all_sessions_for_user(user_id: str) -> int:
    """Remove every stored session for the given user."""
    if not user_id:
        return 0

    _ensure_loaded()
    removed = 0
    with _LOCK:
        original = list(_DATA['sessions'])
        for entry in original:
            if entry.get('userId') == user_id:
                _DATA['sessions'].remove(entry)
                removed += 1
        if removed:
            _save()
    return removed


def record_interaction(
    *,
    user_id: str,
    session_id: str,
    user_prompt: str,
    assistant_reply: Optional[str],
    title_generator: Optional[Callable[[str, Optional[str]], str]] = None,
) -> Optional[Dict[str, str]]:
    _ensure_loaded()
    user_prompt = (user_prompt or '').strip()
    assistant_reply = (assistant_reply or '').strip() if assistant_reply else None
    now = _now_iso()

    with _LOCK:
        for index, entry in enumerate(_DATA['sessions']):
            if entry.get('id') != session_id or entry.get('userId') != user_id:
                continue

            first_prompt_existing = entry.get('firstPrompt')
            entry['lastPrompt'] = user_prompt or entry.get('lastPrompt')
            entry['lastUsedAt'] = now
            entry['updatedAt'] = now

            messages = entry.setdefault('messages', [])
            if user_prompt:
                messages.append({'role': 'user', 'text': user_prompt, 'createdAt': now})
            if assistant_reply:
                messages.append({'role': 'assistant', 'text': assistant_reply, 'createdAt': now})
            if len(messages) > _MAX_MESSAGES_PER_SESSION:
                entry['messages'] = messages[-_MAX_MESSAGES_PER_SESSION:]

            if not first_prompt_existing and user_prompt:
                entry['firstPrompt'] = user_prompt

            if entry.get('title') in (None, '', 'New chat') and user_prompt:
                generated: Optional[str] = None
                if title_generator is not None:
                    try:
                        generated = title_generator(user_prompt, assistant_reply)
                    except Exception as exc:  # pragma: no cover - defensive
                        logger.warning("chat_sessions_store.title_generation_failed id=%s error=%s", session_id, exc)
                fallback = user_prompt[:60].strip() or 'New chat'
                entry['title'] = (generated or fallback).strip()

            _DATA['sessions'][index] = entry
            _save()
            return copy.deepcopy(entry)
    return None
