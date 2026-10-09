import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";

/** Administration as a whole; each section below narrows it to its own permission. */
export default function AdministrationLayout({ children }: { children: ReactNode }) {
  return <RequirePermission anyOf={["reports:admin", "system:backup"]}>{children}</RequirePermission>;
}
