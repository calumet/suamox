# Reroute

`src/reroute.ts` traduce una URL a la ruta que debe casar, antes de que el router mire la tabla. La barra de direcciones no cambia: la URL que ve la app sigue siendo la que pidió el navegador.

## Archivo

```ts
// src/reroute.ts
const IDIOMAS = ["en"];

export function reroute(pathname: string): string | void {
  const [, primero, ...resto] = pathname.split("/");
  if (IDIOMAS.includes(primero)) {
    return "/" + resto.join("/");
  }
}
```

Devuelve el pathname contra el que hay que casar, o nada para dejar la URL como está. Se registra solo, con solo existir el archivo.

## Para qué sirve

El caso principal es el idioma en la URL. Con reroute, `src/pages/` no sabe nada de idiomas:

```txt
src/
  reroute.ts
  pages/
    index.tsx
    [slug].tsx
    ingresar.tsx
```

| URL                   | ruta que casa |
| --------------------- | ------------- |
| `/`                   | `/`           |
| `/en`                 | `/`           |
| `/mision-y-vision`    | `/:slug`      |
| `/en/mision-y-vision` | `/:slug`      |
| `/fr/ingresar`        | ninguna, 404  |

El idioma sale de la URL, que llega intacta a los loaders:

```tsx
export function loader({ url }: LoaderContext) {
  return { locale: idiomaDe(url) };
}
```

Sirve igual para URLs traducidas (`/fr/a-propos` -> `/about`), alias y migraciones de rutas viejas.

## Reglas

- **Tiene que ser pura.** La misma entrada da siempre la misma salida, sin fetch ni estado.
- **Corre en cliente y servidor.** Es la razón de que viva en un archivo propio y no en `src/middleware.ts`, que es solo del servidor: si los dos lados no casaran la misma ruta, la hidratación no coincidiría.
- **Un alias de prefijo no alcanza `/api/`.** El servidor monta esas peticiones por el path crudo, así que `/en/api/algo` no llega al handler y cae en las páginas. Lo que sí se rerutea es el path de la API una vez dentro: un reroute que reescriba `/api/x` en `/api/y` cambia qué handler corre. Por eso los guardias van sobre `context.pathname` y nunca sobre `context.url.pathname`.
- **El middleware ve la ruta ya traducida.** `context.pathname` es contra lo que se casó, no lo que pidió el navegador, para que un guardia y la página que se renderiza nunca discrepen. La URL original sigue en `context.url`.
- Viaja al bundle del cliente, así que no importes nada pesado ni nada de servidor. El mapeo es **público**: un alias no oculta la ruta a la que apunta.
- Se registra por proceso, no por aplicación: un proceso sirve una sola app.
- Crear el archivo por primera vez pide reiniciar el dev server; editarlo no.

## SSG

La tabla de rutas no conoce las URLs que solo existen por el reroute, así que el prerenderizado no las encuentra. Para eso está el sentido inverso:

```ts
export function variants(pathname: string): string[] {
  return IDIOMAS.map((idioma) => (pathname === "/" ? `/${idioma}` : `/${idioma}${pathname}`));
}
```

Por cada pathname que el SSG iba a escribir, escribe además sus variantes. Compone con `getStaticPaths`: si un `[slug]` genera `/mision-y-vision`, sale también `/en/mision-y-vision`.

`variants` y `reroute` tienen que ser inversas. Si una variante no vuelve a su ruta canónica el SSG la salta y avisa por consola, en vez de escribir un 404 en silencio.
