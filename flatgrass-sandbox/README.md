# Flatgrass Sandbox

A Garry's Mod-style first-person physics sandbox in a single HTML file (three.js r128 + cannon.js 0.6.2 from cdnjs). No build step.

## Run

    cd flatgrass-sandbox && python3 -m http.server 8765
    # open http://localhost:8765

Desktop only (keyboard + mouse).

## Controls

| Key | Action |
| --- | --- |
| WASD / Space / Shift | move / jump / run |
| 1 2 3 or wheel | physics gun / gravity gun / tool gun |
| LMB / RMB | fire / alt (physgun: freeze, gravgun: pull) |
| Q | spawn menu (props + tools: remover, weld, balloon, paint) |
| Z / V / Esc | undo / noclip / pause |

## Gotchas

- cannon.js 0.6.2 defaults `collisionFilterMask` to `1`. The player is in group 2, so every world body must be created with `collisionFilterMask: G_WORLD|G_PLAYER` or the player falls through it.
- Cannon cylinders lie along Z; the shape is added with a -90° X rotation to match three's Y-axis cylinder.
- If pointer lock is refused (sandboxed iframe), the game falls back to plain mouse-move look; Esc pauses.
- `window.__fg` exposes `{player, props, aim, held}` for scripted testing.
