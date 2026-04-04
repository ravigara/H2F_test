import {
  TtsChunkEvent,
  TtsFinalEvent,
  TtsInfoEvent,
  TtsSegmentInput,
} from "../types";
import { buildWsUrl, normalizeApiBase } from "./api";

interface SynthesizeSpeechOptions {
  apiBase: string;
  sessionId: string;
  text: string;
  language?: string;
  languages?: string[];
  segments?: TtsSegmentInput[];
  onInfo?: (event: TtsInfoEvent) => void;
  onChunk?: (event: TtsChunkEvent) => void;
}

interface SynthesizeSpeechResult {
  info?: TtsInfoEvent;
  final: TtsFinalEvent;
  chunks: TtsChunkEvent[];
}

export async function synthesizeSpeechStream(
  options: SynthesizeSpeechOptions,
): Promise<SynthesizeSpeechResult> {
  const apiBase = normalizeApiBase(options.apiBase);
  const endpoint = buildWsUrl(apiBase, `/ws/tts/${encodeURIComponent(options.sessionId)}`);

  return new Promise<SynthesizeSpeechResult>((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const chunks: TtsChunkEvent[] = [];
    let infoEvent: TtsInfoEvent | undefined;

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "synthesize",
          text: options.text,
          language: options.language,
          languages: options.languages || [],
          segments: options.segments || [],
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      let payload:
        | TtsInfoEvent
        | TtsChunkEvent
        | TtsFinalEvent
        | { type: "error"; error: string };

      try {
        payload = JSON.parse(event.data) as
          | TtsInfoEvent
          | TtsChunkEvent
          | TtsFinalEvent
          | { type: "error"; error: string };
      } catch {
        socket.close();
        reject(new Error("Received invalid TTS websocket payload."));
        return;
      }

      if (payload.type === "tts_info") {
        infoEvent = payload;
        options.onInfo?.(payload);
        return;
      }

      if (payload.type === "audio_chunk") {
        chunks.push(payload);
        options.onChunk?.(payload);
        return;
      }

      if (payload.type === "final") {
        socket.close();
        resolve({
          info: infoEvent,
          final: payload,
          chunks,
        });
        return;
      }

      if (payload.type === "error") {
        socket.close();
        reject(new Error(payload.error));
      }
    });

    socket.addEventListener("error", () => {
      reject(new Error("TTS websocket connection failed."));
    });
  });
}
