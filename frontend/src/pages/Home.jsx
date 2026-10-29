import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, COLLECTIONS, PRODUCTS, HERO_IMG, SIDE_IMGS, FESTIVE_IMG, formatINR } from "../data/products";
import { ProductCard, Img } from "../components/Layout";
import { useStore } from "../store/StoreContext";
import { fetchProducts } from "../api/client";

/** True when the visitor prefers reduced motion (autoplay/parallax off). */
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* Built-in hero used until (or unless) the admin configures slides. */
const DEFAULT_SLIDE = {
  image: { url: HERO_IMG, alt: "Nilaara gold jewellery" },
  eyebrow: "Festive Edit",
  title: "Heirlooms,",
  highlight: "without the heirloom price.",
  text: "Nilaara crafts premium artificial & gold-plated jewellery — kundan chokers, temple bangles, American-diamond demi-fine & pearl sets. Skin-friendly, tarnish-resistant, wedding-ready.",
};

/* Built-in promo cards used until the admin configures their own. */
const DEFAULT_CARDS = [
  {
    image: { url: SIDE_IMGS[0], alt: "Kundan" },
    eyebrow: "New", title: "Kundan Festive Sets", text: "From ₹749", to: "/shop?col=kundan", linkLabel: "Shop now →",
  },
  {
    image: { url: SIDE_IMGS[1], alt: "Demi fine" },
    eyebrow: "Demi-Fine", title: "Everyday Gold-Plated", text: "Waterproof • Tarnish-free", to: "/shop?col=american-diamond", linkLabel: "Shop now →",
  },
];

/**
 * Adds a reveal-on-scroll class once an element enters the viewport.
 * Decorative only — disabled entirely under prefers-reduced-motion.
 */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("revealed")),
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ className = "", children }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

/**
 * Auto-rotating hero. Uses admin-configured slides (via /api/settings) when
 * present, otherwise the built-in festive hero. Autoplay pauses on hover/focus
 * and is disabled entirely for reduced-motion visitors (dots still work).
 */
function Hero({ slides }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = slides.length;
  const s = slides[i] || DEFAULT_SLIDE;

  useEffect(() => {
    if (total <= 1 || paused || prefersReducedMotion()) return;
    const id = setInterval(() => setI((v) => (v + 1) % total), 5200);
    return () => clearInterval(id);
  }, [total, paused, i]);

  return (
    <section
      className="hero hero-rotator"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured collections"
    >
      <div className="hero-main">
        <div className="hero-copy" key={i}>
          <span className="eyebrow">{s.eyebrow || DEFAULT_SLIDE.eyebrow}</span>
          <h1>
            {s.title || DEFAULT_SLIDE.title}
            <br />
            <em>{s.highlight || DEFAULT_SLIDE.highlight}</em>
          </h1>
          <p>{s.text || DEFAULT_SLIDE.text}</p>
          <div className="cta-row">
            <Link to="/shop" className="btn btn-gold">Shop Bestsellers →</Link>
            <Link to="/shop?col=temple" className="btn btn-ghost">Explore Temple</Link>
          </div>
          <div className="hero-trust">
            <span>★ 4.6 (48k reviews)</span><span>•</span><span>7-day exchange</span><span>•</span><span>COD</span>
          </div>
          {total > 1 && (
            <div className="hero-dots" role="tablist" aria-label="Choose hero slide">
              {slides.map((sl, x) => (
                <button
                  key={x}
                  role="tab"
                  aria-selected={x === i}
                  aria-label={sl.title || `Slide ${x + 1}`}
                  className={`hero-dot ${x === i ? "on" : ""}`}
                  onClick={() => setI(x)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="hero-art">
          <span className="hero-blob" aria-hidden="true" />
          <img
            src={s.image?.url || DEFAULT_SLIDE.image.url}
            alt={s.image?.alt || s.title || "Nilaara jewellery"}
            key={s.image?.url || i}
          />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { addToCart, settings } = useStore();
  const [items, setItems] = useState(PRODUCTS);
  useEffect(() => { fetchProducts().then(setItems).catch(() => {}); }, []);
  const best = [...items].sort((a, b) => b.reviews - a.reviews).slice(0, 8);

  // Admin-configured content, falling back to the built-in defaults.
  const slides = useMemo(() => {
    const cfg = (settings?.home?.heroSlides || []).filter((s) => s.title || s.image?.url);
    return cfg.length ? cfg : [DEFAULT_SLIDE];
  }, [settings]);
  const cards = useMemo(() => {
    const cfg = (settings?.home?.cards || []).filter((x) => x.title || x.image?.url);
    return cfg.length ? cfg : DEFAULT_CARDS;
  }, [settings]);
  // Festive edit banner: shown only when enabled in the admin; the uploaded
  // picture is used, otherwise the built-in one.
  const festive = settings?.home?.festive || null;
  const festiveImg = festive?.url || FESTIVE_IMG;

  // Admin can override the "Shop by Category" / "Handpicked" tile images
  // (keyed by catalogue slug); built-in images are the fallback.
  const catTiles = useMemo(() => new Map((settings?.home?.categoryTiles || []).map((t) => [t.slug, t])), [settings]);
  const colTiles = useMemo(() => new Map((settings?.home?.collectionTiles || []).map((t) => [t.slug, t])), [settings]);

  return (
    <main className="container">
      <Hero slides={slides} />

      <div className="trust container" style={{ width: "100%" }}>
        {[["✦ 18K–24K Gold Plating", "Skin-friendly & certified"], ["◈ 7-Day Exchange", "No-question returns"], ["⬣ COD Available", "Pay at your doorstep"], ["❖ Free Shipping ₹999+", "Pan-India delivery"]].map(([b, s]) => (
          <div key={b}><span style={{ fontSize: 22, color: "var(--gold)" }}>✦</span><span><b>{b}</b><small>{s}</small></span></div>
        ))}
      </div>

      <section className="sec">
        <div className="sec-head"><div><h2>Shop by Category</h2><p>Demi-fine & ethnic — 1,300+ styles</p></div><Link to="/shop" className="link">View all</Link></div>
        <div className="circles">
          {CATEGORIES.map((ct) => (
            <Link key={ct.slug} to={`/shop?cat=${ct.slug}`} className="circle">
              <div className="circle-img"><img src={catTiles.get(ct.slug)?.url || ct.img} alt={catTiles.get(ct.slug)?.alt || ct.name} loading="lazy" /></div>
              <b>{ct.name}</b><small>{ct.count}</small>
            </Link>
          ))}
        </div>
      </section>

      {/* Promo cards — admin-configurable images & copy (bento strip). */}
      <Reveal className="sec">
        <div className="bento">
          {cards.map((cd, x) => (
            <Link key={x} to={cd.to || "/shop"} className={`bento-card ${x === 0 ? "lead" : ""}`}>
              {cd.image?.url && <img src={cd.image.url} alt={cd.image.alt || cd.title || ""} loading="lazy" />}
              <span className="bento-shade" aria-hidden="true" />
              <span className="bento-body">
                {cd.eyebrow && <small className="eyebrow">{cd.eyebrow}</small>}
                <h3>{cd.title}</h3>
                {cd.text && <p>{cd.text}</p>}
                <em className="price-chip">{cd.linkLabel || "Shop now →"}</em>
              </span>
            </Link>
          ))}
        </div>
      </Reveal>

      <section className="sec">
        <div className="sec-head"><div><h2>Handpicked for you</h2><p>Kundan • Temple • Oxidised • Gold-plated</p></div></div>
        <div className="hand">
          {COLLECTIONS.map((col) => (
            <Link key={col.slug} to={`/shop?col=${col.slug}`}><img src={colTiles.get(col.slug)?.url || col.img} alt={colTiles.get(col.slug)?.alt || col.name} loading="lazy" /><span>{col.name}</span></Link>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="sec-head"><div><h2>Our Best Sellers</h2><p>Loved by 2,00,000+ customers</p></div><Link to="/shop?sort=popular" className="link">View all</Link></div>
        <div className="grid">{best.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>

      {festive && (
        <Reveal className="sec">
          <div className="festive">
            <div style={{ position: "relative", zIndex: 1 }}>
              <small style={{ letterSpacing: 3 }}>NILAARA FESTIVE EDIT</small>
              <h2>Made for<br />celebrations.</h2>
              <p style={{ opacity: .85 }}>Handcrafted kundan, temple & pearl pieces — from everyday sparkle to wedding-day shine.</p>
              <div className="cta-row"><Link to="/shop" className="btn btn-gold">Shop the edit →</Link></div>
            </div>
            <img src={festiveImg} alt={festive?.alt || "Festive jewellery"} loading="lazy" />
          </div>
        </Reveal>
      )}

      <section className="sec two">
        <div className="quote">
          <small className="eyebrow">48,000+ verified reviews</small>
          <p>“My Nilaara kundan set looked straight out of a bridal shoot. Nobody believed it wasn’t real gold. Lightweight, no itching, packaging felt premium.”</p>
          <b>— Ananya S., Bengaluru • Verified buyer</b>
          <div style={{ marginTop: 12 }}>{best[0] && <button className="btn btn-ghost" onClick={() => addToCart(best[0])}>Shop the look • {formatINR(best[0].price)}</button>}</div>
        </div>
        <div>
          <div className="sec-head"><h2 style={{ fontSize: 30 }}>@nilaara.jewellers</h2><span className="link">Follow</span></div>
          <div className="insta">{[...items].slice(0, 4).map((p) => <Img key={p.id} src={p.images?.[0]} alt={p.name} />)}</div>
        </div>
      </section>

      <section className="sec">
        <div className="festive">
          <div style={{ position: "relative", zIndex: 1 }}>
            <small className="eyebrow">Visit us in person</small>
            <h2>Two stores. Same sparkle.</h2>
            <p>Try bridal & festive pieces on in person.</p>
            <div className="cta-row"><Link to="/stores" className="btn btn-gold">Our 2 Stores + Directions →</Link></div>
          </div>
          <img src={SIDE_IMGS[0]} alt="Nilaara store" style={{ height: 220 }} loading="lazy" />
        </div>
      </section>
    </main>
  );
}
