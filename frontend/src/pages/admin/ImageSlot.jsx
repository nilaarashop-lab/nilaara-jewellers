import { useState } from "react";
import { previewUrl, uploadImage } from "../../api/github";

/** One homepage image: preview, upload, remove. */
export default function ImageSlot({ value, onChange, label = "Upload image", disabled = false, onBusy, onError }) {
  const [busy, setBusy] = useState(false);
  const url = typeof value === "string" ? value : value?.url || "";

  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    onBusy?.(true);
    onError?.("");
    try {
      const uploaded = await uploadImage(file);
      onChange(uploaded.url);
    } catch (ex) {
      onError?.(ex.message);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };

  return (
    <div className="hp-imgslot">
      {url ? (
        <span className="photo-thumb">
          <img src={previewUrl(url)} alt="" />
          <button type="button" onClick={() => onChange("")} aria-label="remove image">✕</button>
        </span>
      ) : (
        <label className="upload-tile" style={{ width: 96, height: 96 }}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            disabled={disabled || busy}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <b>{busy ? "…" : "+"}</b>
          <small>{busy ? "Uploading" : label}</small>
        </label>
      )}
    </div>
  );
}
