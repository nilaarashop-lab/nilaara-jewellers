import { Link } from "react-router-dom";
import { STORES, embedUrl } from "../data/stores";
import { WHATSAPP_DISPLAY, whatsappChatLink } from "../config";

export default function Stores() {
  return (
    <main className="container">
      <div className="breadcrumb"><Link to="/">Home</Link> / Our Stores</div>
      <div className="sec-head">
        <div>
          <h2>Visit our 2 stores</h2>
          <p>Try it on in person — weddings, festive & daily wear</p>
        </div>
      </div>
      <div className="store-grid">
        {STORES.map((s) => (
          <article key={s.id} className="store-card">
            <iframe
              title={s.name}
              src={embedUrl(s)}
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <div className="store-body">
              <span className="eyebrow">{s.area}</span>
              <h3 className="serif">{s.name}</h3>
              <p>{s.address}</p>
              <p><b>{s.hours}</b><br />{WHATSAPP_DISPLAY}</p>
              <div className="cta-row">
                <a className="btn btn-gold" href={s.mapsUrl} target="_blank" rel="noreferrer">Get Directions →</a>
                <a className="btn btn-ghost" href={whatsappChatLink()} target="_blank" rel="noreferrer">WhatsApp Store</a>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="form" style={{ marginTop: 20 }}>
        <h3 className="serif" style={{ margin: 0 }}>Can’t visit? Shop online</h3>
        <p style={{ color: "var(--ink-soft)" }}>Same designs, same prices — order on WhatsApp, freebies over ₹4,000.</p>
        <div className="cta-row"><Link to="/shop" className="btn btn-gold">Shop Bestsellers →</Link></div>
      </div>
    </main>
  );
}
