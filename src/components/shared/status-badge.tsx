import { CircleCheck, CircleDashed, CircleSlash, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "destructive" | "neutral";

const TONE_VARIANT = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  neutral: "secondary",
} as const;

const TONE_ICON: Record<Tone, LucideIcon> = {
  success: CircleCheck,
  warning: CircleDashed,
  destructive: CircleSlash,
  neutral: CircleDashed,
};

/**
 * `PriceListStatus` is an open string in the API contract, so the mapping is a
 * lookup with a neutral fallback rather than an exhaustive record: an unknown
 * backend status still renders, it just renders neutral instead of guessing.
 * Colour is never the only signal - every badge keeps its label.
 */
const KNOWN: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Activa", tone: "success" },
  COMPLETED: { label: "Completada", tone: "success" },
  IMPORTED: { label: "Importada", tone: "success" },
  PROCESSING: { label: "Procesando", tone: "warning" },
  IMPORTING: { label: "Importando", tone: "warning" },
  PREVIEWED: { label: "Analizada", tone: "warning" },
  UPLOADED: { label: "Cargada", tone: "neutral" },
  PENDING: { label: "Pendiente", tone: "warning" },
  DRAFT: { label: "Borrador", tone: "neutral" },
  ARCHIVED: { label: "Archivada", tone: "neutral" },
  SUPERSEDED: { label: "Reemplazada", tone: "neutral" },
  FAILED: { label: "Fallida", tone: "destructive" },
  ERROR: { label: "Error", tone: "destructive" },
};

export function StatusBadge({
  status,
  showIcon = true,
  className,
}: {
  status: string;
  showIcon?: boolean;
  className?: string;
}) {
  const known = KNOWN[status.toUpperCase()];
  const tone: Tone = known?.tone ?? "neutral";
  const Icon = tone === "destructive" ? TriangleAlert : TONE_ICON[tone];
  return (
    <Badge variant={TONE_VARIANT[tone]} className={cn("gap-1", className)}>
      {showIcon && <Icon aria-hidden />}
      {known?.label ?? status}
    </Badge>
  );
}

/** Enabled/disabled flag used by both report surfaces. */
export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "success" : "secondary"} className="gap-1">
      {enabled ? <CircleCheck aria-hidden /> : <CircleSlash aria-hidden />}
      {enabled ? "Habilitado" : "Deshabilitado"}
    </Badge>
  );
}
