// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReportConfigurationWizard } from "./report-configuration-wizard";
const { push, createReport, listReportDataSources } = vi.hoisted(() => ({
  push: vi.fn(), createReport: vi.fn(), listReportDataSources: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/reports", async (original) => ({ ...await original<object>(), createReport, listReportDataSources }));
afterEach(cleanup);
it("preserves the real definition form across steps and creates only after selecting the source", async () => {
  listReportDataSources.mockResolvedValue([{ id: 5, code: "QUOTATION_ROWS", name: "Cotización", enabled: true, capabilities: [], parameters: [], fields: [] }]);
  createReport.mockImplementation(async (request) => request);
  const user = userEvent.setup();
  render(<ReportConfigurationWizard report={null} initialStepParam={null} />);
  await user.type(screen.getByLabelText("Nombre", { exact: true }), "Cotización E2E");
  await user.type(screen.getByLabelText("Código", { exact: true }), "E2E_33");
  expect(screen.queryByRole("button", { name: "Crear reporte" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByRole("button", { name: "Anterior" }));
  expect((screen.getByLabelText("Nombre", { exact: true }) as HTMLInputElement).value).toBe("Cotización E2E");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.selectOptions(screen.getByLabelText("Fuente de datos", { exact: true }), "5");
  expect(createReport).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Crear reporte" }));
  await waitFor(() => expect(createReport).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "E2E_33", name: "Cotización E2E", data_source_id: 5 })));
  expect(push).toHaveBeenCalledWith("/administracion/reportes/E2E_33/configurar?step=3");
});
