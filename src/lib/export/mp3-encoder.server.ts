import * as lame from "@breezystack/lamejs";
import type { AudioMetadata } from "./flac-encoder.server";

// @ts-expect-error breezystack/lamejs dual export
const Mp3Encoder = lame.Mp3Encoder || (lame.default && lame.default.Mp3Encoder);

function encodeSynchsafe(num: number): Buffer {
  const buf = Buffer.alloc(4);
  buf[0] = (num >> 21) & 0x7f;
  buf[1] = (num >> 14) & 0x7f;
  buf[2] = (num >> 7) & 0x7f;
  buf[3] = num & 0x7f;
  return buf;
}

function makeTextFrame(id: string, text: string): Buffer {
  const textBuf = Buffer.from(text, "utf8");
  const payload = Buffer.concat([Buffer.from([0x03]), textBuf]); // 0x03 = UTF-8 encoding

  const frame = Buffer.alloc(10 + payload.length);
  frame.write(id, 0, 4, "ascii");
  frame.writeUInt32BE(payload.length, 4);
  frame.writeUInt16BE(0, 8); // flags
  payload.copy(frame, 10);
  return frame;
}

function makeCommentFrame(comment: string): Buffer {
  const textBuf = Buffer.from(comment, "utf8");
  // 0x03 (UTF-8) + 'eng' (3 bytes) + 0x00 (empty short description null terminator) + text
  const payload = Buffer.concat([Buffer.from([0x03, 0x65, 0x6e, 0x67, 0x00]), textBuf]);

  const frame = Buffer.alloc(10 + payload.length);
  frame.write("COMM", 0, 4, "ascii");
  frame.writeUInt32BE(payload.length, 4);
  frame.writeUInt16BE(0, 8);
  payload.copy(frame, 10);
  return frame;
}

function makeApicFrame(coverImage: Buffer | Uint8Array, mimeType = "image/png"): Buffer {
  const imageBuf = Buffer.from(coverImage);
  const mimeBuf = Buffer.from(mimeType + "\0", "ascii");
  // 0x00 (ISO-8859-1) + mime + 0x03 (Front Cover) + 0x00 (empty desc null terminator) + imageBuf
  const header = Buffer.concat([Buffer.from([0x00]), mimeBuf, Buffer.from([0x03, 0x00])]);
  const payload = Buffer.concat([header, imageBuf]);

  const frame = Buffer.alloc(10 + payload.length);
  frame.write("APIC", 0, 4, "ascii");
  frame.writeUInt32BE(payload.length, 4);
  frame.writeUInt16BE(0, 8);
  payload.copy(frame, 10);
  return frame;
}

export function buildId3v2Tag(metadata: AudioMetadata): Buffer {
  const frames: Buffer[] = [];

  if (metadata.title) frames.push(makeTextFrame("TIT2", metadata.title));
  if (metadata.artist) frames.push(makeTextFrame("TPE1", metadata.artist));
  if (metadata.album) frames.push(makeTextFrame("TALB", metadata.album));
  if (metadata.year) frames.push(makeTextFrame("TYER", metadata.year));
  if (metadata.genre) frames.push(makeTextFrame("TCON", metadata.genre));
  if (metadata.trackNumber) frames.push(makeTextFrame("TRCK", metadata.trackNumber));
  if (metadata.comment || metadata.description) {
    frames.push(makeCommentFrame(metadata.comment || metadata.description || ""));
  }
  if (metadata.coverImage && metadata.coverImage.length > 0) {
    frames.push(makeApicFrame(metadata.coverImage, metadata.coverMimeType || "image/png"));
  }

  const framesBuf = Buffer.concat(frames);
  const header = Buffer.alloc(10);
  header.write("ID3", 0, 3, "ascii");
  header[3] = 3; // version 2.3.0
  header[4] = 0;
  header[5] = 0; // flags

  const sizeBuf = encodeSynchsafe(framesBuf.length);
  sizeBuf.copy(header, 6);

  return Buffer.concat([header, framesBuf]);
}

export function encodeMp3320Kbps(
  leftChannel: Float32Array,
  rightChannel: Float32Array,
  sampleRate = 48000,
  metadata?: AudioMetadata,
): Buffer {
  const totalSamples = Math.min(leftChannel.length, rightChannel.length);
  const kbps = 320; // Ideal bit rate: 320 kbps CBR
  const encoder = new Mp3Encoder(2, sampleRate, kbps);

  const left16 = new Int16Array(totalSamples);
  const right16 = new Int16Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const l = Math.max(-1, Math.min(1, leftChannel[i]!));
    const r = Math.max(-1, Math.min(1, rightChannel[i]!));
    left16[i] = l < 0 ? Math.round(l * 0x8000) : Math.round(l * 0x7fff);
    right16[i] = r < 0 ? Math.round(r * 0x8000) : Math.round(r * 0x7fff);
  }

  const mp3Chunks: Buffer[] = [];
  const chunkSize = 1152; // LAME standard frame size

  for (let i = 0; i < totalSamples; i += chunkSize) {
    const end = Math.min(i + chunkSize, totalSamples);
    const lChunk = left16.subarray(i, end);
    const rChunk = right16.subarray(i, end);
    const mp3buf = encoder.encodeBuffer(lChunk, rChunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(Buffer.from(mp3buf));
    }
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Chunks.push(Buffer.from(flushBuf));
  }

  const rawMp3 = Buffer.concat(mp3Chunks);

  if (metadata) {
    const id3 = buildId3v2Tag(metadata);
    return Buffer.concat([id3, rawMp3]);
  }

  return rawMp3;
}
