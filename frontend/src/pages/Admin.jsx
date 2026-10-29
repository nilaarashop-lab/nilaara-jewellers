import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORIES, COLLECTIONS, formatINR } from "../data/products";
import {
  adminListProducts,
  adminListOrders,
  adminUpdateOrderStatus,
  adminSaveProduct,
  adminDeleteProduct,
  adminStats,
  adminUploadImages,
  adminFetchSettings,
  adminSaveSettings,
  adminListPromos,
  adminCreatePromo,
  adminUpdatePromo,
  adminDeletePromo,
  authLogin,
  hasAPI,
} from "../api/client";
import { useAuth } from "../store/AuthContext";
import { Img } from "../components/Layout";

const STATUSES = ["placed", "packed", "shipped", "delivered", "cancelled"];
const PSTATUSES = ["draft", "published", "archived"];

const emptyProduct = () => ({
  name: "",
  category: "necklaces",
  collection: "gold-plated",
  plating: "18K Gold Plated",
  stones: "",
  price: 799,
  mrp: 1499,
  stock: 10,
  badge: "New",
  tag: "",
  customTag: "",
  bestseller: false,
  newArrival: true,
  description: "",
  status: "published",
  images: [], // [{url, publicId, alt}]
});

function Login({ onOk }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="container">
      <div className="sec">
        <form
          className="form admin-login"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            setBusy(true);
            try {
              const { user } = await authLogin({ id: id.trim(), password: pw });
              if (hasAPI && !["admin", "staff"].includes(user.role)) {
                setErr("This account does not have admin access.");
              } else {
                onOk(user);
              }
            } catch (ex) {
              setErr(ex.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">Nilaara • Admin</span>
          <h2 className="serif" style={{ fontSize: 38, margin: "8px 0" }}>Control centre</h2>
          <p style={{ color: "var(--ink-soft)" }}>
            Sign in with your staff account to manage products, images, orders and store data.{" "}
            {hasAPI ? "Secured by the backend — sessions are server-side." : "Demo mode — backend not connected."}
          </p>
          <label>Email or mobile</label>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="admin@example.com" required />
          <label>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required />
          {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
          <button className="btn btn-gold" style={{ marginTop: 14 }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in →"}
          </button>
          {hasAPI && (
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 12 }}>
              First admin? Run <code>npm run create-admin</code> in <code>backend/</code> once.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b>{value}</b>
      <span>{sub}</span>
    </div>
  );
}

export default function Admin() {
  const { user, setUser, logout } = useAuth();
  const authed = Boolean(user) && (!hasAPI || ["admin", "staff"].includes(user.role));
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");
  const [editing, setEditing] = useState(null); // "new" | product id
  const [form, setForm] = useState(emptyProduct());
  const [current, setCurrent] = useState(null); // product doc being edited
  const [uploading, setUploading] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  // Labels already used by other products, offered as suggestions.
  const labelOptions = useMemo(
    () => [...new Set(products.map((p) => (p.customTag || "").trim()).filter(Boolean))],
    [products]
  );

  const load = async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const [p, o, s] = await Promise.all([adminListProducts(), adminListOrders(), adminStats()]);
      setProducts(p);
      setOrders(o);
      setStats(s);
    } catch (ex) {
      setLoadErr(ex.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const filteredProducts = useMemo(() => {
    const s = q.toLowerCase();
    return products.filter((p) => !s || (p.name + p.category + p.collection).toLowerCase().includes(s));
  }, [products, q]);
  const filteredOrders = useMemo(() => {
    const s = q.toLowerCase();
    return orders.filter(
      (o) => (!statusF || (o.status || "placed") === statusF) && (!s || JSON.stringify(o).toLowerCase().includes(s))
    );
  }, [orders, q, statusF]);

  if (!authed) return <Login onOk={(u) => setUser(u)} />;

  const openEdit = (p) => {
    setEditing(p ? p.id || p._id : "new");
    setCurrent(p || null);
    setForm(
      p
        ? {
            ...p,
            stock: p.stock ?? 0,
            description: p.desc || p.description || "",
            images: (p.imageMeta || (p.images || []).map((url) => ({ url, publicId: "", alt: "" }))).slice(0, 6),
          }
        : emptyProduct()
    );
    setUrlDraft("");
    setUploadErr("");
    setFlash("");
  };

  const onDeviceFiles = async (files) => {
    if (!files?.length) return;
    setUploadErr("");
    setUploading(files.length);
    try {
      const uploaded = await adminUploadImages(files); // → [{url, publicId, alt}] (ImageKit via backend)
      setForm((f) => ({ ...f, images: [...(f.images || []), ...uploaded].slice(0, 6) }));
      setFlash(`Uploaded ${uploaded.length} image${uploaded.length > 1 ? "s" : ""} ✓`);
    } catch (ex) {
      setUploadErr(ex.message);
    } finally {
      setUploading(0);
    }
  };

  const removeImage = (i) => {
    setForm((f) => ({ ...f, images: f.images.filter((_, x) => x !== i) }));
    setFlash("Image removed — it will be deleted from storage when you save (unless another product or order still uses it).");
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    if (uploading > 0) return setUploadErr("Please wait for the image uploads to finish.");
    const images = (form.images || []).filter((i) => i && i.url);
    if (!form.name || images.length === 0) return setUploadErr("Name and at least one uploaded image are required.");
    setSaving(true);
    setUploadErr("");
    try {
      await adminSaveProduct({ ...form, images, id: form.id || current?.id, _id: current?._id });
      setFlash("Product saved ✓");
      setEditing(null);
      await load();
    } catch (ex) {
      setUploadErr(ex.message + (ex.details ? ` (${ex.details.map((d) => d.message).join(", ")})` : ""));
    } finally {
      setSaving(false);
    }
  };

  const setOrderStatus = async (id, s) => {
    try {
      await adminUpdateOrderStatus(id, s);
      setFlash("Order updated ✓");
      load();
    } catch (ex) {
      setFlash("");
      setLoadErr(ex.message);
    }
  };

  return (
    <main className="container">
      <div className="breadcrumb">
        <Link to="/">Home</Link> / Admin {!hasAPI && "• demo mode"} {user?.name && `• ${user.name}`}
      </div>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Nilaara control centre</span>
          <h1 className="serif">Everything, in one place.</h1>
        </div>
        <div className="cta-row" style={{ marginTop: 0 }}>
          <button className="btn btn-ghost" onClick={() => logout()}>Lock</button>
          <button className="btn btn-gold" onClick={load}>↻ Refresh</button>
        </div>
      </div>
      <div className="admin-tabs">
        {[
          ["dashboard", "Dashboard"],
          ["products", `Products (${products.length})`],
          ["orders", `Orders (${orders.length})`],
          ["homepage", "Homepage"],
          ["promos", "Promos"],
        ].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? "on" : ""}`} style={{ padding: "10px 18px" }} onClick={() => { setTab(k); setQ(""); setStatusF(""); }}>
            {l}
          </button>
        ))}
      </div>

      {flash && <p style={{ color: "var(--green)", marginTop: 12 }}>{flash}</p>}
      {loadErr && <p className="auth-err">{loadErr} <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={load}>Retry</button></p>}
      {loading && <div className="empty">Loading store data…</div>}

      {!loading && tab === "dashboard" && stats && (
        <>
          <div className="stat-grid">
            <Stat label="Revenue (excl. cancelled)" value={formatINR(stats.revenue)} sub={`${stats.orders} orders total`} />
            <Stat
              label="Orders"
              value={stats.orders}
              sub={Object.entries(stats.byStatus || {}).map(([k, v]) => `${k}: ${v}`).join(" • ") || "no orders yet"}
            />
            <Stat label="Products" value={stats.products} sub={`${CATEGORIES.length} categories • ${COLLECTIONS.length} collections`} />
            <Stat
              label="Avg. order value"
              value={stats.orders ? formatINR(Math.round(stats.revenue / Math.max(1, stats.orders))) : "—"}
              sub={hasAPI ? "MongoDB live" : "browser demo data"}
            />
          </div>
          {stats.lowStock?.length > 0 && (
            <div className="form" style={{ marginTop: 18 }}>
              <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Low stock</h3>
              {stats.lowStock.map((p) => (
                <div className="row" key={p.id || p._id}>
                  <span>{p.name}</span>
                  <span>{p.stock} left</span>
                </div>
              ))}
            </div>
          )}
          <div className="sec-head" style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: 30 }}>Recent orders</h2>
            <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("orders")}>Manage all</button>
          </div>
          <OrdersTable orders={orders.slice(0, 5)} onStatus={setOrderStatus} />
          <div className="sec-head" style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: 30 }}>Needs restocking</h2>
            <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("products")}>Manage all</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Product</th><th>Category</th><th>Stock</th><th>Status</th></tr>
              </thead>
              <tbody>
                {[...products]
                  .filter((p) => p.trackInventory !== false && p.stock != null)
                  .sort((a, b) => a.stock - b.stock)
                  .slice(0, 5)
                  .map((p) => (
                    <tr key={p.id || p._id}>
                      <td><b>{p.name}</b><br /><small>{p.collection} • {p.plating}</small></td>
                      <td>{p.category}</td>
                      <td>{p.stock <= 5 ? `⚠ ${p.stock}` : p.stock}</td>
                      <td>{p.status || "published"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === "products" && (
        <>
          <div className="toolbar">
            <input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn btn-gold" style={{ padding: "11px 22px" }} onClick={() => openEdit(null)}>+ Add Product</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th></th><th>Product</th><th>Category</th><th>Price / MRP</th><th>Stock</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id || p._id}>
                    <td><Img src={p.images?.[0]} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} /></td>
                    <td><b>{p.name}</b><br /><small>{p.collection}</small></td>
                    <td>{p.category}</td>
                    <td>{formatINR(p.price)} <s>{formatINR(p.mrp || p.price)}</s></td>
                    <td>{p.trackInventory === false || p.stock == null ? "—" : p.stock <= 5 ? `⚠ ${p.stock}` : p.stock}</td>
                    <td>{p.status || "published"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="mini-btn" onClick={() => openEdit(p)}>Edit</button>
                      <button className="mini-btn" onClick={() => window.open(`/product/${p.id || p._id}`, "_blank")}>Preview</button>
                      <button
                        className="mini-btn danger"
                        onClick={async () => {
                          if (confirm(`Delete "${p.name}"? Its images are removed only if nothing else uses them.`)) {
                            try {
                              await adminDeleteProduct(p.id || p._id);
                              load();
                            } catch (ex) {
                              setLoadErr(ex.message);
                            }
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProducts.length === 0 && <div className="empty">No products match.</div>}
        </>
      )}

      {!loading && tab === "orders" && (
        <>
          <div className="toolbar">
            <input placeholder="Search orders (name, phone, id)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <OrdersTable orders={filteredOrders} full onStatus={setOrderStatus} />
          {filteredOrders.length === 0 && <div className="empty">No orders yet — place a test order from the shop to see it here.</div>}
        </>
      )}

      {!loading && tab === "homepage" && (hasAPI ? <HomepageEditor /> : <div className="empty">Homepage editing needs the backend — connect VITE_API_URL and refresh.</div>)}
      {!loading && tab === "promos" && (hasAPI ? <PromoEditor /> : <div className="empty">Promo codes need the backend — connect VITE_API_URL and refresh.</div>)}

      {editing && (
        <>
          <div className="overlay" onClick={() => setEditing(null)} />
          <form className="form admin-modal" onSubmit={saveProduct}>
            <h3 className="serif" style={{ margin: 0, fontSize: 28 }}>{editing === "new" ? "Add product" : "Edit product"}</h3>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Collection</label>
                <select value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })}>
                  {COLLECTIONS.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label>Plating</label><input value={form.plating} onChange={(e) => setForm({ ...form, plating: e.target.value })} /></div>
              <div><label>Stones</label><input value={form.stones} onChange={(e) => setForm({ ...form, stones: e.target.value })} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label>Price ₹</label><input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><label>MRP ₹</label><input type="number" min="0" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></div>
              <div><label>Stock</label><input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label>Badge</label><input value={form.badge} maxLength={40} placeholder="e.g. New, Bestseller" onChange={(e) => setForm({ ...form, badge: e.target.value })} /></div>
              <div>
                <label>Status</label>
                <select value={form.status || "draft"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {PSTATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="b1g1-toggle">
              <input type="checkbox" checked={form.tag === "B1G1 Free"} onChange={(e) => setForm({ ...form, tag: e.target.checked ? "B1G1 Free" : "" })} />
              <span className="track"><span className="knob" /></span>
              <span className="t">B1G1 Free — show buy-one-get-one badge on this product</span>
            </label>
            <label className="b1g1-toggle">
              <input type="checkbox" checked={Boolean(form.bestseller)} onChange={(e) => setForm({ ...form, bestseller: e.target.checked })} />
              <span className="track"><span className="knob" /></span>
              <span className="t">Best Seller — listed under Best Sellers and ranked first on the home page</span>
            </label>
            <label className="b1g1-toggle">
              <input type="checkbox" checked={Boolean(form.newArrival)} onChange={(e) => setForm({ ...form, newArrival: e.target.checked })} />
              <span className="track"><span className="knob" /></span>
              <span className="t">New — listed under New Launches</span>
            </label>

            {/* Admin-named merchandising label — like the flags above, but you choose the name. */}
            <div className="custom-tag-field">
              <label htmlFor="customTag">Custom label — name it yourself (optional)</label>
              <div className="custom-tag-row">
                <input
                  id="customTag"
                  list="custom-tag-options"
                  maxLength={40}
                  placeholder="e.g. Festive Edit, Rakhi Special, Under ₹499"
                  value={form.customTag || ""}
                  onChange={(e) => setForm({ ...form, customTag: e.target.value })}
                />
                {form.customTag ? (
                  <button type="button" className="mini-btn" onClick={() => setForm({ ...form, customTag: "" })}>Clear</button>
                ) : null}
              </div>
              <datalist id="custom-tag-options">
                {labelOptions.map((l) => <option key={l} value={l} />)}
              </datalist>
              <small className="custom-tag-hint">
                Shows as a gold badge on the product card and gets its own filter in the shop
                {form.customTag ? ` — customers can browse “${form.customTag.trim()}”.` : "."}
              </small>
            </div>

            <label>Photos — from your phone / PC (up to 6, stored on ImageKit)</label>
            <div className="photo-grid">
              {(form.images || []).map((img, i) => (
                <span key={img.url || i} className="photo-thumb">
                  <img src={img.url} alt={img.alt || `photo ${i + 1}`} />
                  <button type="button" onClick={() => removeImage(i)} aria-label="remove photo">✕</button>
                  {i === 0 && <em>Cover</em>}
                </span>
              ))}
              {(form.images || []).length < 6 && (
                <label className="upload-tile">
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { onDeviceFiles(e.target.files); e.target.value = ""; }} />
                  <b>{uploading > 0 ? "…" : "+"}</b>
                  <small>{uploading > 0 ? `Uploading ${uploading}` : "Add photo"}</small>
                </label>
              )}
            </div>
            {uploadErr && <p className="auth-err">{uploadErr}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input placeholder="…or paste an approved image link (ImageKit)" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (urlDraft.trim()) {
                    setForm({ ...form, images: [...(form.images || []), { url: urlDraft.trim(), publicId: "", alt: "" }].slice(0, 6) });
                    setUrlDraft("");
                  }
                }}
              >
                Add
              </button>
            </div>
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="cta-row">
              <button className="btn btn-gold" type="submit" disabled={saving || uploading > 0}>
                {saving ? "Saving…" : uploading > 0 ? "Uploading images…" : "Save Product"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Promo codes + B1G1 switch. Promo codes live in their own collection and
   are validated on the SERVER at checkout; this tab only edits them.
   ════════════════════════════════════════════════════════════════════ */

const emptyPromo = () => ({ code: "", percent: 25, minSubtotal: 0, active: true, maxUses: "", description: "" });

function PromoEditor() {
  const [list, setList] = useState(null);
  const [b1g1, setB1g1] = useState(null); // settings.coupons.b1g1.enabled
  const [form, setForm] = useState(emptyPromo());
  const [editing, setEditing] = useState(null); // code being edited, "new" = adding, null = closed
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr("");
    try {
      const [promos, settings] = await Promise.all([adminListPromos(), adminFetchSettings()]);
      setList(promos);
      setB1g1(Boolean(settings.coupons?.b1g1?.enabled));
    } catch (ex) {
      setErr(ex.message);
    }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (p) => {
    setEditing(p ? p.code : "new");
    setForm(
      p
        ? { code: p.code, percent: p.percent, minSubtotal: p.minSubtotal || 0, active: p.active, maxUses: p.maxUses ?? "", description: p.description || "" }
        : emptyPromo()
    );
    setFlash("");
    setErr("");
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setFlash("");
    const body = {
      percent: +form.percent,
      minSubtotal: +form.minSubtotal || 0,
      active: form.active,
      maxUses: form.maxUses === "" ? null : +form.maxUses,
      description: form.description,
    };
    const isNew = editing === "new";
    try {
      if (isNew) await adminCreatePromo({ code: form.code, ...body });
      else await adminUpdatePromo(editing, body);
      setFlash(`${isNew ? `Promo ${form.code.trim().toUpperCase()} created` : `Promo ${editing} updated`} ✓ — visible to customers immediately.`);
      setEditing(null);
      setForm(emptyPromo());
      await load();
    } catch (ex) {
      setErr(ex.message + (ex.details ? ` (${ex.details.map((d) => d.message).join(", ")})` : ""));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p) => {
    setErr("");
    try {
      await adminUpdatePromo(p.code, { active: !p.active });
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const remove = async (code) => {
    if (!confirm(`Delete promo code "${code}"? Customers who used it keep their discounts — only new checkouts are affected.`)) return;
    setErr("");
    try {
      await adminDeletePromo(code);
      setFlash(`Promo ${code} deleted ✓`);
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const saveB1G1 = async (enabled) => {
    setErr("");
    setFlash("");
    try {
      await adminSaveSettings({ coupons: { b1g1: { enabled } } });
      window.dispatchEvent(new Event("nilaara:settings-updated"));
      setB1g1(enabled);
      setFlash(enabled ? "B1G1 is now ON — it applies to products tagged “B1G1 Free” only." : "B1G1 is now OFF — every tagged product sells at its normal price.");
    } catch (ex) {
      setErr(ex.message);
      load();
    }
  };

  if (!list && !err) return <div className="empty">Loading promo codes…</div>;
  if (err && !list) {
    return (
      <div className="empty" role="alert">
        <h3 className="serif">Couldn't load promo codes</h3>
        <p>{err}</p>
        <br />
        <button className="btn btn-gold" onClick={load}>Try again</button>
      </div>
    );
  }

  return (
    <div className="hp-editor">
      {flash && <p style={{ color: "var(--green)", marginTop: 12 }}>{flash}</p>}
      {err && <p className="auth-err">{err}</p>}

      {/* ── B1G1 master switch ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Buy 1 Get 1 Free (site-wide)</h3>
          <label className="hp-toggle">
            <input type="checkbox" checked={b1g1 === true} disabled={b1g1 == null} onChange={(e) => saveB1G1(e.target.checked)} />
            {b1g1 ? "ON" : "OFF"}
          </label>
        </div>
        <p className="co-note">
          When ON, every product tagged <b>B1G1 Free</b> in the Products tab gives one free item per pair (2 → pay 1, 3 → pay 2). Untagged products are never discounted. Turn each product's tag on/off in its edit form.
        </p>
      </section>

      {/* ── Promo code list ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Promo codes ({list.length})</h3>
          <button type="button" className="mini-btn" onClick={() => startEdit(null)}>+ New code</button>
        </div>
        <p className="co-note">Codes appear as chips in the bag, cart and checkout. The server re-checks every code when an order is placed.</p>

        {list.length === 0 && <p className="co-note">No promo codes yet — add one (e.g. FLAT25).</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Used</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.code}>
                  <td><b>{p.code}</b>{p.description ? <><br /><small>{p.description}</small></> : null}</td>
                  <td>{p.percent}% off</td>
                  <td>{p.minSubtotal > 0 ? formatINR(p.minSubtotal) : "—"}</td>
                  <td>{p.maxUses != null ? `${p.timesUsed}/${p.maxUses}` : p.timesUsed}</td>
                  <td>
                    <label className="hp-toggle" title={p.active ? "Click to deactivate" : "Click to activate"}>
                      <input type="checkbox" checked={p.active} onChange={() => toggleActive(p)} />
                      {p.active ? "On" : "Off"}
                    </label>
                  </td>
                  <td>
                    <button type="button" className="mini-btn" onClick={() => startEdit(p)}>Edit</button>
                    <button type="button" className="mini-btn danger" onClick={() => remove(p.code)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Add / edit form ── */}
        {editing && (
          <form onSubmit={save} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <h4 className="serif" style={{ margin: "0 0 10px", fontSize: 18 }}>{editing === "new" ? "New promo code" : `Edit ${editing}`}</h4>
            <label>Code</label>
            <input
              value={form.code}
              disabled={editing !== "new"}
              maxLength={20}
              required
              placeholder="e.g. FLAT25"
              style={{ textTransform: "uppercase" }}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Discount %</label>
                <input type="number" min={1} max={90} value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
              </div>
              <div>
                <label>Minimum subtotal (₹, 0 = none)</label>
                <input type="number" min={0} value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label>Max uses (empty = unlimited)</label>
                <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
              </div>
              <div>
                <label>Description (optional)</label>
                <input value={form.description} maxLength={120} placeholder="e.g. Festive launch offer" onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <label className="b1g1-toggle" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span className="track"><span className="knob" /></span>
              <span className="t">Active — show this code to customers</span>
            </label>
            <div className="cta-row" style={{ marginTop: 12 }}>
              <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Saving…" : editing === "new" ? "Create code" : "Save changes"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(emptyPromo()); setErr(""); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Homepage editor — announcement marquee + hero slides + promo cards +
   festive banner. Images go through the SAME ImageKit upload endpoint as
   product photos (never arbitrary URLs; the server re-validates on save).
   ════════════════════════════════════════════════════════════════════ */

const emptySlide = () => ({ image: { url: "", publicId: "", alt: "" }, eyebrow: "", title: "", highlight: "", text: "", active: true });
const emptyCard = () => ({ image: { url: "", publicId: "", alt: "" }, eyebrow: "", title: "", text: "", to: "/shop", linkLabel: "Shop now →", active: true });

/** One image slot: preview + upload button + remove (ImageKit via backend). */
function ImageSlot({ image, onChange, busy, onBusy, onError, label = "Upload image" }) {
  const pick = async (file) => {
    if (!file) return;
    onBusy(true);
    onError("");
    try {
      const [up] = await adminUploadImages([file]); // → {url, publicId, alt}
      onChange({ url: up.url, publicId: up.publicId, alt: up.alt || "" });
    } catch (ex) {
      onError(ex.message);
    } finally {
      onBusy(false);
    }
  };
  return (
    <div className="hp-imgslot">
      {image?.url ? (
        <span className="photo-thumb">
          <img src={image.url} alt={image.alt || "homepage"} />
          <button type="button" onClick={() => onChange({ url: "", publicId: "", alt: "" })} aria-label="remove image">✕</button>
        </span>
      ) : (
        <label className="upload-tile" style={{ width: 96, height: 96 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <b>{busy ? "…" : "+"}</b>
          <small>{busy ? "Uploading" : label}</small>
        </label>
      )}
    </div>
  );
}

function HomepageEditor() {
  const [doc, setDoc] = useState(null); // full editable document
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [newMsg, setNewMsg] = useState("");

  const load = async () => {
    setErr("");
    try {
      setDoc(await adminFetchSettings());
    } catch (ex) {
      setErr(ex.message);
    }
  };
  useEffect(() => { load(); }, []);

  if (err && !doc) {
    return (
      <div className="empty" role="alert">
        <h3 className="serif">Couldn't load homepage settings</h3>
        <p>{err}</p>
        <br />
        <button className="btn btn-gold" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!doc) return <div className="empty">Loading homepage settings…</div>;

  const set = (fn) => { setFlash(""); setErr(""); fn(); };

  const addMessage = () => {
    const t = newMsg.trim();
    if (!t) return;
    if (doc.announcement.messages.length >= 8) return setErr("Up to 8 marquee messages.");
    set(() => setDoc({ ...doc, announcement: { ...doc.announcement, messages: [...doc.announcement.messages, { text: t, active: true }] } }));
    setNewMsg("");
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    setFlash("");
    try {
      // Send ONLY the homepage/announcement sections — shipping, coupons and
      // tax are managed elsewhere and must not be touched by this form.
      await adminSaveSettings({ announcement: doc.announcement, home: doc.home });
      window.dispatchEvent(new Event("nilaara:settings-updated"));
      setFlash("Homepage saved ✓ — the store front updates immediately.");
    } catch (ex) {
      setErr(ex.message + (ex.details ? ` (${ex.details.map((d) => d.message).join(", ")})` : ""));
    } finally {
      setSaving(false);
    }
  };

  const slides = doc.home.heroSlides;
  const cards = doc.home.cards;

  return (
    <div className="hp-editor">
      {flash && <p style={{ color: "var(--green)", marginTop: 12 }}>{flash}</p>}
      {err && <p className="auth-err">{err}</p>}
      {imgErr && <p className="auth-err">{imgErr}</p>}

      {/* ── Announcement marquee ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Top announcement bar</h3>
          <label className="hp-toggle">
            <input type="checkbox" checked={doc.announcement.active} onChange={(e) => set(() => setDoc({ ...doc, announcement: { ...doc.announcement, active: e.target.checked } }))} />
            Visible
          </label>
        </div>
        <p className="co-note">With 2+ active messages the bar scrolls like a marquee. Inactive messages stay saved but hidden.</p>

        {doc.announcement.messages.map((m, i) => (
          <div className="hp-row" key={i}>
            <input
              value={m.text}
              maxLength={160}
              onChange={(e) => set(() => {
                const msgs = [...doc.announcement.messages];
                msgs[i] = { ...msgs[i], text: e.target.value };
                setDoc({ ...doc, announcement: { ...doc.announcement, messages: msgs } });
              })}
              placeholder="e.g. Festive B1G1 — this week only"
            />
            <label className="hp-toggle" title={m.active ? "Shown" : "Hidden"}>
              <input type="checkbox" checked={m.active} onChange={(e) => set(() => {
                const msgs = [...doc.announcement.messages];
                msgs[i] = { ...msgs[i], active: e.target.checked };
                setDoc({ ...doc, announcement: { ...doc.announcement, messages: msgs } });
              })} />
              On
            </label>
            <button type="button" className="mini-btn danger" onClick={() => set(() => setDoc({ ...doc, announcement: { ...doc.announcement, messages: doc.announcement.messages.filter((_, x) => x !== i) } }))}>✕</button>
          </div>
        ))}

        <div className="hp-row">
          <input value={newMsg} maxLength={160} onChange={(e) => setNewMsg(e.target.value)} placeholder="Add a new message…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMessage())} />
          <button type="button" className="mini-btn" onClick={addMessage}>+ Add</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
          <div>
            <label>Fallback text (desktop, no messages)</label>
            <input value={doc.announcement.text} maxLength={300} onChange={(e) => set(() => setDoc({ ...doc, announcement: { ...doc.announcement, text: e.target.value } }))} />
          </div>
          <div>
            <label>Fallback text (mobile)</label>
            <input value={doc.announcement.shortText} maxLength={120} onChange={(e) => set(() => setDoc({ ...doc, announcement: { ...doc.announcement, shortText: e.target.value } }))} />
          </div>
        </div>
      </section>

      {/* ── Hero slides ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Hero banner (rotating)</h3>
          <button type="button" className="mini-btn" disabled={slides.length >= 4 || imgBusy} onClick={() => set(() => setDoc({ ...doc, home: { ...doc.home, heroSlides: [...slides, emptySlide()] } }))}>
            + Add slide
          </button>
        </div>
        <p className="co-note">Up to 4 slides, auto-rotating every ~5s. With no slides the home page shows the built-in festive hero.</p>

        {slides.length === 0 && <p className="co-note">No slides yet — the default hero is shown. Add one to customise it.</p>}

        {slides.map((sl, i) => (
          <div className="hp-block" key={i}>
            <div className="hp-block-head">
              <b>Slide {i + 1}</b>
              <span>
                <label className="hp-toggle">
                  <input type="checkbox" checked={sl.active} onChange={(e) => set(() => { const a = [...slides]; a[i] = { ...sl, active: e.target.checked }; setDoc({ ...doc, home: { ...doc.home, heroSlides: a } }); })} />
                  Active
                </label>
                <button type="button" className="mini-btn danger" onClick={() => set(() => setDoc({ ...doc, home: { ...doc.home, heroSlides: slides.filter((_, x) => x !== i) } }))}>Remove</button>
              </span>
            </div>
            <div className="hp-block-body">
              <ImageSlot
                image={sl.image}
                busy={imgBusy}
                onBusy={setImgBusy}
                onError={setImgErr}
                onChange={(img) => set(() => { const a = [...slides]; a[i] = { ...sl, image: img }; setDoc({ ...doc, home: { ...doc.home, heroSlides: a } }); })}
              />
              <div className="hp-fields">
                <input value={sl.eyebrow} maxLength={60} placeholder="Eyebrow (e.g. Bridal Edit • B1G1)" onChange={(e) => set(() => { const a = [...slides]; a[i] = { ...sl, eyebrow: e.target.value }; setDoc({ ...doc, home: { ...doc.home, heroSlides: a } }); })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input value={sl.title} maxLength={120} placeholder="Title (e.g. Heirlooms,)" onChange={(e) => set(() => { const a = [...slides]; a[i] = { ...sl, title: e.target.value }; setDoc({ ...doc, home: { ...doc.home, heroSlides: a } }); })} />
                  <input value={sl.highlight} maxLength={120} placeholder="Gold italic line (e.g. without the heirloom price.)" onChange={(e) => set(() => { const a = [...slides]; a[i] = { ...sl, highlight: e.target.value }; setDoc({ ...doc, home: { ...doc.home, heroSlides: a } }); })} />
                </div>
                <textarea rows={2} value={sl.text} maxLength={400} placeholder="Description" onChange={(e) => set(() => { const a = [...slides]; a[i] = { ...sl, text: e.target.value }; setDoc({ ...doc, home: { ...doc.home, heroSlides: a } }); })} />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Promo cards ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Promo cards</h3>
          <button type="button" className="mini-btn" disabled={cards.length >= 4 || imgBusy} onClick={() => set(() => setDoc({ ...doc, home: { ...doc.home, cards: [...cards, emptyCard()] } }))}>
            + Add card
          </button>
        </div>
        <p className="co-note">Shown as the image strip below the hero. First card is displayed larger.</p>

        {cards.length === 0 && <p className="co-note">No cards yet — two built-in promo cards are shown instead.</p>}

        {cards.map((cd, i) => (
          <div className="hp-block" key={i}>
            <div className="hp-block-head">
              <b>Card {i + 1}</b>
              <span>
                <label className="hp-toggle">
                  <input type="checkbox" checked={cd.active} onChange={(e) => set(() => { const a = [...cards]; a[i] = { ...cd, active: e.target.checked }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })} />
                  Active
                </label>
                <button type="button" className="mini-btn danger" onClick={() => set(() => setDoc({ ...doc, home: { ...doc.home, cards: cards.filter((_, x) => x !== i) } }))}>Remove</button>
              </span>
            </div>
            <div className="hp-block-body">
              <ImageSlot
                image={cd.image}
                busy={imgBusy}
                onBusy={setImgBusy}
                onError={setImgErr}
                onChange={(img) => set(() => { const a = [...cards]; a[i] = { ...cd, image: img }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })}
              />
              <div className="hp-fields">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                  <input value={cd.eyebrow} maxLength={60} placeholder="Eyebrow (e.g. New)" onChange={(e) => set(() => { const a = [...cards]; a[i] = { ...cd, eyebrow: e.target.value }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })} />
                  <input value={cd.title} maxLength={80} placeholder="Title (e.g. Kundan Festive Sets)" onChange={(e) => set(() => { const a = [...cards]; a[i] = { ...cd, title: e.target.value }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <input value={cd.text} maxLength={160} placeholder="Subtitle (e.g. From ₹749)" onChange={(e) => set(() => { const a = [...cards]; a[i] = { ...cd, text: e.target.value }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })} />
                  <input value={cd.to} maxLength={200} placeholder="Link (e.g. /shop?col=kundan)" onChange={(e) => set(() => { const a = [...cards]; a[i] = { ...cd, to: e.target.value }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })} />
                  <input value={cd.linkLabel} maxLength={40} placeholder="Button text" onChange={(e) => set(() => { const a = [...cards]; a[i] = { ...cd, linkLabel: e.target.value }; setDoc({ ...doc, home: { ...doc.home, cards: a } }); })} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Festive edit banner ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Festive edit banner</h3>
          <label className="hp-toggle">
            <input type="checkbox" checked={doc.home.festive.active} onChange={(e) => set(() => setDoc({ ...doc, home: { ...doc.home, festive: { ...doc.home.festive, active: e.target.checked } } }))} />
            Show this section on the home page
          </label>
        </div>
        <p className="co-note">Shown between Best Sellers and the stores section. Upload a picture or leave it empty to keep the built-in image.</p>
        <ImageSlot
          image={doc.home.festive.image}
          busy={imgBusy}
          onBusy={setImgBusy}
          onError={setImgErr}
          onChange={(img) => set(() => setDoc({ ...doc, home: { ...doc.home, festive: { ...doc.home.festive, image: img } } }))}
        />
      </section>

      {/* ── Shop by Category tile images ── */}
      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>“Shop by Category” pictures</h3>
        </div>
        <p className="co-note">One picture per category tile on the home page. Leave empty to keep the built-in image.</p>
        <div className="hp-tiles">
          {CATEGORIES.map((ct) => {
            const img = (doc.home.categoryTiles || []).find((t) => t.slug === ct.slug)?.image;
            return (
              <div key={ct.slug} className="hp-tile">
                <ImageSlot
                  label={ct.name}
                  image={img || { url: "", publicId: "", alt: "" }}
                  busy={imgBusy}
                  onBusy={setImgBusy}
                  onError={setImgErr}
                  onChange={(image) => set(() => {
                    const tiles = [...(doc.home.categoryTiles || [])].filter((t) => t.slug !== ct.slug);
                    if (image.url) tiles.push({ slug: ct.slug, image });
                    setDoc({ ...doc, home: { ...doc.home, categoryTiles: tiles } });
                  })}
                />
                <small>{ct.name}</small>
              </div>
            );
          })}
        </div>
      </section>

      <div className="cta-row" style={{ marginTop: 18 }}>
        <button className="btn btn-gold" onClick={save} disabled={saving || imgBusy}>
          {saving ? "Saving…" : imgBusy ? "Uploading image…" : "Save Homepage"}
        </button>
        <button className="btn btn-ghost" onClick={load} disabled={saving}>Discard changes</button>
      </div>
    </div>
  );
}

function OrdersTable({ orders, onStatus, full }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const id = String(o.id || o._id || "");
            return (
              <OrdersRow key={id} id={id} o={o} open={open === id} onToggle={() => setOpen(open === id ? null : id)} onStatus={onStatus} full={full} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersRow({ id, o, open, onToggle, onStatus, full }) {
  return (
    <>
      <tr>
        <td>
          <b>{(o.orderNumber || id).slice(-10) || "—"}</b>
          <br />
          <small>
            {o.createdAt ? new Date(o.createdAt).toLocaleString("en-IN") : ""} • {o.items?.reduce((s, i) => s + i.qty, 0) || 0} items • {o.payment?.method || o.payment}
          </small>
        </td>
        <td>
          {o.customer?.name || "—"}
          <br />
          <small>{o.customer?.phone} • {o.customer?.city}</small>
        </td>
        <td><b>{formatINR(o.totals?.total || 0)}</b></td>
        <td>
          <select value={o.status || "placed"} onChange={(e) => onStatus(id, e.target.value)} className={`status ${o.status || "placed"}`}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </td>
        <td>
          <button className="mini-btn" onClick={onToggle}>{open ? "Hide" : "View"}</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ background: "var(--bg-2)" }}>
            {o.items?.map((i, ix) => (
              <div className="row" key={ix}>
                <span>{i.name} × {i.qty}</span>
                <span>{formatINR(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="row"><span>Coupon</span><span>{o.totals?.coupon || o.coupon || "—"}</span></div>
            <div className="row"><span>Payment</span><span>{o.payment?.method || "cod"} • {o.payment?.status || "—"}</span></div>
            {full && (
              <div className="row">
                <span>Address</span>
                <span>{o.customer?.address}, {o.customer?.city} {o.customer?.pin}</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
