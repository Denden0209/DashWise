"use client";
// app/dashboard-view/page.tsx
// Full-screen Power BI-style dashboard that opens after analysis.
// Data is passed via sessionStorage from the files page.
// User can filter, explore, and drill down into their data.

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────
type KPI = {
  id: string; label: string; value: string;
  raw?: number; unit?: string;
  trend?: "up"|"down"|"flat"|"unknown"; trendPct?: string;
  category?: string; period?: string;
};
type Dataset = { name: string; data: number[]; color?: string };
type ChartSeries = {
  id: string; name: string; type: "bar"|"line"|"pie"|"area";
  category?: string; xAxis: string[]; datasets: Dataset[];
};
type TableData = {
  id: string; title: string; category?: string;
  headers: string[]; rows: string[][]; sortable?: boolean;
};
type Alert = { level: "critical"|"warning"|"info"|"success"; title: string; message: string };
type DashboardData = {
  summary?: string; kpis?: KPI[]; series?: ChartSeries[];
  tables?: TableData[]; alerts?: Alert[];
  availableFilters?: { categories?: string[]; periods?: string[]; };
};

// ── Colours ────────────────────────────────────────────────
const C = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#14b8a6"];
const CAT_COLOR: Record<string,string> = {
  revenue:"#10b981", cost:"#ef4444", efficiency:"#6366f1",
  growth:"#f59e0b", other:"#8b5cf6",
};

// ── Mini bar spark ─────────────────────────────────────────
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.slice(-12).map((v, i) => (
        <div key={i} className="flex-1 rounded-sm min-h-0.5 transition-all"
          style={{ height: `${Math.max((v / max) * 100, 4)}%`, background: color, opacity: 0.7 + 0.3 * (i / values.length) }}/>
      ))}
    </div>
  );
}

// ── Bar chart ──────────────────────────────────────────────
function BarChart({ s }: { s: ChartSeries }) {
  const all = s.datasets.flatMap(d => d.data).filter(n => !isNaN(n));
  const max = Math.max(...all, 1);
  return (
    <div className="space-y-3 mt-2">
      {s.xAxis.slice(0, 10).map((lbl, i) => (
        <div key={i}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-400 truncate max-w-[55%]">{lbl}</span>
            <div className="flex gap-3">
              {s.datasets.map((d, di) => (
                <span key={di} className="text-xs font-semibold text-white">
                  {d.data[i] != null ? Number(d.data[i]).toLocaleString() : "—"}
                </span>
              ))}
            </div>
          </div>
          {s.datasets.map((d, di) => {
            const pct = Math.max(((d.data[i] ?? 0) / max) * 100, 0);
            return (
              <div key={di} className="h-5 rounded-full overflow-hidden mb-0.5"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: d.color || C[di % C.length] }}/>
              </div>
            );
          })}
        </div>
      ))}
      {s.datasets.length > 1 && (
        <div className="flex flex-wrap gap-3 pt-1">
          {s.datasets.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color || C[i % C.length] }}/>
              <span className="text-xs text-slate-400">{d.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Line / Area chart ──────────────────────────────────────
function LineChart({ s }: { s: ChartSeries }) {
  const W = 480, H = 160, PX = 40, PY = 16;
  const all  = s.datasets.flatMap(d => d.data).filter(n => !isNaN(n));
  const maxY = Math.max(...all, 1);
  const minY = Math.min(...all, 0);
  const rng  = maxY - minY || 1;
  const isArea = s.type === "area";
  const tx = (i: number, n: number) => PX + (i / Math.max(n - 1, 1)) * (W - PX * 2);
  const ty = (v: number) => PY + ((maxY - v) / rng) * (H - PY * 2);
  const fmt = (v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0);

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const v = minY + (1 - t) * rng;
          const y = PY + t * (H - PY * 2);
          return (
            <g key={i}>
              <line x1={PX} y1={y} x2={W-PX} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
              <text x={PX-4} y={y+3} textAnchor="end" fontSize="8" fill="#64748b">{fmt(v)}</text>
            </g>
          );
        })}
        {s.datasets.map((d, di) => {
          const col  = d.color || C[di % C.length];
          const n    = d.data.length;
          const pts  = d.data.map((v, i) => `${tx(i, n)},${ty(v)}`).join(" ");
          const area = `M${tx(0, n)},${ty(minY)} ` + d.data.map((v, i) => `L${tx(i, n)},${ty(v)}`).join(" ") + ` L${tx(n-1, n)},${ty(minY)} Z`;
          return (
            <g key={di}>
              {isArea && <path d={area} fill={col} opacity="0.15"/>}
              <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
              {d.data.map((v, i) => (
                <circle key={i} cx={tx(i, n)} cy={ty(v)} r="3.5" fill={col} stroke="#0f172a" strokeWidth="2"/>
              ))}
            </g>
          );
        })}
        {s.xAxis.slice(0, 8).map((l, i) => (
          <text key={i} x={tx(i, Math.min(s.xAxis.length, 8))} y={H-3}
            textAnchor="middle" fontSize="8" fill="#475569">
            {l.length > 8 ? l.slice(0, 8)+"…" : l}
          </text>
        ))}
      </svg>
      {s.datasets.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-1">
          {s.datasets.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full" style={{ background: d.color || C[i % C.length] }}/>
              <span className="text-xs text-slate-400">{d.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pie / Donut chart ──────────────────────────────────────
function PieChart({ s }: { s: ChartSeries }) {
  const d = s.datasets[0];
  if (!d || d.data.length === 0) return null;
  const total = d.data.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  const slices = d.data.map((val, i) => {
    const sweep = (val / total) * Math.PI * 2;
    const st = angle; angle += sweep;
    const r = 52;
    const x1 = 65 + r * Math.cos(st), y1 = 65 + r * Math.sin(st);
    const x2 = 65 + r * Math.cos(angle), y2 = 65 + r * Math.sin(angle);
    return { d: `M65,65 L${x1},${y1} A${r},${r} 0 ${sweep>Math.PI?1:0},1 ${x2},${y2} Z`,
      color: C[i % C.length], label: s.xAxis[i]||`Item ${i+1}`,
      pct: Math.round((val/total)*100), val };
  });
  return (
    <div className="flex items-center gap-6 mt-2">
      <svg viewBox="0 0 130 130" className="w-28 h-28 flex-shrink-0">
        {slices.map((sl, i) => (
          <path key={i} d={sl.d} fill={sl.color} stroke="#0f172a" strokeWidth="2"/>
        ))}
        <circle cx="65" cy="65" r="30" fill="#0f172a"/>
        <text x="65" y="61" textAnchor="middle" fontSize="8" fill="#64748b">Total</text>
        <text x="65" y="73" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
          {total >= 1000 ? `${(total/1000).toFixed(1)}k` : total}
        </text>
      </svg>
      <div className="flex flex-col gap-2 flex-1">
        {slices.map((sl, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: sl.color }}/>
                <span className="text-xs text-slate-300 truncate">{sl.label}</span>
              </div>
              <span className="text-xs font-bold text-white">{sl.pct}%</span>
            </div>
            <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full" style={{ width: `${sl.pct}%`, background: sl.color }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Data table ─────────────────────────────────────────────
function DataTable({ t }: { t: TableData }) {
  const [sortCol, setSortCol] = useState<number|null>(null);
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page,    setPage]    = useState(0);
  const PER_PAGE = 10;

  const sorted = useMemo(() => {
    if (sortCol === null) return t.rows;
    return [...t.rows].sort((a, b) => {
      const av = parseFloat(a[sortCol].replace(/[^0-9.-]/g,"")) || 0;
      const bv = parseFloat(b[sortCol].replace(/[^0-9.-]/g,"")) || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [t.rows, sortCol, sortDir]);

  const pages = Math.ceil(sorted.length / PER_PAGE);
  const visible = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  function handleSort(i: number) {
    if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(i); setSortDir("desc"); }
    setPage(0);
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.05)" }}>
              {t.headers.map((h, i) => (
                <th key={i} onClick={() => handleSort(i)}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-white select-none">
                  <div className="flex items-center gap-1">
                    {h}
                    <span className="text-slate-600">
                      {sortCol === i ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-slate-500">
            {page * PER_PAGE + 1}–{Math.min((page+1)*PER_PAGE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(p-1, 0))} disabled={page === 0}
              className="px-2 py-1 rounded text-xs text-slate-400 hover:text-white disabled:opacity-30 hover:bg-white/10">← Prev</button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${page === i ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/10"}`}>
                {i+1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(p+1, pages-1))} disabled={page === pages-1}
              className="px-2 py-1 rounded text-xs text-slate-400 hover:text-white disabled:opacity-30 hover:bg-white/10">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter chip ────────────────────────────────────────────
function Chip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
        active
          ? "text-white border-transparent shadow-lg"
          : "text-slate-400 border-white/10 hover:border-white/30 hover:text-white"
      }`}
      style={active ? { background: color || "#6366f1", borderColor: color || "#6366f1" } : {}}>
      {label}
    </button>
  );
}

// ── Narrative viewer ───────────────────────────────────────
function NarrativePanel({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2"/>;
        if (line.startsWith("**") && line.endsWith("**"))
          return <div key={i} className="text-white font-bold text-sm mt-4 mb-1 pb-1 border-b border-white/10">{line.replace(/\*\*/g,"")}</div>;
        if (line.match(/\*\*(.*?)\*\*/))
          return <div key={i} className="text-slate-300 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g,"<strong class='text-white'>$1</strong>") }}/>;
        if (line.match(/^[🚨⚠️✅❓→•-]/))
          return <div key={i} className="text-slate-300 text-sm pl-2 border-l-2 border-indigo-500/40 leading-relaxed">{line}</div>;
        return <div key={i} className="text-slate-400 text-sm leading-relaxed">{line}</div>;
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════
function DashboardViewContent() {
  const router     = useRouter();
  const params     = useSearchParams();
  const [data,     setData]     = useState<DashboardData | null>(null);
  const [narrative,setNarrative]= useState("");
  const [bizName,  setBizName]  = useState("");
  const [mode,     setMode]     = useState("explain");
  const [loading,  setLoading]  = useState(true);

  // Filters
  const [activeCat,    setActiveCat]    = useState("all");
  const [activePeriod, setActivePeriod] = useState("all");
  const [chartType,    setChartType]    = useState("all");
  const [search,       setSearch]       = useState("");
  const [activeTab,    setActiveTab]    = useState<"overview"|"charts"|"tables"|"insights">("overview");

  // Load data from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("dashwise-analysis");
      if (stored) {
        const parsed = JSON.parse(stored);
        setData(parsed.dashboardData || null);
        setNarrative(parsed.narrative || "");
        setBizName(parsed.bizName || "");
        setMode(parsed.mode || "explain");
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const allSeries = useMemo(() => data?.series || [], [data]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    data?.kpis?.forEach(k => k.category && cats.add(k.category));
    allSeries.forEach(s => s.category && cats.add(s.category));
    data?.tables?.forEach(t => t.category && cats.add(t.category));
    return Array.from(cats);
  }, [data, allSeries]);

  const periods = useMemo(() => {
    const ps = new Set<string>();
    data?.kpis?.forEach(k => k.period && ps.add(k.period));
    data?.availableFilters?.periods?.forEach(p => ps.add(p));
    return Array.from(ps);
  }, [data]);

  const filteredKpis = useMemo(() => (data?.kpis || []).filter(k =>
    (activeCat === "all" || k.category === activeCat) &&
    (activePeriod === "all" || k.period === activePeriod) &&
    (!search || k.label.toLowerCase().includes(search.toLowerCase()))
  ), [data, activeCat, activePeriod, search]);

  const filteredSeries = useMemo(() => allSeries.filter(s =>
    (activeCat === "all" || s.category === activeCat) &&
    (chartType === "all" || s.type === chartType)
  ), [allSeries, activeCat, chartType]);

  const filteredTables = useMemo(() => (data?.tables || []).filter(t =>
    activeCat === "all" || t.category === activeCat
  ), [data, activeCat]);

  const modeLabel: Record<string,string> = {
    explain:"Full Report", meeting:"Meeting Prep", anomaly:"Issues Found", action:"Action Plan"
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <div className="text-slate-400 text-sm">Loading dashboard...</div>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0f172a" }}>
      <div className="text-4xl">📊</div>
      <div className="text-white font-bold text-lg">No analysis data found</div>
      <p className="text-slate-400 text-sm">Go to Files, upload data, and click Analyze.</p>
      <button onClick={() => router.push("/files")}
        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700">
        Go to Files →
      </button>
    </div>
  );

  const ALERT_ICON = { critical:"🚨", warning:"⚠️", info:"ℹ️", success:"✅" };
  const ALERT_COLOR = { critical:"#ef4444", warning:"#f59e0b", info:"#6366f1", success:"#10b981" };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0f172a", fontFamily: "Inter, sans-serif" }}>

      {/* ── TOP NAV ── */}
      <header style={{ background: "rgba(15,23,42,0.95)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        className="sticky top-0 z-50 backdrop-blur-xl px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
            ← Back
          </button>
          <div className="h-5 w-px bg-white/10"/>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"/>
            <span className="text-white font-semibold text-sm">{bizName}</span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-slate-400 text-xs">{modeLabel[mode] || mode}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden md:block">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search metrics..."
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-indigo-500 w-44"
              style={{ background: "rgba(255,255,255,0.05)" }}/>
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          </div>
          <Link href="/files"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-all">
            ← Files
          </Link>
          <Link href="/advisor"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all"
            style={{ background: "#6366f1" }}>
            💬 Ask Advisor
          </Link>
        </div>
      </header>

      {/* ── SUMMARY BANNER ── */}
      {data.summary && (
        <div className="px-6 py-4 border-b border-white/5"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(16,185,129,0.08))" }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">Executive Summary</div>
            <p className="text-slate-200 text-sm leading-relaxed">{data.summary}</p>
          </div>
        </div>
      )}

      {/* ── FILTER BAR ── */}
      <div className="px-6 py-3 border-b border-white/5 flex flex-wrap items-center gap-3"
        style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-6xl mx-auto w-full flex flex-wrap items-center gap-3">

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl mr-2" style={{ background: "rgba(255,255,255,0.05)" }}>
            {(["overview","charts","tables","insights"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  activeTab === tab ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
                }`}>
                {tab === "insights" ? "📋 Notes" : tab === "overview" ? "📊 Overview" : tab === "charts" ? "📈 Charts" : "🗂️ Tables"}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-white/10"/>

          {/* Category filters */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-slate-500 font-medium">Category:</span>
              <Chip label="All" active={activeCat==="all"} color="#6366f1" onClick={() => setActiveCat("all")}/>
              {categories.map(cat => (
                <Chip key={cat} label={cat.charAt(0).toUpperCase()+cat.slice(1)}
                  active={activeCat===cat} color={CAT_COLOR[cat] || "#6366f1"}
                  onClick={() => setActiveCat(cat)}/>
              ))}
            </div>
          )}

          {/* Period filters */}
          {periods.length > 1 && (
            <>
              <div className="h-5 w-px bg-white/10"/>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-slate-500 font-medium">Period:</span>
                <Chip label="All" active={activePeriod==="all"} onClick={() => setActivePeriod("all")}/>
                {periods.map(p => (
                  <Chip key={p} label={p} active={activePeriod===p} onClick={() => setActivePeriod(p)}/>
                ))}
              </div>
            </>
          )}

          {/* Chart type (only in charts tab) */}
          {activeTab === "charts" && allSeries.length > 0 && (
            <>
              <div className="h-5 w-px bg-white/10"/>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-slate-500 font-medium">Type:</span>
                {(["all","bar","line","area","pie"] as const).map(ct => (
                  <Chip key={ct} label={ct==="all"?"All":ct.charAt(0).toUpperCase()+ct.slice(1)}
                    active={chartType===ct} onClick={() => setChartType(ct)}/>
                ))}
              </div>
            </>
          )}

          {/* Reset */}
          {(activeCat!=="all"||activePeriod!=="all"||chartType!=="all"||search) && (
            <button onClick={() => { setActiveCat("all"); setActivePeriod("all"); setChartType("all"); setSearch(""); }}
              className="text-xs text-red-400 hover:text-red-300 font-medium ml-auto">
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      {/* ── ALERTS ROW ── */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="px-6 py-3 flex gap-3 overflow-x-auto border-b border-white/5"
          style={{ background: "rgba(255,255,255,0.01)" }}>
          {data.alerts.map((alert, i) => (
            <div key={i} className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
              style={{ borderColor: `${ALERT_COLOR[alert.level]}30`, background: `${ALERT_COLOR[alert.level]}12` }}>
              <span>{ALERT_ICON[alert.level]}</span>
              <div>
                <div className="font-semibold text-white">{alert.title}</div>
                <div className="text-slate-400 mt-0.5 max-w-xs">{alert.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* KPI cards */}
              {filteredKpis.length > 0 && (
                <>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Key Performance Indicators
                    {filteredKpis.length !== (data.kpis?.length || 0) &&
                      <span className="ml-2 text-indigo-400">({filteredKpis.length} shown)</span>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {filteredKpis.map((kpi, i) => {
                      const tColor = kpi.trend==="up" ? "#10b981" : kpi.trend==="down" ? "#ef4444" : "#64748b";
                      const tIcon  = kpi.trend==="up" ? "↑" : kpi.trend==="down" ? "↓" : "→";
                      const catColor = CAT_COLOR[kpi.category||""] || "#6366f1";
                      const numVals = (data.kpis||[]).filter(k=>k.category===kpi.category).map(k=>k.raw||0);
                      return (
                        <div key={kpi.id||i}
                          className="rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all hover:scale-105 cursor-default relative overflow-hidden group"
                          style={{ background: "rgba(255,255,255,0.04)" }}>
                          {/* Subtle glow */}
                          <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-0 group-hover:opacity-10 transition-opacity blur-xl"
                            style={{ background: catColor }}/>
                          <div className="flex items-start justify-between mb-3">
                            <div className="text-xs text-slate-400 uppercase tracking-wider leading-tight pr-2">{kpi.label}</div>
                            {kpi.category && (
                              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                                style={{ background: catColor }}/>
                            )}
                          </div>
                          <div className="text-2xl font-bold text-white mb-2">{kpi.value}</div>
                          <div className="flex items-center justify-between">
                            {kpi.trendPct && kpi.trend !== "unknown" ? (
                              <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: tColor }}>
                                <span>{tIcon}</span><span>{kpi.trendPct}</span>
                              </div>
                            ) : <div/>}
                            {numVals.length > 2 && (
                              <div className="w-16 opacity-50">
                                <Spark values={numVals} color={catColor}/>
                              </div>
                            )}
                          </div>
                          {kpi.period && (
                            <div className="text-xs text-slate-600 mt-1">{kpi.period}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* First 2 charts in overview */}
              {filteredSeries.slice(0, 2).length > 0 && (
                <>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Charts</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredSeries.slice(0, 2).map((s, i) => (
                      <div key={s.id||i}
                        className="rounded-2xl p-5 border border-white/10"
                        style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-white text-sm">{s.name}</h4>
                          <span className="text-xs px-2 py-0.5 rounded-full text-slate-400 capitalize"
                            style={{ background: "rgba(255,255,255,0.08)" }}>{s.type}</span>
                        </div>
                        {(s.type==="bar") && <BarChart s={s}/>}
                        {(s.type==="line"||s.type==="area") && <LineChart s={s}/>}
                        {s.type==="pie" && <PieChart s={s}/>}
                      </div>
                    ))}
                  </div>
                  {filteredSeries.length > 2 && (
                    <button onClick={() => setActiveTab("charts")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                      View all {filteredSeries.length} charts →
                    </button>
                  )}
                </>
              )}

              {/* First table in overview */}
              {filteredTables.slice(0, 1).map((t, i) => (
                <div key={t.id||i}>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{t.title}</div>
                  <div className="rounded-2xl border border-white/10 overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    <DataTable t={t}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CHARTS TAB */}
          {activeTab === "charts" && (
            <div className="space-y-6">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {filteredSeries.length} Chart{filteredSeries.length!==1?"s":""} — {activeCat==="all"?"All categories":activeCat}
              </div>
              {filteredSeries.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <div className="text-3xl mb-3">📈</div>
                  No charts match your current filters.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filteredSeries.map((s, i) => (
                    <div key={s.id||i}
                      className="rounded-2xl p-5 border border-white/10"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-white text-sm">{s.name}</h4>
                        <div className="flex items-center gap-2">
                          {s.category && (
                            <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                              style={{ background: `${CAT_COLOR[s.category]||"#6366f1"}20`, color: CAT_COLOR[s.category]||"#6366f1" }}>
                              {s.category}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full text-slate-400 capitalize"
                            style={{ background: "rgba(255,255,255,0.08)" }}>{s.type}</span>
                        </div>
                      </div>
                      {(s.type==="bar") && <BarChart s={s}/>}
                      {(s.type==="line"||s.type==="area") && <LineChart s={s}/>}
                      {s.type==="pie" && <PieChart s={s}/>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TABLES TAB */}
          {activeTab === "tables" && (
            <div className="space-y-6">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {filteredTables.length} Table{filteredTables.length!==1?"s":""}
              </div>
              {filteredTables.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <div className="text-3xl mb-3">🗂️</div>
                  No tables match your current filters.
                </div>
              ) : (
                filteredTables.map((t, i) => (
                  <div key={t.id||i}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-white text-sm">{t.title}</h3>
                      {t.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                          style={{ background: `${CAT_COLOR[t.category]||"#6366f1"}20`, color: CAT_COLOR[t.category]||"#6366f1" }}>
                          {t.category}
                        </span>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/10 overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      <DataTable t={t}/>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* INSIGHTS TAB */}
          {activeTab === "insights" && (
            <div className="space-y-4 max-w-3xl">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Analysis Notes</div>
              <div className="rounded-2xl p-6 border border-white/10"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                {narrative ? <NarrativePanel text={narrative}/> : (
                  <div className="text-slate-500 text-sm">No narrative available.</div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div className="px-6 py-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-600"
        style={{ background: "rgba(15,23,42,0.8)" }}>
        <span>DashWise · {bizName} · {modeLabel[mode] || mode}</span>
        <span>{filteredKpis.length} metrics · {filteredSeries.length} charts · {filteredTables.length} tables</span>
      </div>
    </div>
  );
}

export default function DashboardViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
      </div>
    }>
      <DashboardViewContent />
    </Suspense>
  );
}
