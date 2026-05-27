"use client";
// app/history/page.tsx
// Shows ALL uploads across ALL folders — grouped by folder.
// Each upload links back to its folder for re-analysis.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import {
  getUserFolders, getFolderFiles,
  BusinessFolder, FolderFile,
} from "@/lib/db";
import Nav from "@/components/Nav";

type FolderWithFiles = BusinessFolder & { files: FolderFile[] };

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    csv: "📊", xlsx: "📗", xls: "📗", xlsm: "📗",
    pdf: "📄", txt: "📝", json: "🔧",
  };
  return map[ext] || "📎";
}
function fmtSize(bytes: number) {
  if (bytes < 1024)        return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [folders,  setFolders]  = useState<FolderWithFiles[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const folderList = await getUserFolders(user.uid);
      const withFiles  = await Promise.all(
        folderList.map(async f => ({
          ...f,
          files: await getFolderFiles(user.uid, f.id!),
        }))
      );
      setFolders(withFiles);
      // Auto-expand first folder
      if (withFiles.length > 0) {
        setExpanded({ [withFiles[0].id!]: true });
      }
      setLoading(false);
    })();
  }, [user]);

  const totalFiles   = folders.reduce((s, f) => s + f.files.length, 0);
  const totalFolders = folders.length;

  function toggleFolder(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload History</h1>
            <p className="text-gray-400 text-sm mt-1">
              {totalFolders} folder{totalFolders !== 1 ? "s" : ""} ·{" "}
              {totalFiles} file{totalFiles !== 1 ? "s" : ""} total
            </p>
          </div>
          <Link
            href="/files"
            className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + Upload Files
          </Link>
        </div>

        {loading && (
          <div className="text-center py-16">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <div className="text-gray-400 text-sm">Loading your upload history...</div>
          </div>
        )}

        {!loading && folders.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📂</div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">No uploads yet</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-xs">
              Create a folder and upload your business files — CSV, Excel, PDF — to start building your history.
            </p>
            <Link href="/files" className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm">
              Go to Files →
            </Link>
          </div>
        )}

        {/* Folder groups */}
        <div className="space-y-4">
          {folders.map(folder => {
            const isOpen = !!expanded[folder.id!];
            const readyFiles = folder.files.filter(f => f.status === "ready");

            return (
              <div key={folder.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Folder header — click to expand */}
                <button
                  onClick={() => toggleFolder(folder.id!)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-2xl">📁</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900">{folder.bizName}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {folder.files.length} file{folder.files.length !== 1 ? "s" : ""} ·{" "}
                      {readyFiles.length} parsed
                      {folder.lastAnalysisSummary && " · analyzed"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {folder.lastAnalysisSummary && (
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                        ✓ Analyzed
                      </span>
                    )}
                    <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Last analysis summary */}
                {folder.lastAnalysisSummary && isOpen && (
                  <div className="mx-5 mb-3 bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800">
                    <span className="font-semibold text-xs uppercase tracking-wider text-blue-400 block mb-1">
                      Last Analysis Summary
                    </span>
                    {folder.lastAnalysisSummary}
                    <Link href="/files" className="block mt-1 text-xs text-blue-600 hover:underline font-medium">
                      Re-analyze in Files →
                    </Link>
                  </div>
                )}

                {/* File list */}
                {isOpen && (
                  <div>
                    {folder.files.length === 0 ? (
                      <div className="px-5 pb-4 text-sm text-gray-400 italic">
                        No files in this folder yet.{" "}
                        <Link href="/files" className="text-blue-600 hover:underline">Upload now →</Link>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50 border-t border-gray-50">
                        {folder.files.map(file => (
                          <div key={file.id} className="px-5 py-3 flex items-center gap-3">
                            <span className="text-lg flex-shrink-0">{fileIcon(file.name)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900 truncate">{file.name}</div>
                              <div className="text-xs text-gray-400 flex flex-wrap items-center gap-2 mt-0.5">
                                <span>{fmtSize(file.size)}</span>
                                <span className="uppercase">{file.type}</span>
                                {file.sheets && file.sheets.length > 1 && (
                                  <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-xs">
                                    {file.sheets.length} sheets
                                  </span>
                                )}
                                {(file.rowCount ?? 0) > 0 && (
                                  <span>{file.rowCount} rows</span>
                                )}
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                              file.status === "ready"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {file.status === "ready" ? "✓ Ready" : file.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer actions */}
                    <div className="px-5 py-3 border-t border-gray-50 flex gap-3">
                      <Link
                        href="/files"
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        Open folder & re-analyze →
                      </Link>
                      <span className="text-gray-200">|</span>
                      <Link
                        href={`/advisor?q=${encodeURIComponent(`Tell me everything about my ${folder.bizName} business based on all uploads`)}`}
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        Ask advisor about this folder →
                      </Link>
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
