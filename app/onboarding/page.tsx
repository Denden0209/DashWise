"use client";
// app/onboarding/page.tsx — 3-STEP ONBOARDING
// ─────────────────────────────────────────────────────────
// Runs once after signup. Collects:
//   Step 1: Name + role
//   Step 2: Business name, type, primary tool, size
//   Step 3: Goals (max 3) + advisor tone preference
// On complete → saves profile to Firestore → redirects to /dashboard
// ─────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { saveUserProfile } from "@/lib/db";

const BIZ_TYPES = [
  { id: "retail",     label: "Retail Store",       icon: "🛍️" },
  { id: "restaurant", label: "Restaurant / Café",   icon: "🍽️" },
  { id: "ecommerce",  label: "E-Commerce",          icon: "📦" },
  { id: "service",    label: "Service Business",    icon: "🔧" },
  { id: "clinic",     label: "Clinic / Wellness",   icon: "🏥" },
  { id: "other",      label: "Other",               icon: "💼" },
];

const TOOLS    = ["Square", "Shopify", "QuickBooks", "Toast POS", "Excel/Sheets", "Other"];
const SIZES    = ["Just me", "2–5", "6–20", "21–50", "50+"];
const GOAL_OPTIONS = [
  "Reduce costs", "Grow revenue", "Improve margins",
  "Understand my data", "Save time on reporting",
  "Prepare for investor meetings", "Track team performance",
];
const TONES = [
  { id: "direct",   label: "Direct & blunt",  desc: "Tell me exactly what's wrong" },
  { id: "balanced", label: "Balanced",         desc: "Mix of insight and encouragement" },
  { id: "coaching", label: "Coaching style",   desc: "Guide me to the answer" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName] = useState(user?.displayName || "");
  const [role, setRole] = useState("");

  // Step 2
  const [bizName, setBizName]     = useState("");
  const [bizType, setBizType]     = useState("");
  const [tool,    setTool]        = useState("");
  const [size,    setSize]        = useState("");

  // Step 3
  const [goals, setGoals] = useState<string[]>([]);
  const [tone,  setTone]  = useState("balanced");

  const [loading, setLoading] = useState(false);

  function toggleGoal(g: string) {
    setGoals(prev =>
      prev.includes(g)
        ? prev.filter(x => x !== g)         // remove if already selected
        : prev.length < 3 ? [...prev, g] : prev  // add if under limit
    );
  }

  async function handleFinish() {
    if (!user) return;
    setLoading(true);
    await saveUserProfile(user.uid, {
      uid: user.uid,
      name,
      email:       user.email || "",
      role,
      bizName,
      bizType,
      primaryTool: tool,
      employees:   size,
      goals,
      advisorTone: tone,
    });
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">

        {/* Progress dots */}
        <div className="flex gap-2 mb-8">
          {[1,2,3].map(n => (
            <div key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${n <= step ? "bg-blue-600" : "bg-gray-200"}`}/>
          ))}
        </div>

        {/* ── STEP 1 — Profile ── */}
        {step === 1 && (
          <>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Step 1 of 3</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Tell us about you</h2>
            <p className="text-gray-500 text-sm mb-6">Personalises every analysis to your role.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Maria Santos"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your role</label>
                <select value={role} onChange={e=>setRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select your role...</option>
                  {["Business Owner / Founder","General Manager","Sales Manager","Operations Manager","Finance Manager","Marketing Manager"].map(r=>(
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <button disabled={!name || !role}
              onClick={() => setStep(2)}
              className="mt-6 w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
              Continue →
            </button>
          </>
        )}

        {/* ── STEP 2 — Business ── */}
        {step === 2 && (
          <>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Step 2 of 3</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">About your business</h2>
            <p className="text-gray-500 text-sm mb-6">DashWise adapts its analysis to your industry.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
                <input value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="e.g. Bloom & Clay"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business type</label>
                <div className="grid grid-cols-3 gap-2">
                  {BIZ_TYPES.map(b => (
                    <button key={b.id} onClick={() => setBizType(b.id)}
                      className={`p-3 rounded-xl border text-center transition-all ${bizType===b.id?"border-blue-600 bg-blue-50":"border-gray-200 hover:border-gray-300"}`}>
                      <div className="text-2xl mb-1">{b.icon}</div>
                      <div className="text-xs font-medium leading-tight">{b.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Primary tool you use</label>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map(t => (
                    <button key={t} onClick={() => setTool(t)}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-all ${tool===t?"border-blue-600 bg-blue-50 text-blue-700 font-medium":"border-gray-200 hover:border-gray-300"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of employees</label>
                <select value={size} onChange={e=>setSize(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select...</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50 text-sm">Back</button>
              <button disabled={!bizName||!bizType} onClick={() => setStep(3)} className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">Continue →</button>
            </div>
          </>
        )}

        {/* ── STEP 3 — Goals ── */}
        {step === 3 && (
          <>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Step 3 of 3</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">What do you want to achieve?</h2>
            <p className="text-gray-500 text-sm mb-4">DashWise tracks your goals with every upload.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pick up to 3 goals</label>
              <div className="flex flex-wrap gap-2 mb-1">
                {GOAL_OPTIONS.map(g => {
                  const sel    = goals.includes(g);
                  const maxed  = !sel && goals.length >= 3;
                  return (
                    <button key={g} onClick={() => toggleGoal(g)} disabled={maxed}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-all ${sel?"border-blue-600 bg-blue-50 text-blue-700 font-medium":maxed?"border-gray-100 text-gray-300 cursor-not-allowed":"border-gray-200 hover:border-gray-300"}`}>
                      {g}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mb-4">{goals.length}/3 selected</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Advisor communication style</label>
              <div className="space-y-2">
                {TONES.map(t => (
                  <button key={t.id} onClick={() => setTone(t.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${tone===t.id?"border-blue-600 bg-blue-50":"border-gray-200 hover:border-gray-300"}`}>
                    <div className="text-left">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-gray-500">{t.desc}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${tone===t.id?"border-blue-600 bg-blue-600":"border-gray-300"}`}/>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50 text-sm">Back</button>
              <button disabled={goals.length === 0 || loading} onClick={handleFinish}
                className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm">
                {loading ? "Setting up..." : "Launch my DashWise →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
