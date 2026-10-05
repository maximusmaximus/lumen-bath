export function concatFloats(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = Math.min(left.length, right.length);
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + frames * 4, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(offset, floatToPcm(left[i] ?? 0), true);
    view.setInt16(offset + 2, floatToPcm(right[i] ?? 0), true);
    offset += 4;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Stereo stays a plain WAV. More than one ear becomes a multi-channel WAV, two channels per ear. */
export function encodeWavChannels(channels: Float32Array[], sampleRate: number): Blob {
  const count = Math.max(1, channels.length);
  if (count === 1) return encodeWav(channels[0] ?? new Float32Array(), channels[0] ?? new Float32Array(), sampleRate);
  if (count === 2) return encodeWav(channels[0] ?? new Float32Array(), channels[1] ?? new Float32Array(), sampleRate);
  const frames = channels.reduce((min, channel) => Math.min(min, channel.length), channels[0]?.length ?? 0);
  const block = count * 2;
  const dataBytes = frames * block;
  const fmtSize = 40;
  const dataAt = 60;
  const buffer = new ArrayBuffer(dataAt + 8 + dataBytes);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, fmtSize, true);
  view.setUint16(20, 0xfffe, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * block, true);
  view.setUint16(32, block, true);
  view.setUint16(34, 16, true);
  view.setUint16(36, 22, true);
  view.setUint16(38, 16, true);
  view.setUint32(40, 0, true);
  // KSDATAFORMAT_SUBTYPE_PCM
  const pcm = [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
  pcm.forEach((byte, index) => view.setUint8(44 + index, byte));
  writeString(view, dataAt, "data");
  view.setUint32(dataAt + 4, dataBytes, true);
  let offset = dataAt + 8;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < count; channel++) {
      view.setInt16(offset, floatToPcm(channels[channel]?.[frame] ?? 0), true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function floatToPcm(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}
