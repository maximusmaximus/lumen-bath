import * as THREE from "three";
import { getRoom } from "@/lib/audio/rooms";
import type { RoomShapeId } from "@/lib/audio/types";

export type RoomMaterials = {
  wall: THREE.Material;
  floor: THREE.Material;
  court: THREE.Material;
  cave: THREE.Material;
  dome: THREE.Material;
  ring: THREE.Material;
  plinth: THREE.Material;
};

const SLAB = 0.16;
/** Walls and the plinth sit clear of the floor top so the seam never z-fights. */
const FLOOR_GAP = 0.045;
const PLINTH_H = 0.11;

function addRings(group: THREE.Group, ring: THREE.Material) {
  for (const radius of [0.32, 0.56, 0.78]) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 72), ring);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.02;
    group.add(mesh);
  }
}

function addDiscSlab(group: THREE.Group, radius: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.06, SLAB, 72), material);
  mesh.position.y = -SLAB / 2;
  group.add(mesh);
}

function addBoxSlab(group: THREE.Group, halfX: number, halfZ: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2 + 0.1, SLAB, halfZ * 2 + 0.1), material);
  mesh.position.y = -SLAB / 2;
  group.add(mesh);
}

function addShapeSlab(group: THREE.Group, points: [number, number][], material: THREE.Material) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -SLAB;
  group.add(mesh);
}

function addRingPlinth(group: THREE.Group, inner: number, outer: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: PLINTH_H, bevelEnabled: false }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = FLOOR_GAP;
  group.add(mesh);
}

function addBoxWalls(
  group: THREE.Group,
  halfX: number,
  halfZ: number,
  height: number,
  material: THREE.Material,
  openFront: boolean,
) {
  const thick = 0.05;
  const y0 = FLOOR_GAP + PLINTH_H + 0.03;
  const front = openFront ? Math.min(0.42, height) : height;
  const specs: [number, number, number, number, number, number][] = [
    [halfX * 2, height, thick, 0, y0 + height / 2, -halfZ],
    [halfX * 2, front, thick, 0, y0 + front / 2, halfZ],
    [thick, height, halfZ * 2, -halfX, y0 + height / 2, 0],
    [thick, height, halfZ * 2, halfX, y0 + height / 2, 0],
  ];
  for (const [w, h, d, x, y, z] of specs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
}

function addBoxPlinth(group: THREE.Group, halfX: number, halfZ: number, material: THREE.Material) {
  const y = FLOOR_GAP + PLINTH_H / 2;
  const t = 0.08;
  const specs: [number, number, number, number, number, number][] = [
    [halfX * 2 - t, PLINTH_H, t, 0, y, -halfZ],
    [halfX * 2 - t, PLINTH_H, t, 0, y, halfZ],
    [t, PLINTH_H, halfZ * 2 + t, -halfX, y, 0],
    [t, PLINTH_H, halfZ * 2 + t, halfX, y, 0],
  ];
  for (const [w, h, d, x, yPos, z] of specs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, yPos, z);
    group.add(mesh);
  }
}

function addEdgeWalls(group: THREE.Group, points: [number, number][], height: number, material: THREE.Material) {
  const y0 = FLOOR_GAP + PLINTH_H + 0.03;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0p] = points[i]!;
    const [x1, y1p] = points[(i + 1) % points.length]!;
    const dx = x1 - x0;
    const dy = y1p - y0p;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.05), material);
    wall.position.set((x0 + x1) / 2, y0 + height / 2, -((y0p + y1p) / 2));
    wall.rotation.y = Math.atan2(dy, dx);
    group.add(wall);
  }
}

function addEdgePlinth(group: THREE.Group, points: [number, number][], material: THREE.Material) {
  const y = FLOOR_GAP + PLINTH_H / 2;
  const t = 0.08;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0p] = points[i]!;
    const [x1, y1p] = points[(i + 1) % points.length]!;
    const dx = x1 - x0;
    const dy = y1p - y0p;
    const len = Math.hypot(dx, dy);
    if (len < t) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.02, len - t), PLINTH_H, t), material);
    wall.position.set((x0 + x1) / 2, y, -((y0p + y1p) / 2));
    wall.rotation.y = Math.atan2(dy, dx);
    group.add(wall);
  }
}

function octagonPoints(radius: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 - Math.PI / 8;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

function apsePoints(): [number, number][] {
  const points: [number, number][] = [
    [-0.72, -0.98],
    [0.72, -0.98],
    [0.72, 0.08],
  ];
  for (let i = 0; i <= 14; i++) {
    const angle = (Math.PI * i) / 14;
    points.push([Math.cos(angle) * 0.72, 0.08 + Math.sin(angle) * 0.72]);
  }
  return points;
}

function fanPoints(): [number, number][] {
  return [
    [-0.55, -1],
    [0.55, -1],
    [1, 1],
    [-1, 1],
  ];
}

function outset(points: [number, number][], amount: number): [number, number][] {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  const winding = area >= 0 ? 1 : -1;
  return points.map((curr, index) => {
    const prev = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    let dx1 = curr[0] - prev[0];
    let dy1 = curr[1] - prev[1];
    let dx2 = next[0] - curr[0];
    let dy2 = next[1] - curr[1];
    const l1 = Math.hypot(dx1, dy1) || 1;
    const l2 = Math.hypot(dx2, dy2) || 1;
    dx1 /= l1;
    dy1 /= l1;
    dx2 /= l2;
    dy2 /= l2;
    const n1x = dy1 * winding;
    const n1y = -dx1 * winding;
    const n2x = dy2 * winding;
    const n2y = -dx2 * winding;
    let nx = n1x + n2x;
    let ny = n1y + n2y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const denom = n1x * nx + n1y * ny;
    const miter = Math.abs(denom) < 0.25 ? amount : amount / denom;
    const clamped = Math.max(-0.14, Math.min(0.14, miter));
    return [curr[0] + nx * clamped, curr[1] + ny * clamped] as [number, number];
  });
}

function addRoundRoom(group: THREE.Group, radius: number, height: number, floor: THREE.Material, wall: THREE.Material, plinth: THREE.Material) {
  addDiscSlab(group, radius + 0.06, floor);
  addRingPlinth(group, radius - 0.06, radius + 0.04, plinth);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.02, radius - 0.02, height, 64, 1, true), wall);
  shell.position.y = FLOOR_GAP + PLINTH_H + 0.04 + height / 2;
  group.add(shell);
}

export function buildRoom(id: RoomShapeId, mats: RoomMaterials): THREE.Group {
  const room = getRoom(id);
  const group = new THREE.Group();
  const height = room.wall;
  if (id === "rotunda" || id === "ellipse") {
    addRoundRoom(group, 1, Math.min(height, id === "ellipse" ? 1.35 : 1.2), mats.floor, mats.wall, mats.plinth);
  } else if (id === "dome") {
    addDiscSlab(group, 1.05, mats.floor);
    addRingPlinth(group, 0.9, 1.04, mats.plinth);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI / 2), mats.dome);
    dome.scale.set(0.96, 1, 0.96);
    dome.position.y = FLOOR_GAP + PLINTH_H + 0.01;
    group.add(dome);
  } else if (id === "cave") {
    addDiscSlab(group, 0.84, mats.floor);
    addRingPlinth(group, 0.72, 0.96, mats.plinth);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        const n = Math.abs(Math.sin(i * 12.9898) * 43758.5453);
        const wobble = 0.86 + (n - Math.floor(n)) * 0.2;
        const y = Math.max(FLOOR_GAP + PLINTH_H + 0.04, Math.abs(pos.getY(i)) * wobble * 0.9);
        pos.setXYZ(i, pos.getX(i) * wobble, y, pos.getZ(i) * wobble);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    const shell = new THREE.Mesh(geo, mats.cave);
    shell.position.y = FLOOR_GAP + PLINTH_H;
    group.add(shell);
  } else if (id === "fan") {
    const points = fanPoints();
    addShapeSlab(group, outset(points, 0.05), mats.floor);
    addEdgePlinth(group, points, mats.plinth);
    addEdgeWalls(group, points, height, mats.wall);
  } else if (id === "octagon") {
    const points = octagonPoints(0.96);
    addShapeSlab(group, outset(points, 0.05), mats.floor);
    addEdgePlinth(group, points, mats.plinth);
    addEdgeWalls(group, points, height, mats.wall);
  } else if (id === "apse") {
    const points = apsePoints();
    addShapeSlab(group, outset(points, 0.04), mats.floor);
    addEdgePlinth(group, points, mats.plinth);
    addEdgeWalls(group, points, height, mats.wall);
  } else if (id === "court") {
    addBoxSlab(group, 1, 1, mats.court);
    addBoxPlinth(group, 1, 1, mats.plinth);
    addBoxWalls(group, 1, 1, height, mats.wall, true);
  } else {
    addBoxSlab(group, 1, 1, mats.floor);
    addBoxPlinth(group, 1, 1, mats.plinth);
    addBoxWalls(group, 1, 1, height, mats.wall, true);
  }
  addRings(group, mats.ring);
  return group;
}

export function disposeRoom(group: THREE.Group) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
