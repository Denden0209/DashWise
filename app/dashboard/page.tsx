"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getAllUploads, UploadRecord } from "@/lib/db";
import Nav from "@/components/Nav";

const PROACTIVE = [
  "What's the overall health of my business right now?",
  "Which metric should I focus on this week?",
  "Where am I losing the most money?",
  "What trend in my data should I pay attention to?",
];

function KPICard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e5ea", borderRadius: 16, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "#86868b", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#86868b" }}>{sub}</div>
    </div>
  );
}

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
    <div style={{ minHeight: "100vh", background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid #0071e3", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }}/>
        <div style={{ color: "#86868b", fontSize: 14 }}>Loading DashWise...</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const latest   = uploads[0];
  const metrics  = latest?.metrics as Record<string,unknown> | undefined;
  const hasData  = uploads.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7" }}>
      <Nav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px" }}>

        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: "#1d1d1f", marginBottom: 4 }}>
            Good day, {profile.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p style={{ fontSize: 14, color: "#86868b" }}>
            {profile.bizName} · {profile.bizType}
            {hasData && ` · ${uploads.length} upload${uploads.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Empty state */}
        {!dataLoading && !hasData && (
          <div style={{ background: "#fff", border: "1px solid #e5e5ea", borderRadius: 20, padding: "56px 40px", textAlign: "center", marginBottom: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", marginBottom: 8 }}>Upload your first data file</h2>
            <p style={{ fontSize: 14, color: "#86868b", marginBottom: 24, maxWidth: 380, margin: "0 auto 24px" }}>
              Connect your POS or upload a CSV, Excel, or PDF to start getting AI insights.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Link href="/files" style={{ background: "#0071e3", color: "#fff", fontWeight: 600, fontSize: 14, padding: "11px 26px", borderRadius: 980, textDecoration: "none" }}>Upload Files →</Link>
              <Link href="/integrations" style={{ background: "#f5f5f7", color: "#1d1d1f", fontWeight: 600, fontSize: 14, padding: "11px 26px", borderRadius: 980, textDecoration: "none", border: "1px solid #e5e5ea" }}>Connect POS</Link>
            </div>
          </div>
        )}

        {/* Advisor prompt */}
        {hasData && (
          <Link href={`/advisor?q=${encodeURIComponent(question)}`} style={{
            display: "block", textDecoration: "none",
            background: "linear-gradient(135deg, #0071e3 0%, #0058b8 100%)",
            borderRadius: 18, padding: "20px 24px", marginBottom: 20,
            boxShadow: "0 4px 16px rgba(0,113,227,0.25)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>💬 Your Advisor is asking</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", marginBottom: 6 }}>{question}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Tap to answer and get a recommendation →</div>
          </Link>
        )}

        {/* KPI cards */}
        {hasData && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "#86868b", marginBottom: 10 }}>
              Latest — {latest?.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
              <KPICard label="Revenue"  value={metrics?.revenue ? `$${Number(metrics.revenue).toLocaleString()}` : "—"} sub="latest period" color="#34c759"/>
              <KPICard label="Uploads"  value={String(uploads.length)} sub="total analyses" color="#0071e3"/>
              <KPICard label="Plan"     value={profile.subscription || "Free"} sub="current plan" color="#ff9f0a"/>
              <KPICard label="Goals"    value={String(profile.goals?.length || 0)} sub="active goals" color="#af52de"/>
            </div>
          </>
        )}

        {/* Recent + Goals */}
        {hasData && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "#fff", border: "1px solid #e5e5ea", borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: "#1d1d1f" }}>Recent Uploads</span>
                <Link href="/history" style={{ fontSize: 12, color: "#0071e3", textDecoration: "none" }}>View all →</Link>
              </div>
              {uploads.slice(0,5).map((u,i) => (
                <div key={u.id||i} style={{ padding: "12px 20px", borderBottom: "1px solid #f5f5f7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1d1d1f" }}>{u.label||u.source}</div>
                    <div style={{ fontSize: 11, color: "#86868b", marginTop: 2 }}>{u.dataType} · {u.period}</div>
                  </div>
                  <span style={{ fontSize: 11, background: "#f0faf4", color: "#34c759", border: "1px solid #c8f0d8", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>{u.quality||"analyzed"}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e5ea", borderRadius: 18, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1d1d1f", marginBottom: 14 }}>Your Goals</div>
              {profile.goals?.length ? profile.goals.map((g,i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0071e3", flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, color: "#515154" }}>{g}</span>
                </div>
              )) : <p style={{ fontSize: 13, color: "#86868b" }}>No goals set.</p>}
              <Link href="/settings" style={{ display: "block", marginTop: 14, fontSize: 12, color: "#0071e3", textDecoration: "none" }}>Edit goals →</Link>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { href:"/files", icon:"📁", title:"Upload Files", desc:"Add CSV, Excel, PDF to a folder" },
            { href:"/advisor", icon:"💬", title:"Ask Advisor", desc:"Chat about your business data" },
            { href:"/integrations", icon:"🔗", title:"Connect POS", desc:"Shopify, Clover, Square and more" },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{ background: "#fff", border: "1px solid #e5e5ea", borderRadius: 16, padding: 18, textDecoration: "none", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "box-shadow 0.2s" }}>
              <div style={{ fontSize: 28 }}>{item.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1d1d1f", marginBottom: 3 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#86868b" }}>{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {profile.subscription === "free" && uploads.length >= 3 && (
          <div style={{ marginTop: 20, background: "#e8f0fe", border: "1px solid #d1e4ff", borderRadius: 14, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#0071e3", marginBottom: 3 }}>{uploads.length} of 5 free analyses used</div>
              <div style={{ fontSize: 13, color: "#515154" }}>Upgrade to Pro for unlimited analyses.</div>
            </div>
            <Link href="/settings" style={{ background: "#0071e3", color: "#fff", fontWeight: 600, fontSize: 13, padding: "9px 18px", borderRadius: 980, textDecoration: "none", flexShrink: 0, marginLeft: 16 }}>Upgrade →</Link>
          </div>
        )}
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
