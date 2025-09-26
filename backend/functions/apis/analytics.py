"""advanced analytics and monitoring for chatbot performance and usage."""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("smartwealth.analytics")

class ChatbotAnalytics:
    def __init__(self):
        self.query_logs: List[Dict[str, Any]] = []
        self.performance_metrics: Dict[str, Any] = {
            "total_queries": 0,
            "successful_queries": 0,
            "failed_queries": 0,
            "avg_response_time_ms": 0.0,
            "total_response_time_ms": 0,
            "routing_counts": {}, # e.g., {'web_search': 10, 'database_search': 20}
            "intent_counts": {}, # e.g., {'stock_price': 5, 'comparison': 8}
            "error_counts": {}, # e.g., {'LLMError': 2, 'DatabaseError': 1}
        }
        self.start_time = time.time()

    def log_query(
        self,
        user_id: str,
        session_id: str,
        prompt: str,
        response: str,
        strategy: str,
        intent: str,
        data_source: str,
        latency_ms: float,
        status: str = "success", # 'success', 'failure', 'error'
        error_type: Optional[str] = None,
    ):
        log_entry = {
            "timestamp": time.time(),
            "user_id": user_id,
            "session_id": session_id,
            "prompt": prompt,
            "response": response,
            "strategy": strategy,
            "intent": intent,
            "data_source": data_source,
            "latency_ms": latency_ms,
            "status": status,
            "error_type": error_type,
        }
        self.query_logs.append(log_entry)
        self._update_performance_metrics(log_entry)
        logger.info(f"Analytics logged: {log_entry}")

    def _update_performance_metrics(self, log_entry: Dict[str, Any]):
        self.performance_metrics["total_queries"] += 1
        self.performance_metrics["total_response_time_ms"] += log_entry["latency_ms"]
        self.performance_metrics["avg_response_time_ms"] = (
            self.performance_metrics["total_response_time_ms"] / self.performance_metrics["total_queries"]
        )

        if log_entry["status"] == "success":
            self.performance_metrics["successful_queries"] += 1
        else:
            self.performance_metrics["failed_queries"] += 1
            if log_entry["error_type"]:
                self.performance_metrics["error_counts"][log_entry["error_type"]] = (
                    self.performance_metrics["error_counts"].get(log_entry["error_type"], 0) + 1
                )
        
        self.performance_metrics["routing_counts"][log_entry["strategy"]] = (
            self.performance_metrics["routing_counts"].get(log_entry["strategy"], 0) + 1
        )
        self.performance_metrics["intent_counts"][log_entry["intent"]] = (
            self.performance_metrics["intent_counts"].get(log_entry["intent"], 0) + 1
        )

    def get_dashboard_metrics(self) -> Dict[str, Any]:
        """Return key metrics for a dashboard."""
        uptime_seconds = time.time() - self.start_time
        return {
            "total_queries": self.performance_metrics["total_queries"],
            "successful_queries": self.performance_metrics["successful_queries"],
            "failed_queries": self.performance_metrics["failed_queries"],
            "error_rate": (
                self.performance_metrics["failed_queries"] / self.performance_metrics["total_queries"]
                if self.performance_metrics["total_queries"] > 0
                else 0
            ),
            "avg_response_time_ms": self.performance_metrics["avg_response_time_ms"],
            "routing_distribution": self.performance_metrics["routing_counts"],
            "intent_distribution": self.performance_metrics["intent_counts"],
            "error_distribution": self.performance_metrics["error_counts"],
            "uptime_hours": uptime_seconds / 3600,
        }

# Global instance of the analytics manager
chatbot_analytics = ChatbotAnalytics()
