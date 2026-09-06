import type React from "react";
import { createContext, useContext, useState } from "react";

/** Selectores a los que el script inline aplica `hidden` segun el valor resuelto */
export interface ClientValuePatch {
  /** Se muestran cuando el valor es truthy */
  show?: string;
  /** Se ocultan cuando el valor es truthy */
  hide?: string;
}

export type ClientValueMode = "server" | "client";

interface ClientValueEntry {
  key: string;
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
      if (!entries.has(entry.key)) entries.set(entry.key, entry);
    },
    getSnapshot: () => Array.from(entries.values(), buildScript),
  };
};

// El contexto se guarda en globalThis porque el adaptador y la app pueden cargar
// copias distintas del modulo, igual que hace el manager de head
const globalKey = "__SUAMOX_CLIENT_VALUE_CONTEXT__";
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
 * y `<` solo vale dentro de un string, asi que romperia cualquier `a < b`. Estas
 * dos secuencias solo aparecen en codigo valido dentro de strings, regex o comentarios,
 * donde la barra invertida es inocua.
 */
const escapeScript = (code: string): string =>
  code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

/**
 * Clave derivada del propio codigo, no de la posicion en el arbol.
 *
 * `useId` no sirve: cambia si React remonta el arbol en vez de hidratarlo, y entonces
 * el valor precomputado deja de encontrarse. Derivarla del `resolve` y del `patch` la
 * hace igual en servidor y cliente, y estable entre montajes. Dos hooks con el mismo
 * codigo comparten entrada, que es correcto: calculan lo mismo.
 */
function hashKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return `cv${(hash >>> 0).toString(36)}`;
}

function buildScript(entry: ClientValueEntry): string {
  const key = JSON.stringify(entry.key);
  const lines = [
    `var v=(${entry.resolve})();`,
    `(window.__PREHYDRATE__=window.__PREHYDRATE__||{})[${key}]=v;`,
  ];

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

  const helper = `function d(s,h){var n=document.querySelectorAll(s);${
    process.env.NODE_ENV === "production"
      ? ""
      : `if(!n.length)console.warn("[suamox] useClientValue: el selector "+s+" no encontro elementos");`
  }n.forEach(function(e){e.hidden=h;});}`;

  return escapeScript(`(function(){${helper}${lines.join("")}})();`);
}

declare global {
  interface Window {
    __PREHYDRATE__?: Record<string, unknown>;
  }
}

/**
 * Valor que solo existe en el cliente, sin el parpadeo de la hidratacion.
 *
 * En SSR devuelve `fallback` y registra un `<script>` inline que se inyecta al final
 * del body. Ese script computa el valor real, parchea el DOM y lo deja en
 * `window.__PREHYDRATE__`, de donde React lo lee al hidratar, asi que no hay mismatch.
 *
 * `resolve` y `patch` se serializan con `toString()`: no pueden usar imports ni
 * variables del componente, solo APIs globales del navegador. Su codigo acaba en el
 * HTML publico, asi que no deben llevar secretos.
 */
export function useClientValue<T>(
  fallback: T,
  resolve: () => T,
  patch?: ClientValuePatch | ((value: T) => void),
): T {
  const serializedPatch = typeof patch === "function" ? patch.toString() : patch;
  const key = hashKey(resolve.toString() + JSON.stringify(serializedPatch ?? null));
  const manager = useContext(ClientValueContext);

  if (manager && manager.mode === "server") {
    manager.register({ key, resolve: resolve.toString(), patch: serializedPatch });
  }

  const [value] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    const prehydrated = window.__PREHYDRATE__;
    return prehydrated && key in prehydrated ? (prehydrated[key] as T) : fallback;
  });

  return value;
}
