export type Domain = "healthcare" | "financial";
export type AppView = "workspace" | "review" | "history" | "outbound";
export type ActivityState =
  | "idle"
  | "recording"
  | "buffering"
  | "transcribing"
  | "generating"
  | "speaking"
  | "error";
export type SocketStatus = "connecting" | "open" | "closed" | "error";

export interface HealthResponse {
  status: string;
  model: string;
  uptime_seconds: number;
  sessions_active: number;
  tts_enabled: boolean;
  tts_ready: boolean;
  tts_providers: string[];
  tts_real_speech_ready: boolean;
  tts_real_providers: string[];
  warnings: string[];
  errors: string[];
}

export interface TranscriptSegment {
  index?: number | null;
  text: string;
  start_ms?: number | null;
  end_ms?: number | null;
  language?: string | null;
  languages?: string[] | null;
  dominant_language?: string | null;
  engine?: string | null;
  is_code_mixed?: boolean | null;
  is_final?: boolean;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  languages: string[];
  is_code_mixed: boolean;
  segments: TranscriptSegment[];
}

export interface ChatResponse {
  text: string;
  language: string;
  languages: string[];
  is_code_mixed: boolean;
  session_id: string;
}

export interface TtsResponse {
  text: string;
  language: string;
  provider: string;
  mime_type: string;
  sample_rate: number;
  audio_b64: string;
}

export interface LanguageInfoEvent {
  type: "language_info";
  languages: string[];
  dominant_language?: string;
  is_code_mixed?: boolean;
}

export interface DeltaEvent {
  type: "delta";
  text: string;
}

export interface FinalEvent {
  type: "final";
  text: string;
  language?: string;
  languages?: string[];
  is_code_mixed?: boolean;
  tts_plan?: string[];
  tts_segments?: TtsSegmentInput[];
  tts_language?: string;
}

export interface ErrorEvent {
  type: "error";
  error: string;
}

export interface TranscriptionEvent {
  type: "transcription";
  text: string;
  language?: string;
  languages?: string[];
  is_code_mixed?: boolean;
  segments?: TranscriptSegment[];
}

export interface AudioConfigEvent {
  type: "audio_config";
  sample_rate: number;
  channels: number;
  sample_width: number;
  encoding: string;
  max_chunk_bytes: number;
}

export interface AudioSkippedEvent {
  type: "audio_skipped";
  reason: string;
}

export interface PongEvent {
  type: "pong";
}

export interface AudioResetEvent {
  type: "audio_reset";
}

export interface TtsSegmentInput {
  text: string;
  language?: string;
  languages?: string[];
}

export interface TtsInfoEvent {
  type: "tts_info";
  session_id: string;
  segment_count: number;
  available_providers: string[];
}

export interface TtsChunkEvent {
  type: "audio_chunk";
  segment_index: number;
  text: string;
  language: string;
  provider: string;
  mime_type: string;
  sample_rate: number;
  duration_ms?: number;
  audio_b64: string;
}

export interface TtsFinalEvent {
  type: "final";
  status: string;
  text: string;
  language: string;
  provider: string;
  mime_type: string;
  sample_rate: number;
  segment_count: number;
  audio_b64: string;
}

export type TextSocketEvent = LanguageInfoEvent | DeltaEvent | FinalEvent | ErrorEvent;
export type AudioSocketEvent =
  | AudioConfigEvent
  | TranscriptionEvent
  | LanguageInfoEvent
  | DeltaEvent
  | FinalEvent
  | AudioSkippedEvent
  | ErrorEvent
  | PongEvent
  | AudioResetEvent;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  source: "typed" | "voice" | "backend" | "system";
  text: string;
  createdAt: string;
  language?: string;
  languages: string[];
  isCodeMixed?: boolean;
  meta?: string;
}

export interface TranscriptState {
  text: string;
  language: string;
  languages: string[];
  isCodeMixed: boolean;
  segments: TranscriptSegment[];
  source: "upload" | "microphone";
  createdAt: string;
}

export interface TtsPlaybackState {
  text: string;
  language: string;
  provider: string;
  mimeType: string;
  sampleRate: number;
  audioUrl: string;
  createdAt: string;
  segments: TtsChunkEvent[];
}

export interface StructuredReviewDraft {
  generatedAt: string;
  note: string;
  generic: Record<string, string>;
  domainSpecific: Record<string, string>;
  sourceSummary: string[];
}

export interface SessionSnapshot {
  sessionId: string;
  domain: Domain;
  messages: ChatMessage[];
  latestTranscript: TranscriptState | null;
  latestTts: TtsPlaybackState | null;
  reviewDraft: StructuredReviewDraft | null;
  updatedAt: string;
}

export interface DashboardCard {
  sessionId: string;
  domain: Domain;
  current: boolean;
  inBackend: boolean;
  hasLocalData: boolean;
  updatedAt: string;
  languages: string[];
  assistantPreview: string;
  transcriptPreview: string;
  messageCount: number;
}
