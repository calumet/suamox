import type { LoaderContext, PageProps } from "@calumet/suamox";

import { contarVisita } from "../lib/registro";
import { getServerOnlyData } from "../lib/secrets.server";

// This loader imports from a .server.ts file.
// The proxy + .server.ts convention must prevent this import from reaching the client.
export function loader(_ctx: LoaderContext) {
  const serverData = getServerOnlyData();
  const visitas = contarVisita("secret-test");
  return {
    message: "Data loaded securely",
    loadedAt: serverData.timestamp,
    visitas,
  };
}

// MARKER_LOADER_FUNCTION_BODY is a string inside the loader that should NOT appear
// in the client bundle, since the plugin strips loaders from page files.
// `typeof loader` en las props: nombrarlo en un tipo no debe conservarlo en el cliente
export default function SecretTestPage({ data }: PageProps<typeof loader>) {
  return (
    <div>
      <h1 data-testid="secret-heading">Secret Test</h1>
      <p data-testid="secret-message">{data?.message ?? "no data"}</p>
      <p data-testid="secret-visitas">{data?.visitas ?? 0}</p>
    </div>
  );
}
