export interface TranscriptSegment {
  index?: number;
  text: string;
  start_ms?: number;
  end_ms?: number;
  language?: string;
  languages?: string[];
  dominant_language?: string;
  engine?: string;
  is_code_mixed?: boolean;
  is_final?: boolean;
}

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
  errors: string[];
  warnings: string[];
}

export interface ChatRequest {
  session_id: string;
  text: string;
}

export interface ChatResponse {
  text: string;
  language: string;
  languages: string[];
  is_code_mixed: boolean;
  session_id: string;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  languages: string[];
  is_code_mixed: boolean;
  segments: TranscriptSegment[];
}

export interface TtsSegmentPlan {
  text: string;
  language?: string;
  languages?: string[];
}

export interface TtsRequest {
  text: string;
  language?: string;
  languages?: string[];
}

export interface TtsResponse {
  text: string;
  language: string;
  provider: string;
  mime_type: string;
  sample_rate: number;
  audio_b64: string;
}

export interface SessionListResponse {
  sessions: string[];
  count: number;
}

export interface LanguageInfoEvent {
  type: "language_info";
  languages?: string[];
  dominant_language?: string;
  is_code_mixed?: boolean;
}

export interface DeltaEvent {
  type: "delta";
  text: string;
}

export interface FinalEvent {
  type: "final";
  text?: string;
  status?: string;
  language?: string;
  languages?: string[];
  is_code_mixed?: boolean;
  tts_plan?: string[];
  tts_segments?: TtsSegmentPlan[];
  tts_language?: string;
  provider?: string;
  mime_type?: string;
  sample_rate?: number;
  audio_b64?: string;
  segment_count?: number;
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
  reason?: string;
}

export interface AudioResetEvent {
  type: "audio_reset";
}

export interface PongEvent {
  type: "pong";
}

export interface TtsInfoEvent {
  type: "tts_info";
  session_id: string;
  segment_count: number;
  available_providers: string[];
}

export interface TtsAudioChunkEvent {
  type: "audio_chunk";
  segment_index: number;
  text: string;
  language?: string;
  provider?: string;
  mime_type?: string;
  sample_rate?: number;
  duration_ms?: number;
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
  | AudioResetEvent
  | PongEvent
  | ErrorEvent;

export type TtsSocketEvent = TtsInfoEvent | TtsAudioChunkEvent | FinalEvent | ErrorEvent;
