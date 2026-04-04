class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channelData = inputs[0]?.[0];
    if (channelData) {
      this.port.postMessage(new Float32Array(channelData));
    }
    return true;
  }
}

registerProcessor("pcm-recorder-processor", PcmRecorderProcessor);
