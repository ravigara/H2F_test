import { getWebSocketBaseUrl } from "../lib/config";
import type { TtsSegmentPlan, TtsSocketEvent } from "../types/api";

export interface TtsSocketOptions {
  baseUrl: string;
  sessionId: string;
  onEvent: (event: TtsSocketEvent) => void;
  onFailure?: (error: Error) => void;
}

export interface TtsSynthesizeMessage {
  text: string;
  language?: string;
  languages?: string[];
  segments?: TtsSegmentPlan[];
}

export class TtsSocket {
  private socket: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private readonly options: TtsSocketOptions;

  constructor(options: TtsSocketOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const url = `${getWebSocketBaseUrl(this.options.baseUrl)}/ws/tts/${encodeURIComponent(this.options.sessionId)}`;
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.addEventListener("open", () => {
        settled = true;
        resolve();
      });

      socket.addEventListener("message", (event) => {
        try {
          this.options.onEvent(JSON.parse(event.data) as TtsSocketEvent);
        } catch {
          this.options.onFailure?.(new Error("Received malformed TTS websocket payload."));
        }
      });

      socket.addEventListener("error", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Unable to connect to the TTS websocket."));
        }
      });

      socket.addEventListener("close", () => {
        this.connectionPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error("TTS websocket closed before it became ready."));
        }
      });
    });

    return this.connectionPromise;
  }

  async synthesize(message: TtsSynthesizeMessage): Promise<void> {
    await this.connect();

    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("TTS websocket is not connected.");
    }

    this.socket.send(
      JSON.stringify({
        type: "synthesize",
        ...message,
      }),
    );
  }

  destroy(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionPromise = null;
  }
}
