import { getRoom } from "@/lib/audio/rooms";
import type { RoomShapeId } from "@/lib/audio/types";
import { roomPolygon } from "@/lib/audio/waves";

export type CardDot = { x: number; y: number };

export type ShareCard = {
  title: string;
  author: string;
  room: RoomShapeId;
  bowls: CardDot[];
  ears: CardDot[];
};

const LIMITS = { minX: 0.06, maxX: 0.94, minY: 0.06, maxY: 0.94 };

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

/** 1200×630 preview of the floor plan. This is the card a share link unfurls. */
export function renderShareSvg(card: ShareCard): string {
  const poly = roomPolygon(card.room, LIMITS);
  const plan = (x: number, y: number) => {
    const px = 72 + ((x - LIMITS.minX) / (LIMITS.maxX - LIMITS.minX)) * 520;
    const py = 86 + ((y - LIMITS.minY) / (LIMITS.maxY - LIMITS.minY)) * 460;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  };
  const points = poly.map((point) => plan(point.x, point.y)).join(" ");
  const bowls = card.bowls
    .map((bowl) => {
      const [x, y] = plan(bowl.x, bowl.y).split(",");
      return `<circle cx="${x}" cy="${y}" r="16" fill="#d7b56d"/>`;
    })
    .join("");
  const ears = card.ears
    .map((ear, index) => {
      const [x, y] = plan(ear.x, ear.y).split(",");
      const ring = index === 0 ? "#f2d48a" : "#8ea399";
      return `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="${ring}" stroke-width="3"/>`;
    })
    .join("");
  const title = escapeXml((card.title || "Untitled bath").slice(0, 28));
  const author = escapeXml(card.author.slice(0, 42) || "Lumen");
  const room = escapeXml(getRoom(card.room).label);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#071016"/>
  <rect x="36" y="36" width="600" height="558" rx="28" fill="#102028"/>
  <polygon points="${points}" fill="#142422" stroke="#d7b56d" stroke-width="3"/>
  ${bowls}
  ${ears}
  <text x="680" y="180" fill="#8ea399" font-family="Georgia, serif" font-size="28">Lumen Bath</text>
  <text x="680" y="270" fill="#f4efe4" font-family="Georgia, serif" font-size="64">${title}</text>
  <text x="680" y="340" fill="#d7b56d" font-family="Georgia, serif" font-size="32">${author}</text>
  <text x="680" y="420" fill="#8ea399" font-family="Georgia, serif" font-size="28">${room} · ${card.bowls.length} bowls · ${card.ears.length} ${card.ears.length === 1 ? "ear" : "ears"}</text>
</svg>`;
}
