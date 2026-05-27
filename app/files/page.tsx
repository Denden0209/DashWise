"use client";
// app/files/page.tsx — FILE FOLDER MANAGER
// Stores parsed file content directly in Firestore.
// No Firebase Storage required — works on all Firebase plans.

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AnalysisDashboard, { DashboardData } from "@/components/AnalysisDashboard";

import { useAuth } from "@/lib/AuthContext";
import {
  createFolder, getUserFolders, addFileToFolder,
  getFolderFiles, saveFolderAnalysis,
  BusinessFolder, FolderFile,
} from "@/lib/db";

const ACCEPTED = ".csv,.xlsx,.xls,.xlsm,.pdf,.txt,.json";
const FILE_ICONS: Record<string, string> = {
  csv: "📊", xlsx: "📗", xls: "📗", xlsm: "📗",
  pdf: "📄", txt:  "📝", json: "🔧", default: "📎",
};
const MODES = [
  { id: "explain", icon: "💡", label: "Full Report",  desc: "Complete consolidated analysis" },
  { id: "meeting", icon: "🗓️", label: "Meeting Prep", desc: "Briefing from all files" },
  { id: "anomaly", icon: "🔍", label: "Find Issues",  desc: "Anomalies across all data" },
  { id: "action",  icon: "⚡", label: "Action Plan",  desc: "What to do based on all data" },
];

function getIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "default";
  return FILE_ICONS[ext] || FILE_ICONS.default;
}
function fmtSize(bytes: number) {
  if (bytes < 1024)        return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function FilesPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [folders,      setFolders]      = useState<BusinessFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<BusinessFolder | null>(null);
  const [folderFiles,  setFolderFiles]  = useState<FolderFile[]>([]);
  const [uploading,    setUploading]    = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Record<string, "uploading"|"parsing"|"done"|"error">>({});
  const [analyzing,    setAnalyzing]    = useState(false);
  const [analysis,     setAnalysis]     = useState<string | null>(null);
  const [dashData,     setDashData]     = useState<DashboardData | null>(null);
  const [mode,         setMode]         = useState("explain");
  const [isDragging,   setIsDragging]   = useState(false);
  const [showNew,      setShowNew]      = useState(false);
  const [newName,      setNewName]      = useState("");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [dashReady,    setDashReady]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) loadFolders();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFolders() {
    if (!user) return;
    const list = await getUserFolders(user.uid);
    setFolders(list);
    if (list.length > 0 && !activeFolder) openFolder(list[0]);
  }

  async function openFolder(folder: BusinessFolder) {
    setActiveFolder(folder);
    setAnalysis(null);
    setErrorMsg("");
    if (!user || !folder.id) return;
    const files = await getFolderFiles(user.uid, folder.id);
    setFolderFiles(files);
  }

  async function handleCreateFolder() {
    if (!user || !newName.trim()) return;
    const id = await createFolder(user.uid, {
      bizName:   newName.trim(),
      bizType:   profile?.bizType || "retail",
      fileCount: 0,
    });
    const f: BusinessFolder = { id, bizName: newName.trim(), bizType: profile?.bizType || "retail", fileCount: 0 };
    setFolders(prev => [f, ...prev]);
    setActiveFolder(f);
    setFolderFiles([]);
    setShowNew(false);
    setNewName("");
    setAnalysis(null);
  }

  // ── Upload + parse files ───────────────────────────────
  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || !user || !activeFolder?.id) return;
    setUploading(true);
    setErrorMsg("");

    for (const file of Array.from(fileList)) {
      const key = `${Date.now()}-${file.name}`;
      setUploadStatus(p => ({ ...p, [key]: "uploading" }));

      try {
        // Parse file via API
        setUploadStatus(p => ({ ...p, [key]: "parsing" }));
        const fd = new FormData();
        fd.append("file", file);

        const res  = await fetch("/api/parse-files", { method: "POST", body: fd });

        // Check if we got JSON back
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const text = await res.text();
          console.error("Non-JSON response:", text.slice(0, 200));
          throw new Error("Server error — check your terminal for details");
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Parse failed");

        // Save to Firestore (no Firebase Storage needed)
        const record: Omit<FolderFile, "id"> = {
          name:           file.name,
          size:           file.size,
          type:           file.name.split(".").pop()?.toLowerCase() || "unknown",
          storagePath:    "",          // empty — not using Storage
          downloadURL:    "",          // empty — not using Storage
          parsedContent:  data.content || "",
          sheets:         data.sheets  || [],
          rowCount:       data.rowCount || 0,
          status:         "ready",
        };

        const newId = await addFileToFolder(user.uid, activeFolder.id, record);
        setFolderFiles(prev => [{ id: newId, ...record }, ...prev]);
        setUploadStatus(p => ({ ...p, [key]: "done" }));

      } catch (err: unknown) {
        console.error("Upload error:", err);
        setErrorMsg(err instanceof Error ? err.message : "Upload failed");
        setUploadStatus(p => ({ ...p, [key]: "error" }));
      }
    }

    setUploading(false);
    loadFolders();
  }, [user, activeFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // ── Analyze all files ──────────────────────────────────
  async function handleAnalyzeAll() {
    if (!user || !activeFolder?.id) return;
    const ready = folderFiles.filter(f => f.status === "ready" && f.parsedContent);
    if (ready.length === 0) return;

    setAnalyzing(true);
    setAnalysis(null);
    setErrorMsg("");

    try {
      const res  = await fetch("/api/analyze-folder", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files:        ready.map(f => ({
            fileName: f.name,
            fileType: f.type,
            content:  f.parsedContent || "",
            sheets:   f.sheets || [],
          })),
          businessType: profile?.bizType || "retail",
          bizName:      activeFolder.bizName,
          mode,
          goals:        profile?.goals || [],
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server error analyzing files — check terminal");
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Analysis failed");

      setAnalysis(data.analysis);
      setDashData(data.dashboardData || null);
      setDashReady(true);
      // Save to sessionStorage so dashboard-view page can read it
      try {
        sessionStorage.setItem("dashwise-analysis", JSON.stringify({
          dashboardData: data.dashboardData,
          narrative: data.analysis,
          bizName: activeFolder?.bizName || "",
          mode,
        }));
      } catch (e) { console.error("sessionStorage error:", e); }
      await saveFolderAnalysis(user.uid, activeFolder.id, data.analysis.slice(0, 300));

    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Render analysis text ───────────────────────────────
  function renderAnalysis(text: string) {
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-1" />;
      if (line.startsWith("**") && line.endsWith("**"))
        return <div key={i} className="font-bold text-gray-900 text-base mt-5 mb-2 pb-1 border-b border-gray-100">{line.replace(/\*\*/g, "")}</div>;
      if (line.match(/\*\*(.*?)\*\*/))
        return <div key={i} className="text-sm text-gray-700 mb-1 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}/>;
      if (line.match(/^[🚨⚠️✅❓🔍]/))
        return <div key={i} className="font-semibold text-gray-900 mt-4 mb-1 text-sm">{line}</div>;
      if (line.startsWith("- ") || line.startsWith("• "))
        return <div key={i} className="text-sm text-gray-600 pl-3 py-0.5 border-l-2 border-gray-200 ml-1 mb-1">{line.replace(/^[-•]\s/, "")}</div>;
      return <div key={i} className="text-sm text-gray-700 leading-relaxed mb-1">{line}</div>;
    });
  }

  const readyCount = folderFiles.filter(f => f.status === "ready").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6">

        {/* ── Sidebar — Folders ── */}
        <aside className="w-60 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-sm">My Folders</h2>
            <button onClick={() => { setShowNew(true); setNewName(profile?.bizName || ""); }}
              className="text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 font-semibold">
              + New
            </button>
          </div>

          {showNew && (
            <div className="bg-white border border-blue-200 rounded-xl p-3 mb-3 shadow-sm">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateFolder()}
                placeholder="Business name..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              <div className="flex gap-2">
                <button onClick={handleCreateFolder} className="flex-1 bg-blue-600 text-white text-xs font-bold py-1.5 rounded-lg hover:bg-blue-700">Create</button>
                <button onClick={() => setShowNew(false)} className="flex-1 border border-gray-200 text-xs text-gray-600 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {folders.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-xs">No folders yet.<br/>Click + New to start.</div>
            )}
            {folders.map(f => (
              <button key={f.id} onClick={() => openFolder(f)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-all ${
                  activeFolder?.id === f.id
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-100 hover:border-gray-300"
                }`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">📁</span>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm truncate ${activeFolder?.id === f.id ? "text-white" : "text-gray-900"}`}>{f.bizName}</div>
                    <div className={`text-xs ${activeFolder?.id === f.id ? "text-blue-200" : "text-gray-400"}`}>{f.fileCount} file{f.fileCount !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">
          {!activeFolder ? (
            <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-4">📁</div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Create your first folder</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-xs">Each folder is a business. Upload CSV, Excel, PDF files and analyze them all together.</p>
              <button onClick={() => setShowNew(true)} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm">+ Create folder</button>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">📁 {activeFolder.bizName}</h1>
                  <p className="text-gray-400 text-xs mt-0.5">{folderFiles.length} file{folderFiles.length !== 1 ? "s" : ""} · {readyCount} ready</p>
                </div>
              </div>

              {/* Error message */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
                  <span className="flex-shrink-0">⚠️</span>
                  <span>{errorMsg}</span>
                  <button onClick={() => setErrorMsg("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                </div>
              )}

              {/* Upload zone */}
              <div
                className={`border-2 border-dashed rounded-2xl transition-all mb-4 cursor-pointer ${
                  isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-gray-400"
                }`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center justify-center py-10 text-center pointer-events-none">
                  <div className="text-4xl mb-3">{uploading ? "⏳" : "☁️"}</div>
                  <div className="font-semibold text-gray-700 mb-1">
                    {uploading ? "Uploading and parsing files..." : "Drop files here or click to browse"}
                  </div>
                  <div className="text-xs text-gray-400">CSV · Excel (all sheets) · PDF · TXT · JSON · Multiple files at once</div>
                </div>
                <input ref={fileInputRef} type="file" multiple accept={ACCEPTED} className="hidden"
                  onChange={e => handleFiles(e.target.files)}/>
              </div>

              {/* Upload progress */}
              {Object.entries(uploadStatus).filter(([,v]) => v !== "done").length > 0 && (
                <div className="space-y-1 mb-4">
                  {Object.entries(uploadStatus).filter(([,v]) => v !== "done" && v !== "error").map(([key, status]) => (
                    <div key={key} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
                      {status === "uploading" ? "Uploading..." : "Parsing file content..."}
                    </div>
                  ))}
                </div>
              )}

              {/* File list */}
              {folderFiles.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-900 text-sm">Files</span>
                    <span className="text-xs text-gray-400">{folderFiles.length} total · {readyCount} parsed</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {folderFiles.map(file => (
                      <div key={file.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="text-xl flex-shrink-0">{getIcon(file.name)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">{file.name}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>{fmtSize(file.size)}</span>
                            {file.sheets && file.sheets.length > 0 && (
                              <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-xs font-medium">
                                {file.sheets.length} sheet{file.sheets.length !== 1 ? "s" : ""}: {file.sheets.slice(0,3).join(", ")}{file.sheets.length > 3 ? "..." : ""}
                              </span>
                            )}
                            {(file.rowCount ?? 0) > 0 && <span>{file.rowCount} rows</span>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          file.status === "ready"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : file.status === "error"
                            ? "bg-red-50 text-red-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {file.status === "ready" ? "✓ Ready" : file.status === "error" ? "Error" : "Processing..."}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analyze section */}
              {readyCount > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                  <h3 className="font-bold text-gray-900 mb-1">Analyze All Files Together</h3>
                  <p className="text-gray-500 text-xs mb-4">
                    Claude reads every file including all Excel sheets and cross-references them for a single consolidated report.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    {MODES.map(m => (
                      <button key={m.id} onClick={() => setMode(m.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${mode === m.id ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <div className="text-lg mb-1">{m.icon}</div>
                        <div className={`text-xs font-bold ${mode === m.id ? "text-blue-700" : "text-gray-900"}`}>{m.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5 leading-tight">{m.desc}</div>
                      </button>
                    ))}
                  </div>

                  <button onClick={handleAnalyzeAll} disabled={analyzing}
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-40 text-sm flex items-center justify-center gap-2">
                    {analyzing ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Analyzing {readyCount} file{readyCount !== 1 ? "s" : ""}...</>
                    ) : (
                      `🧠 Analyze ${readyCount} file${readyCount !== 1 ? "s" : ""} together →`
                    )}
                  </button>

                {/* View Full Dashboard button */}
                {dashReady && (
                  <button
                    onClick={() => router.push("/dashboard-view")}
                    className="w-full mt-2 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
                    style={{ border: "2px solid #6366f1", color: "#818cf8", background: "transparent" }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.background = "#6366f1"; (e.target as HTMLElement).style.color = "white"; }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.color = "#818cf8"; }}>
                    🚀 Open Full Dashboard View
                  </button>
                )}
                </div>
              )}

               {/* Analysis result — visual dashboard */}
               {(analysis || dashData) && (
                 <AnalysisDashboard
                   data={dashData || {}}
                   narrative={analysis || ""}
                   bizName={activeFolder.bizName}
                   filesCount={readyCount}
                   mode={mode}
                   onReanalyze={handleAnalyzeAll}
                   onDiscuss={() => { window.location.href = "/advisor"; }}
                 />
               )}


              {folderFiles.length === 0 && !uploading && (
                <div className="text-center py-8 text-gray-400 text-sm">Drop files above to get started</div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
