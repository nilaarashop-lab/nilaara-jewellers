import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { STORES, STORE_HOURS } from "../data/stores";
import { freebiesLabel } from "../data/freebies";
import { ProductCard, Img, IconWhatsApp } from "../components/Layout";
import { usePageMeta } from "../components/meta";
import { whatsappChatLink, whatsappLink, WHATSAPP_DISPLAY } from "../config";

export function Wishlist() {
  usePageMeta("Wishlist", "Pieces you saved at Nilaara Jewellers — buy any of them on WhatsApp.");
  const { wishlist, products } = useStore();
  const list = products.filter((p) => wishlist.includes(p.id));
  return (
    <main className="container"><div className="breadcrumb">Home / Wishlist</div>
      <div className="sec-head"><h2>Wishlist ({list.length})</h2></div>
      {list.length === 0 ? <div className="empty">Nothing saved yet.<br /><br /><Link to="/shop" className="btn btn-gold">Discover jewellery</Link></div>
        : <div className="grid">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </main>
  );
}

export function About() {
  usePageMeta("Our Craft", "Handcrafted kundan, temple and pearl artificial jewellery — shipping, delivery and jewellery care.");
  const { products, settings } = useStore();
  const freebies = freebiesLabel(settings);
  return (
    <main className="container">
      <div className="breadcrumb">Home / Our Craft</div>
      <div className="pd"><div className="pd-media"><Img src={products[0]?.images?.[0]} alt="craft" /></div>
        <div><span className="eyebrow">Nilaara Jewellers • heirlooms for every celebration</span>
          <h1 className="serif" style={{ fontSize: 52, margin: "10px 0" }}>Handcrafted artistry, honest prices.</h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.8 }}>We work with Jaipur & Mumbai karigars to craft artificial jewellery that feels real — hand-set kundan & American diamonds on skin-safe bases. Every piece is quality-checked, weight-balanced for comfort, and shipped in a keepsake box.<br /><br />✦ Nickel-safe • ✦ Hypoallergenic • ✦ Book any piece on WhatsApp</p>
        </div></div>

      {/* The footer links straight to these two blocks, so they must stay here
          with these ids. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 26 }} className="cart-grid">
        <section className="form" id="shipping" style={{ scrollMarginTop: 96 }}>
          <h3 className="serif">Shipping &amp; delivery</h3>
          <p style={{ lineHeight: 1.8, color: "var(--ink-soft)" }}>
            Orders are confirmed on WhatsApp. Ready pieces are dispatched within 24 hours and usually arrive in 3–5 working days. Shipping charges, if any, are confirmed in chat before dispatch. Every piece ships hand-checked in a keepsake box.
          </p>
          {freebies && <p style={{ color: "var(--ink-soft)" }}><b>{freebies}</b> — added to every order.</p>}
        </section>
        <section className="form" id="care" style={{ scrollMarginTop: 96 }}>
          <h3 className="serif">Jewellery care</h3>
          <p style={{ lineHeight: 1.8, color: "var(--ink-soft)" }}>
            Keep jewellery away from perfume, hairspray and water. Wipe each piece with a soft dry cloth after wearing, then store it in its zip pouch or box. Put jewellery on last and take it off first — that keeps the plating and stones bright. Our bases are nickel-safe and hypoallergenic, and a care card is included with every order.
          </p>
        </section>
      </div>
    </main>
  );
}

export function Contact() {
  usePageMeta("Contact", "Talk to Nilaara Jewellers on WhatsApp — order help, sizing, gifting and store directions.");
  const { settings } = useStore();
  const freebies = freebiesLabel(settings);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [opened, setOpened] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const text = `Hi Nilaara Jewellers! I'm ${name.trim() || "a customer"}.\n\n${msg.trim()}`;
    window.open(whatsappLink(text), "_blank", "noopener,noreferrer");
    setOpened(true);
  };
  return (
    <main className="container"><div className="breadcrumb">Home / Contact</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="cart-grid">
        <div className="form"><h2 className="serif" style={{ fontSize: 36, margin: 0 }}>Talk to us</h2>
          <p style={{ color: "var(--ink-soft)" }}>
            WhatsApp{" "}
            <a className="link" href={whatsappChatLink()} target="_blank" rel="noreferrer">{WHATSAPP_DISPLAY}</a>{" "}
            • {STORE_HOURS}
          </p>
          <form onSubmit={submit}>
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
            <label>Message</label>
            <textarea rows={4} required placeholder="Order help, product ID, sizing, gifting…" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <br />
            <button className="btn btn-gold" style={{ marginTop: 12 }}><IconWhatsApp /> Send on WhatsApp</button>
          </form>
          {opened && <p>✓ Opening WhatsApp — send the message and we'll reply within a few hours.</p>}</div>
        <div className="form"><h3 className="serif">Care & policies</h3><p style={{ lineHeight: 1.8, color: "var(--ink-soft)" }}>Shipping 3–5 days{freebies ? ` • ${freebies}` : ""} • Keep jewellery away from perfume & water. To book a piece, tap Buy Now on any product — its ID and details are filled into WhatsApp for you. <Link className="link" to="/about#shipping">Shipping policy</Link> · <Link className="link" to="/about#care">Care guide</Link>.</p>
          <h3 className="serif" style={{ marginTop: 18 }}>Our 2 stores</h3>
          {STORES.map((s) => <p key={s.id} style={{ fontSize: 14 }}><b>{s.name}</b><br /><a className="link" href={s.mapsUrl} target="_blank" rel="noreferrer">Get Directions →</a></p>)}
          <Link to="/stores" className="btn btn-ghost" style={{ marginTop: 8 }}>View both stores</Link></div>
      </div>
    </main>
  );
}
