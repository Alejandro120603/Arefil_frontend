import type {
  ReportAdminDefinition,
  ReportCreateRequest,
  ReportDataSource,
  ReportParameter,
  ReportParameterDataType,
  ReportParameterInputType,
  ReportUpdateRequest,
} from "@/types/api";
import { validateFilenameTemplate } from "@/lib/reports/report-filename-template";

export const DATA_TYPES: ReportParameterDataType[] = [
  "string",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
];

export const INPUTS_BY_DATA_TYPE: Record<ReportParameterDataType, ReportParameterInputType[]> = {
  string: ["text", "select"],
  integer: ["number", "select"],
  decimal: ["number", "select"],
  boolean: ["checkbox", "select"],
  date: ["date", "select"],
  datetime: ["datetime", "select"],
};

export interface ReportFormValue {
  code: string;
  name: string;
  description: string;
  category: string;
  /** Empty string means "no pattern": the backend keeps its generic fallback. */
  filename_template: string;
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
 * Names the data source owns. Backend #20 stopped demanding an exact match
 * between the report and the source contract: the report must declare *at
 * least* these (with the same data type, and required when the source says
 * so), and is free to declare its own on top — that split is what lets a
 * quotation ask for Cliente or IVA % beside `price_list_id`.
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
 * delete any of them, and nothing here binds the builder to one customer.
 */
export interface ReportParameterPreset {
  key: string;
  label: string;
  parameter: Omit<ReportParameter, "display_order">;
}

function preset(
  name: string,
  label: string,
  data_type: ReportParameterDataType,
  input_type: ReportParameterInputType,
): ReportParameterPreset {
  return {
    key: name,
    label,
    parameter: {
      name,
      label,
      data_type,
      input_type,
      required: false,
      default_value: null,
      configuration_json: null,
    },
  };
}

export const REPORT_PARAMETER_PRESETS: ReportParameterPreset[] = [
  preset("customer_name", "Cliente", "string", "text"),
  preset("customer_email", "Email", "string", "text"),
  preset("attention_to", "Atención", "string", "text"),
  preset("requisition", "Requisición", "string", "text"),
  preset("quotation_date", "Fecha", "date", "date"),
  preset("commercial_conditions", "Condiciones", "string", "text"),
  preset("tax_rate", "IVA %", "decimal", "number"),
];

/** Appends a preset under a name no other parameter is using. */
export function appendPresetParameter(
  parameters: ReportParameter[],
  presetKey: string,
): ReportParameter[] {
  const found = REPORT_PARAMETER_PRESETS.find((candidate) => candidate.key === presetKey);
  if (!found) return parameters;
  const taken = new Set(parameters.map((parameter) => parameter.name.toLocaleLowerCase()));
  let name = found.parameter.name;
  for (let suffix = 2; taken.has(name.toLocaleLowerCase()); suffix += 1) {
    name = `${found.parameter.name}_${suffix}`;
  }
  return [...parameters, { ...found.parameter, name, display_order: parameters.length }];
}

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
    filename_template: "",
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
    filename_template: report.filename_template ?? "",
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
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(parameter.name)) {
      errors.push(`El nombre del parámetro ${position} no es válido.`);
    }
    const folded = parameter.name.toLocaleLowerCase();
    if (folded && names.has(folded)) errors.push(`El parámetro '${parameter.name}' está duplicado.`);
    names.add(folded);
    if (!parameter.label.trim()) errors.push(`La etiqueta del parámetro ${position} es requerida.`);
    if (!INPUTS_BY_DATA_TYPE[parameter.data_type].includes(parameter.input_type)) {
      errors.push(`El control de '${parameter.name || position}' no es compatible con su tipo.`);
    }
    if (parameter.input_type === "select" && parameter.configuration_json == null) {
      errors.push(`El select '${parameter.name || position}' requiere una fuente de opciones.`);
    }
  }

  errors.push(
    ...validateFilenameTemplate(
      value.filename_template,
      value.parameters.map((parameter) => parameter.name.trim()),
    ),
  );

  // The source contract is a floor, not a ceiling: only its absence is an error.
  for (const expected of source?.parameters ?? []) {
    const declared = value.parameters.find((parameter) => parameter.name === expected.name);
    if (!declared) {
      errors.push(`La fuente requiere el parámetro '${expected.name}'.`);
      continue;
    }
    if (declared.data_type !== expected.data_type) {
      errors.push(`El tipo de '${expected.name}' no coincide con el contrato de la fuente.`);
    }
    if (expected.required && !declared.required) {
      errors.push(`El parámetro '${expected.name}' es requerido por la fuente de datos.`);
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
    // An empty pattern is `null`, never "": the backend rejects a blank string.
    filename_template: value.filename_template.trim() || null,
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
    filename_template: request.filename_template,
    data_source_id: request.data_source_id,
    enabled: value.enabled,
    parameters: request.parameters,
  };
}

export function coerceRuntimeValue(parameter: ReportParameter, raw: string | boolean): unknown {
  if (typeof raw === "boolean") return raw;
  if (raw === "") return undefined;
  if (parameter.data_type === "integer") return Number.parseInt(raw, 10);
  if (parameter.data_type === "boolean") return raw === "true" || raw === "1";
  return raw;
}
