import type { Dome, SceneUse, SceneView, Settings } from "@/lib/audio/types";

type Bridge = {
  read: () => SceneView | null;
  apply: (view: SceneView) => void;
  shot: () => string;
};

let bridge: Bridge | null = null;
let queued: SceneView | null = null;

export function bindSceneBridge(next: Bridge): () => void {
  bridge = next;
  if (queued) {
    next.apply(queued);
    queued = null;
  }
  return () => {
    if (bridge === next) bridge = null;
  };
}

export function readSceneView(): SceneView | null {
  return bridge?.read() ?? null;
}

export function applySceneView(view: SceneView) {
  if (!Number.isFinite(view.x) || !Number.isFinite(view.tx)) return;
  if (bridge) bridge.apply(view);
  else queued = view;
}

export function captureSceneShot(): string {
  return bridge?.shot() ?? "";
}

/** Settings plus the live camera, usage, domes, and the snapshot used as the link card. */
export function scenePack(settings: Settings, domes: Dome[], use: SceneUse): Settings {
  const view = readSceneView();
  const shot = captureSceneShot();
  const poster = shot.startsWith("data:image/jpeg") && shot.length <= 480000 ? shot : undefined;
  return {
    ...settings,
    domes,
    use,
    ...(view ? { view } : {}),
    ...(poster ? { poster } : {}),
  };
}

/** Letterboxed 1200×630 JPEG of the live viewport. */
export function frameScene(source: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = 1200;
  out.height = 630;
  const ctx = out.getContext("2d");
  if (!ctx || source.width < 2 || source.height < 2) return "";
  ctx.fillStyle = "#071016";
  ctx.fillRect(0, 0, 1200, 630);
  const scale = Math.max(1200 / source.width, 630 / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  ctx.drawImage(source, (1200 - width) / 2, (630 - height) / 2, width, height);
  const shot = out.toDataURL("image/jpeg", 0.62);
  return shot.length > 480000 ? out.toDataURL("image/jpeg", 0.4) : shot;
}
