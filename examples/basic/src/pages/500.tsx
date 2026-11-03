import { Head } from "@calumet/suamox-head";

export default function ServerErrorPage() {
  return (
    <div>
      <Head>
        <title>Suamox - Error</title>
      </Head>
      <h1>500 - Algo falló</h1>
      <p>No pudimos mostrar esta página.</p>
    </div>
  );
}
