"""Feedback and logging system for chat interactions."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("smartwealth.feedback")

# Feedback status constants
CHAT_FEEDBACK_STATUS_PENDING = "pending"
CHAT_FEEDBACK_STATUS_APPROVED = "approved" 
CHAT_FEEDBACK_STATUS_REJECTED = "rejected"

def log_chat_interaction(
    message_id: str,
    prompt: str,
    answer: str,
    plan: Optional[Dict[str, Any]] = None,
    dataset: Optional[str] = None,
    table_payload: Optional[Dict[str, Any]] = None,
    chart_payload: Optional[Dict[str, Any]] = None,
    sql: Optional[str] = None,
    latency_ms: float = 0.0,
    status: str = CHAT_FEEDBACK_STATUS_PENDING,
    source_message_id: Optional[str] = None,
    match_score: Optional[float] = None,
    followups: Optional[list[str]] = None,
):
    """Log chat interaction for feedback and analytics."""
    interaction = {
        "message_id": message_id,
        "timestamp": time.time(),
        "prompt": prompt,
        "answer": answer,
        "plan": plan,
        "dataset": dataset,
        "table_payload": table_payload,
        "chart_payload": chart_payload,
        "sql": sql,
        "latency_ms": latency_ms,
        "status": status,
        "source_message_id": source_message_id,
        "match_score": match_score,
        "followups": followups,
    }

    logger.info(f"Chat interaction logged: {message_id}")
    # In production, save to database or file system

def best_feedback_match(prompt: str, feedback_data: list) -> Optional[Dict[str, Any]]:
    """Find the best feedback match for a given prompt."""
    if not feedback_data:
        return None

    # Simple matching based on prompt similarity
    prompt_lower = prompt.lower()
    best_match = None
    best_score = 0.0
    
    for feedback in feedback_data:
        if 'prompt' in feedback:
            feedback_prompt = feedback['prompt'].lower()
            # Simple word overlap scoring
            prompt_words = set(prompt_lower.split())
            feedback_words = set(feedback_prompt.split())
            overlap = len(prompt_words.intersection(feedback_words))
            total_words = len(prompt_words.union(feedback_words))
            score = overlap / total_words if total_words > 0 else 0.0
            
            if score > best_score:
                best_score = score
                best_match = feedback
    
    return best_match if best_score > 0.3 else None

def feedback_response(message_id: str, feedback_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process feedback response."""
    return {
        "message_id": message_id,
        "feedback": feedback_data,
        "timestamp": time.time()
    }

def fetch_feedback_entry_by_id(message_id: str) -> Optional[Dict[str, Any]]:
    """Fetch feedback entry by message ID."""
    # In production, this would query a database
    return None

def normalize_feedback_prompt(prompt: str) -> str:
    """Normalize feedback prompt for consistent processing."""
    if not prompt:
        return ""
    
    # Convert to lowercase and strip whitespace
    normalized = prompt.lower().strip()
    
    # Remove extra whitespace
    normalized = " ".join(normalized.split())
    
    return normalized

def record_feedback(message_id: str, feedback_type: str, feedback_data: Dict[str, Any]) -> bool:
    """Record user feedback for a message."""
    try:
        feedback_entry = {
            "message_id": message_id,
            "feedback_type": feedback_type,
            "feedback_data": feedback_data,
            "timestamp": time.time()
        }
        
        logger.info(f"Feedback recorded for message {message_id}: {feedback_type}")
        # In production, save to database
        return True
    except Exception as exc:
        logger.error(f"Failed to record feedback: {exc}")
        return False