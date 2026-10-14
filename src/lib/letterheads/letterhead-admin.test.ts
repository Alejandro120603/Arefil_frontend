import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  buildAssignmentRows,
  buildAssignmentsWrite,
  canBeDefault,
  LETTERHEAD_SOURCE_MAX_BYTES,
  letterheadFileError,
  letterheadSlugError,
  letterheadUploadErrors,
  moveRow,
  parseLetterheadId,
  suggestLetterheadSlug,
  validateLetterheadCreateForm,
} from "./letterhead-admin";
import type { LetterheadAdmin, ReportLetterheadAssignment } from "@/types/letterhead-admin";

function file(name: string, size = 10): File {
  const value = new File(["x"], name);
  Object.defineProperty(value, "size", { value: size });
  return value;
}

function assignment(overrides: Partial<ReportLetterheadAssignment>): ReportLetterheadAssignment {
  return {
    letterhead_id: 1, slug: "a", display_name: "A", letterhead_is_active: true, is_active: true,
    is_default: false, display_order: 0, current_version: 1, offered: true, ...overrides,
  };
}

function letterhead(id: number, name: string, version: number | null = 1): LetterheadAdmin {
  return {
    id, slug: `l-${id}`, display_name: name, is_active: true, created_at: "", updated_at: "",
    version_count: version ?? 0, assignments: [],
    current_version: version == null ? null : {
      id: id * 10, letterhead_id: id, version, is_current: true, source_filename: "x.xlsx", source_media_type: "",
      source_checksum_sha256: "0".repeat(64), source_size: 1, layout_schema_version: 1, layout_metadata: {},
      created_at: "", created_by_user_id: null, assets: [],
    },
  };
}

describe("letterhead form rules", () => {
  it("suggests a valid slug from a Spanish name", () => {
    expect(suggestLetterheadSlug("Iván Vázquez")).toBe("ivan-vazquez");
    expect(suggestLetterheadSlug("  Asistente de ventas 2 ")).toBe("asistente-de-ventas-2");
    expect(suggestLetterheadSlug("¡¡Olivia -- Banda!!")).toBe("olivia-banda");
    expect(letterheadSlugError(suggestLetterheadSlug("Víctor Vázquez"))).toBeNull();
  });

  it("rejects invalid slugs like the backend does", () => {
    expect(letterheadSlugError("")).toMatch("obligatorio");
    expect(letterheadSlugError("Mayúsculas")).toMatch("minúsculas");
    expect(letterheadSlugError("doble--guion")).toMatch("minúsculas");
    expect(letterheadSlugError("a".repeat(65))).toMatch("64");
    expect(letterheadSlugError("asistente-ventas")).toBeNull();
  });

  it("accepts only non-empty .xlsx files within the size limit", () => {
    expect(letterheadFileError(null)).toMatch("Selecciona");
    expect(letterheadFileError(file("membrete.docx"))).toMatch(".xlsx");
    expect(letterheadFileError(file("membrete.pdf"))).toMatch(".xlsx");
    expect(letterheadFileError(file("membrete.xlsx", 0))).toMatch("vacío");
    expect(letterheadFileError(file("membrete.xlsx", LETTERHEAD_SOURCE_MAX_BYTES + 1))).toMatch("tamaño máximo");
    expect(letterheadFileError(file("MEMBRETE.XLSX"))).toBeNull();
  });

  it("validates the whole create form", () => {
    expect(validateLetterheadCreateForm({ displayName: " ", slug: "x", file: null })).toEqual({
      display_name: "El nombre visible es obligatorio.",
      file: "Selecciona el archivo XLSX del membrete.",
    });
    expect(validateLetterheadCreateForm({ displayName: "A", slug: "a", file: file("a.xlsx") })).toEqual({});
  });

  it("places upload failures on their field", () => {
    expect(letterheadUploadErrors(new ApiError(413, { code: "source_too_large", message: "x" }), "f")).toHaveProperty("file");
    expect(letterheadUploadErrors(new ApiError(411, { code: "length_required", message: "x" }), "f")).toHaveProperty("form");
    expect(letterheadUploadErrors(new ApiError(409, { code: "letterhead_conflict", message: "Ya existe" }), "f"))
      .toEqual({ slug: "Ya existe" });
    expect(letterheadUploadErrors(new ApiError(422, { code: "invalid_slug", message: "slug" }), "f")).toEqual({ slug: "slug" });
    expect(letterheadUploadErrors(new ApiError(422, { code: "dde", message: "DDE no permitido" }), "f"))
      .toEqual({ file: "DDE no permitido" });
    expect(letterheadUploadErrors(new TypeError("fetch failed"), "Fallo")).toEqual({ form: "Fallo" });
  });

  it("parses route ids strictly", () => {
    expect(parseLetterheadId("12")).toBe(12);
    expect(parseLetterheadId("0")).toBeNull();
    expect(parseLetterheadId("1e3")).toBeNull();
    expect(parseLetterheadId("abc")).toBeNull();
  });
});

describe("assignment editor rules", () => {
  const assigned = [
    assignment({ letterhead_id: 2, display_name: "B", display_order: 1, is_active: false }),
    assignment({ letterhead_id: 1, display_name: "A", display_order: 0, is_default: true }),
  ];
  const catalog = [letterhead(1, "A"), letterhead(2, "B"), letterhead(3, "C"), letterhead(4, "D", null)];

  it("lists assignments in display order, then unassigned catalog letterheads", () => {
    const rows = buildAssignmentRows(assigned, catalog);
    expect(rows.map((row) => [row.letterhead_id, row.assigned, row.is_active])).toEqual([
      [1, true, true], [2, true, false], [3, false, false], [4, false, false],
    ]);
  });

  it("never drops a known assignment from the replace body, and adds new ones only when turned on", () => {
    const rows = buildAssignmentRows(assigned, catalog);
    rows[2] = { ...rows[2], is_active: true };
    expect(buildAssignmentsWrite(rows, 1, "rev")).toEqual({
      assignments: [
        { letterhead_id: 1, is_active: true },
        { letterhead_id: 2, is_active: false },
        { letterhead_id: 3, is_active: true },
      ],
      default_letterhead_id: 1,
      expected_revision: "rev",
    });
  });

  it("allows «Sin membrete» as default and refuses an invalid default", () => {
    const rows = buildAssignmentRows(assigned, catalog);
    expect(buildAssignmentsWrite(rows, null, "rev").default_letterhead_id).toBeNull();
    expect(() => buildAssignmentsWrite(rows, 2, "rev")).toThrow("predeterminado");
    expect(() => buildAssignmentsWrite(rows, 99, "rev")).toThrow("predeterminado");
    expect(canBeDefault({ ...rows[3], is_active: true })).toBe(false); // no version
    expect(canBeDefault({ ...rows[0], letterhead_is_active: false })).toBe(false);
  });

  it("moves rows within bounds only", () => {
    expect(moveRow([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveRow([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(moveRow([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveRow([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
