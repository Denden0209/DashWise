"use client";
// app/enterprise-login/page.tsx
// Enterprise SSO login page.
// User enters their work email → we detect their org's SSO config →
// redirect to their identity provider (Google, Microsoft, Okta, etc).

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getOrgByDomain,
  signInWithGoogleWorkspace,
  signInWithMicrosoft,
  provisionEnterpriseUser,
  isValidOrgEmail,
} from "@/lib/enterprise/sso";
import { getUserProfile } from "@/lib/db";

export default function EnterpriseLoginPage() {
  const router  = useRouter();
  const [email,   setEmail]   = useState("");
  const [step,    setStep]    = useState<"email"|"sso"|"error">("email");
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [ssoType, setSsoType] = useState("");
  const [error,   setError]   = useState("");
  const [orgConfig, setOrgConfig] = useState<Awaited<ReturnType<typeof getOrgByDomain>>>(null);

  // Step 1 — detect org from email domain
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Enter a valid work email."); return; }
    setLoading(true);
    setError("");

    try {
      const config = await getOrgByDomain(email);
      if (!config) {
        // No SSO config — redirect to standard login
        router.push(`/login?email=${encodeURIComponent(email)}`);
        return;
      }

      if (!isValidOrgEmail(email, config)) {
        setError(`This email domain is not authorised for ${config.orgName}.`);
        setLoading(false);
        return;
      }

      setOrgConfig(config);
      setOrgName(config.orgName);
      setSsoType(config.ssoType);
      setStep("sso");
    } catch {
      setError("Could not detect your organisation. Try standard login.");
    } finally {
      setLoading(false);
    }
  }

  // Step 2 — initiate SSO login
  async function handleSSOLogin() {
    if (!orgConfig) return;
    setLoading(true);
    setError("");

    try {
      let credential;

      switch (orgConfig.ssoType) {
        case "google_workspace":
          credential = await signInWithGoogleWorkspace(orgConfig.domain);
          break;
        case "microsoft_azure":
          credential = await signInWithMicrosoft(orgConfig.tenantId);
          break;
        default:
          setError("SSO type not supported yet. Contact your administrator.");
          setLoading(false);
          return;
      }

      if (!credential?.user) throw new Error("Login failed");

      // Auto-provision if first time
      if (orgConfig.autoProvision) {
        await provisionEnterpriseUser(credential.user, orgConfig);
      }

      // Check if onboarding needed
      const profile = await getUserProfile(credential.user.uid);
      router.push(profile ? "/dashboard" : "/onboarding");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "SSO login failed";
      if (msg.includes("popup-blocked")) {
        setError("Popup was blocked. Please allow popups for this site and try again.");
      } else if (msg.includes("cancelled")) {
        setError("Login was cancelled. Please try again.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const SSO_LABELS: Record<string, { icon: string; label: string; color: string }> = {
    google_workspace: { icon: "🔵", label: "Continue with Google Workspace", color: "#4285F4" },
    microsoft_azure:  { icon: "🟦", label: "Continue with Microsoft Azure AD", color: "#0078D4" },
    saml:             { icon: "🔐", label: "Continue with your Identity Provider", color: "#6366f1" },
    oidc:             { icon: "🔑", label: "Continue with SSO", color: "#6366f1" },
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0f172a" }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white mb-1">
            Dash<span style={{ color: "#6366f1" }}>Wise</span>
          </div>
          <div className="text-slate-400 text-sm">Enterprise Sign In</div>
        </div>

        <div className="rounded-2xl border border-white/10 p-8"
          style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}>

          {/* Step 1 — Email entry */}
          {step === "email" && (
            <>
              <h1 className="text-xl font-bold text-white mb-1">Sign in to your organisation</h1>
              <p className="text-slate-400 text-sm mb-6">Enter your work email to continue.</p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Work email address
                  </label>
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-indigo-500 text-sm"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all"
                  style={{ background: "#6366f1" }}>
                  {loading ? "Detecting your organisation..." : "Continue →"}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/10 text-center">
                <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Not an enterprise user? Sign in with email →
                </Link>
              </div>
            </>
          )}

          {/* Step 2 — SSO redirect */}
          {step === "sso" && orgConfig && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  🏢
                </div>
                <div>
                  <div className="font-bold text-white">{orgName}</div>
                  <div className="text-xs text-slate-400">{email}</div>
                </div>
              </div>

              <h2 className="text-lg font-bold text-white mb-1">Single Sign-On detected</h2>
              <p className="text-slate-400 text-sm mb-6">
                Your organisation uses {ssoType === "google_workspace" ? "Google Workspace" : ssoType === "microsoft_azure" ? "Microsoft Azure AD" : "SSO"} for authentication.
              </p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
                  {error}
                </div>
              )}

              <button onClick={handleSSOLogin} disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                style={{ background: SSO_LABELS[ssoType]?.color || "#6366f1" }}>
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Connecting to {orgName}...</>
                ) : (
                  <>{SSO_LABELS[ssoType]?.icon} {SSO_LABELS[ssoType]?.label || "Continue with SSO"}</>
                )}
              </button>

              <button onClick={() => { setStep("email"); setError(""); }}
                className="w-full mt-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/30 transition-all">
                ← Use a different email
              </button>

              {/* Security note */}
              <div className="mt-6 p-3 rounded-xl text-xs text-slate-500 border border-white/5"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                🔒 You will be redirected to your organisation&apos;s identity provider. DashWise never sees your password.
              </div>
            </>
          )}
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-6 mt-6">
          {["SOC 2 Ready", "Data Encrypted", "GDPR Compliant"].map(badge => (
            <div key={badge} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>✓</span><span>{badge}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
