from collections import defaultdict
from typing import List, Set, Optional

from .config import settings
from .logger import get_logger

log = get_logger("memory")


class MemoryStore:
    """In-memory conversation store with per-session language tracking."""

    def __init__(self):
        self.sessions: dict = defaultdict(list)
        self._languages: dict = defaultdict(set)  # session_id -> detected languages

    def add(self, session_id: str, role: str, text: str):
        """Add a message to the session history."""
        self.sessions[session_id].append({"role": role, "content": text})
        log.debug(f"Session '{session_id}' [{role}]: {text[:60]}...")

    def get(self, session_id: str) -> list:
        """Get the most recent messages for a session (configurable window)."""
        max_msgs = settings.max_context_messages
        return self.sessions[session_id][-max_msgs:]

    def track_languages(self, session_id: str, languages: Set[str]):
        """Track which languages have been used in a session."""
        self._languages[session_id].update(languages)

    def get_languages(self, session_id: str) -> Set[str]:
        """Get all languages detected in the session so far."""
        return self._languages.get(session_id, set())

    def clear(self, session_id: str):
        """Clear all history for a session."""
        self.sessions.pop(session_id, None)
        self._languages.pop(session_id, None)
        log.info(f"Cleared session '{session_id}'")

    def list_sessions(self) -> List[str]:
        """List all active session IDs."""
        return list(self.sessions.keys())

    def session_count(self) -> int:
        """Return the number of active sessions."""
        return len(self.sessions)


store = MemoryStore()