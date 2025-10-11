from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


_STORE_PATH = Path(__file__).resolve().parents[2] / 'auth_sessions.json'
_LOCK = threading.Lock()
_DATA = {"sessions": []}


@dataclass
class StoredSession:
    token: str
    userId: str
    createdAt: str
    lastUsedAt: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_locked() -> None:
    if not _STORE_PATH.exists():
        _DATA['sessions'] = []
        return
    try:
        with _STORE_PATH.open('r', encoding='utf-8') as handle:
            payload = json.load(handle)
            if isinstance(payload, dict) and isinstance(payload.get('sessions'), list):
                _DATA['sessions'] = payload['sessions']
            else:
                _DATA['sessions'] = []
    except Exception:
        _DATA['sessions'] = []


def _persist() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _STORE_PATH.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as handle:
        json.dump(_DATA, handle, ensure_ascii=False, indent=2)
    tmp.replace(_STORE_PATH)


def create_session(token: str, user_id: str) -> None:
    if not token or not user_id:
        return

    record = StoredSession(
        token=token,
        userId=user_id,
        createdAt=_now(),
        lastUsedAt=_now(),
    )

    with _LOCK:
        _load_locked()
        _DATA['sessions'] = [entry for entry in _DATA['sessions'] if entry.get('token') != token]
        _DATA['sessions'].append(record.__dict__)
        _persist()


def get_user_id(token: str) -> Optional[str]:
    if not token:
        return None

    with _LOCK:
        _load_locked()
        for entry in _DATA['sessions']:
            if entry.get('token') == token:
                entry['lastUsedAt'] = _now()
                _persist()
                user_id = entry.get('userId')
                if not user_id:
                    user = entry.get('user')
                    if isinstance(user, dict):
                        user_id = user.get('id')
                        if user_id:
                            entry['userId'] = user_id
                            entry.pop('user', None)
                            _persist()
                return user_id
    return None


def delete_session(token: str) -> None:
    if not token:
        return
    with _LOCK:
        _load_locked()
        original = len(_DATA['sessions'])
        _DATA['sessions'] = [entry for entry in _DATA['sessions'] if entry.get('token') != token]
        if len(_DATA['sessions']) != original:
            _persist()


def delete_all_sessions(user_id: str) -> None:
    if not user_id:
        return
    with _LOCK:
        _load_locked()
        original = len(_DATA['sessions'])
        def _entry_belongs(entry: dict) -> bool:
            if entry.get('userId') == user_id:
                return True
            user = entry.get('user')
            if isinstance(user, dict) and user.get('id') == user_id:
                return True
            return False

        _DATA['sessions'] = [entry for entry in _DATA['sessions'] if not _entry_belongs(entry)]
        if len(_DATA['sessions']) != original:
            _persist()
