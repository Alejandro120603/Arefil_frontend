// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchProtectedImage } = vi.hoisted(() => ({ fetchProtectedImage: vi.fn() }));
vi.mock("@/lib/api/protected-image", () => ({ fetchProtectedImage }));

import { LetterheadThumbnail } from "./letterhead-thumbnail";

const createObjectURL = vi.fn(() => "blob:thumbnail-1");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LetterheadThumbnail", () => {
  it("shows the authenticated image from an object URL and revokes it on unmount", async () => {
    fetchProtectedImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const { unmount } = render(<LetterheadThumbnail path="/admin/letterheads/1/versions/1/thumbnail" alt="Miniatura A" width={340} height={440} />);
    expect(screen.getByLabelText("Cargando miniatura")).toBeTruthy();
    const image = await screen.findByRole("img", { name: "Miniatura A" });
    expect(image.getAttribute("src")).toBe("blob:thumbnail-1");
    expect(fetchProtectedImage).toHaveBeenCalledWith(
      "/admin/letterheads/1/versions/1/thumbnail",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail-1");
  });

  it("falls back on its own when the request fails, without throwing", async () => {
    fetchProtectedImage.mockRejectedValue(new Error("404"));
    render(<LetterheadThumbnail path="/x" alt="Miniatura B" />);
    expect(await screen.findByText("Miniatura no disponible")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("falls back when the image itself cannot be decoded", async () => {
    fetchProtectedImage.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    render(<LetterheadThumbnail path="/x" alt="Miniatura C" />);
    fireEvent.error(await screen.findByRole("img", { name: "Miniatura C" }));
    expect(await screen.findByText("Miniatura no disponible")).toBeTruthy();
  });

  it("makes no request without a path", () => {
    render(<LetterheadThumbnail path={null} alt="Sin versión" />);
    expect(screen.getByText("Miniatura no disponible")).toBeTruthy();
    expect(fetchProtectedImage).not.toHaveBeenCalled();
  });

  it("cancels the previous request when the path changes", async () => {
    let firstSignal: AbortSignal | undefined;
    fetchProtectedImage.mockImplementationOnce((_path: string, options: { signal: AbortSignal }) => {
      firstSignal = options.signal;
      return new Promise(() => undefined);
    });
    fetchProtectedImage.mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }));
    const { rerender } = render(<LetterheadThumbnail path="/v1" alt="Miniatura" />);
    rerender(<LetterheadThumbnail path="/v2" alt="Miniatura" />);
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.getByRole("img", { name: "Miniatura" })).toBeTruthy());
  });
});
