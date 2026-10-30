import { useState } from "react";
import { previewUrl, uploadImage } from "../../api/github";
import { CATEGORIES, COLLECTIONS } from "../../data/products";

const PSTATUSES = ["draft", "published", "archived"];

const emptyProduct = () => ({
  id: "",
  slug: "",
  name: "",
  category: "necklaces",
  collection: "gold-plated",
  plating: "22K Gold Plated",
  metal: "",
  purity: "",
  stones: "",
  size: "",
  price: 799,
  mrp: 1499,
  makingCharges: 0,
  stock: 10,
  lowStockThreshold: 5,
  trackInventory: true,
  badge: "New",
  tag: "",
  customTag: "",
  bestseller: false,
  newArrival: true,
  featured: false,
  rating: 0,
  reviews: 0,
  description: "",
  status: "published",
  images: [],
});

const normalizeId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const fromProduct = (p) => ({
  ...emptyProduct(),
  ...p,
  description: p?.desc || p?.description || "",
  images: Array.isArray(p?.images)
    ? p.images.map((image) => (typeof image === "string" ? image : image?.url)).filter(Boolean)
    : [],
  stock: p?.stock ?? 0,
  lowStockThreshold: p?.lowStockThreshold ?? 5,
  trackInventory: p?.trackInventory !== false,
});

export default function ProductForm({ product, products, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => fromProduct(product));
  const [uploading, setUploading] = useState(0);
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const set = (patch) => {
    setError("");
    setFlash("");
    setForm((current) => ({ ...current, ...patch }));
  };

  const addFiles = async (files) => {
    if (!files?.length) return;
    const room = Math.max(0, 6 - form.images.length);
    const chosen = Array.from(files).slice(0, room);
    if (!chosen.length) return;
    setError("");
    setFlash("");
    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const { url } = await uploadImage(file);
        setForm((current) => ({
          ...current,
          images: [...current.images, url].slice(0, 6),
        }));
        setFlash("Image uploaded ✓");
      } catch (ex) {
        setError(ex.message);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
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

    const id = normalizeId(form.id || form.name);
    if (!id) {
      setError("Enter a product ID using letters and numbers.");
      return;
    }
    const duplicate = products.some((p) => p.id === id && p.id !== product?.id);
    if (duplicate) {
      setError(`Product ID "${id}" is already used by another product.`);
      return;
    }

    const payload = {
      ...product,
      id,
      slug: form.slug?.trim() || id,
      name: form.name.trim(),
      category: form.category,
      collection: form.collection,
      plating: form.plating || "",
      metal: form.metal || "",
      purity: form.purity || "",
      stones: form.stones || "",
      size: form.size || "",
      price: Math.max(0, Number(form.price) || 0),
      mrp: Math.max(0, Number(form.mrp) || 0),
      makingCharges: Math.max(0, Number(form.makingCharges) || 0),
      stock: Math.max(0, Number(form.stock) || 0),
      lowStockThreshold: Math.max(0, Number(form.lowStockThreshold) || 0),
      trackInventory: Boolean(form.trackInventory),
      badge: form.badge || "",
      tag: form.tag || "",
      customTag: form.customTag?.trim() || "",
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
          value={form.id}
          maxLength={60}
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>Category</label>
            <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Collection</label>
            <select value={form.collection} onChange={(e) => set({ collection: e.target.value })}>
              {COLLECTIONS.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label>Plating</label><input value={form.plating} onChange={(e) => set({ plating: e.target.value })} /></div>
          <div><label>Stones</label><input value={form.stones} onChange={(e) => set({ stones: e.target.value })} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><label>Price ₹</label><input type="number" min="0" value={form.price} onChange={(e) => set({ price: e.target.value })} /></div>
          <div><label>MRP ₹</label><input type="number" min="0" value={form.mrp} onChange={(e) => set({ mrp: e.target.value })} /></div>
          <div><label>Stock</label><input type="number" min="0" value={form.stock} disabled={!form.trackInventory} onChange={(e) => set({ stock: e.target.value })} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label>Badge</label><input value={form.badge} maxLength={40} placeholder="e.g. New, Bestseller" onChange={(e) => set({ badge: e.target.value })} /></div>
          <div>
            <label>Status</label>
            <select value={form.status || "draft"} onChange={(e) => set({ status: e.target.value })}>
              {PSTATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="b1g1-toggle">
          <input type="checkbox" checked={form.tag === "B1G1 Free"} onChange={(e) => set({ tag: e.target.checked ? "B1G1 Free" : "" })} />
          <span className="track"><span className="knob" /></span>
          <span className="t">B1G1 Free — show buy-one-get-one badge on this product</span>
        </label>
        <label className="b1g1-toggle">
          <input type="checkbox" checked={Boolean(form.bestseller)} onChange={(e) => set({ bestseller: e.target.checked })} />
          <span className="track"><span className="knob" /></span>
          <span className="t">Best Seller — listed under Best Sellers and ranked first on the home page</span>
        </label>
        <label className="b1g1-toggle">
          <input type="checkbox" checked={Boolean(form.newArrival)} onChange={(e) => set({ newArrival: e.target.checked })} />
          <span className="track"><span className="knob" /></span>
          <span className="t">New — listed under New Launches</span>
        </label>

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

        <label>Photos — from your phone / PC (up to 6, saved in the repository)</label>
        <div className="photo-grid">
          {form.images.map((image, i) => (
            <span key={`${image}-${i}`} className="photo-thumb">
              <img src={previewUrl(image)} alt={`photo ${i + 1}`} />
              <button type="button" onClick={() => removeImage(i)} aria-label="remove photo">✕</button>
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
          <label className="b1g1-toggle">
            <input type="checkbox" checked={Boolean(form.trackInventory)} onChange={(e) => set({ trackInventory: e.target.checked })} />
            <span className="track"><span className="knob" /></span>
            <span className="t">Track stock — turn off to sell without a stock count</span>
          </label>
          <label className="b1g1-toggle">
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
    </>
  );
}
