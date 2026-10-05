import { createFileRoute } from "@tanstack/react-router";
import { MCP_TOOLS, executeMcpTool } from "@/mcp/tools";
import { PRESETS } from "@/lib/audio/presets";
import { ROOMS } from "@/lib/audio/rooms";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({
            name: "lumen-bath-mcp",
            version: "1.0.0",
            protocol: "MCP JSON-RPC 2.0",
            tools: MCP_TOOLS.map((t) => t.name),
            pricing: {
              mp3: "$20.00 / hour (320kbps)",
              flac: "$45.00 / hour (24-bit 48kHz lossless with spatial stems)",
            },
            status: "online",
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      },
      POST: async ({ request }) => {
        try {
          const rpc = (await request.json()) as {
            jsonrpc?: string;
            id?: string | number;
            method?: string;
            params?: Record<string, any>;
          };

          const id = rpc.id ?? null;
          const method = rpc.method;
          const params = rpc.params || {};

          if (method === "tools/list") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                result: { tools: MCP_TOOLS },
              }),
              { headers: { "content-type": "application/json" } },
            );
          }

          if (method === "tools/call") {
            const toolName = params.name;
            const toolArgs = params.arguments || {};
            const result = await executeMcpTool(toolName, toolArgs);
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                result: {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(result, null, 2),
                    },
                  ],
                },
              }),
              { headers: { "content-type": "application/json" } },
            );
          }

          if (method === "resources/list") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                result: {
                  resources: [
                    {
                      uri: "lumen://pricing",
                      name: "Lumen Bath Audio Export Pricing",
                      mimeType: "application/json",
                    },
                    {
                      uri: "lumen://rooms",
                      name: "Lumen Bath 15 Acoustic Room Profiles",
                      mimeType: "application/json",
                    },
                    {
                      uri: "lumen://presets",
                      name: "Lumen Bath House Presets",
                      mimeType: "application/json",
                    },
                  ],
                },
              }),
              { headers: { "content-type": "application/json" } },
            );
          }

          if (method === "resources/read") {
            const uri = params.uri;
            let text = "";
            if (uri === "lumen://pricing") {
              text = JSON.stringify(
                {
                  service: "Lumen Bath High-Fidelity Audio Export",
                  rates: {
                    mp3: { hourlyRateUsd: 20.0, quality: "320 kbps CBR stereo" },
                    flac: { hourlyRateUsd: 45.0, quality: "24-bit / 48kHz lossless master with spatial stems" },
                  },
                  paymentProtocol: "x402 (HTTP 402 Payment Required)",
                },
                null,
                2,
              );
            } else if (uri === "lumen://rooms") {
              text = JSON.stringify(ROOMS, null, 2);
            } else if (uri === "lumen://presets") {
              text = JSON.stringify(PRESETS, null, 2);
            } else {
              return new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id,
                  error: { code: -32602, message: `Resource not found: ${uri}` },
                }),
                { status: 404, headers: { "content-type": "application/json" } },
              );
            }

            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                result: {
                  contents: [{ uri, mimeType: "application/json", text }],
                },
              }),
              { headers: { "content-type": "application/json" } },
            );
          }

          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32603, message: err.message || "Internal error" },
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
