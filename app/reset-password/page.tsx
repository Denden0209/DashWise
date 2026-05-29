"use client";
import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { C, radius, shadow, input, label, btnPrimary } from "@/lib/styles";

export default function ResetPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    setLoading(true); setError("");
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/login`,
      });
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      if (code === "auth/user-not-found")
        setError("No account found with this email address.");
      else if (code === "auth/invalid-email")
        setError("Please enter a valid email address.");
      else if (code === "auth/too-many-requests")
        setError("Too many requests. Please wait a few minutes and try again.");
      else
        setError("Failed to send reset email. Please try again.");
    } finally { setLoading(false); }
  }

  if (sent) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420, textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:20 }}>📬</div>
        <h1 style={{ fontSize:24, fontWeight:700, color:C.text, marginBottom:10 }}>Reset email sent</h1>
        <p style={{ fontSize:14, color:C.text3, marginBottom:6, lineHeight:1.6 }}>
          We sent a password reset link to <strong style={{ color:C.text }}>{email}</strong>
        </p>
        <p style={{ fontSize:13, color:C.text3, marginBottom:28, lineHeight:1.6 }}>
          Check your inbox and follow the link to reset your password. The link expires in 1 hour.
        </p>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:20, marginBottom:20, boxShadow:shadow.sm }}>
          <p style={{ fontSize:13, color:C.text2, marginBottom:12 }}>Didn&apos;t receive it? Check spam or try again:</p>
          <button onClick={() => setSent(false)} style={{ ...btnPrimary, width:"100%", padding:"11px", borderRadius:radius.sm, fontSize:14 }}>
            Try a different email
          </button>
        </div>
        <Link href="/login" style={{ fontSize:14, color:C.blue, fontWeight:500 }}>← Back to sign in</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <Link href="/" style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.5px", color:C.text }}>
            Dash<span style={{ color:C.blue }}>Wise</span>
          </Link>
          <div style={{ fontSize:22, fontWeight:600, color:C.text, marginTop:20, marginBottom:4 }}>Reset your password</div>
          <div style={{ fontSize:14, color:C.text3 }}>Enter your email and we&apos;ll send a reset link</div>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:"28px", boxShadow:shadow.md }}>
          {error && (
            <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"12px 14px", borderRadius:radius.sm, marginBottom:20, lineHeight:1.5 }}>
              ⚠ {error}
            </div>
          )}

          <form onSubmit={handleReset} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={label}>Email address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={input} autoComplete="email"/>
            </div>
            <button type="submit" disabled={loading} style={{ ...btnPrimary, width:"100%", padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:loading?.6:1 }}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:14, color:C.text3 }}>
          Remember your password?{" "}
          <Link href="/login" style={{ color:C.blue, fontWeight:500 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
