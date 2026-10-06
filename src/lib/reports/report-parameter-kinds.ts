import type {
  ReportParameter,
  ReportParameterDataType,
  ReportParameterInputType,
  ReportScalarOptionsSource,
} from "@/types/api";

/**
 * The business vocabulary an administrator uses to describe a report input
 * (Frontend #38). It is the single frontend source of truth for turning one
 * "Tipo de entrada" into the backend's `data_type` / `input_type` /
 * `configuration_json` triple — the contract itself is unchanged.
 *
 * Every list kind is an integer `select`: the backend option sources answer
 * with numeric ids, so a `date`/`boolean`/`datetime` select could be saved but
 * would fail at execution. Those combinations simply cannot be produced here.
 */
export type ReportParameterKind =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "price_list"
  | "supplier"
  | "product";

export interface ReportParameterKindDefinition {
  kind: ReportParameterKind;
  label: string;
  data_type: ReportParameterDataType;
  input_type: ReportParameterInputType;
  options_source: ReportScalarOptionsSource | null;
}

export const REPORT_PARAMETER_KINDS: readonly ReportParameterKindDefinition[] = [
  { kind: "text", label: "Texto", data_type: "string", input_type: "text", options_source: null },
  { kind: "number", label: "Número", data_type: "integer", input_type: "number", options_source: null },
  { kind: "date", label: "Fecha", data_type: "date", input_type: "date", options_source: null },
  { kind: "datetime", label: "Fecha y hora", data_type: "datetime", input_type: "datetime", options_source: null },
  { kind: "boolean", label: "Sí / No", data_type: "boolean", input_type: "checkbox", options_source: null },
  { kind: "price_list", label: "Lista de precios", data_type: "integer", input_type: "select", options_source: "price_lists" },
  { kind: "supplier", label: "Proveedor", data_type: "integer", input_type: "select", options_source: "suppliers" },
  { kind: "product", label: "Producto", data_type: "integer", input_type: "select", options_source: "products" },
];

/** What a parameter *is* in business terms; `decimals` only matters for "number". */
export interface ReportParameterShape {
  kind: ReportParameterKind;
  decimals: boolean;
}

/** Label shown for a saved parameter that matches none of the kinds above. */
export const LEGACY_PARAMETER_KIND_LABEL = "Personalizado (anterior)";

function kindDefinition(kind: ReportParameterKind): ReportParameterKindDefinition {
  const definition = REPORT_PARAMETER_KINDS.find((candidate) => candidate.kind === kind);
  if (!definition) throw new Error(`Unknown report parameter kind: ${kind}`);
  return definition;
}

function hasNoConfiguration(configuration: ReportParameter["configuration_json"]): boolean {
  return configuration == null || Object.keys(configuration).length === 0;
}

/**
 * Reads a parameter back into a business kind, or `null` when its stored
 * combination is not one this editor would produce (a legacy "Personalizado").
 * Matching is exact on purpose: a near miss is never reinterpreted.
 */
export function parameterShapeOf(parameter: ReportParameter): ReportParameterShape | null {
  const configuration = parameter.configuration_json;
  if (parameter.input_type === "select") {
    if (parameter.data_type !== "integer" || configuration == null) return null;
    const keys = Object.keys(configuration);
    if (keys.length !== 1 || keys[0] !== "options_source") return null;
    const definition = REPORT_PARAMETER_KINDS.find(
      (candidate) => candidate.options_source != null && candidate.options_source === configuration.options_source,
    );
    return definition ? { kind: definition.kind, decimals: false } : null;
  }
  if (!hasNoConfiguration(configuration)) return null;
  if (parameter.data_type === "decimal" && parameter.input_type === "number") {
    return { kind: "number", decimals: true };
  }
  const definition = REPORT_PARAMETER_KINDS.find((candidate) =>
    candidate.options_source == null
    && candidate.data_type === parameter.data_type
    && candidate.input_type === parameter.input_type,
  );
  return definition ? { kind: definition.kind, decimals: false } : null;
}

function isIntegerLiteral(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value);
  return typeof value === "string" && /^[+-]?\d+$/.test(value.trim());
}

/**
 * Rewrites the technical triple for a new kind. The default value is cleared
 * whenever the kind changes — no coercion is attempted — except when only
 * "Permitir decimales" flips: an integer default stays valid either way, a
 * fractional one is dropped when decimals are turned off.
 */
export function withParameterShape(
  parameter: ReportParameter,
  kind: ReportParameterKind,
  decimals = false,
): ReportParameter {
  const definition = kindDefinition(kind);
  const useDecimals = kind === "number" && decimals;
  const current = parameterShapeOf(parameter);
  if (current?.kind === kind && current.decimals === useDecimals) return parameter;

  const keepsDefault = current?.kind === "number" && kind === "number"
    && parameter.default_value != null
    && (useDecimals || isIntegerLiteral(parameter.default_value));

  return {
    ...parameter,
    data_type: useDecimals ? "decimal" : definition.data_type,
    input_type: definition.input_type,
    configuration_json: definition.options_source ? { options_source: definition.options_source } : null,
    default_value: keepsDefault ? parameter.default_value : null,
  };
}

export const PARAMETER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Well under the backend's 100-character cap, leaving room for a `_N` suffix. */
const MAX_GENERATED_NAME_LENGTH = 60;

/** `Fecha de entrega` → `fecha_de_entrega`, `IVA %` → `iva`, `Año` → `ano`. */
export function parameterNameBase(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_GENERATED_NAME_LENGTH)
    .replace(/_+$/g, "");
  if (!slug) return "dato";
  return /^[a-z]/.test(slug) ? slug : `dato_${slug}`;
}

/** First of `base`, `base_2`, `base_3`… not taken, compared case-insensitively like the backend. */
export function uniqueParameterName(base: string, taken: Iterable<string>): string {
  const folded = new Set([...taken].map((name) => name.toLocaleLowerCase()));
  if (!folded.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!folded.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/** Whether `name` is still the one generated from `label` (and so may follow it). */
function isGeneratedName(parameter: ReportParameter): boolean {
  if (parameter.name === "") return true;
  const base = parameterNameBase(parameter.label);
  return parameter.name === base || new RegExp(`^${base}_\\d+$`).test(parameter.name);
}

/**
 * Changes the visible name. The internal `name` follows it only while the
 * parameter has never been saved *and* still carries a generated name: a saved
 * name is referenced by columns, formulas, summaries and Excel placeholders
 * (`{{parameters.<name>}}`), and a preset keeps its own well-known name.
 */
export function relabelParameter(
  parameter: ReportParameter,
  label: string,
  options: { locked: boolean; takenNames: Iterable<string> },
): ReportParameter {
  if (options.locked || !isGeneratedName(parameter)) return { ...parameter, label };
  return {
    ...parameter,
    label,
    name: label.trim() ? uniqueParameterName(parameterNameBase(label), options.takenNames) : "",
  };
}
