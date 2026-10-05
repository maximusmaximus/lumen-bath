#!/usr/bin/env node
/**
 * Waves must be visible, moving, and actually meet the ear and the walls.
 * Run against the dev server: node scripts/waves-e2e.mjs http://127.0.0.1:8080/
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__lumen);
  await page.locator("[data-waves-toggle]").click();
  await page.waitForSelector("[data-wave-canvas]");

  const first = await page.evaluate(() => {
    const canvas = document.querySelector("[data-wave-canvas]");
    const ctx = canvas.getContext("2d");
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let gold = 0;
    let lit = 0;
    for (let i = 0; i < sample.length; i += 16) {
      const r = sample[i];
      const g = sample[i + 1];
      const b = sample[i + 2];
      const a = sample[i + 3];
      if (a < 20) continue;
      lit++;
      if (r > 120 && r > b + 25 && g > 70) gold++;
    }
    return {
      rings: Number(canvas.dataset.waveRings),
      bounces: Number(canvas.dataset.waveBounces),
      walls: Number(canvas.dataset.waveWalls),
      phase: canvas.dataset.wavePhase,
      width: canvas.width,
      height: canvas.height,
      gold,
      lit,
    };
  });

  assert(first.width > 400 && first.height > 200, `wave canvas is too small (${first.width}x${first.height})`);
  assert(first.rings >= 3, `expected rings leaving the bowls, got ${first.rings}`);
  assert(first.bounces >= 4, `expected wall bounces, got ${first.bounces}`);
  assert(first.walls >= 4, `expected a room outline, got ${first.walls} corners`);
  assert(first.gold > 40, `rings are not visible (gold pixels ${first.gold})`);
  assert(first.lit > 500, "wave plan did not paint");

  await page.waitForTimeout(420);
  const later = await page.evaluate(() => document.querySelector("[data-wave-canvas]").dataset.wavePhase);
  assert(later && later !== first.phase, "wave fronts did not move");

  let hits = 0;
  let crossings = 0;
  for (let i = 0; i < 8; i++) {
    const row = await page.evaluate(() => {
      const canvas = document.querySelector("[data-wave-canvas]");
      return { hits: Number(canvas.dataset.waveHits), crossings: Number(canvas.dataset.waveCrossings) };
    });
    hits += row.hits;
    crossings += row.crossings;
    await page.waitForTimeout(160);
  }
  assert(hits > 0, "a front never reached the ear");
  assert(crossings > 0, "bowl fronts never met");

  await page.locator("[data-waves-toggle]").click();
  await page.waitForTimeout(200);
  const closed = await page.locator("[data-waves=open]").count();
  assert(closed === 0, "waves panel stayed open");
  assert(errors.length === 0, `page errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, rings: first.rings, bounces: first.bounces, hits, crossings }, null, 2));
} finally {
  await browser.close();
}
