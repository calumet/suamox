/// <reference lib="dom" />
// @vitest-environment happy-dom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import {
  Head,
  HeadProvider,
  headMarkerAttribute,
  headMarkerEndValue,
  headMarkerStartValue,
} from "../src/index";

describe("Head (client)", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.head.innerHTML = "";
  });

  it("applies head elements on the client", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          HeadProvider,
          null,
          createElement(
            Fragment,
            null,
            createElement(Head, null, createElement("title", null, "Client Title")),
            createElement(
              Head,
              null,
              createElement("meta", { name: "description", content: "CSR" }),
            ),
            createElement("main", null, "App"),
          ),
        ),
      );
      await Promise.resolve();
    });

    const title = document.head.querySelector("title");
    const meta = document.head.querySelector('meta[name="description"]');
    const start = document.head.querySelector(
      `meta[${headMarkerAttribute}="${headMarkerStartValue}"]`,
    );
    const end = document.head.querySelector(`meta[${headMarkerAttribute}="${headMarkerEndValue}"]`);

    expect(title?.textContent).toBe("Client Title");
    expect(meta?.getAttribute("content")).toBe("CSR");
    expect(start).not.toBeNull();
    expect(end).not.toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it("el cliente no aplica un lang que el servidor descartaria", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    document.documentElement.lang = "en";

    await act(async () => {
      root.render(
        createElement(
          HeadProvider,
          null,
          createElement(Head, { lang: '"><script>alert(1)</script>' }),
        ),
      );
      await Promise.resolve();
    });

    // El servidor sirve "en" para ese valor. Si el cliente lo aplicara igual, al
    // hidratar deshace la validacion que acaba de hacer el servidor
    expect(document.documentElement.lang).toBe("en");

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });

  it("aplica una etiqueta valida al navegar", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    document.documentElement.lang = "en";

    await act(async () => {
      root.render(createElement(HeadProvider, null, createElement(Head, { lang: "es-419" })));
      await Promise.resolve();
    });

    expect(document.documentElement.lang).toBe("es-419");

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
  });
});
