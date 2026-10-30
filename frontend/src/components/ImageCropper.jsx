import { useEffect, useRef, useState } from "react";
import { RATIOS, clampPan, fitFrame, outputSize, sourceRect } from "../data/crop";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * Crop frame for a single photo: drag it into place, zoom, pick a shape.
 * Used both for a photo chosen from the phone and for one already on the
 * product, so the caller always receives a File ready for `uploadImage`.
 */
export default function ImageCropper({ photo, title, onCancel, onSkip, onApply }) {
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [ratioKey, setRatioKey] = useState(RATIOS[0].key);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setSize({ w: image.naturalWidth, h: image.naturalHeight });
      setUrl(url);
    };
    image.onerror = () => setFailed("That file could not be opened as a photo.");
    image.src = url;
    return () => {
      URL.revokeObjectURL(url);
      imageRef.current = null;
    };
  }, [photo]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const measure = () => setStage({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const ratio = RATIOS.find((r) => r.key === ratioKey) || RATIOS[0];
  const ready = size.w > 0 && stage.w > 0;
  const frame = ready ? fitFrame(stage.w, stage.h, ratio.ratio) : { w: 0, h: 0 };
  const { tx, ty } = ready
    ? clampPan(size.w, size.h, frame.w, frame.h, zoom, pan.x, pan.y)
    : { tx: 0, ty: 0 };
  const scale = ready ? Math.max(frame.w / size.w, frame.h / size.h) * zoom : 1;

  const startDrag = (event) => {
    if (!ready) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, ...pan };
  };
  const moveDrag = (event) => {
    const origin = dragRef.current;
    if (!origin) return;
    setPan({
      x: origin.x + (event.clientX - origin.clientX),
      y: origin.y + (event.clientY - origin.clientY),
    });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const apply = async () => {
    const image = imageRef.current;
    if (!image || busy) return;
    setBusy(true);
    setFailed("");
    const rect = sourceRect({
      imgW: size.w,
      imgH: size.h,
      frameW: frame.w,
      frameH: frame.h,
      zoom,
      tx,
      ty,
    });
    const out = outputSize(rect);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFailed("This browser cannot process the crop. Use “Upload as is” instead.");
      setBusy(false);
      return;
    }
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h);
    const encode = (type) =>
      new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, 0.92));
    const blob = (await encode("image/webp")) || (await encode("image/jpeg"));
    setBusy(false);
    if (!blob) {
      setFailed("The crop could not be encoded. Try again or upload as is.");
      return;
    }
    const base = String(photo.name || "photo").replace(/\.[a-z0-9]+$/i, "");
    onApply(new File([blob], `${base}-cropped.webp`, { type: blob.type || "image/webp" }));
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="crop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Crop photo"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>{title || "Crop photo"}</h3>
        <p className="co-note" style={{ marginTop: 4 }}>
          Drag the photo to frame the jewellery, then pick a shape. Only what is inside the box gets uploaded.
        </p>

        <div className="crop-stage" ref={stageRef}>
          {ready && (
            <div
              className="crop-frame"
              style={{ width: frame.w, height: frame.h }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <img
                src={url}
                alt=""
                draggable={false}
                style={{
                  width: size.w * scale,
                  height: size.h * scale,
                  transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`,
                }}
              />
            </div>
          )}
          {!ready && !failed && <span className="crop-loading">Loading…</span>}
          {failed && <span className="crop-loading">{failed}</span>}
        </div>

        <div className="crop-row">
          <div className="crop-ratios" role="group" aria-label="Crop shape">
            {RATIOS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`chip ${r.key === ratioKey ? "on" : ""}`}
                onClick={() => setRatioKey(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="crop-zoom">
            Zoom
            <input
              type="range"
              min={MIN_ZOOM * 100}
              max={MAX_ZOOM * 100}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              disabled={!ready}
            />
          </label>
        </div>

        {failed && <p className="auth-err" style={{ margin: "8px 0 0" }}>{failed}</p>}

        <div className="crop-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          {onSkip && (
            <button type="button" className="btn btn-ghost" onClick={onSkip}>Upload as is</button>
          )}
          <button type="button" className="btn btn-gold" onClick={apply} disabled={!ready || busy}>
            {busy ? "Cropping…" : "Crop & upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
