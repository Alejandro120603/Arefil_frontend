import { formulaReferences, isNumericDataType, normalizeSummaries } from "@/lib/reports/report-builder";
import type {
  ReportBuilderDefinition,
  ReportDataSource,
  ReportParameter,
  ReportParameterGroup,
} from "@/types/api";

/**
 * What the saved builder already relies on in "Fuente y entradas" (Frontend
 * #41B). `PATCH /reports/{code}` re-validates the saved groups but never the
 * columns or formulas, so removing or retyping a parameter they use would be
 * accepted and only fail later. These rules catch it first, in business terms.
 *
 * Only the *persisted* builder counts: that is what an inputs save can break.
 * Excel mappings (`{{parameters.<name>}}` / `{{rows.<name>}}`) are not
 * inspected by this screen or Backend #36; mapping protection remains a
 * separate follow-up.
 */
interface ParameterRequirement {
  name: string;
  /** "la columna "Cliente"", "el cálculo "Subtotal""… */
  usage: string;
  /** Whether a parameter with this shape still satisfies the dependant. */
  accepts: (parameter: ReportParameter) => boolean;
  kind: "column" | "formula" | "group";
}

function quoted(label: string): string {
  return `"${label}"`;
}

function priceListSource(parameter: ReportParameter): unknown {
  return (parameter.configuration_json as Record<string, unknown> | null)?.options_source;
}

function requirements(
  persisted: ReportBuilderDefinition | null,
  groups: ReportParameterGroup[],
  parameters: ReportParameter[],
): ParameterRequirement[] {
  const result: ParameterRequirement[] = [];
  const columns = persisted?.columns ?? [];
  const columnKeys = new Set(columns.map((column) => column.key));

  for (const column of columns) {
    const label = column.label || column.key;
    if (column.column_type === "PARAMETER" && column.source_parameter && !column.source_parameter.includes(".")) {
      result.push({
        name: column.source_parameter,
        usage: `la columna ${quoted(label)}`,
        kind: "column",
        // The backend compares the column's data type with its parameter's.
        accepts: (parameter) => parameter.data_type === column.data_type,
      });
    }
    if (column.column_type === "FORMULA") {
      for (const reference of formulaReferences(column.formula_definition ?? "")) {
        // A column with that key wins over a parameter in the formula's scope.
        if (columnKeys.has(reference)) continue;
        result.push({ name: reference, usage: `el cálculo ${quoted(label)}`, kind: "formula", accepts: (parameter) => isNumericDataType(parameter.data_type) });
      }
    }
  }

  const summaries = normalizeSummaries(persisted?.excel_layout?.totals ?? [], columns);
  const summaryKeys = new Set(summaries.map((summary) => summary.key));
  for (const summary of summaries) {
    if (summary.operation !== "FORMULA") continue;
    for (const reference of formulaReferences(summary.formula_definition ?? "")) {
      if (summaryKeys.has(reference)) continue;
      result.push({ name: reference, usage: `el total ${quoted(summary.label || summary.key)}`, kind: "formula", accepts: (parameter) => isNumericDataType(parameter.data_type) });
    }
  }

  for (const group of groups) {
    const current = parameters.find((parameter) => parameter.name === group.context_parameter);
    const wasPriceList = current != null && priceListSource(current) === "price_lists";
    result.push({
      name: group.context_parameter,
      usage: "los productos por renglón",
      kind: "group",
      // Integer is the backend rule; a price list must stay a price list, or
      // the products would be looked up with an unrelated id.
      accepts: (parameter) => parameter.data_type === "integer" && (!wasPriceList || priceListSource(parameter) === "price_lists"),
    });
  }
  return result;
}

function blockMessage(requirement: ParameterRequirement, label: string, removed: boolean): string {
  if (requirement.kind === "group") return `${quoted(label)} se utiliza para seleccionar los productos por renglón.`;
  return removed
    ? `No puedes quitar ${quoted(label)} porque se utiliza en ${requirement.usage}.`
    : `No puedes cambiar el tipo de ${quoted(label)} porque se utiliza en ${requirement.usage}.`;
}

/**
 * Every dependency `next` would break, as human messages. `labelsFrom` names
 * a parameter that `next` no longer has (the list before the change).
 */
export function parameterDependencyErrors(
  next: ReportParameter[],
  context: { persisted: ReportBuilderDefinition | null; groups: ReportParameterGroup[]; labelsFrom: ReportParameter[] },
): string[] {
  const byName = new Map(next.map((parameter) => [parameter.name, parameter]));
  const labels = new Map([...context.labelsFrom, ...next].map((parameter) => [parameter.name, parameter.label || parameter.name]));
  const errors: string[] = [];
  for (const requirement of requirements(context.persisted, context.groups, context.labelsFrom)) {
    // A reference that never was a parameter (a typo the builder already
    // reports, or a summary key) is not this screen's to protect.
    if (!labels.has(requirement.name)) continue;
    const parameter = byName.get(requirement.name);
    if (parameter && requirement.accepts(parameter)) continue;
    const message = blockMessage(requirement, labels.get(requirement.name)!, parameter == null);
    if (!errors.includes(message)) errors.push(message);
  }
  return errors;
}

/**
 * The change from `previous` to `next` is refused when it breaks a
 * dependency that `previous` still satisfied. Returns the first message.
 */
export function blockedParameterChange(
  previous: ReportParameter[],
  next: ReportParameter[],
  persisted: ReportBuilderDefinition | null,
  groups: ReportParameterGroup[],
): string | null {
  const before = new Set(parameterDependencyErrors(previous, { persisted, groups, labelsFrom: previous }));
  const after = parameterDependencyErrors(next, { persisted, groups, labelsFrom: previous });
  return after.find((message) => !before.has(message)) ?? null;
}

/** `grupo.campo` → title of the first saved column that shows it. */
export function groupFieldUsages(persisted: ReportBuilderDefinition | null): Map<string, string> {
  const usages = new Map<string, string>();
  for (const column of persisted?.columns ?? []) {
    if (column.column_type !== "PARAMETER" || !column.source_parameter?.includes(".")) continue;
    if (!usages.has(column.source_parameter)) usages.set(column.source_parameter, column.label || column.key);
  }
  return usages;
}

function sourceChangeMessage(kind: "Columna" | "Cálculo" | "Total", label: string, reason: string): string {
  return `${kind} ${quoted(label)} — ${reason}`;
}

/**
 * Human-facing reasons why the persisted builder cannot survive an inputs
 * change. FIELD compatibility comes from the target source metadata; formulas
 * reuse the builder parser and follow invalid persisted columns transitively.
 * XLSX mappings are deliberately outside this check.
 */
export function sourceChangeDependencyErrors({
  persisted,
  targetSource,
  parameters,
  groups,
}: {
  persisted: ReportBuilderDefinition | null;
  targetSource: ReportDataSource;
  parameters: ReportParameter[];
  groups: ReportParameterGroup[];
}): string[] {
  if (persisted == null) return [];
  const messages: string[] = [];
  const add = (message: string) => { if (!messages.includes(message)) messages.push(message); };
  const parametersByName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  const groupedByName = new Map<string, { field: ReportParameterGroup["fields"][number]; group: ReportParameterGroup }>(groups.flatMap((group) => group.fields.map((field) => [
    `${group.name}.${field.name}`,
    { field, group },
  ] as const)));
  const fieldsByKey = new Map(targetSource.fields.map((field) => [field.key, field]));
  const columnsByKey = new Map(persisted.columns.map((column) => [column.key, column]));
  const invalidColumns = new Set<string>();

  for (const column of persisted.columns) {
    const label = column.label || column.key;
    if (column.column_type === "FIELD") {
      const field = fieldsByKey.get(column.source_field ?? "");
      if (field == null) {
        invalidColumns.add(column.key);
        add(sourceChangeMessage("Columna", label, "ese dato no existe en la nueva fuente."));
      } else if (field.data_type !== column.data_type) {
        invalidColumns.add(column.key);
        add(sourceChangeMessage("Columna", label, "ese dato cambia a un tipo incompatible en la nueva fuente."));
      }
      continue;
    }
    if (column.column_type !== "PARAMETER") continue;
    const source = column.source_parameter ?? "";
    if (source.includes(".")) {
      const grouped = groupedByName.get(source);
      if (grouped == null) {
        invalidColumns.add(column.key);
        add(sourceChangeMessage("Columna", label, "usa Productos por renglón, que se quitarán."));
      } else if (grouped.field.data_type !== column.data_type) {
        invalidColumns.add(column.key);
        add(sourceChangeMessage("Columna", label, `usa ${quoted(grouped.field.label || grouped.field.name)} con un tipo incompatible.`));
      }
      continue;
    }
    const parameter = parametersByName.get(source);
    if (parameter == null) {
      invalidColumns.add(column.key);
      const previous = persisted.report.parameters.find((item) => item.name === source);
      add(sourceChangeMessage("Columna", label, `usa el dato ${quoted(previous?.label || source)}, que se quitará.`));
    } else if (parameter.data_type !== column.data_type) {
      invalidColumns.add(column.key);
      add(sourceChangeMessage("Columna", label, `usa el dato ${quoted(parameter.label || parameter.name)} con un tipo incompatible.`));
    }
  }

  for (const column of persisted.columns) {
    if (column.column_type !== "FORMULA") continue;
    const label = column.label || column.key;
    for (const reference of formulaReferences(column.formula_definition ?? "")) {
      const referencedColumn = columnsByKey.get(reference);
      if (referencedColumn != null) {
        if (invalidColumns.has(reference)) {
          add(sourceChangeMessage("Cálculo", label, `depende de la columna ${quoted(referencedColumn.label || referencedColumn.key)}, que deja de ser válida.`));
        } else if (!isNumericDataType(referencedColumn.data_type)) {
          add(sourceChangeMessage("Cálculo", label, `depende de la columna no numérica ${quoted(referencedColumn.label || referencedColumn.key)}.`));
        }
        continue;
      }
      const parameter = parametersByName.get(reference);
      if (parameter == null) {
        const previous = persisted.report.parameters.find((item) => item.name === reference);
        add(sourceChangeMessage("Cálculo", label, `usa el dato ${quoted(previous?.label || reference)}, que se quitará.`));
      } else if (!isNumericDataType(parameter.data_type)) {
        add(sourceChangeMessage("Cálculo", label, `usa el dato no numérico ${quoted(parameter.label || parameter.name)}.`));
      }
    }
  }

  const summaries = normalizeSummaries(persisted.excel_layout?.totals ?? [], persisted.columns);
  const summaryKeys = new Set(summaries.map((summary) => summary.key));
  for (const summary of summaries) {
    const label = summary.label || summary.key;
    if (summary.operation === "SUM") {
      const column = columnsByKey.get(summary.column_key ?? "");
      if (column == null || invalidColumns.has(column.key)) {
        add(sourceChangeMessage("Total", label, `depende de la columna ${quoted(column?.label || summary.column_key || "desconocida")}, que deja de ser válida.`));
      }
      continue;
    }
    for (const reference of formulaReferences(summary.formula_definition ?? "")) {
      if (summaryKeys.has(reference)) continue;
      const column = columnsByKey.get(reference);
      if (column != null) {
        if (invalidColumns.has(reference)) {
          add(sourceChangeMessage("Total", label, `depende de la columna ${quoted(column.label || column.key)}, que deja de ser válida.`));
        } else if (!isNumericDataType(column.data_type)) {
          add(sourceChangeMessage("Total", label, `depende de la columna no numérica ${quoted(column.label || column.key)}.`));
        }
        continue;
      }
      const parameter = parametersByName.get(reference);
      if (parameter == null) {
        const previous = persisted.report.parameters.find((item) => item.name === reference);
        add(sourceChangeMessage("Total", label, `usa el dato ${quoted(previous?.label || reference)}, que se quitará.`));
      } else if (!isNumericDataType(parameter.data_type)) {
        add(sourceChangeMessage("Total", label, `usa el dato no numérico ${quoted(parameter.label || parameter.name)}.`));
      }
    }
  }
  return messages;
}
