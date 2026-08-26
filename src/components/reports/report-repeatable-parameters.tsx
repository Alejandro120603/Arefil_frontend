"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReportParameterOptions } from "@/lib/api/reports";
import { getUserErrorMessage } from "@/lib/api/errors";
import {
  createRuntimeGroupRow,
  orderedGroupFields,
  orderedParameterGroups,
  type RuntimeGroupValues,
  type RuntimeParameterValues,
} from "@/lib/reports/report-runtime";
import type { ReportNumericConfiguration, ReportOption, ReportParameterGroup } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface FieldOptionsState {
  context: string;
  loading: boolean;
  options: ReportOption[];
  error: string | null;
}

export function ReportRepeatableParameters({
  code,
  groups,
  scalarValues,
  values,
  disabled = false,
  errors = {},
  groupErrors = {},
  onOptionsStateChange,
  onChange,
}: {
  code: string;
  groups: ReportParameterGroup[];
  scalarValues: RuntimeParameterValues;
  values: RuntimeGroupValues;
  disabled?: boolean;
  errors?: Record<string, Record<number, Record<string, string>>>;
  groupErrors?: Record<string, string>;
  onOptionsStateChange?: (state: { loading: boolean; ready: boolean }) => void;
  onChange: (values: RuntimeGroupValues) => void;
}) {
  const [optionStates, setOptionStates] = useState<Record<string, FieldOptionsState>>({});
  const nextRowId = useRef(1_000);
  const orderedGroups = useMemo(() => orderedParameterGroups(groups), [groups]);
  const dependencies = orderedGroups.flatMap((group) => orderedGroupFields(group.fields)
    .filter((field) => field.input_type === "select")
    .map((field) => ({ group, field, path: `${group.name}.${field.name}` })));
  const dependencyKey = dependencies.map(({ group, path }) => `${path}:${String(scalarValues[group.context_parameter] ?? "")}`).join("|");

  useEffect(() => {
    const controller = new AbortController();
    const active = dependencies.filter(({ group }) => String(scalarValues[group.context_parameter] ?? "").trim() !== "");

    void Promise.all(active.map(async ({ group, field, path }) => {
      const contextValue = scalarValues[group.context_parameter];
      const options = await getReportParameterOptions(
        code,
        path,
        { [group.context_parameter]: typeof contextValue === "boolean" ? undefined : contextValue },
        { signal: controller.signal },
      );
      return { group, field, path, options };
    })).then((results) => {
      if (controller.signal.aborted) return;
      setOptionStates((current) => {
        const next = { ...current };
        for (const { group, path, options } of results) next[path] = {
          context: String(scalarValues[group.context_parameter]), loading: false, options, error: null,
        };
        return next;
      });

      let changed = false;
      const nextValues: RuntimeGroupValues = { ...values };
      for (const { group, field, options } of results) {
        const allowed = new Set(options.map((option) => String(option.value)));
        const rows = values[group.name] ?? [];
        const nextRows = rows.map((row) => {
          const selected = String(row.values[field.name] ?? "");
          if (!selected || allowed.has(selected)) return row;
          changed = true;
          return { ...row, values: { ...row.values, [field.name]: "" } };
        });
        if (nextRows !== rows) nextValues[group.name] = nextRows;
      }
      if (changed) onChange(nextValues);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      const message = getUserErrorMessage(error, "No se pudieron cargar las opciones de los renglones.");
      setOptionStates((current) => {
        const next = { ...current };
        for (const { group, path } of active) next[path] = {
          context: String(scalarValues[group.context_parameter]), loading: false, options: [], error: message,
        };
        return next;
      });
    });
    return () => controller.abort();
    // `dependencyKey` represents metadata + scalar context. Row edits do not refetch options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, dependencyKey]);

  function effectiveOptionsState(group: ReportParameterGroup, path: string): FieldOptionsState {
    const context = String(scalarValues[group.context_parameter] ?? "").trim();
    if (!context) return { context, loading: false, options: [], error: null };
    const state = optionStates[path];
    return state?.context === context ? state : { context, loading: true, options: [], error: null };
  }

  const loading = dependencies.some(({ group, path }) => effectiveOptionsState(group, path).loading);
  const ready = !loading && dependencies.every(({ group, path }) => effectiveOptionsState(group, path).error == null);
  useEffect(() => onOptionsStateChange?.({ loading, ready }), [loading, onOptionsStateChange, ready]);

  function replaceCell(groupName: string, rowIndex: number, fieldName: string, value: string | boolean) {
    onChange({
      ...values,
      [groupName]: (values[groupName] ?? []).map((row, index) => index === rowIndex
        ? { ...row, values: { ...row.values, [fieldName]: value } }
        : row),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {orderedGroups.map((group) => {
        const rows = values[group.name] ?? [];
        const fields = orderedGroupFields(group.fields);
        const atMaximum = group.max_items != null && rows.length >= group.max_items;
        return (
          <section key={group.name} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-medium">{group.label}</h3><p className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "renglón" : "renglones"}</p></div>
              <Button type="button" size="sm" variant="outline" disabled={disabled || atMaximum} onClick={() => onChange({ ...values, [group.name]: [...rows, createRuntimeGroupRow(group, `${group.name}-${nextRowId.current++}`)] })}>
                <Plus /> Agregar renglón
              </Button>
            </div>
            {groupErrors[group.name] && <p className="text-sm text-destructive">{groupErrors[group.name]}</p>}
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay renglones capturados.</div>
            ) : (
              <ol className="flex list-none flex-col gap-3 p-0">
                {rows.map((row, rowIndex) => (
                  <li key={row.id} className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Renglón {rowIndex + 1}</p>
                      <Button type="button" size="icon-sm" variant="destructive" aria-label={`Eliminar renglón ${rowIndex + 1}`} disabled={disabled} onClick={() => onChange({ ...values, [group.name]: rows.filter((_, index) => index !== rowIndex) })}><Trash2 /></Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {fields.map((field) => {
                        const id = `runtime-${group.name}-${row.id}-${field.name}`;
                        const error = errors[group.name]?.[rowIndex]?.[field.name];
                        const value = row.values[field.name] ?? (field.input_type === "checkbox" ? false : "");
                        const optionState = field.input_type === "select"
                          ? effectiveOptionsState(group, `${group.name}.${field.name}`)
                          : undefined;
                        const numeric = field.input_type === "number";
                        const constraints = numeric ? (field.configuration_json ?? {}) as ReportNumericConfiguration : {};
                        const percent = numeric && Number(constraints.minimum) === 0 && Number(constraints.maximum) === 100;
                        return (
                          <div key={field.name} className="grid gap-1.5">
                            {field.input_type === "checkbox" ? (
                              <label htmlFor={id} className="flex h-9 items-center gap-2 text-sm"><input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => replaceCell(group.name, rowIndex, field.name, event.target.checked)} /> {field.label}{field.required ? " *" : ""}</label>
                            ) : <>
                              <Label htmlFor={id}>{field.label}{percent ? " (%)" : ""}{field.required ? " *" : ""}</Label>
                              {field.input_type === "select" ? (
                                <select id={id} className={CONTROL_CLASS} value={String(value)} disabled={disabled || optionState?.loading || optionState?.error != null || optionState == null} aria-invalid={error != null} onChange={(event) => replaceCell(group.name, rowIndex, field.name, event.target.value)}>
                                  <option value="">{optionState?.loading ? "Cargando opciones..." : "Selecciona una opción"}</option>
                                  {(optionState?.options ?? []).map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                                </select>
                              ) : (
                                <Input id={id} type={field.input_type === "datetime" ? "datetime-local" : field.input_type} step={field.data_type === "decimal" ? "any" : undefined} min={constraints.minimum} max={constraints.maximum} value={String(value)} disabled={disabled} aria-invalid={error != null} onChange={(event) => replaceCell(group.name, rowIndex, field.name, event.target.value)} />
                              )}
                            </>}
                            {optionState?.error && <p className="text-xs text-destructive">{optionState.error}</p>}
                            {optionState && !optionState.loading && optionState.error == null && optionState.options.length === 0 && <p className="text-xs text-muted-foreground">No hay opciones disponibles.</p>}
                            {error && <p className="text-xs text-destructive">{error}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
