// SHAHAR OWNS THIS FOLDER. This stub only keeps the app compiling until the real flow lands.
// Contract: drop a video → POST /api/jobs → poll getJob() every 1 s → "Drop in" → location = playUrl(jobId).
export default function UploadFlow() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <h1>DropIn</h1>
        <p>Upload a video of a real place. Walk around inside it.</p>
        <a href="/#play">Drop in to the demo world →</a>
      </div>
    </main>
  );
}
