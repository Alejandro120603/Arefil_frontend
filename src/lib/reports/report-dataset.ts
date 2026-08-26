import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";
import { toArefilReportData } from "@/lib/reports/stimulsoft-dataset";
import type {
  PriceListComparisonResponse,
  ReportDefinition,
  SQLReportExecutionResponse,
} from "@/types/api";

export interface AdaptedReportDataset {
  data: unknown;
  rowCount: number;
}

export interface SQLReportData {
  report: [{
    code: string;
    name: string;
    description: string | null;
    category: string | null;
    data_source_type: "SQL_QUERY";
  }];
  parameters: [Record<string, unknown>];
  rows: Record<string, unknown>[];
}

export class ReportDatasetAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportDatasetAdapterError";
  }
}

function isSQLPayload(payload: unknown): payload is SQLReportExecutionResponse {
  if (payload == null || typeof payload !== "object") return false;
  const candidate = payload as Partial<SQLReportExecutionResponse>;
  return Array.isArray(candidate.columns) && Array.isArray(candidate.rows) && typeof candidate.row_count === "number";
}

function isComparisonPayload(payload: unknown): payload is PriceListComparisonResponse {
  if (payload == null || typeof payload !== "object") return false;
  const candidate = payload as Partial<PriceListComparisonResponse>;
  return candidate.report?.code === PRICE_LIST_COMPARISON_CODE && Array.isArray(candidate.items) && candidate.summary != null;
}

function adaptSQLReport(
  report: ReportDefinition,
  parameters: Record<string, unknown>,
  payload: unknown,
): AdaptedReportDataset {
  if (!isSQLPayload(payload)) {
    throw new ReportDatasetAdapterError("El backend devolvió un dataset SQL con formato inválido.");
  }
  const data: SQLReportData = {
    report: [{
      code: report.code,
      name: report.name,
      description: report.description,
      category: report.category,
      data_source_type: "SQL_QUERY",
    }],
    parameters: [{ ...parameters }],
    rows: payload.rows,
  };
  return { data, rowCount: payload.row_count };
}

type HandlerAdapter = (payload: unknown) => AdaptedReportDataset;

const HANDLER_ADAPTERS: Readonly<Record<string, HandlerAdapter>> = Object.freeze({
  [PRICE_LIST_COMPARISON_CODE]: (payload) => {
    if (!isComparisonPayload(payload)) {
      throw new ReportDatasetAdapterError("El backend devolvió una comparación con formato inválido.");
    }
    return { data: toArefilReportData(payload), rowCount: payload.items.length };
  },
});

/** Only code-owned adapters may transform HANDLER payloads into Stimulsoft data. */
export function adaptReportDataset(
  report: ReportDefinition,
  parameters: Record<string, unknown>,
  payload: unknown,
): AdaptedReportDataset {
  if (report.data_source_type === "SQL_QUERY") return adaptSQLReport(report, parameters, payload);
  const adapter = HANDLER_ADAPTERS[report.code];
  if (adapter == null) {
    throw new ReportDatasetAdapterError(`El reporte ${report.code} no tiene un adaptador de datos permitido.`);
  }
  return adapter(payload);
}

export function getSQLExecutionPayload(payload: unknown): SQLReportExecutionResponse | null {
  return isSQLPayload(payload) ? payload : null;
}
