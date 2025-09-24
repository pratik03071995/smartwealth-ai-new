"""User personalization and preference learning system."""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("smartwealth.personalization")

class UserProfile:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.preferences: Dict[str, Any] = {
            "preferred_data_sources": [],
            "favorite_companies": [],
            "interested_sectors": [],
            "query_patterns": [],
            "response_style": "detailed",  # detailed, concise, technical
            "language": "en"
        }
        self.interaction_history: List[Dict[str, Any]] = []
        self.learned_patterns: Dict[str, Any] = {}

    def add_interaction(self, query: str, response: str, intent: str, data_source: str):
        """Add a new interaction to the user's history."""
        interaction = {
            "query": query,
            "response": response,
            "intent": intent,
            "data_source": data_source,
            "timestamp": time.time()
        }
        self.interaction_history.append(interaction)
        
        # Keep only last 100 interactions
        if len(self.interaction_history) > 100:
            self.interaction_history = self.interaction_history[-100:]

    def learn_from_interactions(self):
        """Learn user preferences from interaction history."""
        if len(self.interaction_history) < 5:
            return
        
        # Analyze query patterns
        query_patterns = {}
        for interaction in self.interaction_history:
            query_lower = interaction["query"].lower()
            
            # Extract common patterns
            if "stock price" in query_lower or "price" in query_lower:
                query_patterns["stock_price_queries"] = query_patterns.get("stock_price_queries", 0) + 1
            if "compare" in query_lower or "vs" in query_lower:
                query_patterns["comparison_queries"] = query_patterns.get("comparison_queries", 0) + 1
            if "sector" in query_lower or "industry" in query_lower:
                query_patterns["sector_queries"] = query_patterns.get("sector_queries", 0) + 1
        
        self.learned_patterns = query_patterns
        
        # Update preferences based on patterns
        if query_patterns.get("stock_price_queries", 0) > 3:
            if "financial_api" not in self.preferences["preferred_data_sources"]:
                self.preferences["preferred_data_sources"].append("financial_api")
        
        if query_patterns.get("sector_queries", 0) > 2:
            if "database" not in self.preferences["preferred_data_sources"]:
                self.preferences["preferred_data_sources"].append("database")

    def get_personalized_suggestions(self, query: str) -> List[str]:
        """Get personalized suggestions based on user history."""
        suggestions = []
        
        # Based on learned patterns
        if self.learned_patterns.get("stock_price_queries", 0) > 2:
            suggestions.append("Would you like to see the latest stock prices?")
        
        if self.learned_patterns.get("comparison_queries", 0) > 1:
            suggestions.append("Would you like to compare companies?")
        
        return suggestions

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "preferences": self.preferences,
            "interaction_history": self.interaction_history,
            "learned_patterns": self.learned_patterns
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UserProfile':
        profile = cls(data["user_id"])
        profile.preferences = data.get("preferences", profile.preferences)
        profile.interaction_history = data.get("interaction_history", [])
        profile.learned_patterns = data.get("learned_patterns", {})
        return profile

class PersonalizationEngine:
    def __init__(self, profiles_dir: str = "user_profiles"):
        self.profiles_dir = profiles_dir
        self.profiles: Dict[str, UserProfile] = {}
        self._ensure_profiles_dir()

    def _ensure_profiles_dir(self):
        """Ensure the profiles directory exists."""
        if not os.path.exists(self.profiles_dir):
            os.makedirs(self.profiles_dir)

    def get_user_profile(self, user_id: str) -> UserProfile:
        """Get or create user profile."""
        if user_id not in self.profiles:
            profile_path = os.path.join(self.profiles_dir, f"{user_id}.json")
            if os.path.exists(profile_path):
                try:
                    with open(profile_path, 'r') as f:
                        data = json.load(f)
                    self.profiles[user_id] = UserProfile.from_dict(data)
                except Exception as exc:
                    logger.error(f"Failed to load profile for {user_id}: {exc}")
                    self.profiles[user_id] = UserProfile(user_id)
            else:
                self.profiles[user_id] = UserProfile(user_id)
        return self.profiles[user_id]

    def save_user_profile(self, profile: UserProfile):
        """Save user profile to disk."""
        profile_path = os.path.join(self.profiles_dir, f"{profile.user_id}.json")
        try:
            with open(profile_path, 'w') as f:
                json.dump(profile.to_dict(), f, indent=2)
        except Exception as exc:
            logger.error(f"Failed to save profile for {profile.user_id}: {exc}")

    def get_personalized_response(self, user_id: str, base_response: str, query: str) -> str:
        """Get personalized response based on user profile."""
        profile = self.get_user_profile(user_id)
        
        # Add personalized suggestions
        suggestions = profile.get_personalized_suggestions(query)
        if suggestions:
            base_response += "\n\n" + "\n".join(suggestions)
        
        return base_response

# Global instance
personalization_engine = PersonalizationEngine()
