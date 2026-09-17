"""Turn a raw Gaussian-splat file into a walkable world.

A splat is only a picture: no floor, no walls, no up. This finds the floor plane (RANSAC, then
least squares), turns the scene upright, squares the walls to the axes, marks everything between
knee and head height as solid, and picks a clear spot to land on.

    uv run --with numpy python tools/measure_world.py assets/worlds/office.spz [--eye 1.6] [--up 0,1,0]

Writes <file>.map.json next to the world. The web loads it at run time (web/src/play/worlds.ts).
"""
import argparse, gzip, json, sys
import numpy as np

def load(path):
    """-> positions (n,3) float32 in the file's own axes, alpha (n,) 0..1"""
    if path.endswith(".splat"):  # 32-byte records: pos f32x3, scale f32x3, rgba u8x4, rot u8x4
        rec = np.fromfile(path, dtype=np.uint8)
        rec = rec[: rec.size // 32 * 32].reshape(-1, 32)
        return rec[:, :12].copy().view(np.float32).reshape(-1, 3), rec[:, 27] / 255.0
    if path.endswith(".spz"):  # gzip; 16-byte header; then 24-bit fixed-point positions, then alphas
        buf = np.frombuffer(gzip.open(path, "rb").read(), dtype=np.uint8)
        magic, version, n = np.frombuffer(buf[:12].tobytes(), dtype="<u4")
        assert magic == 0x5053474E, "not an SPZ file"
        frac_bits = int(buf[13])
        if version == 1:  # float16 positions
            pos = np.frombuffer(buf[16 : 16 + 6 * n].tobytes(), dtype="<f2").astype(np.float32).reshape(-1, 3)
            alpha = buf[16 + 6 * n : 16 + 7 * n] / 255.0
            return pos, alpha
        b = buf[16 : 16 + 9 * n].reshape(-1, 3, 3).astype(np.int32)
        v = b[:, :, 0] | (b[:, :, 1] << 8) | (b[:, :, 2] << 16)
        v = np.where(v & 0x800000, v - 0x1000000, v)
        return (v / float(1 << frac_bits)).astype(np.float32), buf[16 + 9 * n : 16 + 10 * n] / 255.0
    if path.endswith(".ply"):
        raw = open(path, "rb").read()
        end = raw.index(b"end_header\n") + len(b"end_header\n")
        header = raw[:end].decode("ascii", "replace").splitlines()
        assert any("binary_little_endian" in l for l in header), "only binary little-endian PLY"
        kinds = {"float": "<f4", "float32": "<f4", "double": "<f8", "float64": "<f8", "uchar": "u1", "uint8": "u1",
                 "char": "i1", "short": "<i2", "ushort": "<u2", "int": "<i4", "int32": "<i4", "uint": "<u4"}
        n, fields, in_vertex = 0, [], False
        for l in header:
            t = l.split()
            if t[:2] == ["element", "vertex"]: n, in_vertex = int(t[2]), True
            elif t[:1] == ["element"]: in_vertex = False
            elif t[:1] == ["property"] and in_vertex: fields.append((t[2], kinds[t[1]]))
        data = np.frombuffer(raw, dtype=np.dtype(fields), count=n, offset=end)
        pos = np.stack([data["x"], data["y"], data["z"]], axis=1).astype(np.float32)
        alpha = 1 / (1 + np.exp(-data["opacity"].astype(np.float32))) if "opacity" in data.dtype.names else np.ones(n)
        return pos, alpha
    sys.exit(f"unknown world format: {path}")

def quat_from_to(a, b):
    """shortest rotation taking unit vector a onto unit vector b, as (x, y, z, w)"""
    c = float(np.dot(a, b))
    if c < -0.999999:
        axis = np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 0, 1])
        axis /= np.linalg.norm(axis)
        return np.array([*axis, 0.0])
    q = np.array([*np.cross(a, b), 1 + c])
    return q / np.linalg.norm(q)

def quat_mul(p, q):
    px, py, pz, pw = p; qx, qy, qz, qw = q
    return np.array([pw*qx+px*qw+py*qz-pz*qy, pw*qy-px*qz+py*qw+pz*qx, pw*qz+px*qy-py*qx+pz*qw, pw*qw-px*qx-py*qy-pz*qz])

def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def find_floor(pts, up_hint, rng):
    """The floor is the big plane with (almost) everything on one side of it and the clutter close to it."""
    sample = pts[rng.choice(len(pts), min(40000, len(pts)), replace=False)]
    size = float(np.median(np.percentile(sample, 98, axis=0) - np.percentile(sample, 2, axis=0)))
    tol = 0.012 * size
    best = None
    for _ in range(900):
        p, q, r = sample[rng.choice(len(sample), 3, replace=False)]
        nrm = np.cross(q - p, r - p)
        l = np.linalg.norm(nrm)
        if l < 1e-9: continue
        nrm /= l
        dist = (sample - p) @ nrm
        if np.median(dist) < 0: nrm, dist = -nrm, -dist          # normal points into the room
        if up_hint is not None and np.dot(nrm, up_hint) < 0.7: continue
        below = float(np.mean(dist < -3 * tol))
        if below > 0.12: continue                                # a table top or a wall in mid-room
        top = np.percentile(dist, 98)
        lean = float(np.median(dist) / top)                      # floor: clutter hugs it (< 0.5). ceiling: > 0.5
        score = int(np.sum(np.abs(dist) < tol)) * (1.0 if lean < 0.45 else 0.35)
        if best is None or score > best[0]: best = (score, nrm, p, lean, below)
    if best is None: sys.exit("no floor found — pass --up x,y,z")
    _, nrm, p, lean, below = best
    for tol_k in (1.5, 0.7, 0.4, 0.4):                                # least-squares refine on the inliers
        dist = (pts - p) @ nrm
        inl = pts[np.abs(dist) < tol * tol_k]
        p = inl.mean(axis=0)
        _, _, vt = np.linalg.svd(inl[:: max(1, len(inl) // 60000)] - p, full_matrices=False)
        new = vt[2]
        nrm = new if np.dot(new, nrm) > 0 else -new
    print(f"floor: normal {np.round(nrm, 4)}  inliers {len(inl)}  lean {lean:.2f}  below {below:.3f}  scene size {size:.2f}")
    return nrm, p

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("world")
    ap.add_argument("--eye", type=float, default=1.6, help="eye height in the world's units (1.6 for a metric scan)")
    ap.add_argument("--up", default=None, help="hint: the file's up axis, e.g. 0,1,0 or 0,-1,0")
    ap.add_argument("--cell", type=float, default=None)
    a = ap.parse_args()
    rng = np.random.default_rng(7)
    pos, alpha = load(a.world)
    print(f"{len(pos)} gaussians")
    solid = pos[(alpha > 0.25) & np.isfinite(pos).all(axis=1)]
    lo, hi = np.percentile(solid, 1, axis=0), np.percentile(solid, 99, axis=0)
    solid = solid[((solid >= lo) & (solid <= hi)).all(axis=1)]    # floaters out

    up_hint = None if a.up is None else np.array([float(v) for v in a.up.split(",")])
    nrm, p0 = find_floor(solid, up_hint, rng)

    q_up = quat_from_to(nrm, np.array([0.0, 1.0, 0.0]))
    pts = (solid - p0) @ quat_matrix(q_up).T                      # upright, floor at y = 0
    body_lo, body_hi = 0.28 * a.eye, 1.15 * a.eye                 # knee to just over the head
    body = pts[(pts[:, 1] > body_lo) & (pts[:, 1] < body_hi)][:, [0, 2]]
    best = None
    for deg in range(0, 90, 2):                                   # the yaw that squares the walls
        c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
        xs, zs = c * body[:, 0] + s * body[:, 1], -s * body[:, 0] + c * body[:, 1]
        box = [*np.percentile(xs, [3, 97]), *np.percentile(zs, [3, 97])]
        area = (box[1] - box[0]) * (box[3] - box[2])
        if best is None or area < best[0]: best = (area, deg, box)
    _, deg, box = best
    th = np.radians(deg)
    q = quat_mul(np.array([0, np.sin(th / 2), 0, np.cos(th / 2)]), q_up)
    R = quat_matrix(q)
    cx, cz = (box[0] + box[1]) / 2, (box[2] + box[3]) / 2
    offset = -(R @ p0) - np.array([cx, 0, cz])
    world = solid @ R.T + offset                                  # exactly what the browser will show

    cell = a.cell or round(max(0.15, 0.16 * a.eye), 2)
    half_x, half_z = (box[1] - box[0]) / 2 + 1.0, (box[3] - box[2]) / 2 + 1.0
    W, H = int(2 * half_x / cell), int(2 * half_z / cell)
    def grid(sel):
        g, _, _ = np.histogram2d(world[sel, 2], world[sel, 0], bins=[H, W], range=[[-half_z, half_z], [-half_x, half_x]])
        return g
    gb = grid((world[:, 1] > body_lo) & (world[:, 1] < body_hi))
    gf = grid(np.abs(world[:, 1]) < 0.08 * a.eye)
    is_solid = gb > 0.5 * gb[gb > 0].mean()
    is_floor = (gf > 0.5 * gf[gf > 0].mean()) & ~is_solid

    # land where there is floor, nothing solid within ~0.6 eye heights, as central as possible
    reach = int(np.ceil(0.4 * a.eye / cell))
    near_solid = np.zeros_like(is_solid)
    for dr in range(-reach, reach + 1):
        for dc in range(-reach, reach + 1):
            near_solid |= np.roll(np.roll(is_solid, dr, 0), dc, 1)
    rr, cc = np.nonzero(~near_solid & (np.abs(np.arange(H)[:, None] - H / 2) < H / 2 - 1 / cell) & (np.abs(np.arange(W)[None, :] - W / 2) < W / 2 - 1 / cell))
    fr, fc = np.nonzero(is_floor)
    centre = (fr.mean(), fc.mean()) if len(fr) else (H / 2, W / 2)
    k = int(np.argmin((rr - centre[0]) ** 2 + (cc - centre[1]) ** 2))
    spawn = [round(float(-half_x + (cc[k] + 0.5) * cell), 2), 0, round(float(-half_z + (rr[k] + 0.5) * cell), 2)]
    # look toward the far end of the room
    yaw = 0.0 if spawn[2] > 0 else float(np.pi)

    rows = ["".join("#" if is_solid[r, c] else ("." if is_floor[r, c] else " ") for c in range(W)) for r in range(H)]
    sr, sc = int((spawn[2] + half_z) / cell), int((spawn[0] + half_x) / cell)
    for r, row in enumerate(rows): print(row[:sc] + "@" + row[sc + 1 :] if r == sr else row)
    out = {
        "quaternion": [round(float(v), 5) for v in q], "offset": [round(float(v), 3) for v in offset],
        "spawn": spawn, "yaw": round(yaw, 3), "eyeY": a.eye, "dropFrom": round(1.4 * a.eye, 2), "speed": round(1.2 * a.eye, 2),
        "body": round(0.19 * a.eye, 2),
        "bounds": {"minX": round(float(-half_x + 0.9), 2), "maxX": round(float(half_x - 0.9), 2), "minZ": round(float(-half_z + 0.9), 2), "maxZ": round(float(half_z - 0.9), 2)},
        "solid": {"cell": cell, "halfX": round(float(half_x), 3), "halfZ": round(float(half_z), 3), "rows": rows},
    }
    json.dump(out, open(a.world + ".map.json", "w"))
    print(f"yaw {deg} deg · room {box[1]-box[0]:.1f} x {box[3]-box[2]:.1f} · cell {cell} · spawn {spawn} (@) · wrote {a.world}.map.json")

main()
