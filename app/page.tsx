"use client";
// app/page.tsx — PUBLIC LANDING PAGE
import Link from "next/link";

const FEATURES = [
  { icon: "📊", title: "Upload Any File", desc: "CSV, Excel, PDF or paste directly. Works with Square, Shopify, QuickBooks, Toast — any export." },
  { icon: "🧠", title: "AI Reads & Learns", desc: "Claude extracts your metrics and builds a growing memory of your business with every upload." },
  { icon: "💬", title: "Ask Anything", desc: "Chat with your advisor who knows your history, your goals, and what matters to your specific business." },
  { icon: "⚡", title: "Act On It", desc: "Specific plain-English actions — not generic tips. Your advisor knows your industry and role." },
];

const TIERS = [
  { name: "Free", price: "$0", period: "/mo", seats: "1 user", features: ["5 analyses/month", "3 analysis modes", "Manual upload only", "Basic insights"], cta: "Start Free", href: "/signup", highlight: false },
  { name: "Pro", price: "$29", period: "/mo", seats: "1 user", features: ["Unlimited analyses", "All 4 AI modes", "Business memory", "Advisor chat", "Upload history"], cta: "Start Pro", href: "/signup?plan=pro", highlight: true },
  { name: "Team", price: "$199", period: "/mo", seats: "Up to 15", features: ["Everything in Pro", "Team workspace", "Weekly digest email", "Admin dashboard", "Shared history"], cta: "Start Team", href: "/signup?plan=team", highlight: false },
  { name: "Business", price: "$799", period: "/mo", seats: "Unlimited", features: ["Everything in Team", "Direct POS/API connect", "KPI glossary", "Custom onboarding", "Priority support"], cta: "Contact Us", href: "/signup?plan=business", highlight: false },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold">Dash<span className="text-blue-600">Wise</span></span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">Sign in</Link>
            <Link href="/signup" className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">Get started free</Link>
          </div>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-6 uppercase tracking-wider">AI Business Advisor</div>
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight">Your data,<br /><span className="text-blue-600">finally explained.</span></h1>
        <p className="text-xl text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">Upload your POS export, spreadsheet, or report. Get plain-English insights, meeting prep, and clear next steps — from an AI that learns your business over time.</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/signup" className="bg-blue-600 text-white font-bold text-lg px-8 py-4 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200">Start free — no card needed</Link>
          <Link href="/login" className="text-gray-600 font-medium text-lg px-6 py-4 rounded-xl border border-gray-200 hover:border-gray-400">Sign in →</Link>
        </div>
        <p className="text-sm text-gray-400 mt-4">5 free analyses included · No credit card required</p>
      </section>

      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-12">How DashWise works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[{n:"1",title:"Upload your data",desc:"Paste from Excel, upload a CSV, or connect your POS directly."},{n:"2",title:"AI reads everything",desc:"Claude extracts metrics, spots anomalies, and builds memory of your business."},{n:"3",title:"Get plain-English advice",desc:"Ask questions or read your briefing. Your advisor knows your history and goals."}].map(s=>(
              <div key={s.n} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg mb-5">{s.n}</div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-12">Everything your business needs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map(f=>(
            <div key={f.title} className="flex gap-4 p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="text-3xl flex-shrink-0">{f.icon}</div>
              <div><h3 className="font-bold text-gray-900 mb-1">{f.title}</h3><p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-12">Simple pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {TIERS.map(t=>(
              <div key={t.name} className={`rounded-2xl p-6 border ${t.highlight?"bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200":"bg-white border-gray-100"}`}>
                <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${t.highlight?"text-blue-200":"text-gray-400"}`}>{t.seats}</div>
                <div className={`text-lg font-bold mb-1 ${t.highlight?"text-white":"text-gray-900"}`}>{t.name}</div>
                <div className="flex items-end gap-1 mb-5">
                  <span className={`text-3xl font-extrabold ${t.highlight?"text-white":"text-gray-900"}`}>{t.price}</span>
                  <span className={`text-sm mb-1 ${t.highlight?"text-blue-200":"text-gray-400"}`}>{t.period}</span>
                </div>
                <ul className="space-y-2 mb-6">{t.features.map(f=><li key={f} className={`text-sm flex items-center gap-2 ${t.highlight?"text-blue-100":"text-gray-600"}`}><span className={t.highlight?"text-blue-300":"text-green-500"}>✓</span>{f}</li>)}</ul>
                <Link href={t.href} className={`block text-center text-sm font-bold py-2.5 rounded-lg ${t.highlight?"bg-white text-blue-600 hover:bg-blue-50":"bg-gray-900 text-white hover:bg-gray-700"}`}>{t.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h2 className="text-4xl font-extrabold text-gray-900 mb-4">77% of small businesses are flying blind.</h2>
        <p className="text-xl text-gray-500 mb-8">DashWise is the advisor they can finally afford.</p>
        <Link href="/signup" className="bg-blue-600 text-white font-bold text-lg px-10 py-4 rounded-xl hover:bg-blue-700 inline-block">Get started free →</Link>
      </section>
      <footer className="border-t border-gray-100 py-8"><p className="text-center text-sm text-gray-400">© 2025 DashWise · AI Business Advisor · Built on Claude</p></footer>
    </main>
  );
}
