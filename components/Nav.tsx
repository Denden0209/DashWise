"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { C } from "@/lib/styles";

const LINKS = [
  { href:"/dashboard",    label:"Dashboard",    icon:"📊" },
  { href:"/overview",     label:"Overview",     icon:"🗂️" },
  { href:"/files",        label:"Files",        icon:"📁" },
  { href:"/advisor",      label:"Advisor",      icon:"💬" },
  { href:"/history",      label:"History",      icon:"🕐" },
  { href:"/integrations", label:"Integrations", icon:"🔌" },
  { href:"/settings",     label:"Settings",     icon:"⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user } = useAuth();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "";
  const isAdmin = !!user?.email && !!adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase();

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  return (
    <>
      <nav style={{
        background:"rgba(255,255,255,0.85)", backdropFilter:"saturate(180%) blur(20px)",
        WebkitBackdropFilter:"saturate(180%) blur(20px)",
        borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", height:52, gap:4 }}>
          <Link href="/dashboard" style={{ fontWeight:700, fontSize:16, color:C.text, letterSpacing:"-0.4px", marginRight:14, flexShrink:0 }}>
            Dash<span style={{ color:C.blue }}>Wise</span>
          </Link>

          {/* Desktop links */}
          <div className="nav-desktop" style={{ display:"flex", gap:2, flex:1, overflowX:"auto" }}>
            {LINKS.map(l => (
              <Link key={l.href} href={l.href} style={{
                fontSize:13, padding:"7px 12px", borderRadius:8, whiteSpace:"nowrap",
                fontWeight: pathname===l.href ? 600 : 400,
                color:      pathname===l.href ? C.blue : C.text2,
                background: pathname===l.href ? C.blueBg : "transparent",
              }}>
                {l.label}
              </Link>
            ))}
            {isAdmin && (
              <Link href="/admin" style={{
                fontSize:13, padding:"7px 12px", borderRadius:8, whiteSpace:"nowrap",
                fontWeight: pathname==="/admin" ? 600 : 400,
                color:      pathname==="/admin" ? "#af52de" : C.text2,
                background: pathname==="/admin" ? "#f3e8fd" : "transparent",
              }}>
                🛡️ Admin
              </Link>
            )}
          </div>

          <button onClick={handleLogout} style={{
            fontSize:12, color:C.text3, background:"transparent", border:`1px solid ${C.border}`,
            borderRadius:8, padding:"6px 12px", cursor:"pointer", flexShrink:0,
          }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="nav-mobile" style={{
        display:"none", position:"fixed", bottom:0, left:0, right:0, zIndex:100,
        background:"rgba(255,255,255,0.92)", backdropFilter:"saturate(180%) blur(20px)",
        WebkitBackdropFilter:"saturate(180%) blur(20px)",
        borderTop:`1px solid ${C.border}`,
        paddingBottom:"env(safe-area-inset-bottom)",
      }}>
        <div style={{ display:"flex", justifyContent:"space-around", padding:"6px 4px" }}>
          {LINKS.slice(0, 5).map(l => (
            <Link key={l.href} href={l.href} style={{
              display:"flex", flexDirection:"column", alignItems:"center", gap:2,
              fontSize:10, padding:"4px 8px", borderRadius:8, minWidth:50,
              fontWeight: pathname===l.href ? 600 : 400,
              color:      pathname===l.href ? C.blue : C.text3,
            }}>
              <span style={{ fontSize:18 }}>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .nav-desktop { display: none !important; }
          .nav-mobile  { display: block !important; }
          body { padding-bottom: 70px; }
        }
      `}</style>
    </>
  );
}
