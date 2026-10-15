// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { LetterheadAdmin, ReportLetterheadAssignments } from "@/types/letterhead-admin";

const api = vi.hoisted(() => ({
  listLetterheads: vi.fn(),
  createLetterhead: vi.fn(),
  updateLetterhead: vi.fn(),
  getReportLetterheadAssignments: vi.fn(),
  replaceReportLetterheadAssignments: vi.fn(),
  letterheadVersionThumbnailPath: (id: number, version: number) => `/admin/letterheads/${id}/versions/${version}/thumbnail`,
}));
vi.mock("@/lib/api/letterhead-admin", () => api);
const { fetchProtectedImage } = vi.hoisted(() => ({ fetchProtectedImage: vi.fn() }));
vi.mock("@/lib/api/protected-image", () => ({ fetchProtectedImage }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import { LetterheadAdminWorkspace } from "./letterhead-admin-workspace";

function letterhead(id: number, name: string, overrides: Partial<LetterheadAdmin> = {}): LetterheadAdmin {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    display_name: name,
    is_active: true,
    created_at: "2026-10-13T12:00:00Z",
    updated_at: "2026-10-13T12:00:00Z",
    version_count: 1,
    current_version: {
      id: id * 10, letterhead_id: id, version: 1, is_current: true, source_filename: `${id}.xlsx`,
      source_media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      source_checksum_sha256: "a".repeat(64), source_size: 120_000, layout_schema_version: 1, layout_metadata: {},
      created_at: "2026-10-13T12:00:00Z", created_by_user_id: 1,
      assets: [{ role: "thumbnail", media_type: "image/png", width: 340, height: 440, size_bytes: 9_000, checksum_sha256: "b".repeat(64) }],
    },
    assignments: [],
    ...overrides,
  };
}

const ASISTENTE = letterhead(1, "Asistente de ventas", {
  assignments: [{ report_code: "PRUEBA_COTIZACION", is_active: true, is_default: true, display_order: 0 }],
});
const OLIVIA = letterhead(2, "Olivia Banda");

function assignments(code: string, overrides: Partial<ReportLetterheadAssignments> = {}): ReportLetterheadAssignments {
  return { report_code: code, revision: `${code}-r1`, default_letterhead_id: null, assignments: [], ...overrides };
}

const COTIZACION_STATE = assignments("PRUEBA_COTIZACION", {
  default_letterhead_id: 1,
  assignments: [{
    letterhead_id: 1, slug: "asistente-de-ventas", display_name: "Asistente de ventas", letterhead_is_active: true,
    is_active: true, is_default: true, display_order: 0, current_version: 1, offered: true,
  }],
});

function xlsx(name = "membrete.xlsx", size = 1024): File {
  const file = new File(["PK"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

beforeEach(() => {
  fetchProtectedImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  api.getReportLetterheadAssignments.mockImplementation((code: string) =>
    Promise.resolve(code === "PRUEBA_COTIZACION" ? COTIZACION_STATE : assignments(code)));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function cotizacionPanel() {
  return screen.findByRole("tabpanel", { name: "Cotización" });
}

describe("LetterheadAdminWorkspace", () => {
  it("shows the empty catalog the backend returns without inventing letterheads", async () => {
    api.listLetterheads.mockResolvedValue([]);
    api.getReportLetterheadAssignments.mockResolvedValue(assignments("PRUEBA_COTIZACION"));
    render(<LetterheadAdminWorkspace />);
    expect(screen.getByLabelText("Cargando membretes")).toBeTruthy();
    expect(await screen.findByText("Todavía no hay membretes")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    const panel = await cotizacionPanel();
    expect(await within(panel).findByText(/Todavía no hay membretes en el catálogo/)).toBeTruthy();
  });

  it("lists each letterhead with thumbnail, slug, state, version and assigned reports", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, { ...OLIVIA, is_active: false, current_version: null, version_count: 0 }]);
    render(<LetterheadAdminWorkspace />);
    const card = (await screen.findByRole("heading", { name: "Asistente de ventas" })).closest("[data-slot=card]") as HTMLElement;
    expect(within(card).getByText("asistente-de-ventas")).toBeTruthy();
    expect(within(card).getByText("Activo")).toBeTruthy();
    expect(within(card).getByText("Versión 1")).toBeTruthy();
    expect(within(card).getByText("Cotización · predeterminado")).toBeTruthy();
    expect(await within(card).findByRole("img", { name: "Miniatura del membrete Asistente de ventas" })).toBeTruthy();
    expect(fetchProtectedImage).toHaveBeenCalledWith("/admin/letterheads/1/versions/1/thumbnail", expect.anything());
    expect(within(card).getByRole("link", { name: "Versiones y detalle de Asistente de ventas" }).getAttribute("href"))
      .toBe("/administracion/membretes/1");

    const inactive = screen.getByRole("heading", { name: "Olivia Banda" }).closest("[data-slot=card]") as HTMLElement;
    expect(within(inactive).getByText("Inactivo")).toBeTruthy();
    expect(within(inactive).getByText("Sin versiones")).toBeTruthy();
    expect(within(inactive).getByText("Miniatura no disponible")).toBeTruthy();
    expect(within(inactive).getByRole("button", { name: "Reactivar Olivia Banda" })).toBeTruthy();
  });

  it("keeps the catalog usable when one thumbnail fails", async () => {
    fetchProtectedImage.mockImplementation((path: string) =>
      path.includes("/letterheads/1/") ? Promise.reject(new ApiError(500, null)) : Promise.resolve(new Blob(["p"], { type: "image/png" })));
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    render(<LetterheadAdminWorkspace />);
    expect(await screen.findByText("Miniatura no disponible")).toBeTruthy();
    expect(await screen.findByRole("img", { name: "Miniatura del membrete Olivia Banda" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Asistente de ventas" })).toBeTruthy();
  });

  it("reports a server error and retries on request", async () => {
    api.listLetterheads.mockRejectedValueOnce(new ApiError(500, "Fallo del servidor.")).mockResolvedValueOnce([OLIVIA]);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    expect(await screen.findByText("Fallo del servidor.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Olivia Banda" })).toBeTruthy();
  });

  it("says so when the backend refuses the permission", async () => {
    api.listLetterheads.mockRejectedValue(new ApiError(403, "Permisos insuficientes."));
    render(<LetterheadAdminWorkspace />);
    expect(await screen.findByText("No tienes permisos para administrar membretes.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Nuevo membrete" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.queryByText("Disponibilidad por reporte")).toBeNull();
  });

  it("creates a letterhead from a valid XLSX and refreshes the catalog", async () => {
    api.listLetterheads.mockResolvedValueOnce([]).mockResolvedValue([letterhead(5, "Iván Vázquez")]);
    api.createLetterhead.mockResolvedValue(letterhead(5, "Iván Vázquez"));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    await screen.findByText("Todavía no hay membretes");
    await user.click(screen.getByRole("button", { name: "Nuevo membrete" }));

    await user.click(screen.getByRole("button", { name: "Crear membrete" }));
    expect(screen.getByText("El nombre visible es obligatorio.")).toBeTruthy();
    expect(screen.getByText("Selecciona el archivo XLSX del membrete.")).toBeTruthy();
    expect(api.createLetterhead).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Nombre visible *"), "Iván Vázquez");
    expect((screen.getByLabelText("Identificador *") as HTMLInputElement).value).toBe("ivan-vazquez");
    const input = screen.getByLabelText("Archivo XLSX *");
    await user.upload(input, xlsx());
    await user.click(screen.getByRole("button", { name: "Crear membrete" }));

    await waitFor(() => expect(api.createLetterhead).toHaveBeenCalledWith({
      slug: "ivan-vazquez", display_name: "Iván Vázquez", file: expect.any(File),
    }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("Se creó «Iván Vázquez» con su versión 1."));
    expect(await screen.findByRole("heading", { name: "Iván Vázquez" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Crear membrete" })).toBeNull();
  });

  it("refuses a wrong file type and an oversized file before uploading", async () => {
    api.listLetterheads.mockResolvedValue([]);
    const user = userEvent.setup({ applyAccept: false });
    render(<LetterheadAdminWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Nuevo membrete" }));
    await user.type(screen.getByLabelText("Nombre visible *"), "Olivia Banda");
    await user.upload(screen.getByLabelText("Archivo XLSX *"), new File(["x"], "membrete.docx"));
    await user.click(screen.getByRole("button", { name: "Crear membrete" }));
    expect(screen.getByText(/Solo se aceptan archivos .xlsx/)).toBeTruthy();
    await user.upload(screen.getByLabelText("Archivo XLSX *"), xlsx("grande.xlsx", 9_000_000));
    await user.click(screen.getByRole("button", { name: "Crear membrete" }));
    expect(screen.getByText(/excede el tamaño máximo permitido/)).toBeTruthy();
    expect(api.createLetterhead).not.toHaveBeenCalled();
  });

  it("shows backend rejections on the right field (taken slug, 413, invalid workbook)", async () => {
    api.listLetterheads.mockResolvedValue([]);
    api.createLetterhead
      .mockRejectedValueOnce(new ApiError(409, { code: "letterhead_conflict", message: "Ya existe un membrete con el slug 'olivia-banda'." }))
      .mockRejectedValueOnce(new ApiError(413, { code: "source_too_large", message: "El archivo excede 8000000 bytes." }))
      .mockRejectedValueOnce(new ApiError(422, { code: "dde", message: "El archivo contiene vínculos DDE." }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Nuevo membrete" }));
    await user.type(screen.getByLabelText("Nombre visible *"), "Olivia Banda");
    await user.upload(screen.getByLabelText("Archivo XLSX *"), xlsx());
    await user.click(screen.getByRole("button", { name: "Crear membrete" }));
    expect(await screen.findByText("Ya existe un membrete con el slug 'olivia-banda'.")).toBeTruthy();
    expect(screen.getByLabelText("Identificador *").getAttribute("aria-invalid")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Crear membrete" }));
    expect(await screen.findByText("El archivo excede el tamaño máximo que acepta el servidor.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Crear membrete" }));
    expect(await screen.findByText("El archivo contiene vínculos DDE.")).toBeTruthy();
    // The chosen file is kept for every retry.
    expect(api.createLetterhead).toHaveBeenCalledTimes(3);
  });

  it("deactivates only after a confirmation that explains the consequences", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE]);
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Desactivar Asistente de ventas" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Dejará de estar disponible para nuevas selecciones/)).toBeTruthy();
    expect(within(dialog).getByText(/dejará de serlo y la opción inicial volverá a ser «Sin membrete»/)).toBeTruthy();
    expect(within(dialog).getByText(/Las ejecuciones ya generadas conservan la versión/)).toBeTruthy();
    expect(within(dialog).getByText(/No se elimina nada/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(api.updateLetterhead).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Desactivar Asistente de ventas" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desactivar membrete" }));
    await waitFor(() => expect(api.updateLetterhead).toHaveBeenCalledWith(1, { is_active: false }));
    expect(await screen.findByText(/fue desactivado. Las ejecuciones ya generadas conservan su versión./)).toBeTruthy();
    // The catalog and the assignments are read again (the default may have been cleared).
    await waitFor(() => expect(api.listLetterheads).toHaveBeenCalledTimes(2));
  });

  it("reactivates without a confirmation and refreshes the catalog", async () => {
    const inactive = { ...OLIVIA, is_active: false };
    api.listLetterheads.mockResolvedValueOnce([inactive]).mockResolvedValue([OLIVIA]);
    api.updateLetterhead.mockResolvedValue(OLIVIA);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    await user.click(await screen.findByRole("button", { name: "Reactivar Olivia Banda" }));
    await waitFor(() => expect(api.updateLetterhead).toHaveBeenCalledWith(2, { is_active: true }));
    expect(await screen.findByRole("button", { name: "Desactivar Olivia Banda" })).toBeTruthy();
    expect(api.listLetterheads).toHaveBeenCalledTimes(2);
  });
});

describe("report assignments", () => {
  it("assigns, reorders and picks a default for Cotización in a single complete PUT", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    api.replaceReportLetterheadAssignments.mockImplementation((code: string, body: { default_letterhead_id: number | null }) =>
      Promise.resolve({ ...COTIZACION_STATE, revision: "r2", default_letterhead_id: body.default_letterhead_id }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membretes disponibles y orden");
    const save = within(panel).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await user.click(within(panel).getByRole("checkbox", { name: /Olivia Banda/ }));
    await user.click(within(panel).getByRole("button", { name: "Subir Olivia Banda" }));
    await user.click(within(panel).getByRole("radio", { name: "Olivia Banda" }));
    expect(within(panel).getByText("Hay cambios sin guardar.")).toBeTruthy();
    await user.click(save);

    await waitFor(() => expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledTimes(1));
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledWith("PRUEBA_COTIZACION", {
      assignments: [
        { letterhead_id: 2, is_active: true },
        { letterhead_id: 1, is_active: true },
      ],
      default_letterhead_id: 2,
      expected_revision: "PRUEBA_COTIZACION-r1",
    });
    expect(await within(panel).findByText("Se guardaron los membretes de Cotización.")).toBeTruthy();
  });

  it("can set «Sin membrete» as the default and keeps the deactivated assignment in the body", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE]);
    api.replaceReportLetterheadAssignments.mockResolvedValue({ ...COTIZACION_STATE, revision: "r2", default_letterhead_id: null });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("checkbox", { name: /Asistente de ventas/ }));
    // Turning off the default falls back to «Sin membrete», and says so.
    expect(within(panel).getByText(/la opción inicial vuelve a ser «Sin membrete»/)).toBeTruthy();
    expect((within(panel).getByRole("radio", { name: "Sin membrete — formato actual" }) as HTMLInputElement).checked).toBe(true);
    expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull();
    await user.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledWith("PRUEBA_COTIZACION", {
      assignments: [{ letterhead_id: 1, is_active: false }],
      default_letterhead_id: null,
      expected_revision: "PRUEBA_COTIZACION-r1",
    }));
  });

  it("edits Descuento independently from Cotización", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    api.replaceReportLetterheadAssignments.mockResolvedValue(assignments("PRUEBA_DESCUENTO", { revision: "d2" }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    await user.click(await screen.findByRole("tab", { name: "Descuento" }));
    const panel = screen.getByRole("tabpanel", { name: "Descuento" });
    await user.click(await within(panel).findByRole("checkbox", { name: /Asistente de ventas/ }));
    await user.click(within(panel).getByRole("radio", { name: "Asistente de ventas" }));
    await user.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledWith("PRUEBA_DESCUENTO", {
      assignments: [{ letterhead_id: 1, is_active: true }],
      default_letterhead_id: 1,
      expected_revision: "PRUEBA_DESCUENTO-r1",
    }));
  });

  it("stops on a stale revision, never retries by itself and reloads only when asked", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    api.replaceReportLetterheadAssignments.mockRejectedValue(
      new ApiError(409, { code: "letterhead_conflict", message: "Las asignaciones de membretes cambiaron." }),
    );
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("checkbox", { name: /Olivia Banda/ }));
    await user.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(panel).findByText(/Otra persona modificó los membretes de Cotización/)).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledTimes(1);
    const reads = api.getReportLetterheadAssignments.mock.calls.filter(([code]) => code === "PRUEBA_COTIZACION").length;

    await user.click(within(panel).getByRole("button", { name: "Recargar datos" }));
    await waitFor(() => expect(
      api.getReportLetterheadAssignments.mock.calls.filter(([code]) => code === "PRUEBA_COTIZACION").length,
    ).toBe(reads + 1));
    expect(await within(panel).findByRole("checkbox", { name: /Olivia Banda/ })).toHaveProperty("checked", false);
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledTimes(1);
  });

  it("is operable with the keyboard alone", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    const olivia = await within(panel).findByRole("checkbox", { name: /Olivia Banda/ });
    olivia.focus();
    await user.keyboard(" ");
    expect((olivia as HTMLInputElement).checked).toBe(true);
    const none = within(panel).getByRole("radio", { name: "Sin membrete — formato actual" });
    none.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("type")).toBe("radio");
    const buttons = within(panel).getAllByRole("button");
    for (const button of buttons) expect(button.tagName).toBe("BUTTON");
  });

  it("lays out the catalog in a single column on narrow screens", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    render(<LetterheadAdminWorkspace />);
    const list = (await screen.findByRole("heading", { name: "Asistente de ventas" })).closest("ul") as HTMLElement;
    // No base column count: one column until the `sm` breakpoint.
    expect(list.className).toMatch(/^grid gap-4 sm:grid-cols-2 xl:grid-cols-3$/);
    const panel = await cotizacionPanel();
    const row = (await within(panel).findByRole("checkbox", { name: /Olivia Banda/ })).closest("li") as HTMLElement;
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("sm:flex-row");
  });

  it("keeps an unsaved draft when a background refresh fails, and retries without discarding it", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    api.replaceReportLetterheadAssignments.mockResolvedValue(assignments("PRUEBA_DESCUENTO", { revision: "d2" }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const cotizacion = await cotizacionPanel();
    await user.click(await within(cotizacion).findByRole("checkbox", { name: /Olivia Banda/ }));
    // Saving Descuento refreshes every editor; Cotización's read fails.
    api.getReportLetterheadAssignments.mockImplementation((code: string) =>
      code === "PRUEBA_COTIZACION" ? Promise.reject(new ApiError(503, "Servicio no disponible.")) : Promise.resolve(assignments(code)));
    await user.click(screen.getByRole("tab", { name: "Descuento" }));
    const descuento = screen.getByRole("tabpanel", { name: "Descuento" });
    await user.click(await within(descuento).findByRole("checkbox", { name: /Asistente de ventas/ }));
    await user.click(within(descuento).getByRole("button", { name: "Guardar cambios" }));
    await user.click(screen.getByRole("tab", { name: "Cotización" }));
    expect(await within(cotizacion).findByText(/Tus cambios sin guardar se conservan/)).toBeTruthy();
    expect(within(cotizacion).getByRole("checkbox", { name: /Olivia Banda/ })).toHaveProperty("checked", true);
    api.getReportLetterheadAssignments.mockImplementation((code: string) =>
      Promise.resolve(code === "PRUEBA_COTIZACION" ? COTIZACION_STATE : assignments(code)));
    await user.click(within(cotizacion).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(within(cotizacion).queryByText(/Tus cambios sin guardar se conservan/)).toBeNull());
    expect(within(cotizacion).getByRole("checkbox", { name: /Olivia Banda/ })).toHaveProperty("checked", true);
    expect(within(cotizacion).getByText("Hay cambios sin guardar.")).toBeTruthy();
  });

  it("follows letterhead state changes in a draft without touching the admin's choices", async () => {
    const inactive = { ...OLIVIA, is_active: false };
    api.listLetterheads.mockResolvedValueOnce([ASISTENTE, inactive]).mockResolvedValue([ASISTENTE, OLIVIA]);
    api.getReportLetterheadAssignments.mockImplementation((code: string) => Promise.resolve(
      code === "PRUEBA_COTIZACION"
        ? { ...COTIZACION_STATE, assignments: [...COTIZACION_STATE.assignments, {
          letterhead_id: 2, slug: "olivia-banda", display_name: "Olivia Banda", letterhead_is_active: false,
          is_active: false, is_default: false, display_order: 1, current_version: 1, offered: false,
        }] }
        : assignments(code)));
    api.updateLetterhead.mockResolvedValue(OLIVIA);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("checkbox", { name: /Olivia Banda/ }));
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
    expect(within(panel).queryByRole("radio", { name: "Olivia Banda" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
    expect(within(panel).getByRole("checkbox", { name: /Olivia Banda/ })).toHaveProperty("checked", true);
  });

  it("does not list reports for an inactive letterhead whose assignments were kept", async () => {
    api.listLetterheads.mockResolvedValue([{ ...ASISTENTE, is_active: false }]);
    render(<LetterheadAdminWorkspace />);
    const card = (await screen.findByRole("heading", { name: "Asistente de ventas" })).closest("[data-slot=card]") as HTMLElement;
    expect(within(card).getByText("Ningún reporte mientras esté inactivo")).toBeTruthy();
    expect(within(card).queryByText(/Cotización/)).toBeNull();
  });

  it("after a conflict reload trusts the fresher assignment read over an older catalog", async () => {
    // The catalog on screen still says Olivia is inactive; another admin reactivated it.
    api.listLetterheads.mockResolvedValue([ASISTENTE, { ...OLIVIA, is_active: false }]);
    const olivia = (active: boolean) => ({
      letterhead_id: 2, slug: "olivia-banda", display_name: "Olivia Banda", letterhead_is_active: active,
      is_active: true, is_default: false, display_order: 1, current_version: 1, offered: active,
    });
    api.getReportLetterheadAssignments.mockImplementation((code: string) => Promise.resolve(code === "PRUEBA_COTIZACION"
      ? { ...COTIZACION_STATE, assignments: [...COTIZACION_STATE.assignments, olivia(false)] }
      : assignments(code)));
    api.replaceReportLetterheadAssignments.mockRejectedValue(new ApiError(409, { code: "letterhead_conflict", message: "Cambió." }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Bajar Asistente de ventas" }));
    await user.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    api.getReportLetterheadAssignments.mockImplementation((code: string) => Promise.resolve(code === "PRUEBA_COTIZACION"
      ? { ...COTIZACION_STATE, revision: "r9", assignments: [...COTIZACION_STATE.assignments, olivia(true)] }
      : assignments(code)));
    await user.click(await within(panel).findByRole("button", { name: "Recargar datos" }));
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
  });
});

describe("report assignments — discard and catalog sync", () => {
  const oliviaAssignment = (active: boolean) => ({
    letterhead_id: 2, slug: "olivia-banda", display_name: "Olivia Banda", letterhead_is_active: active,
    is_active: true, is_default: false, display_order: 1, current_version: 1, offered: active,
  });
  const withOlivia = (active: boolean): ReportLetterheadAssignments => ({
    ...COTIZACION_STATE, assignments: [...COTIZACION_STATE.assignments, oliviaAssignment(active)],
  });
  /** After the first read, assignment reads stay pending: only the restore itself is under test. */
  function assignmentsOnceThenPending(first: ReportLetterheadAssignments) {
    let served = false;
    api.getReportLetterheadAssignments.mockImplementation((code: string) => {
      if (code !== "PRUEBA_COTIZACION") return Promise.resolve(assignments(code));
      if (served) return new Promise(() => undefined);
      served = true;
      return Promise.resolve(first);
    });
  }

  it("discarding after a reactivation keeps the newer catalog state and saves nothing", async () => {
    api.listLetterheads.mockResolvedValueOnce([ASISTENTE, { ...OLIVIA, is_active: false }]).mockResolvedValue([ASISTENTE, OLIVIA]);
    assignmentsOnceThenPending(withOlivia(false));
    api.updateLetterhead.mockResolvedValue(OLIVIA);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Bajar Asistente de ventas" }));
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "Descartar cambios" }));
    // The cached confirmed state is restored, but it is not a new read: the catalog still wins.
    expect(within(panel).getByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
    // Discarding restores the order and leaves nothing pending.
    expect(within(panel).queryByText("Hay cambios sin guardar.")).toBeNull();
    expect((within(panel).getByRole("button", { name: "Subir Asistente de ventas" }) as HTMLButtonElement).disabled).toBe(true);
    // A valid default stays selected.
    expect((within(panel).getByRole("radio", { name: "Asistente de ventas" }) as HTMLInputElement).checked).toBe(true);
    expect(api.replaceReportLetterheadAssignments).not.toHaveBeenCalled();
  });

  it("discarding after a deactivation never offers the inactive letterhead as default", async () => {
    api.listLetterheads.mockResolvedValueOnce([ASISTENTE, OLIVIA]).mockResolvedValue([{ ...ASISTENTE, is_active: false }, OLIVIA]);
    assignmentsOnceThenPending(withOlivia(true));
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Bajar Asistente de ventas" }));
    await user.click(screen.getByRole("button", { name: "Desactivar Asistente de ventas" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desactivar membrete" }));
    await waitFor(() => expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull());
    await user.click(within(panel).getByRole("button", { name: "Descartar cambios" }));
    expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull();
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
    expect(within(panel).getByText(/El membrete predeterminado ya no está activo o disponible/)).toBeTruthy();
    expect(within(panel).getByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(api.replaceReportLetterheadAssignments).not.toHaveBeenCalled();
  });

  it("shows a renamed letterhead and its new version in a draft and after discarding", async () => {
    const renamed = {
      ...OLIVIA, display_name: "Olivia Banda Ventas",
      current_version: { ...OLIVIA.current_version!, version: 2 }, version_count: 2,
    };
    api.listLetterheads.mockResolvedValueOnce([ASISTENTE, OLIVIA]).mockResolvedValue([ASISTENTE, renamed]);
    assignmentsOnceThenPending(withOlivia(true));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Bajar Asistente de ventas" }));
    // Any catalog refresh brings the new metadata; here, saving another report.
    await user.click(screen.getByRole("tab", { name: "Descuento" }));
    const descuento = screen.getByRole("tabpanel", { name: "Descuento" });
    api.replaceReportLetterheadAssignments.mockResolvedValueOnce(assignments("PRUEBA_DESCUENTO", { revision: "d2" }));
    await user.click(await within(descuento).findByRole("checkbox", { name: /Asistente de ventas/ }));
    await user.click(within(descuento).getByRole("button", { name: "Guardar cambios" }));
    await user.click(screen.getByRole("tab", { name: "Cotización" }));
    const oliviaRow = async () => (await within(panel).findByRole("checkbox", { name: /Olivia Banda Ventas/ })).closest("li") as HTMLElement;
    expect(within(await oliviaRow()).getByText("Versión 2")).toBeTruthy();
    expect(within(panel).getByText("Hay cambios sin guardar.")).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: "Descartar cambios" }));
    expect(within(await oliviaRow()).getByText("Versión 2")).toBeTruthy();
    expect(within(panel).getByRole("radio", { name: "Olivia Banda Ventas" })).toBeTruthy();
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledTimes(1);
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledWith("PRUEBA_DESCUENTO", expect.anything());
  });

  it("offers no discard without pending changes, and a discard re-reads the server for real", async () => {
    api.listLetterheads.mockResolvedValue([ASISTENTE, OLIVIA]);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membretes disponibles y orden");
    expect((within(panel).getByRole("button", { name: "Descartar cambios" }) as HTMLButtonElement).disabled).toBe(true);
    const reads = () => api.getReportLetterheadAssignments.mock.calls.filter(([code]) => code === "PRUEBA_COTIZACION").length;
    const before = reads();
    await user.click(within(panel).getByRole("checkbox", { name: /Olivia Banda/ }));
    await user.click(within(panel).getByRole("button", { name: "Descartar cambios" }));
    expect(within(panel).getByRole("checkbox", { name: /Olivia Banda/ })).toHaveProperty("checked", false);
    await waitFor(() => expect(reads()).toBe(before + 1));
    expect(api.replaceReportLetterheadAssignments).not.toHaveBeenCalled();
  });
});

describe("report assignments — a confirmed status change is fresh data", () => {
  const oliviaAssignment = (active: boolean) => ({
    letterhead_id: 2, slug: "olivia-banda", display_name: "Olivia Banda", letterhead_is_active: active,
    is_active: true, is_default: false, display_order: 1, current_version: 1, offered: active,
  });
  const cotizacionWithOlivia = (active: boolean): ReportLetterheadAssignments => ({
    ...COTIZACION_STATE, assignments: [...COTIZACION_STATE.assignments, oliviaAssignment(active)],
  });
  /** First reads answer; every later read follows `later` (pending by default). */
  function firstReadsThen(
    catalog: LetterheadAdmin[],
    cotizacion: ReportLetterheadAssignments,
    later: () => Promise<never> = () => new Promise(() => undefined),
  ) {
    let catalogServed = false;
    api.listLetterheads.mockImplementation(() => {
      if (catalogServed) return later();
      catalogServed = true;
      return Promise.resolve(catalog);
    });
    let cotizacionServed = false;
    api.getReportLetterheadAssignments.mockImplementation((code: string) => {
      if (code !== "PRUEBA_COTIZACION") return Promise.resolve(assignments(code));
      if (cotizacionServed) return later();
      cotizacionServed = true;
      return Promise.resolve(cotizacion);
    });
  }
  async function deactivate(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole("button", { name: `Desactivar ${name}` }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desactivar membrete" }));
  }

  it("a confirmed deactivation stops being a default choice while the follow-up reads are pending", async () => {
    firstReadsThen([ASISTENTE, OLIVIA], cotizacionWithOlivia(true));
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    expect(await within(panel).findByRole("radio", { name: "Asistente de ventas" })).toBeTruthy();
    await deactivate(user, "Asistente de ventas");
    await waitFor(() => expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull());
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
    expect(within(panel).getByText(/El membrete predeterminado ya no está activo o disponible/)).toBeTruthy();
    expect(within(panel).getByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(api.replaceReportLetterheadAssignments).not.toHaveBeenCalled();
  });

  it("a confirmed reactivation becomes a default choice while the follow-up reads are pending", async () => {
    firstReadsThen([ASISTENTE, { ...OLIVIA, is_active: false }], cotizacionWithOlivia(false));
    api.updateLetterhead.mockResolvedValue(OLIVIA);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membrete inactivo");
    expect(within(panel).queryByRole("radio", { name: "Olivia Banda" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
    expect(api.replaceReportLetterheadAssignments).not.toHaveBeenCalled();
  });

  it("keeps the confirmed state when the follow-up reads fail", async () => {
    firstReadsThen([ASISTENTE, OLIVIA], cotizacionWithOlivia(true), () => Promise.reject(new ApiError(503, "Servicio no disponible.")));
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByRole("radio", { name: "Asistente de ventas" });
    await deactivate(user, "Asistente de ventas");
    await waitFor(() => expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull());
    expect(await screen.findByRole("button", { name: "Reactivar Asistente de ventas" })).toBeTruthy();
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
  });

  it("changes nothing when the PATCH fails", async () => {
    firstReadsThen([ASISTENTE, OLIVIA], cotizacionWithOlivia(true));
    api.updateLetterhead.mockRejectedValue(new ApiError(409, { code: "letterhead_conflict", message: "No se pudo desactivar." }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByRole("radio", { name: "Asistente de ventas" });
    await deactivate(user, "Asistente de ventas");
    expect(await screen.findByText("No se pudo desactivar.")).toBeTruthy();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(within(panel).getByRole("radio", { name: "Asistente de ventas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desactivar Asistente de ventas" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
    expect(api.listLetterheads).toHaveBeenCalledTimes(1);
  });

  it("an older read that answers after the PATCH does not undo it", async () => {
    const olderCatalog = deferred<LetterheadAdmin[]>();
    const olderCotizacion = deferred<ReportLetterheadAssignments>();
    let catalogCalls = 0;
    api.listLetterheads.mockImplementation(() => {
      catalogCalls += 1;
      if (catalogCalls === 1) return Promise.resolve([ASISTENTE, OLIVIA]);
      if (catalogCalls === 2) return olderCatalog.promise;
      return new Promise(() => undefined);
    });
    let cotizacionCalls = 0;
    api.getReportLetterheadAssignments.mockImplementation((code: string) => {
      if (code !== "PRUEBA_COTIZACION") return Promise.resolve(assignments(code, { revision: `${code}-${Math.random()}` }));
      cotizacionCalls += 1;
      if (cotizacionCalls === 1) return Promise.resolve(cotizacionWithOlivia(true));
      if (cotizacionCalls === 2) return olderCotizacion.promise;
      return new Promise(() => undefined);
    });
    api.replaceReportLetterheadAssignments.mockResolvedValue(assignments("PRUEBA_DESCUENTO", { revision: "d2" }));
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByRole("radio", { name: "Asistente de ventas" });
    // Saving Descuento starts reads (catalog + Cotización) that stay in flight…
    await user.click(screen.getByRole("tab", { name: "Descuento" }));
    const descuento = screen.getByRole("tabpanel", { name: "Descuento" });
    await user.click(await within(descuento).findByRole("checkbox", { name: /Olivia Banda/ }));
    await user.click(within(descuento).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(catalogCalls).toBe(2));
    await user.click(screen.getByRole("tab", { name: "Cotización" }));
    // …then the deactivation is confirmed…
    await deactivate(user, "Asistente de ventas");
    await waitFor(() => expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull());
    // …and the older reads answer last, with the pre-PATCH state.
    await act(async () => {
      olderCatalog.resolve([ASISTENTE, OLIVIA]);
      olderCotizacion.resolve(cotizacionWithOlivia(true));
    });
    expect(screen.getByRole("button", { name: "Reactivar Asistente de ventas" })).toBeTruthy();
    expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull();
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
  });

  it("keeps a pending draft through the update, and discarding afterwards keeps the confirmed state", async () => {
    firstReadsThen([ASISTENTE, OLIVIA], cotizacionWithOlivia(true));
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Subir Olivia Banda" }));
    expect(within(panel).getByText("Hay cambios sin guardar.")).toBeTruthy();
    await deactivate(user, "Asistente de ventas");
    await waitFor(() => expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull());
    expect(within(panel).getByText("Hay cambios sin guardar.")).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "Subir Olivia Banda" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(panel).getByRole("button", { name: "Descartar cambios" }));
    expect(within(panel).queryByRole("radio", { name: "Asistente de ventas" })).toBeNull();
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
    expect(api.replaceReportLetterheadAssignments).not.toHaveBeenCalled();
  });

  it("after a PATCH, a 409 is still resolved only by an explicit, real reload", async () => {
    let cotizacionCalls = 0;
    api.listLetterheads.mockResolvedValueOnce([ASISTENTE, OLIVIA]).mockResolvedValue([{ ...ASISTENTE, is_active: false }, OLIVIA]);
    api.getReportLetterheadAssignments.mockImplementation((code: string) => {
      if (code !== "PRUEBA_COTIZACION") return Promise.resolve(assignments(code));
      cotizacionCalls += 1;
      return Promise.resolve(cotizacionCalls === 1 ? cotizacionWithOlivia(true) : {
        ...cotizacionWithOlivia(true), revision: "r-fresh", default_letterhead_id: null,
        assignments: [{ ...COTIZACION_STATE.assignments[0], letterhead_is_active: false, is_default: false, offered: false }, oliviaAssignment(true)],
      });
    });
    api.updateLetterhead.mockResolvedValue({ ...ASISTENTE, is_active: false });
    api.replaceReportLetterheadAssignments.mockRejectedValue(new ApiError(409, { code: "letterhead_conflict", message: "Cambió." }));
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Subir Olivia Banda" }));
    await deactivate(user, "Asistente de ventas");
    await user.click(within(panel).getByRole("radio", { name: "Olivia Banda" }));
    await user.click(within(panel).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(panel).findByText(/Otra persona modificó los membretes de Cotización/)).toBeTruthy();
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledTimes(1);
    const before = cotizacionCalls;
    await user.click(within(panel).getByRole("button", { name: "Recargar datos" }));
    await waitFor(() => expect(cotizacionCalls).toBe(before + 1));
    expect((await within(panel).findByRole("radio", { name: "Sin membrete — formato actual" }) as HTMLInputElement).checked).toBe(true);
    expect(within(panel).queryByText(/El membrete predeterminado ya no está activo/)).toBeNull();
    expect(api.replaceReportLetterheadAssignments).toHaveBeenCalledTimes(1);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("report assignments — reads concurrent with a pending status change", () => {
  const oliviaAssignment = (active: boolean) => ({
    letterhead_id: 2, slug: "olivia-banda", display_name: "Olivia Banda", letterhead_is_active: active,
    is_active: true, is_default: false, display_order: 1, current_version: 1, offered: active,
  });
  const cotizacionWithOlivia = (active: boolean): ReportLetterheadAssignments => ({
    ...COTIZACION_STATE, assignments: [...COTIZACION_STATE.assignments, oliviaAssignment(active)],
  });

  /**
   * Catalog read #1 answers `initial`; read #2 (started while the PATCH is
   * pending) is `concurrent`; later reads follow `after`. Cotización's
   * assignment reads: #1 answers `initialAssignments`, later ones follow
   * `afterAssignments`. Descuento always answers, and saving it is how a
   * read is started while the PATCH is pending.
   */
  function scenario(options: {
    initial: LetterheadAdmin[];
    concurrent: Promise<LetterheadAdmin[]>;
    after: () => Promise<LetterheadAdmin[]>;
    initialAssignments: ReportLetterheadAssignments;
    afterAssignments: () => Promise<ReportLetterheadAssignments>;
  }) {
    let catalogCalls = 0;
    api.listLetterheads.mockImplementation(() => {
      catalogCalls += 1;
      if (catalogCalls === 1) return Promise.resolve(options.initial);
      if (catalogCalls === 2) return options.concurrent;
      return options.after();
    });
    let cotizacionCalls = 0;
    api.getReportLetterheadAssignments.mockImplementation((code: string) => {
      if (code !== "PRUEBA_COTIZACION") return Promise.resolve(assignments(code));
      cotizacionCalls += 1;
      return cotizacionCalls === 1 ? Promise.resolve(options.initialAssignments) : options.afterAssignments();
    });
    api.replaceReportLetterheadAssignments.mockImplementation((code: string) =>
      Promise.resolve(assignments(code, { revision: `${code}-saved` })));
    return { catalogCalls: () => catalogCalls };
  }

  /** Saves Descuento, which re-reads the catalog (works behind a modal dialog too). */
  async function startConcurrentRead(user: ReturnType<typeof userEvent.setup>, calls: () => number) {
    const before = calls();
    await user.click(screen.getByRole("tab", { name: "Descuento", hidden: true }));
    const descuento = screen.getByRole("tabpanel", { name: "Descuento", hidden: true });
    await user.click(await within(descuento).findByRole("checkbox", { name: /Asistente de ventas/, hidden: true }));
    await user.click(within(descuento).getByRole("button", { name: "Guardar cambios", hidden: true }));
    await waitFor(() => expect(calls()).toBe(before + 1));
    await user.click(screen.getByRole("tab", { name: "Cotización", hidden: true }));
  }

  const pending = <T,>() => new Promise<T>(() => undefined);
  const failing = <T,>() => Promise.reject<T>(new ApiError(503, "Servicio no disponible."));

  it("A: a stale read answering before the PATCH confirms does not hide the reactivation", async () => {
    const concurrent = deferred<LetterheadAdmin[]>();
    const patch = deferred<LetterheadAdmin>();
    const { catalogCalls } = scenario({
      initial: [ASISTENTE, { ...OLIVIA, is_active: false }], concurrent: concurrent.promise, after: failing,
      initialAssignments: cotizacionWithOlivia(false), afterAssignments: failing,
    });
    api.updateLetterhead.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membrete inactivo");
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    await startConcurrentRead(user, catalogCalls);
    await act(async () => concurrent.resolve([ASISTENTE, { ...OLIVIA, is_active: false }]));
    await act(async () => patch.resolve(OLIVIA));
    // Follow-up reads fail: the confirmed result must still be what is shown.
    expect(await screen.findByRole("button", { name: "Desactivar Olivia Banda" })).toBeTruthy();
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
  });

  it("B: a stale read answering after the PATCH confirms does not undo the reactivation", async () => {
    const concurrent = deferred<LetterheadAdmin[]>();
    const patch = deferred<LetterheadAdmin>();
    const { catalogCalls } = scenario({
      initial: [ASISTENTE, { ...OLIVIA, is_active: false }], concurrent: concurrent.promise, after: pending,
      initialAssignments: cotizacionWithOlivia(false), afterAssignments: pending,
    });
    api.updateLetterhead.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membrete inactivo");
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    await startConcurrentRead(user, catalogCalls);
    await act(async () => patch.resolve(OLIVIA));
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    await act(async () => concurrent.resolve([ASISTENTE, { ...OLIVIA, is_active: false }]));
    expect(screen.getByRole("button", { name: "Desactivar Olivia Banda" })).toBeTruthy();
    expect(within(panel).getByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
  });

  it("C/G: a read issued after the confirmation applies newer changes, another admin's included", async () => {
    const concurrent = deferred<LetterheadAdmin[]>();
    const patch = deferred<LetterheadAdmin>();
    const otherAdmin = { ...OLIVIA, display_name: "Olivia Banda Ventas" };
    const { catalogCalls } = scenario({
      initial: [ASISTENTE, { ...OLIVIA, is_active: false }], concurrent: concurrent.promise,
      after: () => Promise.resolve([ASISTENTE, otherAdmin]),
      initialAssignments: cotizacionWithOlivia(false), afterAssignments: pending,
    });
    api.updateLetterhead.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membrete inactivo");
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    await startConcurrentRead(user, catalogCalls);
    await act(async () => patch.resolve(OLIVIA));
    // The follow-up read was issued after the confirmation: its newer data wins.
    expect(await screen.findByRole("heading", { name: "Olivia Banda Ventas" })).toBeTruthy();
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda Ventas" })).toBeTruthy();
    // The stale concurrent read answering last changes nothing.
    await act(async () => concurrent.resolve([ASISTENTE, { ...OLIVIA, is_active: false }]));
    expect(screen.getByRole("heading", { name: "Olivia Banda Ventas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desactivar Olivia Banda Ventas" })).toBeTruthy();
  });

  it("D: a failed reactivation records nothing, even with reads around it", async () => {
    const concurrent = deferred<LetterheadAdmin[]>();
    const patch = deferred<LetterheadAdmin>();
    const { catalogCalls } = scenario({
      initial: [ASISTENTE, { ...OLIVIA, is_active: false }], concurrent: concurrent.promise, after: pending,
      initialAssignments: cotizacionWithOlivia(false), afterAssignments: pending,
    });
    api.updateLetterhead.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await within(panel).findByText("Membrete inactivo");
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    await startConcurrentRead(user, catalogCalls);
    await act(async () => patch.reject(new ApiError(409, { code: "letterhead_conflict", message: "No se pudo reactivar." })));
    expect(await screen.findByText("No se pudo reactivar.")).toBeTruthy();
    await act(async () => concurrent.resolve([ASISTENTE, { ...OLIVIA, is_active: false }]));
    expect(screen.getByRole("button", { name: "Reactivar Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByRole("radio", { name: "Olivia Banda" })).toBeNull();
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
  });

  it("E: the same holds for a deactivation (stale read before and after the confirmation)", async () => {
    const concurrent = deferred<LetterheadAdmin[]>();
    const patch = deferred<LetterheadAdmin>();
    const { catalogCalls } = scenario({
      initial: [ASISTENTE, OLIVIA], concurrent: concurrent.promise, after: failing,
      initialAssignments: cotizacionWithOlivia(true), afterAssignments: failing,
    });
    api.updateLetterhead.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Desactivar Olivia Banda" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desactivar membrete" }));
    await startConcurrentRead(user, catalogCalls);
    await act(async () => concurrent.resolve([ASISTENTE, OLIVIA]));
    await act(async () => patch.resolve({ ...OLIVIA, is_active: false }));
    expect(await screen.findByRole("button", { name: "Reactivar Olivia Banda" })).toBeTruthy();
    await waitFor(() => expect(within(panel).queryByRole("radio", { name: "Olivia Banda" })).toBeNull());
    expect(within(panel).getByText("Membrete inactivo")).toBeTruthy();
  });

  it("F: keeps the draft through concurrent reads, shows valid defaults, and discards without a PUT", async () => {
    const concurrent = deferred<LetterheadAdmin[]>();
    const patch = deferred<LetterheadAdmin>();
    const { catalogCalls } = scenario({
      initial: [ASISTENTE, { ...OLIVIA, is_active: false }], concurrent: concurrent.promise, after: failing,
      initialAssignments: cotizacionWithOlivia(false), afterAssignments: pending,
    });
    api.updateLetterhead.mockReturnValue(patch.promise);
    const user = userEvent.setup();
    render(<LetterheadAdminWorkspace />);
    const panel = await cotizacionPanel();
    await user.click(await within(panel).findByRole("button", { name: "Subir Olivia Banda" }));
    await user.click(screen.getByRole("button", { name: "Reactivar Olivia Banda" }));
    await startConcurrentRead(user, catalogCalls);
    await act(async () => concurrent.resolve([ASISTENTE, { ...OLIVIA, is_active: false }]));
    await act(async () => patch.resolve(OLIVIA));
    expect(await within(panel).findByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).getByText("Hay cambios sin guardar.")).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "Subir Olivia Banda" }) as HTMLButtonElement).disabled).toBe(true);
    const putsBefore = api.replaceReportLetterheadAssignments.mock.calls.length;
    await user.click(within(panel).getByRole("button", { name: "Descartar cambios" }));
    expect(within(panel).getByRole("radio", { name: "Olivia Banda" })).toBeTruthy();
    expect(within(panel).queryByText("Membrete inactivo")).toBeNull();
    expect(within(panel).queryByText("Hay cambios sin guardar.")).toBeNull();
    // Only the explicit Descuento save ever sent a PUT.
    expect(api.replaceReportLetterheadAssignments.mock.calls.length).toBe(putsBefore);
    expect(api.replaceReportLetterheadAssignments.mock.calls.every(([code]) => code === "PRUEBA_DESCUENTO")).toBe(true);
  });
});
