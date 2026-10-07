import type { ReactNode } from "react";
import { ForbiddenNotice } from "@/components/auth/forbidden-notice";
import { requireUser } from "@/lib/auth/server-session";
import { type Permission, hasPermission } from "@/lib/auth/session";

/**
 * Server-side page guard for layouts: the signed-in user must hold one of
 * `anyOf`. It only keeps people off pages they cannot use; the backend still
 * refuses the underlying requests on its own (403).
 */
export async function RequirePermission({ anyOf, children }: { anyOf: Permission[]; children: ReactNode }) {
  const user = await requireUser();
  if (!anyOf.some((permission) => hasPermission(user, permission))) return <ForbiddenNotice />;
  return children;
}
