"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Profile } from "@hericilla/types";
import { ADMIN_ROLES } from "@hericilla/types";
import {
  AuthFunctionError,
  clearAuthToken,
  configureTokenStorage,
  decodeJwtPayload,
  getSupabase,
  hasSupabaseEnv,
  invokeAuthFunction,
  restoreAuthToken,
  setAuthToken,
} from "@hericilla/supabase-clients";

// Persist the custom auth token in localStorage (web). Guarded so module import on
// the server during SSR is a no-op.
if (typeof window !== "undefined") {
  configureTokenStorage({
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
  });
}

type LoginResult = { ok: boolean; error?: string; profile?: Profile; mustReset?: boolean };

type AuthState = {
  ready: boolean;
  userId: string | null;
  profile: Profile | null;
  /** null = allowed in admin; string = plain-language reason why not. */
  blockedReason: string | null;
  /** true when a freshly-issued account must choose a new password before continuing. */
  mustReset: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

async function loadProfileInto(sub: string): Promise<Profile | null> {
  const { data } = await getSupabase().from("hericilla_profiles").select("*").eq("id", sub).maybeSingle();
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mustReset, setMustReset] = useState(false);

  // Restore an existing session on boot.
  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setReady(true);
      return;
    }
    void (async () => {
      const token = await restoreAuthToken();
      if (token) {
        getSupabase().realtime.setAuth(token);
        const payload = decodeJwtPayload(token);
        const sub = typeof payload?.sub === "string" ? payload.sub : null;
        setMustReset(payload?.must_reset === true);
        if (sub) {
          setUserId(sub);
          setProfile(await loadProfileInto(sub));
        }
      }
      setReady(true);
    })();
  }, []);

  async function login(email: string, password: string): Promise<LoginResult> {
    try {
      const res = await invokeAuthFunction<{ token: string; profile: Profile; must_reset: boolean }>("auth-login", {
        email,
        password,
      });
      setAuthToken(res.token);
      getSupabase().realtime.setAuth(res.token);
      setUserId(res.profile.id);
      setProfile(res.profile);
      setMustReset(res.must_reset === true);
      return { ok: true, profile: res.profile, mustReset: res.must_reset === true };
    } catch (err) {
      if (err instanceof AuthFunctionError) return { ok: false, error: err.message };
      return { ok: false, error: "Could not sign in. Check your connection and try again." };
    }
  }

  async function signOut() {
    clearAuthToken();
    getSupabase().realtime.setAuth("");
    setUserId(null);
    setProfile(null);
    setMustReset(false);
  }

  async function refresh() {
    if (!userId) return;
    setProfile(await loadProfileInto(userId));
  }

  const blockedReason =
    ready && userId && profile && !ADMIN_ROLES.includes(profile.role)
      ? `Your account role (“${profile.role}”) signs into the staff portal or driver app, not the admin portal.`
      : null;

  const value: AuthState = { ready, userId, profile, blockedReason, mustReset, login, signOut, refresh };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
