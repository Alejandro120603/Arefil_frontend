import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";

export default function BackupsLayout({ children }: { children: ReactNode }) {
  return <RequirePermission anyOf={["system:backup"]}>{children}</RequirePermission>;
}
