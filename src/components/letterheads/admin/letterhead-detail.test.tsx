// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { LetterheadAdmin, LetterheadVersion } from "@/types/letterhead-admin";

const api = vi.hoisted(() => ({
  getLetterhead: vi.fn(),
  listLetterheadVersions: vi.fn(),
  updateLetterhead: vi.fn(),
  uploadLetterheadVersion: vi.fn(),
  downloadLetterheadSource: vi.fn(),
  letterheadVersionThumbnailPath: (id: number, version: number) => `/admin/letterheads/${id}/versions/${version}/thumbnail`,
}));
vi.mock("@/lib/api/letterhead-admin", () => api);
const { fetchProtectedImage } = vi.hoisted(() => ({ fetchProtectedImage: vi.fn() }));
vi.mock("@/lib/api/protected-image", () => ({ fetchProtectedImage }));
const { triggerBrowserDownload } = vi.hoisted(() => ({ triggerBrowserDownload: vi.fn() }));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

import { LetterheadDetail } from "./letterhead-detail";

function version(number: number, current: boolean): LetterheadVersion {
  return {
    id: 100 + number, letterhead_id: 3, version: number, is_current: current,
    source_filename: `ivan-v${number}.xlsx`,
    source_media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    source_checksum_sha256: `${number}`.repeat(64), source_size: 204_800, layout_schema_version: 1, layout_metadata: {},
    created_at: "2026-10-13T12:00:00Z", created_by_user_id: number === 1 ? 1 : null,
    assets: [{ role: "thumbnail", media_type: "image/png", width: 340, height: 440, size_bytes: 9_000, checksum_sha256: "c".repeat(64) }],
  };
}

const V2 = version(2, true);
const V1 = version(1, false);
const IVAN: LetterheadAdmin = {
  id: 3, slug: "ivan-vazquez", display_name: "Iván Vázquez", is_active: true,
  created_at: "2026-10-13T12:00:00Z", updated_at: "2026-10-13T12:00:00Z", version_count: 2, current_version: V2,
  assignments: [{ report_code: "PRUEBA_DESCUENTO", is_active: true, is_default: false, display_order: 0 }],
};

function xlsx(name = "ivan-v3.xlsx"): File {
  return new File(["PK"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

beforeEach(() => {
  fetchProtectedImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  api.getLetterhead.mockResolvedValue(IVAN);
  api.listLetterheadVersions.mockResolvedValue([V2, V1]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LetterheadDetail", () => {
  it("shows state, current version and the immutable history with technical details apart", async () => {
    render(<LetterheadDetail id={3} />);
    expect(screen.getByLabelText("Cargando membrete")).toBeTruthy();
    expect(await screen.findByText("Versión vigente: 2")).toBeTruthy();
    expect(screen.getByText("ivan-vazquez")).toBeTruthy();
    expect(screen.getByText("Descuento")).toBeTruthy();
    const history = screen.getByRole("heading", { name: "Historial de versiones" }).closest("[data-slot=card]") as HTMLElement;
    const items = within(history).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual(["Versión 2", "Versión 1"]);
    expect(within(items[0]).getByText("Vigente")).toBeTruthy();
    expect(within(items[1]).queryByText("Vigente")).toBeNull();
    expect(within(items[1]).getByText("Usuario #1")).toBeTruthy();
    expect(within(items[1]).getByText("ivan-v1.xlsx")).toBeTruthy();
    expect(within(items[1]).getByText("200 KB")).toBeTruthy();
    // The checksum lives in the collapsed technical details, not in the main flow.
    const details = within(items[1]).getByText("Detalles técnicos").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("1".repeat(64))).toBeTruthy();
    // History is read-only: no delete or overwrite action anywhere.
    expect(screen.queryByRole("button", { name: /eliminar|borrar|sobrescribir/i })).toBeNull();
    // Thumbnails load from effects; wait for them instead of racing their flush.
    await waitFor(() => expect(fetchProtectedImage).toHaveBeenCalledWith("/admin/letterheads/3/versions/1/thumbnail", expect.anything()));
  });

  it("downloads the original XLSX of a historical version", async () => {
    api.downloadLetterheadSource.mockResolvedValue({ blob: new Blob(["PK"]), filename: "ivan-v1.xlsx" });
    const user = userEvent.setup();
    render(<LetterheadDetail id={3} />);
    await user.click(await screen.findByRole("button", { name: "Descargar el XLSX original de la versión 1" }));
    await waitFor(() => expect(api.downloadLetterheadSource).toHaveBeenCalledWith(3, 1));
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.objectContaining({ filename: "ivan-v1.xlsx" }), "ivan-v1.xlsx");
  });

  it("uploads a new version against the current one and refreshes the history", async () => {
    api.uploadLetterheadVersion.mockResolvedValue({ ...version(3, true), created: true });
    const user = userEvent.setup();
    render(<LetterheadDetail id={3} />);
    expect(await screen.findByText(/Crea la versión 3/)).toBeTruthy();
    await user.upload(screen.getByLabelText("Archivo XLSX"), xlsx());
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }));
    await waitFor(() => expect(api.uploadLetterheadVersion).toHaveBeenCalledWith(3, expect.any(File), 2));
    expect(await screen.findByText(/Se creó la versión 3/)).toBeTruthy();
    await waitFor(() => expect(api.listLetterheadVersions).toHaveBeenCalledTimes(2));
  });

  it("explains that an identical file did not create a version", async () => {
    api.uploadLetterheadVersion.mockResolvedValue({ ...V2, created: false });
    const user = userEvent.setup();
    render(<LetterheadDetail id={3} />);
    await user.upload(await screen.findByLabelText("Archivo XLSX"), xlsx());
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }));
    expect(await screen.findByText("El archivo es idéntico a la versión vigente (2); no se creó otra versión.")).toBeTruthy();
  });

  it("stops on a concurrent upload (409) and reloads only when asked", async () => {
    api.uploadLetterheadVersion.mockRejectedValue(
      new ApiError(409, { code: "letterhead_conflict", message: "La versión vigente cambió." }),
    );
    const user = userEvent.setup();
    render(<LetterheadDetail id={3} />);
    await user.upload(await screen.findByLabelText("Archivo XLSX"), xlsx());
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }));
    expect(await screen.findByText("Otra versión se subió mientras tanto")).toBeTruthy();
    expect(api.uploadLetterheadVersion).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Recargar historial" }));
    await waitFor(() => expect(api.getLetterhead).toHaveBeenCalledTimes(2));
    expect(api.uploadLetterheadVersion).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-XLSX file and shows the backend's preflight rejection", async () => {
    api.uploadLetterheadVersion.mockRejectedValue(
      new ApiError(422, { code: "invalid_source", message: "El archivo no es un XLSX válido." }),
    );
    const user = userEvent.setup({ applyAccept: false });
    render(<LetterheadDetail id={3} />);
    await user.upload(await screen.findByLabelText("Archivo XLSX"), new File(["%PDF"], "membrete.pdf"));
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }));
    expect(screen.getByText(/Solo se aceptan archivos .xlsx/)).toBeTruthy();
    expect(api.uploadLetterheadVersion).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText("Archivo XLSX"), xlsx());
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }));
    expect(await screen.findByText("El archivo no es un XLSX válido.")).toBeTruthy();
  });

  it("renames the letterhead without touching its slug or versions", async () => {
    api.updateLetterhead.mockResolvedValue({ ...IVAN, display_name: "Iván Vázquez Ventas" });
    const user = userEvent.setup();
    render(<LetterheadDetail id={3} />);
    const input = await screen.findByLabelText("Nombre visible");
    await user.clear(input);
    await user.type(input, "Iván Vázquez Ventas");
    await user.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(api.updateLetterhead).toHaveBeenCalledWith(3, { display_name: "Iván Vázquez Ventas" }));
    expect(await screen.findByText("El nombre visible ahora es «Iván Vázquez Ventas».")).toBeTruthy();
    expect(screen.queryByLabelText(/identificador/i)).toBeNull();
  });

  it("reports a letterhead that does not exist", async () => {
    api.getLetterhead.mockRejectedValue(new ApiError(404, { code: "letterhead_not_found", message: "No existe." }));
    render(<LetterheadDetail id={99} />);
    expect(await screen.findByText("El membrete solicitado no existe.")).toBeTruthy();
  });

  it("never lets a slower rename response drop a version uploaded meanwhile", async () => {
    let finishRename!: (value: LetterheadAdmin) => void;
    api.updateLetterhead.mockReturnValue(new Promise((resolve) => { finishRename = resolve; }));
    const V3 = version(3, true);
    api.uploadLetterheadVersion.mockResolvedValue({ ...V3, created: true });
    const user = userEvent.setup();
    render(<LetterheadDetail id={3} />);
    const input = await screen.findByLabelText("Nombre visible");
    await user.clear(input);
    await user.type(input, "Iván V.");
    await user.click(screen.getByRole("button", { name: "Guardar nombre" }));
    api.getLetterhead.mockResolvedValue({ ...IVAN, current_version: V3, version_count: 3 });
    api.listLetterheadVersions.mockResolvedValue([V3, V2, V1]);
    await user.upload(screen.getByLabelText("Archivo XLSX"), xlsx());
    await user.click(screen.getByRole("button", { name: "Subir nueva versión" }));
    expect(await screen.findByRole("heading", { name: "Versión 3" })).toBeTruthy();
    api.getLetterhead.mockResolvedValue({ ...IVAN, display_name: "Iván V.", current_version: V3, version_count: 3 });
    await act(async () => finishRename({ ...IVAN, display_name: "Iván V." }));
    expect(screen.getByRole("heading", { name: "Versión 3" })).toBeTruthy();
    expect(await screen.findByText("El nombre visible ahora es «Iván V.».")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Versión vigente: 3")).toBeTruthy());
  });

  it("shows no offered reports while the letterhead is inactive", async () => {
    api.getLetterhead.mockResolvedValue({ ...IVAN, is_active: false });
    render(<LetterheadDetail id={3} />);
    expect(await screen.findByText("Ningún reporte mientras esté inactivo")).toBeTruthy();
  });

  it("keeps the page and unsent forms when a background re-read fails", async () => {
    api.updateLetterhead.mockResolvedValue({ ...IVAN, is_active: false });
    const user = userEvent.setup({ applyAccept: false });
    render(<LetterheadDetail id={3} />);
    await user.upload(await screen.findByLabelText("Archivo XLSX"), xlsx("pendiente.xlsx"));
    const name = screen.getByLabelText("Nombre visible");
    await user.clear(name);
    await user.type(name, "Borrador sin guardar");
    api.getLetterhead.mockRejectedValue(new ApiError(503, "Servicio no disponible."));
    await user.click(screen.getByRole("button", { name: "Desactivar Iván Vázquez" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Desactivar membrete" }));
    expect(await screen.findByText(/tus formularios sin enviar se conservan/)).toBeTruthy();
    expect((screen.getByLabelText("Archivo XLSX") as HTMLInputElement).files?.[0]?.name).toBe("pendiente.xlsx");
    expect((screen.getByRole("button", { name: "Subir nueva versión" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Nombre visible") as HTMLInputElement).value).toBe("Borrador sin guardar");
    expect(screen.getByRole("heading", { name: "Historial de versiones" })).toBeTruthy();
  });
});
