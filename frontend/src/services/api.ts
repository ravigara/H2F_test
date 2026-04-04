import {
  ChatResponse,
  HealthResponse,
  TranscribeResponse,
  TtsResponse,
} from "../types";

export function normalizeApiBase(value: string) {
  const nextValue = value.trim().replace(/\/+$/, "");
  return nextValue || "http://127.0.0.1:8000";
}

export function buildWsUrl(apiBase: string, pathname: string) {
  const url = new URL(normalizeApiBase(apiBase));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function getHealth(apiBase: string) {
  return fetchJson<HealthResponse>(`${normalizeApiBase(apiBase)}/api/health`);
}

export async function getSessions(apiBase: string) {
  const response = await fetchJson<{ sessions: string[]; count: number }>(
    `${normalizeApiBase(apiBase)}/api/sessions`,
  );
  return response.sessions;
}

export async function clearSession(apiBase: string, sessionId: string) {
  return fetchJson<{ status: string; session_id: string }>(
    `${normalizeApiBase(apiBase)}/api/session/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function postChat(apiBase: string, sessionId: string, text: string) {
  return fetchJson<ChatResponse>(`${normalizeApiBase(apiBase)}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      text,
    }),
  });
}

export async function transcribeAudio(apiBase: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return fetchJson<TranscribeResponse>(`${normalizeApiBase(apiBase)}/api/transcribe`, {
    method: "POST",
    body: formData,
  });
}

export async function synthesizeSpeech(
  apiBase: string,
  text: string,
  language?: string,
  languages?: string[],
) {
  return fetchJson<TtsResponse>(`${normalizeApiBase(apiBase)}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      language,
      languages: languages || [],
    }),
  });
}
