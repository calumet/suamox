import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, vi } from "vitest";

import { serializeData, deserializeData, generateHTML } from "../src/index";

/** Lo que ve el cliente: el navegador parsea el literal y el runtime lo revive. */
const daLaVuelta = (value: unknown): unknown => deserializeData(JSON.parse(serializeData(value)));

/** Lo mismo, pero extrayendo el payload del HTML generado. */
const datosDelHtml = (html: string): unknown => {
  const payload = /window\.__INITIAL_DATA__ = (.*);/.exec(html)?.[1];
  return deserializeData(JSON.parse(payload ?? "null"));
};

describe("serializeData", () => {
  it("da la vuelta a los valores de siempre", () => {
    expect(daLaVuelta({ name: "John", age: 30 })).toEqual({ name: "John", age: 30 });
    expect(daLaVuelta({ count: 42, price: 19.99 })).toEqual({ count: 42, price: 19.99 });
    expect(daLaVuelta({ active: true, deleted: false })).toEqual({ active: true, deleted: false });
    expect(daLaVuelta({ value: null })).toEqual({ value: null });
    expect(daLaVuelta({ tags: ["<script>", "safe"] })).toEqual({ tags: ["<script>", "safe"] });
    expect(daLaVuelta({ user: { profile: { bio: "<p>Hello</p>" } } })).toEqual({
      user: { profile: { bio: "<p>Hello</p>" } },
    });
    expect(daLaVuelta({ text: "It's working" })).toEqual({ text: "It's working" });
    expect(daLaVuelta(null)).toBeNull();
    expect(daLaVuelta(undefined)).toBeUndefined();
  });

  it("da la vuelta a lo que JSON perdia", () => {
    const vuelta = daLaVuelta({
      fecha: new Date("2026-09-04T10:00:00Z"),
      mapa: new Map([["a", 1]]),
      conjunto: new Set(["x"]),
      patron: /ab+c/gi,
      sinValor: undefined,
      grande: 9007199254740993n,
    }) as Record<string, unknown>;

    expect(vuelta.fecha).toBeInstanceOf(Date);
    expect((vuelta.fecha as Date).toISOString()).toBe("2026-09-04T10:00:00.000Z");
    expect(vuelta.mapa).toBeInstanceOf(Map);
    expect((vuelta.mapa as Map<string, number>).get("a")).toBe(1);
    expect(vuelta.conjunto).toBeInstanceOf(Set);
    expect((vuelta.conjunto as Set<string>).has("x")).toBe(true);
    expect(vuelta.patron).toEqual(/ab+c/gi);
    expect("sinValor" in vuelta).toBe(true);
    expect(vuelta.sinValor).toBeUndefined();
    expect(vuelta.grande).toBe(9007199254740993n);
  });

  it("conserva las referencias ciclicas y las compartidas", () => {
    const comun = { n: 1 };
    const ciclico: Record<string, unknown> = { comun, otro: comun };
    ciclico.self = ciclico;

    const vuelta = daLaVuelta(ciclico) as Record<string, unknown>;

    expect(vuelta.self).toBe(vuelta);
    expect(vuelta.comun).toBe(vuelta.otro);
  });

  it("lanza con instancias de clase, diciendo en que campo", () => {
    class Decimal {
      constructor(readonly valor: string) {}
    }

    expect(() => serializeData({ producto: { precio: new Decimal("19.99") } })).toThrow(
      /non-POJOs/,
    );
  });

  it("lanza con datos binarios, que arrastrarian memoria de otras peticiones", () => {
    // devalue serializa el ArrayBuffer de respaldo entero; en Node el pool de Buffer es
    // compartido, asi que un Buffer de 2 bytes sirve 64 KB de memoria ajena al visitante
    const delPool = Buffer.from("v1");
    expect(delPool.buffer.byteLength).toBeGreaterThan(delPool.length);

    expect(() => serializeData({ etag: delPool })).toThrow(/datos binarios/);
    expect(() => serializeData({ b: new Uint8Array([1, 2]) })).toThrow(/datos binarios/);
    expect(() => serializeData({ b: new ArrayBuffer(8) })).toThrow(/datos binarios/);
    expect(() => serializeData({ b: new DataView(new ArrayBuffer(8)) })).toThrow(/datos binarios/);
  });

  it("lanza tambien con un Buffer de readFileSync, el caso idiomatico", () => {
    // readFileSync sin encoding devuelve un Buffer, y para archivos < 32 KB sale del pool
    // compartido: leer un asset y devolverlo desde un loader es el vector mas comun
    const tmp = join(tmpdir(), `suamox-test-${process.pid}.json`);
    writeFileSync(tmp, '{"version":"1.4.2"}');
    try {
      const asset = readFileSync(tmp);
      expect(asset.buffer.byteLength).toBeGreaterThan(asset.byteLength);
      expect(() => serializeData({ manifest: asset })).toThrow(/datos binarios/);
    } finally {
      unlinkSync(tmp);
    }
  });

  it("lanza con claves __proto__", () => {
    const conProto: unknown = JSON.parse('{"__proto__":{"pwn":true},"ok":1}');

    expect(() => serializeData(conProto)).toThrow(/__proto__/);
  });

  it("lanza si el payload no es JSON valido", () => {
    // devalue interpola en crudo los flags de un RegExp, y tagOf usa Object.prototype.toString,
    // asi que un Symbol.toStringTag mentiroso mete codigo dentro del <script>
    const falsoRegExp = {
      source: "a",
      flags: '",alert(document.cookie),"',
      [Symbol.toStringTag]: "RegExp",
    };

    expect(() => serializeData({ r: falsoRegExp })).toThrow(SyntaxError);
  });

  it("un payload ilegible se trata como sin datos, no tumba la hidratacion", () => {
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(deserializeData([{ a: 99 }])).toBeNull();
    expect(deserializeData({ a: 1 })).toBeNull();
    expect(avisos).toHaveBeenCalledTimes(1);

    avisos.mockRestore();
  });

  it("no deja ningun <, > ni & sin escapar", () => {
    const result = serializeData({
      code: '</script><script>alert("xss")</script>',
      text: "Tom & Jerry",
    });

    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("&");
    expect(daLaVuelta({ code: "</script>" })).toEqual({ code: "</script>" });
  });
});

describe("generateHTML", () => {
  it("should generate basic HTML structure", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<div>Content</div>");
    expect(html).toContain("</html>");
  });

  it("should include charset and viewport meta tags", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
    });

    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    );
  });

  it("should include custom head content", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      head: "<title>My Page</title>",
    });

    expect(html).toContain("<title>My Page</title>");
  });

  it("should serialize initial data safely", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      initialData: { message: '<script>alert("xss")</script>' },
    });

    expect(html).toContain("window.__INITIAL_DATA__");
    expect(html).not.toContain('<script>alert("xss")');
    expect(datosDelHtml(html)).toEqual({ message: '<script>alert("xss")</script>' });
  });

  it("should handle null initial data", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      initialData: undefined,
    });

    expect(datosDelHtml(html)).toBeNull();
  });

  it("mantiene vivos los tipos que JSON perdia hasta el cliente", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      initialData: { publicado: new Date("2026-09-04T10:00:00Z") },
    });

    const datos = datosDelHtml(html) as { publicado: Date };
    expect(datos.publicado).toBeInstanceOf(Date);
    expect(datos.publicado.toISOString()).toBe("2026-09-04T10:00:00.000Z");
  });

  it("should include script tags", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      scripts: ["/assets/main.js", "/assets/vendor.js"],
    });

    expect(html).toContain('<script type="module" src="/assets/main.js"></script>');
    expect(html).toContain('<script type="module" src="/assets/vendor.js"></script>');
  });

  it("should include stylesheet links", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      styles: ["/assets/main.css", "/assets/vendor.css"],
    });

    expect(html).toContain('<link rel="stylesheet" href="/assets/main.css">');
    expect(html).toContain('<link rel="stylesheet" href="/assets/vendor.css">');
  });

  it("should deduplicate repeated styles and scripts", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      styles: ["/assets/main.css", "/assets/main.css"],
      scripts: ["/assets/main.js", "/assets/main.js"],
      preloadScripts: ["/assets/main.js", "/assets/main.js"],
    });

    expect(html.match(/\/assets\/main\.css/g)?.length).toBe(1);
    expect(html.match(/\/assets\/main\.js/g)?.length).toBe(2);
  });

  it("should handle no scripts", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
    });

    expect(html).not.toContain('<script type="module"');
    expect(html).toContain("window.__INITIAL_DATA__");
  });

  it("should allow skipping initial data script", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      includeInitialDataScript: false,
    });

    expect(html).not.toContain("window.__INITIAL_DATA__");
  });

  it("should place initial data before external scripts", () => {
    const html = generateHTML({
      html: '<div id="root"></div>',
      initialData: { loaded: true },
      scripts: ["/app.js"],
    });

    const dataIndex = html.indexOf("window.__INITIAL_DATA__");
    const scriptIndex = html.indexOf('<script type="module" src="/app.js">');

    expect(dataIndex).toBeLessThan(scriptIndex);
  });

  it("should handle complex initial data", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      initialData: {
        user: { name: "John", email: "john@example.com" },
        posts: [
          { id: 1, title: "First" },
          { id: 2, title: "Second" },
        ],
        settings: { theme: "dark", notifications: true },
      },
    });

    expect(html).toContain("window.__INITIAL_DATA__");
    expect(html).toContain("John");
    expect(html).toContain("john@example.com");
  });

  it("should escape HTML entities in initial data", () => {
    const html = generateHTML({
      html: "<div>Content</div>",
      initialData: {
        dangerous: '<img src=x onerror="alert(1)">',
        script: "</script><script>alert(2)</script>",
      },
    });

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("</script><script>");
    // devalue escapa el `<` en mayuscula, serializeData el resto en minuscula
    expect(html).toMatch(/\\u003c/i);
    expect(html).toContain("\\u003e");
  });

  it("should create valid HTML structure", () => {
    const html = generateHTML({
      html: '<div id="root"><h1>Hello</h1></div>',
      head: "<title>Test</title>",
      initialData: { test: true },
      scripts: ["/main.js"],
    });

    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<head>/);
    expect(html).toMatch(/<\/head>/);
    expect(html).toMatch(/<body>/);
    expect(html).toMatch(/<\/body>/);
    expect(html).toMatch(/<\/html>/);
  });
});
