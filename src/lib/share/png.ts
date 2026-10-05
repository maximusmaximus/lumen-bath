import { deflateSync } from "node:zlib";
import { getRoom } from "../audio/rooms.ts";
import { roomPolygon } from "../audio/waves.ts";
import type { ShareCard } from "@/lib/share/card";

const W = 1200;
const H = 630;
const LIMITS = { minX: 0.06, maxX: 0.94, minY: 0.06, maxY: 0.94 };

const GLYPH: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [31, 4, 4, 4, 4, 4, 31],
  J: [31, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
};

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function fill(data: Uint8Array, x0: number, y0: number, x1: number, y1: number, color: [number, number, number]) {
  const left = Math.max(0, x0);
  const top = Math.max(0, y0);
  const right = Math.min(W, x1);
  const bottom = Math.min(H, y1);
  for (let y = top; y < bottom; y++) {
    let i = (y * W + left) * 4;
    for (let x = left; x < right; x++) {
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
      i += 4;
    }
  }
}

function dot(data: Uint8Array, cx: number, cy: number, radius: number, color: [number, number, number], hole = 0) {
  const r2 = radius * radius;
  const h2 = hole * hole;
  for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d > r2 || d < h2) continue;
      const i = (y * W + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
}

function glyph(data: Uint8Array, ch: string, x: number, y: number, scale: number, color: [number, number, number]) {
  const rows = GLYPH[ch] ?? GLYPH[" "];
  if (!rows) return;
  for (let row = 0; row < rows.length; row++) {
    const bits = rows[row] ?? 0;
    for (let col = 0; col < 5; col++) {
      if ((bits & (1 << (4 - col))) === 0) continue;
      fill(data, x + col * scale, y + row * scale, x + (col + 1) * scale, y + (row + 1) * scale, color);
    }
  }
}

function text(data: Uint8Array, value: string, x: number, y: number, scale: number, color: [number, number, number]) {
  let cursor = x;
  for (const ch of value.toUpperCase()) {
    glyph(data, GLYPH[ch] ? ch : " ", cursor, y, scale, color);
    cursor += 6 * scale;
  }
}

function plan(x: number, y: number): [number, number] {
  const px = 72 + ((x - LIMITS.minX) / (LIMITS.maxX - LIMITS.minX)) * 520;
  const py = 86 + ((y - LIMITS.minY) / (LIMITS.maxY - LIMITS.minY)) * 460;
  return [px, py];
}

export function renderSharePng(card: ShareCard): Buffer {
  const data = new Uint8Array(W * H * 4);
  fill(data, 0, 0, W, H, [7, 16, 22]);
  fill(data, 36, 36, 636, 594, [16, 32, 40]);
  const poly = roomPolygon(card.room, LIMITS);
  for (let i = 0; i < poly.length; i++) {
    const a = plan(poly[i]!.x, poly[i]!.y);
    const b = plan(poly[(i + 1) % poly.length]!.x, poly[(i + 1) % poly.length]!.y);
    const steps = Math.max(8, Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      dot(data, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 2.2, [215, 181, 109]);
    }
  }
  for (const bowl of card.bowls) {
    const [x, y] = plan(bowl.x, bowl.y);
    dot(data, x, y, 14, [215, 181, 109]);
  }
  card.ears.forEach((ear, index) => {
    const [x, y] = plan(ear.x, ear.y);
    dot(data, x, y, 12, index === 0 ? [242, 212, 138] : [142, 163, 153], 8);
  });
  const gold: [number, number, number] = [215, 181, 109];
  const mute: [number, number, number] = [142, 163, 153];
  const paper: [number, number, number] = [244, 239, 228];
  text(data, "LUMEN BATH", 680, 150, 4, mute);
  text(data, (card.title || "UNTITLED").slice(0, 16), 680, 230, 7, paper);
  text(data, card.author.slice(0, 18), 680, 320, 4, gold);
  text(data, `${getRoom(card.room).label}  ${card.bowls.length} BOWLS`, 680, 400, 3, mute);
  return encodePng(data);
}
