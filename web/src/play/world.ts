import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { saveTuning, type WorldConfig } from "./worlds";

export interface WorldEvents {
  onProgress: (fraction: number) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onLock: (locked: boolean) => void;
  onPose: (pose: { x: number; y: number; z: number; yaw: number; fly: boolean; eyeY: number }) => void;
}

export interface World {
  enter: () => void;
  dispose: () => void;
}

const GRAVITY = 18;
const JUMP = 5;

export function createWorld(host: HTMLElement, url: string, cfg: WorldConfig, events: WorldEvents): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  const camera = new THREE.PerspectiveCamera(70, host.clientWidth / host.clientHeight, 0.05, 500);
  camera.position.set(cfg.spawn[0], cfg.eyeY + cfg.dropFrom, cfg.spawn[2]);
  camera.rotation.set(0, cfg.yaw, 0, "YXZ");

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(host.clientWidth, host.clientHeight);
  host.appendChild(renderer.domElement);

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const mesh = new SplatMesh({
    url,
    onProgress: (e: ProgressEvent) => {
      if (e.lengthComputable) events.onProgress(e.loaded / e.total);
    },
  });
  mesh.quaternion.set(...cfg.quaternion);
  mesh.position.set(...cfg.offset);
  scene.add(mesh);
  mesh.initialized.then(() => events.onReady()).catch((err: unknown) => events.onError(String(err)));

  const controls = new PointerLockControls(camera, renderer.domElement);
  controls.addEventListener("lock", () => events.onLock(true));
  controls.addEventListener("unlock", () => events.onLock(false));

  const keys = new Set<string>();
  let fly = false;
  let entered = false; // the fall starts on the first pointer lock
  let vy = 0;
  let grounded = false;
  const vel = new THREE.Vector2(); // x = strafe, y = forward
  let eyeY = cfg.eyeY;

  // Walls and furniture: a cell of the measured map is solid, and the player has a body radius.
  const BODY = 0.3;
  const solidAt = (x: number, z: number) => {
    const m = cfg.solid;
    if (!m) return false;
    const row = m.rows[Math.floor((z + m.halfZ) / m.cell)];
    return row !== undefined && row[Math.floor((x + m.halfX) / m.cell)] === "#";
  };
  const blocked = (x: number, z: number) =>
    solidAt(x - BODY, z) || solidAt(x + BODY, z) || solidAt(x, z - BODY) || solidAt(x, z + BODY);

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === "KeyF") fly = !fly;
    if (e.code === "BracketLeft" || e.code === "BracketRight") {
      eyeY += e.code === "BracketRight" ? 0.1 : -0.1;
      saveTuning(url, { eyeY });
    }
    if (e.code === "Space" && grounded && !fly) {
      vy = JUMP;
      grounded = false;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const onResize = () => {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  };
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();
  const held = (...codes: string[]) => codes.some((c) => keys.has(c));

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (controls.isLocked) {
      const speed = cfg.speed * (held("ShiftLeft", "ShiftRight") ? 2 : 1) * (fly ? 1.5 : 1);
      const wantX = (held("KeyD", "ArrowRight") ? 1 : 0) - (held("KeyA", "ArrowLeft") ? 1 : 0);
      const wantZ = (held("KeyW", "ArrowUp") ? 1 : 0) - (held("KeyS", "ArrowDown") ? 1 : 0);
      const len = Math.hypot(wantX, wantZ) || 1;
      const ease = 1 - Math.exp(-12 * dt); // smooth start and stop
      vel.x += ((wantX / len) * speed - vel.x) * ease;
      vel.y += ((wantZ / len) * speed - vel.y) * ease;
      const from = camera.position.clone();
      controls.moveRight(vel.x * dt);
      controls.moveForward(vel.y * dt);
      if (!fly && !blocked(from.x, from.z)) {
        // Slide along whatever is solid: take each axis of the step only if it stays clear.
        const to = camera.position.clone();
        camera.position.copy(from);
        if (!blocked(to.x, from.z)) camera.position.x = to.x;
        if (!blocked(camera.position.x, to.z)) camera.position.z = to.z;
      }
    }

    const p = camera.position;
    if (fly) {
      if (held("KeyE")) p.y += cfg.speed * dt;
      if (held("KeyQ")) p.y -= cfg.speed * dt;
      vy = 0;
    } else if (entered) {
      // The floor: gravity pulls the eyes down to eyeY and no further.
      vy -= GRAVITY * dt;
      p.y += vy * dt;
      if (p.y <= eyeY) {
        p.y = eyeY;
        vy = 0;
        grounded = true;
      }
      // The walls: the room's footprint.
      p.x = THREE.MathUtils.clamp(p.x, cfg.bounds.minX, cfg.bounds.maxX);
      p.z = THREE.MathUtils.clamp(p.z, cfg.bounds.minZ, cfg.bounds.maxZ);
    }

    events.onPose({ x: p.x, y: p.y, z: p.z, yaw: camera.rotation.y, fly, eyeY });
    renderer.render(scene, camera);
  });

  return {
    enter: () => {
      entered = true;
      controls.lock();
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      controls.unlock();
      controls.dispose();
      mesh.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
