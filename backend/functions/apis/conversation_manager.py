"""Conversation management for tracking user sessions and context."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("smartwealth.conversation_manager")

class ConversationSession:
    def __init__(self, session_id: str, user_id: Optional[str] = None):
        self.session_id = session_id
        self.user_id = user_id
        self.history: List[Dict[str, Any]] = []
        self.context: Dict[str, Any] = {}
        self.last_active_time: float = time.time()
        self.preferences: Dict[str, Any] = {} # User preferences
        self.metrics: Dict[str, Any] = {
            "start_time": time.time(),
            "total_queries": 0,
            "successful_queries": 0,
            "failed_queries": 0,
            "total_latency_ms": 0,
        }

    def add_message(self, role: str, content: str, is_user: bool = True):
        self.history.append({"role": role, "content": content, "timestamp": time.time()})
        if is_user:
            self.metrics["total_queries"] += 1
        self.last_active_time = time.time()

    def update_context(self, key: str, value: Any):
        self.context[key] = value
        self.last_active_time = time.time()

    def get_context(self, key: str, default: Any = None) -> Any:
        return self.context.get(key, default)

    def update_preferences(self, key: str, value: Any):
        self.preferences[key] = value
        self.last_active_time = time.time()

    def get_preferences(self, key: str, default: Any = None) -> Any:
        return self.preferences.get(key, default)

    def update_metrics(self, metric_name: str, value: Any):
        if metric_name in self.metrics:
            self.metrics[metric_name] += value
        else:
            self.metrics[metric_name] = value
        self.last_active_time = time.time()

    def is_stale(self, timeout_seconds: int = 300) -> bool:
        return (time.time() - self.last_active_time) > timeout_seconds

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "history": self.history,
            "context": self.context,
            "last_active_time": self.last_active_time,
            "preferences": self.preferences,
            "metrics": self.metrics,
        }

class ConversationManager:
    def __init__(self, session_timeout_seconds: int = 300):
        self.sessions: Dict[str, ConversationSession] = {}
        self.session_timeout_seconds = session_timeout_seconds

    def get_session(self, session_id: str, user_id: Optional[str] = None) -> ConversationSession:
        if session_id not in self.sessions or self.sessions[session_id].is_stale(self.session_timeout_seconds):
            self.sessions[session_id] = ConversationSession(session_id, user_id)
            logger.info(f"Created new session: {session_id}")
        else:
            self.sessions[session_id].last_active_time = time.time()
            logger.info(f"Reactivated session: {session_id}")
        return self.sessions[session_id]

    def end_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Ended session: {session_id}")

    def clean_stale_sessions(self):
        stale_session_ids = [
            s_id for s_id, session in self.sessions.items() if session.is_stale(self.session_timeout_seconds)
        ]
        for s_id in stale_session_ids:
            self.end_session(s_id)
        if stale_session_ids:
            logger.info(f"Cleaned up {len(stale_session_ids)} stale sessions.")

# Global instance of the conversation manager
conversation_manager = ConversationManager()
