"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { getUserProfile, saveUserProfile, BusinessProfile } from "./db";

type AuthCtx = {
  user:          User | null;
  profile:       BusinessProfile | null;
  loading:       boolean;
  refreshProfile: () => Promise<void>;
};
const Ctx = createContext<AuthCtx>({
  user: null, profile: null, loading: true, refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function ensureUserDoc(u: User): Promise<BusinessProfile> {
    // Load existing profile first
    let prof = await getUserProfile(u.uid);
    if (!prof) {
      // First time this account has hit Firestore — create a minimal document.
      // This guarantees the admin panel always sees every authenticated user,
      // and prevents the "Failed to save" onboarding error caused by a missing doc.
      const base: BusinessProfile = {
        uid:          u.uid,
        email:        u.email        || "",
        name:         u.displayName  || "",
        bizName:      "",
        bizType:      "",
        subscription: "free",
        uploadsCount: 0,
      };
      await saveUserProfile(u.uid, base);
      prof = base;
    }
    return prof;
  }

  async function refreshProfile() {
    if (auth.currentUser) setProfile(await getUserProfile(auth.currentUser.uid));
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const prof = await ensureUserDoc(u);
          setProfile(prof);
        } catch (err) {
          console.warn("[auth] could not ensure user doc:", err);
          // Still try a plain load so the app works in offline/rules scenarios
          setProfile(await getUserProfile(u.uid).catch(() => null));
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return <Ctx.Provider value={{ user, profile, loading, refreshProfile }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
