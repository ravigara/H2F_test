import { AudioSocketEvent } from "../types";
import { buildWsUrl, normalizeApiBase } from "./api";

interface AudioStreamingSessionOptions {
  apiBase: string;
  sessionId: string;
  onEvent?: (event: AudioSocketEvent) => void;
  onStateChange?: (state: "buffering" | "recording" | "transcribing" | "closed") => void;
}

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

class MicrophonePcmStreamer {
  private onChunk: (buffer: ArrayBuffer) => void;
  private targetSampleRate: number;
  private chunkDurationMs: number;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private pendingSamples: number[] = [];

  constructor(onChunk: (buffer: ArrayBuffer) => void, targetSampleRate = 16000, chunkDurationMs = 250) {
    this.onChunk = onChunk;
    this.targetSampleRate = targetSampleRate;
    this.chunkDurationMs = chunkDurationMs;
  }

  async start() {
    const AudioContextCtor =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error("This browser does not support the Web Audio API.");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContextCtor();
    await this.audioContext.audioWorklet.addModule("/audio-recorder.worklet.js");

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "pcm-capture-processor",
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
      },
    );
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const input = event.data;
      const resampled = resamplePcm(
        input,
        this.audioContext?.sampleRate || this.targetSampleRate,
        this.targetSampleRate,
      );

      for (const sample of resampled) {
        this.pendingSamples.push(sample);
      }

      this.flushReadyChunks();
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  async stop() {
    this.flushRemainder();
    this.workletNode?.disconnect();
    this.silentGain?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.audioContext?.close();
  }

  private flushReadyChunks() {
    const targetChunkSamples = Math.round((this.targetSampleRate * this.chunkDurationMs) / 1000);

    while (this.pendingSamples.length >= targetChunkSamples) {
      const samples = this.pendingSamples.splice(0, targetChunkSamples);
      this.onChunk(floatToInt16(samples).buffer);
    }
  }

  private flushRemainder() {
    if (!this.pendingSamples.length) {
      return;
    }

    this.onChunk(floatToInt16(this.pendingSamples).buffer);
    this.pendingSamples = [];
  }
}

export class AudioStreamingSession {
  private options: AudioStreamingSessionOptions;
  private socket: WebSocket | null = null;
  private streamer: MicrophonePcmStreamer | null = null;
  private pendingAudioConfigResolver: (() => void) | null = null;
  private pendingAudioConfigRejector: ((reason?: unknown) => void) | null = null;
  private terminalPromise: Promise<AudioSocketEvent> | null = null;
  private terminalResolve: ((value: AudioSocketEvent | PromiseLike<AudioSocketEvent>) => void) | null =
    null;
  private terminalReject: ((reason?: unknown) => void) | null = null;

  constructor(options: AudioStreamingSessionOptions) {
    this.options = {
      ...options,
      apiBase: normalizeApiBase(options.apiBase),
    };
  }

  async start() {
    const wsUrl = buildWsUrl(
      this.options.apiBase,
      `/ws/audio/${encodeURIComponent(this.options.sessionId)}`,
    );

    this.socket = new WebSocket(wsUrl);
    this.socket.binaryType = "arraybuffer";
    this.options.onStateChange?.("buffering");

    const openPromise = new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Audio socket was not initialized."));
        return;
      }

      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener(
        "error",
        () => reject(new Error("Audio websocket connection failed.")),
        {
          once: true,
        },
      );
    });

    this.terminalPromise = new Promise<AudioSocketEvent>((resolve, reject) => {
      this.terminalResolve = resolve;
      this.terminalReject = reject;
    });

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event.data as string);
    });

    this.socket.addEventListener("close", () => {
      this.options.onStateChange?.("closed");
    });

    await openPromise;
    this.socket.send(
      JSON.stringify({
        type: "start",
        sample_rate: 16000,
        channels: 1,
        sample_width: 2,
        encoding: "pcm_s16le",
      }),
    );

    await new Promise<void>((resolve, reject) => {
      this.pendingAudioConfigResolver = resolve;
      this.pendingAudioConfigRejector = reject;
    });

    this.streamer = new MicrophonePcmStreamer((buffer) => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(buffer);
      }
    });
    await this.streamer.start();
    this.options.onStateChange?.("recording");
  }

  async stop() {
    if (!this.socket || !this.streamer) {
      throw new Error("Recording session is not active.");
    }

    this.options.onStateChange?.("transcribing");
    await this.streamer.stop();
    this.socket.send("commit");

    const terminalEvent = await this.terminalPromise;
    this.socket.close();
    return terminalEvent;
  }

  private handleMessage(raw: string) {
    let payload: AudioSocketEvent;

    try {
      payload = JSON.parse(raw) as AudioSocketEvent;
    } catch {
      this.pendingAudioConfigRejector?.(new Error("Invalid audio websocket payload."));
      this.terminalReject?.(new Error("Invalid audio websocket payload."));
      return;
    }

    this.options.onEvent?.(payload);

    if (payload.type === "audio_config") {
      this.pendingAudioConfigResolver?.();
      this.pendingAudioConfigResolver = null;
      this.pendingAudioConfigRejector = null;
      return;
    }

    if (
      payload.type === "final" ||
      payload.type === "audio_skipped" ||
      payload.type === "error"
    ) {
      this.terminalResolve?.(payload);
      this.terminalResolve = null;
      this.terminalReject = null;
    }
  }
}

function resamplePcm(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
) {
  if (inputSampleRate === outputSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(Math.round(input.length / ratio), 1);
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(lowerIndex + 1, input.length - 1);
    const interpolation = position - lowerIndex;
    output[index] =
      input[lowerIndex] * (1 - interpolation) + input[upperIndex] * interpolation;
  }

  return output;
}

function floatToInt16(samples: number[] | Float32Array) {
  const output = new Int16Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return output;
}
