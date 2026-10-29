import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { authLogin, authRegister, otpRequest, otpVerify, emailOtpRequest, emailOtpVerify, authGoogle, hasAPI, googleEnabled } from "../api/client";
import GoogleButton from "../components/GoogleButton";

/** Only same-site paths are accepted as post-login redirects (no open redirects). */
const safeNext = (next) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
const validPhone = (p) => /^[6-9][0-9]{9}$/.test(p);

/** Goes to ?next=… after login; staff land in the admin panel. */
function useAfterLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  return (user) => {
    if (user && (user.role === "admin" || user.role === "staff")) nav("/admin");
    else nav(next);
  };
}

/**
 * Seconds remaining in a resend cooldown. A fresh `sent` response object
 * (each API result is a new object) resets the timer — even when the server
 * reports the same number of seconds again, so resends always restart the UI.
 */
function useCountdown(sent) {
  const [left, setLeft] = useState(0);
  const [prev, setPrev] = useState(sent);
  if (sent !== prev) {
    setPrev(sent);
    setLeft(Math.max(0, Number(sent?.retrySec) || 0));
  }
  const running = left > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return left;
}

/* ───────────────────────── Login ───────────────────────── */

export function Login() {
  const { setUser } = useAuth();
  const go = useAfterLogin();
  const [tab, setTab] = useState("otp"); // otp | email | password
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Mobile OTP flow state
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState("phone"); // phone | code
  const [sent, setSent] = useState(null); // { phone, cooldown, expiresIn, maxAttempts }
  const [code, setCode] = useState("");
  const resendLeft = useCountdown(sent);

  // Email OTP flow state (Resend)
  const [email, setEmail] = useState("");
  const [eStep, setEStep] = useState("email"); // email | code
  const [eSent, setESent] = useState(null); // { email (masked), cooldown, expiresIn }
  const [eCode, setECode] = useState("");
  const eResendLeft = useCountdown(eSent);

  // Password flow state
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");

  const afterAuth = (user) => { setUser(user); go(user); };

  const onGoogle = async (credential) => {
    setErr("");
    setBusy(true);
    try {
      const { user } = await authGoogle(credential);
      setUser(user);
      go(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async (e) => {
    e?.preventDefault();
    setErr("");
    if (!validPhone(phone)) return setErr("Enter a valid 10-digit Indian mobile number.");
    setBusy(true);
    try {
      const info = await otpRequest(phone);
      // `info.phone` is the server's MASKED number (display only); the raw
      // number stays in component state for the verify call.
      setSent({ ...info, retrySec: info.cooldown || 30 });
      setStep("code");
      setCode("");
    } catch (ex) {
      // Cooldown responses carry retryAfterSec — keep the UI in sync with the server.
      if (ex.body?.retryAfterSec) setSent({ phone, retrySec: ex.body.retryAfterSec });
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setErr("");
    if (!/^[0-9]{4,10}$/.test(code)) return setErr("Enter the verification code from the SMS.");
    setBusy(true);
    try {
      const { user } = await otpVerify(phone, code);
      setUser(user);
      go(user);
    } catch (ex) {
      setErr(ex.message);
      if (ex.status === 429 && /request a new code/i.test(ex.message)) setStep("phone"); // locked — restart
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr("");
    setBusy(true);
    try {
      const info = await otpRequest(phone);
      setSent({ ...info, retrySec: info.cooldown || 30 }); // info.phone = masked
      setCode("");
    } catch (ex) {
      if (ex.body?.retryAfterSec) setSent((s) => ({ ...(s || { phone }), retrySec: ex.body.retryAfterSec }));
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Email OTP (Resend) ──
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const sendEmailCode = async (e) => {
    e?.preventDefault();
    setErr("");
    if (!validEmail(email)) return setErr("Enter a valid email address.");
    setBusy(true);
    try {
      const info = await emailOtpRequest(email.trim());
      setESent({ ...info, retrySec: info.cooldown || 30 }); // info.email = MASKED
      setEStep("code");
      setECode("");
    } catch (ex) {
      if (ex.body?.retryAfterSec) setESent({ email, retrySec: ex.body.retryAfterSec });
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async (e) => {
    e.preventDefault();
    setErr("");
    if (!/^[0-9]{4,10}$/.test(eCode)) return setErr("Enter the verification code from the email.");
    setBusy(true);
    try {
      const { user } = await emailOtpVerify(email.trim(), eCode);
      afterAuth(user);
    } catch (ex) {
      setErr(ex.message);
      if (ex.status === 429 && /request a new code/i.test(ex.message)) setEStep("email");
    } finally {
      setBusy(false);
    }
  };

  const resendEmailCode = async () => {
    setErr("");
    setBusy(true);
    try {
      const info = await emailOtpRequest(email.trim());
      setESent({ ...info, retrySec: info.cooldown || 30 });
      setECode("");
    } catch (ex) {
      if (ex.body?.retryAfterSec) setESent((s) => ({ ...(s || { email }), retrySec: ex.body.retryAfterSec }));
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <div className="sec">
        <form
          className="form auth-card"
          onSubmit={(e) => {
            if (tab === "otp") (step === "phone" ? sendOtp : verifyOtp)(e);
            else if (tab === "email") (eStep === "email" ? sendEmailCode : verifyEmailCode)(e);
            else e.preventDefault();
          }}
        >
          <span className="eyebrow">Welcome back</span>
          <h1 className="serif">Log in to Nilaara</h1>
          {!hasAPI && <p className="auth-note">Demo mode — backend not connected. Password login creates a local demo session; Google & OTP need the backend.</p>}

          {googleEnabled && (
            <>
              <div className="auth-or"><span>or continue with</span></div>
              <GoogleButton onCredential={onGoogle} />
              <div className="auth-or"><span>or {tab === "otp" ? "use your mobile" : tab === "email" ? "use your email" : "use email & password"}</span></div>
            </>
          )}

          <div className="method-tabs" role="tablist" aria-label="Sign-in method">
            {[
              ["otp", "☎ Mobile (OTP)"],
              ["email", "✉ Email (OTP)"],
              ["password", "🔑 Password"],
            ].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "on" : ""}`} style={{ padding: "10px 18px" }} onClick={() => { setTab(k); setErr(""); }}>
                {l}
              </button>
            ))}
          </div>

          {tab === "otp" && step === "phone" && (
            <>
              <label>Mobile number</label>
              <div className="phone-row">
                <span className="cc">+91</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="98765 43210"
                  inputMode="numeric"
                  maxLength={10}
                  autoFocus
                  required
                />
              </div>
              <p className="auth-note">We'll text you a 6-digit code. New numbers create an account automatically.</p>
              {err && <p className="auth-err">{err}</p>}
              <button className="btn btn-gold" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
                {busy ? "Sending…" : "Send OTP →"}
              </button>
            </>
          )}

          {tab === "otp" && step === "code" && (
            <>
              <p className="auth-note">
                Code sent to <b>{sent?.phone}</b> — valid for {Math.round((sent?.expiresIn || 300) / 60)} min.
                <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer", marginLeft: 6 }} onClick={() => { setStep("phone"); setErr(""); }}>
                  Change number
                </button>
              </p>
              <label>Verification code</label>
              <input
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••••"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                required
              />
              {err && <p className="auth-err">{err}</p>}
              <button className="btn btn-gold" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
                {busy ? "Verifying…" : "Verify & Continue →"}
              </button>
              <p className="auth-switch">
                Didn't get it?{" "}
                {resendLeft > 0 ? (
                  <span style={{ color: "var(--muted)" }}>Resend in {resendLeft}s</span>
                ) : (
                  <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={resend} disabled={busy}>
                    Resend code
                  </button>
                )}
              </p>
            </>
          )}

          {tab === "email" && eStep === "email" && (
            <>
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                autoComplete="email"
                autoFocus
                required
              />
              <p className="auth-note">We'll email you a 6-digit code. New addresses create an account automatically.</p>
              {err && <p className="auth-err">{err}</p>}
              <button className="btn btn-gold" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
                {busy ? "Sending…" : "Send Code →"}
              </button>
            </>
          )}

          {tab === "email" && eStep === "code" && (
            <>
              <p className="auth-note">
                Code sent to <b>{eSent?.email}</b> — valid for {Math.round((eSent?.expiresIn || 300) / 60)} min.
                <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer", marginLeft: 6 }} onClick={() => { setEStep("email"); setErr(""); }}>
                  Change address
                </button>
              </p>
              <label>Verification code</label>
              <input
                className="otp-input"
                value={eCode}
                onChange={(e) => setECode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••••"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                required
              />
              {err && <p className="auth-err">{err}</p>}
              <button className="btn btn-gold" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
                {busy ? "Verifying…" : "Verify & Continue →"}
              </button>
              <p className="auth-switch">
                Didn't get it?{" "}
                {eResendLeft > 0 ? (
                  <span style={{ color: "var(--muted)" }}>Resend in {eResendLeft}s</span>
                ) : (
                  <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={resendEmailCode} disabled={busy}>
                    Resend code
                  </button>
                )}
              </p>
              <p className="auth-note">Check your spam/promotions folder if it doesn't arrive within a minute.</p>
            </>
          )}

          {tab === "password" && (
            <>
              <label>Email or mobile number</label>
              <input value={id} onChange={(e) => setId(e.target.value)} placeholder="you@gmail.com / 9876543210" required />
              <label>Password</label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required />
              {err && <p className="auth-err">{err}</p>}
              <button
                className="btn btn-gold"
                disabled={busy}
                style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
                onClick={async (e) => {
                  e.preventDefault();
                  setErr("");
                  setBusy(true);
                  try {
                    const { user } = await authLogin({ id: id.trim(), password: pw });
                    setUser(user);
                    go(user);
                  } catch (ex) {
                    setErr(ex.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Logging in…" : "Log In →"}
              </button>
            </>
          )}

          <p className="auth-switch">
            New to Nilaara? <Link to="/register" className="link">Create account</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

/* ───────────────────────── Register ───────────────────────── */

export function Register() {
  const { setUser } = useAuth();
  const go = useAfterLogin();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onGoogle = async (credential) => {
    setErr("");
    setBusy(true);
    try {
      const { user } = await authGoogle(credential);
      setUser(user);
      go(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { user } = await authRegister({ name: name.trim(), email: email.trim(), password: pw });
      setUser(user);
      go(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <div className="sec">
        <form className="form auth-card" onSubmit={submit}>
          <span className="eyebrow">Join Nilaara</span>
          <h1 className="serif">Create account</h1>

          {googleEnabled && (
            <>
              <div className="auth-or"><span>or sign up with</span></div>
              <GoogleButton onCredential={onGoogle} text="signup_with" />
              <div className="auth-or"><span>or with your email</span></div>
            </>
          )}

          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarohi Sharma" required />
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" required />
          <label>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min. 6 characters" minLength={6} required />
          {err && <p className="auth-err">{err}</p>}
          <button className="btn btn-gold" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
            {busy ? "Creating…" : "Create Account →"}
          </button>
          <p className="auth-switch">
            Prefer your mobile? <Link to="/login" className="link">Sign up with OTP — no password needed</Link>
          </p>
          <p className="auth-switch">
            Already have an account? <Link to="/login" className="link">Log in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
