"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { C, radius } from "@/lib/styles";

const LINKS = [
  { href:"/dashboard",    label:"Dashboard"    },
  { href:"/files",        label:"Files"         },
  { href:"/advisor",      label:"Advisor"       },
  { href:"/history",      label:"History"       },
  { href:"/integrations", label:"Integrations"  },
  { href:"/settings",     label:"Settings"      },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { profile } = useAuth();

  return (
    <nav style={{
      position:"sticky", top:0, zIndex:100,
      height:52,
      background:"rgba(255,255,255,0.85)",
      backdropFilter:"saturate(180%) blur(20px)",
      WebkitBackdropFilter:"saturate(180%) blur(20px)",
      borderBottom:`1px solid ${C.border}`,
      display:"flex", alignItems:"center",
      padding:"0 28px", gap:8,
    }}>
      <Link href="/dashboard" style={{ fontWeight:700, fontSize:18, letterSpacing:"-0.4px", color:C.text, marginRight:14, flexShrink:0, whiteSpace:"nowrap" }}>
        Dash<span style={{ color:C.blue }}>Wise</span>
      </Link>

      <div style={{ display:"flex", gap:1, flex:1, overflowX:"auto" }}>
        {LINKS.map(link => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} style={{
              padding:"5px 13px", borderRadius:8, fontSize:13,
              fontWeight: active ? 600 : 400,
              color:      active ? C.blue : C.text2,
              background: active ? C.blueBg : "transparent",
              whiteSpace:"nowrap", transition:"all 0.15s",
            }}>
              {link.label}
            </Link>
          );
        })}
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        {profile?.bizName && (
          <span style={{ fontSize:12, color:C.text3, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {profile.bizName}
          </span>
        )}
        <button onClick={async () => { await signOut(auth); router.push("/"); }} style={{
          background:"transparent", border:`1px solid ${C.border}`,
          color:C.text3, fontSize:12, fontWeight:500,
          padding:"5px 13px", borderRadius:radius.sm, cursor:"pointer",
        }}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
