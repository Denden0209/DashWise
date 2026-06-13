"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  getUserFolders, createFolder, getFolderFiles,
  addFileToFolder, updateFileRecord,
  saveFolderFullAnalysis, getFolderFullAnalysis,
  saveFileCube,
  BusinessFolder, FolderFile,
} from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

const MAX_FILE_MB        = 25;
const MAX_TOTAL_MB       = 100;
const MAX_FILES_PER_SESS = 10;

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

function triggerEmbedding(uid: string, fileId: string, folderId: string, fileName: string, content: string) {
  if (!content || content.length < 50) return;
  fetch("/api/embed", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ uid, fileId, folderId, fileName, content }),
  }).catch(err => console.warn("[embed] Non-critical:", err));
}

export default function FilesPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [folders,         setFolders]         = useState<BusinessFolder[]>([]);
  const [activeFolderId,  setActiveFolderId]   = useState<string|null>(null);
  const [files,           setFiles]            = useState<FolderFile[]>([]);
  const [newFolderName,   setNewFolderName]    = useState("");
  const [creatingFolder,  setCreatingFolder]   = useState(false);
  const [showNewFolder,   setShowNewFolder]    = useState(false);
  const [uploading,       setUploading]        = useState(false);
  const [mode,            setMode]             = useState("explain");
  const [analyzing,       setAnalyzing]        = useState(false);
  const [analysis,        setAnalysis]         = useState<string|null>(null);
  const [dashData,        setDashData]         = useState<unknown>(null);
  const [analyzedAt,      setAnalyzedAt]       = useState<string|null>(null);
  const [errorMsg,        setErrorMsg]         = useState("");
  const [warnMsg,         setWarnMsg]          = useState("");
  const [deletingId,      setDeletingId]       = useState<string|null>(null);
  const [embeddingStatus, setEmbeddingStatus]  = useState<Record<string,string>>({});
  const [uploadProgress,  setUploadProgress]   = useState<{current:number;total:number}|null>(null);

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getUserFolders(user.uid).then(list => {
      setFolders(list);
      if (list.length > 0 && !activeFolderId) setActiveFolderId(list[0].id!);
    });
  }, [user]);

  // On folder switch: load files AND restore the last saved analysis
  useEffect(() => {
    if (!user || !activeFolderId) return;
    setFiles([]); setAnalysis(null); setDashData(null); setAnalyzedAt(null);
    getFolderFiles(user.uid, activeFolderId).then(setFiles);
    getFolderFullAnalysis(user.uid, activeFolderId).then(saved => {
      if (saved) {
        setAnalysis(saved.analysis || null);
        setDashData(saved.dashboardData || null);
        setAnalyzedAt(saved.analyzedAt || null);
        if (saved.mode) setMode(saved.mode);
      }
    }).catch(() => {});
  }, [user, activeFolderId]);

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !user) return;
    setCreatingFolder(true);
    const id = await createFolder(user.uid, newFolderName.trim(), profile?.bizType);
    const updated = await getUserFolders(user.uid);
    setFolders(updated); setActiveFolderId(id);
    setNewFolderName(""); setShowNewFolder(false); setCreatingFolder(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || !user || !activeFolderId) return;
    const fileArray = Array.from(selected);
    setErrorMsg(""); setWarnMsg("");

    if (fileArray.length > MAX_FILES_PER_SESS) {
      setErrorMsg(`Maximum ${MAX_FILES_PER_SESS} files per upload session. You selected ${fileArray.length}.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const oversized = fileArray.filter(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      setErrorMsg(`${oversized.map(f => `"${f.name}" (${(f.size/1024/1024).toFixed(1)}MB)`).join(", ")} exceed${oversized.length===1?"s":""} the ${MAX_FILE_MB}MB per-file limit.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const totalMB = fileArray.reduce((s,f) => s + f.size, 0) / 1024 / 1024;
    if (totalMB > MAX_TOTAL_MB) {
      setErrorMsg(`Total upload size is ${totalMB.toFixed(1)}MB — maximum per session is ${MAX_TOTAL_MB}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (fileArray.some(f => f.size > 5 * 1024 * 1024)) {
      setWarnMsg("Large files are summarized intelligently — statistics computed per column, all data searchable via AI.");
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    for (let idx = 0; idx < fileArray.length; idx++) {
      const file = fileArray[idx];
      let fileId = "";
      setUploadProgress({ current: idx + 1, total: fileArray.length });
      try {
        fileId = await addFileToFolder(user.uid, activeFolderId, {
          name: file.name, size: file.size,
          type: file.name.split(".").pop()?.toLowerCase() || "unknown",
          status: "uploading",
        });

        // Parse entirely in the browser — no server, no size limit
        const { parseFileInBrowser } = await import("@/lib/parseFileClient");
        const data = await parseFileInBrowser(file);

        await updateFileRecord(user.uid, activeFolderId, fileId, {
          parsedContent: data.content,
          sheets:        data.sheets   || [],
          rowCount:      data.rowCount || 0,
          status:        "ready",
        });

        // Save the interactive-dashboard cube (tabular files with a date column)
        if (data.cube) {
          try {
            await saveFileCube(user.uid, activeFolderId, fileId, data.cube);
          } catch (cubeErr) {
            console.warn("[cube] save failed (dashboard falls back to static):", cubeErr);
          }
        }

        if (data.content) {
          setEmbeddingStatus(prev => ({ ...prev, [fileId]: "embedding" }));
          triggerEmbedding(user.uid, fileId, activeFolderId, file.name, data.content);
          setTimeout(() => setEmbeddingStatus(prev => ({ ...prev, [fileId]: "ready" })), 4000);
        }
      } catch (err: unknown) {
        if (fileId) await updateFileRecord(user.uid, activeFolderId, fileId, { status:"error" }).catch(()=>{});
        const msg = err instanceof Error ? err.message : "Unknown error";
        setErrorMsg(prev => prev ? `${prev}\n"${file.name}": ${msg}` : `Failed to parse "${file.name}": ${msg}`);
      }
    }

    const updated = await getFolderFiles(user.uid, activeFolderId);
    setFiles(updated); setUploading(false); setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeleteFile(fileId: string, fileName: string) {
    if (!user || !activeFolderId) return;
    if (!confirm(`Delete "${fileName}"?\n\nThis cannot be undone.`)) return;
    setDeletingId(fileId);
    try {
      await deleteDoc(doc(db, "users", user.uid, "folders", activeFolderId, "files", fileId));
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch {
      setErrorMsg(`Failed to delete "${fileName}". Please try again.`);
    } finally { setDeletingId(null); }
  }

  async function handleAnalyzeAll() {
    if (!user || !activeFolderId) return;
    const ready = files.filter(f => f.status === "ready");
    if (ready.length === 0) { setErrorMsg("No ready files to analyze."); return; }
    setAnalyzing(true); setErrorMsg("");

    try {
      const res = await fetch("/api/analyze-folder", {
        method:  "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          files: ready.map(f => ({
            fileName: f.name, fileType: f.type,
            content:  (f.parsedContent || "").slice(0, 12000),
            sheets:   f.sheets || [],
          })),
          businessType: profile?.bizType || "retail",
          bizName:      activeFolder?.bizName || profile?.bizName || "My Business",
          mode, goals: profile?.goals || [],
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?:string }).error || `Server error (${res.status})`);
      }
      const data = await res.json() as { success:boolean; analysis?:string; dashboardData?:unknown; error?:string };
      if (!data.success) throw new Error(data.error || "Analysis failed");

      const now = new Date().toISOString();
      setAnalysis(data.analysis || "");
      setDashData(data.dashboardData || null);
      setAnalyzedAt(now);

      // Persist to Firestore so it survives navigation + back button
      await saveFolderFullAnalysis(user.uid, activeFolderId, {
        analysis:      data.analysis || "",
        dashboardData: data.dashboardData,
        mode,
        fileNames:     ready.map(f => f.name),
      }).catch(() => {});

    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally { setAnalyzing(false); }
  }

  function openDashboardWindow() {
    try {
      sessionStorage.setItem("dashwise-analysis", JSON.stringify({
        dashboardData: dashData,
        narrative:     analysis,
        bizName:       activeFolder?.bizName || profile?.bizName || "My Business",
        mode,
        analyzedAt,
        folderId:      activeFolderId,
        cubeFiles:     files
          .filter(f => f.status === "ready" && f.hasCube && f.id)
          .map(f => ({ id: f.id!, name: f.name })),
      }));
    } catch {}
    window.open("/dashboard-view", "dashwise-dashboard", "width=1280,height=880,menubar=no,toolbar=no,location=no,status=no");
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

      {/* Folder tab bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", background:C.surface, borderBottom:`1px solid ${C.border}`, overflowX:"auto" }}>
        <button onClick={()=>setShowNewFolder(!showNewFolder)} style={{ background:C.blueBg, border:`1px solid ${C.blueMid}`, color:C.blue, fontSize:12, fontWeight:600, padding:"7px 12px", borderRadius:radius.sm, cursor:"pointer", flexShrink:0 }}>
          + New
        </button>
        {folders.map(f => (
          <button key={f.id} onClick={()=>setActiveFolderId(f.id!)} style={{
            background: activeFolderId===f.id?C.blue:C.surface,
            color:      activeFolderId===f.id?"#fff":C.text2,
            border:     `1px solid ${activeFolderId===f.id?C.blue:C.border}`,
            borderRadius:radius.full, padding:"7px 14px", fontSize:13,
            fontWeight: activeFolderId===f.id?600:400,
            cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
          }}>
            📁 {f.bizName}
          </button>
        ))}
      </div>

      {showNewFolder && (
        <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"10px 16px", display:"flex", gap:8 }}>
          <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter")handleCreateFolder(); if(e.key==="Escape")setShowNewFolder(false); }}
            placeholder="Folder name (e.g. Restaurant 2025)..."
            style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 12px", fontSize:14, color:C.text, outline:"none" }}/>
          <button onClick={handleCreateFolder} disabled={!newFolderName.trim()||creatingFolder}
            style={{ ...btnPrimary, padding:"9px 16px", borderRadius:radius.sm, fontSize:13, opacity:(!newFolderName.trim()||creatingFolder)?.5:1 }}>
            {creatingFolder?"...":"Add"}
          </button>
          <button onClick={()=>setShowNewFolder(false)} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:radius.sm, padding:"9px 12px", fontSize:13, color:C.text3, cursor:"pointer" }}>×</button>
        </div>
      )}

      <div style={{ flex:1, overflowY:"auto", padding:"20px 16px" }}>
        <div style={{ maxWidth:760, margin:"0 auto" }}>

          {!activeFolderId ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📂</div>
              <h2 style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>Create a folder to start</h2>
              <p style={{ fontSize:14, color:C.text3 }}>Click <strong>+ New</strong> above to create your first folder.</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom:18 }}>
                <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.4px", color:C.text, marginBottom:3 }}>{activeFolder?.bizName}</h1>
                <p style={{ fontSize:13, color:C.text3 }}>
                  {files.length} file{files.length!==1?"s":""} · {readyFiles.length} ready
                  {analyzedAt && <span style={{ color:"#34c759", fontWeight:500 }}> · Last analyzed {new Date(analyzedAt).toLocaleDateString()}</span>}
                </p>
              </div>

              <div style={{ background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.sm, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.blue }}>
                📎 Max <strong>{MAX_FILE_MB}MB per file</strong> · <strong>{MAX_FILES_PER_SESS} files per upload</strong> · CSV, Excel, PDF, TXT, JSON
              </div>

              {errorMsg && (
                <div style={{ background:C.redBg, border:`1px solid #ffd6d6`, color:C.red, fontSize:13, padding:"12px 14px", borderRadius:radius.sm, marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                  <span style={{ lineHeight:1.6, whiteSpace:"pre-line" }}>⚠ {errorMsg}</span>
                  <button onClick={()=>setErrorMsg("")} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:18, flexShrink:0 }}>×</button>
                </div>
              )}
              {warnMsg && (
                <div style={{ background:"#fff8e8", border:"1px solid #ffe4a0", color:"#996600", fontSize:13, padding:"10px 14px", borderRadius:radius.sm, marginBottom:12, display:"flex", justifyContent:"space-between", gap:10 }}>
                  <span style={{ lineHeight:1.6 }}>ℹ {warnMsg}</span>
                  <button onClick={()=>setWarnMsg("")} style={{ background:"none", border:"none", color:"#996600", cursor:"pointer", fontSize:18, flexShrink:0 }}>×</button>
                </div>
              )}

              {/* Upload zone */}
              <div
                onClick={()=>!uploading&&fileInputRef.current?.click()}
                style={{ background:C.surface, border:`2px dashed ${C.border2}`, borderRadius:radius.lg, padding:"28px 20px", textAlign:"center", cursor:uploading?"default":"pointer", marginBottom:16, boxShadow:shadow.sm, transition:"border-color 0.2s" }}
                onMouseEnter={e=>{ if(!uploading)(e.currentTarget as HTMLElement).style.borderColor=C.blue; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor=C.border2; }}
              >
                <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,.pdf,.txt,.json" onChange={handleUpload} style={{ display:"none" }}/>
                {uploading ? (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                    <Spinner size={24}/>
                    <div style={{ fontSize:14, color:C.text2, fontWeight:500 }}>
                      {uploadProgress ? `Parsing file ${uploadProgress.current} of ${uploadProgress.total}...` : "Parsing..."}
                    </div>
                    <div style={{ fontSize:12, color:C.text3 }}>Files are parsed in your browser — do not close this page</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:28, marginBottom:8 }}>⬆️</div>
                    <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:3 }}>Click to upload files</div>
                    <div style={{ fontSize:12, color:C.text3 }}>CSV · Excel · PDF · TXT · JSON · Max {MAX_FILE_MB}MB each</div>
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
                        <div style={{ fontSize:11, color:C.text3, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
                          <span>{(file.size/1024).toFixed(1)} KB</span>
                          {file.sheets?.length ? <span>{file.sheets.length} sheets</span> : null}
                          {(file.rowCount||0)>0 ? <span>{file.rowCount?.toLocaleString()} rows</span> : null}
                          {file.id && embeddingStatus[file.id]==="embedding" && (
                            <span style={{ color:C.blue, display:"flex", alignItems:"center", gap:3 }}><Spinner size={10}/> indexing...</span>
                          )}
                          {file.id && embeddingStatus[file.id]==="ready" && <span style={{ color:"#34c759" }}>🔍 AI search ready</span>}
                          {file.hasCube && <span style={{ color:C.purple, fontWeight:500 }}>📊 Interactive</span>}
                        </div>
                      </div>
                      {file.status==="uploading" ? (
                        <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                          <Spinner size={14}/><span style={{ fontSize:11, color:C.text3 }}>Parsing...</span>
                        </div>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:20, flexShrink:0, background:file.status==="ready"?"#f0faf4":C.redBg, color:file.status==="ready"?"#34c759":C.red, border:`1px solid ${file.status==="ready"?"#c8f0d8":"#ffd6d6"}` }}>
                          {file.status==="ready"?"✓ Ready":"Error"}
                        </span>
                      )}
                      {file.id && file.status!=="uploading" && (
                        <button onClick={()=>handleDeleteFile(file.id!, file.name)} disabled={deletingId===file.id}
                          style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.text3, width:30, height:30, borderRadius:radius.sm, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, opacity:deletingId===file.id?.5:1 }}>
                          {deletingId===file.id?<Spinner size={12}/>:"🗑"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Analysis controls */}
              {readyFiles.length > 0 && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:18, boxShadow:shadow.sm, marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>Analysis Mode</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                    {MODES.map(m => (
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
                    {analyzing ? <><Spinner size={16} color="#fff"/> Analyzing {readyFiles.length} file{readyFiles.length!==1?"s":""}...</> : `🧠 Analyze ${readyFiles.length} file${readyFiles.length!==1?"s":""} →`}
                  </button>
                  {dashData != null && (
                    <button onClick={openDashboardWindow} style={{ ...btnPrimary, width:"100%", marginTop:10, padding:"13px", borderRadius:radius.sm, fontSize:14, background:"transparent", color:C.blue, border:`2px solid ${C.blue}` }}>
                      🚀 Open Full Dashboard (new window)
                    </button>
                  )}
                </div>
              )}

              {/* Saved/current analysis */}
              {analysis && (
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
                  <div style={{ background:C.text, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:11, color:"rgba(245,245,247,0.5)", marginBottom:3 }}>
                        {MODES.find(m=>m.id===mode)?.icon} {MODES.find(m=>m.id===mode)?.label}
                        {analyzedAt && ` · ${new Date(analyzedAt).toLocaleString()}`}
                      </div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#f5f5f7" }}>{activeFolder?.bizName}</div>
                    </div>
                    <button onClick={()=>{setAnalysis(null);setDashData(null);setAnalyzedAt(null);}} style={{ background:"rgba(255,255,255,0.1)", border:"none", color:"rgba(255,255,255,0.7)", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }} title="Hide (saved analysis stays in history)">×</button>
                  </div>
                  <div style={{ padding:"20px 18px" }}>{renderAnalysis(analysis)}</div>
                  <div style={{ padding:"14px 18px", borderTop:`1px solid ${C.border}`, display:"flex", gap:10, flexWrap:"wrap" as const }}>
                    {dashData != null && (
                      <button onClick={openDashboardWindow} style={{ ...btnPrimary, flex:1, minWidth:140, padding:"11px", borderRadius:radius.sm, fontSize:13 }}>
                        📊 Open Dashboard
                      </button>
                    )}
                    <Link href="/advisor" style={{ ...btnPrimary, flex:1, minWidth:120, padding:"11px", borderRadius:radius.sm, textAlign:"center" as const, fontSize:13, background:C.bg, color:C.text, border:`1px solid ${C.border}` }}>
                      💬 Ask Advisor
                    </Link>
                    <button onClick={handleAnalyzeAll} disabled={analyzing} style={{ padding:"11px 16px", borderRadius:radius.sm, background:C.bg, border:`1px solid ${C.border}`, color:C.text2, fontSize:13, cursor:"pointer", flexShrink:0 }}>
                      ↻ Re-analyze
                    </button>
                  </div>
                </div>
              )}

              {files.length===0 && !uploading && (
                <div style={{ textAlign:"center", padding:"40px 20px", color:C.text3 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📄</div>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text, marginBottom:5 }}>No files yet</div>
                  <div style={{ fontSize:13 }}>Click the upload zone above to add your first file.</div>
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
