import type { ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/session";
import { Sidebar } from "./sidebar";

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
