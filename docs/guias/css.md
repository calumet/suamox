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

- `dev`: Vite inyecta estilos con HMR. El adaptador SSR recolecta automáticamente todo el CSS del grafo de módulos para prevenir FOUC.
- `build` + SSR: el adaptador lee el manifest de Vite e inyecta `<link rel="stylesheet">` en el HTML.
- `build:ssg`: el prerender también lee el manifest e inyecta CSS en cada página estática.

## Recomendaciones

- Mantén los estilos globales en `src/styles/global.css`.
- Usa CSS Modules para estilos locales por componente.
- Si usas Tailwind/PostCSS, configúralo como en cualquier proyecto Vite.
