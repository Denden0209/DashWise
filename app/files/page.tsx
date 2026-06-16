"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import {
  getUserFolders, createFolder, getFolderFiles,
  addFileToFolder, updateFileRecord,
  saveFolderFullAnalysis, getFolderFullAnalysis,
  saveFileCube, saveFileSchema,
  renameFolder, deleteFolder, renameFile, deleteFileFull,
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
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ uid, fileId, folderId, fileName, content }),
  }).catch(err => console.warn("[embed] Non-critical:", err));
}

type FolderWithFiles = BusinessFolder & { files?: FolderFile[]; filesLoaded?: boolean };

export default function FilesPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [folders,         setFolders]         = useState<FolderWithFiles[]>([]);
  const [activeFolderId,  setActiveFolderId]   = useState<string|null>(null);
  const [expanded,        setExpanded]         = useState<Record<string, boolean>>({});
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

  // Menu + rename state
  const [menuOpen,        setMenuOpen]         = useState<string|null>(null);   // "folder:<id>" | "file:<id>"
  const [renaming,        setRenaming]         = useState<string|null>(null);   // same id format
  const [renameValue,     setRenameValue]      = useState("");
  const [busy,            setBusy]             = useState(false);
  const [sidebarOpen,     setSidebarOpen]      = useState(false);  // mobile drawer

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getUserFolders(user.uid).then(list => {
      setFolders(list);
      if (list.length > 0 && !activeFolderId) {
        setActiveFolderId(list[0].id!);
        setExpanded(e => ({ ...e, [list[0].id!]: true }));
      }
    });
  }, [user]);

  // Load files for the active folder (main panel) + restore analysis
  useEffect(() => {
    if (!user || !activeFolderId) return;
    setFiles([]); setAnalysis(null); setDashData(null); setAnalyzedAt(null);
    getFolderFiles(user.uid, activeFolderId).then(fs => {
      setFiles(fs);
      setFolders(prev => prev.map(f => f.id === activeFolderId ? { ...f, files: fs, filesLoaded: true } : f));
    });
    getFolderFullAnalysis(user.uid, activeFolderId).then(saved => {
      if (saved) {
        setAnalysis(saved.analysis || null);
        setDashData(saved.dashboardData || null);
        setAnalyzedAt(saved.analyzedAt || null);
        if (saved.mode) setMode(saved.mode);
      }
    }).catch(() => {});
  }, [user, activeFolderId]);

  // Close any open menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  async function loadFolderFiles(folderId: string) {
    if (!user) return;
    const fs = await getFolderFiles(user.uid, folderId);
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, files: fs, filesLoaded: true } : f));
  }

  function toggleExpand(folderId: string) {
    const willOpen = !expanded[folderId];
    setExpanded(e => ({ ...e, [folderId]: willOpen }));
    if (willOpen) {
      const f = folders.find(x => x.id === folderId);
      if (!f?.filesLoaded) loadFolderFiles(folderId);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !user) return;
    setCreatingFolder(true);
    const id = await createFolder(user.uid, newFolderName.trim(), profile?.bizType);
    const updated = await getUserFolders(user.uid);
    setFolders(updated); setActiveFolderId(id);
    setExpanded(e => ({ ...e, [id]: true }));
    setNewFolderName(""); setShowNewFolder(false); setCreatingFolder(false);
  }

  async function handleRenameFolder(folderId: string) {
    if (!user || !renameValue.trim()) { setRenaming(null); return; }
    setBusy(true);
    try {
      await renameFolder(user.uid, folderId, renameValue.trim());
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, bizName: renameValue.trim() } : f));
    } catch { setErrorMsg("Couldn't rename the folder. Try again."); }
    finally { setBusy(false); setRenaming(null); setMenuOpen(null); }
  }

  async function handleDeleteFolder(folderId: string, name: string) {
    if (!user) return;
    if (!confirm(`Delete folder "${name}" and all its files?\n\nThis permanently removes every file, analysis, and dashboard inside it. This cannot be undone.`)) return;
    setBusy(true); setMenuOpen(null);
    try {
      await deleteFolder(user.uid, folderId);
      const remaining = folders.filter(f => f.id !== folderId);
      setFolders(remaining);
      if (activeFolderId === folderId) {
        const next = remaining[0]?.id || null;
        setActiveFolderId(next);
        if (next) setExpanded(e => ({ ...e, [next]: true }));
      }
    } catch { setErrorMsg("Couldn't delete the folder. Try again."); }
    finally { setBusy(false); }
  }

  async function handleRenameFile(folderId: string, fileId: string) {
    if (!user || !renameValue.trim()) { setRenaming(null); return; }
    setBusy(true);
    try {
      await renameFile(user.uid, folderId, fileId, renameValue.trim());
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: renameValue.trim() } : f));
      setFolders(prev => prev.map(f => f.id === folderId
        ? { ...f, files: f.files?.map(ff => ff.id === fileId ? { ...ff, name: renameValue.trim() } : ff) }
        : f));
    } catch { setErrorMsg("Couldn't rename the file. Try again."); }
    finally { setBusy(false); setRenaming(null); setMenuOpen(null); }
  }

  async function handleDeleteFile(folderId: string, fileId: string, fileName: string) {
    if (!user) return;
    if (!confirm(`Delete "${fileName}"?\n\nThis cannot be undone.`)) return;
    setDeletingId(fileId); setMenuOpen(null);
    try {
      await deleteFileFull(user.uid, folderId, fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setFolders(prev => prev.map(f => f.id === folderId
        ? { ...f, files: f.files?.filter(ff => ff.id !== fileId), fileCount: Math.max(0,(f.fileCount||1)-1) }
        : f));
    } catch { setErrorMsg(`Failed to delete "${fileName}". Please try again.`); }
    finally { setDeletingId(null); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || !user || !activeFolderId) return;
    const fileArray = Array.from(selected);
    setErrorMsg(""); setWarnMsg("");

    if (fileArray.length > MAX_FILES_PER_SESS) {
      setErrorMsg(`Maximum ${MAX_FILES_PER_SESS} files per upload. You selected ${fileArray.length}.`);
      if (fileInputRef.current) fileInputRef.current.value = ""; return;
    }
    const oversized = fileArray.filter(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      setErrorMsg(`${oversized.map(f => `"${f.name}" (${(f.size/1024/1024).toFixed(1)}MB)`).join(", ")} exceed${oversized.length===1?"s":""} the ${MAX_FILE_MB}MB limit.`);
      if (fileInputRef.current) fileInputRef.current.value = ""; return;
    }
    const totalMB = fileArray.reduce((s,f) => s + f.size, 0) / 1024 / 1024;
    if (totalMB > MAX_TOTAL_MB) {
      setErrorMsg(`Total upload is ${totalMB.toFixed(1)}MB — max per session is ${MAX_TOTAL_MB}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = ""; return;
    }
    if (fileArray.some(f => f.size > 5 * 1024 * 1024)) {
      setWarnMsg("Large files are summarized intelligently — statistics per column, all data searchable via AI.");
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
        const { parseFileInBrowser } = await import("@/lib/parseFileClient");
        const data = await parseFileInBrowser(file);

        await updateFileRecord(user.uid, activeFolderId, fileId, {
          parsedContent: data.content, sheets: data.sheets || [],
          rowCount: data.rowCount || 0, status: "ready",
        });
        if (data.cube)   { try { await saveFileCube(user.uid, activeFolderId, fileId, data.cube); } catch (e) { console.warn("[cube]", e); } }
        if (data.schema) { try { await saveFileSchema(user.uid, activeFolderId, fileId, data.schema); } catch (e) { console.warn("[schema]", e); } }

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
    setFiles(updated);
    setFolders(prev => prev.map(f => f.id === activeFolderId ? { ...f, files: updated, filesLoaded: true, fileCount: updated.length } : f));
    setUploading(false); setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAnalyzeAll() {
    if (!user || !activeFolderId) return;
    const ready = files.filter(f => f.status === "ready");
    if (ready.length === 0) { setErrorMsg("No ready files to analyze."); return; }
    setAnalyzing(true); setErrorMsg("");
    try {
      const res = await fetch("/api/analyze-folder", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          files: ready.map(f => ({ fileName: f.name, fileType: f.type, content: (f.parsedContent || "").slice(0, 40000), sheets: f.sheets || [] })),
          businessType: profile?.bizType || "retail",
          bizName: activeFolder?.bizName || profile?.bizName || "My Business",
          mode, goals: profile?.goals || [],
        }),
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error((e as {error?:string}).error || `Server error (${res.status})`); }
      const data = await res.json() as { success:boolean; analysis?:string; dashboardData?:unknown; error?:string };
      if (!data.success) throw new Error(data.error || "Analysis failed");

      const now = new Date().toISOString();
      setAnalysis(data.analysis || ""); setDashData(data.dashboardData || null); setAnalyzedAt(now);
      await saveFolderFullAnalysis(user.uid, activeFolderId, {
        analysis: data.analysis || "", dashboardData: data.dashboardData, mode, fileNames: ready.map(f => f.name),
      }).catch(() => {});
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally { setAnalyzing(false); }
  }

  function openDashboardWindow() {
    try {
      sessionStorage.setItem("dashwise-analysis", JSON.stringify({
        dashboardData: dashData, narrative: analysis,
        bizName: activeFolder?.bizName || profile?.bizName || "My Business",
        mode, analyzedAt, folderId: activeFolderId,
        cubeFiles: files.filter(f => f.status==="ready" && f.hasCube && f.id).map(f => ({ id:f.id!, name:f.name })),
        schemaFiles: files.filter(f => f.status==="ready" && f.hasSchema && f.id).map(f => ({ id:f.id!, name:f.name })),
      }));
    } catch {}
    window.open("/dashboard-view", "dashwise-dashboard", "width=1240,height=860,menubar=no,toolbar=no,location=no,status=no");
  }

  const activeFolder = folders.find(f => f.id === activeFolderId);
  const readyFiles   = files.filter(f => f.status === "ready");

  // Account-level stats for the top bar
  const totalFiles    = folders.reduce((s,f) => s + (f.fileCount || 0), 0);
  const totalRows     = folders.reduce((s,f) => s + (f.files?.reduce((a,ff)=>a+(ff.rowCount||0),0) || 0), 0);
  const analyzedCount = folders.filter(f => f.lastAnalysisSummary).length;

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

  // ── 3-dot menu component ──
  const KebabMenu = ({ id, onRename, onDelete }: { id:string; onRename:()=>void; onDelete:()=>void }) => (
    <div style={{ position:"relative" }} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setMenuOpen(menuOpen===id?null:id)} title="More actions"
        style={{ background:"transparent", border:"none", color:C.text3, cursor:"pointer", width:26, height:26, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, lineHeight:1 }}
        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.bg}
        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}>⋯</button>
      {menuOpen===id && (
        <div style={{ position:"absolute", right:0, top:28, background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.sm, boxShadow:shadow.md, zIndex:60, minWidth:140, overflow:"hidden" }}>
          <button onClick={onRename} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"9px 12px", background:"transparent", border:"none", cursor:"pointer", fontSize:13, color:C.text, textAlign:"left" }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.bg}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}>✏️ Rename</button>
          <button onClick={onDelete} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"9px 12px", background:"transparent", border:"none", cursor:"pointer", fontSize:13, color:C.red, textAlign:"left" }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=C.redBg}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}>🗑 Delete</button>
        </div>
      )}
    </div>
  );

  // ── The tree sidebar ──
  const TreeSidebar = (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px 10px" }}>
        <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.text3 }}>Workspace</span>
        <button onClick={()=>setShowNewFolder(true)} title="New folder"
          style={{ background:C.blueBg, border:`1px solid ${C.blueMid}`, color:C.blue, fontSize:12, fontWeight:600, padding:"5px 10px", borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>+ New</button>
      </div>

      {showNewFolder && (
        <div style={{ padding:"0 12px 10px", display:"flex", gap:6 }}>
          <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter")handleCreateFolder(); if(e.key==="Escape"){setShowNewFolder(false);setNewFolderName("");} }}
            placeholder="Folder name…"
            style={{ flex:1, background:C.surface, border:`1px solid ${C.blue}`, borderRadius:8, padding:"7px 10px", fontSize:13, color:C.text, outline:"none" }}/>
          <button onClick={handleCreateFolder} disabled={!newFolderName.trim()||creatingFolder}
            style={{ ...btnPrimary, padding:"7px 12px", borderRadius:8, fontSize:12, opacity:(!newFolderName.trim()||creatingFolder)?.5:1 }}>{creatingFolder?"…":"Add"}</button>
        </div>
      )}

      <div style={{ flex:1, overflowY:"auto", padding:"0 8px 16px" }}>
        {folders.length === 0 && !showNewFolder && (
          <div style={{ textAlign:"center", padding:"30px 16px", color:C.text3 }}>
            <div style={{ fontSize:30, marginBottom:8 }}>📂</div>
            <div style={{ fontSize:12.5, lineHeight:1.5 }}>No folders yet.<br/>Click <strong style={{color:C.blue}}>+ New</strong> to start.</div>
          </div>
        )}
        {folders.map(folder => {
          const isActive = folder.id === activeFolderId;
          const isOpen   = expanded[folder.id!];
          const folderMenuId = `folder:${folder.id}`;
          const folderFiles = folder.files || [];
          return (
            <div key={folder.id} style={{ marginBottom:1 }}>
              {/* Folder row */}
              <div
                onClick={()=>{ setActiveFolderId(folder.id!); if(!isOpen) toggleExpand(folder.id!); setSidebarOpen(false); }}
                style={{ display:"flex", alignItems:"center", gap:4, padding:"7px 8px", borderRadius:8, cursor:"pointer",
                  background: isActive ? C.blueBg : "transparent" }}
                onMouseEnter={e=>{ if(!isActive)(e.currentTarget as HTMLElement).style.background="#f0f0f3"; (e.currentTarget.querySelector(".fmenu") as HTMLElement)?.style.setProperty("opacity","1"); }}
                onMouseLeave={e=>{ if(!isActive)(e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget.querySelector(".fmenu") as HTMLElement)?.style.setProperty("opacity","0"); }}
              >
                <button onClick={e=>{ e.stopPropagation(); toggleExpand(folder.id!); }}
                  style={{ background:"transparent", border:"none", cursor:"pointer", color:C.text3, fontSize:10, width:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", transform:isOpen?"rotate(90deg)":"none", transition:"transform .15s", flexShrink:0 }}>▶</button>
                <span style={{ fontSize:15, flexShrink:0 }}>{isOpen ? "📂" : "📁"}</span>
                {renaming===folderMenuId ? (
                  <input autoFocus value={renameValue} onClick={e=>e.stopPropagation()}
                    onChange={e=>setRenameValue(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter")handleRenameFolder(folder.id!); if(e.key==="Escape")setRenaming(null); }}
                    onBlur={()=>handleRenameFolder(folder.id!)}
                    style={{ flex:1, fontSize:13, padding:"3px 6px", border:`1px solid ${C.blue}`, borderRadius:6, outline:"none", minWidth:0 }}/>
                ) : (
                  <span style={{ flex:1, fontSize:13.5, fontWeight: isActive?600:500, color: isActive?C.blue:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>{folder.bizName}</span>
                )}
                <span style={{ fontSize:11, color:C.text3, flexShrink:0 }}>{folder.fileCount || 0}</span>
                <span className="fmenu" style={{ opacity:0, transition:"opacity .15s", flexShrink:0 }}>
                  <KebabMenu id={folderMenuId}
                    onRename={()=>{ setRenameValue(folder.bizName); setRenaming(folderMenuId); setMenuOpen(null); }}
                    onDelete={()=>handleDeleteFolder(folder.id!, folder.bizName)}/>
                </span>
              </div>

              {/* Files under folder */}
              {isOpen && (
                <div style={{ marginLeft:18, borderLeft:`1px solid ${C.border}`, paddingLeft:6 }}>
                  {!folder.filesLoaded && (
                    <div style={{ padding:"6px 10px", display:"flex", alignItems:"center", gap:6 }}><Spinner size={11}/><span style={{ fontSize:11.5, color:C.text3 }}>loading…</span></div>
                  )}
                  {folder.filesLoaded && folderFiles.length === 0 && (
                    <div style={{ padding:"6px 10px", fontSize:11.5, color:C.text3, fontStyle:"italic" }}>empty</div>
                  )}
                  {folderFiles.map(file => {
                    const fileMenuId = `file:${file.id}`;
                    return (
                      <div key={file.id}
                        onClick={()=>{ setActiveFolderId(folder.id!); setSidebarOpen(false); }}
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px", borderRadius:7, cursor:"pointer" }}
                        onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.background="#f0f0f3"; (e.currentTarget.querySelector(".filemenu") as HTMLElement)?.style.setProperty("opacity","1"); }}
                        onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget.querySelector(".filemenu") as HTMLElement)?.style.setProperty("opacity","0"); }}>
                        <span style={{ fontSize:13, flexShrink:0 }}>{EXT_ICON[file.type]||"📎"}</span>
                        {renaming===fileMenuId ? (
                          <input autoFocus value={renameValue} onClick={e=>e.stopPropagation()}
                            onChange={e=>setRenameValue(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter")handleRenameFile(folder.id!, file.id!); if(e.key==="Escape")setRenaming(null); }}
                            onBlur={()=>handleRenameFile(folder.id!, file.id!)}
                            style={{ flex:1, fontSize:12, padding:"2px 5px", border:`1px solid ${C.blue}`, borderRadius:5, outline:"none", minWidth:0 }}/>
                        ) : (
                          <span style={{ flex:1, fontSize:12.5, color:C.text2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }} title={file.name}>{file.name}</span>
                        )}
                        {file.hasCube && <span title="Interactive dashboard" style={{ fontSize:10, color:C.purple, flexShrink:0 }}>📊</span>}
                        {file.status==="error" && <span title="Parse error" style={{ fontSize:10, color:C.red, flexShrink:0 }}>⚠</span>}
                        <span className="filemenu" style={{ opacity:0, transition:"opacity .15s", flexShrink:0 }}>
                          <KebabMenu id={fileMenuId}
                            onRename={()=>{ setRenameValue(file.name); setRenaming(fileMenuId); setMenuOpen(null); }}
                            onDelete={()=>handleDeleteFile(folder.id!, file.id!, file.name)}/>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column" }}>
      <Nav/>

      {/* Stats bar */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"10px 20px", display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
        <button onClick={()=>setSidebarOpen(true)} className="tree-toggle"
          style={{ display:"none", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", fontSize:13, cursor:"pointer", color:C.text2 }}>☰ Folders</button>
        {[
          { label:"Businesses", value:folders.length, color:C.blue },
          { label:"Files",      value:totalFiles,     color:C.text },
          { label:"Rows analyzed", value:totalRows >= 1000 ? `${(totalRows/1000).toFixed(0)}K` : totalRows, color:C.purple },
          { label:"Insights ready", value:analyzedCount, color:C.green },
        ].map(s => (
          <div key={s.label} style={{ display:"flex", alignItems:"baseline", gap:7 }}>
            <span style={{ fontSize:18, fontWeight:700, color:s.color, letterSpacing:"-0.3px" }}>{s.value}</span>
            <span style={{ fontSize:12, color:C.text3 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Body: sidebar + main */}
      <div style={{ flex:1, display:"flex", minHeight:0 }}>

        {/* Desktop sidebar */}
        <aside className="tree-desktop" style={{ width:264, flexShrink:0, background:C.surface, borderRight:`1px solid ${C.border}`, overflowY:"auto" }}>
          {TreeSidebar}
        </aside>

        {/* Mobile drawer */}
        {sidebarOpen && (
          <div onClick={()=>setSidebarOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200 }}>
            <aside onClick={e=>e.stopPropagation()} style={{ width:280, height:"100%", background:C.surface, boxShadow:shadow.md }}>{TreeSidebar}</aside>
          </div>
        )}

        {/* Main panel */}
        <main style={{ flex:1, overflowY:"auto", padding:"24px 28px", minWidth:0 }}>
          <div style={{ maxWidth:780, margin:"0 auto" }}>

            {!activeFolderId ? (
              <div style={{ textAlign:"center", padding:"80px 20px", background:C.surface, border:`1px dashed ${C.border2}`, borderRadius:radius.xl, boxShadow:shadow.sm }}>
                <div style={{ fontSize:56, marginBottom:18 }}>🗂️</div>
                <h2 style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:10 }}>Welcome to your workspace</h2>
                <p style={{ fontSize:14, color:C.text3, marginBottom:24, maxWidth:420, margin:"0 auto 24px", lineHeight:1.6 }}>
                  Create a folder for each business or dataset. Upload your files and DashWise will analyze them, build dashboards, and answer your questions.
                </p>
                <button onClick={()=>setShowNewFolder(true)} style={{ ...btnPrimary, padding:"13px 26px" }}>+ Create your first folder</button>
              </div>
            ) : (
              <>
                {/* Folder header with breadcrumb */}
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:12, color:C.text3, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                    <Link href="/overview" style={{ color:C.text3, textDecoration:"none" }}>Account</Link>
                    <span>›</span>
                    <span style={{ color:C.text2, fontWeight:500 }}>{activeFolder?.bizName}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                    <h1 style={{ fontSize:24, fontWeight:700, letterSpacing:"-0.5px", color:C.text }}>{activeFolder?.bizName}</h1>
                    <KebabMenu id={`folder:${activeFolderId}`}
                      onRename={()=>{ setRenameValue(activeFolder?.bizName||""); setRenaming(`folder:${activeFolderId}`); setMenuOpen(null); }}
                      onDelete={()=>handleDeleteFolder(activeFolderId, activeFolder?.bizName||"")}/>
                  </div>
                  <p style={{ fontSize:13, color:C.text3, marginTop:2 }}>
                    {files.length} file{files.length!==1?"s":""} · {readyFiles.length} ready
                    {analyzedAt && <span style={{ color:C.green, fontWeight:500 }}> · analyzed {new Date(analyzedAt).toLocaleDateString()}</span>}
                  </p>
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
                <div onClick={()=>!uploading&&fileInputRef.current?.click()}
                  style={{ background:C.surface, border:`2px dashed ${C.border2}`, borderRadius:radius.lg, padding:"30px 20px", textAlign:"center", cursor:uploading?"default":"pointer", marginBottom:16, boxShadow:shadow.sm, transition:"border-color 0.2s" }}
                  onMouseEnter={e=>{ if(!uploading)(e.currentTarget as HTMLElement).style.borderColor=C.blue; }}
                  onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor=C.border2; }}>
                  <input ref={fileInputRef} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,.pdf,.txt,.json" onChange={handleUpload} style={{ display:"none" }}/>
                  {uploading ? (
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                      <Spinner size={24}/>
                      <div style={{ fontSize:14, color:C.text2, fontWeight:500 }}>{uploadProgress ? `Parsing file ${uploadProgress.current} of ${uploadProgress.total}…` : "Parsing…"}</div>
                      <div style={{ fontSize:12, color:C.text3 }}>Files parse in your browser — don&apos;t close this page</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:30, marginBottom:8 }}>⬆️</div>
                      <div style={{ fontWeight:600, fontSize:14, color:C.text, marginBottom:3 }}>Click to upload files</div>
                      <div style={{ fontSize:12, color:C.text3 }}>CSV · Excel · PDF · TXT · JSON · Max {MAX_FILE_MB}MB each</div>
                    </>
                  )}
                </div>

                {/* File list (main) */}
                {files.length > 0 && (
                  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm, marginBottom:16 }}>
                    {files.map((file, i) => (
                      <div key={file.id||i} style={{ display:"flex", alignItems:"center", gap:11, padding:"13px 16px", borderBottom:i<files.length-1?`1px solid #f9f9fb`:"none" }}>
                        <span style={{ fontSize:20, flexShrink:0 }}>{EXT_ICON[file.type]||"📎"}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
                          <div style={{ fontSize:11, color:C.text3, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
                            <span>{(file.size/1024).toFixed(1)} KB</span>
                            {file.sheets?.length ? <span>{file.sheets.length} sheets</span> : null}
                            {(file.rowCount||0)>0 ? <span>{file.rowCount?.toLocaleString()} rows</span> : null}
                            {file.hasCube && <span style={{ color:C.purple }}>📊 interactive</span>}
                            {file.id && embeddingStatus[file.id]==="embedding" && <span style={{ color:C.blue, display:"flex", alignItems:"center", gap:3 }}><Spinner size={10}/> indexing…</span>}
                            {file.id && embeddingStatus[file.id]==="ready" && <span style={{ color:C.green }}>🔍 AI search ready</span>}
                          </div>
                        </div>
                        {file.status==="uploading" ? (
                          <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}><Spinner size={14}/><span style={{ fontSize:11, color:C.text3 }}>Parsing…</span></div>
                        ) : (
                          <span style={{ fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:20, flexShrink:0, background:file.status==="ready"?C.greenBg:C.redBg, color:file.status==="ready"?C.green:C.red, border:`1px solid ${file.status==="ready"?"#c8f0d8":"#ffd6d6"}` }}>{file.status==="ready"?"✓ Ready":"Error"}</span>
                        )}
                        {file.id && file.status!=="uploading" && (
                          deletingId===file.id ? <Spinner size={14}/> :
                          <KebabMenu id={`mainfile:${file.id}`}
                            onRename={()=>{ setRenameValue(file.name); setRenaming(`mainfile:${file.id}`); setMenuOpen(null); }}
                            onDelete={()=>handleDeleteFile(activeFolderId, file.id!, file.name)}/>
                        )}
                        {renaming===`mainfile:${file.id}` && (
                          <input autoFocus value={renameValue} onChange={e=>setRenameValue(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter")handleRenameFile(activeFolderId, file.id!); if(e.key==="Escape")setRenaming(null); }}
                            onBlur={()=>handleRenameFile(activeFolderId, file.id!)}
                            style={{ position:"absolute", right:60, fontSize:12, padding:"4px 8px", border:`1px solid ${C.blue}`, borderRadius:6, outline:"none" }}/>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Analysis controls */}
                {readyFiles.length > 0 && (
                  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, padding:18, boxShadow:shadow.sm, marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", color:C.text3, marginBottom:12 }}>Analysis Mode</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                      {MODES.map(m => (
                        <button key={m.id} onClick={()=>setMode(m.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 12px", borderRadius:radius.sm, cursor:"pointer", background:mode===m.id?C.blueBg:C.bg, border:mode===m.id?`1.5px solid ${C.blue}`:`1px solid ${C.border}`, textAlign:"left" }}>
                          <span style={{ fontSize:18, flexShrink:0 }}>{m.icon}</span>
                          <div><div style={{ fontSize:12, fontWeight:600, color:mode===m.id?C.blue:C.text }}>{m.label}</div><div style={{ fontSize:11, color:C.text3 }}>{m.desc}</div></div>
                        </button>
                      ))}
                    </div>
                    <button onClick={handleAnalyzeAll} disabled={analyzing} style={{ ...btnPrimary, width:"100%", padding:"14px", borderRadius:radius.sm, fontSize:15, opacity:analyzing?.6:1 }}>
                      {analyzing ? <><Spinner size={16} color="#fff"/> Analyzing {readyFiles.length} file{readyFiles.length!==1?"s":""}…</> : `🧠 Analyze ${readyFiles.length} file${readyFiles.length!==1?"s":""} →`}
                    </button>
                    {dashData != null && (
                      <button onClick={openDashboardWindow} style={{ ...btnPrimary, width:"100%", marginTop:10, padding:"13px", borderRadius:radius.sm, fontSize:14, background:"transparent", color:C.blue, border:`2px solid ${C.blue}` }}>🚀 Open Full Dashboard (new window)</button>
                    )}
                  </div>
                )}

                {/* Analysis result */}
                {analysis && (
                  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>
                    <div style={{ background:C.text, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div>
                        <div style={{ fontSize:11, color:"rgba(245,245,247,0.5)", marginBottom:3 }}>{MODES.find(m=>m.id===mode)?.icon} {MODES.find(m=>m.id===mode)?.label}{analyzedAt && ` · ${new Date(analyzedAt).toLocaleString()}`}</div>
                        <div style={{ fontSize:15, fontWeight:600, color:"#f5f5f7" }}>{activeFolder?.bizName}</div>
                      </div>
                      <button onClick={()=>{setAnalysis(null);setDashData(null);setAnalyzedAt(null);}} style={{ background:"rgba(255,255,255,0.1)", border:"none", color:"rgba(255,255,255,0.7)", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:16 }}>×</button>
                    </div>
                    <div style={{ padding:"20px 18px" }}>{renderAnalysis(analysis)}</div>
                    <div style={{ padding:"14px 18px", borderTop:`1px solid ${C.border}`, display:"flex", gap:10, flexWrap:"wrap" }}>
                      {dashData != null && <button onClick={openDashboardWindow} style={{ ...btnPrimary, flex:1, minWidth:140, padding:"11px", borderRadius:radius.sm, fontSize:13 }}>📊 Open Dashboard</button>}
                      <Link href="/advisor" style={{ ...btnPrimary, flex:1, minWidth:120, padding:"11px", borderRadius:radius.sm, textAlign:"center", fontSize:13, background:C.bg, color:C.text, border:`1px solid ${C.border}` }}>💬 Ask Advisor</Link>
                      <button onClick={handleAnalyzeAll} disabled={analyzing} style={{ padding:"11px 16px", borderRadius:radius.sm, background:C.bg, border:`1px solid ${C.border}`, color:C.text2, fontSize:13, cursor:"pointer", flexShrink:0 }}>↻ Re-analyze</button>
                    </div>
                  </div>
                )}

                {/* Empty folder state */}
                {files.length===0 && !uploading && (
                  <div style={{ textAlign:"center", padding:"48px 20px", background:C.surface, border:`1px dashed ${C.border2}`, borderRadius:radius.lg }}>
                    <div style={{ fontSize:44, marginBottom:12 }}>📄</div>
                    <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:6 }}>This folder is empty</div>
                    <div style={{ fontSize:13, color:C.text3, maxWidth:340, margin:"0 auto", lineHeight:1.6 }}>Upload a spreadsheet, CSV, or PDF using the zone above. DashWise will analyze it and build an interactive dashboard.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @media (max-width: 820px) {
          .tree-desktop { display: none !important; }
          .tree-toggle  { display: inline-block !important; }
        }
      `}</style>
    </div>
  );
}
