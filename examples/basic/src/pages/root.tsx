import { useRouteLoaderData, type LoaderContext } from "@calumet/suamox";
import type { ReactNode } from "react";

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
