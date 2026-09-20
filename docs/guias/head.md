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

## Idioma del documento

`<html lang>` vale `en` por defecto. Una página que habla otro idioma lo declara con la prop `lang`:

```tsx
export function loader({ url }: LoaderContext) {
  return { idioma: url.pathname.startsWith("/en") ? "en" : "es" };
}

export default function Layout({ children }: { children: ReactNode }) {
  const { idioma } = useLoaderData<typeof loader>();
  return (
    <>
      <Head lang={idioma} />
      {children}
    </>
  );
}
```

Va **una sola vez, en el layout más externo que conoce el idioma**. Un documento tiene un solo `lang`, y si dos componentes lo declaran a la vez gana el último en registrarse, que no es el mismo en servidor que en cliente: el registro va de padre a hijo al renderizar y al revés en los efectos.

La `url` del loader llega con el prefijo intacto aunque [`reroute`](./reroute.md) lo quite para resolver la ruta, así que es de donde se saca el idioma.

Funciona igual en desarrollo, en producción y en SSG, porque los tres arman el documento con la misma plantilla. Al navegar dentro de la SPA el atributo se mueve solo; una página que no declara ninguno vuelve al que sirvió el servidor.

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
- No uses `dangerouslySetInnerHTML` con contenido que provenga del usuario. El componente `<Head>` renderiza HTML directamente en el `<head>` del documento, lo que permite XSS si el contenido no está sanitizado.
