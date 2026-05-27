"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const INTEGRATIONS = [
  { name: "Shopify", icon: "🛒", color: "#96BF48" },
  { name: "Square", icon: "⬛", color: "#3E4348" },
  { name: "QuickBooks", icon: "🟦", color: "#2CA01C" },
  { name: "Toast POS", icon: "🔴", color: "#FF6E00" },
  { name: "Stripe", icon: "💜", color: "#635BFF" },
  { name: "WooCommerce", icon: "🟣", color: "#7F54B3" },
  { name: "Xero", icon: "🔵", color: "#0E78F8" },
  { name: "Amazon", icon: "🟠", color: "#FF9900" },
];

const FEATURES = [
  {
    eyebrow: "Upload anything",
    title: "Your data, any format.",
    body: "CSV, Excel, PDF, or a photo of a printout. DashWise reads it all — every sheet, every table, every column — and extracts what matters.",
    icon: "📂",
    align: "left",
  },
  {
    eyebrow: "Business memory",
    title: "Gets smarter every week.",
    body: "Every upload builds a permanent memory of your business. Your advisor knows your history, your patterns, and your goals — without you repeating yourself.",
    icon: "🧠",
    align: "right",
  },
  {
    eyebrow: "Dynamic dashboards",
    title: "Power BI feel. Zero setup.",
    body: "Filter by category, period, or metric. Charts auto-generate from your actual data. Tables sort with a click. No configuration, no IT ticket.",
    icon: "📊",
    align: "left",
  },
  {
    eyebrow: "Enterprise ready",
    title: "Built for teams at scale.",
    body: "SSO with Google Workspace or Microsoft Azure AD. Role-based access. Org-wide KPI glossaries. White-glove onboarding. GDPR compliant.",
    icon: "🏢",
    align: "right",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Try it. No card needed.",
    features: ["5 analyses/month", "All file formats", "Basic AI insights", "1 folder"],
    cta: "Start free",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    desc: "For business owners who want answers daily.",
    features: ["Unlimited analyses", "Business memory", "AI Advisor chat", "All integrations", "Dynamic dashboards"],
    cta: "Start Pro",
    href: "/signup?plan=pro",
    highlight: true,
  },
  {
    name: "Team",
    price: "$199",
    period: "/month",
    desc: "Up to 15 seats. One shared workspace.",
    features: ["Everything in Pro", "15 team seats", "Shared folders", "Weekly digest email", "Admin controls"],
    cta: "Start Team",
    href: "/signup?plan=team",
    highlight: false,
  },
  {
    name: "Business",
    price: "$799",
    period: "/month",
    desc: "Unlimited seats. Enterprise-grade.",
    features: ["Everything in Team", "Unlimited seats", "SSO / SAML login", "KPI glossary", "Custom onboarding", "Priority support"],
    cta: "Contact us",
    href: "/signup?plan=business",
    highlight: false,
  },
];

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navBlur = scrollY > 40;

  return (
    <div style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#000", color: "#f5f5f7", overflowX: "hidden" }}>

      {/* ── NAV ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: 52,
        background: navBlur ? "rgba(0,0,0,0.72)" : "transparent",
        backdropFilter: navBlur ? "saturate(180%) blur(20px)" : "none",
        WebkitBackdropFilter: navBlur ? "saturate(180%) blur(20px)" : "none",
        borderBottom: navBlur ? "1px solid rgba(255,255,255,0.08)" : "none",
        transition: "all 0.3s ease",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
      }}>
        <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.3px", color: "#f5f5f7" }}>
          Dash<span style={{ color: "#2997ff" }}>Wise</span>
        </div>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {["Features", "Integrations", "Pricing"].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`}
              style={{ color: "rgba(245,245,247,0.72)", fontSize: 14, textDecoration: "none", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f5f5f7")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(245,245,247,0.72)")}>
              {item}
            </a>
          ))}
          <Link href="/login" style={{ color: "rgba(245,245,247,0.72)", fontSize: 14, textDecoration: "none" }}>
            Sign in
          </Link>
          <Link href="/signup" style={{
            background: "#2997ff", color: "#fff", fontSize: 13, fontWeight: 600,
            padding: "7px 16px", borderRadius: 20, textDecoration: "none",
            transition: "background 0.2s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#0077ed")}
            onMouseLeave={e => (e.currentTarget.style.background = "#2997ff")}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "140px 24px 80px",
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(41,151,255,0.15) 0%, transparent 60%)",
        position: "relative", overflow: "hidden",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
          width: 800, height: 600,
          background: "radial-gradient(ellipse, rgba(41,151,255,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}/>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(41,151,255,0.12)", border: "1px solid rgba(41,151,255,0.25)",
          borderRadius: 20, padding: "6px 16px", marginBottom: 32,
          fontSize: 13, color: "#2997ff", fontWeight: 500, letterSpacing: "0.2px",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2997ff", display: "inline-block", animation: "pulse 2s infinite" }}/>
          AI Business Advisor — Now Available
        </div>

        <h1 style={{
          fontSize: "clamp(48px, 8vw, 96px)",
          fontWeight: 700,
          letterSpacing: "-2px",
          lineHeight: 1.05,
          marginBottom: 24,
          maxWidth: 900,
          background: "linear-gradient(180deg, #f5f5f7 0%, rgba(245,245,247,0.6) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          Your business advisor.<br />In your pocket.
        </h1>

        <p style={{
          fontSize: "clamp(18px, 2.5vw, 24px)",
          color: "rgba(245,245,247,0.6)",
          maxWidth: 600,
          lineHeight: 1.5,
          marginBottom: 48,
          fontWeight: 400,
          letterSpacing: "-0.2px",
        }}>
          Upload your sales data, connect your POS, and get plain-English insights from an AI that learns your business — week after week, sharper every time.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 80 }}>
          <Link href="/signup" style={{
            background: "#2997ff", color: "#fff",
            fontSize: 17, fontWeight: 600,
            padding: "16px 36px", borderRadius: 980,
            textDecoration: "none", letterSpacing: "-0.2px",
            transition: "all 0.2s",
            boxShadow: "0 0 40px rgba(41,151,255,0.3)",
          }}>
            Start free — no card needed
          </Link>
          <Link href="#features" style={{
            background: "rgba(255,255,255,0.08)", color: "#f5f5f7",
            fontSize: 17, fontWeight: 600,
            padding: "16px 36px", borderRadius: 980,
            textDecoration: "none", letterSpacing: "-0.2px",
            border: "1px solid rgba(255,255,255,0.12)",
          }}>
            See how it works ↓
          </Link>
        </div>

        {/* Hero product mockup */}
        <div style={{
          width: "100%", maxWidth: 960,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24,
          padding: "2px",
          boxShadow: "0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)",
          overflow: "hidden",
        }}>
          {/* Fake browser bar */}
          <div style={{
            background: "rgba(255,255,255,0.06)", padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 8,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["#ff5f57","#febc2e","#28c840"].map(c => (
                <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }}/>
              ))}
            </div>
            <div style={{
              flex: 1, margin: "0 16px",
              background: "rgba(255,255,255,0.06)", borderRadius: 8,
              padding: "4px 12px", fontSize: 12, color: "rgba(245,245,247,0.4)",
              textAlign: "center",
            }}>
              dash-wise.vercel.app/advisor
            </div>
          </div>
          {/* Fake UI */}
          <div style={{ padding: 32, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, minHeight: 320 }}>
            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "rgba(41,151,255,0.15)", border: "1px solid rgba(41,151,255,0.2)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#2997ff", fontWeight: 600 }}>
                📊 Dashboard
              </div>
              {["📁 Files", "💬 Advisor", "📈 History", "🔗 Integrations"].map(item => (
                <div key={item} style={{ padding: "10px 16px", fontSize: 13, color: "rgba(245,245,247,0.4)", borderRadius: 10 }}>{item}</div>
              ))}
            </div>
            {/* Main content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.5px" }}>Good morning, Maria ☀️</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[["Revenue", "$48,320", "+12.4%", "#30d158"], ["Orders", "312", "+8.1%", "#2997ff"], ["Avg Order", "$154", "-2.3%", "#ff453a"]].map(([label, val, trend, color]) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: "rgba(245,245,247,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{val}</div>
                    <div style={{ fontSize: 12, color, fontWeight: 600 }}>{trend} vs last month</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(41,151,255,0.08)", border: "1px solid rgba(41,151,255,0.15)", borderRadius: 12, padding: 16, fontSize: 13, color: "rgba(245,245,247,0.8)", lineHeight: 1.6 }}>
                <span style={{ color: "#2997ff", fontWeight: 600 }}>💬 Your Advisor:</span> Based on your last 8 weeks, your Tuesday revenue is consistently 40% lower than weekends. Your top product — Ceramic Mug Set — drives 23% of total revenue but has the lowest margin. <strong>Recommend: review pricing on mugs and reduce Tuesday staffing by 2 hours.</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ADVISOR STATEMENT ── */}
      <section style={{
        padding: "120px 24px",
        textAlign: "center",
        background: "linear-gradient(180deg, #000 0%, #0a0a0a 100%)",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <p style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 600, letterSpacing: "-1px", lineHeight: 1.2, color: "#f5f5f7" }}>
            &ldquo;The best businesses in the world have a CFO, a COO, and a chief analyst telling them what the numbers mean.{" "}
            <span style={{ color: "rgba(245,245,247,0.35)" }}>
              DashWise gives every business owner that same brain trust — for less than the cost of a daily coffee.&rdquo;
            </span>
          </p>
        </div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section id="integrations" style={{ padding: "100px 24px", background: "#000", overflow: "hidden" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#2997ff", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
            Connect in seconds
          </p>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 60px)", fontWeight: 700, letterSpacing: "-1.5px", marginBottom: 16, lineHeight: 1.1 }}>
            Your POS. Your data.<br />Instantly connected.
          </h2>
          <p style={{ fontSize: 19, color: "rgba(245,245,247,0.6)", maxWidth: 560, margin: "0 auto 64px", lineHeight: 1.6 }}>
            One click to connect Shopify, Square, QuickBooks, Toast, and more. DashWise pulls your sales, inventory, and customer data automatically — no CSV exports, no copy-paste, no manual uploads.
          </p>

          {/* Integration logos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 48 }}>
            {INTEGRATIONS.map(intg => (
              <div key={intg.name} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20, padding: "28px 20px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                transition: "all 0.3s",
                cursor: "default",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}>
                <div style={{ fontSize: 36 }}>{intg.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(245,245,247,0.7)" }}>{intg.name}</div>
              </div>
            ))}
          </div>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: "rgba(48,209,88,0.1)", border: "1px solid rgba(48,209,88,0.2)",
            borderRadius: 12, padding: "12px 24px", fontSize: 14, color: "#30d158",
          }}>
            <span>✓</span>
            <span>One-click OAuth connection · Read-only access · Disconnect anytime from your POS admin</span>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "60px 24px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} style={{
              display: "grid",
              gridTemplateColumns: f.align === "left" ? "1fr 1fr" : "1fr 1fr",
              gap: 80, alignItems: "center",
              padding: "80px 0",
              borderBottom: i < FEATURES.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
              direction: f.align === "right" ? "rtl" : "ltr",
            }}>
              <div style={{ direction: "ltr" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#2997ff", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                  {f.eyebrow}
                </p>
                <h3 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, letterSpacing: "-1px", marginBottom: 20, lineHeight: 1.1 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 17, color: "rgba(245,245,247,0.6)", lineHeight: 1.7 }}>
                  {f.body}
                </p>
              </div>
              <div style={{ direction: "ltr" }}>
                <div style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 24, padding: 48,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: 280,
                  fontSize: 80,
                  background: `radial-gradient(ellipse at center, rgba(41,151,255,0.08) 0%, transparent 70%)`,
                }}>
                  {f.icon}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ENTERPRISE ── */}
      <section style={{
        padding: "120px 24px",
        background: "linear-gradient(180deg, #000 0%, #050510 100%)",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#2997ff", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
            Enterprise
          </p>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 60px)", fontWeight: 700, letterSpacing: "-1.5px", marginBottom: 24, lineHeight: 1.1 }}>
            Built for the way<br />companies actually work.
          </h2>
          <p style={{ fontSize: 19, color: "rgba(245,245,247,0.6)", marginBottom: 64, lineHeight: 1.6 }}>
            SSO with Google Workspace and Microsoft Azure AD. SAML 2.0. Role-based permissions. Company-wide KPI glossaries so every team speaks the same language. Deploys in a day, not a quarter.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 48 }}>
            {[
              ["🔐", "SSO & SAML", "Google Workspace, Microsoft Azure AD, Okta, and any OIDC provider."],
              ["👥", "Team workspaces", "Unlimited seats. Role-based access. Shared folders across departments."],
              ["📖", "KPI Glossary", "Define what 'margin' and 'churn' mean for your company. AI uses your definitions."],
              ["🛡️", "Data security", "Every user sees only their own data. Firestore RLS enforced at every read."],
              ["🚀", "Fast deployment", "Connect, onboard, and get your first AI briefing on day one. No IT project."],
              ["📞", "White-glove setup", "Dedicated onboarding. We configure your KPI glossary and team structure for you."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 20, padding: 28, textAlign: "left",
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: "rgba(245,245,247,0.5)", lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
          <Link href="/signup?plan=business" style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#f5f5f7", fontSize: 17, fontWeight: 600,
            padding: "16px 40px", borderRadius: 980,
            textDecoration: "none", letterSpacing: "-0.2px",
          }}>
            Talk to us about Enterprise →
          </Link>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "120px 24px", background: "#000" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#2997ff", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Pricing</p>
            <h2 style={{ fontSize: "clamp(36px, 5vw, 60px)", fontWeight: 700, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 16 }}>
              Simple, transparent pricing.
            </h2>
            <p style={{ fontSize: 19, color: "rgba(245,245,247,0.6)" }}>Start free. Upgrade when you need more.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {PLANS.map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight
                  ? "linear-gradient(180deg, #1a3a5c 0%, #0d2138 100%)"
                  : "rgba(255,255,255,0.04)",
                border: plan.highlight
                  ? "1px solid rgba(41,151,255,0.4)"
                  : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 24, padding: 28,
                display: "flex", flexDirection: "column",
                position: "relative", overflow: "hidden",
                boxShadow: plan.highlight ? "0 0 60px rgba(41,151,255,0.15)" : "none",
              }}>
                {plan.highlight && (
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0,
                    background: "rgba(41,151,255,0.15)",
                    padding: "6px", textAlign: "center",
                    fontSize: 11, fontWeight: 700, color: "#2997ff",
                    letterSpacing: "1px", textTransform: "uppercase",
                  }}>
                    Most Popular
                  </div>
                )}
                <div style={{ marginTop: plan.highlight ? 24 : 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(245,245,247,0.5)", marginBottom: 24, lineHeight: 1.5 }}>{plan.desc}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 32 }}>
                    <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-2px", lineHeight: 1 }}>{plan.price}</span>
                    <span style={{ fontSize: 14, color: "rgba(245,245,247,0.5)", marginBottom: 8 }}>{plan.period}</span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ fontSize: 14, color: "rgba(245,245,247,0.75)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#30d158", flexShrink: 0, marginTop: 1 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={plan.href} style={{
                  display: "block", textAlign: "center",
                  background: plan.highlight ? "#2997ff" : "rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: 15, fontWeight: 600,
                  padding: "13px 20px", borderRadius: 12,
                  textDecoration: "none", marginTop: "auto",
                  transition: "all 0.2s",
                }}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{
        padding: "160px 24px",
        textAlign: "center",
        background: "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(41,151,255,0.12) 0%, transparent 60%)",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 700, letterSpacing: "-2px", lineHeight: 1.05,
            marginBottom: 24,
            background: "linear-gradient(180deg, #f5f5f7 0%, rgba(245,245,247,0.5) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            The advisor your business deserves.
          </h2>
          <p style={{ fontSize: 21, color: "rgba(245,245,247,0.55)", marginBottom: 48, lineHeight: 1.5 }}>
            Connect your store. Upload your data. Get answers that used to cost $2,000 a month in consulting fees.
          </p>
          <Link href="/signup" style={{
            display: "inline-block",
            background: "#2997ff", color: "#fff",
            fontSize: 19, fontWeight: 600,
            padding: "18px 48px", borderRadius: 980,
            textDecoration: "none", letterSpacing: "-0.3px",
            boxShadow: "0 0 60px rgba(41,151,255,0.4)",
            transition: "all 0.2s",
          }}>
            Start free today
          </Link>
          <div style={{ marginTop: 20, fontSize: 14, color: "rgba(245,245,247,0.35)" }}>
            No credit card · 5 free analyses · Cancel anytime
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "48px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(245,245,247,0.6)" }}>
          Dash<span style={{ color: "#2997ff" }}>Wise</span>
          <span style={{ marginLeft: 16, fontWeight: 400 }}>© 2025</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {["Privacy", "Terms", "Security", "Contact"].map(item => (
            <a key={item} href="#" style={{ fontSize: 13, color: "rgba(245,245,247,0.4)", textDecoration: "none" }}>{item}</a>
          ))}
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}
