"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getAllUploads, UploadRecord } from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

const PROMPTS = [
  "What's the overall health of my business right now?",
  "Which metric should I focus on this week?",
  "Where am I losing the most money?",
  "What trend should I pay attention to?",
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [uploads,  setUploads]  = useState<UploadRecord[]>([]);
  const [busy,     setBusy]     = useState(true);
  const [prompt]               = useState(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && !profile) { const t=setTimeout(()=>router.push("/onboarding"),1000); return()=>clearTimeout(t); }
  }, [user, profile, loading, router]);

  useEffect(() => {
    if (!user) return;
    getAllUploads(user.uid).then(d=>{setUploads(d);setBusy(false);}).catch(()=>setBusy(false));
  }, [user]);

  if (loading || !profile) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:36, height:36, border:`2.5px solid ${C.blue}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 14px" }}/>
        <div style={{ fontSize:14, color:C.text3 }}>Loading DashWise...</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const latest   = uploads[0];
  const metrics  = latest?.metrics as Record<string,unknown>|undefined;
  const hasData  = uploads.length > 0;
  const planColor: Record<string,string> = { free:C.text3, pro:C.blue, team:"#af52de", business:"#ff9f0a" };

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"36px 28px" }}>

        {/* Header */}
        <div style={{ marginBottom:28 }}>
          <h1 style={{ fontSize:30, fontWeight:700, letterSpacing:"-0.6px", color:C.text, marginBottom:5 }}>
            Good day, {profile.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p style={{ fontSize:14, color:C.text3 }}>
            {profile.bizName} · {profile.bizType}
            {hasData && ` · ${uploads.length} upload${uploads.length!==1?"s":""}`}
          </p>
        </div>

        {/* Empty state */}
        {!busy && !hasData && (
          <div style={{ background:C.surface, border:`1px dashed ${C.border2}`, borderRadius:radius.xl, padding:"60px 40px", textAlign:"center", marginBottom:28, boxShadow:shadow.sm }}>
            <div style={{ fontSize:52, marginBottom:16 }}>📂</div>
            <h2 style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:10 }}>Upload your first file</h2>
            <p style={{ fontSize:14, color:C.text3, marginBottom:28, maxWidth:380, margin:"0 auto 28px" }}>
              Connect your POS or upload a CSV, Excel, or PDF to get AI insights.
            </p>
            <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
              <Link href="/files"        style={{ ...btnPrimary }}>📁 Upload Files</Link>
              <Link href="/integrations" style={{ ...btnPrimary, background:C.bg, color:C.text, border:`1px solid ${C.border}` }}>🔗 Connect POS</Link>
            </div>
          </div>
        )}

        {/* Advisor prompt */}
        {hasData && (
          <Link href={`/advisor?q=${encodeURIComponent(prompt)}`} style={{
            display:"block",
            background:`linear-gradient(135deg,${C.blue} 0%,#0058b8 100%)`,
            borderRadius:radius.xl, padding:"22px 28px", marginBottom:22,
            boxShadow:"0 8px 24px rgba(0,113,227,0.3)",
          }}>
            <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:"rgba(255,255,255,0.7)", marginBottom:8 }}>
              💬 Your Advisor is asking
            </div>
            <div style={{ fontSize:17, fontWeight:500, color:"#fff", marginBottom:5, lineHeight:1.4 }}>{prompt}</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.65)" }}>Tap to answer and get a recommendation →</div>
          </Link>
        )}

        {/* KPI cards */}
        {hasData && (
          <>
            <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>
              Latest — {latest?.label}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
              {[
                { lbl:"Revenue",  val:metrics?.revenue?`$${Number(metrics.revenue).toLocaleString()}`:"—", col:"#34c759" },
                { lbl:"Uploads",  val:String(uploads.length), col:C.blue },
                { lbl:"Plan",     val:profile.subscription?profile.subscription.charAt(0).toUpperCase()+profile.subscription.slice(1):"Free", col:planColor[profile.subscription||"free"]||C.text3 },
                { lbl:"Goals",    val:String(profile.goals?.length||0), col:"#af52de" },
              ].map(k=>(
                <div key={k.lbl} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"20px 22px", boxShadow:shadow.sm }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>{k.lbl}</div>
                  <div style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:k.col }}>{k.val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Uploads + Goals */}
        {hasData && (
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:24 }}>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
              <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:600, fontSize:14, color:C.text }}>Recent Uploads</span>
                <Link href="/history" style={{ fontSize:13, color:C.blue, fontWeight:500 }}>View all →</Link>
              </div>
              {uploads.slice(0,5).map((u,i)=>(
                <div key={u.id||i} style={{ padding:"13px 22px", borderBottom:`1px solid #fafafa`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{u.label||u.source}</div>
                    <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>{u.dataType} · {u.period}</div>
                  </div>
                  <span style={{ fontSize:11, background:"#f0faf4", color:"#34c759", border:"1px solid #c8f0d8", padding:"3px 10px", borderRadius:20, fontWeight:600 }}>
                    {u.quality||"analyzed"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:22, boxShadow:shadow.sm }}>
              <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:16 }}>Your Goals</div>
              {profile.goals?.length?(
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {profile.goals.map((g,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:C.blue, flexShrink:0 }}/>
                      <span style={{ fontSize:13, color:C.text2 }}>{g}</span>
                    </div>
                  ))}
                </div>
              ):(
                <p style={{ fontSize:13, color:C.text3 }}>No goals set yet.</p>
              )}
              <Link href="/settings" style={{ display:"block", marginTop:16, fontSize:13, color:C.blue, fontWeight:500 }}>Edit goals →</Link>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
          {[
            { href:"/files",        icon:"📁", title:"Upload Files",  desc:"Add CSV, Excel, PDF to a folder" },
            { href:"/advisor",      icon:"💬", title:"Ask Advisor",   desc:"Chat with your AI business advisor" },
            { href:"/integrations", icon:"🔗", title:"Connect POS",   desc:"Shopify, Clover, Square and more" },
          ].map(item=>(
            <Link key={item.href} href={item.href} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"18px 20px", display:"flex", alignItems:"center", gap:16, boxShadow:shadow.sm }}>
              <div style={{ fontSize:28, flexShrink:0 }}>{item.icon}</div>
              <div>
                <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:3 }}>{item.title}</div>
                <div style={{ fontSize:12, color:C.text3 }}>{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Upgrade nudge */}
        {profile.subscription==="free" && uploads.length>=3 && (
          <div style={{ marginTop:20, background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.lg, padding:"16px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:C.blue, marginBottom:3 }}>{uploads.length} of 5 free analyses used</div>
              <div style={{ fontSize:13, color:C.text2 }}>Upgrade to Pro for unlimited analyses and business memory.</div>
            </div>
            <Link href="/settings" style={{ ...btnPrimary, padding:"10px 20px", flexShrink:0 }}>Upgrade →</Link>
          </div>
        )}
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
