// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
});
