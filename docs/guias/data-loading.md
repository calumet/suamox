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
  const draft = query.get('draft') === 'true';
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
  return [
    { params: { slug: 'hola' } },
    { params: { slug: 'mundo' } },
  ];
}
```

Si falta `getStaticPaths()` en una ruta dinámica marcada para prerender, el build SSG falla.

## Flags por página

- `export const prerender = true`: incluye la ruta en salida estática.
- `export const csr = true`: desactiva SSR de esa ruta y renderiza en cliente.

Comportamiento por defecto:

- `prerender`: `false` (modo `defaultMode: 'ssr'`).
- `csr`: `false` (modo `defaultMode: 'ssr'`).

## Errores en loaders

Si un loader lanza error durante SSR, la respuesta es 500.
Recomendación: maneja errores en el loader y devuelve estados/control de UI desde `data` cuando sea posible.
