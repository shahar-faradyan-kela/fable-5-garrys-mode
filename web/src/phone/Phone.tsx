import { useEffect, useRef, useState } from "react";
import { API, getJob, type Job } from "../contract";
import "./phone.css";

type Phase = { kind: "idle" } | { kind: "sending"; sent: number } | { kind: "sent"; jobId: string } | { kind: "error"; message: string };

// The phone's whole job: film or pick, send, then point the owner at the big screen.
export default function Phone() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [job, setJob] = useState<Job | null>(null);
  const film = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);

  const send = (file: File | undefined) => {
    if (!file) return;
    const body = new FormData();
    body.append("video", file, file.name);
    body.append("source", "phone");
    // XMLHttpRequest, because fetch cannot report upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/api/jobs`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setPhase({ kind: "sending", sent: e.loaded / e.total });
    xhr.onerror = () => setPhase({ kind: "error", message: "Could not reach the laptop. Same Wi-Fi?" });
    xhr.onload = () => {
      try {
        const reply = JSON.parse(xhr.responseText);
        if (xhr.status === 201) setPhase({ kind: "sent", jobId: reply.jobId });
        else setPhase({ kind: "error", message: reply.error ?? reply.detail ?? `Upload failed (${xhr.status})` });
      } catch {
        setPhase({ kind: "error", message: `Upload failed (${xhr.status})` });
      }
    };
    setPhase({ kind: "sending", sent: 0 });
    xhr.send(body);
  };

  // Once sent, follow the job so the phone shows what Claude saw too.
  const jobId = phase.kind === "sent" ? phase.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(() => getJob(jobId).then(setJob).catch(() => {}), 1000);
    return () => clearInterval(timer);
  }, [jobId]);

  return (
    <main className="phone">
      <h1>DropIn</h1>

      {phase.kind === "idle" || phase.kind === "error" ? (
        <>
          <p className="phone-lead">Film a place. Walk into it on the big screen.</p>
          {phase.kind === "error" && <p className="phone-error">{phase.message}</p>}
          <button className="phone-main" onClick={() => film.current?.click()}>
            Film this place
          </button>
          <button className="phone-second" onClick={() => pick.current?.click()}>
            Choose a video or photo
          </button>
          <p className="phone-tip">Walk slowly. Move sideways, do not spin on the spot. 20–60 seconds.</p>
          <input ref={film} type="file" accept="video/*" capture="environment" hidden onChange={(e) => send(e.target.files?.[0])} />
          <input ref={pick} type="file" accept="video/*,image/*" hidden onChange={(e) => send(e.target.files?.[0])} />
        </>
      ) : phase.kind === "sending" ? (
        <>
          <p className="phone-lead">Sending… {Math.round(phase.sent * 100)}%</p>
          <div className="phone-bar">
            <div style={{ width: `${phase.sent * 100}%` }} />
          </div>
        </>
      ) : (
        <>
          <p className="phone-lead">Sent. Look at the big screen.</p>
          {job && <p className="phone-stage">{job.stage === "done" ? "The world is ready" : `${job.stage}…`}</p>}
          {job?.scene && (
            <section className="phone-scene">
              <small>Seen by Claude Fable 5.1</small>
              <h2>{job.scene.title}</h2>
              <p>{job.scene.tagline}</p>
            </section>
          )}
          <button className="phone-second" onClick={() => (setJob(null), setPhase({ kind: "idle" }))}>
            Send another
          </button>
        </>
      )}
    </main>
  );
}
