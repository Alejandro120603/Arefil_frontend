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
    // Backend #26 resolves `filename_template` server-side; the client must not
    // overwrite that name with one of its own.
    const name = saveAndReadName(
      { blob: new Blob(["PK"]), filename: "BONATTI_FILTROS_LMR850205-048.xlsx" },
      "cotizacion-document.xlsx",
    );

    expect(name).toBe("BONATTI_FILTROS_LMR850205-048.xlsx");
  });

  it("uses the fallback only when the response carries no filename", () => {
    expect(saveAndReadName({ blob: new Blob(["PK"]), filename: null }, "cotizacion-document.xlsx"))
      .toBe("cotizacion-document.xlsx");
  });
});
