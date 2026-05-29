"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserFolders, getFolderFiles, BusinessFolder, FolderFile } from "@/lib/db";
import Nav from "@/components/Nav";
import { C, radius, shadow, btnPrimary } from "@/lib/styles";

type FolderWithFiles = BusinessFolder & { files: FolderFile[] };

const EXT_ICON: Record<string,string> = { csv:"📊", xlsx:"📗", xls:"📗", pdf:"📄", txt:"📝", json:"🔧" };
const fmtSize = (b:number) => b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":(b/1048576).toFixed(1)+" MB";

export default function HistoryPage() {
  const { user } = useAuth();
  const [folders,  setFolders]  = useState<FolderWithFiles[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Record<string,boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const list = await getUserFolders(user.uid);
      const wf   = await Promise.all(list.map(async f => ({ ...f, files: await getFolderFiles(user.uid, f.id!) })));
      setFolders(wf);
      if (wf.length > 0) setExpanded({ [wf[0].id!]: true });
      setLoading(false);
    })();
  }, [user]);

  const totalFiles = folders.reduce((s,f) => s + f.files.length, 0);

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <Nav/>
      <main style={{ maxWidth:800, margin:"0 auto", padding:"36px 28px" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28, flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.5px", color:C.text, marginBottom:4 }}>Upload History</h1>
            <p style={{ fontSize:14, color:C.text3 }}>{folders.length} folder{folders.length!==1?"s":""} · {totalFiles} file{totalFiles!==1?"s":""}</p>
          </div>
          <Link href="/files" style={{ ...btnPrimary, padding:"10px 20px" }}>+ Upload Files</Link>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign:"center", padding:60 }}>
            <div style={{ width:32, height:32, border:`2px solid ${C.blue}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 12px" }}/>
            <div style={{ fontSize:13, color:C.text3 }}>Loading your history...</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && folders.length === 0 && (
          <div style={{ background:C.surface, border:`1px dashed ${C.border2}`, borderRadius:radius.xl, padding:"60px 40px", textAlign:"center", boxShadow:shadow.sm }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📂</div>
            <h3 style={{ fontSize:20, fontWeight:600, color:C.text, marginBottom:8 }}>No uploads yet</h3>
            <p style={{ fontSize:14, color:C.text3, marginBottom:24 }}>Create a folder and upload your first business file to get started.</p>
            <Link href="/files" style={{ ...btnPrimary }}>Go to Files →</Link>
          </div>
        )}

        {/* Folder list */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {folders.map(folder => {
            const open        = !!expanded[folder.id!];
            const readyCount  = folder.files.filter(f => f.status === "ready").length;
            return (
              <div key={folder.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:radius.lg, overflow:"hidden", boxShadow:shadow.sm }}>

                {/* Folder row */}
                <button
                  onClick={() => setExpanded(p => ({ ...p, [folder.id!]: !p[folder.id!] }))}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"18px 22px", background:"none", border:"none", cursor:"pointer", textAlign:"left" as const }}
                >
                  <span style={{ fontSize:24 }}>📁</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:15, color:C.text }}>{folder.bizName}</div>
                    <div style={{ fontSize:12, color:C.text3, marginTop:2 }}>
                      {folder.files.length} file{folder.files.length!==1?"s":""}
                      {readyCount > 0 && ` · ${readyCount} parsed`}
                      {folder.lastAnalysisSummary && " · analyzed"}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                    {folder.lastAnalysisSummary && (
                      <span style={{ fontSize:11, background:"#f0faf4", color:"#34c759", border:"1px solid #c8f0d8", padding:"3px 10px", borderRadius:20, fontWeight:600 }}>
                        ✓ Analyzed
                      </span>
                    )}
                    <span style={{ color:C.text3, fontSize:12, fontWeight:500 }}>{open?"▲":"▼"}</span>
                  </div>
                </button>

                {/* Analysis summary */}
                {open && folder.lastAnalysisSummary && (
                  <div style={{ margin:"0 22px 14px", background:C.blueBg, border:`1px solid ${C.blueMid}`, borderRadius:radius.md, padding:16 }}>
                    <div style={{ fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:"0.5px", color:C.blue, marginBottom:6 }}>
                      Last Analysis
                    </div>
                    <p style={{ fontSize:13, color:C.text2, lineHeight:1.6 }}>{folder.lastAnalysisSummary}</p>
                    <Link href="/files" style={{ display:"block", marginTop:10, fontSize:12, color:C.blue, fontWeight:500 }}>Re-analyze →</Link>
                  </div>
                )}

                {/* File list */}
                {open && (
                  <div style={{ borderTop:`1px solid ${C.border}` }}>
                    {folder.files.length === 0 ? (
                      <div style={{ padding:"14px 22px", fontSize:13, color:C.text3 }}>
                        No files yet.{" "}
                        <Link href="/files" style={{ color:C.blue, fontWeight:500 }}>Upload now →</Link>
                      </div>
                    ) : (
                      folder.files.map(file => (
                        <div key={file.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 22px", borderBottom:`1px solid #f9f9fb` }}>
                          <span style={{ fontSize:20, flexShrink:0 }}>{EXT_ICON[file.name.split(".").pop()?.toLowerCase()||""]||"📎"}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</div>
                            <div style={{ fontSize:11, color:C.text3, marginTop:2 }}>
                              {fmtSize(file.size)} · {file.type.toUpperCase()}
                              {file.sheets?.length ? ` · ${file.sheets.length} sheets` : ""}
                              {(file.rowCount||0) > 0 ? ` · ${file.rowCount} rows` : ""}
                            </div>
                          </div>
                          <span style={{
                            fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, flexShrink:0,
                            background: file.status==="ready"?"#f0faf4":"#f5f5f7",
                            color:      file.status==="ready"?"#34c759":C.text3,
                            border:     `1px solid ${file.status==="ready"?"#c8f0d8":C.border}`,
                          }}>
                            {file.status==="ready" ? "✓ Ready" : file.status}
                          </span>
                        </div>
                      ))
                    )}

                    {/* Footer actions */}
                    <div style={{ padding:"12px 22px", display:"flex", gap:16, flexWrap:"wrap" as const }}>
                      <Link href="/files" style={{ fontSize:13, color:C.blue, fontWeight:500 }}>Open in Files →</Link>
                      <span style={{ color:C.border }}>|</span>
                      <Link href={`/advisor?q=${encodeURIComponent(`Tell me everything about my ${folder.bizName} business`)}`} style={{ fontSize:13, color:C.blue, fontWeight:500 }}>
                        Ask Advisor →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
