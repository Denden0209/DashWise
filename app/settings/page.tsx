"use client";
import { useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { updateUserProfile } from "@/lib/db";
import Nav from "@/components/Nav";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [bizName, setBizName] = useState(profile?.bizName || "");
  const [tone,    setTone]    = useState(profile?.advisorTone || "balanced");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await updateUserProfile(user.uid, { bizName, advisorTone: tone });
    await refreshProfile();
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  const planColors: Record<string,string> = { free:"#9e9e9e", pro:"#2997ff", team:"#bf5af2", business:"#ffd60a" };

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      <Nav />
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: "#f5f5f7", marginBottom: 32 }}>Settings</h1>

        {/* Profile */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#f5f5f7", marginBottom: 20 }}>Business Profile</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(245,245,247,0.5)", marginBottom: 6 }}>Business name</label>
              <input value={bizName} onChange={e => setBizName(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "#f5f5f7" }}/>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "rgba(245,245,247,0.5)", marginBottom: 8 }}>Advisor tone</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["direct","balanced","coaching"].map(t => (
                  <button key={t} onClick={() => setTone(t)} style={{
                    flex: 1, padding: "10px 8px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                    background: tone === t ? "#2997ff" : "rgba(255,255,255,0.06)",
                    border: tone === t ? "1px solid #2997ff" : "1px solid rgba(255,255,255,0.1)",
                    color: tone === t ? "#fff" : "rgba(245,245,247,0.6)",
                    cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} style={{ background: "#2997ff", color: "#fff", fontWeight: 600, fontSize: 14, padding: "12px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {saved ? "✓ Saved!" : saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#f5f5f7", marginBottom: 16 }}>Subscription</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 20, background: `${planColors[profile?.subscription || "free"]}20`, color: planColors[profile?.subscription || "free"] }}>
              {profile?.subscription || "free"} plan
            </span>
            <span style={{ fontSize: 13, color: "rgba(245,245,247,0.4)" }}>{profile?.uploadsCount || 0} total analyses</span>
          </div>
          {profile?.subscription === "free" && (
            <div style={{ background: "rgba(41,151,255,0.08)", border: "1px solid rgba(41,151,255,0.2)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#2997ff", marginBottom: 4 }}>Upgrade to Pro — $29/month</div>
              <div style={{ fontSize: 13, color: "rgba(245,245,247,0.45)", marginBottom: 12 }}>Unlimited analyses, business memory, advisor chat, and full upload history.</div>
              <button style={{ background: "#2997ff", color: "#fff", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>Upgrade (coming soon)</button>
            </div>
          )}
        </div>

        {/* Account */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#f5f5f7", marginBottom: 16 }}>Account</h2>
          <div style={{ fontSize: 13, color: "rgba(245,245,247,0.4)", marginBottom: 16 }}>
            Signed in as <span style={{ color: "#f5f5f7" }}>{user?.email}</span>
          </div>
          <button onClick={async () => { await signOut(auth); router.push("/"); }} style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.3)", color: "#ff453a", fontSize: 13, fontWeight: 500, padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
