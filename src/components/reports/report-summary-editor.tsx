"use client";

import { ArrowDown, ArrowUp, Sigma, Trash2 } from "lucide-react";
import { ReportFormulaExpressionInput } from "@/components/reports/report-formula-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FORMAT_TYPE_LABELS,
  allowedSummaryReferences,
  moveSummary,
  newFormulaSummary,
  newSumSummary,
  retypeSummary,
  summableColumns,
} from "@/lib/reports/report-builder";
import type {
  ReportColumn,
  ReportFormatType,
  ReportParameter,
  ReportSummaryConfiguration,
} from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const SUMMARY_FORMATS: ReportFormatType[] = ["number", "currency", "percent", "text"];

/**
 * Report-level summaries (Backend #20): Subtotal folds a column with SUM, IVA
 * and Total are formulas over other summaries and numeric parameters. They are
 * computed once per report — never one repeated value per row.
 */
export function ReportSummaryEditor({
  summaries,
  columns,
  parameters,
  disabled = false,
  onChange,
}: {
  summaries: ReportSummaryConfiguration[];
  columns: ReportColumn[];
  parameters: ReportParameter[];
  disabled?: boolean;
  onChange: (summaries: ReportSummaryConfiguration[]) => void;
}) {
  const candidates = summableColumns(columns);

  function replace(index: number, next: ReportSummaryConfiguration) {
    onChange(summaries.map((summary, current) => (current === index ? next : summary)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-4">
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="summary-add-sum">Agregar suma de columna</Label>
          <select
            id="summary-add-sum"
            className={CONTROL_CLASS}
            value=""
            disabled={disabled || candidates.length === 0}
            onChange={(event) => {
              const column = candidates.find((candidate) => candidate.key === event.target.value);
              if (column) onChange([...summaries, newSumSummary(column, summaries)]);
              event.target.value = "";
            }}
          >
            <option value="">
              {candidates.length === 0 ? "Ninguna columna numérica visible" : "Selecciona una columna…"}
            </option>
            {candidates.map((column) => (
              <option key={column.key} value={column.key}>{column.label || column.key}</option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...summaries, newFormulaSummary(summaries)])}
        >
          <Sigma /> Agregar resumen calculado
        </Button>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Este reporte no declara resúmenes. Agrega un Subtotal como suma de una columna y calcula IVA y Total a
          partir de él.
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {summaries.map((summary, index) => (
            <li key={index} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{summary.label || summary.key || `Resumen ${index + 1}`}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {summary.operation === "SUM"
                      ? `SUM · ${summary.column_key ?? "sin columna"}`
                      : `Fórmula · ${summary.formula_definition?.trim() || "sin fórmula"}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button" size="icon-sm" variant="outline"
                    aria-label={`Mover ${summary.key || index + 1} arriba`}
                    disabled={disabled || index === 0}
                    onClick={() => onChange(moveSummary(summaries, index, -1))}
                  ><ArrowUp /></Button>
                  <Button
                    type="button" size="icon-sm" variant="outline"
                    aria-label={`Mover ${summary.key || index + 1} abajo`}
                    disabled={disabled || index === summaries.length - 1}
                    onClick={() => onChange(moveSummary(summaries, index, 1))}
                  ><ArrowDown /></Button>
                  <Button
                    type="button" size="icon-sm" variant="destructive"
                    aria-label={`Eliminar ${summary.key || index + 1}`}
                    disabled={disabled}
                    onClick={() => onChange(summaries.filter((_, current) => current !== index))}
                  ><Trash2 /></Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={`summary-label-${index}`}>Etiqueta</Label>
                  <Input
                    id={`summary-label-${index}`}
                    value={summary.label}
                    disabled={disabled}
                    onChange={(event) => replace(index, { ...summary, label: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`summary-key-${index}`}>Nombre interno</Label>
                  <Input
                    id={`summary-key-${index}`}
                    className="font-mono"
                    value={summary.key}
                    disabled={disabled}
                    onChange={(event) => replace(index, { ...summary, key: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`summary-operation-${index}`}>Origen</Label>
                  <select
                    id={`summary-operation-${index}`}
                    className={CONTROL_CLASS}
                    value={summary.operation}
                    disabled={disabled}
                    onChange={(event) => replace(
                      index,
                      retypeSummary(summary, event.target.value as ReportSummaryConfiguration["operation"], columns),
                    )}
                  >
                    <option value="SUM">Suma de columna</option>
                    <option value="FORMULA">Fórmula</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`summary-format-${index}`}>Formato</Label>
                  <select
                    id={`summary-format-${index}`}
                    className={CONTROL_CLASS}
                    value={summary.format_type ?? ""}
                    disabled={disabled}
                    onChange={(event) => replace(index, {
                      ...summary,
                      format_type: (event.target.value || null) as ReportFormatType | null,
                    })}
                  >
                    <option value="">Sin formato</option>
                    {SUMMARY_FORMATS.map((format) => (
                      <option key={format} value={format}>{FORMAT_TYPE_LABELS[format]}</option>
                    ))}
                  </select>
                </div>

                {summary.operation === "SUM" ? (
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label htmlFor={`summary-column-${index}`}>Columna a sumar</Label>
                    <select
                      id={`summary-column-${index}`}
                      className={CONTROL_CLASS}
                      value={summary.column_key ?? ""}
                      disabled={disabled || candidates.length === 0}
                      onChange={(event) => replace(index, { ...summary, column_key: event.target.value || null })}
                    >
                      <option value="">
                        {candidates.length === 0 ? "Ninguna columna numérica visible" : "Selecciona una columna…"}
                      </option>
                      {candidates.map((column) => (
                        <option key={column.key} value={column.key}>{column.label || column.key} · {column.key}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="md:col-span-2 xl:col-span-4">
                    <ReportFormulaExpressionInput
                      inputId={`summary-formula-${index}`}
                      formula={summary.formula_definition ?? ""}
                      references={allowedSummaryReferences(summaries, parameters, summary.key)}
                      placeholder="subtotal * tax_rate / 100"
                      hint="Un resumen solo puede leer otros resúmenes y parámetros numéricos del reporte."
                      disabled={disabled}
                      onChange={(formula) => replace(index, { ...summary, formula_definition: formula })}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
