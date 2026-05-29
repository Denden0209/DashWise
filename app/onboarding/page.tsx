"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { saveUserProfile } from "@/lib/db";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

const BIZ_TYPES = [
  { id:"retail",     icon:"🛍️",  label:"Retail"     },
  { id:"restaurant", icon:"🍽️", label:"Restaurant" },
  { id:"ecommerce",  icon:"🛒",  label:"E-Commerce" },
  { id:"service",    icon:"🔧",  label:"Service"    },
  { id:"clinic",     icon:"🏥",  label:"Clinic"     },
  { id:"salon",      icon:"💇",  label:"Salon"      },
];

const GOALS = [
  "Increase revenue", "Reduce costs", "Improve margins",
  "Understand customers", "Scale operations", "Fix cash flow",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [step,    setStep]    = useState(1);
  const [name,    setName]    = useState("");
  const [role,    setRole]    = useState("");
  const [bizName, setBizName] = useState("");
  const [bizType, setBizType] = useState("");
  const [selGoals,setSelGoals]= useState<string[]>([]);
  const [tone,    setTone]    = useState("balanced");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  function toggleGoal(g: string) {
    setSelGoals(prev => prev.includes(g) ? prev.filter(x=>x!==g) : prev.length<3 ? [...prev,g] : prev);
  }

  async function handleFinish() {
    if (!user) return;
    setSaving(true); setError("");
    try {
      await saveUserProfile(user.uid, {
        uid: user.uid,
        name: name || user.displayName || "User",
        email: user.email || "",
        role, bizName, bizType,
        goals: selGoals,
        advisorTone: tone,
        subscription: "free",
        uploadsCount: 0,
      });
      await refreshProfile();
      router.push("/dashboard");
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  const progress = (step / 3) * 100;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:540 }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:24, fontWeight:700, letterSpacing:"-0.4px", color:C.text }}>
            Dash<span style={{ color:C.blue }}>Wise</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background:C.border, borderRadius:4, height:4, marginBottom:36, overflow:"hidden" }}>
          <div style={{ background:C.blue, height:"100%", width:`${progress}%`, borderRadius:4, transition:"width 0.4s ease" }}/>
        </div>

        {/* Card */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:"36px 32px", boxShadow:shadow.md }}>

          {error && (
            <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"10px 14px", borderRadius:radius.sm, marginBottom:20 }}>
              {error}
            </div>
          )}

          {/* ── Step 1: About you ── */}
          {step === 1 && (
            <div style={{ animation:"fadeUp .3s ease" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.blue, marginBottom:12 }}>Step 1 of 3</div>
              <h2 style={{ fontSize:24, fontWeight:700, color:C.text, marginBottom:6 }}>Tell us about yourself</h2>
              <p style={{ fontSize:14, color:C.text3, marginBottom:28 }}>This helps DashWise personalise your experience.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Your name</label>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="Maria Santos" style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"11px 14px", fontSize:14, color:C.text, outline:"none" }}/>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Your role</label>
                  <select value={role} onChange={e=>setRole(e.target.value)} style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", cursor:"pointer" }}>
                    <option value="">Select your role...</option>
                    {["Business Owner","General Manager","Operations Director","Sales Manager","Finance Manager","Other"].map(r=>(
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <button onClick={()=>{if(name&&role)setStep(2);}} disabled={!name||!role} style={{ ...btnPrimary, width:"100%", padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:(!name||!role)?.4:1, marginTop:8 }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Your business ── */}
          {step === 2 && (
            <div style={{ animation:"fadeUp .3s ease" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.blue, marginBottom:12 }}>Step 2 of 3</div>
              <h2 style={{ fontSize:24, fontWeight:700, color:C.text, marginBottom:6 }}>About your business</h2>
              <p style={{ fontSize:14, color:C.text3, marginBottom:28 }}>DashWise will tailor insights to your type of business.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Business name</label>
                  <input value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="e.g. Bloom & Clay" style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"11px 14px", fontSize:14, color:C.text, outline:"none" }}/>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:10 }}>Business type</label>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                    {BIZ_TYPES.map(b=>(
                      <button key={b.id} onClick={()=>setBizType(b.id)} style={{
                        padding:"14px 8px", borderRadius:radius.sm, fontSize:13,
                        fontWeight: bizType===b.id?600:400,
                        background: bizType===b.id?C.blueBg:C.bg,
                        border:     bizType===b.id?`1.5px solid ${C.blue}`:`1px solid ${C.border}`,
                        color:      bizType===b.id?C.blue:C.text2,
                        cursor:"pointer", textAlign:"center" as const,
                      }}>
                        <div style={{ fontSize:22, marginBottom:5 }}>{b.icon}</div>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex", gap:10, marginTop:8 }}>
                  <button onClick={()=>setStep(1)} style={{ flex:1, padding:"13px", borderRadius:radius.sm, fontSize:15, background:C.bg, border:`1px solid ${C.border}`, color:C.text2, cursor:"pointer" }}>
                    ← Back
                  </button>
                  <button onClick={()=>{if(bizName&&bizType)setStep(3);}} disabled={!bizName||!bizType} style={{ ...btnPrimary, flex:2, padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:(!bizName||!bizType)?.4:1 }}>
                    Continue →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Goals & tone ── */}
          {step === 3 && (
            <div style={{ animation:"fadeUp .3s ease" }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.blue, marginBottom:12 }}>Step 3 of 3</div>
              <h2 style={{ fontSize:24, fontWeight:700, color:C.text, marginBottom:6 }}>What are your goals?</h2>
              <p style={{ fontSize:14, color:C.text3, marginBottom:24 }}>Pick up to 3 goals — your advisor will focus on these.</p>

              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:10, marginBottom:24 }}>
                {GOALS.map(g => {
                  const sel = selGoals.includes(g);
                  return (
                    <button key={g} onClick={()=>toggleGoal(g)} style={{
                      padding:"9px 16px", borderRadius:radius.full, fontSize:13,
                      fontWeight: sel?600:400,
                      background: sel?C.blue:C.bg,
                      border:     sel?`1.5px solid ${C.blue}`:`1px solid ${C.border}`,
                      color:      sel?"#fff":C.text2,
                      cursor:"pointer",
                    }}>
                      {g}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginBottom:24 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:10 }}>Advisor tone</label>
                <div style={{ display:"flex", gap:8 }}>
                  {["direct","balanced","coaching"].map(t=>(
                    <button key={t} onClick={()=>setTone(t)} style={{
                      flex:1, padding:"10px", borderRadius:radius.sm, fontSize:13,
                      fontWeight: tone===t?600:400,
                      background: tone===t?C.blueBg:C.bg,
                      border:     tone===t?`1.5px solid ${C.blue}`:`1px solid ${C.border}`,
                      color:      tone===t?C.blue:C.text2,
                      cursor:"pointer", textTransform:"capitalize" as const,
                    }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>setStep(2)} style={{ flex:1, padding:"13px", borderRadius:radius.sm, fontSize:15, background:C.bg, border:`1px solid ${C.border}`, color:C.text2, cursor:"pointer" }}>
                  ← Back
                </button>
                <button onClick={handleFinish} disabled={saving} style={{ ...btnPrimary, flex:2, padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:saving?.6:1 }}>
                  {saving ? "Setting up..." : "🚀 Launch DashWise"}
                </button>
              </div>
            </div>
          )}
        </div>

        <p style={{ textAlign:"center", marginTop:16, fontSize:12, color:C.text3 }}>
          Step {step} of 3 · Takes less than 2 minutes
        </p>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
