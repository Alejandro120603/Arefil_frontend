"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReportParameterOptions } from "@/lib/api/reports";
import { getUserErrorMessage } from "@/lib/api/errors";
import {
  orderedReportParameters,
  type RuntimeParameterValues,
} from "@/lib/reports/report-runtime";
import type { ReportOption, ReportParameter } from "@/types/api";

export { initialRuntimeValues } from "@/lib/reports/report-runtime";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ReportRuntimeParameters({
  code,
  parameters,
  values,
  disabled = false,
  errors = {},
  onOptionsStateChange,
  onChange,
}: {
  code: string;
  parameters: ReportParameter[];
  values: RuntimeParameterValues;
  disabled?: boolean;
  errors?: Record<string, string>;
  onOptionsStateChange?: (state: { loading: boolean; ready: boolean }) => void;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const [options, setOptions] = useState<Record<string, ReportOption[]>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const orderedParameters = useMemo(() => orderedReportParameters(parameters), [parameters]);
  const selectParameters = orderedParameters.filter((parameter) => parameter.input_type === "select");
  const loadingOptions = optionsError == null && selectParameters.some((parameter) => options[parameter.name] == null);
  const optionsReady = !loadingOptions && optionsError == null && selectParameters.every((parameter) =>
    !parameter.required || (options[parameter.name]?.length ?? 0) > 0,
  );

  useEffect(() => {
    const selects = orderedReportParameters(parameters).filter((parameter) => parameter.input_type === "select");
    if (selects.length === 0) return;
    const controller = new AbortController();
    void Promise.all(
      selects.map(async (parameter) => [
        parameter.name,
        await getReportParameterOptions(code, parameter.name, { signal: controller.signal }),
      ] as const),
    ).then((entries) => {
      if (!controller.signal.aborted) setOptions(Object.fromEntries(entries));
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setOptionsError(getUserErrorMessage(error, "No se pudieron cargar las opciones de los parámetros."));
      }
    });
    return () => controller.abort();
  }, [code, parameters]);

  useEffect(() => {
    onOptionsStateChange?.({ loading: loadingOptions, ready: optionsReady });
  }, [loadingOptions, onOptionsStateChange, optionsReady]);

  if (parameters.length === 0) {
    return <p className="text-sm text-muted-foreground">Este reporte no requiere parámetros.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {loadingOptions && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando opciones...
        </p>
      )}
      {optionsError && <p className="text-sm text-destructive">{optionsError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {orderedParameters.map((parameter) => {
          const id = `runtime-${parameter.name}`;
          const value = values[parameter.name] ?? (parameter.data_type === "boolean" ? false : "");
          const error = errors[parameter.name];
          return (
            <div key={parameter.name} className="grid gap-1.5">
              {parameter.input_type === "checkbox" ? (
                <label htmlFor={id} className="flex h-9 items-center gap-2 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={disabled}
                    aria-invalid={error != null}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => onChange(parameter.name, event.target.checked)}
                  />
                  {parameter.label}{parameter.required ? " *" : ""}
                </label>
              ) : (
                <>
                  <Label htmlFor={id}>{parameter.label}{parameter.required ? " *" : ""}</Label>
                  {parameter.input_type === "select" ? (
                    <select
                      id={id}
                      className={CONTROL_CLASS}
                      value={String(value)}
                      disabled={disabled || loadingOptions}
                      aria-invalid={error != null}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(event) => onChange(parameter.name, event.target.value)}
                    >
                      <option value="">Selecciona una opción</option>
                      {(options[parameter.name] ?? []).map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={id}
                      type={
                        parameter.input_type === "datetime" ? "datetime-local" :
                        parameter.input_type === "number" ? "number" : parameter.input_type
                      }
                      step={parameter.data_type === "decimal" ? "any" : undefined}
                      value={String(value)}
                      disabled={disabled}
                      aria-invalid={error != null}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(event) => onChange(parameter.name, event.target.value)}
                    />
                  )}
                </>
              )}
              {parameter.input_type === "select" && !loadingOptions && optionsError == null && (options[parameter.name]?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">No hay opciones disponibles.</p>
              )}
              {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
