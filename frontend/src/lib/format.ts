import { ActivityState, Domain } from "../types";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  unknown: "Unknown",
};

export function formatRelativeTime(value?: string) {
  if (!value) {
    return "No activity yet";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatClock(value?: string) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatUptime(seconds: number) {
  const rounded = Math.max(Math.round(seconds), 0);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function formatLanguage(language: string) {
  return LANGUAGE_LABELS[language] || language.toUpperCase();
}

export function formatLanguages(languages: string[]) {
  if (!languages.length) {
    return "Unknown";
  }
  return languages.map(formatLanguage).join(" + ");
}

export function domainLabel(domain: Domain) {
  return domain === "healthcare" ? "Healthcare" : "Financial / Survey";
}

export function activityLabel(state: ActivityState) {
  switch (state) {
    case "recording":
      return "Recording";
    case "buffering":
      return "Buffering";
    case "transcribing":
      return "Transcribing";
    case "generating":
      return "Generating";
    case "speaking":
      return "Speaking";
    case "error":
      return "Attention";
    default:
      return "Idle";
  }
}

export function formatSegmentRange(startMs?: number | null, endMs?: number | null) {
  if (startMs == null && endMs == null) {
    return "No timestamp";
  }

  const start = startMs == null ? "--" : `${(startMs / 1000).toFixed(2)}s`;
  const end = endMs == null ? "--" : `${(endMs / 1000).toFixed(2)}s`;
  return `${start} -> ${end}`;
}

export function decodeBase64Audio(audioBase64: string, mimeType: string) {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function truncateText(value: string, maxLength = 120) {
  const cleanValue = value.trim();
  if (cleanValue.length <= maxLength) {
    return cleanValue;
  }

  return `${cleanValue.slice(0, maxLength - 1).trimEnd()}…`;
}
