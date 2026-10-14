import type { ReactNode } from "react";
import { RequirePermission } from "@/components/auth/require-permission";

export default function LetterheadAdministrationLayout({ children }: { children: ReactNode }) {
  return <RequirePermission anyOf={["reports:admin"]}>{children}</RequirePermission>;
}
