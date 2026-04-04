import type { TranscriptSegment, TtsSegmentPlan } from "./api";
import type { StructuredReviewRecord } from "./review";

export type DomainMode = "healthcare" | "financial";
export type AppView = "workspace" | "review" | "dashboard" | "outbound";
export type ConversationState =
  | "idle"
  | "recording"
  | "buffering"
  | "transcribing"
  | "generating"
  | "speaking"
  | "error";

export interface TranscriptTurn {
  id: string;
  source: "live-mic" | "file-upload";
  text: string;
  language: string;
  languages: string[];
  isCodeMixed: boolean;
  segments: TranscriptSegment[];
  createdAt: string;
}

export interface AssistantTurn {
  id: string;
  source: "text" | "audio" | "upload";
  text: string;
  language: string;
  languages: string[];
  isCodeMixed: boolean;
  ttsPlan: string[];
  ttsSegments: TtsSegmentPlan[];
  ttsLanguage: string;
  createdAt: string;
}

export interface SessionSnapshot {
  sessionId: string;
  domain: DomainMode;
  transcript: TranscriptTurn | null;
  assistant: AssistantTurn | null;
  review: StructuredReviewRecord | null;
  languages: string[];
  isCodeMixed: boolean;
  lastUpdatedAt: string;
}

export interface DashboardRecord {
  sessionId: string;
  domain: DomainMode | "unknown";
  transcriptPreview: string;
  assistantPreview: string;
  languages: string[];
  reviewStatus: string;
  sourceLabel: string;
  lastUpdatedAt: string;
  isActive: boolean;
  isPersisted: boolean;
}

export interface TtsPlaybackState {
  audioUrl: string;
  fileName: string;
  language: string;
  provider: string;
  mimeType: string;
  sampleRate: number;
  text: string;
  createdAt: string;
  chunkCount: number;
}
