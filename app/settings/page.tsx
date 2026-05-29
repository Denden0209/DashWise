"use client";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { updateUserProfile } from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, input, label, btnPrimary } from "@/lib/styles";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [bizName, setBizName] = useState(profile?.bizName || "");
  const [tone,    setTone]    = useState(profile?.advisorTone || "balanced");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  async function handleSave() {
    if (!user) return;
    setSaving(true); setError("");
    try {
      await updateUserProfile(user.uid, { bizName, advisorTone: tone });
      await refreshProfile();
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setError("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  const planMeta: Record<string,{label:string;bg:string;color:string}> = {
    free:     { label:"Free",     bg:"#f5f5f7", color:C.text3  },
    pro:      { label:"Pro",      bg:C.blueBg,  color:C.blue   },
    team:     { label:"Team",     bg:"#f3e8ff", color:"#af52de"},
    business: { label:"Business", bg:"#fff3e0", color:"#ff9f0a"},
  };
  const plan = planMeta[profile?.subscription || "free"];

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:680, margin:"0 auto", padding:"36px 28px" }}>
        <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:28 }}>Settings</h1>

        {/* Profile card */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:28, marginBottom:16, boxShadow:shadow.sm }}>
          <h2 style={{ fontSize:16, fontWeight:600, color:C.text, marginBottom:22 }}>Business Profile</h2>

          {error && (
            <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"10px 14px", borderRadius:radius.sm, marginBottom:20 }}>
              {error}
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div>
              <label style={label}>Business name</label>
              <input value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="Your business name" style={input}/>
            </div>

            <div>
              <label style={label}>Advisor communication style</label>
              <div style={{ display:"flex", gap:8 }}>
                {[
                  { id:"direct",   icon:"⚡", desc:"Straight to the point" },
                  { id:"balanced", icon:"⚖️", desc:"Mix of insight & action" },
                  { id:"coaching", icon:"🎯", desc:"Guiding questions" },
                ].map(t=>(
                  <button key={t.id} onClick={()=>setTone(t.id)} style={{
                    flex:1, padding:"12px 8px", borderRadius:radius.sm, fontSize:13,
                    fontWeight: tone===t.id?600:400,
                    background: tone===t.id?C.blueBg:C.bg,
                    border:     tone===t.id?`1.5px solid ${C.blue}`:`1px solid ${C.border}`,
                    color:      tone===t.id?C.blue:C.text2,
                    cursor:"pointer", textAlign:"center" as const,
                  }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{t.icon}</div>
                    <div style={{ textTransform:"capitalize" as const }}>{t.id}</div>
                    <div style={{ fontSize:10, opacity:0.7, marginTop:2 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, width:"100%", padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:saving?.6:1 }}>
              {saved ? "✓ Changes saved!" : saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:28, marginBottom:16, boxShadow:shadow.sm }}>
          <h2 style={{ fontSize:16, fontWeight:600, color:C.text, marginBottom:18 }}>Subscription</h2>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
            <span style={{ fontSize:13, fontWeight:600, padding:"5px 14px", borderRadius:20, background:plan.bg, color:plan.color }}>
              {plan.label} plan
            </span>
            <span style={{ fontSize:13, color:C.text3 }}>{profile?.uploadsCount||0} total analyses</span>
          </div>
          {profile?.subscription==="free" && (
            <div style={{ background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.md, padding:20 }}>
              <div style={{ fontWeight:600, fontSize:15, color:C.blue, marginBottom:5 }}>Upgrade to Pro — $29/month</div>
              <div style={{ fontSize:13, color:C.text2, marginBottom:16, lineHeight:1.5 }}>
                Unlimited analyses, full business memory, advisor chat, and dynamic dashboards.
              </div>
              <button style={{ ...btnPrimary, opacity:0.6, cursor:"not-allowed", fontSize:13, padding:"9px 20px" }}>
                Upgrade (coming soon)
              </button>
            </div>
          )}
        </div>

        {/* Account */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, padding:28, boxShadow:shadow.sm }}>
          <h2 style={{ fontSize:16, fontWeight:600, color:C.text, marginBottom:16 }}>Account</h2>
          <div style={{ fontSize:13, color:C.text3, marginBottom:18 }}>
            Signed in as <span style={{ color:C.text, fontWeight:500 }}>{user?.email}</span>
          </div>
          <button onClick={async()=>{ await signOut(auth); router.push("/"); }} style={{
            background:"transparent", border:`1px solid #ffd6d6`,
            color:C.red, fontSize:13, fontWeight:500,
            padding:"10px 20px", borderRadius:radius.sm, cursor:"pointer",
          }}>
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
