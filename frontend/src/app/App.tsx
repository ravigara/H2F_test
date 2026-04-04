import { useState } from "react";

import { LanguageBadges } from "../components/LanguageBadges";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/StatusPill";
import { formatSegmentRange, formatTimestamp, formatUptime } from "../lib/format";
import { useNudiScribeApp } from "../hooks/useNudiScribeApp";
import type { StructuredReviewRecord } from "../types/review";

const genericFields = [
  ["complaintQuery", "Complaint / Query"],
  ["backgroundHistory", "Background History"],
  ["observationsResponses", "Observations / Responses"],
  ["diagnosisClassificationStatus", "Diagnosis / Classification / Status"],
  ["actionPlanTreatmentPlan", "Action Plan / Treatment Plan"],
  ["verificationSurveyResponses", "Verification / Survey Responses"],
] as const satisfies ReadonlyArray<
  readonly [keyof StructuredReviewRecord["generic"], string]
>;

const healthcareFields = [
  ["symptoms", "Symptoms"],
  ["pastHistory", "Past History"],
  ["clinicalObservations", "Clinical Observations"],
  ["diagnosis", "Diagnosis"],
  ["treatmentAdvice", "Treatment Advice"],
  ["immunizationData", "Immunization Data"],
  ["pregnancyData", "Pregnancy Data"],
  ["riskIndicators", "Risk Indicators"],
  ["injuryAndMobilityDetails", "Injury and Mobility Details"],
  ["entFindings", "ENT Findings"],
] as const satisfies ReadonlyArray<
  readonly [keyof StructuredReviewRecord["healthcare"], string]
>;

const financialFields = [
  ["identityVerification", "Identity Verification"],
  ["accountLoanConfirmation", "Account / Loan Confirmation"],
  ["paymentStatus", "Payment Status"],
  ["payerIdentity", "Payer Identity"],
  ["paymentDate", "Payment Date"],
  ["paymentMode", "Payment Mode"],
  ["executiveInteractionDetails", "Executive Interaction Details"],
  ["reasonForPayment", "Reason For Payment"],
  ["amountPaid", "Amount Paid"],
] as const satisfies ReadonlyArray<
  readonly [keyof StructuredReviewRecord["financial"], string]
>;

export function App() {
  const app = useNudiScribeApp();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const healthTone =
    app.health?.status === "ok" ? "ok" : app.health ? "warn" : "neutral";
  const connectionTone =
    app.connectionState === "open"
      ? "ok"
      : app.connectionState === "connecting"
        ? "active"
        : "warn";

  return (
    <div className="shell">
      <aside className="sidebar">
        <Panel
          title="Command Center"
          subtitle="Backend, domain, and session controls"
          aside={<StatusPill label={app.health?.status ?? "unknown"} tone={healthTone} />}
        >
          <div className="stack">
            <div className="summary-grid">
              <div className="stat-tile">
                <span>Model</span>
                <strong>{app.health?.model ?? "Pending"}</strong>
              </div>
              <div className="stat-tile">
                <span>Uptime</span>
                <strong>{app.health ? formatUptime(app.health.uptime_seconds) : "--"}</strong>
              </div>
              <div className="stat-tile">
                <span>Sessions</span>
                <strong>{app.health?.sessions_active ?? 0}</strong>
              </div>
              <div className="stat-tile">
                <span>TTS</span>
                <strong>
                  {app.health?.tts_enabled
                    ? app.health.tts_ready
                      ? "Ready"
                      : "Degraded"
                    : "Off"}
                </strong>
              </div>
            </div>

            <div className="stack-tight">
              <label className="field-label">Domain workflow</label>
              <div className="segmented">
                <button
                  className={app.domain === "healthcare" ? "segmented-active" : ""}
                  onClick={() => app.changeDomain("healthcare")}
                  type="button"
                >
                  Healthcare
                </button>
                <button
                  className={app.domain === "financial" ? "segmented-active" : ""}
                  onClick={() => app.changeDomain("financial")}
                  type="button"
                >
                  Financial / Survey
                </button>
              </div>
            </div>

            <div className="stack-tight">
              <label className="field-label">Session selector</label>
              <select
                className="input-shell"
                onChange={(event) => app.selectSession(event.target.value)}
                value={app.activeSessionId}
              >
                {app.sessionOptions.map((sessionId) => (
                  <option key={sessionId} value={sessionId}>
                    {sessionId}
                  </option>
                ))}
              </select>
              <div className="button-row">
                <button onClick={() => app.createNewSession()} type="button">
                  New session
                </button>
                <button className="button-muted" onClick={() => void app.clearCurrentSession()} type="button">
                  Clear session
                </button>
              </div>
            </div>

            <div className="meta-list">
              <div>
                <span>API</span>
                <strong>{app.apiBaseUrl}</strong>
              </div>
              <div>
                <span>Text link</span>
                <StatusPill label={app.connectionState} tone={connectionTone} />
              </div>
              <div>
                <span>Capture state</span>
                <StatusPill label={app.conversationState} tone={app.conversationState === "error" ? "error" : "active"} />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Runtime Signals" subtitle="Warnings, errors, and readiness">
          <div className="stack-tight">
            {app.healthLoading ? <p className="muted-copy">Refreshing backend health...</p> : null}
            <div className="alert-list">
              {app.health?.warnings.map((warning) => (
                <div className="alert alert-warn" key={warning}>
                  {warning}
                </div>
              ))}
              {app.health?.errors.map((issue) => (
                <div className="alert alert-error" key={issue}>
                  {issue}
                </div>
              ))}
              {app.error ? (
                <div className="alert alert-error">
                  {app.error}
                  <button className="inline-action" onClick={app.clearError} type="button">
                    Dismiss
                  </button>
                </div>
              ) : null}
              {!app.health?.warnings.length && !app.health?.errors.length && !app.error ? (
                <div className="alert alert-ok">No current runtime warnings reported.</div>
              ) : null}
            </div>
            <p className="status-line">{app.statusMessage}</p>
          </div>
        </Panel>
      </aside>

      <main className="main-stage">
        <header className="hero">
          <div>
            <p className="eyebrow">NudiScribe Operations Console</p>
            <h1>Voice-first multilingual workbench for Indian-language workflows</h1>
            <p className="hero-copy">
              Thin frontend over the current FastAPI backend. Session IDs remain stable across text,
              live PCM audio, transcription, and TTS.
            </p>
          </div>
          <nav className="view-tabs">
            {[
              ["workspace", "Workspace"],
              ["review", "Structured Review"],
              ["dashboard", "Dashboard"],
              ["outbound", "Outbound"],
            ].map(([view, label]) => (
              <button
                className={app.view === view ? "tab-active" : ""}
                key={view}
                onClick={() => app.setView(view as typeof app.view)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        {app.view === "workspace" ? (
          <div className="workspace-grid">
            <Panel title="Conversation Input" subtitle="Text assistant turn">
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void app.sendText();
                }}
              >
                <textarea
                  className="input-shell input-area"
                  onChange={(event) => app.setTextInput(event.target.value)}
                  placeholder="Type the next multilingual turn for the active session..."
                  rows={5}
                  value={app.textInput}
                />
                <div className="button-row">
                  <button type="submit">Send text</button>
                  <button className="button-muted" onClick={() => void app.refreshHealth()} type="button">
                    Refresh health
                  </button>
                </div>
                <p className="muted-copy">Current session: {app.activeSessionId}</p>
              </form>
            </Panel>

            <Panel title="Live Microphone" subtitle="16 kHz mono PCM websocket stream">
              <div className="stack">
                <label className="consent-row">
                  <input
                    checked={app.consentConfirmed}
                    onChange={(event) => app.setConsentConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  <span>I confirm capture consent before recording live speech.</span>
                </label>
                <div className="button-row">
                  <button
                    onClick={() => void app.startRecording()}
                    type="button"
                  >
                    Start recording
                  </button>
                  <button
                    className="button-muted"
                    onClick={() => void app.stopRecording()}
                    type="button"
                  >
                    Stop and commit
                  </button>
                </div>
                <p className="muted-copy">
                  Uses an AudioWorklet pipeline instead of MediaRecorder so the backend receives raw
                  `pcm_s16le` frames like the Python audio test client.
                </p>
              </div>
            </Panel>

            <Panel title="Audio Upload" subtitle="File transcription and optional assistant follow-up">
              <div className="stack">
                <input
                  accept=".wav,.mp3,.m4a,.ogg,.webm,.flac,audio/*"
                  className="input-shell"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
                <div className="button-row">
                  <button
                    disabled={!selectedFile}
                    onClick={() => selectedFile && void app.uploadAudio(selectedFile, false)}
                    type="button"
                  >
                    Transcribe only
                  </button>
                  <button
                    className="button-muted"
                    disabled={!selectedFile}
                    onClick={() => selectedFile && void app.uploadAudio(selectedFile, true)}
                    type="button"
                  >
                    Transcribe and ask
                  </button>
                </div>
                <p className="muted-copy">
                  Supported by the existing `POST /api/transcribe` endpoint. No new backend API is introduced.
                </p>
              </div>
            </Panel>

            <Panel title="Transcript Stream" subtitle="Speech, segments, and language metadata">
              {app.transcript ? (
                <div className="stack">
                  <LanguageBadges
                    dominantLanguage={app.transcript.language}
                    isCodeMixed={app.transcript.isCodeMixed}
                    languages={app.transcript.languages}
                  />
                  <div className="transcript-block">{app.transcript.text}</div>
                  <p className="muted-copy">
                    Source: {app.transcript.source} | Updated {formatTimestamp(app.transcript.createdAt)}
                  </p>
                  <div className="segment-list">
                    {app.transcript.segments.map((segment, index) => (
                      <article className="segment-card" key={`${segment.index ?? index}-${segment.text}`}>
                        <div className="segment-topline">
                          <strong>Segment {segment.index ?? index + 1}</strong>
                          <span>{formatSegmentRange(segment.start_ms, segment.end_ms)}</span>
                        </div>
                        <p>{segment.text}</p>
                        <div className="badge-row">
                          {segment.language ? <span className="meta-chip">{segment.language}</span> : null}
                          {segment.engine ? <span className="meta-chip">{segment.engine}</span> : null}
                          {segment.is_code_mixed ? (
                            <span className="meta-chip meta-chip-alert">Code mixed</span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="empty-state">
                  No transcript yet. Start the microphone stream or upload an audio file.
                </p>
              )}
            </Panel>

            <Panel title="Assistant Stream" subtitle="Live generation, language badges, and TTS handoff">
              <div className="stack">
                {app.lastUserText ? (
                  <div className="summary-box">
                    <span>Last user text</span>
                    <p>{app.lastUserText}</p>
                  </div>
                ) : null}

                {app.assistantDraft ? (
                  <div className="stream-block">
                    <StatusPill label="Streaming" tone="active" />
                    <p>{app.assistantDraft}</p>
                  </div>
                ) : null}

                {app.assistant ? (
                  <div className="stack">
                    <LanguageBadges
                      dominantLanguage={app.assistant.language}
                      isCodeMixed={app.assistant.isCodeMixed}
                      languages={app.assistant.languages}
                    />
                    <div className="assistant-block">{app.assistant.text}</div>
                    <p className="muted-copy">
                      Updated {formatTimestamp(app.assistant.createdAt)} | Source: {app.assistant.source}
                    </p>
                  </div>
                ) : (
                  <p className="empty-state">
                    No assistant response yet. Send text or commit a live audio turn.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="Speech Playback" subtitle="TTS readiness, playback, and download">
              <div className="stack">
                <div className="meta-list">
                  <div>
                    <span>TTS readiness</span>
                    <strong>
                      {app.health?.tts_enabled
                        ? app.health.tts_ready
                          ? "Ready"
                          : "Backend degraded"
                        : "Disabled"}
                    </strong>
                  </div>
                  <div>
                    <span>Chunk count</span>
                    <strong>{app.ttsChunkCount}</strong>
                  </div>
                </div>
                <div className="button-row">
                  <button
                    disabled={!app.assistant || !app.health?.tts_enabled || !app.health.tts_ready}
                    onClick={() => void app.synthesizeLatest()}
                    type="button"
                  >
                    Synthesize latest response
                  </button>
                </div>
                {app.ttsPlayback ? (
                  <div className="stack">
                    <audio controls src={app.ttsPlayback.audioUrl} />
                    <a className="download-link" download={app.ttsPlayback.fileName} href={app.ttsPlayback.audioUrl}>
                      Download WAV
                    </a>
                    <p className="muted-copy">
                      Provider: {app.ttsPlayback.provider} | Language: {app.ttsPlayback.language}
                    </p>
                  </div>
                ) : (
                  <p className="empty-state">
                    When TTS is ready, synthesized audio will appear here for playback and download.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        ) : null}

        {app.view === "review" ? (
          <div className="review-grid">
            <Panel
              title="Structured Review"
              subtitle="Editable client-side extraction adapter"
              aside={<StatusPill label={app.domain} tone="active" />}
            >
              <div className="stack">
                <p className="muted-copy">
                  Structured extraction endpoints do not exist in the backend yet. This panel uses a typed
                  client-side adapter with a clean future integration boundary.
                </p>
                <div className="button-row">
                  <button onClick={() => app.refreshStructuredReview()} type="button">
                    Refresh extraction
                  </button>
                </div>
                <div className="form-grid">
                  {genericFields.map(([key, label]) => (
                    <label className="form-card" key={key}>
                      <span>{label}</span>
                      <textarea
                        className="input-shell input-area"
                        onChange={(event) => app.updateGenericField(key, event.target.value)}
                        rows={4}
                        value={app.reviewRecord.generic[key]}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel
              title={app.domain === "healthcare" ? "Healthcare Fields" : "Financial / Survey Fields"}
              subtitle={`Adapter: ${app.reviewRecord.adapter} | Generated ${formatTimestamp(app.reviewRecord.generatedAt)}`}
            >
              <div className="form-grid">
                {(app.domain === "healthcare" ? healthcareFields : financialFields).map(([key, label]) => (
                  <label className="form-card" key={key}>
                    <span>{label}</span>
                    <textarea
                      className="input-shell input-area"
                      onChange={(event) =>
                        app.domain === "healthcare"
                          ? app.updateHealthcareField(key as keyof StructuredReviewRecord["healthcare"], event.target.value)
                          : app.updateFinancialField(key as keyof StructuredReviewRecord["financial"], event.target.value)
                      }
                      rows={4}
                      value={
                        app.domain === "healthcare"
                          ? app.reviewRecord.healthcare[key as keyof StructuredReviewRecord["healthcare"]]
                          : app.reviewRecord.financial[key as keyof StructuredReviewRecord["financial"]]
                      }
                    />
                  </label>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {app.view === "dashboard" ? (
          <div className="stack">
            <Panel title="Longitudinal Dashboard" subtitle="Real session IDs plus local detail adapters">
              <div className="stack">
                <p className="muted-copy">
                  The backend currently exposes session IDs only. Detailed cards below combine that real list with
                  locally cached transcript and review snapshots without pretending full analytics APIs already exist.
                </p>
                <input
                  className="input-shell"
                  onChange={(event) => app.setDashboardQuery(event.target.value)}
                  placeholder="Search by session, domain, language, transcript, or assistant text..."
                  value={app.dashboardQuery}
                />
              </div>
            </Panel>

            <div className="card-grid">
              {app.dashboardRecords.map((record) => (
                <article className={`dashboard-card ${record.isActive ? "dashboard-card-active" : ""}`} key={record.sessionId}>
                  <div className="segment-topline">
                    <strong>{record.sessionId}</strong>
                    <StatusPill
                      label={record.isPersisted ? "backend" : "local"}
                      tone={record.isPersisted ? "ok" : "warn"}
                    />
                  </div>
                  <p className="muted-copy">
                    {record.domain} | {record.sourceLabel}
                  </p>
                  <LanguageBadges languages={record.languages} />
                  <div className="summary-box">
                    <span>Transcript</span>
                    <p>{record.transcriptPreview}</p>
                  </div>
                  <div className="summary-box">
                    <span>Assistant</span>
                    <p>{record.assistantPreview}</p>
                  </div>
                  <p className="muted-copy">{record.reviewStatus}</p>
                  <div className="button-row">
                    <button onClick={() => app.selectSession(record.sessionId)} type="button">
                      Open session
                    </button>
                    <span className="muted-copy">{formatTimestamp(record.lastUpdatedAt)}</span>
                  </div>
                </article>
              ))}
              {!app.dashboardRecords.length ? (
                <div className="empty-state">
                  No dashboard cards match the current search.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {app.view === "outbound" ? (
          <Panel title="Outbound Placeholder" subtitle="Future-facing shell for scripted voice workflows">
            <div className="outbound-shell">
              <div className="stack">
                <h3>Outbound voice campaigns will plug in here later.</h3>
                <p className="muted-copy">
                  This frontend does not invent telephony or dialer integrations. The shell is ready for future
                  workflow configuration, scripted prompts, consent policy, and escalation routing once the backend
                  exposes those capabilities.
                </p>
              </div>
              <div className="placeholder-grid">
                <div className="placeholder-card">
                  <span>Script library</span>
                  <button disabled type="button">
                    Configure scripts
                  </button>
                </div>
                <div className="placeholder-card">
                  <span>Audience rules</span>
                  <button disabled type="button">
                    Define cohorts
                  </button>
                </div>
                <div className="placeholder-card">
                  <span>Call execution</span>
                  <button disabled type="button">
                    Launch workflow
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        ) : null}
      </main>
    </div>
  );
}
