import { useEffect, useState } from "react";
import UploadFlow from "./upload/UploadFlow";
import Play from "./play/Play";
import Phone from "./phone/Phone";
import PhoneLink from "./phone/PhoneLink";

// No router: `#play` is the world, `#phone` is the phone's capture page, anything else is the upload flow.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (hash === "#play") return <Play />;
  if (hash === "#phone") return <Phone />;
  return (
    <>
      <UploadFlow />
      <PhoneLink />
    </>
  );
}
