"use client";
// components/AnalysisDashboard.tsx
// Dynamic Power BI-style dashboard with filters, charts, KPIs, tables.
// All filtering happens client-side — no extra API calls.

import { useState, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
export type KPI = {
  id:        string;
  label:     string;
  value:     string;
  raw?:      number;
  unit?:     string;
  trend?:    "up"|"down"|"flat"|"unknown";
  trendPct?: string;
  category?: string;
  period?:   string;
};

export type ChartSeries = {
  id:       string;
  name:     string;
  type:     "bar"|"line"|"pie"|"area";
  category?: string;
  xAxis:    string[];
  datasets: { name: string; data: number[]; color?: string }[];
};

export type TableData = {
  id:       string;
  title:    string;
  category?: string;
  headers:  string[];
  rows:     string[][];
  sortable?: boolean;
};

export type Alert = {
  level:   "critical"|"warning"|"info"|"success";
  title:   string;
  message: string;
};

export type DashboardData = {
  summary?:         string;
  kpis?:            KPI[];
  series?:          ChartSeries[];
  charts?:          ChartSeries[];  // legacy support
  tables?:          TableData[];
  alerts?:          Alert[];
  availableFilters?: {
    categories?: string[];
    periods?:    string[];
    metrics?:    string[];
  };
};

// ── Colour palette ─────────────────────────────────────────────────────────
const COLORS = ["#2563ff","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#14b8a6"];

const ALERT_STYLE = {
  critical: { bg:"bg-red-50",    border:"border-red-300",   icon:"🚨", head:"text-red-800",   body:"text-red-700"   },
  warning:  { bg:"bg-amber-50",  border:"border-amber-300", icon:"⚠️", head:"text-amber-800", body:"text-amber-700" },
  info:     { bg:"bg-blue-50",   border:"border-blue-200",  icon:"ℹ️", head:"text-blue-800",  body:"text-blue-700"  },
  success:  { bg:"bg-green-50",  border:"border-green-200", icon:"✅", head:"text-green-800", body:"text-green-700" },
};

const TREND_STYLE = {
  up:      { color:"text-green-600", icon:"↑", dot:"bg-green-500" },
  down:    { color:"text-red-500",   icon:"↓", dot:"bg-red-500"   },
  flat:    { color:"text-gray-400",  icon:"→", dot:"bg-gray-400"  },
  unknown: { color:"text-gray-400",  icon:"—", dot:"bg-gray-300"  },
};

// ── Bar Chart ──────────────────────────────────────────────────────────────
function BarChart({ series }: { series: ChartSeries }) {
  const allVals = series.datasets.flatMap(d => d.data).filter(n => !isNaN(n));
  const maxVal  = Math.max(...allVals, 1);

  return (
    <div className="space-y-2.5">
      {series.xAxis.map((label, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 truncate max-w-xs">{label}</span>
            <div className="flex gap-3">
              {series.datasets.map((ds, di) => (
                <span key={di} className="text-xs font-bold text-gray-800">
                  {typeof ds.data[i] === "number" ? ds.data[i].toLocaleString() : ds.data[i] ?? "—"}
                </span>
              ))}
            </div>
          </div>
          {series.datasets.map((ds, di) => {
            const pct = Math.max(((ds.data[i] ?? 0) / maxVal) * 100, 0);
            return (
              <div key={di} className="h-6 bg-gray-100 rounded overflow-hidden mb-0.5">
                <div className="h-full rounded transition-all duration-700 flex items-center justify-end pr-2"
                  style={{ width: `${pct}%`, background: ds.color || COLORS[di % COLORS.length] }}>
                  {pct > 15 && <span className="text-white text-xs font-medium">{pct.toFixed(0)}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {series.datasets.length > 1 && (
        <div className="flex flex-wrap gap-3 pt-1">
          {series.datasets.map((ds, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: ds.color || COLORS[i % COLORS.length] }}/>
              <span className="text-xs text-gray-500">{ds.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Line / Area Chart ──────────────────────────────────────────────────────
function LineChart({ series }: { series: ChartSeries }) {
  const W = 460, H = 160, PX = 36, PY = 20;
  const allVals = series.datasets.flatMap(d => d.data).filter(n => !isNaN(n));
  const maxY = Math.max(...allVals, 1);
  const minY = Math.min(...allVals, 0);
  const rng  = maxY - minY || 1;
  const isArea = series.type === "area";

  function tx(i: number, n: number) { return PX + (i / Math.max(n - 1, 1)) * (W - PX * 2); }
  function ty(v: number) { return PY + ((maxY - v) / rng) * (H - PY * 2); }

  // Grid values
  const gridVals = [maxY, maxY * 0.75, maxY * 0.5, maxY * 0.25, 0];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
        {/* Grid */}
        {gridVals.map((v, i) => {
          const y = ty(v);
          return (
            <g key={i}>
              <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#f3f4f6" strokeWidth="1"/>
              <text x={PX - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#9ca3af">
                {v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {series.datasets.map((ds, di) => {
          const col = ds.color || COLORS[di % COLORS.length];
          const n   = ds.data.length;
          const pts = ds.data.map((v, i) => `${tx(i, n)},${ty(v)}`).join(" ");
          const areaPath = `M${tx(0, n)},${ty(0)} ` + ds.data.map((v, i) => `L${tx(i, n)},${ty(v)}`).join(" ") + ` L${tx(n-1, n)},${ty(0)} Z`;

          return (
            <g key={di}>
              {isArea && (
                <path d={areaPath} fill={col} opacity="0.12"/>
              )}
              <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round"/>
              {ds.data.map((v, i) => (
                <circle key={i} cx={tx(i, n)} cy={ty(v)} r="3.5" fill={col} stroke="white" strokeWidth="1.5"/>
              ))}
            </g>
          );
        })}

        {/* X labels */}
        {series.xAxis.slice(0, 8).map((l, i) => {
          const n = Math.min(series.xAxis.length, 8);
          return (
            <text key={i} x={tx(i, n)} y={H - 4} textAnchor="middle" fontSize="8" fill="#9ca3af">
              {l.length > 10 ? l.slice(0, 10) + "…" : l}
            </text>
          );
        })}
      </svg>

      {series.datasets.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-1">
          {series.datasets.map((ds, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full" style={{ background: ds.color || COLORS[i % COLORS.length] }}/>
              <span className="text-xs text-gray-500">{ds.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pie / Donut Chart ──────────────────────────────────────────────────────
function PieChart({ series }: { series: ChartSeries }) {
  const ds    = series.datasets[0];
  if (!ds || ds.data.length === 0) return null;
  const total = ds.data.reduce((a, b) => a + b, 0) || 1;
  let angle   = -Math.PI / 2;

  const slices = ds.data.map((val, i) => {
    const sweep = (val / total) * Math.PI * 2;
    const s     = angle;
    angle      += sweep;
    const r     = 52;
    const x1    = 65 + r * Math.cos(s);
    const y1    = 65 + r * Math.sin(s);
    const x2    = 65 + r * Math.cos(angle);
    const y2    = 65 + r * Math.sin(angle);
    return {
      d:     `M65,65 L${x1},${y1} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0},1 ${x2},${y2} Z`,
      color: COLORS[i % COLORS.length],
      label: series.xAxis[i] || `Item ${i+1}`,
      pct:   Math.round((val / total) * 100),
      val,
    };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 130 130" className="w-32 h-32 flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth="2"/>
        ))}
        <circle cx="65" cy="65" r="28" fill="white"/>
        <text x="65" y="60" textAnchor="middle" fontSize="9" fill="#6b7280">Total</text>
        <text x="65" y="72" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">
          {total >= 1000 ? `${(total/1000).toFixed(1)}k` : total}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }}/>
            <span className="text-xs text-gray-600 truncate flex-1">{s.label}</span>
            <span className="text-xs font-bold text-gray-900 flex-shrink-0">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────
function DataTable({ table }: { table: TableData }) {
  const [sortCol, setSortCol]   = useState<number | null>(null);
  const [sortDir, setSortDir]   = useState<"asc"|"desc">("desc");
  const [expanded, setExpanded] = useState(false);

  function handleSort(i: number) {
    if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(i); setSortDir("desc"); }
  }

  const sortedRows = useMemo(() => {
    if (sortCol === null) return table.rows;
    return [...table.rows].sort((a, b) => {
      const av = parseFloat(a[sortCol].replace(/[^0-9.-]/g, "")) || 0;
      const bv = parseFloat(b[sortCol].replace(/[^0-9.-]/g, "")) || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [table.rows, sortCol, sortDir]);

  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, 8);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {table.headers.map((h, i) => (
                <th key={i}
                  onClick={() => table.sortable !== false && handleSort(i)}
                  className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${table.sortable !== false ? "cursor-pointer hover:bg-gray-100 select-none" : ""}`}>
                  <div className="flex items-center gap-1">
                    {h}
                    {table.sortable !== false && (
                      <span className="text-gray-300">
                        {sortCol === i ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visibleRows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-gray-50/50 hover:bg-gray-50"}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.rows.length > 8 && (
        <button onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 font-medium">
          {expanded ? "↑ Show less" : `↓ Show all ${table.rows.length} rows`}
        </button>
      )}
    </div>
  );
}

// ── Filter pills ───────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600"
      }`}>
      {label}
    </button>
  );
}

// ── Narrative ──────────────────────────────────────────────────────────────
function Narrative({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h4 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
        <span className="text-blue-500">📋</span> Analysis Notes
      </h4>
      <div className="space-y-0.5">
        {text.split("\n").map((line, i) => {
          if (!line.trim()) return <div key={i} className="h-2"/>;
          if (line.startsWith("**") && line.endsWith("**"))
            return <div key={i} className="font-bold text-gray-900 text-sm mt-4 mb-1.5 pb-1 border-b border-gray-100">{line.replace(/\*\*/g, "")}</div>;
          if (line.match(/\*\*(.*?)\*\*/))
            return <div key={i} className="text-sm text-gray-700 leading-relaxed mb-1"
              dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}/>;
          if (line.match(/^[🚨⚠️✅❓→•-]/))
            return <div key={i} className="text-sm text-gray-600 pl-2 leading-relaxed border-l-2 border-gray-200 ml-1">{line}</div>;
          return <div key={i} className="text-sm text-gray-700 leading-relaxed">{line}</div>;
        })}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function AnalysisDashboard({
  data,
  narrative,
  bizName,
  filesCount,
  mode,
  onReanalyze,
  onDiscuss,
}: {
  data:         DashboardData;
  narrative:    string;
  bizName:      string;
  filesCount:   number;
  mode:         string;
  onReanalyze?: () => void;
  onDiscuss?:   () => void;
}) {
  const [activeCat,    setActiveCat]    = useState("all");
  const [activePeriod, setActivePeriod] = useState("all");
  const [activeChart,  setActiveChart]  = useState<"bar"|"line"|"pie"|"area"|"all">("all");
  const [search,       setSearch]       = useState("");

  const modeLabel: Record<string, string> = {
    explain: "💡 Full Report",
    meeting: "🗓️ Meeting Prep",
    anomaly: "🔍 Issues Found",
    action:  "⚡ Action Plan",
  };

  // Collect all chart series (support both 'series' and legacy 'charts')
  const allSeries = useMemo(() => [...(data.series || []), ...(data.charts || [])], [data]);

  // Categories from data
  const categories = useMemo(() => {
    const cats = new Set<string>();
    data.kpis?.forEach(k => k.category && cats.add(k.category));
    allSeries.forEach(s => s.category && cats.add(s.category));
    data.tables?.forEach(t => t.category && cats.add(t.category));
    return ["all", ...Array.from(cats)];
  }, [data, allSeries]);

  // Periods from data
  const periods = useMemo(() => {
    const ps = new Set<string>();
    data.kpis?.forEach(k => k.period && ps.add(k.period));
    data.availableFilters?.periods?.forEach(p => ps.add(p));
    return ps.size > 0 ? ["all", ...Array.from(ps)] : [];
  }, [data]);

  // Filtered KPIs
  const filteredKpis = useMemo(() => {
    if (!data.kpis) return [];
    return data.kpis.filter(k => {
      const matchCat    = activeCat === "all" || k.category === activeCat;
      const matchPeriod = activePeriod === "all" || k.period === activePeriod;
      const matchSearch = !search || k.label.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchPeriod && matchSearch;
    });
  }, [data.kpis, activeCat, activePeriod, search]);

  // Filtered series
  const filteredSeries = useMemo(() => {
    return allSeries.filter(s => {
      const matchCat   = activeCat === "all" || s.category === activeCat;
      const matchChart = activeChart === "all" || s.type === activeChart;
      return matchCat && matchChart;
    });
  }, [allSeries, activeCat, activeChart]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (!data.tables) return [];
    return data.tables.filter(t =>
      activeCat === "all" || t.category === activeCat
    );
  }, [data.tables, activeCat]);

  const hasData = (data.kpis?.length || 0) + allSeries.length + (data.tables?.length || 0) > 0;

  return (
    <div className="space-y-4">

      {/* ── Dashboard Header ── */}
      <div className="bg-gray-900 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              DashWise · {filesCount} file{filesCount !== 1 ? "s" : ""} analyzed
            </div>
            <div className="text-xl font-bold truncate">
              {modeLabel[mode] || mode} — {bizName}
            </div>
            {data.summary && (
              <p className="text-gray-300 text-sm mt-2 leading-relaxed max-w-2xl">{data.summary}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {onDiscuss && (
              <button onClick={onDiscuss}
                className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
                💬 Ask Advisor
              </button>
            )}
            {onReanalyze && (
              <button onClick={onReanalyze}
                className="bg-white/10 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-white/20">
                ↻ Re-analyze
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      {hasData && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-3">

            {/* Search */}
            <div className="relative flex-shrink-0">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search metrics..."
                className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-gray-200 hidden sm:block"/>

            {/* Category filters */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-gray-400 font-medium">Category:</span>
                {categories.map(cat => (
                  <FilterPill key={cat} label={cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    active={activeCat === cat} onClick={() => setActiveCat(cat)}/>
                ))}
              </div>
            )}

            {/* Period filters */}
            {periods.length > 1 && (
              <>
                <div className="h-5 w-px bg-gray-200 hidden sm:block"/>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-gray-400 font-medium">Period:</span>
                  {periods.map(p => (
                    <FilterPill key={p} label={p === "all" ? "All" : p}
                      active={activePeriod === p} onClick={() => setActivePeriod(p)}/>
                  ))}
                </div>
              </>
            )}

            {/* Chart type filters */}
            {allSeries.length > 0 && (
              <>
                <div className="h-5 w-px bg-gray-200 hidden sm:block"/>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-gray-400 font-medium">View:</span>
                  {(["all","bar","line","pie","area"] as const).map(ct => (
                    <FilterPill key={ct} label={ct === "all" ? "All charts" : ct.charAt(0).toUpperCase() + ct.slice(1)}
                      active={activeChart === ct} onClick={() => setActiveChart(ct)}/>
                  ))}
                </div>
              </>
            )}

            {/* Reset */}
            {(activeCat !== "all" || activePeriod !== "all" || activeChart !== "all" || search) && (
              <button onClick={() => { setActiveCat("all"); setActivePeriod("all"); setActiveChart("all"); setSearch(""); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium ml-auto">
                ✕ Reset filters
              </button>
            )}
          </div>

          {/* Active filter summary */}
          {(activeCat !== "all" || activePeriod !== "all") && (
            <div className="mt-2 text-xs text-blue-600">
              Showing: {filteredKpis.length} metric{filteredKpis.length !== 1 ? "s" : ""},
              {" "}{filteredSeries.length} chart{filteredSeries.length !== 1 ? "s" : ""},
              {" "}{filteredTables.length} table{filteredTables.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* ── Alerts ── */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.alerts.map((alert, i) => {
            const s = ALERT_STYLE[alert.level] || ALERT_STYLE.info;
            return (
              <div key={i} className={`${s.bg} border ${s.border} rounded-xl p-4 flex gap-3`}>
                <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
                <div>
                  <div className={`font-semibold text-sm ${s.head}`}>{alert.title}</div>
                  <div className={`text-xs mt-0.5 ${s.body} leading-relaxed`}>{alert.message}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── KPI Cards ── */}
      {filteredKpis.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Key Metrics {search && `— "${search}"`}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {filteredKpis.map((kpi, i) => {
              const t = TREND_STYLE[kpi.trend || "unknown"];
              return (
                <div key={kpi.id || i}
                  className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <div className="text-xs text-gray-400 uppercase tracking-wider leading-tight">{kpi.label}</div>
                    {kpi.category && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0 capitalize">
                        {kpi.category}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{kpi.value}</div>
                  {kpi.trendPct && kpi.trend !== "unknown" && (
                    <div className={`flex items-center gap-1 text-xs font-semibold ${t.color}`}>
                      <span>{t.icon}</span>
                      <span>{kpi.trendPct}</span>
                      {kpi.period && <span className="text-gray-400 font-normal ml-1">{kpi.period}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Charts ── */}
      {filteredSeries.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Charts & Trends
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSeries.map((s, i) => (
              <div key={s.id || i} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 text-sm">{s.name}</h4>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
                    {s.type}
                  </span>
                </div>
                {(s.type === "bar") && <BarChart series={s}/>}
                {(s.type === "line" || s.type === "area") && <LineChart series={s}/>}
                {s.type === "pie" && <PieChart series={s}/>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tables ── */}
      {filteredTables.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Data Tables
          </div>
          <div className="space-y-4">
            {filteredTables.map((table, i) => (
              <div key={table.id || i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900 text-sm">{table.title}</h4>
                  <div className="flex items-center gap-2">
                    {table.category && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
                        {table.category}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{table.rows.length} rows</span>
                  </div>
                </div>
                <DataTable table={table}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty filtered state */}
      {hasData && filteredKpis.length === 0 && filteredSeries.length === 0 && filteredTables.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <div className="text-2xl mb-2">🔍</div>
          <div className="text-gray-500 text-sm">No data matches your current filters.</div>
          <button onClick={() => { setActiveCat("all"); setActivePeriod("all"); setSearch(""); }}
            className="mt-3 text-xs text-blue-600 hover:underline font-medium">
            Reset filters
          </button>
        </div>
      )}

      {/* ── AI Narrative ── */}
      {narrative && <Narrative text={narrative}/>}

    </div>
  );
}
