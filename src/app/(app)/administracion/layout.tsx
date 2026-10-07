import type { ReactNode } from "react";
import { ForbiddenNotice } from "@/components/auth/forbidden-notice";
import { requireUser } from "@/lib/auth/server-session";
import { hasPermission } from "@/lib/auth/session";

/**
 * Administration is for ADMIN only. This keeps a USER off the pages; the
 * backend still refuses every administrative request on its own (403).
 */
export default async function AdministrationLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!hasPermission(user, "reports:admin")) return <ForbiddenNotice />;
  return children;
}
