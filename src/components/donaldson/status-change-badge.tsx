import { Badge } from "@/components/ui/badge";
import type { StatusChangeStatus } from "@/types/api";

const LABELS: Record<StatusChangeStatus, string> = {
  CANCELLED: "Cancelado",
  NON_CATALOG: "Fuera de catálogo",
};

export function StatusChangeBadge({ status }: { status: StatusChangeStatus }) {
  return <Badge variant={status === "CANCELLED" ? "destructive" : "secondary"}>{LABELS[status]}</Badge>;
}
