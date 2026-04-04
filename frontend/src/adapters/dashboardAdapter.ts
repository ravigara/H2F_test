import { clipText } from "../lib/format";
import { listLocalSnapshots } from "../lib/session";
import type { DashboardRecord } from "../types/domain";

export interface DashboardAdapterInput {
  backendSessions: string[];
  activeSessionId: string;
  query: string;
}

export interface DashboardDataAdapter {
  build(input: DashboardAdapterInput): DashboardRecord[];
}

function buildReviewStatus(sourceLabel: string, hasReview: boolean): string {
  if (hasReview) {
    return `${sourceLabel} review ready`;
  }
  return `${sourceLabel} waiting for extraction`;
}

export class LocalDashboardAdapter implements DashboardDataAdapter {
  build(input: DashboardAdapterInput): DashboardRecord[] {
    const snapshots = listLocalSnapshots();
    const localById = new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot]));
    const sessionIds = Array.from(new Set([...input.backendSessions, ...localById.keys()]));

    const normalizedQuery = input.query.trim().toLowerCase();
    const records = sessionIds.map((sessionId) => {
      const snapshot = localById.get(sessionId);
      const isPersisted = input.backendSessions.includes(sessionId);
      const sourceLabel = isPersisted ? "Backend session" : "Local adapter";

      return {
        sessionId,
        domain: snapshot?.domain ?? "unknown",
        transcriptPreview: clipText(snapshot?.transcript?.text ?? "No local transcript cached yet."),
        assistantPreview: clipText(snapshot?.assistant?.text ?? "No local assistant response cached yet."),
        languages: snapshot?.languages ?? [],
        reviewStatus: buildReviewStatus(sourceLabel, Boolean(snapshot?.review)),
        sourceLabel,
        lastUpdatedAt: snapshot?.lastUpdatedAt ?? "",
        isActive: input.activeSessionId === sessionId,
        isPersisted,
      } satisfies DashboardRecord;
    });

    return records
      .filter((record) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          record.sessionId,
          record.domain,
          record.transcriptPreview,
          record.assistantPreview,
          record.languages.join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => right.lastUpdatedAt.localeCompare(left.lastUpdatedAt));
  }
}
