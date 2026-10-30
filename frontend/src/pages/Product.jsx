import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { discountPercent, formatINR } from "../data/products";
import { ProductCard, Img, IconWhatsApp } from "../components/Layout";
import { useStore } from "../store/StoreContext";
import { productEnquiryLink } from "../config";

export default function Product() {
  const { id } = useParams();
  const { toggleWish, wishlist, products: items, contentStatus } = useStore();
  const [imgI, setImgI] = useState(0);
  useEffect(() => { setImgI(0); window.scrollTo(0, 0); }, [id]);
  const p = items.find((x) => x.id === id);
  if (!p && contentStatus === "loading") {
    return (
      <main className="container">
        <div className="empty">Loading this piece…</div>
      </main>
    );
  }
  if (!p) {
    return (
      <main className="container">
        <div className="breadcrumb">Home / Shop</div>
        <div className="empty">
          <h2 className="serif" style={{ fontSize: 30 }}>This piece isn't in our collection</h2>
          <p>It may have been renamed or is no longer available.</p>
          <br />
          <Link to="/shop" className="btn btn-gold">Browse the Shop</Link>
        </div>
      </main>
    );
  }
  const related = items.filter((x) => x.id !== p.id && (x.category === p.category || x.collection === p.collection)).slice(0, 4);
  // Live updates can replace the photo list while this page is open; keep the
  // selected index inside the new range.
  const imageIndex = Math.min(imgI, Math.max((p.images?.length || 1) - 1, 0));
  const off = discountPercent(p.price, p.mrp);
  const soldOut = p.inStock === false || (p.inStock === undefined && p.trackInventory !== false && typeof p.stock === "number" && p.stock <= 0);
  const low = !soldOut && p.trackInventory !== false && typeof p.stock === "number" && p.stock <= (p.lowStockThreshold ?? 5);

  return (
    <main className="container">
      <div className="breadcrumb"><Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / {p.name}</div>
      <div className="pd">
        <div className="pd-media">
          <Img src={p.images?.[imageIndex]} alt={p.name} />
          <div className="thumbs">{(p.images || []).map((s, i) => <Img key={i} src={s} alt="" className={i === imageIndex ? "on" : ""} onClick={() => setImgI(i)} />)}</div>
        </div>
        <div className="pd-info">
          <span className="badge" style={{ position: "static" }}>{soldOut ? <i className="o">Sold out</i> : <>{p.customTag ? <i className="g">{p.customTag}</i> : null}{p.tag ? <i className="g">{p.tag}</i> : null}<i>{p.badge}</i></>}</span>
          <h1>{p.name}</h1>
          <div className="pr" style={{ marginTop: 10 }}><b>{formatINR(p.price)}</b>{off > 0 && <><s>{formatINR(p.mrp)}</s><em>{off}% off</em></>}</div>
          <p style={{ color: "var(--green)", fontSize: 14 }}>Inclusive of all taxes</p>
          <p className={`stock ${soldOut ? "out" : low ? "low" : "in"}`} style={{ marginTop: 0 }}>{soldOut ? "Out of stock — back soon" : low ? `Hurry, only ${p.stock} left!` : "In stock • ready to ship"}</p>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>{p.desc}</p>
          <p style={{ fontSize: 13.5 }}><b>Plating:</b> {p.plating} &nbsp;•&nbsp; <b>Stones:</b> {p.stones}</p>
          <p className="pd-id">Product ID: <code>{p.id}</code></p>
          <div className="pd-buy-row">
            {soldOut ? (
              <button className="btn btn-gold pd-buy" disabled>Out of Stock</button>
            ) : (
              <a
                className="btn btn-gold pd-buy"
                href={productEnquiryLink(p)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Buy ${p.name} on WhatsApp`}
              >
                <IconWhatsApp /> Buy Now on WhatsApp • {formatINR(p.price)}
              </a>
            )}
            <button className="hbtn pd-wish" onClick={() => toggleWish(p.id)} aria-label="Save to wishlist">{wishlist.includes(p.id) ? "♥" : "♡"}</button>
          </div>
          <p className="pd-hint">Tap <b>Buy Now</b> — WhatsApp opens with this piece's name and <b>Product ID</b> already filled in. We'll reply there with price, availability, payment and shipping details.</p>
          <details className="acc" open><summary>Product details</summary><div>Base: brass alloy • Plating: {p.plating} • Stones: {p.stones} • Closure: push-back / lobster • Hypoallergenic, nickel-safe. Includes Nilaara gift box & care card.</div></details>
          <details className="acc"><summary>Shipping & returns</summary><div>Dispatch in 24h • Delivery 3–5 days • 7-day easy exchange (unused, tags intact). Shipping and payment are confirmed on WhatsApp when you book.</div></details>
          <details className="acc"><summary>Jewellery care</summary><div>Keep away from perfume & water. Wipe with soft cloth after wear. Store in zip pouch. Re-plating service available on request.</div></details>
        </div>
      </div>
      <section className="sec">
        <div className="sec-head"><h2>You may also love</h2><Link to="/shop" className="link">View all</Link></div>
        <div className="grid">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
      </section>
    </main>
  );
}
