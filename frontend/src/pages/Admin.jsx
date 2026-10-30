import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORIES, COLLECTIONS, formatINR } from "../data/products";
import { Img } from "../components/Layout";
import {
  clearToken,
  getSession,
  getToken,
  loadCatalogue,
  loginWithGitHub,
  previewUrl,
  saveCatalogue,
  setToken,
} from "../api/github";
import AdminLogin from "./admin/AdminLogin";
import HomepageEditor from "./admin/HomepageEditor";
import ProductForm from "./admin/ProductForm";

const STATUSES = ["published", "draft", "archived"];

const Stat = ({ label, value, sub }) => (
  <div className="stat">
    <small>{label}</small>
    <b>{value}</b>
    <span>{sub}</span>
  </div>
);

const stockOf = (product) => Number(product.stock) || 0;
const thresholdOf = (product) => Number(product.lowStockThreshold ?? 5) || 0;
const isTracked = (product) => product.trackInventory !== false;

export default function Admin() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [tab, setTab] = useState("dashboard");
  const [catalogue, setCatalogue] = useState({ products: [], sha: "", doc: null });
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // null | "new" | product
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");

  const products = catalogue.products;

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadErr("");
    try {
      const file = await loadCatalogue(session.token);
      setCatalogue({ products: file.doc.products, sha: file.sha, doc: file.doc });
    } catch (ex) {
      setLoadErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) {
        setChecking(false);
        return;
      }
      try {
        const next = await getSession(token);
        if (!cancelled) setSession(next);
      } catch (ex) {
        clearToken();
        if (!cancelled) setAuthError(ex.message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const login = async () => {
    setLoginBusy(true);
    setAuthError("");
    try {
      const token = await loginWithGitHub();
      setToken(token);
      const next = await getSession(token);
      setSession(next);
    } catch (ex) {
      clearToken();
      setAuthError(ex.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = () => {
    clearToken();
    setSession(null);
    setCatalogue({ products: [], sha: "", doc: null });
    setEditing(null);
    setTab("dashboard");
    setFlash("");
    setLoadErr("");
  };

  const filteredProducts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (statusF && (p.status || "published") !== statusF) return false;
      if (!needle) return true;
      return [p.name, p.id, p.category, p.collection, p.customTag, p.badge]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [products, q, statusF]);

  const stats = useMemo(() => {
    const published = products.filter((p) => (p.status || "published") === "published");
    const hidden = products.filter((p) => (p.status || "published") !== "published");
    const lowStock = products
      .filter((p) => isTracked(p) && stockOf(p) <= thresholdOf(p))
      .sort((a, b) => stockOf(a) - stockOf(b));
    const outOfStock = products.filter((p) => isTracked(p) && stockOf(p) <= 0);
    return { published, hidden, lowStock, outOfStock };
  }, [products]);

  const persist = async (nextProducts, message) => {
    // Never overwrite the catalogue with an empty/partial list if the initial
    // read failed: saving requires the sha of the file we loaded.
    if (!catalogue.sha || !catalogue.doc) {
      throw new Error("The catalogue has not loaded yet. Refresh the page and try again.");
    }
    const nextDoc = { ...catalogue.doc, products: nextProducts };
    const saved = await saveCatalogue(nextDoc, catalogue.sha, message, session.token);
    setCatalogue({ products: nextProducts, sha: saved.sha, doc: nextDoc });
  };

  const saveProduct = async (payload, original) => {
    setSaving(true);
    setFlash("");
    try {
      const next = original
        ? products.map((p) => (p.id === original.id ? payload : p))
        : [...products, payload];
      await persist(
        next,
        original ? `Admin: update product “${payload.name}”` : `Admin: add product “${payload.name}”`
      );
      setEditing(null);
      setFlash(
        `${original ? "Product updated" : "Product added"} ✓ — live on the storefront now. Open Preview to check it.`
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete “${product.name}”? This removes it from the catalogue.`)) return;
    setSaving(true);
    setLoadErr("");
    setFlash("");
    try {
      const next = products.filter((p) => p.id !== product.id);
      await persist(next, `Admin: delete product “${product.name}”`);
      if (editing && editing !== "new" && editing.id === product.id) setEditing(null);
      setFlash("Product deleted ✓ — removed from the storefront now.");
    } catch (ex) {
      setLoadErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <main className="container">
        <div className="empty">Checking your session…</div>
      </main>
    );
  }

  if (!session) {
    return <AdminLogin onLogin={login} busy={loginBusy} error={authError} />;
  }

  const userName = session.user?.name || session.user?.login || "Staff";

  return (
    <main className="container">
      <div className="breadcrumb">
        <Link to="/">Home</Link> / Admin • {userName}
      </div>

      <div className="admin-head">
        <div>
          <span className="eyebrow">Nilaara control centre</span>
          <h1 className="serif">Everything, in one place.</h1>
        </div>
        <div className="cta-row" style={{ marginTop: 0 }}>
          <button className="btn btn-ghost" onClick={logout}>Lock</button>
          <button className="btn btn-gold" onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
      </div>

      <div className="admin-tabs">
        {[
          ["dashboard", "Dashboard"],
          ["products", `Products (${products.length})`],
          ["homepage", "Homepage"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`chip ${tab === key ? "on" : ""}`}
            style={{ padding: "10px 18px" }}
            onClick={() => {
              setTab(key);
              setQ("");
              setStatusF("");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {flash && <p style={{ color: "var(--green)", marginTop: 12 }}>{flash}</p>}
      {loadErr && (
        <p className="auth-err">
          {loadErr}{" "}
          <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={load}>
            Retry
          </button>
        </p>
      )}
      {loading && <div className="empty">Loading store data…</div>}

      {!loading && tab === "dashboard" && (
        <>
          <div className="stat-grid">
            <Stat
              label="Products"
              value={products.length}
              sub={`${stats.published.length} published • ${stats.hidden.length} draft/archived`}
            />
            <Stat
              label="Published"
              value={stats.published.length}
              sub={`${CATEGORIES.length} categories • ${COLLECTIONS.length} collections`}
            />
            <Stat
              label="Low stock"
              value={stats.lowStock.length}
              sub={stats.lowStock.length ? "At or below the warning level" : "Everything is comfortably stocked"}
            />
            <Stat
              label="Out of stock"
              value={stats.outOfStock.length}
              sub={stats.outOfStock.length ? "Customers see Sold out" : "Nothing is sold out"}
            />
          </div>

          <p className="co-note">
            Customer orders are completed on WhatsApp. This dashboard tracks the catalogue and the homepage
            content that feeds the static storefront.
          </p>

          <div className="sec-head" style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: 30 }}>Needs restocking</h2>
            <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("products")}>
              Manage all
            </button>
          </div>
          {stats.lowStock.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Product</th><th>Category</th><th>Stock</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {stats.lowStock.slice(0, 8).map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><br /><small>{p.id} • {p.collection}</small></td>
                      <td>{p.category}</td>
                      <td style={{ color: stockOf(p) <= 0 ? "var(--danger)" : undefined }}>
                        {stockOf(p) <= 0 ? "Sold out" : `${stockOf(p)} left`}
                      </td>
                      <td>{p.status || "published"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">All stocked pieces are above their warning level.</div>
          )}

          <div className="sec-head" style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: 30 }}>Not visible in the shop</h2>
            <button className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => setTab("products")}>
              Manage all
            </button>
          </div>
          {stats.hidden.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Product</th><th>Category</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {stats.hidden.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><br /><small>{p.id}</small></td>
                      <td>{p.category}</td>
                      <td>{p.status}</td>
                      <td>
                        <button className="mini-btn" onClick={() => setEditing(p)} disabled={!catalogue.sha}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Every product is published.</div>
          )}
        </>
      )}

      {!loading && tab === "products" && (
        <>
          <div className="toolbar">
            <input
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button
              className="btn btn-gold"
              style={{ padding: "11px 22px" }}
              onClick={() => setEditing("new")}
              disabled={!catalogue.sha}
            >
              + Add Product
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th></th><th>Product</th><th>Category</th><th>Price / MRP</th><th>Stock</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Img
                        src={previewUrl(p.images?.[0])}
                        alt=""
                        style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }}
                      />
                    </td>
                    <td><b>{p.name}</b><br /><small>{p.id} • {p.collection}</small></td>
                    <td>{p.category}</td>
                    <td>
                      {formatINR(p.price)} {Number(p.mrp) > Number(p.price) && <s>{formatINR(p.mrp)}</s>}
                    </td>
                    <td>
                      {!isTracked(p) ? "—" : stockOf(p) <= thresholdOf(p) ? `⚠ ${stockOf(p)}` : stockOf(p)}
                    </td>
                    <td>{p.status || "published"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="mini-btn" onClick={() => setEditing(p)} disabled={!catalogue.sha}>Edit</button>
                      <button className="mini-btn" onClick={() => window.open(`/product/${p.id}`, "_blank")}>Preview</button>
                      <button className="mini-btn danger" onClick={() => deleteProduct(p)} disabled={saving || !catalogue.sha}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredProducts.length === 0 && <div className="empty">No products match.</div>}
        </>
      )}

      {!loading && tab === "homepage" && <HomepageEditor />}

      {editing !== null && (
        <ProductForm
          key={editing === "new" ? "new" : editing.id}
          product={editing === "new" ? null : editing}
          products={products}
          onClose={() => setEditing(null)}
          onSave={saveProduct}
          saving={saving}
        />
      )}
    </main>
  );
}
