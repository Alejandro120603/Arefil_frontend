"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReportParameterOptions } from "@/lib/api/reports";
import { getUserErrorMessage } from "@/lib/api/errors";
import type { ReportOption, ReportParameter } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function initialRuntimeValues(parameters: ReportParameter[]): Record<string, string | boolean> {
  return Object.fromEntries(parameters.map((parameter) => [
    parameter.name,
    parameter.default_value == null ? (parameter.data_type === "boolean" ? false : "") : parameter.default_value,
  ])) as Record<string, string | boolean>;
}

export function ReportRuntimeParameters({
  code,
  parameters,
  values,
  disabled = false,
  onChange,
}: {
  code: string;
  parameters: ReportParameter[];
  values: Record<string, string | boolean>;
  disabled?: boolean;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const [options, setOptions] = useState<Record<string, ReportOption[]>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const selectParameters = parameters.filter((parameter) => parameter.input_type === "select");
  const loadingOptions = optionsError == null && selectParameters.some((parameter) => options[parameter.name] == null);

  useEffect(() => {
    const selects = parameters.filter((parameter) => parameter.input_type === "select");
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

  if (parameters.length === 0) {
    return <p className="text-sm text-muted-foreground">Este reporte no requiere parámetros para el preview.</p>;
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
        {parameters.map((parameter) => {
          const id = `runtime-${parameter.name}`;
          const value = values[parameter.name] ?? (parameter.data_type === "boolean" ? false : "");
          return (
            <div key={parameter.name} className="grid gap-1.5">
              {parameter.input_type === "checkbox" ? (
                <label htmlFor={id} className="flex h-9 items-center gap-2 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={disabled}
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
                      onChange={(event) => onChange(parameter.name, event.target.value)}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
