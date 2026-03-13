# Data Loading

Suamox permite cargar datos por página con `loader()` y prerender dinámico con `getStaticPaths()`.

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
- `params`: parámetros de ruta (`[id]`, `[slug]`, etc.).
- `query`: `URLSearchParams`.

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

Comportamiento por defecto:

- `prerender`: `false` (modo `defaultMode: 'ssr'`).
- `csr`: `false` (modo `defaultMode: 'ssr'`).

## `useLoaderData()` — acceder a datos sin prop drilling

Cualquier componente hijo (dentro de una página o layout) puede acceder a los datos del loader sin recibirlos por props:

```tsx
import { useLoaderData } from "@calumet/suamox";

function Header() {
  const { menus } = useLoaderData<{ menus: Menu[] }>();
  return (
    <nav>
      {menus.map((m) => (
        <a key={m.id} href={m.href}>
          {m.label}
        </a>
      ))}
    </nav>
  );
}
```

El hook funciona en cualquier nivel de profundidad del árbol de componentes, incluyendo layouts:

```tsx
// src/pages/[lang]/index.tsx
export async function loader({ params }: LoaderContext) {
  const menus = await fetchMenus(params.lang);
  return { menus, lang: params.lang };
}

export default function HomePage() {
  return (
    <main>
      <Header /> {/* usa useLoaderData() internamente */}
      <Sidebar /> {/* también puede usarlo */}
    </main>
  );
}
```

### Comportamiento

- Si la página tiene `loader`, `useLoaderData()` retorna lo que el loader devolvió.
- Si la página no tiene `loader`, retorna `null`.
- Funciona en SSR, SSG y navegación cliente por igual.

## `redirect()` — redirecciones server-side

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

- `redirect()` funciona solo dentro de loaders, en el servidor (SSR).
- Puede redirigir a rutas internas (`/es`) o URLs externas (`https://example.com`).
- La función nunca retorna — internamente lanza una excepción que el framework captura.

## `useStaticProps()` — acceder a props de `getStaticPaths`

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
  const { slug } = useLoaderData<{ slug: string }>();
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

| Hook              | Fuente                        | Disponible en     |
| ----------------- | ----------------------------- | ----------------- |
| `useLoaderData()` | Retorno de `loader()`         | SSR, SSG, cliente |
| `useStaticProps()` | `props` de `getStaticPaths()` | Solo SSG          |

- `useStaticProps()` retorna `{}` si la página no tiene `getStaticPaths` o si la entrada no incluye `props`.
- Los props se serializan y se hidratan en el cliente, por lo que deben ser serializables (no funciones, no clases).

## Errores en loaders

Si un loader lanza error durante SSR, la respuesta es 500.
Recomendación: maneja errores en el loader y devuelve estados/control de UI desde `data` cuando sea posible.
