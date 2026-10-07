"use client";

import { useEffect, useRef } from "react";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  issueLocation,
  issueReason,
  type ReportSaveFailure,
} from "@/lib/reports/report-save-errors";
import {
  templateDependencyHint,
  templateDependencyTitle,
  templateLocationLabel,
  type TemplateDependencyBlock,
  type TemplatePlaceholderLocation,
} from "@/lib/reports/report-template-dependencies";

/** Discreet marker for a parameter/column/summary the active Excel template uses (Frontend #43). */
export function TemplateUsageBadge({ locations }: { locations: readonly TemplatePlaceholderLocation[] | undefined }) {
  if (!locations || locations.length === 0) return null;
  const where = locations.map(templateLocationLabel).join(", ");
  return (
    <Badge variant="outline" title={`Utilizado en la plantilla Excel: ${where}`}>
      <FileSpreadsheet aria-hidden="true" /> Plantilla Excel
    </Badge>
  );
}

function Locations({ locations }: { locations: readonly TemplatePlaceholderLocation[] }) {
  return (
    <div className="text-sm">
      <p className="font-medium">{locations.length === 1 ? "Ubicación:" : "Ubicaciones:"}</p>
      <ul className="list-disc pl-5">
        {locations.map((location) => (
          <li key={`${location.sheet}!${location.cell}:${location.placeholder}`}>
            {templateLocationLabel(location)}{" "}
            <code className="text-xs text-muted-foreground">{`{{${location.placeholder}}}`}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The local blocker: an edit that would remove something the active template still uses. */
export function TemplateDependencyAlert({
  blocks,
  onGoToMapping,
  onCancel,
}: {
  blocks: readonly TemplateDependencyBlock[];
  onGoToMapping?: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The edit happened inside a long card; bring the explanation into view.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [blocks]);
  if (blocks.length === 0) return null;
  return (
    <Alert ref={ref} variant="destructive" role="alert">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{templateDependencyTitle(blocks[0])}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        {blocks.map((block, index) => (
          <div key={`${block.kind}:${block.key}`} className="flex flex-col gap-1">
            {index > 0 && <p className="font-medium">{templateDependencyTitle(block)}</p>}
            <p>{templateDependencyHint(block)}</p>
            <Locations locations={block.locations} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {onGoToMapping && <Button type="button" size="sm" onClick={onGoToMapping}>Ir a Mapear campos</Button>}
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/**
 * How a failed configuration save reads (Frontend #43): the authoritative
 * `ACTIVE_TEMPLATE_INCOMPATIBLE` as a list of affected template cells,
 * `REPORT_NOT_READY` as its blockers (#44), a `409` as a temporary conflict,
 * anything else as the backend's own message.
 */
export function ReportSaveFailureAlert({
  title,
  failure,
  resolveLabel,
  onGoToMapping,
}: {
  title: string;
  failure: ReportSaveFailure;
  resolveLabel: (placeholder: string | null) => string;
  onGoToMapping?: () => void;
}) {
  if (failure.kind === "message") return <ErrorAlert title={title} message={failure.message} />;
  if (failure.kind === "conflict") {
    return <ErrorAlert title="El guardado no se completó" message={failure.message} />;
  }
  if (failure.kind === "not-ready") {
    const blockers = failure.issues.filter((issue) => issue.severity === "blocker");
    return (
      <Alert variant="destructive" role="alert">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>{failure.message}</AlertTitle>
        {blockers.length > 0 && (
          <AlertDescription>
            <ul className="list-disc pl-5">{blockers.map((issue) => <li key={`${issue.code}:${issue.message}`}>{issue.message}</li>)}</ul>
          </AlertDescription>
        )}
      </Alert>
    );
  }
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{failure.message}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>No se guardó ningún cambio. Primero quita o reemplaza estos datos en la plantilla.</p>
        {failure.issues.length > 0 && (
          <ul className="list-disc pl-5">
            {failure.issues.map((issue, index) => {
              const where = issueLocation(issue);
              return (
                <li key={`${issue.placeholder ?? "?"}:${where}:${index}`}>
                  {resolveLabel(issue.placeholder)}
                  {where ? ` — ${where}` : ""}
                  {` (${issueReason(issue)})`}
                </li>
              );
            })}
          </ul>
        )}
        {onGoToMapping && <Button type="button" size="sm" onClick={onGoToMapping}>Ir a Mapear campos</Button>}
      </AlertDescription>
    </Alert>
  );
}
