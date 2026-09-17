import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { WorldConfig } from "./worlds";

// Phase 2: the scanned room becomes a physics playground.
// Rapier owns where props are; Three.js only draws them. The room's floor and its measured solid
// cells become fixed colliders, one per cell, so a blast can take a wall out of the physics too.
export interface Sandbox {
  update: (dt: number) => void;
  spawn: () => void;
  grab: () => void;
  release: () => void;
  wheel: (deltaY: number) => void;
  toggleFreeze: () => void;
  carve: (at: THREE.Vector3, radius: number) => void;
  hitsProp: (at: THREE.Vector3) => boolean;
  clear: () => void;
  dispose: () => void;
}

interface Prop {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  reach: number; // rough radius, for blasts and shots
  frozen: boolean;
}

const KINDS = ["crate", "ball", "plank", "barrel"] as const;
const COLORS = [0xf59e0b, 0x60a5fa, 0xc084fc, 0x34d399, 0xf87171];
const MAX_PROPS = 60;

export async function createSandbox(
  scene: THREE.Scene,
  camera: THREE.Camera,
  cfg: WorldConfig,
  rows: string[][],
  unit: number,
): Promise<Sandbox> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81 * unit, z: 0 });
  world.timestep = 1 / 60;

  // The room, as physics.
  const m = cfg.solid;
  const halfX = (m?.halfX ?? 30) + 2;
  const halfZ = (m?.halfZ ?? 30) + 2;
  world.createCollider(RAPIER.ColliderDesc.cuboid(halfX, 0.5, halfZ).setTranslation(0, -0.5, 0).setFriction(0.9));
  const wallHeight = 1.3 * Math.max(cfg.eyeY, 1.6);
  const walls = new Map<string, RAPIER.Collider>();
  if (m) {
    rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell !== "#") return;
        const desc = RAPIER.ColliderDesc.cuboid(m.cell / 2, wallHeight / 2, m.cell / 2).setTranslation(
          -m.halfX + (c + 0.5) * m.cell,
          wallHeight / 2,
          -m.halfZ + (r + 0.5) * m.cell,
        );
        walls.set(`${r},${c}`, world.createCollider(desc));
      }),
    );
  }

  // The player, as physics: a capsule that follows the camera, so walking into props shoves them.
  const playerBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const eye = Math.max(cfg.eyeY, 1.6);
  world.createCollider(RAPIER.ColliderDesc.capsule(eye / 2 - 0.3 * unit, 0.3 * unit), playerBody);

  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 6, 3);
  lights.add(sun);
  scene.add(lights);

  const props: Prop[] = [];
  let spawned = 0;
  let hovered: Prop | null = null;
  let held: { prop: Prop; distance: number; last: THREE.Vector3; velocity: THREE.Vector3 } | null = null;

  const beam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xc084fc }),
  );
  beam.frustumCulled = false;
  beam.visible = false;
  scene.add(beam);

  const raycaster = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);
  const dir = new THREE.Vector3();
  const tint = (p: Prop) => {
    const mat = p.mesh.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(p.frozen ? 0x1d4ed8 : p === held?.prop ? 0x7c3aed : p === hovered ? 0x333333 : 0x000000);
  };

  const remove = (p: Prop) => {
    world.removeRigidBody(p.body);
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
    props.splice(props.indexOf(p), 1);
    if (hovered === p) hovered = null;
    if (held?.prop === p) held = null;
  };

  const spawn = () => {
    const kind = KINDS[spawned % KINDS.length];
    const color = COLORS[spawned % COLORS.length];
    spawned++;
    let geometry: THREE.BufferGeometry;
    let shape: RAPIER.ColliderDesc;
    let reach: number;
    if (kind === "ball") {
      reach = 0.22 * unit;
      geometry = new THREE.SphereGeometry(reach, 24, 24);
      shape = RAPIER.ColliderDesc.ball(reach).setRestitution(0.65);
    } else if (kind === "plank") {
      const [x, y, z] = [0.7 * unit, 0.05 * unit, 0.18 * unit];
      reach = x;
      geometry = new THREE.BoxGeometry(2 * x, 2 * y, 2 * z);
      shape = RAPIER.ColliderDesc.cuboid(x, y, z);
    } else if (kind === "barrel") {
      const [h, r] = [0.35 * unit, 0.22 * unit];
      reach = h;
      geometry = new THREE.CylinderGeometry(r, r, 2 * h, 20);
      shape = RAPIER.ColliderDesc.cylinder(h, r);
    } else {
      reach = 0.25 * unit;
      geometry = new THREE.BoxGeometry(2 * reach, 2 * reach, 2 * reach);
      shape = RAPIER.ColliderDesc.cuboid(reach, reach, reach);
    }
    camera.getWorldDirection(dir);
    const at = camera.position.clone().addScaledVector(dir, 1.4 * unit);
    at.y = Math.max(at.y, reach + 0.05);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setCcdEnabled(true));
    world.createCollider(shape.setFriction(0.8).setDensity(1 / unit ** 3), body);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
    mesh.position.copy(at);
    scene.add(mesh);
    props.push({ mesh, body, reach, frozen: false });
    if (props.length > MAX_PROPS) remove(props[0]);
  };

  const setType = (p: Prop, type: RAPIER.RigidBodyType) => p.body.setBodyType(type, true);

  const release = () => {
    if (!held) return;
    const { prop, velocity } = held;
    held = null;
    beam.visible = false;
    setType(prop, RAPIER.RigidBodyType.Dynamic);
    velocity.clampLength(0, 22 * unit);
    prop.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    tint(prop);
  };

  let acc = 0;
  return {
    spawn,
    release,
    grab: () => {
      if (!hovered || held) return;
      const prop = hovered;
      prop.frozen = false;
      setType(prop, RAPIER.RigidBodyType.KinematicPositionBased);
      held = { prop, distance: camera.position.distanceTo(prop.mesh.position), last: prop.mesh.position.clone(), velocity: new THREE.Vector3() };
      tint(prop);
    },
    wheel: (deltaY) => {
      if (held) held.distance = THREE.MathUtils.clamp(held.distance - deltaY * 0.004 * unit, 0.9 * unit, 9 * unit);
    },
    toggleFreeze: () => {
      const prop = held?.prop ?? hovered;
      if (!prop) return;
      if (held) {
        held = null;
        beam.visible = false;
      }
      prop.frozen = !prop.frozen;
      setType(prop, prop.frozen ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic);
      tint(prop);
    },
    carve: (at, radius) => {
      if (m) {
        const span = Math.ceil(radius / m.cell);
        const r0 = Math.floor((at.z + m.halfZ) / m.cell);
        const c0 = Math.floor((at.x + m.halfX) / m.cell);
        for (let r = r0 - span; r <= r0 + span; r++) {
          for (let c = c0 - span; c <= c0 + span; c++) {
            const wall = walls.get(`${r},${c}`);
            if (wall && rows[r]?.[c] !== "#") {
              world.removeCollider(wall, true);
              walls.delete(`${r},${c}`);
            }
          }
        }
      }
      for (const p of props) {
        if (p.frozen || p === held?.prop) continue;
        const push = p.mesh.position.clone().sub(at);
        const d = push.length();
        if (d > 4 * radius) continue;
        push.normalize().multiplyScalar((p.body.mass() * 14 * unit) / Math.max(0.5, d / radius));
        p.body.applyImpulse({ x: push.x, y: push.y + p.body.mass() * 2 * unit, z: push.z }, true);
      }
    },
    hitsProp: (at) => props.some((p) => p.mesh.position.distanceTo(at) < p.reach + 0.05 * unit),
    clear: () => {
      while (props.length) remove(props[0]);
    },
    update: (dt) => {
      const cam = camera.position;
      playerBody.setNextKinematicTranslation({ x: cam.x, y: Math.max(eye / 2, cam.y - eye / 2), z: cam.z });

      camera.getWorldDirection(dir);
      if (held) {
        const target = cam.clone().addScaledVector(dir, held.distance);
        target.y = Math.max(target.y, held.prop.reach);
        held.prop.body.setNextKinematicTranslation({ x: target.x, y: target.y, z: target.z });
        if (dt > 0) held.velocity.lerp(target.clone().sub(held.last).divideScalar(dt), 0.35);
        held.last.copy(target);
        const muzzle = cam.clone().addScaledVector(dir, 0.7 * unit);
        muzzle.y -= 0.18 * unit;
        beam.geometry.setFromPoints([muzzle, held.prop.mesh.position]);
        beam.visible = true;
      }

      acc = Math.min(acc + dt, 0.1);
      while (acc >= world.timestep) {
        world.step();
        acc -= world.timestep;
      }
      for (const p of props) {
        const t = p.body.translation();
        const q = p.body.rotation();
        p.mesh.position.set(t.x, t.y, t.z);
        p.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        p.mesh.updateMatrixWorld(); // the hover ray below must see this frame's pose, not the last rendered one
        if (t.y < -20) p.body.setTranslation({ x: cam.x, y: cam.y + unit, z: cam.z }, true); // fell out of the world
      }

      raycaster.setFromCamera(centre, camera as THREE.PerspectiveCamera);
      const hit = held ? null : raycaster.intersectObjects(props.map((p) => p.mesh), false)[0];
      const next = hit ? (props.find((p) => p.mesh === hit.object) ?? null) : null;
      if (next !== hovered) {
        const before = hovered;
        hovered = next;
        if (before) tint(before);
        if (hovered) tint(hovered);
      }
    },
    dispose: () => {
      while (props.length) remove(props[0]);
      scene.remove(beam, lights);
      world.free();
    },
  };
}
