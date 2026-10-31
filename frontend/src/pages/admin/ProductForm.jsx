import { useRef, useState } from "react";
import ImageCropper from "../../components/ImageCropper";
import { previewUrl, uploadImage } from "../../api/github";
import { listCategories, slugify } from "../../data/categories";
import { findIdClash, normalizeId } from "../../data/productId";

const PSTATUSES = ["draft", "published", "archived"];

// Merchandising attributes retired on request; an old catalogue entry that still
// carries them must not keep them through the next save.
const RETIRED_KEYS = ["collection", "plating", "stones", "badge", "tag"];

const emptyProduct = () => ({
  id: "",
  slug: "",
  name: "",
  category: "",
  metal: "",
  purity: "",
  size: "",
  price: 799,
  mrp: 1499,
  makingCharges: 0,
  stock: 10,
  lowStockThreshold: 5,
  trackInventory: true,
  customTag: "",
  chainOption: false,
  chainCharge: 200,
  bestseller: false,
  newArrival: true,
  featured: false,
  rating: 0,
  reviews: 0,
  description: "",
  status: "published",
  images: [],
});

const fromProduct = (product) => {
  // Retired attributes are dropped here as well as in the payload, so an old
  // catalogue entry never carries them back into the form.
  const rest = { ...product };
  RETIRED_KEYS.forEach((key) => delete rest[key]);
  return {
    ...emptyProduct(),
    ...rest,
    // The dropdown is keyed by the stored slug, so a legacy category the shop
    // no longer lists still round-trips instead of being silently renamed.
    category: slugify(rest.category),
    description: rest.desc || rest.description || "",
    images: Array.isArray(rest.images)
      ? rest.images.map((image) => (typeof image === "string" ? image : image?.url)).filter(Boolean)
      : [],
    // A product saved before stock tracking opened at 0, which turned into
    // "Sold out" the moment the merchant pressed Save. Open at the new-product
    // default instead; the merchant can still set a real count.
    stock: rest.stock ?? emptyProduct().stock,
    lowStockThreshold: rest.lowStockThreshold ?? 5,
    trackInventory: rest.trackInventory !== false,
    // A product that never had the switch configured opens the form at ₹200.
    chainCharge: rest.chainCharge != null && Number.isFinite(Number(rest.chainCharge)) ? Number(rest.chainCharge) : 200,
  };
};

export default function ProductForm({ product, products, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => fromProduct(product));
  const [uploading, setUploading] = useState(0);
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [cropJob, setCropJob] = useState(null);
  const idRef = useRef(null);

  // Your shop's sections, plus any older category a product still carries so
  // editing that piece never renames it by accident.
  const categoryChoices = listCategories(products);

  // A blank ID is generated from the name, so the clash is tested against what
  // would actually be saved, not only against what has been typed so far.
  const idClash = findIdClash(products, form.id || form.name, product?.id);

  const set = (patch) => {
    setError("");
    setFlash("");
    setForm((current) => ({ ...current, ...patch }));
  };

  const addFiles = (files) => {
    const room = Math.max(0, 6 - form.images.length);
    const chosen = Array.from(files || []).slice(0, room);
    if (!chosen.length) return;
    setError("");
    setFlash("");
    nextCrop(chosen);
  };

  /** Puts a finished upload in its slot, or appends it when the slot is blank. */
  const putPhoto = (url, slot) => {
    setForm((current) => ({
      ...current,
      images:
        slot == null
          ? [...current.images, url].slice(0, 6)
          : current.images.map((image, i) => (i === slot ? url : image)),
    }));
  };

  const commitPhoto = async (file, slot, queue = []) => {
    setUploading((n) => n + 1);
    try {
      const { url } = await uploadImage(file);
      putPhoto(url, slot);
      setFlash("Image uploaded ✓");
    } catch (ex) {
      setError(ex.message);
    } finally {
      setUploading((n) => Math.max(0, n - 1));
    }
    nextCrop(queue);
  };

  /**
   * Opens the crop frame for the next chosen photo. Animated GIFs are passed
   * straight through because cropping would flatten them to one frame.
   */
  const nextCrop = (queue) => {
    const [file, ...rest] = queue || [];
    if (!file) {
      setCropJob(null);
      return;
    }
    if (file.type === "image/gif") {
      commitPhoto(file, null, rest);
      return;
    }
    setCropJob({ photo: file, queue: rest, slot: null, title: `Crop ${file.name || "photo"}` });
  };

  const skipCrop = () => {
    const job = cropJob;
    if (!job) return;
    setCropJob(null);
    // An existing photo left alone is simply not re-uploaded.
    if (job.slot == null) commitPhoto(job.photo, null, job.queue);
  };

  const cancelCrop = () => {
    setCropJob(null);
    setFlash("");
  };

  const applyCrop = (file) => {
    const job = cropJob;
    setCropJob(null);
    commitPhoto(file, job?.slot, job?.queue || []);
  };

  /** Re-frames a photo that is already on the product. */
  const cropExisting = async (index) => {
    setError("");
    const image = form.images[index];
    try {
      const response = await fetch(previewUrl(image));
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const name = String(image).split("/").pop() || `photo-${index + 1}`;
      setCropJob({
        photo: new File([blob], name, { type: blob.type || "image/webp" }),
        queue: [],
        slot: index,
        title: `Crop photo ${index + 1}`,
      });
    } catch {
      setError("Couldn't open that photo to crop it. If it is a pasted link, the other site may block downloads.");
    }
  };

  const removeImage = (index) => {
    setForm((current) => ({ ...current, images: current.images.filter((_, i) => i !== index) }));
    setFlash("Image removed from this product. The file stays in the repo.");
  };

  const addUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    if (form.images.length >= 6) {
      setError("Up to 6 photos per product.");
      return;
    }
    setForm((current) => ({ ...current, images: [...current.images, url].slice(0, 6) }));
    setUrlDraft("");
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setFlash("");

    if (uploading > 0) {
      setError("Please wait for the image uploads to finish.");
      return;
    }
    if (!form.name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!form.images.length) {
      setError("Add at least one photo.");
      return;
    }
    const category = slugify(form.category);
    if (!category) {
      setError("Pick the category this piece belongs to — it decides where it appears in the shop menu.");
      return;
    }

    const id = normalizeId(form.id || form.name);
    if (!id) {
      setError("Enter a product ID using letters and numbers.");
      return;
    }
    if (idClash) {
      // The reason already sits under the ID field, so bring it into view
      // instead of repeating it at the bottom of the form.
      idRef.current?.focus();
      idRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const payload = {
      ...product,
      id,
      slug: form.slug?.trim() || id,
      name: form.name.trim(),
      category,
      metal: form.metal || "",
      purity: form.purity || "",
      size: form.size || "",
      price: Math.max(0, Number(form.price) || 0),
      mrp: Math.max(0, Number(form.mrp) || 0),
      makingCharges: Math.max(0, Number(form.makingCharges) || 0),
      stock: Math.max(0, Number(form.stock) || 0),
      lowStockThreshold: Math.max(0, Number(form.lowStockThreshold) || 0),
      trackInventory: Boolean(form.trackInventory),
      customTag: form.customTag?.trim() || "",
      chainOption: Boolean(form.chainOption),
      chainCharge: form.chainOption ? Math.max(0, Math.round(Number(form.chainCharge) || 0)) : 0,
      bestseller: Boolean(form.bestseller),
      newArrival: Boolean(form.newArrival),
      featured: Boolean(form.featured),
      rating: Math.min(5, Math.max(0, Number(form.rating) || 0)),
      reviews: Math.max(0, Number(form.reviews) || 0),
      images: form.images,
      desc: form.description || "",
      status: form.status || "draft",
    };
    delete payload.description;
    RETIRED_KEYS.forEach((key) => delete payload[key]);

    try {
      await onSave(payload, product);
    } catch (ex) {
      setError(ex.message);
    }
  };

  return (
    <>
      <div className="overlay" onClick={() => !saving && onClose()} />
      <form className="form admin-modal" onSubmit={submit}>
        <h3 className="serif" style={{ margin: 0, fontSize: 28 }}>
          {product ? "Edit product" : "Add product"}
        </h3>
        {flash && <p style={{ color: "var(--green)", fontSize: 13, margin: "8px 0 0" }}>{flash}</p>}

        <label>Name</label>
        <input
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Rajwadi Kundan Pearl Choker"
          required
        />

        <label htmlFor="productId">Product ID — the code customers send on WhatsApp</label>
        <input
          id="productId"
          ref={idRef}
          value={form.id}
          maxLength={60}
          aria-invalid={idClash ? "true" : undefined}
          placeholder={product ? "" : "e.g. nl-001 — leave blank to generate from the name"}
          onChange={(e) => set({ id: e.target.value })}
        />
        <small className="custom-tag-hint">
          Shown on the product page and included in every “Buy Now” WhatsApp message. Letters, numbers and dashes
          only (spaces become dashes, lower-case).
          {product && form.id && form.id !== product.id
            ? " Changing it also changes the product link — old links will stop working."
            : ""}
        </small>
        {idClash && (
          <p className="auth-err" style={{ margin: "6px 0 0" }}>
            Product ID “{idClash}” is already used by another product — pick a different one.
          </p>
        )}

        <label htmlFor="productCategory">Category — where this piece appears in the shop</label>
        <select id="productCategory" value={form.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">Choose a category…</option>
          {categoryChoices.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <small className="custom-tag-hint">
          These are your shop's sections — the one you pick gets its own menu entry, filter and home page tile.
          {form.category ? ` Shop link: /shop?cat=${slugify(form.category)}` : ""}
        </small>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><label>Price ₹</label><input type="number" min="0" value={form.price} onChange={(e) => set({ price: e.target.value })} /></div>
          <div><label>MRP ₹</label><input type="number" min="0" value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} /></div>
          <div><label>Stock</label><input type="number" min="0" value={form.stock} disabled={!form.trackInventory} onChange={(e) => set({ stock: e.target.value })} /></div>
        </div>

        <label>Status</label>
        <select value={form.status || "draft"} onChange={(e) => set({ status: e.target.value })}>
          {PSTATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label className="switch-row">
          <input type="checkbox" checked={Boolean(form.bestseller)} onChange={(e) => set({ bestseller: e.target.checked })} />
          <span className="track"><span className="knob" /></span>
          <span className="t">Best Seller — listed under Best Sellers and ranked first on the home page</span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={Boolean(form.newArrival)} onChange={(e) => set({ newArrival: e.target.checked })} />
          <span className="track"><span className="knob" /></span>
          <span className="t">New — listed under New Launches</span>
        </label>

        <label className="switch-row">
          <input type="checkbox" checked={Boolean(form.chainOption)} onChange={(e) => set({ chainOption: e.target.checked })} />
          <span className="track"><span className="knob" /></span>
          <span className="t">Chain choice — shoppers pick “With chain” or “Without chain” on this product's page</span>
        </label>
        {form.chainOption && (
          <>
            <label htmlFor="chainCharge">Chain costs extra ₹</label>
            <input
              id="chainCharge"
              type="number"
              min="0"
              style={{ maxWidth: 180 }}
              value={form.chainCharge}
              onChange={(e) => set({ chainCharge: e.target.value })}
            />
            <small className="custom-tag-hint">
              Shows as “With chain (+₹{Math.max(0, Math.round(Number(form.chainCharge) || 0))})” on the product page.
              Until the shopper picks one, Buy Now stays locked, and their pick plus the total price are written into
              the WhatsApp message you receive.
            </small>
          </>
        )}

        <div className="custom-tag-field">
          <label htmlFor="customTag">Custom label — name it yourself (optional)</label>
          <div className="custom-tag-row">
            <input
              id="customTag"
              list="custom-tag-options"
              maxLength={40}
              placeholder="e.g. Festive Edit, Rakhi Special, Under ₹499"
              value={form.customTag || ""}
              onChange={(e) => set({ customTag: e.target.value })}
            />
            {form.customTag ? (
              <button type="button" className="mini-btn" onClick={() => set({ customTag: "" })}>Clear</button>
            ) : null}
          </div>
          <datalist id="custom-tag-options">
            {[...new Set(products.map((p) => (p.customTag || "").trim()).filter(Boolean))].map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          <small className="custom-tag-hint">
            Shows as a gold badge on the product card and gets its own filter in the shop
            {form.customTag ? ` — customers can browse “${form.customTag.trim()}”.` : "."}
          </small>
        </div>

        <label>Photos — from your phone / PC (up to 6, each backed up automatically)</label>
        <div className="photo-grid">
          {form.images.map((image, i) => (
            <span key={`${image}-${i}`} className="photo-thumb">
              <img src={previewUrl(image)} alt={`photo ${i + 1}`} />
              <button type="button" onClick={() => removeImage(i)} aria-label={`remove photo ${i + 1}`}>✕</button>
              <button type="button" className="crop-btn" onClick={() => cropExisting(i)}>Crop</button>
              {i === 0 && <em>Cover</em>}
            </span>
          ))}
          {form.images.length < 6 && (
            <label className="upload-tile">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <b>{uploading > 0 ? "…" : "+"}</b>
              <small>{uploading > 0 ? `Uploading ${uploading}` : "Add photo"}</small>
            </label>
          )}
        </div>
        {error && <p className="auth-err">{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            placeholder="…or paste an image link (ImageKit / any public URL)"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="mini-btn" onClick={addUrl}>Add</button>
        </div>

        <label>Description</label>
        <textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />

        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", color: "var(--maroon)", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>
            More details
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label>Metal</label><input value={form.metal} onChange={(e) => set({ metal: e.target.value })} /></div>
            <div><label>Size</label><input value={form.size} onChange={(e) => set({ size: e.target.value })} /></div>
            <div><label>Purity</label><input value={form.purity} onChange={(e) => set({ purity: e.target.value })} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label>Low-stock warning at</label><input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set({ lowStockThreshold: e.target.value })} /></div>
            <div><label>Rating (0–5)</label><input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(e) => set({ rating: e.target.value })} /></div>
            <div><label>Review count</label><input type="number" min="0" value={form.reviews} onChange={(e) => set({ reviews: e.target.value })} /></div>
          </div>
          <label className="switch-row">
            <input type="checkbox" checked={Boolean(form.trackInventory)} onChange={(e) => set({ trackInventory: e.target.checked })} />
            <span className="track"><span className="knob" /></span>
            <span className="t">Track stock — turn off to sell without a stock count</span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={Boolean(form.featured)} onChange={(e) => set({ featured: e.target.checked })} />
            <span className="track"><span className="knob" /></span>
            <span className="t">Featured — include in curated featured lists</span>
          </label>
        </details>

        <div className="cta-row">
          <button className="btn btn-gold" type="submit" disabled={saving || uploading > 0}>
            {saving ? "Saving…" : uploading > 0 ? "Uploading images…" : "Save Product"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
      {cropJob && (
        <ImageCropper
          photo={cropJob.photo}
          title={cropJob.title}
          onCancel={cancelCrop}
          onSkip={skipCrop}
          onApply={applyCrop}
        />
      )}
    </>
  );
}
