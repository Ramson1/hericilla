"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BigButton, BigInput, Card } from "@hericilla/ui";
import { getSupabase, hasSupabaseEnv } from "@hericilla/supabase-clients";
import { ADMIN_ROLES } from "@hericilla/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = getSupabase();
      const { data, error: signErr } = await s.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      // Role gate: the profile row is readable by its owner under RLS.
      const { data: profile } = await s
        .from("profiles")
        .select("role, status")
        .eq("id", data.user!.id)
        .maybeSingle();
      if (!profile) {
        await s.auth.signOut();
        throw new Error("This account has no staff profile yet. Ask an administrator to complete your setup.");
      }
      if (profile.status !== "active") {
        await s.auth.signOut();
        throw new Error("This account is inactive. Ask an administrator to reactivate it.");
      }
      if (!ADMIN_ROLES.includes(profile.role as (typeof ADMIN_ROLES)[number])) {
        await s.auth.signOut();
        throw new Error("This account signs into the staff portal or driver app, not the admin portal.");
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in. Please try again.");
      setBusy(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-2xl font-bold text-brand-950">Almost there — one setup step</h1>
          <p className="mt-4 text-lg text-ink-soft">
            The admin portal needs your Supabase project keys before anyone can sign in. Copy{" "}
            <code className="bg-brand-50 px-2 rounded">.env.example</code> to{" "}
            <code className="bg-brand-50 px-2 rounded">.env.local</code> in <strong>apps/admin</strong>, paste the
            project URL and anon key from your Supabase dashboard, then restart the dev server.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={52} height={52} className="rounded-xl" />
          <div>
            <h1 className="text-2xl font-extrabold text-brand-950">Hericilla Admin</h1>
            <p className="text-base text-ink-soft">Sign in with your work email</p>
          </div>
        </div>

        <form className="mt-8 space-y-5" onSubmit={signIn}>
          <BigInput
            label="Email address"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <BigInput
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
              {error}
            </p>
          )}
          <BigButton type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </BigButton>
        </form>

        <p className="mt-6 text-sm text-ink-soft">
          Forgot your password? Ask an administrator to reset it for you in Settings.
        </p>
      </Card>
    </div>
  );
}
