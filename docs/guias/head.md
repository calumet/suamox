# Head

Suamox incluye `@calumet/suamox-head` para manejar metadatos del documento en SSR y cliente.

## Uso básico

```tsx
import { Head } from "@calumet/suamox-head";

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Inicio</title>
        <meta name="description" content="Página principal" />
      </Head>
      <h1>Hola</h1>
    </>
  );
}
```

## Qué resuelve

- En SSR: colecta nodos de `<Head>` y los inserta en el HTML renderizado.
- En cliente: sincroniza cambios de `<Head>` durante navegación.
- Evita duplicación de inserciones con marcadores internos `data-suamox-head`.

## Integración con router

`@calumet/suamox-router` envuelve el árbol en `HeadProvider`, por eso en apps normales solo usas `<Head>` en páginas/layouts.

## Cuándo usarlo

- `title` y `meta` por página.
- Etiquetas sociales (`og:*`, `twitter:*`).
- `link rel="canonical"` o `link rel="preconnect"` según ruta.

## Buenas prácticas

- Define `title` y `description` en cada página importante.
- Usa layouts para metadatos compartidos.
- Evita meter lógica pesada dentro de `<Head>`.
