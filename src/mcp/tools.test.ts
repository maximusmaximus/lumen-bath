import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeMcpTool, MCP_TOOLS } from "./tools.ts";

describe("MCP Tools for Agentic Users", () => {
  it("registers all required MCP tools", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    assert.ok(names.includes("lumen_pair_profile"));
    assert.ok(names.includes("lumen_generate_scene"));
    assert.ok(names.includes("lumen_list_templates"));
    assert.ok(names.includes("lumen_get_template"));
    assert.ok(names.includes("lumen_save_template"));
    assert.ok(names.includes("lumen_export_quote_cart"));
    assert.ok(names.includes("lumen_create_x402_order"));
    assert.ok(names.includes("lumen_settle_x402_order"));
    assert.ok(names.includes("lumen_check_order_status"));
    assert.ok(names.includes("lumen_get_download"));
  });

  it("executes lumen_generate_scene with natural language prompt", async () => {
    const res = await executeMcpTool("lumen_generate_scene", {
      prompt: "Deep meditation sound bath in an apse room with chakra tuning",
      bowlCount: 7,
    });

    assert.equal(res.success, true);
    assert.equal(res.scene.settings.roomShape, "apse");
    assert.equal(res.scene.bowls.length, 7);
  });

  it("calculates quotes via lumen_export_quote_cart for $20/hr MP3 and $45/hr FLAC", async () => {
    const mp3Quote = await executeMcpTool("lumen_export_quote_cart", {
      format: "mp3",
      durationMinutes: 60,
    });
    assert.equal(mp3Quote.quote.amountUsd, "20.00");
    assert.equal(mp3Quote.quote.hourlyRate, "$20.00 / hour");
    assert.ok(mp3Quote.quote.bitrateSpec.includes("320 kbps"));

    const flacQuote = await executeMcpTool("lumen_export_quote_cart", {
      format: "flac",
      durationMinutes: 60,
      includeStems: true,
    });
    assert.equal(flacQuote.quote.amountUsd, "45.00");
    assert.equal(flacQuote.quote.hourlyRate, "$45.00 / hour");
    assert.ok(flacQuote.quote.bitrateSpec.includes("spatial stem"));
  });

  it("lists house presets via lumen_list_templates", async () => {
    const res = await executeMcpTool("lumen_list_templates", {
      filter: "house",
      limit: 10,
    });

    assert.ok(res.templates.length > 0);
    assert.ok(res.pricingSchedule.mp3.includes("$20.00 / hour"));
    assert.ok(res.pricingSchedule.flac.includes("$45.00 / hour"));
  });

  it("fetches house presets via lumen_get_template", async () => {
    const res = await executeMcpTool("lumen_get_template", {
      id: "hall-canopy",
    });

    assert.equal(res.source, "house_preset");
    assert.ok(res.preset.bowls.length >= 3);
  });
});
