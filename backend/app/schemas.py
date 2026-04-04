from typing import List, Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Request body for the text chat endpoint."""

    session_id: str = Field(default="default", description="Session identifier")
    text: str = Field(..., description="User message text")


class ChatResponse(BaseModel):
    """Response from the text chat endpoint."""

    text: str
    language: str
    languages: List[str] = Field(default_factory=list)
    is_code_mixed: bool = False
    session_id: str


class TranscriptSegment(BaseModel):
    """A single transcript segment from ASR."""

    index: Optional[int] = None
    text: str
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    language: Optional[str] = None
    languages: Optional[List[str]] = None
    dominant_language: Optional[str] = None
    engine: Optional[str] = None
    is_code_mixed: Optional[bool] = None
    is_final: bool = True


class TranscribeResponse(BaseModel):
    """Response from the transcription endpoint."""

    text: str
    language: str
    languages: List[str] = Field(default_factory=list)
    is_code_mixed: bool = False
    segments: List[TranscriptSegment] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    model: str
    uptime_seconds: float
    sessions_active: int
    tts_enabled: bool = False
    tts_ready: bool = False
    tts_providers: List[str] = Field(default_factory=list)
    tts_real_speech_ready: bool = False
    tts_real_providers: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class TTSRequest(BaseModel):
    """Request body for TTS synthesis."""

    text: str = Field(..., description="Text to synthesize")
    language: Optional[str] = Field(default=None, description="Preferred response language")
    languages: List[str] = Field(default_factory=list)


class TTSResponse(BaseModel):
    """Response body for synthesized audio."""

    text: str
    language: str
    provider: str
    mime_type: str
    sample_rate: int
    audio_b64: str


class OrchestratorEvent(BaseModel):
    """Streaming event from the orchestrator."""

    type: str
    text: Optional[str] = None
    language: Optional[str] = None
    languages: Optional[List[str]] = None
    is_code_mixed: Optional[bool] = None
    segments: Optional[List[TranscriptSegment]] = None
    tts_plan: Optional[List[str]] = None
    tts_segments: Optional[List[dict]] = None
    tts_language: Optional[str] = None
    provider: Optional[str] = None
    mime_type: Optional[str] = None
    sample_rate: Optional[int] = None
    audio_b64: Optional[str] = None
    error: Optional[str] = None


class SessionSummary(BaseModel):
    session_id: str
    created_at: str
    updated_at: str
    languages: List[str] = Field(default_factory=list)
    selected_language: str = ""
    message_count: int = 0
    transcript_count: int = 0
    telemetry_count: int = 0


class MessageRecord(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    created_at: str


class TranscriptRecord(BaseModel):
    id: int
    session_id: Optional[str] = None
    source: str
    text: str
    dominant_language: str = ""
    languages: List[str] = Field(default_factory=list)
    is_code_mixed: bool = False
    segments: List[dict] = Field(default_factory=list)
    details: dict = Field(default_factory=dict)
    created_at: str


class TelemetryRecord(BaseModel):
    id: int
    session_id: Optional[str] = None
    kind: str
    name: str
    status: str = ""
    latency_ms: Optional[float] = None
    error_message: str = ""
    details: dict = Field(default_factory=dict)
    created_at: str


class SearchResult(BaseModel):
    source_type: str
    record_id: int
    session_id: Optional[str] = None
    subtype: str
    text: str
    snippet: str
    created_at: str


class DashboardSummary(BaseModel):
    session_count: int
    message_count: int
    transcript_count: int
    telemetry_count: int
    error_count: int
    workflow_count: int
    extraction_count: int
    language_counts: dict = Field(default_factory=dict)
    recent_sessions: List[SessionSummary] = Field(default_factory=list)


class WorkflowField(BaseModel):
    key: str
    label: str
    type: str = "text"


class WorkflowConfig(BaseModel):
    name: str
    display_name: str
    description: str = ""
    fields: List[WorkflowField] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorkflowUpdateRequest(BaseModel):
    display_name: str
    description: str = ""
    fields: List[WorkflowField] = Field(default_factory=list)


class ExtractionGenerateRequest(BaseModel):
    workflow_name: str = "general"
    session_id: Optional[str] = None
    text: str = ""


class ExtractionReviewUpdateRequest(BaseModel):
    reviewed_data: dict = Field(default_factory=dict)
    status: str = "reviewed"
    notes: str = ""


class ExtractionRecord(BaseModel):
    id: int
    session_id: Optional[str] = None
    workflow_name: str
    source_text: str
    generated_data: dict = Field(default_factory=dict)
    reviewed_data: dict = Field(default_factory=dict)
    effective_data: dict = Field(default_factory=dict)
    status: str = "generated"
    notes: str = ""
    created_at: str
    updated_at: str
