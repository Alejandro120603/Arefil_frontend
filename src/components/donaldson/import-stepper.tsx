import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const IMPORT_STEPS = ["Archivo", "Validación", "Confirmación", "Resultado"] as const;

export type ImportStepState = "pending" | "current" | "done" | "error";

/**
 * Purely derived from the reducer's `Phase`: it never claims a stage the API
 * does not expose. Sheet detection and percentage progress are deliberately
 * absent because `previewDonaldsonImport` does not report them.
 */
export function ImportStepper({ states }: { states: ImportStepState[] }) {
  const currentIndex = Math.max(
    states.findIndex((state) => state === "current" || state === "error"),
    0,
  );

  return (
    <div>
      <p className="text-sm font-medium sm:hidden">
        Paso {currentIndex + 1} de {IMPORT_STEPS.length} · {IMPORT_STEPS[currentIndex]}
      </p>
      <ol className="hidden items-center gap-2 sm:flex" aria-label="Progreso de la importación">
        {IMPORT_STEPS.map((label, index) => {
          const state = states[index] ?? "pending";
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors duration-(--duration-ui)",
                  state === "done" && "bg-success/15 text-success-strong",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "error" && "bg-destructive/12 text-destructive-strong",
                  state === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? <Check aria-hidden className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  state === "pending" ? "text-muted-foreground" : "font-medium",
                  state === "error" && "text-destructive-strong",
                )}
              >
                {label}
              </span>
              {index < IMPORT_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px min-w-4 flex-1",
                    states[index] === "done" ? "bg-success/40" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
