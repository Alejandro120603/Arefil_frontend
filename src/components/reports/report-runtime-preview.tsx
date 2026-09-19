import { ErrorAlert } from "@/components/donaldson/error-alert";
import { PriceListComparisonPreview } from "@/components/reports/price-list-comparison-preview";
import { ReportBuilderPreviewTable } from "@/components/reports/report-builder-preview-table";
import { ReportPreviewTable } from "@/components/reports/report-preview-table";
import {
  isPriceListComparisonResponse,
  isReportBuilderPreviewResponse,
  isSQLReportExecutionResponse,
} from "@/lib/reports/report-runtime";
import type { ReportParameter, ReportSummaryConfiguration } from "@/types/api";

export function ReportRuntimePreview({
  payload,
  summaries = [],
  parameters = [],
}: {
  payload: unknown;
  summaries?: ReportSummaryConfiguration[];
  parameters?: ReportParameter[];
}) {
  if (isReportBuilderPreviewResponse(payload)) {
    return <ReportBuilderPreviewTable preview={payload} summaries={summaries} parameters={parameters} />;
  }
  if (isPriceListComparisonResponse(payload)) return <PriceListComparisonPreview comparison={payload} />;
  if (isSQLReportExecutionResponse(payload)) {
    return (
      <ReportPreviewTable
        title="Vista previa del reporte"
        preview={{ ...payload, truncated: false }}
        note="La descarga la genera el backend con este mismo conjunto de parámetros."
      />
    );
  }
  return (
    <ErrorAlert
      title="No se pudo mostrar la vista previa"
      message="El backend devolvió un formato de reporte que este runtime no reconoce."
    />
  );
}
