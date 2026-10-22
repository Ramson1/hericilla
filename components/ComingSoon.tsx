"use client";

import { PageHeader, EmptyState } from "@hericilla/ui";

/** Section that exists in navigation but is built in a later phase — honest, teachable placeholder. */
export function ComingSoon({
  title,
  purpose,
  steps,
  when,
}: {
  title: string;
  purpose: string;
  steps: [string, string, string];
  when: string;
}) {
  return (
    <div>
      <PageHeader title={title} purpose={purpose} />
      <div className="mt-6">
        <EmptyState
          title="This section is being built"
          teach={`${when}. Meanwhile nothing is lost — the data is already prepared behind the scenes. ${steps[0]} ${steps[1]} ${steps[2]}`}
        />
      </div>
    </div>
  );
}
