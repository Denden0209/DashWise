"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { C, radius } from "@/lib/styles";

const LINKS = [
  { href:"/dashboard",    label:"Dashboard", icon:"🏠" },
  { href:"/files",        label:"Files",      icon:"📁" },
  { href:"/advisor",      label:"Advisor",    icon:"💬" },
  { href:"/history",      label:"History",    icon:"📊" },
  { href:"/integrations", label:"Connect",    icon:"🔗" },
  { href:"/settings",     label:"Settings",   icon:"⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  return (
    <>
      {/* ── Desktop / tablet nav ── */}
      <nav style={{
        position:"sticky", top:0, zIndex:100,
        height:52,
        background:"rgba(255,255,255,0.88)",
        backdropFilter:"saturate(180%) blur(20px)",
        WebkitBackdropFilter:"saturate(180%) blur(20px)",
        borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center",
        padding:"0 20px", gap:4,
      }}>
        {/* Logo */}
        <Link href="/dashboard" style={{ fontWeight:700, fontSize:18, letterSpacing:"-0.4px", color:C.text, marginRight:12, flexShrink:0 }}>
          Dash<span style={{ color:C.blue }}>Wise</span>
        </Link>

        {/* Desktop links */}
        <div style={{ display:"flex", gap:1, flex:1, overflowX:"auto" }}>
          {LINKS.map(link => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} style={{
                padding:"5px 12px", borderRadius:8, fontSize:13,
                fontWeight: active?600:400,
                color:      active?C.blue:C.text2,
                background: active?C.blueBg:"transparent",
                whiteSpace:"nowrap", transition:"all 0.15s",
              }}>
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          {profile?.bizName && (
            <span style={{ fontSize:12, color:C.text3, maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {profile.bizName}
            </span>
          )}
          <button onClick={handleLogout} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.text3, fontSize:12, fontWeight:500, padding:"5px 12px", borderRadius:radius.sm, cursor:"pointer" }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:100,
        background:"rgba(255,255,255,0.95)",
        backdropFilter:"saturate(180%) blur(20px)",
        WebkitBackdropFilter:"saturate(180%) blur(20px)",
        borderTop:`1px solid ${C.border}`,
        display:"flex", alignItems:"stretch",
        paddingBottom:"env(safe-area-inset-bottom, 0px)",
      }} className="mobile-tab-bar">
        {LINKS.map(link => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              flex:1, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              padding:"8px 4px",
              color: active ? C.blue : C.text3,
              fontSize:10, fontWeight: active?600:400,
              gap:3, transition:"color 0.15s",
              minWidth:0,
            }}>
              <span style={{ fontSize:20 }}>{link.icon}</span>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"100%" }}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Spacer so content isn't hidden behind mobile tab bar */}
      <div className="mobile-bottom-spacer" style={{ height:0 }}/>

      <style>{`
        @media (min-width: 640px) {
          .mobile-tab-bar { display: none !important; }
          .mobile-bottom-spacer { display: none !important; }
        }
        @media (max-width: 639px) {
          .mobile-tab-bar { display: flex !important; }
          .mobile-bottom-spacer { height: calc(60px + env(safe-area-inset-bottom, 0px)) !important; display: block !important; }
        }
      `}</style>
    </>
  );
}
