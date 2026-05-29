"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  getUserFolders, createFolder, getFolderFiles,
  addFileToFolder, updateFileRecord, saveFolderAnalysis,
  BusinessFolder, FolderFile,
} from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

const MODES = [
  { id:"explain", icon:"💡", label:"Full Report",  desc:"Overall analysis" },
  { id:"meeting", icon:"🗓️", label:"Meeting Prep", desc:"Key talking points" },
  { id:"anomaly", icon:"🔍", label:"Find Issues",  desc:"Flag problems" },
  { id:"action",  icon:"⚡", label:"Action Plan",  desc:"Steps to take now" },
];

const EXT_ICON: Record<string,string> = {
  csv:"📊", xlsx:"📗", xls:"📗", xlsm:"📗", pdf:"📄", txt:"📝", json:"🔧",
};

function Spinner({ size=18, color=C.blue }: { size?:number; color?:string }) {
  return <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTopColor:color, borderRadius:"50%", animation:"spin .7s linear infinite", flexShrink:0 }}/>;
}

export default function FilesPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [folders,        setFolders]        = useState<BusinessFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string|null>(null);
  const [files,          setFiles]          = useState<FolderFile[]>([]);
  const [newFolderName,  setNewFolderName]  = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showNewFolder,  setShowNewFolder]  = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [mode,           setMode]           = useState("explain");
  const [analyzing,      setAnalyzing]      = useState(false);
  const [analysis,       setAnalysis]       = useState<string|null>(null);
  const [dashReady,      setDashReady]      = useState(false);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [deletingId,     setDeletingId]     = useState<string|null>(null);
  const [showSidebar,    setShowSidebar]    = useState(false);

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
    setFiles([]); setAnalysis(null); setDashReady(false);
    getFolderFiles(user.uid, activeFolderId).then(setFiles);
  }, [user, activeFolderId]);

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !user) return;
    setCreatingFolder(true);
    const id = await createFolder(user.uid, newFolderName.trim(), profile?.bizType);
    const updated = await getUserFolders(user.uid);
    setFolders(updated);
    setActiveFolderId(id);
    setNewFolderName(""); setShowNewFolder(false); setShowSidebar(false);
    setCreatingFolder(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || !user || !activeFolderId) return;
    setUploading(true); setErrorMsg("");
    for (const file of Array.from(selected)) {
      let fileId = "";
      try {
        fileId = await addFileToFolder(user.uid, activeFolderId, {
          name: file.name, size: file.size,
          type: file.name.split(".").pop()?.toLowerCase() || "unknown",
          status:"uploading",
        });
        const form = new FormData();
        form.append("file", file);
        const res  = await fetch("/api/parse-files", { method:"POST", body:form });
        if (!res.ok) throw new Error("Parse failed");
        const data = await res.json();
        await updateFileRecord(user.uid, activeFolderId, fileId, {
          parsedContent: data.content || "",
          sheets:        data.sheets  || [],
          rowCount:      data.rowCount || 0,
          status:        "ready",
        });
      } catch {
        if (fileId) await updateFileRecord(user.uid, activeFolderId, fileId, { status:"error" });
        setErrorMsg(`Failed to parse ${file.name}. Check the file format and try again.`);
      }
    }
    const updated = await getFolderFiles(user.uid, activeFolderId);
    setFiles(updated); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeleteFile(fileId: string, fileName: string) {
    if (!user || !activeFolderId) return;
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setDeletingId(fileId);
    try {
      await deleteDoc(doc(db, "users", user.uid, "folders", activeFolderId, "files", fileId));
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch {
      setErrorMsg("Failed to delete file. Please try again.");
    } finally { setDeletingId(null); }
  }

  async function handleAnalyzeAll() {
    if (!user || !activeFolderId) return;
    const ready = files.filter(f => f.status === "ready");
    if (ready.length === 0) { setErrorMsg("No ready files to analyze. Wait for uploads to finish parsing."); return; }
    setAnalyzing(true); setAnalysis(null); setDashReady(false); setErrorMsg("");

    try {
      const res = await fetch("/api/analyze-folder", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          files: ready.map(f => ({
            fileName: f.name, fileType: f.type,
            content:  (f.parsedContent || "").slice(0, 8000),
            sheets:   f.sheets || [],
          })),
          businessType: profile?.bizType || "retail",
          bizName:      activeFolder?.bizName || profile?.bizName || "My Business",
          mode, goals: profile?.goals || [],
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(()=>({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis || "");
      setDashReady(!!data.dashboardData);
      if (data.dashboardData?.summary) {
        await saveFolderAnalysis(user.uid, activeFolderId, data.dashboardData.summary.slice(0,300));
      }
      try {
        sessionStorage.setItem("dashwise-analysis", JSON.stringify({
          dashboardData: data.dashboardData,
          narrative:     data.analysis,
          bizName:       activeFolder?.bizName || profile?.bizName,
          mode,
        }));
      } catch {}
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally { setAnalyzing(false); }
  }

  const activeFolder = folders.find(f => f.id === activeFolderId);
  const readyFiles   = files.filter(f => f.status === "ready");

  function renderAnalysis(text: string) {
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height:8 }}/>;
      if (line.startsWith("**") && line.endsWith("**"))
        return <div key={i} style={{ fontWeight:700, color:C.text, fontSize:14, marginTop:16, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>{line.replace(/\*\*/g,"")}</div>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.6, marginBottom:4 }} dangerouslySetInnerHTML={{ __html:line.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>") }}/>;
      return <div key={i} style={{ fontSize:13, color:C.text2, lineHeight:1.6, marginBottom:4 }}>{line}</div>;
    });
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <Spinner size={32}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column" }}>
      <Nav/>

      {/* Mobile folder selector bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:C.surface, borderBottom:`1px solid ${C.border}`, overflowX:"auto" }}>
        <button onClick={()=>setShowSidebar(true)} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"7px 12px", fontSize:13, color:C.text2, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
          📁 Folders
        </button>
        {folders.map(f => (
          <button key={f.id} onClick={()=>setActiveFolderId(f.id!)} style={{
            background: activeFolderId===f.id?C.blue:C.surface,
            color:      activeFolderId===f.id?"#fff":C.text2,
            border:`1px solid ${activeFolderId===f.id?C.blue:C.border}`,
            borderRadius:radius.full, padding:"7px 14px", fontSize:13,
            fontWeight: activeFolderId===f.id?600:400,
            cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
          }}>
            {f.bizName}
          </button>
        ))}
        <button onClick={()=>setShowNewFolder(true)} style={{ background:"transparent", border:`1px dashed ${C.border2}`, borderRadius:radius.full, padding:"7px 14px", fontSize:13, color:C.text3, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
          + New
        </button>
      </div>

      {/* Mobile new folder input */}
      {showNewFolder && (
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"12px 16px", display:"flex", gap:8 }}>
          <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter")handleCreateFolder(); if(e.key==="Escape")setShowNewFolder(false); }} placeholder="Folder name..." style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 12px", fontSize:14, color:C.text, outline:"none" }}/>
          <button onClick={handleCreateFolder} disabled={!newFolderName.trim()||creatingFolder} style={{ ...btnPrimary, padding:"9px 16px", borderRadius:radius.sm, fontSize:13, opacity:(!newFolderName.trim()||creatingFolder)?.5:1 }}>
            {creatingFolder?"...":"Add"}
          </button>
          <button onClick={()=>setShowNewFolder(false)} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 12px", fontSize:13, color:C.text3, cursor:"pointer" }}>×</button>
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex" }}>
          <div onClick={()=>setShowSidebar(false)} style={{ flex:1, background:"rgba(0,0,0,0.4)" }}/>
          <div style={{ width:280, background:C.surface, display:"flex", flexDirection:"column", overflowY:"auto", padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontWeight:600, fontSize:15, color:C.text }}>Folders</span>
              <button onClick={()=>setShowSidebar(false)} style={{ background:"none", border:"none", fontSize:20, color:C.text3, cursor:"pointer" }}>×</button>
            </div>
            {folders.map(f=>(
              <button key={f.id} onClick={()=>{ setActiveFolderId(f.id!); setShowSidebar(false); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px", borderRadius:radius.sm, marginBottom:4, background:activeFolderId===f.id?C.blueBg:"transparent", border:`1px solid ${activeFolderId===f.id?C.blueMid:"transparent"}`, cursor:"pointer", textAlign:"left" as const }}>
                <span>📁</span>
                <span style={{ fontSize:14, fontWeight:activeFolderId===f.id?600:400, color:activeFolderId===f.id?C.blue:C.text }}>{f.bizName}</span>
              </button>
            ))}
            <button onClick={()=>{ setShowSidebar(false); setShowNewFolder(true); }} style={{ marginTop:8, padding:"11px", borderRadius:radius.sm, background:C.bg, border:`1px dashed ${C.border2}`, fontSize:13, color:C.text3, cursor:"pointer" }}>
              + New folder
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 16px" }}>
        <div style={{ maxWidth:760, margin:"0 auto" }}>

          {!activeFolderId ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📂</div>
              <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>No folder selected</h2>
              <p style={{ fontSize:14, color:C.text3 }}>Create a folder above to get started.</p>
            </div>
          ) : (
            <>
              {/* Folder title */}
              <div style={{ marginBottom:20 }}>
                <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.4px", color:C.text, marginBottom:3 }}>{activeFolder?.bizName}</h1>
                <p style={{ fontSize:13, color:C.text3 }}>{files.length} file{files.length!==1?"s":""} · {readyFiles.length} ready</p>
              </div>

              {/* Error */}
              {errorMsg && (
                <div style={{ background:C.redBg, border:`1px solid #ffd6d6`, color:C.red, fontSize:13, padding:"12px 14px", borderRadius:radius.sm, marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                  <span style={{ lineHeight:1.5 }}>⚠ {errorMsg}</span>
                  <button onClick={()=>setErrorMsg("")} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:18, flexShrink:0, lineHeight:1 }}>×</button>
                </div>
              )}

              {/* Upload zone */}
              <div
                onClick={()=>!uploading&&fileInputRef.current?.click()}
                style={{ background:C.surface, border:`2px dashed ${C.border2}`, borderRadius:radius.lg, padding:"28px 20px", textAlign:"center", cursor:uploading?"default":"pointer", marginBottom:16, transition:"border-color 0.2s", boxShadow:shadow.sm }}
                onMouseEnter={e=>{ if(!uploading)(e.currentTarget as HTMLElement).style.borderColor=C.blue; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor=C.border2; }}
              >
                <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,.pdf,.txt,.json" onChange={handleUpload} style={{ display:"none" }}/>
                {uploading ? (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
                    <Spinner/><span style={{ fontSize:14, color:C.text2 }}>Uploading and parsing...</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:28, marginBottom:8 }}>⬆️</div>
                    <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:3 }}>Tap to upload files</div>
                    <div style={{ fontSize:12, color:C.text3 }}>CSV · Excel · PDF · TXT · JSON</div>
                  </>
                )}
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm, marginBottom:16 }}>
                  {files.map((file, i) => (
                    <div key={file.id||i} style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 16px", borderBottom:i<files.length-1?`1px solid #f9f9fb`:"none" }}>
                      <span style={{ fontSize:20, flexShrink:0 }}>{EXT_ICON[file.type]||"📎"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
                        <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>
                          {(file.size/1024).toFixed(1)} KB
                          {file.sheets?.length ? ` · ${file.sheets.length} sheets` : ""}
                          {(file.rowCount||0)>0 ? ` · ${file.rowCount} rows` : ""}
                        </div>
                      </div>

                      {/* Status badge */}
                      {file.status==="uploading" ? (
                        <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                          <Spinner size={14}/><span style={{ fontSize:11, color:C.text3 }}>Parsing...</span>
                        </div>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:20, flexShrink:0, background:file.status==="ready"?"#f0faf4":C.redBg, color:file.status==="ready"?"#34c759":C.red, border:`1px solid ${file.status==="ready"?"#c8f0d8":"#ffd6d6"}` }}>
                          {file.status==="ready"?"✓ Ready":"Error"}
                        </span>
                      )}

                      {/* Delete button */}
                      {file.id && file.status !== "uploading" && (
                        <button
                          onClick={()=>handleDeleteFile(file.id!, file.name)}
                          disabled={deletingId===file.id}
                          title="Delete file"
                          style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.text3, width:30, height:30, borderRadius:radius.sm, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, opacity:deletingId===file.id?.5:1 }}>
                          {deletingId===file.id ? <Spinner size={12}/> : "🗑"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Analysis modes */}
              {readyFiles.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:18, boxShadow:shadow.sm, marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>
                    Analysis Mode
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                    {MODES.map(m=>(
                      <button key={m.id} onClick={()=>setMode(m.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 12px", borderRadius:radius.sm, cursor:"pointer", background:mode===m.id?C.blueBg:C.bg, border:mode===m.id?`1.5px solid ${C.blue}`:`1px solid ${C.border}`, textAlign:"left" as const }}>
                        <span style={{ fontSize:18, flexShrink:0 }}>{m.icon}</span>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:mode===m.id?C.blue:C.text }}>{m.label}</div>
                          <div style={{ fontSize:11, color:C.text3 }}>{m.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={handleAnalyzeAll} disabled={analyzing} style={{ ...btnPrimary, width:"100%", padding:"14px", borderRadius:radius.sm, fontSize:15, opacity:analyzing?.6:1 }}>
                    {analyzing ? (
                      <><Spinner size={16} color="#fff"/> Analyzing {readyFiles.length} file{readyFiles.length!==1?"s":""}...</>
                    ) : (
                      `🧠 Analyze ${readyFiles.length} file${readyFiles.length!==1?"s":""} →`
                    )}
                  </button>
                  {dashReady && (
                    <button onClick={()=>router.push("/dashboard-view")} style={{ ...btnPrimary, width:"100%", marginTop:10, padding:"13px", borderRadius:radius.sm, fontSize:14, background:"transparent", color:C.blue, border:`2px solid ${C.blue}` }}>
                      🚀 Open Full Dashboard
                    </button>
                  )}
                </div>
              )}

              {/* Analysis result */}
              {analysis && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
                  <div style={{ background:C.text, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:11, color:"rgba(245,245,247,0.5)", marginBottom:3 }}>
                        {MODES.find(m=>m.id===mode)?.icon} {MODES.find(m=>m.id===mode)?.label} · {readyFiles.length} files
                      </div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#f5f5f7" }}>{activeFolder?.bizName}</div>
                    </div>
                    <button onClick={()=>{setAnalysis(null);setDashReady(false);}} style={{ background:"rgba(255,255,255,0.1)", border:"none", color:"rgba(255,255,255,0.7)", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                  </div>
                  <div style={{ padding:"20px 18px" }}>{renderAnalysis(analysis)}</div>
                  <div style={{ padding:"14px 18px", borderTop:`1px solid ${C.border}`, display:"flex", gap:10, flexWrap:"wrap" as const }}>
                    <Link href="/advisor" style={{ ...btnPrimary, flex:1, minWidth:120, padding:"11px", borderRadius:radius.sm, textAlign:"center" as const, fontSize:13 }}>
                      💬 Ask Advisor
                    </Link>
                    <button onClick={handleAnalyzeAll} style={{ padding:"11px 16px", borderRadius:radius.sm, background:C.bg, border:`1px solid ${C.border}`, color:C.text2, fontSize:13, cursor:"pointer", flexShrink:0 }}>
                      ↻ Re-analyze
                    </button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {files.length===0 && !uploading && (
                <div style={{ textAlign:"center", padding:"40px 20px", color:C.text3 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📄</div>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:5 }}>No files yet</div>
                  <div style={{ fontSize:13 }}>Upload files using the zone above.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
