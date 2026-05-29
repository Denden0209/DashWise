"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import {
  getUserFolders, createFolder, getFolderFiles,
  addFileToFolder, updateFileRecord,
  saveFolderAnalysis,
  BusinessFolder, FolderFile,
} from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

const MODES = [
  { id:"explain", icon:"💡", label:"Full Report",   desc:"Overall analysis of all files" },
  { id:"meeting", icon:"🗓️", label:"Meeting Prep",  desc:"Key talking points with numbers" },
  { id:"anomaly", icon:"🔍", label:"Find Issues",   desc:"Flag problems and anomalies" },
  { id:"action",  icon:"⚡", label:"Action Plan",   desc:"Specific steps to take now" },
];

function Spinner({ size=20, color=C.blue }: { size?: number; color?: string }) {
  return (
    <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>
  );
}

export default function FilesPage() {
  const router    = useRouter();
  const { user, profile, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [folders,        setFolders]        = useState<BusinessFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [files,          setFiles]          = useState<FolderFile[]>([]);
  const [newFolderName,  setNewFolderName]  = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showNewFolder,  setShowNewFolder]  = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [mode,           setMode]           = useState("explain");
  const [analyzing,      setAnalyzing]      = useState(false);
  const [analysis,       setAnalysis]       = useState<string | null>(null);
  const [dashData,       setDashData]       = useState<unknown>(null);
  const [dashReady,      setDashReady]      = useState(false);
  const [errorMsg,       setErrorMsg]       = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getUserFolders(user.uid).then(list => {
      setFolders(list);
      if (list.length > 0 && !activeFolderId) setActiveFolderId(list[0].id!);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !activeFolderId) return;
    setFiles([]); setAnalysis(null); setDashData(null); setDashReady(false);
    getFolderFiles(user.uid, activeFolderId).then(setFiles);
  }, [user, activeFolderId]);

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !user) return;
    setCreatingFolder(true);
    const id = await createFolder(user.uid, newFolderName.trim(), profile?.bizType);
    const updated = await getUserFolders(user.uid);
    setFolders(updated);
    setActiveFolderId(id);
    setNewFolderName("");
    setShowNewFolder(false);
    setCreatingFolder(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !user || !activeFolderId) return;
    setUploading(true); setErrorMsg("");
    for (const file of Array.from(selectedFiles)) {
      const fileId = await addFileToFolder(user.uid, activeFolderId, {
        name: file.name, size: file.size,
        type: file.name.split(".").pop()?.toLowerCase() || "unknown",
        status: "uploading",
      });
      try {
        const form = new FormData();
        form.append("file", file);
        const res  = await fetch("/api/parse-files", { method:"POST", body:form });
        const data = await res.json();
        await updateFileRecord(user.uid, activeFolderId, fileId, {
          parsedContent: data.content || "",
          sheets:        data.sheets  || [],
          rowCount:      data.rowCount || 0,
          status:        "ready",
        });
      } catch {
        await updateFileRecord(user.uid, activeFolderId, fileId, { status:"error" });
      }
    }
    const updated = await getFolderFiles(user.uid, activeFolderId);
    setFiles(updated);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAnalyzeAll() {
    if (!user || !activeFolderId) return;
    const ready = files.filter(f => f.status === "ready");
    if (ready.length === 0) return;
    setAnalyzing(true); setAnalysis(null); setDashData(null); setDashReady(false); setErrorMsg("");

    const filePayloads = ready.map(f => ({
      fileName: f.name, fileType: f.type,
      content:  (f.parsedContent || "").slice(0, 8000),
      sheets:   f.sheets || [],
    }));

    try {
      const res = await fetch("/api/analyze-folder", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          files:        filePayloads,
          businessType: profile?.bizType || "retail",
          bizName:      activeFolder?.bizName || profile?.bizName || "My Business",
          mode,
          goals:        profile?.goals || [],
        }),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setAnalysis(data.analysis || "");
      setDashData(data.dashboardData || null);
      setDashReady(true);
      if (data.dashboardData?.summary) {
        await saveFolderAnalysis(user.uid, activeFolderId, data.dashboardData.summary.slice(0, 300));
      }
      try {
        sessionStorage.setItem("dashwise-analysis", JSON.stringify({
          dashboardData: data.dashboardData,
          narrative:     data.analysis,
          bizName:       activeFolder?.bizName || profile?.bizName || "My Business",
          mode,
        }));
      } catch {}
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally { setAnalyzing(false); }
  }

  const activeFolder  = folders.find(f => f.id === activeFolderId);
  const readyFiles    = files.filter(f => f.status === "ready");
  const uploadingFiles = files.filter(f => f.status === "uploading");

  function renderAnalysis(text: string) {
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height:8 }}/>;
      if (line.startsWith("**") && line.endsWith("**"))
        return <div key={i} style={{ fontWeight:700, color:C.text, fontSize:14, marginTop:16, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>{line.replace(/\*\*/g,"")}</div>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.6, marginBottom:4 }} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>") }}/>;
      return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.6, marginBottom:4 }}>{line}</div>;
    });
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner size={32}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <div style={{ display:"flex", height:"calc(100vh - 52px)" }}>

        {/* ── Sidebar ── */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${C.border}`, background:C.surface, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.text3 }}>Folders</span>
              <button onClick={()=>setShowNewFolder(!showNewFolder)} style={{ background:C.blueBg, border:`1px solid ${C.blueMid}`, color:C.blue, fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:6, cursor:"pointer" }}>
                + New
              </button>
            </div>
            {showNewFolder && (
              <div style={{ display:"flex", gap:6 }}>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e=>setNewFolderName(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") handleCreateFolder(); if(e.key==="Escape") setShowNewFolder(false); }}
                  placeholder="Folder name..."
                  style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", fontSize:13, color:C.text, outline:"none" }}
                />
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()||creatingFolder} style={{ ...btnPrimary, padding:"7px 12px", borderRadius:6, fontSize:12 }}>
                  {creatingFolder ? "..." : "Add"}
                </button>
              </div>
            )}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:8 }}>
            {folders.length === 0 ? (
              <div style={{ padding:"20px 12px", textAlign:"center", color:C.text3, fontSize:13 }}>
                No folders yet. Create one to start uploading.
              </div>
            ) : (
              folders.map(folder => {
                const active = activeFolderId === folder.id;
                return (
                  <button key={folder.id} onClick={()=>setActiveFolderId(folder.id!)} style={{
                    width:"100%", display:"flex", alignItems:"center", gap:10,
                    padding:"10px 12px", borderRadius:radius.sm, marginBottom:2,
                    background: active ? C.blueBg : "transparent",
                    border:     active ? `1px solid ${C.blueMid}` : "1px solid transparent",
                    cursor:"pointer", textAlign:"left" as const,
                  }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>📁</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight: active?600:400, color: active?C.blue:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {folder.bizName}
                      </div>
                      <div style={{ fontSize:11, color:C.text3 }}>{folder.fileCount} file{folder.fileCount!==1?"s":""}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Main panel ── */}
        <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
          {!activeFolderId ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center" }}>
              <div style={{ fontSize:52, marginBottom:16 }}>📂</div>
              <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>No folder selected</h2>
              <p style={{ fontSize:14, color:C.text3 }}>Create a folder in the sidebar to get started.</p>
            </div>
          ) : (
            <div style={{ maxWidth:800 }}>

              {/* Folder header */}
              <div style={{ marginBottom:24 }}>
                <h1 style={{ fontSize:26, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:4 }}>{activeFolder?.bizName}</h1>
                <p style={{ fontSize:13, color:C.text3 }}>{files.length} file{files.length!==1?"s":""} · {readyFiles.length} ready to analyze</p>
              </div>

              {/* Error */}
              {errorMsg && (
                <div style={{ background:C.redBg, border:`1px solid #ffd6d6`, color:C.red, fontSize:13, padding:"12px 16px", borderRadius:radius.sm, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  {errorMsg}
                  <button onClick={()=>setErrorMsg("")} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              )}

              {/* Upload zone */}
              <div
                onClick={()=>fileInputRef.current?.click()}
                style={{ background:C.surface, border:`2px dashed ${C.border2}`, borderRadius:radius.lg, padding:"32px 24px", textAlign:"center", cursor:"pointer", marginBottom:20, transition:"border-color 0.2s" }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor=C.blue}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor=C.border2}
              >
                <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,.pdf,.txt,.json" onChange={handleUpload} style={{ display:"none" }}/>
                {uploading ? (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
                    <Spinner/>
                    <span style={{ fontSize:14, color:C.text2 }}>Uploading and parsing files...</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:32, marginBottom:10 }}>⬆️</div>
                    <div style={{ fontWeight:600, fontSize:15, color:C.text, marginBottom:4 }}>Drop files here or click to browse</div>
                    <div style={{ fontSize:13, color:C.text3 }}>CSV, Excel, PDF, TXT, JSON supported</div>
                  </>
                )}
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm, marginBottom:20 }}>
                  {files.map((file, i) => (
                    <div key={file.id||i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 18px", borderBottom:i<files.length-1?`1px solid #f9f9fb`:"none" }}>
                      <span style={{ fontSize:20, flexShrink:0 }}>
                        {{"csv":"📊","xlsx":"📗","xls":"📗","pdf":"📄","txt":"📝","json":"🔧"}[file.type]||"📎"}
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
                        <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>
                          {(file.size/1024).toFixed(1)} KB
                          {file.sheets?.length ? ` · ${file.sheets.length} sheets` : ""}
                          {file.rowCount ? ` · ${file.rowCount} rows` : ""}
                        </div>
                      </div>
                      {file.status === "uploading" ? (
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <Spinner size={14}/>
                          <span style={{ fontSize:11, color:C.text3 }}>Parsing...</span>
                        </div>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, background:file.status==="ready"?"#f0faf4":C.redBg, color:file.status==="ready"?"#34c759":C.red, border:`1px solid ${file.status==="ready"?"#c8f0d8":"#ffd6d6"}` }}>
                          {file.status==="ready" ? "✓ Ready" : "Error"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Analysis controls */}
              {readyFiles.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:20, boxShadow:shadow.sm, marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>
                    Analysis Mode
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:16 }}>
                    {MODES.map(m => (
                      <button key={m.id} onClick={()=>setMode(m.id)} style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"12px 14px", borderRadius:radius.sm, cursor:"pointer",
                        background: mode===m.id?C.blueBg:C.bg,
                        border:     mode===m.id?`1.5px solid ${C.blue}`:`1px solid ${C.border}`,
                        textAlign:"left" as const,
                      }}>
                        <span style={{ fontSize:20, flexShrink:0 }}>{m.icon}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:mode===m.id?C.blue:C.text }}>{m.label}</div>
                          <div style={{ fontSize:11, color:C.text3 }}>{m.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button onClick={handleAnalyzeAll} disabled={analyzing} style={{ ...btnPrimary, width:"100%", padding:"13px", borderRadius:radius.sm, fontSize:15, opacity:analyzing?.6:1 }}>
                    {analyzing ? (
                      <><Spinner size={16} color="#fff"/> Analyzing {readyFiles.length} file{readyFiles.length!==1?"s":""}...</>
                    ) : (
                      `🧠 Analyze ${readyFiles.length} file${readyFiles.length!==1?"s":""} together →`
                    )}
                  </button>

                  {dashReady && (
                    <button onClick={()=>router.push("/dashboard-view")} style={{ ...btnPrimary, width:"100%", marginTop:10, padding:"13px", borderRadius:radius.sm, fontSize:14, background:"transparent", color:C.blue, border:`2px solid ${C.blue}` }}>
                      🚀 Open Full Dashboard View
                    </button>
                  )}
                </div>
              )}

              {/* Analysis result */}
              {analysis && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
                  <div style={{ background:C.text, padding:"16px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:11, color:"rgba(245,245,247,0.5)", textTransform:"uppercase" as const, letterSpacing:"0.8px", marginBottom:4 }}>
                        {MODES.find(m=>m.id===mode)?.icon} {MODES.find(m=>m.id===mode)?.label} · {readyFiles.length} file{readyFiles.length!==1?"s":""}
                      </div>
                      <div style={{ fontSize:16, fontWeight:600, color:"#f5f5f7" }}>{activeFolder?.bizName}</div>
                    </div>
                    <button onClick={()=>{setAnalysis(null);setDashData(null);setDashReady(false);}} style={{ background:"rgba(255,255,255,0.1)", border:"none", color:"rgba(255,255,255,0.6)", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      ×
                    </button>
                  </div>
                  <div style={{ padding:"22px" }}>
                    {renderAnalysis(analysis)}
                  </div>
                  <div style={{ padding:"16px 22px", borderTop:`1px solid ${C.border}`, display:"flex", gap:12 }}>
                    <Link href="/advisor" style={{ ...btnPrimary, flex:1, padding:"11px", borderRadius:radius.sm, textAlign:"center" as const }}>
                      💬 Discuss with Advisor
                    </Link>
                    <button onClick={handleAnalyzeAll} style={{ padding:"11px 20px", borderRadius:radius.sm, background:C.bg, border:`1px solid ${C.border}`, color:C.text2, fontSize:13, fontWeight:500, cursor:"pointer" }}>
                      Re-analyze
                    </button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {files.length === 0 && !uploading && (
                <div style={{ textAlign:"center", padding:"40px 20px", color:C.text3 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:6 }}>No files yet</div>
                  <div style={{ fontSize:13 }}>Click the upload zone above to add your first file.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
