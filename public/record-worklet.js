class LumenRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const channels = input.map((channel) => channel.slice(0));
    const left = channels[0];
    const right = channels[1] || channels[0];
    this.port.postMessage({ left, right, channels });
    return true;
  }
}

registerProcessor("lumen-recorder", LumenRecorder);