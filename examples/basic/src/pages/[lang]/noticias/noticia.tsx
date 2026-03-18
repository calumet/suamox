import type { LoaderContext } from "@calumet/suamox";
import { useLoaderData } from "@calumet/suamox";

export function loader({ params, query }: LoaderContext) {
  const id = query.get("id") ?? "unknown";
  return {
    info: "Site Info",
    footer: "Site Footer",
    params,
    id,
    titulo: `Noticia ${id}`,
  };
}

export default function NoticiaPage() {
  const { titulo, id } = useLoaderData<{ titulo: string; id: string }>();
  return (
    <div>
      <h1 data-testid="noticia-title">{titulo}</h1>
      <p data-testid="noticia-id">ID: {id}</p>
    </div>
  );
}
