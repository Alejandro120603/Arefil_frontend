import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";

export default function ReportAdministrationLayout({ children }: { children: ReactNode }) {
  return <RequirePermission anyOf={["reports:admin"]}>{children}</RequirePermission>;
}
