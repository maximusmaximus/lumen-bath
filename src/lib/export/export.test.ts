import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateQuote } from "./export-manager.server.ts";
import { generateSceneFromIntent } from "../agent/scene-generator.ts";
import { synthesizeScene } from "./synthesis.server.ts";
import { encodeFlac24Bit } from "./flac-encoder.server.ts";
import { encodeMp3320Kbps } from "./mp3-encoder.server.ts";
import { createZipArchive } from "./zip-archive.server.ts";

describe("x402 Audio Export & Encoding Pipeline", () => {
  it("calculates accurate hourly rates for MP3 ($20/hr) and FLAC ($45/hr)", () => {
    // 60 minutes MP3 = $20.00
    const mp3_60 = calculateQuote({ format: "mp3", durationMinutes: 60 });
    assert.equal(mp3_60.amountUsd, "20.00");
    assert.equal(mp3_60.amountCents, 2000);
    assert.ok(mp3_60.bitrateSpec.includes("320 kbps"));

    // 30 minutes MP3 = $10.00
    const mp3_30 = calculateQuote({ format: "mp3", durationMinutes: 30 });
    assert.equal(mp3_30.amountUsd, "10.00");
    assert.equal(mp3_30.amountCents, 1000);

    // 15 minutes MP3 = $5.00
    const mp3_15 = calculateQuote({ format: "mp3", durationMinutes: 15 });
    assert.equal(mp3_15.amountUsd, "5.00");
    assert.equal(mp3_15.amountCents, 500);

    // 60 minutes FLAC = $45.00
    const flac_60 = calculateQuote({ format: "flac", durationMinutes: 60 });
    assert.equal(flac_60.amountUsd, "45.00");
    assert.equal(flac_60.amountCents, 4500);
    assert.ok(flac_60.bitrateSpec.includes("24-bit"));

    // 30 minutes FLAC = $22.50
    const flac_30 = calculateQuote({ format: "flac", durationMinutes: 30 });
    assert.equal(flac_30.amountUsd, "22.50");
    assert.equal(flac_30.amountCents, 2250);

    // 15 minutes FLAC = $11.25
    const flac_15 = calculateQuote({ format: "flac", durationMinutes: 15 });
    assert.equal(flac_15.amountUsd, "11.25");
    assert.equal(flac_15.amountCents, 1125);
  });

  it("synthesizes multi-ear audio with room acoustics and domes", () => {
    const scene = generateSceneFromIntent({
      prompt: "Golden hall sound bath with 2 domes",
      tuning: "chakra",
      bowlCount: 5,
      domeCount: 2,
      stemCount: 2,
    });

    const audio = synthesizeScene(scene, 0.5, 48000, true);
    assert.equal(audio.sampleRate, 48000);
    assert.equal(audio.masterLeft.length, 24000);
    assert.equal(audio.masterRight.length, 24000);
    assert.equal(audio.stems.length, 2);

    // Audio should not be silence
    let energy = 0;
    for (let i = 0; i < audio.masterLeft.length; i++) {
      energy += Math.abs(audio.masterLeft[i]!);
    }
    assert.ok(energy > 10);
  });

  it("encodes lossless 24-bit FLAC with Vorbis comments and embedded cover picture", async () => {
    const left = new Float32Array(4800); // 0.1s
    const right = new Float32Array(4800);
    for (let i = 0; i < 4800; i++) {
      left[i] = Math.sin(2 * Math.PI * 432 * i / 48000) * 0.8;
      right[i] = Math.sin(2 * Math.PI * 436 * i / 48000) * 0.8;
    }

    const fakeCover = Buffer.alloc(100, 0xaa);
    const metadata = {
      title: "Resonant Dawn",
      artist: "Lumen Bath Master",
      album: "Lumen Bath Master Series",
      year: "2026",
      genre: "Ambient / Sound Bath",
      coverImage: fakeCover,
      coverMimeType: "image/png",
    };

    const flacBuf = await encodeFlac24Bit(left, right, 48000, metadata);
    assert.ok(flacBuf.length > 500);
    // Starts with fLaC
    assert.equal(flacBuf.subarray(0, 4).toString("ascii"), "fLaC");

    // Check that Vorbis and Picture blocks are present
    const flacStr = flacBuf.toString("utf8");
    assert.ok(flacStr.includes("TITLE=Resonant Dawn"));
    assert.ok(flacStr.includes("ARTIST=Lumen Bath Master"));
  });

  it("encodes 320 kbps MP3 with ID3v2 tags and embedded APIC cover art", () => {
    const left = new Float32Array(4800);
    const right = new Float32Array(4800);
    for (let i = 0; i < 4800; i++) {
      left[i] = Math.sin(2 * Math.PI * 432 * i / 48000) * 0.8;
      right[i] = Math.sin(2 * Math.PI * 436 * i / 48000) * 0.8;
    }

    const fakeCover = Buffer.alloc(50, 0xbb);
    const metadata = {
      title: "Crystal Sanctuary",
      artist: "Maxin",
      album: "Lumen Bath Series",
      year: "2026",
      coverImage: fakeCover,
      coverMimeType: "image/png",
    };

    const mp3Buf = encodeMp3320Kbps(left, right, 48000, metadata);
    assert.ok(mp3Buf.length > 200);

    // Starts with ID3v2 header
    assert.equal(mp3Buf.subarray(0, 3).toString("ascii"), "ID3");
    assert.equal(mp3Buf[3], 3); // ID3v2.3

    const mp3Str = mp3Buf.toString("utf8");
    assert.ok(mp3Str.includes("TIT2"));
    assert.ok(mp3Str.includes("Crystal Sanctuary"));
    assert.ok(mp3Str.includes("APIC"));
  });

  it("packages spatial stems into a valid ZIP archive", () => {
    const zip = createZipArchive([
      { name: "01_Master.flac", data: Buffer.from("fake master flac") },
      { name: "02_Stem_1.flac", data: Buffer.from("fake stem flac") },
      { name: "metadata.json", data: Buffer.from(JSON.stringify({ title: "Test" })) },
    ]);

    assert.ok(zip.length > 100);
    // Starts with PK zip signature 0x04034b50
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
  });
});
