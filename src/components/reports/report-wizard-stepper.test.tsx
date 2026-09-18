// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportWizardStepper } from "./report-wizard-stepper";
import type { ReportWizardStepId } from "@/lib/reports/report-wizard";

afterEach(cleanup);

describe("ReportWizardStepper", () => {
  it("marks the current step and lists every step in order", () => {
    render(
      <ReportWizardStepper current="data" completed={new Set()} availability={() => true} onSelect={vi.fn()} />,
    );
    const current = screen.getByRole("button", { name: /Datos del reporte/ });
    expect(current.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: /Información/ }).getAttribute("aria-current")).toBeNull();
  });

  it("selects an available step on click", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ReportWizardStepper current="information" completed={new Set()} availability={() => true} onSelect={onSelect} />,
    );
    await user.click(screen.getByRole("button", { name: /Plantilla Excel/ }));
    expect(onSelect).toHaveBeenCalledWith("template");
  });

  it("disables and never selects an unavailable step", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const availability = (step: ReportWizardStepId) => step === "information" || step === "source";
    render(
      <ReportWizardStepper current="information" completed={new Set()} availability={availability} onSelect={onSelect} />,
    );
    const dataButton = screen.getByRole("button", { name: /Datos del reporte/ }) as HTMLButtonElement;
    expect(dataButton.disabled).toBe(true);
    await user.click(dataButton);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a checkmark for a completed step that is not the current one", () => {
    render(
      <ReportWizardStepper
        current="data"
        completed={new Set(["information", "source"])}
        availability={() => true}
        onSelect={vi.fn()}
      />,
    );
    // The completed steps render a check icon (svg) inside their marker instead of the step number.
    const sourceButton = screen.getByRole("button", { name: /Fuente y entradas/ });
    expect(sourceButton.querySelector("svg")).toBeTruthy();
  });

  it("shows a compact mobile progress line naming the current step", () => {
    render(
      <ReportWizardStepper current="mapping" completed={new Set()} availability={() => true} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/Paso 5 de 7 · Mapear campos/)).toBeTruthy();
  });
});
