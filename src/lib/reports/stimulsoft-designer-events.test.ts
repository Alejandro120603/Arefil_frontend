import { describe, expect, it, vi } from "vitest";
import { handleDesignerPreview, handleDesignerSave } from "./stimulsoft-designer-events";

describe("Stimulsoft Designer events", () => {
  it("sends the exact serialized template and resumes after save completes", async () => {
    const callback = vi.fn();
    const save = vi.fn(async () => undefined);
    const onError = vi.fn();
    const args = {
      async: false,
      preventDefault: false,
      report: { saveToJsonString: () => '{"ReportName":"Edited"}' },
    };

    handleDesignerSave(args, callback, save, onError);

    expect(args).toMatchObject({ async: true, preventDefault: true });
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith('{"ReportName":"Edited"}');
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a failed save and still releases the Designer callback", async () => {
    const callback = vi.fn();
    const failure = new Error("backend failed");
    const onError = vi.fn();

    handleDesignerSave(
      { async: false, preventDefault: false, report: { saveToJsonString: () => "{}" } },
      callback,
      async () => {
        throw failure;
      },
      onError,
    );

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("registers controlled data before continuing preview", async () => {
    const callback = vi.fn();
    const report = { name: "report" };
    const register = vi.fn();
    const args = { async: false, preventDefault: false, report };

    handleDesignerPreview(args, callback, async () => ({ items: [1] }), register, vi.fn());

    expect(args.async).toBe(true);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(register).toHaveBeenCalledWith(report, { items: [1] });
    expect(args.preventDefault).toBe(false);
  });

  it("cancels preview when data cannot be loaded", async () => {
    const callback = vi.fn();
    const failure = new Error("Selecciona dos listas");
    const onError = vi.fn();
    const args = { async: false, preventDefault: false, report: {} };

    handleDesignerPreview(
      args,
      callback,
      async () => {
        throw failure;
      },
      vi.fn(),
      onError,
    );

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(args.preventDefault).toBe(true);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
