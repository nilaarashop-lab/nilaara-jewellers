import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { SIDE_IMGS, FESTIVE_IMG } from "../data/products";
import { imageKitUrl } from "../data/repo.js";
import { listCategories } from "../data/categories";
import { freebiesLabel } from "../data/freebies";
import { ProductCard, Img } from "../components/Layout";
import { usePageMeta } from "../components/meta";
import { useStore } from "../store/StoreContext";

/** True when the visitor prefers reduced motion (autoplay/parallax off). */
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/*
 * Permanent hero. This mirrors the default hero exactly (same image URL and copy),
 * so the very first paint — before settings are read — already shows the real
 * design instead of a different placeholder. Because the URL matches, React
 * does not remount the image when settings arrive, so there is no swap or blank
 * frame. Admin-configured slides can still override it.
 */
const DEFAULT_SLIDE = {
  image: {
    url: "https://ik.imagekit.io/w4bq6axnq/nilaara/products/nil-mvt1xjp6-82ebd4529631.png",
    alt: "Nilaara kundan necklace set",
  },
  eyebrow: "Festive Edit • Flat 25% off",
  title: "Heirlooms,",
  highlight: "without the heirloom price.",
  text: "Handcrafted kundan, temple & pearl jewellery — bridal-ready, skin-friendly, beautifully finished.",
};

/* Built-in promo cards used until the admin configures their own. They link to
   the whole shop because the sections only have designs once pieces are added. */
const DEFAULT_CARDS = [
  {
    image: { url: SIDE_IMGS[0], alt: "Kundan" },
    eyebrow: "New", title: "Kundan Festive Sets", text: "From ₹749", to: "/shop", linkLabel: "Shop now →",
  },
  {
    image: { url: SIDE_IMGS[1], alt: "Everyday elegance" },
    eyebrow: "Everyday", title: "Everyday Elegance", text: "Lightweight • Skin-friendly", to: "/shop", linkLabel: "Shop now →",
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
 * Auto-rotating hero. Uses admin-configured slides when present, otherwise the
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
            <Link to="/shop?col=best-sellers" className="btn btn-gold">Shop Bestsellers →</Link>
            <Link to="/shop" className="btn btn-ghost">Shop All Jewellery</Link>
          </div>
          <div className="hero-trust">
            <span>Handcrafted in India</span><span>•</span><span>Nickel-safe</span><span>•</span><span>WhatsApp ordering</span>
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
            src={imageKitUrl(s.image?.url || DEFAULT_SLIDE.image.url, 1200)}
            alt={s.image?.alt || s.title || "Nilaara jewellery"}
            key={s.image?.url || i}
          />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  usePageMeta("");
  const { settings, products: items } = useStore();
  // Best Seller flags lead; the rest stay in catalogue order.
  const best = [...items].sort((a, b) => Number(Boolean(b.bestseller)) - Number(Boolean(a.bestseller))).slice(0, 8);

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

  // Tiles are generated from the catalogue, so a category the owner types in
  // the admin appears here without a code change. The admin can override the
  // picture; built-in art, then a product photo, are the fallbacks.
  const cats = useMemo(() => listCategories(items, settings?.home?.categoryTiles || []), [items, settings]);

  // The freebie badge is dropped entirely when no threshold is configured.
  const freebies = freebiesLabel(settings);
  const trust = [
    ["✦", "Nickel-Safe Bases", "Hypoallergenic & skin-friendly"],
    ["◈", "Order on WhatsApp", "We confirm availability in chat"],
    ["✦", "Handcrafted in India", "Quality-checked pieces"],
    ...(freebies ? [["❖", freebies, "On every order"]] : []),
  ];

  return (
    <main className="container">
      <Hero slides={slides} />

      <div className="trust container" style={{ width: "100%" }}>
        {trust.map(([icon, b, s]) => (
          <div key={b}><span style={{ fontSize: 22, color: "var(--gold)" }}>{icon}</span><span><b>{b}</b><small>{s}</small></span></div>
        ))}
      </div>

      <section className="sec">
        <div className="sec-head"><div><h2>Shop by Category</h2><p>Ethnic & contemporary — handcrafted</p></div><Link to="/shop" className="link">View all</Link></div>
        <div className="circles">
          {cats.map((ct) => (
            <Link key={ct.slug} to={`/shop?cat=${ct.slug}`} className="circle">
              <div className="circle-img"><img src={imageKitUrl(ct.img || SIDE_IMGS[0], 400)} alt={ct.alt || ct.name} loading="lazy" /></div>
              <b>{ct.name}</b>
            </Link>
          ))}
        </div>
      </section>

      {/* Promo cards — admin-configurable images & copy (bento strip). */}
      <Reveal className="sec">
        <div className="bento">
          {cards.map((cd, x) => (
            <Link key={x} to={cd.to || "/shop"} className={`bento-card ${x === 0 ? "lead" : ""}`}>
              {cd.image?.url && <img src={imageKitUrl(cd.image.url, 800)} alt={cd.image.alt || cd.title || ""} loading="lazy" />}
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
        <div className="sec-head"><div><h2>Our Best Sellers</h2><p>Most-loved picks, ready to ship</p></div><Link to="/shop?col=best-sellers" className="link">View all</Link></div>
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
            <img src={imageKitUrl(festiveImg, 800)} alt={festive?.alt || "Festive jewellery"} loading="lazy" />
          </div>
        </Reveal>
      )}

      {items.length > 0 && (
        <section className="sec">
          <div className="sec-head"><h2 style={{ fontSize: 30 }}>@nilaara.jewellers</h2><span className="link">Follow</span></div>
          <div className="insta">{[...items].slice(0, 4).map((p) => <Img key={p.id} src={p.images?.[0]} alt={p.name} width={400} />)}</div>
        </section>
      )}

      <section className="sec">
        <div className="festive">
          <div style={{ position: "relative", zIndex: 1 }}>
            <small className="eyebrow">Visit us in person</small>
            <h2>Two stores. Same sparkle.</h2>
            <p>Rent bridal & festive jewellery in either store — try it on in person.</p>
            <div className="cta-row"><Link to="/stores" className="btn btn-gold">Our 2 Stores + Directions →</Link></div>
          </div>
          <img src={imageKitUrl(SIDE_IMGS[0], 800)} alt="Nilaara store" style={{ height: 220 }} loading="lazy" />
        </div>
      </section>
    </main>
  );
}
