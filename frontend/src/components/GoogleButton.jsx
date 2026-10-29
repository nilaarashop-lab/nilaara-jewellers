import { useEffect, useRef } from "react";
import { googleEnabled } from "../api/client";

/**
 * Google Identity Services button.
 * The browser only ever receives the public client ID; the resulting ID token
 * is forwarded to our backend, which verifies it with google-auth-library.
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is not configured.
 */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

let gisLoading = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
  return gisLoading;
}

export default function GoogleButton({ onCredential, text = "continue_with", width = 320 }) {
  const ref = useRef(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential; // always call the latest callback

  useEffect(() => {
    if (!googleEnabled || !ref.current) return;
    let alive = true;
    loadGis()
      .then((g) => {
        if (!alive || !ref.current) return;
        g.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => cbRef.current?.(resp.credential),
        });
        ref.current.innerHTML = "";
        g.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", text, shape: "rectangular", width });
      })
      .catch((e) => {
        if (alive && ref.current) ref.current.innerHTML = `<small style="color:var(--danger)">${e.message}</small>`;
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, width]);

  if (!googleEnabled) return null;
  return <div className="gbtn-wrap"><div ref={ref} /></div>;
}
