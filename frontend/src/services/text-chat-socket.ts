import {
  ErrorEvent,
  FinalEvent,
  LanguageInfoEvent,
  SocketStatus,
  TextSocketEvent,
} from "../types";
import { buildWsUrl, normalizeApiBase } from "./api";

interface TextChatSocketHandlers {
  onStatus?: (status: SocketStatus) => void;
  onLanguageInfo?: (event: LanguageInfoEvent) => void;
  onDelta?: (chunk: string) => void;
  onFinal?: (event: FinalEvent) => void;
  onError?: (event: ErrorEvent) => void;
}

const RECONNECT_DELAY_MS = 1500;

export class TextChatSocket {
  private apiBase: string;
  private sessionId: string;
  private handlers: TextChatSocketHandlers;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;

  constructor(apiBase: string, sessionId: string, handlers: TextChatSocketHandlers) {
    this.apiBase = normalizeApiBase(apiBase);
    this.sessionId = sessionId;
    this.handlers = handlers;
  }

  connect() {
    this.clearReconnectTimer();
    this.handlers.onStatus?.("connecting");

    this.socket = new WebSocket(
      buildWsUrl(this.apiBase, `/ws/${encodeURIComponent(this.sessionId)}`),
    );

    this.socket.addEventListener("open", () => {
      this.handlers.onStatus?.("open");
    });

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    this.socket.addEventListener("close", () => {
      this.handlers.onStatus?.("closed");
      if (this.shouldReconnect) {
        this.reconnectTimer = window.setTimeout(() => {
          this.connect();
        }, RECONNECT_DELAY_MS);
      }
    });

    this.socket.addEventListener("error", () => {
      this.handlers.onStatus?.("error");
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.socket?.close();
  }

  reconnect() {
    this.shouldReconnect = true;
    this.socket?.close();
    this.connect();
  }

  sendInput(text: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Text socket is not connected.");
    }

    this.socket.send(
      JSON.stringify({
        type: "input",
        text,
      }),
    );
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleMessage(raw: string) {
    let payload: TextSocketEvent;

    try {
      payload = JSON.parse(raw) as TextSocketEvent;
    } catch {
      this.handlers.onError?.({ type: "error", error: "Received invalid socket payload." });
      return;
    }

    if (payload.type === "language_info") {
      this.handlers.onLanguageInfo?.(payload);
      return;
    }

    if (payload.type === "delta") {
      this.handlers.onDelta?.(payload.text);
      return;
    }

    if (payload.type === "final") {
      this.handlers.onFinal?.(payload);
      return;
    }

    if (payload.type === "error") {
      this.handlers.onError?.(payload);
    }
  }
}
