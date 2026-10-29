import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "../store/StoreContext";
import { useAuth } from "../store/AuthContext";
import { COLLECTIONS, formatINR } from "../data/products";
import { hasAPI, searchProducts } from "../api/client";

/* ── Icon set (single stroke style, currentColor — inherits hover states) ── */
const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false };
export const IconSearch = () => (<svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>);
export const IconHeart = () => (<svg {...svgProps}><path d="M20.8 8.6c0 4.3-8.8 9.8-8.8 9.8S3.2 12.9 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z" /></svg>);
export const IconCart = () => (<svg {...svgProps}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>);

export const IconUser = () => (<svg {...svgProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);

export const IconUserPlus = () => (<svg {...svgProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>);
export const IconMenu = () => (<svg {...svgProps}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const IconBox = () => (<svg {...svgProps}><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" /><path d="m4 8.5 8 4.5 8-4.5M12 13v7" /></svg>);
export const IconShield = () => (<svg {...svgProps}><path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Z" /><path d="m9.2 12.2 2 2 3.6-3.7" /></svg>);
export const IconLogout = () => (<svg {...svgProps}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h10" /></svg>);

/** Two-letter avatar initials for the signed-in customer. */
const initialsOf = (user) => {
  const src = (user?.name || user?.email || user?.phone || "U").trim();
  return src.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "U";
};

/**
 * Product image with a branded fallback — a missing or broken image shows the
 * Nilaara mark instead of a broken icon or an unrelated picture.
 */
export function Img({ src, alt = "", ...rest }) {
  const safe = src || "/nilaara-mark.png";
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
  const { addToCart, wishlist, toggleWish, settings } = useStore();
  const off = Math.round((1 - p.price / p.mrp) * 100);
  // The "flat 25% off" line is only true when the legacy FLAT25 promo is
  // enabled in settings AND this item alone meets its minimum subtotal.
  const flat25 = settings?.coupons?.flat25;
  const flat25Live = flat25?.enabled !== false && p.price >= Number(flat25?.minSubtotal ?? 1000);
  // Sold out only when inventory is tracked and none is left. `inStock` comes
  // from the API; static/demo products without it are treated as available.
  const soldOut = p.inStock === false || (p.inStock === undefined && p.trackInventory !== false && typeof p.stock === "number" && p.stock <= 0);
  const low = !soldOut && p.trackInventory !== false && typeof p.stock === "number" && p.stock <= (p.lowStockThreshold ?? 5);
  return (
    <div className={`card ${soldOut ? "soldout" : ""}`}>
      <Link to={`/product/${p.id}`} className="card-media">
        <Img src={p.images?.[0]} alt={p.name} />
        <div className="badge">{soldOut ? <i className="o">Sold out</i> : <>{p.customTag ? <i className="g">{p.customTag}</i> : null}{p.tag ? <i className="g">{p.tag}</i> : null}{p.badge ? <i>{p.badge}</i> : null}</>}</div>
      </Link>
      <button className={`wish ${wishlist.includes(p.id) ? "on" : ""}`} onClick={() => toggleWish(p.id)} aria-label="wishlist">
        {wishlist.includes(p.id) ? "♥" : "♡"}
      </button>
      <div className="card-body">
        <div className="plating">{p.plating}</div>
        <Link to={`/product/${p.id}`} className="card-title"><h3>{p.name}</h3></Link>
        <div className="pr"><b>{formatINR(p.price)}</b><s>{formatINR(p.mrp)}</s><em>{off}% off</em></div>
        {flat25Live && <div className="off25">With code FLAT25 • {formatINR(Math.round(p.price * 0.75))}</div>}
        {!soldOut && low && <div className="stock low">Only {p.stock} left</div>}
        <div className="card-actions">
          <button className="add" disabled={soldOut} onClick={() => addToCart(p)}>{soldOut ? "Sold Out" : "Add to Bag"}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder grid while the catalogue loads. Shown only in API mode — the
 * built-in demo catalogue is used synchronously when no backend is configured.
 */
export function ProductGridSkeleton({ count = 4, className = "" }) {
  return (
    <div className={`grid ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-card" key={i}>
          <div className="sk sk-media" />
          <div className="sk-body">
            <span className="sk sk-eyebrow" />
            <span className="sk sk-title" />
            <span className="sk sk-title short" />
            <span className="sk sk-price" />
            <span className="sk sk-btn" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Shown instead of products when the backend is configured but unreachable.
 * Deliberately never falls back to the demo catalogue: showing invented
 * prices and stock on a live store is worse than showing nothing.
 */
export function ProductsUnavailable({ onRetry }) {
  return (
    <div className="unavailable" role="alert" aria-live="polite">
      <span className="eyebrow">Connection interrupted</span>
      <h3 className="serif">Our collection is temporarily unavailable</h3>
      <p>We couldn’t load the latest pieces just now. Your bag and account are safe — please try again in a moment.</p>
      {onRetry && <button type="button" className="btn btn-gold" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/**
 * Promo-code selector: active codes as tappable chips + a text input for
 * typing any code. The SERVER re-validates every code at checkout; this UI
 * only carries the selection.
 */
export function PromoInput() {
  const { coupon, setCoupon, promos } = useStore();
  const [draft, setDraft] = useState("");
  const apply = () => {
    const c = draft.trim().toUpperCase();
    if (!c) return;
    setCoupon(c);
    setDraft("");
  };
  const active = promos.find((p) => String(p.code).toUpperCase() === String(coupon || "").toUpperCase());
  if (!promos.length && !coupon) return null;
  return (
    <div className="promo-box">
      {promos.length > 0 && (
        <div>
          {promos.map((p) => (
            <button
              key={p.code}
              type="button"
              className={`chip ${coupon === p.code ? "on" : ""}`}
              title={p.description || `${p.percent}% off${p.minSubtotal > 0 ? ` over ₹${p.minSubtotal}` : ""}`}
              onClick={() => setCoupon(coupon === p.code ? "" : p.code)}
            >
              {p.code} −{p.percent}%{p.minSubtotal > 0 ? ` • min ₹${p.minSubtotal}` : ""}
            </button>
          ))}
        </div>
      )}
      <div className="promo-row">
        <input value={draft} maxLength={20} placeholder="Enter promo code" aria-label="Promo code" onChange={(e) => setDraft(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), apply())} />
        <button type="button" className="mini-btn" onClick={apply} disabled={!draft.trim()}>Apply</button>
        {coupon && <button type="button" className="mini-btn danger" onClick={() => setCoupon("")} aria-label="Remove promo code">✕</button>}
      </div>
      {coupon && (
        <small className="promo-note">
          {active ? `${coupon} applied — ${active.percent}% off${active.minSubtotal > 0 ? ` over ₹${active.minSubtotal}` : ""}.` : `Code "${coupon}" will be checked on our server at checkout.`}
        </small>
      )}
    </div>
  );
}

/**
 * Announcement / marquee bar.
 *  - Backend settings can provide scrolling `messages` → animated marquee
 *    (duplicated track for a seamless loop; pauses on hover/focus).
 *  - Otherwise falls back to the settings text, then to the built-in festive
 *    copy (demo mode / before settings load).
 *  - `announcement: null` from the backend means the bar is switched OFF.
 */
export function AnnounceBar() {
  const { settings } = useStore();
  const a = settings?.announcement;
  const messages = (a?.messages || []).filter(Boolean);

  // Server explicitly turned the bar off.
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
        <div className="marquee-track" aria-hidden="false">
          {track.map((m, i) => (
            <span className="marquee-item" key={i}>
              <span>{m}</span>
              <span className="dot" aria-hidden="true">✦</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Fallbacks: configured text, then the built-in festive line.
  if (a?.text) {
    return (
      <div className="announce" role="region" aria-label="Store announcement">
        <span className="announce-full">{a.text}</span>
        <span className="announce-short">{a.shortText || a.text}</span>
      </div>
    );
  }
  return (
    <div className="announce">
      <span className="announce-full">Free shipping over ₹999 <span className="dot">•</span> COD available <span className="dot">•</span> 7-day easy exchange</span>
      <span className="announce-short">Free shipping over ₹999 <span className="dot">•</span> COD available</span>
    </div>
  );
}

const SEARCH_MIN = 2;
const SEARCH_TERMS = ["Jhumka", "Kundan", "Temple", "Necklace set", "Bangles"];

/**
 * Debounced catalogue lookup. Fires only while the panel is open and the query
 * is at least two characters; a failed request surfaces as an error state.
 */
function useProductSearch(term, active) {
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
      searchProducts(needle, 6)
        .then((results) => alive && setState({ status: "ready", results }))
        .catch(() => alive && setState({ status: "error", results: [] }));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [needle, active, attempt]);
  return [state, () => setAttempt((n) => n + 1)];
}

/**
 * Header search with live results. Desktop and mobile use the same component;
 * results come from the server in API mode (and the local catalogue in demo
 * mode), never from invented data when the backend is down.
 */
function SearchBox({ className = "", placeholder = "Search jewellery…" }) {
  const uid = useId().replace(/:/g, "");
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [search, retry] = useProductSearch(term, open);
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
              <span>We couldn’t reach the store just now — your bag and account are safe.</span>
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
                      <small>{String(p.category || p.plating || "").replace(/-/g, " ")}</small>
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
  const { totals, setCartOpen, wishlist } = useStore();
  const { user, logout } = useAuth();
  const isAdmin = ["admin", "staff"].includes(user?.role);
  const [menu, setMenu] = useState(false);
  const [mnav, setMnav] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const nextParam = pathname + search;
  // Header compacts and lifts (shadow) once the page scrolls — a quiet luxury cue.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Login links remember where the visitor was headed (?next=… is validated server-side/redirect-side).
  const loginHref = (pathname === "/login" || pathname === "/register") ? "/login" : `/login?next=${encodeURIComponent(nextParam)}`;
  const signupHref = (pathname === "/login" || pathname === "/register") ? "/register" : `/register?next=${encodeURIComponent(nextParam)}`;
  useEffect(() => { setMenu(false); setMnav(false); }, [pathname]);
  useEffect(() => {
    if (!mnav) return;
    const onKey = (e) => { if (e.key === "Escape") setMnav(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mnav]);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  return (
    <>
      <AnnounceBar />
      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        <div className="container">
          <div className="header-top">
            <button className="hbtn menu-btn" onClick={() => setMnav(true)} aria-label="Open menu" aria-expanded={mnav}><IconMenu /></button>
            <Link to="/" className="logo" aria-label="Nilaara Jewellers home">
              <img className="logo-mark" src="/nilaara-mark.png" alt="" />
              <span><span className="logo-name">NILAARA</span><br /><span className="logo-sub">Gold-Plated • Artificial Jewellery</span></span>
            </Link>
            <SearchBox placeholder="Search necklace sets, jhumkas, kundan, temple…" />
            <div className="hicons">
              <Link className="hbtn wish-hbtn" to="/wishlist" aria-label={wishlist.length > 0 ? `Wishlist, ${wishlist.length} saved` : "Wishlist"}>
                <IconHeart />{wishlist.length > 0 && <span className="count">{wishlist.length}</span>}
              </Link>
              {user ? (
                <span className="acct-hbtn" ref={menuRef}>
                  <button
                    className="hbtn avatar"
                    onClick={() => setMenu((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    aria-label={`Account menu${user.name ? ` for ${user.name}` : ""}`}
                    title={user.name || "Account"}
                  >
                    <span aria-hidden="true">{initialsOf(user)}</span>
                  </button>
                  {menu && (
                    <span className="acct-menu" role="menu" aria-label="Account">
                      <span className="acct-menu-head">
                        <b>{user.name}</b>
                        <small>{user.email || user.phone || ""}</small>
                      </span>
                      <Link role="menuitem" to="/account" onClick={() => setMenu(false)}><IconUser /> Profile</Link>
                      <Link role="menuitem" to="/orders" onClick={() => setMenu(false)}><IconBox /> My Orders</Link>
                      <Link role="menuitem" to="/wishlist" onClick={() => setMenu(false)}><IconHeart /> Wishlist</Link>
                      {isAdmin && <Link role="menuitem" className="acct-admin" to="/admin" onClick={() => setMenu(false)}><IconShield /> Admin Panel</Link>}
                      <button role="menuitem" onClick={() => { setMenu(false); logout(); nav("/"); }}><IconLogout /> Log out</button>
                    </span>
                  )}
                </span>
              ) : (
                <span className="auth-btns">
                  <Link className="hbtn auth-btn auth-login" to={loginHref} aria-label="Log in to your account" title="Log in">
                    <IconUser /><span className="auth-label">Log in</span>
                  </Link>
                  <Link
                    className="hbtn auth-btn auth-signup"
                    to={signupHref}
                    aria-label="Create a new account"
                    title="Sign up"
                  >
                    <IconUserPlus /><span className="auth-label">Sign up</span>
                  </Link>
                </span>
              )}
              {isAdmin && (
                <Link className="hbtn admin-hbtn" to="/admin" aria-label="Admin panel" title="Admin panel">
                  <IconShield /><span className="admin-label">Admin</span>
                </Link>
              )}
              <button
                className="hbtn cart-hbtn"
                onClick={() => setCartOpen(true)}
                aria-label={totals.count > 0 ? `Shopping cart, ${totals.count} items` : "Shopping cart, empty"}
              >
                <IconCart />{totals.count > 0 && <span className="count">{totals.count}</span>}
              </button>
            </div>
          </div>
          <SearchBox className="m" placeholder="Search jewellery…" />
          <nav className="nav">
            <NavLink to="/shop?col=new">New Launches</NavLink>
            <NavLink to="/shop?col=best-sellers">Best Sellers</NavLink>
            <NavLink to="/shop?cat=jewellery-sets">Jewellery Sets</NavLink>
            <NavLink to="/shop?cat=necklaces">Necklaces</NavLink>
            <NavLink to="/shop?cat=earrings">Earrings</NavLink>
            <NavLink to="/shop?cat=jhumkas">Jhumkas</NavLink>
            <NavLink to="/shop?cat=bangles">Bangles</NavLink>
            <NavLink to="/shop?cat=rings">Rings</NavLink>
            <NavLink to="/shop?col=kundan">Kundan</NavLink>
            <NavLink to="/shop?col=temple">Temple</NavLink>
            <NavLink to="/stores">Our Stores</NavLink>
            <NavLink to="/about">Our Craft</NavLink>
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
                  {[
                    ["Jewellery Sets", "/shop?cat=jewellery-sets"],
                    ["Necklaces", "/shop?cat=necklaces"],
                    ["Earrings", "/shop?cat=earrings"],
                    ["Jhumkas", "/shop?cat=jhumkas"],
                    ["Bangles", "/shop?cat=bangles"],
                    ["Rings", "/shop?cat=rings"],
                  ].map(([label, to]) => (
                    <Link key={label} to={to} onClick={() => setMnav(false)}>{label}</Link>
                  ))}
                </div>
              </div>
              <div className="mnav-group">
                <small>Collections</small>
                <div className="mnav-links one">
                  {COLLECTIONS.map((c) => (
                    <Link key={c.slug} to={`/shop?col=${c.slug}`} onClick={() => setMnav(false)}>{c.name}</Link>
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
                    ["Track Order", "/track"],
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
              {user ? (
                <>
                  <small>Signed in as <b>{user.name}</b></small>
                  <div className="mnav-acct">
                    <Link className="btn btn-ghost" to="/account" onClick={() => setMnav(false)}><IconUser /> Profile</Link>
                    <Link className="btn btn-ghost" to="/orders" onClick={() => setMnav(false)}><IconBox /> Orders</Link>
                    <Link className="btn btn-ghost" to="/wishlist" onClick={() => setMnav(false)}><IconHeart /> Wishlist</Link>
                  </div>
                  {isAdmin && (
                    <Link className="btn btn-gold mnav-admin" to="/admin" onClick={() => setMnav(false)}>
                      <IconShield /> Admin Panel
                    </Link>
                  )}
                  <button className="btn btn-ghost mnav-logout" onClick={() => { logout(); setMnav(false); nav("/"); }}>
                    <IconLogout /> Log out
                  </button>
                </>
              ) : (
                <div className="mnav-auth">
                  <Link className="btn btn-gold" to={loginHref} onClick={() => setMnav(false)}>Log in</Link>
                  <Link className="btn btn-ghost" to={signupHref} onClick={() => setMnav(false)}>Sign up</Link>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

export function CartDrawer() {
  const { cartOpen, setCartOpen, cart, updateQty, removeItem, totals, requireLogin, settings } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const goCheckout = () => {
    setCartOpen(false);
    if (hasAPI && !user) {
      requireLogin(
        { type: "checkout" },
        "Log in to check out",
        "Your bag stays exactly as it is — we'll bring you back to checkout right after you sign in."
      );
      return;
    }
    nav("/checkout");
  };
  if (!cartOpen) return null;
  const freeOver = Number(settings?.shipping?.freeOver ?? 999);
  const need = Math.max(0, freeOver - (totals.sub - totals.couponOff));
  return (
    <>
      <div className="overlay" onClick={() => setCartOpen(false)} />
      <aside className="drawer">
        <div className="drawer-head"><h3>Your Bag ({totals.count})</h3><button className="hbtn" onClick={() => setCartOpen(false)}>✕</button></div>
        <div className="drawer-body">
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 12 }}>
            <small style={{ letterSpacing: 1 }}>OFFERS • FREE SHIPPING OVER {formatINR(freeOver)}</small>
            <PromoInput />
            <div className="progress"><i style={{ width: `${Math.min(100, ((totals.sub - totals.couponOff) / freeOver) * 100)}%` }} /></div>
            <small>{need > 0 ? <>Add products worth {formatINR(need)} more for free shipping</> : <>You've unlocked free shipping ✦</>}</small>
          </div>
          {cart.length === 0 && <div className="empty">Your bag is empty.<br /><Link to="/shop" onClick={() => setCartOpen(false)} className="link">Continue shopping</Link></div>}
          {cart.map((i) => (
            <div className="mini" key={i.id}>
              <Img src={i.image} alt={i.name} />
              <div><b>{i.name}</b><small style={{ color: "var(--muted)" }}>{i.plating}</small>
                <div className="qty">
                  <button onClick={() => updateQty(i.id, i.qty - 1)}>−</button><span>{i.qty}</span><button onClick={() => updateQty(i.id, i.qty + 1)}>+</button>
                  <b style={{ marginLeft: 8 }}>{formatINR(i.price * i.qty)}</b>
                </div>
              </div>
              <button className="hbtn" onClick={() => removeItem(i.id)}>✕</button>
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          <div className="row"><span>Subtotal</span><span>{formatINR(totals.sub)}</span></div>
          <div className="row"><span>Discount (MRP + offers)</span><span>−{formatINR(totals.discount + totals.couponOff)}</span></div>
          <div className="row"><span>Shipping</span><span>{totals.shipping === 0 ? "FREE" : formatINR(totals.shipping)}</span></div>
          <div className="row total"><span>Total</span><span>{formatINR(totals.total)}</span></div>
          <button type="button" className="btn btn-gold" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={goCheckout}>
            {user || !hasAPI ? `Checkout • ${formatINR(totals.total)}` : "Log in to checkout"}
          </button>
        </div>
      </aside>
    </>
  );
}

export function Footer() {
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <img className="footer-logo" src="/nilaara-logo.png" alt="Nilaara Jewellers" />
            <p>Premium artificial & gold-plated jewellery — handcrafted in India. Skin-friendly, tarnish-resistant, made for weddings, festivals & everyday elegance.</p>
            <p style={{ marginTop: 10 }}>CIN: UXXXXXKA2026PTC000000<br />© 2026 Nilaara Jewellers. All rights reserved.</p>
          </div>
          <div>
            <h4>Care</h4>
            <p><Link to="/track">Track Your Order</Link><br /><Link to="/stores">Our 2 Stores + Directions</Link><br /><Link to="/about">Shipping Policy</Link><br /><Link to="/about">Return & Exchange</Link><br /><Link to="/about">Jewellery Care</Link><br /><Link to="/contact">Contact Us</Link></p>
          </div>
          <div>
            <h4>Shop</h4>
            <p><Link to="/shop?cat=jewellery-sets">Jewellery Sets</Link><br /><Link to="/shop?cat=jhumkas">Jhumkas</Link><br /><Link to="/shop?cat=bangles">Bangles</Link><br /><Link to="/shop?col=kundan">Kundan</Link><br /><Link to="/shop?col=temple">Temple</Link></p>
          </div>
          <div>
            <h4>Sign up and save</h4>
            <p>Special offers, new drops & once-in-a-lifetime deals.</p>
            <form className="news" onSubmit={(e) => { e.preventDefault(); setOk(true); }}>
              <input placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button>Join</button>
            </form>
            {ok && <p style={{ color: "var(--gold)" }}>Welcome to the Nilaara family ✦</p>}
            <p style={{ marginTop: 12 }}>WhatsApp: +91-98XXXXXXXX<br />10:30 AM – 5:30 PM, Mon–Sat</p>
          </div>
        </div>
        <div className="copy"><span>Made with care in India • COD available • Razorpay coming soon</span><span>Secure payments • Easy 7-day exchange</span></div>
      </div>
    </footer>
  );
}
