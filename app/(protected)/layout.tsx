"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, BigButton, Skeleton } from "@hericilla/ui";
import { AdminShell, EnvNotice } from "@/components/shell/AdminShell";
import { useAuth } from "@/lib/auth";
import { hasSupabaseEnv } from "@hericilla/supabase-clients";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, profile, blockedReason, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!hasSupabaseEnv()) {
    return (
      <EnvNotice
        title="Supabase is not connected yet"
        body="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/admin/.env.local, then restart. The rest of the portal will work once the keys are in place."
      />
    );
  }

  if (!ready || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg text-center p-10">
          <h1 className="text-xl font-bold text-brand-950">Wrong door for this account</h1>
          <p className="mt-4 text-base text-ink-soft">{blockedReason}</p>
          {profile?.role === "driver" ? (
            <p className="mt-2 text-base text-ink-soft">Use the driver app on your phone to sign in.</p>
          ) : profile ? (
            <p className="mt-2 text-base text-ink-soft">The staff portal is the right place for your account.</p>
          ) : null}
          <BigButton className="mt-6" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </BigButton>
        </Card>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
