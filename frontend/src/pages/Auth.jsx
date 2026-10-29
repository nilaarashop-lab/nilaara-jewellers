import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { authLogin, emailOtpRequest, emailOtpVerify, authGoogle, hasAPI, googleEnabled } from "../api/client";
import GoogleButton from "../components/GoogleButton";

/** Only same-site paths are accepted as post-login redirects (no open redirects). */
const safeNext = (next) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());

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

const SESSION_BLOCKED =
  "We couldn't keep you signed in — this browser didn't store the session cookie. Please try again; if it keeps happening, message us on WhatsApp and we'll help.";

/** "Resend in 23s" / "Resend now" control for the verification step. */
function ResendRow({ left, onResend, busy }) {
  return (
    <p className="auth-switch">
      Didn't get it?{" "}
      {left > 0 ? (
        <span style={{ color: "var(--muted)" }}>Resend in {left}s</span>
      ) : (
        <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={onResend} disabled={busy}>
          Resend code
        </button>
      )}
    </p>
  );
}

/** Password field with a show/hide eye. The toggle is type="button" so it never submits the form. */
function PasswordInput({ value, onChange, placeholder, autoComplete, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        {...rest}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

/* ───────────────────────── Login ───────────────────────── */

export function Login() {
  const { startSession } = useAuth();
  const go = useAfterLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const afterAuth = async (user) => {
    if (await startSession(user)) go(user);
    else setErr(SESSION_BLOCKED);
  };

  const onGoogle = async (credential) => {
    setErr("");
    setBusy(true);
    try {
      const { user } = await authGoogle(credential);
      await afterAuth(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!validEmail(email)) return setErr("Enter a valid email address.");
    if (!password) return setErr("Enter your password.");
    setBusy(true);
    try {
      const { user } = await authLogin({ id: email.trim().toLowerCase(), password });
      await afterAuth(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <div className="sec">
        <form className="form auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Welcome back</span>
          <h1 className="serif">Log in to Nilaara</h1>
          {!hasAPI && <p className="auth-note">Demo mode — backend not connected.</p>}

          {googleEnabled && (
            <>
              <div className="auth-or"><span>or continue with</span></div>
              <GoogleButton onCredential={onGoogle} />
              <div className="auth-or"><span>or use your email</span></div>
            </>
          )}

          <label>Email address</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" autoComplete="email" autoFocus required />

          <label>Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          {err && <p className="auth-err">{err}</p>}
          <button className="btn btn-gold" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
            {busy ? "Logging in…" : "Log In →"}
          </button>

          <p className="auth-switch">New to Nilaara? <Link to="/register" className="link">Create account</Link></p>
        </form>
      </div>
    </main>
  );
}

/* ───────────────────────── Register ───────────────────────── */

export function Register() {
  const { startSession } = useAuth();
  const go = useAfterLogin();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState("details"); // details | code
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const resendLeft = useCountdown(sent);

  const afterAuth = async (user) => {
    if (await startSession(user)) go(user);
    else setErr(SESSION_BLOCKED);
  };

  const validateDetails = () => {
    if (name.trim().length < 2) {
      setErr("Please enter your full name — we print it on your booking slip.");
      return false;
    }
    if (!validEmail(email)) {
      setErr("Enter a valid email address.");
      return false;
    }
    if (password.length < 6) {
      setErr("Choose a password with at least 6 characters.");
      return false;
    }
    return true;
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setErr("");
    if (!validateDetails()) return;
    setBusy(true);
    try {
      const info = await emailOtpRequest(email.trim());
      setSent({ ...info, retrySec: info.cooldown || 30 });
      setStep("code");
      setCode("");
    } catch (ex) {
      if (ex.body?.retryAfterSec) setSent((s) => ({ ...(s || { email: email.trim() }), retrySec: ex.body.retryAfterSec }));
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setErr("");
    if (!/^[0-9]{4,10}$/.test(code)) return setErr("Enter the verification code from the email.");
    setBusy(true);
    try {
      const { user } = await emailOtpVerify(email.trim(), code, name.trim(), password);
      await afterAuth(user);
    } catch (ex) {
      setErr(ex.message);
      if (ex.status === 429 && /request a new code/i.test(ex.message)) setStep("details");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = step === "details" ? sendCode : verifyCode;

  return (
    <main className="container">
      <div className="sec">
        <form className="form auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Join Nilaara</span>
          <h1 className="serif">Create account</h1>

          <label>Full name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aarohi Sharma"
            autoComplete="name"
            maxLength={120}
            disabled={step === "code"}
            required
          />
          <p className="auth-note">Used on your booking slip and order updates.</p>

          {step === "details" ? (
            <>
              <label>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" autoComplete="email" required />

              <label>Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                minLength={6}
                required
              />
              <p className="auth-note">We'll email a 6-digit code to confirm this address.</p>

              {err && <p className="auth-err">{err}</p>}
              <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
                {busy ? "Sending code…" : "Send code →"}
              </button>
            </>
          ) : (
            <>
              <p className="auth-note">
                Code sent to <b>{sent?.email || email.trim()}</b>
                <button type="button" className="link" style={{ background: "none", border: 0, cursor: "pointer", marginLeft: 6 }} onClick={() => { setStep("details"); setErr(""); }}>
                  Change details
                </button>
              </p>
              <label>Verification code</label>
              <input className="otp-input" type="text" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoComplete="one-time-code" autoFocus required />
              {err && <p className="auth-err">{err}</p>}
              <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
                {busy ? "Verifying…" : "Verify & Create account →"}
              </button>
              <ResendRow left={resendLeft} onResend={sendCode} busy={busy} />
            </>
          )}

          <p className="auth-switch">Already have an account? <Link to="/login" className="link">Log in</Link></p>
        </form>
      </div>
    </main>
  );
}
