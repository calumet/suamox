import { createElement } from 'react';
import type { Root } from 'react-dom/client';
import { HeadProvider } from '@suamox/head';
import {
  createPageElement,
  matchRoute,
  resolveRouteModule,
  type HydrationAdapter,
  type LoaderContext,
  type RouteRecord,
} from '@suamox/ssr-runtime';

export interface RouterOptions {
  routes: RouteRecord[];
  adapter?: HydrationAdapter;
  rootElementId?: string;
  baseUrl?: string;
  prefetch?: boolean;
}

export interface NavigateOptions {
  replace?: boolean;
  scroll?: boolean;
}

export interface RouterInstance {
  navigate: (to: string, options?: NavigateOptions) => Promise<void>;
  dispose: () => void;
}

type ResolvedMatch = { route: RouteRecord; params: Record<string, string> };

const canUseDOM = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

const isModifiedEvent = (event: MouseEvent): boolean =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

const shouldIgnoreAnchor = (anchor: HTMLAnchorElement): boolean => {
  const rel = anchor.getAttribute('rel');
  return (
    anchor.hasAttribute('download') ||
    (anchor.target && anchor.target !== '_self') ||
    anchor.getAttribute('data-suamox-router') === 'false' ||
    (rel ? rel.split(' ').includes('external') : false)
  );
};

const isSameDocumentHash = (url: URL): boolean => {
  if (!url.hash) {
    return false;
  }
  return url.pathname === window.location.pathname && url.search === window.location.search;
};

const resolveMatch = (routes: RouteRecord[], pathname: string): ResolvedMatch | null => {
  const match = matchRoute(routes, pathname);
  if (match) {
    return match;
  }
  const notFoundRoute = routes.find((route) => route.path === '/404');
  if (!notFoundRoute) {
    return null;
  }
  return { route: notFoundRoute, params: {} };
};

const createLoaderContext = (url: URL, params: Record<string, string>): LoaderContext => ({
  request: new Request(url),
  url,
  params,
  query: url.searchParams,
});

const scrollToLocation = (hash: string): void => {
  if (!hash) {
    window.scrollTo(0, 0);
    return;
  }
  const target = document.querySelector(hash);
  if (target instanceof HTMLElement) {
    target.scrollIntoView();
  }
};

const ensureAdapter = async (adapter?: HydrationAdapter): Promise<HydrationAdapter> => {
  if (adapter) {
    return adapter;
  }
  const client = await import('react-dom/client');
  return {
    hydrateRoot: client.hydrateRoot,
    createRoot: client.createRoot,
  };
};

export async function startRouter(options: RouterOptions): Promise<RouterInstance> {
  const { routes, adapter, rootElementId = 'root', baseUrl, prefetch = true } = options;

  if (!canUseDOM()) {
    return {
      navigate: async () => {},
      dispose: () => {},
    };
  }

  const rootElement = document.getElementById(rootElementId);
  if (!rootElement) {
    return {
      navigate: async () => {},
      dispose: () => {},
    };
  }

  const resolvedAdapter = await ensureAdapter(adapter);
  const origin = baseUrl ?? window.location.origin;
  let root: Root | null = null;
  let navigationId = 0;
  let initialData: unknown = (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__;
  const prefetched = new Map<string, Promise<void>>();

  const renderLocation = async (
    url: URL,
    { scroll = true, useInitialData = false }: { scroll?: boolean; useInitialData?: boolean }
  ): Promise<void> => {
    const activeId = ++navigationId;
    const match = resolveMatch(routes, url.pathname);

    if (!match) {
      window.location.assign(url.toString());
      return;
    }

    const resolvedRoute = await resolveRouteModule(match.route);
    let data: unknown = null;
    if (!resolvedRoute.csr) {
      if (useInitialData && initialData !== undefined) {
        data = initialData;
        initialData = undefined;
      } else if (resolvedRoute.loader) {
        const loaderContext = createLoaderContext(url, match.params);
        data = await resolvedRoute.loader(loaderContext);
      }
    }

    if (activeId !== navigationId) {
      return;
    }

    const element = createElement(HeadProvider, null, createPageElement(resolvedRoute, data));

    if (!root) {
      if (resolvedRoute.csr) {
        root = resolvedAdapter.createRoot(rootElement);
        root.render(element);
      } else {
        root = resolvedAdapter.hydrateRoot(rootElement, element);
      }
    } else {
      root.render(element);
    }

    if (scroll) {
      scrollToLocation(url.hash);
    }
  };

  await renderLocation(new URL(window.location.href), { scroll: false, useInitialData: true });

  const prefetchRoute = (url: URL): void => {
    if (url.origin !== window.location.origin) {
      return;
    }
    if (isSameDocumentHash(url)) {
      return;
    }
    const match = resolveMatch(routes, url.pathname);
    if (!match || !match.route.load) {
      return;
    }
    const key = match.route.filePath ?? match.route.path;
    if (prefetched.has(key)) {
      return;
    }
    const loadPromise = resolveRouteModule(match.route)
      .then(() => {})
      .catch(() => {
        prefetched.delete(key);
      });
    prefetched.set(key, loadPromise);
  };

  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest('a');
    if (!anchor || shouldIgnoreAnchor(anchor)) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }

    if (isSameDocumentHash(url)) {
      return;
    }

    event.preventDefault();
    void navigate(url.toString());
  };

  const onPrefetch = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest('a');
    if (!anchor || shouldIgnoreAnchor(anchor)) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    const url = new URL(href, window.location.href);
    prefetchRoute(url);
  };

  const onPopState = (): void => {
    void renderLocation(new URL(window.location.href), { scroll: false });
  };

  document.addEventListener('click', onClick);
  window.addEventListener('popstate', onPopState);
  if (prefetch) {
    document.addEventListener('mouseover', onPrefetch, true);
    document.addEventListener('focusin', onPrefetch, true);
    document.addEventListener('touchstart', onPrefetch, { passive: true, capture: true });
  }

  const navigate = async (to: string, options?: NavigateOptions): Promise<void> => {
    const url = new URL(to, origin);

    if (url.origin !== window.location.origin) {
      window.location.assign(url.toString());
      return;
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (options?.replace) {
      window.history.replaceState({}, '', nextUrl);
    } else {
      window.history.pushState({}, '', nextUrl);
    }

    await renderLocation(url, { scroll: options?.scroll ?? true });
  };

  return {
    navigate,
    dispose: () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
      if (prefetch) {
        document.removeEventListener('mouseover', onPrefetch, true);
        document.removeEventListener('focusin', onPrefetch, true);
        document.removeEventListener('touchstart', onPrefetch, true);
      }
    },
  };
}
