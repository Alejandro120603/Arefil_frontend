// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportRuntimeParameters } from "./report-runtime-parameters";
import type { ReportParameter } from "@/types/api";

const { listAllReportParameterOptions } = vi.hoisted(() => ({ listAllReportParameterOptions: vi.fn() }));
vi.mock("@/lib/api/reports", () => ({ listAllReportParameterOptions }));

function parameter(name: string, input_type: ReportParameter["input_type"], data_type: ReportParameter["data_type"], display_order: number): ReportParameter {
  return { name, label: name, input_type, data_type, display_order, required: true, default_value: null, configuration_json: input_type === "select" ? { options_source: "suppliers" } : null };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportRuntimeParameters", () => {
  it("renders every metadata control in display order and reports changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    listAllReportParameterOptions.mockResolvedValue([{ value: 8, label: "DONALDSON · Donaldson" }]);
    const parameters = [
      parameter("choice", "select", "integer", 5),
      parameter("active", "checkbox", "boolean", 4),
      parameter("when", "datetime", "datetime", 3),
      parameter("day", "date", "date", 2),
      parameter("count", "number", "integer", 1),
      parameter("name", "text", "string", 0),
    ];
    render(<ReportRuntimeParameters code="GENERIC" parameters={parameters} values={{}} onChange={onChange} />);

    expect(screen.getAllByText(/ \*$/).map((label) => label.textContent)).toEqual([
      "name *", "count *", "day *", "when *", "active *", "choice *",
    ]);
    await user.type(screen.getByLabelText("name *"), "A");
    expect(onChange).toHaveBeenCalledWith("name", "A");
    await waitFor(() => expect(screen.getByRole("option", { name: "DONALDSON · Donaldson" })).toBeTruthy());
  });

  it("shows option-source failures and field validation messages", async () => {
    listAllReportParameterOptions.mockRejectedValue(new Error("network"));
    render(
      <ReportRuntimeParameters
        code="GENERIC"
        parameters={[parameter("supplier", "select", "integer", 0)]}
        values={{ supplier: "" }}
        errors={{ supplier: "Este campo es requerido." }}
        onChange={vi.fn()}
      />,
    );
    expect(await screen.findByText("No se pudieron cargar las opciones de los parámetros.")).toBeTruthy();
    expect(screen.getByText("Este campo es requerido.")).toBeTruthy();
    expect(screen.getByLabelText("supplier *").getAttribute("aria-invalid")).toBe("true");
  });

  it("explains that a blank Folio is generated and bounds the quotation contact texts", () => {
    const contact = (name: string, label: string, display_order: number): ReportParameter => ({
      ...parameter(name, "text", "string", display_order), label, required: false,
    });
    render(
      <ReportRuntimeParameters
        code="PRODUCTOS_DESCUENTO"
        parameters={[contact("cliente", "Cliente", 1), contact("atencion", "Atención", 2), contact("folio", "Folio", 3), parameter("notes", "text", "string", 4)]}
        values={{}}
        onChange={vi.fn()}
      />,
    );
    const folio = screen.getByLabelText("Folio") as HTMLInputElement;
    const hint = screen.getByText("Si lo dejas vacío, el sistema genera un folio automáticamente.");
    expect(folio.required).toBe(false);
    expect(folio.getAttribute("aria-describedby")).toBe(hint.id);
    for (const label of ["Cliente", "Atención", "Folio"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).maxLength).toBe(120);
    }
    // Only the folio has a hint; an unrelated text keeps no length bound.
    expect(screen.getAllByText(/genera un folio/)).toHaveLength(1);
    expect((screen.getByLabelText("notes *") as HTMLInputElement).maxLength).toBe(-1);
  });

  it("keeps another report's `folio` an ordinary text and drops the hint reference behind an error", () => {
    const folio = { ...parameter("folio", "text", "string", 0), label: "Folio", required: false };
    const { unmount } = render(<ReportRuntimeParameters code="MI_REPORTE" parameters={[folio]} values={{}} onChange={vi.fn()} />);
    expect(screen.queryByText(/genera un folio/)).toBeNull();
    expect((screen.getByLabelText("Folio") as HTMLInputElement).maxLength).toBe(-1);
    unmount();

    render(
      <ReportRuntimeParameters code="PRODUCTOS_DESCUENTO" parameters={[folio]} values={{}} errors={{ folio: "Inválido." }} onChange={vi.fn()} />,
    );
    const input = screen.getByLabelText("Folio") as HTMLInputElement;
    expect(screen.queryByText(/genera un folio/)).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe("runtime-folio-error");
    expect(screen.getByText("Inválido.").id).toBe("runtime-folio-error");
  });
});
