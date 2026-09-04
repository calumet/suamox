import { describe, it, expectTypeOf } from "vitest";

import { useLoaderData, useRouteLoaderData } from "../src/index";
import type { LoaderContext, LoaderData, PageProps, Serialized } from "../src/index";

export async function loader(ctx: LoaderContext) {
  const tags = await Promise.resolve(["a", "b"]);
  return {
    lang: ctx.params.lang ?? "es",
    publicado: new Date(),
    tags,
  };
}

describe("useLoaderData", () => {
  it("infiere el retorno del loader cuando recibe la funcion", () => {
    expectTypeOf(useLoaderData<typeof loader>()).toEqualTypeOf<{
      lang: string;
      publicado: string;
      tags: string[];
    }>();
  });

  it("sigue devolviendo el tipo tal cual cuando recibe los datos", () => {
    expectTypeOf(useLoaderData<{ categories: string[] }>()).toEqualTypeOf<{
      categories: string[];
    }>();
    expectTypeOf(useLoaderData<{ fecha: Date } | null>()).toEqualTypeOf<{ fecha: Date } | null>();
  });

  it("sin generico sigue siendo any", () => {
    expectTypeOf(useLoaderData()).toBeAny();
  });
});

describe("useRouteLoaderData", () => {
  it("infiere el loader del layout y admite ausencia", () => {
    expectTypeOf(useRouteLoaderData<typeof loader>("layout:[lang]")).toEqualTypeOf<
      { lang: string; publicado: string; tags: string[] } | undefined
    >();
  });

  it("sigue aceptando el tipo de los datos", () => {
    expectTypeOf(useRouteLoaderData<{ info: string }>("layout:root")).toEqualTypeOf<
      { info: string } | undefined
    >();
  });
});

describe("PageProps", () => {
  it("toma la funcion o los datos", () => {
    expectTypeOf<PageProps<typeof loader>["data"]>().toEqualTypeOf<{
      lang: string;
      publicado: string;
      tags: string[];
    }>();
    expectTypeOf<PageProps<{ slug: string }>["data"]>().toEqualTypeOf<{ slug: string }>();
    expectTypeOf<PageProps["data"]>().toBeAny();
  });
});

describe("LoaderData", () => {
  it("desenvuelve loaders sincronos y sin retorno", () => {
    expectTypeOf<LoaderData<() => { a: number }>>().toEqualTypeOf<{ a: number }>();
    expectTypeOf<LoaderData<() => Promise<void>>>().toEqualTypeOf<undefined>();
  });

  it("distribuye sobre uniones de retorno", () => {
    type Union = LoaderData<() => Promise<{ ok: true; at: Date } | { ok: false }>>;
    expectTypeOf<Union>().toEqualTypeOf<{ ok: true; at: string } | { ok: false }>();
  });

  it("deja pasar any, unknown y null", () => {
    expectTypeOf<LoaderData<unknown>>().toEqualTypeOf<unknown>();
    expectTypeOf<LoaderData<null>>().toEqualTypeOf<null>();
  });
});

describe("Serialized", () => {
  it("colapsa Date y cualquier toJSON a su retorno", () => {
    expectTypeOf<Serialized<Date>>().toEqualTypeOf<string>();
    expectTypeOf<Serialized<{ precio: { toJSON(): string } }>>().toEqualTypeOf<{
      precio: string;
    }>();
  });

  it("quita las claves que JSON.stringify descarta", () => {
    expectTypeOf<
      Serialized<{ a: number; b: undefined; c: () => void; d: symbol }>
    >().toEqualTypeOf<{ a: number }>();
  });

  it("conserva las claves opcionales como opcionales", () => {
    expectTypeOf<Serialized<{ fecha?: Date; nombre: string }>>().toEqualTypeOf<{
      fecha?: string;
      nombre: string;
    }>();
  });

  it("recorre arrays y objetos anidados", () => {
    expectTypeOf<Serialized<{ items: { at: Date; tags: string[] }[] }>>().toEqualTypeOf<{
      items: { at: string; tags: string[] }[];
    }>();
  });

  it("conserva la forma de las tuplas", () => {
    expectTypeOf<Serialized<[string, Date, number]>>().toEqualTypeOf<[string, string, number]>();
    expectTypeOf<Serialized<readonly Date[]>>().toEqualTypeOf<readonly string[]>();
  });

  it("vacia Map y Set", () => {
    expectTypeOf<Serialized<{ m: Map<string, number>; s: Set<string> }>>().toEqualTypeOf<{
      m: Record<string, never>;
      s: Record<string, never>;
    }>();
  });

  it("deja los primitivos y null intactos", () => {
    expectTypeOf<Serialized<{ n: number; b: boolean; s: string; z: null }>>().toEqualTypeOf<{
      n: number;
      b: boolean;
      s: string;
      z: null;
    }>();
  });
});
