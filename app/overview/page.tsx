"use client";
// /overview — Account-level view of ALL folders/businesses.
// Portfolio cards + cross-business AI insight.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserFolders, getFolderFullAnalysis, BusinessFolder } from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

type FolderCard = BusinessFolder & {
  kpis:        { label:string; value:string; trend:string; color:string }[];
  warnings:    string[];
  summary:     string;
  analyzedAt?: string;
};

const PORTFOLIO_QUESTIONS = [
  "What's my strongest business right now?",
  "Which business needs the most attention?",
  "Compare performance across all my businesses",
  "What's my total financial exposure across everything?",
];

function Spinner({ size=18, color=C.blue }: { size?:number; color?:string }) {
  return <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>;
}

export default function OverviewPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [cards,            setCards]            = useState<FolderCard[]>([]);
  const [dataLoading,      setDataLoading]      = useState(true);
  const [insight,          setInsight]          = useState<string|null>(null);
  const [insightLoading,   setInsightLoading]   = useState(false);
  const [insightError,     setInsightError]     = useState("");

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const folders = await getUserFolders(user.uid);
      const loaded: FolderCard[] = await Promise.all(folders.map(async f => {
        const full = await getFolderFullAnalysis(user.uid, f.id!).catch(() => null);
        const dd   = (full?.dashboardData || {}) as { kpis?:FolderCard["kpis"]; warnings?:string[]; summary?:string };
        return {
          ...f,
          kpis:       (dd.kpis || []).slice(0, 3),
          warnings:   dd.warnings || [],
          summary:    dd.summary || f.lastAnalysisSummary || "",
          analyzedAt: full?.analyzedAt,
        };
      }));
      setCards(loaded);
      setDataLoading(false);
    })();
  }, [user]);

  async function getPortfolioInsight(question?: string) {
    if (!user || insightLoading) return;
    setInsightLoading(true); setInsightError(""); setInsight(null);
    try {
      const res = await fetch("/api/portfolio", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question || "Give me a complete portfolio-level overview of all my businesses.",
          ownerName: profile?.name || "the owner",
          folders: cards.map(c => ({
            name:       c.bizName,
            bizType:    c.bizType || "",
            fileCount:  c.fileCount,
            summary:    c.summary,
            kpis:       c.kpis,
            warnings:   c.warnings,
            analyzedAt: c.analyzedAt || null,
          })),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?:string }).error || `Server error (${res.status})`);
      }
      const data = await res.json() as { success:boolean; insight?:string; error?:string };
      if (!data.success) throw new Error(data.error || "Failed");
      setInsight(data.insight || "");
    } catch (err: unknown) {
      setInsightError(err instanceof Error ? err.message : "Failed to generate insight.");
    } finally { setInsightLoading(false); }
  }

  function renderText(text: string) {
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height:7 }}/>;
      if (line.startsWith("**") && line.endsWith("**"))
        return <div key={i} style={{ fontWeight:700, fontSize:14, color:C.text, marginTop:14, marginBottom:5 }}>{line.replace(/\*\*/g,"")}</div>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:3 }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong style='color:#1d1d1f'>$1</strong>") }}/>;
      if (line.startsWith("- ") || line.startsWith("• "))
        return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:3, paddingLeft:12 }}>• {line.slice(2)}</div>;
      return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:3 }}>{line}</div>;
    });
  }

  const analyzed   = cards.filter(c => c.analyzedAt).length;
  const withWarn   = cards.filter(c => c.warnings.length > 0).length;
  const totalFiles = cards.reduce((s,c) => s + c.fileCount, 0);

  if (loading || dataLoading) return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:80 }}>
        <Spinner size={30}/>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:5 }}>Account Overview</h1>
          <p style={{ fontSize:14, color:C.text3 }}>Your complete portfolio across every business and folder</p>
        </div>

        {/* Summary bar */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:12, marginBottom:24 }}>
          {[
            { label:"Businesses",      value:String(cards.length),  color:C.blue   },
            { label:"Total files",     value:String(totalFiles),    color:C.text   },
            { label:"Analyzed",        value:`${analyzed}/${cards.length}`, color:"#34c759" },
            { label:"With warnings",   value:String(withWarn),      color: withWarn>0 ? "#ff9f0a" : C.text3 },
          ].map(s => (
            <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"16px 18px", boxShadow:shadow.sm }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.7px", color:C.text3, marginBottom:8 }}>{s.label}</div>
              <div style={{ fontSize:24, fontWeight:700, letterSpacing:"-0.5px", color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {cards.length === 0 && (
          <div style={{ background:C.surface, border:`1px dashed ${C.border2}`, borderRadius:radius.xl, padding:"56px 40px", textAlign:"center", boxShadow:shadow.sm, marginBottom:24 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🗂️</div>
            <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>No businesses yet</h2>
            <p style={{ fontSize:14, color:C.text3, marginBottom:24 }}>Create folders for each business and upload data to see your portfolio here.</p>
            <Link href="/files" style={{ ...btnPrimary }}>Go to Files →</Link>
          </div>
        )}

        {/* Business cards */}
        {cards.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16, marginBottom:28 }}>
            {cards.map(card => {
              const health = !card.analyzedAt ? "neutral" : card.warnings.length > 0 ? "warn" : "good";
              const healthMeta = {
                good:    { label:"✓ Healthy",       bg:"#f0faf4", color:"#34c759", border:"#c8f0d8" },
                warn:    { label:`⚠ ${card.warnings.length} warning${card.warnings.length!==1?"s":""}`, bg:"#fff8e8", color:"#996600", border:"#ffe4a0" },
                neutral: { label:"Not analyzed",    bg:C.bg,      color:C.text3,   border:C.border },
              }[health];

              return (
                <div key={card.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:20, boxShadow:shadow.sm, display:"flex", flexDirection:"column" }}>
                  {/* Card header */}
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:12 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:16, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📁 {card.bizName}</div>
                      <div style={{ fontSize:12, color:C.text3, marginTop:2 }}>
                        {card.fileCount} file{card.fileCount!==1?"s":""}
                        {card.analyzedAt && ` · analyzed ${new Date(card.analyzedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, flexShrink:0, background:healthMeta.bg, color:healthMeta.color, border:`1px solid ${healthMeta.border}` }}>
                      {healthMeta.label}
                    </span>
                  </div>

                  {/* KPI strip */}
                  {card.kpis.length > 0 ? (
                    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" as const }}>
                      {card.kpis.map((k,i) => (
                        <div key={i} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"8px 12px", flex:1, minWidth:84 }}>
                          <div style={{ fontSize:10, color:C.text3, textTransform:"uppercase" as const, letterSpacing:"0.5px", fontWeight:600, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{k.label}</div>
                          <div style={{ fontSize:15, fontWeight:700, color:k.color||C.text }}>{k.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize:13, color:C.text3, marginBottom:12, fontStyle:"italic" }}>
                      Run an analysis to see metrics here.
                    </div>
                  )}

                  {/* Summary */}
                  {card.summary && (
                    <p style={{ fontSize:12, color:C.text2, lineHeight:1.5, marginBottom:14, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>
                      {card.summary}
                    </p>
                  )}

                  {/* Card footer */}
                  <div style={{ marginTop:"auto", display:"flex", gap:8 }}>
                    <Link href="/files" style={{ flex:1, textAlign:"center" as const, fontSize:12, fontWeight:600, color:C.blue, background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.sm, padding:"8px" }}>
                      Open folder →
                    </Link>
                    <Link href={`/advisor?q=${encodeURIComponent(`Tell me about my ${card.bizName} business`)}`} style={{ flex:1, textAlign:"center" as const, fontSize:12, fontWeight:600, color:C.text2, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"8px" }}>
                      Ask advisor
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Portfolio AI insight */}
        {cards.length > 0 && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.xl, overflow:"hidden", boxShadow:shadow.sm }}>
            <div style={{ background:`linear-gradient(135deg, ${C.blue} 0%, #0058b8 100%)`, padding:"18px 24px" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", marginBottom:5 }}>🧠 Portfolio Intelligence</div>
              <div style={{ fontSize:16, fontWeight:600, color:"#fff" }}>Cross-business analysis powered by AI</div>
            </div>

            <div style={{ padding:"20px 24px" }}>
              {insightError && (
                <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"10px 14px", borderRadius:radius.sm, marginBottom:16 }}>
                  ⚠ {insightError}
                </div>
              )}

              {!insight && !insightLoading && (
                <>
                  <p style={{ fontSize:13, color:C.text2, marginBottom:14, lineHeight:1.6 }}>
                    Ask about your entire portfolio — the AI reads every business&apos;s analysis and answers at the account level.
                  </p>
                  <div style={{ display:"flex", flexWrap:"wrap" as const, gap:8, marginBottom:16 }}>
                    {PORTFOLIO_QUESTIONS.map(q => (
                      <button key={q} onClick={()=>getPortfolioInsight(q)} style={{ fontSize:12, background:C.bg, border:`1px solid ${C.border}`, borderRadius:20, padding:"7px 14px", color:C.text2, cursor:"pointer" }}>
                        {q}
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>getPortfolioInsight()} style={{ ...btnPrimary, padding:"12px 24px", borderRadius:radius.sm, fontSize:14 }}>
                    ✨ Generate full portfolio overview
                  </button>
                </>
              )}

              {insightLoading && (
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"16px 0" }}>
                  <Spinner/>
                  <span style={{ fontSize:13, color:C.text3 }}>Analyzing {cards.length} business{cards.length!==1?"es":""} together...</span>
                </div>
              )}

              {insight && (
                <>
                  <div style={{ marginBottom:16 }}>{renderText(insight)}</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                    <button onClick={()=>setInsight(null)} style={{ fontSize:13, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 16px", color:C.text2, cursor:"pointer" }}>
                      ← Ask another question
                    </button>
                    <Link href="/advisor" style={{ fontSize:13, fontWeight:600, color:C.blue, background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.sm, padding:"9px 16px", textDecoration:"none" }}>
                      Continue in Advisor →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
