# CSS

Suamox usa el pipeline nativo de Vite para manejar CSS en desarrollo, SSR y SSG.

## Estilos globales

Importa tu archivo global en `src/entry-client.tsx`:

```ts
import './styles/global.css';
```

## CSS Modules

Puedes usar `*.module.css` en páginas, layouts o componentes:

```tsx
import styles from './button.module.css';

export function Button() {
  return <button className={styles.root}>Enviar</button>;
}
```

## Comportamiento por modo

- `dev`: Vite inyecta estilos con HMR.
- `build` + SSR: el adaptador lee el manifest de Vite e inyecta `<link rel="stylesheet">` en el HTML.
- `build:ssg`: el prerender también lee el manifest e inyecta CSS en cada página estática.

## Recomendaciones

- Mantén los estilos globales en `src/styles/global.css`.
- Usa CSS Modules para estilos locales por componente.
- Si usas Tailwind/PostCSS, configúralo como en cualquier proyecto Vite.
