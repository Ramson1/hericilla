"use client";

import { useEffect } from "react";

/**
 * Supabase password-recovery links follow the project's Site URL / allowlist and
 * can land on any route (usually the site root) with #...type=recovery or
 * ?code=...type=recovery. Forward them to the dedicated reset page before the
 * auth client consumes the URL, so the user always reaches the password form.
 */
export function RecoveryRedirect() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname === "/auth/reset-password") return;
    const implicitRecovery = hash.includes("access_token") && hash.includes("type=recovery");
    const pkceRecovery = search.includes("code=") && search.includes("type=recovery");
    if (implicitRecovery || pkceRecovery) {
      window.location.replace(`/auth/reset-password${hash || search}`);
    }
  }, []);
  return null;
}
