import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  EXCEL_TEMPLATE_VALIDATION_LABELS,
  excelTemplateIssueLocation,
  excelTemplateValidationStatus,
} from "@/lib/reports/report-excel-template";
import type { ReportExcelTemplateValidationIssue, ReportExcelTemplateValidationResult } from "@/types/api";

const VALIDATION_ICONS = {
  valid: CheckCircle2,
  warning: AlertTriangle,
  invalid: XCircle,
} as const;

const VALIDATION_TONES = {
  valid: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/40 text-amber-700 dark:text-amber-500",
  invalid: "border-destructive/40 text-destructive",
} as const;

/**
 * The full compatibility diagnosis (Backend #24), shared by every flow that
 * can answer with a `ReportExcelTemplateValidationResult`: uploading a
 * template (#23), and restoring a historical version that turns out
 * incompatible with the report's current Builder contract (#32).
 *
 * It describes the file the backend just read, not necessarily the active
 * template — callers own their own "the active template is unaffected"
 * messaging around this panel.
 */
export function ReportExcelTemplateValidationPanel({ validation }: { validation: ReportExcelTemplateValidationResult }) {
  const state = excelTemplateValidationStatus(validation);
  const Icon = VALIDATION_ICONS[state];

  return (
    <section className={`flex flex-col gap-2 rounded-lg border p-3 ${VALIDATION_TONES[state]}`}>
      <p className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4" aria-hidden="true" />
        Compatibilidad: {EXCEL_TEMPLATE_VALIDATION_LABELS[state]}
      </p>
      <p className="text-sm text-muted-foreground">
        Placeholders reconocidos: {validation.placeholder_count}
      </p>
      <p className="text-sm text-muted-foreground">
        Filas repetibles detectadas: {validation.repeatable_rows}
      </p>
      <IssueList title="Errores" issues={validation.errors} />
      <IssueList title="Advertencias" issues={validation.warnings} />
    </section>
  );
}

/** Every issue names its sheet, and its cell or merged range when it has one. */
function IssueList({ title, issues }: { title: string; issues: ReportExcelTemplateValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">
        {title} ({issues.length})
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${excelTemplateIssueLocation(issue)}-${index}`}>
            <span className="font-mono text-xs">{excelTemplateIssueLocation(issue)}</span> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
