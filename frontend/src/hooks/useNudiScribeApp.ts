import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";

import { LocalDashboardAdapter } from "../adapters/dashboardAdapter";
import { MockStructuredReviewAdapter } from "../adapters/reviewAdapter";
import { buildObjectUrlFromBase64, PcmRecorder, revokeObjectUrl } from "../lib/audio";
import {
  createSessionId,
  listLocalSnapshots,
  loadSessionSnapshot,
  loadStoredDomain,
  loadStoredSessionId,
  removeSessionSnapshot,
  saveSessionSnapshot,
  storeActiveDomain,
  storeActiveSessionId,
} from "../lib/session";
import { ApiClient } from "../services/apiClient";
import { AudioStreamSocket } from "../services/audioStreamSocket";
import { TextChatSocket, type SocketConnectionState } from "../services/textChatSocket";
import { TtsSocket } from "../services/ttsSocket";
import type { FinalEvent, HealthResponse, TranscribeResponse, TtsResponse } from "../types/api";
import type {
  AssistantTurn,
  AppView,
  ConversationState,
  DomainMode,
  SessionSnapshot,
  TranscriptTurn,
  TtsPlaybackState,
} from "../types/domain";
import type { StructuredReviewRecord } from "../types/review";

const apiClient = new ApiClient();
const reviewAdapter = new MockStructuredReviewAdapter();
const dashboardAdapter = new LocalDashboardAdapter();

interface LanguageState {
  dominantLanguage: string;
  languages: string[];
  isCodeMixed: boolean;
}

function buildFallbackHealth(error: string): HealthResponse {
  return {
    status: "degraded",
    model: "unavailable",
    uptime_seconds: 0,
    sessions_active: 0,
    tts_enabled: false,
    tts_ready: false,
    tts_providers: [],
    tts_real_speech_ready: false,
    tts_real_providers: [],
    errors: [error],
    warnings: [],
  };
}

function mergeLanguages(
  ...collections: Array<ReadonlyArray<string | undefined> | undefined>
): string[] {
  return Array.from(
    new Set(
      collections
        .flatMap((collection) => Array.from(collection ?? []))
        .map((value) => String(value ?? "").trim())
        .filter((value) => value && value !== "unknown"),
    ),
  );
}

function buildTtsPlan(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildEmptyReview(domain: DomainMode): StructuredReviewRecord {
  return reviewAdapter.extract({
    domain,
    transcriptText: "",
    assistantText: "",
    transcriptSegments: [],
    languages: [],
    isCodeMixed: false,
  });
}

function buildTranscriptTurn(
  payload: Pick<TranscribeResponse, "text" | "language" | "languages" | "is_code_mixed" | "segments">,
  source: TranscriptTurn["source"],
): TranscriptTurn {
  return {
    id: crypto.randomUUID(),
    source,
    text: payload.text,
    language: payload.language || "unknown",
    languages: payload.languages ?? [],
    isCodeMixed: Boolean(payload.is_code_mixed),
    segments: payload.segments ?? [],
    createdAt: new Date().toISOString(),
  };
}

function buildAssistantTurn(
  event: FinalEvent,
  source: AssistantTurn["source"],
  fallbackText: string,
  fallbackLanguages: string[],
  fallbackLanguage: string,
  fallbackIsCodeMixed: boolean,
): AssistantTurn {
  const text = (event.text ?? fallbackText).trim();
  const languages = mergeLanguages(event.languages, fallbackLanguages);
  const language = event.language ?? fallbackLanguage ?? languages[0] ?? "en";
  const ttsPlan = event.tts_plan && event.tts_plan.length > 0 ? event.tts_plan : buildTtsPlan(text);
  const ttsSegments =
    event.tts_segments && event.tts_segments.length > 0
      ? event.tts_segments
      : ttsPlan.map((segmentText) => ({
          text: segmentText,
          language,
          languages,
        }));

  return {
    id: crypto.randomUUID(),
    source,
    text,
    language,
    languages,
    isCodeMixed: event.is_code_mixed ?? fallbackIsCodeMixed,
    ttsPlan,
    ttsSegments,
    ttsLanguage: event.tts_language ?? language,
    createdAt: new Date().toISOString(),
  };
}

function buildSnapshot(
  sessionId: string,
  domain: DomainMode,
  transcript: TranscriptTurn | null,
  assistant: AssistantTurn | null,
  review: StructuredReviewRecord,
  languageInfo: LanguageState,
): SessionSnapshot {
  return {
    sessionId,
    domain,
    transcript,
    assistant,
    review,
    languages: mergeLanguages(languageInfo.languages, transcript?.languages, assistant?.languages),
    isCodeMixed:
      languageInfo.isCodeMixed || Boolean(transcript?.isCodeMixed) || Boolean(assistant?.isCodeMixed),
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function useNudiScribeApp() {
  const [view, setView] = useState<AppView>("workspace");
  const [domain, setDomainState] = useState<DomainMode>(() => loadStoredDomain() ?? "healthcare");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [sessions, setSessions] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => loadStoredSessionId() ?? createSessionId(),
  );
  const [connectionState, setConnectionState] = useState<SocketConnectionState>("closed");
  const [conversationState, setConversationState] = useState<ConversationState>("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Checking backend status and loading the active workflow.",
  );
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [lastUserText, setLastUserText] = useState("");
  const [transcript, setTranscript] = useState<TranscriptTurn | null>(null);
  const [assistant, setAssistant] = useState<AssistantTurn | null>(null);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [languageInfo, setLanguageInfo] = useState<LanguageState>({
    dominantLanguage: "",
    languages: [],
    isCodeMixed: false,
  });
  const [reviewRecord, setReviewRecord] = useState<StructuredReviewRecord>(() =>
    buildEmptyReview(loadStoredDomain() ?? "healthcare"),
  );
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [dashboardQuery, setDashboardQuery] = useState("");
  const [ttsPlayback, setTtsPlayback] = useState<TtsPlaybackState | null>(null);
  const [ttsChunkCount, setTtsChunkCount] = useState(0);
  const [snapshotTick, setSnapshotTick] = useState(0);
  const deferredDashboardQuery = useDeferredValue(dashboardQuery);

  const textSocketRef = useRef<TextChatSocket | null>(null);
  const audioSocketRef = useRef<AudioStreamSocket | null>(null);
  const recorderRef = useRef<PcmRecorder | null>(null);
  const ttsSocketRef = useRef<TtsSocket | null>(null);
  const assistantDraftRef = useRef("");
  const transcriptRef = useRef<TranscriptTurn | null>(null);
  const assistantRef = useRef<AssistantTurn | null>(null);
  const domainRef = useRef(domain);
  const languageInfoRef = useRef(languageInfo);
  const ttsPlaybackRef = useRef<TtsPlaybackState | null>(null);
  const pendingAssistantSourceRef = useRef<AssistantTurn["source"]>("text");

  function setTranscriptState(value: TranscriptTurn | null): void {
    transcriptRef.current = value;
    setTranscript(value);
  }

  function setAssistantState(value: AssistantTurn | null): void {
    assistantRef.current = value;
    setAssistant(value);
  }

  function setLanguageState(value: LanguageState): void {
    languageInfoRef.current = value;
    setLanguageInfo(value);
  }

  function rebuildReview(
    nextDomain = domainRef.current,
    nextTranscript = transcriptRef.current,
    nextAssistant = assistantRef.current,
    nextLanguageState = languageInfoRef.current,
  ): void {
    setReviewRecord(
      reviewAdapter.extract({
        domain: nextDomain,
        transcriptText: nextTranscript?.text ?? "",
        assistantText: nextAssistant?.text ?? assistantDraftRef.current,
        transcriptSegments: nextTranscript?.segments ?? [],
        languages: mergeLanguages(
          nextLanguageState.languages,
          nextTranscript?.languages,
          nextAssistant?.languages,
        ),
        isCodeMixed:
          nextLanguageState.isCodeMixed ||
          Boolean(nextTranscript?.isCodeMixed) ||
          Boolean(nextAssistant?.isCodeMixed),
      }),
    );
  }

  function clearTtsPlayback(): void {
    revokeObjectUrl(ttsPlaybackRef.current?.audioUrl ?? null);
    ttsPlaybackRef.current = null;
    setTtsPlayback(null);
    setTtsChunkCount(0);
  }

  function finalizeTtsPlayback(
    payload: Pick<TtsResponse, "audio_b64" | "language" | "provider" | "mime_type" | "sample_rate" | "text">,
  ): void {
    clearTtsPlayback();
    const nextPlayback = {
      audioUrl: buildObjectUrlFromBase64(payload.audio_b64, payload.mime_type),
      fileName: `nudiscribe-${activeSessionId}-${Date.now()}.wav`,
      language: payload.language,
      provider: payload.provider,
      mimeType: payload.mime_type,
      sampleRate: payload.sample_rate,
      text: payload.text,
      createdAt: new Date().toISOString(),
      chunkCount: ttsChunkCount,
    } satisfies TtsPlaybackState;
    ttsPlaybackRef.current = nextPlayback;
    setTtsPlayback(nextPlayback);
    setConversationState("idle");
    setStatusMessage(`Speech ready from ${payload.provider}.`);
    setError(null);
  }

  async function stopRecorderOnly(): Promise<void> {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      await recorder.stop().catch(() => undefined);
    }
  }

  function destroyAudioSocket(): void {
    audioSocketRef.current?.destroy();
    audioSocketRef.current = null;
  }

  function destroyTtsSocket(): void {
    ttsSocketRef.current?.destroy();
    ttsSocketRef.current = null;
  }

  async function refreshHealth(silent = false): Promise<void> {
    if (!silent) {
      setHealthLoading(true);
    }

    try {
      const nextHealth = await apiClient.getHealth();
      setHealth(nextHealth);
      if (nextHealth.status === "ok") {
        setStatusMessage("Backend healthy. Voice-first workflow is ready.");
      } else {
        setStatusMessage("Backend is reachable but reporting degraded dependencies.");
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Unable to reach the backend.";
      setHealth((current) => current ?? buildFallbackHealth(message));
      setStatusMessage("Backend health check failed. UI remains available for reconnect attempts.");
      setError((current) => current ?? message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function refreshSessions(): Promise<void> {
    try {
      const response = await apiClient.listSessions();
      setSessions(response.sessions);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Unable to load sessions.";
      setError((current) => current ?? message);
    }
  }

  useEffect(() => {
    domainRef.current = domain;
    storeActiveDomain(domain);
  }, [domain]);

  useEffect(() => {
    storeActiveSessionId(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    const snapshot = loadSessionSnapshot(activeSessionId);

    clearTtsPlayback();
    setError(null);
    setConversationState("idle");
    setTextInput("");
    setLastUserText("");
    assistantDraftRef.current = "";
    setAssistantDraft("");

    if (snapshot) {
      if (snapshot.domain !== domainRef.current) {
        domainRef.current = snapshot.domain;
        setDomainState(snapshot.domain);
      }
      setTranscriptState(snapshot.transcript);
      setAssistantState(snapshot.assistant);
      const nextLanguageState = {
        dominantLanguage:
          snapshot.assistant?.language ?? snapshot.transcript?.language ?? "",
        languages: snapshot.languages,
        isCodeMixed: snapshot.isCodeMixed,
      } satisfies LanguageState;
      setLanguageState(nextLanguageState);
      setReviewRecord(snapshot.review ?? buildEmptyReview(snapshot.domain));
      setStatusMessage("Loaded local adapter history for the selected session.");
    } else {
      setTranscriptState(null);
      setAssistantState(null);
      setLanguageState({
        dominantLanguage: "",
        languages: [],
        isCodeMixed: false,
      });
      setReviewRecord(buildEmptyReview(domainRef.current));
      setStatusMessage(
        "New session ready. The backend will persist it after the first interaction.",
      );
    }
  }, [activeSessionId]);

  useEffect(() => {
    const socket = new TextChatSocket({
      baseUrl: apiClient.baseUrl,
      sessionId: activeSessionId,
      onConnectionChange: setConnectionState,
      onFailure: (failure) => {
        setStatusMessage("Text websocket unavailable. REST fallback remains available.");
        setError((current) => current ?? failure.message);
      },
      onEvent: (event) => {
        if (event.type === "language_info") {
          setLanguageState({
            dominantLanguage:
              event.dominant_language ??
              languageInfoRef.current.dominantLanguage,
            languages: mergeLanguages(event.languages, languageInfoRef.current.languages),
            isCodeMixed:
              event.is_code_mixed ?? languageInfoRef.current.isCodeMixed,
          });
          return;
        }

        if (event.type === "delta") {
          assistantDraftRef.current += event.text;
          setAssistantDraft(assistantDraftRef.current);
          setConversationState("generating");
          return;
        }

        if (event.type === "final") {
          const nextAssistant = buildAssistantTurn(
            event,
            pendingAssistantSourceRef.current,
            assistantDraftRef.current,
            mergeLanguages(
              languageInfoRef.current.languages,
              transcriptRef.current?.languages,
            ),
            languageInfoRef.current.dominantLanguage ||
              transcriptRef.current?.language ||
              "en",
            languageInfoRef.current.isCodeMixed,
          );
          setAssistantState(nextAssistant);
          assistantDraftRef.current = "";
          setAssistantDraft("");
          const nextLanguageState = {
            dominantLanguage: nextAssistant.language,
            languages: mergeLanguages(
              nextAssistant.languages,
              transcriptRef.current?.languages,
            ),
            isCodeMixed: nextAssistant.isCodeMixed,
          } satisfies LanguageState;
          setLanguageState(nextLanguageState);
          rebuildReview(domainRef.current, transcriptRef.current, nextAssistant, nextLanguageState);
          setConversationState("idle");
          setStatusMessage("Assistant response ready.");
          setError(null);
          void refreshSessions();
          return;
        }

        if (event.type === "error") {
          setConversationState("error");
          setStatusMessage("Backend reported an error while generating the response.");
          setError(event.error);
        }
      },
    });

    textSocketRef.current?.destroy();
    textSocketRef.current = socket;
    socket.connect().catch(() => {
      setConnectionState("closed");
      setStatusMessage("Text websocket unavailable. REST fallback will be used.");
    });

    return () => {
      socket.destroy();
      if (textSocketRef.current === socket) {
        textSocketRef.current = null;
      }
    };
  }, [activeSessionId]);

  useEffect(() => {
    const snapshot = buildSnapshot(
      activeSessionId,
      domain,
      transcript,
      assistant,
      reviewRecord,
      languageInfo,
    );
    saveSessionSnapshot(snapshot);
    setSnapshotTick((current) => current + 1);
  }, [activeSessionId, assistant, domain, languageInfo, reviewRecord, transcript]);

  useEffect(() => {
    void refreshHealth();
    void refreshSessions();

    const timer = window.setInterval(() => {
      void refreshHealth(true);
      void refreshSessions();
    }, 20000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      textSocketRef.current?.destroy();
      destroyAudioSocket();
      destroyTtsSocket();
      void stopRecorderOnly();
      clearTtsPlayback();
    };
  }, []);

  async function sendTextPayload(
    value: string,
    source: AssistantTurn["source"] = "text",
  ): Promise<void> {
    const cleaned = value.trim();
    if (!cleaned) {
      return;
    }

    pendingAssistantSourceRef.current = source;
    assistantDraftRef.current = "";
    setAssistantDraft("");
    setLastUserText(cleaned);
    setConversationState("generating");
    setStatusMessage("Streaming assistant response...");
    setError(null);
    if (source === "text") {
      setTextInput("");
    }

    try {
      if (!textSocketRef.current) {
        throw new Error("Text websocket is not ready.");
      }
      await textSocketRef.current.sendInput(cleaned);
      await refreshSessions();
      return;
    } catch {
      setStatusMessage("Text websocket unavailable. Falling back to REST chat.");
    }

    try {
      const response = await apiClient.sendChat({
        session_id: activeSessionId,
        text: cleaned,
      });
      const nextAssistant = buildAssistantTurn(
        {
          type: "final",
          text: response.text,
          language: response.language,
          languages: response.languages,
          is_code_mixed: response.is_code_mixed,
          tts_language: response.language,
        },
        source,
        response.text,
        response.languages,
        response.language,
        response.is_code_mixed,
      );
      setAssistantState(nextAssistant);
      const nextLanguageState = {
        dominantLanguage: nextAssistant.language,
        languages: mergeLanguages(nextAssistant.languages, transcriptRef.current?.languages),
        isCodeMixed: nextAssistant.isCodeMixed,
      } satisfies LanguageState;
      setLanguageState(nextLanguageState);
      rebuildReview(domainRef.current, transcriptRef.current, nextAssistant, nextLanguageState);
      setConversationState("idle");
      setStatusMessage("Assistant response ready.");
      await refreshSessions();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Chat request failed.";
      setConversationState("error");
      setStatusMessage("Unable to complete the text request.");
      setError(message);
    }
  }

  async function sendText(): Promise<void> {
    await sendTextPayload(textInput, "text");
  }

  async function uploadAudio(file: File, askAssistant: boolean): Promise<void> {
    setConversationState("transcribing");
    setStatusMessage("Uploading audio file for transcription...");
    setError(null);

    try {
      const response = await apiClient.transcribe(file);
      const nextTranscript = buildTranscriptTurn(response, "file-upload");
      setTranscriptState(nextTranscript);
      const nextLanguageState = {
        dominantLanguage: nextTranscript.language,
        languages: mergeLanguages(response.languages, assistantRef.current?.languages),
        isCodeMixed: Boolean(response.is_code_mixed),
      } satisfies LanguageState;
      setLanguageState(nextLanguageState);
      rebuildReview(domainRef.current, nextTranscript, assistantRef.current, nextLanguageState);

      if (askAssistant) {
        setStatusMessage("Transcript ready. Sending it to the assistant...");
        await sendTextPayload(response.text, "upload");
      } else {
        setTextInput(response.text);
        setConversationState("idle");
        setStatusMessage("Transcript ready. Review it or forward it to the assistant.");
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Transcription failed.";
      setConversationState("error");
      setStatusMessage("Audio upload could not be transcribed.");
      setError(message);
    }
  }

  async function startRecording(): Promise<void> {
    if (!consentConfirmed) {
      setError("Confirm capture consent before starting the microphone stream.");
      return;
    }

    pendingAssistantSourceRef.current = "audio";
    assistantDraftRef.current = "";
    setAssistantDraft("");
    setConversationState("buffering");
    setStatusMessage("Preparing microphone capture and audio websocket...");
    setError(null);
    clearTtsPlayback();

    const socket = new AudioStreamSocket({
      baseUrl: apiClient.baseUrl,
      sessionId: activeSessionId,
      onFailure: (failure) => {
        setConversationState("error");
        setStatusMessage("Audio websocket failed during capture.");
        setError(failure.message);
      },
      onEvent: (event) => {
        if (event.type === "audio_config") {
          setStatusMessage(
            `Backend accepted ${event.sample_rate} Hz / ${event.channels} channel PCM.`,
          );
          return;
        }

        if (event.type === "transcription") {
          const nextTranscript = buildTranscriptTurn(
            {
              text: event.text,
              language: event.language ?? "unknown",
              languages: event.languages ?? [],
              is_code_mixed: Boolean(event.is_code_mixed),
              segments: event.segments ?? [],
            },
            "live-mic",
          );
          setTranscriptState(nextTranscript);
          const nextLanguageState = {
            dominantLanguage: nextTranscript.language,
            languages: mergeLanguages(event.languages, assistantRef.current?.languages),
            isCodeMixed: Boolean(event.is_code_mixed),
          } satisfies LanguageState;
          setLanguageState(nextLanguageState);
          rebuildReview(domainRef.current, nextTranscript, assistantRef.current, nextLanguageState);
          setConversationState("transcribing");
          setStatusMessage("Speech captured. Generating assistant response...");
          return;
        }

        if (event.type === "language_info") {
          setLanguageState({
            dominantLanguage:
              event.dominant_language ??
              languageInfoRef.current.dominantLanguage,
            languages: mergeLanguages(event.languages, languageInfoRef.current.languages),
            isCodeMixed:
              event.is_code_mixed ?? languageInfoRef.current.isCodeMixed,
          });
          return;
        }

        if (event.type === "delta") {
          assistantDraftRef.current += event.text;
          setAssistantDraft(assistantDraftRef.current);
          setConversationState("generating");
          return;
        }

        if (event.type === "final") {
          const nextAssistant = buildAssistantTurn(
            event,
            "audio",
            assistantDraftRef.current,
            mergeLanguages(
              languageInfoRef.current.languages,
              transcriptRef.current?.languages,
            ),
            languageInfoRef.current.dominantLanguage ||
              transcriptRef.current?.language ||
              "en",
            languageInfoRef.current.isCodeMixed,
          );
          setAssistantState(nextAssistant);
          assistantDraftRef.current = "";
          setAssistantDraft("");
          const nextLanguageState = {
            dominantLanguage: nextAssistant.language,
            languages: mergeLanguages(nextAssistant.languages, transcriptRef.current?.languages),
            isCodeMixed: nextAssistant.isCodeMixed,
          } satisfies LanguageState;
          setLanguageState(nextLanguageState);
          rebuildReview(domainRef.current, transcriptRef.current, nextAssistant, nextLanguageState);
          setConversationState("idle");
          setStatusMessage("Audio turn completed.");
          destroyAudioSocket();
          void refreshSessions();
          return;
        }

        if (event.type === "audio_skipped") {
          setConversationState("idle");
          setStatusMessage("No usable speech detected. The backend skipped the segment.");
          destroyAudioSocket();
          return;
        }

        if (event.type === "error") {
          setConversationState("error");
          setStatusMessage("Backend reported an audio pipeline error.");
          setError(event.error);
          destroyAudioSocket();
        }
      },
    });

    audioSocketRef.current = socket;

    try {
      await socket.connect();
      await socket.start({
        sample_rate: 16000,
        channels: 1,
        sample_width: 2,
        encoding: "pcm_s16le",
      });

      const recorder = new PcmRecorder({
        chunkMs: 250,
        targetSampleRate: 16000,
        onChunk: (chunk) => {
          audioSocketRef.current?.sendPcmChunk(chunk);
        },
      });
      recorderRef.current = recorder;
      const recorderStatus = await recorder.start();
      setConversationState("recording");
      setStatusMessage(
        `Live microphone active at ${Math.round(
          recorderStatus.sampleRate,
        )} Hz. Streaming 250 ms PCM frames.`,
      );
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Unable to start recording.";
      await stopRecorderOnly();
      destroyAudioSocket();
      setConversationState("error");
      setStatusMessage("Microphone capture could not be started.");
      setError(message);
    }
  }

  async function stopRecording(): Promise<void> {
    if (!recorderRef.current || !audioSocketRef.current) {
      return;
    }

    setConversationState("buffering");
    setStatusMessage("Stopping capture and committing audio to the backend...");
    await stopRecorderOnly();
    audioSocketRef.current.commit();
  }

  async function synthesizeLatest(): Promise<void> {
    const sourceAssistant = assistantRef.current;
    if (!sourceAssistant?.text.trim()) {
      setError("There is no assistant response available for speech synthesis.");
      return;
    }

    if (!health?.tts_enabled || !health.tts_ready) {
      setError("TTS is disabled or not ready on the backend.");
      return;
    }

    setConversationState("speaking");
    setStatusMessage("Requesting speech synthesis...");
    setError(null);
    setTtsChunkCount(0);

    const request = {
      text: sourceAssistant.text,
      language: sourceAssistant.ttsLanguage || sourceAssistant.language,
      languages: sourceAssistant.languages,
      segments: sourceAssistant.ttsSegments,
    };

    const socket = new TtsSocket({
      baseUrl: apiClient.baseUrl,
      sessionId: activeSessionId,
      onFailure: (failure) => {
        setError((current) => current ?? failure.message);
      },
      onEvent: (event) => {
        if (event.type === "tts_info") {
          setStatusMessage(
            `Synthesizing ${event.segment_count} segments using ${
              event.available_providers.join(", ") || "configured providers"
            }.`,
          );
          return;
        }

        if (event.type === "audio_chunk") {
          setTtsChunkCount((current) => current + 1);
          return;
        }

        if (event.type === "final" && event.audio_b64) {
          finalizeTtsPlayback({
            audio_b64: event.audio_b64,
            language: event.language ?? sourceAssistant.language,
            provider: event.provider ?? "unknown",
            mime_type: event.mime_type ?? "audio/wav",
            sample_rate: event.sample_rate ?? 16000,
            text: event.text ?? sourceAssistant.text,
          });
          destroyTtsSocket();
          return;
        }

        if (event.type === "error") {
          setConversationState("error");
          setStatusMessage("TTS websocket returned an error.");
          setError(event.error);
          destroyTtsSocket();
        }
      },
    });

    ttsSocketRef.current = socket;

    try {
      await socket.synthesize(request);
      return;
    } catch {
      destroyTtsSocket();
      setStatusMessage("TTS websocket unavailable. Falling back to REST synthesis.");
    }

    try {
      const response = await apiClient.synthesize({
        text: request.text,
        language: request.language,
        languages: request.languages,
      });
      finalizeTtsPlayback(response);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Speech synthesis failed.";
      setConversationState("error");
      setStatusMessage("Unable to synthesize speech.");
      setError(message);
    }
  }

  function changeDomain(nextDomain: DomainMode): void {
    if (nextDomain === domainRef.current) {
      return;
    }

    domainRef.current = nextDomain;
    startTransition(() => {
      setDomainState(nextDomain);
    });
    rebuildReview(nextDomain);
    setStatusMessage(
      nextDomain === "healthcare"
        ? "Healthcare workflow active."
        : "Financial and survey workflow active.",
    );
  }

  async function clearCurrentSession(): Promise<void> {
    try {
      await apiClient.clearSession(activeSessionId);
    } catch {
      setStatusMessage("Clearing the backend session failed. Removing local adapter data only.");
    }

    removeSessionSnapshot(activeSessionId);
    setSnapshotTick((current) => current + 1);
    await refreshSessions();

    const nextSessionId =
      sessions.find((sessionId) => sessionId !== activeSessionId) ??
      listLocalSnapshots().find((snapshot) => snapshot.sessionId !== activeSessionId)?.sessionId ??
      createSessionId();

    startTransition(() => {
      setActiveSessionId(nextSessionId);
      setView("workspace");
    });
    setStatusMessage(`Session ${activeSessionId} cleared.`);
  }

  function createNewSession(): void {
    const nextSessionId = createSessionId();
    startTransition(() => {
      setActiveSessionId(nextSessionId);
      setView("workspace");
    });
  }

  function selectSession(sessionId: string): void {
    startTransition(() => {
      setActiveSessionId(sessionId);
      setView("workspace");
    });
  }

  function refreshStructuredReview(): void {
    rebuildReview();
    setStatusMessage("Structured review refreshed from the client-side adapter.");
  }

  function updateGenericField(
    field: keyof StructuredReviewRecord["generic"],
    value: string,
  ): void {
    setReviewRecord((current) => ({
      ...current,
      generic: {
        ...current.generic,
        [field]: value,
      },
    }));
  }

  function updateHealthcareField(
    field: keyof StructuredReviewRecord["healthcare"],
    value: string,
  ): void {
    setReviewRecord((current) => ({
      ...current,
      healthcare: {
        ...current.healthcare,
        [field]: value,
      },
    }));
  }

  function updateFinancialField(
    field: keyof StructuredReviewRecord["financial"],
    value: string,
  ): void {
    setReviewRecord((current) => ({
      ...current,
      financial: {
        ...current.financial,
        [field]: value,
      },
    }));
  }

  const localSessionIds = listLocalSnapshots().map((snapshot) => snapshot.sessionId);
  void snapshotTick;
  const sessionOptions = Array.from(
    new Set([activeSessionId, ...sessions, ...localSessionIds]),
  );
  const dashboardRecords = dashboardAdapter.build({
    backendSessions: sessions,
    activeSessionId,
    query: deferredDashboardQuery,
  });

  return {
    apiBaseUrl: apiClient.baseUrl,
    view,
    setView,
    domain,
    changeDomain,
    health,
    healthLoading,
    sessions,
    sessionOptions,
    activeSessionId,
    selectSession,
    createNewSession,
    clearCurrentSession,
    connectionState,
    conversationState,
    statusMessage,
    error,
    clearError: () => setError(null),
    textInput,
    setTextInput,
    sendText,
    lastUserText,
    transcript,
    assistant,
    assistantDraft,
    languageInfo,
    consentConfirmed,
    setConsentConfirmed,
    uploadAudio,
    startRecording,
    stopRecording,
    synthesizeLatest,
    ttsPlayback,
    ttsChunkCount,
    reviewRecord,
    refreshStructuredReview,
    updateGenericField,
    updateHealthcareField,
    updateFinancialField,
    dashboardQuery,
    setDashboardQuery,
    dashboardRecords,
    refreshHealth,
    refreshSessions,
  };
}
