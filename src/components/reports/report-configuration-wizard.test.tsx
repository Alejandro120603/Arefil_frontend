// @vitest-environment jsdom

import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportConfigurationWizard } from "./report-configuration-wizard";
import type { ReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import type { ReportTemplateInspection } from "@/hooks/use-report-template-inspection";
import type { TemplateDependencies } from "@/lib/reports/report-template-dependencies";
import { inspectionWithPlaceholders } from "@/test/template-inspection";
import type { ReportAdminDefinition, ReportBuilderDefinition, ReportExcelTemplate } from "@/types/api";

const { push, replace, getReportBuilder, getReportExcelTemplate, getReportFieldCatalog, saveReportBuilder, inspectReportExcelTemplate, cardTemplate } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  getReportBuilder: vi.fn(),
  getReportExcelTemplate: vi.fn(),
  getReportFieldCatalog: vi.fn(),
  saveReportBuilder: vi.fn(),
  inspectReportExcelTemplate: vi.fn(),
  /** What the mocked template card reports on its first load. */
  cardTemplate: { current: null as ReportExcelTemplate | null },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/lib/api/reports", () => ({ getReportBuilder, getReportExcelTemplate, getReportFieldCatalog, saveReportBuilder, inspectReportExcelTemplate }));

/**
 * The wizard shell is orchestration over five already-shipped, already-tested
 * components. Each has its own extensive test suite elsewhere — mocking them
 * here keeps these tests about the shell's own logic (stepper navigation,
 * step gating, resume position, progressive creation, mode sync) rather than
 * re-testing report-definition-form.test.tsx etc. through five extra layers.
 */
vi.mock("@/components/reports/report-definition-form", () => ({
  ReportDefinitionForm: ({ section, onSaved, createRedirectPath, templateDependencies, onGoToMapping }: {
    section: "information" | "source" | "all";
    onSaved?: (saved: ReportAdminDefinition) => void;
    createRedirectPath?: (code: string) => string;
    templateDependencies?: TemplateDependencies;
    onGoToMapping?: () => void;
  }) => (
    <div data-testid={`definition-form-${section}`}>
      <p>template-parameters:{[...(templateDependencies?.parameters.keys() ?? [])].join(",")}</p>
      {onGoToMapping && <button type="button" onClick={onGoToMapping}>fake-go-to-mapping</button>}
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
  // Stands in for the real (controlled) workspace: it shows the wizard-owned
  // draft and edits/saves it only through the props it is given.
  ReportBuilderWorkspace: ({ code, builder, templateDependencies }: { code: string; builder: ReportBuilderDraft; templateDependencies?: TemplateDependencies }) => (
    <div data-testid="builder-workspace">
      builder:{code}
      <p>template-rows:{[...(templateDependencies?.rows.keys() ?? [])].join(",")}</p>
      <p>template-summary:{[...(templateDependencies?.summary.keys() ?? [])].join(",")}</p>
      <p>draft-columns:{builder.draft?.columns.map((column) => column.label).join(",") ?? "loading"}</p>
      <p>persisted-columns:{builder.persisted?.columns.map((column) => column.label).join(",") ?? "none"}</p>
      <p>dirty:{String(builder.dirty)}</p>
      <button
        type="button"
        onClick={() => builder.updateDraft((draft) => ({ ...draft, columns: draft.columns.map((column) => ({ ...column, label: `${column.label} (editada)` })) }))}
      >fake-edit-column</button>
      <button type="button" onClick={() => { void builder.save(); }}>fake-save-builder</button>
    </div>
  ),
}));
vi.mock("@/components/reports/report-excel-template-card", () => ({
  ReportExcelTemplateCard: ({ onTemplateChange, hasUnsavedMappings, refreshToken }: { onTemplateChange?: (template: ReportExcelTemplate | null) => void; hasUnsavedMappings?: boolean; refreshToken?: number }) => {
    // Mirrors the real component reporting its initial load (even a "no template" one) once mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount only, like a real initial-load effect
    useEffect(() => { onTemplateChange?.(cardTemplate.current); }, []);
    return (
      <div data-testid="template-card" data-mappings-dirty={String(hasUnsavedMappings)} data-refresh-token={refreshToken}>
        <button type="button" onClick={() => onTemplateChange?.(TEMPLATE)}>fake-upload</button>
        <button type="button" onClick={() => onTemplateChange?.({ ...TEMPLATE, version: 5, checksum: "v5" })}>fake-upload-v5</button>
        <button type="button" onClick={() => onTemplateChange?.({ ...TEMPLATE })}>fake-same-metadata</button>
        <button type="button" onClick={() => onTemplateChange?.(null)}>fake-report-no-template</button>
      </div>
    );
  },
}));
vi.mock("@/components/reports/report-excel-template-inspector", () => ({
  ReportExcelTemplateInspector: ({ mode, onModeChange, onPreviewReady, onDirtyChange, onTemplateSaved, templateInspection }: {
    templateInspection?: ReportTemplateInspection;
    mode?: "design" | "preview";
    onModeChange?: (mode: "design" | "preview") => void;
    onPreviewReady?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onTemplateSaved?: () => void;
  }) => (
    <div data-testid="mapper">
      <p>mapper-mode:{mode}</p>
      <p>mapper-inspection:{templateInspection?.status}:{templateInspection?.templateVersion ?? "none"}</p>
      <button type="button" onClick={() => onTemplateSaved?.()}>fake-mapper-save</button>
      <button
        type="button"
        onClick={() => {
          // Like the real mapper: adopt the response's inspection (the mapping is gone), then notify.
          templateInspection?.replace(inspectionWithPlaceholders([], { version: 5, checksum: "v5" }));
          onTemplateSaved?.();
        }}
      >fake-mapper-clear-mapping</button>
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

beforeEach(() => {
  getReportBuilder.mockResolvedValue(BUILDER_WITH_COLUMNS);
  getReportFieldCatalog.mockResolvedValue([]);
  getReportExcelTemplate.mockResolvedValue(null);
  inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders([], { version: 4, checksum: "abc" }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  cardTemplate.current = null;
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

  it("honors an explicit ?step= over the computed resume position", async () => {
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={1} />);
    expect(screen.getByTestId("definition-form-information")).toBeTruthy();
    // The builder is still loaded once — for the workspace — but never used to move the wizard.
    await waitFor(() => expect(screen.getByText("draft-columns:No. Parte")).toBeTruthy());
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
    expect(getReportExcelTemplate).not.toHaveBeenCalled();
    expect(screen.getByText(/Información/, { selector: "h2" })).toBeTruthy();
  });

  it("opens an existing report with exactly one GET /builder, shared by resume and the workspace", async () => {
    getReportExcelTemplate.mockResolvedValue(null);
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={null} />);
    await waitFor(() => expect(screen.getByText(/Plantilla Excel/, { selector: "h2" })).toBeTruthy());
    expect(screen.getByText("draft-columns:No. Parte")).toBeTruthy();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
    expect(getReportBuilder).toHaveBeenCalledWith("COTIZACION", expect.anything());
    expect(getReportFieldCatalog).toHaveBeenCalledTimes(1);
  });

  it("never asks for a builder while creating a report", () => {
    render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
    expect(getReportBuilder).not.toHaveBeenCalled();
    expect(getReportFieldCatalog).not.toHaveBeenCalled();
  });

  it("keeps an unsaved builder draft while moving between steps, without reloading it", async () => {
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={3} />);
    await waitFor(() => expect(screen.getByText("draft-columns:No. Parte")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "fake-edit-column" }));
    expect(screen.getByText("draft-columns:No. Parte (editada)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText(/Fuente y entradas/, { selector: "h2" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Datos del reporte/ }));

    expect(screen.getByText("draft-columns:No. Parte (editada)")).toBeTruthy();
    expect(screen.getByText("persisted-columns:No. Parte")).toBeTruthy();
    expect(screen.getByText("dirty:true")).toBeTruthy();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
  });

  it("shows the saved builder after saving and coming back to the step", async () => {
    saveReportBuilder.mockResolvedValue({
      ...BUILDER_WITH_COLUMNS,
      columns: BUILDER_WITH_COLUMNS.columns.map((column) => ({ ...column, label: "No. Parte (editada)" })),
    });
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={3} />);
    await waitFor(() => expect(screen.getByText("draft-columns:No. Parte")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "fake-edit-column" }));
    await user.click(screen.getByRole("button", { name: "fake-save-builder" }));
    await waitFor(() => expect(screen.getByText("persisted-columns:No. Parte (editada)")).toBeTruthy());
    expect(saveReportBuilder).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: /Datos del reporte/ }));
    expect(screen.getByText("draft-columns:No. Parte (editada)")).toBeTruthy();
    expect(screen.getByText("dirty:false")).toBeTruthy();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
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

it("refreshes the template-card metadata after saving or restoring in the mounted mapper", async () => {
  const user = userEvent.setup();
  render(<ReportConfigurationWizard report={REPORT} initialStepParam={5} />);
  await user.click(screen.getByRole("button", { name: "fake-mapper-save" }));
  await user.click(screen.getByRole("button", { name: "Anterior" }));
  expect(screen.getByTestId("template-card").getAttribute("data-refresh-token")).toBe("1");
});

describe("ReportConfigurationWizard — shared template inspection (#43)", () => {
  it("never inspects while creating a report", () => {
    render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
    expect(inspectReportExcelTemplate).not.toHaveBeenCalled();
    expect(screen.getByText("template-parameters:")).toBeTruthy();
  });

  it("does not inspect an existing report without an active template", async () => {
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={2} />);
    await screen.findByTestId("template-card");
    await waitFor(() => expect(getReportBuilder).toHaveBeenCalled());
    expect(inspectReportExcelTemplate).not.toHaveBeenCalled();
    expect(screen.getByText("mapper-inspection:none:none")).toBeTruthy();
  });

  it("inspects once on open and shares it with steps 2, 3 and 5 — moving between steps costs no GET", async () => {
    cardTemplate.current = TEMPLATE;
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["parameters.customer_name", "rows.unit_price", "summary.subtotal"], { version: 4, checksum: "abc" }));
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={2} />);

    expect(await screen.findByText("template-parameters:customer_name")).toBeTruthy();
    expect(screen.getByText("template-rows:unit_price")).toBeTruthy();
    expect(screen.getByText("template-summary:subtotal")).toBeTruthy();
    expect(screen.getByText("mapper-inspection:ready:4")).toBeTruthy();
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Datos del reporte/ }));
    await user.click(screen.getByRole("button", { name: /Mapear campos/ }));
    await user.click(screen.getByRole("button", { name: /Fuente y entradas/ }));
    // Same metadata reported again (e.g. the card re-reading it): still cached.
    await user.click(screen.getByRole("button", { name: "fake-same-metadata" }));
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(1);
  });

  it("re-inspects exactly once when another version becomes active (upload, mappings, restore)", async () => {
    cardTemplate.current = TEMPLATE;
    inspectReportExcelTemplate
      .mockResolvedValueOnce(inspectionWithPlaceholders(["rows.unit_price"], { version: 4, checksum: "abc" }))
      .mockResolvedValueOnce(inspectionWithPlaceholders([], { version: 5, checksum: "v5" }));
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={3} />);
    expect(await screen.findByText("template-rows:unit_price")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "fake-upload-v5" }));
    expect(await screen.findByText("template-rows:")).toBeTruthy();
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(2);
  });

  it("drops every dependency once the template is deleted, without another GET", async () => {
    cardTemplate.current = TEMPLATE;
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["rows.unit_price"], { version: 4, checksum: "abc" }));
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={3} />);
    expect(await screen.findByText("template-rows:unit_price")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "fake-report-no-template" }));
    expect(await screen.findByText("template-rows:")).toBeTruthy();
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(1);
  });

  it("Ir a Mapear campos opens the mapping step", async () => {
    cardTemplate.current = TEMPLATE;
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["parameters.customer_name"], { version: 4, checksum: "abc" }));
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={2} />);
    await user.click(await screen.findByRole("button", { name: "fake-go-to-mapping" }));
    expect(replace).toHaveBeenLastCalledWith("/administracion/reportes/COTIZACION/configurar?step=5", { scroll: false });
  });

  it("after removing the mapping and saving a new version, the dependency disappears with no extra GET", async () => {
    cardTemplate.current = TEMPLATE;
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["rows.unit_price"], { version: 4, checksum: "abc" }));
    const user = userEvent.setup();
    render(<ReportConfigurationWizard report={REPORT} initialStepParam={3} />);
    expect(await screen.findByText("template-rows:unit_price")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Mapear campos/ }));
    await user.click(screen.getByRole("button", { name: "fake-mapper-clear-mapping" }));
    expect(screen.getByText("mapper-inspection:ready:5")).toBeTruthy();
    // The card's metadata refresh then reports the version the response already covered.
    await user.click(screen.getByRole("button", { name: "fake-upload-v5" }));
    await user.click(screen.getByRole("button", { name: /Datos del reporte/ }));
    expect(screen.getByText("template-rows:")).toBeTruthy();
    expect(screen.getByTestId("template-card").getAttribute("data-refresh-token")).toBe("1");
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(1);
  });
});
