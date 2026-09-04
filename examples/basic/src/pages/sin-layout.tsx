import { Head } from "@calumet/suamox-head";

export const layout = false;

export default function SinLayoutPage() {
  return (
    <div>
      <Head>
        <title>Suamox - Sin layout</title>
      </Head>
      <h1>Sin layout</h1>
      <p data-testid="sin-layout">Esta pagina se sale de la cabecera del ejemplo</p>
      <a href="/time">Volver</a>
    </div>
  );
}
