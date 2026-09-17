import { useEffect, useRef, useState } from "react";
import { API, getJob, playUrl, type Job } from "../contract";
import "./UploadFlow.css";

const STAGES = ["queued", "extracting", "poses", "training", "compressing"] as const;

const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  queued: "Queued",
  extracting: "Extracting frames",
  poses: "Estimating camera poses",
  training: "Training the splat",
  compressing: "Compressing the world",
};

export default function UploadFlow() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId) return;
    if (job && (job.stage === "done" || job.stage === "failed")) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const next = await getJob(jobId);
        if (!cancelled) setJob(next);
      } catch {
        // transient poll failure — try again next tick
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, job?.stage]);

  async function uploadFile(file: File) {
    if (uploading) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch(`${API}/api/jobs`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Upload failed (${res.status}).`);
        return;
      }
      const { jobId: newJobId } = await res.json();
      setJobId(newJobId);
    } catch {
      setError("Could not reach the server. Is it running?");
    } finally {
      setUploading(false);
    }
  }

  if (!jobId) {
    return (
      <main className="upload-screen">
        <h1 className="hero-title">DropIn</h1>
        <p className="hero-tagline">Film a place. Walk into it.</p>
        <label
          className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) uploadFile(file);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
          />
          <span className="dropzone-label">
            {uploading ? "Uploading…" : "Drop a video here, or click to choose"}
          </span>
        </label>
        {error && <p className="upload-error">{error}</p>}
      </main>
    );
  }

  const stage = job?.stage ?? "queued";
  const progress = job?.progress ?? 0;
  const stageIndex = STAGES.indexOf(stage as (typeof STAGES)[number]);

  return (
    <main className="stage-screen">
      <h1 className="hero-title">DropIn</h1>

      {stage === "failed" ? (
        <p className="upload-error">{job?.error ?? "Something went wrong."}</p>
      ) : (
        <>
          <ol className="stage-track">
            {STAGES.map((s, i) => (
              <li
                key={s}
                className={
                  "stage-item" +
                  (s === stage ? " stage-live" : "") +
                  (stageIndex > i || stage === "done" ? " stage-complete" : "")
                }
              >
                {STAGE_LABELS[s]}
              </li>
            ))}
          </ol>

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          {job && job.frames.length > 0 && (
            <div className="frames-strip">
              {job.frames.map((src) => (
                <img key={src} src={src} className="frame-thumb" alt="" />
              ))}
            </div>
          )}

          {job?.scene && (
            <div className="scene-reveal">
              <span className="scene-label">seen by Claude Fable 5.1</span>
              <h2 className="scene-title">{job.scene.title}</h2>
              <p className="scene-tagline">{job.scene.tagline}</p>
            </div>
          )}

          {stage === "done" && (
            <button
              className="drop-in-button"
              onClick={() => {
                window.location.href = playUrl(jobId);
              }}
            >
              Drop in
            </button>
          )}
        </>
      )}
    </main>
  );
}
