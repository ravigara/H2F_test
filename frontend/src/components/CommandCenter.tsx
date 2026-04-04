import { ActivityState, Domain, HealthResponse, SocketStatus } from "../types";
import { activityLabel, domainLabel, formatUptime } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface CommandCenterProps {
  apiBase: string;
  onApiBaseChange: (value: string) => void;
  health: HealthResponse | null;
  healthLoading: boolean;
  healthError: string | null;
  onRefreshHealth: () => void;
  domain: Domain;
  onDomainChange: (domain: Domain) => void;
  sessionId: string;
  sessions: string[];
  filteredSessions: string[];
  sessionSearch: string;
  onSessionSearchChange: (value: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onClearSession: () => void;
  onRefreshSessions: () => void;
  socketStatus: SocketStatus;
  activityState: ActivityState;
}

export function CommandCenter({
  apiBase,
  onApiBaseChange,
  health,
  healthLoading,
  healthError,
  onRefreshHealth,
  domain,
  onDomainChange,
  sessionId,
  sessions,
  filteredSessions,
  sessionSearch,
  onSessionSearchChange,
  onSelectSession,
  onCreateSession,
  onClearSession,
  onRefreshSessions,
  socketStatus,
  activityState,
}: CommandCenterProps) {
  return (
    <aside className="panel command-center">
      <div className="panel__head">
        <div>
          <p className="eyebrow">Command Center</p>
          <h1>NudiScribe Control Room</h1>
        </div>
        <StatusBadge tone={health?.status === "ok" ? "good" : "warn"}>
          {health?.status || "Unknown"}
        </StatusBadge>
      </div>

      <div className="field-stack">
        <label className="field">
          <span>Backend URL</span>
          <input
            type="text"
            value={apiBase}
            onChange={(event) => onApiBaseChange(event.target.value)}
            placeholder="http://127.0.0.1:8000"
          />
        </label>

        <div className="button-row">
          <button type="button" onClick={onRefreshHealth}>
            {healthLoading ? "Checking..." : "Refresh health"}
          </button>
          <button type="button" className="button button--ghost" onClick={onRefreshSessions}>
            Refresh sessions
          </button>
        </div>
      </div>

      <div className="grid grid--stats">
        <article className="metric-card">
          <span className="metric-card__label">Model</span>
          <strong>{health?.model || "-"}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Uptime</span>
          <strong>{health ? formatUptime(health.uptime_seconds) : "-"}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Sessions</span>
          <strong>{health?.sessions_active ?? sessions.length}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Voice state</span>
          <strong>{activityLabel(activityState)}</strong>
        </article>
      </div>

      <section className="subpanel">
        <div className="subpanel__head">
          <h2>Backend readiness</h2>
          <StatusBadge tone={socketStatus === "open" ? "good" : "warn"}>
            Text WS {socketStatus}
          </StatusBadge>
        </div>

        <div className="stack stack--tight">
          <div className="inline-stat">
            <span>TTS</span>
            <StatusBadge tone={health?.tts_ready ? "good" : "warn"}>
              {health?.tts_enabled ? (health?.tts_ready ? "Ready" : "Degraded") : "Disabled"}
            </StatusBadge>
          </div>
          <div className="inline-stat">
            <span>Real speech providers</span>
            <span>{health?.tts_real_providers.join(", ") || "None configured"}</span>
          </div>
          <div className="inline-stat">
            <span>Tone fallback</span>
            <span>
              {health?.tts_enabled && !health?.tts_real_speech_ready
                ? "Likely fallback only"
                : "Not required"}
            </span>
          </div>
        </div>

        {healthError ? <p className="callout callout--bad">{healthError}</p> : null}
        {health?.warnings.length ? (
          <div className="callout callout--warn">
            <strong>Warnings</strong>
            <ul>
              {health.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {health?.errors.length ? (
          <div className="callout callout--bad">
            <strong>Errors</strong>
            <ul>
              {health.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="subpanel">
        <div className="subpanel__head">
          <h2>Domain</h2>
          <StatusBadge tone="accent">{domainLabel(domain)}</StatusBadge>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            className={domain === "healthcare" ? "is-active" : ""}
            onClick={() => onDomainChange("healthcare")}
          >
            Healthcare
          </button>
          <button
            type="button"
            className={domain === "financial" ? "is-active" : ""}
            onClick={() => onDomainChange("financial")}
          >
            Financial / Survey
          </button>
        </div>
      </section>

      <section className="subpanel">
        <div className="subpanel__head">
          <h2>Sessions</h2>
          <StatusBadge tone="neutral">{sessions.length} backend</StatusBadge>
        </div>

        <div className="stack stack--tight">
          <div className="session-active">
            <span className="eyebrow">Current session</span>
            <strong>{sessionId}</strong>
          </div>

          <div className="button-row">
            <button type="button" onClick={onCreateSession}>
              New session
            </button>
            <button type="button" className="button button--ghost" onClick={onClearSession}>
              Clear current
            </button>
          </div>

          <label className="field">
            <span>Search sessions</span>
            <input
              type="search"
              value={sessionSearch}
              onChange={(event) => onSessionSearchChange(event.target.value)}
              placeholder="Filter by session id"
            />
          </label>
        </div>

        <div className="session-list">
          {filteredSessions.length ? (
            filteredSessions.map((item) => (
              <button
                type="button"
                key={item}
                className={`session-list__item ${item === sessionId ? "is-current" : ""}`}
                onClick={() => onSelectSession(item)}
              >
                <span>{item}</span>
                <span>{item === sessionId ? "Current" : "Available"}</span>
              </button>
            ))
          ) : (
            <p className="empty-copy">
              {sessions.length
                ? "No session matches the current search."
                : "No backend sessions reported yet."}
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
