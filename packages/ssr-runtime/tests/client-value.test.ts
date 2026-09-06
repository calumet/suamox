import { Script } from "node:vm";

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { ClientValueProvider, createClientValueManager, useClientValue } from "../src/client-value";
import { hashInlineScript } from "../src/csp";
import { generateHTML } from "../src/index";

/** Renderiza en modo servidor y devuelve los scripts que se inyectarian */
function scriptsDe(componente: () => React.ReactNode): string[] {
  const manager = createClientValueManager("server");
  renderToString(createElement(ClientValueProvider, { value: manager }, createElement(componente)));
  return manager.getSnapshot();
}

describe("useClientValue", () => {
  it("en el servidor devuelve el fallback", () => {
    let visto: unknown;
    renderToString(
      createElement(
        ClientValueProvider,
        { value: createClientValueManager("server") },
        createElement(() => {
          visto = useClientValue(false, () => true);
          return null;
        }),
      ),
    );

    expect(visto).toBe(false);
  });

  it("registra un script con el resolve serializado", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => !!sessionStorage.getItem("idUsr"), { show: "#a" });
      return null;
    });

    expect(script).toContain("sessionStorage.getItem");
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

  it("no depende de una clave: el valor del cliente no viaja en el script", () => {
    // El cliente ejecuta resolve por su cuenta, asi que el script no necesita
    // emparejarse con nada. Antes esto se hacia con un hash del codigo, que cambia
    // entre el bundle de servidor y el minificado del cliente.
    const [script] = scriptsDe(() => {
      useClientValue(false, () => true, { show: "#a" });
      return null;
    });

    expect(script).not.toContain("__PREHYDRATE__");
  });

  it("el script se traga sus propios errores para no romper la pagina", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => true, { show: "#a" });
      return null;
    });

    expect(script).toContain("catch");
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

  it("no deja escapar el cierre del script, que romperia el contexto", () => {
    const [script] = scriptsDe(() => {
      useClientValue("", () => "</script><img src=x onerror=alert(1)>", { show: "#a" });
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
      useClientValue("", () => "<!--corta el html-->", { show: "#a" });
      return null;
    });

    expect(script).not.toContain("<!--");
    expect(script).toContain("<\\!--");
  });

  it("no rompe una comparacion menor-que del codigo", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => window.innerWidth < 768, { hide: "#a" });
      return null;
    });

    expect(script).toContain("<");
    expect(script).not.toContain("\\u003c");
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
          useClientValue(false, () => !!sessionStorage.getItem("usuarioA"), { show: "#a" });
          return null;
        }),
      ),
    );

    expect(a.getSnapshot()).toHaveLength(1);
    expect(b.getSnapshot()).toHaveLength(0);
  });

  it("sin patch no emite script: no habria nada que corregir", () => {
    const scripts = scriptsDe(() => {
      useClientValue(false, () => !!sessionStorage.getItem("idUsr"));
      return null;
    });

    expect(scripts).toEqual([]);
  });

  it("con patch en funcion no arrastra el helper del patch declarativo", () => {
    const [script] = scriptsDe(() => {
      useClientValue(
        "",
        () => "x",
        (v) => {
          document.title = v;
        },
      );
      return null;
    });

    expect(script).not.toContain("querySelectorAll");
  });

  it("avisa por consola si el script falla, en vez de callarse", () => {
    // El fallo mas comun es un resolve que captura algo del scope, que en el script
    // inline no existe. Sin aviso no hay forma de enterarse: el DOM converge igual.
    const [script] = scriptsDe(() => {
      useClientValue(false, () => true, { show: "#a" });
      return null;
    });

    expect(script).toContain("console.warn");
  });

  it("el script generado es JavaScript valido", () => {
    const [script] = scriptsDe(() => {
      useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
        show: "#a",
        hide: "#b",
      });
      return null;
    });

    expect(() => new Script(script)).not.toThrow();
  });
});

describe("CSP", () => {
  it("emite el meta con el hash de cada script inline", () => {
    const html = generateHTML({
      html: "<div>x</div>",
      initialData: { a: 1 },
      prehydrateScripts: ["var v=1;"],
      csp: { hash: hashInlineScript },
    });

    expect(html).toContain('<meta http-equiv="content-security-policy"');
    expect(html).toContain("script-src 'self'");
    // uno por el script de datos y otro por el de prehydrate
    expect(html.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2);
  });

  it("el hash corresponde al contenido exacto del script emitido", () => {
    const codigo = "var v=1;";
    const html = generateHTML({
      html: "<div>x</div>",
      includeInitialDataScript: false,
      prehydrateScripts: [codigo],
      csp: { hash: hashInlineScript },
    });

    expect(html).toContain(`'${hashInlineScript(codigo)}'`);
  });

  it("añade las directivas de la app", () => {
    const html = generateHTML({
      html: "<div>x</div>",
      includeInitialDataScript: false,
      csp: { hash: hashInlineScript, directives: "object-src 'none'" },
    });

    expect(html).toContain("object-src &quot;none&quot;".replace(/&quot;/g, "'"));
  });

  it("sin la opcion no emite ningun meta", () => {
    const html = generateHTML({ html: "<div>x</div>" });

    expect(html).not.toContain("content-security-policy");
  });

  it("el nonce llega a los dos scripts inline", () => {
    const html = generateHTML({
      html: "<div>x</div>",
      initialData: { a: 1 },
      prehydrateScripts: ["var v=1;"],
      nonce: "abc123",
    });

    expect(html.match(/<script nonce="abc123"/g)).toHaveLength(2);
  });
});
