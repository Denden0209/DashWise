"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { C, radius, shadow, input, label, btnPrimary } from "@/lib/styles";

const GIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

type FieldError = { name?: string; email?: string; pass?: string; confirm?: string };

function validate(name: string, email: string, pass: string, confirm: string): FieldError {
  const errors: FieldError = {};
  if (!name.trim())              errors.name    = "Full name is required.";
  if (!email.includes("@"))      errors.email   = "Enter a valid email address.";
  if (pass.length < 8)           errors.pass    = "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pass))       errors.pass    = "Password must contain an uppercase letter.";
  if (!/[0-9]/.test(pass))       errors.pass    = "Password must contain a number.";
  if (pass !== confirm)          errors.confirm  = "Passwords do not match.";
  return errors;
}

export default function SignupPage() {
  const router = useRouter();
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [showP,   setShowP]   = useState(false);
  const [errors,  setErrors]  = useState<FieldError>({});
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(name, email, pass, confirm);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({}); setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user, {
        url: `${window.location.origin}/onboarding`,
      });
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      if (code === "auth/email-already-in-use")
        setErrors({ email: "An account with this email already exists." });
      else if (code === "auth/invalid-email")
        setErrors({ email: "Invalid email address." });
      else if (code === "auth/weak-password")
        setErrors({ pass: "Password is too weak." });
      else
        setErrors({ email: "Signup failed. Please try again." });
    } finally { setLoading(false); }
  }

  async function onGoogle() {
    setLoading(true); setErrors({});
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/onboarding");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      if (code !== "auth/popup-closed-by-user")
        setErrors({ email: "Google sign-in failed. Please try again." });
    } finally { setLoading(false); }
  }

  // ── Email sent confirmation screen ──
  if (sent) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420, textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:20 }}>📧</div>
        <h1 style={{ fontSize:24, fontWeight:700, color:C.text, marginBottom:10 }}>Check your email</h1>
        <p style={{ fontSize:14, color:C.text3, marginBottom:6, lineHeight:1.6 }}>
          We sent a verification link to <strong style={{ color:C.text }}>{email}</strong>
        </p>
        <p style={{ fontSize:13, color:C.text3, marginBottom:28, lineHeight:1.6 }}>
          Click the link in the email to verify your account, then you can sign in.
        </p>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:20, marginBottom:20, boxShadow:shadow.sm }}>
          <p style={{ fontSize:13, color:C.text2, marginBottom:12 }}>Didn&apos;t get it? Check your spam folder or:</p>
          <button onClick={async () => {
            try {
              const user = auth.currentUser;
              if (user) await sendEmailVerification(user);
              alert("Verification email resent!");
            } catch { alert("Please try again in a minute."); }
          }} style={{ ...btnPrimary, width:"100%", padding:"11px", borderRadius:radius.sm, fontSize:14 }}>
            Resend verification email
          </button>
        </div>
        <Link href="/login" style={{ fontSize:14, color:C.blue, fontWeight:500 }}>
          ← Back to sign in
        </Link>
      </div>
    </div>
  );

  const inp = (err?: string): React.CSSProperties => ({
    ...input,
    borderColor: err ? C.red : C.border,
    boxShadow: err ? `0 0 0 3px rgba(255,59,48,0.1)` : "none",
  });

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <Link href="/" style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.5px", color:C.text }}>
            Dash<span style={{ color:C.blue }}>Wise</span>
          </Link>
          <div style={{ fontSize:22, fontWeight:600, color:C.text, marginTop:20, marginBottom:4 }}>Create your account</div>
          <div style={{ fontSize:14, color:C.text3 }}>Your AI business advisor in 2 minutes</div>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:"28px 28px", boxShadow:shadow.md }}>

          {/* Google */}
          <button onClick={onGoogle} disabled={loading} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"12px", fontSize:14, fontWeight:500, color:C.text, cursor:"pointer", marginBottom:20, boxShadow:shadow.sm }}>
            <GIcon /> Continue with Google
          </button>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:C.border }}/><span style={{ fontSize:12, color:C.text3 }}>or sign up with email</span><div style={{ flex:1, height:1, background:C.border }}/>
          </div>

          <form onSubmit={onSignup} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Name */}
            <div>
              <label style={label}>Full name</label>
              <input value={name} onChange={e=>{setName(e.target.value);setErrors(p=>({...p,name:undefined}));}} placeholder="Maria Santos" style={inp(errors.name)} autoComplete="name"/>
              {errors.name && <div style={{ fontSize:12, color:C.red, marginTop:4 }}>⚠ {errors.name}</div>}
            </div>

            {/* Email */}
            <div>
              <label style={label}>Email address</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setErrors(p=>({...p,email:undefined}));}} placeholder="you@company.com" style={inp(errors.email)} autoComplete="email"/>
              {errors.email && <div style={{ fontSize:12, color:C.red, marginTop:4 }}>⚠ {errors.email}</div>}
            </div>

            {/* Password */}
            <div>
              <label style={label}>Password</label>
              <div style={{ position:"relative" }}>
                <input type={showP?"text":"password"} value={pass} onChange={e=>{setPass(e.target.value);setErrors(p=>({...p,pass:undefined}));}} placeholder="Min. 8 characters" style={{ ...inp(errors.pass), paddingRight:56 }} autoComplete="new-password"/>
                <button type="button" onClick={()=>setShowP(!showP)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.text3, fontSize:12, cursor:"pointer" }}>
                  {showP?"Hide":"Show"}
                </button>
              </div>
              {errors.pass && <div style={{ fontSize:12, color:C.red, marginTop:4 }}>⚠ {errors.pass}</div>}
              {/* Password strength hints */}
              {pass.length > 0 && (
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  {[{ label:"8+ chars", ok:pass.length>=8 }, { label:"Uppercase", ok:/[A-Z]/.test(pass) }, { label:"Number", ok:/[0-9]/.test(pass) }].map(h=>(
                    <span key={h.label} style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:h.ok?"#f0faf4":C.bg, color:h.ok?"#34c759":C.text3, border:`1px solid ${h.ok?"#c8f0d8":C.border}` }}>
                      {h.ok?"✓":""} {h.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label style={label}>Confirm password</label>
              <input type="password" value={confirm} onChange={e=>{setConfirm(e.target.value);setErrors(p=>({...p,confirm:undefined}));}} placeholder="Re-enter password" style={inp(errors.confirm)} autoComplete="new-password"/>
              {errors.confirm && <div style={{ fontSize:12, color:C.red, marginTop:4 }}>⚠ {errors.confirm}</div>}
            </div>

            <button type="submit" disabled={loading} style={{ ...btnPrimary, width:"100%", padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:loading?.6:1, marginTop:4 }}>
              {loading ? "Creating account..." : "Create free account"}
            </button>

            <p style={{ fontSize:11, color:C.text3, textAlign:"center" as const }}>
              By signing up you agree to our{" "}
              <Link href="/terms" style={{ color:C.blue }}>Terms</Link> and{" "}
              <Link href="/privacy" style={{ color:C.blue }}>Privacy Policy</Link>.
            </p>
          </form>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:14, color:C.text3 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color:C.blue, fontWeight:500 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
