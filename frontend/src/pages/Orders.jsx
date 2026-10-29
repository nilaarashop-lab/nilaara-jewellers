import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { hasAPI, fetchMyOrders } from "../api/client";
import { formatINR } from "../data/products";
import { Img } from "../components/Layout";

/**
 * My Orders — Live / Old tabs driven by REAL MongoDB order statuses.
 *  Live: placed, packed, shipped (still in progress)
 *  Old : delivered, cancelled, returned, refunded (finished)
 * The server scopes every query to the session's user, so a customer can never
 * see anyone else's orders — no data is filtered client-side as a "security" measure.
 */

const STATUS_LABEL = {
  placed: "Order placed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
};
const PAY_LABEL = {
  pending: "Payment pending",
  cod_pending: "Pay on delivery",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const formatDateTime = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function StatusPill({ status }) {
  const tone = ["delivered"].includes(status) ? "ok" : ["cancelled", "returned", "refunded"].includes(status) ? "bad" : status === "shipped" ? "info" : "warn";
  return <span className={`pill pill-${tone}`}>{STATUS_LABEL[status] || status}</span>;
}
function PayPill({ status }) {
  const tone = status === "paid" ? "ok" : status === "failed" ? "bad" : status === "refunded" ? "info" : "warn";
  return <span className={`pill pill-${tone}`}>{PAY_LABEL[status] || status}</span>;
}

export default function MyOrders() {
  const { user, checking } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("live");
  const [orders, setOrders] = useState([]);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null); // expanded order id
  const [nonce, setNonce] = useState(0); // manual refresh trigger

  // Members only — guests are sent to login with a return path.
  useEffect(() => {
    if (!hasAPI || checking) return;
    if (!user) nav(`/login?next=${encodeURIComponent("/orders")}`, { replace: true });
  }, [user, checking, nav]);

  // Load the selected tab from the server (own orders only).
  useEffect(() => {
    let alive = true;
    setPhase("loading");
    setErr("");
    fetchMyOrders(tab)
      .then((list) => { if (alive) { setOrders(list); setPhase("ready"); } })
      .catch((e) => { if (alive) { setErr(e.message || "Could not load your orders."); setPhase("error"); } });
    return () => { alive = false; };
  }, [tab, user?.id, nonce]);

  const retry = () => setNonce((n) => n + 1);

  if (hasAPI && checking) {
    return <main className="container"><div className="sec"><div className="empty"><p>Loading your account…</p></div></div></main>;
  }

  return (
    <main className="container">
      <div className="breadcrumb">Home / My Orders</div>
      <div className="sec-head">
        <h2>My Orders</h2>
        <p>Live orders are in progress • Old orders are completed or cancelled</p>
      </div>

      <div className="order-tabs" role="tablist" aria-label="Order filters">
        <button
          role="tab"
          aria-selected={tab === "live"}
          className={`order-tab ${tab === "live" ? "on" : ""}`}
          onClick={() => setTab("live")}
        >
          Live Orders
        </button>
        <button
          role="tab"
          aria-selected={tab === "old"}
          className={`order-tab ${tab === "old" ? "on" : ""}`}
          onClick={() => setTab("old")}
        >
          Old Orders
        </button>
        <button className="hbtn orders-reload" onClick={() => setNonce((n) => n + 1)} aria-label="Refresh orders" title="Refresh">↻</button>
      </div>

      {phase === "loading" && (
        <div className="order-list" aria-busy="true">
          {[0, 1].map((i) => (
            <div className="order-card skeleton" key={i}>
              <div className="sk-line" style={{ width: "40%" }} />
              <div className="sk-line" style={{ width: "80%" }} />
              <div className="sk-line" style={{ width: "60%" }} />
            </div>
          ))}
          <p className="co-note">Loading your orders…</p>
        </div>
      )}

      {phase === "error" && (
        <div className="empty" role="alert">
          <h3 className="serif">We couldn't load your orders</h3>
          <p>{err}</p>
          <br />
          <button className="btn btn-gold" onClick={retry}>Try again</button>
        </div>
      )}

      {phase === "ready" && orders.length === 0 && (
        <div className="empty">
          <h3 className="serif">{tab === "live" ? "No live orders right now" : "No past orders yet"}</h3>
          <p>
            {tab === "live"
              ? "Orders you place will show here with their real packing & shipping status."
              : "Completed and cancelled orders will appear here for your records."}
          </p>
          <br />
          <Link to="/shop" className="btn btn-gold">Start Shopping</Link>
        </div>
      )}

      {phase === "ready" && orders.length > 0 && (
        <div className="order-list">
          {orders.map((o) => {
            const itemCount = (o.items || []).reduce((s, i) => s + i.qty, 0);
            const isOpen = open === o.id;
            const shipping = o.shipping;
            return (
              <article className="order-card" key={o.id}>
                <header className="order-head">
                  <div>
                    <b className="order-no">{o.orderNumber || o.id}</b>
                    <small>Placed {formatDate(o.createdAt)}</small>
                  </div>
                  <div className="order-pills">
                    <StatusPill status={o.status} />
                    <PayPill status={o.payment?.status} />
                  </div>
                </header>

                <div className="order-items">
                  {(o.items || []).slice(0, isOpen ? 99 : 2).map((i, idx) => (
                    <div className="order-item" key={`${i.productId || i.name}-${idx}`}>
                      <Img src={i.image} alt={i.name} />
                      <span>
                        <b>{i.name}</b>
                        <small>Qty {i.qty} • {formatINR(i.price)} each</small>
                      </span>
                      <em>{formatINR(i.price * i.qty)}</em>
                    </div>
                  ))}
                  {!isOpen && (o.items || []).length > 2 && (
                    <small className="order-more">+ {(o.items || []).length - 2} more item(s)</small>
                  )}
                </div>

                <footer className="order-foot">
                  <span>{itemCount} item(s) • <b>{formatINR(o.totals?.total || 0)}</b></span>
                  <button className="btn btn-ghost order-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : o.id)}>
                    {isOpen ? "Hide details" : "Details & tracking"}
                  </button>
                </footer>

                {isOpen && (
                  <div className="order-detail">
                    <div className="order-detail-grid">
                      <div>
                        <h4>Shipment tracking</h4>
                        <ul className="timeline">
                          {(o.statusHistory || []).map((s, i) => (
                            <li key={i}>
                              <span className={`tl-dot ${i === (o.statusHistory || []).length - 1 ? "cur" : ""}`} />
                              <span>
                                <b>{STATUS_LABEL[s.status] || s.status}</b>
                                {s.note ? <small> — {s.note}</small> : null}
                                <small className="tl-at">{formatDateTime(s.at)}</small>
                              </span>
                            </li>
                          ))}
                        </ul>
                        {shipping?.label && (
                          <p className="co-note">
                            {shipping.label}
                            {shipping.etaMinDays != null && shipping.etaMaxDays != null
                              ? ` • estimated ${shipping.etaMinDays === shipping.etaMaxDays ? `${shipping.etaMinDays} day` : `${shipping.etaMinDays}–${shipping.etaMaxDays} days`}`
                              : ""}
                          </p>
                        )}
                        <p className="co-note">
                          Tracking updates appear once our team marks the shipment — we only show real statuses.
                        </p>
                      </div>
                      <div>
                        <h4>Delivery address</h4>
                        <p className="order-addr">
                          {o.customer?.name}<br />
                          {o.customer?.address}<br />
                          {o.customer?.city}{o.customer?.state ? `, ${o.customer.state}` : ""} — {o.customer?.pin}<br />
                          Phone: {o.customer?.phone}
                          {o.customer?.notes ? (<><br /><small>Instructions: {o.customer.notes}</small></>) : null}
                        </p>
                        <h4>Payment</h4>
                        <p className="co-note">
                          {o.payment?.method === "razorpay" ? "Razorpay (UPI/Card/Netbanking)" : "Cash on Delivery"} • {PAY_LABEL[o.payment?.status] || o.payment?.status}
                        </p>
                      </div>
                    </div>
                    <div className="co-actions">
                      <Link to={`/track?id=${encodeURIComponent(o.id)}`} className="btn btn-ghost">Quick track</Link>
                      <Link to="/shop" className="btn btn-gold">Reorder favourites</Link>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
