"use client";
// lib/AuthContext.tsx
// ─────────────────────────────────────────────────────────
// This is a React Context — it makes the currently logged-in user
// available to EVERY page and component in the app without prop drilling.
// Wrap the whole app in <AuthProvider> and any component can call
// useAuth() to get the current user instantly.
// ─────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { getUserProfile, BusinessProfile } from "./db";

type AuthContextType = {
  user:        User | null;          // Firebase Auth user (has uid, email, etc.)
  profile:     BusinessProfile | null; // Our Firestore business profile
  loading:     boolean;              // true while we check if user is logged in
  refreshProfile: () => Promise<void>; // call this after profile changes
};

const AuthContext = createContext<AuthContextType>({
  user:           null,
  profile:        null,
  loading:        true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // refreshProfile: re-fetches the business profile from Firestore.
  // Call this after onboarding or after updating settings.
  const refreshProfile = async () => {
    if (user) {
      const p = await getUserProfile(user.uid);
      setProfile(p);
    }
  };

  useEffect(() => {
    // onAuthStateChanged fires whenever login/logout happens.
    // Firebase calls this automatically on page load too.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const p = await getUserProfile(firebaseUser.uid);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Cleanup when component unmounts
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// useAuth() — the hook every page uses to get the current user.
// Example: const { user, profile } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
