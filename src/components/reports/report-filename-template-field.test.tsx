// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportFilenameTemplateField } from "./report-filename-template-field";
import type { ReportParameter } from "@/types/api";

function parameter(name: string, label: string, default_value: unknown = null): ReportParameter {
  return {
    name, label, data_type: "string", input_type: "text", required: false,
    default_value, display_order: 0, configuration_json: null,
  };
}

const PARAMETERS = [
  parameter("customer_name", "Cliente", "BONATTI FILTROS"),
  parameter("requisition", "Requisición", "LMR850205-048"),
];

function renderField(props: Partial<Parameters<typeof ReportFilenameTemplateField>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <ReportFilenameTemplateField
      value=""
      code="COTIZACION"
      name="Cotización"
      parameters={PARAMETERS}
      onChange={onChange}
      {...props}
    />,
  );
  return onChange;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportFilenameTemplateField", () => {
  it("announces the generic fallback while no pattern is configured", () => {
    renderField();

    expect((screen.getByLabelText("Patrón del nombre") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("cotizacion-document.xlsx")).toBeTruthy();
    expect(screen.queryByText(/^Ejemplo:/)).toBeNull();
  });

  it("only offers the placeholders the backend supports", () => {
    renderField();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "{{parameters.customer_name}}",
      "{{parameters.requisition}}",
      "{{report.code}}",
      "{{report.name}}",
    ]);
  });

  it("appends a placeholder to the edited pattern when clicked", async () => {
    const user = userEvent.setup();
    const onChange = renderField({ value: "{{parameters.customer_name}} " });

    await user.click(screen.getByRole("button", { name: "{{parameters.requisition}}" }));

    expect(onChange).toHaveBeenCalledWith("{{parameters.customer_name}} {{parameters.requisition}}");
  });

  it("previews the final name with the sample values available", () => {
    renderField({ value: "{{parameters.customer_name}} {{parameters.requisition}}" });

    expect(screen.getByText("BONATTI_FILTROS_LMR850205-048.xlsx")).toBeTruthy();
  });

  it("withholds the preview instead of inventing a value it does not have", () => {
    renderField({
      value: "{{parameters.customer_name}}-{{parameters.requisition}}",
      parameters: [PARAMETERS[0], parameter("requisition", "Requisición")],
    });

    expect(screen.getByText(/No hay datos de ejemplo para \{\{parameters.requisition\}\}/)).toBeTruthy();
    expect(screen.queryByText(/^Ejemplo:/)).toBeNull();
  });

  it("flags an unsupported placeholder before the request reaches the backend", () => {
    renderField({ value: "{{execution.id}}" });

    expect(screen.getByText("Placeholder no permitido en el nombre de archivo: {{execution.id}}.")).toBeTruthy();
  });
});
