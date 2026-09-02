"use client";

import { useId, useMemo } from "react";
import { FileSignature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FILENAME_TEMPLATE_MAX_LENGTH,
  fallbackReportFilename,
  previewReportFilename,
  sampleParameterValues,
  supportedFilenamePlaceholders,
  validateFilenameTemplate,
} from "@/lib/reports/report-filename-template";
import type { ReportParameter } from "@/types/api";

/**
 * Configures `filename_template` (Frontend #26 over Backend #26).
 *
 * The field is optional by contract: left empty, the backend names the file
 * `<code>-document.xlsx` and this says so instead of pretending a pattern
 * exists. Only placeholders the backend accepts are offered, and the preview
 * is rendered exclusively from data that is really there — a parameter with no
 * sample value suspends the preview rather than inventing a name.
 */
export function ReportFilenameTemplateField({
  value,
  code,
  name,
  parameters,
  sampleValues,
  onChange,
}: {
  value: string;
  code: string;
  name: string;
  parameters: ReportParameter[];
  /** Real values (last execution/defaults) available to resolve the preview. */
  sampleValues?: Record<string, unknown>;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const placeholders = useMemo(() => supportedFilenamePlaceholders(parameters), [parameters]);
  const errors = useMemo(
    () => validateFilenameTemplate(value, parameters.map((parameter) => parameter.name.trim())),
    [value, parameters],
  );
  const samples = useMemo(
    () => sampleValues ?? sampleParameterValues(parameters),
    [sampleValues, parameters],
  );
  /**
   * Only a configured pattern gets a preview: with the field empty the hint
   * above already names the fallback, and repeating it would read as if a
   * pattern were in effect.
   */
  const preview = useMemo(
    () => errors.length > 0 || !value.trim()
      ? null
      : previewReportFilename(value, { code, name, parameters: samples }),
    [errors.length, value, code, name, samples],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSignature /> Nombre del archivo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid max-w-xl gap-1.5">
          <Label htmlFor={inputId}>Patrón del nombre</Label>
          <Input
            id={inputId}
            className="font-mono"
            value={value}
            maxLength={FILENAME_TEMPLATE_MAX_LENGTH}
            placeholder="{{parameters.customer_name}} {{parameters.requisition}}"
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Déjalo vacío para usar el nombre genérico{" "}
            <code className="font-mono">{fallbackReportFilename(code || "reporte")}</code>. El backend
            sanea el resultado y agrega <code className="font-mono">.xlsx</code> una sola vez.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Placeholders disponibles</p>
          <div className="flex flex-wrap gap-2">
            {placeholders.map((placeholder) => (
              <button
                key={placeholder.token}
                type="button"
                onClick={() => onChange(`${value}${placeholder.token}`)}
                title={`Agregar ${placeholder.label}`}
              >
                <Badge variant="outline" className="font-mono">{placeholder.token}</Badge>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Solo se admiten <code className="font-mono">{"{{parameters.*}}"}</code>,{" "}
            <code className="font-mono">{"{{report.code}}"}</code> y{" "}
            <code className="font-mono">{"{{report.name}}"}</code>.
          </p>
        </div>

        {errors.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-destructive">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : preview?.filename ? (
          <p className="text-sm text-muted-foreground">
            Ejemplo: <span className="font-mono text-foreground">{preview.filename}</span>
          </p>
        ) : preview ? (
          <p className="text-sm text-muted-foreground">
            No hay datos de ejemplo para {preview.missing.join(", ")}; el nombre se resolverá al generar
            el documento.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
