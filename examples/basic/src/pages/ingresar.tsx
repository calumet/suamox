import type { LoaderContext } from "@calumet/suamox";

// El prefijo sale de la URL, que llega intacta al loader: el reroute de
// src/reroute.ts solo decide contra que ruta se casa, no reescribe la direccion
export function loader({ url }: LoaderContext) {
  const prefijado = url.pathname === "/mx" || url.pathname.startsWith("/mx/");
  return { idioma: prefijado ? "mx" : "es", prefijado };
}

interface IngresarData {
  idioma: string;
  prefijado: boolean;
}

export default function IngresarPage({ data }: { data: IngresarData | null }) {
  return (
    <div>
      <h1>Ingresar</h1>
      <p data-testid="idioma">{data?.idioma ?? "sin datos"}</p>
      <p data-testid="prefijado">{String(data?.prefijado ?? false)}</p>
      <a href="/ingresar">Por defecto</a>
      <a href="/mx/ingresar">Con prefijo</a>
    </div>
  );
}
