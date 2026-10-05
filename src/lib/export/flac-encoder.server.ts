import libflacjs from "libflacjs";

export type AudioMetadata = {
  title: string;
  artist: string;
  album: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  description?: string;
  comment?: string;
  coverImage?: Buffer | Uint8Array;
  coverMimeType?: string;
};

let flacModulePromise: Promise<any> | null = null;

function getFlacModule(): Promise<any> {
  if (!flacModulePromise) {
    flacModulePromise = new Promise((resolve) => {
      const factory = libflacjs as any;
      const Flac = (typeof factory === "function" ? factory : factory.default)();
      Flac.on("ready", () => {
        resolve(Flac);
      });
    });
  }
  return flacModulePromise;
}

export function buildVorbisCommentBlock(metadata: AudioMetadata): Buffer {
  const vendor = "Lumen Bath Audio Engine v1.0 (Xiph.Org libFLAC)";
  const comments: string[] = [
    `TITLE=${metadata.title}`,
    `ARTIST=${metadata.artist}`,
    `ALBUM=${metadata.album}`,
    `GENRE=${metadata.genre || "Ambient / Sound Bath"}`,
    `DATE=${metadata.year || new Date().getFullYear().toString()}`,
  ];

  if (metadata.trackNumber) comments.push(`TRACKNUMBER=${metadata.trackNumber}`);
  if (metadata.description) comments.push(`DESCRIPTION=${metadata.description}`);
  if (metadata.comment) comments.push(`COMMENT=${metadata.comment}`);
  comments.push("ORGANIZATION=Lumen Bath");
  comments.push("CONTACT=https://lumen-bath.local");

  const vendorBuf = Buffer.from(vendor, "utf8");
  const commentBuffers = comments.map((c) => Buffer.from(c, "utf8"));

  let totalSize = 4 + vendorBuf.length + 4;
  for (const c of commentBuffers) {
    totalSize += 4 + c.length;
  }

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  buf.writeUInt32LE(vendorBuf.length, offset);
  offset += 4;
  vendorBuf.copy(buf, offset);
  offset += vendorBuf.length;

  buf.writeUInt32LE(commentBuffers.length, offset);
  offset += 4;

  for (const c of commentBuffers) {
    buf.writeUInt32LE(c.length, offset);
    offset += 4;
    c.copy(buf, offset);
    offset += c.length;
  }

  return buf;
}

export function buildPictureBlock(cover: Buffer | Uint8Array, mimeType = "image/png"): Buffer {
  const imageBuf = Buffer.from(cover);
  const mimeBuf = Buffer.from(mimeType, "ascii");
  const descBuf = Buffer.from("Cover (front)", "utf8");

  const totalSize = 4 + 4 + mimeBuf.length + 4 + descBuf.length + 4 + 4 + 4 + 4 + 4 + imageBuf.length;
  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // Picture type 3 = Cover (front)
  buf.writeUInt32BE(3, offset);
  offset += 4;

  // MIME type
  buf.writeUInt32BE(mimeBuf.length, offset);
  offset += 4;
  mimeBuf.copy(buf, offset);
  offset += mimeBuf.length;

  // Description
  buf.writeUInt32BE(descBuf.length, offset);
  offset += 4;
  descBuf.copy(buf, offset);
  offset += descBuf.length;

  // Width (1200), Height (630), Depth (24), Colors (0)
  buf.writeUInt32BE(1200, offset);
  offset += 4;
  buf.writeUInt32BE(630, offset);
  offset += 4;
  buf.writeUInt32BE(24, offset);
  offset += 4;
  buf.writeUInt32BE(0, offset);
  offset += 4;

  // Data length and bytes
  buf.writeUInt32BE(imageBuf.length, offset);
  offset += 4;
  imageBuf.copy(buf, offset);

  return buf;
}

export async function encodeFlac24Bit(
  leftChannel: Float32Array,
  rightChannel: Float32Array,
  sampleRate = 48000,
  metadata?: AudioMetadata,
): Promise<Buffer> {
  const Flac = await getFlacModule();
  const totalSamples = Math.min(leftChannel.length, rightChannel.length);
  const channels = 2;
  const bps = 24; // Studio master 24-bit
  const compressionLevel = 5;

  const encoder = Flac.create_libflac_encoder(sampleRate, channels, bps, compressionLevel, totalSamples, 0, 4096);
  if (!encoder) throw new Error("Could not initialize FLAC encoder");

  const chunks: Buffer[] = [];
  const status = Flac.init_encoder_stream(encoder, (buf: Uint8Array) => {
    chunks.push(Buffer.from(buf));
  });

  if (status !== 0) {
    Flac.FLAC__stream_encoder_delete(encoder);
    throw new Error(`FLAC encoder init failed with code ${status}`);
  }

  // Interleave 24-bit PCM samples into Int32Array (scaled to 24-bit range: -8388608 to 8388607)
  const max24 = 8388607;
  const pcm = new Int32Array(totalSamples * channels);
  for (let i = 0; i < totalSamples; i++) {
    const l = Math.max(-1, Math.min(1, leftChannel[i]!));
    const r = Math.max(-1, Math.min(1, rightChannel[i]!));
    pcm[i * 2] = Math.round(l * max24);
    pcm[i * 2 + 1] = Math.round(r * max24);
  }

  Flac.FLAC__stream_encoder_process_interleaved(encoder, pcm, totalSamples);
  Flac.FLAC__stream_encoder_finish(encoder);
  Flac.FLAC__stream_encoder_delete(encoder);

  const rawFlac = Buffer.concat(chunks);

  if (!metadata) return rawFlac;

  // Inject VORBIS_COMMENT and PICTURE metadata blocks
  // Find where audio frames begin in rawFlac
  let offset = 4; // Skip "fLaC"
  let streamInfoEnd = 4;

  while (offset < rawFlac.length) {
    const headerByte = rawFlac[offset]!;
    const isLast = (headerByte & 0x80) !== 0;
    const type = headerByte & 0x7f;
    const blockLen = rawFlac.readUIntBE(offset + 1, 3);
    const nextOffset = offset + 4 + blockLen;

    if (type === 0) {
      streamInfoEnd = nextOffset;
    }

    offset = nextOffset;
    if (isLast) break;
  }

  const audioFramesOffset = offset;
  const audioFrames = rawFlac.subarray(audioFramesOffset);

  // Rebuild metadata blocks
  const streamInfo = Buffer.from(rawFlac.subarray(4, streamInfoEnd));
  // Ensure streamInfo is NOT marked as last block
  streamInfo[0] = streamInfo[0]! & 0x7f;

  const vorbisPayload = buildVorbisCommentBlock(metadata);
  const vorbisHeader = Buffer.alloc(4);
  const hasPicture = Boolean(metadata.coverImage && metadata.coverImage.length > 0);
  // type 4, last block flag depends on whether picture follows
  vorbisHeader[0] = (hasPicture ? 0 : 0x80) | 4;
  vorbisHeader.writeUIntBE(vorbisPayload.length, 1, 3);
  const vorbisBlock = Buffer.concat([vorbisHeader, vorbisPayload]);

  let pictureBlock: Buffer | null = null;
  if (hasPicture) {
    const picPayload = buildPictureBlock(metadata.coverImage!, metadata.coverMimeType || "image/png");
    const picHeader = Buffer.alloc(4);
    picHeader[0] = 0x80 | 6; // Last block flag (0x80) + type 6 (PICTURE)
    picHeader.writeUIntBE(picPayload.length, 1, 3);
    pictureBlock = Buffer.concat([picHeader, picPayload]);
  }

  const headerFLaC = Buffer.from("fLaC", "ascii");
  return Buffer.concat([
    headerFLaC,
    streamInfo,
    vorbisBlock,
    ...(pictureBlock ? [pictureBlock] : []),
    audioFrames,
  ]);
}
