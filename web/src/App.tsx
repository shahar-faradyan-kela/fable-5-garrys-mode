import { useEffect, useState } from "react";
import UploadFlow from "./upload/UploadFlow";
import Play from "./play/Play";

// No router: `#play` is the world, anything else is the upload flow.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash === "#play" ? <Play /> : <UploadFlow />;
}
