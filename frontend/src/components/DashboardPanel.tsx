import { DashboardCard } from "../types";
import { domainLabel, formatLanguages, formatRelativeTime, truncateText } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface DashboardPanelProps {
  cards: DashboardCard[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onRefreshSessions: () => void;
  onSelectSession: (sessionId: string) => void;
}

export function DashboardPanel({
  cards,
  searchValue,
  onSearchChange,
  onRefreshSessions,
  onSelectSession,
}: DashboardPanelProps) {
  return (
    <section className="panel review-shell">
      <div className="panel__head">
        <div>
          <p className="eyebrow">Longitudinal History / Dashboard</p>
          <h2>Session summaries use real backend IDs and local detail adapters.</h2>
        </div>
        <button type="button" onClick={onRefreshSessions}>
          Refresh backend sessions
        </button>
      </div>

      <p className="surface__copy">
        The backend does not expose transcript history retrieval yet. These cards combine live
        session IDs from <code>GET /api/sessions</code> with local session snapshots for previews
        and search.
      </p>

      <label className="field">
        <span>Search session summaries</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by session id or preview text"
        />
      </label>

      <div className="dashboard-grid">
        {cards.length ? (
          cards.map((card) => (
            <article key={card.sessionId} className="session-card">
              <div className="session-card__head">
                <div>
                  <strong>{card.sessionId}</strong>
                  <p>{domainLabel(card.domain)}</p>
                </div>
                {card.current ? (
                  <StatusBadge tone="accent">Current</StatusBadge>
                ) : (
                  <StatusBadge tone={card.inBackend ? "good" : "warn"}>
                    {card.inBackend ? "Backend visible" : "Local only"}
                  </StatusBadge>
                )}
              </div>

              <div className="badge-row">
                <StatusBadge tone="neutral">{card.messageCount} messages</StatusBadge>
                <StatusBadge tone="neutral">
                  {card.languages.length ? formatLanguages(card.languages) : "No language data"}
                </StatusBadge>
                <StatusBadge tone={card.hasLocalData ? "good" : "warn"}>
                  {card.hasLocalData ? "Local detail" : "No local detail"}
                </StatusBadge>
              </div>

              <p className="session-card__copy">
                <strong>Transcript:</strong>{" "}
                {card.transcriptPreview
                  ? truncateText(card.transcriptPreview, 120)
                  : "No local transcript preview."}
              </p>
              <p className="session-card__copy">
                <strong>Assistant:</strong>{" "}
                {card.assistantPreview
                  ? truncateText(card.assistantPreview, 120)
                  : "No local assistant preview."}
              </p>
              <div className="session-card__footer">
                <span>{formatRelativeTime(card.updatedAt)}</span>
                <button type="button" className="button button--ghost" onClick={() => onSelectSession(card.sessionId)}>
                  Open session
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-copy">
            No session cards match the current filters. Generate activity in the workspace to build
            local summaries.
          </p>
        )}
      </div>
    </section>
  );
}
