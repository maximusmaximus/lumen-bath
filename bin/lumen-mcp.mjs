#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "src", "mcp", "cli.ts");

const child = spawn(process.execPath, [join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"), cliPath], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
