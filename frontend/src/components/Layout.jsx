import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { useStore } from "../store/StoreContext";
import { discountPercent, formatINR } from "../data/products";
import { categoryLabel, listCategories } from "../data/categories";
import { freebiesLabel } from "../data/freebies";
import { isLowStock, isSoldOut } from "../data/inventory";
import { STORE_HOURS } from "../data/stores";
import { mediaUrl } from "../data/repo.js";
import { whatsappChatLink, productEnquiryLink, WHATSAPP_DISPLAY } from "../config";
import { searchProducts } from "../api/client";

/* ── Icon set (single stroke style, currentColor — inherits hover states) ── */
const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false };
export const IconSearch = () => (<svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>);
export const IconHeart = () => (<svg {...svgProps}><path d="M20.8 8.6c0 4.3-8.8 9.8-8.8 9.8S3.2 12.9 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z" /></svg>);

/** WhatsApp brand glyph — filled, so it reads as a chat/order button. */
export const IconWhatsApp = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01Zm-7.01 15.24h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z" />
  </svg>
);

export const IconMenu = () => (<svg {...svgProps}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
/**
 * Product image with a branded fallback — a missing or broken image shows the
 * Nilaara mark instead of a broken icon or an unrelated picture.
 */
export function Img({ src, alt = "", ...rest }) {
  const safe = mediaUrl(src) || "/nilaara-mark.png";
  const [current, setCurrent] = useState(safe);
  if (current !== safe) setCurrent(safe); // adjust state during render when src changes
  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      onError={() => current !== "/nilaara-mark.png" && setCurrent("/nilaara-mark.png")}
      {...rest}
    />
  );
}

export function ProductCard({ p }) {
  const { wishlist, toggleWish } = useStore();
  const saved = wishlist.includes(p.id);
  const off = discountPercent(p.price, p.mrp);
  const soldOut = isSoldOut(p);
  const low = isLowStock(p);
  return (
    <div className={`card ${soldOut ? "soldout" : ""}`}>
      <Link to={`/product/${p.id}`} className="card-media">
        <Img src={p.images?.[0]} alt={p.name} />
        <div className="badge">{soldOut ? <i className="o">Sold out</i> : <>{p.customTag ? <i className="g">{p.customTag}</i> : null}</>}</div>
      </Link>
      <button
        className={`wish ${saved ? "on" : ""}`}
        onClick={() => toggleWish(p.id)}
        aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
        aria-pressed={saved}
      >
        {saved ? "♥" : "♡"}
      </button>
      <div className="card-body">
        <Link to={`/product/${p.id}`} className="card-title"><h3>{p.name}</h3></Link>
        <div className="pr"><b>{formatINR(p.price)}</b>{off > 0 && <><s>{formatINR(p.mrp)}</s><em>{off}% off</em></>}</div>
        {!soldOut && low && <div className="stock low">Only {p.stock} left</div>}
        <div className="card-actions">
          {soldOut ? (
            <button className="add" disabled>Sold Out</button>
          ) : p.chainOption ? (
            // The chain has to be picked before an order makes sense.
            <Link className="add" to={`/product/${p.id}`} aria-label={`Choose a chain for ${p.name}`}>Buy Now</Link>
          ) : (
            <a
              className="add add-wa"
              href={productEnquiryLink(p)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Buy ${p.name} on WhatsApp`}
            >
              <IconWhatsApp /> Buy Now
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Announcement / marquee bar.
 *  - Settings can provide scrolling `messages` → animated marquee
 *    (duplicated track for a seamless loop; pauses on hover/focus).
 *  - Otherwise falls back to the settings text, then to the built-in festive
 *    copy.
 *  - `announcement: null` in the admin settings means the bar is switched OFF.
 */
export function AnnounceBar() {
  const { settings } = useStore();
  const a = settings?.announcement;
  const messages = (a?.messages || []).filter(Boolean);

  // The admin explicitly turned the bar off.
  if (settings && a === null) return null;

  if (messages.length > 0) {
    // One message → static; several → scrolling marquee.
    if (messages.length === 1) {
      return (
        <div className="announce" role="region" aria-label="Store announcement">
          <span className="announce-full">{messages[0]}</span>
          <span className="announce-short">{messages[0]}</span>
        </div>
      );
    }
    const track = [...messages, ...messages]; // duplicate for seamless loop
    return (
      <div className="announce announce-marquee" role="region" aria-label="Store announcements">
        <div className="marquee-track">
          {track.map((m, i) => (
            // The second copy only exists to make the loop seamless; hide it
            // from screen readers so every message is announced once.
            <span className="marquee-item" key={i} aria-hidden={i >= messages.length ? "true" : undefined}>
              <span>{m}</span>
              <span className="dot" aria-hidden="true">✦</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Fallbacks: configured text, then a line built from the freebie setting.
  if (a?.text) {
    return (
      <div className="announce" role="region" aria-label="Store announcement">
        <span className="announce-full">{a.text}</span>
        <span className="announce-short">{a.shortText || a.text}</span>
      </div>
    );
  }
  const fallback = `${freebiesLabel(settings) || "Handcrafted artificial jewellery"} • Order on WhatsApp`;
  return (
    <div className="announce">
      <span className="announce-full">{fallback}</span>
      <span className="announce-short">{fallback}</span>
    </div>
  );
}

const SEARCH_MIN = 2;
const SEARCH_TERMS = ["Jhumka", "Kundan", "Temple", "Necklace set", "Bangles"];

/**
 * Debounced catalogue lookup. Fires only while the panel is open and the query
 * is at least two characters; a failed request surfaces as an error state.
 */
function useProductSearch(term, active, products) {
  const [state, setState] = useState({ status: "idle", results: [] });
  const [attempt, setAttempt] = useState(0);
  const needle = term.trim();
  useEffect(() => {
    if (needle.length < SEARCH_MIN) {
      setState({ status: "idle", results: [] });
      return;
    }
    if (!active) return;
    let alive = true;
    setState((s) => ({ status: "loading", results: s.results }));
    const timer = setTimeout(() => {
      searchProducts(needle, 6, products)
        .then((results) => alive && setState({ status: "ready", results }))
        .catch(() => alive && setState({ status: "error", results: [] }));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [needle, active, attempt, products]);
  return [state, () => setAttempt((n) => n + 1)];
}

/**
 * Header search with live results. Desktop and mobile use the same component;
 * results come from the bundled catalogue.
 */
function SearchBox({ className = "", placeholder = "Search jewellery…" }) {
  const uid = useId().replace(/:/g, "");
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { products } = useStore();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [search, retry] = useProductSearch(term, open, products);
  const { status, results } = search;
  const needle = term.trim();

  useEffect(() => {
    setOpen(false);
    setActive(-1);
  }, [pathname]);
  useEffect(() => setActive(-1), [needle]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const go = (to) => {
    close();
    setTerm("");
    inputRef.current?.blur();
    nav(to);
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (results.length) setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (active >= 0 && results[active]) {
        e.preventDefault();
        go(`/product/${results[active].id}`);
      } else if (needle) {
        e.preventDefault();
        go(`/shop?q=${encodeURIComponent(needle)}`);
      }
    }
  };

  return (
    <div className={`search-wrap ${className}`.trim()} ref={wrapRef}>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (needle) go(`/shop?q=${encodeURIComponent(needle)}`);
        }}
      >
        <span className="search-ico"><IconSearch /></span>
        <input
          ref={inputRef}
          value={term}
          placeholder={placeholder}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${uid}-panel`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
          aria-label="Search products"
          autoComplete="off"
          spellCheck="false"
        />
        {term && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => {
              setTerm("");
              setActive(-1);
              inputRef.current?.focus();
            }}
          >✕</button>
        )}
      </form>
      {open && (
        <div className="search-panel" id={`${uid}-panel`}>
          {status === "loading" && <span className="sq-progress" aria-hidden="true" />}
          {!needle ? (
            <>
              <span className="sq-label">Popular searches</span>
              <div className="sq-chips">
                {SEARCH_TERMS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setTerm(s);
                      setOpen(true);
                      inputRef.current?.focus();
                    }}
                  >{s}</button>
                ))}
              </div>
            </>
          ) : needle.length < SEARCH_MIN ? (
            <p className="sq-hint">Keep typing to see matching pieces…</p>
          ) : status === "error" ? (
            <div className="sq-state" role="alert">
              <b>Search is temporarily unavailable</b>
              <span>We couldn’t reach the store just now — please try again.</span>
              <button type="button" onClick={retry}>Try again</button>
            </div>
          ) : status === "loading" && !results.length ? (
            <div className="sq-list" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div className="sq-skel" key={i}>
                  <span className="sk sq-skel-thumb" />
                  <span className="sq-skel-lines">
                    <span className="sk" style={{ width: "68%" }} />
                    <span className="sk" style={{ width: "40%" }} />
                  </span>
                </div>
              ))}
            </div>
          ) : !results.length ? (
            <div className="sq-state">
              <b>No matches for “{needle}”</b>
              <span>Try a shorter word — like “jhumka”, “kundan” or “set”.</span>
            </div>
          ) : (
            <>
              <div className="sq-list" role="listbox" aria-label="Product suggestions">
                {results.map((p, i) => (
                  <Link
                    key={p.id}
                    id={`${uid}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`sq-item ${i === active ? "on" : ""}`}
                    to={`/product/${p.id}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => {
                      close();
                      setTerm("");
                    }}
                  >
                    <Img src={p.images?.[0]} alt="" className="sq-thumb" />
                    <span className="sq-info">
                      <b>{p.name}</b>
                      <small>{categoryLabel(p.category)}</small>
                    </span>
                    <span className="sq-price">{formatINR(p.price)}</span>
                  </Link>
                ))}
              </div>
              <button type="button" className="sq-all" onClick={() => go(`/shop?q=${encodeURIComponent(needle)}`)}>
                <span>View all results for “{needle}”</span>
                <span aria-hidden="true">→</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { wishlist, products } = useStore();
  // Only count saved pieces that still exist, so the badge never promises more
  // than the Wishlist page can show after a product is deleted.
  const savedCount = useMemo(() => {
    const live = new Set(products.map((p) => p.id));
    return wishlist.filter((id) => live.has(id)).length;
  }, [wishlist, products]);
  // Generated from the live catalogue, so a category the owner types in the
  // admin shows up in the menu without a code change.
  const cats = useMemo(() => listCategories(products), [products]);
  const [mnav, setMnav] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname, search } = useLocation();
  // All shop/category links share the /shop path, so NavLink's default
  // pathname-only matching would mark every one of them active at once.
  // Match the query parameters too (extra filters like sort don't break it).
  const isNavActive = (to) => {
    const [path, query] = to.split("?");
    if (pathname !== path) return false;
    if (!query) return true;
    const want = new URLSearchParams(query);
    const have = new URLSearchParams(search);
    return [...want].every(([k, v]) => have.get(k) === v);
  };
  const navLink = (to, label) => (
    <NavLink key={to} to={to} className={() => (isNavActive(to) ? "active" : "")}>{label}</NavLink>
  );
  // Header compacts and lifts (shadow) once the page scrolls — a quiet luxury cue.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { setMnav(false); }, [pathname]);
  useEffect(() => {
    if (!mnav) return;
    const onKey = (e) => { if (e.key === "Escape") setMnav(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mnav]);
  return (
    <>
      <AnnounceBar />
      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        <div className="container">
          <div className="header-top">
            <button className="hbtn menu-btn" onClick={() => setMnav(true)} aria-label="Open menu" aria-expanded={mnav}><IconMenu /></button>
            <Link to="/" className="logo" aria-label="Nilaara Jewellers home">
              <img className="logo-mark" src="/nilaara-mark.png" alt="" />
              <span><span className="logo-name">NILAARA</span><br /><span className="logo-sub">Handcrafted • Artificial Jewellery</span></span>
            </Link>
            <SearchBox placeholder="Search temple jewellery, chokers, rings, diamond replica…" />
            <div className="hicons">
              <Link className="hbtn wish-hbtn" to="/wishlist" aria-label={savedCount > 0 ? `Wishlist, ${savedCount} saved` : "Wishlist"}>
                <IconHeart />{savedCount > 0 && <span className="count">{savedCount}</span>}
              </Link>
              <a
                className="hbtn wa-hbtn"
                href={whatsappChatLink()}
                target="_blank"
                rel="noreferrer"
                aria-label="Order or ask on WhatsApp"
                title="Order on WhatsApp"
              >
                <IconWhatsApp />
              </a>
            </div>
          </div>
          <SearchBox className="m" placeholder="Search jewellery…" />
          <nav className="nav">
            {navLink("/shop?col=new", "New Launches")}
            {navLink("/shop?col=best-sellers", "Best Sellers")}
            {cats.map((c) => navLink(`/shop?cat=${c.slug}`, c.name))}
            {navLink("/stores", "Our Stores")}
            {navLink("/about", "Our Craft")}
          </nav>
        </div>
      </header>
      {mnav && (
        <>
          <div className="overlay" onClick={() => setMnav(false)} />
          <aside className="mnav" aria-label="Menu">
            <div className="mnav-head">
              <Link to="/" className="logo" onClick={() => setMnav(false)} aria-label="Nilaara Jewellers home">
                <img className="logo-mark" src="/nilaara-mark.png" alt="" />
                <span className="logo-name">NILAARA</span>
              </Link>
              <button className="hbtn" onClick={() => setMnav(false)} aria-label="Close menu">✕</button>
            </div>
            <div className="mnav-body">
              <div className="mnav-group">
                <small>New &amp; trending</small>
                <div className="mnav-links">
                  {[
                    ["New Launches", "/shop?col=new"],
                    ["Best Sellers", "/shop?col=best-sellers"],
                  ].map(([label, to]) => (
                    <Link key={label} to={to} onClick={() => setMnav(false)}>{label}</Link>
                  ))}
                </div>
              </div>
              <div className="mnav-group">
                <small>Shop by category</small>
                <div className="mnav-links">
                  {cats.map((c) => (
                    <Link key={c.slug} to={`/shop?cat=${c.slug}`} onClick={() => setMnav(false)}>{c.name}</Link>
                  ))}
                </div>
              </div>
              <div className="mnav-group">
                <small>Explore</small>
                <div className="mnav-links">
                  <Link to="/wishlist" onClick={() => setMnav(false)}>
                    Wishlist{wishlist.length > 0 && <span className="mnav-count">{wishlist.length}</span>}
                  </Link>
                  {[
                    ["Our Stores", "/stores"],
                    ["Our Craft", "/about"],
                    ["Contact Us", "/contact"],
                  ].map(([label, to]) => (
                    <Link key={label} to={to} onClick={() => setMnav(false)}>{label}</Link>
                  ))}
                </div>
              </div>
            </div>
            <div className="mnav-foot">
              <small>Questions about a piece? Message us — we'll help you pick and book it.</small>
              <div className="mnav-auth">
                <a className="btn btn-gold" href={whatsappChatLink()} target="_blank" rel="noreferrer" onClick={() => setMnav(false)}>
                  <IconWhatsApp /> Chat on WhatsApp
                </a>
                <Link className="btn btn-ghost" to="/wishlist" onClick={() => setMnav(false)}>
                  <IconHeart /> Wishlist{savedCount > 0 ? ` (${savedCount})` : ""}
                </Link>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

export function Footer() {
  const { products } = useStore();
  const cats = useMemo(() => listCategories(products), [products]);
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <img className="footer-logo" src="/nilaara-logo.png" alt="Nilaara Jewellers" />
            <p>Premium artificial jewellery — handcrafted in India. Skin-friendly, nickel-safe, made for weddings, festivals & everyday elegance.</p>
            <p style={{ marginTop: 10 }}>© 2026 Nilaara Jewellers. All rights reserved.</p>
          </div>
          <div>
            <h4>Care</h4>
            <p><a href={whatsappChatLink()} target="_blank" rel="noreferrer">Chat on WhatsApp</a><br /><Link to="/stores">Our 2 Stores + Directions</Link><br /><Link to="/about#shipping">Shipping Policy</Link><br /><Link to="/about#care">Jewellery Care</Link><br /><Link to="/contact">Contact Us</Link></p>
          </div>
          <div>
            <h4>Shop</h4>
            <p>{cats.map((c, i) => (
              <Fragment key={c.slug}>
                {i > 0 && <br />}
                <Link to={`/shop?cat=${c.slug}`}>{c.name}</Link>
              </Fragment>
            ))}</p>
          </div>
          <div>
            <h4>Order on WhatsApp</h4>
            <p>Pick any piece, tap Buy Now and its name and product ID are filled into WhatsApp for you. We'll confirm availability and book it in chat.</p>
            <a className="btn btn-gold news-cta" href={whatsappChatLink()} target="_blank" rel="noreferrer" style={{ marginTop: 4 }}>
              <IconWhatsApp /> Chat with our team
            </a>
            <p style={{ marginTop: 12 }}>WhatsApp: <a href={whatsappChatLink()} target="_blank" rel="noreferrer">{WHATSAPP_DISPLAY}</a><br />{STORE_HOURS}</p>
          </div>
        </div>
        <div className="copy"><span>Made with care in India • Order on WhatsApp</span><span>Every piece is hand-checked before dispatch • <Link to="/admin/">Staff login</Link></span></div>
      </div>
    </footer>
  );
}
