import { describe, expect, it, vi } from "vitest";
import { comNovasTentativas } from "../telegram/gatilhos";

describe("Telegram: repetir a leitura inicial das lojas", () => {
  it("passa na segunda tentativa", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce("ok");
    await expect(comNovasTentativas(fn, 3, 0)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("depois da última tentativa lança o erro", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fora do ar"));
    await expect(comNovasTentativas(fn, 2, 0)).rejects.toThrow("fora do ar");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
