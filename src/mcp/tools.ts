import { generateSceneFromIntent, type SceneIntent } from "../lib/agent/scene-generator.ts";
import { claimPairingCode } from "../lib/agent/pairing.server.ts";
import { PRESETS, getPreset } from "../lib/audio/presets.ts";
import { calculateQuote, createExportOrder, getOrderStatus, settleExportOrder, type CartQuoteRequest } from "../lib/export/export-manager.server.ts";
import type { Soundscape } from "../lib/audio/types.ts";

// In-memory agent state for active paired user
let activeAgentToken: string | null = null;
let activeUserId: string | null = null;
let activeUsername: string | null = null;

export function setActiveAgentToken(token: string, userId: string, username: string) {
  activeAgentToken = token;
  activeUserId = userId;
  activeUsername = username;
}

export function getActiveAgentSession() {
  return { agentToken: activeAgentToken, userId: activeUserId, username: activeUsername };
}

export const MCP_TOOLS = [
  {
    name: "lumen_pair_profile",
    description:
      "Pair this agent session with a Lumen Bath user profile using a 6-character pairing code from the web UI dashboard. Once paired, the agent can create, save, and load soundscapes and templates under the user's account.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The 6-character pairing code displayed in the user's Lumen Bath profile dashboard.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "lumen_generate_scene",
    description:
      "Generate a complete crystal singing-bowl sound bath arrangement using natural language or acoustic parameters. Elements (bowls, ear horns, stems, domes, room acoustics) are placed automatically using physical geometry and harmonic tuning sets, so the user does not have to position coordinates manually.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Natural language description of desired sound bath (e.g., 'Deep meditation in a cathedral with obsidian bowls, 4.5Hz theta beat, quad stems, and 2 overhead domes').",
        },
        roomShape: {
          type: "string",
          enum: [
            "rotunda",
            "golden",
            "shoebox",
            "chapel",
            "nave",
            "cube",
            "corridor",
            "dome",
            "fan",
            "cave",
            "court",
            "gilded",
            "octagon",
            "apse",
            "ellipse",
          ],
          description: "Acoustic room profile shape.",
        },
        tuning: {
          type: "string",
          enum: ["chakra", "solfeggio", "planetary", "fifths", "deep_drone", "angelic", "pentatonic"],
          description: "Harmonic tuning system for the crystal singing bowls.",
        },
        bowlCount: {
          type: "number",
          description: "Number of crystal singing bowls (3 to 20).",
        },
        layout: {
          type: "string",
          enum: ["circle", "spiral", "front_arc", "stereo_antiphonal", "sanctuary"],
          description: "Spatial placement geometry around the ear horns.",
        },
        loopMode: {
          type: "string",
          enum: ["continuous", "breath", "tide", "mallet", "canon"],
          description: "Rhythmic breathing envelope.",
        },
        binauralBeatHz: {
          type: "number",
          description: "Binaural beat frequency in Hz (e.g. 4.5 for theta, 7.83 for Schumann, 10.0 for alpha).",
        },
        stemCount: {
          type: "number",
          description: "Total listening and recording ears (1 for stereo, 2-8 for spatial stem recording).",
        },
        domeCount: {
          type: "number",
          description: "Number of suspended overhead acoustic return domes (0 to 4).",
        },
        title: {
          type: "string",
          description: "Optional custom title for the soundscape.",
        },
      },
    },
  },
  {
    name: "lumen_list_templates",
    description:
      "List available sound bath tracks, house presets, community fan creations, and user's saved soundscapes with descriptions, acoustic tags, room shapes, and bowl counts.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "house", "fan", "mine"],
          description: "Category of templates to list.",
        },
        limit: {
          type: "number",
          description: "Maximum number of templates to return (default: 20).",
        },
      },
    },
  },
  {
    name: "lumen_get_template",
    description:
      "Retrieve full details of a specific sound bath template, house preset, or saved scene by ID or name.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The template ID, preset ID (e.g. 'hall-canopy'), or saved soundscape ID.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "lumen_save_template",
    description:
      "Save a soundscape scene to the user's account library and publish it as a shareable fan template.",
    inputSchema: {
      type: "object",
      properties: {
        scene: {
          type: "object",
          description: "The Soundscape scene object to save (output from lumen_generate_scene).",
        },
        title: {
          type: "string",
          description: "Title for the saved template.",
        },
        description: {
          type: "string",
          description: "Description of the soundscape.",
        },
      },
      required: ["scene", "title"],
    },
  },
  {
    name: "lumen_export_quote_cart",
    description:
      "Calculate pricing quote for exporting a sound bath track. MP3 is available at $20/hr (ideal 320 kbps CBR stereo). Lossless FLAC is available at $45/hr (24-bit 48kHz studio master, supports optional spatial stems multi-track package). Durations can be selected in minutes.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["mp3", "flac"],
          description: "Audio format: 'mp3' ($20/hr, 320kbps) or 'flac' ($45/hr, 24-bit 48kHz lossless).",
        },
        durationMinutes: {
          type: "number",
          description: "Duration of the exported audio in minutes (e.g. 15, 30, 60, 120).",
        },
        includeStems: {
          type: "boolean",
          description: "If format is 'flac', package spatial stem recordings as a multi-channel stem ZIP archive.",
        },
        templateId: {
          type: "string",
          description: "Optional template ID or preset ID.",
        },
      },
      required: ["format", "durationMinutes"],
    },
  },
  {
    name: "lumen_create_x402_order",
    description:
      "Create an x402 audio export order. Returns HTTP 402 with x402 payment requirements. Allows an agent to use the service without logging in, or with linked account. Payment is required to export templates as downloadable song tracks ($20/hr MP3, $45/hr FLAC).",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["mp3", "flac"],
          description: "Audio format.",
        },
        durationMinutes: {
          type: "number",
          description: "Track duration in minutes.",
        },
        includeStems: {
          type: "boolean",
          description: "Include spatial stem tracks (FLAC only).",
        },
        templateId: {
          type: "string",
          description: "Template or preset ID.",
        },
        scene: {
          type: "object",
          description: "Optional full scene data to render.",
        },
      },
      required: ["format", "durationMinutes"],
    },
  },
  {
    name: "lumen_settle_x402_order",
    description:
      "Settle the x402 payment for an audio export order. Transitions the order to rendering and returns an estimated time notification (ETA).",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The order ID returned by lumen_create_x402_order.",
        },
        paymentToken: {
          type: "string",
          description: "The x402 payment token from the order challenge.",
        },
        txHash: {
          type: "string",
          description: "Optional payment proof or transaction hash.",
        },
      },
      required: ["orderId", "paymentToken"],
    },
  },
  {
    name: "lumen_check_order_status",
    description:
      "Check the status and preparation progress of an audio export order. Provides a notification of how long it will take (ETA) and returns the final download URL when ready.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The order ID.",
        },
      },
      required: ["orderId"],
    },
  },
  {
    name: "lumen_get_download",
    description:
      "Get final download details for a ready audio export. Output files include complete tagged metadata and embedded cover art.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The order ID.",
        },
      },
      required: ["orderId"],
    },
  },
];

export async function executeMcpTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case "lumen_pair_profile": {
      const res = await claimPairingCode(args.code);
      if (!res.ok) return { error: res.error };
      setActiveAgentToken(res.agentToken!, res.userId!, res.username!);
      return {
        success: true,
        message: `Successfully paired with user profile "${res.username}".`,
        agentToken: res.agentToken,
        userId: res.userId,
        username: res.username,
      };
    }

    case "lumen_generate_scene": {
      const scene = generateSceneFromIntent(args as SceneIntent);
      return {
        success: true,
        message: `Generated sound bath "${scene.name}" with ${scene.bowls.length} bowls in ${scene.settings.roomShape} room.`,
        scene,
      };
    }

    case "lumen_list_templates": {
      const limit = Math.max(1, Math.min(50, args.limit || 20));

      const housePresets = PRESETS.map((p) => ({
        id: p.id,
        kind: "house",
        title: p.name,
        description: p.blurb,
        room: p.settings?.roomShape || "shoebox",
        bowls: p.bowls.length,
        ears: p.ears?.length || 1,
        domes: p.domes?.length || 0,
        tags: p.tags,
      }));

      let fanTemplates: any[] = [];
      if (args.filter !== "house") {
        try {
          const { getSql } = await import("../lib/db.ts");
          const sql = await getSql();
          const rows = await sql<{
          id: string;
          title: string;
          description: string;
          kind: string;
          plays: number;
          shares: number;
          user_slug: string | null;
          slug: string | null;
          settings: any;
        }>`
          select id, title, description, kind, plays, shares, user_slug, slug, settings
          from templates
          order by created_at desc
          limit ${limit}
        `;
          fanTemplates = rows.map((r) => ({
            id: r.id,
            kind: "fan",
            title: r.title,
            description: r.description,
            author: r.user_slug || "listener",
            room: r.settings?.roomShape || "golden",
            shareUrl: r.user_slug && r.slug ? `/s/${r.user_slug}/${r.slug}.html` : null,
          }));
        } catch {
          // Running in standalone test or without active DB
        }
      }

      const all = args.filter === "house" ? housePresets : args.filter === "fan" ? fanTemplates : [...housePresets, ...fanTemplates];
      return {
        total: all.length,
        templates: all.slice(0, limit),
        pricingSchedule: {
          mp3: "$20.00 / hour (320 kbps high-fidelity stereo)",
          flac: "$45.00 / hour (24-bit 48kHz studio master, includes spatial stems)",
        },
      };
    }

    case "lumen_get_template": {
      const preset = getPreset(args.id);
      if (preset) {
        return {
          id: preset.id,
          source: "house_preset",
          title: preset.name,
          description: preset.blurb,
          preset,
        };
      }

      try {
        const { getSql } = await import("../lib/db.ts");
        const sql = await getSql();
        const rows = await sql<any>`
          select id, title, description, settings, receiver, ears, user_slug, slug
          from templates where id = ${args.id}
        `;
        const t = rows[0];
        if (!t) return { error: `Template or preset '${args.id}' not found.` };

        const bowlRows = await sql<any>`
          select bowl_index, frequency, size, height, glass, gain, x, y, sing, muted
          from template_bowls
          where template_id = ${args.id}
          order by bowl_index asc
        `;

        return {
          id: t.id,
          source: "community_template",
          title: t.title,
          description: t.description,
          author: t.user_slug,
          shareUrl: `/s/${t.user_slug}/${t.slug}.html`,
          scene: {
            id: t.id,
            name: t.title,
            updatedAt: Date.now(),
            bowls: bowlRows,
            settings: t.settings,
            receiver: t.receiver,
            ears: t.ears,
          },
        };
      } catch (err: any) {
        return { error: `Could not retrieve template: ${err?.message || "Database unavailable"}` };
      }
    }

    case "lumen_save_template": {
      const scene: Soundscape = args.scene;
      const userId = activeUserId || "guest-agent";

      const id = crypto.randomUUID();
      const userSlug = activeUsername || "agent";
      const slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32);

      try {
        const { getSql } = await import("../lib/db.ts");
        const sql = await getSql();

        await sql`
          insert into templates (
            id, user_id, title, description, settings, receiver, embedding, kind, user_slug, slug, ears
          ) values (
            ${id}, ${userId}, ${args.title}, ${args.description || ""},
            ${JSON.stringify(scene.settings)}::jsonb,
            ${JSON.stringify(scene.receiver || { x: 0.5, y: 0.5, height: 0.85, yaw: 0 })}::jsonb,
            '[]'::jsonb, 'track', ${userSlug}, ${slug},
            ${JSON.stringify(scene.ears || [])}::jsonb
          )
        `;

        // Save bowls
        if (scene.bowls && scene.bowls.length > 0) {
          for (let i = 0; i < scene.bowls.length; i++) {
            const b = scene.bowls[i]!;
            await sql`
              insert into template_bowls (template_id, bowl_index, frequency, size, height, glass, gain, x, y, sing, muted)
              values (${id}, ${i}, ${b.frequency}, ${b.size}, ${b.height}, ${b.glass}, ${b.gain}, ${b.x}, ${b.y}, ${b.sing || 0.8}, ${b.muted || false})
            `;
          }
        }

        return {
          success: true,
          templateId: id,
          title: args.title,
          shareUrl: `/s/${userSlug}/${slug}.html`,
          message: `Template saved under user '${userSlug}'.`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to save template to database: ${err?.message || "Database unavailable"}`,
          templateId: id,
          title: args.title,
        };
      }
    }

    case "lumen_export_quote_cart": {
      const quote = calculateQuote(args as CartQuoteRequest);
      return {
        quote,
        message: `Quote calculated: ${quote.durationMinutes} minutes of ${quote.format.toUpperCase()} costs $${quote.amountUsd} (${quote.hourlyRate}).`,
      };
    }

    case "lumen_create_x402_order": {
      const order = await createExportOrder(args as CartQuoteRequest, activeUserId);
      return {
        status: 402,
        paymentRequired: true,
        message: order.message,
        orderId: order.orderId,
        pricing: order.pricing,
        x402: order.x402,
      };
    }

    case "lumen_settle_x402_order": {
      const result = await settleExportOrder(args.orderId, args.paymentToken, args.txHash);
      return {
        success: true,
        status: result.status,
        etaSeconds: result.etaSeconds,
        notification: result.notification,
        instructions: `Track progress via lumen_check_order_status with orderId '${args.orderId}'.`,
      };
    }

    case "lumen_check_order_status": {
      const status = await getOrderStatus(args.orderId);
      return status;
    }

    case "lumen_get_download": {
      const status = await getOrderStatus(args.orderId);
      if (status.status !== "ready" || !status.downloadUrl) {
        return {
          ready: false,
          status: status.status,
          notification: status.notification,
          etaSeconds: status.etaSeconds,
        };
      }

      return {
        ready: true,
        status: "ready",
        orderId: args.orderId,
        downloadUrl: status.downloadUrl,
        filename: status.filename,
        metadataIncluded: {
          title: "Tagged from template",
          album: "Lumen Bath Master Series",
          coverArt: "Embedded OG/Blueprint artwork",
          bitrate: "320kbps MP3 / 24-bit 48kHz FLAC with spatial stems",
        },
      };
    }

    default:
      throw new Error(`Unknown MCP tool '${name}'`);
  }
}
