import { useState } from "react";
import { deleteImageKitPhoto, listImageKitPhotos, loadSettings } from "../../api/github";
import { imageKitUrl } from "../../data/repo.js";
import { imageKitPath, referencedImageKitPaths, unusedPhotos } from "../../data/media.js";
import { SITE_PHOTOS } from "../../data/products";

const fileSize = (size) =>
  size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

const uploaded = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/** Deleted products leave their photos on ImageKit; this tab clears them out. */
export default function PhotosTab({ catalogue, token }) {
  const [state, setState] = useState("idle"); // idle | scanning | ready | unconfigured
  const [unused, setUnused] = useState([]);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    if (!catalogue?.doc) {
      setErr("The catalogue has not loaded yet. Refresh the page and try again.");
      return;
    }
    setState("scanning");
    setErr("");
    setFlash("");
    try {
      const [files, settings] = await Promise.all([listImageKitPhotos(token), loadSettings(token)]);
      if (!files) {
        setState("unconfigured");
        setUnused([]);
        return;
      }
      const referenced = referencedImageKitPaths([catalogue.doc, settings.doc]);
      SITE_PHOTOS.forEach((url) => referenced.add(imageKitPath(url)));
      setUnused(unusedPhotos(files, referenced));
      setState("ready");
    } catch (ex) {
      setState("idle");
      setErr(ex.message);
    }
  };

  const remove = async (photos) => {
    if (busy || !photos.length) return;
    setBusy(true);
    setErr("");
    setFlash("");
    const gone = [];
    try {
      for (const photo of photos) {
        await deleteImageKitPhoto(photo.path, token);
        gone.push(photo.path);
      }
      setFlash(`Deleted ${gone.length} photo${gone.length === 1 ? "" : "s"} ✓ — they are gone from ImageKit.`);
    } catch (ex) {
      setErr(`${gone.length} photo${gone.length === 1 ? "" : "s"} deleted, then: ${ex.message}`);
    } finally {
      setUnused((list) => list.filter((photo) => !gone.includes(photo.path)));
      setBusy(false);
    }
  };

  const removeOne = (photo) => {
    const label = photo.name || photo.path.split("/").pop();
    if (window.confirm(`Delete “${label}” from ImageKit? This cannot be undone.`)) remove([photo]);
  };

  const removeAll = () => {
    const count = unused.length;
    if (window.confirm(`Delete all ${count} unused photos from ImageKit? This cannot be undone.`)) remove(unused);
  };

  const total = unused.reduce((sum, photo) => sum + (Number(photo.size) || 0), 0);

  return (
    <section className="form hp-section">
      <div className="hp-head">
        <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Unused photos</h3>
        <button className="btn btn-ghost" onClick={scan} disabled={state === "scanning" || busy}>
          {state === "scanning" ? "Checking…" : "Check for unused photos"}
        </button>
      </div>
      <p className="co-note">
        Deleting a product or swapping a picture leaves the old photo on ImageKit. This lists photos in the
        storefront folder that no product or homepage block mentions. Photos from the last 24 hours are kept,
        in case you are still editing.
      </p>

      {flash && <p style={{ color: "var(--green)" }}>{flash}</p>}
      {err && <p className="auth-err">{err}</p>}

      {state === "unconfigured" && (
        <div className="empty">ImageKit is not connected on this deployment, so there is nothing to tidy here.</div>
      )}

      {state === "ready" && unused.length === 0 && (
        <div className="empty">Nothing to clean up — every photo in the folder is in use.</div>
      )}

      {state === "ready" && unused.length > 0 && (
        <>
          <div className="hp-head">
            <p className="co-note">
              {unused.length} unused photo{unused.length === 1 ? "" : "s"} · {fileSize(total)}
            </p>
            <button className="btn btn-gold" onClick={removeAll} disabled={busy}>
              Delete all {unused.length}
            </button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th></th><th>Photo</th><th>Size</th><th>Uploaded</th><th></th></tr>
              </thead>
              <tbody>
                {unused.map((photo) => (
                  <tr key={photo.path}>
                    <td><img src={imageKitUrl(photo.url, 120, 70)} alt="" loading="lazy" /></td>
                    <td>
                      <b>{photo.name || photo.path.split("/").pop()}</b>
                      <br />
                      <small>{photo.path}</small>
                    </td>
                    <td>{fileSize(Number(photo.size) || 0)}</td>
                    <td>{uploaded(photo.createdAt)}</td>
                    <td>
                      <button className="mini-btn danger" onClick={() => removeOne(photo)} disabled={busy}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
