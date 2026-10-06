import { parameterNameBase, uniqueParameterName } from "@/lib/reports/report-parameter-kinds";
import type {
  ReportNumericConfiguration,
  ReportParameter,
  ReportParameterGroup,
  ReportParameterGroupField,
} from "@/types/api";

/**
 * Business vocabulary for repeatable rows (Frontend #40). A row always has one
 * "Producto" (the `products_by_price_list` select the backend requires) plus
 * simple "Texto" / "Número" inputs. This module turns those words into the
 * `data_type` / `input_type` / `configuration_json` the backend validates in
 * `services/reports/repeatable.py`; the contract itself is unchanged.
 */
export type GroupFieldKind = "product" | "text" | "number";

export interface GroupFieldShape {
  kind: GroupFieldKind;
  decimals: boolean;
}

export const PRODUCTS_OPTIONS_SOURCE = "products_by_price_list";

/** Name of the product subfield in every group this editor creates. */
const PRODUCT_FIELD_NAME = "product_id";

const NUMERIC_CONFIGURATION_KEYS = ["minimum", "maximum", "exclusive_minimum", "exclusive_maximum"];

function isEmptyConfiguration(configuration: ReportParameterGroupField["configuration_json"]): boolean {
  return configuration == null || Object.keys(configuration).length === 0;
}

/**
 * Reads a subfield back into a business kind, or `null` for a stored
 * combination this editor would not produce (shown as "Personalizado
 * (anterior)" and resent untouched). Matching is exact: a near miss is never
 * reinterpreted.
 */
export function groupFieldShapeOf(field: ReportParameterGroupField): GroupFieldShape | null {
  const configuration = field.configuration_json;
  if (field.input_type === "select") {
    const options = configuration as Record<string, unknown> | null;
    return field.data_type === "integer" && options?.options_source === PRODUCTS_OPTIONS_SOURCE
      ? { kind: "product", decimals: false }
      : null;
  }
  if (field.input_type === "text" && field.data_type === "string" && isEmptyConfiguration(configuration)) {
    return { kind: "text", decimals: false };
  }
  if (field.input_type === "number" && (field.data_type === "integer" || field.data_type === "decimal")) {
    const keys = Object.keys(configuration ?? {});
    if (keys.every((key) => NUMERIC_CONFIGURATION_KEYS.includes(key))) {
      return { kind: "number", decimals: field.data_type === "decimal" };
    }
  }
  return null;
}

function isIntegerLiteral(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value);
  return typeof value === "string" && /^[+-]?\d+$/.test(value.trim());
}

/**
 * Switches a simple subfield between "Texto" and "Número" (with or without
 * decimals). Changing kind clears the default and the limits; turning
 * decimals off keeps only the integer default/limits the backend accepts.
 */
export function withGroupFieldShape(
  field: ReportParameterGroupField,
  kind: Exclude<GroupFieldKind, "product">,
  decimals = false,
): ReportParameterGroupField {
  const current = groupFieldShapeOf(field);
  const useDecimals = kind === "number" && decimals;
  if (current?.kind === kind && current.decimals === useDecimals) return field;
  if (kind === "text") {
    return { ...field, data_type: "string", input_type: "text", configuration_json: null, default_value: null };
  }
  if (current?.kind !== "number") {
    return { ...field, data_type: useDecimals ? "decimal" : "integer", input_type: "number", configuration_json: {}, default_value: null };
  }
  const constraints = { ...(field.configuration_json as ReportNumericConfiguration | null) };
  if (!useDecimals) {
    if (constraints.minimum != null && !isIntegerLiteral(constraints.minimum)) delete constraints.minimum;
    if (constraints.maximum != null && !isIntegerLiteral(constraints.maximum)) delete constraints.maximum;
  }
  return {
    ...field,
    data_type: useDecimals ? "decimal" : "integer",
    configuration_json: constraints,
    default_value: useDecimals || isIntegerLiteral(field.default_value) ? field.default_value : null,
  };
}

/** Quick-add buttons. Cantidad/Descuento only pre-fill what a plain "Número" would ask for. */
export type GroupFieldPreset = "quantity" | "discount" | "number" | "text";

export const GROUP_FIELD_PRESET_LABELS: Record<GroupFieldPreset, string> = {
  quantity: "Cantidad",
  discount: "Descuento",
  number: "Número",
  text: "Texto",
};

export function newGroupField(
  preset: GroupFieldPreset,
  order: number,
  takenNames: Iterable<string>,
): ReportParameterGroupField {
  const label = GROUP_FIELD_PRESET_LABELS[preset];
  const base = {
    name: uniqueParameterName(parameterNameBase(label), takenNames),
    label,
    required: false,
    default_value: null,
    display_order: order,
  };
  switch (preset) {
    case "quantity":
      // Same shape as the seeded Cotización: a whole number greater than zero.
      return { ...base, data_type: "integer", input_type: "number", required: true, default_value: 1, configuration_json: { minimum: 0, exclusive_minimum: true } };
    case "discount":
      return { ...base, data_type: "decimal", input_type: "number", configuration_json: { minimum: 0 } };
    case "number":
      return { ...base, data_type: "integer", input_type: "number", configuration_json: {} };
    case "text":
      return { ...base, data_type: "string", input_type: "text", configuration_json: null };
  }
}

/**
 * Scalar parameters a product list can be filtered by: integer selects over
 * `price_lists`. The backend accepts any integer scalar as the context, so a
 * saved group pointing elsewhere is kept as-is (see `contextOptions`).
 */
export function priceListParameters(parameters: ReportParameter[]): ReportParameter[] {
  return parameters.filter((parameter) =>
    parameter.data_type === "integer"
    && parameter.input_type === "select"
    && (parameter.configuration_json as Record<string, unknown> | null)?.options_source === "price_lists",
  );
}

/** What the "Lista usada para productos" selector offers: the candidates plus a saved legacy context. */
export function contextOptions(parameters: ReportParameter[], current: string): ReportParameter[] {
  const candidates = priceListParameters(parameters);
  if (candidates.some((parameter) => parameter.name === current)) return candidates;
  const legacy = parameters.find((parameter) => parameter.name === current && parameter.data_type === "integer");
  return legacy ? [legacy, ...candidates] : candidates;
}

function productField(context: string): ReportParameterGroupField {
  return {
    name: PRODUCT_FIELD_NAME,
    label: "Producto",
    data_type: "integer",
    input_type: "select",
    required: true,
    default_value: null,
    display_order: 0,
    configuration_json: { options_source: PRODUCTS_OPTIONS_SOURCE, context_parameter: context },
  };
}

export function newProductField(context: string, order: number): ReportParameterGroupField {
  return { ...productField(context), display_order: order };
}

/** A new group: named after its visible name, never after a scalar parameter. */
export function newParameterGroup(parameters: ReportParameter[]): ReportParameterGroup {
  const [context] = priceListParameters(parameters);
  const label = "Productos";
  return {
    name: uniqueParameterName(parameterNameBase(label), parameters.map((parameter) => parameter.name)),
    label,
    resolver_key: PRODUCTS_OPTIONS_SOURCE,
    context_parameter: context?.name ?? "",
    min_items: 1,
    max_items: null,
    display_order: 0,
    fields: [productField(context?.name ?? "")],
  };
}

/** "Mayor que 0 · hasta 100" — what the collapsed "Límites" section already holds. */
export function limitsSummary(configuration: ReportNumericConfiguration): string | null {
  const parts: string[] = [];
  if (configuration.minimum != null && configuration.minimum !== "") {
    parts.push(`${configuration.exclusive_minimum ? "mayor que" : "desde"} ${configuration.minimum}`);
  }
  if (configuration.maximum != null && configuration.maximum !== "") {
    parts.push(`${configuration.exclusive_maximum ? "menor que" : "hasta"} ${configuration.maximum}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
