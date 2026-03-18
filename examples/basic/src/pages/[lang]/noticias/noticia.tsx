import type { LoaderContext } from "@calumet/suamox";
import { useLoaderData, useRouteLoaderData } from "@calumet/suamox";

export function loader({ params, query }: LoaderContext) {
  const id = query.get("id") ?? "unknown";
  return { params, id, titulo: `Noticia ${id}` };
}

export default function NoticiaPage() {
  const { titulo, id } = useLoaderData<{ titulo: string; id: string }>();
  const layoutData = useRouteLoaderData<{ info: string }>("layout:[lang]");
  return (
    <div>
      <h1 data-testid="noticia-title">{titulo}</h1>
      <p data-testid="noticia-id">ID: {id}</p>
      <p data-testid="layout-info-from-page">Layout info from page: {layoutData?.info}</p>
    </div>
  );
}
