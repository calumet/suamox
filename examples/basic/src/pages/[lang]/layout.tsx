import { useLoaderData } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";
import type { ReactNode } from "react";

interface DatosLayout {
  info: string;
  footer: string;
  lang: string;
  cookieNames: string;
}

/** Un idioma que no existe: sirve para ejercitar un loader de layout que devuelve `null` */
const SIN_DATOS = "sindatos";

export function loader({ params, locals, request }: LoaderContext): DatosLayout | null {
  if (params.lang === SIN_DATOS) {
    return null;
  }

  const siteName = (locals.siteName as string) ?? "Default Site";
  // Lo que devuelve un loader viaja al navegador dentro de `__INITIAL_DATA__`.
  // Devolver la cabecera entera publicaria el valor de cada cookie, HttpOnly
  // incluida, asi que de aqui solo salen los nombres
  const cookieNames =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((pair) => pair.split("=")[0]?.trim())
      .filter(Boolean)
      .join(" ") ?? "none";
  return { info: siteName, footer: "Site Footer", lang: params.lang ?? "", cookieNames };
}

function Header() {
  const datos = useLoaderData<typeof loader>();
  return (
    <header data-testid="lang-header">
      Info: {datos?.info ?? "sin datos"}
      <span data-testid="cookie-names">{datos?.cookieNames ?? "sin datos"}</span>
    </header>
  );
}

function Footer() {
  const datos = useLoaderData<typeof loader>();
  return (
    <footer data-testid="lang-footer">
      Footer: {datos?.footer ?? "sin datos"}
      <span data-testid="layout-lang">{datos?.lang ?? "sin datos"}</span>
    </footer>
  );
}

export default function LangLayout({ children }: { children: ReactNode }) {
  const datos = useLoaderData<typeof loader>();
  return (
    <>
      <Head lang={datos?.lang} />
      <Header />
      <nav data-testid="lang-nav">
        <a href="/en/correos" data-testid="lang-en">
          Correos (en)
        </a>
        <a href={`/${SIN_DATOS}/correos`} data-testid="lang-sin-datos">
          Correos (sin datos)
        </a>
        <a href="/es/noticias">Noticias</a>
        <a href="/es/noticias/noticia?id=1">Noticia 1</a>
        <a href="/es/noticias/noticia?id=2">Noticia 2</a>
      </nav>
      {children}
      <Footer />
    </>
  );
}
