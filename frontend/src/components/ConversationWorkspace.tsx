import {
  ChatMessage,
  FinalEvent,
  LanguageInfoEvent,
  TranscriptState,
  TtsPlaybackState,
} from "../types";
import {
  formatClock,
  formatLanguages,
  formatSegmentRange,
  truncateText,
} from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface ConversationWorkspaceProps {
  sessionId: string;
  socketStatus: string;
  activityState: string;
  messages: ChatMessage[];
  liveAssistantText: string;
  liveAssistantEvent: FinalEvent | null;
  latestTranscript: TranscriptState | null;
  lastLanguageInfo: LanguageInfoEvent | null;
  composerValue: string;
  onComposerValueChange: (value: string) => void;
  onSendText: () => void;
  microphoneSupported: boolean;
  consentGranted: boolean;
  onConsentChange: (nextValue: boolean) => void;
  isRecordingActive: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTranscribeFile: (file: File) => void;
  transcribingUpload: boolean;
  onUseTranscript: () => void;
  onSynthesizeLatest: () => void;
  ttsBusy: boolean;
  canUseTts: boolean;
  ttsHint: string;
  latestTts: TtsPlaybackState | null;
}

export function ConversationWorkspace({
  sessionId,
  socketStatus,
  activityState,
  messages,
  liveAssistantText,
  liveAssistantEvent,
  latestTranscript,
  lastLanguageInfo,
  composerValue,
  onComposerValueChange,
  onSendText,
  microphoneSupported,
  consentGranted,
  onConsentChange,
  isRecordingActive,
  onStartRecording,
  onStopRecording,
  onTranscribeFile,
  transcribingUpload,
  onUseTranscript,
  onSynthesizeLatest,
  ttsBusy,
  canUseTts,
  ttsHint,
  latestTts,
}: ConversationWorkspaceProps) {
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return (
    <section className="workspace">
      <div className="hero-card">
        <div>
          <p className="eyebrow">Live Conversation Workspace</p>
          <h2>Text, microphone, upload transcription, and TTS stay on one session rail.</h2>
          <p className="hero-card__copy">
            Session <strong>{sessionId}</strong> is active. The UI preserves the same session ID
            across typed input, raw PCM live audio, uploaded files, and synthesized output.
          </p>
        </div>
        <div className="hero-card__status">
          <StatusBadge tone={socketStatus === "open" ? "good" : "warn"}>
            Text WS {socketStatus}
          </StatusBadge>
          <StatusBadge tone={isRecordingActive ? "bad" : "neutral"}>{activityState}</StatusBadge>
        </div>
      </div>

      <div className="workspace-grid">
        <article className="panel surface">
          <div className="surface__head">
            <div>
              <p className="eyebrow">Live chat</p>
              <h3>Conversation rail</h3>
            </div>
            {lastLanguageInfo ? (
              <StatusBadge tone={lastLanguageInfo.is_code_mixed ? "accent" : "neutral"}>
                {formatLanguages(lastLanguageInfo.languages)}
              </StatusBadge>
            ) : null}
          </div>

          <div className="message-rail">
            {messages.length ? (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-bubble chat-bubble--${message.role}`}
                >
                  <div className="chat-bubble__meta">
                    <span>{message.role}</span>
                    <span>{message.source}</span>
                    <span>{formatClock(message.createdAt)}</span>
                  </div>
                  <div className="chat-bubble__body">{message.text}</div>
                  {message.languages.length ? (
                    <div className="badge-row">
                      {message.languages.map((language) => (
                        <StatusBadge key={`${message.id}-${language}`} tone="neutral">
                          {language}
                        </StatusBadge>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="empty-copy">
                Start with typed input or live microphone capture. The backend will stream the
                assistant response into this rail.
              </p>
            )}
          </div>

          <label className="field">
            <span>Type a message</span>
            <textarea
              rows={4}
              value={composerValue}
              onChange={(event) => onComposerValueChange(event.target.value)}
              placeholder="Type in English, Hindi, Kannada, or code-mixed language."
            />
          </label>

          <div className="button-row">
            <button type="button" onClick={onSendText}>
              Send text
            </button>
            <StatusBadge tone="neutral">Current state: {activityState}</StatusBadge>
          </div>
        </article>

        <div className="workspace-column">
          <article className="panel surface">
            <div className="surface__head">
              <div>
                <p className="eyebrow">Microphone</p>
                <h3>Remote voice capture</h3>
              </div>
              <StatusBadge tone={isRecordingActive ? "bad" : "neutral"}>
                {isRecordingActive ? "Capture live" : "Idle"}
              </StatusBadge>
            </div>

            <label className="consent-check">
              <input
                type="checkbox"
                checked={consentGranted}
                onChange={(event) => onConsentChange(event.target.checked)}
              />
              <span>I have consent to capture and process this audio session.</span>
            </label>

            <p className="surface__copy">
              The live path uses raw 16-bit PCM frames over <code>/ws/audio/{sessionId}</code>,
              aligned to the backend audio client behavior. MediaRecorder is not used.
            </p>

            <div className="button-row">
              <button
                type="button"
                disabled={!microphoneSupported || !consentGranted || isRecordingActive}
                onClick={onStartRecording}
              >
                Start live mic
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={!isRecordingActive}
                onClick={onStopRecording}
              >
                Commit recording
              </button>
            </div>

            {!microphoneSupported ? (
              <p className="callout callout--warn">
                This browser cannot start the AudioWorklet-based PCM capture flow.
              </p>
            ) : null}
            {!consentGranted ? (
              <p className="callout callout--warn">
                Recording stays disabled until consent is explicitly confirmed.
              </p>
            ) : null}
          </article>

          <article className="panel surface">
            <div className="surface__head">
              <div>
                <p className="eyebrow">Audio upload</p>
                <h3>File transcription</h3>
              </div>
              <StatusBadge tone="neutral">{transcribingUpload ? "Running" : "Ready"}</StatusBadge>
            </div>

            <label className="field">
              <span>Supported formats</span>
              <input
                type="file"
                accept=".wav,.mp3,.m4a,.ogg,.webm,.flac,audio/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    onTranscribeFile(file);
                    event.currentTarget.value = "";
                  }
                }}
              />
            </label>

            <div className="button-row">
              <button
                type="button"
                className="button button--ghost"
                disabled={!latestTranscript}
                onClick={onUseTranscript}
              >
                Use latest transcript in composer
              </button>
            </div>

            {latestTranscript ? (
              <div className="transcript-block">
                <div className="surface__head surface__head--compact">
                  <strong>{truncateText(latestTranscript.text, 140)}</strong>
                  <StatusBadge tone={latestTranscript.isCodeMixed ? "accent" : "neutral"}>
                    {formatLanguages(latestTranscript.languages)}
                  </StatusBadge>
                </div>

                <div className="segment-list">
                  {latestTranscript.segments.length ? (
                    latestTranscript.segments.map((segment, index) => (
                      <article key={`${segment.index ?? index}-${segment.text}`} className="segment-card">
                        <div className="segment-card__meta">
                          <span>#{segment.index ?? index + 1}</span>
                          <span>{segment.engine || "asr"}</span>
                          <span>{formatSegmentRange(segment.start_ms, segment.end_ms)}</span>
                        </div>
                        <p>{segment.text}</p>
                      </article>
                    ))
                  ) : (
                    <p className="empty-copy">No segment metadata returned for the latest transcript.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="empty-copy">
                Upload a file or commit a live recording to populate transcript review data.
              </p>
            )}
          </article>
        </div>

        <div className="workspace-column">
          <article className="panel surface">
            <div className="surface__head">
              <div>
                <p className="eyebrow">Assistant stream</p>
                <h3>Response and speech</h3>
              </div>
              <StatusBadge tone={liveAssistantText ? "accent" : "neutral"}>
                {liveAssistantText ? "Streaming" : "Waiting"}
              </StatusBadge>
            </div>

            <div className="assistant-stream">
              {liveAssistantText || latestAssistantMessage ? (
                <div className="assistant-stream__copy">
                  {liveAssistantText || latestAssistantMessage?.text}
                </div>
              ) : (
                <p className="empty-copy">
                  The assistant stream appears here as websocket deltas arrive.
                </p>
              )}
            </div>

            <div className="badge-row">
              {(liveAssistantEvent?.languages ||
                latestAssistantMessage?.languages ||
                []).map((language) => (
                <StatusBadge key={language} tone="neutral">
                  {language}
                </StatusBadge>
              ))}
              {liveAssistantEvent?.is_code_mixed ? (
                <StatusBadge tone="accent">Code-mixed</StatusBadge>
              ) : null}
            </div>

            <div className="button-row">
              <button type="button" disabled={!canUseTts || ttsBusy} onClick={onSynthesizeLatest}>
                {ttsBusy ? "Synthesizing..." : "Synthesize reply"}
              </button>
              <span className="inline-hint">{ttsHint}</span>
            </div>

            {latestTts ? (
              <div className="tts-result">
                <div className="surface__head surface__head--compact">
                  <span>
                    {latestTts.provider} | {latestTts.language}
                  </span>
                  <StatusBadge tone="good">{latestTts.sampleRate} Hz</StatusBadge>
                </div>
                <audio controls src={latestTts.audioUrl} className="tts-player" />
                <a href={latestTts.audioUrl} download={`nudiscribe-${sessionId}.wav`} className="link-button">
                  Download WAV
                </a>
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
}
