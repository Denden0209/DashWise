// lib/enterprise/sso.ts
// Enterprise SSO integration layer.
// Supports: Google Workspace, Microsoft Azure AD, SAML 2.0, OIDC.
// Firebase handles the underlying auth — we configure the providers here.

import {
  GoogleAuthProvider,
  OAuthProvider,
  SAMLAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  User,
  UserCredential,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// ── Organisation SSO config (stored in Firestore per org) ──
export type OrgSSOConfig = {
  orgId:        string;
  orgName:      string;
  ssoType:      "google_workspace" | "microsoft_azure" | "saml" | "oidc" | "password";
  domain:       string;          // e.g. "company.com" — enforces email domain
  providerId?:  string;          // Firebase provider ID for SAML/OIDC
  tenantId?:    string;          // Azure AD tenant ID
  clientId?:    string;          // OIDC client ID
  autoProvision: boolean;        // auto-create accounts for domain users
  defaultRole:  "member" | "admin";
  enforced:     boolean;         // if true, only SSO login allowed
};

// ── Detect SSO config from email domain ───────────────────
export async function getOrgByDomain(email: string): Promise<OrgSSOConfig | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  // Look up domain in Firestore
  const domainDoc = await getDoc(doc(db, "sso_domains", domain));
  if (!domainDoc.exists()) return null;

  const { orgId } = domainDoc.data();
  const orgDoc = await getDoc(doc(db, "organisations", orgId));
  if (!orgDoc.exists()) return null;

  return { orgId, ...orgDoc.data().ssoConfig } as OrgSSOConfig;
}

// ── Google Workspace SSO ───────────────────────────────────
// Enterprise Google accounts — restricts to specific G Suite domain
export async function signInWithGoogleWorkspace(
  hostedDomain: string // e.g. "company.com"
): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  // Restrict to company Google Workspace domain
  provider.setCustomParameters({ hd: hostedDomain });
  provider.addScope("email");
  provider.addScope("profile");
  return await signInWithPopup(auth, provider);
}

// ── Microsoft Azure AD SSO ─────────────────────────────────
// Enterprise Microsoft accounts — supports tenant-specific login
export async function signInWithMicrosoft(
  tenantId?: string // undefined = any Microsoft account, set for specific tenant
): Promise<UserCredential> {
  const provider = new OAuthProvider("microsoft.com");
  provider.addScope("email");
  provider.addScope("profile");
  provider.addScope("openid");
  if (tenantId) {
    // Restrict to specific Azure AD tenant
    provider.setCustomParameters({ tenant: tenantId });
  }
  return await signInWithPopup(auth, provider);
}

// ── SAML 2.0 SSO ──────────────────────────────────────────
// For enterprise SSO providers: Okta, OneLogin, Ping Identity, ADFS
// requiresa Firebase SAML provider configured in Firebase console
export async function signInWithSAML(
  samlProviderId: string // e.g. "saml.okta-company" — configured in Firebase
): Promise<UserCredential> {
  const provider = new SAMLAuthProvider(samlProviderId);
  // Use redirect for SAML (popup often blocked by enterprise firewalls)
  await signInWithRedirect(auth, provider);
  // This line never runs during redirect — call getRedirectResult on page load
  return await getRedirectResult(auth) as UserCredential;
}

// ── OIDC SSO ──────────────────────────────────────────────
// Generic OpenID Connect — works with any OIDC-compliant identity provider
export async function signInWithOIDC(
  oidcProviderId: string // e.g. "oidc.company-idp"
): Promise<UserCredential> {
  const provider = new OAuthProvider(oidcProviderId);
  provider.addScope("openid");
  provider.addScope("email");
  provider.addScope("profile");
  return await signInWithPopup(auth, provider);
}

// ── Auto-provision enterprise user ────────────────────────
// When an enterprise user logs in via SSO for the first time,
// auto-create their profile and link them to their organisation.
export async function provisionEnterpriseUser(
  user: User,
  orgConfig: OrgSSOConfig
): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    // First login — create their profile
    await setDoc(userRef, {
      uid:          user.uid,
      email:        user.email,
      name:         user.displayName || user.email?.split("@")[0],
      orgId:        orgConfig.orgId,
      subscription: "business", // enterprise users get Business tier
      role:         orgConfig.defaultRole,
      ssoProvider:  orgConfig.ssoType,
      createdAt:    serverTimestamp(),
      uploadsCount: 0,
    });

    // Add to org members
    await setDoc(
      doc(db, "organisations", orgConfig.orgId, "members", user.uid),
      {
        uid:       user.uid,
        email:     user.email,
        name:      user.displayName,
        role:      orgConfig.defaultRole,
        joinedAt:  serverTimestamp(),
        ssoLogin:  true,
      }
    );
  }
}

// ── Validate email domain against org config ───────────────
export function isValidOrgEmail(email: string, orgConfig: OrgSSOConfig): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === orgConfig.domain.toLowerCase();
}

// ── Check redirect result on page load (for SAML) ─────────
export async function checkSSORedirectResult(): Promise<UserCredential | null> {
  try {
    return await getRedirectResult(auth);
  } catch {
    return null;
  }
}
