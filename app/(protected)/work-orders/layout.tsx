import { Suspense } from "react";

export default function WorkOrdersLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-lg text-ink-soft">Loading work orders…</div>}>{children}</Suspense>;
}
