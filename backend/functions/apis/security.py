"""Security features for the chatbot including rate limiting and input sanitization."""
from __future__ import annotations

import logging
import re
import time
from typing import Dict, Set
from collections import defaultdict, deque

logger = logging.getLogger("smartwealth.security")

class RateLimiter:
    def __init__(self, max_requests: int = 10, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests: Dict[str, deque] = defaultdict(deque)
    
    def check_request(self, client_ip: str) -> bool:
        """Check if request is within rate limits."""
        current_time = time.time()
        
        # Clean old requests outside time window
        if client_ip in self.requests:
            while self.requests[client_ip] and self.requests[client_ip][0] < current_time - self.time_window:
                self.requests[client_ip].popleft()
        
        # Check if under limit
        if len(self.requests[client_ip]) >= self.max_requests:
            return False
        
        # Add current request
        self.requests[client_ip].append(current_time)
        return True

def sanitize_input(user_input: str) -> str:
    """Sanitize user input to prevent injection attacks."""
    if not user_input:
        return ""
    
    # Remove potentially dangerous characters
    sanitized = re.sub(r'[<>"\']', '', user_input)
    
    # Limit length
    if len(sanitized) > 1000:
        sanitized = sanitized[:1000]
    
    # Remove excessive whitespace
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    
    return sanitized

def validate_query(query: str) -> bool:
    """Validate that query is safe and reasonable."""
    if not query or len(query.strip()) == 0:
        return False
    
    if len(query) > 1000:
        return False
    
    # Check for suspicious patterns
    suspicious_patterns = [
        r'<script',
        r'javascript:',
        r'data:',
        r'vbscript:',
        r'onload=',
        r'onerror=',
        r'<iframe',
        r'<object',
        r'<embed'
    ]
    
    query_lower = query.lower()
    for pattern in suspicious_patterns:
        if re.search(pattern, query_lower):
            logger.warning(f"Suspicious query detected: {query}")
            return False
    
    return True

# Global rate limiter instance
rate_limiter = RateLimiter(max_requests=20, time_window=60)
