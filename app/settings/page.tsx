"use client";
// app/settings/page.tsx — ACCOUNT SETTINGS
// Edit profile, view subscription, sign out.

import { useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { updateUserProfile } from "@/lib/db";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [bizName, setBizName] = useState(profile?.bizName || "");
  const [tone,    setTone]    = useState(profile?.advisorTone || "balanced");

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await updateUserProfile(user.uid, { bizName, advisorTone: tone });
    await refreshProfile();
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  const planColors: Record<string, string> = {
    free: "bg-gray-100 text-gray-700",
    pro:  "bg-blue-100 text-blue-700",
    team: "bg-purple-100 text-purple-700",
    business: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Business Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
              <input value={bizName} onChange={e => setBizName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Advisor tone</label>
              <div className="flex gap-2">
                {["direct","balanced","coaching"].map(t => (
                  <button key={t} onClick={() => setTone(t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-all ${tone===t?"border-blue-600 bg-blue-50 text-blue-700":"border-gray-200 hover:border-gray-300"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
              {saved ? "✓ Saved!" : saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Subscription</h2>
          <div className="flex items-center gap-3 mb-4">
            <span className={`text-sm font-bold px-3 py-1 rounded-full capitalize ${planColors[profile?.subscription || "free"]}`}>
              {profile?.subscription || "free"} plan
            </span>
            <span className="text-sm text-gray-500">{profile?.uploadsCount || 0} total analyses</span>
          </div>
          {profile?.subscription === "free" && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <div className="font-medium text-blue-900 text-sm mb-1">Upgrade to Pro — $29/month</div>
              <div className="text-blue-700 text-xs mb-3">Unlimited analyses, business memory, advisor chat, and full upload history.</div>
              <button className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700">
                Upgrade (coming soon)
              </button>
            </div>
          )}
        </div>

        {/* Account info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Account</h2>
          <div className="text-sm text-gray-600 mb-4">
            <span className="text-gray-400">Signed in as</span> {user?.email}
          </div>
          <button onClick={handleLogout}
            className="text-red-600 text-sm font-medium hover:text-red-700 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50">
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
