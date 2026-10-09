import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  SAVE_CONFLICT_MESSAGE,
  TEMPLATE_INCOMPATIBLE_MESSAGE,
  issueLocation,
  issueReason,
  placeholderLabelResolver,
  reportSaveFailure,
  reportSaveFailureMessage,
} from "@/lib/reports/report-save-errors";

const INCOMPATIBLE = new ApiError(422, {
  code: "ACTIVE_TEMPLATE_INCOMPATIBLE",
  message: "La plantilla Excel activa utiliza datos que ya no existirían.",
  template_version: 3,
  issues: [
    { placeholder: "parameters.customer_name", sheet: "Cotización", cell: "B2", range: null, reason: "unknown_placeholder" },
    { placeholder: "rows.unit_price", sheet: "Cotización", cell: "C14", range: null, reason: "something_new" },
  ],
});

describe("reportSaveFailure", () => {
  it("keeps a plain string detail as the message", () => {
    expect(reportSaveFailure(new ApiError(422, "El contexto no es válido."), "fallback")).toEqual({
      kind: "message", message: "El contexto no es válido.",
    });
  });

  it("reads ACTIVE_TEMPLATE_INCOMPATIBLE into structured issues", () => {
    const failure = reportSaveFailure(INCOMPATIBLE, "fallback");
    expect(failure).toEqual({
      kind: "template",
      message: TEMPLATE_INCOMPATIBLE_MESSAGE,
      templateVersion: 3,
      issues: [
        { placeholder: "parameters.customer_name", sheet: "Cotización", cell: "B2", range: null, reason: "unknown_placeholder" },
        { placeholder: "rows.unit_price", sheet: "Cotización", cell: "C14", range: null, reason: "something_new" },
      ],
    });
  });

  it("treats any other object detail as a message, never as a template issue", () => {
    expect(reportSaveFailure(new ApiError(422, { code: "OTHER", message: "Otro" }), "fallback")).toEqual({ kind: "message", message: "Otro" });
    expect(reportSaveFailure(new ApiError(422, [{ loc: ["body", "name"], msg: "requerido" }]), "fallback").kind).toBe("message");
  });

  it("reads REPORT_NOT_READY into readiness issues", () => {
    const failure = reportSaveFailure(new ApiError(422, {
      code: "REPORT_NOT_READY",
      message: "El reporte todavía tiene configuraciones pendientes.",
      issues: [
        { code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Configura las columnas." },
        { code: "TEMPLATE_MISSING", severity: "warning", step: "template", message: "Sin plantilla." },
      ],
    }), "fallback");
    expect(failure).toEqual({
      kind: "not-ready",
      message: "El reporte todavía tiene configuraciones pendientes.",
      issues: [
        { code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Configura las columnas." },
        { code: "TEMPLATE_MISSING", severity: "warning", step: "template", message: "Sin plantilla." },
      ],
    });
  });

  it("summarizes REPORT_NOT_READY with its blockers on one line", () => {
    expect(reportSaveFailureMessage(new ApiError(422, {
      code: "REPORT_NOT_READY",
      message: "Pendientes.",
      issues: [{ code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Configura las columnas." }],
    }), "fallback")).toBe("Pendientes. Configura las columnas.");
  });

  it("maps a 409 to a temporary conflict, not to an incompatible template", () => {
    expect(reportSaveFailure(new ApiError(409, "La plantilla Excel activa cambió."), "fallback")).toEqual({
      kind: "conflict", message: SAVE_CONFLICT_MESSAGE,
    });
  });

  it("falls back on transport errors", () => {
    expect(reportSaveFailure(new Error("fetch failed"), "No se pudo guardar.")).toEqual({ kind: "message", message: "No se pudo guardar." });
  });

  it("summarizes on one line for small surfaces", () => {
    expect(reportSaveFailureMessage(INCOMPATIBLE, "fallback")).toBe(`${TEMPLATE_INCOMPATIBLE_MESSAGE} (Cotización!B2, Cotización!C14)`);
  });
});

describe("issue presentation", () => {
  it("has copy for known reasons and a safe fallback for new ones", () => {
    const failure = reportSaveFailure(INCOMPATIBLE, "fallback");
    if (failure.kind !== "template") throw new Error("expected a template failure");
    expect(issueReason(failure.issues[0])).toBe("ya no existiría");
    expect(issueReason(failure.issues[1])).toBe("no sería compatible");
    expect(issueLocation(failure.issues[1])).toBe("Cotización!C14");
  });

  it("resolves a human label, falling back to the placeholder", () => {
    const resolve = placeholderLabelResolver({
      parameters: [{ name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: false, default_value: null, display_order: 0, configuration_json: null }],
    });
    expect(resolve("parameters.customer_name")).toBe("Cliente");
    expect(resolve("rows.unit_price")).toBe("rows.unit_price");
  });
});
