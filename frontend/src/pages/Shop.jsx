import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CATEGORIES, COLLECTIONS, PRODUCTS } from "../data/products";
import { ProductCard } from "../components/Layout";
import { fetchProducts } from "../api/client";
import { useStore } from "../store/StoreContext";

export default function Shop() {
  const { settings, promos } = useStore();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(PRODUCTS);
  const cat = params.get("cat") || "";
  const col = params.get("col") || "";
  const sort = params.get("sort") || "featured";
  const q = params.get("q") || "";
  const [query, setQuery] = useState(q);
  const [maxPrice, setMaxPrice] = useState(1500);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  // Left-panel filter drafts — applied only when the user clicks Apply.
  const [draftCat, setDraftCat] = useState(cat);
  const [draftCol, setDraftCol] = useState(col);
  const [draftPrice, setDraftPrice] = useState(1500);

  useEffect(() => { fetchProducts().then(setItems); }, []);
  useEffect(() => setQuery(q), [q]);
  // Keep the drafts in sync when filters come from a link (e.g. /shop?cat=jhumkas).
  useEffect(() => { setDraftCat(cat); setDraftCol(col); }, [cat, col]);
  // Close the sort menu on outside click / Escape.
  useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setSortOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [sortOpen]);

  const SORT_OPTIONS = [
    ["featured", "Featured"],
    ["popular", "Most Popular"],
    ["rating", "Top Rated"],
    ["low", "Price: Low → High"],
    ["high", "Price: High → Low"],
  ];
  const sortLabel = SORT_OPTIONS.find(([v]) => v === sort)?.[1] || "Featured";

  const activeFilterCount = (cat ? 1 : 0) + (col ? 1 : 0) + (maxPrice < 1500 ? 1 : 0) + (query ? 1 : 0);

  const filtered = useMemo(() => {
    let list = [...items];
    if (cat) list = list.filter((p) => p.category === cat);
    if (col === "new") list = list.filter((p) => ["New", "Trending"].includes(p.badge));
    else if (col) list = list.filter((p) => p.collection === col);
    if (query) list = list.filter((p) => (p.name + p.plating + p.stones).toLowerCase().includes(query.toLowerCase()));
    list = list.filter((p) => p.price <= maxPrice);
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    if (sort === "high") list.sort((a, b) => b.price - a.price);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    if (sort === "popular") list.sort((a, b) => b.reviews - a.reviews);
    return list;
  }, [items, cat, col, sort, query, maxPrice]);

  const set = (k, v) => {
    const n = new URLSearchParams(params);
    if (!v) n.delete(k); else n.set(k, v);
    setParams(n);
  };

  const applyFilters = () => {
    const n = new URLSearchParams(params);
    if (!draftCat) n.delete("cat"); else n.set("cat", draftCat);
    if (!draftCol) n.delete("col"); else n.set("col", draftCol);
    setParams(n);
    setMaxPrice(draftPrice);
    setFiltersOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const freeOver = Number(settings?.shipping?.freeOver ?? 999);

  return (
    <main className="container">
      <div className="breadcrumb">Home / Shop {cat && `/ ${cat}`} {col && `/ ${col}`}</div>
      <div className="sec-head"><div><h2>{col ? col.replace("-", " ") : cat ? cat.replace("-", " ") : "Shop All Jewellery"}</h2><p>{filtered.length} designs • artificial & gold-plated</p></div></div>
      <div className="shop-layout">
        <div className="filters-bar">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="shop-filters"
          >
            {filtersOpen ? "Hide Filters" : activeFilterCount ? `Filters (${activeFilterCount})` : "Filters"}
          </button>
        </div>
        <aside id="shop-filters" className={`filters ${filtersOpen ? "open" : ""}`}>
          <h4>Category</h4>
          <div><button className={`chip ${!draftCat ? "on" : ""}`} onClick={() => setDraftCat("")}>All</button>
            {CATEGORIES.map((c) => <button key={c.slug} className={`chip ${draftCat === c.slug ? "on" : ""}`} onClick={() => setDraftCat(c.slug)}>{c.name}</button>)}
          </div>
          <h4>Collection</h4>
          <div><button className={`chip ${!draftCol ? "on" : ""}`} onClick={() => setDraftCol("")}>All</button>
            {COLLECTIONS.map((c) => <button key={c.slug} className={`chip ${draftCol === c.slug ? "on" : ""}`} onClick={() => setDraftCol(c.slug)}>{c.name}</button>)}
          </div>
          <h4>Max price: ₹{draftPrice}</h4>
          <input type="range" min={500} max={1500} step={50} value={draftPrice} onChange={(e) => setDraftPrice(+e.target.value)} style={{ width: "100%", accentColor: "var(--gold)" }} />
          <h4>Offers</h4>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            {settings?.coupons?.b1g1?.enabled && <>✦ B1G1 Free on tagged pieces<br /></>}
            {promos.map((p) => `✦ ${p.code} −${p.percent}% off over ₹${p.minSubtotal || 0}`).map((line) => <span key={line}>{line}<br /></span>)}
            ✦ Free shipping over ₹{freeOver} • COD available
          </p>
          <button type="button" className="btn btn-gold" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={applyFilters}>
            Apply filters
          </button>
        </aside>
        <div>
          <div className="toolbar">
            <input placeholder="Search within results…" value={query} onChange={(e) => { setQuery(e.target.value); set("q", e.target.value); }} style={{ flex: 1, minWidth: 200 }} />
            <div className={`sort-box ${sortOpen ? "open" : ""}`} ref={sortRef}>
              <button type="button" className="sort-btn" onClick={() => setSortOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={sortOpen}>
                Sort: {sortLabel}
                <span className="arr" aria-hidden="true">▾</span>
              </button>
              {sortOpen && (
                <div className="sort-menu" role="listbox">
                  {SORT_OPTIONS.map(([v, label]) => (
                    <button key={v} type="button" role="option" aria-selected={sort === v} className={sort === v ? "on" : ""} onClick={() => { set("sort", v); setSortOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {filtered.length === 0 ? <div className="empty">No designs match. Try clearing filters.</div> :
            <div className="grid grid-3">{filtered.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
        </div>
      </div>
    </main>
  );
}
