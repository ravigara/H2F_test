class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];

    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const frames = input[0].length;
    const mono = new Float32Array(frames);

    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      let mixedSample = 0;
      for (let channelIndex = 0; channelIndex < input.length; channelIndex += 1) {
        mixedSample += input[channelIndex][frameIndex] || 0;
      }
      mono[frameIndex] = mixedSample / input.length;
    }

    this.port.postMessage(mono);
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
