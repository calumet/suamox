import type React from 'react';
import {
  createContext,
  createElement,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useRef,
} from 'react';

export type HeadManagerMode = 'server' | 'client';

export interface HeadManager {
  mode: HeadManagerMode;
  register: (id: symbol, node: React.ReactNode) => void;
  unregister: (id: symbol) => void;
  getSnapshot: () => React.ReactNode[];
  subscribe: (listener: () => void) => () => void;
}

export const headMarkerAttribute = 'data-suamox-head';
export const headMarkerStartValue = 'start';
export const headMarkerEndValue = 'end';

const headMarkerStartSelector = `meta[${headMarkerAttribute}="${headMarkerStartValue}"]`;
const headMarkerEndSelector = `meta[${headMarkerAttribute}="${headMarkerEndValue}"]`;

const canUseDOM = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

export const createHeadManager = (mode: HeadManagerMode): HeadManager => {
  const entries = new Map<symbol, React.ReactNode>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    if (mode !== 'client') {
      return;
    }
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    mode,
    register(id, node) {
      entries.set(id, node);
      notify();
    },
    unregister(id) {
      entries.delete(id);
      notify();
    },
    getSnapshot() {
      return Array.from(entries.values());
    },
    subscribe(listener) {
      if (mode !== 'client') {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const globalContextKey = '__SUAMOX_HEAD_CONTEXT__';
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
    start = document.createElement('meta');
    start.setAttribute(headMarkerAttribute, headMarkerStartValue);
    head.appendChild(start);
  }

  if (!end) {
    end = document.createElement('meta');
    end.setAttribute(headMarkerAttribute, headMarkerEndValue);
    head.appendChild(end);
  }

  if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
    head.appendChild(end);
  }

  return { start, end };
};

const renderHeadDom = (node: React.ReactNode, target: Document): Node[] => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return [target.createTextNode(String(node))];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) => renderHeadDom(child, target));
  }

  if (!isValidElement(node)) {
    return [];
  }

  const elementNode = node as React.ReactElement<Record<string, unknown>>;

  if (elementNode.type === Fragment) {
    return renderHeadDom(elementNode.props.children as React.ReactNode, target);
  }

  if (typeof elementNode.type !== 'string') {
    return [];
  }

  const element = target.createElement(elementNode.type);
  const props = elementNode.props;

  for (const [key, value] of Object.entries(props)) {
    if (
      key === 'children' ||
      key === 'dangerouslySetInnerHTML' ||
      key === 'ref' ||
      key === 'key'
    ) {
      continue;
    }

    if (key === 'className') {
      if (typeof value === 'string') {
        element.setAttribute('class', value);
      }
      continue;
    }

    if (key === 'htmlFor') {
      if (typeof value === 'string') {
        element.setAttribute('for', value);
      }
      continue;
    }

    if (key === 'style' && value && typeof value === 'object') {
      const styleEntries = Object.entries(value as Record<string, string | number>);
      const styleValue = styleEntries
        .map(([styleKey, styleVal]) => `${toKebabCase(styleKey)}:${String(styleVal)}`)
        .join(';');
      if (styleValue) {
        element.setAttribute('style', styleValue);
      }
      continue;
    }

    if (value === true) {
      element.setAttribute(key, '');
      continue;
    }

    if (value === false || value === null || value === undefined) {
      continue;
    }

    element.setAttribute(key, String(value));
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
  if (!managerRef.current) {
    managerRef.current = manager ?? createHeadManager(canUseDOM() ? 'client' : 'server');
  }

  const activeManager = manager ?? managerRef.current;

  useEffect(() => {
    if (activeManager.mode !== 'client') {
      return;
    }
    const apply = () => {
      applyHeadNodes(activeManager.getSnapshot());
    };
    apply();
    return activeManager.subscribe(apply);
  }, [activeManager]);

  return createElement(HeadContext.Provider, { value: activeManager }, children);
}

export function Head({ children }: { children: React.ReactNode }): null {
  const manager = useContext(HeadContext);
  const idRef = useRef<symbol | null>(null);

  if (!idRef.current) {
    idRef.current = Symbol('head');
  }

  const id = idRef.current;

  if (manager && manager.mode === 'server') {
    manager.register(id, children);
    return null;
  }

  useEffect(() => {
    if (!manager) {
      return;
    }
    manager.register(id, children);
    return () => {
      manager.unregister(id);
    };
  }, [manager, id, children]);

  return null;
}
