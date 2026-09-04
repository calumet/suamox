# Data Loading

Suamox permite cargar datos por página con `loader()` y prerender dinámico con `getStaticPaths()`.

> **Importante:** Tanto `loader()` como `getStaticPaths()` son **server-only**. Nunca se ejecutan en el navegador. Durante navegación SPA, el cliente obtiene los datos del loader via el endpoint `/__data?path=...` del servidor.

## `loader(ctx)`

Puedes exportar un loader en cualquier página:

```tsx
export async function loader(ctx) {
  return { now: new Date().toISOString() };
}

export default function Page({ data }) {
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

El resultado del loader se inyecta como `data` en el componente.

## Contexto del loader

`ctx` contiene:

- `request`: `Request` original.
- `url`: instancia `URL`.
- `params`: parametros de ruta (`[id]`, `[slug]`, etc.).
- `query`: `URLSearchParams`.
- `locals`: objeto con datos del [middleware](./middleware.md) (vacio si no hay middleware).

## Ejemplo con parámetros dinámicos

```tsx
export async function loader({ params, query }) {
  const slug = params.slug;
  const draft = query.get("draft") === "true";
  return { slug, draft };
}

export default function BlogPage({ data }) {
  return <h1>{data.slug}</h1>;
}
```

## Acceso a cookies y headers

El `request` del loader es el request original del navegador, incluyendo headers y cookies:

```tsx
export async function loader({ request }) {
  const cookies = request.headers.get("cookie") ?? "";
  const token = cookies.split(";").find((c) => c.trim().startsWith("session="));

  if (!token) {
    return { authenticated: false };
  }

  const user = await validateSession(token.split("=")[1]);
  return { authenticated: true, user };
}
```

> **Nota:** `request` es de solo lectura. Para compartir datos entre middleware y loaders, usa `locals` en vez de modificar el request.

## `getStaticPaths()` para rutas dinámicas en SSG

En rutas dinámicas con `prerender = true`, debes exportar `getStaticPaths()`:

```tsx
export const prerender = true;

export async function getStaticPaths() {
  return [{ params: { slug: "hola" } }, { params: { slug: "mundo" } }];
}
```

Si falta `getStaticPaths()` en una ruta dinámica marcada para prerender, el build SSG falla.

## Flags por página

- `export const prerender = true`: incluye la ruta en salida estática.
- `export const csr = true`: desactiva SSR de esa ruta y renderiza en cliente.
- `export const layout = false`: renderiza la ruta sin la cadena de layouts de su carpeta.

Comportamiento por defecto:

- `prerender`: `false` (modo `defaultMode: 'ssr'`).
- `csr`: `false` (modo `defaultMode: 'ssr'`).

## Layout loaders

Los archivos `layout.tsx` tambien pueden exportar una funcion `loader()`. Esto permite que el layout cargue sus propios datos sin depender de que cada pagina hija los duplique:

```tsx
// src/pages/[lang]/layout.tsx
import { useLoaderData } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";

export async function loader({ params }: LoaderContext) {
  const menus = await fetchMenus(params.lang);
  const info = await fetchSiteInfo();
  return { menus, info, lang: params.lang };
}

export default function LangLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
```

Cada layout tiene su propio `LoaderDataContext`. Cuando un componente dentro del layout llama a `useLoaderData()`, lee los datos del loader de ese layout. Cuando un componente dentro de la pagina llama a `useLoaderData()`, lee los datos del loader de la pagina:

```tsx
// src/pages/[lang]/noticias/index.tsx
export async function loader({ params }: LoaderContext) {
  const noticias = await fetchNoticias(params.lang);
  return { noticias }; // solo datos de la pagina, no del layout
}
```

### Smart refetch (stableLayouts)

Durante navegacion SPA entre paginas que comparten el mismo layout, el framework detecta automaticamente que el layout no cambio y no re-ejecuta su loader. Solo se re-ejecutan los loaders de segmentos que cambiaron. Esto es similar al comportamiento de Remix con nested routes.

Por ejemplo, al navegar de `/es/about` a `/es/contact`, el layout `[lang]/layout.tsx` es estable, asi que su loader no se vuelve a ejecutar. Solo se ejecuta el loader de la pagina destino.

### Revalidar

`revalidar()` del router vuelve a ejecutar los loaders de la ruta activa, layouts incluidos, sin el smart refetch. Ver [Router](./router.md#revalidar).

## `useLoaderData()`

Cualquier componente hijo (dentro de una pagina o layout) puede acceder a los datos del loader sin recibirlos por props:

```tsx
import { useLoaderData, type LoaderContext } from "@calumet/suamox";

export async function loader({ params }: LoaderContext) {
  return { categories: await fetchCategories(params.lang) };
}

function Sidebar() {
  const { categories } = useLoaderData<typeof loader>();
  return (
    <ul>
      {categories.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  );
}
```

El hook lee del `LoaderDataContext` mas cercano. Si se llama desde un componente dentro de un layout que tiene loader, lee los datos de ese layout. Si se llama desde un componente dentro de la pagina, lee los datos de la pagina.

### Comportamiento

- Si la pagina tiene `loader`, `useLoaderData()` retorna lo que el loader devolvio.
- Si la pagina no tiene `loader`, retorna `null`.
- Si un layout tiene `loader`, `useLoaderData()` dentro del layout retorna los datos del layout loader.
- Funciona en SSR, SSG y navegacion SPA por igual.
- En navegacion SPA, los datos se obtienen automaticamente del servidor via `/__data?path=...`.

### Tipado

`useLoaderData()`, `useRouteLoaderData()` y `PageProps` toman la funcion del loader y sacan de ahi el tipo de los datos, asi que no hay que repetir la forma a mano:

```tsx
import { useLoaderData, type LoaderContext, type PageProps } from "@calumet/suamox";

export async function loader({ params }: LoaderContext) {
  return { producto: await fetchProducto(params.id) };
}

export default function ProductoPage({ data }: PageProps<typeof loader>) {
  const { producto } = useLoaderData<typeof loader>();
  return <h1>{data.producto.nombre}</h1>;
}
```

Para leer el loader de otro archivo, importa su tipo. `import type` no deja rastro en el bundle:

```tsx
import type { loader as layoutLoader } from "../layout";

const layoutData = useRouteLoaderData<typeof layoutLoader>("layout:[lang]");
```

Pasar el tipo de los datos en vez de la funcion sigue valiendo (`useLoaderData<{ categories: string[] }>()`) y devuelve exactamente ese tipo. Solo que la forma escrita a mano compila igual cuando el loader pasa a devolver otra cosa, y nadie se entera hasta que la pagina lee `undefined`.

### El tipo es el que sobrevive al JSON

Los datos del loader llegan al cliente serializados: en el HTML inicial dentro de `window.__INITIAL_DATA__`, y en navegacion SPA por `/__data`. Las dos rutas pasan por `JSON.stringify`, asi que al inferir del loader lo que se declara es la forma serializada:

| En el loader                        | En el componente                                     |
| ----------------------------------- | ---------------------------------------------------- |
| `Date`, o cualquier `toJSON()`      | lo que devuelve `toJSON()` (`string` para una fecha) |
| clave con una funcion o `undefined` | la clave no existe                                   |
| `Map`, `Set`                        | `{}`                                                 |

Un `publicado: new Date()` se declara `string`, y `data.publicado.toISOString()` es un error de compilacion en vez de una pantalla rota despues de hidratar.

El framework serializa el resultado del loader **antes** de renderizar, asi que esto no es solo una convencion del tipo: el componente ve exactamente lo mismo en el servidor, al hidratar y en navegacion SPA. Sin eso el render del servidor recibiria el `Date` vivo y el cliente un `string`, con el mismo componente dando resultados distintos en cada lado.

Lo que esto implica al escribir un loader: devuelve la forma serializada tu mismo cuando te importe el detalle. Una fecha viaja mejor como `fecha.toISOString()` explicito que dejandola convertir; un `Map` como `Object.fromEntries(mapa)`.

La conversion esta exportada como `Serialized<T>` por si necesitas la forma serializada de un tipo suelto:

```tsx
import type { Serialized } from "@calumet/suamox";

function Tarjeta({ producto }: { producto: Serialized<Producto> }) {
  return <span>{producto.publicado}</span>;
}
```

`useStaticProps()` no pasa por esto: es server-only y sus props no se serializan.

## `useRouteLoaderData(routeId)`

`useLoaderData()` siempre lee los datos del loader mas cercano (el del layout o el de la pagina, dependiendo de donde se llame). Pero a veces un componente dentro de una pagina necesita leer datos que vienen del layout, o viceversa.

`useRouteLoaderData(routeId)` permite acceder a los datos de cualquier loader activo por su route ID:

```tsx
import { useLoaderData, useRouteLoaderData } from "@calumet/suamox";

import type { loader as rootLoader } from "../layout";

export default function ProductPage() {
  // Datos del page loader (nivel actual)
  const { product } = useLoaderData<typeof loader>();

  // Datos del layout loader (otro nivel)
  const layoutData = useRouteLoaderData<typeof rootLoader>("layout:root");

  return (
    <div>
      <h1>{product.name}</h1>
      <p>Publicado en: {layoutData?.siteName}</p>
    </div>
  );
}
```

### Route IDs

Cada nivel de la jerarquia de rutas tiene un ID:

| Archivo                        | Route ID         |
| ------------------------------ | ---------------- |
| `src/pages/layout.tsx`         | `layout:root`    |
| `src/pages/[lang]/layout.tsx`  | `layout:[lang]`  |
| `src/pages/(admin)/layout.tsx` | `layout:(admin)` |
| `src/pages/[lang]/about.tsx`   | `/:lang/about`   |
| `src/pages/blog/[slug].tsx`    | `/blog/:slug`    |

Los layouts usan el prefijo `layout:` seguido de su ruta relativa al directorio de paginas. Las paginas usan su route path pattern (el mismo que aparece en la configuracion de rutas).

### Comportamiento

- Retorna `undefined` si el route ID no existe o no tiene loader.
- Funciona en SSR y en navegacion SPA.
- Toma el tipo del loader del otro nivel: `useRouteLoaderData<typeof layoutLoader>("layout:[lang]")`. Ver [Tipado](#tipado).
- Cualquier componente en el arbol puede leer datos de cualquier nivel activo.

### Cuando usar cada hook

| Caso de uso                                              | Hook                                  |
| -------------------------------------------------------- | ------------------------------------- |
| Leer datos del loader del nivel actual (pagina o layout) | `useLoaderData()`                     |
| Leer datos de un loader de otro nivel                    | `useRouteLoaderData(id)`              |
| Leer datos del layout desde una pagina                   | `useRouteLoaderData("layout:[lang]")` |
| Leer datos de la pagina desde un layout                  | `useRouteLoaderData("/blog/:slug")`   |

## `redirect()`

Puedes redirigir desde un loader usando `redirect()`:

```tsx
import { redirect, type LoaderContext } from "@calumet/suamox";

export async function loader({ params }: LoaderContext) {
  if (!params.lang) {
    redirect("/es"); // 302 por defecto
  }

  if (params.lang === "old") {
    redirect("/es", 301); // redirect permanente
  }

  return { lang: params.lang };
}
```

### Códigos de estado soportados

| Código | Uso                                         |
| ------ | ------------------------------------------- |
| `301`  | Redirect permanente (SEO)                   |
| `302`  | Redirect temporal (por defecto)             |
| `303`  | Redirect después de POST                    |
| `307`  | Redirect temporal preservando método HTTP   |
| `308`  | Redirect permanente preservando método HTTP |

### Notas

- `redirect()` funciona en loaders, en el middleware y en las rutas de API (server-only). En navegación SPA, el servidor ejecuta la redirección y la respuesta se propaga al cliente via `/__data`; si el destino es una ruta del cliente, el router navega a ella sin recargar la página.
- Puede redirigir a rutas internas (`/es`) o URLs externas (`https://example.com`).
- La función nunca retorna. Internamente lanza una excepción que el framework captura.

## `useStaticProps()`

Cuando usas `getStaticPaths()`, cada entrada puede devolver `props` además de `params`. Estos props están disponibles en el componente mediante `useStaticProps()`:

```tsx
import { useLoaderData, useStaticProps } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";

export const prerender = true;

export async function getStaticPaths() {
  const posts = await fetchPosts();
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { title: post.title, content: post.content },
  }));
}

export async function loader({ params }: LoaderContext) {
  return { slug: params.slug };
}

export default function PostPage() {
  const { slug } = useLoaderData<typeof loader>();
  const { title, content } = useStaticProps<{ title: string; content: string }>();

  return (
    <article>
      <h1>{title}</h1>
      <p>{content}</p>
    </article>
  );
}
```

### Diferencia entre `useLoaderData` y `useStaticProps`

| Hook               | Fuente                         | Disponible en                            |
| ------------------ | ------------------------------ | ---------------------------------------- |
| `useLoaderData()`  | Retorno de `loader()` (server) | SSR, SSG, navegación SPA (via `/__data`) |
| `useStaticProps()` | `props` de `getStaticPaths()`  | Solo servidor (SSR y SSG)                |

- `useStaticProps()` es **server-only**. Llamarlo en el cliente lanza un error.
- Retorna `{}` si la página no tiene `getStaticPaths` o si la entrada no incluye `props`.
- Durante navegación SPA, los datos del loader se obtienen automáticamente del servidor via `/__data?path=...`.
- Las páginas SSG no hidratan en el cliente, por lo que el HTML generado con `useStaticProps` se sirve tal cual sin JavaScript.

## Errores en loaders

Si un loader lanza error durante SSR, la respuesta es 500.
Recomendación: maneja errores en el loader y devuelve estados/control de UI desde `data` cuando sea posible.

## Seguridad

### No retornes datos sensibles desde loaders

Los datos retornados por `loader()` se serializan en `window.__INITIAL_DATA__` durante SSR y se envían como JSON en navegación SPA. Esto significa que **cualquier script en la página** (third-party, extensiones, etc.) puede leerlos.

No retornes desde un loader:

- Tokens de sesión o API keys
- Secrets del servidor
- Datos personales que no deban ser visibles en el HTML

Si necesitas datos sensibles en el servidor, úsalos dentro del loader sin retornarlos:

```tsx
export async function loader(ctx: LoaderContext) {
  // OK: usar el token internamente
  const data = await fetchAPI("/posts", { token: process.env.API_SECRET });
  // Solo retornar lo que el cliente necesita
  return { posts: data.posts };
}
```

### Valida URLs de redirect que vengan del usuario

Si construyes un redirect usando input del usuario (query params, form data, etc.), valida la URL antes de redirigir. Usa `isSafeRedirectUrl()` para bloquear protocolos peligrosos como `javascript:` o `data:`:

```tsx
import { redirect, isSafeRedirectUrl, type LoaderContext } from "@calumet/suamox";

export async function loader(ctx: LoaderContext) {
  const returnTo = ctx.query.get("returnTo");
  if (returnTo && !isSafeRedirectUrl(returnTo, ctx.url.origin)) {
    redirect("/");
  }
  redirect(returnTo || "/");
}
```

En código cliente aplica la misma validación:

```tsx
import { isSafeRedirectUrl } from "@calumet/suamox";

const next = new URLSearchParams(window.location.search).get("next");
if (next && isSafeRedirectUrl(next)) {
  window.location.href = next;
}
```
