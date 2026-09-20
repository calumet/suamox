import { useLoaderData } from "@calumet/suamox";
import type { LoaderContext } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";
import type { ReactNode } from "react";

export function loader({ params, locals, request }: LoaderContext) {
  const siteName = (locals.siteName as string) ?? "Default Site";
  const cookie = request.headers.get("cookie") ?? "none";
  return { info: siteName, footer: "Site Footer", lang: params.lang, cookie };
}

function Header() {
  const { info, cookie } = useLoaderData<{ info: string; cookie: string }>();
  return (
    <header data-testid="lang-header">
      Info: {info}
      <span data-testid="cookie-value">{cookie}</span>
    </header>
  );
}

function Footer() {
  const { footer } = useLoaderData<{ footer: string }>();
  return <footer data-testid="lang-footer">Footer: {footer}</footer>;
}

export default function LangLayout({ children }: { children: ReactNode }) {
  const { lang } = useLoaderData<typeof loader>();
  return (
    <>
      <Head lang={lang} />
      <Header />
      <nav data-testid="lang-nav">
        <a href="/en/correos" data-testid="lang-en">
          Correos (en)
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
