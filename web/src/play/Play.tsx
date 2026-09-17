import { useEffect, useRef, useState } from "react";
import { getJob, type Scene } from "../contract";
import { createWorld, type World } from "./world";
import { configFor, DEFAULT_WORLD_URL, FALLBACK_SCENE } from "./worlds";
import "./play.css";

interface Source {
  url: string;
  scene: Scene;
  fromClaude: boolean;
}

// `?job=<id>` asks the server for the world; anything else (or a dead server) opens the built-in one.
async function resolveSource(): Promise<Source> {
  const jobId = new URLSearchParams(window.location.search).get("job");
  if (jobId) {
    try {
      const job = await getJob(jobId);
      if (job.splatUrl) {
        return { url: job.splatUrl, scene: job.scene ?? FALLBACK_SCENE, fromClaude: job.scene !== null };
      }
    } catch {
      // fall through to the built-in world
    }
  }
  return { url: DEFAULT_WORLD_URL, scene: FALLBACK_SCENE, fromClaude: false };
}

export default function Play() {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [landed, setLanded] = useState(false);
  const [debug, setDebug] = useState(false);
  const pose = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let alive = true;
    resolveSource().then((s) => alive && setSource(s));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!source || !host.current) return;
    const w = createWorld(host.current, source.url, configFor(source.url), {
      onProgress: setProgress,
      onReady: () => setReady(true),
      onError: setError,
      onLock: (isLocked) => {
        setLocked(isLocked);
        if (isLocked) setLanded(true);
      },
      onPose: (p) => {
        if (pose.current) {
          pose.current.textContent =
            `x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  z ${p.z.toFixed(2)}  yaw ${p.yaw.toFixed(2)}  eye ${p.eyeY.toFixed(1)}${p.fly ? "  FLY" : ""}`;
        }
      },
    });
    world.current = w;
    return () => {
      w.dispose();
      world.current = null;
    };
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === "KeyP" && setDebug((d) => !d);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scene = source?.scene;

  return (
    <div className="play">
      <div ref={host} className="play-canvas" />

      {scene && (
        <header className="hud-title">
          <h1>{scene.title}</h1>
          <p>{scene.tagline}</p>
          {source?.fromClaude && <span className="hud-badge">Seen by Claude Fable 5.1</span>}
        </header>
      )}

      {scene && landed && locked && (
        <aside className="hud-narration" key={scene.title}>
          <p>{scene.narration}</p>
          <ul>
            {scene.landmarks.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </aside>
      )}

      {locked && <div className="hud-crosshair" />}
      {locked && <footer className="hud-keys">WASD move · Mouse look · Shift run · Space jump · Esc release</footer>}
      <pre ref={pose} className="hud-debug" hidden={!debug} />

      {!locked && (
        <div className="play-gate">
          {error ? (
            <p className="play-error">The world failed to load: {error}</p>
          ) : !ready ? (
            <>
              <p className="play-loading">Loading the world… {Math.round(progress * 100)}%</p>
              <div className="play-bar">
                <div style={{ width: `${progress * 100}%` }} />
              </div>
            </>
          ) : (
            <button className="play-enter" onClick={() => world.current?.enter()}>
              {landed ? "Click to continue" : "Drop in"}
            </button>
          )}
          <a className="play-back" href="/">
            ← Another video
          </a>
        </div>
      )}
    </div>
  );
}
