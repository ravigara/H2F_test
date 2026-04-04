import { getWebSocketBaseUrl } from "../lib/config";
import type { AudioSocketEvent } from "../types/api";

export interface AudioStreamSocketOptions {
  baseUrl: string;
  sessionId: string;
  onEvent: (event: AudioSocketEvent) => void;
  onFailure?: (error: Error) => void;
}

export interface AudioStartMessage {
  sample_rate: number;
  channels: number;
  sample_width: number;
  encoding: "pcm_s16le";
}

export class AudioStreamSocket {
  private socket: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private readonly options: AudioStreamSocketOptions;

  constructor(options: AudioStreamSocketOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const url = `${getWebSocketBaseUrl(this.options.baseUrl)}/ws/audio/${encodeURIComponent(this.options.sessionId)}`;
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      this.socket = socket;

      socket.addEventListener("open", () => {
        settled = true;
        resolve();
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        try {
          this.options.onEvent(JSON.parse(event.data) as AudioSocketEvent);
        } catch {
          this.options.onFailure?.(new Error("Received malformed audio websocket payload."));
        }
      });

      socket.addEventListener("error", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Unable to connect to the audio websocket."));
        }
      });

      socket.addEventListener("close", () => {
        this.connectionPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error("Audio websocket closed before it became ready."));
        }
      });
    });

    return this.connectionPromise;
  }

  async start(config: AudioStartMessage): Promise<void> {
    await this.connect();
    this.socket?.send(
      JSON.stringify({
        type: "start",
        ...config,
      }),
    );
  }

  sendPcmChunk(chunk: ArrayBuffer): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Audio websocket is not connected.");
    }

    this.socket.send(chunk);
  }

  commit(): void {
    this.socket?.send("commit");
  }

  reset(): void {
    this.socket?.send("reset");
  }

  destroy(): void {
    this.socket?.close();
    this.socket = null;
    this.connectionPromise = null;
  }
}
