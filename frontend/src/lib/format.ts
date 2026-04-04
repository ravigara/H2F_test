export function formatUptime(uptimeSeconds: number): string {
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatTimestamp(value?: string): string {
  if (!value) {
    return "No timestamp";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatSegmentRange(startMs?: number, endMs?: number): string {
  if (typeof startMs !== "number" && typeof endMs !== "number") {
    return "No timing metadata";
  }

  const toSeconds = (value?: number) =>
    typeof value === "number" ? `${(value / 1000).toFixed(2)}s` : "?";

  return `${toSeconds(startMs)} to ${toSeconds(endMs)}`;
}

export function clipText(value: string, maxLength = 180): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized || "No data yet";
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}
