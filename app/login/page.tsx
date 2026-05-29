"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/db";
import { C, radius, shadow, input, label, btnPrimary } from "@/lib/styles";

const GIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [showP,   setShowP]   = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  function getErrorMessage(code: string): string {
    const map: Record<string,string> = {
      "auth/user-not-found":       "No account found with this email. Did you mean to sign up?",
      "auth/wrong-password":       "Incorrect password. Try again or reset your password.",
      "auth/invalid-credential":   "Email or password is incorrect.",
      "auth/invalid-email":        "Please enter a valid email address.",
      "auth/user-disabled":        "This account has been disabled. Contact support.",
      "auth/too-many-requests":    "Too many failed attempts. Please wait a few minutes and try again.",
      "auth/network-request-failed": "Network error. Check your connection and try again.",
    };
    return map[code] || "Sign in failed. Please try again.";
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!pass.trim())  { setError("Please enter your password."); return; }
    setLoading(true); setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const p    = await getUserProfile(cred.user.uid);
      router.push(p ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      setError(getErrorMessage((err as { code?: string }).code || ""));
    } finally { setLoading(false); }
  }

  async function onGoogle() {
    setLoading(true); setError("");
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const p    = await getUserProfile(cred.user.uid);
      router.push(p ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      if (code !== "auth/popup-closed-by-user")
        setError("Google sign-in failed. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <Link href="/" style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.5px", color:C.text }}>
            Dash<span style={{ color:C.blue }}>Wise</span>
          </Link>
          <div style={{ fontSize:22, fontWeight:600, color:C.text, marginTop:20, marginBottom:4 }}>Welcome back</div>
          <div style={{ fontSize:14, color:C.text3 }}>Sign in to your account</div>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:"28px 28px", boxShadow:shadow.md }}>

          {error && (
            <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"12px 14px", borderRadius:radius.sm, marginBottom:20, lineHeight:1.5 }}>
              ⚠ {error}
            </div>
          )}

          <button onClick={onGoogle} disabled={loading} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"12px", fontSize:14, fontWeight:500, color:C.text, cursor:"pointer", marginBottom:20, boxShadow:shadow.sm }}>
            <GIcon /> Continue with Google
          </button>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:C.border }}/><span style={{ fontSize:12, color:C.text3 }}>or sign in with email</span><div style={{ flex:1, height:1, background:C.border }}/>
          </div>

          <form onSubmit={onEmail} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={label}>Email address</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" style={input} autoComplete="email"/>
            </div>

            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <label style={{ ...label, marginBottom:0 }}>Password</label>
                <Link href="/reset-password" style={{ fontSize:12, color:C.blue, fontWeight:500 }}>Forgot password?</Link>
              </div>
              <div style={{ position:"relative" }}>
                <input type={showP?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} placeholder="Your password" style={{ ...input, paddingRight:56 }} autoComplete="current-password"/>
                <button type="button" onClick={()=>setShowP(!showP)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.text3, fontSize:12, cursor:"pointer" }}>
                  {showP?"Hide":"Show"}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{ ...btnPrimary, width:"100%", padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:loading?.6:1, marginTop:4 }}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:14, color:C.text3 }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" style={{ color:C.blue, fontWeight:500 }}>Sign up free</Link>
        </div>
      </div>
    </div>
  );
}
