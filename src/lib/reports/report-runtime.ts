import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";
import type {
  ReportBuilderPreviewResponse,
  ReportNumericConfiguration,
  ReportParameter,
  ReportParameterGroup,
  ReportParameterGroupField,
} from "@/types/api";

export type RuntimeParameterValue = string | boolean;
export type RuntimeParameterValues = Record<string, RuntimeParameterValue>;

export interface RuntimeGroupRow {
  id: string;
  values: RuntimeParameterValues;
}

export type RuntimeGroupValues = Record<string, RuntimeGroupRow[]>;

export interface RuntimeParameterValidation {
  fieldErrors: Record<string, string>;
  formError: string | null;
  parameters: Record<string, unknown>;
  valid: boolean;
}

export interface RuntimeFormValidation extends RuntimeParameterValidation {
  groupErrors: Record<string, string>;
  rowErrors: Record<string, Record<number, Record<string, string>>>;
}

export function orderedReportParameters(parameters: ReportParameter[]): ReportParameter[] {
  return parameters
    .map((parameter, index) => ({ parameter, index }))
    .sort((left, right) =>
      left.parameter.display_order - right.parameter.display_order || left.index - right.index,
    )
    .map(({ parameter }) => parameter);
}

export function orderedParameterGroups(groups: ReportParameterGroup[]): ReportParameterGroup[] {
  return stableDisplayOrder(groups);
}

export function orderedGroupFields(fields: ReportParameterGroupField[]): ReportParameterGroupField[] {
  return stableDisplayOrder(fields);
}

function stableDisplayOrder<T extends { display_order: number }>(values: T[]): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value.display_order - right.value.display_order || left.index - right.index)
    .map(({ value }) => value);
}

function initialValue(parameter: ReportParameter | ReportParameterGroupField): RuntimeParameterValue {
  const value = parameter.default_value;
  if (parameter.data_type === "boolean" || parameter.input_type === "checkbox") {
    if (typeof value === "boolean") return value;
    return value === "true" || value === "1" || value === 1;
  }
  if (value == null) return "";
  const serialized = String(value);
  if (parameter.input_type === "datetime") return serialized.slice(0, 16);
  if (parameter.input_type === "date") return serialized.slice(0, 10);
  return serialized;
}

export function initialRuntimeValues(parameters: ReportParameter[]): RuntimeParameterValues {
  return Object.fromEntries(parameters.map((parameter) => [parameter.name, initialValue(parameter)]));
}

export function initialRuntimeGroupValues(groups: ReportParameterGroup[]): RuntimeGroupValues {
  return Object.fromEntries(orderedParameterGroups(groups).map((group) => [
    group.name,
    Array.from({ length: group.min_items }, (_, index) => createRuntimeGroupRow(group, `${group.name}-${index}`)),
  ]));
}

export function createRuntimeGroupRow(group: ReportParameterGroup, id: string): RuntimeGroupRow {
  return {
    id,
    values: Object.fromEntries(orderedGroupFields(group.fields).map((field) => [field.name, initialValue(field)])),
  };
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match == null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function isValidDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/.exec(value);
  return match != null && isValidDate(match[1]);
}

function coerceValue(parameter: ReportParameter | ReportParameterGroupField, raw: RuntimeParameterValue): unknown {
  if (typeof raw === "boolean") return raw;
  if (raw === "") return undefined;
  if (parameter.data_type === "integer") return Number(raw);
  if (parameter.data_type === "boolean") return raw === "true" || raw === "1";
  // Decimal strings intentionally remain strings. FastAPI/Pydantic performs
  // the authoritative coercion without a browser floating-point round trip.
  return raw;
}

function numericConstraint(configuration: ReportNumericConfiguration, key: "minimum" | "maximum"): number | null {
  const raw = configuration[key];
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function validateGroupField(field: ReportParameterGroupField, raw: RuntimeParameterValue): string | null {
  const empty = typeof raw === "string" && raw.trim() === "";
  if (field.required && empty) return "Este campo es requerido.";
  if (empty) return null;

  if (typeof raw === "string" && field.input_type === "number") {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || (field.data_type === "integer" && !Number.isInteger(numeric))) {
      return field.data_type === "integer" ? "Captura un número entero válido." : "Captura un número válido.";
    }
    const configuration = field.configuration_json ?? {};
    if (!("options_source" in configuration)) {
      const minimum = numericConstraint(configuration, "minimum");
      const maximum = numericConstraint(configuration, "maximum");
      if (minimum != null && (configuration.exclusive_minimum ? numeric <= minimum : numeric < minimum)) {
        return configuration.exclusive_minimum
          ? `Debe ser mayor que ${minimum}.`
          : `Debe ser mayor o igual que ${minimum}.`;
      }
      if (maximum != null && (configuration.exclusive_maximum ? numeric >= maximum : numeric > maximum)) {
        return configuration.exclusive_maximum
          ? `Debe ser menor que ${maximum}.`
          : `Debe ser menor o igual que ${maximum}.`;
      }
    }
  }
  if (typeof raw === "string" && field.input_type === "date" && !isValidDate(raw)) {
    return "Captura una fecha válida.";
  }
  if (typeof raw === "string" && field.input_type === "datetime" && !isValidDateTime(raw)) {
    return "Captura una fecha y hora válidas.";
  }
  return null;
}

export function validateRuntimeParameters(
  code: string,
  parameters: ReportParameter[],
  values: RuntimeParameterValues,
): RuntimeParameterValidation {
  const fieldErrors: Record<string, string> = {};
  const payload: Record<string, unknown> = {};

  for (const parameter of orderedReportParameters(parameters)) {
    const raw = values[parameter.name] ?? (parameter.input_type === "checkbox" ? false : "");
    const empty = typeof raw === "string" && raw.trim() === "";
    if (parameter.required && empty) {
      fieldErrors[parameter.name] = "Este campo es requerido.";
      continue;
    }
    if (empty) continue;

    if (typeof raw === "string" && parameter.input_type === "number") {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || (parameter.data_type === "integer" && !Number.isInteger(numeric))) {
        fieldErrors[parameter.name] = parameter.data_type === "integer"
          ? "Captura un número entero válido."
          : "Captura un número válido.";
        continue;
      }
    }
    if (typeof raw === "string" && parameter.input_type === "date" && !isValidDate(raw)) {
      fieldErrors[parameter.name] = "Captura una fecha válida.";
      continue;
    }
    if (typeof raw === "string" && parameter.input_type === "datetime" && !isValidDateTime(raw)) {
      fieldErrors[parameter.name] = "Captura una fecha y hora válidas.";
      continue;
    }

    payload[parameter.name] = coerceValue(parameter, raw);
  }

  let formError: string | null = null;
  if (
    code === PRICE_LIST_COMPARISON_CODE &&
    payload.price_list_a_id != null &&
    payload.price_list_a_id === payload.price_list_b_id
  ) {
    formError = "Selecciona dos listas distintas.";
  }

  return {
    fieldErrors,
    formError,
    parameters: payload,
    valid: Object.keys(fieldErrors).length === 0 && formError == null,
  };
}

export function validateRuntimeForm(
  code: string,
  parameters: ReportParameter[],
  groups: ReportParameterGroup[],
  values: RuntimeParameterValues,
  groupValues: RuntimeGroupValues,
): RuntimeFormValidation {
  const scalar = validateRuntimeParameters(code, parameters, values);
  const payload = { ...scalar.parameters };
  const groupErrors: Record<string, string> = {};
  const rowErrors: Record<string, Record<number, Record<string, string>>> = {};

  for (const group of orderedParameterGroups(groups)) {
    const rows = groupValues[group.name] ?? [];
    if (rows.length < group.min_items) {
      groupErrors[group.name] = `Agrega al menos ${group.min_items} ${group.min_items === 1 ? "renglón" : "renglones"}.`;
    } else if (group.max_items != null && rows.length > group.max_items) {
      groupErrors[group.name] = `El grupo permite como máximo ${group.max_items} renglones.`;
    }

    payload[group.name] = rows.map((row, rowIndex) => {
      const serialized: Record<string, unknown> = {};
      for (const field of orderedGroupFields(group.fields)) {
        const raw = row.values[field.name] ?? (field.input_type === "checkbox" ? false : "");
        const error = validateGroupField(field, raw);
        if (error) {
          rowErrors[group.name] ??= {};
          rowErrors[group.name][rowIndex] ??= {};
          rowErrors[group.name][rowIndex][field.name] = error;
          continue;
        }
        const empty = typeof raw === "string" && raw.trim() === "";
        if (!empty) serialized[field.name] = coerceValue(field, raw);
      }
      return serialized;
    });
  }

  return {
    fieldErrors: scalar.fieldErrors,
    formError: scalar.formError,
    groupErrors,
    rowErrors,
    parameters: payload,
    valid: scalar.valid && Object.keys(groupErrors).length === 0 && Object.keys(rowErrors).length === 0,
  };
}

export function backendRowErrors(
  detail: unknown,
  groups: ReportParameterGroup[],
): Record<string, Record<number, Record<string, string>>> {
  const groupNames = new Set(groups.map((group) => group.name));
  const errors: Record<string, Record<number, Record<string, string>>> = {};
  if (!Array.isArray(detail)) return errors;
  for (const item of detail) {
    if (!item || typeof item !== "object") continue;
    const { loc, msg, message } = item as { loc?: unknown[]; msg?: unknown; message?: unknown };
    const normalized = loc?.[0] === "body" ? loc.slice(1) : loc;
    const group = normalized?.[0];
    const row = normalized?.[1];
    const field = normalized?.[2];
    const text = typeof msg === "string" ? msg : typeof message === "string" ? message : null;
    if (typeof group !== "string" || !groupNames.has(group) || typeof row !== "number" || typeof field !== "string" || !text) continue;
    errors[group] ??= {};
    errors[group][row] ??= {};
    errors[group][row][field] = text;
  }
  return errors;
}

export function isReportBuilderPreviewResponse(value: unknown): value is ReportBuilderPreviewResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReportBuilderPreviewResponse>;
  return Array.isArray(candidate.columns)
    && candidate.columns.every((column) => column && typeof column === "object" && "key" in column && "label" in column)
    && Array.isArray(candidate.rows)
    && candidate.totals != null
    && typeof candidate.totals === "object"
    && typeof candidate.row_count === "number"
    && typeof candidate.truncated === "boolean";
}
