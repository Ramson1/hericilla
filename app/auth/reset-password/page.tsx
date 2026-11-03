"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BigButton, BigInput, BigPasswordInput, Card } from "@hericilla/ui";
import { AuthFunctionError, hasSupabaseEnv, invokeAuthFunction } from "@hericilla/supabase-clients";

type Phase = "checking" | "set-password" | "send-link" | "link-sent";

/**
 * Custom (non-GoTrue) password recovery. The reset link our Edge Function emails is
 * /auth/reset-password?token=<raw>&email=<email>. If a token is present we ask for a
 * new password and exchange the token via auth-reset-password; otherwise we start the
 * "send me a link" flow via auth-forgot-password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") ?? "";
    const e = params.get("email") ?? "";
    if (t) {
      setToken(t);
      setEmail(e);
      setPhase("set-password");
    } else {
      setPhase("send-link");
    }
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await invokeAuthFunction("auth-forgot-password", { email });
      setPhase("link-sent");
    } catch (err) {
      setError(err instanceof AuthFunctionError ? err.message : "Could not send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Please choose a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match. Please check both fields.");
      return;
    }
    setBusy(true);
    try {
      await invokeAuthFunction("auth-reset-password", { token, password });
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof AuthFunctionError
          ? err.message
          : "Could not save the new password. Open the email link again and try once more.",
      );
      setBusy(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-xl font-bold text-brand-950">Supabase is not configured</h1>
          <p className="mt-4 text-base text-ink-soft">
            This portal needs its project keys before password recovery can run. See{" "}
            <code className="bg-brand-50 px-2 rounded">.env.local</code>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <Card className="w-full max-w-md p-8 sm:p-10">
        <h1 className="text-xl font-extrabold text-brand-950">
          {phase === "set-password" ? "Choose a new password" : "Reset your password"}
        </h1>

        {phase === "checking" && <p className="mt-4 text-base text-ink-soft">Checking your reset link…</p>}

        {phase === "set-password" && (
          <form className="mt-6" onSubmit={savePassword}>
            <p className="mb-5 text-base text-ink-soft">
              Your reset link is valid. Type a new password twice below — then sign in with it.
            </p>
            <BigPasswordInput
              label="New password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            <BigButton type="submit" size="lg" className="w-full mt-2" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </BigButton>
          </form>
        )}

        {phase === "send-link" && (
          <form className="mt-6" onSubmit={sendLink}>
            <p className="mb-5 text-base text-ink-soft">
              Enter your work email and we will send you a link to set a new password.
            </p>
            <BigInput
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@hericilla.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && (
              <p className="rounded-lg bg-danger-100 p-4 text-danger-800 font-semibold" role="alert">
                {error}
              </p>
            )}
            <BigButton type="submit" size="lg" className="w-full mt-2" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </BigButton>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-4 w-full text-center text-base font-semibold text-brand-700 underline"
            >
              Back to sign in
            </button>
          </form>
        )}

        {phase === "link-sent" && (
          <div className="mt-6">
            <p className="rounded-lg bg-success-100 p-4 text-success-800 font-semibold">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. Open it on this device —
              the page will ask you for a new password.
            </p>
            <BigButton variant="secondary" size="lg" className="w-full mt-4" onClick={() => setPhase("send-link")}>
              Send to a different email
            </BigButton>
          </div>
        )}
      </Card>
    </div>
  );
}
