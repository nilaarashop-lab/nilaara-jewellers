import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useAuth } from "../store/AuthContext";
import { formatINR } from "../data/products";
import { Img, PromoInput } from "../components/Layout";
import {
  hasAPI,
  previewOrder,
  createOrder,
  fetchOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  loadRazorpayScript,
} from "../api/client";

/**
 * Multi-step checkout.
 *  1 Review   — items + SERVER-recalculated totals (POST /api/orders/preview)
 *  2 Delivery — recipient details, Indian PIN/state validation, shipping
 *               methods (fees & ETAs come ONLY from /api/settings)
 *  3 Payment  — COD and/or Razorpay (server order + signature verification)
 *  4 Success  — /success renders only after the backend confirms the order
 *
 * Progress (step, form, chosen method, created order) is kept in sessionStorage
 * so a refresh never wipes the customer's work; no OTP/password/secret is ever
 * stored there.
 */

const STEP_KEY = "nilaara-checkout-progress";
const LAST_ORDER_KEY = "nilaara-last-order";

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry",
];

const EMPTY_FORM = { name: "", phone: "", address: "", city: "", state: "", pin: "" };

const readProgress = () => {
  try {
    const raw = sessionStorage.getItem(STEP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
};

/** Field-level validation (mirrors the backend schema — the server re-checks everything). */
function validateDelivery(form) {
  const e = {};
  if (form.name.trim().length < 2) e.name = "Enter the recipient's full name.";
  if (!/^[6-9][0-9]{9}$/.test(form.phone)) e.phone = "Enter a valid 10-digit Indian mobile number.";
  if (form.address.trim().length < 5) e.address = "Enter the full address (flat/house, street, landmark).";
  if (form.city.trim().length < 2) e.city = "Enter the city.";
  if (!form.state) e.state = "Select the state.";
  if (!/^[1-9][0-9]{5}$/.test(form.pin)) e.pin = "Enter a valid 6-digit PIN code.";
  return e;
}

const etaLabel = (m) => {
  if (m?.etaMinDays == null && m?.etaMaxDays == null) return "";
  if (m.etaMinDays === m.etaMaxDays) return `${m.etaMinDays} day${m.etaMinDays === 1 ? "" : "s"}`;
  return `${m.etaMinDays}–${m.etaMaxDays} days`;
};

export default function Checkout() {
  const { cart, totals, coupon, updateQty, removeItem, clearCart, settings } = useStore();
  const { user, checking } = useAuth();
  const nav = useNavigate();

  const saved = useMemo(() => readProgress(), []);
  const [step, setStep] = useState(saved?.step || 1);
  const [form, setForm] = useState({ ...EMPTY_FORM, ...(saved?.form || {}) });
  const [formErr, setFormErr] = useState({});
  const [methodId, setMethodId] = useState(saved?.methodId ?? "");
  const [pay, setPay] = useState(saved?.pay || "cod");
  const [order, setOrder] = useState(saved?.order || null); // shop order already created (Razorpay retry)
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState("");
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");

  // ── Login required (server enforces it too) ──
  useEffect(() => {
    if (!hasAPI || checking) return;
    if (!user) nav(`/login?next=${encodeURIComponent("/checkout")}`, { replace: true });
  }, [user, checking, nav]);

  // ── Delivery options — ONLY from configured settings ──
  const methods = useMemo(() => {
    const configured = (settings?.shipping?.methods || []).filter((m) => m && m.id != null);
    if (configured.length) return configured;
    // No explicit methods configured → one standard option from the configured fee.
    return [{ id: "", label: "Standard Delivery", fee: Number(settings?.shipping?.fee ?? 79), etaMinDays: null, etaMaxDays: null }];
  }, [settings]);

  useEffect(() => {
    if (!methodId && methods.length && methods[0].id) setMethodId(methods[0].id);
  }, [methods, methodId]);

  // If COD is switched off in configuration, preselect the online method.
  useEffect(() => {
    if (settings?.payments?.cod === false && pay === "cod" && settings?.payments?.razorpay) setPay("razorpay");
  }, [settings, pay]);

  // ── Each step starts at the top (no route change happens between steps) ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // ── Persist progress (refresh-safe) ──
  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_KEY, JSON.stringify({ step, form, methodId, pay, order }));
    } catch {
      /* storage unavailable */
    }
  }, [step, form, methodId, pay, order]);

  // ── Server-side recalculation for every basket/method change ──
  const basket = useMemo(() => cart.map((i) => ({ id: i.id, qty: i.qty })), [cart]);
  useEffect(() => {
    if (!hasAPI || !basket.length) { setPreview(null); setPreviewErr(""); return; }
    let alive = true;
    previewOrder({ items: basket, coupon, shippingMethod: methodId })
      .then((t) => { if (alive) { setPreview(t); setPreviewErr(""); } })
      .catch((e) => { if (alive) setPreviewErr(e.message); });
    return () => { alive = false; };
  }, [basket, coupon, methodId]);

  const activeMethod = methods.find((m) => m.id === methodId) || methods[0] || null;
  // Display totals: the server preview when available, else a clearly local
  // estimate (demo mode has no pricing API). The order itself is ALWAYS
  // recalculated by the server.
  const view = preview || {
    items: cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, lineTotal: i.price * i.qty })),
    sub: totals.sub,
    couponOff: totals.couponOff,
    coupon: coupon || null,
    shipping: totals.shipping,
    total: totals.total,
    tax: null,
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const goDelivery = (e) => {
    e?.preventDefault();
    if (!cart.length && !order) return;
    setErr("");
    setStep(2);
  };

  const goPayment = () => {
    const e = validateDelivery(form);
    setFormErr(e);
    if (Object.keys(e).length) return;
    setErr("");
    setStep(3);
  };

  /** Saves the confirmed order and moves to the success screen. */
  const finish = (confirmed) => {
    try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(confirmed)); } catch { /* storage */ }
    try { sessionStorage.removeItem(STEP_KEY); } catch { /* storage */ }
    clearCart();
    nav("/success", { replace: true });
  };

  const placeCod = async () => {
    setPlacing(true);
    setErr("");
    try {
      const confirmed = await createOrder(payload("cod"));
      finish(confirmed);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setPlacing(false);
    }
  };

  const payload = (payment) => ({
    items: basket,
    coupon,
    payment,
    shippingMethod: methodId || undefined,
    customer: {
      name: form.name.trim(),
      phone: form.phone,
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state,
      pin: form.pin,
    },
  });

  const placeRazorpay = async () => {
    setPlacing(true);
    setErr("");
    try {
      // 1. The shop order must exist first (server computes the amount).
      //    A previous attempt's order is REUSED — safe retries, no duplicates.
      let shopOrder = order;
      if (!shopOrder) {
        shopOrder = await createOrder(payload("razorpay"));
        setOrder(shopOrder);
      }

      // 2. Provider order (amount = server total) + official checkout window.
      const provider = await createRazorpayOrder(shopOrder.orderNumber || shopOrder.id);
      const RazorpayCtor = await loadRazorpayScript();

      const rzp = new RazorpayCtor({
        key: provider.keyId,
        amount: provider.amountPaise,
        currency: provider.currency,
        name: "Nilaara Jewellers",
        description: `Order ${provider.shopOrderNumber}`,
        order_id: provider.orderId,
        prefill: { name: form.name, contact: form.phone, email: user?.email || undefined },
        theme: { color: "#8a1c1c" },
        handler: async (resp) => {
          // 3. The browser only FORWARDS the signature — the server verifies it
          //    and is the only thing that can mark the order paid.
          try {
            await verifyRazorpayPayment(provider.shopOrderNumber, resp);
            // Read the order back (server-verified state) for the success screen.
            let confirmed = null;
            try {
              confirmed = await fetchOrder(shopOrder.id || shopOrder._id);
            } catch {
              confirmed = null;
            }
            finish(confirmed || { ...shopOrder, payment: { ...(shopOrder.payment || {}), status: "paid" } });
          } catch (e) {
            setErr(`${e.message} Your payment was not lost — press "Pay" again to re-verify, or contact support with order ${provider.shopOrderNumber}.`);
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setErr("Payment window closed. Your order is saved as awaiting payment — press Pay again to retry; no duplicate order is created.");
            setPlacing(false);
          },
        },
      });
      rzp.on("payment.failed", (resp) => {
        setErr(`Payment failed: ${resp?.error?.description || "unknown error"}. You can retry safely — no duplicate order is created.`);
        setPlacing(false);
      });
      rzp.open();
    } catch (ex) {
      setErr(ex.message);
      setPlacing(false);
    }
  };

  const place = () => (pay === "cod" ? placeCod() : placeRazorpay());

  // ── Guards while auth/settings resolve ──
  if (hasAPI && (checking || (!user && !checking))) {
    return <main className="container"><div className="sec"><div className="empty"><p>Checking your session…</p></div></div></main>;
  }
  if (!cart.length && !order) {
    return (
      <main className="container">
        <div className="breadcrumb">Home / Checkout</div>
        <div className="sec">
          <div className="empty">
            <h2 className="serif" style={{ fontSize: 34 }}>Your bag is empty</h2>
            <p>Add something you love, then come back to check out.</p>
            <br />
            <Link to="/shop" className="btn btn-gold">Continue Shopping</Link>
          </div>
        </div>
      </main>
    );
  }

  const stepMeta = [
    { n: 1, label: "Review" },
    { n: 2, label: "Delivery" },
    { n: 3, label: "Payment" },
  ];

  return (
    <main className="container">
      <div className="breadcrumb">Home / Checkout</div>
      <div className="sec-head">
        <h2>Checkout</h2>
        <p>Secure • {settings?.payments?.cod !== false && "COD available • "}Server-verified payments</p>
      </div>

      {/* Progress indicator */}
      <ol className="checkout-steps" aria-label="Checkout progress">
        {stepMeta.map((s) => (
          <li key={s.n} className={`cstep ${step === s.n ? "on" : ""} ${step > s.n ? "done" : ""}`} aria-current={step === s.n ? "step" : undefined}>
            <span className="cstep-dot" aria-hidden="true">{step > s.n ? "✓" : s.n}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="checkout-grid">
        <div className="checkout-main">
          {/* ───────── Step 1: review ───────── */}
          {step === 1 && (
            <section className="form co-panel" aria-labelledby="co-review">
              <h3 id="co-review" className="serif" style={{ margin: 0, fontSize: 24 }}>Step 1 — Review your order</h3>
              <p className="co-note">Prices, discounts and stock are recalculated on our server for every change.</p>
              <PromoInput />
              {cart.map((i) => (
                <div className="mini" key={i.id}>
                  <Img src={i.image} alt={i.name} style={{ width: 78, height: 78 }} />
                  <div className="co-item">
                    <b>{i.name}</b>
                    <small>{i.plating ? `${i.plating} • ` : ""}{formatINR(i.price)} each{i.stock ? ` • ${i.stock} in stock` : ""}</small>
                    <div className="qty">
                      <button onClick={() => updateQty(i.id, i.qty - 1)} aria-label={`Decrease quantity of ${i.name}`}>−</button>
                      <span>{i.qty}</span>
                      <button onClick={() => updateQty(i.id, i.qty + 1)} aria-label={`Increase quantity of ${i.name}`}>+</button>
                      <button className="co-remove" onClick={() => removeItem(i.id)}>Remove</button>
                    </div>
                  </div>
                  <b>{formatINR(i.price * i.qty)}</b>
                </div>
              ))}
              <div className="co-actions">
                <Link to="/cart" className="btn btn-ghost">← Back to bag</Link>
                <button className="btn btn-gold" onClick={goDelivery}>Continue to Delivery →</button>
              </div>
            </section>
          )}

          {/* ───────── Step 2: delivery ───────── */}
          {step === 2 && (
            <section className="form co-panel" aria-labelledby="co-delivery">
              <h3 id="co-delivery" className="serif" style={{ margin: 0, fontSize: 24 }}>Step 2 — Delivery details</h3>
              <label htmlFor="co-name">Recipient full name</label>
              <input id="co-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Aarohi Sharma" autoComplete="name" />
              {formErr.name && <p className="field-err">{formErr.name}</p>}

              <div className="form-row-2">
                <div>
                  <label htmlFor="co-phone">Phone</label>
                  <input id="co-phone" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/[^0-9]/g, ""))} placeholder="10-digit mobile" autoComplete="tel" />
                  {formErr.phone && <p className="field-err">{formErr.phone}</p>}
                </div>
                <div>
                  <label htmlFor="co-pin">PIN code</label>
                  <input id="co-pin" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => set("pin", e.target.value.replace(/[^0-9]/g, ""))} placeholder="6-digit PIN" autoComplete="postal-code" />
                  {formErr.pin && <p className="field-err">{formErr.pin}</p>}
                </div>
              </div>

              <label htmlFor="co-address">Address</label>
              <textarea id="co-address" rows={3} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Flat / house, street, landmark" autoComplete="street-address" />
              {formErr.address && <p className="field-err">{formErr.address}</p>}

              <div className="form-row-2">
                <div>
                  <label htmlFor="co-city">City</label>
                  <input id="co-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" autoComplete="address-level2" />
                  {formErr.city && <p className="field-err">{formErr.city}</p>}
                </div>
                <div>
                  <label htmlFor="co-state">State</label>
                  <select id="co-state" value={form.state} onChange={(e) => set("state", e.target.value)} autoComplete="address-level1">
                    <option value="">Select state</option>
                    {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {formErr.state && <p className="field-err">{formErr.state}</p>}
                </div>
              </div>

              <fieldset className="ship-methods">
                <legend>Delivery method</legend>
                {methods.map((m) => {
                  const free = view.shipping === 0 && m.id === (activeMethod?.id ?? "");
                  return (
                    <label key={m.id || "standard"} className={`ship-card ${methodId === m.id ? "on" : ""}`}>
                      <input
                        type="radio"
                        name="ship-method"
                        checked={methodId === m.id}
                        onChange={() => { setMethodId(m.id); setErr(""); }}
                      />
                      <span className="ship-info">
                        <b>{m.label}</b>
                        {etaLabel(m) && <small>Estimated delivery: {etaLabel(m)}</small>}
                        {!etaLabel(m) && <small>Delivery estimate shared when the order is confirmed</small>}
                      </span>
                      <span className="ship-fee">{free || (view.shipping === 0 && methods.length === 1) ? "FREE" : formatINR(m.fee)}</span>
                    </label>
                  );
                })}
                {settings?.shipping?.freeOver != null && (
                  <p className="co-note">Orders above {formatINR(settings.shipping.freeOver)} ship free.</p>
                )}
              </fieldset>

              <div className="co-actions">
                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn-gold" onClick={goPayment}>Continue to Payment →</button>
              </div>
            </section>
          )}

          {/* ───────── Step 3: payment ───────── */}
          {step === 3 && (
            <section className="form co-panel" aria-labelledby="co-payment">
              <h3 id="co-payment" className="serif" style={{ margin: 0, fontSize: 24 }}>Step 3 — Payment</h3>

              <div className="co-review-box">
                <div className="row"><span>Deliver to</span><span>{form.name} • {form.phone}</span></div>
                <div className="row"><span>Address</span><span className="co-addr">{form.address}, {form.city}, {form.state} — {form.pin}</span></div>
                <div className="row"><span>Method</span><span>{activeMethod?.label}{etaLabel(activeMethod) ? ` (${etaLabel(activeMethod)})` : ""}</span></div>
              </div>

              <fieldset className="pay-methods">
                <legend>Payment method</legend>
                <label className={`pay-card ${pay === "cod" ? "on" : ""}`}>
                  <input type="radio" name="pay" checked={pay === "cod"} onChange={() => { setPay("cod"); setErr(""); }} disabled={settings?.payments?.cod === false} />
                  <span><b>Cash on Delivery</b><small>Pay when your order arrives • {view.total >= 0 ? formatINR(view.total) : ""} due</small></span>
                </label>
                <label className={`pay-card ${pay === "razorpay" ? "on" : ""}`}>
                  <input type="radio" name="pay" checked={pay === "razorpay"} onChange={() => { setPay("razorpay"); setErr(""); }} disabled={settings?.payments?.razorpay !== true} />
                  <span>
                    <b>UPI / Card / Netbanking — Razorpay</b>
                    <small>
                      {settings?.payments?.razorpay
                        ? "Paid on Razorpay's secure window. The order is marked paid only after our server verifies the payment signature."
                        : "Not available yet — enable RAZORPAY_KEY_ID / KEY_SECRET on the server and it appears here automatically."}
                    </small>
                  </span>
                </label>
              </fieldset>

              {order && (
                <p className="co-note">
                  Order <b>{order.orderNumber || order.id}</b> is already created and awaiting payment — retrying charges it once, never twice.
                </p>
              )}

              {err && <p className="auth-err" role="alert">{err}</p>}

              <div className="co-actions">
                <button className="btn btn-ghost" onClick={() => setStep(2)} disabled={placing}>← Back</button>
                <button className="btn btn-gold" onClick={place} disabled={placing}>
                  {placing ? "Processing…" : pay === "cod" ? `Place Order • ${formatINR(view.total)}` : `Pay ${formatINR(view.total)} securely`}
                </button>
              </div>
              <p className="co-note">Final amounts are computed and verified on our server.</p>
            </section>
          )}
        </div>

        {/* ───────── Live summary (server-recalculated) ───────── */}
        <aside className="form co-summary" aria-label="Order summary">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>
            Order summary {preview ? <small style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--muted)" }}>• updated by server</small> : ""}
          </h3>
          {view.items?.length > 0 ? view.items.map((i) => (
            <div className="row" key={i.id}><span>{i.name} × {i.qty}</span><span>{formatINR(i.lineTotal ?? i.price * i.qty)}</span></div>
          )) : order?.items?.map((i) => (
            <div className="row" key={i.productId || i.name}><span>{i.name} × {i.qty}</span><span>{formatINR(i.price * i.qty)}</span></div>
          ))}
          <div className="row"><span>Subtotal</span><span>{formatINR(view.sub ?? 0)}</span></div>
          {(view.couponOff || 0) > 0 && <div className="row"><span>Discount ({view.coupon || "coupon"})</span><span>−{formatINR(view.couponOff)}</span></div>}
          <div className="row">
            <span>Shipping{activeMethod && methods.length > 1 ? ` (${activeMethod.label})` : ""}</span>
            <span>{(view.shipping ?? 0) === 0 ? "FREE" : formatINR(view.shipping)}</span>
          </div>
          {view.tax != null && view.tax > 0 && (
            <div className="row"><span>GST ({view.taxRatePct}%)</span><span>{formatINR(view.tax)}</span></div>
          )}
          <div className="row total"><span>Total</span><span>{formatINR(view.total ?? 0)}</span></div>
          {previewErr && <p className="auth-err">{previewErr} — totals refresh automatically.</p>}
          {!hasAPI && <p className="co-note">Demo mode: totals are estimated locally; no order leaves your browser.</p>}
        </aside>
      </div>

    </main>
  );
}
