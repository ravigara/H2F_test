from __future__ import annotations

import re
from collections import Counter
from typing import Any, Optional

from .language import detect_scripts, get_dominant_language, split_sentences
from .memory import store
from .transcript_cleaner import clean_transcript

DEFAULT_WORKFLOWS = [
    {
        "name": "general",
        "display_name": "General Review",
        "description": "General-purpose summary, action tracking, and review notes.",
        "fields": [
            {"key": "summary", "label": "Summary", "type": "text"},
            {"key": "action_items", "label": "Action Items", "type": "list"},
            {"key": "follow_up_questions", "label": "Follow Up Questions", "type": "list"},
            {"key": "keywords", "label": "Keywords", "type": "list"},
            {"key": "entities", "label": "Entities", "type": "list"},
        ],
    },
    {
        "name": "intake",
        "display_name": "Intake Review",
        "description": "Capture concerns, requested actions, and next steps from an intake flow.",
        "fields": [
            {"key": "summary", "label": "Case Summary", "type": "text"},
            {"key": "reported_concerns", "label": "Reported Concerns", "type": "list"},
            {"key": "requested_actions", "label": "Requested Actions", "type": "list"},
            {"key": "next_steps", "label": "Next Steps", "type": "list"},
            {"key": "keywords", "label": "Keywords", "type": "list"},
        ],
    },
    {
        "name": "support",
        "display_name": "Support Review",
        "description": "Track issue summaries, symptoms, and follow-up resolution items.",
        "fields": [
            {"key": "issue_summary", "label": "Issue Summary", "type": "text"},
            {"key": "symptoms", "label": "Symptoms", "type": "list"},
            {"key": "requested_resolution", "label": "Requested Resolution", "type": "list"},
            {"key": "next_steps", "label": "Next Steps", "type": "list"},
            {"key": "keywords", "label": "Keywords", "type": "list"},
        ],
    },
]

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "hai", "i",
    "in", "is", "it", "ki", "na", "of", "on", "or", "that", "the", "this", "to", "we",
    "with", "you", "your", "me", "my", "our", "their", "they", "he", "she", "them",
}
_ACTION_MARKERS = ("need", "should", "must", "next", "todo", "follow", "resolve", "fix", "review")


def ensure_default_workflows() -> list[dict[str, Any]]:
    existing = {workflow["name"] for workflow in store.list_workflows()}
    for workflow in DEFAULT_WORKFLOWS:
        if workflow["name"] not in existing:
            store.upsert_workflow(
                workflow["name"],
                workflow["display_name"],
                workflow["description"],
                workflow["fields"],
            )
    return store.list_workflows()


def build_source_text(session_id: Optional[str] = None, text: str = "") -> str:
    cleaned_text = clean_transcript(text)
    if cleaned_text:
        return cleaned_text

    if not session_id:
        return ""

    messages = store.list_messages(session_id, limit=200)
    transcripts = store.list_transcripts(session_id=session_id, limit=50)
    parts: list[str] = []

    for message in messages:
        role = str(message["role"]).strip().capitalize() or "Message"
        content = clean_transcript(str(message["content"]))
        if content:
            parts.append(f"{role}: {content}")

    for transcript in transcripts:
        transcript_text = clean_transcript(str(transcript["text"]))
        if transcript_text:
            parts.append(f"Transcript: {transcript_text}")

    return clean_transcript("\n".join(parts))


def generate_structured_extraction(
    workflow_name: str,
    source_text: str,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    ensure_default_workflows()
    workflow = store.get_workflow(workflow_name) or store.get_workflow("general")
    cleaned = clean_transcript(source_text)
    if not cleaned:
        raise ValueError("Extraction source text is empty.")
    if workflow is None:
        raise ValueError("No extraction workflow is available.")

    sentences = split_sentences(cleaned)
    languages = detect_scripts(cleaned)
    languages.discard("unknown")
    if not languages:
        languages = {"en"}

    dominant_language = get_dominant_language(cleaned, languages.copy())
    action_items = _collect_action_items(sentences)
    follow_up_questions = [sentence for sentence in sentences if "?" in sentence]
    keywords = _extract_keywords(cleaned)
    entities = _extract_entities(cleaned)
    concerns = _collect_matching_sentences(sentences, ("issue", "problem", "concern", "request"))
    symptoms = _collect_matching_sentences(sentences, ("error", "slow", "fail", "issue", "problem"))
    next_steps = _collect_matching_sentences(sentences, ("next", "follow", "review", "resolve", "schedule"))

    summary = _build_summary(sentences)
    fields: dict[str, Any] = {
        "summary": summary,
        "action_items": action_items,
        "follow_up_questions": follow_up_questions,
        "keywords": keywords,
        "entities": entities,
        "reported_concerns": concerns,
        "requested_actions": action_items,
        "next_steps": next_steps or action_items,
        "issue_summary": summary,
        "symptoms": symptoms,
        "requested_resolution": action_items or next_steps,
    }

    configured_keys = [field.get("key", "") for field in workflow.get("fields", [])]
    filtered_fields = {
        key: fields.get(key, [] if field.get("type") == "list" else "")
        for field in workflow.get("fields", [])
        for key in [field.get("key", "")]
        if key
    }

    return {
        "workflow": workflow,
        "session_id": session_id,
        "source_text": cleaned,
        "dominant_language": dominant_language,
        "languages": sorted(languages),
        "field_order": configured_keys,
        "fields": filtered_fields,
    }


def _build_summary(sentences: list[str], max_sentences: int = 2) -> str:
    if not sentences:
        return ""
    return " ".join(sentences[:max_sentences]).strip()


def _collect_action_items(sentences: list[str]) -> list[str]:
    items = [sentence for sentence in sentences if any(marker in sentence.lower() for marker in _ACTION_MARKERS)]
    return items[:6]


def _collect_matching_sentences(sentences: list[str], markers: tuple[str, ...]) -> list[str]:
    items = [sentence for sentence in sentences if any(marker in sentence.lower() for marker in markers)]
    return items[:6]


def _extract_keywords(text: str, limit: int = 8) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", text.lower())
    filtered = [word for word in words if word not in _STOPWORDS]
    return [word for word, _ in Counter(filtered).most_common(limit)]


def _extract_entities(text: str, limit: int = 8) -> list[str]:
    matches = re.findall(r"\b[A-Z][A-Za-z0-9_-]{2,}\b", text)
    deduped: list[str] = []
    for item in matches:
        if item not in deduped:
            deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped
