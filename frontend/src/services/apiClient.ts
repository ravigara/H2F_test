import { getApiBaseUrl } from "../lib/config";
import type {
  ChatRequest,
  ChatResponse,
  HealthResponse,
  SessionListResponse,
  TranscribeResponse,
  TtsRequest,
  TtsResponse,
} from "../types/api";

export class ApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = getApiBaseUrl()) {
    this.baseUrl = baseUrl;
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/health");
  }

  async listSessions(): Promise<SessionListResponse> {
    return this.request<SessionListResponse>("/api/sessions");
  }

  async clearSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    return this.request<{ status: string; session_id: string }>(
      `/api/session/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );
  }

  async sendChat(body: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  async transcribe(file: File): Promise<TranscribeResponse> {
    const formData = new FormData();
    formData.append("file", file);

    return this.request<TranscribeResponse>("/api/transcribe", {
      method: "POST",
      body: formData,
    });
  }

  async synthesize(body: TtsRequest): Promise<TtsResponse> {
    return this.request<TtsResponse>("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const payload = await response
      .json()
      .catch(() => ({ error: `Request failed with status ${response.status}` }));

    if (!response.ok) {
      throw new Error(payload.error ?? response.statusText);
    }

    return payload as T;
  }
}
