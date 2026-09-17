import type { Scene } from "../contract";
import { ROOM_MAP } from "./room.map";

// Splats have no mesh to collide with, so each world carries its own floor, walls and solid map.
// Tune with the debug overlay (P), fly mode (F) and eye height ([ and ]) inside the world.
export interface SolidMap {
  cell: number;
  halfX: number;
  halfZ: number;
  rows: string[]; // "#" = solid
}

export interface WorldConfig {
  quaternion: [number, number, number, number]; // turns the raw capture upright
  offset: [number, number, number]; // puts the floor at y = 0
  spawn: [number, number, number];
  yaw: number; // radians, where the player looks on landing
  eyeY: number; // the floor, measured at the player's eyes
  dropFrom: number; // world units above eyeY the player falls from
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  speed: number; // walk speed, world units per second
  body: number; // the player's radius against solid cells
  solid: SolidMap | null;
}

export const DEFAULT_WORLD_URL = "/worlds/room.splat";

const ROOM: WorldConfig = {
  quaternion: ROOM_MAP.quaternion,
  offset: ROOM_MAP.offset,
  spawn: [-0.5, 0, -2.0],
  yaw: 0,
  eyeY: 2.2,
  dropFrom: 3,
  bounds: { minX: -2.7, maxX: 1.5, minZ: -4.7, maxZ: 2.0 },
  speed: 2.6,
  body: 0.3,
  solid: ROOM_MAP,
};

// A world we have not measured: upright as captured, a generous box, nothing solid.
const UNKNOWN: WorldConfig = {
  ...ROOM,
  quaternion: [1, 0, 0, 0],
  offset: [0, 0, 0],
  spawn: [0, 0, 0],
  eyeY: 0,
  bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
  solid: null,
};

export const fileOf = (url: string) => url.split("/").pop() ?? url;
const storageKey = (url: string) => `dropin:world:${fileOf(url)}`;

// A world measured by tools/measure_world.py has `<file>.map.json` next to it: upright transform,
// floor, solid map and landing spot. The built-in room carries its own; anything else gets a bare box.
export async function configFor(url: string): Promise<WorldConfig> {
  let base = fileOf(url) === "room.splat" ? ROOM : UNKNOWN;
  try {
    const res = await fetch(`${url}.map.json`);
    if (res.ok) base = { ...UNKNOWN, ...(await res.json()) };
  } catch {
    // no measurement: keep the base
  }
  try {
    const saved = localStorage.getItem(storageKey(url));
    if (saved) return { ...base, ...JSON.parse(saved) };
  } catch {
    // a broken saved tuning never blocks the world
  }
  return base;
}

export function saveTuning(url: string, tuning: Partial<WorldConfig>) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(url)) ?? "{}");
    localStorage.setItem(storageKey(url), JSON.stringify({ ...saved, ...tuning }));
  } catch {
    // tuning is a convenience
  }
}

// Shown when the server or Claude is unreachable, so the world never opens mute.
export const FALLBACK_SCENE: Scene = {
  title: "The Living Room",
  tagline: "A quiet room, rebuilt from a walk-through video.",
  narration:
    "You have landed in a living room reconstructed from ordinary video. Walk toward the piano, circle the table, and look back at where the camera once stood.",
  landmarks: ["Piano", "Coffee table", "Sofa", "Window"],
};
