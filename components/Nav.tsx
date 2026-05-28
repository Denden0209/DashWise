"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const LINKS = [
  { href: "/dashboard",    label: "Dashboard"    },
  { href: "/files",        label: "Files"         },
  { href: "/advisor",      label: "Advisor"       },
  { href: "/history",      label: "History"       },
  { href: "/integrations", label: "Integrations"  },
  { href: "/settings",     label: "Settings"      },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { profile } = useAuth();

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      height: 52,
      background: "rgba(255,255,255,0.85)",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
      borderBottom: "1px solid #e5e5ea",
      display: "flex", alignItems: "center",
      padding: "0 24px", gap: 4,
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{
        fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px",
        color: "#1d1d1f", textDecoration: "none", marginRight: 12, flexShrink: 0,
      }}>
        Dash<span style={{ color: "#0071e3" }}>Wise</span>
      </Link>

      {/* Links */}
      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {LINKS.map(link => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              padding: "5px 12px", borderRadius: 8,
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? "#0071e3" : "#515154",
              background: active ? "#e8f0fe" : "transparent",
              textDecoration: "none", transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}>
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {profile?.bizName && (
          <span style={{ fontSize: 12, color: "#86868b", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile.bizName}
          </span>
        )}
        <button
          onClick={async () => { await signOut(auth); router.push("/"); }}
          style={{
            background: "transparent", border: "1px solid #e5e5ea",
            color: "#86868b", fontSize: 12, fontWeight: 500,
            padding: "5px 12px", borderRadius: 8,
            cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
