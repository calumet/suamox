import type React from "react";
import { createContext, useContext, useSyncExternalStore } from "react";

/** Selectores a los que el script inline aplica `hidden` segun el valor resuelto */
export interface ClientValuePatch {
  /** Se muestran cuando el valor es truthy */
  show?: string;
  /** Se ocultan cuando el valor es truthy */
  hide?: string;
}

export type ClientValueMode = "server" | "client";

interface ClientValueEntry {
  resolve: string;
  patch?: ClientValuePatch | string;
}

export interface ClientValueManager {
  mode: ClientValueMode;
  register: (entry: ClientValueEntry) => void;
  /** Codigo de los scripts inline registrados, en orden de render */
  getSnapshot: () => string[];
}

export const createClientValueManager = (mode: ClientValueMode): ClientValueManager => {
  const entries = new Map<string, ClientValueEntry>();

  return {
    mode,
    register: (entry) => {
      const clave = entry.resolve + JSON.stringify(entry.patch ?? null);
      if (!entries.has(clave)) entries.set(clave, entry);
    },
    getSnapshot: () => Array.from(entries.values(), buildScript),
  };
};

// El contexto se guarda en globalThis porque el adaptador y la app pueden cargar copias
// distintas del modulo. La clave es un Symbol, no una cadena: un `<div id="...">` en el
// HTML crea una propiedad de `window` con ese nombre y suplantaria el contexto.
const globalKey = Symbol.for("suamox.clientValueContext");
type ContextType = React.Context<ClientValueManager | null>;
const store = globalThis as typeof globalThis & { [globalKey]?: ContextType };
const ClientValueContext: ContextType =
  store[globalKey] ?? createContext<ClientValueManager | null>(null);
if (!store[globalKey]) store[globalKey] = ClientValueContext;

export const ClientValueProvider = ClientValueContext.Provider;

/**
 * Escapa las secuencias que cierran el contexto de un `<script>`.
 *
 * No se puede escapar `<` entero como en `serializeData`: aqui el contenido es codigo,
 * y `<` solo vale dentro de un string, asi que romperia cualquier `a < b`.
 */
const escapeScript = (code: string): string =>
  code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

function buildScript(entry: ClientValueEntry): string {
  const lines = [`var v=(${entry.resolve})();`];

  if (typeof entry.patch === "string") {
    lines.push(`(${entry.patch})(v);`);
  } else if (entry.patch) {
    // Los selectores van serializados, nunca concatenados: pueden venir de una variable
    if (entry.patch.show !== undefined) {
      lines.push(`d(${JSON.stringify(entry.patch.show)},!v);`);
    }
    if (entry.patch.hide !== undefined) {
      lines.push(`d(${JSON.stringify(entry.patch.hide)},!!v);`);
    }
  }

  // El helper solo hace falta con el patch declarativo; con uno en funcion sobra
  const helper =
    entry.patch && typeof entry.patch !== "string"
      ? `function d(s,h){document.querySelectorAll(s).forEach(function(e){e.hidden=h;});}`
      : "";

  // Si el script falla, React converge igual al hidratar: solo se pierde la correccion
  // antes del primer pintado. Pero avisa: el fallo mas comun es un `resolve` que captura
  // algo del scope, que aqui no existe, y en silencio no hay forma de notarlo.
  return escapeScript(
    `(function(){try{${helper}${lines.join("")}}catch(e){` +
      `console.warn("[suamox] useClientValue: el script inline fallo, se corrige al hidratar",e);}})();`,
  );
}

const noSuscribir = () => () => {};

/**
 * Valor que solo existe en el cliente, sin el parpadeo de la hidratacion.
 *
 * En SSR devuelve `fallback` y registra un `<script>` inline que el framework inyecta
 * al final del body para corregir el DOM antes del primer pintado. El valor con el que
 * React hidrata sale de ejecutar `resolve` en el cliente, no del script, asi que si el
 * script falla la pantalla converge igual.
 *
 * `resolve` debe devolver un primitivo: se llama en cada render y el resultado se
 * compara con `Object.is`, asi que un objeto nuevo cada vez provocaria un bucle.
 *
 * Solo el `<script>` inline se serializa con `toString()`, y ahi no valen imports ni
 * variables externas. Su codigo acaba en el HTML publico: no debe llevar secretos.
 */
export function useClientValue<T>(
  fallback: T,
  resolve: () => T,
  patch?: ClientValuePatch | ((value: T) => void),
): T {
  const manager = useContext(ClientValueContext);

  // Sin patch no hay nada que corregir en el DOM: el script solo calcularia el valor
  // para tirarlo, ejecutando una lectura de storage en el camino critico para nada
  if (manager && manager.mode === "server" && patch !== undefined) {
    manager.register({
      resolve: resolve.toString(),
      patch: typeof patch === "function" ? patch.toString() : patch,
    });
  }

  return useSyncExternalStore(noSuscribir, resolve, () => fallback);
}
