"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, BigPasswordInput, Card } from "@hericilla/ui";
import { AuthFunctionError, hasSupabaseEnv, invokeAuthFunction } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

/**
 * Forced password change for freshly-created accounts (must_reset). The user is already
 * signed in with a temporary password; we exchange it via auth-change-password, then
 * re-login so the minted JWT carries must_reset = false.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { profile, login, signOut } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("Choose a new password of at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await invokeAuthFunction("auth-change-password", { current, new: next });
      // Re-login to mint a fresh token reflecting must_reset = false.
      if (profile?.email) {
        const r = await login(profile.email, next);
        if (!r.ok) {
          await signOut();
          router.replace("/login");
          return;
        }
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof AuthFunctionError ? err.message : "Could not change your password. Try again.");
      setBusy(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-xl font-bold text-brand-950">Supabase is not configured</h1>
          <p className="mt-4 text-base text-ink-soft">
            This portal needs its project keys first. See <code className="bg-brand-50 px-2 rounded">.env.local</code>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <Card className="w-full max-w-md p-8 sm:p-10">
        <h1 className="text-xl font-extrabold text-brand-950">Set your password</h1>
        <p className="mt-2 text-base text-ink-soft">
          Choose a new password to replace the temporary one{profile?.email ? ` for ${profile.email}` : ""}.
        </p>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <BigPasswordInput
            label="Current (temporary) password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <BigPasswordInput
            label="New password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <BigPasswordInput
            label="Repeat new password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && (
            <p className="rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
              {error}
            </p>
          )}
          <BigButton type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </BigButton>
          <button
            type="button"
            onClick={() => void signOut().then(() => router.replace("/login"))}
            className="w-full text-center text-base font-semibold text-brand-700 underline"
          >
            Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}
