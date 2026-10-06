import {
  PARAMETER_NAME_PATTERN,
  uniqueParameterName,
  withParameterShape,
  type ReportParameterKind,
} from "@/lib/reports/report-parameter-kinds";
import { toParameterGroupsRequest } from "@/lib/reports/report-builder";
import type {
  ReportAdminDefinition,
  ReportCreateRequest,
  ReportDataSource,
  ReportInputsUpdateRequest,
  ReportParameter,
  ReportParameterGroup,
  ReportParameterDataType,
  ReportParameterInputType,
  ReportUpdateRequest,
} from "@/types/api";

export const INPUTS_BY_DATA_TYPE: Record<ReportParameterDataType, ReportParameterInputType[]> = {
  string: ["text", "select"],
  integer: ["number", "select"],
  decimal: ["number", "select"],
  boolean: ["checkbox", "select"],
  date: ["date", "select"],
  datetime: ["datetime", "select"],
};

/** XLSX naming is deliberately absent: the backend owns download filenames. */
export interface ReportFormValue {
  code: string;
  name: string;
  description: string;
  category: string;
  data_source_id: number | null;
  enabled: boolean;
  parameters: ReportParameter[];
}

export function parametersFromDataSource(source: ReportDataSource): ReportParameter[] {
  return source.parameters.map((parameter) => ({
    ...parameter,
    configuration_json: parameter.configuration_json
      ? { ...parameter.configuration_json }
      : null,
  }));
}

/**
 * Names the data source owns. Backend #33 is authoritative for their technical
 * contract (name, data/input type, requiredness and options source), while the
 * report remains free to declare manual parameters on top — that split is what
 * lets a quotation ask for Cliente or IVA % beside `price_list_id`.
 */
export function sourceParameterNames(source: ReportDataSource | null): string[] {
  return source ? source.parameters.map((parameter) => parameter.name) : [];
}

export function isSourceParameter(name: string, sourceNames: readonly string[]): boolean {
  return sourceNames.includes(name);
}

/**
 * Re-seeds the source half of the list while keeping every manual parameter.
 * The source contract always comes first so the runtime form reads top-down.
 */
export function mergeSourceParameters(
  parameters: ReportParameter[],
  source: ReportDataSource,
  previousSourceNames: readonly string[] = [],
): ReportParameter[] {
  const contract = parametersFromDataSource(source);
  const contractNames = new Set(contract.map((parameter) => parameter.name));
  const manual = parameters.filter(
    (parameter) => !contractNames.has(parameter.name) && !previousSourceNames.includes(parameter.name),
  );
  return [...contract, ...manual].map((parameter, display_order) => ({ ...parameter, display_order }));
}

/**
 * Ready-made general parameters for a quotation-shaped report. They are plain
 * report parameters with no backend meaning: the admin can rename, reorder or
 * delete any of them, and nothing here binds the builder to one customer. Their
 * technical shape comes from the same kind mapping the editor uses, and their
 * well-known internal names never follow a label edit.
 */
export interface ReportParameterPreset {
  key: string;
  label: string;
  parameter: Omit<ReportParameter, "display_order">;
}

function preset(
  name: string,
  label: string,
  kind: ReportParameterKind,
  decimals = false,
): ReportParameterPreset {
  const shaped = withParameterShape({ ...emptyParameter(0), name, label }, kind, decimals);
  return {
    key: name,
    label,
    parameter: {
      name,
      label,
      data_type: shaped.data_type,
      input_type: shaped.input_type,
      required: false,
      default_value: null,
      configuration_json: shaped.configuration_json,
    },
  };
}

export const REPORT_PARAMETER_PRESETS: ReportParameterPreset[] = [
  preset("customer_name", "Cliente", "text"),
  preset("customer_email", "Email", "text"),
  preset("attention_to", "Atención", "text"),
  preset("requisition", "Requisición", "text"),
  preset("quotation_date", "Fecha", "date"),
  preset("commercial_conditions", "Condiciones", "text"),
  preset("tax_rate", "IVA %", "number", true),
];

/** Appends a preset under a name no other parameter is using. */
export function appendPresetParameter(
  parameters: ReportParameter[],
  presetKey: string,
): ReportParameter[] {
  const found = REPORT_PARAMETER_PRESETS.find((candidate) => candidate.key === presetKey);
  if (!found) return parameters;
  const name = uniqueParameterName(found.parameter.name, parameters.map((parameter) => parameter.name));
  return [...parameters, { ...found.parameter, name, display_order: parameters.length }];
}

/** A new "Texto" input; its internal name is generated once the admin types a visible name. */
export function emptyParameter(displayOrder: number): ReportParameter {
  return {
    name: "",
    label: "",
    data_type: "string",
    input_type: "text",
    required: false,
    default_value: null,
    display_order: displayOrder,
    configuration_json: null,
  };
}

export function emptyReportForm(): ReportFormValue {
  return {
    code: "",
    name: "",
    description: "",
    category: "",
    data_source_id: null,
    enabled: true,
    parameters: [],
  };
}

export function reportFormFromDefinition(report: ReportAdminDefinition): ReportFormValue {
  return {
    code: report.code,
    name: report.name,
    description: report.description ?? "",
    category: report.category ?? "",
    data_source_id: report.data_source_id,
    enabled: report.enabled,
    parameters: report.parameters.map((parameter) => ({ ...parameter })),
  };
}

export function normalizeReportCode(value: string): string {
  return value.trim().replaceAll("-", "_").replace(/\s+/g, "_").toUpperCase();
}

export function validateReportForm(
  value: ReportFormValue,
  creating: boolean,
  source: ReportDataSource | null = null,
): string[] {
  const errors: string[] = [];
  const code = normalizeReportCode(value.code);
  if (creating && !/^[A-Z][A-Z0-9_]*$/.test(code)) {
    errors.push("El código debe iniciar con una letra y contener solo letras, números o _. ");
  }
  if (!value.name.trim()) errors.push("El nombre es requerido.");
  if (value.data_source_id == null || value.data_source_id <= 0) {
    errors.push("Selecciona una fuente de datos.");
  }

  const names = new Set<string>();
  for (const [index, parameter] of value.parameters.entries()) {
    const position = index + 1;
    const label = parameter.label.trim();
    const display = label || parameter.name || String(position);
    if (!label) {
      errors.push(`El dato ${position} necesita un nombre visible.`);
    } else if (!PARAMETER_NAME_PATTERN.test(parameter.name)) {
      errors.push(`El nombre interno del dato '${display}' no es válido.`);
    }
    const folded = parameter.name.toLocaleLowerCase();
    if (folded && names.has(folded)) errors.push(`El dato '${display}' está duplicado.`);
    names.add(folded);
    if (!INPUTS_BY_DATA_TYPE[parameter.data_type].includes(parameter.input_type)) {
      errors.push(`El tipo de entrada de '${display}' no es compatible con su tipo de dato.`);
    }
    if (parameter.input_type === "select" && parameter.configuration_json == null) {
      errors.push(`La lista de '${display}' no tiene un origen de opciones.`);
    }
  }

  // Source-owned technical metadata must remain exactly as the backend sent it;
  // manual parameters are still allowed in addition to this contract.
  for (const expected of source?.parameters ?? []) {
    const declared = value.parameters.find((parameter) => parameter.name === expected.name);
    if (!declared) {
      errors.push(`La fuente requiere el parámetro '${expected.name}'.`);
      continue;
    }
    if (declared.data_type !== expected.data_type) {
      errors.push(`El tipo de '${expected.name}' no coincide con el contrato de la fuente.`);
    }
    if (declared.input_type !== expected.input_type) {
      errors.push(`El control de '${expected.name}' no coincide con el contrato de la fuente.`);
    }
    if (declared.required !== expected.required) {
      errors.push(`La obligatoriedad de '${expected.name}' no coincide con el contrato de la fuente.`);
    }
    if (
      declared.configuration_json?.options_source
      !== expected.configuration_json?.options_source
    ) {
      errors.push(`La fuente de opciones de '${expected.name}' no coincide con el contrato de la fuente.`);
    }
  }
  return errors;
}

function normalizedParameters(parameters: ReportParameter[]): ReportParameter[] {
  return parameters.map((parameter, display_order) => ({
    ...parameter,
    name: parameter.name.trim(),
    label: parameter.label.trim(),
    display_order,
    configuration_json: parameter.input_type === "select" ? parameter.configuration_json : null,
  }));
}

export function toReportRequest(value: ReportFormValue): ReportCreateRequest {
  return {
    code: normalizeReportCode(value.code),
    name: value.name.trim(),
    description: value.description.trim() || null,
    category: value.category.trim() || null,
    data_source_id: value.data_source_id as number,
    enabled: value.enabled,
    parameters: normalizedParameters(value.parameters),
  };
}

export function toReportUpdate(value: ReportFormValue): ReportUpdateRequest {
  const request = toReportRequest(value);
  return {
    name: request.name,
    description: request.description,
    category: request.category,
    data_source_id: request.data_source_id,
    enabled: value.enabled,
    parameters: request.parameters,
  };
}

export function toReportInputsUpdate(
  value: ReportFormValue,
  parameterGroups: ReportParameterGroup[],
): ReportInputsUpdateRequest {
  return { ...toReportUpdate(value), parameter_groups: toParameterGroupsRequest(parameterGroups) };
}

export function coerceRuntimeValue(parameter: ReportParameter, raw: string | boolean): unknown {
  if (typeof raw === "boolean") return raw;
  if (raw === "") return undefined;
  if (parameter.data_type === "integer") return Number.parseInt(raw, 10);
  if (parameter.data_type === "boolean") return raw === "true" || raw === "1";
  return raw;
}
