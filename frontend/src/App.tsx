import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { buildDashboardCards } from "./adapters/dashboard";
import { buildStructuredReviewDraft } from "./adapters/structured-review";
import { CommandCenter } from "./components/CommandCenter";
import { ConversationWorkspace } from "./components/ConversationWorkspace";
import { DashboardPanel } from "./components/DashboardPanel";
import { OutboundWorkflowPlaceholder } from "./components/OutboundWorkflowPlaceholder";
import { StructuredReviewPanel } from "./components/StructuredReviewPanel";
import { StatusBadge } from "./components/StatusBadge";
import { activityLabel, decodeBase64Audio } from "./lib/format";
import { createMessageId, createSessionId } from "./lib/session";
import { usePersistentState } from "./hooks/usePersistentState";
import {
  clearSession,
  getHealth,
  getSessions,
  normalizeApiBase,
  postChat,
  synthesizeSpeech,
  transcribeAudio,
} from "./services/api";
import { AudioStreamingSession } from "./services/audio-streaming";
import { TextChatSocket } from "./services/text-chat-socket";
import { synthesizeSpeechStream } from "./services/tts-socket";
import "./styles.css";
import {
  ActivityState,
  AppView,
  ChatMessage,
  Domain,
  FinalEvent,
  HealthResponse,
  LanguageInfoEvent,
  SessionSnapshot,
  SocketStatus,
  StructuredReviewDraft,
  TranscriptState,
  TtsPlaybackState,
} from "./types";

interface NoticeState {
  tone: "good" | "warn" | "bad" | "info";
  text: string;
}

const VIEW_OPTIONS: { id: AppView; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "review", label: "Structured review" },
  { id: "history", label: "History / dashboard" },
  { id: "outbound", label: "Outbound placeholder" },
];

export default function App() {
  const [apiBase, setApiBase] = usePersistentState(
    "nudiscribe.apiBase",
    normalizeApiBase("http://127.0.0.1:8000"),
  );
  const [domain, setDomain] = usePersistentState<Domain>(
    "nudiscribe.domain",
    "healthcare",
  );
  const [sessionId, setSessionId] = usePersistentState(
    "nudiscribe.sessionId",
    createSessionId(),
  );
  const [snapshots, setSnapshots] = usePersistentState<Record<string, SessionSnapshot>>(
    "nudiscribe.sessionSnapshots",
    {},
  );
  const [view, setView] = useState<AppView>("workspace");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<string[]>([]);
  const [sessionSearch, setSessionSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [activityState, setActivityState] = useState<ActivityState>("idle");
  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestTranscript, setLatestTranscript] = useState<TranscriptState | null>(null);
  const [reviewDraft, setReviewDraft] = useState<StructuredReviewDraft | null>(null);
  const [liveAssistantText, setLiveAssistantText] = useState("");
  const [liveAssistantEvent, setLiveAssistantEvent] = useState<FinalEvent | null>(null);
  const [lastLanguageInfo, setLastLanguageInfo] = useState<LanguageInfoEvent | null>(null);
  const [transcribingUpload, setTranscribingUpload] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [latestTts, setLatestTts] = useState<TtsPlaybackState | null>(null);
  const [consentGranted, setConsentGranted] = usePersistentState(
    "nudiscribe.audioConsent",
    false,
  );
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const deferredSessionSearch = useDeferredValue(sessionSearch.trim().toLowerCase());
  const deferredHistorySearch = useDeferredValue(historySearch.trim().toLowerCase());

  const textSocketRef = useRef<TextChatSocket | null>(null);
  const audioSessionRef = useRef<AudioStreamingSession | null>(null);
  const switchingSessionRef = useRef(false);
  const saveFingerprintRef = useRef<Record<string, string>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const transcriptRef = useRef<TranscriptState | null>(null);
  const domainRef = useRef<Domain>(domain);

  const microphoneSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(window.AudioWorkletNode) &&
    Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    transcriptRef.current = latestTranscript;
  }, [latestTranscript]);

  useEffect(() => {
    domainRef.current = domain;
  }, [domain]);

  useEffect(() => {
    return () => {
      if (latestTts?.audioUrl) {
        URL.revokeObjectURL(latestTts.audioUrl);
      }
    };
  }, [latestTts]);

  useEffect(() => {
    const snapshot = snapshots[sessionId];
    const nextMessages = snapshot?.messages || [];
    const nextTranscript = snapshot?.latestTranscript || null;
    const nextReviewDraft = snapshot?.reviewDraft || null;
    const nextDomain = snapshot?.domain || domainRef.current;

    messagesRef.current = nextMessages;
    transcriptRef.current = nextTranscript;
    domainRef.current = nextDomain;

    setMessages(nextMessages);
    setLatestTranscript(nextTranscript);
    setReviewDraft(nextReviewDraft);
    setLiveAssistantText("");
    setLiveAssistantEvent(null);
    setLastLanguageInfo(null);
    setComposerValue("");
    setLatestTts(null);
    setDomain(nextDomain);

    saveFingerprintRef.current[sessionId] = JSON.stringify({
      domain: nextDomain,
      messages: nextMessages,
      latestTranscript: nextTranscript,
      reviewDraft: nextReviewDraft,
    });
    switchingSessionRef.current = false;
  }, [sessionId, snapshots, setDomain]);

  useEffect(() => {
    if (switchingSessionRef.current) {
      return;
    }

    const fingerprint = JSON.stringify({
      domain,
      messages,
      latestTranscript,
      reviewDraft,
    });

    if (saveFingerprintRef.current[sessionId] === fingerprint) {
      return;
    }

    saveFingerprintRef.current[sessionId] = fingerprint;
    setSnapshots((previousSnapshots) => ({
      ...previousSnapshots,
      [sessionId]: {
        sessionId,
        domain,
        messages,
        latestTranscript,
        latestTts: null,
        reviewDraft,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [domain, latestTranscript, messages, reviewDraft, sessionId, setSnapshots]);

  useEffect(() => {
    const socket = new TextChatSocket(apiBase, sessionId, {
      onStatus: setSocketStatus,
      onLanguageInfo: (event) => {
        setLastLanguageInfo(event);
      },
      onDelta: (chunk) => {
        setActivityState("generating");
        setLiveAssistantText((currentValue) => currentValue + chunk);
      },
      onFinal: (event) => {
        const assistantMessage: ChatMessage = {
          id: createMessageId("assistant"),
          role: "assistant",
          source: "backend",
          text: event.text,
          createdAt: new Date().toISOString(),
          language: event.language,
          languages: event.languages || [],
          isCodeMixed: event.is_code_mixed,
          meta: "websocket final",
        };

        const nextMessages = [...messagesRef.current, assistantMessage];
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        setLiveAssistantText(event.text);
        setLiveAssistantEvent(event);
        setActivityState("idle");
        setReviewDraft(
          buildStructuredReviewDraft(domainRef.current, transcriptRef.current, nextMessages),
        );
      },
      onError: (event) => {
        setActivityState("error");
        setNotice({ tone: "bad", text: event.error });
      },
    });

    textSocketRef.current = socket;
    socket.connect();

    return () => {
      socket.disconnect();
      textSocketRef.current = null;
    };
  }, [apiBase, sessionId]);

  useEffect(() => {
    void refreshHealth();
    void refreshSessions();
  }, [apiBase]);

  async function refreshHealth() {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const nextHealth = await getHealth(apiBase);
      setHealth(nextHealth);
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : "Health check failed.");
    } finally {
      setHealthLoading(false);
    }
  }

  async function refreshSessions() {
    try {
      const nextSessions = await getSessions(apiBase);
      startTransition(() => {
        setSessions(nextSessions);
      });
    } catch (error) {
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Failed to refresh sessions.",
      });
    }
  }

  function switchSession(nextSessionId: string) {
    if (!nextSessionId || nextSessionId === sessionId) {
      return;
    }

    switchingSessionRef.current = true;
    setSessionId(nextSessionId);
    setView("workspace");
    setNotice({ tone: "info", text: `Switched to ${nextSessionId}.` });
  }

  function handleDomainChange(nextDomain: Domain) {
    setDomain(nextDomain);
    domainRef.current = nextDomain;
    setReviewDraft(
      buildStructuredReviewDraft(nextDomain, transcriptRef.current, messagesRef.current),
    );
  }

  function pushMessage(message: ChatMessage) {
    const nextMessages = [...messagesRef.current, message];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setReviewDraft(
      buildStructuredReviewDraft(domainRef.current, transcriptRef.current, nextMessages),
    );
  }

  function applyTranscript(nextTranscript: TranscriptState) {
    transcriptRef.current = nextTranscript;
    setLatestTranscript(nextTranscript);
    setReviewDraft(
      buildStructuredReviewDraft(domainRef.current, nextTranscript, messagesRef.current),
    );
  }

  async function handleSendText() {
    const text = composerValue.trim();
    if (!text) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      source: "typed",
      text,
      createdAt: new Date().toISOString(),
      languages: [],
      meta: "text input",
    };

    pushMessage(userMessage);
    setComposerValue("");
    setLiveAssistantText("");
    setLiveAssistantEvent(null);
    setActivityState("generating");
    setNotice(null);

    try {
      if (textSocketRef.current?.isOpen()) {
        textSocketRef.current.sendInput(text);
        return;
      }

      const response = await postChat(apiBase, sessionId, text);
      setLastLanguageInfo({
        type: "language_info",
        languages: response.languages,
        dominant_language: response.language,
        is_code_mixed: response.is_code_mixed,
      });

      const assistantMessage: ChatMessage = {
        id: createMessageId("assistant"),
        role: "assistant",
        source: "backend",
        text: response.text,
        createdAt: new Date().toISOString(),
        language: response.language,
        languages: response.languages,
        isCodeMixed: response.is_code_mixed,
        meta: "REST fallback",
      };

      pushMessage(assistantMessage);
      setLiveAssistantText(response.text);
      setLiveAssistantEvent({
        type: "final",
        text: response.text,
        language: response.language,
        languages: response.languages,
        is_code_mixed: response.is_code_mixed,
      });
      setActivityState("idle");
    } catch (error) {
      setActivityState("error");
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Failed to send text message.",
      });
    }
  }

  async function handleTranscribeFile(file: File) {
    setTranscribingUpload(true);
    setActivityState("transcribing");
    try {
      const result = await transcribeAudio(apiBase, file);
      const transcript: TranscriptState = {
        text: result.text,
        language: result.language,
        languages: result.languages,
        isCodeMixed: result.is_code_mixed,
        segments: result.segments,
        source: "upload",
        createdAt: new Date().toISOString(),
      };

      applyTranscript(transcript);
      setLastLanguageInfo({
        type: "language_info",
        languages: result.languages,
        dominant_language: result.language,
        is_code_mixed: result.is_code_mixed,
      });
      setActivityState("idle");
      setNotice({ tone: "good", text: `Transcription ready for ${file.name}.` });
    } catch (error) {
      setActivityState("error");
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Audio transcription failed.",
      });
    } finally {
      setTranscribingUpload(false);
    }
  }

  async function handleStartRecording() {
    setLiveAssistantText("");
    setLiveAssistantEvent(null);
    setNotice(null);

    const session = new AudioStreamingSession({
      apiBase,
      sessionId,
      onStateChange: (state) => {
        if (state === "buffering") {
          setActivityState("buffering");
        } else if (state === "recording") {
          setActivityState("recording");
        } else if (state === "transcribing") {
          setActivityState("transcribing");
        }
      },
      onEvent: (event) => {
        if (event.type === "transcription") {
          const transcript: TranscriptState = {
            text: event.text,
            language: event.language || "en",
            languages: event.languages || [],
            isCodeMixed: Boolean(event.is_code_mixed),
            segments: event.segments || [],
            source: "microphone",
            createdAt: new Date().toISOString(),
          };

          applyTranscript(transcript);
          pushMessage({
            id: createMessageId("voice"),
            role: "user",
            source: "voice",
            text: event.text,
            createdAt: new Date().toISOString(),
            language: event.language,
            languages: event.languages || [],
            isCodeMixed: event.is_code_mixed,
            meta: "microphone transcript",
          });
          setActivityState("generating");
          return;
        }

        if (event.type === "language_info") {
          setLastLanguageInfo(event);
          return;
        }

        if (event.type === "delta") {
          setActivityState("generating");
          setLiveAssistantText((currentValue) => currentValue + event.text);
          return;
        }

        if (event.type === "final") {
          pushMessage({
            id: createMessageId("assistant"),
            role: "assistant",
            source: "backend",
            text: event.text,
            createdAt: new Date().toISOString(),
            language: event.language,
            languages: event.languages || [],
            isCodeMixed: event.is_code_mixed,
            meta: "audio websocket final",
          });
          setLiveAssistantText(event.text);
          setLiveAssistantEvent(event);
          setActivityState("idle");
          return;
        }

        if (event.type === "audio_skipped") {
          setActivityState("idle");
          setNotice({ tone: "warn", text: "Audio was skipped as silence." });
          return;
        }

        if (event.type === "error") {
          setActivityState("error");
          setNotice({ tone: "bad", text: event.error });
        }
      },
    });

    audioSessionRef.current = session;

    try {
      await session.start();
    } catch (error) {
      audioSessionRef.current = null;
      setActivityState("error");
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Microphone streaming failed to start.",
      });
    }
  }

  async function handleStopRecording() {
    if (!audioSessionRef.current) {
      return;
    }

    try {
      await audioSessionRef.current.stop();
    } catch (error) {
      setActivityState("error");
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Failed to stop microphone session.",
      });
    } finally {
      audioSessionRef.current = null;
    }
  }

  async function handleSynthesizeLatest() {
    const latestAssistantMessage = [...messagesRef.current]
      .reverse()
      .find((message) => message.role === "assistant");
    const synthesisText = liveAssistantText || latestAssistantMessage?.text || "";

    if (!synthesisText) {
      return;
    }

    setTtsBusy(true);
    setActivityState("speaking");

    try {
      let playbackState: TtsPlaybackState;

      try {
        const websocketResult = await synthesizeSpeechStream({
          apiBase,
          sessionId,
          text: synthesisText,
          language: liveAssistantEvent?.tts_language || liveAssistantEvent?.language,
          languages: liveAssistantEvent?.languages || latestAssistantMessage?.languages || [],
          segments: liveAssistantEvent?.tts_segments || [],
        });

        playbackState = {
          text: websocketResult.final.text,
          language: websocketResult.final.language,
          provider: websocketResult.final.provider,
          mimeType: websocketResult.final.mime_type,
          sampleRate: websocketResult.final.sample_rate,
          audioUrl: decodeBase64Audio(
            websocketResult.final.audio_b64,
            websocketResult.final.mime_type,
          ),
          createdAt: new Date().toISOString(),
          segments: websocketResult.chunks,
        };
      } catch {
        const restResult = await synthesizeSpeech(
          apiBase,
          synthesisText,
          liveAssistantEvent?.tts_language || liveAssistantEvent?.language,
          liveAssistantEvent?.languages || latestAssistantMessage?.languages || [],
        );

        playbackState = {
          text: restResult.text,
          language: restResult.language,
          provider: restResult.provider,
          mimeType: restResult.mime_type,
          sampleRate: restResult.sample_rate,
          audioUrl: decodeBase64Audio(restResult.audio_b64, restResult.mime_type),
          createdAt: new Date().toISOString(),
          segments: [],
        };
      }

      setLatestTts(playbackState);
      const player = new Audio(playbackState.audioUrl);
      void player.play();
      setNotice({
        tone: health?.tts_real_speech_ready ? "good" : "warn",
        text: `TTS synthesized via ${playbackState.provider}.`,
      });
      setActivityState("idle");
    } catch (error) {
      setActivityState("error");
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "Speech synthesis failed.",
      });
    } finally {
      setTtsBusy(false);
    }
  }

  function handleClearCurrentSession() {
    void (async () => {
      try {
        await clearSession(apiBase, sessionId);
        const emptyMessages: ChatMessage[] = [];

        messagesRef.current = emptyMessages;
        transcriptRef.current = null;
        setMessages(emptyMessages);
        setLatestTranscript(null);
        setReviewDraft(null);
        setLatestTts(null);
        setLiveAssistantText("");
        setLiveAssistantEvent(null);
        setLastLanguageInfo(null);
        setComposerValue("");
        setSnapshots((previousSnapshots) => {
          const nextSnapshots = { ...previousSnapshots };
          delete nextSnapshots[sessionId];
          return nextSnapshots;
        });
        saveFingerprintRef.current[sessionId] = JSON.stringify({
          domain: domainRef.current,
          messages: [],
          latestTranscript: null,
          reviewDraft: null,
        });
        setNotice({ tone: "good", text: `Cleared backend session ${sessionId}.` });
        void refreshSessions();
      } catch (error) {
        setNotice({
          tone: "bad",
          text: error instanceof Error ? error.message : "Failed to clear current session.",
        });
      }
    })();
  }

  function handleCreateSession() {
    switchSession(createSessionId());
  }

  function handleRegenerateReview() {
    setReviewDraft(
      buildStructuredReviewDraft(domainRef.current, transcriptRef.current, messagesRef.current),
    );
    setView("review");
  }

  function handleReviewFieldChange(
    section: "generic" | "domainSpecific",
    key: string,
    value: string,
  ) {
    setReviewDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        [section]: {
          ...currentDraft[section],
          [key]: value,
        },
      };
    });
  }

  const filteredSessions = sessions.filter((item) =>
    item.toLowerCase().includes(deferredSessionSearch),
  );

  const dashboardCards = buildDashboardCards(sessions, snapshots, sessionId).filter((card) => {
    if (!deferredHistorySearch) {
      return true;
    }

    const haystack = [
      card.sessionId,
      card.assistantPreview,
      card.transcriptPreview,
      card.domain,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredHistorySearch);
  });

  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const canUseTts =
    Boolean(liveAssistantText || latestAssistantMessage?.text) &&
    Boolean(health?.tts_enabled) &&
    Boolean(health?.tts_ready);
  const ttsHint = !health?.tts_enabled
    ? "TTS is disabled by backend configuration."
    : !health?.tts_ready
      ? "No TTS provider is currently ready."
      : health?.tts_real_speech_ready
        ? "Real speech provider available."
        : "Backend is likely using tone fallback.";

  return (
    <div className="app-shell">
      <CommandCenter
        apiBase={apiBase}
        onApiBaseChange={setApiBase}
        health={health}
        healthLoading={healthLoading}
        healthError={healthError}
        onRefreshHealth={() => void refreshHealth()}
        domain={domain}
        onDomainChange={handleDomainChange}
        sessionId={sessionId}
        sessions={sessions}
        filteredSessions={filteredSessions}
        sessionSearch={sessionSearch}
        onSessionSearchChange={setSessionSearch}
        onSelectSession={switchSession}
        onCreateSession={handleCreateSession}
        onClearSession={handleClearCurrentSession}
        onRefreshSessions={() => void refreshSessions()}
        socketStatus={socketStatus}
        activityState={activityState}
      />

      <main className="main-shell">
        <div className="toolbar">
          <div className="view-switcher">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={view === option.id ? "is-active" : ""}
                onClick={() => setView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="toolbar__status">
            <StatusBadge tone={socketStatus === "open" ? "good" : "warn"}>
              Session {sessionId}
            </StatusBadge>
            <StatusBadge tone={activityState === "error" ? "bad" : "neutral"}>
              {activityLabel(activityState)}
            </StatusBadge>
          </div>
        </div>

        {notice ? (
          <div className={`callout callout--${notice.tone}`}>{notice.text}</div>
        ) : null}

        {view === "workspace" ? (
          <ConversationWorkspace
            sessionId={sessionId}
            socketStatus={socketStatus}
            activityState={activityLabel(activityState)}
            messages={messages}
            liveAssistantText={liveAssistantText}
            liveAssistantEvent={liveAssistantEvent}
            latestTranscript={latestTranscript}
            lastLanguageInfo={lastLanguageInfo}
            composerValue={composerValue}
            onComposerValueChange={setComposerValue}
            onSendText={() => void handleSendText()}
            microphoneSupported={microphoneSupported}
            consentGranted={consentGranted}
            onConsentChange={setConsentGranted}
            isRecordingActive={Boolean(audioSessionRef.current)}
            onStartRecording={() => void handleStartRecording()}
            onStopRecording={() => void handleStopRecording()}
            onTranscribeFile={(file) => void handleTranscribeFile(file)}
            transcribingUpload={transcribingUpload}
            onUseTranscript={() => setComposerValue(latestTranscript?.text || composerValue)}
            onSynthesizeLatest={() => void handleSynthesizeLatest()}
            ttsBusy={ttsBusy}
            canUseTts={canUseTts}
            ttsHint={ttsHint}
            latestTts={latestTts}
          />
        ) : null}

        {view === "review" ? (
          <StructuredReviewPanel
            domain={domain}
            draft={reviewDraft}
            onRegenerate={handleRegenerateReview}
            onFieldChange={handleReviewFieldChange}
          />
        ) : null}

        {view === "history" ? (
          <DashboardPanel
            cards={dashboardCards}
            searchValue={historySearch}
            onSearchChange={setHistorySearch}
            onRefreshSessions={() => void refreshSessions()}
            onSelectSession={switchSession}
          />
        ) : null}

        {view === "outbound" ? <OutboundWorkflowPlaceholder domain={domain} /> : null}
      </main>
    </div>
  );
}
