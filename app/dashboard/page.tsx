"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getAllUploads, UploadRecord } from "@/lib/db";
import Nav from "@/components/Nav";

const PROACTIVE = [
  "What's the overall health of my business right now?",
  "Which metric should I be most focused on this week?",
  "Where am I losing the most money?",
  "What trend in my data should I pay attention to?",
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [uploads, setUploads]     = useState<UploadRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [question] = useState(PROACTIVE[Math.floor(Math.random() * PROACTIVE.length)]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && !profile) { const t = setTimeout(() => router.push("/onboarding"), 1000); return () => clearTimeout(t); }
  }, [user, profile, loading, router]);

  useEffect(() => {
    if (!user) return;
    getAllUploads(user.uid).then(d => { setUploads(d); setDataLoading(false); }).catch(() => setDataLoading(false));
  }, [user]);

  if (loading || !profile) return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid #2997ff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
        <div style={{ color: "rgba(245,245,247,0.4)", fontSize: 14 }}>Loading...</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const latest  = uploads[0];
  const metrics = latest?.metrics as Record<string,unknown> | undefined;
  const hasData = uploads.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      <Nav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.8px", color: "#f5f5f7", marginBottom: 6 }}>
            Good day, {profile.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p style={{ fontSize: 15, color: "rgba(245,245,247,0.4)" }}>
            {profile.bizName} · {profile.bizType}{hasData && ` · ${uploads.length} upload${uploads.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {!dataLoading && !hasData && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 20, padding: "60px 40px", textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f5f5f7", marginBottom: 10 }}>Upload your first data file</h2>
            <p style={{ fontSize: 15, color: "rgba(245,245,247,0.45)", marginBottom: 28 }}>Connect your POS or upload a CSV, Excel, or PDF file to get started.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/files" style={{ background: "#2997ff", color: "#fff", fontWeight: 600, fontSize: 14, padding: "12px 28px", borderRadius: 980, textDecoration: "none" }}>Upload Files →</Link>
              <Link href="/integrations" style={{ background: "rgba(255,255,255,0.08)", color: "#f5f5f7", fontWeight: 600, fontSize: 14, padding: "12px 28px", borderRadius: 980, textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)" }}>Connect POS</Link>
            </div>
          </div>
        )}

        {hasData && (
          <Link href={`/advisor?q=${encodeURIComponent(question)}`} style={{ display: "block", textDecoration: "none", background: "linear-gradient(135deg,rgba(41,151,255,0.15) 0%,rgba(41,151,255,0.05) 100%)", border: "1px solid rgba(41,151,255,0.25)", borderRadius: 18, padding: "20px 24px", marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "#2997ff", marginBottom: 8 }}>💬 Your Advisor is asking</div>
            <div style={{ fontSize: 17, fontWeight: 500, color: "#f5f5f7", marginBottom: 6 }}>{question}</div>
            <div style={{ fontSize: 13, color: "rgba(41,151,255,0.7)" }}>Tap to answer →</div>
          </Link>
        )}

        {hasData && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(245,245,247,0.3)", marginBottom: 12 }}>Latest — {latest?.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 32 }}>
              {[
                { label:"Revenue", value: metrics?.revenue ? `$${Number(metrics.revenue).toLocaleString()}` : "—", color:"#30d158" },
                { label:"Uploads",  value: String(uploads.length), color:"#2997ff" },
                { label:"Plan",     value: profile.subscription || "Free", color:"#ffd60a" },
                { label:"Goals",    value: String(profile.goals?.length || 0), color:"#bf5af2" },
              ].map(k => (
                <div key={k.label} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:20 }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", color:"rgba(245,245,247,0.35)", marginBottom:10 }}>{k.label}</div>
                  <div style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:k.color }}>{k.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:32 }}>
              <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:18, overflow:"hidden" }}>
                <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontWeight:600, fontSize:14, color:"#f5f5f7" }}>Recent Uploads</span>
                  <Link href="/history" style={{ fontSize:12, color:"#2997ff", textDecoration:"none" }}>View all →</Link>
                </div>
                {uploads.slice(0,5).map((u,i) => (
                  <div key={u.id||i} style={{ padding:"13px 20px", borderBottom:"1px solid rgba(255,255,255,0.04)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:"#f5f5f7" }}>{u.label||u.source}</div>
                      <div style={{ fontSize:11, color:"rgba(245,245,247,0.35)", marginTop:2 }}>{u.dataType} · {u.period}</div>
                    </div>
                    <span style={{ fontSize:11, background:"rgba(48,209,88,0.15)", color:"#30d158", padding:"2px 10px", borderRadius:20, fontWeight:500 }}>{u.quality||"analyzed"}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:18, padding:20 }}>
                <div style={{ fontWeight:600, fontSize:14, color:"#f5f5f7", marginBottom:16 }}>Goals</div>
                {profile.goals?.length ? profile.goals.map((g,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#2997ff", flexShrink:0 }}/>
                    <span style={{ fontSize:13, color:"rgba(245,245,247,0.7)" }}>{g}</span>
                  </div>
                )) : <p style={{ fontSize:13, color:"rgba(245,245,247,0.3)" }}>No goals set.</p>}
              </div>
            </div>
          </>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {[
            { href:"/files", icon:"📁", title:"Upload Files", desc:"Add CSV, Excel, PDF to a folder" },
            { href:"/advisor", icon:"💬", title:"Ask Advisor", desc:"Chat about your business data" },
            { href:"/integrations", icon:"🔗", title:"Connect POS", desc:"Shopify, Clover, Square and more" },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:20, textDecoration:"none", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ fontSize:28 }}>{item.icon}</div>
              <div>
                <div style={{ fontWeight:600, fontSize:14, color:"#f5f5f7", marginBottom:3 }}>{item.title}</div>
                <div style={{ fontSize:12, color:"rgba(245,245,247,0.4)" }}>{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
