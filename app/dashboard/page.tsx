"use client";
// app/dashboard/page.tsx — MAIN DASHBOARD
// Shows real metrics from uploads, auto-generates KPI cards
// based on whatever fields exist in the user's data.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { getAllUploads, UploadRecord } from "@/lib/db";
import Nav from "@/components/Nav";

// ── Detect metric fields from any upload record ────────────
function extractMetrics(uploads: UploadRecord[]) {
  if (uploads.length === 0) return [];

  // Collect all metric keys across all uploads
  const allKeys = new Set<string>();
  uploads.forEach(u => {
    if (u.metrics) Object.keys(u.metrics).forEach(k => allKeys.add(k));
  });

  // Build a metric card for each key found
  const metrics: { key: string; label: string; values: (number | string)[]; type: string }[] = [];

  allKeys.forEach(key => {
    const values = uploads
      .map(u => (u.metrics as Record<string, unknown>)?.[key])
      .filter(v => v !== undefined && v !== null && v !== "");

    if (values.length === 0) return;

    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^./, c => c.toUpperCase())
      .trim();

    // Detect if numeric
    const isNumeric = values.every(v => !isNaN(Number(v)));
    metrics.push({ key, label, values: values as (number | string)[], type: isNumeric ? "number" : "string" });
  });

  return metrics;
}

// ── Format a metric value for display ─────────────────────
function fmtValue(key: string, val: number | string): string {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  const k = key.toLowerCase();
  if (k.includes("revenue") || k.includes("cost") || k.includes("sales") || k.includes("price") || k.includes("profit"))
    return "$" + n.toLocaleString();
  if (k.includes("rate") || k.includes("pct") || k.includes("percent") || k.includes("margin"))
    return n.toFixed(1) + "%";
  return n.toLocaleString();
}

// ── Trend arrow ────────────────────────────────────────────
function trend(values: (number | string)[]): { dir: "up" | "down" | "flat"; pct: string } {
  const nums = values.map(Number).filter(n => !isNaN(n));
  if (nums.length < 2) return { dir: "flat", pct: "—" };
  const first = nums[nums.length - 1]; // oldest
  const last  = nums[0];               // newest
  if (first === 0) return { dir: "flat", pct: "—" };
  const pct = ((last - first) / Math.abs(first)) * 100;
  return {
    dir: pct > 1 ? "up" : pct < -1 ? "down" : "flat",
    pct: (pct > 0 ? "+" : "") + pct.toFixed(1) + "%",
  };
}

const PROACTIVE = [
  "What's your biggest challenge this week?",
  "Which metric worries you most right now?",
  "What decision are you trying to make?",
  "Is there a trend you're not sure how to interpret?",
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [question] = useState(PROACTIVE[Math.floor(Math.random() * PROACTIVE.length)]);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && !profile) {
      const t = setTimeout(() => router.push("/onboarding"), 1000);
      return () => clearTimeout(t);
    }
  }, [user, profile, loading, router]);

  // Load ALL uploads for this user
  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    getAllUploads(user.uid)
      .then(data => {
        setUploads(data);
        setLoadingData(false);
      })
      .catch(() => setLoadingData(false));
  }, [user]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <div className="text-gray-400 text-sm">Loading DashWise...</div>
        </div>
      </div>
    );
  }

  const metrics      = extractMetrics(uploads);
  const latestUpload = uploads[0];
  const hasUploads   = uploads.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Good day, {profile.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {profile.bizName} · {profile.bizType}
            {hasUploads && ` · ${uploads.length} upload${uploads.length !== 1 ? "s" : ""} analyzed`}
          </p>
        </div>

        {/* ── NO UPLOADS STATE ── */}
        {!loadingData && !hasUploads && (
          <div className="mb-6">
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
              <div className="text-5xl mb-4">📂</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Upload your first data file to get started</h2>
              <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
                Upload your POS export, Excel sheet, CSV, or PDF. DashWise will read it, build your dashboard, and start learning your business.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/files" className="bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 text-sm">
                  📁 Upload to a folder
                </Link>
                <Link href="/files" className="border border-gray-200 text-gray-700 font-medium px-6 py-3 rounded-xl hover:bg-gray-50 text-sm">
                  Upload files
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── AI PROACTIVE QUESTION ── */}
        {hasUploads && (
          <Link
            href={`/advisor?q=${encodeURIComponent(question)}`}
            className="block bg-blue-600 text-white rounded-2xl p-5 mb-6 hover:bg-blue-700 transition-colors"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-1">💬 Your Advisor is asking</div>
            <div className="text-lg font-semibold leading-snug mb-1">{question}</div>
            <div className="text-blue-200 text-sm">Tap to answer and get a personalised recommendation →</div>
          </Link>
        )}

        {/* ── DYNAMIC KPI CARDS from upload data ── */}
        {hasUploads && metrics.length > 0 && (
          <>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Latest metrics — {latestUpload?.label}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {metrics.slice(0, 8).map(metric => {
                const latest = metric.values[0];
                const t      = metric.type === "number" ? trend(metric.values) : { dir: "flat" as const, pct: "—" };
                const tColor = t.dir === "up" ? "text-green-600" : t.dir === "down" ? "text-red-500" : "text-gray-400";
                const tIcon  = t.dir === "up" ? "↑" : t.dir === "down" ? "↓" : "→";
                return (
                  <div key={metric.key} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 truncate">{metric.label}</div>
                    <div className="text-2xl font-bold text-gray-900 mb-1 truncate">
                      {metric.type === "number" ? fmtValue(metric.key, latest) : String(latest)}
                    </div>
                    {metric.values.length > 1 && (
                      <div className={`text-xs font-semibold ${tColor}`}>
                        {tIcon} {t.pct} vs prev
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── FALLBACK KPI CARDS (upload count + subscription) ── */}
        {hasUploads && metrics.length === 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Uploads</div>
              <div className="text-2xl font-bold text-blue-600">{uploads.length}</div>
              <div className="text-xs text-gray-400">analyses done</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Plan</div>
              <div className="text-2xl font-bold text-gray-900 capitalize">{profile.subscription || "Free"}</div>
              <div className="text-xs text-gray-400">current plan</div>
            </div>
          </div>
        )}

        {/* ── UPLOAD HISTORY SUMMARY ── */}
        {hasUploads && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Recent Uploads</h3>
                <Link href="/history" className="text-xs text-blue-600 font-medium hover:underline">View all →</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {uploads.slice(0, 5).map((u, i) => {
                  const m = u.metrics as Record<string, unknown>;
                  const rev = m?.revenue ? `$${Number(m.revenue).toLocaleString()}` : null;
                  return (
                    <div key={u.id || i} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{u.label || u.source}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{u.dataType} · {u.period}</div>
                      </div>
                      <div className="text-right">
                        {rev && <div className="font-semibold text-sm text-gray-900">{rev}</div>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          u.quality === "good" ? "bg-green-50 text-green-700" :
                          u.quality === "fair" ? "bg-yellow-50 text-yellow-700" : "bg-gray-50 text-gray-500"
                        }`}>
                          {u.quality || "analyzed"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Goals */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">Your Goals</h3>
              {profile.goals && profile.goals.length > 0 ? (
                <div className="space-y-2">
                  {profile.goals.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"/>
                      <span className="text-gray-700">{g}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No goals set yet.</p>
              )}
              <Link href="/settings" className="mt-4 block text-xs text-blue-600 hover:underline">Edit goals →</Link>
            </div>
          </div>
        )}

        {/* ── QUICK ACTIONS ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Link href="/files" className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow flex items-center gap-4">
            <div className="text-3xl">📁</div>
            <div>
              <div className="font-semibold text-gray-900">Upload Files</div>
              <div className="text-sm text-gray-500">Add CSV, Excel, PDF to a folder</div>
            </div>
          </Link>
          <Link href="/advisor" className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow flex items-center gap-4">
            <div className="text-3xl">💬</div>
            <div>
              <div className="font-semibold text-gray-900">Ask Advisor</div>
              <div className="text-sm text-gray-500">Chat about your business data</div>
            </div>
          </Link>
          <Link href="/history" className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow flex items-center gap-4">
            <div className="text-3xl">📊</div>
            <div>
              <div className="font-semibold text-gray-900">View History</div>
              <div className="text-sm text-gray-500">All past analyses and insights</div>
            </div>
          </Link>
        </div>

        {/* Upgrade nudge */}
        {profile.subscription === "free" && uploads.length >= 3 && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 text-white flex items-center justify-between">
            <div>
              <div className="font-bold mb-1">You&apos;ve used {uploads.length} of 5 free analyses</div>
              <div className="text-blue-200 text-sm">Upgrade to Pro for unlimited analyses and full business memory.</div>
            </div>
            <Link href="/settings" className="bg-white text-blue-600 font-bold text-sm px-4 py-2 rounded-lg hover:bg-blue-50 flex-shrink-0 ml-4">
              Upgrade →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
