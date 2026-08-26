// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportRuntimeParameters } from "./report-runtime-parameters";
import type { ReportParameter } from "@/types/api";

const { getReportParameterOptions } = vi.hoisted(() => ({ getReportParameterOptions: vi.fn() }));
vi.mock("@/lib/api/reports", () => ({ getReportParameterOptions }));

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
    getReportParameterOptions.mockResolvedValue([{ value: 8, label: "DONALDSON · Donaldson" }]);
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
    getReportParameterOptions.mockRejectedValue(new Error("network"));
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
});
