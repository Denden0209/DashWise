"use client";
// /admin — Super-user panel. Only visible/usable by the account whose email
// matches NEXT_PUBLIC_ADMIN_EMAIL. Every API call is re-verified server-side.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Nav from "@/components/Nav";
import { C, radius, shadow } from "@/lib/styles";

type AdminUser = {
  uid:          string;
  email:        string;
  name:         string;
  bizName:      string;
  bizType:      string;
  subscription: string;
  uploadsCount: number;
  createdAt:    string | null;
};

const PLANS = ["free", "pro", "team", "business"];
const PLAN_COLORS: Record<string,{bg:string;color:string;border:string}> = {
  free:     { bg:"#f5f5f7", color:"#86868b", border:"#e5e5ea" },
  pro:      { bg:"#e8f0fe", color:"#0071e3", border:"#c0d8f5" },
  team:     { bg:"#f3e8fd", color:"#af52de", border:"#e0c5f5" },
  business: { bg:"#fff3e0", color:"#ff9f0a", border:"#ffe0b0" },
};

function Spinner({ size=18, color=C.blue }: { size?:number; color?:string }) {
  return <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [updating,    setUpdating]    = useState<string|null>(null);
  const [search,      setSearch]      = useState("");

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
      const res   = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const data  = await res.json() as { success?:boolean; users?:AdminUser[]; error?:string };
      if (!res.ok || !data.success) throw new Error(data.error || `Server error (${res.status})`);
      setUsers(data.users || []);
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
        method:  "PATCH",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body:    JSON.stringify({ uid, subscription }),
      });
      const data = await res.json() as { success?:boolean; error?:string };
      if (!res.ok || !data.success) throw new Error(data.error || "Update failed");
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, subscription } : u));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update subscription");
    } finally { setUpdating(null); }
  }

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.bizName.toLowerCase().includes(q);
  });

  const planCounts = PLANS.reduce((acc, p) => {
    acc[p] = users.filter(u => u.subscription === p).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading || (!user && !loading)) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner size={30}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!isAdmin) return null;

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>

        <div style={{ marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, flexWrap:"wrap" as const }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:5 }}>🛡️ Admin Panel</h1>
            <p style={{ fontSize:14, color:C.text3 }}>Manage all DashWise accounts and subscriptions</p>
          </div>
          <button onClick={loadUsers} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 16px", fontSize:13, color:C.text2, cursor:"pointer" }}>
            ↻ Refresh
          </button>
        </div>

        {/* Metric bar */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:12, marginBottom:24 }}>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"16px 18px", boxShadow:shadow.sm }}>
            <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.7px", color:C.text3, marginBottom:8 }}>Total users</div>
            <div style={{ fontSize:24, fontWeight:700, color:C.text }}>{users.length}</div>
          </div>
          {PLANS.map(p => (
            <div key={p} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:"16px 18px", boxShadow:shadow.sm }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.7px", color:PLAN_COLORS[p].color, marginBottom:8 }}>{p}</div>
              <div style={{ fontSize:24, fontWeight:700, color:C.text }}>{planCounts[p] || 0}</div>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:13, padding:"12px 14px", borderRadius:radius.sm, marginBottom:16 }}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* Search */}
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Search by email, name, or business..."
          style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:16, boxSizing:"border-box" as const }}
        />

        {/* Users table */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
          {/* Header row */}
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1.2fr 1fr 0.7fr 0.7fr 1.1fr", gap:10, padding:"12px 18px", background:C.bg, borderBottom:`1px solid ${C.border}`, fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.6px", color:C.text3 }}>
            <span>User</span><span>Business</span><span>Joined</span><span>Uploads</span><span>Plan</span><span>Change plan</span>
          </div>

          {dataLoading ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:"40px" }}>
              <Spinner/><span style={{ fontSize:13, color:C.text3 }}>Loading users...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px", fontSize:13, color:C.text3 }}>
              {search ? "No users match your search." : "No users yet."}
            </div>
          ) : (
            filtered.map((u, i) => {
              const planStyle = PLAN_COLORS[u.subscription] || PLAN_COLORS.free;
              return (
                <div key={u.uid} style={{ display:"grid", gridTemplateColumns:"2fr 1.2fr 1fr 0.7fr 0.7fr 1.1fr", gap:10, padding:"13px 18px", borderBottom:i<filtered.length-1?`1px solid #f9f9fb`:"none", alignItems:"center" }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name || "—"}</div>
                    <div style={{ fontSize:12, color:C.text3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email || u.uid.slice(0,12)+"..."}</div>
                  </div>
                  <div style={{ fontSize:12, color:C.text2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {u.bizName || "—"}{u.bizType ? <span style={{ color:C.text3 }}> · {u.bizType}</span> : null}
                  </div>
                  <div style={{ fontSize:12, color:C.text3 }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </div>
                  <div style={{ fontSize:13, color:C.text2 }}>{u.uploadsCount}</div>
                  <div>
                    <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, background:planStyle.bg, color:planStyle.color, border:`1px solid ${planStyle.border}`, textTransform:"capitalize" as const }}>
                      {u.subscription}
                    </span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {updating === u.uid ? (
                      <Spinner size={14}/>
                    ) : (
                      <select
                        value={u.subscription}
                        onChange={e=>changePlan(u.uid, e.target.value)}
                        style={{ fontSize:12, padding:"6px 8px", borderRadius:radius.sm, border:`1px solid ${C.border}`, background:C.bg, color:C.text, cursor:"pointer", outline:"none", width:"100%" }}
                      >
                        {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p style={{ fontSize:12, color:C.text3, marginTop:14, lineHeight:1.6 }}>
          🔒 This panel is only accessible to {adminEmail}. Every action is verified server-side against your Firebase ID token — client-side spoofing is not possible. User file contents are never shown here for privacy.
        </p>
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
