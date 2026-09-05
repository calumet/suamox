import { describe, it, expectTypeOf } from "vitest";

import { useLoaderData, useRouteLoaderData } from "../src/index";
import type { LoaderContext, LoaderData, PageProps } from "../src/index";

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
      publicado: Date;
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
      { lang: string; publicado: Date; tags: string[] } | undefined
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
      publicado: Date;
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
    expectTypeOf<Union>().toEqualTypeOf<{ ok: true; at: Date } | { ok: false }>();
  });

  it("deja pasar any, unknown y null", () => {
    expectTypeOf<LoaderData<unknown>>().toEqualTypeOf<unknown>();
    expectTypeOf<LoaderData<null>>().toEqualTypeOf<null>();
  });

  it("conserva los tipos que el transporte preserva", () => {
    expectTypeOf<
      LoaderData<() => Promise<{ m: Map<string, number>; s: Set<string> }>>
    >().toEqualTypeOf<{
      m: Map<string, number>;
      s: Set<string>;
    }>();
    expectTypeOf<LoaderData<() => Promise<{ fecha?: Date; nombre: string }>>>().toEqualTypeOf<{
      fecha?: Date;
      nombre: string;
    }>();
    expectTypeOf<LoaderData<() => Promise<[string, Date, number]>>>().toEqualTypeOf<
      [string, Date, number]
    >();
  });
});
