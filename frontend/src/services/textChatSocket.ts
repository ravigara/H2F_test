import { getWebSocketBaseUrl } from "../lib/config";
import type { TextSocketEvent } from "../types/api";

export type SocketConnectionState = "connecting" | "open" | "closed";

export interface TextChatSocketOptions {
  baseUrl: string;
  sessionId: string;
  onEvent: (event: TextSocketEvent) => void;
  onConnectionChange?: (state: SocketConnectionState) => void;
  onFailure?: (error: Error) => void;
  reconnectDelayMs?: number;
}

export class TextChatSocket {
  private socket: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimer: number | null = null;
  private manuallyClosed = false;
  private readonly options: TextChatSocketOptions;

  constructor(options: TextChatSocketOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const url = `${getWebSocketBaseUrl(this.options.baseUrl)}/ws/${encodeURIComponent(this.options.sessionId)}`;
    this.options.onConnectionChange?.("connecting");
    this.manuallyClosed = false;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.addEventListener("open", () => {
        settled = true;
        this.options.onConnectionChange?.("open");
        resolve();
      });

      socket.addEventListener("message", (event) => {
        try {
          this.options.onEvent(JSON.parse(event.data) as TextSocketEvent);
        } catch {
          this.options.onFailure?.(new Error("Received malformed text websocket payload."));
        }
      });

      socket.addEventListener("error", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Unable to connect to the text websocket."));
        }
      });

      socket.addEventListener("close", () => {
        this.connectionPromise = null;
        this.options.onConnectionChange?.("closed");
        if (!settled) {
          settled = true;
          reject(new Error("Text websocket closed before it became ready."));
        }
        if (!this.manuallyClosed) {
          this.scheduleReconnect();
        }
      });
    });

    return this.connectionPromise;
  }

  async sendInput(text: string): Promise<void> {
    await this.connect();

    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Text websocket is not connected.");
    }

    this.socket.send(
      JSON.stringify({
        type: "input",
        text,
      }),
    );
  }

  destroy(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.connectionPromise = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.options.onFailure?.(error instanceof Error ? error : new Error(String(error)));
      });
    }, this.options.reconnectDelayMs ?? 1500);
  }
}
