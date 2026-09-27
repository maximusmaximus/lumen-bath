import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { bathEngine } from "@/lib/audio/engine";
import { shortNote } from "@/lib/audio/notes";
import { bowlPoint, floorToNorm, receiverPoint, roomSpread, worldEarToHeight } from "@/lib/audio/space";
import type { GlassId } from "@/lib/audio/types";
import { useBath } from "@/stores/bath";

const GLASS_TINT: Record<GlassId, string> = {
  quartz: "#7dd3fc",
  frosted: "#dbeafe",
  gold: "#f5b942",
  platinum: "#e2e8f0",
  rose: "#fb7185",
  obsidian: "#8b5cf6",
  aqua: "#2dd4bf",
  emerald: "#34d399",
  phantom: "#d8b4fe",
  selenite: "#fbbf24",
};

type BowlView = {
  group: THREE.Group;
  glass: THREE.Mesh;
  rim: THREE.Mesh;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  sprite: THREE.Sprite;
  glassId: GlassId;
  note: string;
};

type Projected = {
  bowls: { id: string; x: number; y: number }[];
  ear: { x: number; y: number };
  listener: { x: number; y: number; z: number };
};

let projectFn: () => Projected = () => ({ bowls: [], ear: { x: 0, y: 0 }, listener: bathEngine.listenerNow() });

export function projectChamber(): Projected {
  return projectFn();
}

export function Chamber({ onPick }: { onPick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const surface = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#071016");
    scene.fog = new THREE.FogExp2("#071016", 0.045);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
    camera.position.set(0.35, 3.55, 6.35);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.4, 0);
    controls.minDistance = 2.5;
    controls.maxDistance = 12;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.enablePan = false;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight("#d5efe8", "#1a1208", 0.7);
    const key = new THREE.DirectionalLight("#fff1d0", 2.1);
    key.position.set(4.2, 7.2, 3.4);
    const fill = new THREE.DirectionalLight("#7eb8c9", 0.55);
    fill.position.set(-5, 3.2, -2);
    scene.add(hemi, key, fill);

    const bowlGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.05, 0.02),
        new THREE.Vector2(0.38, 0.04),
        new THREE.Vector2(0.7, 0.16),
        new THREE.Vector2(0.9, 0.42),
        new THREE.Vector2(1, 0.74),
        new THREE.Vector2(0.94, 0.9),
        new THREE.Vector2(0.8, 0.84),
        new THREE.Vector2(0.66, 0.48),
        new THREE.Vector2(0.4, 0.18),
        new THREE.Vector2(0.16, 0.08),
      ],
      48,
    );
    const wellGeo = new THREE.CircleGeometry(0.36, 24);
    const rimGeo = new THREE.TorusGeometry(0.98, 0.045, 10, 40);
    const ringGeo = new THREE.TorusGeometry(1, 0.018, 8, 48);
    const shadowGeo = new THREE.CircleGeometry(1, 32);
    const floorGeo = new THREE.CircleGeometry(4.7, 72);
    const wallGeo = new THREE.CylinderGeometry(4.55, 4.75, 1.7, 48, 1, true);

    const floor = new THREE.Group();
    const deck = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({ color: "#0c1818", roughness: 0.94, metalness: 0.06 }),
    );
    deck.rotation.x = -Math.PI / 2;
    const chamber = new THREE.Mesh(
      wallGeo,
      new THREE.MeshStandardMaterial({ color: "#12242c", roughness: 0.88, metalness: 0.08, side: THREE.DoubleSide }),
    );
    chamber.position.y = 0.85;
    floor.add(deck, chamber);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#d7b56d", transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    for (const radius of [1.5, 2.7, 3.9]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.015, 72), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      floor.add(ring);
    }
    scene.add(floor);

    const palette = new Map<GlassId, THREE.MeshPhysicalMaterial>();
    const glassMaterial = (id: GlassId) => {
      let base = palette.get(id);
      if (!base) {
        const color = new THREE.Color(GLASS_TINT[id]);
        base = new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.14,
          metalness: 0.06,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          iridescence: 0.4,
          iridescenceIOR: 1.4,
          reflectivity: 0.7,
          envMapIntensity: 1.2,
          emissive: color,
          emissiveIntensity: 0.08,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
        });
        palette.set(id, base);
      }
      return base.clone();
    };
    const gold = new THREE.MeshStandardMaterial({
      color: "#e6c27a",
      roughness: 0.28,
      metalness: 0.72,
      emissive: "#d7b56d",
      emissiveIntensity: 0.25,
    });
    const headMat = gold.clone();
    headMat.emissiveIntensity = 0.7;
    const shadowMat = new THREE.MeshBasicMaterial({ color: "#03070a", transparent: true, opacity: 0.38, depthWrite: false });
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

    const views = new Map<string, BowlView>();
    const pickables: THREE.Object3D[] = [];

    const receiver = new THREE.Group();
    const base = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 28), gold);
    base.rotation.x = Math.PI / 2;
    base.position.y = 0.03;
    base.userData = { kind: "receiver-base" };
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 24),
      new THREE.MeshBasicMaterial({ color: "#d7b56d", transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.02;
    pad.userData = { kind: "receiver-base" };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 12), gold);
    pole.userData = { kind: "receiver-base" };
    const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 10), pickMat);
    grab.userData = { kind: "receiver-base" };
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), headMat);
    head.userData = { kind: "receiver-head" };
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 20, 12),
      new THREE.MeshBasicMaterial({ color: "#d7b56d", transparent: true, opacity: 0.22, depthWrite: false }),
    );
    halo.raycast = () => undefined;
    const earSprite = makeSprite("Ear");
    earSprite.scale.set(0.46, 0.22, 1);
    receiver.add(base, pad, pole, grab, head, halo, earSprite);
    scene.add(receiver);
    pickables.push(base, pad, pole, grab, head);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const vertPlane = new THREE.Plane();
    const hitPoint = new THREE.Vector3();
    const camFlat = new THREE.Vector3();
    let drag: { kind: string; id: string | null; pointerId: number } | null = null;

    function resize() {
      const width = parent!.clientWidth;
      const height = parent!.clientHeight;
      if (width < 2 || height < 2) return;
      const cap = width < 720 ? 1.25 : 1.6;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    function setPointer(event: PointerEvent) {
      const rect = surface.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function onDown(event: PointerEvent) {
      if (event.button !== 0) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const data = hit.object.userData as { kind?: string; id?: string };
      drag = { kind: data.kind ?? "", id: data.id ?? null, pointerId: event.pointerId };
      surface.setPointerCapture(event.pointerId);
      if (data.kind === "bowl" && data.id) {
        useBath.getState().select(data.id);
        onPickRef.current();
      }
    }

    function onMove(event: PointerEvent) {
      setPointer(event);
      if (!drag || event.pointerId !== drag.pointerId) {
        raycaster.setFromCamera(pointer, camera);
        const hover = raycaster.intersectObjects(pickables, false)[0];
        surface.style.cursor = hover ? "pointer" : "";
        return;
      }
      surface.style.cursor = "grabbing";
      const state = useBath.getState();
      raycaster.setFromCamera(pointer, camera);
      if (drag.kind === "bowl" && drag.id) {
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
        const next = floorToNorm(hitPoint.x, hitPoint.z, state.settings);
        state.move(drag.id, next.x, next.y);
        return;
      }
      if (drag.kind === "receiver-head") {
        const ear = receiverPoint(state.receiver, state.settings);
        camera.getWorldDirection(camFlat);
        camFlat.y = 0;
        if (camFlat.lengthSq() < 1e-6) camFlat.set(0, 0, 1);
        else camFlat.normalize();
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, new THREE.Vector3(ear.x, ear.y, ear.z));
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        state.moveReceiver(state.receiver.x, state.receiver.y, worldEarToHeight(hitPoint.y));
        return;
      }
      if (drag.kind === "receiver-base") {
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
        const next = floorToNorm(hitPoint.x, hitPoint.z, state.settings);
        state.moveReceiver(next.x, next.y);
      }
    }

    function onUp(event: PointerEvent) {
      if (drag?.pointerId === event.pointerId) drag = null;
      surface.style.cursor = "";
    }

    canvas.addEventListener("pointerdown", onDown, true);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const ndc = new THREE.Vector3();
    projectFn = () => {
      const state = useBath.getState();
      const rect = surface.getBoundingClientRect();
      const toScreen = (x: number, y: number, z: number) => {
        ndc.set(x, y, z).project(camera);
        return {
          x: (ndc.x * 0.5 + 0.5) * rect.width + rect.left,
          y: (-ndc.y * 0.5 + 0.5) * rect.height + rect.top,
        };
      };
      return {
        bowls: state.bowls.map((bowl) => {
          const placed = bowlPoint(bowl, state.settings);
          return { id: bowl.id, ...toScreen(placed.x, placed.wall * 0.45, placed.z) };
        }),
        ear: (() => {
          const placed = receiverPoint(state.receiver, state.settings);
          return toScreen(placed.x, placed.y, placed.z);
        })(),
        listener: bathEngine.listenerNow(),
      };
    };

    function syncScene() {
      const state = useBath.getState();
      const spread = roomSpread(state.settings);
      floor.scale.set(spread.x / 7.2, 1, spread.z / 7.2);
      const ids = new Set(state.bowls.map((bowl) => bowl.id));
      for (const [id, view] of views) {
        if (ids.has(id)) continue;
        scene.remove(view.group);
        (view.glass.material as THREE.Material).dispose();
        const well = view.glass.children[0] as THREE.Mesh | undefined;
        if (well && !Array.isArray(well.material)) well.material.dispose();
        view.sprite.material.map?.dispose();
        view.sprite.material.dispose();
        const index = pickables.indexOf(view.glass);
        if (index >= 0) pickables.splice(index, 1);
        views.delete(id);
      }
      for (const bowl of state.bowls) {
        let view = views.get(bowl.id);
        if (!view) {
          const group = new THREE.Group();
          const glass = new THREE.Mesh(bowlGeo, glassMaterial(bowl.glass));
          glass.userData = { kind: "bowl", id: bowl.id };
          const well = new THREE.Mesh(
            wellGeo,
            new THREE.MeshBasicMaterial({ color: "#061014", transparent: true, opacity: 0.5, depthWrite: false }),
          );
          well.rotation.x = -Math.PI / 2;
          well.position.y = 0.1;
          well.raycast = () => undefined;
          glass.add(well);
          const rim = new THREE.Mesh(rimGeo, gold);
          rim.rotation.x = Math.PI / 2;
          rim.raycast = () => undefined;
          const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#d7b56d" }));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.03;
          ring.raycast = () => undefined;
          const shadow = new THREE.Mesh(shadowGeo, shadowMat);
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.y = 0.012;
          shadow.raycast = () => undefined;
          const sprite = makeSprite(shortNote(bowl.frequency));
          group.add(glass, rim, ring, shadow, sprite);
          scene.add(group);
          pickables.push(glass);
          view = { group, glass, rim, ring, shadow, sprite, glassId: bowl.glass, note: shortNote(bowl.frequency) };
          views.set(bowl.id, view);
        }
        const placed = bowlPoint(bowl, state.settings);
        view.group.position.set(placed.x, 0, placed.z);
        view.glass.scale.set(placed.radius, placed.wall, placed.radius);
        view.rim.scale.set(placed.radius, placed.radius, placed.radius);
        view.rim.position.y = placed.wall * 0.9;
        view.shadow.scale.set(placed.radius * 1.05, placed.radius * 1.05, 1);
        view.ring.visible = bowl.id === state.selectedId;
        view.ring.scale.set(placed.radius * 1.2, placed.radius * 1.2, placed.radius * 1.2);
        if (view.glassId !== bowl.glass) {
          (view.glass.material as THREE.Material).dispose();
          view.glass.material = glassMaterial(bowl.glass);
          view.glassId = bowl.glass;
        }
        const material = view.glass.material as THREE.MeshPhysicalMaterial;
        material.opacity = bowl.muted ? 0.32 : 0.92;
        material.emissiveIntensity = bowl.id === state.selectedId ? 0.28 : 0.07;
        const note = shortNote(bowl.frequency);
        if (view.note !== note) {
          view.sprite.material.map?.dispose();
          view.sprite.material.map = noteTexture(note);
          view.sprite.material.needsUpdate = true;
          view.note = note;
        }
        view.sprite.position.y = placed.wall + 0.28;
      }
      const ear = receiverPoint(state.receiver, state.settings);
      receiver.position.set(ear.x, 0, ear.z);
      pole.scale.y = Math.max(0.2, ear.y);
      pole.position.y = ear.y / 2;
      grab.scale.y = Math.max(0.2, ear.y);
      grab.position.y = ear.y / 2;
      head.position.y = ear.y;
      halo.position.y = ear.y;
      earSprite.position.y = ear.y + 0.28;
      const energy = state.playing ? bathEngine.readEnergy() : 0;
      headMat.emissiveIntensity = 0.45 + energy * 1.5;
      key.intensity = 1.7 + energy * 1.6;
    }

    renderer.setAnimationLoop(() => {
      controls.update();
      syncScene();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      projectFn = () => ({ bowls: [], ear: { x: 0, y: 0 }, listener: bathEngine.listenerNow() });
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown, true);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      controls.dispose();
      bowlGeo.dispose();
      wellGeo.dispose();
      rimGeo.dispose();
      ringGeo.dispose();
      shadowGeo.dispose();
      floorGeo.dispose();
      wallGeo.dispose();
      for (const view of views.values()) {
        (view.glass.material as THREE.Material).dispose();
        view.sprite.material.map?.dispose();
        view.sprite.material.dispose();
      }
      for (const material of palette.values()) material.dispose();
      gold.dispose();
      headMat.dispose();
      (pad.material as THREE.Material).dispose();
      shadowMat.dispose();
      pickMat.dispose();
      ringMat.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Sound bath chamber" />;
}

function noteTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 256, 128);
    ctx.font = "600 72px Georgia, serif";
    ctx.fillStyle = "rgba(232,241,236,0.94)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSprite(text: string): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: noteTexture(text), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.64, 0.3, 1);
  sprite.raycast = () => undefined;
  return sprite;
}
