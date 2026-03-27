from pydantic import BaseModel, Field
from typing import Optional, Set, List


class ChatRequest(BaseModel):
    """Request body for the text chat endpoint."""

    session_id: str = Field(default="default", description="Session identifier")
    text: str = Field(..., description="User message text")


class ChatResponse(BaseModel):
    """Response from the text chat endpoint."""

    text: str
    language: str
    languages: List[str] = []
    is_code_mixed: bool = False
    session_id: str


class TranscriptSegment(BaseModel):
    """A single transcript segment from ASR."""

    text: str
    language: Optional[str] = None
    engine: Optional[str] = None
    is_final: bool = True


class TranscribeResponse(BaseModel):
    """Response from the transcription endpoint."""

    text: str
    language: str
    languages: List[str] = []
    is_code_mixed: bool = False
    segments: List[TranscriptSegment] = []


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    model: str
    uptime_seconds: float
    sessions_active: int


class OrchestratorEvent(BaseModel):
    """Streaming event from the orchestrator."""

    type: str  # "delta", "final", "error", "language_info"
    text: Optional[str] = None
    language: Optional[str] = None
    languages: Optional[List[str]] = None
    is_code_mixed: Optional[bool] = None
    tts_plan: Optional[List[str]] = None
    error: Optional[str] = None