import type { DomainMode, SessionSnapshot } from "../types/domain";

const ACTIVE_SESSION_KEY = "nudiscribe.activeSessionId";
const ACTIVE_DOMAIN_KEY = "nudiscribe.activeDomain";
const SNAPSHOT_KEY = "nudiscribe.sessionSnapshots";

export function createSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `session-${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

export function loadStoredSessionId(): string | null {
  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function storeActiveSessionId(sessionId: string): void {
  window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
}

export function loadStoredDomain(): DomainMode | null {
  const value = window.localStorage.getItem(ACTIVE_DOMAIN_KEY);
  if (value === "healthcare" || value === "financial") {
    return value;
  }
  return null;
}

export function storeActiveDomain(domain: DomainMode): void {
  window.localStorage.setItem(ACTIVE_DOMAIN_KEY, domain);
}

function loadSnapshotMap(): Record<string, SessionSnapshot> {
  const raw = window.localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, SessionSnapshot>;
  } catch {
    return {};
  }
}

function saveSnapshotMap(map: Record<string, SessionSnapshot>): void {
  window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(map));
}

export function loadSessionSnapshot(sessionId: string): SessionSnapshot | null {
  return loadSnapshotMap()[sessionId] ?? null;
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  const map = loadSnapshotMap();
  map[snapshot.sessionId] = snapshot;
  saveSnapshotMap(map);
}

export function removeSessionSnapshot(sessionId: string): void {
  const map = loadSnapshotMap();
  delete map[sessionId];
  saveSnapshotMap(map);
}

export function listLocalSnapshots(): SessionSnapshot[] {
  return Object.values(loadSnapshotMap()).sort((left, right) =>
    right.lastUpdatedAt.localeCompare(left.lastUpdatedAt),
  );
}
