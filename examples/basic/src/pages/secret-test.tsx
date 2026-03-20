import type { LoaderContext } from "@calumet/suamox";

import { getServerOnlyData } from "../lib/secrets.server";

// This loader imports from a .server.ts file.
// The proxy + .server.ts convention must prevent this import from reaching the client.
export function loader(_ctx: LoaderContext) {
  const serverData = getServerOnlyData();
  return {
    message: "Data loaded securely",
    loadedAt: serverData.timestamp,
  };
}

// MARKER_LOADER_FUNCTION_BODY is a string inside the loader that should NOT appear
// in the client bundle, since the transform hook strips loaders from page files.
export default function SecretTestPage({ data }: { data: { message: string } | null }) {
  return (
    <div>
      <h1 data-testid="secret-heading">Secret Test</h1>
      <p data-testid="secret-message">{data?.message ?? "no data"}</p>
    </div>
  );
}
