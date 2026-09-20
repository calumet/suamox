import { createElement, Fragment } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Head, HeadProvider, createHeadManager } from "../src/index";

describe("Head (server)", () => {
  it("collects head elements during SSR", () => {
    const manager = createHeadManager("server");
    const element = createElement(
      HeadProvider,
      { manager },
      createElement(
        Fragment,
        null,
        createElement(Head, null, createElement("title", null, "Server Title")),
        createElement(Head, null, createElement("meta", { name: "description", content: "SSR" })),
        createElement("div", null, "App"),
      ),
    );

    renderToString(element);

    const headHtml = manager
      .getSnapshot()
      .map((node) => renderToStaticMarkup(createElement(Fragment, null, node)))
      .join("\n");

    expect(headHtml).toContain("<title>Server Title</title>");
    expect(headHtml).toMatch(/<meta name="description" content="SSR"\s*\/?>/);
  });

  it("no pide lang si ninguna pagina lo declara", () => {
    const manager = createHeadManager("server");
    renderToString(
      createElement(
        HeadProvider,
        { manager },
        createElement(Head, null, createElement("title", null, "Sin idioma")),
      ),
    );

    expect(manager.getLang()).toBeUndefined();
  });

  it("recoge el lang que declara la pagina", () => {
    const manager = createHeadManager("server");
    renderToString(createElement(HeadProvider, { manager }, createElement(Head, { lang: "es" })));

    expect(manager.getLang()).toBe("es");
  });

  it("un manager por peticion: el idioma de una no se filtra al de otra", () => {
    const primera = createHeadManager("server");
    renderToString(
      createElement(HeadProvider, { manager: primera }, createElement(Head, { lang: "es" })),
    );

    const segunda = createHeadManager("server");
    renderToString(createElement(HeadProvider, { manager: segunda }, createElement(Head, null)));

    expect(primera.getLang()).toBe("es");
    expect(segunda.getLang()).toBeUndefined();
  });
});
