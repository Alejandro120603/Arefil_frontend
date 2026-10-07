import { placeholderIdentity } from "@/lib/reports/report-excel-mapping";
import type {
  ReportColumn,
  ReportExcelTemplateInspection,
  ReportParameter,
  ReportSummaryConfiguration,
} from "@/types/api";

/**
 * What the active Excel template uses from the report contract (Frontend #43),
 * derived from `GET /excel-template/inspect` — never from the workbook bytes.
 *
 * The inspection only lists tokens that exist in the *persisted* contract, so
 * a template that is already incompatible (a legacy one, with a placeholder
 * that no longer exists) cannot be detected here. That is fine: these rules
 * are preventive UX, and Backend #37 stays the authority — it answers any
 * write that would orphan a placeholder with `422 ACTIVE_TEMPLATE_INCOMPATIBLE`.
 *
 * `report.*` is not tracked: its keys are fixed and no edit can remove them.
 */
export interface TemplatePlaceholderLocation {
  sheet: string;
  cell: string;
  /** The merge the cell belongs to, when it is part of one. */
  range: string | null;
  /** The bare `namespace.key`, e.g. `parameters.customer_name`. */
  placeholder: string;
}

export interface TemplateDependencies {
  parameters: ReadonlyMap<string, TemplatePlaceholderLocation[]>;
  rows: ReadonlyMap<string, TemplatePlaceholderLocation[]>;
  summary: ReadonlyMap<string, TemplatePlaceholderLocation[]>;
}

type TrackedNamespace = keyof TemplateDependencies;

const TRACKED: readonly TrackedNamespace[] = ["parameters", "rows", "summary"];

export const NO_TEMPLATE_DEPENDENCIES: TemplateDependencies = {
  parameters: new Map(),
  rows: new Map(),
  summary: new Map(),
};

export function templatePlaceholderDependencies(
  inspection: ReportExcelTemplateInspection | null | undefined,
): TemplateDependencies {
  if (inspection == null) return NO_TEMPLATE_DEPENDENCIES;
  const result: Record<TrackedNamespace, Map<string, TemplatePlaceholderLocation[]>> = {
    parameters: new Map(),
    rows: new Map(),
    summary: new Map(),
  };
  for (const sheet of inspection.sheets) {
    for (const cell of sheet.cells) {
      for (const token of cell.placeholders) {
        const identity = placeholderIdentity(token);
        if (identity == null || !TRACKED.includes(identity.namespace as TrackedNamespace)) continue;
        const map = result[identity.namespace as TrackedNamespace];
        const locations = map.get(identity.key) ?? [];
        locations.push({
          sheet: sheet.name,
          cell: cell.coordinate,
          range: cell.merged_range,
          placeholder: `${identity.namespace}.${identity.key}`,
        });
        map.set(identity.key, locations);
      }
    }
  }
  return result;
}

/** `Cotización!B2` — the address an Excel user would type. */
export function templateLocationLabel(location: Pick<TemplatePlaceholderLocation, "sheet" | "cell" | "range">): string {
  const target = location.cell || location.range;
  return target ? `${location.sheet}!${target}` : location.sheet;
}

/**
 * The identities a report state exposes to an XLSX template, mirroring the
 * backend's `TemplatePlaceholderContract`: parameter names, *visible* column
 * keys (hidden columns are not rendered) and summary keys.
 */
export interface TemplateContractState {
  parameters?: readonly ReportParameter[];
  columns?: readonly ReportColumn[];
  summaries?: readonly ReportSummaryConfiguration[];
}

export type TemplateDependencyKind = "parameter" | "column" | "summary";

export interface TemplateDependencyBlock {
  kind: TemplateDependencyKind;
  action: "remove" | "hide";
  key: string;
  label: string;
  locations: TemplatePlaceholderLocation[];
}

function quoted(label: string): string {
  return `"${label}"`;
}

/**
 * Every template-used identity that `before` exposes and `after` would no
 * longer expose. Changes that keep the identity — a new label, another
 * `source_field`, a format, a type, a different formula — never block here.
 * A namespace missing from `after` is treated as unchanged.
 */
export function templateDependencyBlocks(
  dependencies: TemplateDependencies,
  before: TemplateContractState,
  after: TemplateContractState,
): TemplateDependencyBlock[] {
  const blocks: TemplateDependencyBlock[] = [];

  if (before.parameters && after.parameters) {
    const remaining = new Set(after.parameters.map((parameter) => parameter.name));
    for (const parameter of before.parameters) {
      const locations = dependencies.parameters.get(parameter.name);
      if (!locations || remaining.has(parameter.name)) continue;
      blocks.push({ kind: "parameter", action: "remove", key: parameter.name, label: parameter.label || parameter.name, locations });
    }
  }

  if (before.columns && after.columns) {
    const next = new Map(after.columns.map((column) => [column.key, column]));
    for (const column of before.columns) {
      const locations = dependencies.rows.get(column.key);
      if (!locations || !column.visible) continue;
      const candidate = next.get(column.key);
      if (candidate?.visible) continue;
      blocks.push({
        kind: "column",
        action: candidate ? "hide" : "remove",
        key: column.key,
        label: column.label || column.key,
        locations,
      });
    }
  }

  if (before.summaries && after.summaries) {
    const remaining = new Set(after.summaries.map((summary) => summary.key));
    for (const summary of before.summaries) {
      const locations = dependencies.summary.get(summary.key);
      if (!locations || remaining.has(summary.key)) continue;
      blocks.push({ kind: "summary", action: "remove", key: summary.key, label: summary.label || summary.key, locations });
    }
  }
  return blocks;
}

/** The headline for one block, in business terms. */
export function templateDependencyTitle(block: TemplateDependencyBlock): string {
  if (block.kind === "column" && block.action === "hide") {
    return `No puedes ocultar ${quoted(block.label)} porque la plantilla Excel la utiliza.`;
  }
  if (block.kind === "summary") return `No puedes quitar ${quoted(block.label)} porque la plantilla Excel lo utiliza.`;
  return `No puedes quitar ${quoted(block.label)}.`;
}

/** What the admin has to do about it. */
export function templateDependencyHint(block: TemplateDependencyBlock): string {
  if (block.kind === "parameter") return "La plantilla Excel utiliza este dato. Primero quítalo o reemplázalo en la plantilla.";
  if (block.kind === "column") {
    return block.action === "hide"
      ? "Primero quítala o reemplázala en la plantilla."
      : "La plantilla Excel utiliza esta columna. Primero quítala o reemplázala en la plantilla.";
  }
  return "Primero quítalo o reemplázalo en la plantilla.";
}

/** One line for lists that already exist elsewhere (the datasource-change block, form validation). */
export function templateDependencyMessage(block: TemplateDependencyBlock): string {
  const where = block.locations.map(templateLocationLabel).join(", ");
  const noun = block.kind === "parameter" ? "el dato" : block.kind === "column" ? "la columna" : "el total";
  return `Plantilla Excel — usa ${noun} ${quoted(block.label)} en ${where}, que se quitaría.`;
}
