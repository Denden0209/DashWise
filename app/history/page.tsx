"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getUserFolders, getFolderFiles, BusinessFolder, FolderFile } from "@/lib/db";
import Nav from "@/components/Nav";

type FolderWithFiles = BusinessFolder & { files: FolderFile[] };

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string,string> = { csv:"📊", xlsx:"📗", xls:"📗", pdf:"📄", txt:"📝", json:"🔧" };
  return map[ext] || "📎";
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/(1024*1024)).toFixed(1) + " MB";
}

export default function HistoryPage() {
  const { user }  = useAuth();
  const [folders,  setFolders]  = useState<FolderWithFiles[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Record<string,boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const list = await getUserFolders(user.uid);
      const withFiles = await Promise.all(list.map(async f => ({ ...f, files: await getFolderFiles(user.uid, f.id!) })));
      setFolders(withFiles);
      if (withFiles.length > 0) setExpanded({ [withFiles[0].id!]: true });
      setLoading(false);
    })();
  }, [user]);

  const totalFiles = folders.reduce((s, f) => s + f.files.length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      <Nav />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: "#f5f5f7", marginBottom: 4 }}>Upload History</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,247,0.4)" }}>{folders.length} folders · {totalFiles} files</p>
          </div>
          <Link href="/files" style={{ background: "#2997ff", color: "#fff", fontWeight: 600, fontSize: 13, padding: "10px 20px", borderRadius: 980, textDecoration: "none" }}>+ Upload Files</Link>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 60, color: "rgba(245,245,247,0.3)" }}>Loading...</div>}

        {!loading && folders.length === 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 20, padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📂</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#f5f5f7", marginBottom: 8 }}>No uploads yet</h3>
            <p style={{ fontSize: 14, color: "rgba(245,245,247,0.4)", marginBottom: 24 }}>Create a folder and upload your business files to get started.</p>
            <Link href="/files" style={{ background: "#2997ff", color: "#fff", fontWeight: 600, fontSize: 14, padding: "12px 28px", borderRadius: 980, textDecoration: "none" }}>Go to Files →</Link>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {folders.map(folder => {
            const open = !!expanded[folder.id!];
            return (
              <div key={folder.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden" }}>
                <button onClick={() => setExpanded(p => ({ ...p, [folder.id!]: !p[folder.id!] }))}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <span style={{ fontSize: 24 }}>📁</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#f5f5f7" }}>{folder.bizName}</div>
                    <div style={{ fontSize: 12, color: "rgba(245,245,247,0.35)", marginTop: 2 }}>{folder.files.length} file{folder.files.length !== 1 ? "s" : ""}{folder.lastAnalysisSummary ? " · analyzed" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {folder.lastAnalysisSummary && <span style={{ fontSize: 11, background: "rgba(48,209,88,0.15)", color: "#30d158", padding: "2px 10px", borderRadius: 20, fontWeight: 500 }}>✓ Analyzed</span>}
                    <span style={{ color: "rgba(245,245,247,0.3)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open && folder.lastAnalysisSummary && (
                  <div style={{ margin: "0 20px 12px", background: "rgba(41,151,255,0.08)", border: "1px solid rgba(41,151,255,0.15)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "#2997ff", marginBottom: 6 }}>Last Analysis</div>
                    <p style={{ fontSize: 13, color: "rgba(245,245,247,0.7)", lineHeight: 1.5 }}>{folder.lastAnalysisSummary}</p>
                    <Link href="/files" style={{ display: "block", marginTop: 8, fontSize: 12, color: "#2997ff", textDecoration: "none" }}>Re-analyze →</Link>
                  </div>
                )}

                {open && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {folder.files.length === 0 ? (
                      <div style={{ padding: "14px 20px", fontSize: 13, color: "rgba(245,245,247,0.3)" }}>
                        No files. <Link href="/files" style={{ color: "#2997ff", textDecoration: "none" }}>Upload now →</Link>
                      </div>
                    ) : folder.files.map(file => (
                      <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: 18 }}>{fileIcon(file.name)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#f5f5f7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                          <div style={{ fontSize: 11, color: "rgba(245,245,247,0.35)", marginTop: 2 }}>{fmtSize(file.size)} · {file.type.toUpperCase()}{file.sheets?.length ? ` · ${file.sheets.length} sheets` : ""}</div>
                        </div>
                        <span style={{ fontSize: 11, background: file.status === "ready" ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.06)", color: file.status === "ready" ? "#30d158" : "rgba(245,245,247,0.4)", padding: "2px 10px", borderRadius: 20, fontWeight: 500, flexShrink: 0 }}>
                          {file.status === "ready" ? "✓ Ready" : file.status}
                        </span>
                      </div>
                    ))}
                    <div style={{ padding: "12px 20px", display: "flex", gap: 16 }}>
                      <Link href="/files" style={{ fontSize: 12, color: "#2997ff", textDecoration: "none", fontWeight: 500 }}>Open in Files →</Link>
                      <span style={{ color: "rgba(255,255,255,0.1)" }}>|</span>
                      <Link href={`/advisor?q=${encodeURIComponent(`Tell me everything about my ${folder.bizName} business`)}`} style={{ fontSize: 12, color: "#2997ff", textDecoration: "none", fontWeight: 500 }}>Ask Advisor →</Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
