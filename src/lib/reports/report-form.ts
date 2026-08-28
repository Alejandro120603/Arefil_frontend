import type {
  ReportAdminDefinition,
  ReportCreateRequest,
  ReportDataSource,
  ReportParameter,
  ReportParameterDataType,
  ReportParameterInputType,
  ReportUpdateRequest,
} from "@/types/api";

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

export function validateReportForm(value: ReportFormValue, creating: boolean): string[] {
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

export function coerceRuntimeValue(parameter: ReportParameter, raw: string | boolean): unknown {
  if (typeof raw === "boolean") return raw;
  if (raw === "") return undefined;
  if (parameter.data_type === "integer") return Number.parseInt(raw, 10);
  if (parameter.data_type === "boolean") return raw === "true" || raw === "1";
  return raw;
}
