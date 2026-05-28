"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      router.push("/onboarding");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("email-already-in-use") ? "An account with this email already exists." : "Signup failed. Please try again.");
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setLoading(true); setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/onboarding");
    } catch { setError("Google signup failed."); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 8 }}>
            Dash<span style={{ color: "#2997ff" }}>Wise</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#f5f5f7", marginBottom: 6 }}>Get started free</h1>
          <p style={{ fontSize: 14, color: "rgba(245,245,247,0.4)" }}>Your AI business advisor is 2 minutes away</p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 32 }}>
          {error && (
            <div style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.3)", color: "#ff6b62", fontSize: 13, padding: "10px 14px", borderRadius: 10, marginBottom: 20 }}>{error}</div>
          )}

          <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 16px", fontSize: 14, fontWeight: 500, color: "#f5f5f7", cursor: "pointer", marginBottom: 20, fontFamily: "inherit" }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }}/><span style={{ fontSize: 12, color: "rgba(245,245,247,0.3)" }}>or</span><div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }}/>
          </div>

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[{ label: "Full name", value: name, set: setName, type: "text", placeholder: "Maria Santos" },
              { label: "Email", value: email, set: setEmail, type: "email", placeholder: "you@company.com" },
              { label: "Password", value: password, set: setPassword, type: "password", placeholder: "Min. 6 characters" }].map(f => (
              <div key={f.label}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(245,245,247,0.6)", marginBottom: 6 }}>{f.label}</label>
                <input type={f.type} required value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "#f5f5f7" }}/>
              </div>
            ))}
            <button type="submit" disabled={loading} style={{ background: "#2997ff", color: "#fff", fontWeight: 600, fontSize: 15, padding: 13, borderRadius: 10, border: "none", cursor: "pointer", marginTop: 4, fontFamily: "inherit" }}>
              {loading ? "Creating account..." : "Create free account"}
            </button>
            <p style={{ fontSize: 11, color: "rgba(245,245,247,0.3)", textAlign: "center" }}>By creating an account you agree to our Terms and Privacy Policy.</p>
          </form>
        </div>
        <p style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: "rgba(245,245,247,0.4)" }}>
          Already have an account?{" "}<Link href="/login" style={{ color: "#2997ff", textDecoration: "none", fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
