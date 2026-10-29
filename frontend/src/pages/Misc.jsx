import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useAuth } from "../store/AuthContext";
import { PRODUCTS, formatINR } from "../data/products";
import { STORES } from "../data/stores";
import { ProductCard, Img, PromoInput } from "../components/Layout";
import { fetchOrder, fetchProducts, hasAPI } from "../api/client";

export function Cart() {
  const { cart, updateQty, removeItem, totals, coupon, requireLogin } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  // Checkout is member-only: guests keep their intended action and are asked
  // to sign in (the server also rejects guest checkouts with 401).
  const goCheckout = () => {
    if (hasAPI && !user) {
      requireLogin(
        { type: "checkout" },
        "Log in to check out",
        "Orders are stored with your account so you can track them anywhere. We'll take you straight to checkout after you sign in."
      );
      return;
    }
    nav("/checkout");
  };
  if (!cart.length) return <main className="container"><div className="sec"><div className="empty"><h2 className="serif" style={{ fontSize: 36 }}>Your bag is empty</h2><p>Discover our bestsellers.</p><br /><Link to="/shop" className="btn btn-gold">Continue Shopping</Link></div></div></main>;
  return (
    <main className="container">
      <div className="breadcrumb">Home / Bag</div>
      <div className="sec-head"><h2>Shopping Bag ({totals.count})</h2></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }} className="cart-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cart.map((i) => (
            <div className="mini" key={i.id} style={{ padding: 14 }}>
              <Img src={i.image} alt={i.name} style={{ width: 100, height: 100 }} />
              <div><b style={{ fontSize: 15 }}>{i.name}</b><br /><small style={{ color: "var(--muted)" }}>{i.plating}</small>
                <div className="qty"><button onClick={() => updateQty(i.id, i.qty - 1)}>−</button><span>{i.qty}</span><button onClick={() => updateQty(i.id, i.qty + 1)}>+</button>
                  <button onClick={() => removeItem(i.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--muted)", marginLeft: 10 }}>Remove</button></div>
              </div>
              <b>{formatINR(i.price * i.qty)}</b>
            </div>
          ))}
        </div>
        <div className="form" style={{ alignSelf: "start" }}>
          <h3 className="serif" style={{ margin: 0, fontSize: 26 }}>Bill Summary</h3>
          <div className="row"><span>Subtotal</span><span>{formatINR(totals.sub)}</span></div>
          <div className="row"><span>MRP discount</span><span>−{formatINR(totals.discount)}</span></div>
          <div className="row"><span>Coupon ({coupon || "—"})</span><span>−{formatINR(totals.couponOff)}</span></div>
          <PromoInput />
          <div className="row"><span>Shipping</span><span>{totals.shipping === 0 ? "FREE" : formatINR(totals.shipping)}</span></div>
          <div className="row total"><span>Total</span><span>{formatINR(totals.total)}</span></div>
          <button type="button" className="btn btn-gold" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={goCheckout}>
            Proceed to Checkout →
          </button>
          {!user && hasAPI && <p className="co-note" style={{ textAlign: "center" }}>You'll be asked to log in first — your bag stays exactly as it is.</p>}
        </div>
      </div>
    </main>
  );
}

export function Success() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [order] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nilaara-last-order") || "null");
    } catch {
      return null;
    }
  });
  // This screen only ever shows an order the BACKEND confirmed. Without one
  // there is nothing to celebrate — redirect home instead of faking success.
  const orderId = params.get("order");
  useEffect(() => {
    if (!order && !orderId) nav("/", { replace: true });
  }, [order, orderId, nav]);
  if (!order) return null;

  const items = order.items || [];
  const payStatus = order.payment?.status;
  const payText =
    { pending: "Payment pending", cod_pending: "Cash on delivery", paid: "Payment received", failed: "Payment failed", refunded: "Refunded" }[payStatus] || "";
  const shipping = order.shipping;
  const eta =
    shipping?.etaMinDays != null && shipping?.etaMaxDays != null
      ? shipping.etaMinDays === shipping.etaMaxDays
        ? `${shipping.etaMinDays} day${shipping.etaMinDays === 1 ? "" : "s"}`
        : `${shipping.etaMinDays}–${shipping.etaMaxDays} days`
      : "";

  return (
    <main className="container">
      <div className="sec">
        <div className="success" role="status">
          {/* Pure decoration — this page rendered only because the SERVER
              confirmed the order. Motion respects prefers-reduced-motion. */}
          <svg className="check-draw" viewBox="0 0 52 52" aria-hidden="true">
            <circle className="check-circle" cx="26" cy="26" r="24" />
            <path className="check-mark" d="M15 27 l7 7 l15 -16" />
          </svg>
          <h1 className="serif" style={{ fontSize: 42, margin: "10px 0 4px" }}>Shukriya! Order Placed Successfully</h1>
          <p className="success-no">
            Order <b>{order.orderNumber || order.id}</b>
            {payText ? <> • {payText}</> : null}
          </p>

          <div className="success-summary">
            {items.map((i, idx) => (
              <div className="row" key={i.productId || `${i.name}-${idx}`}>
                <span>{i.name} × {i.qty}</span>
                <span>{formatINR(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="row total"><span>Total</span><span>{formatINR(order.totals?.total || 0)}</span></div>
            {shipping?.label && (
              <div className="row"><span>{shipping.label}</span><span>{eta ? `in ${eta}` : ""}</span></div>
            )}
          </div>

          <p style={{ color: "var(--ink-soft)" }}>
            {payStatus === "cod_pending"
              ? `Keep ${formatINR(order.totals?.total || 0)} ready — you'll pay on delivery.`
              : payStatus === "paid"
                ? "Payment confirmed on our server. Thank you!"
                : "We'll update the real status as our team packs and ships your order."}
          </p>

          <div className="cta-row" style={{ justifyContent: "center" }}>
            <Link to="/orders" className="btn btn-gold">Go to My Orders</Link>
            <Link to="/shop" className="btn btn-ghost">Continue Shopping</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export function Wishlist() {
  const { wishlist } = useStore();
  const [items, setItems] = useState(PRODUCTS);
  useEffect(() => { fetchProducts().then(setItems).catch(() => {}); }, []);
  const list = items.filter((p) => wishlist.includes(p.id));
  return (
    <main className="container"><div className="breadcrumb">Home / Wishlist</div>
      <div className="sec-head"><h2>Wishlist ({list.length})</h2></div>
      {list.length === 0 ? <div className="empty">Nothing saved yet.<br /><br /><Link to="/shop" className="btn btn-gold">Discover jewellery</Link></div> :
        <div className="grid">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </main>
  );
}

export function About() {
  return (
    <main className="container">
      <div className="breadcrumb">Home / Our Craft</div>
      <div className="pd"><div className="pd-media"><Img src={PRODUCTS[0].images[0]} alt="craft" /></div>
        <div><span className="eyebrow">Nilaara Jewellers • heirlooms for every celebration</span>
          <h1 className="serif" style={{ fontSize: 52, margin: "10px 0" }}>Gold-plated artistry, honest prices.</h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.8 }}>We work with Jaipur & Mumbai karigars to craft artificial jewellery that feels real — 18K–24K micron plating, hand-set kundan & American diamonds, skin-safe bases. Every piece is quality-checked, weight-balanced for comfort, and shipped in a keepsake box.<br /><br />✦ Tarnish-resistant plating • ✦ Nickel-safe • ✦ 7-day exchange • ✦ COD + Razorpay (soon)</p>
        </div></div>
    </main>
  );
}

export function Contact() {
  const [ok, setOk] = useState(false);
  return (
    <main className="container"><div className="breadcrumb">Home / Contact</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="cart-grid">
        <div className="form"><h2 className="serif" style={{ fontSize: 36, margin: 0 }}>Talk to us</h2><p style={{ color: "var(--ink-soft)" }}>WhatsApp +91-98XXXXXXXX • 10:30–5:30 Mon–Sat</p>
          <form onSubmit={(e) => { e.preventDefault(); setOk(true); }}><label>Name</label><input required /><label>Message</label><textarea rows={4} required placeholder="Order help, sizing, gifting…" /><br /><button className="btn btn-gold" style={{ marginTop: 12 }}>Send Message</button></form>
          {ok && <p>✓ Received! We reply within a few hours.</p>}</div>
        <div className="form"><h3 className="serif">Care & policies</h3><p style={{ lineHeight: 1.8, color: "var(--ink-soft)" }}>Shipping 3–5 days • Free over ₹999 • COD available • 7-day exchange on unused pieces • Keep jewellery away from perfume & water. Razorpay UPI/cards go live after backend keys are added — see backend README.</p>
          <h3 className="serif" style={{ marginTop: 18 }}>Our 2 stores</h3>
          {STORES.map((s) => <p key={s.id} style={{ fontSize: 14 }}><b>{s.name}</b><br /><a className="link" href={s.mapsUrl} target="_blank" rel="noreferrer">Get Directions →</a></p>)}
          <Link to="/stores" className="btn btn-ghost" style={{ marginTop: 8 }}>View both stores</Link></div>
      </div>
    </main>
  );
}

export function Track() {
  const [params] = useSearchParams();
  const [id, setId] = useState(() => (params.get("id") || "").slice(0, 60));
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const last = (() => {
    try {
      return JSON.parse(localStorage.getItem("nilaara-last-order") || "null");
    } catch {
      return null;
    }
  })();

  const track = async (e) => {
    e.preventDefault();
    setErr("");
    setOrder(null);
    if (!id.trim()) return setErr("Enter your order ID.");
    setBusy(true);
    try {
      setOrder(await fetchOrder(id.trim(), phone.trim()));
    } catch (ex) {
      setErr(ex.status === 403 ? "Enter the 10-digit phone number used at checkout to view this order." : ex.message);
    } finally {
      setBusy(false);
    }
  };

  // Deep link ?id=… (from My Orders) looks the order up immediately.
  useEffect(() => {
    const initial = params.get("id");
    if (!initial) return;
    let alive = true;
    setBusy(true);
    fetchOrder(initial, "")
      .then((o) => alive && setOrder(o))
      .catch((ex) => alive && setErr(ex.status === 403 ? "Enter the 10-digit phone number used at checkout to view this order." : ex.message))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [params]);

  const label = { placed: "Order placed", packed: "Packed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned", refunded: "Refunded" };

  return (
    <main className="container"><div className="breadcrumb">Home / Track</div>
      <div className="form" style={{ maxWidth: 560, margin: "18px auto" }}><h2 className="serif" style={{ fontSize: 36, margin: 0 }}>Track your order</h2>
        <form onSubmit={track} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder={last?.orderNumber || last?.id || "Order ID"} style={{ flex: 2, minWidth: 180 }} />
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Phone (guest orders)" maxLength={10} inputMode="numeric" style={{ flex: 1, minWidth: 130 }} />
          <button className="btn btn-gold" disabled={busy}>{busy ? "Tracking…" : "Track"}</button>
        </form>
        {err && <p className="auth-err">{err}</p>}
        {order && (
          <div style={{ marginTop: 14 }}>
            <p><b>{order.orderNumber || order.id}</b> • {label[order.status] || order.status}</p>
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>{(order.items || []).reduce((s, i) => s + i.qty, 0)} item(s) • {formatINR(order.totals?.total || 0)} • payment: {order.payment?.status?.replace("_", " ")}</p>
            {order.statusHistory?.length > 0 && (
              <ul style={{ fontSize: 13.5, color: "var(--ink-soft)", paddingLeft: 18 }}>
                {order.statusHistory.map((s, i) => <li key={i}>{label[s.status] || s.status} — {new Date(s.at).toLocaleString("en-IN")}</li>)}
              </ul>
            )}
          </div>
        )}
        {last?.id && <p style={{ fontSize: 13 }}>Last order: <b>{last.orderNumber || last.id}</b> • {formatINR(last?.totals?.total || 0)}</p>}
      </div>
    </main>
  );
}
