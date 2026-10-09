import { describe, expect, it } from "vitest";
import {
  parseReadinessIssues,
  readinessDestination,
  readinessSections,
  reportOperationalStatus,
} from "@/lib/reports/report-readiness";
import type { ReportReadiness, ReportReadinessIssue } from "@/types/api";

function readiness(issues: ReportReadinessIssue[]): ReportReadiness {
  return { report_code: "R", enabled: false, ready: !issues.some((issue) => issue.severity === "blocker"), issues };
}

describe("readinessDestination", () => {
  it("maps every known semantic step to its wizard step, and nothing else", () => {
    expect(["information", "source", "data", "template", "mapping"].map(readinessDestination)).toEqual([
      "information", "source", "data", "template", "mapping",
    ]);
    expect(readinessDestination("billing")).toBeNull();
    expect(readinessDestination(null)).toBeNull();
    expect(readinessDestination("")).toBeNull();
  });
});

describe("readinessSections", () => {
  it("shows every evaluated section, ✓ when clean, grouped in wizard order", () => {
    const sections = readinessSections(readiness([
      { code: "TEMPLATE_UNMAPPED", severity: "warning", step: "mapping", message: "Sin campos." },
      { code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Sin columnas." },
      { code: "BUILDER_INVALID", severity: "blocker", step: "data", message: "Fórmula rota." },
    ]));

    expect(sections.map((section) => [section.step, section.severity, section.issues.length])).toEqual([
      ["source", null, 0],
      ["data", "blocker", 2],
      ["template", null, 0],
      ["mapping", "warning", 1],
    ]);
  });

  it("never hides an issue with an unknown step", () => {
    const sections = readinessSections(readiness([
      { code: "NEW", severity: "warning", step: "billing", message: "Algo nuevo." },
    ]));
    expect(sections.at(-1)).toMatchObject({ step: null, title: "Otros", destination: null, severity: "warning" });
  });
});

describe("reportOperationalStatus", () => {
  it("combines enabled with readiness in four states", () => {
    expect(reportOperationalStatus(true, { ready: true }, "ready").label).toBe("Habilitado · Listo");
    expect(reportOperationalStatus(true, { ready: false }, "ready").label).toBe("Habilitado · Requiere atención");
    expect(reportOperationalStatus(false, { ready: true }, "ready").label).toBe("Listo para habilitar");
    expect(reportOperationalStatus(false, { ready: false }, "ready").label).toBe("Configuración pendiente");
  });

  it("reports unknown, never 'not ready', while loading or after an error", () => {
    expect(reportOperationalStatus(false, null, "loading").key).toBe("loading");
    expect(reportOperationalStatus(false, null, "error").label).toBe("Estado no disponible");
    expect(reportOperationalStatus(true, null, "error").label).toBe("Habilitado · Estado no disponible");
  });
});

describe("parseReadinessIssues", () => {
  it("keeps only well-formed issues", () => {
    expect(parseReadinessIssues([
      { code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Sin columnas." },
      { code: "X", severity: "fatal", step: "data", message: "?" },
      "nope",
      { code: "NULL_STEP", severity: "warning", step: null, message: "Sin paso." },
    ])).toEqual([
      { code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Sin columnas." },
      { code: "NULL_STEP", severity: "warning", step: "", message: "Sin paso." },
    ]);
    expect(parseReadinessIssues(undefined)).toEqual([]);
  });
});
