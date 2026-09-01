import type { LoaderContext } from "@calumet/suamox";

export function loader({ params }: LoaderContext) {
  return { idioma: params.lang ?? "es", prefijado: params.lang !== undefined };
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
      <a href="/en/ingresar">English</a>
    </div>
  );
}
