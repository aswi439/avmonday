import { useEffect, useMemo, useState } from "react";
import { X, Building2, Users, ShieldCheck, Loader2, Check, AlertCircle, KeyRound } from "lucide-react";
import {
  login,
  loginWithAuthorityCode,
  register,
  signInWithGoogle,
  setPendingAuthorityCode,
  getAuthState,
  type AuthUser,
  type Role,
} from "@/lib/auth";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthed: (user: AuthUser) => void;
  initialMethod?: "password" | "authority_code";
}

type Mode = "signin" | "signup";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const NAME_RE = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F .'-]{0,119}$/;
const INVITE_RE = /^NCR72-[A-Z0-9]{6,20}$/;

/** Client mirror of the backend password policy — powers the live checklist. */
function passwordChecks(pw: string) {
  return {
    length: pw.length >= 12,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    noSpaces: pw.length > 0 && !/\s/.test(pw) && ![...pw].some((c) => c.charCodeAt(0) < 32),
  };
}

function emailProblem(email: string): string | null {
  if (!email.trim()) return "Email is required.";
  if (!EMAIL_RE.test(email.trim()))
    return "That doesn't look like a valid email — use the form name@example.com.";
  return null;
}

function nameProblem(name: string): string | null {
  if (!name.trim()) return "Full name is required.";
  if (!NAME_RE.test(name.trim()))
    return "Name may use letters, spaces, dots, apostrophes and hyphens only.";
  return null;
}

export function AuthModal({ open, onClose, onAuthed, initialMethod }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInMethod, setSignInMethod] = useState<"password" | "authority_code">("password");
  const [role, setRole] = useState<Role>("citizen");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authorityCode, setAuthorityCode] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setError(null);
      setNotice(null);
      setBusy(false);
      setGoogleBusy(false);
      setTouched({});
      if (initialMethod) {
        setSignInMethod(initialMethod);
      }
    }
  }, [open, mode, initialMethod]);

  const pwChecks = useMemo(() => passwordChecks(password), [password]);
  const pwValid = Object.values(pwChecks).every(Boolean);

  const emailErr = touched.email ? emailProblem(email) : null;
  const nameErr = touched.fullName && mode === "signup" ? nameProblem(fullName) : null;
  const inviteErr =
    touched.inviteCode && mode === "signup" && role === "authority"
      ? !inviteCode.trim()
        ? "An invite code is required for an authority account."
        : !INVITE_RE.test(inviteCode.trim().toUpperCase())
        ? "Codes look like NCR72-XXXXXXXX — check for typos."
        : null
      : null;

  // Signup can only be submitted when every client-side rule passes; the
  // server re-validates everything anyway (never trust the client).
  const signupBlocked =
    mode === "signup" &&
    (!!emailProblem(email) || !pwValid || !!nameProblem(fullName) || (role === "authority" && !INVITE_RE.test(inviteCode.trim().toUpperCase())));

  const authorityLoginBlocked =
    mode === "signin" && signInMethod === "authority_code" && !INVITE_RE.test(authorityCode.trim().toUpperCase());

  const finish = (user: AuthUser) => {
    onAuthed(user);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setTouched({ email: true, fullName: true, inviteCode: true, authorityCode: true });

    if (mode === "signin") {
      if (signInMethod === "authority_code") {
        const code = authorityCode.trim().toUpperCase();
        if (!code) {
          return setError("Please enter your authority console code.");
        }
        if (!INVITE_RE.test(code)) {
          return setError("Codes look like NCR72-XXXXXXXX — check for typos.");
        }
        setBusy(true);
        try {
          const user = await loginWithAuthorityCode(code, officerName.trim() || undefined);
          finish(user);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Authority login failed.");
        } finally {
          setBusy(false);
        }
        return;
      }

      const p = emailProblem(email);
      if (p) return setError(p);
      setBusy(true);
      try {
        const user = await login(email.trim().toLowerCase(), password);
        finish(user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // mode === "signup"
    const p = emailProblem(email);
    if (p) return setError(p);
    if (!pwValid)
      return setError("Password doesn't meet the requirements below yet.");
    const np = nameProblem(fullName);
    if (np) return setError(np);
    if (role === "authority") {
      const code = inviteCode.trim().toUpperCase();
      if (!INVITE_RE.test(code))
        return setError("Enter the official invite code issued to your organisation.");
    }

    setBusy(true);
    try {
      const user = await register({
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        role,
        invite_code: role === "authority" ? inviteCode.trim().toUpperCase() : undefined,
      });
      finish(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const signedInUser = getAuthState().user;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.6rem 0.75rem",
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: "8px",
    color: "#fff",
    fontFamily: "var(--mono)",
    fontSize: "13px",
    outline: "none",
  };

  const errStyle = (hasErr: boolean): React.CSSProperties =>
    hasErr ? { ...inputStyle, borderColor: "rgba(239,68,68,0.65)" } : inputStyle;

  const fieldError = (msg: string | null) =>
    msg ? (
      <div style={{ display: "flex", gap: "0.3rem", alignItems: "flex-start", marginTop: "0.3rem" }}>
        <AlertCircle size={12} style={{ color: "#fca5a5", flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: "11px", color: "#fca5a5", fontFamily: "var(--mono)" }}>{msg}</span>
      </div>
    ) : null;

  // Without this guard the modal renders permanently — open on every page
  // load and immune to the X / backdrop (the "asks authority on entry" bug).
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      {/*
        Outer card owns the animated .auth-ring border; the inner div scrolls.
        If the ring lived on the scrolling element, its absolute-positioned
        pseudo-elements would scroll with the content and paint over fields
        (the "overlayed borders" bug).
      */}
      <div
        className="liquid-glass auth-ring"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, calc(100vw - 2rem))",
          maxHeight: "calc(100vh - 4rem)",
          display: "flex",
          flexDirection: "column",
          background: "rgba(10,14,24,0.96)",
          border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: "16px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
      <div style={{ overflowY: "auto", width: "100%", padding: "1.6rem" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.1rem" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--mono)",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#fff",
            }}
          >
            {signedInUser
              ? signedInUser.role === "citizen"
                ? "Authority access"
                : "Account"
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {!signedInUser && (<>
        {/* Mode switch */}
        <div style={{ display: "flex", gap: "0.3rem", padding: "3px", background: "rgba(0,0,0,0.4)", borderRadius: "9999px", marginBottom: "1.1rem", border: "1px solid rgba(255,255,255,0.12)" }}>
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: "0.4rem 0",
                borderRadius: "9999px",
                background: mode === m ? "rgba(255,255,255,0.18)" : "transparent",
                border: "none",
                color: mode === m ? "#fff" : "rgba(255,255,255,0.6)",
                fontFamily: "var(--mono)",
                fontSize: "12px",
                fontWeight: mode === m ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {m === "signin" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          {mode === "signin" && (
            <div style={{ display: "flex", gap: "0.35rem", padding: "3px", background: "rgba(0,0,0,0.3)", borderRadius: "8px", marginBottom: "1rem", border: "1px solid rgba(255,255,255,0.1)" }}>
              <button
                type="button"
                onClick={() => { setSignInMethod("password"); setError(null); }}
                style={{
                  flex: 1,
                  padding: "0.45rem 0.5rem",
                  borderRadius: "6px",
                  background: signInMethod === "password" ? "rgba(255,255,255,0.14)" : "transparent",
                  border: "none",
                  color: signInMethod === "password" ? "#fff" : "rgba(255,255,255,0.55)",
                  fontFamily: "var(--mono)",
                  fontSize: "11.5px",
                  fontWeight: signInMethod === "password" ? 600 : 400,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.35rem",
                }}
              >
                <Users size={12} />
                <span>Password</span>
              </button>
              <button
                type="button"
                onClick={() => { setSignInMethod("authority_code"); setError(null); }}
                style={{
                  flex: 1,
                  padding: "0.45rem 0.5rem",
                  borderRadius: "6px",
                  background: signInMethod === "authority_code" ? "rgba(56,189,248,0.18)" : "transparent",
                  border: `1px solid ${signInMethod === "authority_code" ? "rgba(56,189,248,0.45)" : "transparent"}`,
                  color: signInMethod === "authority_code" ? "var(--cyan)" : "rgba(255,255,255,0.55)",
                  fontFamily: "var(--mono)",
                  fontSize: "11.5px",
                  fontWeight: signInMethod === "authority_code" ? 700 : 400,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.35rem",
                }}
              >
                <ShieldCheck size={13} style={{ color: "var(--cyan)" }} />
                <span>Authority Code</span>
              </button>
            </div>
          )}

          {mode === "signin" && signInMethod === "authority_code" ? (
            <div
              style={{
                marginBottom: "0.9rem",
                padding: "0.85rem 0.9rem",
                background: "rgba(56,189,248,0.07)",
                border: "1px solid rgba(56,189,248,0.3)",
                borderRadius: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.45rem" }}>
                <KeyRound size={14} style={{ color: "var(--cyan)" }} />
                <span style={{ fontFamily: "var(--mono)", fontSize: "11.5px", color: "#7dd3fc", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>
                  Authority Console Code
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontFamily: "var(--mono)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
                Enter your official NCR·72 console code. Logs in directly and records your session in Supabase.
              </div>

              <input
                type="text"
                placeholder="NCR72-XXXXXXXX"
                value={authorityCode}
                onChange={(e) => setAuthorityCode(e.target.value.toUpperCase())}
                onBlur={() => setTouched((t) => ({ ...t, authorityCode: true }))}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                style={{
                  ...errStyle(touched.authorityCode && !INVITE_RE.test(authorityCode.trim().toUpperCase())),
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  marginBottom: "0.6rem",
                }}
              />
              {touched.authorityCode && !INVITE_RE.test(authorityCode.trim().toUpperCase()) && (
                <div style={{ display: "flex", gap: "0.3rem", alignItems: "flex-start", marginTop: "-0.3rem", marginBottom: "0.5rem" }}>
                  <AlertCircle size={12} style={{ color: "#fca5a5", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: "11px", color: "#fca5a5", fontFamily: "var(--mono)" }}>
                    Codes look like NCR72-XXXXXXXX — check for typos.
                  </span>
                </div>
              )}

              <input
                type="text"
                placeholder="Officer / Agency name (optional)"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                style={{ ...inputStyle, fontSize: "12px" }}
              />
            </div>
          ) : (
            <>
              {mode === "signup" && (
                <>
                  {/* Role picker */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                    {(
                      [
                        { id: "citizen" as Role, icon: Users, label: "Citizen", desc: "Personal air-quality tools", color: "var(--live)" },
                        { id: "authority" as Role, icon: Building2, label: "Authority", desc: "Official account (invite)", color: "var(--cyan)" },
                      ]
                    ).map((r) => {
                      const Icon = r.icon;
                      const active = role === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRole(r.id)}
                          style={{
                            position: "relative",
                            zIndex: active ? 2 : 1,
                            textAlign: "left",
                            padding: "0.7rem 0.8rem",
                            background: active ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.3)",
                            border: `1px solid ${active ? r.color : "rgba(255,255,255,0.12)"}`,
                            borderRadius: "10px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <Icon size={16} style={{ color: active ? r.color : "rgba(255,255,255,0.5)", marginBottom: 4 }} />
                          <div style={{ fontFamily: "var(--mono)", fontSize: "12.5px", fontWeight: 600, color: "#fff" }}>{r.label}</div>
                          <div style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.55)", fontFamily: "var(--mono)", marginTop: 2 }}>{r.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    placeholder="Full name (e.g. Aditya Sharma)"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                    maxLength={120}
                    autoComplete="name"
                    style={{ ...errStyle(!!nameErr), marginBottom: nameErr ? "0.2rem" : "0.7rem" }}
                  />
                  {fieldError(nameErr)}
                </>
              )}

              <input
                type="email"
                placeholder="Email (name@example.com)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                maxLength={254}
                autoComplete="email"
                style={{ ...errStyle(!!emailErr), marginBottom: emailErr ? "0.2rem" : "0.7rem" }}
              />
              {fieldError(emailErr)}

              <input
                type="password"
                placeholder={mode === "signup" ? "Create a password" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                style={{ ...inputStyle, marginBottom: mode === "signup" ? "0.5rem" : "0.9rem" }}
              />

              {/* Live password checklist (registration only) */}
              {mode === "signup" && (
                <div
                  style={{
                    marginBottom: "0.9rem",
                    padding: "0.6rem 0.75rem",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: "0.4rem" }}>
                    Password must have
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 0.6rem" }}>
                    {(
                      [
                        ["length", "12+ characters"],
                        ["upper", "An uppercase letter"],
                        ["lower", "A lowercase letter"],
                        ["digit", "A digit"],
                        ["noSpaces", "No spaces/symbols like space or tab"],
                      ] as const
                    ).map(([key, label]) => {
                      const ok = pwChecks[key];
                      return (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          {ok ? (
                            <Check size={11} style={{ color: "#4ade80", flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 11, height: 11, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)", flexShrink: 0, display: "inline-block" }} />
                          )}
                          <span style={{ fontFamily: "var(--mono)", fontSize: "10.5px", color: ok ? "#4ade80" : "rgba(255,255,255,0.55)" }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {mode === "signup" && role === "authority" && (
                <div
                  style={{
                    marginBottom: "0.7rem",
                    padding: "0.75rem 0.85rem",
                    background: "rgba(56,189,248,0.07)",
                    border: "1px solid rgba(56,189,248,0.3)",
                    borderRadius: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.45rem" }}>
                    <ShieldCheck size={13} style={{ color: "var(--cyan)" }} />
                    <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "#7dd3fc", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 }}>
                      Official invite code required
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="NCR72-XXXXXXXX"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    onBlur={() => setTouched((t) => ({ ...t, inviteCode: true }))}
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                    style={{ ...errStyle(!!inviteErr), textTransform: "uppercase" }}
                  />
                  {fieldError(inviteErr) ?? (
                    <div style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.5)", fontFamily: "var(--mono)", marginTop: "0.4rem" }}>
                      Issued by the NCR·72 operator to verified government accounts. Every code is single-use.
                    </div>
                  )}
                  <div style={{ marginTop: "0.6rem", paddingTop: "0.5rem", borderTop: "1px solid rgba(56,189,248,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.55)", fontFamily: "var(--mono)" }}>
                      Have your code?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setSignInMethod("authority_code");
                        if (inviteCode) setAuthorityCode(inviteCode);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--cyan)",
                        fontFamily: "var(--mono)",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Sign in directly with code &rarr;
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div
              role="alert"
              style={{
                marginBottom: "0.8rem",
                padding: "0.6rem 0.8rem",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: "8px",
                color: "#fca5a5",
                fontSize: "12px",
                fontFamily: "var(--mono)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy || (mode === "signup" ? signupBlocked : (signInMethod === "authority_code" && authorityLoginBlocked))}
            title={signupBlocked ? "Complete the highlighted fields to continue" : undefined}
            style={{
              width: "100%",
              padding: "0.7rem 0",
              background:
                busy || (mode === "signup" ? signupBlocked : (signInMethod === "authority_code" && authorityLoginBlocked))
                  ? "rgba(56,189,248,0.3)"
                  : "rgba(56,189,248,0.85)",
              border: "none",
              borderRadius: "8px",
              color: "#04121e",
              fontFamily: "var(--mono)",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: busy ? "wait" : (mode === "signup" ? signupBlocked : (signInMethod === "authority_code" && authorityLoginBlocked)) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              transition: "background 0.2s ease",
            }}
          >
            {busy && <Loader2 size={14} className="spin" />}
            {mode === "signin"
              ? signInMethod === "authority_code"
                ? "Access Authority Console"
                : "Sign in"
              : role === "authority"
              ? "Register as Authority"
              : "Register as Citizen"}
          </button>
        </form>

        {/* Divider + Google (Supabase OAuth) - only for password & citizen signup */}
        {!(mode === "signin" && signInMethod === "authority_code") && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", margin: "1rem 0 0.8rem" }}>
              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.14)" }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                or
              </span>
              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.14)" }} />
            </div>

            <button
              type="button"
              className="auth-google"
              disabled={busy || googleBusy}
              onClick={async () => {
                setError(null);
                if (mode === "signup" && role === "authority") {
                  const code = inviteCode.trim().toUpperCase();
                  if (!INVITE_RE.test(code)) {
                    setError("Enter your official invite code first, then continue with Google.");
                    return;
                  }
                  setPendingAuthorityCode(code);
                }
                setGoogleBusy(true);
                try {
                  await signInWithGoogle();
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Google sign-in is unavailable right now."
                  );
                  setGoogleBusy(false);
                }
              }}
              style={{
                width: "100%",
                padding: "0.65rem 0",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                color: "#fff",
                fontFamily: "var(--mono)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: googleBusy ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.55rem",
                transition: "background 0.2s ease, border-color 0.2s ease",
              }}
            >
              {googleBusy ? <Loader2 size={14} className="spin" /> : <GoogleIcon />}
              <span>Continue with Google</span>
            </button>
            <div
              style={{
                marginTop: "0.55rem",
                textAlign: "center",
                fontFamily: "var(--mono)",
                fontSize: "10px",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              Google accounts join as citizens — pick "Authority" above and enter your invite code first, and it's applied automatically after Google verifies you.
            </div>
          </>
        )}
        </>)}

        {/* Authority members see their status */}
        {signedInUser?.role === "authority" && (
          <div
            style={{
              marginTop: "0.8rem",
              padding: "0.6rem 0.8rem",
              background: "rgba(74,222,128,0.1)",
              border: "1px solid rgba(74,222,128,0.4)",
              borderRadius: "8px",
              color: "#86efac",
              fontSize: "12px",
              fontFamily: "var(--mono)",
            }}
          >
            You have authority access, {signedInUser.full_name}.
          </div>
        )}

        {notice && (
          <div
            style={{
              marginTop: "0.8rem",
              padding: "0.6rem 0.8rem",
              background: "rgba(74,222,128,0.1)",
              border: "1px solid rgba(74,222,128,0.4)",
              borderRadius: "8px",
              color: "#86efac",
              fontSize: "12px",
              fontFamily: "var(--mono)",
            }}
          >
            {notice}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
