import { describe, expect, it } from "vitest";

import { hasSafeRedirectProtocol, isSameOriginRedirect } from "../src/index";

const ORIGEN = "http://app.example";

describe("hasSafeRedirectProtocol", () => {
  it.each(["javascript:alert(1)", "data:text/html,<script>", "blob:http://app.example/x"])(
    "bloquea %s",
    (destino) => {
      expect(hasSafeRedirectProtocol(destino, ORIGEN)).toBe(false);
    },
  );

  it.each(["/panel", "https://checkout.stripe.com/pay", "//otro.example"])(
    "deja pasar %s",
    (destino) => {
      expect(hasSafeRedirectProtocol(destino, ORIGEN)).toBe(true);
    },
  );

  it("no valida el origen: para eso esta isSameOriginRedirect", () => {
    expect(hasSafeRedirectProtocol("https://evil.com", ORIGEN)).toBe(true);
  });

  it("una URL que no parsea no es segura", () => {
    expect(hasSafeRedirectProtocol("http://", ORIGEN)).toBe(false);
  });
});

describe("isSameOriginRedirect", () => {
  it.each(["/panel", "/panel?next=1", "panel", "http://app.example/panel"])(
    "acepta %s",
    (destino) => {
      expect(isSameOriginRedirect(destino, ORIGEN)).toBe(true);
    },
  );

  // Las dos resuelven al origen evil.com: el parser trata `\` como `/`
  it.each(["//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "//evil.com/panel"])(
    "rechaza %s",
    (destino) => {
      expect(isSameOriginRedirect(destino, ORIGEN)).toBe(false);
    },
  );

  it("un protocolo peligroso tampoco es del mismo origen", () => {
    expect(isSameOriginRedirect("javascript:alert(1)", ORIGEN)).toBe(false);
  });

  it("un origen base invalido no deja pasar nada", () => {
    expect(isSameOriginRedirect("/panel", "no-es-una-url")).toBe(false);
  });
});
