import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS, executeMcpTool } from "./tools";
import { PRESETS } from "@/lib/audio/presets";
import { ROOMS } from "@/lib/audio/rooms";

export function createLumenMcpServer(): Server {
  const server = new Server(
    {
      name: "lumen-bath-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: MCP_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await executeMcpTool(request.params.name, request.params.arguments || {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error executing ${request.params.name}: ${err.message || String(err)}`,
          },
        ],
      };
    }
  });

  // Resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "lumen://pricing",
          name: "Lumen Bath Audio Export Pricing",
          description: "Hourly rates for MP3 ($20/hr, 320kbps) and FLAC ($45/hr, 24-bit 48kHz lossless with stems).",
          mimeType: "application/json",
        },
        {
          uri: "lumen://rooms",
          name: "Lumen Bath 15 Acoustic Room Profiles",
          description: "Acoustic reflections, bloom, decay, and standing wave modes for all room shapes.",
          mimeType: "application/json",
        },
        {
          uri: "lumen://presets",
          name: "Lumen Bath House Presets",
          description: "List of built-in house sound bath presets.",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === "lumen://pricing") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                service: "Lumen Bath High-Fidelity Audio Export",
                rates: {
                  mp3: {
                    hourlyRateUsd: 20.0,
                    ratePerMinuteUsd: 0.3333,
                    quality: "320 kbps CBR stereo",
                    metadata: "ID3v2 tags with embedded cover art",
                  },
                  flac: {
                    hourlyRateUsd: 45.0,
                    ratePerMinuteUsd: 0.75,
                    quality: "24-bit / 48kHz lossless studio master",
                    features: ["Embedded Vorbis comments", "Embedded PICTURE cover art", "Optional spatial stems multi-track ZIP archive"],
                  },
                },
                paymentProtocol: "x402 (HTTP 402 Payment Required)",
                userAccountLinking: "Link user profile via pairing code. Payment still applies to exports.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (uri === "lumen://rooms") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(ROOMS, null, 2),
          },
        ],
      };
    }

    if (uri === "lumen://presets") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(PRESETS, null, 2),
          },
        ],
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  return server;
}

export async function runStdioServer() {
  const server = createLumenMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Lumen MCP] Server running on stdio transport.");
}
