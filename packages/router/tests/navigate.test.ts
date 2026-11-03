/// <reference lib="dom" />
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { startRouter, type RouterInstance } from "../src/index";

describe("navigate", () => {
  let router: RouterInstance | null = null;

  afterEach(() => {
    router?.dispose();
    router = null;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("no lleva a assign un destino con protocolo inseguro", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    router = await startRouter({ routes: [] });
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    for (const destino of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x"]) {
      await expect(router.navigate(destino)).rejects.toThrow("Blocked navigation");
    }
    expect(assign).not.toHaveBeenCalled();

    // Otro origen sigue siendo una carga completa
    await router.navigate("https://otro.example/ruta");
    expect(assign).toHaveBeenCalledWith("https://otro.example/ruta");
  });
});
