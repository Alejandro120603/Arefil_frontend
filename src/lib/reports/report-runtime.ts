import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";
import type { ReportParameter } from "@/types/api";

export type RuntimeParameterValue = string | boolean;
export type RuntimeParameterValues = Record<string, RuntimeParameterValue>;

export interface RuntimeParameterValidation {
  fieldErrors: Record<string, string>;
  formError: string | null;
  parameters: Record<string, unknown>;
  valid: boolean;
}

export function orderedReportParameters(parameters: ReportParameter[]): ReportParameter[] {
  return parameters
    .map((parameter, index) => ({ parameter, index }))
    .sort((left, right) =>
      left.parameter.display_order - right.parameter.display_order || left.index - right.index,
    )
    .map(({ parameter }) => parameter);
}

function initialValue(parameter: ReportParameter): RuntimeParameterValue {
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

function coerceValue(parameter: ReportParameter, raw: RuntimeParameterValue): unknown {
  if (typeof raw === "boolean") return raw;
  if (raw === "") return undefined;
  if (parameter.data_type === "integer") return Number(raw);
  if (parameter.data_type === "boolean") return raw === "true" || raw === "1";
  // Decimal strings intentionally remain strings. FastAPI/Pydantic performs
  // the authoritative coercion without a browser floating-point round trip.
  return raw;
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
