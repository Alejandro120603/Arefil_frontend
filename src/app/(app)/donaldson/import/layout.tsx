import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";

/** Importing a price list changes the shared catalogue: `catalog:write` only. */
export default function ImportLayout({ children }: { children: ReactNode }) {
  return <RequirePermission anyOf={["catalog:write"]}>{children}</RequirePermission>;
}
