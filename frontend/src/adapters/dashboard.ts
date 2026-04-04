import { DashboardCard, Domain, SessionSnapshot } from "../types";

export function buildDashboardCards(
  backendSessionIds: string[],
  snapshots: Record<string, SessionSnapshot>,
  currentSessionId: string,
): DashboardCard[] {
  const sessionIds = Array.from(
    new Set([...backendSessionIds, ...Object.keys(snapshots)]),
  ).sort((left, right) => {
    const leftUpdatedAt = snapshots[left]?.updatedAt || "";
    const rightUpdatedAt = snapshots[right]?.updatedAt || "";

    if (leftUpdatedAt && rightUpdatedAt && leftUpdatedAt !== rightUpdatedAt) {
      return rightUpdatedAt.localeCompare(leftUpdatedAt);
    }

    return right.localeCompare(left);
  });

  return sessionIds.map((sessionId) => {
    const snapshot = snapshots[sessionId];
    const assistantMessages =
      snapshot?.messages?.filter((message) => message.role === "assistant") || [];
    const assistantMessage = assistantMessages[assistantMessages.length - 1];

    return {
      sessionId,
      domain: snapshot?.domain || ("healthcare" satisfies Domain),
      current: sessionId === currentSessionId,
      inBackend: backendSessionIds.includes(sessionId),
      hasLocalData: Boolean(snapshot),
      updatedAt: snapshot?.updatedAt || "",
      languages: Array.from(
        new Set(
          snapshot?.messages.flatMap((message) => message.languages || []) ||
            snapshot?.latestTranscript?.languages ||
            [],
        ),
      ),
      assistantPreview: assistantMessage?.text || "",
      transcriptPreview: snapshot?.latestTranscript?.text || "",
      messageCount: snapshot?.messages.length || 0,
    };
  });
}
