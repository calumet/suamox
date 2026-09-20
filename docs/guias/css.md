# CSS

Suamox usa el pipeline nativo de Vite para manejar CSS en desarrollo, SSR y SSG.

## Estilos globales

Importa tu archivo global en el layout raíz, `src/pages/layout.tsx`:

```tsx
import "../styles/global.css";
```

No hay un sitio especial para el CSS global: un layout aplica a todo lo que cuelga de él, así que el del raíz aplica a la aplicación entera. Vale el mismo mecanismo que para el CSS de una página o de una sección.

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
