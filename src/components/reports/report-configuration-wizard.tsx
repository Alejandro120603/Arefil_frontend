"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportBuilderWorkspace } from "@/components/reports/report-builder-workspace";
import { ReportDefinitionForm } from "@/components/reports/report-definition-form";
import { ReportExcelTemplateCard } from "@/components/reports/report-excel-template-card";
import { ReportExcelTemplateInspector } from "@/components/reports/report-excel-template-inspector";
import { ReportWizardFinalizeStep } from "@/components/reports/report-wizard-finalize-step";
import { ReportWizardStepper } from "@/components/reports/report-wizard-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api/errors";
import { getReportBuilder, getReportExcelTemplate } from "@/lib/api/reports";
import {
  reportWizardStepFromOrder,
  reportWizardStepOrder,
  resumeReportWizardStep,
  type ReportWizardStepId,
} from "@/lib/reports/report-wizard";
import type { ReportAdminDefinition, ReportExcelTemplate } from "@/types/api";

const STEP_DESCRIPTIONS: Record<ReportWizardStepId, string> = {
  information: "Nombre, código y descripción — sin configuración técnica todavía.",
  source: "De dónde vienen los datos y qué necesita capturar el usuario para generarlos.",
  data: "Columnas, renglones repetibles, fórmulas y resumen del reporte.",
  template: "El archivo Excel que se usará como diseño final del documento.",
  mapping: "Asocia cada dato del reporte a su celda en la plantilla, sin escribir placeholders.",
  preview: "Genera el documento con datos de prueba antes de habilitar el reporte.",
  finalize: "Estado real del reporte y la acción para habilitarlo.",
};

/**
 * The guided report configuration wizard (Frontend #33). Pure orchestration:
 * every step composes an existing, already-shipped component
 * (`ReportDefinitionForm`, `ReportBuilderWorkspace`, `ReportExcelTemplateCard`,
 * `ReportExcelTemplateInspector`) instead of re-implementing any of it.
 *
 * `report == null` is the creation flow (`/administracion/reportes/nuevo`):
 * steps 3–7 need a persisted `code`, which the backend only hands out once
 * Información *and* Fuente y entradas are saved together (`data_source_id` is
 * required to create a report at all) — so creating redirects to this same
 * wizard at the new code, exactly like editing one that already exists.
 */
export function ReportConfigurationWizard({
  report: initialReport,
  initialStepParam,
}: {
  report: ReportAdminDefinition | null;
  initialStepParam: number | null;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [step, setStep] = useState<ReportWizardStepId>(() =>
    initialStepParam != null ? reportWizardStepFromOrder(initialStepParam) : "information",
  );
  // For an existing report opened with no explicit ?step=, land on the first
  // structurally incomplete step instead of always Información.
  const [resumed, setResumed] = useState(initialStepParam != null || initialReport == null);
  const [templateMode, setTemplateMode] = useState<"design" | "preview">("design");
  const [templateState, setTemplateState] = useState<ReportExcelTemplate | null>(null);
  /** Whether `ReportExcelTemplateCard` has reported back at least once — `templateState == null` is ambiguous otherwise. */
  const [templateChecked, setTemplateChecked] = useState(false);
  const [templateSkipped, setTemplateSkipped] = useState(false);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (resumed || report == null) return;
    const controller = new AbortController();
    Promise.all([
      getReportBuilder(report.code, { signal: controller.signal }),
      getReportExcelTemplate(report.code, { signal: controller.signal }).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }),
    ])
      .then(([builder, template]) => {
        if (controller.signal.aborted) return;
        setTemplateState(template);
        setTemplateChecked(true);
        setStep(resumeReportWizardStep({ builder, template }));
        setResumed(true);
      })
      // Best-effort: if this fails, the wizard simply opens on Información.
      .catch(() => { if (!controller.signal.aborted) setResumed(true); });
    return () => controller.abort();
  }, [resumed, report]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (report == null) return;
    router.replace(`/administracion/reportes/${encodeURIComponent(report.code)}/configurar?step=${reportWizardStepOrder(step)}`, { scroll: false });
  }, [report, step, router]);

  function goTo(next: ReportWizardStepId) {
    setStep(next);
    if (next === "mapping") setTemplateMode("design");
    if (next === "preview") setTemplateMode("preview");
  }

  function handleTemplateModeChange(next: "design" | "preview") {
    setTemplateMode(next);
    setStep(next === "preview" ? "preview" : "mapping");
  }

  function available(id: ReportWizardStepId): boolean {
    if (id === "information" || id === "source") return true;
    return report != null;
  }

  const completed = new Set<ReportWizardStepId>();
  if (report != null) {
    completed.add("information");
    completed.add("source");
  }
  if (templateState != null) completed.add("template");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ReportWizardStepper current={step} completed={completed} availability={available} onSelect={goTo} />
          <div>
            <h2 className="text-lg font-semibold">{stepTitle(step)}</h2>
            <p className="text-sm text-muted-foreground">{STEP_DESCRIPTIONS[step]}</p>
          </div>
        </CardContent>
      </Card>

      <div className={step === "information" ? "contents" : "hidden"}>
        <ReportDefinitionForm report={report} section="information" />
      </div>
      {step === "information" && <WizardNav onPrevious={null} onNext={() => goTo("source")} nextLabel="Continuar" />}

      <div className={step === "source" ? "contents" : "hidden"}>
        <ReportDefinitionForm
          report={report}
          section="source"
          createRedirectPath={(code) => `/administracion/reportes/${encodeURIComponent(code)}/configurar?step=3`}
          onSaved={(saved) => {
            if (report != null) {
              setReport(saved);
              goTo("data");
            }
          }}
        />
      </div>
      {step === "source" && <WizardNav onPrevious={() => goTo("information")} onNext={null} />}

      {report != null && (
        <>
          <div className={step === "data" ? "contents" : "hidden"}>
            <ReportBuilderWorkspace
              code={report.code}
              parameters={report.parameters}
              dataSourceCapabilities={report.data_source.capabilities}
            />
          </div>
          {step === "data" && (
            <WizardNav onPrevious={() => goTo("source")} onNext={() => goTo("template")} nextLabel="Continuar" />
          )}

          <div className={step === "template" ? "contents" : "hidden"}>
            <ReportExcelTemplateCard
              code={report.code}
              parameters={report.parameters}
              onTemplateChange={(template) => {
                setTemplateState(template);
                setTemplateChecked(true);
                if (template != null) setTemplateSkipped(false);
              }}
            />
            {templateSkipped && templateState == null && (
              <ErrorAlert
                title="Plantilla pendiente"
                message="El reporte puede guardarse y habilitarse sin plantilla, pero no podrá generar el documento Excel final hasta que subas una."
              />
            )}
          </div>
          {step === "template" && (
            <WizardNav
              onPrevious={() => goTo("data")}
              onNext={templateState != null ? () => goTo("mapping") : null}
              nextLabel="Continuar"
              extra={
                templateChecked && templateState == null ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTemplateSkipped(true);
                      goTo("finalize");
                    }}
                  >
                    Omitir por ahora
                  </Button>
                ) : null
              }
            />
          )}

          <div className={step === "mapping" || step === "preview" ? "contents" : "hidden"}>
            <Card>
              <CardContent>
                <ReportExcelTemplateInspector
                  code={report.code}
                  mode={templateMode}
                  onModeChange={handleTemplateModeChange}
                  onPreviewReady={() => setPreviewGenerated(true)}
                />
              </CardContent>
            </Card>
          </div>
          {(step === "mapping" || step === "preview") && (
            <WizardNav
              onPrevious={() => (step === "preview" ? handleTemplateModeChange("design") : goTo("template"))}
              onNext={() => (step === "mapping" ? handleTemplateModeChange("preview") : goTo("finalize"))}
              nextLabel="Continuar"
            />
          )}

          <div className={step === "finalize" ? "contents" : "hidden"}>
            <Card>
              <CardContent>
                <ReportWizardFinalizeStep
                  report={report}
                  previewGeneratedThisSession={previewGenerated}
                  onReportChange={setReport}
                />
              </CardContent>
            </Card>
          </div>
          {step === "finalize" && (
            <WizardNav onPrevious={() => goTo(templateState != null ? "preview" : "template")} onNext={null} />
          )}
        </>
      )}
    </div>
  );
}

function stepTitle(step: ReportWizardStepId): string {
  switch (step) {
    case "information": return "Información";
    case "source": return "Fuente y entradas";
    case "data": return "Datos del reporte";
    case "template": return "Plantilla Excel";
    case "mapping": return "Mapear campos";
    case "preview": return "Vista previa";
    case "finalize": return "Finalizar";
  }
}

function WizardNav({
  onPrevious,
  onNext,
  nextLabel = "Continuar",
  extra = null,
}: {
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  nextLabel?: string;
  extra?: ReactNode;
}) {
  if (!onPrevious && !onNext && !extra) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        {onPrevious && (
          <Button type="button" variant="ghost" onClick={onPrevious}>
            Anterior
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {onNext && (
          <Button type="button" onClick={onNext}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
