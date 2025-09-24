"""Multi-language support for the chatbot."""
from __future__ import annotations

import logging
from typing import Dict, Optional

logger = logging.getLogger("smartwealth.translation")

def detect_language(text: str) -> str:
    """Detect the language of the input text."""
    # Simple language detection based on common patterns
    text_lower = text.lower()
    
    # Spanish indicators
    spanish_words = ['que', 'como', 'donde', 'cuando', 'por', 'para', 'con', 'sin']
    if any(word in text_lower for word in spanish_words):
        return 'es'
    
    # French indicators  
    french_words = ['que', 'comment', 'où', 'quand', 'pour', 'avec', 'sans']
    if any(word in text_lower for word in french_words):
        return 'fr'
    
    # German indicators
    german_words = ['was', 'wie', 'wo', 'wann', 'für', 'mit', 'ohne']
    if any(word in text_lower for word in german_words):
        return 'de'
    
    # Default to English
    return 'en'

def translate_text(text: str, target_language: str, source_language: str = 'auto') -> str:
    """Translate text to target language."""
    if source_language == target_language:
        return text
    
    # For now, return original text
    # In production, integrate with translation service
    logger.info(f"Translation requested: {source_language} -> {target_language}")
    return text

def get_localized_response(response: str, language: str) -> str:
    """Get localized response based on language."""
    if language == 'en':
        return response
    
    # For now, return original response
    # In production, integrate with translation service
    return response
