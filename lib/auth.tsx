"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "@hericilla/types";
import { ADMIN_ROLES } from "@hericilla/types";
import { getSupabase, hasSupabaseEnv } from "@hericilla/supabase-clients";

type AuthState = {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  /** null = allowed in admin; string = plain-language reason why not. */
  blockedReason: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  async function loadProfile(u: User | null) {
    setUser(u);
    setProfile(null);
    if (!u || !hasSupabaseEnv()) return;
    const { data } = await getSupabase().from("profiles").select("*").eq("id", u.id).maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setReady(true);
      return;
    }
    const s = getSupabase();
    void s.auth.getSession().then(({ data }) => {
      void loadProfile(data.session?.user ?? null).finally(() => setReady(true));
    });
    const { data: sub } = s.auth.onAuthStateChange((_event: string, session: Session | null) => {
      void loadProfile(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockedReason =
    ready && user && profile && !ADMIN_ROLES.includes(profile.role)
      ? `Your account role (“${profile.role}”) signs into the staff portal or driver app, not the admin portal.`
      : null;

  const value: AuthState = {
    ready,
    user,
    profile,
    blockedReason,
    signOut: async () => {
      if (hasSupabaseEnv()) await getSupabase().auth.signOut();
      await loadProfile(null);
    },
    refresh: async () => {
      if (!hasSupabaseEnv()) return;
      const { data } = await getSupabase().auth.getSession();
      await loadProfile(data.session?.user ?? null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
