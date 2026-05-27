"use client";
// components/Nav.tsx — Shared navigation

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/files",     label: "Files"      },
  { href: "/advisor",   label: "Advisor"    },
  { href: "/history",   label: "History"    },
  { href: "/settings",  label: "Settings"   },
  { href: "/integrations", label: "Integrations" },
];

export default function Nav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { profile } = useAuth();

  async function handleLogout() {
    await signOut(auth);
    router.push("/");
  }

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-lg flex-shrink-0">
          Dash<span className="text-blue-600">Wise</span>
        </Link>

        <div className="flex items-center gap-1 text-sm">
          {LINKS.map(link => (
            <Link key={link.href} href={link.href}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                pathname === link.href
                  ? "bg-blue-50 text-blue-600 font-semibold"
                  : "text-gray-600 hover:bg-gray-100"
              }`}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {profile?.bizName && (
            <span className="text-xs text-gray-400 hidden md:block truncate max-w-32">
              {profile.bizName}
            </span>
          )}
          <button onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
