"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Nav from "@/components/Nav";
import { C, radius, shadow } from "@/lib/styles";

// ── Types ──────────────────────────────────────────────────
type AdminUser = {
  uid:           string;
  email:         string;
  name:          string;
  bizName:       string;
  bizType:       string;
  goals:         string[];
  advisorTone:   string;
  subscription:  string;
  uploadsCount:  number;
  folderCount:   number;
  fileCount:     number;
  analysisCount: number;
  totalRows:     number;
  createdAt:     string | null;
  lastAnalyzedAt: string | null;
};
type Metrics = {
  planCounts:         Record<string, number>;
  totalUploads:       number;
  totalAnalyses:      number;
  totalFilesAll:      number;
  estMonthlyRevenue:  number;
};

const PLANS = ["free","pro","team","business"] as const;
const PLAN_STYLE: Record<string,{ bg:string; color:string; border:string; price:string }> = {
  free:     { bg:"#f5f5f7", color:"#86868b", border:"#e5e5ea", price:"$0" },
  pro:      { bg:"#e8f0fe", color:C.blue,    border:"#c0d8f5", price:"$29" },
  team:     { bg:"#f3e8fd", color:"#af52de", border:"#e0c5f5", price:"$199" },
  business: { bg:"#fff3e0", color:"#ff9f0a", border:"#ffe0b0", price:"$799" },
};

function Spinner({ size=18, color=C.blue }: { size?:number; color?:string }) {
  return <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}
function fmtRows(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(0)}K`;
  return String(n);
}
function daysSince(iso: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Metric tile ────────────────────────────────────────────
function MetricTile({ label, value, sub, color }: { label:string; value:string|number; sub?:string; color?:string }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"18px 20px", boxShadow:shadow.sm }}>
      <div style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", color:C.text3, marginBottom:9 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.5px", color:color||C.text }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:C.text3, marginTop:5 }}>{sub}</div>}
    </div>
  );
}

// ── Plan badge ─────────────────────────────────────────────
function PlanBadge({ plan }: { plan:string }) {
  const s = PLAN_STYLE[plan] || PLAN_STYLE.free;
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20, background:s.bg, color:s.color, border:`1px solid ${s.border}`, textTransform:"capitalize", letterSpacing:"0.3px" }}>
      {plan} {s.price !== "$0" && <span style={{ opacity:.75 }}>· {s.price}/mo</span>}
    </span>
  );
}

// ── Activity indicator ─────────────────────────────────────
function ActivityDot({ days }: { days:number }) {
  const color = days <= 3 ? C.green : days <= 14 ? C.amber : days <= 30 ? "#ff9f0a" : C.text3;
  const label = days <= 3 ? "Active" : days <= 14 ? "Recent" : days <= 30 ? "Quiet" : days < 9999 ? "Inactive" : "Never";
  return (
    <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:color, flexShrink:0 }}/>
      {label}
    </span>
  );
}

// ── User row with expandable detail ───────────────────────
function UserRow({
  u, onChangePlan, onDisable, updating,
}: {
  u: AdminUser;
  onChangePlan: (uid:string, plan:string) => void;
  onDisable:    (uid:string, email:string) => void;
  updating:     string | null;
}) {
  const [open, setOpen] = useState(false);
  const days = daysSince(u.createdAt);

  return (
    <div style={{ borderBottom:`1px solid #f5f5f7` }}>
      {/* Main row */}
      <div
        onClick={()=>setOpen(o=>!o)}
        style={{ display:"grid", alignItems:"center", gridTemplateColumns:"2fr 1.1fr 0.9fr 0.7fr 0.7fr 0.7fr 1.2fr", gap:10, padding:"13px 18px", cursor:"pointer", transition:"background .1s" }}
        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="#fafafa"}
        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}>
        {/* User */}
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name || "(no name)"}</div>
          <div style={{ fontSize:11.5, color:C.text3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</div>
        </div>
        {/* Business */}
        <div style={{ fontSize:12, color:C.text2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {u.bizName || <span style={{ color:C.text3, fontStyle:"italic" }}>Not set</span>}
          {u.bizType && <div style={{ fontSize:10.5, color:C.text3 }}>{u.bizType}</div>}
        </div>
        {/* Plan */}
        <div><PlanBadge plan={u.subscription}/></div>
        {/* Folders / Files */}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{u.folderCount}</div>
          <div style={{ fontSize:10.5, color:C.text3 }}>folders</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{u.fileCount}</div>
          <div style={{ fontSize:10.5, color:C.text3 }}>{fmtRows(u.totalRows)} rows</div>
        </div>
        {/* Analyses */}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:600, color:u.analysisCount>0?C.blue:C.text3 }}>{u.analysisCount}</div>
          <div style={{ fontSize:10.5, color:C.text3 }}>analyses</div>
        </div>
        {/* Activity + expand */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <ActivityDot days={days}/>
          <span style={{ fontSize:11, color:C.text3, transform:open?"rotate(180deg)":"none", transition:"transform .2s" }}>▾</span>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ background:"#fafbfc", borderTop:`1px solid ${C.border}`, padding:"18px 24px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
          {/* Account info */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:12 }}>Account</div>
            {[
              ["UID",         u.uid.slice(0,16)+"…"],
              ["Joined",      fmtDate(u.createdAt)],
              ["Last active", u.lastAnalyzedAt ? fmtDate(u.lastAnalyzedAt) : "Never"],
              ["Advisor tone",u.advisorTone || "—"],
              ["Goals",       u.goals?.join(", ") || "—"],
            ].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:7, fontSize:12 }}>
                <span style={{ color:C.text3, flexShrink:0 }}>{k}</span>
                <span style={{ color:C.text2, fontWeight:500, textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:180 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Usage stats */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:12 }}>Usage</div>
            {[
              ["Files uploaded",  u.uploadsCount],
              ["Files stored",    u.fileCount],
              ["Folders",         u.folderCount],
              ["Analyses run",    u.analysisCount],
              ["Total rows",      fmtRows(u.totalRows)],
            ].map(([k,v]) => (
              <div key={String(k)} style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:7, fontSize:12 }}>
                <span style={{ color:C.text3 }}>{k}</span>
                <span style={{ color:C.text, fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3, marginBottom:12 }}>Actions</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:C.text3, marginBottom:6, fontWeight:600 }}>Change plan</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {PLANS.map(p => {
                  const s = PLAN_STYLE[p];
                  const isCurrent = u.subscription === p;
                  return (
                    <button key={p} onClick={()=>onChangePlan(u.uid, p)} disabled={isCurrent || updating===u.uid}
                      style={{ fontSize:11.5, fontWeight:600, padding:"6px 12px", borderRadius:8, cursor:isCurrent?"default":"pointer",
                        background: isCurrent ? s.bg : C.surface, color: isCurrent ? s.color : C.text2,
                        border:`1.5px solid ${isCurrent ? s.color : C.border}`,
                        opacity:isCurrent?1:0.8, transition:"all .15s" }}>
                      {updating===u.uid && !isCurrent ? "…" : p}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={()=>onDisable(u.uid, u.email)}
              style={{ fontSize:11.5, color:C.red, background:"#fff0f0", border:"1px solid #ffd6d6", borderRadius:8, padding:"7px 14px", cursor:"pointer", width:"100%" }}>
              🚫 Disable account
            </button>
            <div style={{ fontSize:10.5, color:C.text3, marginTop:6, lineHeight:1.5 }}>
              Disabling flags the account — data is preserved, access is blocked. You can re-enable by changing the plan.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan distribution bar ──────────────────────────────────
function PlanBar({ counts, total }: { counts:Record<string,number>; total:number }) {
  if (total === 0) return null;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"16px 20px", boxShadow:shadow.sm }}>
      <div style={{ fontSize:10.5, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>Plan breakdown</div>
      <div style={{ display:"flex", height:12, borderRadius:6, overflow:"hidden", marginBottom:12, gap:1 }}>
        {PLANS.map(p => {
          const pct = total ? ((counts[p]||0)/total)*100 : 0;
          if (pct === 0) return null;
          return <div key={p} style={{ width:`${pct}%`, background:PLAN_STYLE[p].color, transition:"width .4s ease" }}/>;
        })}
      </div>
      <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
        {PLANS.map(p => (
          <div key={p} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:10, height:10, borderRadius:3, background:PLAN_STYLE[p].color, flexShrink:0 }}/>
            <span style={{ fontSize:12, color:C.text2, textTransform:"capitalize" }}>{p}</span>
            <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{counts[p]||0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Admin page ─────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [metrics,     setMetrics]     = useState<Metrics | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [updating,    setUpdating]    = useState<string|null>(null);
  const [search,      setSearch]      = useState("");
  const [planFilter,  setPlanFilter]  = useState<string>("all");
  const [sortBy,      setSortBy]      = useState<"joined"|"activity"|"files"|"analyses">("joined");

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "";
  const isAdmin = !!user?.email && !!adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/login"); return; }
    if (!isAdmin) { router.push("/dashboard"); return; }
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, isAdmin]);

  async function loadUsers() {
    if (!user) return;
    setDataLoading(true); setErrorMsg("");
    try {
      const token = await user.getIdToken();
      const res   = await fetch("/api/admin/users", { headers:{ Authorization:`Bearer ${token}` } });
      const data  = await res.json() as { success?:boolean; users?:AdminUser[]; metrics?:Metrics; error?:string };
      if (!res.ok || !data.success) throw new Error(data.error || `Server error (${res.status})`);
      setUsers(data.users || []);
      setMetrics(data.metrics || null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load users");
    } finally { setDataLoading(false); }
  }

  async function changePlan(uid: string, subscription: string) {
    if (!user) return;
    setUpdating(uid); setErrorMsg("");
    try {
      const token = await user.getIdToken();
      const res   = await fetch("/api/admin/users", {
        method:"PATCH", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ uid, subscription }),
      });
      const data = await res.json() as { success?:boolean; error?:string };
      if (!res.ok || !data.success) throw new Error(data.error || "Update failed");
      setUsers(prev => prev.map(u => u.uid===uid ? { ...u, subscription } : u));
      // Update metrics plan counts
      setMetrics(prev => {
        if (!prev) return prev;
        const old = users.find(u => u.uid===uid)?.subscription || "free";
        const nc = { ...prev.planCounts };
        nc[old] = Math.max(0,(nc[old]||0)-1);
        nc[subscription] = (nc[subscription]||0)+1;
        return { ...prev, planCounts: nc };
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update plan");
    } finally { setUpdating(null); }
  }

  async function disableUser(uid: string, email: string) {
    if (!user) return;
    if (!confirm(`Disable account for ${email}?\n\nThey won't be able to use DashWise but their data is preserved.`)) return;
    setUpdating(uid);
    try {
      const token = await user.getIdToken();
      await fetch("/api/admin/users", {
        method:"DELETE", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ uid }),
      });
      setUsers(prev => prev.filter(u => u.uid !== uid));
    } catch { setErrorMsg("Failed to disable account"); }
    finally { setUpdating(null); }
  }

  const filtered = useMemo(() => {
    let list = [...users];
    if (planFilter !== "all") list = list.filter(u => u.subscription===planFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.bizName.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy==="joined")    return new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime();
      if (sortBy==="files")     return b.fileCount - a.fileCount;
      if (sortBy==="analyses")  return b.analysisCount - a.analysisCount;
      if (sortBy==="activity")  return daysSince(a.createdAt) - daysSince(b.createdAt);
      return 0;
    });
    return list;
  }, [users, planFilter, search, sortBy]);

  const activeThisWeek = users.filter(u => daysSince(u.createdAt) <= 7).length;

  if (loading || (!user && !loading)) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner size={30}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (!isAdmin) return null;

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:1200, margin:"0 auto", padding:"28px 20px" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, marginBottom:24, flexWrap:"wrap" }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:4 }}>🛡️ Admin Panel</h1>
            <p style={{ fontSize:13, color:C.text3 }}>Monitor all DashWise accounts, usage, and subscriptions</p>
          </div>
          <button onClick={loadUsers} disabled={dataLoading}
            style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 16px", fontSize:13, color:C.text2, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
            {dataLoading ? <Spinner size={13}/> : "↻"} Refresh
          </button>
        </div>

        {errorMsg && (
          <div style={{ background:"#fff0f0", border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"12px 14px", borderRadius:radius.sm, marginBottom:16, display:"flex", justifyContent:"space-between" }}>
            <span>⚠ {errorMsg}</span>
            <button onClick={()=>setErrorMsg("")} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>×</button>
          </div>
        )}

        {/* KPI metric grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:13, marginBottom:18 }}>
          <MetricTile label="Total users"        value={users.length}                 color={C.blue}/>
          <MetricTile label="New this week"       value={activeThisWeek}              color={C.green} sub={users.length ? `${((activeThisWeek/users.length)*100).toFixed(0)}% of total` : undefined}/>
          <MetricTile label="Est. MRR"            value={`$${(metrics?.estMonthlyRevenue||0).toLocaleString()}`} color={C.green} sub="Pro + Team + Business"/>
          <MetricTile label="Total files"         value={metrics?.totalFilesAll||0}    color={C.text}/>
          <MetricTile label="Total uploads"       value={metrics?.totalUploads||0}     color={C.text}/>
          <MetricTile label="Total analyses"      value={metrics?.totalAnalyses||0}    color={C.purple}/>
          <MetricTile label="Paying users"        value={(metrics?.planCounts.pro||0)+(metrics?.planCounts.team||0)+(metrics?.planCounts.business||0)} color={C.amber} sub={`${metrics?.planCounts.free||0} on free`}/>
        </div>

        {/* Plan bar */}
        {metrics && <div style={{ marginBottom:18 }}><PlanBar counts={metrics.planCounts} total={users.length}/></div>}

        {/* Controls */}
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email, business…"
            style={{ flex:1, minWidth:200, background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"10px 14px", fontSize:13, color:C.text, outline:"none" }}/>
          {/* Plan filter */}
          <div style={{ display:"flex", gap:6 }}>
            {["all",...PLANS].map(p => (
              <button key={p} onClick={()=>setPlanFilter(p)} style={{ fontSize:12, fontWeight:600, padding:"8px 13px", borderRadius:8, cursor:"pointer", textTransform:"capitalize",
                background: planFilter===p ? C.text : C.surface, color: planFilter===p ? "#fff" : C.text2,
                border:`1px solid ${planFilter===p ? C.text : C.border}` }}>{p}</button>
            ))}
          </div>
          {/* Sort */}
          <select value={sortBy} onChange={e=>setSortBy(e.target.value as typeof sortBy)}
            style={{ fontSize:12, padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.text, cursor:"pointer", outline:"none" }}>
            <option value="joined">Sort: Newest</option>
            <option value="activity">Sort: Most active</option>
            <option value="files">Sort: Most files</option>
            <option value="analyses">Sort: Most analyses</option>
          </select>
        </div>

        {/* Users table */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1.1fr 0.9fr 0.7fr 0.7fr 0.7fr 1.2fr", gap:10, padding:"11px 18px", background:"#f9f9fb", borderBottom:`1px solid ${C.border}`, fontSize:10.5, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.7px", color:C.text3 }}>
            <span>User</span><span>Business</span><span>Plan</span><span>Folders</span><span>Files</span><span>Analyses</span><span>Activity</span>
          </div>

          {dataLoading ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:48 }}>
              <Spinner/><span style={{ fontSize:13, color:C.text3 }}>Loading users…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:"center", padding:48, fontSize:13, color:C.text3 }}>
              {search||planFilter!=="all" ? "No users match your filters." : "No users yet."}
            </div>
          ) : (
            filtered.map(u => (
              <UserRow key={u.uid} u={u} onChangePlan={changePlan} onDisable={disableUser} updating={updating}/>
            ))
          )}
        </div>

        <p style={{ fontSize:11.5, color:C.text3, marginTop:14, lineHeight:1.6, textAlign:"center" }}>
          🔒 Accessible only to {adminEmail} · Every action verified server-side via Firebase ID token · User file contents are never shown here
        </p>
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
