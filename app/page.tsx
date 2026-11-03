"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@hericilla/ui";
import { useAuth } from "@/lib/auth";

export default function AdminRoot() {
  const { ready, userId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(userId ? "/dashboard" : "/login");
  }, [ready, userId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
