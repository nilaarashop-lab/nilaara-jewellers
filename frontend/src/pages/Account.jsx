import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { updateMe, fetchMyOrders, linkGoogle, googleEnabled } from "../api/client";
import GoogleButton from "../components/GoogleButton";
import { formatINR } from "../data/products";

/**
 * Customer account page: profile editing, sign-in methods, and own order history.
 * Data is loaded from the session-scoped backend endpoints — the server only ever
 * returns the signed-in customer's own profile and orders.
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

function Badge({ on, children }) {
  return (
    <span className={`sec-badge ${on ? "sec-badge-on" : ""}`} title={String(children)}>
      {children}
    </span>
  );
}

export default function Account() {
  const { user, setUser, logout, checking } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [profileOk, setProfileOk] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [orders, setOrders] = useState(null); // null = loading
  const [ordersErr, setOrdersErr] = useState("");
  const [linkErr, setLinkErr] = useState("");

  // Session guard: not logged in (and no longer checking) → login with return path.
  useEffect(() => {
    if (!checking && !user) nav("/login?next=/account", { replace: true });
  }, [checking, user, nav]);

  // Seed the edit form when the SIGNED-IN ACCOUNT changes (state-comparison
  // pattern; starts at null so the first account always seeds the fields).
  const [formUserId, setFormUserId] = useState(null);
  const currentId = user?.id || null;
  if (currentId !== formUserId) {
    setFormUserId(currentId);
    setName(user?.name || "");
    setEmail(user?.email || "");
  }

  // Own order history (401 → handled by AuthContext clearing the user).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchMyOrders()
      .then((list) => alive && setOrders(list))
      .catch((ex) => {
        if (!alive) return;
        setOrders([]);
        setOrdersErr(ex.message);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null; // redirecting to /login

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileErr("");
    setProfileOk("");
    setProfileBusy(true);
    try {
      const { user: updated } = await updateMe({ name: name.trim(), ...(email.trim() ? { email: email.trim() } : {}) });
      setUser(updated);
      setEmail(updated.email || ""); // server normalizes (lowercases)
      setProfileOk("Profile updated.");
    } catch (ex) {
      setProfileErr(ex.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const onLinkGoogle = async (credential) => {
    setLinkErr("");
    try {
      const { user: updated } = await linkGoogle(credential);
      setUser(updated);
    } catch (ex) {
      setLinkErr(ex.message);
    }
  };

  const privileged = user.role === "admin" || user.role === "staff";

  return (
    <main className="container">
      <div className="breadcrumb">Home / Account</div>
      <section className="sec" style={{ paddingTop: 6 }}>
        <span className="eyebrow">My account</span>
        <h1 className="serif" style={{ fontSize: "clamp(32px,4vw,46px)", margin: "8px 0 4px" }}>
          {user.name}
        </h1>
        <p className="auth-note" style={{ marginBottom: 18 }}>
          {user.email || user.phone}
          {user.role === "customer" && <span className="sec-badge sec-badge-on" style={{ marginLeft: 10 }}>Customer</span>}
        </p>

        <div className="acct-grid">
          {/* ── Profile ── */}
          <div className="acct-card">
            <h3 className="serif">Profile</h3>
            <form className="form" onSubmit={saveProfile}>
              <label>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={user.provider === "google" && user.googleLinked}
              />
              {user.provider === "google" && user.googleLinked && (
                <p className="auth-note">Email comes from your Google account.</p>
              )}
              {profileErr && <p className="auth-err">{profileErr}</p>}
              {profileOk && <p className="auth-ok">{profileOk}</p>}
              <button className="btn btn-gold" disabled={profileBusy} style={{ justifyContent: "center" }}>
                {profileBusy ? "Saving…" : "Save changes"}
              </button>
            </form>
          </div>

          {/* ── Sign-in methods ── */}
          <div className="acct-card">
            <h3 className="serif">Sign-in & security</h3>
            <div className="badge-row">
              <Badge on={user.phoneVerified}>{user.phone ? "Mobile verified" : "No mobile"}</Badge>
              <Badge on={user.emailVerified}>{user.email ? "Email verified" : "No email"}</Badge>
              <Badge on={user.googleLinked}>Google linked</Badge>
            </div>

            {!privileged && user.phone && (
              <p className="auth-note">
                Mobile <b>+91 {user.phone}</b> — {user.phoneVerified ? "✓ verified" : "on file (not used for sign-in)"}
              </p>
            )}

            {!privileged && googleEnabled && !user.googleLinked && (
              <div style={{ marginTop: 14 }}>
                <div className="auth-or"><span>link Google for one-tap sign-in</span></div>
                <GoogleButton onCredential={onLinkGoogle} />
                {linkErr && <p className="auth-err">{linkErr}</p>}
              </div>
            )}

            {privileged && <p className="auth-note">Staff accounts use password sign-in only.</p>}
          </div>

          {/* ── Orders ── */}
          <div className="acct-card acct-orders">
            <div className="acct-orders-head">
              <h3 className="serif">Order history</h3>
              <Link to="/track" className="link">Track a guest order</Link>
            </div>
            {orders === null && <p className="auth-note">Loading your orders…</p>}
            {ordersErr && <p className="auth-err">{ordersErr}</p>}
            {orders && orders.length === 0 && (
              <p className="auth-note">
                No orders yet. <Link to="/shop" className="link">Start shopping →</Link>
              </p>
            )}
            {orders && orders.length > 0 && (
              <div className="order-list">
                {orders.map((o) => (
                  <div className="order-row" key={o.id}>
                    <div>
                      <b>{o.orderNumber}</b>
                      <small>
                        {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {" • "}{(o.items || []).reduce((s, i) => s + i.qty, 0)} item(s)
                      </small>
                    </div>
                    <span className={`order-status s-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
                    <span className="order-total">{formatINR(o.totals?.total || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cta-row" style={{ marginTop: 26 }}>
          <Link to="/wishlist" className="btn btn-ghost">♡ Wishlist</Link>
          <Link to="/track" className="btn btn-ghost">Track order</Link>
          <button className="btn btn-ghost" onClick={async () => { await logout(); nav("/"); }}>
            Log out
          </button>
        </div>
      </section>
    </main>
  );
}
