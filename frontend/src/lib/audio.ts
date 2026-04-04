const DEFAULT_TARGET_SAMPLE_RATE = 16000;
const DEFAULT_CHUNK_MS = 250;

export interface PcmRecorderOptions {
  chunkMs?: number;
  targetSampleRate?: number;
  onChunk: (chunk: ArrayBuffer) => void;
}

export interface PcmRecorderStatus {
  sampleRate: number;
  chunkMs: number;
  targetSampleRate: number;
}

export class PcmRecorder {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private pendingInput = new Float32Array(0);
  private readonly chunkMs: number;
  private readonly targetSampleRate: number;
  private readonly onChunk: (chunk: ArrayBuffer) => void;

  constructor(options: PcmRecorderOptions) {
    this.chunkMs = options.chunkMs ?? DEFAULT_CHUNK_MS;
    this.targetSampleRate = options.targetSampleRate ?? DEFAULT_TARGET_SAMPLE_RATE;
    this.onChunk = options.onChunk;
  }

  async start(): Promise<PcmRecorderStatus> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.audioContext = new AudioContext();
    await this.audioContext.audioWorklet.addModule("/worklets/pcm-recorder.worklet.js");

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-recorder-processor");
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;

    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      this.handleInputChunk(event.data);
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    return {
      sampleRate: this.audioContext.sampleRate,
      chunkMs: this.chunkMs,
      targetSampleRate: this.targetSampleRate,
    };
  }

  async stop(): Promise<void> {
    this.flushPendingInput(true);

    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.gainNode?.disconnect();

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  private handleInputChunk(chunk: Float32Array): void {
    const merged = new Float32Array(this.pendingInput.length + chunk.length);
    merged.set(this.pendingInput);
    merged.set(chunk, this.pendingInput.length);
    this.pendingInput = merged;
    this.flushPendingInput(false);
  }

  private flushPendingInput(force: boolean): void {
    if (!this.audioContext) {
      return;
    }

    const sourceChunkLength = Math.max(
      Math.round((this.audioContext.sampleRate * this.chunkMs) / 1000),
      1,
    );

    while (
      this.pendingInput.length >= sourceChunkLength ||
      (force && this.pendingInput.length > 0)
    ) {
      const takeLength =
        force && this.pendingInput.length < sourceChunkLength
          ? this.pendingInput.length
          : sourceChunkLength;
      const chunk = this.pendingInput.slice(0, takeLength);
      this.pendingInput = this.pendingInput.slice(takeLength);
      this.onChunk(downsampleToInt16Buffer(chunk, this.audioContext.sampleRate, this.targetSampleRate));
    }
  }
}

export function downsampleToInt16Buffer(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = DEFAULT_TARGET_SAMPLE_RATE,
): ArrayBuffer {
  if (targetSampleRate >= sourceSampleRate) {
    return floatTo16BitPcm(input).buffer.slice(0) as ArrayBuffer;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(Math.round(input.length / ratio), 1);
  const output = new Int16Array(outputLength);

  let inputOffset = 0;
  for (let index = 0; index < outputLength; index += 1) {
    const nextOffset = Math.min(Math.round((index + 1) * ratio), input.length);
    let accumulator = 0;
    let count = 0;

    for (let cursor = inputOffset; cursor < nextOffset; cursor += 1) {
      accumulator += input[cursor];
      count += 1;
    }

    const sample = count > 0 ? accumulator / count : input[inputOffset] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    inputOffset = nextOffset;
  }

  return output.buffer.slice(0) as ArrayBuffer;
}

export function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, input[index]));
    output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

export function buildObjectUrlFromBase64(audioB64: string, mimeType = "audio/wav"): string {
  const binary = window.atob(audioB64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(audioUrl: string | null): void {
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
  }
}
