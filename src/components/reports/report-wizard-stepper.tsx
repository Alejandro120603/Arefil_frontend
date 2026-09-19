"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { REPORT_WIZARD_STEPS, type ReportWizardStepId } from "@/lib/reports/report-wizard";

/**
 * The guided report wizard's stepper (Frontend #33): a horizontal row of
 * clickable steps on wider screens, a compact "Paso N de 7" line plus a thin
 * progress bar on narrow ones — both are always in the DOM, CSS toggles which
 * one shows, so there is nothing to hydrate differently per breakpoint.
 */
export function ReportWizardStepper({
  current,
  completed,
  availability,
  onSelect,
}: {
  current: ReportWizardStepId;
  /** Steps considered done — only cosmetic (checkmark), never blocks navigation. */
  completed: ReadonlySet<ReportWizardStepId>;
  /** Steps the user may currently jump to; an unavailable step renders disabled. */
  availability: (step: ReportWizardStepId) => boolean;
  onSelect: (step: ReportWizardStepId) => void;
}) {
  const currentIndex = REPORT_WIZARD_STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Pasos de configuración del reporte">
      <ol className="hidden flex-wrap items-center gap-1 sm:flex">
        {REPORT_WIZARD_STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isDone = completed.has(step.id);
          const isAvailable = availability(step.id);
          return (
            <li key={step.id} className="flex items-center gap-1">
              {index > 0 && <span aria-hidden="true" className="h-px w-4 bg-border sm:w-6" />}
              <button
                type="button"
                disabled={!isAvailable}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => isAvailable && onSelect(step.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  isCurrent && "border-primary bg-primary/10 text-primary",
                  !isCurrent && isDone && "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                  !isCurrent && !isDone && isAvailable && "border-border text-muted-foreground hover:text-foreground",
                  !isAvailable && "cursor-not-allowed border-border text-muted-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    !isCurrent && isDone && "border-emerald-500 bg-emerald-500 text-white",
                    !isCurrent && !isDone && "border-current",
                  )}
                  aria-hidden="true"
                >
                  {isDone && !isCurrent ? <Check className="h-2.5 w-2.5" /> : step.order}
                </span>
                {step.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5 sm:hidden">
        <p className="text-sm font-medium">
          Paso {currentIndex + 1} de {REPORT_WIZARD_STEPS.length} · {REPORT_WIZARD_STEPS[currentIndex]?.title}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={REPORT_WIZARD_STEPS.length} aria-valuenow={currentIndex + 1}>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((currentIndex + 1) / REPORT_WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </nav>
  );
}
