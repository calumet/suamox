import { useRouteLoaderData, type LoaderContext } from "@calumet/suamox";
import type { ReactNode } from "react";

// Aqui y no en `layout.tsx`: el root envuelve siempre, y una pagina con
// `export const layout = false` se sale de los layouts pero no de el
import "../styles/global.css";

export function loader({ url }: LoaderContext) {
  return { idioma: url.pathname.startsWith("/fr") ? "fr" : "es" };
}

export default function Root({ children }: { children: ReactNode }) {
  const { idioma } = useRouteLoaderData<typeof loader>("root") ?? { idioma: "es" };

  return (
    <div data-testid="app-root" data-idioma={idioma}>
      {children}
    </div>
  );
}
