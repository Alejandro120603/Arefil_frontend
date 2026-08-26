"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  allowedFormulaReferences,
  formulaReferences,
  isNumericDataType,
} from "@/lib/reports/report-builder";
import type { ReportColumn, ReportParameter } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * The operators Backend #12's parser accepts. There is deliberately no free
 * JavaScript here and nothing is ever `eval`'d: the expression is a plain
 * string the backend tokenizes, parses and evaluates with exact Decimals.
 */
const OPERATORS = ["+", "-", "*", "/", "%", "(", ")"] as const;

/**
 * Controlled formula editor. It offers only references the backend will accept
 * and flags unknown ones inline, but it does not pretend to be the validator —
 * syntax, cycles and division by zero are reported by the backend on save.
 */
export function ReportFormulaInput({
  index,
  column,
  columns,
  parameters,
  disabled = false,
  onChange,
}: {
  index: number;
  column: ReportColumn;
  columns: ReportColumn[];
  parameters: ReportParameter[];
  disabled?: boolean;
  onChange: (formula: string) => void;
}) {
  const formula = column.formula_definition ?? "";
  const references = allowedFormulaReferences(columns, parameters, column.key);
  const known = new Map(references.map((reference) => [reference.name, reference]));
  const unknown = formulaReferences(formula).filter((reference) => !known.has(reference));
  const inputId = `column-formula-${index}`;

  function append(token: string) {
    const separator = formula.length === 0 || formula.endsWith(" ") ? "" : " ";
    onChange(`${formula}${separator}${token} `);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <Label htmlFor={inputId}>Fórmula</Label>
      <Input
        id={inputId}
        className="font-mono"
        value={formula}
        spellCheck={false}
        placeholder="price * quantity"
        disabled={disabled}
        aria-invalid={unknown.length > 0}
        aria-describedby={unknown.length > 0 ? `${inputId}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-52 gap-1.5">
          <Label htmlFor={`${inputId}-reference`} className="text-xs font-normal text-muted-foreground">
            Insertar referencia
          </Label>
          <select
            id={`${inputId}-reference`}
            className={CONTROL_CLASS}
            value=""
            disabled={disabled || references.length === 0}
            onChange={(event) => { if (event.target.value) append(event.target.value); event.target.value = ""; }}
          >
            <option value="">
              {references.length === 0 ? "Sin referencias numéricas" : "Columna o parámetro…"}
            </option>
            {references.map((reference) => (
              <option key={reference.name} value={reference.name}>
                {reference.label} · {reference.name}
                {reference.origin === "parameter" ? " (parámetro)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1">
          {OPERATORS.map((operator) => (
            <Button
              key={operator} type="button" size="sm" variant="outline" className="font-mono"
              aria-label={`Insertar ${operator}`} disabled={disabled} onClick={() => append(operator)}
            >{operator}</Button>
          ))}
          <Button
            type="button" size="sm" variant="outline" className="font-mono"
            aria-label="Insertar ROUND" disabled={disabled} onClick={() => append("ROUND(")}
          >ROUND</Button>
        </div>
      </div>

      {unknown.length > 0 ? (
        <p id={`${inputId}-error`} className="text-xs text-destructive">
          Referencias desconocidas: {unknown.join(", ")}. Usa una columna numérica o un parámetro numérico del reporte.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Operadores permitidos: + - * / % y ROUND(valor, decimales). El backend valida y calcula la fórmula.
        </p>
      )}

      {parameters.some((parameter) => !isNumericDataType(parameter.data_type)) && references.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Solo las columnas y parámetros numéricos (entero o decimal) pueden usarse en una fórmula.
        </p>
      )}
    </div>
  );
}
