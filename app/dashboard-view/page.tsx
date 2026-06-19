"use client";
// Interactive dashboard — opened in a NEW WINDOW from the Files page.
// Four tabs:
//   📊 Explore    — dynamic: filter sidebar, time intelligence, YoY, Agent (needs a data cube)
//   🤖 AI Report  — Claude's static analysis (kpis/charts JSON)
//   📝 Narrative  — full markdown report
//   🛠️ Developer  — schema model + build guidance (star/snowflake, slicing, cleaning, questions)
// The Explore tab computes EVERY number locally from the cube — nothing is AI-generated.

import { useEffect, useMemo, useState, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getFileCube, getFileSchema, saveDashboardConfig, getDashboardConfig } from "@/lib/db";
import {
  DataCube, Filters, DateWindow, Grain, MeasureSpec, Agg,
  filterRows, computeMeasure, seriesByGrain, byDimension,
  yoyOverlay, periodComparison, timeCapabilities, presetWindow,
  formatMeasureValue, inferAgg, specForMeasure,
} from "@/lib/dataCube";
import type { SchemaModel, TableInfo, ColumnInfo } from "@/lib/schemaProfiler";
import { schemaToText } from "@/lib/schemaProfiler";

const C = {
  bg:"#f5f5f7", surface:"#ffffff", border:"#e5e5ea", blue:"#0071e3",
  blueBg:"#e8f0fe", text:"#1d1d1f", text2:"#515154", text3:"#86868b",
  green:"#34c759", red:"#ff3b30", amber:"#ff9f0a", purple:"#af52de",
  purpleBg:"#f3e8fd",
};
const shadowSm = "0 1px 4px rgba(0,0,0,0.08)";
const PALETTE = [C.blue, C.green, C.amber, C.purple, "#ff6b81", "#5ac8fa", "#ff9f0a", "#86868b"];
const YEAR_COLORS = ["#c7c7cc", "#5ac8fa", C.blue];

// ── Static-report types (Claude JSON) ─────────────────────
type SKPI   = { label:string; value:string; trend:"up"|"down"|"neutral"; color:string };
type SPoint = { label:string; value:number; color?:string };
type SChart = { type:"bar"|"line"|"pie"|"donut"; title:string; data:SPoint[] };
type DashboardData = { summary:string; kpis:SKPI[]; insights:string[]; warnings:string[]; actions:string[]; charts:SChart[] };
type Payload = {
  dashboardData:DashboardData; narrative:string; bizName:string; mode:string;
  analyzedAt?:string; folderId?:string;
  cubeFiles?: { id:string; name:string }[];
  schemaFiles?: { id:string; name:string }[];
};

// ── Agent view spec (validated server-side) ────────────────
type AgentChart = { type:"bar"|"line"|"donut"; title:string; dimension:string; measure:MeasureSpec; topN:number };
type AgentKpi   = { label:string; measure:MeasureSpec };
type AgentSpec  = {
  filters: Filters; grain: Grain; yoy: boolean;
  dateWindow?: DateWindow; kpis: AgentKpi[]; charts: AgentChart[]; note: string;
};

// ── Per-file dashboard customizations (persisted to Firestore) ──
type SavedView = {
  measure: string; agg: Agg; grain: Grain; primaryDim?: string;
  preset: "all"|"ytd"|"l12m"|"lastyear"|"custom";
  customFrom?: string; customTo?: string; yoy?: boolean;
  fromAgent?: boolean;   // true if this view was authored by the agent (locks layout on restore)
  filters: Filters; kpis: AgentKpi[]; charts: AgentChart[]; note: string;
};
type DashConfig = {
  setupDone?: boolean;
  title?: string;
  notes?: string;
  kpiLabels?: Record<number, string>;
  chartTitles?: Record<number, string>;
  view?: SavedView;
};

const fmtCompact = (v:number) =>
  Math.abs(v) >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M`
  : Math.abs(v) >= 10_000  ? `${(v/1_000).toFixed(0)}K`
  : v % 1 === 0 ? v.toLocaleString() : v.toFixed(1);

function Spinner({ size=18, color=C.blue }: { size?:number; color?:string }) {
  return <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>;
}

// ═══════════════ SVG CHART PRIMITIVES ═══════════════
function HBarChart({ title, data, money }: { title:string; data:{label:string; value:number}[]; money?:(v:number)=>string }) {
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const fmt = money || fmtCompact;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:18, boxShadow:shadowSm }}>
      <div style={{ fontWeight:600, fontSize:13, color:C.text, marginBottom:14 }}>{title}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {data.map((d,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div title={d.label} style={{ fontSize:11.5, color:C.text2, width:104, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.label}</div>
            <div style={{ flex:1, background:C.bg, borderRadius:4, height:19, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.max((Math.abs(d.value)/max)*100, 1.5)}%`, background: d.value < 0 ? C.red : PALETTE[i % PALETTE.length], borderRadius:4, transition:"width .4s ease" }}/>
            </div>
            <div style={{ fontSize:11.5, fontWeight:600, color:d.value<0?C.red:C.text, width:62, textAlign:"right", flexShrink:0 }}>{fmt(d.value)}</div>
          </div>
        ))}
        {data.length === 0 && <div style={{ fontSize:12, color:C.text3, padding:"8px 0" }}>No data for current filters.</div>}
      </div>
    </div>
  );
}

function TrendChart({ title, series, money, overlay }: {
  title:string;
  series:{label:string; value:number}[];
  money?:(v:number)=>string;
  overlay?: { years:string[]; points:{ label:string; values:Record<string, number|null> }[] } | null;
}) {
  const fmt = money || fmtCompact;
  const W = 560, H = 200, padL = 44, padR = 12, padT = 14, padB = 28;

  let lines: { name:string; color:string; pts:(number|null)[] }[] = [];
  let labels: string[] = [];
  if (overlay && overlay.years.length >= 2) {
    labels = overlay.points.map(p => p.label);
    lines = overlay.years.map((y, i) => ({
      name: y,
      color: YEAR_COLORS[Math.max(0, YEAR_COLORS.length - overlay.years.length + i)] || PALETTE[i],
      pts: overlay.points.map(p => p.values[y]),
    }));
  } else {
    labels = series.map(s => s.label);
    lines = [{ name:"", color:C.blue, pts: series.map(s => s.value) }];
  }

  const all = lines.flatMap(l => l.pts).filter((v): v is number => v !== null);
  if (all.length === 0) return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:18, boxShadow:shadowSm }}>
      <div style={{ fontWeight:600, fontSize:13, color:C.text, marginBottom:8 }}>{title}</div>
      <div style={{ fontSize:12, color:C.text3 }}>No data for current filters.</div>
    </div>
  );
  const max = Math.max(...all), min = Math.min(...all, 0);
  const range = max - min || 1;
  const n = labels.length;
  const X = (i:number) => padL + (n <= 1 ? (W-padL-padR)/2 : (i/(n-1)) * (W-padL-padR));
  const Y = (v:number) => H - padB - ((v - min)/range) * (H-padT-padB);

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:18, boxShadow:shadowSm }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8, flexWrap:"wrap" }}>
        <div style={{ fontWeight:600, fontSize:13, color:C.text }}>{title}</div>
        {lines.length > 1 && (
          <div style={{ display:"flex", gap:10 }}>
            {lines.map(l => (
              <span key={l.name} style={{ fontSize:10.5, color:C.text2, display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ width:10, height:3, borderRadius:2, background:l.color, display:"inline-block" }}/>{l.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.5, 1].map((t,i) => {
          const y = padT + t*(H-padT-padB);
          const v = max - t*range;
          return <g key={i}>
            <line x1={padL} y1={y} x2={W-padR} y2={y} stroke={C.border} strokeWidth={1}/>
            <text x={padL-4} y={y+3} textAnchor="end" style={{ fontSize:8.5, fill:C.text3 }}>{fmt(v)}</text>
          </g>;
        })}
        {lines.map((l, li) => {
          const segs: string[] = [];
          let cur: string[] = [];
          l.pts.forEach((v, i) => {
            if (v === null) { if (cur.length) { segs.push(cur.join(" ")); cur = []; } return; }
            cur.push(`${X(i)},${Y(v)}`);
          });
          if (cur.length) segs.push(cur.join(" "));
          return <g key={li}>
            {segs.map((s, si) => <polyline key={si} points={s} fill="none" stroke={l.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"/>)}
            {l.pts.map((v, i) => v === null ? null : (
              <circle key={i} cx={X(i)} cy={Y(v)} r={2.6} fill={l.color} stroke="#fff" strokeWidth={1.2}>
                <title>{labels[i]}{l.name ? ` (${l.name})` : ""}: {fmt(v)}</title>
              </circle>
            ))}
          </g>;
        })}
        {labels.filter((_,i) => n <= 13 || i % Math.ceil(n/13) === 0).map((lb, i, arr) => {
          const realIdx = labels.indexOf(lb, i === 0 ? 0 : labels.indexOf(arr[i-1])+1);
          return <text key={i} x={X(realIdx)} y={H-8} textAnchor="middle" style={{ fontSize:8, fill:C.text3 }}>
            {lb.length > 9 ? lb.slice(0,9) : lb}
          </text>;
        })}
      </svg>
    </div>
  );
}

function DonutChart({ title, data, money }: { title:string; data:{label:string; value:number}[]; money?:(v:number)=>string }) {
  const pos = data.filter(d => d.value > 0);
  const total = pos.reduce((s,d) => s + d.value, 0);
  const fmt = money || fmtCompact;
  if (total <= 0) return null;
  const size=150, cx=size/2, cy=size/2, r=62, innerR=36;
  let angle = -Math.PI/2;
  const slices = pos.slice(0,8).map((d,i) => {
    const pct = d.value/total;
    const a0 = angle; angle += pct*2*Math.PI;
    return { ...d, color:PALETTE[i % PALETTE.length], pct, a0, a1:angle };
  });
  function arc(a0:number, a1:number) {
    if (a1-a0 >= 2*Math.PI-0.001) a1 = a0 + 2*Math.PI - 0.001;
    const x1=cx+r*Math.cos(a0), y1=cy+r*Math.sin(a0), x2=cx+r*Math.cos(a1), y2=cy+r*Math.sin(a1);
    const x3=cx+innerR*Math.cos(a1), y3=cy+innerR*Math.sin(a1), x4=cx+innerR*Math.cos(a0), y4=cy+innerR*Math.sin(a0);
    const lg = a1-a0 > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${lg} 0 ${x4} ${y4} Z`;
  }
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:18, boxShadow:shadowSm }}>
      <div style={{ fontWeight:600, fontSize:13, color:C.text, marginBottom:12 }}>{title}</div>
      <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
        <svg width={size} height={size} style={{ flexShrink:0 }}>
          {slices.map((s,i) => <path key={i} d={arc(s.a0,s.a1)} fill={s.color} stroke="#fff" strokeWidth={1.5}/>)}
          <text x={cx} y={cy+4} textAnchor="middle" style={{ fontSize:11.5, fontWeight:700, fill:C.text }}>{fmt(total)}</text>
        </svg>
        <div style={{ display:"flex", flexDirection:"column", gap:5, flex:1, minWidth:120 }}>
          {slices.map((s,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ width:9, height:9, borderRadius:2.5, background:s.color, flexShrink:0 }}/>
              <span style={{ fontSize:11, color:C.text2, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.label}</span>
              <span style={{ fontSize:11, fontWeight:600, color:C.text }}>{(s.pct*100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════ EXPLORE TAB ═══════════════
function ExploreTab({ payload, user }: { payload: Payload; user: User }) {
  const cubeFiles = payload.cubeFiles || [];
  const [fileId, setFileId]     = useState(cubeFiles[0]?.id || "");
  const [cube, setCube]         = useState<DataCube | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState("");

  const [filters, setFilters]   = useState<Filters>({});
  const [preset, setPreset]     = useState<"all"|"ytd"|"l12m"|"lastyear"|"custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [grain, setGrain]       = useState<Grain>("month");
  const [yoyOn, setYoyOn]       = useState(false);
  const [measure, setMeasure]   = useState("");
  const [measureAgg, setMeasureAgg] = useState<Agg>("sum");
  const [primaryDim, setPrimaryDim] = useState("");   // breakdown the user cares about most

  const [agentOpen, setAgentOpen]       = useState(false);
  const [agentQ, setAgentQ]             = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentErr, setAgentErr]         = useState("");
  const [agentView, setAgentView]       = useState<AgentSpec | null>(null);

  // ── Customizations (persisted per file) ──
  const [setupOpen, setSetupOpen] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [title, setTitle]         = useState("");
  const [notes, setNotes]         = useState("");
  const [kpiLabels, setKpiLabels]     = useState<Record<number, string>>({});
  const [chartTitles, setChartTitles] = useState<Record<number, string>>({});
  const [saving, setSaving]       = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  // Pick the field whose name reads most like a headline metric (money first).
  const defaultMeasure = useCallback((cb: DataCube) => cb.moneyMeasures[0] || cb.measures[0] || "", []);

  // Load cube + saved config whenever file changes
  useEffect(() => {
    if (!fileId || !payload.folderId) { setLoading(false); return; }
    const folderId = payload.folderId;
    setLoading(true); setLoadErr(""); setCube(null); setAgentView(null);
    setEditing(false); setSetupOpen(false);
    Promise.all([
      getFileCube<DataCube>(user.uid, folderId, fileId),
      getDashboardConfig<DashConfig>(user.uid, folderId, fileId).catch(() => null),
    ])
      .then(([cb, cfg]) => {
        if (!cb) { setLoadErr("No interactive data found for this file. Re-upload it to enable filtering."); return; }
        setCube(cb);
        const caps = timeCapabilities(cb);
        // Defaults
        setFilters({}); setPreset("all"); setYoyOn(false);
        setGrain(caps.grains.includes("month") ? "month" : caps.grains[0]);
        const dm = defaultMeasure(cb);
        setMeasure(dm); setMeasureAgg(inferAgg(dm));
        setPrimaryDim(cb.dimensions[0]?.name || "");
        // Customizations
        setTitle(cfg?.title || "");
        setNotes(cfg?.notes || "");
        setKpiLabels(cfg?.kpiLabels || {});
        setChartTitles(cfg?.chartTitles || {});
        // Restore a saved starter/custom view if present
        if (cfg?.view) {
          const v = cfg.view;
          if (cb.measures.includes(v.measure)) { setMeasure(v.measure); setMeasureAgg(v.agg || inferAgg(v.measure)); }
          if (v.primaryDim !== undefined) setPrimaryDim(v.primaryDim);
          if (caps.grains.includes(v.grain)) setGrain(v.grain);
          setFilters(v.filters || {});
          setPreset(v.preset || "all");
          if (v.preset === "custom") { setCustomFrom(v.customFrom || ""); setCustomTo(v.customTo || ""); }
          setYoyOn(!!v.yoy && caps.yoy);
          // Only an agent-authored view locks the layout; otherwise just restore the live controls.
          if (v.fromAgent) setAgentView({ filters: v.filters || {}, grain: v.grain, yoy: !!v.yoy, kpis: v.kpis || [], charts: v.charts || [], note: v.note || "Saved view" });
        }
        // First run for this file → guided setup
        if (!cfg?.setupDone) setSetupOpen(true);
      })
      .catch(() => setLoadErr("Failed to load dashboard data. Check your connection and reopen."))
      .finally(() => setLoading(false));
  }, [fileId, payload.folderId, user.uid, defaultMeasure]);

  // Keep the chosen aggregation sensible when the user switches measures by hand.
  const selectMeasure = useCallback((m: string) => { setMeasure(m); setMeasureAgg(inferAgg(m)); }, []);

  const caps = useMemo(() => cube ? timeCapabilities(cube) : null, [cube]);

  const win: DateWindow = useMemo(() => {
    if (!cube) return {};
    if (preset === "custom") return { from: customFrom || undefined, to: customTo || undefined };
    return presetWindow(cube, preset);
  }, [cube, preset, customFrom, customTo]);

  const rows = useMemo(() => cube ? filterRows(cube, filters, win) : [], [cube, filters, win]);

  const spec: MeasureSpec = useMemo(() => measure ? specForMeasure(measure, measureAgg) : { kind:"count" }, [measure, measureAgg]);

  function toggleFilter(dim:string, val:string) {
    setFilters(prev => {
      const cur = new Set(prev[dim] || []);
      if (cur.has(val)) cur.delete(val); else cur.add(val);
      const next = { ...prev };
      if (cur.size === 0) delete next[dim]; else next[dim] = [...cur];
      return next;
    });
  }
  const activeFilterCount = Object.values(filters).reduce((s,v) => s + v.length, 0);

  async function askAgent(q?: string) {
    if (!cube || agentLoading) return;
    const question = (q ?? agentQ).trim();
    if (!question) return;
    setAgentLoading(true); setAgentErr("");
    try {
      const schema = {
        fileName: cube.fileName, dateField: cube.dateField, dateRange: cube.dateRange,
        grains: caps?.grains || ["month"], multiYear: !!caps?.multiYear,
        dimensions: cube.dimensions, measures: cube.measures,
      };
      const res  = await fetch("/api/dashboard-agent", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ question, schema }),
      });
      const data = await res.json() as { success?:boolean; unsupported?:boolean; note?:string; spec?:AgentSpec; error?:string };
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      if (data.unsupported) { setAgentErr(data.note || "This question needs the Advisor chat."); return; }
      if (!data.spec) throw new Error("Agent returned no view.");
      // Apply the spec to the live controls so the sidebar reflects it
      setFilters(data.spec.filters || {});
      if (caps?.grains.includes(data.spec.grain)) setGrain(data.spec.grain);
      setYoyOn(!!data.spec.yoy && !!caps?.yoy);
      if (data.spec.dateWindow?.from || data.spec.dateWindow?.to) {
        setPreset("custom");
        setCustomFrom(data.spec.dateWindow.from || "");
        setCustomTo(data.spec.dateWindow.to || "");
      } else setPreset("all");
      setAgentView(data.spec);
      setAgentOpen(false); setAgentQ("");
    } catch (err) {
      setAgentErr(err instanceof Error ? err.message : "Agent failed. Try again.");
    } finally { setAgentLoading(false); }
  }

  function resetView() {
    setAgentView(null); setFilters({}); setPreset("all"); setYoyOn(false);
    if (cube) { const cp = timeCapabilities(cube); setGrain(cp.grains.includes("month") ? "month" : cp.grains[0]); }
  }

  // ── Persist the current dashboard (called by Save / wizard / agent) ──
  const persistConfig = useCallback(async (patch: Partial<DashConfig>) => {
    if (!cube || !payload.folderId) return;
    setSaving(true);
    try {
      const existing = await getDashboardConfig<DashConfig>(user.uid, payload.folderId, fileId).catch(() => null);
      await saveDashboardConfig(user.uid, payload.folderId, fileId, { ...(existing || {}), ...patch });
      setSavedTick(true); setTimeout(() => setSavedTick(false), 1800);
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  }, [cube, payload.folderId, fileId, user.uid]);

  // Snapshot the live controls into a SavedView the next open can restore.
  function currentViewSnapshot(activeKpis: AgentKpi[], activeCharts: AgentChart[], note: string): SavedView {
    return {
      measure, agg: measureAgg, grain, primaryDim, preset,
      customFrom: preset === "custom" ? customFrom : undefined,
      customTo:   preset === "custom" ? customTo   : undefined,
      yoy: yoyOn, fromAgent: !!agentView, filters, kpis: activeKpis, charts: activeCharts, note,
    };
  }

  // Apply the guided-setup answers to the live dashboard controls.
  function applySetup(opts: { measure: string; agg: Agg; breakdown: string; preset: "all"|"ytd"|"l12m"|"lastyear" }) {
    setAgentView(null);                       // setup drives the live controls, not a locked view
    setMeasure(opts.measure);
    setMeasureAgg(opts.agg);
    setPrimaryDim(opts.breakdown);
    setFilters({});
    setPreset(opts.preset);
    if (caps) setGrain(caps.grains.includes("month") ? "month" : caps.grains[0]);
    setSetupOpen(false);
    persistConfig({ setupDone: true });
  }

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:60 }}><Spinner size={26}/><span style={{ fontSize:13, color:C.text3 }}>Loading interactive data...</span></div>;
  if (loadErr || !cube) return (
    <div style={{ textAlign:"center", padding:"50px 20px" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
      <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Interactive view unavailable</div>
      <div style={{ fontSize:13, color:C.text3, maxWidth:420, margin:"0 auto" }}>{loadErr || "No data cube found."}</div>
    </div>
  );

  // KPI cards: each measure aggregated by its smart default (sum vs avg)
  const aggLabel = (m:string, a:Agg) => a === "avg" ? `Avg ${m}` : m;
  const baseKpis: AgentKpi[] = agentView?.kpis?.length
    ? agentView.kpis
    : cube.measures.slice(0, 4).map(m => {
        const a = inferAgg(m);
        return { label: aggLabel(m, a), measure: specForMeasure(m, a) };
      });
  // Apply user label overrides (edit mode)
  const kpiSpecs: AgentKpi[] = baseKpis.map((k, i) => ({ ...k, label: kpiLabels[i] ?? k.label }));

  // Order dimension charts so the user's chosen breakdown leads.
  const orderedDims = primaryDim && cube.dimensions.some(d => d.name === primaryDim)
    ? [primaryDim, ...cube.dimensions.filter(d => d.name !== primaryDim).map(d => d.name)]
    : cube.dimensions.map(d => d.name);
  const baseCharts: AgentChart[] = agentView?.charts?.length
    ? agentView.charts
    : [
        { type:"line",  title:`${aggLabel(measure, measureAgg)} over time`, dimension:"_date", measure:spec, topN:10 },
        ...orderedDims.slice(0, 2).map((name, i) => ({
          type: (i === 1 ? "donut" : "bar") as AgentChart["type"],
          title:`${aggLabel(measure, measureAgg)} by ${name}`, dimension:name, measure:spec, topN:10,
        })),
      ];
  const chartSpecs: AgentChart[] = baseCharts.map((c, i) => ({ ...c, title: chartTitles[i] ?? c.title }));

  const isPctSpec = (m:MeasureSpec) => m.kind === "marginPct" || (m.kind === "ratio" && !!m.pct);
  const fmtForSpec = (m:MeasureSpec) => (v:number) => {
    if (isPctSpec(m)) return `${v.toFixed(1)}%`;
    if (m.kind === "field" || m.kind === "avg") return formatMeasureValue(v, m.field, cube);
    if (m.kind === "ratio") return v.toFixed(2);
    return fmtCompact(v);
  };

  const dashTitle = title.trim() || `${cube.fileName.replace(/\.[^.]+$/, "")} — Explore`;

  function handleSave() {
    persistConfig({
      setupDone: true, title, notes, kpiLabels, chartTitles,
      view: currentViewSnapshot(baseKpis, baseCharts, agentView?.note || "Saved view"),
    });
    setEditing(false);
  }

  return (
    <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>

      {/* ══ LEFT SIDEBAR ══ */}
      <div style={{ width:226, flexShrink:0, position:"sticky", top:76, display:"flex", flexDirection:"column", gap:12, maxHeight:"calc(100vh - 100px)", overflowY:"auto", paddingRight:2 }}>

        {/* Agent button */}
        <button onClick={()=>{ setAgentOpen(true); setAgentErr(""); }} style={{
          background:`linear-gradient(135deg, ${C.purple} 0%, #7a35b8 100%)`, color:"#fff", border:"none",
          borderRadius:12, padding:"13px 14px", fontSize:13, fontWeight:600, cursor:"pointer",
          boxShadow:"0 4px 14px rgba(175,82,222,0.35)", textAlign:"left",
        }}>
          🤖 Ask the Agent
          <div style={{ fontSize:10.5, fontWeight:400, opacity:.85, marginTop:3 }}>Describe a view — it builds it for you</div>
        </button>

        {agentView && (
          <div style={{ background:C.purpleBg, border:`1px solid #e0c5f5`, borderRadius:10, padding:"10px 12px" }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.purple, marginBottom:4 }}>🤖 Agent view active</div>
            <div style={{ fontSize:11, color:C.text2, lineHeight:1.5, marginBottom:8 }}>{agentView.note}</div>
            <button onClick={resetView} style={{ fontSize:11, fontWeight:600, color:C.purple, background:"#fff", border:`1px solid #e0c5f5`, borderRadius:7, padding:"5px 10px", cursor:"pointer", width:"100%" }}>← Back to default view</button>
          </div>
        )}

        {/* File switcher */}
        {cubeFiles.length > 1 && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 13px", boxShadow:shadowSm }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:8 }}>Data source</div>
            <select value={fileId} onChange={e=>setFileId(e.target.value)} style={{ width:"100%", fontSize:12, padding:"7px 8px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, color:C.text, outline:"none", cursor:"pointer" }}>
              {cubeFiles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <div style={{ fontSize:10, color:C.text3, marginTop:6 }}>Sheet: {cube.sheetName} · {cube.sourceRowCount.toLocaleString()} rows</div>
          </div>
        )}

        {/* Time intelligence */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 13px", boxShadow:shadowSm }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:8 }}>📅 Time period</div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {([["all","All time"],["ytd","Year to date"],["l12m","Last 12 months"],["lastyear","Last year"],["custom","Custom range"]] as const).map(([k, lbl]) => (
              <button key={k} onClick={()=>setPreset(k)} style={{
                textAlign:"left", fontSize:12, padding:"7px 10px", borderRadius:8, cursor:"pointer",
                background: preset===k ? C.blueBg : "transparent",
                border: preset===k ? `1px solid #c0d8f5` : "1px solid transparent",
                color: preset===k ? C.blue : C.text2, fontWeight: preset===k ? 600 : 400,
              }}>{lbl}</button>
            ))}
          </div>
          {preset === "custom" && (
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
              <input type="date" value={customFrom} min={cube.dateRange.min} max={cube.dateRange.max} onChange={e=>setCustomFrom(e.target.value)} style={{ fontSize:11.5, padding:"6px 8px", borderRadius:7, border:`1px solid ${C.border}`, color:C.text }}/>
              <input type="date" value={customTo} min={cube.dateRange.min} max={cube.dateRange.max} onChange={e=>setCustomTo(e.target.value)} style={{ fontSize:11.5, padding:"6px 8px", borderRadius:7, border:`1px solid ${C.border}`, color:C.text }}/>
            </div>
          )}

          {/* Grain */}
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, margin:"12px 0 7px" }}>Granularity</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {(caps?.grains || []).map(g => (
              <button key={g} onClick={()=>setGrain(g)} style={{
                fontSize:11, padding:"5px 10px", borderRadius:14, cursor:"pointer", textTransform:"capitalize",
                background: grain===g ? C.blue : C.bg, color: grain===g ? "#fff" : C.text2,
                border: `1px solid ${grain===g ? C.blue : C.border}`, fontWeight: grain===g ? 600 : 400,
              }}>{g}</button>
            ))}
          </div>

          {/* YoY toggle */}
          {caps?.yoy && (
            <button onClick={()=>setYoyOn(v=>!v)} style={{
              marginTop:10, width:"100%", fontSize:11.5, fontWeight:600, padding:"8px 10px", borderRadius:8, cursor:"pointer",
              background: yoyOn ? C.green : C.bg, color: yoyOn ? "#fff" : C.text2,
              border: `1px solid ${yoyOn ? C.green : C.border}`,
            }}>
              {yoyOn ? "✓ " : ""}Compare years (YoY)
            </button>
          )}
          <div style={{ fontSize:10, color:C.text3, marginTop:8 }}>
            Data: {cube.dateRange.min} → {cube.dateRange.max}
            {caps?.multiYear && <span style={{ color:C.green, fontWeight:600 }}> · multi-year ✓</span>}
          </div>
        </div>

        {/* Dimension filters */}
        {cube.dimensions.map(dim => (
          <div key={dim.name} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 13px", boxShadow:shadowSm }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3 }}>{dim.name}</span>
              {(filters[dim.name]?.length || 0) > 0 && (
                <button onClick={()=>setFilters(prev => { const n = {...prev}; delete n[dim.name]; return n; })} style={{ fontSize:10, color:C.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>clear</button>
              )}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:3, maxHeight:150, overflowY:"auto" }}>
              {dim.values.map(v => {
                const on = filters[dim.name]?.includes(v) || false;
                return (
                  <label key={v} style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color: on ? C.text : C.text2, cursor:"pointer", padding:"3px 2px" }}>
                    <input type="checkbox" checked={on} onChange={()=>toggleFilter(dim.name, v)} style={{ accentColor:C.blue, cursor:"pointer" }}/>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight: on ? 600 : 400 }}>{v}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {activeFilterCount > 0 && (
          <button onClick={()=>setFilters({})} style={{ fontSize:12, fontWeight:600, color:C.red, background:"#ffeceb", border:"1px solid #ffd6d6", borderRadius:10, padding:"9px", cursor:"pointer" }}>
            ✕ Clear all filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* ══ MAIN AREA ══ */}
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:16 }}>

        {/* Title + edit toolbar */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:200 }}>
            {editing ? (
              <input
                value={title} onChange={e=>setTitle(e.target.value)}
                placeholder={dashTitle}
                style={{ width:"100%", fontSize:19, fontWeight:700, letterSpacing:"-0.3px", color:C.text, border:`1px dashed ${C.blue}`, borderRadius:8, padding:"5px 9px", outline:"none", background:C.surface }}
              />
            ) : (
              <h2 style={{ fontSize:19, fontWeight:700, letterSpacing:"-0.3px", color:C.text }}>{dashTitle}</h2>
            )}
            {(editing || notes.trim()) && (
              editing ? (
                <input
                  value={notes} onChange={e=>setNotes(e.target.value)}
                  placeholder="Add a subtitle or note (optional)…"
                  style={{ width:"100%", marginTop:6, fontSize:12.5, color:C.text2, border:`1px dashed ${C.border}`, borderRadius:7, padding:"5px 9px", outline:"none", background:C.surface }}
                />
              ) : (
                <div style={{ marginTop:4, fontSize:12.5, color:C.text2 }}>{notes}</div>
              )
            )}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={()=>setSetupOpen(true)} style={{ fontSize:12, fontWeight:600, color:C.text2, background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"8px 13px", cursor:"pointer" }}>✨ Setup</button>
            {editing ? (
              <>
                <button onClick={()=>setEditing(false)} style={{ fontSize:12, padding:"8px 13px", borderRadius:9, background:"transparent", border:`1px solid ${C.border}`, color:C.text2, cursor:"pointer" }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ fontSize:12, fontWeight:600, padding:"8px 15px", borderRadius:9, background:C.blue, border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:7, opacity:saving?.7:1 }}>
                  {saving ? <><Spinner size={12} color="#fff"/> Saving…</> : "💾 Save"}
                </button>
              </>
            ) : (
              <button onClick={()=>setEditing(true)} style={{ fontSize:12, fontWeight:600, color:C.blue, background:C.blueBg, border:`1px solid #c0d8f5`, borderRadius:9, padding:"8px 15px", cursor:"pointer" }}>✏️ Edit</button>
            )}
            {savedTick && <span style={{ fontSize:11.5, fontWeight:600, color:C.green }}>✓ Saved</span>}
          </div>
        </div>

        {/* Measure selector + aggregation toggle + row count */}
        {!agentView && (
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3 }}>Measure:</span>
            {cube.measures.slice(0, 6).map(m => (
              <button key={m} onClick={()=>selectMeasure(m)} style={{
                fontSize:12, padding:"6px 13px", borderRadius:16, cursor:"pointer",
                background: measure===m ? C.text : C.surface, color: measure===m ? "#fff" : C.text2,
                border:`1px solid ${measure===m ? C.text : C.border}`, fontWeight: measure===m ? 600 : 400,
              }}>{m}</button>
            ))}
            {/* Sum / Avg toggle — defaults to the smart guess for the field */}
            <div style={{ display:"flex", gap:3, background:C.bg, border:`1px solid ${C.border}`, borderRadius:14, padding:2, marginLeft:4 }} title="How to aggregate this measure">
              {(["sum","avg"] as Agg[]).map(a => (
                <button key={a} onClick={()=>setMeasureAgg(a)} style={{
                  fontSize:11, padding:"4px 11px", borderRadius:12, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.4px",
                  background: measureAgg===a ? C.blue : "transparent", color: measureAgg===a ? "#fff" : C.text3,
                  border:"none", fontWeight: measureAgg===a ? 700 : 500,
                }}>{a}</button>
              ))}
            </div>
            <span style={{ marginLeft:"auto", fontSize:11, color:C.text3 }}>
              {rows.reduce((s,r)=>s+r.n,0).toLocaleString()} rows in view
            </span>
          </div>
        )}

        {/* KPI cards */}
        <div style={{ display:"grid", gridTemplateColumns:`repeat(auto-fit, minmax(170px, 1fr))`, gap:12 }}>
          {kpiSpecs.map((k, i) => {
            const val = computeMeasure(rows, k.measure);
            const cmp = caps?.yoy && !yoyOn ? periodComparison(cube, filters, k.measure, 365) : null;
            return (
              <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"15px 17px", boxShadow:shadowSm }}>
                {editing ? (
                  <input
                    value={kpiLabels[i] ?? k.label}
                    onChange={e=>setKpiLabels(prev => ({ ...prev, [i]: e.target.value }))}
                    style={{ width:"100%", fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:8, border:`1px dashed ${C.border}`, borderRadius:6, padding:"3px 6px", outline:"none", background:C.bg }}
                  />
                ) : (
                  <div style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{k.label}</div>
                )}
                <div style={{ fontSize:21, fontWeight:700, letterSpacing:"-0.4px", color:C.text }}>{fmtForSpec(k.measure)(val)}</div>
                {cmp && cmp.deltaPct !== null && preset === "all" && (
                  <div style={{ fontSize:10.5, fontWeight:600, marginTop:5, color: cmp.deltaPct >= 0 ? C.green : C.red }}>
                    {cmp.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(cmp.deltaPct).toFixed(1)}% vs prior 12 months
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Charts */}
        {chartSpecs.map((ch, i) => {
          const fmt = fmtForSpec(ch.measure);
          const titleEl = editing ? (
            <input
              value={chartTitles[i] ?? ch.title}
              onChange={e=>setChartTitles(prev => ({ ...prev, [i]: e.target.value }))}
              style={{ width:"100%", fontSize:12.5, fontWeight:600, color:C.text, border:`1px dashed ${C.blue}`, borderRadius:7, padding:"5px 8px", outline:"none", marginBottom:8, background:C.surface }}
            />
          ) : null;
          let chartNode: React.ReactNode;
          if (ch.dimension === "_date") {
            const s  = seriesByGrain(rows, grain, ch.measure);
            const ov = yoyOn && caps?.yoy ? yoyOverlay(rows, ch.measure) : null;
            chartNode = <TrendChart title={ch.title + (yoyOn ? " — year comparison" : "")} series={s} overlay={ov} money={fmt}/>;
          } else {
            const data = byDimension(rows, ch.dimension, ch.measure, ch.topN);
            chartNode = ch.type === "donut"
              ? <DonutChart title={ch.title} data={data} money={fmt}/>
              : <HBarChart title={ch.title} data={data} money={fmt}/>;
          }
          return <div key={i}>{titleEl}{chartNode}</div>;
        })}

        <div style={{ fontSize:10.5, color:C.text3, textAlign:"center", padding:"4px 0 12px" }}>
          Every number is computed locally from your data — filters, time windows, and comparisons never call AI.
        </div>
      </div>

      {/* ══ AGENT MODAL ══ */}
      {agentOpen && (
        <div onClick={()=>!agentLoading && setAgentOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, borderRadius:18, padding:24, width:"100%", maxWidth:520, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:4 }}>🤖 Dashboard Agent</div>
            <div style={{ fontSize:12, color:C.text3, marginBottom:14 }}>Describe the view you want. The agent designs it — your browser computes the numbers.</div>
            {agentErr && <div style={{ background:"#fff8e8", border:"1px solid #ffe4a0", color:"#996600", fontSize:12, padding:"9px 12px", borderRadius:9, marginBottom:12, lineHeight:1.5 }}>{agentErr}</div>}
            <textarea
              autoFocus value={agentQ} onChange={e=>setAgentQ(e.target.value)}
              onKeyDown={e=>{ if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); askAgent(); } }}
              placeholder={`e.g. "Show ${cube.measures[0] || "revenue"} by ${cube.dimensions[0]?.name || "category"}, quarterly, compared by year"`}
              rows={3}
              style={{ width:"100%", boxSizing:"border-box", fontSize:13, padding:"11px 13px", borderRadius:10, border:`1px solid ${C.border}`, outline:"none", resize:"vertical", color:C.text, fontFamily:"inherit" }}
            />
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, margin:"10px 0 14px" }}>
              {[
                caps?.yoy ? "Compare this year vs last year" : `Monthly ${cube.measures[0] || "totals"} trend`,
                `Top 10 ${cube.dimensions[0]?.name || "items"} by ${cube.measures[0] || "value"}`,
                cube.measures.length >= 2 ? `${cube.measures[0]} vs ${cube.measures[1]} ratio by ${cube.dimensions[0]?.name || "group"}` : "Where are the negative values?",
              ].map(q => (
                <button key={q} onClick={()=>askAgent(q)} disabled={agentLoading} style={{ fontSize:11, background:C.bg, border:`1px solid ${C.border}`, borderRadius:14, padding:"6px 11px", color:C.text2, cursor:"pointer" }}>{q}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>setAgentOpen(false)} disabled={agentLoading} style={{ fontSize:13, padding:"9px 16px", borderRadius:9, background:"transparent", border:`1px solid ${C.border}`, color:C.text2, cursor:"pointer" }}>Cancel</button>
              <button onClick={()=>askAgent()} disabled={agentLoading || !agentQ.trim()} style={{ fontSize:13, fontWeight:600, padding:"9px 20px", borderRadius:9, background:C.purple, border:"none", color:"#fff", cursor:"pointer", opacity:agentLoading||!agentQ.trim()?.6:1, display:"flex", alignItems:"center", gap:8 }}>
                {agentLoading ? <><Spinner size={13} color="#fff"/> Designing view...</> : "Build view ✨"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ GUIDED SETUP WIZARD ══ */}
      {setupOpen && <SetupWizard cube={cube} caps={caps} initial={{ measure, agg: measureAgg, breakdown: primaryDim }} onApply={applySetup} onClose={()=>{ setSetupOpen(false); if (!agentView) persistConfig({ setupDone: true }); }}/>}
    </div>
  );
}

// ═══════════════ GUIDED SETUP WIZARD ═══════════════
// A short "where do you want to start" flow shown when a dashboard first opens.
// Every choice is derived from the live cube, so the suggestions always fit the data.
function SetupWizard({ cube, caps, initial, onApply, onClose }: {
  cube: DataCube;
  caps: { grains: Grain[]; multiYear: boolean; yoy: boolean; years: string[] } | null;
  initial: { measure: string; agg: Agg; breakdown: string };
  onApply: (o: { measure: string; agg: Agg; breakdown: string; preset: "all"|"ytd"|"l12m"|"lastyear" }) => void;
  onClose: () => void;
}) {
  const [measure, setMeasure]     = useState(initial.measure || cube.measures[0] || "");
  const [agg, setAgg]             = useState<Agg>(initial.agg || inferAgg(initial.measure || cube.measures[0] || ""));
  const [breakdown, setBreakdown] = useState(initial.breakdown ?? (cube.dimensions[0]?.name || ""));
  const [preset, setPreset]       = useState<"all"|"ytd"|"l12m"|"lastyear">(caps?.multiYear ? "l12m" : "all");

  const section = (n:number, title:string, hint?:string) => (
    <div style={{ display:"flex", alignItems:"baseline", gap:8, margin:"18px 0 9px" }}>
      <span style={{ fontSize:11, fontWeight:700, color:"#fff", background:C.blue, borderRadius:"50%", width:19, height:19, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{n}</span>
      <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{title}</span>
      {hint && <span style={{ fontSize:11, color:C.text3 }}>{hint}</span>}
    </div>
  );
  const chip = (on:boolean) => ({
    fontSize:12, padding:"7px 13px", borderRadius:16, cursor:"pointer",
    background: on ? C.blue : C.surface, color: on ? "#fff" : C.text2,
    border:`1px solid ${on ? C.blue : C.border}`, fontWeight: on ? 600 : 400,
  } as const);

  type TPreset = "all"|"ytd"|"l12m"|"lastyear";
  const timeOpts: [TPreset, string][] = [
    ["all","All time"],
    ...(caps?.multiYear ? ([["ytd","Year to date"],["l12m","Last 12 months"],["lastyear","Last year"]] as [TPreset, string][]) : []),
  ];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:210, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.surface, borderRadius:18, padding:26, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:3 }}>✨ Let&apos;s build your dashboard</div>
        <div style={{ fontSize:12.5, color:C.text3, marginBottom:6 }}>A few quick choices to start from — you can change everything later, or just skip.</div>

        {section(1, "Which metric matters most?")}
        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
          {cube.measures.slice(0, 8).map(m => (
            <button key={m} onClick={()=>{ setMeasure(m); setAgg(inferAgg(m)); }} style={chip(measure===m)}>{m}</button>
          ))}
        </div>

        {section(2, "How should we summarize it?", `we suggest ${inferAgg(measure).toUpperCase()}`)}
        <div style={{ display:"flex", gap:7 }}>
          <button onClick={()=>setAgg("sum")} style={chip(agg==="sum")}>Sum (total)</button>
          <button onClick={()=>setAgg("avg")} style={chip(agg==="avg")}>Average</button>
        </div>

        {section(3, "Break it down by…")}
        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
          <button onClick={()=>setBreakdown("")} style={chip(breakdown==="")}>📈 Just over time</button>
          {cube.dimensions.map(d => (
            <button key={d.name} onClick={()=>setBreakdown(d.name)} style={chip(breakdown===d.name)}>{d.name}</button>
          ))}
        </div>

        {timeOpts.length > 1 && (
          <>
            {section(4, "Time range")}
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
              {timeOpts.map(([k, lbl]) => (
                <button key={k} onClick={()=>setPreset(k)} style={chip(preset===k)}>{lbl}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:24 }}>
          <button onClick={onClose} style={{ fontSize:13, padding:"9px 16px", borderRadius:9, background:"transparent", border:`1px solid ${C.border}`, color:C.text2, cursor:"pointer" }}>Skip</button>
          <button onClick={()=>onApply({ measure, agg, breakdown, preset })} disabled={!measure} style={{ fontSize:13, fontWeight:600, padding:"9px 22px", borderRadius:9, background:C.blue, border:"none", color:"#fff", cursor:"pointer", opacity:measure?1:.6 }}>
            Build dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════ STATIC REPORT TAB (Claude JSON) ═══════════════
function StaticBar({ chart }: { chart: SChart }) {
  return <HBarChart title={chart.title} data={chart.data.slice(0,10)}/>;
}
function StaticReport({ dd }: { dd: DashboardData }) {
  const trendIcon  = (t:string) => t==="up" ? "↑" : t==="down" ? "↓" : "→";
  const trendColor = (t:string) => t==="up" ? C.green : t==="down" ? C.red : C.text3;
  return (
    <>
      {dd.kpis?.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:`repeat(auto-fit, minmax(180px, 1fr))`, gap:13, marginBottom:18 }}>
          {dd.kpis.map((kpi,i) => (
            <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:15, padding:"16px 18px", boxShadow:shadowSm }}>
              <div style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:8 }}>{kpi.label}</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:7 }}>
                <div style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.4px", color:kpi.color||C.text }}>{kpi.value}</div>
                <div style={{ fontSize:14, fontWeight:700, color:trendColor(kpi.trend) }}>{trendIcon(kpi.trend)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {dd.charts?.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(360px, 1fr))", gap:15, marginBottom:18 }}>
          {dd.charts.map((chart,i) => {
            if (chart.type === "pie" || chart.type === "donut")
              return <DonutChart key={i} title={chart.title} data={chart.data}/>;
            if (chart.type === "line")
              return <TrendChart key={i} title={chart.title} series={chart.data}/>;
            return <StaticBar key={i} chart={chart}/>;
          })}
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:13 }}>
        {dd.insights?.length > 0 && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:15, padding:18, boxShadow:shadowSm }}>
            <div style={{ fontWeight:600, fontSize:13, color:C.text, marginBottom:12 }}>💡 Key Insights</div>
            {dd.insights.map((ins,i) => (
              <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:C.blue, flexShrink:0, marginTop:6 }}/>
                <span style={{ fontSize:12.5, color:C.text2, lineHeight:1.5 }}>{ins}</span>
              </div>
            ))}
          </div>
        )}
        {dd.warnings?.length > 0 && (
          <div style={{ background:"#fff8e8", border:"1px solid #ffe4a0", borderRadius:15, padding:18, boxShadow:shadowSm }}>
            <div style={{ fontWeight:600, fontSize:13, color:"#996600", marginBottom:12 }}>⚠️ Warnings</div>
            {dd.warnings.map((w,i) => (
              <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:C.amber, flexShrink:0, marginTop:6 }}/>
                <span style={{ fontSize:12.5, color:"#664400", lineHeight:1.5 }}>{w}</span>
              </div>
            ))}
          </div>
        )}
        {dd.actions?.length > 0 && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:15, padding:18, boxShadow:shadowSm }}>
            <div style={{ fontWeight:600, fontSize:13, color:C.text, marginBottom:12 }}>⚡ Action Items</div>
            {dd.actions.map((a,i) => (
              <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.blue, background:C.blueBg, borderRadius:18, width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                <span style={{ fontSize:12.5, color:C.text2, lineHeight:1.5 }}>{a}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}


// ═══════════════ DEVELOPER TAB ═══════════════
type DevGuide = {
  verdict: string;
  targetSchema: {
    approach: string; rationale: string;
    factTables: { table:string; grain:string; measures:string[]; foreignKeys:string[] }[];
    dimensionTables: { table:string; key:string; attributes:string[]; scd:string }[];
  };
  slicing: { table:string; why:string; strategy:string }[];
  snowflakeNotes: string;
  questions: string[];
  cleaning: { table:string; column:string; issue:string; fix:string }[];
  joins: { join:string; cardinality:string; note:string }[];
  buildSteps: string[];
};

const ROLE_COLOR: Record<string,{bg:string;fg:string}> = {
  fact:      { bg:"#e8f0fe", fg:"#0071e3" },
  dimension: { bg:"#f3e8fd", fg:"#af52de" },
  bridge:    { bg:"#fff3e0", fg:"#ff9f0a" },
  reference: { bg:"#e1f5ee", fg:"#1D9E75" },
  flat:      { bg:"#f0faf4", fg:"#34c759" },
  unknown:   { bg:"#f5f5f7", fg:"#86868b" },
};
const ROLE_DOT: Record<ColumnInfo["role"],string> = {
  key:"#af52de", date:"#0071e3", measure:"#34c759", dimension:"#ff9f0a", text:"#86868b", flag:"#5ac8fa",
};

function ShapeBadge({ shape }: { shape:string }) {
  const map: Record<string,{label:string;color:string;desc:string}> = {
    star:          { label:"⭐ Star Schema", color:"#0071e3", desc:"One fact table surrounded by dimension tables — ideal for BI" },
    snowflake:     { label:"❄️ Snowflake Schema", color:"#5ac8fa", desc:"Dimensions normalized into sub-dimensions" },
    flat:          { label:"▦ Flat / Wide Table", color:"#34c759", desc:"Single denormalized table with everything in one place" },
    "multi-fact":  { label:"✦ Multi-Fact", color:"#af52de", desc:"Multiple fact tables — a constellation/galaxy schema" },
    "single-table":{ label:"▢ Single Table", color:"#86868b", desc:"One table — model as a flat fact or one-big-table" },
    disconnected:  { label:"⚠ Disconnected Tables", color:"#ff9f0a", desc:"No reliable joins detected between tables" },
  };
  const m = map[shape] || map.disconnected;
  return (
    <div style={{ display:"inline-flex", flexDirection:"column", gap:3 }}>
      <span style={{ fontSize:14, fontWeight:700, color:m.color }}>{m.label}</span>
      <span style={{ fontSize:11.5, color:C.text3 }}>{m.desc}</span>
    </div>
  );
}

function DeveloperTab({ payload, user }: { payload: Payload; user: User }) {
  const schemaFiles = payload.schemaFiles || [];
  const [fileId, setFileId]     = useState(schemaFiles[0]?.id || "");
  const [model, setModel]       = useState<SchemaModel | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState("");
  const [guide, setGuide]       = useState<DevGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideErr, setGuideErr] = useState("");
  const [openTable, setOpenTable] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId || !payload.folderId) { setLoading(false); return; }
    setLoading(true); setLoadErr(""); setModel(null); setGuide(null);
    getFileSchema<SchemaModel>(user.uid, payload.folderId, fileId)
      .then(m => {
        if (!m) { setLoadErr("No schema model found for this file. Re-upload it to enable the Developer tab."); return; }
        setModel(m);
        setOpenTable(m.factTables[0] || m.tables[0]?.name || null);
      })
      .catch(() => setLoadErr("Failed to load schema. Reopen the dashboard."))
      .finally(() => setLoading(false));
  }, [fileId, payload.folderId, user.uid]);

  async function generateGuide() {
    if (!model || guideLoading) return;
    setGuideLoading(true); setGuideErr("");
    try {
      const res  = await fetch("/api/dev-guide", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ schemaText: schemaToText(model), fileName: model.fileName, shape: model.shape }),
      });
      // Read as text first — a Vercel timeout or crash returns HTML/plain text,
      // not JSON, so res.json() would throw "Unexpected token 'A'...".
      const rawText = await res.text();
      let data: { success?:boolean; guide?:DevGuide; error?:string } | null = null;
      try { data = JSON.parse(rawText); } catch { data = null; }

      if (!res.ok || !data) {
        if (res.status === 504 || /timeout|timed out/i.test(rawText)) {
          throw new Error("The guide took too long to generate (server timeout). This usually means the Vercel plan's 10s limit was hit — try again, or upgrade to Vercel Pro for longer limits.");
        }
        throw new Error((data && data.error) || `Server error (${res.status}). Please try again.`);
      }
      if (!data.success) throw new Error(data.error || "Could not generate the guide. Try again.");
      setGuide(data.guide || null);
    } catch (err) {
      setGuideErr(err instanceof Error ? err.message : "Failed to generate guide.");
    } finally { setGuideLoading(false); }
  }

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:60 }}><Spinner size={24}/><span style={{ fontSize:13, color:C.text3 }}>Loading schema...</span></div>;
  if (loadErr || !model) return (
    <div style={{ textAlign:"center", padding:"50px 20px" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🛠️</div>
      <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Developer view unavailable</div>
      <div style={{ fontSize:13, color:C.text3, maxWidth:420, margin:"0 auto" }}>{loadErr || "No schema model found."}</div>
    </div>
  );

  const sectionTitle = (t:string) => (
    <div style={{ fontSize:13, fontWeight:700, color:C.text, margin:"22px 0 12px", letterSpacing:"-0.2px" }}>{t}</div>
  );

  return (
    <div style={{ maxWidth:980, margin:"0 auto" }}>

      {/* File switcher */}
      {schemaFiles.length > 1 && (
        <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3 }}>Dataset:</span>
          <select value={fileId} onChange={e=>setFileId(e.target.value)} style={{ fontSize:13, padding:"7px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.text, cursor:"pointer" }}>
            {schemaFiles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}

      {/* Schema overview banner */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px 22px", boxShadow:shadowSm, marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:6 }}>Detected Schema Shape</div>
            <ShapeBadge shape={model.shape}/>
          </div>
          <div style={{ display:"flex", gap:20 }}>
            <div><div style={{ fontSize:21, fontWeight:700, color:C.text }}>{model.tables.length}</div><div style={{ fontSize:10.5, color:C.text3 }}>tables</div></div>
            <div><div style={{ fontSize:21, fontWeight:700, color:C.text }}>{model.totalRows.toLocaleString()}</div><div style={{ fontSize:10.5, color:C.text3 }}>total rows</div></div>
            <div><div style={{ fontSize:21, fontWeight:700, color:"#0071e3" }}>{model.factTables.length}</div><div style={{ fontSize:10.5, color:C.text3 }}>fact</div></div>
            <div><div style={{ fontSize:21, fontWeight:700, color:"#af52de" }}>{model.dimensionTables.length}</div><div style={{ fontSize:10.5, color:C.text3 }}>dimension</div></div>
          </div>
        </div>
      </div>

      {/* Relationship map */}
      {model.relationships.length > 0 && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", boxShadow:shadowSm, marginBottom:18 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:12 }}>🔗 Detected Join Graph</div>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {model.relationships.map((r,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", fontSize:12, fontFamily:"monospace" }}>
                <span style={{ background:"#e8f0fe", color:"#0071e3", padding:"3px 8px", borderRadius:6, fontWeight:600 }}>{r.fromTable}.{r.fromColumn}</span>
                <span style={{ color:C.text3 }}>→</span>
                <span style={{ background:"#f3e8fd", color:"#af52de", padding:"3px 8px", borderRadius:6, fontWeight:600 }}>{r.toTable}.{r.toColumn}</span>
                <span style={{ fontSize:10.5, color:C.text3, fontFamily:"inherit" }}>{r.cardinality} · {r.matchPct}% match{r.orphans>0?` · ${r.orphans} orphans`:""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-table profile (expandable) */}
      {sectionTitle("Tables & Columns")}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {model.tables.map(t => {
          const rc = ROLE_COLOR[t.role] || ROLE_COLOR.unknown;
          const isOpen = openTable === t.name;
          const qColor = t.qualityScore >= 80 ? "#34c759" : t.qualityScore >= 55 ? "#ff9f0a" : "#ff3b30";
          return (
            <div key={t.name} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:shadowSm, overflow:"hidden" }}>
              <button onClick={()=>setOpenTable(isOpen ? null : t.name)} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
                <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20, background:rc.bg, color:rc.fg, textTransform:"uppercase", letterSpacing:"0.5px" }}>{t.role}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{t.name}</div>
                  <div style={{ fontSize:11.5, color:C.text3 }}>{t.grain} · {t.rowCount.toLocaleString()} rows × {t.colCount} cols</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:qColor }}>{t.qualityScore}<span style={{ fontSize:10, color:C.text3 }}>/100</span></div>
                  <div style={{ fontSize:10, color:C.text3 }}>quality</div>
                </div>
                <span style={{ fontSize:13, color:C.text3, transform:isOpen?"rotate(90deg)":"none", transition:"transform .2s" }}>▸</span>
              </button>
              {isOpen && (
                <div style={{ borderTop:`1px solid ${C.border}`, padding:"4px 0" }}>
                  {t.columns.map((c,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"9px 16px", borderBottom: i<t.columns.length-1?`1px solid #f7f7f9`:"none" }}>
                      <span style={{ width:8, height:8, borderRadius:"50%", background:ROLE_DOT[c.role], flexShrink:0, marginTop:4 }} title={c.role}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:12.5, fontWeight:600, color:C.text, fontFamily:"monospace" }}>{c.name}</span>
                          <span style={{ fontSize:10.5, color:C.text3 }}>{c.role} · {c.dataType}</span>
                          {(c.role==="key"||c.role==="dimension") && <span style={{ fontSize:10.5, color:C.text3 }}>· {c.unique.toLocaleString()} distinct</span>}
                          {c.role==="measure" && c.min!==undefined && <span style={{ fontSize:10.5, color:C.text3 }}>· {c.min}..{c.max}</span>}
                          {c.nullPct>=5 && <span style={{ fontSize:10.5, color: c.nullPct>=30?"#ff3b30":"#ff9f0a" }}>· {c.nullPct}% null</span>}
                        </div>
                        {c.quality.length > 0 && (
                          <div style={{ fontSize:10.5, color:"#996600", marginTop:3 }}>⚠ {c.quality.join(" · ")}</div>
                        )}
                        {c.sample.length > 0 && (
                          <div style={{ fontSize:10.5, color:C.text3, marginTop:2, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            e.g. {c.sample.slice(0,4).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI build guidance */}
      {sectionTitle("Build Guidance for Developers")}
      {!guide && !guideLoading && (
        <div style={{ background:`linear-gradient(135deg, #1d1d1f 0%, #3a3a3c 100%)`, borderRadius:16, padding:"22px 24px" }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:6 }}>Generate a build plan from this schema</div>
          <div style={{ fontSize:12.5, color:"rgba(255,255,255,0.7)", lineHeight:1.6, marginBottom:16, maxWidth:560 }}>
            Get star/snowflake recommendations, table slicing strategy, a data-cleaning checklist, the join map, analytical questions this data can answer, and ordered build steps — written for a developer doing the work manually.
          </div>
          {guideErr && <div style={{ background:"rgba(255,59,48,0.15)", color:"#ff9f9f", fontSize:12, padding:"9px 12px", borderRadius:9, marginBottom:14 }}>{guideErr}</div>}
          <button onClick={generateGuide} style={{ background:"#fff", color:"#1d1d1f", border:"none", borderRadius:10, padding:"11px 22px", fontSize:13.5, fontWeight:700, cursor:"pointer" }}>
            ⚙️ Generate developer guide
          </button>
        </div>
      )}
      {guideLoading && (
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"24px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:14 }}>
          <Spinner/><span style={{ fontSize:13, color:C.text3 }}>Analyzing schema and writing build guidance...</span>
        </div>
      )}
      {guide && <GuideView guide={guide}/>}

      <div style={{ fontSize:10.5, color:C.text3, textAlign:"center", padding:"16px 0" }}>
        Schema profiled locally from your data. Build guidance generated by AI from the schema metadata only — your data rows are never sent.
      </div>
    </div>
  );
}

function GuideView({ guide }: { guide: DevGuide }) {
  const card = (children: React.ReactNode, bg = C.surface) => (
    <div style={{ background:bg, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", boxShadow:shadowSm, marginBottom:14 }}>{children}</div>
  );
  const h = (t:string) => <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:12 }}>{t}</div>;

  return (
    <div>
      {card(<>
        <div style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.7px", color:"#0071e3", marginBottom:7 }}>Verdict</div>
        <div style={{ fontSize:14, color:C.text, lineHeight:1.6 }}>{guide.verdict}</div>
      </>)}

      {card(<>
        {h(`🏗️ Target Schema — ${guide.targetSchema.approach}`)}
        <div style={{ fontSize:12.5, color:C.text2, lineHeight:1.65, marginBottom:14 }}>{guide.targetSchema.rationale}</div>
        {guide.targetSchema.factTables.map((f,i) => (
          <div key={i} style={{ background:"#e8f0fe", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
            <div style={{ fontSize:12.5, fontWeight:700, color:"#0071e3" }}>FACT · {f.table}</div>
            <div style={{ fontSize:11.5, color:C.text2, marginTop:3 }}>Grain: {f.grain}</div>
            <div style={{ fontSize:11.5, color:C.text2, marginTop:3 }}>Measures: {f.measures.join(", ") || "—"}</div>
            <div style={{ fontSize:11.5, color:C.text2, marginTop:3 }}>Foreign keys: {f.foreignKeys.join(", ") || "—"}</div>
          </div>
        ))}
        {guide.targetSchema.dimensionTables.map((d,i) => (
          <div key={i} style={{ background:"#f3e8fd", borderRadius:10, padding:"12px 14px", marginBottom:8 }}>
            <div style={{ fontSize:12.5, fontWeight:700, color:"#af52de" }}>DIM · {d.table}</div>
            <div style={{ fontSize:11.5, color:C.text2, marginTop:3 }}>Key: {d.key}</div>
            <div style={{ fontSize:11.5, color:C.text2, marginTop:3 }}>Attributes: {d.attributes.join(", ") || "—"}</div>
            {d.scd && <div style={{ fontSize:11.5, color:C.text2, marginTop:3 }}>SCD: {d.scd}</div>}
          </div>
        ))}
      </>)}

      {guide.snowflakeNotes && card(<>
        {h("❄️ Snowflake vs Star — Tradeoff")}
        <div style={{ fontSize:12.5, color:C.text2, lineHeight:1.65 }}>{guide.snowflakeNotes}</div>
      </>)}

      {guide.slicing.length > 0 && card(<>
        {h("✂️ Large Table Slicing / Partitioning")}
        {guide.slicing.map((s,i) => (
          <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom: i<guide.slicing.length-1?`1px solid #f5f5f7`:"none" }}>
            <div style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{s.table}</div>
            <div style={{ fontSize:11.5, color:C.text3, margin:"3px 0" }}>Why: {s.why}</div>
            <div style={{ fontSize:11.5, color:"#0071e3" }}>Strategy: {s.strategy}</div>
          </div>
        ))}
      </>)}

      {guide.joins.length > 0 && card(<>
        {h("🔗 Join Implementation")}
        {guide.joins.map((j,i) => (
          <div key={i} style={{ marginBottom:9 }}>
            <div style={{ fontSize:12, fontFamily:"monospace", color:C.text, background:"#f5f5f7", padding:"6px 10px", borderRadius:7 }}>{j.join}</div>
            <div style={{ fontSize:11, color:C.text3, marginTop:3 }}>{j.cardinality} · {j.note}</div>
          </div>
        ))}
      </>)}

      {guide.cleaning.length > 0 && card(<>
        {h("🧹 Data Cleaning Checklist")}
        {guide.cleaning.map((c,i) => (
          <div key={i} style={{ display:"flex", gap:10, marginBottom:10, paddingBottom:10, borderBottom: i<guide.cleaning.length-1?`1px solid #f5f5f7`:"none" }}>
            <input type="checkbox" style={{ accentColor:"#34c759", marginTop:2 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.text, fontFamily:"monospace" }}>{c.table}.{c.column}</div>
              <div style={{ fontSize:11.5, color:"#996600", margin:"2px 0" }}>⚠ {c.issue}</div>
              <div style={{ fontSize:11.5, color:"#34c759" }}>✓ Fix: {c.fix}</div>
            </div>
          </div>
        ))}
      </>)}

      {guide.questions.length > 0 && card(<>
        {h("❓ Questions This Dataset Can Answer")}
        {guide.questions.map((q,i) => (
          <div key={i} style={{ display:"flex", gap:8, marginBottom:7, alignItems:"flex-start" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#0071e3", background:"#e8f0fe", borderRadius:14, minWidth:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</span>
            <span style={{ fontSize:12.5, color:C.text2, lineHeight:1.5 }}>{q}</span>
          </div>
        ))}
      </>)}

      {guide.buildSteps.length > 0 && card(<>
        {h("📋 Build Steps")}
        {guide.buildSteps.map((s,i) => (
          <div key={i} style={{ display:"flex", gap:10, marginBottom:9, alignItems:"flex-start" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#fff", background:"#1d1d1f", borderRadius:"50%", minWidth:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</span>
            <span style={{ fontSize:12.5, color:C.text2, lineHeight:1.6, paddingTop:2 }}>{s}</span>
          </div>
        ))}
      </>)}
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

// ═══════════════ PAGE ═══════════════
export default function DashboardViewPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [user, setUser]       = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab]         = useState<"explore"|"report"|"narrative"|"developer">("report");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dashwise-analysis");
      if (raw) {
        const p = JSON.parse(raw) as Payload;
        setPayload(p);
        if (p.cubeFiles?.length && p.folderId) setTab("explore");
      }
    } catch {}
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true); });
    return unsub;
  }, []);

  if (!payload) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📊</div>
        <h2 style={{ fontSize:18, fontWeight:600, color:C.text, marginBottom:8 }}>No analysis loaded</h2>
        <p style={{ fontSize:14, color:C.text3, marginBottom:20 }}>Run an analysis from the Files page first.</p>
        <button onClick={()=>window.close()} style={{ background:C.blue, color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, fontSize:14, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>Close window</button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const dd = payload.dashboardData || { summary:"", kpis:[], insights:[], warnings:[], actions:[], charts:[] };
  const hasExplore = !!(payload.cubeFiles?.length && payload.folderId);
  const hasDeveloper = !!(payload.schemaFiles?.length && payload.folderId);

  const TABS = [
    ...(hasExplore ? [["explore","📊 Explore"]] as const : []),
    ["report","🤖 AI Report"], ["narrative","📝 Narrative"],
    ...(hasDeveloper ? [["developer","🛠️ Developer"]] as const : []),
  ] as const;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background:"rgba(255,255,255,0.9)", backdropFilter:"saturate(180%) blur(20px)", WebkitBackdropFilter:"saturate(180%) blur(20px)", borderBottom:`1px solid ${C.border}`, padding:"11px 22px", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:1180, margin:"0 auto", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:10, color:C.text3, textTransform:"uppercase", letterSpacing:"0.7px", fontWeight:600, marginBottom:2 }}>
              DashWise{payload.analyzedAt ? ` · analyzed ${new Date(payload.analyzedAt).toLocaleDateString()}` : ""}
            </div>
            <h1 style={{ fontSize:18, fontWeight:700, color:C.text, letterSpacing:"-0.3px" }}>{payload.bizName || "Business Dashboard"}</h1>
          </div>
          <div style={{ display:"flex", background:C.bg, borderRadius:10, padding:3, border:`1px solid ${C.border}` }}>
            {TABS.map(([k, lbl]) => (
              <button key={k} onClick={()=>setTab(k)} style={{
                padding:"7px 14px", borderRadius:8, fontSize:12.5, fontWeight:tab===k?600:400, fontFamily:"inherit",
                background:tab===k?C.surface:"transparent", color:tab===k?C.text:C.text3,
                border:"none", cursor:"pointer", boxShadow:tab===k?shadowSm:"none",
              }}>{lbl}</button>
            ))}
          </div>
          <button onClick={()=>window.close()} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.text3, fontSize:12.5, padding:"7px 13px", borderRadius:10, cursor:"pointer", fontFamily:"inherit" }}>✕ Close</button>
        </div>
      </div>

      <div style={{ maxWidth:1180, margin:"0 auto", padding:"20px 18px" }}>
        {dd.summary && tab !== "explore" && tab !== "developer" && (
          <div style={{ background:`linear-gradient(135deg, ${C.blue} 0%, #0058b8 100%)`, borderRadius:18, padding:"18px 22px", marginBottom:20, boxShadow:"0 6px 20px rgba(0,113,227,0.25)" }}>
            <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.65)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:7 }}>Executive Summary</div>
            <p style={{ fontSize:14, color:"#fff", lineHeight:1.6 }}>{dd.summary}</p>
          </div>
        )}

        {tab === "explore" && hasExplore && (
          !authReady ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:60 }}><Spinner size={24}/></div>
          ) : user ? (
            <ExploreTab payload={payload} user={user}/>
          ) : (
            <div style={{ textAlign:"center", padding:"50px 20px" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Sign-in required</div>
              <div style={{ fontSize:13, color:C.text3 }}>Open this dashboard from the Files page while logged in.</div>
            </div>
          )
        )}

        {tab === "report"    && <StaticReport dd={dd}/>}
        {tab === "developer" && hasDeveloper && (
          !authReady ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:60 }}><Spinner size={24}/></div>
          ) : user ? (
            <DeveloperTab payload={payload} user={user}/>
          ) : (
            <div style={{ textAlign:"center", padding:"50px 20px" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Sign-in required</div>
              <div style={{ fontSize:13, color:C.text3 }}>Open this dashboard from the Files page while logged in.</div>
            </div>
          )
        )}
        {tab === "narrative" && (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:"26px 30px", boxShadow:shadowSm }}>
            <div style={{ fontWeight:700, fontSize:16, color:C.text, marginBottom:16, letterSpacing:"-0.3px" }}>Full Analysis Report</div>
            {renderMarkdown(payload.narrative || "No narrative available.")}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
