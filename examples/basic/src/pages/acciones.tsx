import { useClientValue } from "@calumet/suamox";
import { Head } from "@calumet/suamox-head";
import { ActionError, revalidate } from "@calumet/suamox-router";
import { useState } from "react";

import { agregarNota, contarArchivo, rechazar, redirigir } from "../lib/notas.actions";
import { listarNotas } from "../lib/notas.server";

export function loader() {
  return { notas: listarNotas() };
}

export default function AccionesPage({ data }: { data: { notas: string[] } | null }) {
  const [resultado, setResultado] = useState("");
  // Un clic antes de hidratar no llega a ningún manejador
  const hydrated = useClientValue(false, () => true);

  const agregar = async () => {
    const { total } = await agregarNota(`nota ${Date.now()}`);
    await revalidate();
    setResultado(`total ${total}`);
  };

  const subir = async () => {
    const form = new FormData();
    form.set("archivo", new Blob(["hola"]), "hola.txt");
    setResultado(`bytes ${await contarArchivo(form)}`);
  };

  const fallar = async () => {
    try {
      await rechazar();
    } catch (error) {
      if (error instanceof ActionError) {
        setResultado(`${error.status} ${(error.data as { codigo: string }).codigo}`);
      }
    }
  };

  const desviar = async () => {
    try {
      await redirigir();
      setResultado("sin error");
    } catch (error) {
      if (error instanceof ActionError) {
        setResultado(`${error.status} ${(error.data as { redirect: string }).redirect}`);
      }
    }
  };

  return (
    <div>
      <Head>
        <title>Acciones</title>
      </Head>
      <h1>Acciones</h1>
      <p data-testid="notas">{data?.notas.length ?? 0}</p>
      <p data-testid="resultado">{resultado}</p>
      <button
        type="button"
        data-testid="agregar"
        disabled={!hydrated}
        onClick={() => void agregar()}
      >
        Agregar
      </button>
      <button type="button" data-testid="subir" disabled={!hydrated} onClick={() => void subir()}>
        Subir
      </button>
      <button type="button" data-testid="fallar" disabled={!hydrated} onClick={() => void fallar()}>
        Fallar
      </button>
      <button
        type="button"
        data-testid="desviar"
        disabled={!hydrated}
        onClick={() => void desviar()}
      >
        Desviar
      </button>
    </div>
  );
}
