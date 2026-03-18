import type { LoaderContext } from "@calumet/suamox";
import { useLoaderData } from "@calumet/suamox";

export function loader({ params }: LoaderContext) {
  return {
    info: "Site Info",
    footer: "Site Footer",
    params,
    items: ["Noticia A", "Noticia B", "Noticia C"],
  };
}

export default function NoticiasIndex() {
  const { items } = useLoaderData<{ items: string[] }>();
  return (
    <div>
      <h1>Noticias</h1>
      <ul data-testid="noticias-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
