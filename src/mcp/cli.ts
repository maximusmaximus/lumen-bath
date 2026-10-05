#!/usr/bin/env node
import { runStdioServer } from "./server";

runStdioServer().catch((err) => {
  console.error("[Lumen MCP] Fatal error:", err);
  process.exit(1);
});
