import { useLoaderData } from "@calumet/suamox";
import type { ReactNode } from "react";

function Header() {
  const { info } = useLoaderData<{ info: string }>();
  return <header data-testid="lang-header">Info: {info}</header>;
}

function Footer() {
  const { footer } = useLoaderData<{ footer: string }>();
  return <footer data-testid="lang-footer">Footer: {footer}</footer>;
}

export default function LangLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <nav data-testid="lang-nav">
        <a href="/es/noticias">Noticias</a>
        <a href="/es/noticias/noticia?id=1">Noticia 1</a>
        <a href="/es/noticias/noticia?id=2">Noticia 2</a>
      </nav>
      {children}
      <Footer />
    </>
  );
}
