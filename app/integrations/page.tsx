"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserFolders, BusinessFolder } from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

type Integration = {
  id: string; name: string; description: string;
  icon: string; color: string; bg: string;
  status: "available"|"coming"; category: string;
};

const INTEGRATIONS: Integration[] = [
  { id:"shopify",    name:"Shopify",       icon:"🛒", color:"#5a8a00", bg:"#f0f7e6", category:"E-Commerce",  status:"available", description:"Pull orders, revenue, products, customers, and inventory automatically from your store." },
  { id:"clover",     name:"Clover POS",    icon:"🍀", color:"#1da462", bg:"#e8f7ef", category:"Point of Sale",status:"available", description:"Connect your Clover merchant account for sales, top items, and hourly revenue data." },
  { id:"square",     name:"Square POS",    icon:"⬛", color:"#1a1a1a", bg:"#f5f5f5", category:"Point of Sale",status:"coming",    description:"Sync daily sales, top items, labor, and payment reports from Square." },
  { id:"quickbooks", name:"QuickBooks",    icon:"🟦", color:"#0077c5", bg:"#e6f2fb", category:"Accounting",  status:"coming",    description:"Pull P&L, invoices, expenses, and financial reports automatically." },
  { id:"stripe",     name:"Stripe",        icon:"💜", color:"#635bff", bg:"#f0effe", category:"Payments",    status:"coming",    description:"Revenue, MRR, churn, failed payments, and subscription analytics." },
  { id:"toast",      name:"Toast POS",     icon:"🔴", color:"#cc4400", bg:"#fef0eb", category:"Restaurant",  status:"coming",    description:"Daily sales, covers, labor cost, menu performance, and void reports." },
  { id:"woo",        name:"WooCommerce",   icon:"🟣", color:"#7f54b3", bg:"#f4f0f9", category:"E-Commerce",  status:"coming",    description:"Orders, products, revenue, and customer data from your store." },
  { id:"xero",       name:"Xero",          icon:"🔵", color:"#0e78f8", bg:"#e6f1fe", category:"Accounting",  status:"coming",    description:"Financial reports, bank reconciliation, invoices, and cash flow." },
];

const CATEGORIES = ["All", ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))];

// ── Shopify connect ────────────────────────────────────────
function ShopifyConnect({ userId, folders }: { userId: string; folders: BusinessFolder[] }) {
  const [shopInput,   setShopInput]   = useState("");
  const [connecting,  setConnecting]  = useState(false);
  const [error,       setError]       = useState("");

  async function handleConnect() {
    if (!shopInput.trim()) return;
    setConnecting(true); setError("");
    try {
      const res  = await fetch("/api/shopify/auth", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ shopDomain:shopInput.trim(), userId }) });
      const data = await res.json();
      if (!data.authURL) throw new Error(data.error || "Failed");
      window.location.href = data.authURL;
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Connection failed"); setConnecting(false); }
  }

  return (
    <div style={{ marginTop:16 }}>
      {error && <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:12, padding:"8px 12px", borderRadius:radius.sm, marginBottom:12 }}>{error}</div>}
      <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Your Shopify store name</label>
      <div style={{ display:"flex", gap:8, marginBottom:10 }}>
        <div style={{ position:"relative", flex:1 }}>
          <input value={shopInput} onChange={e=>setShopInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleConnect()} placeholder="mybrand" style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"10px 120px 10px 12px", fontSize:13, color:C.text, outline:"none" }}/>
          <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.text3, pointerEvents:"none" }}>.myshopify.com</span>
        </div>
      </div>
      <p style={{ fontSize:12, color:C.text3, marginBottom:12, lineHeight:1.5 }}>You&apos;ll be taken to Shopify to approve. DashWise only reads — never writes or changes anything.</p>
      <button onClick={handleConnect} disabled={!shopInput.trim()||connecting} style={{ ...btnPrimary, width:"100%", padding:"12px", borderRadius:radius.sm, background:"#5a8a00", opacity:(!shopInput.trim()||connecting)?.5:1 }}>
        {connecting ? "Connecting..." : "Connect with Shopify →"}
      </button>
    </div>
  );
}

function ShopifyConnected({ userId, shopInfo, folders }: { userId:string; shopInfo:{shopName:string;shopDomain:string}; folders:BusinessFolder[] }) {
  const [folder,  setFolder]  = useState(folders[0]?.id||"");
  const [syncing, setSyncing] = useState(false);
  const [result,  setResult]  = useState<{orders:number;revenue:number}|null>(null);
  const [error,   setError]   = useState("");

  async function handleSync() {
    if(!folder)return; setSyncing(true); setResult(null); setError("");
    try {
      const res=await fetch("/api/shopify/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,folderId:folder,daysBack:90})});
      const data=await res.json();
      if(!data.success)throw new Error(data.error);
      setResult({orders:data.ordersCount,revenue:data.revenue});
    } catch(err:unknown){setError(err instanceof Error?err.message:"Sync failed");}
    finally{setSyncing(false);}
  }

  return (
    <div style={{ marginTop:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#f0f7e6", border:"1px solid #c8e6c0", borderRadius:radius.sm, marginBottom:12 }}>
        <span style={{ fontSize:20 }}>🛒</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#2d5a00" }}>{shopInfo.shopName}</div>
          <div style={{ fontSize:11, color:"#5a8a00" }}>{shopInfo.shopDomain}</div>
        </div>
        <span style={{ fontSize:11, background:"#5a8a00", color:"#fff", padding:"2px 10px", borderRadius:20, fontWeight:600 }}>✓ Connected</span>
      </div>
      {result && <div style={{ background:"#e8f0fe", border:`1px solid ${C.blueMid}`, color:C.blue, fontSize:12, padding:"8px 12px", borderRadius:radius.sm, marginBottom:12 }}>✅ Synced <strong>{result.orders} orders</strong> · <strong>${result.revenue.toLocaleString(undefined,{maximumFractionDigits:2})}</strong> (last 90 days)</div>}
      {error && <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:12, padding:"8px 12px", borderRadius:radius.sm, marginBottom:12 }}>{error}</div>}
      {folders.length>0 ? (
        <>
          <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Sync into folder</label>
          <select value={folder} onChange={e=>setFolder(e.target.value)} style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"10px 12px", fontSize:13, color:C.text, marginBottom:10, outline:"none" }}>
            {folders.map(f=><option key={f.id} value={f.id}>{f.bizName}</option>)}
          </select>
          <button onClick={handleSync} disabled={syncing} style={{ ...btnPrimary, width:"100%", padding:"12px", borderRadius:radius.sm, background:"#0071e3", opacity:syncing?.5:1 }}>
            {syncing?"Syncing...":"🔄 Sync Now (last 90 days)"}
          </button>
        </>
      ) : (
        <div style={{ fontSize:12, color:C.text3, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:12 }}>
          <Link href="/files" style={{ color:C.blue, fontWeight:500 }}>Create a folder first</Link> — then sync your Shopify data into it.
        </div>
      )}
    </div>
  );
}

// ── Clover connect ─────────────────────────────────────────
function CloverConnect({ userId }: { userId: string }) {
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState("");

  async function handleConnect() {
    setConnecting(true); setError("");
    try {
      const res  = await fetch("/api/clover/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,environment:"production"})});
      const data = await res.json();
      if(!data.authURL)throw new Error(data.error||"Failed");
      window.location.href=data.authURL;
    } catch(err:unknown){setError(err instanceof Error?err.message:"Connection failed");setConnecting(false);}
  }

  return (
    <div style={{ marginTop:16 }}>
      {error && <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:12, padding:"8px 12px", borderRadius:radius.sm, marginBottom:12 }}>{error}</div>}
      <p style={{ fontSize:12, color:C.text3, marginBottom:12, lineHeight:1.5 }}>You&apos;ll be taken to Clover to approve. DashWise only reads — never writes or changes anything.</p>
      <button onClick={handleConnect} disabled={connecting} style={{ ...btnPrimary, width:"100%", padding:"12px", borderRadius:radius.sm, background:"#1da462", opacity:connecting?.5:1 }}>
        {connecting?"Connecting...":"Connect with Clover →"}
      </button>
    </div>
  );
}

function CloverConnected({ userId, merchantInfo, folders }: { userId:string; merchantInfo:{merchantName:string;merchantId:string}; folders:BusinessFolder[] }) {
  const [folder,  setFolder]  = useState(folders[0]?.id||"");
  const [syncing, setSyncing] = useState(false);
  const [result,  setResult]  = useState<{orders:number;revenue:number}|null>(null);
  const [error,   setError]   = useState("");

  async function handleSync() {
    if(!folder)return; setSyncing(true); setResult(null); setError("");
    try {
      const res=await fetch("/api/clover/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,folderId:folder,daysBack:90})});
      const data=await res.json();
      if(!data.success)throw new Error(data.error);
      setResult({orders:data.ordersCount,revenue:data.revenue});
    } catch(err:unknown){setError(err instanceof Error?err.message:"Sync failed");}
    finally{setSyncing(false);}
  }

  return (
    <div style={{ marginTop:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#e8f7ef", border:"1px solid #a8dfc0", borderRadius:radius.sm, marginBottom:12 }}>
        <span style={{ fontSize:20 }}>🍀</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#0d5c35" }}>{merchantInfo.merchantName}</div>
          <div style={{ fontSize:11, color:"#1da462" }}>ID: {merchantInfo.merchantId}</div>
        </div>
        <span style={{ fontSize:11, background:"#1da462", color:"#fff", padding:"2px 10px", borderRadius:20, fontWeight:600 }}>✓ Connected</span>
      </div>
      {result && <div style={{ background:"#e8f0fe", border:`1px solid ${C.blueMid}`, color:C.blue, fontSize:12, padding:"8px 12px", borderRadius:radius.sm, marginBottom:12 }}>✅ Synced <strong>{result.orders} orders</strong> · <strong>${result.revenue.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div>}
      {error && <div style={{ background:C.redBg, border:"1px solid #ffd6d6", color:C.red, fontSize:12, padding:"8px 12px", borderRadius:radius.sm, marginBottom:12 }}>{error}</div>}
      {folders.length>0 ? (
        <>
          <label style={{ display:"block", fontSize:12, fontWeight:500, color:C.text2, marginBottom:6 }}>Sync into folder</label>
          <select value={folder} onChange={e=>setFolder(e.target.value)} style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"10px 12px", fontSize:13, color:C.text, marginBottom:10, outline:"none" }}>
            {folders.map(f=><option key={f.id} value={f.id}>{f.bizName}</option>)}
          </select>
          <button onClick={handleSync} disabled={syncing} style={{ ...btnPrimary, width:"100%", padding:"12px", borderRadius:radius.sm, background:"#1da462", opacity:syncing?.5:1 }}>
            {syncing?"Syncing...":"🔄 Sync Now (last 90 days)"}
          </button>
        </>
      ) : (
        <div style={{ fontSize:12, color:C.text3, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:12 }}>
          <Link href="/files" style={{ color:C.blue, fontWeight:500 }}>Create a folder first</Link> — then sync your Clover data.
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────
function IntegrationsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyInfo,      setShopifyInfo]      = useState<{shopName:string;shopDomain:string}|null>(null);
  const [cloverConnected,  setCloverConnected]  = useState(false);
  const [cloverInfo,       setCloverInfo]       = useState<{merchantName:string;merchantId:string}|null>(null);
  const [folders,          setFolders]          = useState<BusinessFolder[]>([]);
  const [activeCategory,   setActiveCategory]   = useState("All");
  const [expandedId,       setExpandedId]       = useState<string|null>(null);
  const [banner,           setBanner]           = useState<{type:"success"|"error";msg:string}|null>(null);

  useEffect(() => {
    const connected  = searchParams.get("connected");
    const shop       = searchParams.get("shop");
    const merchant   = searchParams.get("merchant");
    const err        = searchParams.get("error");
    if (connected==="shopify" && shop) { setBanner({type:"success",msg:`✅ Connected to ${shop}!`}); setShopifyConnected(true); setExpandedId("shopify"); }
    if (connected==="clover")          { setBanner({type:"success",msg:`✅ Connected to ${merchant||"Clover"}!`}); setCloverConnected(true); setExpandedId("clover"); }
    if (err) {
      const msgs:Record<string,string>={shopify_auth_failed:"Shopify connection failed.",clover_auth_failed:"Clover connection failed.",missing_params:"Invalid callback.",invalid_state:"Security check failed."};
      setBanner({type:"error",msg:msgs[err]||"Connection failed."});
    }
  }, [searchParams]);

  useEffect(() => {
    if(!user)return;
    getUserFolders(user.uid).then(setFolders);
    import("@/lib/integrations/shopify").then(({getShopifyConnection})=>
      getShopifyConnection(user.uid).then(c=>{ if(c){setShopifyConnected(true);setShopifyInfo({shopName:c.shopName,shopDomain:c.shopDomain});} })
    );
    import("@/lib/integrations/clover").then(({getCloverConnection})=>
      getCloverConnection(user.uid).then(c=>{ if(c){setCloverConnected(true);setCloverInfo({merchantName:c.merchantName,merchantId:c.merchantId});} })
    );
  },[user]);

  const filtered = INTEGRATIONS.filter(i => activeCategory==="All" || i.category===activeCategory);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:900, margin:"0 auto", padding:"36px 28px" }}>

        {/* Header */}
        <div style={{ marginBottom:28 }}>
          <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:5 }}>Integrations</h1>
          <p style={{ fontSize:14, color:C.text3 }}>Connect your tools — DashWise pulls your data automatically. No manual exports.</p>
        </div>

        {/* Banner */}
        {banner && (
          <div style={{ background:banner.type==="success"?"#f0faf4":C.redBg, border:`1px solid ${banner.type==="success"?"#c8e6c0":"#ffd6d6"}`, color:banner.type==="success"?"#2d5a00":C.red, fontSize:13, padding:"12px 16px", borderRadius:radius.sm, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            {banner.msg}
            <button onClick={()=>setBanner(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"inherit", opacity:0.6 }}>×</button>
          </div>
        )}

        {/* Category filter */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:24 }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={()=>setActiveCategory(cat)} style={{
              padding:"6px 16px", borderRadius:radius.full, fontSize:13, fontWeight:500,
              background: activeCategory===cat?C.text:C.surface,
              color:      activeCategory===cat?"#fff":C.text2,
              border:     activeCategory===cat?`1px solid ${C.text}`:`1px solid ${C.border}`,
              cursor:"pointer",
            }}>{cat}</button>
          ))}
        </div>

        {/* Integration cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:16, marginBottom:28 }}>
          {filtered.map(intg => {
            const isExpanded    = expandedId === intg.id;
            const isShopify     = intg.id === "shopify";
            const isClover      = intg.id === "clover";
            const isConnected   = (isShopify&&shopifyConnected)||(isClover&&cloverConnected);
            const isAvailable   = intg.status === "available";

            return (
              <div key={intg.id} style={{ background:C.surface, border:`1px solid ${isConnected?intg.color+"50":C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
                {/* Card header */}
                <div style={{ padding:"20px 22px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
                    <div style={{ width:48, height:48, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0, background:intg.bg }}>
                      {intg.icon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" as const }}>
                        <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{intg.name}</span>
                        <span style={{ fontSize:11, background:C.bg, color:C.text3, padding:"2px 8px", borderRadius:20 }}>{intg.category}</span>
                        {isConnected && <span style={{ fontSize:11, background:"#f0faf4", color:"#34c759", border:"1px solid #c8f0d8", padding:"2px 8px", borderRadius:20, fontWeight:600 }}>✓ Connected</span>}
                        {intg.status==="coming" && <span style={{ fontSize:11, background:C.bg, color:C.text3, padding:"2px 8px", borderRadius:20 }}>Coming soon</span>}
                      </div>
                      <p style={{ fontSize:13, color:C.text3, lineHeight:1.5 }}>{intg.description}</p>
                    </div>
                  </div>

                  {/* Action button */}
                  <div style={{ marginTop:16 }}>
                    {intg.status==="coming" ? (
                      <div style={{ padding:"10px", borderRadius:radius.sm, background:C.bg, border:`1px solid ${C.border}`, textAlign:"center" as const, fontSize:13, color:C.text3 }}>Coming soon</div>
                    ) : isAvailable ? (
                      <button onClick={()=>setExpandedId(isExpanded?null:intg.id)} style={{ ...btnPrimary, width:"100%", padding:"11px", borderRadius:radius.sm, background:isExpanded?C.bg:intg.color, color:isExpanded?C.text2:"#fff", border:isExpanded?`1px solid ${C.border}`:"none" }}>
                        {isExpanded ? "↑ Close" : isConnected ? "Manage connection" : `Connect ${intg.name}`}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && user && (
                  <div style={{ borderTop:`1px solid ${C.border}`, padding:"0 22px 22px" }}>
                    {isShopify && (shopifyConnected&&shopifyInfo ? <ShopifyConnected userId={user.uid} shopInfo={shopifyInfo} folders={folders}/> : <ShopifyConnect userId={user.uid} folders={folders}/>)}
                    {isClover  && (cloverConnected&&cloverInfo   ? <CloverConnected  userId={user.uid} merchantInfo={cloverInfo}  folders={folders}/> : <CloverConnect   userId={user.uid}/>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Manual upload CTA */}
        <div style={{ background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.lg, padding:"20px 24px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" as const }}>
          <div style={{ fontSize:36, flexShrink:0 }}>📁</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:15, color:C.text, marginBottom:3 }}>Don&apos;t see your tool?</div>
            <div style={{ fontSize:13, color:C.text2 }}>Export any CSV, Excel, or PDF and upload directly. DashWise reads any format.</div>
          </div>
          <Link href="/files" style={{ ...btnPrimary, flexShrink:0, padding:"11px 22px" }}>Upload Files →</Link>
        </div>
      </main>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.text3 }}>Loading integrations...</div>}>
      <IntegrationsContent/>
    </Suspense>
  );
}
