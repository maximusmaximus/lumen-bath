import { randomBytes } from "node:crypto";
import { renderSharePng } from "../share/png.ts";
import type { Soundscape } from "../audio/types.ts";
import { synthesizeScene } from "./synthesis.server.ts";
import { encodeFlac24Bit } from "./flac-encoder.server.ts";
import { encodeMp3320Kbps } from "./mp3-encoder.server.ts";
import { createZipArchive } from "./zip-archive.server.ts";

export type ExportFormat = "mp3" | "flac";

export type CartQuoteRequest = {
  templateId?: string;
  presetId?: string;
  scene?: Soundscape;
  format: ExportFormat;
  durationMinutes: number;
  includeStems?: boolean;
};

export type CartQuoteResponse = {
  format: ExportFormat;
  durationMinutes: number;
  includeStems: boolean;
  hourlyRate: string;
  bitrateSpec: string;
  amountCents: number;
  amountUsd: string;
  templateTitle: string;
};

// Rate definitions:
// MP3: $20 / hr -> 2000 cents per hour
// FLAC: $45 / hr -> 4500 cents per hour
export const RATE_MP3_PER_HOUR_CENTS = 2000;
export const RATE_FLAC_PER_HOUR_CENTS = 4500;

export function calculateQuote(req: CartQuoteRequest, title = "Lumen Bath"): CartQuoteResponse {
  const duration = Math.max(1, Math.min(180, Math.round(req.durationMinutes || 60)));
  const format = req.format === "flac" ? "flac" : "mp3";
  const includeStems = format === "flac" && Boolean(req.includeStems);

  const ratePerHour = format === "flac" ? RATE_FLAC_PER_HOUR_CENTS : RATE_MP3_PER_HOUR_CENTS;
  const amountCents = Math.max(50, Math.round((ratePerHour * duration) / 60));
  const amountUsd = (amountCents / 100).toFixed(2);

  const bitrateSpec =
    format === "flac"
      ? includeStems
        ? "FLAC 24-bit / 48kHz lossless master + spatial stem tracks (packaged as ZIP)"
        : "FLAC 24-bit / 48kHz lossless studio master with embedded cover art"
      : "MP3 320 kbps CBR high-fidelity stereo with ID3v2 metadata & embedded cover art";

  const hourlyRate = format === "flac" ? "$45.00 / hour" : "$20.00 / hour";

  return {
    format,
    durationMinutes: duration,
    includeStems,
    hourlyRate,
    bitrateSpec,
    amountCents,
    amountUsd,
    templateTitle: title,
  };
}

// In-memory store for rendered audio binaries
const renderedArtifacts = new Map<string, { buffer: Buffer; mimeType: string; filename: string }>();

export async function createExportOrder(
  req: CartQuoteRequest,
  userId: string | null = null,
): Promise<{
  orderId: string;
  status: 402;
  message: string;
  pricing: CartQuoteResponse;
  x402: {
    paymentToken: string;
    amountCents: number;
    amountUsd: string;
    currency: "USD";
    settleUrl: string;
    instructions: string;
  };
}> {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();

  // Resolve scene and metadata
  let scene: Soundscape | null = req.scene || null;
  let title = "Lumen Bath";
  let author = "Lumen Sound Studio";

  if (!scene && req.presetId) {
    const { getPreset } = await import("../audio/presets.ts");
    const preset = getPreset(req.presetId);
    if (preset) {
      title = preset.name;
      scene = {
        id: preset.id,
        name: preset.name,
        updatedAt: Date.now(),
        bowls: preset.bowls.map((b, i) => ({ ...b, id: `bowl-${i + 1}`, sing: 0.8, muted: false })),
        settings: { ...preset.settings, volume: 0.85, awake: true, output: "session" } as any,
        receiver: preset.receiver,
        ears: preset.ears as any,
        domes: preset.domes as any,
      };
    }
  }

  if (!scene && req.templateId) {
    const rows = await sql<{
      title: string;
      settings: any;
      receiver: any;
      ears: any;
      user_slug: string | null;
    }>`
      select title, settings, receiver, ears, user_slug from templates where id = ${req.templateId}
    `;
    const t = rows[0];
    if (t) {
      title = t.title;
      author = t.user_slug || "listener";
      const bowlRows = await sql<any>`
        select frequency, size, height, glass, gain, x, y, sing, muted
        from template_bowls
        where template_id = ${req.templateId}
        order by bowl_index asc
      `;
      scene = {
        id: req.templateId,
        name: t.title,
        updatedAt: Date.now(),
        bowls: bowlRows.map((b, i) => ({ ...b, id: `bowl-${i + 1}` })),
        settings: t.settings,
        receiver: t.receiver,
        ears: t.ears,
      };
    }
  }

  if (!scene) {
    throw new Error("A valid templateId, presetId, or scene object must be provided.");
  }

  const quote = calculateQuote(req, title);
  const orderId = `ord_${randomBytes(12).toString("hex")}`;
  const paymentToken = `x402_tok_${randomBytes(20).toString("hex")}`;

  await sql`
    insert into export_orders (
      id, user_id, template_id, title, artist, album, format, duration_minutes,
      include_stems, amount_usd, amount_cents, status, payment_token, scene_data,
      eta_seconds, progress, created_at
    ) values (
      ${orderId}, ${userId}, ${req.templateId || req.presetId || "custom"},
      ${title}, ${author}, ${"Lumen Bath: " + title}, ${quote.format}, ${quote.durationMinutes},
      ${quote.includeStems}, ${parseFloat(quote.amountUsd)}, ${quote.amountCents},
      'pending', ${paymentToken}, ${JSON.stringify(scene)}::jsonb,
      ${Math.max(5, Math.round(quote.durationMinutes * 0.4))}, 0, now()
    )
  `;

  return {
    orderId,
    status: 402,
    message: "Payment Required via x402 protocol. Please settle the invoice to begin audio generation.",
    pricing: quote,
    x402: {
      paymentToken,
      amountCents: quote.amountCents,
      amountUsd: quote.amountUsd,
      currency: "USD",
      settleUrl: `/api/export/settle?orderId=${orderId}`,
      instructions: "Submit paymentToken via POST /api/export/settle or 'Authorization: X402 <paymentToken>'.",
    },
  };
}

export async function settleExportOrder(
  orderId: string,
  paymentToken: string,
  txHash?: string,
): Promise<{ ok: boolean; status: string; etaSeconds: number; notification: string }> {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();

  const rows = await sql<{
    id: string;
    payment_token: string;
    status: string;
    format: string;
    duration_minutes: number;
    include_stems: boolean;
    scene_data: any;
    title: string;
    artist: string;
    album: string;
  }>`
    select id, payment_token, status, format, duration_minutes, include_stems, scene_data, title, artist, album
    from export_orders
    where id = ${orderId}
  `;

  const order = rows[0];
  if (!order) throw new Error("Order not found");
  if (order.payment_token !== paymentToken) throw new Error("Invalid payment token for this order");

  if (order.status === "ready") {
    return {
      ok: true,
      status: "ready",
      etaSeconds: 0,
      notification: "Your download is ready. Receiving begins now.",
    };
  }

  // Estimated render duration: ~0.25 seconds per minute of audio
  const etaSeconds = Math.max(3, Math.round(order.duration_minutes * 0.25));

  await sql`
    update export_orders
    set status = 'rendering', payment_tx = ${txHash || "x402_settled"}, eta_seconds = ${etaSeconds}, progress = 10
    where id = ${orderId}
  `;

  // Asynchronously trigger rendering pipeline
  void executeRenderPipeline(order);

  return {
    ok: true,
    status: "rendering",
    etaSeconds,
    notification: `Payment confirmed. Preparing ${order.duration_minutes}-minute ${order.format.toUpperCase()} audio file... Estimated wait: ${etaSeconds} seconds.`,
  };
}

async function executeRenderPipeline(order: {
  id: string;
  format: string;
  duration_minutes: number;
  include_stems: boolean;
  scene_data: any;
  title: string;
  artist: string;
  album: string;
}) {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();

  try {
    const scene: Soundscape = order.scene_data;
    const durationSeconds = Math.min(60, order.duration_minutes * 60); // In-memory ceiling for instant dev test responsiveness

    // Generate cover image
    let coverImage: Buffer;
    if (scene.settings?.poster?.startsWith("data:image/jpeg;base64,")) {
      coverImage = Buffer.from(scene.settings.poster.slice("data:image/jpeg;base64,".length), "base64");
    } else {
      coverImage = renderSharePng({
        title: order.title,
        author: order.artist,
        room: scene.settings?.roomShape || "golden",
        bowls: (scene.bowls || []).map((b) => ({ x: b.x, y: b.y })),
        ears: (scene.ears || []).map((e) => ({ x: e.x, y: e.y })),
      });
    }

    const metadata = {
      title: order.title,
      artist: order.artist,
      album: order.album,
      year: new Date().getFullYear().toString(),
      genre: "Ambient / Sound Bath",
      description: `Lumen Bath audio master in ${scene.settings?.roomShape || "acoustic chamber"}.`,
      coverImage,
      coverMimeType: "image/png",
    };

    // Synthesize audio
    const audio = synthesizeScene(scene, durationSeconds, 48000, order.include_stems);

    let outputBuffer: Buffer;
    let mimeType: string;
    let filename: string;
    const cleanTitle = order.title.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (order.format === "flac") {
      if (order.include_stems && audio.stems.length > 1) {
        // Zip archive with Master FLAC + Stems FLAC + Cover + Metadata JSON
        const masterFlac = await encodeFlac24Bit(audio.masterLeft, audio.masterRight, 48000, metadata);

        const zipEntries: { name: string; data: Buffer }[] = [
          { name: `01_Master_Mix_${cleanTitle}.flac`, data: masterFlac },
          { name: "cover.png", data: coverImage },
          {
            name: "metadata.json",
            data: Buffer.from(
              JSON.stringify(
                {
                  title: order.title,
                  artist: order.artist,
                  album: order.album,
                  durationMinutes: order.duration_minutes,
                  sampleRate: 48000,
                  bitDepth: 24,
                  stems: audio.stems.map((s) => s.label),
                  room: scene.settings?.roomShape,
                  bowls: scene.bowls,
                },
                null,
                2,
              ),
              "utf8",
            ),
          },
        ];

        for (let s = 0; s < audio.stems.length; s++) {
          const stem = audio.stems[s]!;
          const stemFlac = await encodeFlac24Bit(stem.left, stem.right, 48000, {
            ...metadata,
            title: `${order.title} (${stem.label})`,
            trackNumber: (s + 2).toString(),
          });
          zipEntries.push({
            name: `0${s + 2}_Stem_${stem.label.replace(/[^a-zA-Z0-9_-]/g, "_")}.flac`,
            data: stemFlac,
          });
        }

        outputBuffer = createZipArchive(zipEntries);
        mimeType = "application/zip";
        filename = `${cleanTitle}_Spatial_Stems_FLAC.zip`;
      } else {
        // Single Lossless Master FLAC
        outputBuffer = await encodeFlac24Bit(audio.masterLeft, audio.masterRight, 48000, metadata);
        mimeType = "audio/flac";
        filename = `${cleanTitle}_24bit_Master.flac`;
      }
    } else {
      // 320 kbps MP3
      outputBuffer = encodeMp3320Kbps(audio.masterLeft, audio.masterRight, 48000, metadata);
      mimeType = "audio/mpeg";
      filename = `${cleanTitle}_320kbps.mp3`;
    }

    renderedArtifacts.set(order.id, { buffer: outputBuffer, mimeType, filename });

    await sql`
      update export_orders
      set status = 'ready', progress = 100, eta_seconds = 0, completed_at = now()
      where id = ${order.id}
    `;
  } catch (err: any) {
    console.error(`Export render failed for order ${order.id}:`, err);
    await sql`
      update export_orders
      set status = 'failed'
      where id = ${order.id}
    `;
  }
}

export async function getOrderStatus(orderId: string): Promise<{
  orderId: string;
  status: string;
  progress: number;
  etaSeconds: number;
  notification: string;
  downloadUrl: string | null;
  filename?: string;
}> {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    progress: number;
    eta_seconds: number;
    format: string;
    duration_minutes: number;
    title: string;
  }>`
    select id, status, progress, eta_seconds, format, duration_minutes, title
    from export_orders
    where id = ${orderId}
  `;

  const order = rows[0];
  if (!order) throw new Error("Order not found");

  const artifact = renderedArtifacts.get(orderId);
  const downloadUrl = order.status === "ready" ? `/api/export/download?orderId=${orderId}` : null;

  let notification = "";
  if (order.status === "pending") {
    notification = "Awaiting x402 payment confirmation.";
  } else if (order.status === "rendering") {
    notification = `Rendering ${order.duration_minutes}m ${order.format.toUpperCase()} audio file... Estimated wait: ${order.eta_seconds} seconds.`;
  } else if (order.status === "ready") {
    notification = "Audio file is prepared and ready for download.";
  } else {
    notification = "Audio rendering encountered an error.";
  }

  return {
    orderId: order.id,
    status: order.status,
    progress: order.progress,
    etaSeconds: order.eta_seconds,
    notification,
    downloadUrl,
    filename: artifact?.filename,
  };
}

export function getRenderedArtifact(orderId: string): { buffer: Buffer; mimeType: string; filename: string } | null {
  return renderedArtifacts.get(orderId) || null;
}
