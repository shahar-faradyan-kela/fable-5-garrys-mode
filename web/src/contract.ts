// Mirrors CONTRACT.md. Change both or neither.
export const API = import.meta.env.VITE_API ?? "http://localhost:8000";

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

export const playUrl = (jobId: string) => `/?job=${jobId}#play`;
