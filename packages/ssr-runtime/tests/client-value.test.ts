import { Script } from "node:vm";

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { ClientValueProvider, createClientValueManager, useClientValue } from "../src/client-value";

/** Renderiza en modo servidor y devuelve los scripts que se inyectarian */
function scriptsDe(componente: () => React.ReactNode): string[] {
  const manager = createClientValueManager("server");
  renderToString(createElement(ClientValueProvider, { value: manager }, createElement(componente)));
  return manager.getSnapshot();
}

describe("useClientValue", () => {
  it("en el servidor devuelve el fallback", () => {
    let visto: unknown;
    const html = renderToString(
      createElement(
        ClientValueProvider,
        { value: createClientValueManager("server") },
        createElement(() => {
          visto = useClientValue(false, () => true);
          return createElement("p", null, String(visto));
        }),
      ),
    );

    expect(visto).toBe(false);
    expect(html).toContain("false");
  });

  it("registra un script con el resolve serializado", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => !!sessionStorage.getItem("idUsr"));
      return null;
    });

    expect(script).toContain("sessionStorage.getItem");
    expect(script).toContain("__PREHYDRATE__");
  });

  it("el patch declarativo usa hidden y no un atributo propio", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => true, { show: "#btn-logout", hide: "#btn-login" });
      return null;
    });

    expect(script).toContain('"#btn-logout"');
    expect(script).toContain('"#btn-login"');
    expect(script).toContain("e.hidden=h");
    expect(script).not.toContain("data-cv-hide");
  });

  it("un patch en funcion se serializa tal cual", () => {
    const [script] = scriptsDe(() => {
      useClientValue(
        "00:00",
        () => "12:00",
        (v) => {
          document.title = v;
        },
      );
      return null;
    });

    expect(script).toContain("document.title");
  });

  it("da una key distinta a cada invocacion", () => {
    const scripts = scriptsDe(() => {
      useClientValue(false, () => true);
      useClientValue(false, () => false);
      return null;
    });

    expect(scripts).toHaveLength(2);
    const claves = scripts.map((s) => /__PREHYDRATE__\|\|\{\}\)\[("[^"]+")\]/.exec(s)?.[1]);
    expect(claves[0]).not.toBe(claves[1]);
  });

  it("no deja escapar el cierre del script, que romperia el contexto", () => {
    const [script] = scriptsDe(() => {
      useClientValue("", () => "</script><img src=x onerror=alert(1)>");
      return null;
    });

    expect(script).not.toContain("</script>");
    expect(script).toContain("<\\/script");
  });

  it("escapa tambien el selector, que puede venir de una variable", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => true, { hide: "</script><img src=x>" });
      return null;
    });

    expect(script).not.toContain("</script>");
  });

  it("escapa el inicio de comentario HTML", () => {
    const [script] = scriptsDe(() => {
      useClientValue("", () => "<!--corta el html-->");
      return null;
    });

    expect(script).not.toContain("<!--");
    expect(script).toContain("<\\!--");
  });

  it("no rompe una comparacion menor-que del codigo", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => window.innerWidth < 768);
      return null;
    });

    // Escapar `<` entero como en serializeData romperia el operador
    expect(script).toContain("<");
    expect(script).not.toContain("\\u003c");
    // vm.Script compila sin ejecutar: valida la sintaxis sin correr el codigo
    expect(() => new Script(script)).not.toThrow();
  });

  it("cada manager es independiente, para no filtrar entre requests", () => {
    const a = createClientValueManager("server");
    const b = createClientValueManager("server");

    renderToString(
      createElement(
        ClientValueProvider,
        { value: a },
        createElement(() => {
          useClientValue(false, () => !!sessionStorage.getItem("usuarioA"));
          return null;
        }),
      ),
    );

    expect(a.getSnapshot()).toHaveLength(1);
    expect(b.getSnapshot()).toHaveLength(0);
  });

  it("el script generado es JavaScript valido", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
        show: "#a",
        hide: "#b",
      });
      return null;
    });

    // vm.Script compila sin ejecutar: valida la sintaxis sin correr el codigo
    expect(() => new Script(script)).not.toThrow();
  });
});
