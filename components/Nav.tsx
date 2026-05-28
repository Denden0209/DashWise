"use client";
// components/Nav.tsx — Dark Apple-style navigation

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/dashboard",    label: "Dashboard",    icon: "⬜" },
  { href: "/files",        label: "Files",         icon: "📁" },
  { href: "/advisor",      label: "Advisor",       icon: "💬" },
  { href: "/history",      label: "History",       icon: "📊" },
  { href: "/integrations", label: "Integrations",  icon: "🔗" },
  { href: "/settings",     label: "Settings",      icon: "⚙️" },
];

export default function Nav() {
  const pathname    = usePathname();
  const router      = useRouter();
  const { profile } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      height: 52,
      background: scrolled ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.6)",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      transition: "background 0.3s ease",
      display: "flex", alignItems: "center",
      padding: "0 24px", gap: 8,
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{
        fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px",
        color: "#f5f5f7", textDecoration: "none", marginRight: 8, flexShrink: 0,
      }}>
        Dash<span style={{ color: "#2997ff" }}>Wise</span>
      </Link>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center" }}>
        {LINKS.map(link => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? "#f5f5f7" : "rgba(245,245,247,0.6)",
              background: active ? "rgba(255,255,255,0.1)" : "transparent",
              textDecoration: "none",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "#f5f5f7";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "rgba(245,245,247,0.6)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}>
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {profile?.bizName && (
          <span style={{
            fontSize: 12, color: "rgba(245,245,247,0.35)",
            maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {profile.bizName}
          </span>
        )}
        <button onClick={handleLogout} style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(245,245,247,0.5)",
          fontSize: 12, fontWeight: 500,
          padding: "5px 12px", borderRadius: 8,
          cursor: "pointer", transition: "all 0.15s",
          fontFamily: "inherit",
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = "#f5f5f7";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = "rgba(245,245,247,0.5)";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
          }}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
