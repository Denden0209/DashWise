"use client";
// Full visual dashboard — opened in a NEW WINDOW from the Files page.
// Reads analysis from sessionStorage (written by Files page before window.open).

import { useEffect, useState } from "react";

const C = {
  bg:"#f5f5f7", surface:"#ffffff", border:"#e5e5ea", blue:"#0071e3",
  blueBg:"#e8f0fe", text:"#1d1d1f", text2:"#515154", text3:"#86868b",
  green:"#34c759", red:"#ff3b30", amber:"#ff9f0a",
};
const shadowSm = "0 1px 4px rgba(0,0,0,0.08)";

type KPI   = { label:string; value:string; trend:"up"|"down"|"neutral"; color:string };
type Point = { label:string; value:number; color?:string };
type Chart = { type:"bar"|"line"|"pie"|"donut"; title:string; data:Point[] };
type DashboardData = { summary:string; kpis:KPI[]; insights:string[]; warnings:string[]; actions:string[]; charts:Chart[] };
type Payload = { dashboardData:DashboardData; narrative:string; bizName:string; mode:string; analyzedAt?:string };

const fmtVal = (v:number) =>
  Math.abs(v) >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M`
  : Math.abs(v) >= 1_000   ? `${(v/1_000).toFixed(0)}K`
  : v % 1 === 0 ? v.toLocaleString() : v.toFixed(1);

function BarChart({ chart }: { chart: Chart }) {
  const max = Math.max(...chart.data.map(d => d.value), 1);
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:20, boxShadow:shadowSm }}>
      <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:16 }}>{chart.title}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
        {chart.data.slice(0,10).map((d,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div title={d.label} style={{ fontSize:12, color:C.text2, width:110, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.label}</div>
            <div style={{ flex:1, background:C.bg, borderRadius:5, height:22, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.max((d.value/max)*100, 2)}%`, background:d.color||C.blue, borderRadius:5, transition:"width .6s ease" }}/>
            </div>
            <div style={{ fontSize:12, fontWeight:600, color:C.text, width:64, textAlign:"right", flexShrink:0 }}>{fmtVal(d.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieChart({ chart }: { chart: Chart }) {
  const total = chart.data.reduce((s,d) => s + Math.max(d.value,0), 0);
  if (total <= 0) return null;
  const isDonut = chart.type === "donut";
  const size = 170, cx = size/2, cy = size/2, r = 72, innerR = isDonut ? 40 : 0;
  const palette = [C.blue, C.green, C.amber, "#af52de", "#ff3b30", "#5ac8fa", "#ff6b81", "#86868b"];

  let angle = -Math.PI/2;
  const slices = chart.data.slice(0,8).map((d,i) => {
    const pct = Math.max(d.value,0)/total;
    const start = angle;
    angle += pct * 2 * Math.PI;
    return { ...d, color: d.color || palette[i % palette.length], pct, a0:start, a1:angle };
  });

  function arc(a0:number, a1:number) {
    // Handle full circle (single slice)
    if (a1 - a0 >= 2*Math.PI - 0.001) a1 = a0 + 2*Math.PI - 0.001;
    const x1=cx+r*Math.cos(a0), y1=cy+r*Math.sin(a0);
    const x2=cx+r*Math.cos(a1), y2=cy+r*Math.sin(a1);
    const large = a1-a0 > Math.PI ? 1 : 0;
    if (innerR === 0) return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    const x3=cx+innerR*Math.cos(a1), y3=cy+innerR*Math.sin(a1);
    const x4=cx+innerR*Math.cos(a0), y4=cy+innerR*Math.sin(a0);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4} Z`;
  }

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:20, boxShadow:shadowSm }}>
      <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:16 }}>{chart.title}</div>
      <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
        <svg width={size} height={size} style={{ flexShrink:0 }}>
          {slices.map((s,i) => <path key={i} d={arc(s.a0,s.a1)} fill={s.color} stroke="#fff" strokeWidth={1.5}/>)}
          {isDonut && (
            <text x={cx} y={cy+4} textAnchor="middle" style={{ fontSize:13, fontWeight:700, fill:C.text }}>{fmtVal(total)}</text>
          )}
        </svg>
        <div style={{ display:"flex", flexDirection:"column", gap:6, flex:1, minWidth:140 }}>
          {slices.map((s,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:3, background:s.color, flexShrink:0 }}/>
              <span style={{ fontSize:12, color:C.text2, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.label}</span>
              <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{(s.pct*100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LineChart({ chart }: { chart: Chart }) {
  if (chart.data.length < 2) return <BarChart chart={chart}/>;
  const vals = chart.data.map(d => d.value);
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  const W = 420, H = 170, pad = 32;
  const color = chart.data[0]?.color || C.blue;

  const pts = chart.data.map((d,i) => ({
    x: pad + (i/(chart.data.length-1)) * (W - pad*2),
    y: H - pad - ((d.value - min)/range) * (H - pad*2),
    ...d,
  }));
  const poly = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = `M ${pts[0].x} ${H-pad} ` + pts.map(p=>`L ${p.x} ${p.y}`).join(" ") + ` L ${pts[pts.length-1].x} ${H-pad} Z`;

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:20, boxShadow:shadowSm }}>
      <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:14 }}>{chart.title}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {[0,0.5,1].map((t,i) => <line key={i} x1={pad} y1={pad+t*(H-pad*2)} x2={W-pad} y2={pad+t*(H-pad*2)} stroke={C.border} strokeWidth={1}/>)}
        <path d={area} fill={color} fillOpacity={0.08}/>
        <polyline points={poly} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
        {pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5}><title>{p.label}: {p.value}</title></circle>)}
        {pts.filter((_,i) => pts.length <= 10 || i % Math.ceil(pts.length/10) === 0).map((p,i) => (
          <text key={i} x={p.x} y={H-8} textAnchor="middle" style={{ fontSize:9, fill:C.text3 }}>
            {p.label.length > 8 ? p.label.slice(0,8) : p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line,i) => {
    if (!line.trim()) return <div key={i} style={{ height:8 }}/>;
    if (line.startsWith("**") && line.endsWith("**"))
      return <div key={i} style={{ fontWeight:700, fontSize:15, color:C.text, marginTop:18, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>{line.replace(/\*\*/g,"")}</div>;
    if (line.match(/\*\*(.*?)\*\*/))
      return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:3 }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong style='color:#1d1d1f'>$1</strong>") }}/>;
    if (line.startsWith("- ") || line.startsWith("• "))
      return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:3, paddingLeft:14 }}>• {line.slice(2)}</div>;
    return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.7, marginBottom:3 }}>{line}</div>;
  });
}

export default function DashboardViewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [tab,  setTab]  = useState<"visual"|"narrative">("visual");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dashwise-analysis");
      if (raw) setData(JSON.parse(raw));
    } catch {}
  }, []);

  if (!data) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📊</div>
        <h2 style={{ fontSize:18, fontWeight:600, color:C.text, marginBottom:8 }}>No analysis loaded</h2>
        <p style={{ fontSize:14, color:C.text3, marginBottom:20 }}>Run an analysis from the Files page first.</p>
        <button onClick={()=>window.close()} style={{ background:C.blue, color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, fontSize:14, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>Close window</button>
      </div>
    </div>
  );

  const dd = data.dashboardData || { summary:"", kpis:[], insights:[], warnings:[], actions:[], charts:[] };
  const trendIcon  = (t:string) => t==="up" ? "↑" : t==="down" ? "↓" : "→";
  const trendColor = (t:string) => t==="up" ? C.green : t==="down" ? C.red : C.text3;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Sticky header */}
      <div style={{ background:"rgba(255,255,255,0.9)", backdropFilter:"saturate(180%) blur(20px)", WebkitBackdropFilter:"saturate(180%) blur(20px)", borderBottom:`1px solid ${C.border}`, padding:"12px 24px", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:10, color:C.text3, textTransform:"uppercase", letterSpacing:"0.7px", fontWeight:600, marginBottom:2 }}>
              DashWise Analysis{data.analyzedAt ? ` · ${new Date(data.analyzedAt).toLocaleDateString()}` : ""}
            </div>
            <h1 style={{ fontSize:19, fontWeight:700, color:C.text, letterSpacing:"-0.3px" }}>{data.bizName || "Business Dashboard"}</h1>
          </div>
          <div style={{ display:"flex", background:C.bg, borderRadius:10, padding:3, border:`1px solid ${C.border}` }}>
            {(["visual","narrative"] as const).map(t => (
              <button key={t} onClick={()=>setTab(t)} style={{
                padding:"7px 16px", borderRadius:8, fontSize:13, fontWeight:tab===t?600:400, fontFamily:"inherit",
                background:tab===t?C.surface:"transparent", color:tab===t?C.text:C.text3,
                border:"none", cursor:"pointer", boxShadow:tab===t?shadowSm:"none",
              }}>
                {t==="visual" ? "📊 Dashboard" : "📝 Full Report"}
              </button>
            ))}
          </div>
          <button onClick={()=>window.close()} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.text3, fontSize:13, padding:"7px 14px", borderRadius:10, cursor:"pointer", fontFamily:"inherit" }}>✕ Close</button>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 20px" }}>

        {dd.summary && (
          <div style={{ background:`linear-gradient(135deg, ${C.blue} 0%, #0058b8 100%)`, borderRadius:20, padding:"20px 24px", marginBottom:22, boxShadow:"0 6px 20px rgba(0,113,227,0.25)" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:8 }}>Executive Summary</div>
            <p style={{ fontSize:15, color:"#fff", lineHeight:1.6 }}>{dd.summary}</p>
          </div>
        )}

        {tab === "visual" && (
          <>
            {dd.kpis?.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:`repeat(auto-fit, minmax(190px, 1fr))`, gap:14, marginBottom:22 }}>
                {dd.kpis.map((kpi,i) => (
                  <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:"18px 20px", boxShadow:shadowSm }}>
                    <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", color:C.text3, marginBottom:10 }}>{kpi.label}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                      <div style={{ fontSize:24, fontWeight:700, letterSpacing:"-0.5px", color:kpi.color||C.text }}>{kpi.value}</div>
                      <div style={{ fontSize:15, fontWeight:700, color:trendColor(kpi.trend) }}>{trendIcon(kpi.trend)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dd.charts?.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(380px, 1fr))", gap:16, marginBottom:22 }}>
                {dd.charts.map((chart,i) => {
                  if (chart.type === "bar")   return <BarChart  key={i} chart={chart}/>;
                  if (chart.type === "line")  return <LineChart key={i} chart={chart}/>;
                  return <PieChart key={i} chart={chart}/>;
                })}
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:14 }}>
              {dd.insights?.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:20, boxShadow:shadowSm }}>
                  <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:14 }}>💡 Key Insights</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {dd.insights.map((ins,i) => (
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:C.blue, flexShrink:0, marginTop:6 }}/>
                        <span style={{ fontSize:13, color:C.text2, lineHeight:1.5 }}>{ins}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dd.warnings?.length > 0 && (
                <div style={{ background:"#fff8e8", border:"1px solid #ffe4a0", borderRadius:18, padding:20, boxShadow:shadowSm }}>
                  <div style={{ fontWeight:600, fontSize:14, color:"#996600", marginBottom:14 }}>⚠️ Warnings</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {dd.warnings.map((w,i) => (
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:C.amber, flexShrink:0, marginTop:6 }}/>
                        <span style={{ fontSize:13, color:"#664400", lineHeight:1.5 }}>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dd.actions?.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:20, boxShadow:shadowSm }}>
                  <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:14 }}>⚡ Action Items</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {dd.actions.map((a,i) => (
                      <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:C.blue, background:C.blueBg, borderRadius:20, width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                        <span style={{ fontSize:13, color:C.text2, lineHeight:1.5 }}>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "narrative" && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:"28px 32px", boxShadow:shadowSm }}>
            <div style={{ fontWeight:700, fontSize:17, color:C.text, marginBottom:18, letterSpacing:"-0.3px" }}>Full Analysis Report</div>
            {renderMarkdown(data.narrative || "No narrative available.")}
          </div>
        )}
      </div>
    </div>
  );
}
