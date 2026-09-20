import { useLoaderData } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";
import type { ReactNode } from "react";

// El loader lee `locals`, que el router no puede comparar desde el navegador:
// no sale de la URL ni de los params. Sin esto, dos paginas de esta seccion
// comparten los datos de la primera que se cargo.
export const revalidate = true;

export function loader({ locals }: LoaderContext) {
  return { sello: locals.requestTime as number };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { sello } = useLoaderData<typeof loader>();
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.5rem" }}>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ marginBottom: "1rem" }}>
        <strong>Admin</strong>
        <p style={{ margin: "0.25rem 0 0", color: "#64748b" }}>Internal section layout</p>
        <span data-testid="admin-sello">{sello}</span>
      </div>
      {children}
    </section>
  );
}
