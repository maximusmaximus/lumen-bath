import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { domeCover, domePoint } from "@/lib/audio/dome";
import { sampleWaves } from "@/lib/audio/waves";
import { bindSceneBridge, frameScene } from "@/lib/share/scene";
import { bathEngine } from "@/lib/audio/engine";
import { stagePixelRatio } from "@/lib/cast/protocol";
import { shortNote } from "@/lib/audio/notes";
import { getRoom } from "@/lib/audio/rooms";
import { BOWL_LIFT_MAX, CONE_MAX, CONE_MIN, EAR_PART_SCALE, FLOOR_SCALE, bowlDropRoom, bowlPoint, coneCatch, drawnCone, dropBowlBottom, earPitch, earSolids, facingYaw, floorNormLimits, floorToNorm, hornMouth, hornPitch, hornYaw, insideFloor, liftToGain, listenForward, receiverPoint, roomMeshSpread, roomSpread, worldEarToHeight } from "@/lib/audio/space";
import type { GlassId, RoomShapeId } from "@/lib/audio/types";
import { buildRoom, disposeRoom, type RoomMaterials } from "@/components/room-mesh";
import { useBath } from "@/stores/bath";

let idleSpin = false;
let kioskPhase: "live" | "listen" | "bowls" | "waves" = "live";
let stageQuality = false;

export function setChamberIdle(on: boolean) {
  if (!on) {
    kioskPhase = "live";
    idleSpin = false;
    return;
  }
  idleSpin = true;
  if (kioskPhase === "live") kioskPhase = "listen";
}

export function setKioskPhase(phase: "live" | "listen" | "bowls" | "waves") {
  kioskPhase = phase;
  idleSpin = phase !== "live";
}

export function setChamberStage(on: boolean) {
  stageQuality = on;
  window.dispatchEvent(new Event("lumen-stage-quality"));
}

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
  stem: THREE.Mesh;
  collar: THREE.Mesh;
  arm: THREE.Mesh;
  grab: THREE.Mesh;
  pick: THREE.Mesh;
  box: THREE.Group;
  glassId: GlassId;
  note: string;
};

type Projected = {
  bowls: { id: string; x: number; y: number }[];
  ears: { id: string; x: number; y: number }[];
  domes: { id: string; x: number; y: number }[];
  ear: { x: number; y: number };
  listener: { x: number; y: number; z: number };
};

const EAR_HANDLE = EAR_PART_SCALE;
const CORNER = 0.16;
let projectFn: () => Projected = () => ({ bowls: [], ears: [], domes: [], ear: { x: 0, y: 0 }, listener: bathEngine.listenerNow() });
const viewNudge = { delta: 0 };

export function nudgeView(radians: number) {
  if (!Number.isFinite(radians)) return;
  viewNudge.delta += radians;
}

export function projectChamber(): Projected {
  return projectFn();
}

export function Chamber({
  onPick,
  onRoom,
  onClear,
  viewOnly = false,
  waves = false,
}: {
  onPick: () => void;
  onRoom: () => void;
  onClear: () => void;
  viewOnly?: boolean;
  waves?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onPickRef = useRef(onPick);
  const onRoomRef = useRef(onRoom);
  const onClearRef = useRef(onClear);
  const viewOnlyRef = useRef(viewOnly);
  const wavesRef = useRef(waves);
  onPickRef.current = onPick;
  onRoomRef.current = onRoom;
  onClearRef.current = onClear;
  viewOnlyRef.current = viewOnly;
  wavesRef.current = waves;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const surface = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.localClippingEnabled = true;
    const floorClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#071016");
    scene.fog = new THREE.FogExp2("#071016", 0.045);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.15, 180);
    const opening = roomSpread(useBath.getState().settings);
    const openingSpan = Math.max(opening.x, opening.z) * 0.62;
    camera.position.set(openingSpan * 0.18, openingSpan * 1.35, openingSpan * 2.05);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.45, 0);
    controls.minDistance = 3;
    controls.maxDistance = Math.max(48, openingSpan * 3.2);
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.enablePan = false;
    controls.rotateSpeed = 0.85;
    const unbindScene = bindSceneBridge({
      read: () => ({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        tx: controls.target.x,
        ty: controls.target.y,
        tz: controls.target.z,
      }),
      apply: (view) => {
        camera.position.set(view.x, view.y, view.z);
        controls.target.set(view.tx, view.ty, view.tz);
        controls.update();
      },
      shot: () => {
        renderer.render(scene, camera);
        return frameScene(renderer.domElement);
      },
    });
    let framedSpan = openingSpan;

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

    const waveGroup = new THREE.Group();
    waveGroup.name = "waves";
    scene.add(waveGroup);
    const waveRingGeo = new THREE.RingGeometry(0.9, 1, 72);
    const waveSparkGeo = new THREE.SphereGeometry(1, 12, 8);
    const waveMats: THREE.MeshBasicMaterial[] = [];
    type WaveShell = { group: THREE.Group; material: THREE.MeshBasicMaterial };
    const waveShells: WaveShell[] = [];
    const waveSparks: THREE.Mesh[] = [];

    function waveMaterial(color: string) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        clippingPlanes: [floorClip],
      });
      waveMats.push(material);
      return material;
    }

    function takeShell() {
      const material = waveMaterial("#f2d48a");
      const group = new THREE.Group();
      for (let band = 0; band < 3; band++) {
        const mesh = new THREE.Mesh(waveRingGeo, material);
        if (band === 1) mesh.rotation.y = Math.PI / 2;
        if (band === 2) mesh.rotation.x = Math.PI / 2;
        mesh.raycast = () => undefined;
        mesh.renderOrder = 3;
        group.add(mesh);
      }
      waveGroup.add(group);
      const shell = { group, material };
      waveShells.push(shell);
      return shell;
    }

    function takeSpark(color: string) {
      const mesh = new THREE.Mesh(waveSparkGeo, waveMaterial(color));
      mesh.raycast = () => undefined;
      mesh.renderOrder = 4;
      waveGroup.add(mesh);
      waveSparks.push(mesh);
      return mesh;
    }

    function hideRest(list: THREE.Mesh[], used: number) {
      for (let index = used; index < list.length; index++) list[index]!.visible = false;
    }

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
    const pickGeo = new THREE.CircleGeometry(1, 24);
    const pickDiscMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rimGeo = new THREE.TorusGeometry(0.98, 0.045, 10, 40);
    const ringGeo = new THREE.TorusGeometry(1, 0.018, 8, 48);
    const shadowGeo = new THREE.CircleGeometry(1, 32);
    const stemGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 10);
    const collarGeo = new THREE.SphereGeometry(0.075, 16, 12);
    const armGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 8);
    const stemGrabGeo = new THREE.CylinderGeometry(0.14, 0.14, 1, 8);
    const axisMat = new THREE.MeshBasicMaterial({ color: "#e6c27a", transparent: true, opacity: 0.72 });
    const wallMat = new THREE.MeshStandardMaterial({
      color: "#9eb8c6",
      roughness: 0.62,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: "#142422",
      roughness: 0.82,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 4,
    });
    const courtMat = new THREE.MeshStandardMaterial({
      color: "#1a3830",
      roughness: 0.88,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 4,
    });
    const caveMat = new THREE.MeshStandardMaterial({
      color: "#1c3a32",
      roughness: 0.94,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const domeMat = new THREE.MeshStandardMaterial({
      color: "#2a5a70",
      roughness: 0.45,
      metalness: 0.14,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: true,
    });
    const plinthMat = new THREE.MeshStandardMaterial({
      color: "#3d5c6b",
      roughness: 0.42,
      metalness: 0.22,
    });
    const roomMats: RoomMaterials = {
      wall: wallMat,
      floor: floorMat,
      court: courtMat,
      cave: caveMat,
      dome: domeMat,
      ring: null as unknown as THREE.Material,
      plinth: plinthMat,
    };

    const ringMat = new THREE.MeshStandardMaterial({
      color: "#e6c27a",
      roughness: 0.32,
      metalness: 0.64,
      emissive: "#8a6230",
      emissiveIntensity: 0.35,
    });
    roomMats.ring = ringMat;
    let roomGroup = buildRoom("chapel", roomMats);
    let roomId: RoomShapeId = "chapel";
    scene.add(roomGroup);
    const roomRoot = new THREE.Group();
    roomRoot.add(roomGroup);
    scene.add(roomRoot);

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
    function fadeMat(opacity = 1) {
      const material = gold.clone();
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = opacity;
      material.userData.fade = opacity;
      return material;
    }
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
    const turnRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 12, 40), fadeMat(0.9));
    turnRing.rotation.x = Math.PI / 2;
    turnRing.userData = { kind: "receiver-yaw" };
    const aim = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 8), gold);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.24;
    shaft.raycast = () => undefined;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 10), gold);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -0.52;
    tip.raycast = () => undefined;
    aim.add(shaft, tip);
    receiver.add(base, pad, pole, grab, head, halo, turnRing, earSprite);
    const discGeo = hornShell();
    function hornShell() {
      const points: THREE.Vector2[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const y = -0.45 + t * 0.9;
        const flare = Math.pow(t, 1.65);
        points.push(new THREE.Vector2(0.038 + flare * 0.25, y));
      }
      return new THREE.LatheGeometry(points, 32);
    }
    function addMouth(mesh: THREE.Mesh) {
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 28),
        new THREE.MeshBasicMaterial({ color: "#07080d", side: THREE.DoubleSide, depthWrite: false }),
      );
      hole.position.y = 0.4;
      hole.rotation.x = -Math.PI / 2;
      hole.raycast = () => undefined;
      mesh.add(hole);
    }
    const leftMat = new THREE.MeshStandardMaterial({
      color: "#e6c27a",
      emissive: "#e6c27a",
      emissiveIntensity: 0.45,
      roughness: 0.32,
      metalness: 0.4,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rightMat = new THREE.MeshStandardMaterial({
      color: "#f7f4ec",
      emissive: "#f4f0e6",
      emissiveIntensity: 0.28,
      roughness: 0.28,
      metalness: 0.2,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const leftCap = new THREE.Mesh(discGeo, leftMat);
    leftCap.userData = { kind: "ear-left" };
    const rightCap = new THREE.Mesh(discGeo, rightMat);
    rightCap.userData = { kind: "ear-right" };
    leftCap.raycast = () => undefined;
    rightCap.raycast = () => undefined;
    addMouth(leftCap);
    addMouth(rightCap);
    const ballGeo = new THREE.SphereGeometry(1, 16, 12);
    const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
    const spinGeo = new THREE.TorusGeometry(1, 0.045, 10, 40);
    const sizeRingGeo = new THREE.TorusGeometry(1, 0.12, 14, 56);
    const sizeRingMat = new THREE.MeshStandardMaterial({
      color: "#ff3b3b",
      emissive: "#ff2a2a",
      emissiveIntensity: 1.05,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 1,
      depthTest: false,
    });
    sizeRingMat.userData.fade = 1;
    const redMat = new THREE.MeshStandardMaterial({
      color: "#e23b3b",
      emissive: "#e23b3b",
      emissiveIntensity: 0.65,
      roughness: 0.32,
      metalness: 0.15,
      transparent: true,
      opacity: 1,
    });
    redMat.userData.fade = 1;
    function ballRadius(size: number) {
      return Math.max(0.05, 1.35 * size * 0.075);
    }
    /** World radius of the red ball inside the horn, per unit of cone size. */
    const INSIDE_PER_SIZE = 0.163;
    type HornKit = {
      side: "left" | "right";
      centerRod: THREE.Mesh;
      centerBall: THREE.Mesh;
      backRod: THREE.Mesh;
      backBall: THREE.Mesh;
      tipRod: THREE.Mesh;
      tipBall: THREE.Mesh;
      spinRing: THREE.Mesh;
      spinBall: THREE.Mesh;
      sizeRing: THREE.Mesh;
    };
    function hornKit(side: "left" | "right"): HornKit {
      const rod = () => {
        const mesh = new THREE.Mesh(rodGeo, gold);
        mesh.raycast = () => undefined;
        return mesh;
      };
      const ball = (kind: string, material: THREE.Material) => {
        const mesh = new THREE.Mesh(ballGeo, material);
        mesh.userData = { kind, side };
        return mesh;
      };
      const spinRing = new THREE.Mesh(spinGeo, fadeMat(0.85));
      spinRing.rotation.x = Math.PI / 2;
      spinRing.userData = { kind: "horn-spin", side };
      const sizeRing = new THREE.Mesh(sizeRingGeo, sizeRingMat);
      sizeRing.raycast = () => undefined;
      sizeRing.renderOrder = 6;
      return {
        side,
        centerRod: rod(),
        centerBall: ball("horn-center", redMat),
        backRod: rod(),
        backBall: ball("horn-lift", fadeMat(0.96)),
        tipRod: rod(),
        tipBall: ball("horn-tip", fadeMat(0.96)),
        spinRing,
        spinBall: ball("horn-spin", fadeMat(0.96)),
        sizeRing,
      };
    }
    const leftKit = hornKit("left");
    const rightKit = hornKit("right");
    const hornBalls = [leftKit, rightKit].flatMap((kit) => [kit.centerBall, kit.backBall, kit.tipBall, kit.spinBall, kit.spinRing]);
    const liftRod = new THREE.Mesh(rodGeo, gold);
    liftRod.raycast = () => undefined;
    const liftBall = new THREE.Mesh(ballGeo, fadeMat(0.96));
    liftBall.userData = { kind: "receiver-lift" };
    const linkGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    const leftLink = new THREE.Mesh(linkGeo, gold);
    const rightLink = new THREE.Mesh(linkGeo, gold);
    leftLink.raycast = () => undefined;
    rightLink.raycast = () => undefined;
    const leftTag = makeSprite("Left");
    const rightTag = makeSprite("Right");
    leftTag.material.depthTest = false;
    rightTag.material.depthTest = false;
    leftTag.renderOrder = 4;
    rightTag.renderOrder = 4;
    leftTag.scale.set(1.35, 0.48, 1);
    rightTag.scale.set(1.45, 0.48, 1);
    const earBox = new THREE.Group();
    const earBoxEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: "#d7b56d", transparent: true, opacity: 0.9 }),
    );
    (earBoxEdges.material as THREE.Material).userData.fade = 0.9;
    earBoxEdges.raycast = () => undefined;
    const cornerGeo = new THREE.SphereGeometry(CORNER, 14, 10);
    const earCorners: THREE.Mesh[] = [];
    for (let corner = 0; corner < 4; corner++) {
      const handle = new THREE.Mesh(cornerGeo, fadeMat());
      handle.userData = { kind: "turn-ear", corner };
      earCorners.push(handle);
      earBox.add(handle);
    }
    const edgeGeo = new THREE.SphereGeometry(0.11, 12, 8);
    const earEdges: THREE.Mesh[] = [];
    for (let edge = 0; edge < 4; edge++) {
      const handle = new THREE.Mesh(edgeGeo, fadeMat());
      handle.userData = { kind: "scale-ear", edge };
      earEdges.push(handle);
      earBox.add(handle);
    }
    earBox.add(earBoxEdges);
    receiver.add(
      leftCap,
      rightCap,
      leftLink,
      rightLink,
      leftTag,
      rightTag,
      earBox,
      liftRod,
      liftBall,
      ...[leftKit, rightKit].flatMap((kit) => [kit.centerRod, kit.centerBall, kit.backRod, kit.backBall, kit.tipRod, kit.tipBall, kit.spinRing, kit.spinBall, kit.sizeRing]),
    );
    scene.add(receiver, aim);
    const domeRoot = new THREE.Group();
    scene.add(domeRoot);
    const domePoints: THREE.Vector2[] = [];
    for (let step = 0; step <= 20; step++) {
      const t = step / 20;
      const angle = t * Math.PI * 0.5;
      domePoints.push(new THREE.Vector2(Math.cos(angle) * 0.5, Math.sin(angle) * 0.42));
    }
    const domeGeo = new THREE.LatheGeometry(domePoints, 48);
    const domeHandleGeo = new THREE.SphereGeometry(1, 14, 10);
    const domeTorusGeo = new THREE.TorusGeometry(0.5, 0.028, 12, 56);
    const domeShadowGeo = new THREE.CircleGeometry(0.5, 40);
    type DomeView = {
      group: THREE.Group;
      shell: THREE.Mesh;
      torus: THREE.Mesh;
      crown: THREE.Mesh;
      edge: THREE.Mesh;
      shadow: THREE.Mesh;
      sprite: THREE.Sprite;
    };
    const domeViews = new Map<string, DomeView>();
    function makeDomeView(id: string): DomeView {
      const group = new THREE.Group();
      const shell = new THREE.Mesh(
        domeGeo,
        new THREE.MeshStandardMaterial({
          color: "#e7c27a",
          roughness: 0.38,
          metalness: 0.62,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          emissive: "#8a5a18",
          emissiveIntensity: 0.08,
        }),
      );
      shell.userData = { kind: "dome", id };
      const torus = new THREE.Mesh(
        domeTorusGeo,
        new THREE.MeshStandardMaterial({ color: "#d7b56d", metalness: 0.65, roughness: 0.28 }),
      );
      torus.rotation.x = Math.PI / 2;
      torus.raycast = () => undefined;
      const crown = new THREE.Mesh(domeHandleGeo, fadeMat(0.96));
      crown.userData = { kind: "dome-height", id, cast: crown.raycast.bind(crown) };
      const edge = new THREE.Mesh(domeHandleGeo, fadeMat(0.96));
      edge.userData = { kind: "dome-scale", id, cast: edge.raycast.bind(edge) };
      const shadow = new THREE.Mesh(
        domeShadowGeo,
        new THREE.MeshBasicMaterial({ color: "#140e08", transparent: true, opacity: 0.16, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.raycast = () => undefined;
      const sprite = makeSprite("Dome");
      sprite.raycast = () => undefined;
      group.add(shell, torus, crown, edge, shadow, sprite);
      domeRoot.add(group);
      pickables.push(shell, crown, edge);
      return { group, shell, torus, crown, edge, shadow, sprite };
    }
    function syncDomes(showHandles: boolean) {
      const state = useBath.getState();
      const live = new Set(state.domes.map((dome) => dome.id));
      for (const [id, view] of domeViews) {
        if (live.has(id)) continue;
        domeRoot.remove(view.group);
        for (const mesh of [view.shell, view.crown, view.edge]) {
          const index = pickables.indexOf(mesh);
          if (index >= 0) pickables.splice(index, 1);
        }
        (view.shell.material as THREE.Material).dispose();
        (view.torus.material as THREE.Material).dispose();
        (view.shadow.material as THREE.Material).dispose();
        view.sprite.material.map?.dispose();
        view.sprite.material.dispose();
        domeViews.delete(id);
      }
      for (const dome of state.domes) {
        const view = domeViews.get(dome.id) ?? makeDomeView(dome.id);
        if (!domeViews.has(dome.id)) domeViews.set(dome.id, view);
        const at = domePoint(dome, state.settings);
        const picked = state.focus === "dome" && state.selectedId === dome.id;
        view.group.position.set(at.x, at.y, at.z);
        const span = at.radius * 2;
        const rise = span * 0.5;
        view.group.scale.set(span, rise, span);
        const material = view.shell.material as THREE.MeshStandardMaterial;
        const tint = GLASS_TINT[dome.glass];
        material.color.set(tint);
        material.emissive.set(tint);
        const shown = Math.max(bowlFade, waveFade * 0.92);
        const flat = Math.hypot(camera.position.x - at.x, camera.position.z - at.z);
        const inside = flat / Math.max(0.25, at.radius);
        const under = camera.position.y < at.y + rise * 0.2;
        const presence = under ? Math.max(0, Math.min(1, 1.2 - inside)) : 0;
        const ghost = 0.04;
        const solid = 0.46 + dome.reflect * 0.32;
        const body = Math.max(picked ? 0.22 : ghost, ghost + (solid - ghost) * presence);
        material.opacity = body * shown;
        material.roughness = 0.28 + dome.diffuse * 0.5;
        material.metalness = 0.35 + dome.brightness * 0.5;
        material.emissiveIntensity = picked ? 0.22 : 0.06;
        view.group.visible = shown > 0.02;
        view.torus.visible = true;
        const rim = view.torus.material as THREE.MeshStandardMaterial;
        rim.color.set(tint);
        rim.emissive.set(tint);
        rim.emissiveIntensity = picked ? 0.35 : under ? 0.16 : 0.04;
        rim.transparent = true;
        rim.opacity = (under ? 0.72 : 0.22) * shown;
        view.crown.visible = picked && showHandles;
        view.edge.visible = picked && showHandles;
        view.crown.position.set(0, 0.46, 0);
        view.crown.scale.setScalar(0.055);
        view.edge.position.set(0.5, 0.02, 0);
        view.edge.scale.setScalar(0.05);
        view.shadow.position.y = -at.y / Math.max(0.2, rise) + 0.015 / Math.max(0.2, rise);
        (view.shadow.material as THREE.MeshBasicMaterial).opacity = (picked ? 0.22 : 0.14) * shown;
        view.sprite.position.set(0, 0.62, 0);
        screenSprite(view.sprite, 56, 20);
        view.sprite.material.opacity = chrome * shown * (picked ? 1 : 0.8);
        view.shell.userData.id = dome.id;
        view.crown.userData.id = dome.id;
        view.edge.userData.id = dome.id;
        const allow = picked && showHandles;
        view.crown.raycast = allow ? (view.crown.userData.cast as typeof view.crown.raycast) : () => undefined;
        view.edge.raycast = allow ? (view.edge.userData.cast as typeof view.edge.raycast) : () => undefined;
      }
    }
    pickables.push(base, pad, pole, grab, head, turnRing, liftBall, ...hornBalls, ...earCorners, ...earEdges);

    type SpareEar = {
      group: THREE.Group;
      pole: THREE.Mesh;
      head: THREE.Mesh;
      base: THREE.Mesh;
      grab: THREE.Mesh;
      left: THREE.Mesh;
      right: THREE.Mesh;
      leftRing: THREE.Mesh;
      rightRing: THREE.Mesh;
    };
    const spares = new Map<string, SpareEar>();
    const spareHeadGeo = new THREE.SphereGeometry(0.1, 18, 12);
    const sparePoleGeo = new THREE.CylinderGeometry(0.026, 0.026, 1, 10);
    const spareBaseGeo = new THREE.TorusGeometry(0.26, 0.02, 8, 24);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const yawPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const vertPlane = new THREE.Plane();
    const hitPoint = new THREE.Vector3();
    const coneUp = new THREE.Vector3(0, 1, 0);
    const ringAxis = new THREE.Vector3(0, 0, 1);
    const coneAim = new THREE.Vector3();
    const glide = new Map<string, { x: number; y: number; z: number }>();
    function easeAt(key: string, x: number, y: number, z: number, k = 0.18) {
      let row = glide.get(key);
      if (!row) {
        row = { x, y, z };
        glide.set(key, row);
        return row;
      }
      row.x += (x - row.x) * k;
      row.y += (y - row.y) * k;
      row.z += (z - row.z) * k;
      return row;
    }
    const anchor = new THREE.Vector3();
    const camFlat = new THREE.Vector3();
    const linkUp = new THREE.Vector3(0, 1, 0);
    const linkDelta = new THREE.Vector3();
    type GroupBowl = { x: number; y: number; size: number };
    type GroupEar = { x: number; y: number; yaw: number; left: number; right: number };
    let drag: {
      kind: string;
      id: string | null;
      pointerId: number;
      corner?: number;
      origin?: number;
      floor?: number;
      startAngle?: number;
      left?: { x: number; y: number; z: number; yaw?: number; size?: number };
      right?: { x: number; y: number; z: number; yaw?: number; size?: number };
      bowls?: Record<string, GroupBowl>;
      ears?: Record<string, GroupEar>;
      gesture?: "move" | "stretch";
      drop?: boolean;
      nx?: number;
      ny?: number;
      nz?: number;
      ax?: number;
      ay?: number;
      az?: number;
      px?: number;
      py?: number;
      pz?: number;
      originHeight?: number;
      originGain?: number;
      originLift?: number;
      side?: "left" | "right";
      originLateral?: number;
    } | null = null;
    let arm: { pointerId: number; x: number; y: number; room: boolean } | null = null;

    function coneMouthRadius(size: number) {
      return 0.288 * 1.15 * size;
    }
    function sizeCircleRadius(size: number) {
      return Math.max(0.32, coneMouthRadius(size) * 1.72);
    }
    function insideHandle(
      center: { x: number; y: number; z: number },
      earFacing: number,
      aimYaw: number,
      pitch: number,
      size: number,
      side: "left" | "right",
    ) {
      const forward = listenForward(aimYaw, pitch);
      const half = 0.45 * 1.35 * size;
      const out = side === "left" ? -1 : 1;
      let sx = Math.cos(earFacing) * out;
      let sy = 0;
      let sz = -Math.sin(earFacing) * out;
      const dot = sx * forward.x + sy * forward.y + sz * forward.z;
      sx -= forward.x * dot;
      sy -= forward.y * dot;
      sz -= forward.z * dot;
      let mag = Math.hypot(sx, sy, sz);
      if (mag < 1e-4) {
        sx = -forward.z;
        sy = 0;
        sz = forward.x;
        mag = Math.hypot(sx, sz) || 1;
      }
      sx /= mag;
      sy /= mag;
      sz /= mag;
      const mouthR = coneMouthRadius(size);
      const outside = sizeCircleRadius(size);
      const along = half;
      const axis = {
        x: center.x + forward.x * along,
        y: center.y + forward.y * along,
        z: center.z + forward.z * along,
      };
      return {
        axis,
        lip: { x: axis.x + sx * mouthR, y: axis.y + sy * mouthR, z: axis.z + sz * mouthR },
        ball: { x: axis.x + sx * outside, y: axis.y + sy * outside, z: axis.z + sz * outside },
        inset: outside,
      };
    }

    function placeSizeRing(
      ring: THREE.Mesh,
      at: { x: number; y: number; z: number },
      aimYaw: number,
      pitch: number,
      size: number,
    ) {
      const forward = listenForward(aimYaw, pitch);
      const half = 0.45 * 1.35 * size;
      const radius = sizeCircleRadius(size);
      ring.position.set(at.x + forward.x * half, at.y + forward.y * half, at.z + forward.z * half);
      coneAim.set(forward.x, forward.y, forward.z);
      if (coneAim.lengthSq() < 1e-8) coneAim.set(0, 0, 1);
      ring.quaternion.setFromUnitVectors(ringAxis, coneAim.normalize());
      ring.scale.set(radius, radius, radius);
      ring.visible = sceneFade > 0.03;
    }

    function placeLink(mesh: THREE.Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
      linkDelta.set(bx - ax, by - ay, bz - az);
      const len = linkDelta.length();
      if (len < 0.001) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.scale.set(1, len, 1);
      mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      mesh.quaternion.setFromUnitVectors(linkUp, linkDelta.multiplyScalar(1 / len));
    }

    function resize() {
      const width = parent!.clientWidth;
      const height = parent!.clientHeight;
      if (width < 2 || height < 2) return;
      const cap = width < 720 ? 1.25 : 1.6;
      const ratio = stageQuality ? stagePixelRatio(width, height) : Math.min(window.devicePixelRatio || 1, cap);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    const onQuality = () => resize();
    window.addEventListener("lumen-stage-quality", onQuality);
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    function setPointer(event: PointerEvent) {
      const rect = surface.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function captureGroup(extraBowl?: string, extraEar?: string) {
      const state = useBath.getState();
      const bowls: Record<string, GroupBowl> = {};
      const ears: Record<string, GroupEar> = {};
      const keys = new Set(state.selection);
      if (extraBowl) keys.add(`b:${extraBowl}`);
      if (extraEar) keys.add(`e:${extraEar}`);
      for (const key of keys) {
        if (key.startsWith("b:")) {
          const id = key.slice(2);
          const bowl = state.bowls.find((item) => item.id === id);
          if (bowl) bowls[id] = { x: bowl.x, y: bowl.y, size: bowl.size };
        } else if (key.startsWith("e:")) {
          const id = key.slice(2);
          const ear = state.ears.find((item) => item.id === id);
          if (ear) ears[id] = { x: ear.x, y: ear.y, yaw: ear.yaw, left: ear.left.size, right: ear.right.size };
        }
      }
      return { bowls, ears };
    }

    function rememberSpan(bowlId: string) {
      if (!drag) return;
      const state = useBath.getState();
      const bowl = state.bowls.find((item) => item.id === bowlId);
      if (!bowl) return;
      const placed = bowlPoint(bowl, state.settings);
      const centerY = placed.lift + placed.wall * 0.5;
      anchor.set(placed.x, centerY, placed.z);
      camera.getWorldDirection(camFlat);
      if (camFlat.lengthSq() < 1e-6) camFlat.set(0, 0, 1);
      vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
      drag.nx = camFlat.x;
      drag.ny = camFlat.y;
      drag.nz = camFlat.z;
      drag.ax = anchor.x;
      drag.ay = anchor.y;
      drag.az = anchor.z;
      drag.originHeight = bowl.height;
      drag.originGain = bowl.gain;
      drag.originLift = placed.lift;
      const others = state.bowls.filter((item) => item.id !== bowl.id);
      drag.drop = bowlDropRoom(bowl, others, state.settings, earSolids(state.ears, state.settings)) > 0.07;
      if (raycaster.ray.intersectPlane(vertPlane, hitPoint)) {
        drag.px = hitPoint.x;
        drag.py = hitPoint.y;
        drag.pz = hitPoint.z;
      }
    }

    function stretchFromPointer(id: string) {
      const held = drag;
      if (!held || held.originHeight === undefined || held.originGain === undefined || held.originLift === undefined) return;
      if (held.nx === undefined || held.ax === undefined || held.py === undefined) return;
      camFlat.set(held.nx, held.ny ?? 0, held.nz ?? 1);
      anchor.set(held.ax, held.ay ?? 0, held.az ?? 0);
      vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
      if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
      const state = useBath.getState();
      const base = state.bowls.find((item) => item.id === id);
      if (!base) return;
      const next = dropBowlBottom(
        { ...base, height: held.originHeight, gain: held.originGain },
        held.originLift + (hitPoint.y - held.py),
        state.bowls.filter((item) => item.id !== id),
        state.settings,
        earSolids(state.ears, state.settings),
      );
      state.setBowlSpan(id, next.height, next.gain);
    }

    function onDown(event: PointerEvent) {
      if (viewOnlyRef.current) return;
      if (event.button !== 0) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      if (!hit) {
        const state = useBath.getState();
        const onFloor =
          raycaster.ray.intersectPlane(floorPlane, hitPoint) &&
          insideFloor(hitPoint.x, hitPoint.z, state.settings, state.bowls);
        arm = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, room: Boolean(onFloor) };
        return;
      }
      arm = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      const data = hit.object.userData as { kind?: string; id?: string; corner?: number; side?: "left" | "right" };
      const earish =
        data.kind?.startsWith("receiver") ||
        data.kind === "ear-left" ||
        data.kind === "ear-right" ||
        data.kind === "horn-tip" ||
        data.kind === "horn-center" ||
        data.kind === "horn-lift" ||
        data.kind === "horn-spin" ||
        data.kind === "receiver-lift" ||
        data.kind === "spare-ear" ||
        data.kind === "turn-ear" ||
        data.kind === "scale-ear";
      const bowlId = data.kind === "bowl" || data.kind === "resize-bowl" || data.kind === "height-bowl" ? data.id : undefined;
      const earId = earish ? data.id || useBath.getState().activeEarId : undefined;
      if (event.shiftKey && (bowlId || earId)) {
        if (bowlId) useBath.getState().select(bowlId, true);
        else if (earId) useBath.getState().selectEar(earId, true);
        onPickRef.current();
        return;
      }
      drag = { kind: data.kind ?? "", id: data.id ?? null, pointerId: event.pointerId, corner: data.corner, side: data.side };
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic pointers have no capture */
      }
      const domeId = data.kind === "dome" || data.kind === "dome-scale" || data.kind === "dome-height" ? data.id : undefined;
      if (domeId) {
        useBath.getState().selectDome(domeId);
        onPickRef.current();
        const dome = useBath.getState().domes.find((item) => item.id === domeId);
        if (dome) {
          const at = domePoint(dome, useBath.getState().settings);
          drag.origin = dome.size;
          drag.originHeight = dome.height;
          camera.getWorldDirection(camFlat);
          camFlat.y = 0;
          if (camFlat.lengthSq() < 1e-6) camFlat.set(1, 0, 0);
          else camFlat.normalize();
          drag.nx = camFlat.x;
          drag.nz = camFlat.z;
          anchor.set(at.x, at.y, at.z);
          vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
          if (raycaster.ray.intersectPlane(vertPlane, hitPoint)) {
            drag.px = hitPoint.x;
            drag.py = hitPoint.y;
            drag.pz = hitPoint.z;
          } else {
            drag.px = at.x;
            drag.py = at.y;
            drag.pz = at.z;
          }
          if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
            drag.floor = Math.max(0.08, Math.hypot(hitPoint.x - at.x, hitPoint.z - at.z));
          }
        }
      }
      if (bowlId) {
        useBath.getState().select(bowlId);
        onPickRef.current();
        const group = captureGroup(bowlId);
        drag.bowls = group.bowls;
        drag.ears = group.ears;
      }
      if ((data.kind === "bowl" || data.kind === "height-bowl") && bowlId) {
        rememberSpan(bowlId);
        if (data.kind === "height-bowl") drag.gesture = "stretch";
      }
      if (data.kind === "resize-bowl" && bowlId) {
        const bowl = useBath.getState().bowls.find((item) => item.id === bowlId);
        if (bowl) {
          const placed = bowlPoint(bowl, useBath.getState().settings);
          const center = new THREE.Vector3(placed.x, placed.lift + placed.wall * 0.5, placed.z);
          camera.getWorldDirection(camFlat);
          vertPlane.setFromNormalAndCoplanarPoint(camFlat, center);
          if (raycaster.ray.intersectPlane(vertPlane, hitPoint)) {
            drag.origin = bowl.size;
            drag.floor = Math.max(0.05, hitPoint.distanceTo(center));
          }
        }
      }
      if (earId) {
        const ear = useBath.getState().ears.find((item) => item.id === earId);
        useBath.getState().selectEar(earId);
        onPickRef.current();
        const group = captureGroup(undefined, earId);
        drag.bowls = group.bowls;
        drag.ears = group.ears;
        if ((data.kind === "turn-ear" || data.kind === "scale-ear") && ear) {
          const head = receiverPoint(ear, useBath.getState().settings);
          const center = new THREE.Vector3(head.x, head.y, head.z);
          camera.getWorldDirection(camFlat);
          vertPlane.setFromNormalAndCoplanarPoint(camFlat, center);
          if (raycaster.ray.intersectPlane(vertPlane, hitPoint)) {
            drag.floor = Math.max(0.05, hitPoint.distanceTo(center));
            drag.startAngle = Math.atan2(hitPoint.x - head.x, hitPoint.z - head.z);
          }
        }
        if ((data.kind === "horn-tip" || data.kind === "horn-center" || data.kind === "horn-lift" || data.kind === "horn-spin") && ear) {
          const side = data.side === "right" ? "right" : "left";
          const part = ear[side];
          const settings = useBath.getState().settings;
          const center = drawnCone(ear, part, settings);
          const earYaw = facingYaw(ear, settings);
          const aimNow = hornYaw(ear, part, settings);
          const pitched = hornPitch(ear, part);
          const forward = listenForward(aimNow, pitched);
          const length = 1.35 * part.size;
          const half = 0.45 * length;
          const out = side === "left" ? -1 : 1;
          const stick = 0.55 + length * 0.55;
          const sx = Math.cos(earYaw) * out * stick;
          const sz = -Math.sin(earYaw) * out * stick;
          const throat = { x: center.x - forward.x * half, y: center.y - forward.y * half, z: center.z - forward.z * half };
          const mouth = { x: center.x + forward.x * half, y: center.y + forward.y * half, z: center.z + forward.z * half };
          const tipLen = 0.72;
          const inside = insideHandle(center, earYaw, aimNow, pitched, part.size, side);
          const ball =
            data.kind === "horn-center"
              ? inside.ball
              : data.kind === "horn-lift"
                ? { x: throat.x - forward.x * 1.15, y: throat.y - forward.y * 1.15, z: throat.z - forward.z * 1.15 }
                : data.kind === "horn-spin"
                  ? center
                  : { x: mouth.x + forward.x * tipLen, y: mouth.y + forward.y * tipLen, z: mouth.z + forward.z * tipLen };
          drag.ax = data.kind === "horn-center" ? inside.axis.x : data.kind === "horn-tip" ? throat.x : sx;
          drag.ay = data.kind === "horn-center" ? inside.axis.y : data.kind === "horn-tip" ? throat.y : 0;
          drag.az = data.kind === "horn-center" ? inside.axis.z : data.kind === "horn-tip" ? throat.z : sz;
          drag.px = ball.x;
          drag.py = ball.y;
          drag.pz = ball.z;
          drag.origin = part.size;
          drag.originLateral = data.kind === "horn-center" ? inside.inset : undefined;
          drag.left = side === "left" ? { x: part.x, y: part.y, z: part.z, yaw: part.yaw ?? 0, size: part.size } : drag.left;
          drag.right = side === "right" ? { x: part.x, y: part.y, z: part.z, yaw: part.yaw ?? 0, size: part.size } : drag.right;
          camera.getWorldDirection(camFlat);
          camFlat.y = 0;
          if (camFlat.lengthSq() < 1e-6) camFlat.set(1, 0, 0);
          else camFlat.normalize();
          drag.nx = camFlat.x;
          drag.ny = 0;
          drag.nz = camFlat.z;
        }
        if (data.kind === "receiver-lift" && ear) {
          const settings = useBath.getState().settings;
          const placed = receiverPoint(ear, settings);
          const earYaw = facingYaw(ear, settings);
          const avg = ((ear.left.y + ear.right.y) * 0.5) * EAR_PART_SCALE;
          drag.px = placed.x - Math.sin(earYaw) * 1.85;
          drag.py = placed.y + avg;
          drag.pz = placed.z - Math.cos(earYaw) * 1.85;
          drag.left = { x: ear.left.x, y: ear.left.y, z: ear.left.z };
          drag.right = { x: ear.right.x, y: ear.right.y, z: ear.right.z };
          camera.getWorldDirection(camFlat);
          camFlat.y = 0;
          if (camFlat.lengthSq() < 1e-6) camFlat.set(1, 0, 0);
          else camFlat.normalize();
          drag.nx = camFlat.x;
          drag.ny = 0;
          drag.nz = camFlat.z;
        }
      }
    }

    function onMove(event: PointerEvent) {
      setPointer(event);
      if (!drag || event.pointerId !== drag.pointerId) {
        raycaster.setFromCamera(pointer, camera);
        const hover = raycaster.intersectObjects(pickables, false)[0];
        const hoverKind = (hover?.object.userData as { kind?: string } | undefined)?.kind;
        surface.style.cursor =
          hoverKind === "height-bowl" || hoverKind === "horn-lift" || hoverKind === "receiver-lift" || hoverKind === "dome-height"
            ? "ns-resize"
            : hoverKind === "horn-spin"
              ? "grab"
              : hoverKind === "horn-center" || hoverKind === "dome-scale"
                ? "ew-resize"
                : hoverKind === "horn-tip"
                ? "move"
                : hover
                  ? "pointer"
                  : "";
        return;
      }
      const held = drag;
      surface.style.cursor =
        held.gesture === "stretch" || held.kind === "height-bowl" || held.kind === "horn-lift" || held.kind === "receiver-lift" || held.kind === "dome-height"
          ? "ns-resize"
          : held.kind === "horn-spin"
            ? "grabbing"
          : held.kind === "horn-center" || held.kind === "dome-scale"
            ? "ew-resize"
            : held.kind === "horn-tip"
              ? "move"
              : "grabbing";
      const state = useBath.getState();
      raycaster.setFromCamera(pointer, camera);
      if ((held.kind === "dome" || held.kind === "dome-scale" || held.kind === "dome-height") && held.id) {
        const dome = state.domes.find((item) => item.id === held.id);
        if (!dome) return;
        if (held.kind === "dome-height") {
          camFlat.set(held.nx ?? 1, 0, held.nz ?? 0);
          anchor.set(held.px ?? 0, held.py ?? 1, held.pz ?? 0);
          vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
          if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
          state.updateDome(held.id, { height: (held.originHeight ?? dome.height) + (hitPoint.y - (held.py ?? hitPoint.y)) / 1.42 });
          return;
        }
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
        if (held.kind === "dome-scale") {
          const at = domePoint(dome, state.settings);
          const dist = Math.max(0.08, Math.hypot(hitPoint.x - at.x, hitPoint.z - at.z));
          state.updateDome(held.id, { size: (held.origin ?? dome.size) * (dist / Math.max(0.08, held.floor ?? dist)) });
          return;
        }
        const spread = roomSpread(state.settings);
        state.moveDome(held.id, hitPoint.x / spread.x + 0.5, hitPoint.z / spread.z + 0.5);
        return;
      }
      if (held.kind === "height-bowl" && held.id) {
        stretchFromPointer(held.id);
        return;
      }
      if (held.kind === "bowl" && held.id && held.bowls) {
        if (held.gesture === "stretch") {
          surface.style.cursor = "ns-resize";
          stretchFromPointer(held.id);
          return;
        }
        if (!held.gesture && held.drop && held.py !== undefined && held.nx !== undefined && held.ax !== undefined) {
          camFlat.set(held.nx, held.ny ?? 0, held.nz ?? 1);
          anchor.set(held.ax, held.ay ?? 0, held.az ?? 0);
          vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
          if (raycaster.ray.intersectPlane(vertPlane, hitPoint)) {
            const down = held.py - hitPoint.y;
            const side = Math.hypot(hitPoint.x - (held.px ?? hitPoint.x), hitPoint.z - (held.pz ?? hitPoint.z));
            if (down < 0.06 && side < 0.06) return;
            if (down > 0.08 && down > side * 1.35) {
              held.gesture = "stretch";
              surface.style.cursor = "ns-resize";
              stretchFromPointer(held.id);
              return;
            }
            held.gesture = "move";
          }
        }
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
        const next = floorToNorm(hitPoint.x, hitPoint.z, state.settings, state.bowls);
        const origin = held.bowls[held.id];
        if (!origin) return;
        const dx = next.x - origin.x;
        const dy = next.y - origin.y;
        state.placeGroup({
          bowls: Object.entries(held.bowls).map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy })),
          ears: Object.entries(held.ears ?? {}).map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy })),
        });
        return;
      }
      if (held.kind === "bowl-level" && held.id) {
        const levelId = held.id;
        const bowl = state.bowls.find((item) => item.id === levelId);
        if (!bowl) return;
        const placed = bowlPoint(bowl, state.settings);
        camera.getWorldDirection(camFlat);
        camFlat.y = 0;
        if (camFlat.lengthSq() < 1e-6) camFlat.set(0, 0, 1);
        else camFlat.normalize();
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, new THREE.Vector3(placed.x, placed.lift, placed.z));
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        state.updateBowl(bowl.id, { gain: liftToGain(hitPoint.y) });
        return;
      }
      if (held.kind === "resize-bowl" && held.id && held.origin !== undefined && held.floor) {
        const bowl = state.bowls.find((item) => item.id === held.id);
        if (!bowl) return;
        const placed = bowlPoint(bowl, state.settings);
        const center = new THREE.Vector3(placed.x, placed.lift + placed.wall * 0.5, placed.z);
        camera.getWorldDirection(camFlat);
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, center);
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        const scale = hitPoint.distanceTo(center) / held.floor;
        state.scaleGroup({
          bowls: Object.entries(held.bowls ?? { [bowl.id]: { x: bowl.x, y: bowl.y, size: held.origin } }).map(([id, start]) => ({
            id,
            size: start.size * scale,
          })),
        });
        return;
      }
      if (held.kind === "turn-ear" && held.ears && held.startAngle !== undefined) {
        const ear = state.ears.find((item) => item.id === held.id) ?? state.ears.find((item) => item.id === state.activeEarId);
        if (!ear) return;
        const head = receiverPoint(ear, state.settings);
        const center = new THREE.Vector3(head.x, 0, head.z);
        yawPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), center);
        if (!raycaster.ray.intersectPlane(yawPlane, hitPoint)) return;
        const abs = Math.atan2(hitPoint.x - head.x, hitPoint.z - head.z);
        const delta = abs - held.startAngle;
        state.turnGroup(Object.entries(held.ears).map(([id, start]) => ({ id, yaw: start.yaw + delta })));
        return;
      }
      if (held.kind === "scale-ear" && held.ears && held.floor) {
        const ear = state.ears.find((item) => item.id === held.id) ?? state.ears.find((item) => item.id === state.activeEarId);
        if (!ear) return;
        const head = receiverPoint(ear, state.settings);
        const center = new THREE.Vector3(head.x, head.y, head.z);
        camera.getWorldDirection(camFlat);
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, center);
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        const scale = hitPoint.distanceTo(center) / held.floor;
        state.scaleGroup({
          cones: Object.entries(held.ears).map(([id, start]) => ({ id, left: start.left * scale, right: start.right * scale })),
        });
        return;
      }
      if (held.kind === "receiver-head" || held.kind === "spare-ear") {
        const ear = state.ears.find((item) => item.id === held.id) ?? state.ears.find((item) => item.id === state.activeEarId);
        if (!ear) return;
        if (held.kind === "spare-ear") {
          if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
          const next = floorToNorm(hitPoint.x, hitPoint.z, state.settings, state.bowls);
          const origin = held.ears?.[ear.id];
          if (!origin) {
            state.moveReceiver(next.x, next.y, undefined, ear.id);
            return;
          }
          const dx = next.x - origin.x;
          const dy = next.y - origin.y;
          state.placeGroup({
            bowls: Object.entries(held.bowls ?? {}).map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy })),
            ears: Object.entries(held.ears ?? {}).map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy })),
          });
          return;
        }
        const placed = receiverPoint(ear, state.settings);
        camera.getWorldDirection(camFlat);
        camFlat.y = 0;
        if (camFlat.lengthSq() < 1e-6) camFlat.set(0, 0, 1);
        else camFlat.normalize();
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, new THREE.Vector3(placed.x, placed.y, placed.z));
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        state.moveReceiver(ear.x, ear.y, worldEarToHeight(hitPoint.y), ear.id);
        return;
      }
      if (held.kind === "receiver-base") {
        if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
        const next = floorToNorm(hitPoint.x, hitPoint.z, state.settings, state.bowls);
        const earId = held.id ?? state.activeEarId;
        const origin = held.ears?.[earId];
        if (!origin) {
          state.moveReceiver(next.x, next.y, undefined, earId);
          return;
        }
        const dx = next.x - origin.x;
        const dy = next.y - origin.y;
        state.placeGroup({
          bowls: Object.entries(held.bowls ?? {}).map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy })),
          ears: Object.entries(held.ears ?? {}).map(([id, start]) => ({ id, x: start.x + dx, y: start.y + dy })),
        });
        return;
      }
      if (held.kind === "receiver-yaw") {
        const ear = state.ears.find((item) => item.id === (held.id ?? state.activeEarId)) ?? state.ears[0];
        if (!ear) return;
        const placed = receiverPoint(ear, state.settings);
        yawPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(placed.x, 0, placed.z));
        if (!raycaster.ray.intersectPlane(yawPlane, hitPoint)) return;
        const abs = Math.atan2(hitPoint.x - placed.x, hitPoint.z - placed.z);
        const mag = Math.hypot(placed.x, placed.z);
        const toward = mag < 0.001 ? Math.PI : Math.atan2(-placed.x, -placed.z);
        state.turnReceiver(abs - toward, ear.id);
        return;
      }
      if (held.kind === "receiver-lift") {
        const ear = state.ears.find((item) => item.id === (held.id ?? state.activeEarId)) ?? state.ears[0];
        if (!ear || held.py == null || held.nx == null || held.px == null || held.pz == null || !held.left || !held.right) return;
        camFlat.set(held.nx, 0, held.nz ?? 1);
        anchor.set(held.px, held.py, held.pz);
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        const delta = (hitPoint.y - held.py) / EAR_PART_SCALE;
        state.setBothSides(ear.id, { y: held.left.y + delta }, { y: held.right.y + delta });
        return;
      }
      if (held.kind === "horn-center" || held.kind === "horn-lift" || held.kind === "horn-spin" || held.kind === "horn-tip") {
        const ear = state.ears.find((item) => item.id === (held.id ?? state.activeEarId)) ?? state.ears[0];
        const side = held.side === "right" ? "right" : "left";
        const snap = side === "right" ? held.right : held.left;
        if (!ear || !snap || held.px == null || held.py == null || held.pz == null) return;
        const part = ear[side];
        if (held.kind === "horn-spin") {
          yawPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(held.px, held.py, held.pz));
          if (!raycaster.ray.intersectPlane(yawPlane, hitPoint)) return;
          let extra = Math.atan2(hitPoint.x - held.px, hitPoint.z - held.pz) - facingYaw(ear, state.settings);
          while (extra > Math.PI) extra -= Math.PI * 2;
          while (extra < -Math.PI) extra += Math.PI * 2;
          state.updateEarSide(ear.id, side, { yaw: extra });
          return;
        }
        if (held.nx == null) return;
        camFlat.set(held.nx, 0, held.nz ?? 1);
        anchor.set(held.px, held.py, held.pz);
        vertPlane.setFromNormalAndCoplanarPoint(camFlat, anchor);
        if (!raycaster.ray.intersectPlane(vertPlane, hitPoint)) return;
        if (held.kind === "horn-lift") {
          const level = Math.max(0.35, Math.cos(hornPitch(ear, part)));
          state.updateEarSide(ear.id, side, { y: snap.y + (hitPoint.y - held.py) / (EAR_PART_SCALE * level) });
          return;
        }
        if (held.kind === "horn-center") {
          const axis = new THREE.Vector3(held.ax ?? 0, held.ay ?? 0, held.az ?? 0);
          const outward = new THREE.Vector3((held.px ?? 0) - axis.x, (held.py ?? 0) - axis.y, (held.pz ?? 0) - axis.z);
          const span = outward.length() || held.originLateral || 1;
          outward.multiplyScalar(1 / (outward.length() || 1));
          const radial = hitPoint.clone().sub(axis).dot(outward);
          const size = Math.min(CONE_MAX, Math.max(CONE_MIN, (held.origin ?? part.size) + (radial - span) / INSIDE_PER_SIZE));
          state.updateEarSide(ear.id, side, { size });
          return;
        }
        const throat = new THREE.Vector3(held.ax ?? held.px, held.ay ?? held.py, held.az ?? held.pz);
        const dx = hitPoint.x - throat.x;
        const dy = hitPoint.y - throat.y;
        const dz = hitPoint.z - throat.z;
        const horiz = Math.hypot(dx, dz);
        let aim = Math.atan2(-dy, Math.max(0.12, horiz));
        if (aim > Math.PI / 2) aim = Math.PI / 2;
        if (aim < -Math.PI / 2) aim = -Math.PI / 2;
        const length = 1.35 * part.size;
        const maxDown = Math.asin(Math.min(1, Math.max(0, (throat.y - 0.04) / Math.max(0.2, length))));
        if (aim > maxDown) aim = maxDown;
        state.updateEarSide(ear.id, side, { pitch: aim - earPitch(ear) });
      }
    }

    function onUp(event: PointerEvent) {
      if (arm && arm.pointerId === event.pointerId) {
        const moved = Math.hypot(event.clientX - arm.x, event.clientY - arm.y);
        if (moved < 8) {
          if (arm.room) onRoomRef.current();
          else onClearRef.current();
        }
        arm = null;
      }
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
          return { id: bowl.id, ...toScreen(placed.x, placed.lift + placed.wall * 0.45, placed.z) };
        }),
        ear: (() => {
          const placed = receiverPoint(state.receiver, state.settings);
          return toScreen(placed.x, placed.y, placed.z);
        })(),
        listener: bathEngine.listenerNow(),
        ears: state.ears.map((ear) => {
          const placed = receiverPoint(ear, state.settings);
          return { id: ear.id, ...toScreen(placed.x, placed.y, placed.z) };
        }),
        domes: state.domes.map((dome) => {
          const placed = domePoint(dome, state.settings);
          return { id: dome.id, ...toScreen(placed.x, placed.y + placed.radius * 0.35, placed.z) };
        }),
      };
    };

    let chrome = 1;
    let sceneFade = 1;
    let bowlFade = 1;
    let waveFade = 0;
    let chromeAt = performance.now();
    function approach(current: number, target: number, dt: number, tau: number) {
      const next = current + (target - current) * (1 - Math.exp(-dt / tau));
      return Math.abs(next - target) < 0.004 ? target : next;
    }
    function readChrome() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - chromeAt) / 1000);
      chromeAt = now;
      const tau = idleSpin ? 0.42 : 0.28;
      chrome = approach(chrome, idleSpin ? 0 : 1, dt, tau);
      const deep = kioskPhase === "bowls" || kioskPhase === "waves";
      sceneFade = approach(sceneFade, deep ? 0 : 1, dt, 0.7);
      bowlFade = approach(bowlFade, kioskPhase === "waves" ? 0 : 1, dt, 0.7);
      const waveOn = kioskPhase === "waves" || (kioskPhase !== "bowls" && wavesRef.current);
      waveFade = approach(waveFade, waveOn ? 1 : 0, dt, 0.7);
      return chrome;
    }
    function fadeTree(root: THREE.Object3D, amount: number) {
      root.traverse((child) => {
        const material = (child as THREE.Mesh).material as (THREE.Material & { opacity: number; transparent: boolean; depthWrite: boolean }) | THREE.Material[] | undefined;
        if (!material || Array.isArray(material)) return;
        if (typeof material.userData.fade === "number") {
          material.opacity = material.userData.fade * chrome * amount;
          return;
        }
        if (!material.userData.kioskOwned) {
          const clone = material.clone() as typeof material;
          clone.userData.kioskOwned = true;
          clone.userData.kioskOpacity = material.opacity;
          clone.userData.kioskDepth = material.depthWrite;
          (child as THREE.Mesh).material = clone;
        }
        const owned = (child as THREE.Mesh).material as typeof material;
        if (Array.isArray(owned)) return;
        const base = owned.userData.kioskOpacity as number;
        owned.transparent = amount < 0.999 || base < 0.999;
        owned.opacity = base * amount;
        owned.depthWrite = amount > 0.95 ? Boolean(owned.userData.kioskDepth) : false;
      });
    }

    function syncScene() {
      const state = useBath.getState();
      const layout = roomSpread(state.settings);
      const mesh = roomMeshSpread(state.settings, state.bowls);
      const shape = state.settings.roomShape;
      if (shape !== roomId) {
        roomRoot.remove(roomGroup);
        disposeRoom(roomGroup);
        roomGroup = buildRoom(shape, roomMats);
        roomRoot.add(roomGroup);
        roomId = shape;
      }
      roomRoot.scale.set(mesh.x * FLOOR_SCALE, 1, mesh.z * FLOOR_SCALE);
      const fog = scene.fog as THREE.FogExp2;
      const roomSize = Math.max(1, state.settings.size || 4);
      fog.density = (getRoom(shape).fog / roomSize) * sceneFade;
      const spanNow = Math.max(layout.x, layout.z) * FLOOR_SCALE;
      const meshSpan = Math.max(mesh.x, mesh.z) * FLOOR_SCALE;
      controls.maxDistance = Math.max(48, meshSpan * 3.2);
      if (spanNow > framedSpan * 1.04) {
        const offset = camera.position.clone().sub(controls.target);
        const dist = Math.max(offset.length(), 0.001);
        offset.setLength(Math.max(spanNow * 2.15, dist * (spanNow / framedSpan)));
        camera.position.copy(controls.target).add(offset);
      }
      framedSpan = spanNow;
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
        for (const handle of [view.collar, view.grab, view.arm, view.pick, ...view.box.children]) {
          const handleIndex = pickables.indexOf(handle);
          if (handleIndex >= 0) pickables.splice(handleIndex, 1);
        }
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
          sprite.material.depthTest = false;
          sprite.renderOrder = 5;
          const stem = new THREE.Mesh(stemGeo, axisMat);
          stem.raycast = () => undefined;
          const collar = new THREE.Mesh(collarGeo, gold);
          collar.userData = { kind: "bowl-level", id: bowl.id };
          const arm = new THREE.Mesh(armGeo, gold);
          arm.userData = { kind: "bowl-level", id: bowl.id };
          const grab = new THREE.Mesh(stemGrabGeo, pickMat);
          grab.userData = { kind: "bowl-level", id: bowl.id };
          group.add(stem, grab, collar, arm, glass, rim, ring, shadow, sprite);
          const pick = new THREE.Mesh(pickGeo, pickDiscMat);
          pick.rotation.x = -Math.PI / 2;
          pick.userData = { kind: "bowl", id: bowl.id };
          group.add(pick);
          const box = new THREE.Group();
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
            new THREE.LineBasicMaterial({ color: "#d7b56d", transparent: true, opacity: 0.9 }),
          );
          (edges.material as THREE.Material).userData.fade = 0.9;
          edges.raycast = () => undefined;
          box.add(edges);
          for (let corner = 0; corner < 4; corner++) {
            const handle = new THREE.Mesh(cornerGeo, fadeMat());
            handle.userData = { kind: "resize-bowl", id: bowl.id, corner };
            box.add(handle);
            pickables.push(handle);
          }
          for (let corner = 0; corner < 4; corner++) {
            const handle = new THREE.Mesh(cornerGeo, fadeMat());
            handle.userData = { kind: "height-bowl", id: bowl.id, corner };
            box.add(handle);
            pickables.push(handle);
          }
          group.add(box);
          scene.add(group);
          pickables.push(glass, collar, arm, grab, pick);
          view = {
            group,
            glass,
            rim,
            ring,
            shadow,
            sprite,
            stem,
            collar,
            arm,
            grab,
            pick,
            box,
            glassId: bowl.glass,
            note: shortNote(bowl.frequency),
          };
          views.set(bowl.id, view);
        }
        const placed = bowlPoint(bowl, state.settings);
        const lift = placed.lift;
        const axisX = -(placed.radius + 0.42);
        view.group.position.set(placed.x, 0, placed.z);
        view.stem.scale.set(1, BOWL_LIFT_MAX, 1);
        view.stem.position.set(axisX, BOWL_LIFT_MAX / 2, 0);
        view.grab.scale.set(1, BOWL_LIFT_MAX, 1);
        view.grab.position.set(axisX, BOWL_LIFT_MAX / 2, 0);
        view.collar.position.set(axisX, lift, 0);
        view.arm.rotation.z = Math.PI / 2;
        view.arm.scale.set(1, Math.abs(axisX), 1);
        view.arm.position.set(axisX / 2, lift, 0);
        view.glass.position.y = lift;
        view.glass.scale.set(placed.radius, placed.wall, placed.radius);
        view.pick.position.y = lift + placed.wall * 0.42;
        view.pick.scale.set(placed.radius * 1.15, placed.radius * 1.15, 1);
        view.rim.scale.set(placed.radius, placed.radius, placed.radius);
        view.rim.position.y = lift + placed.wall * 0.9;
        view.shadow.scale.set(placed.radius * 1.05, placed.radius * 1.05, 1);
        const picked = bowl.id === state.selectedId && state.focus === "bowl";
        const grouped = state.selection.includes(`b:${bowl.id}`);
        view.stem.visible = picked;
        view.collar.visible = picked;
        view.arm.visible = picked;
        view.grab.visible = picked;
        view.collar.scale.setScalar(picked ? 1.7 : 1);
        view.ring.visible = picked || grouped;
        view.ring.scale.set(placed.radius * 1.2, placed.radius * 1.2, placed.radius * 1.2);
        if (view.glassId !== bowl.glass) {
          (view.glass.material as THREE.Material).dispose();
          view.glass.material = glassMaterial(bowl.glass);
          view.glassId = bowl.glass;
        }
        const material = view.glass.material as THREE.MeshPhysicalMaterial;
        material.opacity = bowl.muted ? 0.32 : 0.92;
        if (material.userData.kioskOwned) material.userData.kioskOpacity = material.opacity;
        material.emissiveIntensity = bowl.id === state.selectedId ? 0.28 : 0.07;
        const note = shortNote(bowl.frequency);
        if (view.note !== note) {
          view.sprite.material.map?.dispose();
          view.sprite.material.map = noteTexture(note);
          view.sprite.material.needsUpdate = true;
          view.note = note;
        }
        view.sprite.position.y = lift + placed.wall + 0.28;
        screenSprite(view.sprite, 52, 22);
        view.sprite.visible = chrome > 0.03;
        view.sprite.material.opacity = chrome;
        const halfW = placed.radius * 1.35;
        const halfH = placed.wall * 0.62 + 0.08;
        const others = state.bowls.filter((item) => item.id !== bowl.id);
        const showBottom = picked && bowlDropRoom(bowl, others, state.settings, earSolids(state.ears, state.settings)) > 0.07;
        const boxTop = lift + placed.wall * 0.5 + halfH;
        const boxBottom = Math.max(0.02, lift + placed.wall * 0.5 - halfH);
        const boxH = Math.max(0.2, boxTop - boxBottom);
        const boxY = boxBottom + boxH / 2;
        const handleY = Math.max(lift, 0.02 + CORNER);
        const localBottom = (handleY - boxY) / boxH;
        view.box.visible = (picked || grouped) && chrome > 0.03 && bowlFade > 0.03;
        view.box.position.set(0, boxY, 0);
        view.box.scale.set(halfW * 2, boxH, halfW * 2);
        const footprint = [
          [-0.5, 0.5],
          [0.5, 0.5],
          [0.5, -0.5],
          [-0.5, -0.5],
        ];
        view.box.children.forEach((child) => {
          const handle = child instanceof THREE.Mesh;
          const bottom = child.userData.kind === "height-bowl";
          child.visible = handle ? (bottom ? showBottom : picked) : picked || grouped;
          const cast = child.userData.cast as ((raycaster: THREE.Raycaster, hits: THREE.Intersection[]) => void) | undefined;
          if (!cast) child.userData.cast = child.raycast.bind(child);
          const live = bottom ? showBottom : picked;
          child.raycast = live ? (child.userData.cast as typeof child.raycast) : () => undefined;
          if (!(child instanceof THREE.Mesh)) return;
          const corner = Number(child.userData.corner);
          const spot = footprint[corner];
          if (!spot) return;
          child.position.set(spot[0], bottom ? localBottom : 0.5, spot[1]);
          const sx = halfW * 2;
          const sy = boxH;
          child.scale.set(1 / sx, 1 / sy, 1 / sx);
        });
        view.group.visible = bowlFade > 0.02;
        fadeTree(view.group, bowlFade);
        view.sprite.material.opacity = chrome * bowlFade;
      }
      const ears = state.ears.length ? state.ears : [];
      const active = ears.find((item) => item.id === state.activeEarId) ?? ears[0];
      const earId = active?.id ?? "";
      function aimCone(mesh: THREE.Mesh, at: { x: number; y: number; z: number }, facing: number, size: number, pitch: number) {
        const length = 1.35 * size;
        const girth = 1.15 * size;
        const forward = listenForward(facing, pitch);
        mesh.scale.set(girth, length, girth);
        coneAim.set(forward.x, forward.y, forward.z);
        if (coneAim.lengthSq() < 1e-8) coneAim.set(0, 0, 1);
        mesh.quaternion.setFromUnitVectors(coneUp, coneAim.normalize());
        mesh.position.set(at.x, at.y, at.z);
      }
      function placeKit(
        kit: HornKit,
        at: { x: number; y: number; z: number },
        earFacing: number,
        aimYaw: number,
        pitch: number,
        size: number,
      ) {
        const show = showCaps && chrome > 0.03 && sceneFade > 0.03;
        const parts = [kit.centerRod, kit.centerBall, kit.backRod, kit.backBall, kit.tipRod, kit.tipBall, kit.spinRing, kit.spinBall];
        placeSizeRing(kit.sizeRing, at, aimYaw, pitch, size);
        if (!show) {
          for (const mesh of parts) mesh.visible = false;
          return;
        }
        const forward = listenForward(aimYaw, pitch);
        const length = 1.35 * size;
        const half = 0.45 * length;
        const radius = ballRadius(size);
        const inside = insideHandle(at, earFacing, aimYaw, pitch, size, kit.side);
        const throat = { x: at.x - forward.x * half, y: at.y - forward.y * half, z: at.z - forward.z * half };
        const back = { x: throat.x - forward.x * 1.15, y: throat.y - forward.y * 1.15, z: throat.z - forward.z * 1.15 };
        const mouth = { x: at.x + forward.x * half, y: at.y + forward.y * half, z: at.z + forward.z * half };
        const tipAt = { x: mouth.x + forward.x * 0.72, y: mouth.y + forward.y * 0.72, z: mouth.z + forward.z * 0.72 };
        const spinR = Math.max(0.58, 0.34 + length * 0.42);
        placeLink(kit.centerRod, inside.lip.x, inside.lip.y, inside.lip.z, inside.ball.x, inside.ball.y, inside.ball.z);
        placeLink(kit.backRod, throat.x, throat.y, throat.z, back.x, back.y, back.z);
        placeLink(kit.tipRod, mouth.x, mouth.y, mouth.z, tipAt.x, tipAt.y, tipAt.z);
        kit.centerBall.position.set(inside.ball.x, inside.ball.y, inside.ball.z);
        kit.centerBall.scale.setScalar(Math.max(0.12, sizeCircleRadius(size) * 0.24));
        kit.backBall.position.set(back.x, back.y, back.z);
        kit.tipBall.position.set(tipAt.x, tipAt.y, tipAt.z);
        kit.spinRing.position.set(at.x, at.y, at.z);
        kit.spinRing.scale.set(spinR, spinR, spinR);
        kit.spinRing.visible = true;
        kit.spinBall.position.set(at.x + Math.sin(aimYaw) * spinR, at.y, at.z + Math.cos(aimYaw) * spinR);
        for (const ball of [kit.backBall, kit.tipBall, kit.spinBall]) {
          ball.scale.setScalar(radius);
          ball.userData.id = earId;
          ball.visible = true;
        }
        kit.centerBall.userData.id = earId;
        kit.centerBall.visible = true;
        kit.spinRing.userData.id = earId;
      }
      for (const part of [base, pad, pole, grab, head, turnRing, leftCap, rightCap, liftBall]) part.userData.id = earId;
      let ear = receiverPoint(active ?? state.receiver, state.settings);
      let yaw = facingYaw(active ?? state.receiver, state.settings);
      const flight = state.cycleFlight;
      let flightU = 1;
      if (flight && flight.until > Date.now()) {
        const span = Math.max(40, flight.ms || 160);
        const t = Math.min(1, Math.max(0, 1 - (flight.until - Date.now()) / span));
        flightU = t * t * (3 - 2 * t);
        let turn = yaw - flight.yaw;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        yaw = flight.yaw + turn * flightU;
        ear = {
          x: flight.x + (ear.x - flight.x) * flightU,
          y: flight.y + (ear.y - flight.y) * flightU,
          z: flight.z + (ear.z - flight.z) * flightU,
        };
      }
      const headEase = easeAt("head", ear.x, ear.y, ear.z);
      ear = { x: headEase.x, y: headEase.y, z: headEase.z };
      const pitchNow = active ? earPitch(active) : 0;
      let yawRow = glide.get("yaw");
      if (!yawRow) {
        yawRow = { x: yaw, y: pitchNow, z: 0 };
        glide.set("yaw", yawRow);
      } else {
        let turn = yaw - yawRow.x;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        yawRow.x += turn * 0.18;
        yawRow.y += (pitchNow - yawRow.y) * 0.18;
      }
      yaw = yawRow.x;
      const pitchGlide = yawRow.y;
      receiver.position.set(ear.x, 0, ear.z);
      pole.scale.y = Math.max(0.2, ear.y);
      pole.position.y = ear.y / 2;
      grab.scale.y = Math.max(0.2, ear.y);
      grab.position.y = ear.y / 2;
      head.position.y = ear.y;
      halo.position.y = ear.y;
      earSprite.visible = state.focus !== "ear" && chrome > 0.03;
      earSprite.material.opacity = chrome;
      earSprite.position.y = ear.y + 0.42;
      screenSprite(earSprite, 44, 18);
      const showCaps = state.focus === "ear" && !!active;
      leftCap.visible = true;
      rightCap.visible = true;
      leftTag.visible = chrome > 0.03;
      rightTag.visible = chrome > 0.03;
      leftTag.material.opacity = chrome;
      rightTag.material.opacity = chrome;
      leftLink.visible = showCaps;
      rightLink.visible = showCaps;
      earBox.visible = showCaps && chrome > 0.03 && sceneFade > 0.03;
      turnRing.visible = showCaps && chrome > 0.03 && sceneFade > 0.03;
      const showHandles = showCaps && chrome > 0.03 && sceneFade > 0.03;
      liftRod.visible = showHandles;
      liftBall.visible = showHandles;
      leftMat.opacity = showCaps ? 0.95 : 0.72;
      rightMat.opacity = showCaps ? 0.95 : 0.72;
      for (const handle of [...hornBalls, liftBall, ...earCorners, ...earEdges]) {
        handle.visible = showHandles;
        if (!handle.userData.cast) handle.userData.cast = handle.raycast.bind(handle);
        handle.raycast = showHandles ? (handle.userData.cast as typeof handle.raycast) : () => undefined;
      }
      if (!showHandles) {
        for (const kit of [leftKit, rightKit]) {
          kit.centerRod.visible = false;
          kit.backRod.visible = false;
          kit.tipRod.visible = false;
        }
      }
      if (active) {
        const live =
          drag?.kind === "horn-center" ||
          drag?.kind === "horn-lift" ||
          drag?.kind === "horn-tip" ||
          drag?.kind === "horn-spin" ||
          drag?.kind === "receiver-lift";
        const leftFollow = live && (drag?.side === "left" || drag?.kind === "receiver-lift") ? 1 : 0.18;
        const rightFollow = live && (drag?.side === "right" || drag?.kind === "receiver-lift") ? 1 : 0.18;
        const leftPitch = easeAt("pitch-l", hornPitch(active, active.left), 0, 0, leftFollow).x;
        const rightPitch = easeAt("pitch-r", hornPitch(active, active.right), 0, 0, rightFollow).x;
        const leftAim = easeAt("yaw-l", hornYaw(active, active.left, state.settings), 0, 0, leftFollow).x;
        const rightAim = easeAt("yaw-r", hornYaw(active, active.right, state.settings), 0, 0, rightFollow).x;
        const leftWorld = drawnCone(active, active.left, state.settings);
        const rightWorld = drawnCone(active, active.right, state.settings);
        const leftEase = easeAt("cone-l", leftWorld.x, leftWorld.y, leftWorld.z, leftFollow);
        const rightEase = easeAt("cone-r", rightWorld.x, rightWorld.y, rightWorld.z, rightFollow);
        const leftAt = { x: leftEase.x - ear.x, y: leftEase.y, z: leftEase.z - ear.z };
        const rightAt = { x: rightEase.x - ear.x, y: rightEase.y, z: rightEase.z - ear.z };
        aimCone(leftCap, leftAt, leftAim, active.left.size, leftPitch);
        aimCone(rightCap, rightAt, rightAim, active.right.size, rightPitch);
        placeKit(leftKit, leftAt, yaw, leftAim, leftPitch, active.left.size);
        placeKit(rightKit, rightAt, yaw, rightAim, rightPitch, active.right.size);
        const avg = ((active.left.y + active.right.y) * 0.5) * EAR_PART_SCALE;
        const backX = -Math.sin(yaw) * 1.85;
        const backZ = -Math.cos(yaw) * 1.85;
        if (showHandles) {
          placeLink(liftRod, 0, ear.y, 0, backX, ear.y + avg, backZ);
          liftBall.position.set(backX, ear.y + avg, backZ);
          liftBall.scale.setScalar(ballRadius((active.left.size + active.right.size) / 2));
        }
        placeLink(leftLink, 0, ear.y, 0, leftCap.position.x, leftCap.position.y, leftCap.position.z);
        placeLink(rightLink, 0, ear.y, 0, rightCap.position.x, rightCap.position.y, rightCap.position.z);
        leftTag.position.set(leftCap.position.x, leftCap.position.y + 0.42, leftCap.position.z);
        rightTag.position.set(rightCap.position.x, rightCap.position.y + 0.42, rightCap.position.z);
        screenSprite(leftTag, 48, 18);
        screenSprite(rightTag, 56, 18);
        const reach = Math.max(
          0.7,
          Math.hypot(leftAt.x, leftAt.z) + 0.34,
          Math.hypot(rightAt.x, rightAt.z) + 0.34,
          active.left.size * 0.9,
          active.right.size * 0.9,
        );
        const halfH = Math.max(0.42, Math.abs(leftAt.y - ear.y), Math.abs(rightAt.y - ear.y), active.left.size * 0.35, active.right.size * 0.35) + 0.28;
        const boxTop = ear.y + halfH;
        const boxBottom = Math.max(0.02, ear.y - halfH);
        const boxH = Math.max(0.2, boxTop - boxBottom);
        const boxY = boxBottom + boxH / 2;
        earBox.position.set(0, boxY, 0);
        earBox.scale.set(reach * 2, boxH, reach * 2);
        turnRing.position.y = boxTop + 0.18;
        const footprint = [
          [-0.5, 0.5],
          [0.5, 0.5],
          [0.5, -0.5],
          [-0.5, -0.5],
        ];
        const edgeSpots = [
          [0, 0.5],
          [0.5, 0],
          [0, -0.5],
          [-0.5, 0],
        ];
        earCorners.forEach((handle, index) => {
          const spot = footprint[index]!;
          handle.position.set(spot[0], 0.5, spot[1]);
          handle.scale.set(1 / (reach * 2), 1 / boxH, 1 / (reach * 2));
        });
        earEdges.forEach((handle, index) => {
          const spot = edgeSpots[index]!;
          handle.position.set(spot[0], 0, spot[1]);
          handle.scale.set(1 / (reach * 2), 1 / boxH, 1 / (reach * 2));
        });
      }
      (halo.material as THREE.MeshBasicMaterial).opacity = showCaps ? 0.28 : 0.18;
      const level = Math.cos(pitchGlide);
      aim.position.set(ear.x, ear.y, ear.z);
      aim.lookAt(ear.x + Math.sin(yaw) * level, ear.y - Math.sin(pitchGlide), ear.z + Math.cos(yaw) * level);
      const spareIds = new Set(ears.filter((item) => item.id !== earId).map((item) => item.id));
      for (const [id, spare] of spares) {
        if (spareIds.has(id)) continue;
        scene.remove(spare.group);
        for (const part of [spare.base, spare.pole, spare.head, spare.grab, spare.left, spare.right]) {
          const index = pickables.indexOf(part);
          if (index >= 0) pickables.splice(index, 1);
        }
        spares.delete(id);
      }
      for (const item of ears) {
        if (item.id === earId) continue;
        let spare = spares.get(item.id);
        if (!spare) {
          const group = new THREE.Group();
          const spareBase = new THREE.Mesh(spareBaseGeo, gold);
          spareBase.rotation.x = Math.PI / 2;
          spareBase.position.y = 0.03;
          spareBase.userData = { kind: "spare-ear", id: item.id };
          const sparePole = new THREE.Mesh(sparePoleGeo, gold);
          sparePole.userData = { kind: "spare-ear", id: item.id };
          const spareHead = new THREE.Mesh(spareHeadGeo, headMat);
          spareHead.userData = { kind: "spare-ear", id: item.id };
          const spareLeft = new THREE.Mesh(discGeo, leftMat.clone());
          spareLeft.userData = { kind: "ear-left", id: item.id };
          const spareRight = new THREE.Mesh(discGeo, rightMat.clone());
          spareRight.userData = { kind: "ear-right", id: item.id };
          spareLeft.raycast = () => undefined;
          spareRight.raycast = () => undefined;
          addMouth(spareLeft);
          addMouth(spareRight);
          const spareLeftRing = new THREE.Mesh(sizeRingGeo, sizeRingMat);
          const spareRightRing = new THREE.Mesh(sizeRingGeo, sizeRingMat);
          spareLeftRing.raycast = () => undefined;
          spareRightRing.raycast = () => undefined;
          spareLeftRing.renderOrder = 6;
          spareRightRing.renderOrder = 6;
          const spareGrab = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 8), pickMat);
          spareGrab.userData = { kind: "spare-ear", id: item.id };
          group.add(spareBase, sparePole, spareHead, spareGrab, spareLeft, spareRight, spareLeftRing, spareRightRing);
          scene.add(group);
          pickables.push(spareBase, sparePole, spareHead, spareGrab);
          spare = {
            group,
            pole: sparePole,
            head: spareHead,
            base: spareBase,
            grab: spareGrab,
            left: spareLeft,
            right: spareRight,
            leftRing: spareLeftRing,
            rightRing: spareRightRing,
          };
          spares.set(item.id, spare);
        }
        const placed = receiverPoint(item, state.settings);
        const hideLeave = !!flight && flight.leaveId === item.id && flight.until > Date.now() && flightU < 0.42;
        spare.group.visible = !hideLeave && sceneFade > 0.02;
        fadeTree(spare.group, sceneFade);
        spare.group.position.set(placed.x, 0, placed.z);
        spare.pole.scale.y = Math.max(0.2, placed.y);
        spare.pole.position.y = placed.y / 2;
        spare.grab.scale.y = Math.max(0.2, placed.y);
        spare.grab.position.y = placed.y / 2;
        spare.head.position.y = placed.y;
        const chosen = state.selection.includes(`e:${item.id}`);
        spare.base.scale.setScalar(chosen ? 1.35 : 1);
        const leftWorld = drawnCone(item, item.left, state.settings);
        const rightWorld = drawnCone(item, item.right, state.settings);
        const leftAt = easeAt(`spare-l-${item.id}`, leftWorld.x, leftWorld.y, leftWorld.z);
        const rightAt = easeAt(`spare-r-${item.id}`, rightWorld.x, rightWorld.y, rightWorld.z);
        const leftPitch = easeAt(`spare-pitch-l-${item.id}`, hornPitch(item, item.left), 0, 0).x;
        const rightPitch = easeAt(`spare-pitch-r-${item.id}`, hornPitch(item, item.right), 0, 0).x;
        aimCone(spare.left, { x: leftAt.x - placed.x, y: leftAt.y, z: leftAt.z - placed.z }, hornYaw(item, item.left, state.settings), item.left.size, leftPitch);
        aimCone(spare.right, { x: rightAt.x - placed.x, y: rightAt.y, z: rightAt.z - placed.z }, hornYaw(item, item.right, state.settings), item.right.size, rightPitch);
        placeSizeRing(spare.leftRing, { x: leftAt.x - placed.x, y: leftAt.y, z: leftAt.z - placed.z }, hornYaw(item, item.left, state.settings), leftPitch, item.left.size);
        placeSizeRing(spare.rightRing, { x: rightAt.x - placed.x, y: rightAt.y, z: rightAt.z - placed.z }, hornYaw(item, item.right, state.settings), rightPitch, item.right.size);
        if (hideLeave || sceneFade <= 0.02) {
          spare.leftRing.visible = false;
          spare.rightRing.visible = false;
        }
      }
      const energy = state.playing ? bathEngine.readEnergy() : 0;
      key.intensity = 1.7 + energy * 1.6;
      roomRoot.visible = sceneFade > 0.02;
      receiver.visible = sceneFade > 0.02;
      aim.visible = sceneFade > 0.02;
      fadeTree(roomRoot, sceneFade);
      fadeTree(receiver, sceneFade);
      fadeTree(aim, sceneFade);
      const headLive = head.material as THREE.MeshStandardMaterial;
      if (!Array.isArray(headLive)) headLive.emissiveIntensity = 0.45 + energy * 1.5;
      earSprite.material.opacity = chrome * sceneFade;
      leftTag.material.opacity = chrome * sceneFade;
      rightTag.material.opacity = chrome * sceneFade;
      syncDomes(chrome > 0.25 && !viewOnlyRef.current);
    }

    function drawWaves() {
      surface.dataset.waves = wavesRef.current ? "open" : "closed";
      if (waveFade < 0.02) {
        waveGroup.visible = false;
        surface.dataset.waveRings = "0";
        surface.dataset.waveBounces = "0";
        surface.dataset.waveHits = "0";
        surface.dataset.waveCrossings = "0";
        surface.dataset.waveBowls = "0";
        return;
      }
      waveGroup.visible = true;
      const state = useBath.getState();
      const spread = roomSpread(state.settings);
      const limits = floorNormLimits(state.settings, state.bowls);
      const sample = sampleWaves({
        bowls: state.bowls.map((bowl) => ({
          id: bowl.id,
          x: bowl.x,
          y: bowl.y,
          frequency: bowl.frequency,
          gain: bowl.gain,
          muted: bowl.muted,
        })),
        ears: state.ears.map((ear) => ({ id: ear.id, x: ear.x, y: ear.y })),
        shape: state.settings.roomShape,
        limits,
        time: performance.now() / 1000,
        domes: state.domes.map((dome) => ({
          id: dome.id,
          x: dome.x,
          y: dome.y,
          size: dome.size,
          reflect: dome.reflect,
          diffuse: dome.diffuse,
          frequency: dome.frequency,
          height: dome.height,
          cover: domeCover(dome, state.settings),
        })),
      });
      const tintOf = (id: string) => {
        const glass = state.bowls.find((item) => item.id === id)?.glass ?? "quartz";
        return GLASS_TINT[glass];
      };
      const mixTint = (a: string, b: string) => {
        const color = new THREE.Color(tintOf(a));
        color.lerp(new THREE.Color(tintOf(b)), 0.5);
        return `#${color.getHexString()}`;
      };
      const place = (nx: number, ny: number, y: number) =>
        new THREE.Vector3((nx - 0.5) * spread.x, y, (ny - 0.5) * spread.z);
      const glassOf = (id: string) => state.bowls.find((item) => item.id === id);
      const centerOf = (id: string) => {
        const bowl = glassOf(id);
        if (!bowl) return new THREE.Vector3(0, 0.4, 0);
        const placed = bowlPoint(bowl, state.settings);
        return new THREE.Vector3(placed.x, placed.lift + placed.wall * 0.45, placed.z);
      };
      const drawn = sample.rings;
      drawn.forEach((ring, index) => {
        const shell = waveShells[index] ?? takeShell();
        const origin = centerOf(ring.bowlId);
        const worldR = Math.max(0.08, ring.radius * (spread.x + spread.z) * 0.5);
        shell.group.visible = true;
        const solo = kioskPhase === "waves";
        if (ring.kind === "dome" && ring.domeId) {
          const dome = state.domes.find((item) => item.id === ring.domeId);
          if (!dome) {
            shell.group.visible = false;
            return;
          }
          const at = domePoint(dome, state.settings);
          shell.group.position.set(at.x, Math.max(0.2, at.y - worldR * 0.42), at.z);
          shell.group.scale.set(worldR, worldR * (0.38 + dome.diffuse * 0.45), worldR);
          const color = new THREE.Color(tintOf(ring.bowlId));
          color.lerp(new THREE.Color(GLASS_TINT[dome.glass]), 0.58);
          shell.material.color.copy(color);
          shell.material.opacity = Math.min(0.88, ring.alpha * (0.7 + dome.reflect * 0.55)) * waveFade;
          return;
        }
        const at = ring.kind === "direct" ? origin : place(ring.x, ring.y, origin.y);
        shell.group.position.copy(at);
        shell.group.scale.setScalar(worldR);
        shell.material.color.set(tintOf(ring.bowlId));
        const strength =
          ring.kind === "bounce"
            ? Math.min(solo ? 0.42 : 0.22, ring.alpha * (solo ? 0.5 : 0.28))
            : Math.min(0.92, (solo ? 0.5 : 0.38) + ring.alpha * 0.45);
        shell.material.opacity = strength * waveFade;
      });
      for (let index = drawn.length; index < waveShells.length; index++) waveShells[index]!.group.visible = false;

      for (const [id, view] of domeViews) {
        const dome = state.domes.find((item) => item.id === id);
        if (!dome) continue;
        const hit = drawn.reduce((best, ring) => (ring.kind === "dome" && ring.domeId === id ? Math.max(best, ring.alpha) : best), 0);
        const mat = view.shell.material as THREE.MeshStandardMaterial;
        const picked = state.focus === "dome" && state.selectedId === id;
        mat.emissiveIntensity = (picked ? 0.22 : 0.06) + hit * 0.85;
      }

      const mouthSparks: { x: number; y: number; z: number; color: string; scale: number; lift: number; world: boolean }[] = [];
      const heard = new Set<string>();
      for (const ear of state.ears) {
        const yaw = facingYaw(ear, state.settings);
        for (const side of ["left", "right"] as const) {
          const part = ear[side];
          const mouth = hornMouth(ear, part, state.settings);
          const mouthAt = new THREE.Vector3(mouth.x, mouth.y, mouth.z);
          for (const ring of drawn) {
            if (ring.alpha < 0.08 || mouthSparks.length > 16) break;
            const origin = centerOf(ring.bowlId);
            const source = ring.kind === "direct" ? origin : place(ring.x, ring.y, origin.y);
            const rad = ring.radius * (spread.x + spread.z) * 0.5;
            if (Math.abs(source.distanceTo(mouthAt) - rad) > 0.16 + part.size * 0.2) continue;
            const caught = coneCatch(source, mouth, yaw, hornPitch(ear, part), part.size, part.gain);
            if (caught.facing < 0.2 || caught.level < 0.05) continue;
            mouthSparks.push({
              x: mouth.x,
              y: mouth.y,
              z: mouth.z,
              color: tintOf(ring.bowlId),
              scale: 0.08 + part.size * 0.07,
              lift: 0,
              world: true,
            });
            heard.add(`${ear.id}:${side}`);
            break;
          }
        }
      }
      leftMat.emissiveIntensity = heard.has(`${state.activeEarId}:left`) ? 1.8 : 0.45;
      rightMat.emissiveIntensity = heard.has(`${state.activeEarId}:right`) ? 1.5 : 0.28;

      const sparks = [
        ...sample.impacts.map((hit) => ({ x: hit.x, y: hit.y, z: 0, color: tintOf(hit.bowlId), scale: 0.16, lift: centerOf(hit.bowlId).y, world: false })),
        ...sample.crossings.map((hit) => ({
          x: hit.x,
          y: hit.y,
          z: 0,
          color: mixTint(hit.aId, hit.bId),
          scale: 0.12,
          lift: (centerOf(hit.aId).y + centerOf(hit.bId).y) * 0.5,
          world: false,
        })),
        ...sample.bowlHits.map((hit) => ({ x: hit.x, y: hit.y, z: 0, color: tintOf(hit.fromId), scale: 0.28, lift: centerOf(hit.toId).y, world: false })),
        ...mouthSparks,
      ];
      sparks.forEach((spark, index) => {
        const mesh = waveSparks[index] ?? takeSpark(spark.color);
        mesh.visible = true;
        mesh.position.copy(spark.world ? new THREE.Vector3(spark.x, spark.y, spark.z) : place(spark.x, spark.y, spark.lift));
        mesh.scale.setScalar(spark.scale);
        (mesh.material as THREE.MeshBasicMaterial).color.set(spark.color);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * waveFade;
      });
      hideRest(waveSparks, sparks.length);

      const direct = sample.rings.filter((ring) => ring.kind === "direct");
      const bounces = sample.rings.filter((ring) => ring.kind === "bounce");
      const domeReturns = sample.rings.filter((ring) => ring.kind === "dome");
      surface.dataset.waveRings = String(direct.length);
      surface.dataset.waveBounces = String(bounces.length);
      surface.dataset.waveDomes = String(domeReturns.length);
      surface.dataset.waveHits = String(sample.hits.length);
      surface.dataset.waveCrossings = String(sample.crossings.length);
      surface.dataset.waveBowls = String(sample.bowlHits.length);
      surface.dataset.waveWalls = String(sample.polygon.length);
    }

    const spriteWorld = new THREE.Vector3();
    function screenSprite(sprite: THREE.Sprite, pixelsWide: number, pixelsTall: number) {
      sprite.getWorldPosition(spriteWorld);
      const dist = Math.max(0.4, camera.position.distanceTo(spriteWorld));
      const vFov = (camera.fov * Math.PI) / 180;
      const worldPerPx = (2 * Math.tan(vFov / 2) * dist) / Math.max(1, renderer.domElement.clientHeight);
      sprite.scale.set(pixelsWide * worldPerPx, pixelsTall * worldPerPx, 1);
    }

    const spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      if (viewNudge.delta !== 0) {
        offset.copy(camera.position).sub(controls.target);
        spherical.setFromVector3(offset);
        spherical.theta += viewNudge.delta;
        viewNudge.delta = 0;
        offset.setFromSpherical(spherical);
        camera.position.copy(controls.target).add(offset);
      }
      controls.autoRotate = idleSpin && !drag;
      controls.autoRotateSpeed = 0.55;
      readChrome();
      controls.update();
      syncScene();
      drawWaves();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      unbindScene();
      projectFn = () => ({ bowls: [], ears: [], domes: [], ear: { x: 0, y: 0 }, listener: bathEngine.listenerNow() });
      observer.disconnect();
      window.removeEventListener("lumen-stage-quality", onQuality);
      canvas.removeEventListener("pointerdown", onDown, true);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      controls.dispose();
      bowlGeo.dispose();
      wellGeo.dispose();
      pickGeo.dispose();
      pickDiscMat.dispose();
      rimGeo.dispose();
      ringGeo.dispose();
      shadowGeo.dispose();
      stemGeo.dispose();
      collarGeo.dispose();
      armGeo.dispose();
      stemGrabGeo.dispose();
      axisMat.dispose();
      disposeRoom(roomGroup);
      wallMat.dispose();
      floorMat.dispose();
      courtMat.dispose();
      caveMat.dispose();
      domeMat.dispose();
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
      plinthMat.dispose();
      ringMat.dispose();
      linkGeo.dispose();
      discGeo.dispose();
      edgeGeo.dispose();
      cornerGeo.dispose();
      leftMat.dispose();
      rightMat.dispose();
      (earBoxEdges.material as THREE.Material).dispose();
      earBoxEdges.geometry.dispose();
      leftTag.material.map?.dispose();
      leftTag.material.dispose();
      rightTag.material.map?.dispose();
      rightTag.material.dispose();
      turnRing.geometry.dispose();
      shaft.geometry.dispose();
      tip.geometry.dispose();
      ballGeo.dispose();
      rodGeo.dispose();
      spinGeo.dispose();
      sizeRingGeo.dispose();
      sizeRingMat.dispose();
      redMat.dispose();
      domeGeo.dispose();
      domeHandleGeo.dispose();
      domeTorusGeo.dispose();
      domeShadowGeo.dispose();
      for (const view of domeViews.values()) {
        (view.shell.material as THREE.Material).dispose();
        (view.torus.material as THREE.Material).dispose();
        (view.shadow.material as THREE.Material).dispose();
        view.sprite.material.map?.dispose();
        view.sprite.material.dispose();
      }
      waveRingGeo.dispose();
      waveSparkGeo.dispose();
      for (const material of waveMats) material.dispose();
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
  const ctx = canvas.getContext("2d", { alpha: true });
  if (ctx) {
    ctx.clearRect(0, 0, 256, 128);
    ctx.font = "600 64px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.min(240, ctx.measureText(text).width + 36);
    ctx.fillStyle = "rgba(8, 16, 22, 0.82)";
    ctx.beginPath();
    ctx.roundRect(128 - width / 2, 34, width, 60, 30);
    ctx.fill();
    ctx.fillStyle = "#f4ecd6";
    ctx.fillText(text, 128, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = false;
  return texture;
}

function makeSprite(text: string): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: noteTexture(text),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.64, 0.3, 1);
  sprite.renderOrder = 6;
  sprite.raycast = () => undefined;
  return sprite;
}
