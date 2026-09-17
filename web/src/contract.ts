// Mirrors CONTRACT.md. Change both or neither.
// Same host as the page, so a phone on the LAN reaches the server the laptop runs.
export const API = import.meta.env.VITE_API ?? `http://${window.location.hostname}:8000`;

export type Stage =
  | "queued"
  | "extracting"
  | "poses"
  | "training"
  | "compressing"
  | "done"
  | "failed";

export interface Scene {
  title: string;
  tagline: string;
  narration: string;
  landmarks: string[];
}

export interface Job {
  id: string;
  stage: Stage;
  progress: number;
  frames: string[];
  scene: Scene | null;
  splatUrl: string | null;
  error: string | null;
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`${API}/api/jobs/${id}`);
  if (!res.ok) throw new Error(`job ${id}: ${res.status}`);
  return res.json();
}

// The newest job on the server, or null. This is how the big screen notices a phone upload.
export async function getLatestJob(): Promise<Job | null> {
  const res = await fetch(`${API}/api/jobs/latest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`latest job: ${res.status}`);
  return res.json();
}

export const playUrl = (jobId: string) => `/?job=${jobId}#play`;
