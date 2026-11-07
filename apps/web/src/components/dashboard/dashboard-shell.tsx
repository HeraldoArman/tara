import type { ReactNode } from "react";
import { AppShell } from "@/components/tara/ui";
import type { User } from "@/lib/contracts";

export function DashboardShell({
  children,
  user,
}: {
  children: ReactNode;
  user: User;
}) {
  return (
    <AppShell active="/dashboard" user={user}>
      <div className="owner-dashboard-content">{children}</div>
    </AppShell>
  );
}
