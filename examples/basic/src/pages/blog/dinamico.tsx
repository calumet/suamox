import { Head } from "@calumet/suamox-head";

import "./blog-dinamico.css";

export function loader() {
  return { renderizadoEn: "servidor" };
}

export default function BlogDinamicoPage({ data }: { data: { renderizadoEn: string } | null }) {
  return (
    <div>
      <Head>
        <title>Suamox - Blog dinamico</title>
      </Head>
      <h1 className="blog-dynamic-marker">Blog dinamico</h1>
      <p data-testid="renderizado-en">{data?.renderizadoEn ?? ""}</p>
    </div>
  );
}
