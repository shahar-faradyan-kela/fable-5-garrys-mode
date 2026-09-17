import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { SparkRenderer, SplatEdit, SplatEditRgbaBlendMode, SplatEditSdf, SplatEditSdfType, SplatMesh } from "@sparkjsdev/spark";
import { createSandbox, type Sandbox } from "./sandbox";
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

  let mesh: SplatMesh | null = null;
  if (cfg.photos) {
    buildPhotoRoom(scene, cfg.photos, events);
  } else {
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  mesh = new SplatMesh({
    url,
    onProgress: (e: ProgressEvent) => {
      if (e.lengthComputable) events.onProgress(e.loaded / e.total);
    },
  });
  mesh.quaternion.set(...cfg.quaternion);
  mesh.position.set(...cfg.offset);
  scene.add(mesh);
  mesh.initialized.then(() => events.onReady()).catch((err: unknown) => events.onError(String(err)));
  }

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
  const BODY = cfg.body;
  const rows = cfg.solid ? cfg.solid.rows.map((r) => r.split("")) : []; // mutable: shots open it up
  const solidAt = (x: number, z: number) => {
    const m = cfg.solid;
    if (!m) return false;
    const row = rows[Math.floor((z + m.halfZ) / m.cell)];
    return row !== undefined && row[Math.floor((x + m.halfX) / m.cell)] === "#";
  };
  const blocked = (x: number, z: number) =>
    solidAt(x - BODY, z) || solidAt(x + BODY, z) || solidAt(x, z - BODY) || solidAt(x, z + BODY);

  // The gun. A shot that meets the floor or anything solid erases the splats around the impact
  // and opens the solid map there, so what you destroy you can walk through.
  scene.add(camera);
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.5), new THREE.MeshBasicMaterial({ color: 0x1b1d24 }));
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.5), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
  sight.position.y = 0.045;
  gun.add(barrel, sight);
  gun.position.set(0.22, -0.2, -0.45);
  camera.add(gun);

  const unit = Math.max(1, cfg.eyeY / 1.6); // worlds are not all metric
  const BLAST = 0.5 * unit;
  const MAX_HOLES = 24;
  const edit = new SplatEdit({ rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY, softEdge: 0.1 * unit });
  scene.add(edit);
  const holes: SplatEditSdf[] = [];
  const shots: { mesh: THREE.Mesh; dir: THREE.Vector3; flown: number }[] = [];
  const blasts: THREE.Mesh[] = [];
  const shotGeo = new THREE.SphereGeometry(0.05 * unit, 12, 12);
  const shotMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const blastGeo = new THREE.SphereGeometry(BLAST, 20, 20);
  let kick = 0;

  const fire = () => {
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const mesh = new THREE.Mesh(shotGeo, shotMat);
    mesh.position.copy(camera.position).addScaledVector(dir, 0.6 * unit);
    scene.add(mesh);
    shots.push({ mesh, dir, flown: 0 });
    kick = 1;
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && controls.isLocked) fire();
  };
  document.addEventListener("mousedown", onMouseDown);

  const blastAt = (at: THREE.Vector3) => {
    const hole =
      holes.length < MAX_HOLES
        ? new SplatEditSdf({ type: SplatEditSdfType.SPHERE, radius: BLAST, opacity: 0 })
        : holes.shift()!; // out of holes: the oldest one heals
    hole.position.copy(at);
    if (!hole.parent) edit.add(hole);
    holes.push(hole);
    const m = cfg.solid;
    if (m) {
      for (let dz = -BLAST; dz <= BLAST; dz += m.cell / 2) {
        for (let dx = -BLAST; dx <= BLAST; dx += m.cell / 2) {
          const row = rows[Math.floor((at.z + dz + m.halfZ) / m.cell)];
          const c = Math.floor((at.x + dx + m.halfX) / m.cell);
          if (row && row[c] === "#" && Math.hypot(dx, dz) <= BLAST) row[c] = " ";
        }
      }
    }
    const flash = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.9 }));
    flash.position.copy(at);
    scene.add(flash);
    blasts.push(flash);
    sandbox?.carve(at, BLAST);
  };

  // Phase 2, the sandbox. If the physics engine fails to load, the world stays exactly as walkable as before.
  let sandbox: Sandbox | null = null;
  let disposed = false;
  createSandbox(scene, camera, cfg, rows, unit)
    .then((s) => (disposed ? s.dispose() : (sandbox = s)))
    .catch((err: unknown) => console.warn("sandbox unavailable:", err));
  const onGrab = (e: MouseEvent) => {
    if (e.button === 2 && controls.isLocked) sandbox?.grab();
  };
  const onRelease = (e: MouseEvent) => {
    if (e.button === 2) sandbox?.release();
  };
  const onWheel = (e: WheelEvent) => sandbox?.wheel(e.deltaY);
  const onMenu = (e: Event) => e.preventDefault();
  document.addEventListener("mousedown", onGrab);
  document.addEventListener("mouseup", onRelease);
  document.addEventListener("wheel", onWheel, { passive: true });
  document.addEventListener("contextmenu", onMenu);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyB" && controls.isLocked) sandbox?.spawn();
    if (e.code === "KeyR") sandbox?.toggleFreeze();
    if (e.code === "KeyC") sandbox?.clear();
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
      const out = Math.hypot(p.x, p.z);
      if (cfg.radius && out > cfg.radius) {
        p.x *= cfg.radius / out;
        p.z *= cfg.radius / out;
      }
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      let hit = false;
      for (let sub = 0; sub < 4 && !hit; sub++) {
        const step = (30 * unit * dt) / 4;
        s.mesh.position.addScaledVector(s.dir, step);
        s.flown += step;
        const q = s.mesh.position;
        hit = q.y <= 0.05 || (q.y < cfg.eyeY * 1.3 && solidAt(q.x, q.z)) || s.flown > 14 * unit || (sandbox?.hitsProp(q) ?? false);
      }
      if (hit) {
        blastAt(s.mesh.position.clone());
        scene.remove(s.mesh);
        shots.splice(i, 1);
      }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      const mat = b.material as THREE.MeshBasicMaterial;
      b.scale.multiplyScalar(1 + 5 * dt);
      mat.opacity -= 3.5 * dt;
      if (mat.opacity <= 0) {
        scene.remove(b);
        mat.dispose();
        blasts.splice(i, 1);
      }
    }
    sandbox?.update(dt);
    kick = Math.max(0, kick - 6 * dt);
    gun.position.z = -0.45 + 0.08 * kick;
    gun.rotation.x = 0.15 * kick;

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
      disposed = true;
      sandbox?.dispose();
      document.removeEventListener("mousedown", onGrab);
      document.removeEventListener("mouseup", onRelease);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      controls.unlock();
      controls.dispose();
      mesh?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// A room made of photos: each photo is a wall panel, the panels form a ring, the player stands inside.
function buildPhotoRoom(scene: THREE.Scene, photos: string[], events: WorldEvents) {
  const n = photos.length;
  const width = 7;
  const height = (width * 9) / 16;
  const ring = width / (2 * Math.tan(Math.PI / n)); // centre-to-wall distance that closes the ring

  const floor = new THREE.Mesh(new THREE.CircleGeometry(ring + 1, 64), new THREE.MeshBasicMaterial({ color: 0xd9ceb9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceiling = new THREE.Mesh(new THREE.CircleGeometry(ring + 1, 64), new THREE.MeshBasicMaterial({ color: 0x2b2723 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  scene.add(ceiling);

  const manager = new THREE.LoadingManager(
    () => events.onReady(),
    (_url, loaded, total) => events.onProgress(loaded / total),
    (failed) => events.onError(`could not load ${failed}`),
  );
  const loader = new THREE.TextureLoader(manager);
  photos.forEach((src, i) => {
    const angle = (i * 2 * Math.PI) / n;
    const texture = loader.load(src);
    texture.colorSpace = THREE.SRGBColorSpace;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
    wall.position.set(ring * Math.sin(angle), height / 2, -ring * Math.cos(angle));
    wall.rotation.y = -angle; // face the centre
    scene.add(wall);
  });
}
