// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerBrowserDownload } from "./download";

function saveAndReadName(download: { blob: Blob; filename: string | null }, fallback: string): string {
  const anchor = document.createElement("a");
  const click = vi.fn();
  anchor.click = click;
  vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);
  triggerBrowserDownload(download, fallback);
  expect(click).toHaveBeenCalledTimes(1);
  return anchor.download;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerBrowserDownload", () => {
  it("saves under the name the backend sent in Content-Disposition", () => {
    const name = saveAndReadName(
      { blob: new Blob(["PK"]), filename: "COTIZACION_PRODUCTOS.xlsx" },
      "REPORT.xlsx",
    );

    expect(name).toBe("COTIZACION_PRODUCTOS.xlsx");
  });

  it("uses the fallback only when the response carries no filename", () => {
    expect(saveAndReadName({ blob: new Blob(["PK"]), filename: null }, "COTIZACION_PRODUCTOS.xlsx"))
      .toBe("COTIZACION_PRODUCTOS.xlsx");
    expect(saveAndReadName({ blob: new Blob(["PK"]), filename: "   " }, "COTIZACION_PRODUCTOS.xlsx"))
      .toBe("COTIZACION_PRODUCTOS.xlsx");
  });
});
