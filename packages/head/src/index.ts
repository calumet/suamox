import type React from "react";
import {
  createContext,
  createElement,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useRef,
} from "react";

export type HeadManagerMode = "server" | "client";

const LANG_TAG_RE = /^[A-Za-z][A-Za-z0-9-]{0,34}$/;

let invalidLangReported = false;

/**
 * Unico filtro del `lang` que declara una pagina: lo llaman tanto el documento
 * del servidor como el atributo que escribe el cliente al navegar.
 *
 * Se valida contra la gramatica de BCP 47 en vez de escaparse porque el
 * documento **se reescribe con expresiones regulares antes de llegar al
 * navegador** —`transformIndexHtml` inyecta en la primera coincidencia de
 * `<head`, y el pase del nonce busca `<script`—, y ahi un `<` deja de ser el
 * texto inerte que seria dentro de un atributo.
 */
export function safeLang(lang: unknown): string {
  if (lang === undefined) {
    return "en";
  }
  if (typeof lang === "string" && LANG_TAG_RE.test(lang)) {
    return lang;
  }
  // El valor puede venir de la URL: avisar por peticion deja llenar el log, y
  // en crudo deja forjar una linea entera
  if (!invalidLangReported) {
    invalidLangReported = true;
    console.warn(
      `[suamox] lang no es una etiqueta de idioma, se sirve "en":`,
      JSON.stringify(lang),
    );
  }
  return "en";
}

export interface HeadManager {
  mode: HeadManagerMode;
  register: (id: symbol, node: React.ReactNode, lang?: string) => void;
  unregister: (id: symbol) => void;
  getSnapshot: () => React.ReactNode[];
  /** `<html lang>` que pidio la pagina, si alguna lo pidio */
  getLang: () => string | undefined;
  subscribe: (listener: () => void) => () => void;
}

export const headMarkerAttribute = "data-suamox-head";
export const headMarkerStartValue = "start";
export const headMarkerEndValue = "end";

const headMarkerStartSelector = `meta[${headMarkerAttribute}="${headMarkerStartValue}"]`;
const headMarkerEndSelector = `meta[${headMarkerAttribute}="${headMarkerEndValue}"]`;

const canUseDOM = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

export const createHeadManager = (mode: HeadManagerMode): HeadManager => {
  const entries = new Map<symbol, React.ReactNode>();
  const langs = new Map<symbol, string>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    if (mode !== "client") {
      return;
    }
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    mode,
    register(id, node, lang) {
      entries.set(id, node);
      // Se filtra al entrar, no al salir: asi `getLang()` no puede devolver algo
      // que el documento del servidor haya descartado
      if (lang === undefined) langs.delete(id);
      else langs.set(id, safeLang(lang));
      notify();
    },
    unregister(id) {
      entries.delete(id);
      langs.delete(id);
      notify();
    },
    getSnapshot() {
      return Array.from(entries.values());
    },
    // Gana el ultimo que lo pida. Declararlo en dos sitios a la vez resuelve
    // distinto en servidor que en cliente: el registro va de padre a hijo al
    // renderizar y al reves en los efectos
    getLang() {
      let last: string | undefined;
      for (const value of langs.values()) last = value;
      return last;
    },
    subscribe(listener) {
      if (mode !== "client") {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

// Symbol y no cadena: un `<div id="...">` en el HTML crea una propiedad de `window`
// con ese nombre, y suplantaria el contexto tumbando la hidratacion
const globalContextKey = Symbol.for("suamox.headContext");
type HeadContextType = React.Context<HeadManager | null>;
const globalHeadContext = globalThis as typeof globalThis & {
  [globalContextKey]?: HeadContextType;
};
const HeadContext: HeadContextType =
  globalHeadContext[globalContextKey] ?? createContext<HeadManager | null>(null);

if (!globalHeadContext[globalContextKey]) {
  globalHeadContext[globalContextKey] = HeadContext;
}

const toKebabCase = (value: string): string =>
  value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const ensureHeadMarkers = (): { start: Element; end: Element } => {
  const head = document.head;
  let start = head.querySelector(headMarkerStartSelector);
  let end = head.querySelector(headMarkerEndSelector);

  if (!start) {
    start = document.createElement("meta");
    start.setAttribute(headMarkerAttribute, headMarkerStartValue);
    head.appendChild(start);
  }

  if (!end) {
    end = document.createElement("meta");
    end.setAttribute(headMarkerAttribute, headMarkerEndValue);
    head.appendChild(end);
  }

  if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
    head.appendChild(end);
  }

  return { start, end };
};

const renderHeadDom = (node: React.ReactNode, target: Document): Node[] => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  if (typeof node === "string" || typeof node === "number") {
    return [target.createTextNode(String(node))];
  }

  if (Array.isArray(node)) {
    const nodes = node as React.ReactNode[];
    return nodes.flatMap((child) => renderHeadDom(child, target));
  }

  if (!isValidElement(node)) {
    return [];
  }

  const elementNode = node as React.ReactElement<Record<string, unknown>>;

  if (elementNode.type === Fragment) {
    return renderHeadDom(elementNode.props.children as React.ReactNode, target);
  }

  if (typeof elementNode.type !== "string") {
    return [];
  }

  const element = target.createElement(elementNode.type);
  const props = elementNode.props;

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "dangerouslySetInnerHTML" || key === "ref" || key === "key") {
      continue;
    }

    if (key === "className") {
      if (typeof value === "string") {
        element.setAttribute("class", value);
      }
      continue;
    }

    if (key === "htmlFor") {
      if (typeof value === "string") {
        element.setAttribute("for", value);
      }
      continue;
    }

    if (key === "style" && value && typeof value === "object") {
      const styleEntries = Object.entries(value as Record<string, string | number>);
      const styleValue = styleEntries
        .map(([styleKey, styleVal]) => `${toKebabCase(styleKey)}:${String(styleVal)}`)
        .join(";");
      if (styleValue) {
        element.setAttribute("style", styleValue);
      }
      continue;
    }

    if (value === true) {
      element.setAttribute(key, "");
      continue;
    }

    if (value === false || value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      element.setAttribute(key, String(value));
    }
  }

  const dangerouslySetInnerHTML = props.dangerouslySetInnerHTML as { __html?: string } | undefined;
  if (dangerouslySetInnerHTML?.__html) {
    element.innerHTML = dangerouslySetInnerHTML.__html;
    return [element];
  }

  const children = renderHeadDom(elementNode.props.children as React.ReactNode, target);
  for (const child of children) {
    element.appendChild(child);
  }

  return [element];
};

const applyHeadNodes = (nodes: React.ReactNode[]): void => {
  if (!canUseDOM()) {
    return;
  }

  const { start, end } = ensureHeadMarkers();
  let cursor = start.nextSibling;
  while (cursor && cursor !== end) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }

  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    const rendered = renderHeadDom(node, document);
    for (const renderedNode of rendered) {
      fragment.appendChild(renderedNode);
    }
  }

  end.parentNode?.insertBefore(fragment, end);
};

export function HeadProvider({
  children,
  manager,
}: {
  children?: React.ReactNode;
  manager?: HeadManager;
}): React.ReactElement {
  const managerRef = useRef<HeadManager | null>(null);

  /* oxlint-disable react/refs -- inicializacion perezosa del ref, el patron que documenta React */
  if (!managerRef.current) {
    managerRef.current = manager ?? createHeadManager(canUseDOM() ? "client" : "server");
  }

  const activeManager = manager ?? managerRef.current;
  /* oxlint-enable react/refs */

  useEffect(() => {
    if (activeManager.mode !== "client") {
      return;
    }
    // El que sirvio el servidor. Es el respaldo de una pagina que no declara
    // ninguno: sin el se quedaria pegado el de la pagina anterior
    const initialLang = document.documentElement.lang;

    const apply = () => {
      applyHeadNodes(activeManager.getSnapshot());
      // Al navegar dentro de la SPA el documento no se vuelve a pedir, asi que
      // el atributo hay que moverlo a mano
      const lang = activeManager.getLang() ?? initialLang;
      if (document.documentElement.lang !== lang) {
        document.documentElement.lang = lang;
      }
    };
    apply();
    return activeManager.subscribe(apply);
  }, [activeManager]);

  return createElement(HeadContext.Provider, { value: activeManager }, children);
}

export function Head({
  children,
  lang,
}: {
  /** Opcional: `<Head lang="es" />` a secas es un uso valido */
  children?: React.ReactNode;
  /**
   * Valor de `<html lang>` para esta pagina. Va declarado una sola vez, en el
   * layout que conoce el idioma; el loader recibe la `url` con el prefijo
   * intacto aunque `reroute` lo quite para resolver la ruta.
   */
  lang?: string;
}): null {
  const manager = useContext(HeadContext);
  const idRef = useRef<symbol | null>(null);

  /* oxlint-disable react/refs -- inicializacion perezosa del ref, el patron que documenta React */
  if (!idRef.current) {
    idRef.current = Symbol("head");
  }

  const id = idRef.current;
  /* oxlint-enable react/refs */

  const isServer = manager != null && manager.mode === "server";

  // El registro del servidor va en render porque renderToString no corre efectos
  if (isServer) {
    manager.register(id, children, lang);
  }

  // El efecto va antes de cualquier salida: con el `return` temprano que habia
  // aca, el orden de hooks dependia del modo del manager
  useEffect(() => {
    if (!manager || isServer) {
      return;
    }
    manager.register(id, children, lang);
    return () => {
      manager.unregister(id);
    };
  }, [manager, id, children, isServer, lang]);

  return null;
}
