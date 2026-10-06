import { formulaReferences, isNumericDataType, normalizeSummaries } from "@/lib/reports/report-builder";
import type {
  ReportBuilderDefinition,
  ReportParameter,
  ReportParameterGroup,
} from "@/types/api";

/**
 * What the saved builder already relies on in "Fuente y entradas" (Frontend
 * #41B). `PATCH /reports/{code}` re-validates the saved groups but never the
 * columns or formulas, so removing or retyping a parameter they use would be
 * accepted and only fail later. These rules catch it first, in business terms.
 *
 * Only the *persisted* builder counts: that is what a definition save can
 * break. Excel mappings (`{{parameters.<name>}}`) are not inspected — that
 * would need the template — and remain the backend's to report.
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
