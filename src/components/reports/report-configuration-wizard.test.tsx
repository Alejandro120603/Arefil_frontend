// @vitest-environment jsdom

import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportConfigurationWizard } from "./report-configuration-wizard";
import type { ReportAdminDefinition, ReportBuilderDefinition, ReportExcelTemplate } from "@/types/api";

const { push, replace, getReportBuilder, getReportExcelTemplate } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  getReportBuilder: vi.fn(),
  getReportExcelTemplate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/api/reports", () => ({ getReportBuilder, getReportExcelTemplate }));

/**
 * The wizard shell is orchestration over five already-shipped, already-tested
 * components. Each has its own extensive test suite elsewhere — mocking them
 * here keeps these tests about the shell's own logic (stepper navigation,
 * step gating, resume position, progressive creation, mode sync) rather than
 * re-testing report-definition-form.test.tsx etc. through five extra layers.
 */
vi.mock("@/components/reports/report-definition-form", () => ({
  ReportDefinitionForm: ({ section, onSaved, createRedirectPath }: {
    section: "information" | "source" | "all";
    onSaved?: (saved: ReportAdminDefinition) => void;
    createRedirectPath?: (code: string) => string;
  }) => (
    <div data-testid={`definition-form-${section}`}>
      <button
        type="button"
        onClick={() => {
          const saved = { ...REPORT, name: "Cotización actualizada" };
          onSaved?.(saved);
          if (createRedirectPath) push(createRedirectPath(saved.code));
        }}
      >
        fake-save-{section}
      </button>
    </div>
  ),
}));
vi.mock("@/components/reports/report-builder-workspace", () => ({
  ReportBuilderWorkspace: ({ code }: { code: string }) => <div data-testid="builder-workspace">builder:{code}</div>,
}));
vi.mock("@/components/reports/report-excel-template-card", () => ({
  ReportExcelTemplateCard: ({ onTemplateChange, hasUnsavedMappings }: { onTemplateChange?: (template: ReportExcelTemplate | null) => void; hasUnsavedMappings?: boolean }) => {
    // Mirrors the real component reporting its initial load (even a "no template" one) once mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount only, like a real initial-load effect
    useEffect(() => { onTemplateChange?.(null); }, []);
    return (
      <div data-testid="template-card" data-mappings-dirty={String(hasUnsavedMappings)}>
        <button type="button" onClick={() => onTemplateChange?.(TEMPLATE)}>fake-upload</button>
        <button type="button" onClick={() => onTemplateChange?.(null)}>fake-report-no-template</button>
      </div>
    );
  },
}));
vi.mock("@/components/reports/report-excel-template-inspector", () => ({
  ReportExcelTemplateInspector: ({ mode, onModeChange, onPreviewReady, onDirtyChange }: {
    mode?: "design" | "preview";
    onModeChange?: (mode: "design" | "preview") => void;
    onPreviewReady?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div data-testid="mapper">
      <p>mapper-mode:{mode}</p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>fake-dirty-mapping</button>
      <button type="button" onClick={() => onModeChange?.("preview")}>fake-switch-to-preview</button>
      <button type="button" onClick={() => onModeChange?.("design")}>fake-switch-to-design</button>
      <button type="button" onClick={() => onPreviewReady?.()}>fake-preview-ready</button>
    </div>
  ),
}));
vi.mock("@/components/reports/report-wizard-finalize-step", () => ({
  ReportWizardFinalizeStep: ({ report, previewGeneratedThisSession }: {
    report: ReportAdminDefinition;
    previewGeneratedThisSession: boolean;
  }) => (
    <div data-testid="finalize-step">
      finalize:{report.code}:preview-generated:{String(previewGeneratedThisSession)}
    </div>
  ),
}));

const REPORT: ReportAdminDefinition = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null,
  enabled: false, data_source_id: 1,
  data_source: { id: 1, code: "quotes", name: "Cotizaciones", description: null, enabled: true, capabilities: [] },
  parameters: [], parameter_groups: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

const BUILDER_NO_COLUMNS = { report: REPORT, columns: [], parameter_groups: [], excel_layout: null } as unknown as ReportBuilderDefinition;
const BUILDER_WITH_COLUMNS = {
  report: REPORT,
  columns: [{ key: "part_number", label: "No. Parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null }],
  parameter_groups: [], excel_layout: null,
} as unknown as ReportBuilderDefinition;

const TEMPLATE: ReportExcelTemplate = {
  report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 4, checksum: "abc",
  is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportConfigurationWizard — creation", () => {
  it("starts on Información", () => {
    render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
    expect(screen.getByTestId("definition-form-information")).toBeTruthy();
    expect(screen.getByText(/Información/, { selector: "h2" })).toBeTruthy();
  });

  it("does not allow jumping ahead to steps that need a persisted report", () => {
    render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
    const dataStepButton = screen.getByRole("button", { name: /Datos del reporte/ });
    expect((dataStepButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("Continuar from Información moves to Fuente y entradas", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Fuente y entradas/, { selector: "h2" })).toBeTruthy();
  });

  it("saving from Fuente y entradas redirects to the wizard at the new code, step 3 — no local step advance", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "fake-save-source" }));

    expect(push).toHaveBeenCalledWith("/administracion/reportes/COTIZACION/configurar?step=3");
    // Still creation mode locally: no builder/template step ever mounts here.
    expect(screen.queryByTestId("builder-workspace")).toBeNull();
  });
});

describe("ReportConfigurationWizard — editing an existing report", () => {
  it("resumes at Datos del reporte when the builder has no columns yet", async () => {
    getReportBuilder.mockResolvedValue(BUILDER_NO_COLUMNS);
    getReportExcelTemplate.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={null} />);
    await waitFor(() => expect(screen.getByTestId("builder-workspace")).toBeTruthy());
  });

  it("resumes at Plantilla Excel once columns exist but there is no template", async () => {
    getReportBuilder.mockResolvedValue(BUILDER_WITH_COLUMNS);
    getReportExcelTemplate.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={null} />);
    await waitFor(() => expect(screen.getByTestId("template-card")).toBeTruthy());
  });

  it("honors an explicit ?step= over the computed resume position", () => {
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={1} />);
    expect(screen.getByTestId("definition-form-information")).toBeTruthy();
    expect(getReportBuilder).not.toHaveBeenCalled();
  });

  it("blocks Continuar from Plantilla Excel until a template exists, offering Omitir por ahora instead", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={4} />);

    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Omitir por ahora" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "fake-upload" }));
    expect(await screen.findByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Omitir por ahora" })).toBeNull();
  });

  it("Omitir por ahora jumps straight to Finalizar and explains the template is pending", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={4} />);
    await user.click(screen.getByRole("button", { name: "Omitir por ahora" }));

    expect(screen.getByTestId("finalize-step")).toBeTruthy();
    expect(screen.getByText(/no podrá generar el documento Excel final/)).toBeTruthy();
  });

  it("keeps the mapper's Diseño/Vista previa tab in sync with the wizard's own step", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={5} />);

    expect(screen.getByText("mapper-mode:design")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("mapper-mode:preview")).toBeTruthy();
    expect(screen.getByText(/Vista previa/, { selector: "h2" })).toBeTruthy();
  });

  it("switching the mapper's own tab (not the wizard's button) also moves the wizard's step", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={5} />);
    await user.click(screen.getByRole("button", { name: "fake-switch-to-preview" }));
    expect(screen.getByText(/Vista previa/, { selector: "h2" })).toBeTruthy();
  });

  it("carries a preview generated during the session through to the Finalizar checklist", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={6} />);
    await user.click(screen.getByRole("button", { name: "fake-preview-ready" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/preview-generated:true/)).toBeTruthy();
  });

  it("syncs the current step into the URL without a full navigation", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={1} />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(replace).toHaveBeenCalledWith("/administracion/reportes/COTIZACION/configurar?step=2", { scroll: false });
  });
});

it("opens the preview tab when reloading the wizard at step 6", () => {
  render(<ReportConfigurationWizard report={REPORT} initialStepParam={6} />);
  expect(screen.getByText("mapper-mode:preview")).toBeTruthy();
});

it("shares unsaved mappings with the template-card history when going back to step 4", async () => {
  const user = userEvent.setup();
  render(<ReportConfigurationWizard report={REPORT} initialStepParam={5} />);
  await user.click(screen.getByRole("button", { name: "fake-dirty-mapping" }));
  await user.click(screen.getByRole("button", { name: "Anterior" }));
  expect(screen.getByTestId("template-card").getAttribute("data-mappings-dirty")).toBe("true");
});
