import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { STORES } from "../data/stores";
import { ProductCard, Img, IconWhatsApp } from "../components/Layout";
import { whatsappChatLink, whatsappLink, WHATSAPP_DISPLAY } from "../config";

export function Wishlist() {
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
  const { products } = useStore();
  return (
    <main className="container">
      <div className="breadcrumb">Home / Our Craft</div>
      <div className="pd"><div className="pd-media"><Img src={products[0]?.images?.[0]} alt="craft" /></div>
        <div><span className="eyebrow">Nilaara Jewellers • heirlooms for every celebration</span>
          <h1 className="serif" style={{ fontSize: 52, margin: "10px 0" }}>Handcrafted artistry, honest prices.</h1>
          <p style={{ color: "var(--ink-soft)", lineHeight: 1.8 }}>We work with Jaipur & Mumbai karigars to craft artificial jewellery that feels real — hand-set kundan & American diamonds on skin-safe bases. Every piece is quality-checked, weight-balanced for comfort, and shipped in a keepsake box.<br /><br />✦ Nickel-safe • ✦ Hypoallergenic • ✦ Book any piece on WhatsApp</p>
        </div></div>
    </main>
  );
}

export function Contact() {
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
            • 10:30–5:30 Mon–Sat
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
        <div className="form"><h3 className="serif">Care & policies</h3><p style={{ lineHeight: 1.8, color: "var(--ink-soft)" }}>Shipping 3–5 days • Freebies over ₹4,000 • Keep jewellery away from perfume & water. To book a piece, tap Buy Now on any product — its ID and details are filled into WhatsApp for you.</p>
          <h3 className="serif" style={{ marginTop: 18 }}>Our 2 stores</h3>
          {STORES.map((s) => <p key={s.id} style={{ fontSize: 14 }}><b>{s.name}</b><br /><a className="link" href={s.mapsUrl} target="_blank" rel="noreferrer">Get Directions →</a></p>)}
          <Link to="/stores" className="btn btn-ghost" style={{ marginTop: 8 }}>View both stores</Link></div>
      </div>
    </main>
  );
}
