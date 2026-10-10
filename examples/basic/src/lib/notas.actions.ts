import { getActionContext } from "@calumet/suamox/server";

import { guardarNota } from "./notas.server";

// Solo vive aquí: si aparece en el bundle del navegador, el stub no reemplazó el módulo
const ORIGEN = "MARKER_ACTION_SERVER_ONLY_24680";

export async function agregarNota(
  texto: string,
): Promise<{ total: number; agente: string | null }> {
  const { request } = getActionContext();
  return { total: guardarNota(`${ORIGEN} ${texto}`), agente: request.headers.get("user-agent") };
}

export async function contarArchivo(form: FormData): Promise<number> {
  const archivo = form.get("archivo");
  return archivo instanceof Blob ? archivo.size : -1;
}

export async function rechazar(): Promise<Response> {
  return Response.json({ codigo: "NO_VALIDO" }, { status: 422 });
}

// Lo que haría un guardia sin sesión: la escritura no ocurre y el cliente tiene que saberlo
export async function redirigir(): Promise<Response> {
  return new Response(null, { status: 302, headers: { location: "/ingresar" } });
}
