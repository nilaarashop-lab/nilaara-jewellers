import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "../../api/github";
import { CATEGORIES } from "../../data/products";
import ImageSlot from "./ImageSlot";

const emptySlide = () => ({
  active: true,
  image: "",
  alt: "",
  eyebrow: "",
  title: "",
  highlight: "",
  text: "",
});

const emptyCard = () => ({
  active: true,
  image: "",
  alt: "",
  eyebrow: "",
  title: "",
  text: "",
  to: "/shop",
  linkLabel: "Shop now →",
});

const imageUrl = (image) => (typeof image === "string" ? image : image?.url || "");

const normalize = (raw) => ({
  ...raw,
  announcement: {
    active: raw?.announcement?.active ?? false,
    text: raw?.announcement?.text || "",
    shortText: raw?.announcement?.shortText || "",
    messages: Array.isArray(raw?.announcement?.messages)
      ? raw.announcement.messages
          .map((m) =>
            typeof m === "string"
              ? { text: m, active: true }
              : { text: m?.text || m?.message || "", active: m?.active !== false }
          )
          .filter((m) => m.text)
      : [],
  },
  home: {
    ...(raw?.home || {}),
    heroSlides: Array.isArray(raw?.home?.heroSlides)
      ? raw.home.heroSlides.map((s) => ({
          active: s?.active !== false,
          image: imageUrl(s?.image),
          alt: s?.alt || "",
          eyebrow: s?.eyebrow || "",
          title: s?.title || "",
          highlight: s?.highlight || "",
          text: s?.text || "",
        }))
      : [],
    cards: Array.isArray(raw?.home?.cards)
      ? raw.home.cards.map((c) => ({
          active: c?.active !== false,
          image: imageUrl(c?.image),
          alt: c?.alt || "",
          eyebrow: c?.eyebrow || "",
          title: c?.title || "",
          text: c?.text || "",
          to: c?.to || "/shop",
          linkLabel: c?.linkLabel || "Shop now →",
        }))
      : [],
    festive: {
      active: raw?.home?.festive?.active ?? false,
      image: imageUrl(raw?.home?.festive?.image),
      alt: raw?.home?.festive?.alt || "",
    },
    categoryTiles: Array.isArray(raw?.home?.categoryTiles)
      ? raw.home.categoryTiles
          .map((t) => ({ slug: t?.slug || "", image: imageUrl(t?.image), alt: t?.alt || "" }))
          .filter((t) => t.slug && t.image)
      : [],
  },
  shipping: {
    freeOver: Number(raw?.shipping?.freeOver ?? 999),
    fee: Number(raw?.shipping?.fee ?? 79),
  },
});

export default function HomepageEditor() {
  const [doc, setDoc] = useState(null);
  const [sha, setSha] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgBusy, setImgBusy] = useState(0);
  const [imgErr, setImgErr] = useState("");
  const [newMsg, setNewMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const file = await loadSettings();
      setDoc(normalize(file.doc));
      setSha(file.sha);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="empty">Loading homepage settings…</div>;

  if (err && !doc) {
    return (
      <div className="empty" role="alert">
        <h3 className="serif">Couldn't load homepage settings</h3>
        <p>{err}</p>
        <br />
        <button className="btn btn-gold" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!doc) return <div className="empty">Loading homepage settings…</div>;

  const set = (fn) => {
    setFlash("");
    setErr("");
    fn();
  };

  const addMessage = () => {
    const text = newMsg.trim();
    if (!text) return;
    if (doc.announcement.messages.length >= 8) {
      setErr("Up to 8 marquee messages.");
      return;
    }
    set(() =>
      setDoc({
        ...doc,
        announcement: {
          ...doc.announcement,
          messages: [...doc.announcement.messages, { text, active: true }],
        },
      })
    );
    setNewMsg("");
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    setFlash("");
    try {
      const saved = await saveSettings(doc, sha, "Admin: update homepage");
      setSha(saved.sha);
      setFlash("Homepage saved ✓ — live on the storefront now.");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const slides = doc.home.heroSlides;
  const cards = doc.home.cards;
  const busy = imgBusy > 0;

  const onImageBusy = (value) => setImgBusy((n) => Math.max(0, n + (value ? 1 : -1)));

  return (
    <div className="hp-editor">
      {flash && <p style={{ color: "var(--green)", marginTop: 12 }}>{flash}</p>}
      {err && <p className="auth-err">{err}</p>}
      {imgErr && <p className="auth-err">{imgErr}</p>}

      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Top announcement bar</h3>
          <label className="hp-toggle">
            <input
              type="checkbox"
              checked={doc.announcement.active}
              onChange={(e) =>
                set(() =>
                  setDoc({ ...doc, announcement: { ...doc.announcement, active: e.target.checked } })
                )
              }
            />
            Visible
          </label>
        </div>
        <p className="co-note">With 2+ active messages the bar scrolls like a marquee. Inactive messages stay saved but hidden.</p>

        {doc.announcement.messages.map((message, i) => (
          <div className="hp-row" key={i}>
            <input
              value={message.text}
              maxLength={160}
              onChange={(e) =>
                set(() => {
                  const messages = [...doc.announcement.messages];
                  messages[i] = { ...messages[i], text: e.target.value };
                  setDoc({ ...doc, announcement: { ...doc.announcement, messages } });
                })
              }
              placeholder="e.g. Festive B1G1 — this week only"
            />
            <label className="hp-toggle" title={message.active ? "Shown" : "Hidden"}>
              <input
                type="checkbox"
                checked={message.active}
                onChange={(e) =>
                  set(() => {
                    const messages = [...doc.announcement.messages];
                    messages[i] = { ...messages[i], active: e.target.checked };
                    setDoc({ ...doc, announcement: { ...doc.announcement, messages } });
                  })
                }
              />
              On
            </label>
            <button
              type="button"
              className="mini-btn danger"
              onClick={() =>
                set(() =>
                  setDoc({
                    ...doc,
                    announcement: {
                      ...doc.announcement,
                      messages: doc.announcement.messages.filter((_, x) => x !== i),
                    },
                  })
                )
              }
            >
              ✕
            </button>
          </div>
        ))}

        <div className="hp-row">
          <input
            value={newMsg}
            maxLength={160}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Add a new message…"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMessage())}
          />
          <button type="button" className="mini-btn" onClick={addMessage}>+ Add</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
          <div>
            <label>Fallback text (desktop, no messages)</label>
            <input
              value={doc.announcement.text}
              maxLength={300}
              onChange={(e) =>
                set(() => setDoc({ ...doc, announcement: { ...doc.announcement, text: e.target.value } }))
              }
            />
          </div>
          <div>
            <label>Fallback text (mobile)</label>
            <input
              value={doc.announcement.shortText}
              maxLength={120}
              onChange={(e) =>
                set(() => setDoc({ ...doc, announcement: { ...doc.announcement, shortText: e.target.value } }))
              }
            />
          </div>
        </div>
      </section>

      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Hero banner (rotating)</h3>
          <button
            type="button"
            className="mini-btn"
            disabled={slides.length >= 4 || busy}
            onClick={() =>
              set(() => setDoc({ ...doc, home: { ...doc.home, heroSlides: [...slides, emptySlide()] } }))
            }
          >
            + Add slide
          </button>
        </div>
        <p className="co-note">Up to 4 slides, auto-rotating every ~5s. With no slides the home page shows the built-in festive hero.</p>

        {slides.length === 0 && <p className="co-note">No slides yet — the default hero is shown. Add one to customise it.</p>}

        {slides.map((slide, i) => (
          <div className="hp-block" key={i}>
            <div className="hp-block-head">
              <b>Slide {i + 1}</b>
              <span>
                <label className="hp-toggle">
                  <input
                    type="checkbox"
                    checked={slide.active}
                    onChange={(e) =>
                      set(() => {
                        const next = [...slides];
                        next[i] = { ...slide, active: e.target.checked };
                        setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                      })
                    }
                  />
                  Active
                </label>
                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={() =>
                    set(() => setDoc({ ...doc, home: { ...doc.home, heroSlides: slides.filter((_, x) => x !== i) } }))
                  }
                >
                  Remove
                </button>
              </span>
            </div>
            <div className="hp-block-body">
              <ImageSlot
                value={slide.image}
                busy={busy}
                onBusy={onImageBusy}
                onError={setImgErr}
                onChange={(image) =>
                  set(() => {
                    const next = [...slides];
                    next[i] = { ...slide, image };
                    setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                  })
                }
              />
              <div className="hp-fields">
                <input
                  value={slide.eyebrow}
                  maxLength={60}
                  placeholder="Eyebrow (e.g. Bridal Edit • B1G1)"
                  onChange={(e) =>
                    set(() => {
                      const next = [...slides];
                      next[i] = { ...slide, eyebrow: e.target.value };
                      setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                    })
                  }
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input
                    value={slide.title}
                    maxLength={120}
                    placeholder="Title (e.g. Heirlooms,)"
                    onChange={(e) =>
                      set(() => {
                        const next = [...slides];
                        next[i] = { ...slide, title: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                      })
                    }
                  />
                  <input
                    value={slide.highlight}
                    maxLength={120}
                    placeholder="Gold italic line (e.g. without the heirloom price.)"
                    onChange={(e) =>
                      set(() => {
                        const next = [...slides];
                        next[i] = { ...slide, highlight: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                      })
                    }
                  />
                </div>
                <textarea
                  rows={2}
                  value={slide.text}
                  maxLength={400}
                  placeholder="Description"
                  onChange={(e) =>
                    set(() => {
                      const next = [...slides];
                      next[i] = { ...slide, text: e.target.value };
                      setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                    })
                  }
                />
                <input
                  value={slide.alt}
                  maxLength={160}
                  placeholder="Image description (alt text)"
                  onChange={(e) =>
                    set(() => {
                      const next = [...slides];
                      next[i] = { ...slide, alt: e.target.value };
                      setDoc({ ...doc, home: { ...doc.home, heroSlides: next } });
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Promo cards</h3>
          <button
            type="button"
            className="mini-btn"
            disabled={cards.length >= 4 || busy}
            onClick={() => set(() => setDoc({ ...doc, home: { ...doc.home, cards: [...cards, emptyCard()] } }))}
          >
            + Add card
          </button>
        </div>
        <p className="co-note">Shown as the image strip below the hero. First card is displayed larger.</p>

        {cards.length === 0 && <p className="co-note">No cards yet — two built-in promo cards are shown instead.</p>}

        {cards.map((card, i) => (
          <div className="hp-block" key={i}>
            <div className="hp-block-head">
              <b>Card {i + 1}</b>
              <span>
                <label className="hp-toggle">
                  <input
                    type="checkbox"
                    checked={card.active}
                    onChange={(e) =>
                      set(() => {
                        const next = [...cards];
                        next[i] = { ...card, active: e.target.checked };
                        setDoc({ ...doc, home: { ...doc.home, cards: next } });
                      })
                    }
                  />
                  Active
                </label>
                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={() => set(() => setDoc({ ...doc, home: { ...doc.home, cards: cards.filter((_, x) => x !== i) } }))}
                >
                  Remove
                </button>
              </span>
            </div>
            <div className="hp-block-body">
              <ImageSlot
                value={card.image}
                busy={busy}
                onBusy={onImageBusy}
                onError={setImgErr}
                onChange={(image) =>
                  set(() => {
                    const next = [...cards];
                    next[i] = { ...card, image };
                    setDoc({ ...doc, home: { ...doc.home, cards: next } });
                  })
                }
              />
              <div className="hp-fields">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                  <input
                    value={card.eyebrow}
                    maxLength={60}
                    placeholder="Eyebrow (e.g. New)"
                    onChange={(e) =>
                      set(() => {
                        const next = [...cards];
                        next[i] = { ...card, eyebrow: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, cards: next } });
                      })
                    }
                  />
                  <input
                    value={card.title}
                    maxLength={80}
                    placeholder="Title (e.g. Kundan Festive Sets)"
                    onChange={(e) =>
                      set(() => {
                        const next = [...cards];
                        next[i] = { ...card, title: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, cards: next } });
                      })
                    }
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <input
                    value={card.text}
                    maxLength={160}
                    placeholder="Subtitle (e.g. From ₹749)"
                    onChange={(e) =>
                      set(() => {
                        const next = [...cards];
                        next[i] = { ...card, text: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, cards: next } });
                      })
                    }
                  />
                  <input
                    value={card.to}
                    maxLength={200}
                    placeholder="Link (e.g. /shop?col=kundan)"
                    onChange={(e) =>
                      set(() => {
                        const next = [...cards];
                        next[i] = { ...card, to: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, cards: next } });
                      })
                    }
                  />
                  <input
                    value={card.linkLabel}
                    maxLength={40}
                    placeholder="Button text"
                    onChange={(e) =>
                      set(() => {
                        const next = [...cards];
                        next[i] = { ...card, linkLabel: e.target.value };
                        setDoc({ ...doc, home: { ...doc.home, cards: next } });
                      })
                    }
                  />
                </div>
                <input
                  value={card.alt}
                  maxLength={160}
                  placeholder="Image description (alt text)"
                  onChange={(e) =>
                    set(() => {
                      const next = [...cards];
                      next[i] = { ...card, alt: e.target.value };
                      setDoc({ ...doc, home: { ...doc.home, cards: next } });
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Festive edit banner</h3>
          <label className="hp-toggle">
            <input
              type="checkbox"
              checked={doc.home.festive.active}
              onChange={(e) =>
                set(() =>
                  setDoc({
                    ...doc,
                    home: { ...doc.home, festive: { ...doc.home.festive, active: e.target.checked } },
                  })
                )
              }
            />
            Show this section on the home page
          </label>
        </div>
        <p className="co-note">Shown between Best Sellers and the stores section. Upload a picture or leave it empty to keep the built-in image.</p>
        <ImageSlot
          value={doc.home.festive.image}
          busy={busy}
          onBusy={onImageBusy}
          onError={setImgErr}
          onChange={(image) =>
            set(() =>
              setDoc({ ...doc, home: { ...doc.home, festive: { ...doc.home.festive, image } } })
            )
          }
        />
        <input
          value={doc.home.festive.alt}
          maxLength={160}
          placeholder="Image description (alt text)"
          onChange={(e) =>
            set(() =>
              setDoc({ ...doc, home: { ...doc.home, festive: { ...doc.home.festive, alt: e.target.value } } })
            )
          }
        />
      </section>

      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>“Shop by Category” pictures</h3>
        </div>
        <p className="co-note">One picture per category tile on the home page. Leave empty to keep the built-in image.</p>
        <div className="hp-tiles">
          {CATEGORIES.map((category) => {
            const tile = (doc.home.categoryTiles || []).find((t) => t.slug === category.slug);
            return (
              <div key={category.slug} className="hp-tile">
                <ImageSlot
                  label={category.name}
                  value={tile?.image || ""}
                  busy={busy}
                  onBusy={onImageBusy}
                  onError={setImgErr}
                  onChange={(image) =>
                    set(() => {
                      const tiles = [...(doc.home.categoryTiles || [])].filter((t) => t.slug !== category.slug);
                      if (image) tiles.push({ slug: category.slug, image, alt: tile?.alt || "" });
                      setDoc({ ...doc, home: { ...doc.home, categoryTiles: tiles } });
                    })
                  }
                />
                <small>{category.name}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="form hp-section">
        <div className="hp-head">
          <h3 className="serif" style={{ margin: 0, fontSize: 22 }}>Shipping</h3>
        </div>
        <p className="co-note">Used by the product page and the WhatsApp order conversation.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label>Free shipping over ₹</label>
            <input
              type="number"
              min="0"
              value={doc.shipping.freeOver}
              onChange={(e) =>
                set(() =>
                  setDoc({ ...doc, shipping: { ...doc.shipping, freeOver: Number(e.target.value) || 0 } })
                )
              }
            />
          </div>
          <div>
            <label>Standard shipping fee ₹</label>
            <input
              type="number"
              min="0"
              value={doc.shipping.fee}
              onChange={(e) =>
                set(() => setDoc({ ...doc, shipping: { ...doc.shipping, fee: Number(e.target.value) || 0 } }))
              }
            />
          </div>
        </div>
      </section>

      <div className="cta-row" style={{ marginTop: 18 }}>
        <button className="btn btn-gold" onClick={save} disabled={saving || busy}>
          {saving ? "Saving…" : busy ? "Uploading image…" : "Save Homepage"}
        </button>
        <button className="btn btn-ghost" onClick={load} disabled={saving}>Discard changes</button>
      </div>
    </div>
  );
}
