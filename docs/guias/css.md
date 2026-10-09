# CSS

Suamox usa el pipeline nativo de Vite para manejar CSS en desarrollo, SSR y SSG.

## Estilos globales

Importa tu archivo global en `src/pages/root.tsx`:

```tsx
import "../styles/global.css";
```

**En el root y no en `layout.tsx`.** Los dos envuelven la aplicación, pero sólo el root envuelve _siempre_: una página con [`export const layout = false`](./routing.md) se sale de la cadena de layouts, y si el CSS global viviera ahí esa página se quedaría sin estilos.

Fuera de eso no hay nada especial en el CSS global: es el mismo mecanismo que el de una página o el de una sección, sólo que importado desde el componente que envuelve a todos.

## CSS Modules

Puedes usar `*.module.css` en páginas, layouts o componentes:

```tsx
import styles from "./button.module.css";

export function Button() {
  return <button className={styles.root}>Enviar</button>;
}
```

## Comportamiento por modo

- `dev`: Vite inyecta estilos con HMR. El adaptador SSR recolecta automáticamente todo el CSS del grafo de módulos para prevenir FOUC, en el orden de los `@import`: lo importado antes que quien lo importa.
- `build` + SSR: el adaptador lee el manifest de Vite e inyecta `<link rel="stylesheet">` en el HTML.
- `build:ssg`: el prerender también lee el manifest e inyecta CSS en cada página estática.

## Precarga de fuentes

Una fuente declarada en el CSS no se pide hasta que el navegador ha leído la hoja, y con `font-display: swap` eso se ve como un salto de tipografía. `preloadFonts` hace que el HTML las anuncie en el `<head>`:

```ts
// vite.config.ts
suamoxPages({ preloadFonts: /-latin-wght-/ });
```

El filtro recibe el nombre del archivo construido, y se precarga cada fuente que lo cumpla entre las que declara el CSS de la ruta (la entrada, sus layouts y la página). Va en SSR y SSG; en desarrollo no, porque sale del manifest del build.

No hay valor por defecto a propósito, igual que en SvelteKit, Next y Astro: un paquete como `@fontsource` trae un archivo por subset (latin, latin-ext, cyrillic, greek, vietnamese…) y el navegador baja solo los que necesita por `unicode-range`. Precargarlos todos baja todos. Elige los que usa la primera pantalla.

## Recomendaciones

- Mantén los estilos globales en `src/styles/global.css`.
- Usa CSS Modules para estilos locales por componente.
- Si usas Tailwind/PostCSS, configúralo como en cualquier proyecto Vite.
