import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { getLatestJob, playUrl, type Job } from "../contract";
import "./phone.css";

declare const __LAN_IP__: string;
const PHONE_URL = `http://${__LAN_IP__}:5173/#phone`;

// Lives in a corner of the big screen: the QR code the phone scans, and then the phone's job as it runs.
export default function PhoneLink() {
  const [job, setJob] = useState<Job | null>(null);
  const seen = useRef<string | null | undefined>(undefined); // the newest job when the page opened

  useEffect(() => {
    const tick = async () => {
      try {
        const latest = await getLatestJob();
        if (seen.current === undefined) seen.current = latest?.id ?? null;
        else if (latest && latest.id !== seen.current) setJob(latest);
      } catch {
        // server not up yet
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  if (job) {
    return (
      <aside className="phonelink phonelink-job">
        <small>From the phone</small>
        {job.scene ? <strong>{job.scene.title}</strong> : <strong>{job.stage}…</strong>}
        <div className="phone-bar">
          <div style={{ width: `${job.progress * 100}%` }} />
        </div>
        {job.stage === "done" && (
          <a className="phonelink-go" href={playUrl(job.id)}>
            Drop in
          </a>
        )}
        {job.stage === "failed" && <span className="phone-error">{job.error}</span>}
      </aside>
    );
  }

  const qr = qrcode(0, "M");
  qr.addData(PHONE_URL);
  qr.make();
  return (
    <aside className="phonelink">
      <img src={qr.createDataURL(6, 2)} alt="QR code that opens DropIn on a phone" />
      <small>Scan to film from your phone</small>
      <code>{PHONE_URL}</code>
    </aside>
  );
}
