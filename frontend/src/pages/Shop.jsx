import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CATEGORIES } from "../data/products";
import { ProductCard } from "../components/Layout";
import { matchesQuery } from "../api/client";
import { useStore } from "../store/StoreContext";

// Curated lists driven by the admin's Best Seller / New toggles.
const CURATED = [
  { slug: "new", name: "New Launches" },
  { slug: "best-sellers", name: "Best Sellers" },
];

const slugifyLabel = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function Shop() {
  const { settings, products: items } = useStore();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "";
  const col = params.get("col") || "";
  const sort = params.get("sort") || "featured";
  const q = params.get("q") || "";
  const max = params.get("max") || "";
  const [query, setQuery] = useState(q);
  // Price cap grows with the catalogue (capped slider hid pricier pieces).
  // The applied cap lives in the URL like the other filters, so following a
  // category link does not carry a stale cap into the next listing.
  const priceCap = Math.max(500, Math.ceil(Math.max(...items.map((p) => p.price), 0) / 50) * 50);
  const maxPrice = Number(max) > 0 && Number(max) < priceCap ? Number(max) : null;
  // Admin-named labels become real filters automatically; curated lists keep
  // their slugs if a label happens to clash.
  const labels = useMemo(() => {
    const taken = new Set(CURATED.map((c) => c.slug));
    const map = new Map();
    for (const p of items) {
      const name = (p.customTag || "").trim();
      if (!name) continue;
      const slug = slugifyLabel(name);
      if (!slug || taken.has(slug)) continue;
      taken.add(slug);
      map.set(slug, name);
    }
    return [...map].map(([slug, name]) => ({ slug, name }));
  }, [items]);

  // Links shared before the collection attribute existed still carry slugs like
  // ?col=kundan. An unknown slug filters nothing, so an old bookmark never opens
  // a dead-end "0 designs" page.
  const activeCol = useMemo(
    () => [...CURATED, ...labels].find((c) => c.slug === col) || null,
    [col, labels]
  );
  const activeFilterCount = (cat ? 1 : 0) + (activeCol ? 1 : 0) + (maxPrice != null ? 1 : 0) + (query ? 1 : 0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  // Left-panel filter drafts — applied only when the user clicks Apply.
  const [draftCat, setDraftCat] = useState(cat);
  const [draftCol, setDraftCol] = useState(activeCol?.slug || "");
  const [draftPrice, setDraftPrice] = useState(maxPrice);

  useEffect(() => setQuery(q), [q]);
  // Keep the drafts in sync when filters come from a link (e.g. /shop?cat=jhumkas).
  useEffect(() => {
    setDraftCat(cat);
    setDraftCol(activeCol?.slug || "");
    setDraftPrice(maxPrice);
  }, [cat, activeCol, maxPrice]);
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
    ["low", "Price: Low → High"],
    ["high", "Price: High → Low"],
  ];
  const sortLabel = SORT_OPTIONS.find(([v]) => v === sort)?.[1] || "Featured";

  const filtered = useMemo(() => {
    let list = [...items];
    if (cat) list = list.filter((p) => p.category === cat);
    if (activeCol?.slug === "new") list = list.filter((p) => p.newArrival);
    else if (activeCol?.slug === "best-sellers") {
      const curated = list.filter((p) => p.bestseller);
      list = curated.length ? curated : list.slice(0, 12);
    } else if (activeCol) {
      list = list.filter((p) => p.customTag && slugifyLabel(p.customTag) === activeCol.slug);
    }

    if (query) list = list.filter((p) => matchesQuery(p, query));
    if (maxPrice != null) list = list.filter((p) => p.price <= maxPrice);
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    if (sort === "high") list.sort((a, b) => b.price - a.price);
    return list;
  }, [items, cat, activeCol, sort, query, maxPrice]);

  const set = (k, v) => {
    const n = new URLSearchParams(params);
    if (!v) n.delete(k); else n.set(k, v);
    // replace: live search/sort changes shouldn't add a history entry per keystroke.
    setParams(n, { replace: true });
  };

  const applyFilters = () => {
    const n = new URLSearchParams(params);
    if (!draftCat) n.delete("cat"); else n.set("cat", draftCat);
    if (!draftCol) n.delete("col"); else n.set("col", draftCol);
    // A cap at the slider maximum means "no cap" — keep the URL clean.
    if (draftPrice == null || draftPrice >= priceCap) n.delete("max");
    else n.set("max", String(draftPrice));
    setParams(n);
    setFiltersOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const freeOver = Number(settings?.shipping?.freeOver ?? 999);
  const colName = activeCol?.name || "";
  const heading = colName || (cat ? cat.replace(/-/g, " ") : "Shop All Jewellery");

  return (
    <main className="container">
      <div className="breadcrumb">Home / Shop {cat && `/ ${cat}`} {activeCol && `/ ${colName}`}</div>
      <div className="sec-head"><div><h2>{heading}</h2><p>{`${filtered.length} designs`} • artificial jewellery</p></div></div>
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
          <h4>Highlights</h4>
          <div><button className={`chip ${!draftCol ? "on" : ""}`} onClick={() => setDraftCol("")}>All</button>
            {CURATED.map((c) => <button key={c.slug} className={`chip ${draftCol === c.slug ? "on" : ""}`} onClick={() => setDraftCol(c.slug)}>{c.name}</button>)}
          </div>
          {labels.length > 0 && (
            <>
              <h4>Edits</h4>
              <div>{labels.map((l) => <button key={l.slug} className={`chip ${draftCol === l.slug ? "on" : ""}`} onClick={() => setDraftCol(l.slug)}>{l.name}</button>)}</div>
            </>
          )}
          <h4>Max price: ₹{draftPrice ?? priceCap}</h4>
          <input type="range" min={500} max={priceCap} step={50} value={draftPrice ?? priceCap} onChange={(e) => setDraftPrice(+e.target.value)} style={{ width: "100%", accentColor: "var(--gold)" }} />
          <h4>Good to know</h4>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            ✦ Free shipping over ₹{freeOver}<br />
            ✦ Book any piece on WhatsApp — product ID included automatically
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
          {filtered.length === 0 ? <div className="empty">No designs match. Try clearing filters.</div>
            : <div className="grid grid-3">{filtered.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
        </div>
      </div>
    </main>
  );
}
