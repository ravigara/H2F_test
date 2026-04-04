from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable, List, Optional, Set

from .config import settings
from .logger import get_logger

log = get_logger("memory")


def _normalize_languages(languages: Optional[Iterable[str]]) -> list[str]:
    normalized = sorted(
        {
            str(language).strip()
            for language in (languages or [])
            if str(language).strip() and str(language).strip() != "unknown"
        }
    )
    return normalized


def _json_load(raw_value: Optional[str], fallback: Any) -> Any:
    if raw_value in {None, ""}:
        return fallback

    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return fallback


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


class PersistentStore:
    """SQLite-backed session store for chat history, transcripts, and telemetry."""

    def __init__(self, db_path: str):
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    languages_json TEXT NOT NULL DEFAULT '[]',
                    selected_language TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_messages_session_id
                ON messages(session_id, id);

                CREATE TABLE IF NOT EXISTS transcripts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    source TEXT NOT NULL,
                    text TEXT NOT NULL,
                    dominant_language TEXT NOT NULL DEFAULT '',
                    languages_json TEXT NOT NULL DEFAULT '[]',
                    is_code_mixed INTEGER NOT NULL DEFAULT 0,
                    segments_json TEXT NOT NULL DEFAULT '[]',
                    details_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_transcripts_session_id
                ON transcripts(session_id, id);

                CREATE TABLE IF NOT EXISTS telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    kind TEXT NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT '',
                    latency_ms REAL,
                    error_message TEXT NOT NULL DEFAULT '',
                    details_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_telemetry_session_id
                ON telemetry(session_id, id);

                CREATE TABLE IF NOT EXISTS workflows (
                    name TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    fields_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS extractions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    workflow_name TEXT NOT NULL,
                    source_text TEXT NOT NULL DEFAULT '',
                    generated_json TEXT NOT NULL DEFAULT '{}',
                    reviewed_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'generated',
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE SET NULL,
                    FOREIGN KEY(workflow_name) REFERENCES workflows(name) ON DELETE RESTRICT
                );

                CREATE INDEX IF NOT EXISTS idx_extractions_session_id
                ON extractions(session_id, id);

                CREATE INDEX IF NOT EXISTS idx_extractions_workflow_name
                ON extractions(workflow_name, id);
                """
            )

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _ensure_session(self, session_id: Optional[str]) -> None:
        if not session_id:
            return

        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO sessions(session_id)
                VALUES (?)
                ON CONFLICT(session_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                """,
                (session_id,),
            )

    def _touch_session(self, session_id: Optional[str]) -> None:
        if not session_id:
            return

        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ?",
                (session_id,),
            )

    def _row_to_session_summary(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "session_id": str(row["session_id"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "languages": _normalize_languages(_json_load(row["languages_json"], [])),
            "selected_language": row["selected_language"] or "",
            "message_count": int(row["message_count"] or 0),
            "transcript_count": int(row["transcript_count"] or 0),
            "telemetry_count": int(row["telemetry_count"] or 0),
        }

    def _row_to_transcript_record(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "session_id": row["session_id"],
            "source": row["source"],
            "text": row["text"],
            "dominant_language": row["dominant_language"] or "",
            "languages": _normalize_languages(_json_load(row["languages_json"], [])),
            "is_code_mixed": bool(row["is_code_mixed"]),
            "segments": _json_load(row["segments_json"], []),
            "details": _json_load(row["details_json"], {}),
            "created_at": row["created_at"],
        }

    def _row_to_telemetry_record(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "session_id": row["session_id"],
            "kind": row["kind"],
            "name": row["name"],
            "status": row["status"] or "",
            "latency_ms": float(row["latency_ms"]) if row["latency_ms"] is not None else None,
            "error_message": row["error_message"] or "",
            "details": _json_load(row["details_json"], {}),
            "created_at": row["created_at"],
        }

    def _row_to_workflow(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "name": row["name"],
            "display_name": row["display_name"],
            "description": row["description"] or "",
            "fields": _json_load(row["fields_json"], []),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _row_to_extraction(self, row: sqlite3.Row) -> dict[str, Any]:
        generated = _json_load(row["generated_json"], {})
        reviewed = _json_load(row["reviewed_json"], {})
        return {
            "id": int(row["id"]),
            "session_id": row["session_id"],
            "workflow_name": row["workflow_name"],
            "source_text": row["source_text"],
            "generated_data": generated,
            "reviewed_data": reviewed,
            "effective_data": reviewed or generated,
            "status": row["status"] or "generated",
            "notes": row["notes"] or "",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def add(self, session_id: str, role: str, text: str) -> None:
        """Add a message to the persisted session history."""
        self._ensure_session(session_id)
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO messages(session_id, role, content)
                VALUES (?, ?, ?)
                """,
                (session_id, role, text),
            )
            self._conn.execute(
                "UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ?",
                (session_id,),
            )
        log.debug(f"Session '{session_id}' [{role}]: {text[:60]}...")

    def get(self, session_id: str) -> list:
        """Get the most recent messages for a session (configurable window)."""
        max_msgs = settings.max_context_messages
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT role, content
                FROM messages
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, max_msgs),
            ).fetchall()

        history = [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]
        return history

    def list_messages(self, session_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, session_id, role, content, created_at
                FROM messages
                WHERE session_id = ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (session_id, max(1, int(limit))),
            ).fetchall()

        return [
            {
                "id": int(row["id"]),
                "session_id": row["session_id"],
                "role": row["role"],
                "content": row["content"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def track_languages(self, session_id: str, languages: Set[str]) -> None:
        """Track which languages have been used in a session."""
        self._ensure_session(session_id)
        existing = self.get_languages(session_id)
        merged = _normalize_languages(existing.union(languages))
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE sessions
                SET languages_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE session_id = ?
                """,
                (_json_dump(merged), session_id),
            )

    def get_languages(self, session_id: str) -> Set[str]:
        """Get all languages detected in the session so far."""
        with self._lock:
            row = self._conn.execute(
                "SELECT languages_json FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()

        if not row:
            return set()

        return set(_normalize_languages(_json_load(row["languages_json"], [])))

    def set_selected_language(self, session_id: str, language: Optional[str]) -> None:
        if not session_id or not language:
            return

        self._ensure_session(session_id)
        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE sessions
                SET selected_language = ?, updated_at = CURRENT_TIMESTAMP
                WHERE session_id = ?
                """,
                (language, session_id),
            )

    def record_transcript(
        self,
        session_id: Optional[str],
        source: str,
        text: str,
        dominant_language: Optional[str],
        languages: Optional[Iterable[str]],
        is_code_mixed: bool,
        segments: Optional[list],
        details: Optional[dict] = None,
    ) -> None:
        if session_id:
            self._ensure_session(session_id)
            normalized_languages = set(_normalize_languages(languages))
            if normalized_languages:
                self.track_languages(session_id, normalized_languages)
            if dominant_language:
                self.set_selected_language(session_id, dominant_language)
        else:
            normalized_languages = set(_normalize_languages(languages))

        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO transcripts(
                    session_id,
                    source,
                    text,
                    dominant_language,
                    languages_json,
                    is_code_mixed,
                    segments_json,
                    details_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    source,
                    text,
                    dominant_language or "",
                    _json_dump(sorted(normalized_languages)),
                    int(bool(is_code_mixed)),
                    _json_dump(segments or []),
                    _json_dump(details or {}),
                ),
            )

        self._touch_session(session_id)

    def list_transcripts(
        self,
        session_id: Optional[str] = None,
        limit: int = 100,
        search_query: str = "",
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []

        if session_id:
            conditions.append("session_id = ?")
            params.append(session_id)
        if search_query.strip():
            conditions.append("LOWER(text) LIKE ?")
            params.append(f"%{search_query.strip().lower()}%")

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(max(1, int(limit)))

        query = f"""
            SELECT id, session_id, source, text, dominant_language, languages_json,
                   is_code_mixed, segments_json, details_json, created_at
            FROM transcripts
            {where_clause}
            ORDER BY id DESC
            LIMIT ?
        """

        with self._lock:
            rows = self._conn.execute(query, tuple(params)).fetchall()

        return [self._row_to_transcript_record(row) for row in rows]

    def record_latency(
        self,
        session_id: Optional[str],
        name: str,
        latency_ms: float,
        status: str = "ok",
        details: Optional[dict] = None,
    ) -> None:
        if session_id:
            self._ensure_session(session_id)

        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO telemetry(
                    session_id,
                    kind,
                    name,
                    status,
                    latency_ms,
                    details_json
                )
                VALUES (?, 'latency', ?, ?, ?, ?)
                """,
                (
                    session_id,
                    name,
                    status,
                    float(latency_ms),
                    _json_dump(details or {}),
                ),
            )

        self._touch_session(session_id)

    def record_error(
        self,
        session_id: Optional[str],
        name: str,
        error_message: str,
        details: Optional[dict] = None,
    ) -> None:
        if session_id:
            self._ensure_session(session_id)

        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO telemetry(
                    session_id,
                    kind,
                    name,
                    status,
                    error_message,
                    details_json
                )
                VALUES (?, 'error', ?, 'error', ?, ?)
                """,
                (
                    session_id,
                    name,
                    error_message,
                    _json_dump(details or {}),
                ),
            )

        self._touch_session(session_id)

    def list_telemetry(
        self,
        session_id: Optional[str] = None,
        limit: int = 100,
        kind: str = "",
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []

        if session_id:
            conditions.append("session_id = ?")
            params.append(session_id)
        if kind.strip():
            conditions.append("kind = ?")
            params.append(kind.strip())

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(max(1, int(limit)))

        query = f"""
            SELECT id, session_id, kind, name, status, latency_ms, error_message, details_json, created_at
            FROM telemetry
            {where_clause}
            ORDER BY id DESC
            LIMIT ?
        """

        with self._lock:
            rows = self._conn.execute(query, tuple(params)).fetchall()

        return [self._row_to_telemetry_record(row) for row in rows]

    def clear(self, session_id: str) -> None:
        """Clear all persisted history for a session."""
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        log.info(f"Cleared session '{session_id}'")

    def list_sessions(self) -> List[str]:
        """List all active session IDs."""
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT session_id
                FROM sessions
                ORDER BY updated_at DESC, session_id ASC
                """
            ).fetchall()
        return [str(row["session_id"]) for row in rows]

    def list_sessions_detailed(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT
                    s.session_id,
                    s.created_at,
                    s.updated_at,
                    s.languages_json,
                    s.selected_language,
                    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.session_id) AS message_count,
                    (SELECT COUNT(*) FROM transcripts t WHERE t.session_id = s.session_id) AS transcript_count,
                    (SELECT COUNT(*) FROM telemetry y WHERE y.session_id = s.session_id) AS telemetry_count
                FROM sessions s
                ORDER BY s.updated_at DESC, s.session_id ASC
                LIMIT ?
                """,
                (max(1, int(limit)),),
            ).fetchall()

        return [self._row_to_session_summary(row) for row in rows]

    def get_session_detail(self, session_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT
                    s.session_id,
                    s.created_at,
                    s.updated_at,
                    s.languages_json,
                    s.selected_language,
                    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.session_id) AS message_count,
                    (SELECT COUNT(*) FROM transcripts t WHERE t.session_id = s.session_id) AS transcript_count,
                    (SELECT COUNT(*) FROM telemetry y WHERE y.session_id = s.session_id) AS telemetry_count
                FROM sessions s
                WHERE s.session_id = ?
                """,
                (session_id,),
            ).fetchone()

        if not row:
            return None

        return self._row_to_session_summary(row)

    def session_count(self) -> int:
        """Return the number of active sessions."""
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS count FROM sessions").fetchone()
        return int(row["count"]) if row else 0

    def dashboard_summary(self, recent_limit: int = 10) -> dict[str, Any]:
        with self._lock:
            message_row = self._conn.execute("SELECT COUNT(*) AS count FROM messages").fetchone()
            transcript_row = self._conn.execute("SELECT COUNT(*) AS count FROM transcripts").fetchone()
            telemetry_row = self._conn.execute("SELECT COUNT(*) AS count FROM telemetry").fetchone()
            error_row = self._conn.execute(
                "SELECT COUNT(*) AS count FROM telemetry WHERE kind = 'error'"
            ).fetchone()
            workflow_row = self._conn.execute("SELECT COUNT(*) AS count FROM workflows").fetchone()
            extraction_row = self._conn.execute("SELECT COUNT(*) AS count FROM extractions").fetchone()

        session_count = self.session_count()
        recent_sessions = self.list_sessions_detailed(limit=recent_limit)
        all_sessions = self.list_sessions_detailed(limit=max(session_count, 1))
        language_counts: dict[str, int] = {}
        for session in all_sessions:
            for language in session["languages"]:
                language_counts[language] = language_counts.get(language, 0) + 1

        return {
            "session_count": session_count,
            "message_count": int(message_row["count"]) if message_row else 0,
            "transcript_count": int(transcript_row["count"]) if transcript_row else 0,
            "telemetry_count": int(telemetry_row["count"]) if telemetry_row else 0,
            "error_count": int(error_row["count"]) if error_row else 0,
            "workflow_count": int(workflow_row["count"]) if workflow_row else 0,
            "extraction_count": int(extraction_row["count"]) if extraction_row else 0,
            "language_counts": language_counts,
            "recent_sessions": recent_sessions,
        }

    def search(self, query: str, limit: int = 25) -> list[dict[str, Any]]:
        cleaned_query = query.strip().lower()
        if not cleaned_query:
            return []

        like_query = f"%{cleaned_query}%"
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT source_type, record_id, session_id, subtype, text, created_at
                FROM (
                    SELECT
                        'message' AS source_type,
                        id AS record_id,
                        session_id,
                        role AS subtype,
                        content AS text,
                        created_at
                    FROM messages
                    WHERE LOWER(content) LIKE ?
                    UNION ALL
                    SELECT
                        'transcript' AS source_type,
                        id AS record_id,
                        session_id,
                        source AS subtype,
                        text,
                        created_at
                    FROM transcripts
                    WHERE LOWER(text) LIKE ?
                )
                ORDER BY created_at DESC, record_id DESC
                LIMIT ?
                """,
                (like_query, like_query, max(1, int(limit))),
            ).fetchall()

        return [
            {
                "source_type": row["source_type"],
                "record_id": int(row["record_id"]),
                "session_id": row["session_id"],
                "subtype": row["subtype"],
                "text": row["text"],
                "snippet": self._truncate_text(row["text"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def _truncate_text(self, text: str, max_length: int = 180) -> str:
        cleaned = (text or "").strip()
        if len(cleaned) <= max_length:
            return cleaned
        return cleaned[: max_length - 3].rstrip() + "..."

    def list_workflows(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT name, display_name, description, fields_json, created_at, updated_at
                FROM workflows
                ORDER BY name ASC
                """
            ).fetchall()

        return [self._row_to_workflow(row) for row in rows]

    def get_workflow(self, name: str) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT name, display_name, description, fields_json, created_at, updated_at
                FROM workflows
                WHERE name = ?
                """,
                (name,),
            ).fetchone()

        if not row:
            return None

        return self._row_to_workflow(row)

    def upsert_workflow(
        self,
        name: str,
        display_name: str,
        description: str,
        fields: list[dict[str, Any]],
    ) -> dict[str, Any]:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO workflows(name, display_name, description, fields_json)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    display_name = excluded.display_name,
                    description = excluded.description,
                    fields_json = excluded.fields_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (name, display_name, description, _json_dump(fields)),
            )

        workflow = self.get_workflow(name)
        if workflow is None:
            raise RuntimeError(f"Failed to store workflow '{name}'.")
        return workflow

    def create_extraction(
        self,
        workflow_name: str,
        source_text: str,
        generated_data: dict[str, Any],
        session_id: Optional[str] = None,
        reviewed_data: Optional[dict[str, Any]] = None,
        status: str = "generated",
        notes: str = "",
    ) -> dict[str, Any]:
        if session_id:
            self._ensure_session(session_id)

        with self._lock, self._conn:
            cursor = self._conn.execute(
                """
                INSERT INTO extractions(
                    session_id,
                    workflow_name,
                    source_text,
                    generated_json,
                    reviewed_json,
                    status,
                    notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    workflow_name,
                    source_text,
                    _json_dump(generated_data),
                    _json_dump(reviewed_data or {}),
                    status,
                    notes,
                ),
            )

        extraction = self.get_extraction(int(cursor.lastrowid))
        if extraction is None:
            raise RuntimeError("Failed to read newly created extraction record.")
        return extraction

    def get_extraction(self, extraction_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, session_id, workflow_name, source_text, generated_json,
                       reviewed_json, status, notes, created_at, updated_at
                FROM extractions
                WHERE id = ?
                """,
                (int(extraction_id),),
            ).fetchone()

        if not row:
            return None

        return self._row_to_extraction(row)

    def list_extractions(
        self,
        session_id: Optional[str] = None,
        workflow_name: str = "",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []

        if session_id:
            conditions.append("session_id = ?")
            params.append(session_id)
        if workflow_name.strip():
            conditions.append("workflow_name = ?")
            params.append(workflow_name.strip())

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(max(1, int(limit)))

        query = f"""
            SELECT id, session_id, workflow_name, source_text, generated_json,
                   reviewed_json, status, notes, created_at, updated_at
            FROM extractions
            {where_clause}
            ORDER BY id DESC
            LIMIT ?
        """

        with self._lock:
            rows = self._conn.execute(query, tuple(params)).fetchall()

        return [self._row_to_extraction(row) for row in rows]

    def update_extraction_review(
        self,
        extraction_id: int,
        reviewed_data: Optional[dict[str, Any]] = None,
        status: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        current = self.get_extraction(extraction_id)
        if current is None:
            return None

        next_reviewed = reviewed_data if reviewed_data is not None else current["reviewed_data"]
        next_status = status or current["status"]
        next_notes = notes if notes is not None else current["notes"]

        with self._lock, self._conn:
            self._conn.execute(
                """
                UPDATE extractions
                SET reviewed_json = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (_json_dump(next_reviewed or {}), next_status, next_notes, int(extraction_id)),
            )

        return self.get_extraction(extraction_id)


store = PersistentStore(settings.persistence_db_path)
