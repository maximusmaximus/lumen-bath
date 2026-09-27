import type { Receiver } from "@/lib/audio/types";

export const DEFAULT_RECEIVER: Receiver = { x: 0.62, y: 0.86, height: 0.64 };

export const EAR_LOW = 0.18;
export const EAR_HIGH = 2.15;

export function defaultHeight(size: number): number {
  return Math.min(1, Math.max(0.22, 0.3 + size * 0.48));
}

export function roomSpread(settings: { width: number; depth: number }): { x: number; z: number } {
  return {
    x: 6.4 * (0.62 + settings.width * 0.58),
    z: 6.4 * (0.62 + settings.depth * 0.58),
  };
}

export function bowlPoint(
  bowl: { x: number; y: number; size: number; height: number },
  settings: { width: number; depth: number },
): { x: number; y: number; z: number; radius: number; wall: number } {
  const spread = roomSpread(settings);
  const radius = 0.26 + bowl.size * 0.92;
  const wall = 0.14 + bowl.height * 1.15;
  return {
    x: (bowl.x - 0.5) * spread.x,
    z: (bowl.y - 0.5) * spread.z,
    y: wall,
    radius,
    wall,
  };
}

export function receiverPoint(
  receiver: Receiver,
  settings: { width: number; depth: number },
): { x: number; y: number; z: number } {
  const spread = roomSpread(settings);
  const height = Math.min(1, Math.max(0, receiver.height));
  return {
    x: (receiver.x - 0.5) * spread.x,
    z: (receiver.y - 0.5) * spread.z,
    y: EAR_LOW + height * (EAR_HIGH - EAR_LOW),
  };
}

export function floorToNorm(
  x: number,
  z: number,
  settings: { width: number; depth: number },
): { x: number; y: number } {
  const spread = roomSpread(settings);
  return {
    x: Math.min(0.94, Math.max(0.06, x / spread.x + 0.5)),
    y: Math.min(0.92, Math.max(0.08, z / spread.z + 0.5)),
  };
}

export function worldEarToHeight(y: number): number {
  return Math.min(1, Math.max(0, (y - EAR_LOW) / (EAR_HIGH - EAR_LOW)));
}
