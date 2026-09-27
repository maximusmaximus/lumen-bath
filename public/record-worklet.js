class LumenRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const left = input[0].slice(0);
    const right = (input[1] || input[0]).slice(0);
    this.port.postMessage({ left, right });
    return true;
  }
}

registerProcessor("lumen-recorder", LumenRecorder);
