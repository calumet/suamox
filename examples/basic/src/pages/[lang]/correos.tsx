import { useLoaderData, type LoaderContext } from "@calumet/suamox";

export function loader({ params }: LoaderContext) {
  return { lang: params.lang };
}

export default function LangCorreos() {
  const { lang } = useLoaderData<{ lang: string }>();
  return <h1 data-testid="lang-correos">Correos {lang}</h1>;
}
